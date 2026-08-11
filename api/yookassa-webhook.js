const admin = require('firebase-admin');

// 1. Безопасная инициализация Firebase Admin
if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined;

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
  } catch (err) {
    console.error('Firebase initialization error:', err);
  }
}

module.exports = async (req, res) => {
  // Разрешаем только POST запросы от ЮKassa
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const event = req.body;

    // 2. Обрабатываем событие успешной оплаты
    if (event && event.event === 'payment.succeeded') {
      const payment = event.object;
      const userId = payment.metadata?.user_id;
      const period = payment.metadata?.subscription_period || '1_month';

      if (userId) {
        const db = admin.firestore();

        // 3. Записываем премиум статус прямо в документ пользователя
        await db.collection('users').doc(userId).set({
          isPremium: true,
          subscriptionPeriod: period,
          premiumPurchasedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentId: payment.id,
        }, { merge: true });

        console.log(`✅ Премиум успешно активирован для UID: ${userId}`);
      } else {
        console.warn('⚠️ Webhook получен, но user_id отсутствует в metadata');
      }
    }

    // Возвращаем ЮKassa статус 200 OK
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Ошибка при обработке вебхука:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
