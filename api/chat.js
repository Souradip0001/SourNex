const IP_RATE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const IP_RATE_LIMIT_MAX = 25; // Supports 20 guest turns + occasional background memory compression
const MAX_PROMPT_CHARS = 16000;
const MAX_HISTORY_CHARS = 60000;
const UPSTREAM_TIMEOUT_MS = 15000;
const MODELS_TIMEOUT_MS = 8000;

const ipRateBuckets = new Map();

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
    const now = Date.now();
    // Prune expired buckets opportunistically to prevent unbounded memory growth
    if (ipRateBuckets.size > 1000) {
        for (const [key, entry] of ipRateBuckets.entries()) {
            if (now >= entry.resetAt) ipRateBuckets.delete(key);
        }
    }

    const existing = ipRateBuckets.get(ip);
    if (!existing || now >= existing.resetAt) {
        const fresh = { count: 1, resetAt: now + IP_RATE_WINDOW_MS };
        ipRateBuckets.set(ip, fresh);
        return { allowed: true, remaining: IP_RATE_LIMIT_MAX - 1, resetAt: fresh.resetAt };
    }

    if (existing.count >= IP_RATE_LIMIT_MAX) {
        return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }

    existing.count += 1;
    return { allowed: true, remaining: IP_RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}

function isOriginAllowed(req) {
    const origin = req.headers.origin;
    if (!origin) return true; // Same-origin or direct server calls without Origin header

    const host = req.headers.host;
    if (host && (origin === `https://${host}` || origin === `http://${host}`)) {
        return true;
    }

    const configured = (process.env.ALLOWED_ORIGIN || 'https://sournexz.vercel.app')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    if (configured.includes(origin)) return true;

    try {
        const parsed = new URL(origin);
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            return true;
        }
    } catch {
        return false;
    }

    return false;
}

function isFreeModel(modelId) {
    return modelId === 'openrouter/free' || (typeof modelId === 'string' && modelId.endsWith(':free'));
}

function isUtilityModel(model) {
    const idLower = (model.id || '').toLowerCase();
    const nameLower = (model.name || '').toLowerCase();
    return idLower.includes('safety') || nameLower.includes('safety') ||
           idLower.includes('moderation') || nameLower.includes('moderation') ||
           idLower.includes('embed') || nameLower.includes('embed') ||
           idLower.includes('similarity') || nameLower.includes('similarity');
}

export default async function handler(req, res) {
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(req)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    } else if (!origin) {
        res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://sournexz.vercel.app');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Provider-Key');

    if (origin && !isOriginAllowed(req)) {
        return res.status(403).json({ error: 'Origin not allowed.' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();

    const serverApiKey = process.env.OPENROUTER_API_KEY;
    const rawUserKey = typeof req.headers['x-provider-key'] === 'string'
        ? req.headers['x-provider-key'].trim()
        : '';
    const hasValidUserKey = rawUserKey.startsWith('sk-') && rawUserKey.length >= 20;
    const activeApiKey = hasValidUserKey ? rawUserKey : serverApiKey;

    if (!activeApiKey) {
        return res.status(500).json({ error: 'OpenRouter Key missing from server environment.' });
    }

    if (req.method === 'GET') {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                headers: { 'Authorization': `Bearer ${activeApiKey}` },
                signal: AbortSignal.timeout(MODELS_TIMEOUT_MS)
            });

            if (!response.ok) {
                return res.status(502).json({ error: `Model directory returned HTTP ${response.status}` });
            }

            const raw = await response.json();
            const list = Array.isArray(raw?.data) ? raw.data : [];

            const prunedFreeModels = list
                .filter(model => {
                    if (!model || typeof model.id !== 'string') return false;
                    const isFree = model.id.includes(':free') || (model.pricing && parseFloat(model.pricing.prompt) === 0);
                    return isFree && !isUtilityModel(model);
                })
                .map(model => ({
                    id: model.id,
                    name: model.name || model.id,
                    pricing: model.pricing || null,
                    deprecation: model.deprecation || null,
                    description: model.description ? String(model.description).slice(0, 240) : ''
                }));

            res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
            return res.status(200).json({ data: prunedFreeModels });
        } catch (err) {
            return res.status(500).json({ error: 'Failed to fetch directory: ' + err.message });
        }
    }

    if (req.method === 'POST') {
        try {
            if (!req.body || typeof req.body !== 'object') {
                return res.status(400).json({ error: 'Invalid JSON request body.' });
            }

            const { action, fullChatHistory, model, currentPrompt, fallbackContext } = req.body;

            // Enforce per-IP rate limiting when using shared server credentials
            if (!hasValidUserKey) {
                const ip = getClientIp(req);
                const rate = checkRateLimit(ip);
                res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
                if (!rate.allowed) {
                    const retryAfterSeconds = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
                    res.setHeader('Retry-After', String(retryAfterSeconds));
                    return res.status(429).json({
                        error: 'Rate limit exceeded. Sign in with your own provider key or wait for the 2-hour reset.'
                    });
                }
            }

            // --- FEATURE: BACKGROUND MEMORY GENERATOR ---
            if (action === 'SUMMARIZE_MEMORY') {
                if (typeof fullChatHistory !== 'string' || fullChatHistory.trim().length === 0) {
                    return res.status(400).json({ error: 'fullChatHistory is required.' });
                }

                const trimmedHistory = fullChatHistory.slice(-MAX_HISTORY_CHARS);
                const summaryPrompt = `Analyze this ongoing conversation history and compress it into a concise state JSON block.
Include:
1. "summary": Brief 2-sentence overview of the discussion.
2. "key_facts": Important constraints, decisions, or user preferences mentioned (bullet points).
3. "current_task": What the user is currently trying to accomplish.

Respond ONLY with valid JSON. No Markdown block wrappers.

Chat History:
"""
${trimmedHistory}
"""`;

                const summaryResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${activeApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'openrouter/free',
                        messages: [{ role: 'user', content: summaryPrompt }]
                    }),
                    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
                });

                const summaryData = await summaryResponse.json();
                const jsonText = summaryData.choices?.[0]?.message?.content || '{}';

                return res.status(200).json({ memoryJson: jsonText });
            }

            // --- STANDARD CHAT EXECUTION ---
            if (typeof currentPrompt !== 'string' || currentPrompt.trim().length === 0) {
                return res.status(400).json({ error: 'Prompt must be a non-empty string.' });
            }
            if (currentPrompt.length > MAX_PROMPT_CHARS) {
                return res.status(413).json({ error: `Prompt exceeds maximum length of ${MAX_PROMPT_CHARS} characters.` });
            }

            const activeTargetModel = typeof model === 'string' && model.trim() ? model.trim() : 'openrouter/free';

            // Prevent paid model abuse on shared server key
            if (!hasValidUserKey && !isFreeModel(activeTargetModel)) {
                return res.status(403).json({
                    error: 'Only :free models are permitted on the shared server key. Add your own OpenRouter key to unlock paid tiers.'
                });
            }

            let structuralSystemPrompt = "You are an intelligent, elegant AI companion running inside the Sournex luxury workspace platform.";
            if (typeof fallbackContext === 'string' && fallbackContext.trim()) {
                const safeContext = fallbackContext.slice(-MAX_HISTORY_CHARS);
                structuralSystemPrompt += `\n\n[CONCISE MEMORY CONTEXT LAYER]:\n${safeContext}\n\nContinue the dialogue based on these remembered facts and context.`;
            }

            const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${activeApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: activeTargetModel,
                    messages: [
                        { role: 'system', content: structuralSystemPrompt },
                        { role: 'user', content: currentPrompt }
                    ]
                }),
                signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
            });

            const data = await apiResponse.json();

            if (data.choices && data.choices[0] && data.choices[0].message) {
                return res.status(200).json({ text: data.choices[0].message.content });
            } else {
                const errMsg = data.error ? data.error.message : 'Model response stream failed.';
                return res.status(502).json({ error: errMsg });
            }

        } catch (err) {
            const status = err.name === 'TimeoutError' ? 504 : 500;
            return res.status(status).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
