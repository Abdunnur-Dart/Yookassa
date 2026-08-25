const crypto = require('crypto');

module.exports = async (req, res) => {
    // Настройка CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
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
        const { userId, productId, isWeb } = req.body || {};

        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }

        // Жесткий словарь цен на сервере (защита от изменения клиентом)
        const PRODUCTS = {
            'lifetime_access': {
                amount: '499.00',
                description: 'Разовая покупка: Доступ Навсегда',
                period: 'lifetime'
            },
        };

        const product = PRODUCTS[productId || 'lifetime_access'];
        if (!product) {
            return res.status(400).json({ error: 'Неверный ID товара' });
        }

        const shopId = process.env.YOOKASSA_SHOP_ID;
        const secretKey = process.env.YOOKASSA_SECRET_KEY;

        if (!shopId || !secretKey) {
            console.error('YooKassa credentials missing');
            return res.status(500).json({ error: 'YooKassa credentials not configured' });
        }

        const returnUrl = isWeb
            ? 'https://yookassaproj201514.vercel.app/'
            : 'muallimsani://success';

        const idempotenceKey = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

        const paymentPayload = {
            amount: {
                value: product.amount,
                currency: "RUB"
            },
            capture: true,
            save_payment_method: false,
            confirmation: {
                type: 'redirect',
                return_url: returnUrl
            },
            description: product.description,
            metadata: {
                user_id: userId,
                product_id: productId || 'lifetime_access',
                subscription_period: product.period,
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

        // Возвращаем поле в формате, который ожидает ваш Flutter-клиент
        return res.status(200).json({
            confirmationUrl: data.confirmation.confirmation_url,
            payment_id: data.id
        });

    } catch (error) {
        console.error('Payment creation internal error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
