export default async function handler(req, res) {
    const siteKey = (process.env.TURNSTILE_SITE_KEY || '').trim();
    const secretKey = (process.env.TURNSTILE_SECRET_KEY || '').trim();
    const enabled = Boolean(siteKey && secretKey);

    if (req.method === 'GET') {
        res.setHeader('Cache-Control', 'public, s-maxage=300');
        return res.status(200).json({
            enabled,
            siteKey: enabled ? siteKey : null
        });
    }

    if (req.method === 'POST') {
        if (!enabled) {
            return res.status(200).json({ success: true, skipped: true });
        }

        try {
            const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
            if (!token) {
                return res.status(400).json({ success: false, error: 'Missing CAPTCHA verification token.' });
            }

            const forwarded = req.headers['x-forwarded-for'];
            const remoteip = typeof forwarded === 'string' && forwarded.length > 0
                ? forwarded.split(',')[0].trim()
                : req.socket?.remoteAddress || '';

            const formData = new URLSearchParams();
            formData.append('secret', secretKey);
            formData.append('response', token);
            if (remoteip) formData.append('remoteip', remoteip);

            const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
                signal: AbortSignal.timeout(8000)
            });

            const outcome = await verifyRes.json();
            if (!outcome.success) {
                return res.status(403).json({
                    success: false,
                    error: 'CAPTCHA verification failed. Please retry.'
                });
            }

            return res.status(200).json({ success: true });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
