export default async function handler(req, res) {
    // Basic API security flags
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { model, currentPrompt, fallbackContext } = req.body;
        
        // Pull the hidden variable out of Vercel
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'OpenRouter Key missing from Vercel environments dashboard.' });
        }

        // Use OpenRouter's universal free router to automatically find the best online model
        let openRouterModel = 'openrouter/free'; 

        let structuralSystemPrompt = "You are an intelligent, elegant AI companion running inside the Sournex luxury workspace platform. You must chat beautifully, cleanly, and naturally like a human dialogue thread.";
        if (fallbackContext) {
            structuralSystemPrompt += `\n\nCONTEXT LAYER HISTORY:\n"""\n${fallbackContext}\n"""\nFollow up on this sequence context naturally.`;
        }

        // Hit the OpenRouter system pipeline
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://vercel.com',
                'X-Title': 'Sournex Workspace'
            },
            body: JSON.stringify({
                model: openRouterModel,
                messages: [
                    { role: 'system', content: structuralSystemPrompt },
                    { role: 'user', content: currentPrompt }
                ]
            })
        });

        const data = await response.json();
        
        // Clean routing validation check
        if (data.choices && data.choices[0] && data.choices[0].message) {
            return res.status(200).json({ text: data.choices[0].message.content });
        } else {
            // Hand over the detailed error response from OpenRouter
            const errMsg = data.error ? data.error.message : 'Unknown gateway mapping error';
            return res.status(200).json({ text: `Gateway error context: ${errMsg}` });
        }

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
