// app.js - ФИНАЛЬНАЯ ВЕРСИЯ С PIN АВТОРИЗАЦИЕЙ И ПАКЕТНОЙ ФОРМОЙ

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let userRole = 'guest';
let SECTIONS_DATA = []; 
let USER_SECTION_ID = null; 
let USER_SECTION_NAME = null; 

// --- ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener('DOMContentLoaded', () => {
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        
        // Проверяем наличие user.id, если нет - это заглушка, используем тестовый ID
        const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
        const tgId = tgUser ? tgUser.id.toString() : 'TEST_MASTER_ID'; 

        document.getElementById('tg-id-display').textContent = tgId;
        fetchRoleAndShowPanel(tgId);
    } else {
        document.getElementById('tg-id-display').textContent = 'Web View (Not Telegram)';
        // Если не в TMA, используем тестовый ID для входа и проверки логики
        fetchRoleAndShowPanel('TEST_MASTER_ID'); 
    }

    // Обработчики форм
    document.getElementById('pin-form').addEventListener('submit', handlePinSubmit);
    document.getElementById('request-form').addEventListener('submit', handleRequestFormSubmit);
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

        // 2. Если верифицирован, сохраняем данные участка
        USER_SECTION_ID = data.section_id || null;
        USER_SECTION_NAME = data.section_name || null;

        showPanel('main-panel');
        // 3. Отображение логики выбора участка для мастера
        if (userRole === 'master') {
            renderSectionChoiceArea();
        }
        
    } catch (error) {
        console.error('Error fetching role or user not found:', error);
        // В случае любой ошибки, предполагаем, что нужна верификация
        showPanel('pin-auth-panel');
    }
}

async function handlePinSubmit(e) {
    e.preventDefault();
    const pin = document.getElementById('pin-input').value;
    
    // Получаем Telegram ID из TWA или используем тестовый ID
    const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
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
            // PIN принят, перезагружаем данные, чтобы получить роль и данные участка
            await fetchRoleAndShowPanel(telegram_id);
        } else {
            messageDiv.textContent = `🛑 Ошибка: ${result.error || 'Неверный PIN или внутренняя ошибка.'}`;
        }

    } catch (error) {
        console.error('Network error during PIN verification:', error);
        messageDiv.textContent = '🛑 Ошибка сети. Проверьте соединение.';
    }
}


// --- 2. ЛОГИКА УПРАВЛЕНИЯ УЧАСТКАМИ И ФОРМОЙ ---

async function loadSections() {
    try {
        const response = await fetch('/api/sections');
        if (!response.ok) throw new Error('Failed to load sections');
        
        SECTIONS_DATA = await response.json();
        
        const select = document.getElementById('section-select');
        select.innerHTML = '<option value="">-- Выберите другой участок --</option>'; 
        
        SECTIONS_DATA.forEach(section => {
            const option = document.createElement('option');
            option.value = section.id;
            option.textContent = section.name;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading sections:', error);
    }
}

function renderSectionChoiceArea() {
    const area = document.getElementById('section-choice-area');
    const select = document.getElementById('section-select');
    let html = '';

    if (USER_SECTION_ID && USER_SECTION_NAME) {
        // Сценарий "ДА": Участок закреплен - максимальное автозаполнение
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
        select.style.display = 'none'; // Скрываем select по умолчанию
        selectSection(USER_SECTION_ID, USER_SECTION_NAME, false); // Устанавливаем в скрытое поле
    } else {
        // Сценарий "НЕТ": Участок не закреплен - сразу показываем список
        html = `<label>Участок Приемки (Отправитель):</label>`;
        select.style.display = 'block';
        selectSection(null, null, false); // Сбрасываем выбор
    }
    area.innerHTML = html;
}

// Показать выпадающий список для выбора другого участка
function showOtherSections() {
    document.getElementById('section-choice-area').innerHTML = `<label>Выберите участок:</label>`;
    document.getElementById('section-select').style.display = 'block';
    document.getElementById('section-select').value = ''; // Сбрасываем выбор
}

// Установить выбранный участок (вызывается при клике на "Мой участок" или при выборе из списка)
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
    
    // Деактивируем кнопку во время отправки
    formButton.disabled = true;
    formButton.textContent = 'Отправка...';

    // Получаем Telegram ID из TWA или используем тестовый ID
    const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
    const telegram_id = tgUser ? tgUser.id.toString() : 'TEST_MASTER_ID';

    const payload = {
        telegram_id: telegram_id,
        section_id: selectedSectionId,
        
        // Данные пачки и приоритета
        product_numbers_input: document.getElementById('product_numbers_input').value,
        desired_priority: document.getElementById('desired_priority').value,
        
        // Общие атрибуты
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
            // Сброс формы и возврат на главную
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