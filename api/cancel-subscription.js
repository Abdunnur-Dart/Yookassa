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
    // 1. ПРОВЕРКА АВТОРИЗАЦИИ
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(200).json({ error: 'Необходима авторизация (Bearer token)' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (authError) {
      return res.status(200).json({ error: `Ошибка проверки токена: ${authError.message}` });
    }

    const uid = decodedToken.uid;

    // 2. ПОЛУЧЕНИЕ ДАННЫХ ПЛАТЕЖА ИЗ FIRESTORE
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(200).json({ error: 'Пользователь не найден в базе данных' });
    }

    const userData = userDoc.data();
    const paymentId = userData.lastPaymentId;
    const paymentAmount = userData.lastPaymentAmount;

    if (!paymentId || !paymentAmount) {
      return res.status(200).json({
        error: 'Не найдены данные последнего платежа в Firestore (lastPaymentId / lastPaymentAmount)',
      });
    }

    // 3. ОТПРАВКА ЗАПРОСА НА ВОЗВРАТ В ЮКАССУ
    const shopId = (process.env.YOOKASSA_SHOP_ID || '').trim();
    const secretKey = (process.env.YOOKASSA_SECRET_KEY || '').trim();

    if (!shopId || !secretKey) {
      return res.status(200).json({ error: 'Не заданы YOOKASSA_SHOP_ID или YOOKASSA_SECRET_KEY в Vercel' });
    }

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    const idempotencyKey = `refund_${uid}_${Date.now()}`;

    const payload = {
      payment_id: paymentId,
      amount: {
        value: Number(paymentAmount).toFixed(2),
        currency: 'RUB',
      },
    };

    const yooResponse = await fetch('https://api.yookassa.ru/v3/refunds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotencyKey,
        'Idempotency-Key': idempotencyKey,
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await yooResponse.json();

    if (yooResponse.ok && (data.status === 'succeeded' || data.status === 'pending')) {
      // Снимаем подписку у пользователя
      await db.collection('users').doc(uid).set(
        {
          isPremium: false,
          isLifetime: false,
          expiresAt: null,
          refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.status(200).json({
        success: true,
        message: 'Подписка отменена, возврат оформлен',
      });
    } else {
      const errDetails = data.description || data.code || JSON.stringify(data);
      return res.status(200).json({
        error: `Ошибка возврата ЮKassa: ${errDetails}`,
      });
    }
  } catch (error) {
    console.error('Ошибка в cancel-subscription:', error);
    return res.status(200).json({
      error: `Ошибка сервера при отмене: ${error.message}`,
    });
  }
};
