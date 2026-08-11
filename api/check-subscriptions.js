import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Инициализация Firebase Admin SDK
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Исправление переносов строк в приватном ключе Vercel
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  // Безопасность: проверяем секретный заголовок от Vercel Cron
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();

    // CHANGED: Ищем подписки, где автопродление отменено (autoRenew == false) и дата окончания прошла
    const snapshot = await db
      .collection('users')
      .where('isPremium', '==', true)
      .where('autoRenew', '==', false) // NEW: Аннулируем только отмененные подписки
      .where('expiresAt', '<=', now)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ message: 'Нет истекших подписок.' });
    }

    // NEW: Безопасное разбиение на чанки (лимит Firestore — 500 операций в batch)
    const BATCH_LIMIT = 400; // NEW
    const docs = snapshot.docs; // NEW
    let processedCount = 0; // NEW

    for (let i = 0; i < docs.length; i += BATCH_LIMIT) { // NEW
      const chunk = docs.slice(i, i + BATCH_LIMIT); // NEW
      const batch = db.batch(); // CHANGED

      chunk.forEach((doc) => { // CHANGED
        batch.update(doc.ref, {
          isPremium: false,
          updatedAt: now,
        });
      });

      await batch.commit(); // NEW
      processedCount += chunk.length; // NEW
    } // NEW

    return res.status(200).json({
      message: `Успешно отключено подписок: ${processedCount}`, // CHANGED
    });
  } catch (error) {
    console.error('Ошибка сброса подписок:', error);
    return res.status(500).json({ error: error.message });
  }
}
