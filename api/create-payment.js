const crypto = require('crypto');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined;

    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
  } catch (err) {
    console.error('Firebase Admin error:', err);
  }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Необходима авторизация' });
        }

        const idToken = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (authError) {
            return res.status(401).json({ error: 'Недействительный токен' });
        }

        const userId = decodedToken.uid;
        const { productId, isWeb } = req.body || {};
        const targetProductId = productId || 'lifetime_access';

        let product;
        try {
            const db = getFirestore();
            const productDoc = await db.collection('products').doc(targetProductId).get();
            
            if (productDoc.exists) {
                const data = productDoc.data();
                product = {
                    amount: String(data.amount || data.price || '35.00'),
                    description: data.description || 'Покупка подписки',
                    period: data.period || data.subscription_period || targetProductId
                };
            }
        } catch (dbError) {
            console.error('Firestore Error:', dbError);
        }

        if (!product) {
            const PRODUCTS = {
                'lifetime_access': { amount: '35.00', description: 'Доступ Навсегда', period: 'lifetime' },
                'sub_1_month': { amount: '199.00', description: 'Подписка на 1 месяц', period: '1_month' },
                'sub_1_year': { amount: '1990.00', description: 'Подписка на 1 год', period: '1_year' }
            };
            product = PRODUCTS[targetProductId];
        }

        if (!product) {
            return res.status(400).json({ error: 'Неверный ID товара' });
        }

        const shopId = process.env.YOOKASSA_SHOP_ID;
        const secretKey = process.env.YOOKASSA_SECRET_KEY;

        const returnUrl = isWeb
            ? 'https://yookassaproj201514.vercel.app/'
            : 'muallimsani://success';

        const idempotenceKey = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

        const paymentPayload = {
            amount: { value: product.amount, currency: "RUB" },
            capture: true,
            confirmation: { type: 'redirect', return_url: returnUrl },
            description: product.description,
            metadata: {
                user_id: userId,
                product_id: targetProductId,
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
            return res.status(response.status).json({ error: data.description || 'YooKassa error' });
        }

        return res.status(200).json({
            confirmationUrl: data.confirmation.confirmation_url,
            payment_id: data.id
        });

    } catch (error) {
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
