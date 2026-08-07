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

    // Следим за состоянием авторизации пользователя
    onAuthStateChanged(auth, (user) => {
        if (user) {
            authStatus.textContent = `Вы вошли как: ${user.email}`;
            payButton.disabled = false; // Активируем кнопку оплаты
        } else {
            authStatus.textContent = "Вы не авторизованы. Войдите или зарегистрируйтесь.";
            payButton.disabled = true; // Блокируем кнопку до входа
        }
    });

    // Регистрация
    document.getElementById('registerBtn').addEventListener('click', async () => {
        try {
            await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
            alert("Регистрация успешна!");
        } catch (error) {
            alert("Ошибка регистрации: " + error.message);
        }
    });

    // Вход
    document.getElementById('loginBtn').addEventListener('click', async () => {
        try {
            await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
            alert("Вход выполнен!");
        } catch (error) {
            alert("Ошибка входа: " + error.message);
        }
    });

    // Функция создания платежа (вызывается по кнопке "Купить")
    window.createPayment = async function() {
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
                    userId: currentUser.uid // Передаем реальный ID пользователя из Firebase
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
    };
});
