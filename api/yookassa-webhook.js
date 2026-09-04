const admin = require('firebase-admin');

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
    const event = req.body;

    // Проверяем статус события оплаты
    if (event.event === 'payment.succeeded') {
      const payment = event.object;
      const metadata = payment.metadata || {};
      const userId = metadata.userId;
      const productId = metadata.productId;

      if (!userId || !productId) {
        console.error('Ошибка: В метаданных отсутствуют userId или productId');
        return res.status(400).json({ error: 'Missing metadata' });
      }

      // Вычисляем дату истечения подписки
      let expiresAt = null;
      let isLifetime = false;
      const now = new Date();

      if (productId === 'sub_1_month') {
        expiresAt = new Date(now.setMonth(now.getMonth() + 1));
      } else if (productId === 'sub_1_year') {
        expiresAt = new Date(now.setFullYear(now.getFullYear() + 1));
      } else if (productId === 'lifetime_access') {
        isLifetime = true;
      }

      // Обновляем статус подписки пользователя в Firestore
      await db.collection('users').doc(userId).set(
        {
          isPremium: true,
          isLifetime: isLifetime,
          expiresAt: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
          lastPaymentId: payment.id, // CHANGED: Сохраняем ID платежа для возврата
          lastPaymentAmount: payment.amount ? payment.amount.value : null, // CHANGED: Сохраняем сумму
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`Успешно активирована подписка (${productId}) для пользователя: ${userId}`);
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Ошибка при обработке вебхука ЮKassa:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
