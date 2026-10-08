export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OpenRouter Key missing from Vercel environments dashboard.' });
    }

    if (req.method === 'GET') {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            const data = await response.json();
            return res.status(200).json(data);
        } catch (err) {
            return res.status(500).json({ error: 'Failed to fetch directory: ' + err.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { action, fullChatHistory, model, currentPrompt, fallbackContext } = req.body;

            // --- FEATURE: BACKGROUND MEMORY GENERATOR ---
            if (action === 'SUMMARIZE_MEMORY') {
                const summaryPrompt = `Analyze this ongoing conversation history and compress it into a concise state JSON block.
Include:
1. "summary": Brief 2-sentence overview of the discussion.
2. "key_facts": Important constraints, decisions, or user preferences mentioned (bullet points).
3. "current_task": What the user is currently trying to accomplish.

Respond ONLY with valid JSON. No Markdown block wrappers.

Chat History:
"""
${fullChatHistory}
"""`;

                const summaryResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'openrouter/free', // Fast free router for background tasks
                        messages: [{ role: 'user', content: summaryPrompt }]
                    })
                });

                const summaryData = await summaryResponse.json();
                const jsonText = summaryData.choices?.[0]?.message?.content || '{}';

                return res.status(200).json({ memoryJson: jsonText });
            }

            // --- STANDARD CHAT EXECUTION ---
            const activeTargetModel = model || 'openrouter/free';
            
            let structuralSystemPrompt = "You are an intelligent, elegant AI companion running inside the Sournex luxury workspace platform.";
            if (fallbackContext) {
                structuralSystemPrompt += `\n\n[CONCISE MEMORY CONTEXT LAYER]:\n${fallbackContext}\n\nContinue the dialogue based on these remembered facts and context.`;
            }

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://vercel.com',
                    'X-Title': 'Sournex Workspace'
                },
                body: JSON.stringify({
                    model: activeTargetModel,
                    messages: [
                        { role: 'system', content: structuralSystemPrompt },
                        { role: 'user', content: currentPrompt }
                    ]
                })
            });

            const data = await response.json();

            if (data.choices && data.choices[0] && data.choices[0].message) {
                return res.status(200).json({ text: data.choices[0].message.content });
            } else {
                const errMsg = data.error ? data.error.message : 'Model response stream failed.';
                return res.status(502).json({ error: errMsg });
            }
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
