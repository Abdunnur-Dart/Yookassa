const crypto = require('crypto');

module.exports = async (req, res) => {
    // Настройка CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { amount, description, metadata, returnUrl, isOneTime } = req.body || {};

        const shopId = process.env.YOOKASSA_SHOP_ID;
        const secretKey = process.env.YOOKASSA_SECRET_KEY;

        if (!shopId || !secretKey) {
            console.error('YooKassa credentials missing');
            return res.status(500).json({ error: 'YooKassa credentials not configured' });
        }

        const idempotenceKey = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

        // Гарантируем, что для разовой/бессрочной покупки НЕ сохраняем карту
        const period = metadata?.subscription_period || 'lifetime';
        const isOneTimePayment = isOneTime === true || period === 'lifetime' || period === 'one_time';

        const paymentPayload = {
            amount: {
                value: amount || "35.00",
                currency: "RUB"
            },
            capture: true,
            save_payment_method: !isOneTimePayment,
            confirmation: {
                type: 'redirect',
                return_url: returnUrl || 'https://yookassaproj201514.vercel.app/'
            },
            description: description || "Разовая покупка: Доступ Навсегда",
            metadata: {
                ...metadata,
                subscription_period: period,
            }
        };

        const response = await fetch('https://api.yookassa.ru/v3/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
                'Idempotence-Key': idempotenceKey
            },
            body: JSON.stringify(paymentPayload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('YooKassa API Error:', data);
            return res.status(response.status).json({ error: data.description || 'YooKassa error' });
        }

        return res.status(200).json({
            confirmation_url: data.confirmation.confirmation_url,
            payment_id: data.id
        });
    } catch (error) {
        console.error('Payment creation internal error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
