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

    const { amount, description } = req.body;

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;

    if (!shopId || !secretKey) {
        return res.status(500).json({ error: 'YooKassa credentials not configured on server' });
    }

    try {
        const idempotenceKey = Math.random().toString(36).substring(2);
        
        // Генерируем уникальный ID заказа для этой сессии оплаты
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
                    value: amount || "49.99",
                    currency: "RUB"
                },
                capture: true,
                confirmation: {
                    type: 'redirect',
                    // Передаем order_id прямо в ссылке возврата ЮKassa
                    return_url: `https://yookassaproj201514.vercel.app/success?order_id=${orderId}`
                },
                description: description || "поддержка разработчика"
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
