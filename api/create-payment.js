// Файл: api/create-payment.js (на сервере Vercel)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  const { userId, productId, isWeb } = req.body;

  // 1. Словарь цен ЖЕСТКО на сервере. Клиент не может изменить эти цифры.
  const PRODUCTS = {
    'lifetime_access': {
      amount: '499.00',
      description: 'Разовая покупка: Доступ Навсегда',
    },
  };

  const product = PRODUCTS[productId];
  if (!product) {
    return res.status(400).json({ error: 'Неверный ID товара' });
  }

  // 2. Куда вернуть пользователя после оплаты
  const returnUrl = isWeb
    ? 'https://yookassaproj201514.vercel.app/'
    : 'muallimsani://success';

  // Ваши ключи ЮKassa (лучше занести в Environment Variables на Vercel)
  const SHOP_ID = process.env.YOOKASSA_SHOP_ID; 
  const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY; 

  try {
    // 3. Сервер сам отправляет запрос в ЮKassa
    const authHeader = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');
    
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authHeader}`,
        'Idempotency-Key': `${userId}_${Date.now()}`,
      },
      body: JSON.stringify({
        amount: {
          value: product.amount,
          currency: 'RUB',
        },
        confirmation: {
          type: 'redirect',
          return_url: returnUrl,
        },
        capture: true,
        description: product.description,
        metadata: {
          user_id: userId,
          product_id: productId,
        },
      }),
    });

    const data = await response.json();

    if (data.confirmation && data.confirmation.confirmation_url) {
      return res.status(200).json({ confirmationUrl: data.confirmation.confirmation_url });
    } else {
      return res.status(500).json({ error: 'Не удалось получить ссылку от ЮKassa' });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
