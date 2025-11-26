// ==============================================================================
// 1. SUPABASE CONFIGURATION
// ==============================================================================
// !!! ВСТАВЬТЕ СЮДА ВАШИ РЕАЛЬНЫЕ КЛЮЧИ SUPABASE !!!
const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

// Корректная инициализация клиента Supabase
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
    
    // АБСОЛЮТНЫЙ ПЛЕЙСХОЛДЕР ДЛЯ ТЕСТА: используйте ID, который НЕ верифицирован, но имеет PIN.
    // Если WebApp не дает ID, то currentTelegramId будет '999999999'
    telegramId = tgUser ? tgUser.id.toString() : '999999999'; 
    
    const adminTgIdDisplay = document.getElementById('admin-tg-id-display');
    if (adminTgIdDisplay) {
        adminTgIdDisplay.textContent = telegramId;
    }
    
    // 1. Поиск пользователя по Telegram ID
    const { data, error } = await supabaseClient
        .from('users')
        .select(`role, is_verified, section_id, sections(name)`)
        .eq('telegram_id', telegramId) 
        .single();
    
    // 2. Проверка: Пользователь не найден или не верифицирован
    if (error || !data || !data.is_verified) {
        // Здесь мы показываем PIN-форму, даже если TG ID не определен или не верифицирован
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
        // Если нет ID от Telegram, мы не можем завершить верификацию.
        // Это может быть причиной, по которой вы не видите реакции.
        showMessage(messageElement, '⚠️ Невозможно получить ваш Telegram ID. Убедитесь, что приложение запущено в среде Telegram WebApp.', 'error');
        return;
    }
    
    // 1. Находим не верифицированного пользователя по PIN
    const { data: userToVerify, error: pinError } = await supabaseClient
        .from('users')
        .select('id, telegram_id, role')
        .eq('pin', pin) 
        .is('telegram_id', null) // Должен быть NULL, если не верифицирован
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
        .select(); // Добавим .select(), чтобы быть уверенными в результате

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
// (Остальной код функций loadAdminData, loadUsers, addUser и т.д. остается неизменным)
// ...
// ...


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