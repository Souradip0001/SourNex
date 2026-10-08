export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OpenRouter Key missing from Vercel environments dashboard.' });
    }

    // Serve filtered model list safely via server side
    if (req.method === 'GET') {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            const data = await response.json();
            return res.status(200).json(data);
        } catch (err) {
            return res.status(500).json({ error: 'Failed to fetch directory from server side: ' + err.message });
        }
    }

    // Standard POST generation route
    if (req.method === 'POST') {
        try {
            const { model, currentPrompt, fallbackContext } = req.body;
            
            // Define primary model + fallback chain
            const requestedModel = model || 'openrouter/free';
            const modelsToTry = [
                requestedModel,
                'openrouter/free'
            ];

            // Remove duplicates if requestedModel was already 'openrouter/free'
            const uniqueModels = [...new Set(modelsToTry)];

            let structuralSystemPrompt = "You are an intelligent, elegant AI companion running inside the Sournex luxury workspace platform. You must chat beautifully, cleanly, and naturally like a human dialogue thread.";
            if (fallbackContext) {
                structuralSystemPrompt += `\n\nCONTEXT LAYER HISTORY:\n"""\n${fallbackContext}\n"""\nFollow up on this sequence context naturally.`;
            }

            let lastErrorMessage = '';

            // Attempt generation across model chain
            for (const targetModel of uniqueModels) {
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://vercel.com',
                        'X-Title': 'Sournex Workspace'
                    },
                    body: JSON.stringify({
                        model: targetModel,
                        messages: [
                            { role: 'system', content: structuralSystemPrompt },
                            { role: 'user', content: currentPrompt }
                        ]
                    })
                });

                const data = await response.json();

                // Handle standard OpenRouter error payloads
                if (data.error) {
                    lastErrorMessage = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
                    console.warn(`[OpenRouter Warning] Model ${targetModel} failed: ${lastErrorMessage}. Trying fallback...`);
                    continue; 
                }

                // Successful completion
                if (data.choices && data.choices[0] && data.choices[0].message) {
                    return res.status(200).json({ 
                        text: data.choices[0].message.content,
                        modelUsed: targetModel
                    });
                }
            }

            // Return clean error status if all attempts fail
            return res.status(502).json({ 
                error: `Gateway exception error node: ${lastErrorMessage || 'Selected target model failed to respond.'}` 
            });

        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
