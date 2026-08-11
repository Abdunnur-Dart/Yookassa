// api/yookassa-webhook.js
import admin from 'firebase-admin';

// Инициализация Firebase Admin (требуются сервисные ключи)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const event = req.body;

    // Проверяем статус успешной оплаты от ЮKassa
    if (event.event === 'payment.succeeded') {
      const payment = event.object;
      
      // Достаем user_id, который передавали в metadata при создании платежа
      const userId = payment.metadata?.user_id;

      if (userId) {
        // Безопасно обновляем статус подписки пользователя в Firestore
        await db.collection('users').doc(userId).set({
          isPremium: true,
          premiumPurchasedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentId: payment.id,
        }, { merge: true });

        console.log(`Подписка успешно активирована для UID: ${userId}`);
      }
    }

    // Возвращаем ЮKassa HTTP 200 OK, чтобы подтвердить получение webhook
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Ошибка обработки Webhook:', error);
    return res.status(500).send('Internal Server Error');
  }
}
