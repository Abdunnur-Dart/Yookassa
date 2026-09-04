const admin = require('firebase-admin');
const axios = require('axios');

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const userData = userDoc.data();
    const paymentId = userData.lastPaymentId;
    const paymentAmount = userData.lastPaymentAmount;

    if (!paymentId || !paymentAmount) {
      return res.status(400).json({
        error: 'Не найдены данные последнего платежа для проведения возврата',
      });
    }

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    const basicAuth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');

    // Отправка запроса на возврат средств в ЮKassa
    const refundResponse = await axios.post(
      'https://api.yookassa.ru/v3/refunds',
      {
        payment_id: paymentId,
        amount: {
          value: Number(paymentAmount).toFixed(2),
          currency: 'RUB',
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `refund_${uid}_${Date.now()}`,
          Authorization: `Basic ${basicAuth}`,
        },
      }
    );

    if (refundResponse.data.status === 'succeeded' || refundResponse.data.status === 'pending') {
      // Аннулируем премиум-статус пользователя в Firestore
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
        message: 'Подписка успешно отменена, возврат средств оформлен',
      });
    } else {
      return res.status(400).json({
        error: 'Не удалось оформить возврат средств через ЮKassa',
      });
    }
  } catch (error) {
    console.error('Ошибка отмены подписки:', error.response?.data || error.message);
    return res.status(500).json({
      error: error.response?.data?.description || 'Ошибка при отмене подписки',
    });
  }
};
