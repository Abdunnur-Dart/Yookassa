const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

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
  try {
    // NEW: Защита эндпоинта секретным ключом CRON_SECRET от публичного DoS вызова
    const authHeader = req.headers.authorization; // NEW
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) { // NEW
      return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET' }); // NEW
    } // NEW

    const db = getFirestore();
    const now = Timestamp.now();

    // Ищем пользователей с истекшей датой подписки и активным премиумом
    const expiredUsersQuery = await db
      .collection('users')
      .where('isPremium', '==', true)
      .where('expiresAt', '<=', now)
      .get();

    if (expiredUsersQuery.empty) {
      return res.status(200).json({ status: 'ok', updated: 0 });
    }

    const batch = db.batch();
    expiredUsersQuery.forEach((doc) => {
      batch.update(doc.ref, {
        isPremium: false,
        autoRenew: false,
        updatedAt: new Date(),
      });
    });

    await batch.commit();
    console.log(`🧹 Деактивировано истекших подписок: ${expiredUsersQuery.size}`);

    return res.status(200).json({ status: 'ok', updated: expiredUsersQuery.size });
  } catch (error) {
    console.error('❌ Ошибка деактивации истекших подписок:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
