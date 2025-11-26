// server.js - Главный файл Node.js сервера

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

// --- 1. НАСТРОЙКА ---
// Используем порт, который предоставит хостинг (Render)
const PORT = process.env.PORT || 3000; 

// Инициализация Supabase (ключи должны быть в переменных окружения Render!)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("FATAL: SUPABASE_URL или SUPABASE_KEY не определены в переменных окружения.");
    // В случае отсутствия ключей, не запускаем приложение
    process.exit(1); 
}

const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();

// --- 2. MIDDLEWARE ---
app.use(cors()); 
app.use(bodyParser.json());

// --- 3. ОБСЛУЖИВАНИЕ СТАТИЧЕСКИХ ФАЙЛОВ (КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ!) ---
// Определяем абсолютный путь к папке frontend
const frontendPath = path.join(__dirname, '..', 'frontend');
// Обслуживаем статические файлы (CSS, JS, images) из этой папки
app.use(express.static(frontendPath));

// Главный маршрут, который обслуживает корневой файл index.html
app.get('/', (req, res) => {
    // Отправляем index.html из папки frontend
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// --- 4. API МАРШРУТЫ ---

/**
 * GET /api/user/:telegramId
 * Проверяет наличие пользователя по Telegram ID и возвращает его роль.
 */
app.get('/api/user/:telegramId', async (req, res) => {
    const telegramId = req.params.telegramId;
    
    try {
        const { data, error } = await supabase
            .from('users') // Ваша таблица с пользователями и ролями
            .select('role')
            .eq('telegram_id', telegramId)
            .single();

        if (error && error.code === 'PGRST116') { // Пользователь не найден
            return res.status(404).json({ error: 'User not found' });
        }
        if (error) throw error;

        // Возвращаем роль (должна быть 'master' или 'otk')
        res.json({ role: data.role }); 

    } catch (error) {
        console.error('Error fetching user data:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


/**
 * POST /api/request/create
 * Создает новую заявку в таблице.
 */
app.post('/api/request/create', async (req, res) => {
    const { 
        telegram_id, 
        section_id, 
        transformer_type, 
        product_number,
        initial_description,
        semi_product,
        drawing_number
        // Файлы пока не обрабатываем
    } = req.body; 

    // Простая валидация
    if (!telegram_id || !section_id || !product_number) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const { data, error } = await supabase
            .from('requests') // Ваша таблица с заявками
            .insert([{ 
                master_id: telegram_id,
                section_id: section_id,
                transformer_type: transformer_type,
                product_number: product_number,
                initial_description: initial_description,
                semi_product: semi_product,
                drawing_number: drawing_number,
                status: 'Создана' 
            }]);

        if (error) throw error;

        res.status(201).json({ 
            message: 'Request created successfully', 
            requestId: data ? data[0].id : null 
        });

    } catch (error) {
        console.error('Error creating request:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// --- 5. ЗАПУСК СЕРВЕРА ---
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});