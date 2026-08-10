const admin = require('firebase-admin');

// Безопасная инициализация Firebase Admin
if (!admin.apps || !admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      const serviceAccount = require('../serviceAccountKey.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
  } catch (err) {
    console.error('Ошибка инициализации Firebase Admin:', err);
  }
}

const db = admin.firestore();

// Заменили export default на module.exports
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;

    if (event && event.type === 'payment.succeeded') {
      const payment = event.object;

      const userId = payment.metadata ? payment.metadata.user_id : null;
      const subscriptionPeriod = payment.metadata ? payment.metadata.subscription_period : '1_month';

      if (userId) {
        await db.collection('users').doc(userId).set({
          isPremium: true,
          subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
          subscriptionPeriod: subscriptionPeriod,
          paymentId: payment.id,
          amount: payment.amount ? payment.amount.value : null
        }, { merge: true });

        console.log(`Успешно активирована подписка для UID: ${userId}`);
      } else {
        console.warn('Получен платеж без user_id в metadata:', payment.id);
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Ошибка при обработке Webhook ЮKassa:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
