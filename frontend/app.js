// --- КОНФИГУРАЦИЯ SUPABASE ---
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // !!! ЗАМЕНИТЕ НА ВАШ URL !!!
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // !!! ЗАМЕНИТЕ НА ВАШ ANON KEY !!!

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let userRole = 'unverified';
let telegramId = '949765279'; // Ваш тестовый ID для входа админом без PIN
let USER_SECTION_ID = null;
let USER_SECTION_NAME = null;

// --- УТИЛИТЫ ---

/**
 * Показывает сообщение в указанном элементе.
 */
function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `alert alert-${type}`;
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

/**
 * Переключает видимость панелей.
 */
function showPanel(panelId) {
    document.querySelectorAll('.panel-section').forEach(panel => {
        panel.style.display = 'none';
    });

    const targetPanel = document.getElementById(panelId);
    if (targetPanel) {
        targetPanel.style.display = 'block';
    }
    
    // Специальная логика для загрузки данных при открытии панелей
    if (panelId === 'admin-panel' || panelId === 'main-panel' || panelId === 'create-request-section') {
        document.getElementById('user-info').style.display = 'flex';
    } else if (panelId === 'add-user-section') {
        loadSectionsForUserSelect(); // Загружаем участки для выбора
    } else if (panelId === 'stats-panel') {
        loadStats('all'); // Загружаем статистику по умолчанию
    } else if (panelId === 'pin-auth-panel') {
        document.getElementById('user-info').style.display = 'none';
    }
}

/**
 * Функция для возврата на главную панель в зависимости от роли.
 */
function goHome() {
    if (userRole === 'admin') {
        showPanel('admin-panel');
    } else if (userRole === 'master' || userRole === 'otk') {
        showPanel('main-panel');
    } else {
        showPanel('pin-auth-panel');
    }
}


// --- ЛОГИКА АВТОРИЗАЦИИ И НАЧАЛА РАБОТЫ ---

async function fetchRoleAndShowPanel() {
    
    const { data, error } = await supabase
        .from('users')
        .select(`role, section_id, sections(name)`)
        .eq('tg_id', telegramId)
        .single();
    
    if (error && error.code !== 'PGRST116') {
        console.error('Supabase Error:', error);
        alert('Ошибка при получении данных пользователя. См. консоль.');
        showPanel('pin-auth-panel');
        return;
    }
    
    const userData = data || { role: 'unverified', section_id: null, sections: { name: 'Не присвоен' } };
    
    userRole = userData.role;
    document.getElementById('role-display').textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
    
    // 1. Проверка верификации
    if (userRole === 'unverified') {
        showPanel('pin-auth-panel'); 
        return;
    }

    // 2. Если пользователь - Администратор
    if (userRole === 'admin') {
        document.getElementById('admin-tg-id-display').textContent = telegramId;
        document.getElementById('section-display').textContent = '—'; // Админу не нужен участок
        showPanel('admin-panel'); 
        return;
    }

    // 3. Если верифицирован (Мастер/ОТК)
    USER_SECTION_ID = userData.section_id || null;
    USER_SECTION_NAME = userData.sections?.name || 'Неизвестно';
    document.getElementById('section-display').textContent = USER_SECTION_NAME;

    showPanel('main-panel'); 
}

// ... (Остальная логика authenticate и addUser) ...
// (Оставлю addUser и authenticate, чтобы не дублировать код, предполагая, что они уже есть)

// --- ЛОГИКА АДМИНИСТРАТОРА: ДОБАВЛЕНИЕ/ОБНОВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ (Включая loadSectionsForUserSelect) ---

async function loadSectionsForUserSelect() {
    const select = document.getElementById('admin-section-select');
    select.innerHTML = '<option value="" disabled selected>Загрузка участков...</option>';

    try {
        const { data: sections, error } = await supabase
            .from('sections')
            .select('id, name');

        if (error) {
            console.error('Error loading sections:', error);
            select.innerHTML = '<option value="" disabled selected>Ошибка загрузки</option>';
            return;
        }

        select.innerHTML = ''; 
        select.innerHTML = '<option value="" disabled selected>Выберите участок</option>';
        sections.forEach(section => {
            const option = document.createElement('option');
            option.value = section.id;
            option.textContent = section.name;
            select.appendChild(option);
        });

    } catch (e) {
        console.error('General Error loading sections:', e);
        select.innerHTML = '<option value="" disabled selected>Ошибка загрузки</option>';
    }
}

async function addUser(event) {
    event.preventDefault();
    const tgId = document.getElementById('admin-tg-id').value.trim();
    const role = document.getElementById('admin-role').value;
    const sectionId = document.getElementById('admin-section-select').value;
    const pin = document.getElementById('admin-pin').value.trim();
    const messageElement = document.getElementById('admin-message');

    if (!tgId || !pin || !role || !sectionId) {
        showMessage(messageElement, 'Заполните все поля.', 'error');
        return;
    }

    try {
        const userData = {
            tg_id: tgId,
            role: role,
            section_id: sectionId,
            pin: pin,
            is_verified: true
        };

        const { error } = await supabase
            .from('users')
            .upsert([userData], { onConflict: 'tg_id' });

        if (error) {
            console.error('Supabase Error:', error);
            showMessage(messageElement, `Ошибка при добавлении/обновлении: ${error.message}`, 'error');
            return;
        }

        showMessage(messageElement, `Пользователь ${tgId} (${role}) успешно добавлен/обновлен. PIN сброшен.`, 'success');
        document.getElementById('add-user-form').reset();

    } catch (e) {
        console.error('General Error:', e);
        showMessage(messageElement, 'Произошла общая ошибка.', 'error');
    }
}


// --- НОВАЯ ЛОГИКА АДМИНИСТРАТОРА: ДОБАВЛЕНИЕ УЧАСТКА ---

async function addSection(event) {
    event.preventDefault();
    const sectionName = document.getElementById('section-name-input').value.trim();
    const messageElement = document.getElementById('add-section-message');

    if (!sectionName) {
        showMessage(messageElement, 'Название участка не может быть пустым.', 'error');
        return;
    }

    try {
        const { error } = await supabase
            .from('sections')
            .insert([
                { name: sectionName }
            ]);

        if (error) {
            console.error('Supabase Error:', error);
            if (error.code === '23505') { // Код ошибки уникальности PostgreSQL
                 showMessage(messageElement, `Участок с именем "${sectionName}" уже существует.`, 'error');
            } else {
                showMessage(messageElement, `Ошибка при добавлении участка: ${error.message}`, 'error');
            }
            return;
        }

        showMessage(messageElement, `Участок "${sectionName}" успешно добавлен!`, 'success');
        document.getElementById('add-section-form').reset();
        
        // Обновляем список участков для формы добавления пользователя
        loadSectionsForUserSelect(); 

    } catch (e) {
        console.error('General Error:', e);
        showMessage(messageElement, 'Произошла общая ошибка.', 'error');
    }
}


// --- НОВАЯ ЛОГИКА АДМИНИСТРАТОРА: СТАТИСТИКА ---

async function loadStats(filter = 'all') {
    const statsContainer = document.getElementById('stats-results');
    statsContainer.innerHTML = 'Загрузка статистики...';

    try {
        let query = supabase
            .from('requests')
            .select('id, status, created_at');

        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        switch (filter) {
            case 'in_progress':
                // В работе: 'in_progress' (Мастер), 'otk_check' (На проверке ОТК)
                query = query.in('status', ['in_progress', 'otk_check']);
                break;
            case 'accepted_today':
                // Принято сегодня: статус 'accepted' И дата создания >= начало сегодняшнего дня
                query = query.eq('status', 'accepted').gte('created_at', today);
                break;
            case 'all':
            default:
                break;
        }
        
        query = query.order('created_at', { ascending: false });

        const { data: requests, error } = await query;

        if (error) {
            console.error('Supabase Error:', error);
            statsContainer.innerHTML = `Ошибка загрузки: ${error.message}`;
            return;
        }

        displayStats(requests, filter);

    } catch (e) {
        console.error('General Error:', e);
        statsContainer.innerHTML = 'Произошла общая ошибка при загрузке данных.';
    }
}

function displayStats(requests, filter) {
    const statsContainer = document.getElementById('stats-results');
    
    const statusCounts = requests.reduce((acc, req) => {
        acc[req.status] = (acc[req.status] || 0) + 1;
        return acc;
    }, {});
    
    const statusNames = {
        'new': 'Новая (не обработана)',
        'in_progress': 'В работе (Мастер)',
        'otk_check': 'На проверке (ОТК)',
        'accepted': 'Принято',
        'rejected': 'Отклонено'
    };
    
    let title;
    switch (filter) {
        case 'in_progress':
            title = 'Заявки в работе и на проверке';
            break;
        case 'accepted_today':
            title = 'Заявки, принятые сегодня';
            break;
        case 'all':
        default:
            title = 'Общая статистика по всем заявкам';
            break;
    }

    let statsHtml = `
        <div class="stats-summary">
            <h3>${title}</h3>
            <p>Всего заявок (по фильтру): <strong>${requests.length}</strong></p>
        </div>
        <hr>
        <h3>Детализация по статусам:</h3>
        <ul class="stats-list">
    `;
    
    Object.keys(statusNames).forEach(statusKey => {
         statsHtml += `
             <li>
                 <span class="status-label status-${statusKey}">${statusNames[statusKey]}</span>: 
                 <strong>${statusCounts[statusKey] || 0}</strong>
             </li>
         `;
    });
    
    statsHtml += `</ul>`;

    statsContainer.innerHTML = statsHtml;
}

// --- ИНИЦИАЛИЗАЦИЯ ---

function initApp() {
    // 1. Привязка обработчиков форм
    // document.getElementById('pin-form').addEventListener('submit', authenticate); // Предполагается, что эта функция уже есть
    document.getElementById('add-user-form').addEventListener('submit', addUser);
    document.getElementById('add-section-form').addEventListener('submit', addSection);
    // document.getElementById('request-form').addEventListener('submit', createRequest); // Логика создания заявки будет позже

    // 2. Инициализация (проверка TG ID)
    if (telegramId) {
        fetchRoleAndShowPanel();
    } else {
        showPanel('pin-auth-panel');
    }
}

function logout() {
    userRole = 'unverified';
    telegramId = ''; 
    USER_SECTION_ID = null;
    USER_SECTION_NAME = null;
    document.getElementById('role-display').textContent = '';
    document.getElementById('section-display').textContent = '';
    showPanel('pin-auth-panel');
}

// Функции-заглушки (если они не были предоставлены ранее)
async function authenticate(event) {
    event.preventDefault();
    // Логика аутентификации по PIN
    alert('Логика аутентификации по PIN пока не реализована.');
    // Временно для теста: если пин 1111, то fetchRoleAndShowPanel();
    // fetchRoleAndShowPanel(); 
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', initApp);