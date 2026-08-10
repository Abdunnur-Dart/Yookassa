const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Безопасная инициализация Firebase Admin
if (!getApps().length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      initializeApp({
        credential: cert(serviceAccount)
      });
    } else {
      const serviceAccount = require('../serviceAccountKey.json');
      initializeApp({
        credential: cert(serviceAccount)
      });
    }
  } catch (err) {
    console.error('Ошибка инициализации Firebase Admin:', err);
  }
}

const db = getFirestore();

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
          subscribedAt: FieldValue.serverTimestamp(),
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
