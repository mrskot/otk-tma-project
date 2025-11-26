// server.js - Главный файл Node.js сервера (ФИНАЛЬНАЯ ЛОГИКА АВТОРИЗАЦИИ И ПАКЕТНОЙ ОБРАБОТКИ)

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

// --- 1. НАСТРОЙКА И ИНИЦИАЛИЗАЦИЯ ---
const PORT = process.env.PORT || 3000; 
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("FATAL: SUPABASE_URL или SUPABASE_KEY не определены в переменных окружения.");
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

// --- 4. API МАРШРУТЫ ---

/**
 * GET /api/user/:telegramId
 * Проверяет роль пользователя, статус верификации и возвращает данные закрепленного участка.
 */
app.get('/api/user/:telegramId', async (req, res) => {
    const telegramId = req.params.telegramId;
    
    try {
        // Выполняем JOIN с таблицей sections, чтобы получить имя участка
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
            // Пользователь с этим TG ID не найден: требуется PIN-ввод (неавторизован)
            return res.status(401).json({ error: 'User not found or verified', role: 'unverified' });
        }
        if (error) throw error;
        
        if (!user.is_verified) {
             // TG ID найден, но PIN не вводился: требуется PIN-ввод
             return res.status(401).json({ error: 'User requires PIN verification', role: 'unverified' });
        }

        // Если верифицирован, возвращаем роль и данные участка
        res.json({ 
            role: user.role,
            section_id: user.section_id,
            section_name: user.sections ? user.sections.name : null // Возвращаем имя участка
        }); 

    } catch (error) {
        console.error('Error in user verification check:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


/**
 * POST /api/auth/verify-pin
 * Аутентификация по PIN и связывание Telegram ID.
 */
app.post('/api/auth/verify-pin', async (req, res) => {
    const { telegram_id, pin } = req.body;

    if (!telegram_id || !pin) {
        return res.status(400).json({ error: 'Missing Telegram ID or PIN' });
    }

    try {
        // 1. Найти пользователя по PIN
        const { data: user, error } = await supabase
            .from('users') 
            .select('id, role')
            .eq('pin', pin)
            .single();

        if (error && error.code === 'PGRST116') {
            return res.status(401).json({ error: 'Invalid PIN' });
        }
        if (error) throw error;
        
        // 2. Связать Telegram ID, удалить PIN и пометить как верифицированного
        const { error: updateError } = await supabase
            .from('users')
            .update({ 
                telegram_id: telegram_id,
                pin: null, 
                is_verified: true
            })
            .eq('id', user.id); 

        if (updateError) throw updateError;
        
        // 3. Успешный вход
        res.json({ message: 'Authentication successful', role: user.role }); 

    } catch (error) {
        console.error('Error in PIN verification:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


/**
 * GET /api/sections
 * Возвращает список всех участков (для выпадающего списка).
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
 * Создает ОДНУ или НЕСКОЛЬКО заявок (пакетный режим).
 */
app.post('/api/request/create', async (req, res) => {
    
    // UUID участка теперь ОБЯЗАТЕЛЬНО должен приходить с фронтенда
    const { 
        telegram_id, 
        section_id, 
        product_numbers_input, 
        transformer_type, 
        initial_description,
        semi_product,
        drawing_number
    } = req.body; 

    // 1. Валидация
    if (!telegram_id || !product_numbers_input || !section_id) {
        return res.status(400).json({ error: 'Missing required fields (TG ID, Product Numbers, or Section ID)' });
    }
    
    // Парсинг номеров изделий
    const productNumbers = product_numbers_input
        .split(/[,\n]/)
        .map(num => num.trim())
        .filter(num => num.length > 0);

    if (productNumbers.length === 0) {
        return res.status(400).json({ error: 'No valid product numbers found in the input.' });
    }

    const NEW_STATUS = 'new'; 
    const targetSectionId = section_id; 

    // 2. Формирование массива заявок
    const requestsToInsert = productNumbers.map(number => ({
        master_creator_id: telegram_id, 
        section_id: targetSectionId, 
        product_number: number, 
        
        // Общие атрибуты
        transformer_type: transformer_type,
        initial_description: initial_description,
        semi_product: semi_product,
        drawing_number: drawing_number,
        status: NEW_STATUS
    }));
    
    console.log(`Attempting to create ${requestsToInsert.length} requests for user ${telegram_id}.`); 

    // 3. Пакетная вставка в Supabase
    try {
        const { data, error } = await supabase
            .from('requests') 
            .insert(requestsToInsert); 

        if (error) throw error;

        res.status(201).json({ 
            message: `${requestsToInsert.length} requests created successfully`, 
            firstRequestId: data ? data[0].id : null 
        });

    } catch (error) {
        console.error('Error creating batch requests:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// --- 5. ЗАПУСК СЕРВЕРА ---
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});