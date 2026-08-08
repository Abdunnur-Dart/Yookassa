module.exports = async (req, res) => {
    // Настройка CORS для разрешения запросов из приложения
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { amount, description, userId, returnUrl } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    // Данные для авторизации в ЮKassa берутся из переменных окружения Vercel
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;

    if (!shopId || !secretKey) {
        return res.status(500).json({ error: 'YooKassa credentials not configured on server' });
    }

    try {
        // Уникальный ключ идемпотентности для защиты от дублирования платежей
        const idempotenceKey = Math.random().toString(36).substring(2);
        
        const response = await fetch('https://api.yookassa.ru/v3/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
                'Idempotence-Key': idempotenceKey
            },
            body: JSON.stringify({
                amount: {
                    value: amount || "299.00",
                    currency: "RUB"
                },
                capture: true,
                confirmation: {
                    type: 'redirect',
                    return_url: returnUrl || "https://yookassaproj201514.vercel.app/"
                },
                description: description || "Премиум-подписка Муаллим Сани",
                metadata: {
                    userId: userId // Важно для связки платежа с конкретным пользователем в Firestore
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.description || 'YooKassa error' });
        }

        // Возвращаем клиенту ссылку на оплату
        return res.status(200).json({
            confirmation_url: data.confirmation.confirmation_url,
            payment_id: data.id
        });
    } catch (error) {
        console.error('Payment creation error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
