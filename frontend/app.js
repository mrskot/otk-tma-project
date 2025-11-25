/**
 * app.js - Основная логика Telegram Mini App (TMA)
 */

const tg = window.Telegram.WebApp;

// --- БАЗОВЫЕ НАСТРОЙКИ API ---
// На хостинге используем относительный путь
const API_BASE_URL = '/api'; 

// --- МОК-ДАННЫЕ ДЛЯ ТЕСТИРОВАНИЯ ---
const MOCK_TELEGRAM_ID_MASTER = '123456789'; 

// Заглушка для заполнения списка участков (Используйте свои UUID!)
const mockSections = [
    { id: 'a8b23c4d-5e6f-7080-91a2-3b4c5d6e7f80', name: 'Участок Металлоконструкций' }, 
    { id: '22222222-3333-4444-5555-666666666666', name: 'Участок Обмотки' },
];


// ===============================================
// 1. НАВИГАЦИЯ И УПРАВЛЕНИЕ UI
// ===============================================

function switchScreen(targetId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const targetScreen = document.getElementById(targetId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
}

function setupNavigation() {
    document.querySelectorAll('[data-screen-target]').forEach(element => {
        element.addEventListener('click', (e) => {
            e.preventDefault();
            const target = e.currentTarget.getAttribute('data-screen-target');
            switchScreen(target);
        });
    });
}

function populateSections() {
    const select = document.getElementById('section-select');
    select.innerHTML = '<option value="">-- Выберите участок --</option>';

    mockSections.forEach(section => {
        const option = document.createElement('option');
        option.value = section.id;
        option.textContent = section.name;
        select.appendChild(option);
    });
}

function setupMainButton() {
    tg.MainButton.setText("СОЗДАТЬ НОВУЮ ЗАЯВКУ");
    tg.MainButton.onClick(() => {
        switchScreen('create-request');
    });
}


// ===============================================
// 2. ОТПРАВКА ДАННЫХ
// ===============================================

async function handleSubmit(e) {
    e.preventDefault();
    tg.MainButton.showProgress(true);

    const form = e.target;
    const formData = new FormData(form);

    // Логика получения ID (теперь снова используем реальный ID в TMA)
    const telegramId = tg.initDataUnsafe.user 
        ? tg.initDataUnsafe.user.id.toString() 
        : MOCK_TELEGRAM_ID_MASTER;

    const payload = {
        telegram_id: telegramId, 
        section_id: formData.get('section-select'),
        transformer_type: formData.get('transformer-type'),
        product_number: formData.get('product-number'),
        initial_description: formData.get('initial-description'),
        semi_product: formData.get('semi-product'),
        drawing_number: formData.get('drawing-number'),
    };

    try {
        const response = await fetch(`${API_BASE_URL}/request/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            tg.MainButton.showProgress(false);
            tg.MainButton.setParams({ text: "ЗАЯВКА СОЗДАНА!", color: tg.themeParams.button_color || '#26a5e4' });
            
            setTimeout(() => {
                switchScreen('my-requests');
                tg.MainButton.setText("СОЗДАТЬ НОВУЮ ЗАЯВКУ");
            }, 2000);
            
        } else {
            alert('Ошибка создания заявки: ' + result.error);
        }

    } catch (error) {
        console.error('Ошибка сети или сервера:', error);
        alert('Не удалось связаться с сервером. Проверьте ваш бэкенд.');
    } finally {
        tg.MainButton.showProgress(false);
    }
}


// ===============================================
// 3. ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ===============================================

async function initializeApp() {
    
    // Логика получения ID
    const telegramId = tg.initDataUnsafe.user 
        ? tg.initDataUnsafe.user.id.toString() 
        : MOCK_TELEGRAM_ID_MASTER;
    
    document.getElementById('user-id').textContent = `ID TG: ${telegramId}`;

    try {
        // Запрос роли пользователя
        const response = await fetch(`${API_BASE_URL}/user/${telegramId}`);
        
        if (!response.ok) {
            throw new Error('Пользователь не найден в системе. Добавьте свой ID в Supabase.');
        }
        
        const userData = await response.json();
        
        // Определение, какой "кабинет" показать
        if (userData.role === 'otk') {
            switchScreen('all-requests'); 
            document.getElementById('current-section').textContent = `Роль: ОТК`;
        } else if (userData.role === 'master') {
            switchScreen('main-dashboard');
            document.getElementById('current-section').textContent = `Роль: Мастер`; 
            tg.MainButton.show();
        } else {
            alert('Ваша роль не определена. Обратитесь к администратору.');
            tg.MainButton.hide();
        }

    } catch (error) {
        console.error('Ошибка инициализации:', error.message);
        document.body.innerHTML = '<h1>Ошибка Авторизации</h1><p>' + error.message + '</p>';
    }
}


// ===============================================
// 4. ЗАПУСК ПРИЛОЖЕНИЯ
// ===============================================

document.addEventListener('DOMContentLoaded', () => {
    // Проверка, существует ли Telegram Web App API
    if (!window.Telegram || !window.Telegram.WebApp) {
        // На хостинге это будет показывать, если кто-то открыл ссылку напрямую, а не из Telegram
        console.warn("Telegram WebApp API не инициализирован. Запуск в режиме отладки.");
        // Продолжаем, чтобы работала заглушка ID для ПК
    } else {
        tg.ready();
        tg.expand();
    }
    
    setupNavigation();
    setupMainButton();
    populateSections(); 

    const form = document.getElementById('request-form');
    if (form) {
        form.addEventListener('submit', handleSubmit);
    }
    
    initializeApp();
});