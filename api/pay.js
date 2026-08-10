module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 1. ИЗВЛЕКАЕМ metadata ИЗ ТЕЛА ЗАПРОСА
    const { amount, description, metadata } = req.body;

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;

    if (!shopId || !secretKey) {
        return res.status(500).json({ error: 'YooKassa credentials not configured on server' });
    }

    try {
        const idempotenceKey = Math.random().toString(36).substring(2);
        const orderId = 'ord_' + Math.random().toString(36).substring(2, 12);

        const response = await fetch('https://api.yookassa.ru/v3/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
                'Idempotence-Key': idempotenceKey
            },
            body: JSON.stringify({
                amount: {
                    value: amount || "199.00",
                    currency: "RUB"
                },
                capture: true,
                confirmation: {
                    type: 'redirect',
                    return_url: `https://yookassaproj201514.vercel.app/success?order_id=${orderId}`
                },
                description: description || "Подписка на сервис",
                // 2. ПЕРЕДАЕМ metadata В ЮKASSA
                metadata: metadata || {}
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.description || 'YooKassa error' });
        }

        return res.status(200).json({
            confirmation_url: data.confirmation.confirmation_url,
            payment_id: data.id
        });
    } catch (error) {
        console.error('Payment creation error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
