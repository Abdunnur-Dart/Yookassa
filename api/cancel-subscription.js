const admin = require('firebase-admin');
const { YooCheckout } = require('@yoomoney/yookassa-sdk');

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
const checkout = new YooCheckout({
  shopId: process.env.YOOKASSA_SHOP_ID,
  secretKey: process.env.YOOKASSA_SECRET_KEY,
});

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

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
        error: 'Не найдены данные последнего платежа (lastPaymentId / lastPaymentAmount) в Firestore',
      });
    }

    const idempotencyKey = `refund_${uid}_${Date.now()}`;

    const refund = await checkout.createRefund(
      {
        payment_id: paymentId,
        amount: {
          value: Number(paymentAmount).toFixed(2),
          currency: 'RUB',
        },
      },
      idempotencyKey
    );

    if (refund.status === 'succeeded' || refund.status === 'pending') {
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
      return res.status(400).json({ error: 'Ошибка проведения возврата ЮKassa' });
    }
  } catch (error) {
    console.error('Ошибка в cancel-subscription:', error);
    return res.status(500).json({ error: error.message || 'Ошибка сервера при возврате' });
  }
};
