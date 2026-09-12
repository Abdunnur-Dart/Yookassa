import admin from 'firebase-admin';

// Предотвращаем повторную инициализацию Firebase Admin в Serverless
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { accessToken } = req.body;
  if (!accessToken) {
    return res.status(400).json({ error: 'accessToken is required' });
  }

  try {
    // 1. Запрашиваем данные профиля у Яндекс ID
    const yandexResponse = await fetch('https://login.yandex.ru/info', {
      headers: { Authorization: `OAuth ${accessToken}` },
    });

    if (!yandexResponse.ok) {
      return res.status(401).json({ error: 'Invalid Yandex token' });
    }

    const yandexData = await yandexResponse.json();
    const { id, default_email, display_name, real_name } = yandexData;
    const uid = `yandex:${id}`;

    // 2. Создаем или обновляем пользователя в Firebase Auth
    try {
      await admin.auth().updateUser(uid, {
        email: default_email,
        displayName: display_name || real_name,
      });
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        await admin.auth().createUser({
          uid,
          email: default_email,
          displayName: display_name || real_name,
        });
      }
    }

    // 3. Генерируем Custom Token для Flutter
    const customToken = await admin.auth().createCustomToken(uid);

    return res.status(200).json({ customToken });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
