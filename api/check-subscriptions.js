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

    // Находим всех пользователей, у кого подписка активна, но дата окончания уже прошла
    const snapshot = await db
      .collection('users')
      .where('isPremium', '==', true)
      .where('expiresAt', '<=', now)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ message: 'Нет истекших подписок.' });
    }

    const batch = db.batch();

    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isPremium: false,
        updatedAt: now,
      });
    });

    await batch.commit();

    return res.status(200).json({
      message: `Успешно отключено подписок: ${snapshot.size}`,
    });
  } catch (error) {
    console.error('Ошибка сброса подписок:', error);
    return res.status(500).json({ error: error.message });
  }
}
