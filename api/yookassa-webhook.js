const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

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
      const period = payment.metadata?.subscription_period || 'one_time';
      const paymentMethodId = payment.payment_method?.id;

      if (userId) {
        const db = getFirestore();
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        const now = new Date();
        let baseDate = now;

        if (userDoc.exists) {
          const data = userDoc.data();
          if (data.isPremium && data.expiresAt) {
            const currentExpiresAt = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
            if (currentExpiresAt > now) {
              baseDate = currentExpiresAt;
            }
          }
        }

        let expiresAt = null;
        let isLifetime = false;

        // Логика расчета периода
        if (period === 'lifetime' || period === 'one_time_forever') {
          isLifetime = true;
        } else if (period === '1_year') {
          expiresAt = new Date(baseDate);
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        } else if (period === '1_month') {
          expiresAt = new Date(baseDate);
          expiresAt.setMonth(expiresAt.getMonth() + 1);
        } else {
          // По умолчанию разовый доступ на 30 дней
          expiresAt = new Date(baseDate);
          expiresAt.setDate(expiresAt.getDate() + 30);
        }

        await userRef.set({
          isPremium: true,
          autoRenew: false, // Для разовых покупок всегда false
          isLifetime: isLifetime,
          subscriptionPeriod: period,
          premiumPurchasedAt: FieldValue.serverTimestamp(),
          expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
          paymentId: payment.id,
          paymentMethodId: paymentMethodId || null,
        }, { merge: true });

        console.log(`✅ Разовый Премиум активирован для UID: ${userId}`);
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
