<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TMA-ERP Production Manager</title>
    <link rel="stylesheet" href="style.css">
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; color: #333; }
        header { background-color: #4a76a8; color: white; padding: 15px; text-align: center; }
        main { padding: 20px; max-width: 800px; margin: 0 auto; }
        .panel-section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin-bottom: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="text"], input[type="password"], input[type="number"], select, textarea { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        .btn { padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; }
        .btn-primary { background-color: #007bff; color: white; }
        .btn-secondary { background-color: #6c757d; color: white; }
        .btn-success { background-color: #28a745; color: white; }
        .btn-danger { background-color: #dc3545; color: white; }
        .btn-logout { background-color: #dc3545; color: white; float: right; margin-top: -30px; }
        .alert-success { background-color: #d4edda; color: #155724; padding: 10px; border: 1px solid #c3e6cb; border-radius: 4px; }
        .alert-error { background-color: #f8d7da; color: #721c24; padding: 10px; border: 1px solid #f5c6cb; border-radius: 4px; }
        .section-choice-buttons button { margin-bottom: 10px; }
        footer { text-align: center; padding: 10px; color: #666; font-size: 0.8em; }
    </style>
</head>
<body>

    <header>
        <h1>TMA-ERP: Управление Производством</h1>
        <div id="user-info" style="padding-bottom: 10px;">
            <p style="margin: 0; display: inline-block;">Роль: <span id="role-display"></span> | Участок: <span id="section-display"></span></p>
            <button type="button" class="btn btn-logout" onclick="logout()">Выход</button>
        </div>
    </header>

    <main>
        
        <div id="pin-auth-panel" class="panel-section panel">
            <h2>Авторизация по PIN-коду</h2>
            <p>Введите ваш PIN-код, чтобы начать работу.</p>
            <form id="pin-form">
                <div class="form-group">
                    <label for="pin-input">PIN-код (4 цифры):</label>
                    <input type="password" id="pin-input" placeholder="****" required pattern="\d{4,4}">
                </div>
                <button type="submit" class="btn btn-primary">Войти</button>
            </form>
            <div id="pin-message" class="alert" style="display:none; margin-top: 10px;"></div>
        </div>

        <div id="admin-panel" class="panel-section panel" style="display:none;">
            <h2 id="admin-title-display">👑 Панель Администратора</h2>
            <p>Ваш Telegram ID: <span id="admin-tg-id-display"></span></p>

            <hr style="margin: 20px 0;">

            <h3>⚙️ Управление системой</h3>
            <div class="section-choice-buttons">
                <button type="button" class="btn btn-primary" onclick="showPanel('add-user-section')">Пользователи</button>
                <button type="button" class="btn btn-secondary" onclick="showPanel('add-section-panel')">Участки</button>
                <button type="button" class="btn btn-secondary" onclick="showPanel('add-pf-panel')">Типы ПФ / Изделия</button>
            </div>
            
            <hr style="margin: 20px 0;">

            <h3>📝 Мониторинг</h3>
            <div class="section-choice-buttons">
                <button type="button" class="btn btn-success" onclick="showPanel('create-request-section')">Создать Заявку (Тест)</button>
                <button type="button" class="btn btn-info" onclick="showPanel('stats-panel')">Просмотреть Статистику</button>
            </div>
        </div>

        <div id="add-user-section" class="panel-section panel" style="display:none;">
            <h2>👤 Управление Пользователями</h2>
            
            <h3>➕ Добавить нового пользователя</h3>
            <form id="add-user-form">
                <div class="form-group">
                    <label for="user-role">Роль:</label>
                    <select id="user-role" required class="role-select">
                        <option value="master">Мастер</option>
                        <option value="otk">ОТК</option>
                        <option value="admin">Администратор</option>
                        <option value="super_admin">Супер Администратор</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="user-section">Участок:</label>
                    <select id="user-section" class="section-select">
                        </select>
                </div>
                <button type="submit" class="btn btn-primary">Сгенерировать PIN и Добавить</button>
            </form>
            <div id="add-user-message" class="alert" style="display:none; margin-top: 10px;"></div>

            <h3>📋 Список пользователей</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                <thead>
                    <tr style="background-color: #f2f2f2;"><th>ID</th><th>Роль</th><th>TG ID</th><th>PIN</th><th>Участок</th><th>Действие</th></tr>
                </thead>
                <tbody id="users-table-body">
                    </tbody>
            </table>

            <button type="button" class="btn btn-secondary" style="margin-top: 15px;" onclick="showPanel('admin-panel')">← Назад</button>
        </div>

        <div id="add-section-panel" class="panel-section panel" style="display:none;">
            <h2>🏢 Управление Участками</h2>
            
            <h3>➕ Добавить новый участок</h3>
            <form id="add-section-form">
                <div class="form-group">
                    <label for="section-name-input">Название участка:</label>
                    <input type="text" id="section-name-input" placeholder="Например: Цех 1.1, Сборка" required>
                </div>
                <button type="submit" class="btn btn-primary">Добавить Участок</button>
            </form>
            <div id="add-section-message" class="alert" style="display:none; margin-top: 10px;"></div>

             <h3>📋 Список участков</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                <thead>
                    <tr style="background-color: #f2f2f2;"><th>ID</th><th>Название</th><th>Действие</th></tr>
                </thead>
                <tbody id="sections-table-body">
                    </tbody>
            </table>

            <button type="button" class="btn btn-secondary" style="margin-top: 15px;" onclick="showPanel('admin-panel')">← Назад</button>
        </div>

        <div id="add-pf-panel" class="panel-section panel" style="display:none;">
            <h2>➕ Добавить Тип ПФ / Изделия (Заглушка)</h2>
            <p>Эта панель будет содержать форму для добавления новых типов полуфабрикатов или изделий.</p>
            <button type="button" class="btn btn-secondary" onclick="showPanel('admin-panel')">← Назад</button>
        </div>

        <div id="stats-panel" class="panel-section panel" style="display:none;">
            <h2>📊 Статистика Заявок</h2>
            
            <div class="section-choice-buttons">
                <button type="button" class="btn btn-primary" onclick="loadStats('all')">Все заявки</button>
                <button type="button" class="btn btn-secondary" onclick="loadStats('in_progress')">В работе / На проверке</button>
                <button type="button" class="btn btn-secondary" onclick="loadStats('accepted_today')">Принято сегодня</button>
            </div>
            
            <div id="stats-results" style="margin-top: 20px;">
                Загрузка...
            </div>

            <button type="button" class="btn btn-secondary" style="margin-top: 15px;" onclick="showPanel('admin-panel')">← Назад</button>
        </div>

        <div id="create-request-section" class="panel-section panel" style="display:none;">
            <h2>📝 Создание Заявки (Тест)</h2>
            <p>Эта панель будет использоваться Мастерами для создания заявок.</p>
            <button type="button" class="btn btn-secondary" style="margin-top: 15px;" onclick="goHome()">← На главную</button>
        </div>

        <div id="main-panel" class="panel-section panel" style="display:none;">
            <h2>🛠️ Ваши Заявки</h2>
            <div id="requests-list">
                </div>
            <p style="margin-top: 20px;">*Здесь будет логика отображения заявок, доступная Мастеру/ОТК.</p>
        </div>

    </main>

    <footer>
        <p>&copy; 2025 TMA-ERP | Разработано для производства</p>
    </footer>

    <script src="app.js"></script>
</body>
</html>