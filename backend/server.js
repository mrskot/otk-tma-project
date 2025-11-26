// server.js - ФИНАЛЬНАЯ ВЕРСИЯ: PIN, СЕКЦИИ, BATCH, B24 И ПАНЕЛЬ АДМИНА

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const nodeFetch = require('node-fetch'); 

// --- 1. НАСТРОЙКА И ИНИЦИАЛИЗАЦИЯ ---
const PORT = process.env.PORT || 3000; 
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

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

// --- 4. КОНФИГУРАЦИЯ ИНТЕГРАЦИИ С BITRIX24 ---

const PRIORITY_MAPPING = {
    'urgent': { text: '!!! ЭКСТРЕННО !!!', b24_priority: 2, deadline_hours: 1 },
    'as_soon_as_possible': { text: 'Как можно скорее', b24_priority: 2, deadline_hours: 4 },
    'before_lunch': { text: 'До обеда', b24_priority: 1, deadline_hours: 4 }, 
    'after_lunch': { text: 'После обеда', b24_priority: 1, deadline_hours: 6 },
    'today': { text: 'Сегодня', b24_priority: 1, deadline_hours: 8 },
    'tomorrow': { text: 'Завтра', b24_priority: 0, deadline_hours: 24 },
    'this_week': { text: 'На этой неделе', b24_priority: 0, deadline_hours: 48 },
    'working_order': { text: 'В рабочем порядке', b24_priority: 0, deadline_hours: 72 } 
};

function getPriorityDetails(key) {
    return PRIORITY_MAPPING[key] || PRIORITY_MAPPING['working_order'];
}

/**
 * Отправляет данные заявки в Bitrix24 для создания задачи.
 */
async function sendToBitrix24(requestData) {
    const details = getPriorityDetails(requestData.desired_priority);
    const deadlineTime = new Date(Date.now() + details.deadline_hours * 3600 * 1000).toISOString();

    const bitrixPayload = {
        fields: {
            TITLE: `[${details.text}] Приемка изделия: ${requestData.product_number} (${requestData.semi_product})`,
            DESCRIPTION: `Участок ID: ${requestData.section_id}\nМастер ID: ${requestData.master_creator_id}\nПриоритет приёмки: ${details.text}\nЧертеж: ${requestData.drawing_number || 'N/A'}\nОписание: ${requestData.initial_description || ''}`,
            PRIORITY: details.b24_priority,
            DEADLINE: deadlineTime, 
        },
    };

    try {
        if (!process.env.BITRIX24_WEBHOOK_URL) {
            console.warn("WARNING: Using mock Bitrix24 task ID. Set BITRIX24_WEBHOOK_URL in environment.");
            return `B24_MOCK_ID_${Date.now()}`; 
        }

        const response = await nodeFetch(BITRIX24_WEBHOOK_URL, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bitrixPayload)
        });

        const result = await response.json();
        
        if (result.error) {
            console.error('Bitrix24 API Error:', result.error_description);
            return `B24_ERROR_${result.error_description}`;
        }

        return result.result; 

    } catch (error) {
        console.error('Failed to communicate with Bitrix24:', error.message);
        return `B24_COMM_ERROR_${Date.now()}`;
    }
}


// --- 5. API МАРШРУТЫ ---

/**
 * GET /api/user/:telegramId - Проверка роли, верификации и данных участка
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
 * POST /api/admin/add-user - Добавление нового пользователя (Администратор)
 * Создает нового пользователя или обновляет существующего, устанавливая PIN.
 */
app.post('/api/admin/add-user', async (req, res) => {
    const { telegram_id, role, section_id, pin } = req.body;

    if (!telegram_id || !role || !section_id || !pin) {
        return res.status(400).json({ error: 'Missing required fields (Telegram ID, Role, Section ID, or PIN)' });
    }

    try {
        // Проверяем, существует ли пользователь по TG ID
        const { data: existingUser, error: fetchError } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_id', telegram_id)
            .single();
        
        // Данные для вставки или обновления
        const userPayload = {
            telegram_id: telegram_id,
            role: role,
            section_id: section_id,
            pin: pin,
            is_verified: false // Новый пользователь всегда не верифицирован
        };
        
        let result;

        if (existingUser) {
            // Обновление существующего пользователя (сброс PIN и верификации)
            result = await supabase
                .from('users')
                .update(userPayload)
                .eq('id', existingUser.id)
                .select();
        } else {
            // Вставка нового пользователя
            result = await supabase
                .from('users')
                .insert([userPayload])
                .select();
        }

        if (result.error) throw result.error;

        res.status(201).json({ 
            message: `User ${telegram_id} added/updated successfully with PIN: ${pin}.`,
            id: result.data[0].id
        });

    } catch (error) {
        console.error('Error adding user:', error.message);
        // Если ошибка связана с уникальностью (например, PIN уже занят), сообщаем об этом
        let detail = error.message.includes('unique constraint') ? 'PIN already in use or user already exists.' : error.message;
        res.status(500).json({ error: 'Internal Server Error', detail: detail });
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
 * POST /api/request/create - Создает пакет заявок и задачи в B24
 */
app.post('/api/request/create', async (req, res) => {
    
    const { 
        telegram_id, 
        section_id, 
        product_numbers_input, 
        transformer_type, 
        initial_description,
        semi_product,
        drawing_number,
        desired_priority
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
        status: NEW_STATUS,
        desired_priority: desired_priority
    }));
    
    console.log(`Attempting to create ${requestsToInsert.length} requests for user ${telegram_id}.`); 

    try {
        // ШАГ 1: Создание записей в Supabase.
        const { data: insertedData, error: supabaseError } = await supabase
            .from('requests') 
            .insert(requestsToInsert)
            .select('id, section_id, product_number, semi_product, drawing_number, initial_description, master_creator_id, desired_priority'); 

        if (supabaseError) throw supabaseError;

        // ШАГ 2: Создание задач в Bitrix24 ПАРАЛЛЕЛЬНО и обновление Supabase.
        const updatePromises = insertedData.map(async (request) => {
            const bitrixId = await sendToBitrix24(request); 
            
            await supabase
                .from('requests')
                .update({ bitrix_task_id: bitrixId })
                .eq('id', request.id);
        });

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