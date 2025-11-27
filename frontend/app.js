// ==============================================================================
// 1. SUPABASE CONFIGURATION
// ==============================================================================
// ВСТАВЛЕНЫ ВАШИ КЛЮЧИ SUPABASE
const SUPABASE_URL = 'https://cdgxacxsoayvjvrhivkz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkZ3hhY3hzb2F5dmp2cmhpdmt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwMTAxOTcsImV4cCI6MjA3OTU4NjE5N30.25Tji73vgXQVbIsfuEjko9DN6Sx64_MaUW9LWZmBpAk';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ==============================================================================
// 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==============================================================================
let userRole = 'unverified';
let telegramId = null; 
let USER_SECTION_ID = null;
let USER_SECTION_NAME = null;
let USERS = []; // Локальный кэш пользователей
let SECTIONS = []; // Локальный кэш участков
let currentPanel = 'pin-auth-panel'; // Отслеживание текущей панели


// ==============================================================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==============================================================================

function showMessage(element, message, type) {
    if (!element) return;
    element.textContent = message;
    element.className = `alert alert-${type}`;
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

function showPanel(panelId) {
    // Скрытие всех панелей
    document.querySelectorAll('.panel-section').forEach(panel => {
        panel.style.display = 'none';
    });
    
    // Отображение нужной панели
    const panelToShow = document.getElementById(panelId);
    if (panelToShow) {
        panelToShow.style.display = 'block';
        currentPanel = panelId;
    } else {
        console.error('Panel not found:', panelId);
    }
    
    // Управление фиксированной кнопкой "Назад"
    const backButton = document.getElementById('fixed-back-button');
    if (panelId === 'admin-panel' || panelId === 'pin-auth-panel' || panelId === 'main-panel') {
        backButton.style.display = 'none';
    } else if (userRole === 'admin' || userRole === 'super_admin') {
        backButton.style.display = 'block';
    } else {
        backButton.style.display = 'none';
    }

    // Загрузка данных для специальных панелей
    if (panelId === 'admin-panel') {
        loadAdminData();
        const titleDisplay = document.getElementById('admin-title-display');
        if (titleDisplay) {
            titleDisplay.textContent = (userRole === 'super_admin') ? '👑 Панель Супер Администратора' : '👑 Панель Администратора';
        }
    } else if (panelId === 'add-user-section') {
        // Скрываем опцию супер админа, если текущий пользователь не суперадмин
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


// ==============================================================================
// 4. ЛОГИКА АВТОРИЗАЦИИ И НАЧАЛА РАБОТЫ
// ==============================================================================

async function fetchRoleAndShowPanel() {
    
    const tgUser = window.Telegram.WebApp ? window.Telegram.WebApp.initDataUnsafe.user : null;
    // Используем ID 999999999, если находимся вне WebApp для целей тестирования админки
    telegramId = tgUser ? tgUser.id.toString() : '999999999'; 
    
    const adminTgIdDisplay = document.getElementById('admin-tg-id-display');
    if (adminTgIdDisplay) {
        adminTgIdDisplay.textContent = telegramId;
    }
    
    // Запрос на поиск верифицированного пользователя по telegram_id
    const { data, error } = await supabaseClient
        .from('users')
        .select(`role, is_verified, section_id, sections(name)`)
        .eq('telegram_id', telegramId) 
        .eq('is_verified', true)
        .single();
    
    if (error || !data) {
        // Пользователь не верифицирован или не найден
        showPanel('pin-auth-panel');
        return;
    }
    
    // Успешная авторизация
    userRole = data.role;
    document.getElementById('role-display').textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);

    if (userRole === 'admin' || userRole === 'super_admin') {
        document.getElementById('section-display').textContent = 'Администрация'; 
        showPanel('admin-panel'); 
        return;
    }

    // Если это Мастер/ОТК
    USER_SECTION_ID = data.section_id || null;
    USER_SECTION_NAME = data.sections?.name || 'Неизвестно';
    document.getElementById('section-display').textContent = USER_SECTION_NAME;
    
    showPanel('main-panel'); 
}

async function authenticate(event) {
    event.preventDefault();
    const pin = document.getElementById('pin-input').value;
    const messageElement = document.getElementById('pin-message');

    const tgUser = window.Telegram.WebApp ? window.Telegram.WebApp.initDataUnsafe.user : null;
    const currentTelegramId = tgUser ? tgUser.id.toString() : null;
    
    if (!currentTelegramId) {
        // В случае отсутствия TG ID, используем тестовый, если его нет
        showMessage(messageElement, '⚠️ Невозможно получить ваш Telegram ID. Используйте WebApp.', 'error');
        return;
    }
    
    // Шаг 1: Проверяем, существует ли уже верифицированный пользователь с этим TG ID.
    const { data: existingUser } = await supabaseClient
        .from('users')
        .select(`id, role, is_verified`)
        .eq('telegram_id', currentTelegramId)
        .eq('is_verified', true) 
        .single();

    if (existingUser) {
        document.getElementById('pin-input').value = '';
        showMessage(messageElement, 'Вы уже авторизованы. Выполняется переход...', 'success');
        fetchRoleAndShowPanel();
        return; 
    }
    
    // Шаг 2: Ищем неверифицированного пользователя по PIN для ПЕРВИЧНОЙ привязки
    // КРИТИЧЕСКИЙ FIX: Ищем только по PIN и статусу is_verified = false. 
    // Это позволяет найти пользователей, созданных с уникальным temp_... ID.
    const { data: userToVerify, error: pinError } = await supabaseClient
        .from('users')
        .select('id, telegram_id, role')
        .eq('pin', pin) 
        .eq('is_verified', false) 
        .single();
    
    if (pinError || !userToVerify) {
        showMessage(messageElement, 'Неверный PIN-код или пользователь уже верифицирован.', 'error');
        return;
    }

    // Шаг 3: Верификация 
    const { error: updateError } = await supabaseClient
        .from('users')
        .update({ 
            telegram_id: currentTelegramId, 
            pin: null, // Удаляем PIN после первого входа
            is_verified: true
        })
        .eq('id', userToVerify.id)
        .select(); 

    if (updateError) {
        console.error('Update Error:', updateError);
        showMessage(messageElement, 'Ошибка обновления статуса верификации.', 'error');
        return;
    }

    document.getElementById('pin-input').value = '';
    showMessage(messageElement, 'Успешная верификация! Добро пожаловать.', 'success');
    
    fetchRoleAndShowPanel();
}


// ==============================================================================
// 5. ЛОГИКА АДМИН-ПАНЕЛИ (CRUD)
// ==============================================================================

async function loadAdminData() {
    // Загружаем данные одновременно
    await Promise.all([loadUsers(), loadSections()]);
}

async function loadUsers() {
    const { data, error } = await supabaseClient
        .from('users')
        .select(`id, role, telegram_id, pin, is_verified, section_id, sections(name)`) 
        .order('id', { ascending: true });

    if (error) {
        console.error('Error loading users:', error);
        return;
    }
    
    USERS = data; // Кэшируем пользователей
    renderUsersCards(data); 
}

function renderUsersCards(users) {
    const cardList = document.getElementById('users-card-list');
    if (!cardList) return;
    cardList.innerHTML = ''; 

    users.forEach(user => {
        const statusText = user.is_verified ? 'Верифицирован' : 'Ожидает PIN';
        const card = document.createElement('div');
        card.className = 'entity-card';
        card.setAttribute('data-role', user.role); 
        
        card.innerHTML = `
            <div class="entity-info">
                <strong>${user.sections ? user.sections.name : 'Администрация / Без участка'} - ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}</strong>
                <span class="subtle-info">Статус: ${statusText}</span>
                <span class="subtle-info">PIN: ${user.pin || '—'} | TG ID: ${user.telegram_id || '—'}</span>
            </div>
            <div class="entity-actions">
                <!-- Используем data-id для надежной передачи ID -->
                <button type="button" class="btn btn-danger btn-sm delete-user-btn" data-id="${user.id}">Удалить</button>
            </div>
        `;
        cardList.appendChild(card);
    });
}

async function loadSections() {
    const { data, error } = await supabaseClient
        .from('sections')
        .select(`
            *, 
            users ( id, role, pin, is_verified )
        `)
        .order('id', { ascending: true });

    if (error) {
        console.error('Error loading sections:', error);
        return;
    }
    
    SECTIONS = data; // Кэшируем участки
    renderSectionsCards(data); 
    populateSectionSelect(data);
}

function renderSectionsCards(sections) {
    const cardList = document.getElementById('sections-card-list');
    if (!cardList) return;
    cardList.innerHTML = ''; 

    sections.forEach(section => {
        // Находим текущего мастера для этого участка
        const master = USERS.find(u => u.role === 'master' && u.section_id === section.id);
        
        let masterInfo;
        if (master) {
            masterInfo = master.is_verified 
                ? `Мастер: Привязан (TG ID ${master.telegram_id})`
                : `Мастер: Ожидает верификации (PIN ${master.pin})`;
        } else {
            masterInfo = 'Мастер не назначен (Управляет Админ)';
        }
        
        const card = document.createElement('div');
        card.className = 'entity-card';
        card.style.borderLeftColor = master ? '#f0ad4e' : '#6c757d'; // Оранжевый, если есть мастер, серый если нет
        card.innerHTML = `
            <div class="entity-info">
                <strong>🏢 ${section.name}</strong>
                <span class="subtle-info">${masterInfo}</span>
            </div>
            <div class="entity-actions">
                <button type="button" class="btn btn-secondary btn-sm edit-section-btn" data-id="${section.id}">Редактировать</button>
                <button type="button" class="btn btn-danger btn-sm delete-section-btn" data-id="${section.id}">Удалить</button>
            </div>
        `;
        cardList.appendChild(card);
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
    
    // Эту функцию нужно будет доработать при создании таблицы 'requests'
    statsContainer.innerHTML = `
        <h3>Результаты статистики</h3>
        <p>Фильтр: <strong>${filter}</strong></p>
        <p>На данный момент, тут будет логика запросов к таблице 'requests'.</p>
    `;
}

// ==============================================================================
// 6. УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ
// ==============================================================================

async function addUser(event) {
    event.preventDefault();
    const role = document.getElementById('user-role').value;
    const sectionId = document.getElementById('user-section').value || null;
    const pin = document.getElementById('user-pin-input').value.trim(); 
    const messageElement = document.getElementById('add-user-message');
    
    // Проверка прав Администратора
    if ((role === 'admin' || role === 'super_admin') && userRole !== 'super_admin') {
         showMessage(messageElement, '🛑 Только Супер Администратор может назначать Администраторов.', 'error');
         return;
    }
    if ((role === 'admin' || role === 'super_admin') && sectionId) {
         showMessage(messageElement, '🛑 Администратору и Супер Администратору нельзя назначать участок.', 'error');
         return;
    }
    // Проверка PIN
    if (pin.length !== 4 || isNaN(pin)) {
         showMessage(messageElement, '🛑 PIN-код должен состоять ровно из 4 цифр.', 'error');
         return;
    }
    
    // ПРОВЕРКА УНИКАЛЬНОСТИ PIN
    const { data: existingPin } = await supabaseClient
        .from('users')
        .select('id')
        .eq('pin', pin)
        .is('is_verified', false) // Проверяем только среди неверифицированных
        .limit(1); 

    if (existingPin && existingPin.length > 0) {
        showMessage(messageElement, '🛑 Ошибка: Введенный PIN-код уже используется.', 'error');
        return;
    }
    
    // Генерируем уникальный временный ID, чтобы обойти уникальность telegram_id и NOT NULL
    const tempTelegramId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const { error } = await supabaseClient
        .from('users')
        .insert([{ 
            role: role, 
            section_id: sectionId,
            pin: pin, 
            is_verified: false,
            telegram_id: tempTelegramId 
        }]);

    if (error) {
        console.error('Error adding user:', error);
        showMessage(messageElement, `🛑 Ошибка добавления: ${error.message}`, 'error');
    } else {
        showMessage(messageElement, `✅ Пользователь (${role}) добавлен. PIN: ${pin}.`, 'success');
        document.getElementById('add-user-form').reset();
        loadUsers(); 
        // Если добавлен мастер, нужно обновить список участков (для проверки мастера на участке)
        if (role === 'master' || role === 'otk') {
            loadSections();
        }
    }
}

async function deleteUser(userId) {
    if (!confirm(`Вы уверены, что хотите удалить пользователя с ID ${userId}?`)) return;

    // 1. Находим пользователя в кэше, чтобы узнать его роль и участок
    const user = USERS.find(u => u.id === userId);
    
    const { error } = await supabaseClient
        .from('users')
        .delete()
        .eq('id', userId);

    if (error) {
        console.error('Error deleting user:', error);
        alert(`Ошибка удаления: ${error.message}`);
    } else {
        // 2. Логика "Мастер уволен": если это был Мастер, уведомляем, что участок остался без руководителя.
        if (user && user.role === 'master' && user.section_id) {
            alert(`✅ Мастер уволен. Участок "${user.sections.name}" теперь без назначенного руководителя (под управлением Админа).`);
        } else {
            alert('✅ Пользователь успешно удален.');
        }

        loadUsers(); 
        loadSections(); // Обновляем данные участков, чтобы отразить увольнение мастера
    }
}

// ==============================================================================
// 7. УПРАВЛЕНИЕ УЧАСТКАМИ (CRUD)
// ==============================================================================

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

async function deleteSection(sectionId) {
    if (!confirm(`Вы уверены, что хотите удалить участок с ID ${sectionId}? Будут удалены ВСЕ связанные пользователи (Мастера, ОТК).`)) return;

    // 1. Удаляем ВСЕХ пользователей, привязанных к этому участку (чтобы избежать ошибок FK)
    const { error: deleteUsersError } = await supabaseClient
        .from('users')
        .delete()
        .eq('section_id', sectionId);

    if (deleteUsersError) {
        console.error('Error deleting linked users:', deleteUsersError);
        alert(`Ошибка при удалении связанных пользователей: ${deleteUsersError.message}. Отмена удаления участка.`);
        return;
    }

    // 2. Удаляем участок
    const { error: deleteError } = await supabaseClient
        .from('sections')
        .delete()
        .eq('id', sectionId);

    if (deleteError) {
        console.error('Error deleting section:', deleteError);
        alert(`Ошибка удаления участка: ${deleteError.message}`);
    } else {
        alert('✅ Участок и все его связи успешно удалены.');
        loadSections(); 
        loadUsers(); // Обновляем список пользователей, т.к. некоторые были удалены
    }
}

// ==============================================================================
// 8. РЕДАКТИРОВАНИЕ УЧАСТКА
// ==============================================================================

// Функция для загрузки свободных мастеров
async function populateMasterSelect(currentMasterId = null) {
    // Находим всех пользователей с ролью 'master', у которых section_id === null
    // Исключаем текущего мастера, если он есть, так как его надо показать
    const { data: availableMasters } = await supabaseClient
        .from('users')
        .select(`id, pin, is_verified`)
        .eq('role', 'master')
        .is('section_id', null);

    const select = document.getElementById('edit-section-master');
    select.innerHTML = '<option value="">Не назначен</option>';

    // Добавляем доступных свободных мастеров
    if (availableMasters) {
        availableMasters.forEach(master => {
            // Пропускаем текущего мастера, если он уже в списке
            if (master.id === currentMasterId) return; 
            
            const option = document.createElement('option');
            option.value = master.id;
            const status = master.is_verified ? 'Вериф.' : 'PIN';
            option.textContent = `[${master.pin || '—'}] ${status} - ID: ${master.id}`;
            select.appendChild(option);
        });
    }
    
    // Если есть текущий Мастер, добавляем его в список как выбранный
    if (currentMasterId) {
        const currentMaster = USERS.find(u => u.id === currentMasterId);
        if (currentMaster) {
            const status = currentMaster.is_verified ? 'Вериф.' : 'PIN';
            const option = document.createElement('option');
            option.value = currentMaster.id;
            option.textContent = `(ТЕКУЩИЙ) [${currentMaster.pin || '—'}] ${status} - ID: ${currentMaster.id}`;
            option.selected = true;
            // Добавляем в начало списка
            select.prepend(option);
        }
    }
}

// Запуск редактирования участка
async function startEditSection(sectionId) {
    const section = SECTIONS.find(s => s.id === sectionId);
    if (!section) return;

    // Находим текущего Мастера на этом участке
    const currentMaster = USERS.find(u => u.role === 'master' && u.section_id === sectionId);
    
    document.getElementById('edit-section-id').value = section.id;
    document.getElementById('edit-section-name').value = section.name;
    
    // Загружаем мастеров, учитывая текущего
    await populateMasterSelect(currentMaster ? currentMaster.id : null);
    
    showPanel('edit-section-panel');
}

// Обработка сохранения изменений
async function editSection(event) {
    event.preventDefault();
    const sectionId = document.getElementById('edit-section-id').value;
    const newName = document.getElementById('edit-section-name').value.trim();
    const newMasterId = document.getElementById('edit-section-master').value || null;
    const messageElement = document.getElementById('edit-section-message');
    
    // Находим текущего Мастера на этом участке
    const oldMaster = USERS.find(u => u.role === 'master' && u.section_id === sectionId);
    
    // 1. Отвязываем старого Мастера, если он был и он отличается от нового
    if (oldMaster && oldMaster.id !== newMasterId) {
        await supabaseClient
            .from('users')
            .update({ section_id: null })
            .eq('id', oldMaster.id);
    }
    
    // 2. Обновляем имя Участка (самый важный шаг)
    const { error: sectionUpdateError } = await supabaseClient
        .from('sections')
        .update({ name: newName })
        .eq('id', sectionId);

    if (sectionUpdateError) {
        showMessage(messageElement, `Ошибка обновления участка: ${sectionUpdateError.message}`, 'error');
        return;
    }
    
    // 3. Привязываем нового Мастера (если выбран)
    if (newMasterId) {
        // Мы уже отвязали старого, теперь привязываем нового
        const { error: masterUpdateError } = await supabaseClient
            .from('users')
            .update({ section_id: sectionId })
            .eq('id', newMasterId);
            
        if (masterUpdateError) {
            showMessage(messageElement, `Ошибка назначения Мастера: ${masterUpdateError.message}`, 'error');
            return;
        }
    }

    showMessage(messageElement, '✅ Участок и назначения успешно обновлены!', 'success');
    // Перезагружаем данные для актуализации карточек
    loadSections();
    loadUsers(); 
    // Возвращаемся на панель управления участками
    showPanel('add-section-panel');
}

// ==============================================================================
// 9. ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ И ОБРАБОТЧИК КНОПОК
// ==============================================================================

function initApp() {
    // Привязка обработчиков форм
    const forms = [
        { id: 'pin-form', handler: authenticate },
        { id: 'add-user-form', handler: addUser },
        { id: 'add-section-form', handler: addSection },
        { id: 'edit-section-form', handler: editSection }, // Новый обработчик
    ];

    forms.forEach(f => {
        const element = document.getElementById(f.id);
        if (element) {
            element.addEventListener('submit', f.handler); 
        } else {
            console.error(`Error: Form with ID "${f.id}" not found. Check index.html`);
        }
    });
    
    // Обработка кликов по карточкам Админки
    document.addEventListener('click', (event) => {
        // Кнопка перехода с главной панели
        if (event.target.closest('.card-action') && event.target.closest('#admin-panel')) {
            const target = event.target.closest('.card-action').dataset.target;
            if (target) showPanel(target);
        }
        
        // Надежный обработчик удаления пользователя (исправление)
        if (event.target.classList.contains('delete-user-btn')) {
            const userId = event.target.dataset.id;
            if (userId) deleteUser(userId);
        }
        
        // Надежный обработчик удаления участка (исправление)
        if (event.target.classList.contains('delete-section-btn')) {
            const sectionId = event.target.dataset.id;
            if (sectionId) deleteSection(sectionId);
        }
        
        // Надежный обработчик редактирования участка
        if (event.target.classList.contains('edit-section-btn')) {
            const sectionId = event.target.dataset.id;
            if (sectionId) startEditSection(sectionId);
        }
    });

    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
    }
    
    // Запуск проверки роли
    fetchRoleAndShowPanel(); 
}

// Делаем функции глобально доступными для HTML onclick атрибутов
window.showPanel = showPanel;
window.logout = logout;
window.goHome = goHome; 

document.addEventListener('DOMContentLoaded', initApp);