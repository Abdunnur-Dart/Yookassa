// Считываем параметры из URL (userId и ссылку возврата в приложение)
const urlParams = new URLSearchParams(window.location.search);
const appReturnUrl = urlParams.get('app_return'); // например: muallimsani://success

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
                amount: "49.99",
                description: "поддержка разработчику",
                userId: currentUser.uid,
                returnUrl: appReturnUrl // Передаем диплинк на бэкенд
            })
        });

        const data = await response.json();

        if (response.ok && data.confirmation_url) {
            window.location.href = data.confirmation_url;
        } else {
            alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
            payButton.disabled = false;
            payButton.textContent = 'поддержка';
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Произошла ошибка сети.');
        payButton.disabled = false;
        payButton.textContent = 'Купить';
    }
});
