const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined,
    }),
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = req.body || {};

    // 1. ОБРАБОТКА ВЕБХУКА ОТ ЮКАССЫ
    if (body.event === 'payment.succeeded') {
      const payment = body.object || {};
      const metadata = payment.metadata || {};
      const userId = metadata.userId;
      const productId = metadata.productId;

      if (!userId || !productId) {
        return res.status(200).json({ status: 'ok, no metadata' });
      }

      let expiresAt = null;
      let isLifetime = false;
      const now = new Date();

      if (productId === 'sub_1_month') {
        expiresAt = new Date(now.setMonth(now.getMonth() + 1));
      } else if (productId === 'sub_1_year') {
        expiresAt = new Date(now.setFullYear(now.getFullYear() + 1));
      } else if (productId === 'lifetime_access') {
        isLifetime = true;
      }

      await db.collection('users').doc(userId).set(
        {
          isPremium: true,
          isLifetime: isLifetime,
          expiresAt: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
          lastPaymentId: payment.id,
          lastPaymentAmount: payment.amount ? payment.amount.value : null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.status(200).json({ status: 'ok' });
    }

    // 2. СОЗДАНИЕ ПЛАТЕЖА ИЗ ФЛАТТЕРА
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const productId = body.productId || 'sub_1_month';

    let price = '199.00';
    if (productId === 'sub_1_year') price = '1990.00';
    if (productId === 'lifetime_access') price = '2990.00';

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;

    if (!shopId || !secretKey) {
      return res.status(500).json({ error: 'Переменные окружения YOOKASSA не заданы' });
    }

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    const idempotencyKey = `pay_${uid}_${Date.now()}`;

    const yooResponse = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: {
          value: price,
          currency: 'RUB',
        },
        confirmation: {
          type: 'redirect',
          return_url: 'https://yookassaproj201514.vercel.app',
        },
        capture: true,
        description: `Оплата подписки ${productId}`,
        metadata: {
          userId: String(uid),
          productId: String(productId),
        },
      }),
    });

    const data = await yooResponse.json();

    if (yooResponse.ok && data.confirmation && data.confirmation.confirmation_url) {
      return res.status(200).json({
        confirmationUrl: data.confirmation.confirmation_url,
      });
    } else {
      console.error('Ошибка от ЮKassa:', data);
      return res.status(400).json({
        error: data.description || 'Не удалось получить ссылку на оплату',
      });
    }
  } catch (error) {
    console.error('Ошибка в create-payment:', error);
    return res.status(500).json({
      error: error.message || 'Ошибка сервера',
    });
  }
};
