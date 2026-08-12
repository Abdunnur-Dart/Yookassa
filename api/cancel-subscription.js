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
        projectId: process.env.FIREBASE_PROJECT_ID, // Nconst { initializeApp, getApps, cert } = require('firebase-admin/app'); // NEW
const { getFirestore, Timestamp } = require('firebase-admin/firestore'); // NEW
const { getAuth } = require('firebase-admin/auth'); // NEW

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
  // Разрешаем только POST запросы // NEW
  if (req.method !== 'POST') { // NEW
    return res.status(405).json({ error: 'Method Not Allowed' }); // NEW
  } // NEW

  try { // NEW
    // 1. Проверка авторизации Firebase ID Token // NEW
    const authHeader = req.headers.authorization; // NEW
    if (!authHeader || !authHeader.startsWith('Bearer ')) { // NEW
      return res.status(401).json({ error: 'Unauthorized: Missing token' }); // NEW
    } // NEW

    const idToken = authHeader.split('Bearer ')[1]; // NEW
    const decodedToken = await getAuth().verifyIdToken(idToken); // NEW
    const uid = decodedToken.uid; // NEW

    const db = getFirestore(); // NEW
    const userRef = db.collection('users').doc(uid); // NEW
    const userDoc = await userRef.get(); // NEW

    if (!userDoc.exists) { // NEW
      return res.status(404).json({ error: 'User not found' }); // NEW
    } // NEW

    const userData = userDoc.data(); // NEW

    // 2. Отмена подписки в ЮKassa (если сохранен payment_method_id или payment_id) // NEW
    const paymentMethodId = userData.paymentMethodId; // NEW
    if (paymentMethodId && process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY) { // NEW
      try { // NEW
        const authString = Buffer.from( // NEW
          `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}` // NEW
        ).toString('base64'); // NEW

        // Отзываем сохраненный способ оплаты в ЮKassa // NEW
        await fetch(`https://api.yookassa.ru/v3/payment_methods/${paymentMethodId}/unbind`, { // NEW
          method: 'POST', // NEW
          headers: { // NEW
            'Authorization': `Basic ${authString}`, // NEW
            'Idempotency-Key': `unbind-${uid}-${Date.now()}`, // NEW
            'Content-Type': 'application/json', // NEW
          }, // NEW
        }); // NEW
      } catch (yookassaError) { // NEW
        console.error('⚠️ Ошибка отзыва платежного метода в ЮKassa:', yookassaError); // NEW
        // Продолжаем выполнение, чтобы отключить autoRenew локально // NEW
      } // NEW
    } // NEW

    // 3. Безопасное обновление статуса подписки через Firebase Admin SDK // NEW
    await userRef.update({ // NEW
      autoRenew: false, // NEW
      updatedAt: Timestamp.now(), // NEW
    }); // NEW

    console.log(`✅ Автопродление успешно отключено для пользователя: ${uid}`); // NEW
    return res.status(200).json({ status: 'ok', message: 'Subscription autoRenew cancelled successfully' }); // NEW
  } catch (error) { // NEW
    console.error('❌ Ошибка отмены подписки:', error); // NEW
    return res.status(500).json({ error: 'Internal Server Error' }); // NEW
  } // NEW
}; // NEWEW
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
