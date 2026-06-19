const SUPABASE_URL = 'https://ckwvyouciszfaigvowfv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrd3Z5b3VjaXN6ZmFpZ3Zvd2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTU3MjgsImV4cCI6MjA5NzQzMTcyOH0.EVIxNi4TdUOKqGqZKViJpSq4RCrnj6BwWjawdDQyyNE';
const ACCESS_CODE = '1234';

// ВАЖНО: Замените ВАШ_ЛОГИН на ваш логин GitHub! Это ссылка на публичную страницу проверки.
const GITHUB_PAGES_URL = 'https://ВАШ_ЛОГИН.github.io/maskos/verify.html'; 

let supabaseClient;
let html5QrCode;
let currentRepairMaskId = null;

// --- Авторизация ---
function checkAuth() {
    if (document.getElementById('auth-code').value === ACCESS_CODE) {
        sessionStorage.setItem('isAuth', 'true');
        showApp();
    } else { alert('Неверный код'); }
}
function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').classList.remove('hidden');
    initSupabase();
}

// --- Навигация (Переключение вкладок) ---
function switchView(view) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    if (view === 'dashboard') {
        document.getElementById('tab-dashboard').classList.add('active');
        document.getElementById('view-dashboard').classList.remove('hidden');
        document.getElementById('view-repairs').classList.add('hidden');
    } else if (view === 'repairs') {
        document.getElementById('tab-repairs').classList.add('active');
        document.getElementById('view-repairs').classList.remove('hidden');
        document.getElementById('view-dashboard').classList.add('hidden');
    }
}

// --- Инициализация ---
function initSupabase() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    loadDashboardData();
    
    document.getElementById('mask-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-btn');
        submitBtn.innerText = 'Saving...';
        submitBtn.disabled = true;

        const { data, error } = await supabaseClient.from('masks').insert([{
            model_code: document.getElementById('model').value,
            size: document.getElementById('size').value,
            generation: document.getElementById('generation').value,
            lining: document.getElementById('lining').value || 'InPo'
        }]).select();

        if (error) { alert('Ошибка: ' + error.message); } 
        else if (data && data.length > 0) {
            const serial = data[0].serial_number;
            const msgDiv = document.getElementById('message');
            msgDiv.style.display = 'block';
            msgDiv.innerText = `✓ Success! Mask: ${serial}`;
            printLabel(serial);
            loadDashboardData();
            setTimeout(() => { msgDiv.style.display = 'none'; }, 3000);
        }
        submitBtn.innerText = 'Generate & Print';
        submitBtn.disabled = false;
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#masks-tbody tr').forEach(row => {
            row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
        });
    });
}

// --- Загрузка данных дашборда ---
async function loadDashboardData() {
    const { count: total } = await supabaseClient.from('masks').select('*', { count: 'exact', head: true });
    const { count: foil } = await supabaseClient.from('masks').select('*', { count: 'exact', head: true }).eq('model_code', 'f');
    const { count: epee } = await supabaseClient.from('masks').select('*', { count: 'exact', head: true }).eq('model_code', 'e');
    const { count: sabre } = await supabaseClient.from('masks').select('*', { count: 'exact', head: true }).eq('model_code', 's');

    document.getElementById('stat-total').innerText = total || 0;
    document.getElementById('stat-foil').innerText = foil || 0;
    document.getElementById('stat-epee').innerText = epee || 0;
    document.getElementById('stat-sabre').innerText = sabre || 0;

    const { data: masks } = await supabaseClient.from('masks').select('*').order('id', { ascending: false }).limit(50);
    const tbody = document.getElementById('masks-tbody');
    tbody.innerHTML = '';
    const modelMap = { 'f': 'Foil', 'e': 'Epee', 's': 'Sabre', 'c': 'Trainer' };
    const statusMap = { 'На складе': 'active', 'В ремонте': 'repair' };

    masks.forEach(mask => {
        const row = document.createElement('tr');
        const dateObj = new Date(mask.created_at);
        row.innerHTML = `
            <td>#${mask.id}</td>
            <td class="sn-code">${mask.serial_number}</td>
            <td>${modelMap[mask.model_code]}</td>
            <td>${mask.size} / ${mask.lining}</td>
            <td>${dateObj.getMonth() + 1}.${dateObj.getFullYear()}</td>
            <td><span class="status-badge ${statusMap[mask.status] || ''}">${mask.status}</span></td>
        `;
        tbody.appendChild(row);
    });
}

// --- Сканер ремонта ---
function startScanner() {
    document.getElementById('start-scan-btn').classList.add('hidden');
    html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 },
        (decodedText) => {
            // QR код содержит ссылку (https://...verify.html?sn=XXXX). Достаем SN.
            const sn = decodedText.split('sn=')[1] || decodedText;
            html5QrCode.stop().then(() => {
                findMaskForRepair(sn);
            });
        },
        (err) => { /* Игнорируем ошибки сканирования кадров */ }
    ).catch(err => alert("Ошибка камеры: " + err));
}

async function findMaskForRepair(sn) {
    const { data, error } = await supabaseClient.from('masks').select('*').eq('serial_number', sn).single();
    if (error || !data) {
        alert("Маска не найдена в базе!");
        resetRepairView();
        return;
    }

    currentRepairMaskId = data.id;
    const modelMap = { 'f': 'Foil', 'e': 'Epee', 's': 'Sabre', 'c': 'Trainer' };
    const dateObj = new Date(data.created_at);

    document.getElementById('repair-scanner-section').classList.add('hidden');
    document.getElementById('repair-details-section').classList.remove('hidden');
    
    document.getElementById('repair-info-box').innerHTML = `
        <div class="repair-info-item"><span class="repair-info-label">Serial</span><span class="repair-info-value">${data.serial_number}</span></div>
        <div class="repair-info-item"><span class="repair-info-label">Status</span><span class="repair-info-value">${data.status}</span></div>
        <div class="repair-info-item"><span class="repair-info-label">Model</span><span class="repair-info-value">${modelMap[data.model_code]}</span></div>
        <div class="repair-info-item"><span class="repair-info-label">Size</span><span class="repair-info-value">${data.size}</span></div>
        <div class="repair-info-item"><span class="repair-info-label">Lining</span><span class="repair-info-value">${data.lining}</span></div>
        <div class="repair-info-item"><span class="repair-info-label">Date</span><span class="repair-info-value">${dateObj.getMonth() + 1}.${dateObj.getFullYear()}</span></div>
    `;
    document.getElementById('repair-notes').value = data.repair_notes || '';
}

async function updateMaskStatus(newStatus) {
    if (!currentRepairMaskId) return;
    const notes = document.getElementById('repair-notes').value;
    
    const { error } = await supabaseClient.from('masks')
        .update({ status: newStatus, repair_notes: notes }).eq('id', currentRepairMaskId);

    if (error) { alert("Ошибка обновления: " + error.message); return; }
    alert("Статус успешно обновлен!");
    resetRepairView();
}

function resetRepairView() {
    currentRepairMaskId = null;
    document.getElementById('repair-details-section').classList.add('hidden');
    document.getElementById('repair-scanner-section').classList.remove('hidden');
    document.getElementById('start-scan-btn').classList.remove('hidden');
    if (document.getElementById('qr-reader').innerHTML !== '') {
        document.getElementById('qr-reader').innerHTML = '';
    }
}

// --- Печать этикетки (ИСПРАВЛЕНО: генерируем ссылку для QR) ---
function printLabel(serialNumber) {
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '';
    
    // Формируем ссылку на публичную страницу проверки
    const qrUrl = `${GITHUB_PAGES_URL}?sn=${serialNumber}`;
    
    new QRCode(qrContainer, { text: qrUrl, width: 100, height: 100, correctLevel: QRCode.CorrectLevel.M });
    document.getElementById('serial-text').innerText = serialNumber;
    setTimeout(() => { window.print(); }, 200);
}

window.onload = () => { if (sessionStorage.getItem('isAuth') === 'true') showApp(); };
