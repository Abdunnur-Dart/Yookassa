const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore'); // CHANGED: Добавлен Timestamp

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

        const userRef = db.collection('users').doc(userId); // NEW: Ссылка на документ пользователя
        const userDoc = await userRef.get();                // NEW: Получение текущих данных пользователя

        const now = new Date();                            // NEW: Текущее время
        let baseDate = now;                                // NEW: Точка отсчета подписки

        // NEW: Если подписка еще активна, продлеваем с момента ее окончания
        if (userDoc.exists) {                              // NEW
          const data = userDoc.data();                     // NEW
          if (data.isPremium && data.expiresAt) {          // NEW
            const currentExpiresAt = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt); // NEW
            if (currentExpiresAt > now) {                  // NEW
              baseDate = currentExpiresAt;                 // NEW
            }
          }
        }

        const expiresAt = new Date(baseDate);              // NEW: Расчет итоговой даты
        if (period === '1_year') {                         // NEW
          expiresAt.setFullYear(expiresAt.getFullYear() + 1); // NEW
        } else {                                           // NEW
          expiresAt.setMonth(expiresAt.getMonth() + 1);    // NEW
        }                                                  // NEW

        // Записываем флаг премиума в коллекцию пользователей
        // CHANGED: Добавлено сохранение автопродления autoRenew и даты expiresAt
        await userRef.set({
          isPremium: true,
          autoRenew: true, // NEW: При покупке подписки автопродление включено по умолчанию
          subscriptionPeriod: period,
          premiumPurchasedAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromDate(expiresAt), // CHANGED: Запись корректной даты окончания подписки
          paymentId: payment.id,
        }, { merge: true });

        console.log(`✅ Премиум активирован для UID: ${userId} до ${expiresAt.toISOString()}`); // CHANGED
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
