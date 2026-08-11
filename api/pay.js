const crypto = require('crypto'); // NEW: Модуль для безопасной генерации UUID

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Добавляем returnUrl из req.body
    const { amount, description, metadata, returnUrl } = req.body;

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;

    if (!shopId || !secretKey) {
        return res.status(500).json({ error: 'YooKassa credentials not configured' });
    }

    try {
        const idempotenceKey = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2); // CHANGED: Стабильная генерация ключа идемпотентности

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
                save_payment_method: true, // NEW: Запрос на сохранение платежного метода для повторных списаний
                confirmation: {
                    type: 'redirect',
                    // Используем переданный URL или дефолтный корень сайта
                    return_url: returnUrl || 'https://yookassaproj201514.vercel.app/' 
                },
                description: description || "Подписка на сервис",
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
