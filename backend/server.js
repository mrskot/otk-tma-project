/**
 * server.js - Backend-сервер Node.js/Express.
 *
 * * Включает обслуживание статического фронтенда (монолитный деплой).
 * * Использует переменные окружения (.env) для Supabase.
 * * Содержит исправленную логику аутентификации (.limit(1)).
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path'); // Добавлен для работы с путями
require('dotenv').config(); 
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================================
// 1. КОНФИГУРАЦИЯ SUPABASE
// ===============================================

// Используем переменные окружения
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("! ОШИБКА КОНФИГУРАЦИИ: SUPABASE_URL или SUPABASE_KEY не найдены в .env");
    // На хостинге (Render) эта проверка будет использовать переменные окружения, установленные там.
    if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
    }
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ===============================================
// 2. MIDDLEWARE
// ===============================================

app.use(cors()); 
app.use(bodyParser.json()); 

// ===============================================
// 3. ОБСЛУЖИВАНИЕ СТАТИЧЕСКИХ ФАЙЛОВ (ФРОНТЕНД)
// ===============================================

const projectRoot = path.resolve(__dirname, '..'); 

// 1. Обслуживание статических файлов из папки frontend
app.use('/frontend', express.static(projectRoot + '/frontend'));

// 2. Маршрут для корневого файла TMA (чтобы Telegram мог загрузить индекс)
app.get('/', (req, res) => {
    res.sendFile(projectRoot + '/frontend/index.html'); 
});

// ===============================================
// 4. API МАРШРУТЫ
// ===============================================

// --- 4.1. ЭНДПОИНТ: Получение информации о пользователе (Аутентификация) ---
app.get('/api/user/:telegramId', async (req, res) => {
    const { telegramId } = req.params;
    
    // Используем .limit(1) для надежности
    const { data: userDataArray, error } = await supabase
        .from('users')
        .select('role')
        .eq('telegram_id', telegramId)
        .limit(1); 

    if (error) {
        console.error('Ошибка Supabase при получении роли:', error);
        return res.status(500).json({ error: 'Ошибка сервера при получении данных пользователя.' });
    }
    
    if (!userDataArray || userDataArray.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден в системе. Проверьте ID в Supabase.' });
    }

    res.json({ role: userDataArray[0].role });
});


// --- 4.2. ЭНДПОИНТ: Создание новой заявки ---
app.post('/api/request/create', async (req, res) => {
    const requestData = req.body;

    const {
        telegram_id,
        section_id,
        transformer_type,
        product_number,
        initial_description,
        semi_product,
        drawing_number
    } = requestData;

    // ... (остальная логика для создания заявки)

    // Имитация создания задачи в Битрикс24
    const bitrixTaskId = Math.floor(Math.random() * 100000); 

    // Шаг 1: Получение master_creator_id (UUID) по telegram_id
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id)
        .limit(1);

    if (userError || !userData || userData.length === 0) {
        console.error('Ошибка: Пользователь-создатель не найден.');
        return res.status(400).json({ error: 'Пользователь-создатель не найден в базе данных.' });
    }
    
    const masterCreatorId = userData[0].id;

    // Шаг 2: Сохранение заявки в Supabase
    const { data: savedRequest, error: dbError } = await supabase
        .from('requests')
        .insert([
            {
                status: 'new',
                section_id: section_id,
                master_creator_id: masterCreatorId,
                transformer_type: transformer_type,
                product_number: product_number,
                initial_description: initial_description,
                semi_product: semi_product,
                drawing_number: drawing_number,
                bitrix_task_id: bitrixTaskId
            }
        ])
        .select();

    if (dbError) {
        console.error('Ошибка создания заявки в базе:', dbError);
        return res.status(500).json({ error: 'Ошибка создания заявки: ' + dbError.message });
    }

    // Имитация уведомления в Telegram 
    console.log(`Имитация публикации в канале: ${section_id}`);

    // Шаг 3: Успешный ответ
    res.status(201).json({ 
        message: 'Заявка успешно создана и отправлена в Битрикс24.',
        request: savedRequest[0] 
    });
});


// ===============================================
// 5. ЗАПУСК СЕРВЕРА
// ===============================================

app.listen(PORT, () => {
    console.log("==================================================");
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log("==================================================");
});