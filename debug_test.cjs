// Debug Map Test - Умный тест с анализом лога и скриншотами по событиям
// Запуск: node debug_test.cjs

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'debug_output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Камеры по карте - ключевые точки для анализа
let _lastScreenshotTime = Date.now();

const cameraPositions = {
    // Обзор с высоты
    overview_high: { x: 0, y: 350, z: 0, fov: 95, label: 'Обзор сверху' },
    overview_left: { x: -120, y: 200, z: 120, fov: 60, label: 'Обзор слева' },
    overview_right: { x: 120, y: 200, z: 120, fov: 60, label: 'Обзор справа' },
    overview_front: { x: 0, y: 150, z: -180, fov: 65, label: 'Обзор спереди' },
    overview_back: { x: 0, y: 150, z: 180, fov: 65, label: 'Обзор сзади' },

    // Биомы - основные
    citadel_center: { x: -80, y: 30, z: 80, fov: 60, label: 'Цитадель центр' },
    citadel_edge: { x: -110, y: 25, z: 110, fov: 55, label: 'Цитадель край' },
    crystal_center: { x: 80, y: 30, z: 80, fov: 60, label: 'Кристальная гротовка' },
    crystal_edge: { x: 110, y: 25, z: 110, fov: 55, label: 'Кристальная край' },
    wastes_center: { x: -80, y: 30, z: -80, fov: 60, label: 'Пустоши центр' },
    wastes_edge: { x: -110, y: 25, z: -110, fov: 55, label: 'Пустоши край' },
    forest_center: { x: 80, y: 30, z: -80, fov: 60, label: 'Светящийся лес' },
    forest_edge: { x: 110, y: 25, z: -110, fov: 55, label: 'Лес край' },

    // Ворота и разделители
    gate_north: { x: 0, y: 15, z: -25, fov: 60, label: 'Ворота север' },
    gate_south: { x: 0, y: 15, z: 25, fov: 60, label: 'Ворота юг' },
    gate_west: { x: -25, y: 15, z: 0, fov: 60, label: 'Ворота запад' },
    gate_east: { x: 25, y: 15, z: 0, fov: 60, label: 'Ворота восток' },

    // Центр
    spawn_pad: { x: 0, y: 10, z: 5, fov: 70, label: 'Спавн платформа' },
    cornucopia: { x: 20, y: 15, z: 20, fov: 65, label: 'Корнукопия' },
    center_path: { x: 0, y: 15, z: 50, fov: 60, label: 'Путь от центра' },

    // Края арены
    edge_ne: { x: 130, y: 40, z: 130, fov: 55, label: 'Арена край СВ' },
    edge_nw: { x: -130, y: 40, z: 130, fov: 55, label: 'Арена край СЗ' },
    edge_se: { x: 130, y: 40, z: -130, fov: 55, label: 'Арена край ЮВ' },
    edge_sw: { x: -130, y: 40, z: -130, fov: 55, label: 'Арена край ЮЗ' },
};

const keys = Object.keys(cameraPositions);

// Ключевые события для анализа - по ним принимаем решение о скриншоте
const logKeywords = {
    'map_start': { pattern: /Инициализация|Генерация мира|map ready/, action: 'start', desc: 'Начало генерации' },
    'terrain': { pattern: /Создание ландшафта|Ландшафт готов/, action: 'terrain', desc: 'Ландшафт' },
    'arena': { pattern: /Арена построена|arena floor done/, action: 'arena', desc: 'Арена' },
    'cornucopia': { pattern: /cornucopia done|Корнукопия/, action: 'cornucopia', desc: 'Корнукопия' },
    'inner_ring': { pattern: /inner ring done|Внутреннее кольцо/, action: 'inner_ring', desc: 'Внутреннее кольцо' },
    'biome_paths': { pattern: /biome paths done|Пути биомов/, action: 'biome_paths', desc: 'Пути биомов' },
    'citadel': { pattern: /citadel done|Цитадели/, action: 'citadel', desc: 'Руины Цитадели' },
    'crystal': { pattern: /crystal.*done|Хрусталь/, action: 'crystal', desc: 'Хрустальная гротовка' },
    'wastes': { pattern: /wastes done|Пустоши/, action: 'wastes', desc: 'Пылающие пустоши' },
    'forest': { pattern: /forest done|Лес/, action: 'forest', desc: 'Светящийся лес' },
    'decorations': { pattern: /decorations done|Декорации/, action: 'decorations', desc: 'Декорации' },
    'biome_trees': { pattern: /biome trees done|Зоны обозначены/, action: 'biome_trees', desc: 'Деревья биомов' },
    'particles': { pattern: /particle systems done|Частицы/, action: 'particles', desc: 'Системы частиц' },
    'traps': { pattern: /traps done|ловушки/, action: 'traps', desc: 'Ловушки' },
    'fog': { pattern: /fog zones done/, action: 'fog', desc: 'Зоны тумана' },
    'radiation': { pattern: /radiation zones done/, action: 'radiation', desc: 'Радиационные зоны' },
    'loot': { pattern: /loot data done|Лут/, action: 'loot', desc: 'Лут' },
    'map_ready': { pattern: /Мир готов|map ready/, action: 'ready', desc: 'Карта готова' },
    'game_start': { pattern: /startGame|Запуск|Запуск game/i, action: 'game_start', desc: 'Начало игры' },
    'countdown': { pattern: /countdown|таймер|секунд/, action: 'countdown', desc: 'Обратный отсчёт' },
    'spawn': { pattern: /spawn| spawning|Спавн/, action: 'spawn', desc: 'Спавн игроков' },
    'playing': { pattern: /playing|играет|Игра/i, action: 'playing', desc: 'Игра началась' },
    'error': { pattern: /ERROR|error:|Failed|не найдена|is not a function/, action: 'error', desc: 'ОШИБКА' },
    'warn': { pattern: /WARN|warn:/, action: 'warn', desc: 'ПРЕДУПРЕЖДЕНИЕ' },
};

async function runDebugTest() {
    console.log('═'.repeat(70));
    console.log('  🔍 Debug Map Test - Умное тестирование с анализом лога');
    console.log('═'.repeat(70));
    console.log(`📂 Output: ${outputDir}\n`);

    // Запускаем сервер
    const { spawn } = require('child_process');
    const python = process.platform === 'win32' ? 'python' : 'python3';
    const server = spawn(python, ['-m', 'http.server', '8080', '--bind', '127.0.0.1']);

    await new Promise(r => setTimeout(r, 2000));
    console.log('✅ HTTP сервер запущен\n');

    // Запускаем браузер
    const browser = await chromium.launch({ headless: false, slowMo: 0 });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    const logs = [];
    const screenshots = [];
    let currentCamera = null;
    let gameStarted = false;
    let mapReady = false;
    let _lastScreenshotTime = Date.now();

    // Слушаем логи
    page.on('console', (msg) => {
        const text = msg.text();
        logs.push({ time: Date.now(), text, type: msg.type() });

        const icon = msg.type() === 'error' ? '❌' : msg.type() === 'warn' ? '⚠️' : '📝';
        const time = new Date().toLocaleTimeString();

        // Проверяем на ключевые события
        for (const [key, config] of Object.entries(logKeywords)) {
            if (config.pattern.test(text)) {
                const desc = `🔔 [${config.action}] ${config.desc}`;
                console.log(`${time} ${icon} ${text.substring(0, 120)}`);
                console.log(`  ${desc}`);

                // Принимаем решение: делать скриншот?
                const shouldScreenshot = shouldTakeScreenshot(key, config.action);
                if (shouldScreenshot && Date.now() - _lastScreenshotTime > 3000) {
                    _lastScreenshotTime = Date.now();
                    console.log(`  📸 КЛЮЧЕВОЕ СОБЫТИЕ: ${config.action} - делаем скриншот!`);

                    // Переключаем камеру
                    const camName = getCameraForEvent(config.action);
                    const cam = cameraPositions[camName];
                    if (cam) {
                        switchCamera(page, cam, key);
                    }

                    // Ждём установку камеры
                    setTimeout(async () => {
                        const ss = await page.screenshot({ path: path.join(outputDir, `event_${config.action}_${Date.now()}.png`) });
                        screenshots.push({ time: Date.now(), event: config.action, camera: camName, desc: config.desc, size: ss.length });
                        console.log(`  💾 Скриншот сохранён: event_${config.action}_${camName}.png`);
                    }, 500);
                }
                break;
            }
        }

        // Всегда логируем ошибки
        if (msg.type() === 'error' || msg.type() === 'warn') {
            console.log(`  ⚠️ ${msg.type()}: ${text.substring(0, 150)}`);
        }
    });

    page.on('pageerror', (err) => {
        console.log(`\n  ❌ PAGE ERROR: ${err}`);
        logs.push({ time: Date.now(), text: `PageError: ${err}`, type: 'error' });
    });

    // Загрузка страницы
    console.log('🌐 Загрузка игры...');
    await page.goto('http://127.0.0.1:8080/');
    await page.waitForSelector('.start-btn', { timeout: 10000 });
    console.log('✅ Страница загружена\n');

    // Первый скриншот - меню
    console.log('📸 Скриншот меню...');
    await page.screenshot({ path: path.join(outputDir, '00_menu.png') });
    screenshots.push({ time: Date.now(), event: 'menu', camera: 'none', desc: 'Меню' });

    // Клик "Начать игру"
    console.log('🚀 Нажимаем "Начать игру"...');
    await page.$eval('.start-btn', btn => btn.click());
    console.log('✅ Клик сделан\n');

    // Мониторинг загрузки
    console.log('⏳ Мониторинг генерации карты...');
    const startTime = Date.now();

    // Периодически проверяем прогресс
    const progressCheck = setInterval(async () => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        try {
            const loadingText = await page.$eval('.loading-screen p', el => el.textContent).catch(() => '---');
            process.stdout.write(`\r  ⏱️ ${elapsed}с | ${loadingText}   `);
        } catch (e) {}
    }, 1000);

    // Ожидание загрузки карты
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 120000 }).catch(() => {
        console.log('\n✅ Загрузка завершена');
    });

    clearInterval(progressCheck);
    const mapTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✅ Карта сгенерирована за ${mapTime} секунд\n`);

    // Скриншот после генерации
    await page.waitForTimeout(2000);
    console.log('📸 Скриншот: Карта готова');
    await page.screenshot({ path: path.join(outputDir, '01_map_ready.png') });
    screenshots.push({ time: Date.now(), event: 'map_ready', camera: 'overview_high', desc: 'Карта готова' });
    await switchCamera(page, cameraPositions.overview_high, 'map_ready');

    // Ожидание начала игры
    console.log('\n⏳ Ожидание начала игры...');
    let playingDetected = false;

    const gameCheck = setInterval(async () => {
        try {
            // Проверяем элементы игры
            const hud = await page.$('#hud');
            const countdown = await page.$('.countdown');
            const minimap = await page.$('.minimap');

            if (hud && !gameStarted) {
                gameStarted = true;
                console.log('\n🎮 ИГРА НАЧАЛАСЬ!');
                console.log('📸 Скриншот: Начало игры');
                await page.screenshot({ path: path.join(outputDir, '02_game_started.png') });
                screenshots.push({ time: Date.now(), event: 'game_started', camera: 'spawn_pad', desc: 'Начало игры' });
                await switchCamera(page, cameraPositions.spawn_pad, 'game_started');
            }

            if (countdown || countdown) {
                const ct = await page.$eval('.countdown span', el => el.textContent).catch(() => '');
                if (ct) {
                    process.stdout.write(`\r  ⏱️ ${ct}с до начала...   `);
                }
            }

            if (minimap || hud) {
                playingDetected = true;
                clearInterval(gameCheck);
            }
        } catch (e) {}
    }, 1000);

    // Ждём 30 секунд активной игры
    console.log('\n⏳ Мониторинг 30 секунд игры...');
    await page.waitForTimeout(30000);

    // Финальные скриншоты
    console.log('\n📸 Финальные скриншоты...');
    const finalCameras = ['citadel_center', 'crystal_center', 'wastes_center', 'forest_center', 'edge_ne', 'edge_sw'];
    for (const camName of finalCameras) {
        const cam = cameraPositions[camName];
        if (cam) {
            await switchCamera(page, cam, 'final');
            await page.waitForTimeout(1000);
            await page.screenshot({ path: path.join(outputDir, `final_${camName}.png`) });
            screenshots.push({ time: Date.now(), event: 'final', camera: camName, desc: cam.label });
            console.log(`  📷 ${cam.label}`);
        }
    }

    // Анализ логов
    const errors = logs.filter(l => l.type === 'error');
    const warnings = logs.filter(l => l.type === 'warn');

    console.log('\n' + '═'.repeat(70));
    console.log('  📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ');
    console.log('═'.repeat(70));

    console.log(`\n⏱️  Время генерации карты: ${mapTime}с`);
    console.log(`📷 Скриншотов: ${screenshots.length}`);
    console.log(`📋 Записей логов: ${logs.length}`);
    console.log(`❌ Ошибки: ${errors.length}`);
    console.log(`⚠️  Предупреждения: ${warnings.length}`);

    // Ключевые события
    console.log('\n🔔 Ключевые события (по логу):');
    const eventOrder = [];
    for (const log of logs) {
        for (const [key, config] of Object.entries(logKeywords)) {
            if (config.pattern.test(log.text) && !eventOrder.includes(key)) {
                eventOrder.push(key);
                console.log(`  ✅ ${key}: ${config.desc}`);
                break;
            }
        }
    }

    // Ошибки
    if (errors.length > 0) {
        console.log('\n❌ Ошибки в логе:');
        errors.slice(0, 10).forEach(err => {
            console.log(`  ${err.text.substring(0, 120)}`);
        });
        if (errors.length > 10) console.log(`  ... и ещё ${errors.length - 10}`);
    }

    // Сохраняем полный отчёт
    const reportFile = path.join(outputDir, 'report.txt');
    fs.writeFileSync(reportFile,
        'Debug Map Test - Отчёт\n' +
        '═'.repeat(60) + '\n' +
        `Время: ${new Date().toLocaleString()}\n` +
        `Время генерации: ${mapTime}с\n` +
        `Скриншотов: ${screenshots.length}\n` +
        `Ошибок логов: ${errors.length}\n\n` +
        'Последовательность событий:\n' +
        eventOrder.map((key, i) => `  ${i + 1}. ${key} (${logKeywords[key]?.desc || key})`).join('\n') +
        '\n\nСкриншоты:\n' +
        screenshots.map((ss, i) => `  ${i + 1}. [${new Date(ss.time).toLocaleTimeString()}] ${ss.event} (${ss.camera}) - ${ss.desc}`).join('\n') +
        '\n\nПолные логи:\n' +
        '═'.repeat(60) + '\n' +
        logs.map(l => `[${new Date(l.time).toLocaleTimeString()}] [${l.type.toUpperCase()}] ${l.text}`).join('\n') +
        '\n'
    );

    console.log(`\n💾 Полный отчёт: ${reportFile}`);
    console.log(`📁 Все файлы: ${outputDir}\n`);

    console.log('👀 Браузер открыт для ручной проверки');
    console.log('   Нажмите Enter для закрытия...\n');

    await new Promise(resolve => {
        process.stdin.once('data', () => resolve());
        setTimeout(resolve, 60000);
    });

    await browser.close();
    server.kill();

    console.log('✅ Debug тест завершён!\n');
}

// Функция переключения камеры
async function switchCamera(page, cam, event) {
    try {
        await page.evaluate((c) => {
            if (window.gameInstance && window.gameInstance.camera) {
                window.gameInstance.camera.position.set(c.x, c.y, c.z);
                window.gameInstance.camera.lookAt(c.lookAt?.x || 0, c.lookAt?.y || 0, c.lookAt?.z || 0);
                window.gameInstance.camera.fov = c.fov || 60;
                window.gameInstance.camera.updateProjectionMatrix();
                window.gameInstance.render();
            }
        }, cam);
    } catch (e) {
        console.log(`  ⚠️ Не удалось переключить камеру ${cam.name}: ${e.message}`);
    }
}

// Решение: нужно ли делать скриншот?
function shouldTakeScreenshot(eventKey, action) {
    // Важные события - всегда скриншот
    const alwaysScreenshot = [
        'map_start', 'terrain', 'arena', 'cornucopia',
        'citadel', 'crystal', 'wastes', 'forest',
        'decorations', 'biome_trees', 'map_ready',
        'game_start', 'countdown', 'spawn', 'playing',
        'error', 'warn'
    ];

    // Менее важные - только если прошло время
    const lessImportant = [
        'inner_ring', 'biome_paths', 'particles', 'traps',
        'fog', 'radiation', 'loot'
    ];

    return alwaysScreenshot.includes(action) || Date.now() - _lastScreenshotTime > 5000;
}

// Какую камеру выбрать для события?
function getCameraForEvent(action) {
    const cameraMap = {
        'map_start': 'overview_high',
        'terrain': 'overview_high',
        'arena': 'spawn_pad',
        'cornucopia': 'cornucopia',
        'citadel': 'citadel_center',
        'crystal': 'crystal_center',
        'wastes': 'wastes_center',
        'forest': 'forest_center',
        'decorations': 'center_path',
        'biome_trees': 'citadel_center',
        'particles': 'overview_left',
        'traps': 'gate_north',
        'fog': 'overview_right',
        'radiation': 'wastes_edge',
        'loot': 'cornucopia',
        'map_ready': 'overview_high',
        'game_start': 'spawn_pad',
        'countdown': 'overview_high',
        'spawn': 'overview_high',
        'playing': 'overview_high',
        'error': 'citadel_center',
        'warn': 'overview_right',
    };
    return cameraMap[action] || 'overview_high';
}

// Запуск
runDebugTest().catch(err => {
    console.error('❌ Критическая ошибка:', err);
    process.exit(1);
});
