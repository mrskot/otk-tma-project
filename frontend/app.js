// app.js - ФИНАЛЬНАЯ ВЕРСИЯ: PIN, ФОРМА, АДМИН-ПАНЕЛЬ

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let userRole = 'guest';
let SECTIONS_DATA = []; 
let USER_SECTION_ID = null; 
let USER_SECTION_NAME = null; 

// --- ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Получаем Telegram ID, используя заглушку для тестирования вне TMA
    const tgUser = window.Telegram.WebApp ? window.Telegram.WebApp.initDataUnsafe.user : null;
    const tgId = tgUser ? tgUser.id.toString() : 'TEST_MASTER_ID'; 

    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
    }
    document.getElementById('tg-id-display').textContent = tgId;

    fetchRoleAndShowPanel(tgId);

    // Обработчики форм
    document.getElementById('pin-form').addEventListener('submit', handlePinSubmit);
    document.getElementById('request-form').addEventListener('submit', handleRequestFormSubmit);
    document.getElementById('add-user-form').addEventListener('submit', handleAddUserSubmit); // <<< ОБРАБОТЧИК АДМИН-ПАНЕЛИ
});

// --- ПАНЕЛИ И НАВИГАЦИЯ ---
function showPanel(panelId) {
    document.querySelectorAll('.panel-section').forEach(panel => {
        panel.style.display = 'none';
    });
    document.getElementById(panelId).style.display = 'block';
}


// --- 1. ЛОГИКА АВТОРИЗАЦИИ И РОЛЕЙ ---

async function fetchRoleAndShowPanel(telegramId) {
    await loadSections(); 
    
    try {
        const response = await fetch(`/api/user/${telegramId}`);
        const data = await response.json();
        
        userRole = data.role;
        document.getElementById('role-display').textContent = userRole.charAt(0).toUpperCase() + userRole.slice(1);
        
        // 1. Проверка верификации
        if (data.role === 'unverified') {
            showPanel('pin-auth-panel'); 
            return;
        }

        // 2. Если пользователь - Администратор, показываем панель администратора
        if (userRole === 'admin') {
            showPanel('admin-panel'); 
            return;
        }

        // 3. Если верифицирован и не админ, сохраняем данные участка
        USER_SECTION_ID = data.section_id || null;
        USER_SECTION_NAME = data.section_name || null;

        showPanel('main-panel');
        // 4. Отображение логики выбора участка для мастера
        if (userRole === 'master') {
            renderSectionChoiceArea();
        }
        
    } catch (error) {
        console.error('Error fetching role or user not found:', error);
        showPanel('pin-auth-panel');
    }
}

async function handlePinSubmit(e) {
    e.preventDefault();
    const pin = document.getElementById('pin-input').value;
    
    const tgUser = window.Telegram.WebApp ? window.Telegram.WebApp.initDataUnsafe.user : null;
    const telegram_id = tgUser ? tgUser.id.toString() : 'TEST_MASTER_ID';
    
    const messageDiv = document.getElementById('pin-message');
    
    messageDiv.textContent = '';
    
    try {
        const response = await fetch('/api/auth/verify-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_id, pin })
        });
        
        const result = await response.json();

        if (response.ok) {
            alert('✅ Успешная авторизация! Добро пожаловать.');
            await fetchRoleAndShowPanel(telegram_id);
        } else {
            messageDiv.textContent = `🛑 Ошибка: ${result.error || 'Неверный PIN или внутренняя ошибка.'}`;
        }

    } catch (error) {
        console.error('Network error during PIN verification:', error);
        messageDiv.textContent = '🛑 Ошибка сети. Проверьте соединение.';
    }
}


// --- 2. ЛОГИКА АДМИНИСТРИРОВАНИЯ И УЧАСТКОВ ---

async function loadSections() {
    try {
        const response = await fetch('/api/sections');
        if (!response.ok) throw new Error('Failed to load sections');
        
        SECTIONS_DATA = await response.json();
        
        const reqSelect = document.getElementById('section-select');
        const adminSelect = document.getElementById('admin-section-select');
        
        // Очистка и добавление опций в оба селекта
        reqSelect.innerHTML = '<option value="">-- Выберите другой участок --</option>'; 
        adminSelect.innerHTML = '<option value="">-- Выберите участок --</option>';
        
        SECTIONS_DATA.forEach(section => {
            const optionReq = document.createElement('option');
            optionReq.value = section.id;
            optionReq.textContent = section.name;
            reqSelect.appendChild(optionReq);

            const optionAdmin = optionReq.cloneNode(true); 
            adminSelect.appendChild(optionAdmin);
        });

    } catch (error) {
        console.error('Error loading sections:', error);
    }
}

async function handleAddUserSubmit(e) {
    e.preventDefault();
    const messageDiv = document.getElementById('admin-message');
    
    const payload = {
        telegram_id: document.getElementById('admin-tg-id').value,
        role: document.getElementById('admin-role').value,
        section_id: document.getElementById('admin-section-select').value,
        pin: document.getElementById('admin-pin').value,
    };

    if (!payload.section_id) {
        messageDiv.className = 'alert alert-danger';
        messageDiv.textContent = '🛑 Пожалуйста, выберите участок.';
        messageDiv.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/admin/add-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        messageDiv.style.display = 'block';

        if (response.ok) {
            messageDiv.className = 'alert alert-success';
            messageDiv.textContent = `✅ Пользователь ${payload.telegram_id} (${payload.role}) добавлен/обновлен. PIN: ${payload.pin}.`;
            document.getElementById('add-user-form').reset();
        } else {
            messageDiv.className = 'alert alert-danger';
            messageDiv.textContent = `🛑 Ошибка: ${result.detail || result.error || 'Внутренняя ошибка.'}`;
        }

    } catch (error) {
        console.error('Admin user creation network error:', error);
        messageDiv.className = 'alert alert-danger';
        messageDiv.textContent = '🛑 Ошибка сети. Попробуйте позже.';
        messageDiv.style.display = 'block';
    }
}

function renderSectionChoiceArea() {
    const area = document.getElementById('section-choice-area');
    const select = document.getElementById('section-select');
    let html = '';

    if (USER_SECTION_ID && USER_SECTION_NAME) {
        html = `
            <div class="alert alert-info">
                Ваш закрепленный участок: <strong>${USER_SECTION_NAME}</strong>.
            </div>
            <div class="section-choice-buttons">
                <button type="button" class="btn btn-success" onclick="selectSection('${USER_SECTION_ID}', '${USER_SECTION_NAME}', true)">
                    Создать заявку на ${USER_SECTION_NAME}
                </button>
                <button type="button" class="btn btn-secondary" onclick="showOtherSections()">
                    Создать заявку на ДРУГОЙ участок
                </button>
            </div>
        `;
        select.style.display = 'none'; 
        selectSection(USER_SECTION_ID, USER_SECTION_NAME, false); 
    } else {
        html = `<label>Участок Приемки (Отправитель):</label>`;
        select.style.display = 'block';
        selectSection(null, null, false); 
    }
    area.innerHTML = html;
}

function showOtherSections() {
    document.getElementById('section-choice-area').innerHTML = `<label>Выберите участок:</label>`;
    document.getElementById('section-select').style.display = 'block';
    document.getElementById('section-select').value = ''; 
}

function selectSection(id, name, showConfirmation = false) {
    const select = document.getElementById('section-select');
    
    if (id) {
        select.value = id; 
        if (showConfirmation) {
             document.getElementById('section-choice-area').innerHTML = `
                <div class="alert alert-success">Выбран участок: <strong>${name}</strong></div>
                <button type="button" class="btn btn-secondary" onclick="renderSectionChoiceArea()">Изменить выбор</button>
            `;
            select.style.display = 'none';
        }
    } else {
         select.value = '';
    }
}


// --- 3. ОТПРАВКА ФОРМЫ (ПАКЕТНЫЙ РЕЖИМ) ---

async function handleRequestFormSubmit(e) {
    e.preventDefault();

    const selectedSectionId = document.getElementById('section-select').value;
    const formButton = e.submitter; 

    if (!selectedSectionId) {
        alert("🛑 Пожалуйста, выберите или подтвердите участок.");
        return;
    }
    
    formButton.disabled = true;
    formButton.textContent = 'Отправка...';

    const tgUser = window.Telegram.WebApp ? window.Telegram.WebApp.initDataUnsafe.user : null;
    const telegram_id = tgUser ? tgUser.id.toString() : 'TEST_MASTER_ID';

    const payload = {
        telegram_id: telegram_id,
        section_id: selectedSectionId,
        
        product_numbers_input: document.getElementById('product_numbers_input').value,
        desired_priority: document.getElementById('desired_priority').value,
        
        transformer_type: document.getElementById('transformer_type').value,
        drawing_number: document.getElementById('drawing_number').value,
        semi_product: document.getElementById('semi_product').value,
        initial_description: document.getElementById('initial_description').value,
    };

    try {
        const response = await fetch('/api/request/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            alert(`✅ Успех! Создано заявок: ${result.message.match(/(\d+) requests/)[1] || '1'}. Задача(и) отправлена(ы) в Bitrix24.`);
            document.getElementById('request-form').reset();
            showPanel('main-panel'); 
        } else {
            alert(`🛑 Ошибка при создании заявок: ${result.error || result.message}`);
        }

    } catch (error) {
        alert('🛑 Произошла сетевая ошибка. Проверьте соединение.');
        console.error('Network error:', error);
    } finally {
        formButton.disabled = false;
        formButton.textContent = 'Создать Заявку(и) и Отправить в Б24';
    }
}