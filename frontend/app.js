// ==============================================================================
// 1. SUPABASE CONFIGURATION
// ==============================================================================
// !!! ВСТАВЬТЕ СЮДА ВАШИ РЕАЛЬНЫЕ КЛЮЧИ SUPABASE !!!
const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

// Корректная инициализация клиента Supabase с использованием деструктуризации
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ==============================================================================
// 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==============================================================================
let userRole = 'unverified';
let telegramId = null; 
let USER_SECTION_ID = null;
let USER_SECTION_NAME = null;
let USERS = []; 
let SECTIONS = []; 


// ==============================================================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==============================================================================

function showMessage(element, message, type) {
    element.textContent = message;
    element.className = type === 'success' ? 'alert alert-success' : 'alert alert-error';
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

function showPanel(panelId) {
    document.querySelectorAll('.panel-section').forEach(panel => {
        panel.style.display = 'none';
    });
    const panelToShow = document.getElementById(panelId);
    if (panelToShow) {
        panelToShow.style.display = 'block';
    } else {
        console.error('Panel not found:', panelId);
    }
    
    // Специальная логика для загрузки данных и настройки интерфейса
    if (panelId === 'admin-panel') {
        loadAdminData();
        const titleDisplay = document.getElementById('admin-title-display');
        if (titleDisplay) {
            titleDisplay.textContent = (userRole === 'super_admin') ? '👑 Панель Супер Администратора' : '👑 Панель Администратора';
        }
    } else if (panelId === 'add-user-section') {
        const superAdminOption = document.querySelector('#user-role option[value="super_admin"]');
        if (superAdminOption) {
            superAdminOption.style.display = (userRole === 'super_admin') ? 'block' : 'none';
        }
        loadSections(); 
    } else if (panelId === 'stats-panel') {
        loadStats('all'); 
    }
}

function goHome() {
    if (userRole === 'admin' || userRole === 'super_admin') {
        showPanel('admin-panel');
    } else if (userRole === 'master' || userRole === 'otk') {
        showPanel('main-panel');
    } else {
        showPanel('pin-auth-panel');
    }
}

function logout() {
    userRole = 'unverified';
    telegramId = null;
    showPanel('pin-auth-panel');
}

function generatePin() {
    return Math.floor(1000 + Math.random() * 9000).toString(); // 4-значный PIN
}


// ==============================================================================
// 4. ЛОГИКА АВТОРИЗАЦИИ И НАЧАЛА РАБОТЫ
// ==============================================================================

async function fetchRoleAndShowPanel() {
    
    const tgUser = window.Telegram.WebApp ? window.Telegram.WebApp.initDataUnsafe.user : null;
    
    // Если WebApp не дает ID, используем плейсхолдер
    telegramId = tgUser ? tgUser.id.toString() : '999999999'; 
    
    const adminTgIdDisplay = document.getElementById('admin-tg-id-display');
    if (adminTgIdDisplay) {
        adminTgIdDisplay.textContent = telegramId;
    }
    
    // 1. Поиск пользователя по Telegram ID (Используем telegram_id)
    const { data, error } = await supabaseClient
        .from('users')
        .select(`role, is_verified, section_id, sections(name)`)
        .eq('telegram_id', telegramId) 
        .single();
    
    // 2. Проверка: Пользователь не найден или не верифицирован
    if (error || !data || !data.is_verified) {
        showPanel('pin-auth-panel');
        return;
    }
    
    userRole = data.role;
    const roleDisplay = document.getElementById('role-display');
    if (roleDisplay) {
        roleDisplay.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
    }

    // 3. Администратор ИЛИ Супер Администратор: на Admin Dashboard
    if (userRole === 'admin' || userRole === 'super_admin') {
        const sectionDisplay = document.getElementById('section-display');
        if (sectionDisplay) {
             sectionDisplay.textContent = 'Администрация'; 
        }
        showPanel('admin-panel'); 
        return;
    }

    // 4. Верифицированный пользователь (Мастер/ОТК)
    USER_SECTION_ID = data.section_id || null;
    USER_SECTION_NAME = data.sections?.name || 'Неизвестно';
    const sectionDisplay = document.getElementById('section-display');
    if (sectionDisplay) {
        sectionDisplay.textContent = USER_SECTION_NAME;
    }
    
    showPanel('main-panel'); 
}

async function authenticate(event) {
    event.preventDefault();
    const pin = document.getElementById('pin-input').value;
    const messageElement = document.getElementById('pin-message');

    const tgUser = window.Telegram.WebApp ? window.Telegram.WebApp.initDataUnsafe.user : null;
    const currentTelegramId = tgUser ? tgUser.id.toString() : null;
    
    if (!currentTelegramId) {
        showMessage(messageElement, '⚠️ Невозможно получить ваш Telegram ID. Убедитесь, что приложение запущено в среде Telegram WebApp.', 'error');
        return;
    }
    
    // 1. Находим не верифицированного пользователя по PIN (Используем pin)
    const { data: userToVerify, error: pinError } = await supabaseClient
        .from('users')
        .select('id, telegram_id, role')
        .eq('pin', pin) 
        .is('telegram_id', null) 
        .eq('is_verified', false) 
        .single();
    
    if (pinError || !userToVerify) {
        showMessage(messageElement, 'Неверный PIN-код или пользователь уже верифицирован.', 'error');
        return;
    }

    // 2. Если PIN найден, обновляем запись
    const { error: updateError } = await supabaseClient
        .from('users')
        .update({ 
            telegram_id: currentTelegramId, 
            pin: null, 
            is_verified: true
        })
        .eq('id', userToVerify.id)
        .select(); 

    if (updateError) {
        console.error('Update Error:', updateError);
        showMessage(messageElement, 'Ошибка обновления статуса верификации. Проверьте права RLS.', 'error');
        return;
    }

    document.getElementById('pin-input').value = '';
    showMessage(messageElement, 'Успешная верификация! Добро пожаловать.', 'success');
    
    fetchRoleAndShowPanel();
}


// ==============================================================================
// 5. АДМИН-ПАНЕЛЬ: ЛОГИКА УПРАВЛЕНИЯ
// ==============================================================================

async function loadAdminData() {
    await Promise.all([loadUsers(), loadSections()]);
}

async function loadUsers() {
    const { data, error } = await supabaseClient
        .from('users')
        .select(`id, role, telegram_id, pin, is_verified, sections(name)`) 
        .order('id', { ascending: true });

    if (error) {
        console.error('Error loading users:', error);
        return;
    }
    
    USERS = data;
    renderUsersTable(data);
}

function renderUsersTable(users) {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = ''; 

    users.forEach(user => {
        const row = tableBody.insertRow();
        row.insertCell().textContent = user.id;
        row.insertCell().textContent = user.role;
        row.insertCell().textContent = user.telegram_id || '—';
        row.insertCell().textContent = user.pin || '—';
        row.insertCell().textContent = user.sections ? user.sections.name : '—';
        
        const actionCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Удалить';
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.onclick = () => deleteUser(user.id);
        actionCell.appendChild(deleteBtn);
    });
}

async function loadSections() {
    const { data, error } = await supabaseClient
        .from('sections')
        .select(`*`)
        .order('id', { ascending: true });

    if (error) {
        console.error('Error loading sections:', error);
        return;
    }
    
    SECTIONS = data;
    renderSectionsTable(data);
    populateSectionSelect(data);
}

function renderSectionsTable(sections) {
    const tableBody = document.getElementById('sections-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = ''; 

    sections.forEach(section => {
        const row = tableBody.insertRow();
        row.insertCell().textContent = section.id;
        row.insertCell().textContent = section.name;
        
        const actionCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Удалить';
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.onclick = () => deleteSection(section.id);
        actionCell.appendChild(deleteBtn);
    });
}

function populateSectionSelect(sections) {
    const selectElements = document.querySelectorAll('.section-select');
    selectElements.forEach(select => {
        select.innerHTML = '<option value="">Не выбрано</option>';
        sections.forEach(section => {
            const option = document.createElement('option');
            option.value = section.id;
            option.textContent = section.name;
            select.appendChild(option);
        });
    });
}

async function loadStats(filter = 'all') {
    const statsContainer = document.getElementById('stats-results');
    statsContainer.innerHTML = 'Загрузка статистики...';
    
    statsContainer.innerHTML = `
        <h3>Результаты статистики</h3>
        <p>Фильтр: <strong>${filter}</strong></p>
        <p>Функция загрузки статистики требует реализации запросов к таблице 'requests'.</p>
    `;
}

async function addUser(event) {
    event.preventDefault();
    const role = document.getElementById('user-role').value;
    const sectionId = document.getElementById('user-section').value || null;
    const messageElement = document.getElementById('add-user-message');
    
    if ((role === 'admin' || role === 'super_admin') && userRole !== 'super_admin') {
         showMessage(messageElement, '🛑 Только Супер Администратор может назначать Администраторов и Супер Администраторов.', 'error');
         return;
    }
    
    if ((role === 'admin' || role === 'super_admin') && sectionId) {
         showMessage(messageElement, '🛑 Администратору и Супер Администратору нельзя назначать участок.', 'error');
         return;
    }

    const pin = generatePin();

    const { error } = await supabaseClient
        .from('users')
        .insert([{ 
            role: role, 
            section_id: sectionId,
            pin: pin,
            is_verified: false,
            telegram_id: null 
        }]);

    if (error) {
        console.error('Error adding user:', error);
        showMessage(messageElement, `🛑 Ошибка добавления: ${error.message}`, 'error');
    } else {
        showMessage(messageElement, `✅ Пользователь (${role}) добавлен. PIN: ${pin}.`, 'success');
        document.getElementById('add-user-form').reset();
        loadUsers(); 
    }
}

async function addSection(event) {
    event.preventDefault();
    const sectionName = document.getElementById('section-name-input').value.trim();
    const messageElement = document.getElementById('add-section-message');
    
    if (!sectionName) {
        showMessage(messageElement, 'Название участка не может быть пустым.', 'error');
        return;
    }

    const { error } = await supabaseClient
        .from('sections')
        .insert([{ name: sectionName }]);

    if (error) {
        console.error('Error adding section:', error);
        showMessage(messageElement, `Ошибка добавления: ${error.message}`, 'error');
    } else {
        showMessage(messageElement, 'Участок добавлен.', 'success');
        document.getElementById('add-section-form').reset();
        loadSections(); 
    }
}

async function deleteUser(userId) {
    if (!confirm(`Вы уверены, что хотите удалить пользователя с ID ${userId}?`)) return;

    const { error } = await supabaseClient
        .from('users')
        .delete()
        .eq('id', userId);

    if (error) {
        console.error('Error deleting user:', error);
        alert(`Ошибка удаления: ${error.message}`);
    } else {
        loadUsers(); 
    }
}

async function deleteSection(sectionId) {
    if (!confirm(`Вы уверены, что хотите удалить участок с ID ${sectionId}? Все связанные пользователи потеряют привязку.`)) return;

    const { error } = await supabaseClient
        .from('sections')
        .delete()
        .eq('id', sectionId);

    if (error) {
        console.error('Error deleting section:', error);
        alert(`Ошибка удаления: ${error.message}`);
    } else {
        loadSections(); 
        loadUsers(); 
    }
}

// ==============================================================================
// 6. ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ
// ==============================================================================

function initApp() {
    // 1. Привязка обработчиков форм
    const forms = [
        { id: 'pin-form', handler: authenticate },
        { id: 'add-user-form', handler: addUser },
        { id: 'add-section-form', handler: addSection },
    ];

    forms.forEach(f => {
        const element = document.getElementById(f.id);
        if (element) {
            element.addEventListener('submit', f.handler); 
        } else {
            console.error(`Error: Form with ID "${f.id}" not found. Check index.html`);
        }
    });

    // 2. Инициализация Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
    }
    
    // 3. Запуск проверки роли
    fetchRoleAndShowPanel(); 
}

document.addEventListener('DOMContentLoaded', initApp);