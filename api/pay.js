module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { amount, description, userId, returnUrl } = req.body;

  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  if (!shopId || !secretKey) {
    return res.status(500).json({ error: 'Missing credentials in environment variables' });
  }

  const credentials = `${shopId}:${secretKey}`;
  const authString = Buffer.from(credentials).toString('base64');

  // Если приложение передало свой диплинк, используем его, иначе стандартный сайт
  const finalReturnUrl = returnUrl || "https://yookassaproj201514.vercel.app/success";

  try {
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authString}`,
        'Idempotence-Key': Math.random().toString(36).substring(7)
      },
      body: JSON.stringify({
        amount: {
          value: amount || "299.00",
          currency: "RUB"
        },
        confirmation: {
          type: "redirect",
          return_url: finalReturnUrl // ЮKassa вернет пользователя сюда
        },
        capture: true,
        description: description || "Премиум-подписка Муаллим Сани",
        metadata: {
          userId: userId || "unknown"
        }
      })
    });

    const data = await response.json();
    
    if (data.confirmation && data.confirmation.confirmation_url) {
      return res.status(200).json({ confirmation_url: data.confirmation.confirmation_url });
    } else {
      return res.status(500).json({ error: 'Failed to create payment', details: data });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
