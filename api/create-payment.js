const admin = require('firebase-admin');
const https = require('https');
const webhookHandler = require('./yookassa-webhook');

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

function requestYooKassa(path, method, body, idempotencyKey) {
  return new Promise((resolve, reject) => {
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;

    if (!shopId || !secretKey) {
      return reject(new Error('Не заданы YOOKASSA_SHOP_ID или YOOKASSA_SECRET_KEY в Vercel'));
    }

    const basicAuth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    const postData = JSON.stringify(body);

    const options = {
      hostname: 'api.yookassa.ru',
      port: 443,
      path: path,
      method: method,
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

  // Если это вебхук от ЮKassa
  if (req.body && req.body.event) {
    return webhookHandler(req, res);
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const productId = (req.body && req.body.productId) ? req.body.productId : 'sub_1_month';

    // Явный расчет суммы в формате строки с двумя знаками после запятой
    let price = '199.00';
    if (productId === 'sub_1_year') price = '1990.00';
    if (productId === 'lifetime_access') price = '2990.00';

    const paymentData = {
      amount: {
        value: price,
        currency: 'RUB',
      },
      confirmation: {
        type: 'redirect',
        return_url: 'https://yookassaproj201514.vercel.app',
      },
      capture: true,
      description: `Оплата подписки ${productId}`,
      metadata: {
        userId: String(uid),
        productId: String(productId),
      },
    };

    const idempotencyKey = `pay_${uid}_${Date.now()}`;
    const yooRes = await requestYooKassa('/v3/payments', 'POST', paymentData, idempotencyKey);

    if (yooRes.statusCode === 200 && yooRes.body.confirmation) {
      return res.status(200).json({
        confirmationUrl: yooRes.body.confirmation.confirmation_url,
      });
    } else {
      console.error('Детали ошибки от ЮKassa:', yooRes.body);
      return res.status(400).json({
        error: yooRes.body.description || yooRes.body.message || 'Ошибка создания платежа в ЮKassa',
      });
    }
  } catch (error) {
    console.error('Ошибка в create-payment:', error);
    return res.status(500).json({ error: error.message || 'Внутренняя ошибка сервера' });
  }
};
