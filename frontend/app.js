// ==============================================================================
// 1. SUPABASE CONFIGURATION
// ==============================================================================
// !!! ЗАМЕНИТЕ ЭТИ ПЛЕЙСХОЛДЕРЫ НА ВАШИ РЕАЛЬНЫЕ КЛЮЧИ SUPABASE !!!
const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

// Создание клиента Supabase (убедитесь, что вы подключили библиотеку Supabase в HTML)
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ==============================================================================
// 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==============================================================================
let userRole = 'unverified';
// Переменная для хранения Telegram ID текущего пользователя
let telegramId = null; 
let USER_SECTION_ID = null;
let USER_SECTION_NAME = null;
let USERS = []; // Для хранения данных пользователей админ-панели
let SECTIONS = []; // Для хранения данных участков админ-панели


// ==============================================================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==============================================================================

/**
 * Показывает временное сообщение пользователю.
 * @param {HTMLElement} element - Элемент для вывода сообщения (например, pin-message)
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип сообщения ('success' или 'error')
 */
function showMessage(element, message, type) {
    element.textContent = message;
    element.className = '';
    element.classList.add('message', type);
    setTimeout(() => {
        element.textContent = '';
        element.className = 'message';
    }, 5000);
}

/**
 * Переключает видимость панелей.
 * @param {string} panelId - ID панели, которую нужно показать.
 */
function showPanel(panelId) {
    document.querySelectorAll('.panel').forEach(panel => {
        panel.style.display = 'none';
    });
    const panelToShow = document.getElementById(panelId);
    if (panelToShow) {
        panelToShow.style.display = 'block';
    } else {
        console.error('Panel not found:', panelId);
    }
    
    // Дополнительная логика для загрузки данных при переходе на админ-панель
    if (panelId === 'admin-panel') {
        loadAdminData();
    }
}

/**
 * Генерирует 6-значный PIN-код.
 */
function generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}


// ==============================================================================
// 4. ЛОГИКА АВТОРИЗАЦИИ И НАЧАЛА РАБОТЫ (ИСПРАВЛЕНА)
// ==============================================================================

/**
 * Проверяет роль пользователя по Telegram ID и отображает нужную панель.
 */
async function fetchRoleAndShowPanel() {
    
    // Получаем реальный TG ID из WebApp (если доступно)
    const tgUser = window.Telegram.WebApp ? window.Telegram.WebApp.initDataUnsafe.user : null;
    // Используем реальный ID или тестовый ID (ваш ID админа '949765279') для отладки
    telegramId = tgUser ? tgUser.id.toString() : '949765279'; 
    
    // Если есть элемент для отображения ID, обновим его
    const adminTgIdDisplay = document.getElementById('admin-tg-id-display');
    if (adminTgIdDisplay) {
        adminTgIdDisplay.textContent = telegramId;
    }
    
    // 1. Поиск пользователя по TG ID
    const { data, error } = await supabase
        .from('users')
        .select(`role, is_verified, section_id, sections(name)`)
        .eq('tg_id', telegramId)
        .single();
    
    // 2. Проверка: Пользователь не найден или не верифицирован
    if (error || !data || !data.is_verified) {
        showPanel('pin-auth-panel');
        return;
    }
    
    userRole = data.role;
    // Отображение роли
    const roleDisplay = document.getElementById('role-display');
    if (roleDisplay) {
        roleDisplay.textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
    }

    // 3. Администратор: сразу на Admin Dashboard
    if (userRole === 'admin') {
        const sectionDisplay = document.getElementById('section-display');
        if (sectionDisplay) {
             sectionDisplay.textContent = '—';
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
    
    showPanel('main-panel'); // Главная панель для Мастера/ОТК
}


/**
 * Логика аутентификации по PIN-коду (для не верифицированных пользователей).
 * @param {Event} event
 */
async function authenticate(event) {
    event.preventDefault();
    const pin = document.getElementById('pin-input').value;
    const messageElement = document.getElementById('pin-message');
    
    // Получаем реальный TG ID для привязки
    const tgUser = window.Telegram.WebApp ? window.Telegram.WebApp.initDataUnsafe.user : null;
    const currentTelegramId = tgUser ? tgUser.id.toString() : null;
    
    if (!currentTelegramId) {
        showMessage(messageElement, '🛑 Ошибка: Невозможно получить ваш Telegram ID. Используйте WebApp.', 'error');
        return;
    }
    
    // 1. Находим не верифицированного пользователя по PIN
    const { data: userToVerify, error: pinError } = await supabase
        .from('users')
        .select('id, tg_id, role')
        .eq('pin', pin)
        .is('tg_id', null) // Ищем запись, к которой еще не привязан TG ID
        .eq('is_verified', false) 
        .single();
    
    if (pinError || !userToVerify) {
        showMessage(messageElement, '🛑 Неверный PIN-код или пользователь уже верифицирован.', 'error');
        return;
    }

    // 2. Если PIN найден, обновляем запись, привязывая текущий Telegram ID
    const { error: updateError } = await supabase
        .from('users')
        .update({ 
            tg_id: currentTelegramId, // Присваиваем текущий TG ID
            pin: null, // Удаляем одноразовый PIN
            is_verified: true
        })
        .eq('id', userToVerify.id);

    if (updateError) {
        console.error('Update Error:', updateError);
        showMessage(messageElement, '🛑 Ошибка обновления статуса верификации.', 'error');
        return;
    }

    // 3. Успех! Очищаем поле и перезапускаем проверку роли.
    document.getElementById('pin-input').value = '';
    showMessage(messageElement, '✅ Успешная верификация! Добро пожаловать.', 'success');
    
    fetchRoleAndShowPanel(); // Переход на нужную панель
}

// ==============================================================================
// 5. АДМИН-ПАНЕЛЬ: ЗАГРУЗКА ДАННЫХ
// ==============================================================================

async function loadAdminData() {
    await Promise.all([loadUsers(), loadSections(), loadStatistics()]);
}

async function loadUsers() {
    const { data, error } = await supabase
        .from('users')
        .select(`*, sections(name)`);

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
        row.insertCell().textContent = user.tg_id || '—';
        row.insertCell().textContent = user.pin || '—';
        row.insertCell().textContent = user.is_verified ? 'Да' : 'Нет';
        row.insertCell().textContent = user.sections ? user.sections.name : '—';
        
        const actionCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Удалить';
        deleteBtn.className = 'delete-btn';
        deleteBtn.onclick = () => deleteUser(user.id);
        actionCell.appendChild(deleteBtn);
    });
}

async function loadSections() {
    const { data, error } = await supabase
        .from('sections')
        .select(`*`);

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
        deleteBtn.className = 'delete-btn';
        deleteBtn.onclick = () => deleteSection(section.id);
        actionCell.appendChild(deleteBtn);
    });
}

function populateSectionSelect(sections) {
    const selectElements = document.querySelectorAll('.section-select');
    selectElements.forEach(select => {
        // Очистка перед заполнением
        select.innerHTML = '<option value="">Не выбрано</option>';
        sections.forEach(section => {
            const option = document.createElement('option');
            option.value = section.id;
            option.textContent = section.name;
            select.appendChild(option);
        });
    });
}

async function loadStatistics() {
    // ЗАГЛУШКА: Тут должна быть логика запроса данных из таблицы 'requests'
    const statsContainer = document.getElementById('statistics-data');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <h3>Сводная статистика (ЗАГЛУШКА)</h3>
            <p>Количество открытых запросов: **15**</p>
            <p>Количество активных мастеров: **7**</p>
        `;
    }
}


// ==============================================================================
// 6. АДМИН-ПАНЕЛЬ: ОБРАБОТЧИКИ ФОРМ
// ==============================================================================

/**
 * Обработчик добавления нового пользователя.
 * @param {Event} event
 */
async function addUser(event) {
    event.preventDefault();
    const role = document.getElementById('user-role').value;
    const sectionId = document.getElementById('user-section').value || null;
    const messageElement = document.getElementById('add-user-message');
    
    const pin = generatePin();

    const { error } = await supabase
        .from('users')
        .insert([{ 
            role: role, 
            section_id: sectionId,
            pin: pin,
            is_verified: false,
            tg_id: null
        }]);

    if (error) {
        console.error('Error adding user:', error);
        showMessage(messageElement, `🛑 Ошибка добавления: ${error.message}`, 'error');
    } else {
        showMessage(messageElement, `✅ Пользователь добавлен. PIN-код: ${pin}`, 'success');
        document.getElementById('add-user-form').reset();
        loadUsers(); // Обновление таблицы
    }
}

/**
 * Обработчик добавления нового участка.
 * @param {Event} event
 */
async function addSection(event) {
    event.preventDefault();
    const sectionName = document.getElementById('section-name-input').value;
    const messageElement = document.getElementById('add-section-message');
    
    if (!sectionName) {
        showMessage(messageElement, '🛑 Название участка не может быть пустым.', 'error');
        return;
    }

    const { error } = await supabase
        .from('sections')
        .insert([{ name: sectionName }]);

    if (error) {
        console.error('Error adding section:', error);
        showMessage(messageElement, `🛑 Ошибка добавления: ${error.message}`, 'error');
    } else {
        showMessage(messageElement, '✅ Участок добавлен.', 'success');
        document.getElementById('add-section-form').reset();
        loadSections(); // Обновление таблицы и селектов
    }
}

/**
 * Удаляет пользователя по ID.
 * @param {number} userId
 */
async function deleteUser(userId) {
    if (!confirm(`Вы уверены, что хотите удалить пользователя с ID ${userId}?`)) return;

    const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

    if (error) {
        console.error('Error deleting user:', error);
        alert(`Ошибка удаления: ${error.message}`);
    } else {
        loadUsers(); // Обновление таблицы
    }
}

/**
 * Удаляет участок по ID.
 * @param {number} sectionId
 */
async function deleteSection(sectionId) {
    if (!confirm(`Вы уверены, что хотите удалить участок с ID ${sectionId}? Все связанные пользователи потеряют привязку.`)) return;

    const { error } = await supabase
        .from('sections')
        .delete()
        .eq('id', sectionId);

    if (error) {
        console.error('Error deleting section:', error);
        alert(`Ошибка удаления: ${error.message}`);
    } else {
        loadSections(); // Обновление таблицы и селектов
        loadUsers(); // Обновление пользователей, у которых мог сброситься section_id
    }
}

// ==============================================================================
// 7. ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ
// ==============================================================================

function initApp() {
    // 1. Привязка обработчиков форм
    const pinForm = document.getElementById('pin-form');
    if (pinForm) {
        pinForm.addEventListener('submit', authenticate); 
    }
    
    const addUserForm = document.getElementById('add-user-form');
    if (addUserForm) {
        addUserForm.addEventListener('submit', addUser);
    }
    
    const addSectionForm = document.getElementById('add-section-form');
    if (addSectionForm) {
        addSectionForm.addEventListener('submit', addSection);
    }
    
    // Плейсхолдер для других форм (например, отправка запроса)
    // const requestForm = document.getElementById('request-form');
    // if (requestForm) {
    //     requestForm.addEventListener('submit', createRequest); 
    // }

    // 2. Инициализация Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
    }
    
    // 3. Запуск проверки роли и отображения нужной панели
    fetchRoleAndShowPanel(); 
}

// Запуск приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', initApp);


// ==============================================================================
// 8. ПЛЕЙСХОЛДЕРЫ ДЛЯ ФУНКЦИЙ МАСТЕРА/ОТК
// ==============================================================================

async function createRequest(event) {
    event.preventDefault();
    console.log('Request creation logic goes here.');
    // TODO: Здесь будет логика создания заявки для Мастера/ОТК
}