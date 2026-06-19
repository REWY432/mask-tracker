// ВСТАВЬТЕ ВАШИ ДАННЫЕ ОТ SUPABASE ЗДЕСЬ
const SUPABASE_URL = 'https://ckwvyouciszfaigvowfv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrd3Z5b3VjaXN6ZmFpZ3Zvd2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTU3MjgsImV4cCI6MjA5NzQzMTcyOH0.EVIxNi4TdUOKqGqZKViJpSq4RCrnj6BwWjawdDQyyNE';
const ACCESS_CODE = '7452'; // Ваш код авторизации

let supabaseClient;

// --- Авторизация ---
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
    document.getElementById('main-app').classList.remove('hidden');
    initSupabase();
}

// --- Инициализация и загрузка данных ---
function initSupabase() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    loadDashboardData(); // Загружаем статистику и таблицу при входе
    
    // Обработка формы
    document.getElementById('mask-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-btn');
        submitBtn.innerText = 'Сохранение...';
        submitBtn.disabled = true;

        const model = document.getElementById('model').value;
        const size = document.getElementById('size').value;
        const generation = document.getElementById('generation').value;
        const lining = document.getElementById('lining').value || 'InPo';

        const { data, error } = await supabaseClient
            .from('masks')
            .insert([{ model_code: model, size: size, generation: generation, lining: lining }])
            .select();

        if (error) {
            alert('Ошибка: ' + error.message);
        } else if (data && data.length > 0) {
            const serial = data[0].serial_number;
            const msgDiv = document.getElementById('message');
            msgDiv.style.display = 'block';
            msgDiv.innerText = `✓ Создана маска: ${serial}`;
            
            printLabel(serial);
            loadDashboardData(); // Обновляем таблицу и статистику
            
            setTimeout(() => { msgDiv.style.display = 'none'; }, 3000);
        }
        submitBtn.innerText = 'Сохранить и распечатать';
        submitBtn.disabled = false;
    });

    // Поиск по таблице
    document.getElementById('search-input').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#masks-tbody tr');
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    });
}

// --- Загрузка статистики и таблицы ---
async function loadDashboardData() {
    // 1. Загрузка статистики
    const { count: total } = await supabaseClient.from('masks').select('*', { count: 'exact', head: true });
    const { count: foil } = await supabaseClient.from('masks').select('*', { count: 'exact', head: true }).eq('model_code', 'f');
    const { count: epee } = await supabaseClient.from('masks').select('*', { count: 'exact', head: true }).eq('model_code', 'e');
    const { count: sabre } = await supabaseClient.from('masks').select('*', { count: 'exact', head: true }).eq('model_code', 's');
    const { count: trainer } = await supabaseClient.from('masks').select('*', { count: 'exact', head: true }).eq('model_code', 'c');

    document.getElementById('stat-total').innerText = total || 0;
    document.getElementById('stat-foil').innerText = foil || 0;
    document.getElementById('stat-epee').innerText = epee || 0;
    document.getElementById('stat-sabre').innerText = sabre || 0;
    document.getElementById('stat-trainer').innerText = trainer || 0;

    // 2. Загрузка последних 50 масок для таблицы
    const { data: masks, error } = await supabaseClient
        .from('masks')
        .select('*')
        .order('id', { ascending: false })
        .limit(50);

    if (error) { console.error('Ошибка загрузки таблицы:', error); return; }

    const tbody = document.getElementById('masks-tbody');
    tbody.innerHTML = '';

    const modelMap = { 'f': 'Foil', 'e': 'Epee', 's': 'Sabre', 'c': 'Trainer' };
    const statusMap = { 'На складе': 'active', 'В ремонте': 'repair' };

    masks.forEach(mask => {
        const row = document.createElement('tr');
        const dateObj = new Date(mask.created_at);
        const formattedDate = `${dateObj.getMonth() + 1}.${dateObj.getFullYear()}`;
        
        row.innerHTML = `
            <td>#${mask.id}</td>
            <td class="sn-code">${mask.serial_number}</td>
            <td>${modelMap[mask.model_code] || mask.model_code}</td>
            <td>${mask.size} / ${mask.lining}</td>
            <td>${formattedDate}</td>
            <td><span class="status-badge ${statusMap[mask.status] || ''}">${mask.status}</span></td>
        `;
        tbody.appendChild(row);
    });
}

// --- Печать этикетки ---
function printLabel(serialNumber) {
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, { text: serialNumber, width: 100, height: 100, correctLevel: QRCode.CorrectLevel.M });
    document.getElementById('serial-text').innerText = serialNumber;
    setTimeout(() => { window.print(); }, 200);
}

// Проверка авторизации при загрузке
window.onload = () => {
    if (sessionStorage.getItem('isAuth') === 'true') { showApp(); }
};
