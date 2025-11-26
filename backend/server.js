// server.js - Главный файл Node.js сервера (ФИНАЛЬНАЯ ВЕРСИЯ С PIN И B24)

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

// --- 1. НАСТРОЙКА И ИНИЦИАЛИЗАЦИЯ ---
const PORT = process.env.PORT || 3000; 
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// !!! ВАЖНО: Установите этот URL в переменных окружения Render
const BITRIX24_WEBHOOK_URL = process.env.BITRIX24_WEBHOOK_URL || 'https://your-bitrix.b24.ru/rest/1/webhook_key/tasks.task.add'; 

if (!supabaseUrl || !supabaseKey) {
    console.error("FATAL: SUPABASE_URL или SUPABASE_KEY не определены.");
    process.exit(1); 
}

const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();

// --- 2. MIDDLEWARE ---
app.use(cors()); 
app.use(bodyParser.json());

// --- 3. ОБСЛУЖИВАНИЕ СТАТИЧЕСКИХ ФАЙЛОВ ---
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});


// --- 4. ФУНКЦИЯ ИНТЕГРАЦИИ С BITRIX24 ---

/**
 * Отправляет данные заявки в Bitrix24 для создания задачи.
 * @param {object} requestData - Объект заявки из Supabase.
 * @returns {string} ID задачи Bitrix24 или код ошибки.
 */
async function sendToBitrix24(requestData) {
    console.log(`Attempting to send request ${requestData.product_number} to Bitrix24...`);
    
    // ПРИМЕР ФОРМИРОВАНИЯ ТЕЛА ДЛЯ Bitrix24 REST API (tasks.task.add)
    const bitrixPayload = {
        fields: {
            // Заголовок задачи
            TITLE: `Приемка изделия: ${requestData.product_number} (${requestData.semi_product})`,
            // Описание задачи
            DESCRIPTION: `Участок ID: ${requestData.section_id}\nМастер ID: ${requestData.master_creator_id}\nЧертеж: ${requestData.drawing_number || 'N/A'}\nОписание: ${requestData.initial_description || ''}`,
            
            // Настройте эти поля под свою систему Б24
            PRIORITY: 2, 
            DEADLINE: new Date(Date.now() + 8 * 3600 * 1000).toISOString(), 
            // RESPONSIBLE_ID: [ID ответственного сотрудника ОТК в Б24]
        },
    };

    try {
        if (!process.env.BITRIX24_WEBHOOK_URL) {
            console.warn("WARNING: Using mock Bitrix24 task ID. Set BITRIX24_WEBHOOK_URL in environment.");
            return `B24_MOCK_ID_${Date.now()}`; 
        }

        const response = await fetch(BITRIX24_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bitrixPayload)
        });

        const result = await response.json();
        
        if (result.error) {
            console.error('Bitrix24 API Error:', result.error_description);
            // Если ошибка в Б24, мы все равно создаем заявку в Supabase, но записываем ошибку
            return `B24_ERROR_${result.error_description}`;
        }

        // Возвращаем ID созданной задачи (предполагая, что Б24 возвращает его в result.result)
        return result.result; 

    } catch (error) {
        console.error('Failed to communicate with Bitrix24:', error.message);
        return `B24_COMM_ERROR_${Date.now()}`;
    }
}


// --- 5. API МАРШРУТЫ ---

/**
 * GET /api/user/:telegramId - Проверка роли и данных участка
 */
app.get('/api/user/:telegramId', async (req, res) => {
    const telegramId = req.params.telegramId;
    
    try {
        const { data: user, error } = await supabase
            .from('users') 
            .select(`
                role, 
                is_verified, 
                section_id,
                sections(name) 
            `)
            .eq('telegram_id', telegramId)
            .single();

        if (error && error.code === 'PGRST116') { 
            return res.status(401).json({ error: 'User not found or verified', role: 'unverified' });
        }
        if (error) throw error;
        
        if (!user.is_verified) {
             return res.status(401).json({ error: 'User requires PIN verification', role: 'unverified' });
        }

        res.json({ 
            role: user.role,
            section_id: user.section_id,
            section_name: user.sections ? user.sections.name : null 
        }); 

    } catch (error) {
        console.error('Error in user verification check:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


/**
 * POST /api/auth/verify-pin - Аутентификация по PIN
 */
app.post('/api/auth/verify-pin', async (req, res) => {
    const { telegram_id, pin } = req.body;

    if (!telegram_id || !pin) {
        return res.status(400).json({ error: 'Missing Telegram ID or PIN' });
    }

    try {
        const { data: user, error } = await supabase
            .from('users') 
            .select('id, role')
            .eq('pin', pin)
            .single();

        if (error && error.code === 'PGRST116') {
            return res.status(401).json({ error: 'Invalid PIN' });
        }
        if (error) throw error;
        
        const { error: updateError } = await supabase
            .from('users')
            .update({ 
                telegram_id: telegram_id,
                pin: null, 
                is_verified: true
            })
            .eq('id', user.id); 

        if (updateError) throw updateError;
        
        res.json({ message: 'Authentication successful', role: user.role }); 

    } catch (error) {
        console.error('Error in PIN verification:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


/**
 * GET /api/sections - Список всех участков
 */
app.get('/api/sections', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sections') 
            .select('id, name'); 

        if (error) throw error;
        
        res.json(data); 

    } catch (error) {
        console.error('Error fetching sections:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


/**
 * POST /api/request/create
 * Создает ОДНУ или НЕСКОЛЬКО заявок (пакетный режим) И создает задачи в Bitrix24.
 */
app.post('/api/request/create', async (req, res) => {
    
    const { 
        telegram_id, 
        section_id, 
        product_numbers_input, 
        transformer_type, 
        initial_description,
        semi_product,
        drawing_number
    } = req.body; 

    // 1. Валидация и Парсинг
    if (!telegram_id || !product_numbers_input || !section_id) {
        return res.status(400).json({ error: 'Missing required fields (TG ID, Product Numbers, or Section ID)' });
    }
    
    const productNumbers = product_numbers_input
        .split(/[,\n]/)
        .map(num => num.trim())
        .filter(num => num.length > 0);

    if (productNumbers.length === 0) {
        return res.status(400).json({ error: 'No valid product numbers found in the input.' });
    }

    const NEW_STATUS = 'new'; 
    const targetSectionId = section_id; 

    // 2. Формирование массива заявок для Supabase
    const requestsToInsert = productNumbers.map(number => ({
        master_creator_id: telegram_id, 
        section_id: targetSectionId, 
        product_number: number, 
        transformer_type: transformer_type,
        initial_description: initial_description,
        semi_product: semi_product,
        drawing_number: drawing_number,
        status: NEW_STATUS
    }));
    
    console.log(`Attempting to create ${requestsToInsert.length} requests for user ${telegram_id}.`); 

    try {
        // ШАГ 1: Создание записей в Supabase.
        // Используем .select('*') для получения ID, созданных Supabase.
        const { data: insertedData, error: supabaseError } = await supabase
            .from('requests') 
            .insert(requestsToInsert)
            .select('id, section_id, product_number, semi_product, drawing_number, initial_description, master_creator_id'); 

        if (supabaseError) throw supabaseError;

        // ШАГ 2: Создание задач в Bitrix24 ПАРАЛЛЕЛЬНО и обновление Supabase.
        const updatePromises = insertedData.map(async (request) => {
            // 1. Создание задачи в Б24
            const bitrixId = await sendToBitrix24(request); 
            
            // 2. Обновление записи в Supabase ID, полученным от Б24
            await supabase
                .from('requests')
                .update({ bitrix_task_id: bitrixId })
                .eq('id', request.id);
        });

        // Ждем выполнения всех операций по обновлению Bitrix ID
        await Promise.all(updatePromises);

        res.status(201).json({ 
            message: `${insertedData.length} requests and corresponding B24 tasks created successfully`, 
            firstRequestId: insertedData[0].id 
        });

    } catch (error) {
        console.error('FATAL Error creating batch requests and B24 tasks:', error.message);
        res.status(500).json({ error: 'Internal Server Error', detail: error.message });
    }
});


// --- 6. ЗАПУСК СЕРВЕРА ---
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});