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

// Хелпер для отправки запроса в ЮKassa (создание платежа)
function requestYooKassaPayment(shopId, secretKey, paymentData, idempotencyKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(paymentData);
    const basicAuth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');

    const options = {
      hostname: 'api.yookassa.ru',
      port: 443,
      path: '/v3/payments',
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
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error('Ошибка парсинга ответа ЮKassa: ' + data));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = req.body || {};

    // -------------------------------------------------------------
    // СЛУЧАЙ 1: Это УВЕДОМЛЕНИЕ (вебхук) от ЮKassa
    // -------------------------------------------------------------
    if (body.event === 'payment.succeeded') {
      const payment = body.object;
      const metadata = payment.metadata || {};
      const userId = metadata.userId;
      const productId = metadata.productId;

      if (!userId || !productId) {
        console.error('Ошибка: В метаданных ЮKassa нет userId или productId');
        return res.status(200).json({ status: 'ok_but_missing_metadata' });
      }

      let expiresAt = null;
      let isLifetime = false;
      const now = new Date();

      if (productId === 'sub_1_month') {
        expiresAt = new Date(now.setMonth(now.getMonth() + 1));
      } else if (productId === 'sub_1_year') {
        expiresAt = new Date(now.setFullYear(now.getFullYear() + 1));
      } else if (productId === 'lifetime_access') {
        isLifetime = true;
      }

      // Обновляем статус подписки И сохраняем данные для будущего возврата
      await db.collection('users').doc(userId).set(
        {
          isPremium: true,
          isLifetime: isLifetime,
          expiresAt: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
          lastPaymentId: payment.id,         // Сохраняем ID платежа для возврата
          lastPaymentAmount: payment.amount ? payment.amount.value : null, // Сохраняем сумму
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`Успешно активирована подписка (${productId}) для пользователя ${userId}`);
      return res.status(200).json({ status: 'ok' });
    }

    // -------------------------------------------------------------
    // СЛУЧАЙ 2: Это ЗАПРОС НА СОЗДАНИЕ ПЛАТЕЖА из мобильного приложения
    // -------------------------------------------------------------
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const { productId } = body;
    if (!productId) {
      return res.status(400).json({ error: 'Не указан productId' });
    }

    // Определение стоимости
    let price = '199.00';
    if (productId === 'sub_1_year') price = '1990.00';
    if (productId === 'lifetime_access') price = '3990.00';

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;

    if (!shopId || !secretKey) {
      return res.status(500).json({ error: 'Ключи ЮKassa не настроены в Vercel' });
    }

    const paymentData = {
      amount: {
        value: price,
        currency: 'RUB',
      },
      confirmation: {
        type: 'redirect',
        return_url: 'https://yookassaproj201514.vercel.app/success',
      },
      capture: true,
      description: `Оплата подписки ${productId}`,
      // ОБЯЗАТЕЛЬНО: Передаем metadata, чтобы при возврате вебхука знать, чей это платеж
      metadata: {
        userId: uid,
        productId: productId,
      },
    };

    const idempotencyKey = `pay_${uid}_${Date.now()}`;
    const yooResponse = await requestYooKassaPayment(shopId, secretKey, paymentData, idempotencyKey);

    if (yooResponse.statusCode === 200 && yooResponse.body.confirmation) {
      return res.status(200).json({
        confirmationUrl: yooResponse.body.confirmation.confirmation_url,
      });
    } else {
      console.error('Ошибка создания платежа в ЮKassa:', yooResponse.body);
      return res.status(400).json({
        error: yooResponse.body.description || 'Не удалось создать платеж в ЮKassa',
      });
    }
  } catch (error) {
    console.error('Ошибка серверной функции:', error);
    return res.status(500).json({ error: error.message || 'Ошибка сервера' });
  }
};
