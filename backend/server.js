// server.js - Главный файл Node.js сервера (Финальный фикс: master_creator_id (text) и UUID моки)

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

// --- 1. НАСТРОЙКА ---
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
 */
app.get('/api/user/:telegramId', async (req, res) => {
    const telegramId = req.params.telegramId;
    
    try {
        const { data, error } = await supabase
            .from('users') 
            .select('role')
            .eq('telegram_id', telegramId)
            .single();

        if (error && error.code === 'PGRST116') { 
            return res.status(404).json({ error: 'User not found' });
        }
        if (error) throw error;

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
    
    // ВРЕМЕННЫЕ МОК-ЗНАЧЕНИЯ ДЛЯ ОБЯЗАТЕЛЬНЫХ UUID-ПОЛЕЙ
    // ЭТО НУЖНО, ПОТОМУ ЧТО ОНИ NOT NULL В ВАШЕЙ БД
    const MOCK_SECTION_UUID = 'eafc1199-14b7-4127-bfe6-4afc188d6856'; 

    const { 
        telegram_id, 
        transformer_type, 
        product_number,
        initial_description,
        semi_product,
        drawing_number
    } = req.body; 

    // Простая валидация 
    if (!telegram_id || !product_number) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const NEW_STATUS = 'new'; 
    
    const payload = {
        // master_creator_id: Теперь text, заполняем TG ID
        master_creator_id: telegram_id, 
        
        // section_id: UUID, заполняем моком
        section_id: MOCK_SECTION_UUID, 
        
        // otk_assignee_id: UUID, заполняем моком
        otk_assignee_id: MOCK_OTK_ASSIGNEE_UUID, 
        
        transformer_type: transformer_type,
        product_number: product_number,
        initial_description: initial_description,
        semi_product: semi_product,
        drawing_number: drawing_number,
        status: NEW_STATUS
    };
    
    console.log("Payload to Supabase:", payload); 

    try {
        const { data, error } = await supabase
            .from('requests') 
            .insert([payload]);

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