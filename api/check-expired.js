const { initializeApp, getApps, cert } = require('firebase-admin/app'); // NEW
const { getFirestore, Timestamp } = require('firebase-admin/firestore'); // NEW

if (!getApps().length) { // NEW
  try { // NEW
    const privateKey = process.env.FIREBASE_PRIVATE_KEY // NEW
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') // NEW
      : undefined; // NEW

    initializeApp({ // NEW
      credential: cert({ // NEW
        projectId: process.env.FIREBASE_PROJECT_ID, // NEW
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL, // NEW
        privateKey: privateKey, // NEW
      }), // NEW
    }); // NEW
  } catch (err) { // NEW
    console.error('Firebase initialization error:', err); // NEW
  } // NEW
} // NEW

module.exports = async (req, res) => { // NEW
  try { // NEW
    const db = getFirestore(); // NEW
    const now = Timestamp.now(); // NEW

    // Ищем пользователей с истекшей датой подписки и активным премиумом
    const expiredUsersQuery = await db // NEW
      .collection('users') // NEW
      .where('isPremium', '==', true) // NEW
      .where('expiresAt', '<=', now) // NEW
      .get(); // NEW

    if (expiredUsersQuery.empty) { // NEW
      return res.status(200).json({ status: 'ok', updated: 0 }); // NEW
    } // NEW

    const batch = db.batch(); // NEW
    expiredUsersQuery.forEach((doc) => { // NEW
      batch.update(doc.ref, { // NEW
        isPremium: false, // NEW
        autoRenew: false, // NEW
        updatedAt: new Date(), // NEW
      }); // NEW
    }); // NEW

    await batch.commit(); // NEW
    console.log(`🧹 Деактивировано истекших подписок: ${expiredUsersQuery.size}`); // NEW

    return res.status(200).json({ status: 'ok', updated: expiredUsersQuery.size }); // NEW
  } catch (error) { // NEW
    console.error('❌ Ошибка деактивации истекших подписок:', error); // NEW
    return res.status(500).json({ error: 'Internal Server Error' }); // NEW
  } // NEW
}; // NEW
