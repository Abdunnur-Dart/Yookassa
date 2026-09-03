const crypto = require('crypto');
const { initializeApp, getApps, cert } = require('firebase-admin/app'); // NEW
const { getAuth } = require('firebase-admin/auth'); // NEW
const { getFirestore } = require('firebase-admin/firestore'); // NEW

// Инициализация Firebase Admin для проверки ID-токена пользователя // NEW
if (!getApps().length) { // NEW
  try { // NEW
    const privateKey = process.env.FIREBASE_PRIVATE_KEY // NEW
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') // NEW
      : undefined; // NEW

    initializeApp({ // NEW
      credential: cert({ // NEW
        projectId: process.env.FIREBASE_PROJECT_ID, // NEW
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL, // NEW
        privateKey: privateKey, // NEW
      }), // NEW
    }); // NEW
  } catch (err) { // NEW
    console.error('Firebase Admin initialization error:', err); // NEW
  } // NEW
} // NEW

module.exports = async (req, res) => {
    // Настройка CORS
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
        // Проверка авторизации Firebase ID Token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Необходима авторизация (Токен отсутствует)' });
        }

        const idToken = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (authError) {
            console.error(' Ошибка проверки токена:', authError);
            return res.status(401).json({ error: 'Недействительный токен авторизации' });
        }

        const userId = decodedToken.uid;
        const { productId, isWeb } = req.body || {};
        const targetProductId = productId || 'lifetime_access'; // CHANGED

        // --- ЗАПРУЦЕНА ЦЕНА ИЗ FIRESTORE (Production-ready с фоллбеком) --- // NEW
        let product; // NEW
        try { // NEW
            const db = getFirestore(); // NEW
            // Ищем товар в коллекции 'products' по его ID (например, документа 'lifetime_access') // NEW
            const productDoc = await db.collection('products').doc(targetProductId).get(); // NEW
            
            if (productDoc.exists) { // NEW
                const data = productDoc.data(); // NEW
                product = { // NEW
                    // Поддерживаем разные варианты названий полей в базе (amount / price) и приводим к строке // NEW
                    amount: String(data.amount || data.price || '35.00'), // NEW
                    description: data.description || 'Разовая покупка: Доступ Навсегда', // NEW
                    period: data.period || data.subscription_period || 'lifetime' // NEW
                }; // NEW
            } // NEW
        } catch (dbError) { // NEW
            console.error('Ошибка чтения цены из Firestore, используем фоллбек:', dbError); // NEW
        } // NEW

        // Фоллбек на случай, если документ в Firestore не найден или база недоступна // NEW
        if (!product) { // NEW
            const PRODUCTS = {
                'lifetime_access': {
                    amount: '35.00',
                    description: 'Разовая покупка: Доступ Навсегда',
                    period: 'lifetime'
                },
            };
            product = PRODUCTS[targetProductId]; // CHANGED
        } // NEW

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
                product_id: targetProductId, // CHANGED
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
