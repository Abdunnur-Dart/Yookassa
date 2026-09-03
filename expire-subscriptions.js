const { db } = require('./api/firebase-init.js'); // или ваш путь к Firebase

async function checkAndExpireSubscriptions() {
  console.log('Начинаем проверку истекших подписок...');
  
  const now = new Date();
  
  try {
    // Получаем активные подписки, у которых время истечения меньше текущего
    const snapshot = await db.collection('users')
      .where('subscriptionStatus', '==', 'active')
      .where('expiresAt', '<=', now)
      .get();

    if (snapshot.empty) {
      console.log('Нет подписок для списания/аннулирования.');
      process.exit(0);
    }

    const batch = db.batch();

    snapshot.docs.forEach((doc) => {
      console.log(`Отменяем подписку для пользователя: ${doc.id}`);
      batch.update(doc.ref, {
        subscriptionStatus: 'expired',
        updatedAt: now,
      });
    });

    await batch.commit();
    console.log(`Успешно обработано пользователей: ${snapshot.size}`);
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при обработке подписок:', error);
    process.exit(1);
  }
}

checkAndExpireSubscriptions();
