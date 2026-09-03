const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Инициализация Firebase Admin с использованием ключа из GitHub Secrets
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Ошибка: Файл serviceAccountKey.json не найден!');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function checkAndExpireSubscriptions() {
  console.log('🔄 Начинаем проверку истекших подписок...');
  
  const now = new Date();
  
  try {
    // Ищем пользователей с активным премиумом, у которых дата окончания меньше текущей
    const snapshot = await db.collection('users')
      .where('isPremium', '==', true)
      .where('expiresAt', '<=', now)
      .get();

    if (snapshot.empty) {
      console.log('✅ Нет подписок для аннулирования.');
      process.exit(0);
    }

    const batch = db.batch();
    let expiredCount = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();

      // Защита: пропускаем бессрочные покупки
      if (data.isLifetime === true || data.subscriptionPeriod === 'lifetime') {
        return;
      }

      console.log(`❌ Аннулируем премиум для пользователя UID: ${doc.id}`);
      
      batch.update(doc.ref, {
        isPremium: false,
        updatedAt: now,
      });

      expiredCount++;
    });

    if (expiredCount > 0) {
      await batch.commit();
      console.log(`✅ Успешно аннулирован доступ для ${expiredCount} пользователей.`);
    } else {
      console.log('✅ Истекших подписок (не считая Lifetime) не обнаружено.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при обработке подписок:', error);
    process.exit(1);
  }
}

checkAndExpireSubscriptions();
