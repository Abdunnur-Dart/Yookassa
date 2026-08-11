const { initializeApp, getApps, cert } = require('firebase-admin/app'); // NEW
const { getFirestore } = require('firebase-admin/firestore'); // NEW

// NEW: Инициализация Firebase Admin SDK
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
  res.setHeader('Access-Control-Allow-Origin', '*'); // NEW
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); // NEW
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); // NEW

  if (req.method === 'OPTIONS') return res.status(200).end(); // NEW
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' }); // NEW

  const { userId } = req.body; // NEW

  if (!userId) { // NEW
    return res.status(400).json({ error: 'Missing userId parameter' }); // NEW
  } // NEW

  try { // NEW
    const db = getFirestore(); // NEW
    const userRef = db.collection('users').doc(userId); // NEW

    // NEW: Фиксируем отмену автопродления. Премиум активен до expiresAt
    await userRef.update({ // NEW
      autoRenew: false, // NEW
      updatedAt: new Date(), // NEW
    }); // NEW

    console.log(`🚫 Автопродление отключено для UID: ${userId}`); // NEW
    return res.status(200).json({ status: 'ok', message: 'Автопродление отключено' }); // NEW
  } catch (error) { // NEW
    console.error('❌ Ошибка отмены подписки:', error); // NEW
    return res.status(500).json({ error: 'Internal Server Error' }); // NEW
  } // NEW
}; // NEW
