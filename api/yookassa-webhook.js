// NEW: Подключаем необходимые библиотеки
const admin = require('firebase-admin');

// Инициализируем Firebase Admin, если он еще не был инициализирован
if (!admin.apps.length) {
  // Вариант 1: Загрузка ключа из файла serviceAccountKey.json в корне проекта
  const serviceAccount = require('../serviceAccountKey.json');
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  // ЮKassa отправляет уведомления методом POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;

    // Проверяем тип события от ЮKassa
    if (event && event.type === 'payment.succeeded') {
      const payment = event.object;
      
      // Извлекаем user_id и период подписки из metadata, которые передали с фронтенда
      const userId = payment.metadata ? payment.metadata.user_id : null;
      const subscriptionPeriod = payment.metadata ? payment.metadata.subscription_period : '1_month';

      if (userId) {
        // Обновляем запись пользователя в коллекцию users
        await db.collection('users').doc(userId).set({
          isPremium: true,
          subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
          subscriptionPeriod: subscriptionPeriod,
          paymentId: payment.id,
          amount: payment.amount.value
        }, { merge: true });

        console.log(`Успешно активирована подписка для UID: ${userId}`);
      } else {
        console.warn('Получен платеж без user_id в metadata:', payment.id);
      }
    }

    // ЮKassa требует вернуть статус 200 OK в ответ на уведомление
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Ошибка при обработке Webhook ЮKassa:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
