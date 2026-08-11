import admin from 'firebase-admin';

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
    console.error('Firebase admin initialization error:', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const event = req.body;

    if (event.event === 'payment.succeeded') {
      const payment = event.object;
      const userId = payment.metadata?.user_id;
      const period = payment.metadata?.subscription_period || '1_month';

      if (userId) {
        const db = admin.firestore();
        
        // Обновляем статус в базе
        await db.collection('users').doc(userId).set({
          isPremium: true,
          subscriptionPeriod: period,
          premiumPurchasedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentId: payment.id,
        }, { merge: true });

        console.log(`✅ Успех: Премиум активирован для UID ${userId}`);
      } else {
        console.warn('⚠️ Webhook получен, но user_id отсутствует в metadata');
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Ошибка в обработчике Webhook:', error);
    return res.status(500).send('Internal Server Error');
  }
}
