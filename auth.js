// auth.js
import { auth } from './firebase-init.js';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged 
} from "firebase/auth";

document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('loginPassword');
    const authStatus = document.getElementById('authStatus');
    const payButton = document.getElementById('payButton');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');

    // Следим за состоянием авторизации
    onAuthStateChanged(auth, (user) => {
        if (user) {
            authStatus.textContent = `Вы вошли как: ${user.email}`;
            payButton.disabled = false;
        } else {
            authStatus.textContent = "Вы не авторизованы. Войдите или зарегистрируйтесь.";
            payButton.disabled = true;
        }
    });

    // Обработка регистрации
    registerBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (!email || !password) {
            alert("Заполните email и пароль!");
            return;
        }

        try {
            await createUserWithEmailAndPassword(auth, email, password);
            alert("Регистрация успешна!");
        } catch (error) {
            alert("Ошибка регистрации: " + error.message);
        }
    });

    // Обработка входа
    loginBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            alert("Заполните email и пароль!");
            return;
        }

        try {
            await signInWithEmailAndPassword(auth, email, password);
            alert("Вход выполнен!");
        } catch (error) {
            alert("Ошибка входа: " + error.message);
        }
    });

    // Обработка клика по кнопке оплаты
    payButton.addEventListener('click', async () => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            alert("Сначала выполните вход!");
            return;
        }

        payButton.disabled = true;
        payButton.textContent = 'Создание платежа...';

        try {
            const response = await fetch('/api/pay', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: "299.00",
                    description: "Премиум-подписка Telegraph",
                    userId: currentUser.uid
                })
            });

            const data = await response.json();

            if (response.ok && data.confirmation_url) {
                window.location.href = data.confirmation_url;
            } else {
                alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
                payButton.disabled = false;
                payButton.textContent = 'Купить';
            }
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Произошла ошибка сети.');
            payButton.disabled = false;
            payButton.textContent = 'Купить';
        }
    });
});
