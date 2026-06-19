// ВСТАВЬТЕ ВАШИ ДАННЫЕ ОТ SUPABASE ЗДЕСЬ
const SUPABASE_URL = 'https://ckwvyouciszfaigvowfv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrd3Z5b3VjaXN6ZmFpZ3Zvd2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTU3MjgsImV4cCI6MjA5NzQzMTcyOH0.EVIxNi4TdUOKqGqZKViJpSq4RCrnj6BwWjawdDQyyNE';
const ACCESS_CODE = '1234'; // Ваш простой код авторизации (поменяйте)

let supabaseClient;

// Проверка авторизации (хранится в sessionStorage на время сессии)
function checkAuth() {
    const code = document.getElementById('auth-code').value;
    if (code === ACCESS_CODE) {
        sessionStorage.setItem('isAuth', 'true');
        showApp();
    } else {
        alert('Неверный код');
    }
}

function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    initSupabase();
}

function initSupabase() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Обработка отправки формы
    document.getElementById('mask-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Визуальная загрузка на кнопке
        const submitBtn = document.getElementById('submit-btn');
        submitBtn.innerText = 'Сохранение...';
        submitBtn.disabled = true;

        const model = document.getElementById('model').value;
        const size = document.getElementById('size').value;
        const generation = document.getElementById('generation').value;
        const lining = document.getElementById('lining').value || 'InPo';

        const { data, error } = await supabaseClient
            .from('masks')
            .insert([
                { model_code: model, size: size, generation: generation, lining: lining }
            ])
            .select();

        if (error) {
            alert('Ошибка сохранения: ' + error.message);
            submitBtn.innerText = 'Сохранить и распечатать';
            submitBtn.disabled = false;
        } else if (data && data.length > 0) {
            const serial = data[0].serial_number;
            
            // Показываем красивое сообщение
            const msgDiv = document.getElementById('message');
            msgDiv.style.display = 'block';
            msgDiv.innerText = `✓ Успешно! Маска: ${serial}`;
            
            printLabel(serial);
            
            // Возвращаем кнопку обратно
            submitBtn.innerText = 'Сохранить и распечатать';
            submitBtn.disabled = false;
            
            // Скрываем сообщение через 3 секунды
            setTimeout(() => { msgDiv.style.display = 'none'; }, 3000);
        }
    });

// Функция генерации QR и печати
function printLabel(serialNumber) {
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = ''; // Очищаем старый код
    
    // Генерируем QR (в код зашит серийный номер)
    new QRCode(qrContainer, {
        text: serialNumber,
        width: 100,
        height: 100,
        correctLevel: QRCode.CorrectLevel.M
    });
    
    document.getElementById('serial-text').innerText = serialNumber;
    
    // Небольшая задержка, чтобы QR-код успел отрисоваться в DOM
    setTimeout(() => {
        window.print();
    }, 200);
}

// При загрузке страницы проверяем, авторизован ли уже мастер
window.onload = () => {
    if (sessionStorage.getItem('isAuth') === 'true') {
        showApp();
    }
};
