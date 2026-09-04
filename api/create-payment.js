const admin = require('firebase-admin');
const { YooCheckout } = require('@yoomoney/yookassa-sdk');
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

const checkout = new YooCheckout({
  shopId: process.env.YOOKASSA_SHOP_ID,
  secretKey: process.env.YOOKASSA_SECRET_KEY,
});

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Если ЮKassa прислала вебхук на этот URL — передаем в обработчик вебхуков
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

    let price = '199.00';
    if (productId === 'sub_1_year') price = '1990.00';
    if (productId === 'lifetime_access') price = '2990.00';

    const idempotencyKey = `pay_${uid}_${Date.now()}`;

    const payment = await checkout.createPayment(
      {
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
      },
      idempotencyKey
    );

    if (payment && payment.confirmation && payment.confirmation.confirmation_url) {
      return res.status(200).json({
        confirmationUrl: payment.confirmation.confirmation_url,
      });
    } else {
      return res.status(400).json({ error: 'Не удалось получить ссылку на оплату' });
    }
  } catch (error) {
    console.error('Ошибка в create-payment:', error);
    return res.status(500).json({ error: error.message || 'Ошибка сервера при создании платежа' });
  }
};
