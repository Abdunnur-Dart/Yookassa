const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Инициализация Firebase Admin без обращения к admin.apps
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
    console.error('Firebase initialization error:', err);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const event = req.body;

    if (event && event.event === 'payment.succeeded') {
      const payment = event.object;
      const userId = payment.metadata?.user_id;
      const period = payment.metadata?.subscription_period || '1_month';

      if (userId) {
        const db = getFirestore();

        // Записываем флаг премиума в коллекцию пользователей
        await db.collection('users').doc(userId).set({
          isPremium: true,
          subscriptionPeriod: period,
          premiumPurchasedAt: FieldValue.serverTimestamp(),
          paymentId: payment.id,
        }, { merge: true });

        console.log(`✅ Премиум активирован для UID: ${userId}`);
      } else {
        console.warn('⚠️ Webhook получен, но user_id отсутствует в metadata');
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Ошибка при обработке вебхука:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
