const admin = require('firebase-admin');
const https = require('https');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined,
    }),
  });
}

const db = admin.firestore();

// Хелпер для запросов к ЮKassa без axios
function makeYooKassaRefund(shopId, secretKey, paymentId, amount, idempotencyKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      payment_id: paymentId,
      amount: {
        value: Number(amount).toFixed(2),
        currency: 'RUB',
      },
    });

    const basicAuth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');

    const options = {
      hostname: 'api.yookassa.ru',
      port: 443,
      path: '/v3/refunds',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Basic ${basicAuth}`,
        'Idempotency-Key': idempotencyKey,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          reject(new Error('Ошибка парсинга ответа от ЮKassa: ' + data));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

module.exports = async (req, res) => {
  // Устанавливаем заголовки, чтобы ответ гарантированно был JSON
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const userData = userDoc.data();
    const paymentId = userData.lastPaymentId;
    const paymentAmount = userData.lastPaymentAmount;

    if (!paymentId || !paymentAmount) {
      return res.status(400).json({
        error: 'Не найдены данные последнего платежа (lastPaymentId / lastPaymentAmount) в Firestore.',
      });
    }

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;

    if (!shopId || !secretKey) {
      return res.status(500).json({
        error: 'На сервере не настроены ключи ЮKassa (YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY).',
      });
    }

    const idempotencyKey = `refund_${uid}_${Date.now()}`;
    const yooResponse = await makeYooKassaRefund(shopId, secretKey, paymentId, paymentAmount, idempotencyKey);

    if (yooResponse.statusCode === 200 && (yooResponse.body.status === 'succeeded' || yooResponse.body.status === 'pending')) {
      // Аннулируем премиум-статус пользователя в Firestore
      await db.collection('users').doc(uid).set(
        {
          isPremium: false,
          isLifetime: false,
          expiresAt: null,
          refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.status(200).json({
        success: true,
        message: 'Подписка успешно отменена, возврат средств оформлен',
      });
    } else {
      const errMsg = yooResponse.body?.description || yooResponse.body?.message || 'Ошибка проведения возврата через ЮKassa';
      return res.status(400).json({ error: errMsg });
    }
  } catch (error) {
    console.error('Ошибка отмены подписки:', error);
    return res.status(500).json({
      error: error.message || 'Внутренняя ошибка сервера при отмене подписки',
    });
  }
};
