const admin = require('firebase-admin');

// Инициализация Firebase Admin (если еще не инициализирован)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Замените переносы строк в приватном ключе
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body;

  // Проверяем событие успешной оплаты от ЮKassa
  if (event.type === 'payment.succeeded') {
    const paymentObject = event.object;
    const userId = paymentObject.metadata ? paymentObject.metadata.userId : null;

    if (userId) {
      try {
        // Обновляем статус пользователя в Firestore в базе данных
        await db.collection('users').doc(userId).set({
          isPremium: true,
          premiumSince: admin.firestore.FieldValue.serverTimestamp(),
          paymentId: paymentObject.id
        }, { merge: true });

        console.log(`Подписка успешно активирована для пользователя: ${userId}`);
      } catch (error) {
        console.error('Ошибка сохранения подписки в базу данных:', error);
        return res.status(500).json({ error: 'Database update failed' });
      }
    }
  }

  // Обязательно отвечаем ЮKassa статусом 200, чтобы она знала, что уведомление получено
  return res.status(200).json({ received: true });
};
