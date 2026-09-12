// NEW: Vercel Serverless Function для обработки OAuth-ответа от Яндекс ID и генерации Firebase Custom Token
const admin = require('firebase-admin');
const axios = require('axios');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Замените переводы строк на реальные в переменной окружения Vercel
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    }),
  });
}

const CLIENT_ID = '6176038f547f4c3ebe7a903989c94d9d';
const CLIENT_SECRET = '0d0f2d7224a4471f88cf09a3d17e7bb7';

module.exports = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Отсутствует параметр code от Яндекс ID');
  }

  try {
    // 1. Обмениваем code на access_token от Яндекса
    const tokenResponse = await axios.post(
      'https://oauth.yandex.ru/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;

    // 2. Получаем информацию о пользователе из Яндекса
    const userResponse = await axios.get('https://login.yandex.ru/info', {
      headers: { Authorization: `OAuth ${accessToken}` },
    });

    const yandexUser = userResponse.data;
    const yandexUid = `yandex_${yandexUser.id}`;
    const email = yandexUser.default_email || `${yandexUser.login}@yandex.ru`;

    // 3. Создаем или находим пользователя в Firebase Auth
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUserByEmail(email);
    } catch (err) {
      firebaseUser = await admin.auth().createUser({
        uid: yandexUid,
        email: email,
        displayName: yandexUser.real_name || yandexUser.display_name || 'Пользователь Яндекса',
      });
    }

    // 4. Генерируем Firebase Custom Token для клиента
    const customToken = await admin.auth().createCustomToken(firebaseUser.uid);

    // 5. Перенаправляем пользователя обратно в приложение с токеном
    // (Или возвращаем HTML-страницу, которая передает токен в приложение)
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Авторизация через Яндекс</title>
      </head>
      <body>
        <p>Авторизация прошла успешно! Перенаправление в приложение...</p>
        <script>
          const token = "${customToken}";
          // Передаем токен в приложение (например, через localStorage или диплинк)
          window.location.href = "/?token=" + token;
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Ошибка авторизации Яндекса:', error.response?.data || error.message);
    res.status(500).send('Ошибка авторизации через Яндекс ID');
  }
};
