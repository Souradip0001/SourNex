export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // Grab model ID straight from dynamic client pass sequence
        const { model, currentPrompt, fallbackContext } = req.body;
        
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'OpenRouter Key missing from Vercel environments dashboard.' });
        }

        // Auto-assign global fallback router if choice variable gets dropped
        const activeTargetModel = model || 'openrouter/free';

        let structuralSystemPrompt = "You are an intelligent, elegant AI companion running inside the Sournex luxury workspace platform. You must chat beautifully, cleanly, and naturally like a human dialogue thread.";
        if (fallbackContext) {
            structuralSystemPrompt += `\n\nCONTEXT LAYER HISTORY:\n"""\n${fallbackContext}\n"""\nFollow up on this sequence context naturally.`;
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
            const errMsg = data.error ? data.error.message : 'Selected target model structure dropped during transit.';
            return res.status(200).json({ text: `Gateway exception error node: ${errMsg}` });
        }

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
