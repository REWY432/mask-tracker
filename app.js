// ============================================
// MaskOS — Manufacturing Execution System
// App Logic v2
// ============================================

// --- Supabase Config ---
const SUPABASE_URL = 'https://ckwvyouciszfaigvowfv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrd3Z5b3VjaXN6ZmFpZ3Zvd2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTU3MjgsImV4cCI6MjA5NzQzMTcyOH0.EVIxNi4TdUOKqGqZKViJpSq4RCrnj6BwWjawdDQyyNE';
const ACCESS_CODE = '1234';
const GITHUB_PAGES_URL = 'https://rewy432.github.io/mask-tracker/verify.html';

let supabaseClient;
let html5QrCode;
let currentRepairMaskId = null;

// ============================================
// THEME TOGGLE
// ============================================
function initTheme() {
    const saved = localStorage.getItem('maskos-theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    }
    updateThemeIcon();
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('maskos-theme', next);
    updateThemeIcon();
}

function updateThemeIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.getElementById('theme-icon-sun').style.display = isDark ? 'none' : '';
    document.getElementById('theme-icon-moon').style.display = isDark ? '' : 'none';
}

// ============================================
// TOAST SYSTEM
// ============================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
        success: `<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        error: `<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        warning: `<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    };
    
    toast.innerHTML = `${icons[type] || ''}<span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ============================================
// AUTH
// ============================================
function checkAuth() {
    const input = document.getElementById('auth-code');
    const error = document.getElementById('auth-error');
    
    if (input.value === ACCESS_CODE) {
        sessionStorage.setItem('isAuth', 'true');
        showApp();
    } else {
        error.style.display = 'block';
        error.textContent = 'Неверный код доступа';
        input.value = '';
        input.focus();
        input.style.animation = 'none';
        input.offsetHeight;
        input.style.animation = 'shake 0.4s ease';
    }
}

function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').classList.remove('hidden');
    initSupabase();
}

// Enter key on auth screen
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !document.getElementById('main-app').classList.contains('hidden') === false) {
        const authScreen = document.getElementById('auth-screen');
        if (authScreen && authScreen.style.display !== 'none') {
            checkAuth();
        }
    }
});

// ============================================
// SHAKE ANIMATION
// ============================================
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-8px); }
        40% { transform: translateX(8px); }
        60% { transform: translateX(-5px); }
        80% { transform: translateX(5px); }
    }
`;
document.head.appendChild(styleSheet);

// ============================================
// NAVIGATION
// ============================================
function switchView(view) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    const views = {
        dashboard: { tab: 'tab-dashboard', el: 'view-dashboard' },
        repairs: { tab: 'tab-repairs', el: 'view-repairs' },
    };
    
    const target = views[view];
    if (!target) return;
    
    document.getElementById(target.tab).classList.add('active');
    
    Object.values(views).forEach(v => {
        const el = document.getElementById(v.el);
        if (v.el === target.el) {
            el.classList.remove('hidden');
            el.classList.add('fade-in');
        } else {
            el.classList.add('hidden');
        }
    });
}

// ============================================
// SUPABASE INIT
// ============================================
function initSupabase() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    loadDashboardData();
    
    // Form submit
    document.getElementById('mask-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-btn');
        const submitText = document.getElementById('submit-text');
        const originalText = submitText.textContent;
        
        submitText.textContent = 'Сохранение...';
        submitBtn.disabled = true;
        
        const generation = document.getElementById('generation').value.trim();
        const lining = document.getElementById('lining').value.trim();
        
        if (!generation) {
            showToast('Укажите поколение маски', 'error');
            submitText.textContent = originalText;
            submitBtn.disabled = false;
            return;
        }

        try {
            const { data, error } = await supabaseClient.from('masks').insert([{
                model_code: document.getElementById('model').value,
                size: document.getElementById('size').value,
                generation: generation,
                lining: lining || 'InPo',
            }]).select();

            if (error) throw error;

            if (data && data.length > 0) {
                const serial = data[0].serial_number;
                const msgDiv = document.getElementById('message');
                msgDiv.style.display = 'block';
                msgDiv.innerHTML = `✓ Успешно! Маска: <strong>${serial}</strong>`;
                
                showToast(`Маска ${serial} зарегистрирована`, 'success');
                printLabel(serial);
                loadDashboardData();
                document.getElementById('mask-form').reset();
                document.getElementById('lining').value = 'InPo';
                
                setTimeout(() => { msgDiv.style.display = 'none'; }, 5000);
            }
        } catch (err) {
            showToast(`Ошибка: ${err.message || err}`, 'error');
            console.error('Submit error:', err);
        }
        
        submitText.textContent = originalText;
        submitBtn.disabled = false;
    });

    // Search
    document.getElementById('search-input').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#masks-tbody tr:not(.skeleton-row)').forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
        });
    });
}

// ============================================
// DASHBOARD DATA
// ============================================
async function loadDashboardData() {
    try {
        const [totalRes, foilRes, epeeRes, sabreRes, masksRes] = await Promise.all([
            supabaseClient.from('masks').select('*', { count: 'exact', head: true }),
            supabaseClient.from('masks').select('*', { count: 'exact', head: true }).eq('model_code', 'f'),
            supabaseClient.from('masks').select('*', { count: 'exact', head: true }).eq('model_code', 'e'),
            supabaseClient.from('masks').select('*', { count: 'exact', head: true }).eq('model_code', 's'),
            supabaseClient.from('masks').select('*').order('id', { ascending: false }).limit(50),
        ]);

        // Animate counters
        animateCounter('stat-total', totalRes.count || 0);
        animateCounter('stat-foil', foilRes.count || 0);
        animateCounter('stat-epee', epeeRes.count || 0);
        animateCounter('stat-sabre', sabreRes.count || 0);

        // Table
        const tbody = document.getElementById('masks-tbody');
        const modelMap = { 'f': 'Foil', 'e': 'Epee', 's': 'Sabre', 'c': 'Trainer' };
        const statusClass = { 'На складе': 'active', 'В ремонте': 'repair' };

        tbody.innerHTML = '';
        
        if (!masksRes.data || masksRes.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--color-text-muted)">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;opacity:0.4"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                <p style="font-weight:500">Нет зарегистрированных масок</p>
                <p style="font-size:0.8125rem;margin-top:4px">Создайте первую маску через форму слева</p>
            </td></tr>`;
            return;
        }

        masksRes.data.forEach(mask => {
            const dateObj = new Date(mask.created_at);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><span style="color:var(--color-text-muted);font-weight:500">#${mask.id}</span></td>
                <td class="sn-code">${mask.serial_number}</td>
                <td><span style="font-weight:600">${modelMap[mask.model_code] || mask.model_code}</span></td>
                <td>${mask.size} / ${mask.lining || '—'}</td>
                <td style="color:var(--color-text-secondary)">${String(dateObj.getDate()).padStart(2,'0')}.${String(dateObj.getMonth()+1).padStart(2,'0')}.${dateObj.getFullYear()}</td>
                <td><span class="status-badge ${statusClass[mask.status] || ''}">${mask.status || 'На складе'}</span></td>
            `;
            tbody.appendChild(row);
        });

    } catch (err) {
        console.error('Dashboard load error:', err);
        showToast('Ошибка загрузки данных', 'error');
    }
}

// ============================================
// ANIMATED COUNTER
// ============================================
function animateCounter(elementId, targetValue) {
    const el = document.getElementById(elementId);
    const start = parseInt(el.textContent) || 0;
    const duration = 600;
    const startTime = performance.now();
    
    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (targetValue - start) * eased);
        el.textContent = current;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// ============================================
// QR SCANNER (Repairs)
// ============================================
function startScanner() {
    const btn = document.getElementById('start-scan-btn');
    btn.classList.add('hidden');
    
    html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
            const sn = decodedText.split('sn=')[1] || decodedText;
            html5QrCode.stop().then(() => {
                findMaskForRepair(sn.trim());
            });
        },
        () => {}
    ).catch(err => {
        showToast('Ошибка камеры: ' + err, 'error');
        btn.classList.remove('hidden');
    });
}

async function findMaskForRepair(sn) {
    try {
        const { data, error } = await supabaseClient.from('masks')
            .select('*').eq('serial_number', sn).single();

        if (error || !data) {
            showToast(`Маска ${sn} не найдена в базе`, 'error');
            resetRepairView();
            return;
        }

        currentRepairMaskId = data.id;
        const modelMap = { 'f': 'Foil', 'e': 'Epee', 's': 'Sabre', 'c': 'Trainer' };
        const dateObj = new Date(data.created_at);
        const dateStr = `${String(dateObj.getDate()).padStart(2,'0')}.${String(dateObj.getMonth()+1).padStart(2,'0')}.${dateObj.getFullYear()}`;

        document.getElementById('repair-scanner-section').classList.add('hidden');
        document.getElementById('repair-details-section').classList.remove('hidden');
        document.getElementById('repair-details-section').classList.add('fade-in');

        document.getElementById('repair-info-box').innerHTML = `
            <div class="repair-info-item"><span class="repair-info-label">Серийный номер</span><span class="repair-info-value sn-code">${data.serial_number}</span></div>
            <div class="repair-info-item"><span class="repair-info-label">Статус</span><span class="repair-info-value">${data.status || 'На складе'}</span></div>
            <div class="repair-info-item"><span class="repair-info-label">Модель</span><span class="repair-info-value">${modelMap[data.model_code] || data.model_code}</span></div>
            <div class="repair-info-item"><span class="repair-info-label">Размер</span><span class="repair-info-value">${data.size}</span></div>
            <div class="repair-info-item"><span class="repair-info-label">Подкладка</span><span class="repair-info-value">${data.lining || '—'}</span></div>
            <div class="repair-info-item"><span class="repair-info-label">Дата выпуска</span><span class="repair-info-value">${dateStr}</span></div>
        `;
        document.getElementById('repair-notes').value = data.repair_notes || '';

    } catch (err) {
        showToast('Ошибка поиска: ' + err.message, 'error');
        resetRepairView();
    }
}

async function updateMaskStatus(newStatus) {
    if (!currentRepairMaskId) return;

    const notes = document.getElementById('repair-notes').value;
    const btn = document.activeElement;
    const originalText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Обновление...'; }

    try {
        const { error } = await supabaseClient.from('masks')
            .update({ status: newStatus, repair_notes: notes }).eq('id', currentRepairMaskId);

        if (error) throw error;
        
        showToast(`Статус обновлён: «${newStatus}»`, 'success');
        resetRepairView();
    } catch (err) {
        showToast('Ошибка обновления: ' + err.message, 'error');
    }
    
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
}

function resetRepairView() {
    currentRepairMaskId = null;
    document.getElementById('repair-details-section').classList.add('hidden');
    document.getElementById('repair-scanner-section').classList.remove('hidden');
    document.getElementById('start-scan-btn').classList.remove('hidden');
    if (document.getElementById('qr-reader').innerHTML !== '') {
        document.getElementById('qr-reader').innerHTML = '';
    }
    if (html5QrCode) {
        try { html5QrCode.stop(); } catch(e) {}
        html5QrCode = null;
    }
}

// ============================================
// PRINT LABEL
// ============================================
function printLabel(serialNumber) {
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '';

    const qrUrl = `${GITHUB_PAGES_URL}?sn=${serialNumber}`;

    new QRCode(qrContainer, {
        text: qrUrl,
        width: 120,
        height: 120,
        correctLevel: QRCode.CorrectLevel.M,
    });

    document.getElementById('serial-text').textContent = serialNumber;
    
    setTimeout(() => {
        window.print();
    }, 300);
}

// ============================================
// INIT
// ============================================
window.onload = () => {
    initTheme();
    if (sessionStorage.getItem('isAuth') === 'true') {
        showApp();
    } else {
        document.getElementById('auth-code').focus();
    }
};
