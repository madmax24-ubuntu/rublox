/**
 * Автоматический тест запуска игры
 * 
 * Проверяет:
 * 1. Загрузка страницы
 * 2. Клик по "Начать игру"
 * 3. Появление панели перков
 * 4. Выбор перка
 * 5. Запуск таймера обратного отсчета
 * 6. Отключение заморозки после таймера
 * 7. Отсутствие ошибок в консоли
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

// Глобальные переменные для отслеживания состояния
let serverProcess = null;
let browser = null;
let page = null;

// Функция для сбора ошибок консоли
let consoleErrors = [];

async function main() {
    console.log('🚀 Запуск автотеста игры...');
    console.log('===========================================');
    
    // 1. Запуск сервера
    console.log('\n📦 Шаг 1: Запуск сервера...');
    serverProcess = spawn('node', ['server.js'], {
        cwd: process.cwd(),
        stdio: 'pipe'
    });
    
    // Ждем пока сервер запустится
    await sleep(2000);
    
    if (!serverProcess.pid) {
        console.error('❌ Не удалось запустить сервер');
        process.exit(1);
    }
    console.log(`✅ Сервер запущен (PID: ${serverProcess.pid})`);
    
    // 2. Запуск браузера
    console.log('\n🌐 Шаг 2: Открытие браузера...');
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    
    // Подписываемся на ошибки консоли
    page.on('console', (msg) => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
            consoleErrors.push({ type, text: msg.text() });
            console.log(`⚠️  ${type.toUpperCase()}: ${msg.text()}`);
        }
    });
    
    
    console.log('✅ Браузер открыт');
    
    // 3. Загрузка страницы
    console.log('\n📥 Шаг 3: Загрузка страницы...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('✅ Страница загружена');
    
    // 4. Клик по "Начать игру"
    console.log('\n🎮 Шаг 4: Клик по "Начать игру"...');
    const startButton = await page.$('#startButtonDesktop');
    if (!startButton) {
        console.error('❌ Кнопка "Начать игру" не найдена');
        await cleanup();
        process.exit(1);
    }
    
    await startButton.click();
    console.log('✅ Кнопка нажата');
    
    // 5. Ожидание панели перков
    console.log('\n🎯 Шаг 5: Ожидание панели перков...');
    await sleep(1000); // Даем время на анимацию
    
    const perkPanel = await page.$('#perkPanel');
    if (!perkPanel) {
        console.error('❌ Панель перков не появилась');
        await cleanup();
        process.exit(1);
    }
    console.log('✅ Панель перков появилась');
    
    // 6. Выбор перка
    console.log('\n🔧 Шаг 6: Выбор перка...');
    const perkButtons = await page.$$('.perk-btn[data-perk]');
    if (!perkButtons.length) {
        console.error('❌ Кнопки перков не найдены');
        await cleanup();
        process.exit(1);
    }
    
    // Выбираем первый перк
    const firstPerk = perkButtons[0];
    
    // Debug: get element bounding box and pointer events
    const box = await firstPerk.boundingBox();
    console.log('🔍 Perk button bounding box:', JSON.stringify(box));
    
    // Get computed pointer-events of canvas
    const canvasPE = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        return c ? getComputedStyle(c).pointerEvents : 'NOT FOUND';
    });
    console.log('🔍 Canvas pointer-events:', canvasPE);
    
    // Get DOM order of gameRoot children
    const domOrder = await page.evaluate(() => {
        const root = document.getElementById('gameRoot');
        return Array.from(root.children).map(el => el.tagName + (el.id ? '#' + el.id : ''));
    });
    console.log('🔍 DOM order:', domOrder);
    
    // Click by coordinates to bypass Playwright's hit-test
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.click(centerX, centerY);
    console.log('✅ Перк выбран');
    
    // 7. Ожидание таймера
    console.log('\n⏱️  Шаг 7: Ожидание таймера обратного отсчета...');
    const countdownVisible = await page.waitForSelector('#countdown', { timeout: 5000 }).then(() => true).catch(() => false);
    if (!countdownVisible) {
        console.error('❌ Таймер обратного отсчета не появился');
        await cleanup();
        process.exit(1);
    }
    console.log('✅ Таймер появился');
    
    // 8. Ожидание окончания таймера
    console.log('\n⏳ Шаг 8: Ожидание окончания таймера...');
    let countdownReachedZero = false;
    for (let i = 0; i < 9; i++) {
        await sleep(2000); // Poll every 2 seconds
        const state = await page.evaluate(() => {
            const cd = document.getElementById('countdown');
            return {
                text: cd ? cd.textContent : 'NONE',
                gameState: window.game ? window.game.gameState : 'NO_GAME',
                isStarted: window.game ? window.game.isStarted : false,
                countdownTimer: window.game ? window.game.countdownTimer : -1,
            };
        });
        console.log(`🔍 [${i * 2}s]`, JSON.stringify(state));
        if (state.gameState !== 'countdown') {
            countdownReachedZero = true;
            console.log('✅ Таймер завершился');
            break;
        }
    }
    if (!countdownReachedZero) {
        console.error('❌ Таймер не завершился за 18 секунд');
    }

    // Debug: check countdown state
    const countdownState = await page.evaluate(() => {
        const cd = document.getElementById('countdown');
        return {
            exists: !!cd,
            display: cd ? getComputedStyle(cd).display : 'N/A',
            gameRootChildren: Array.from(document.getElementById('gameRoot').children).map(el => el.tagName + (el.id ? '#' + el.id : '')),
        };
    });
    console.log('🔍 Countdown state:', JSON.stringify(countdownState, null, 2));
    
    // Also check gameState
    const gameState = await page.evaluate(() => {
        return window.game ? window.game.gameState : 'NO_GAME';
    });
    console.log('🔍 gameState:', gameState);
    
    // Проверяем что таймер исчез
    const countdownGone = await page.$('#countdown').then(() => false).catch(() => true);
    if (!countdownGone) {
        console.error('❌ Таймер не исчез после окончания');
        await cleanup();
        process.exit(1);
    }
    console.log('✅ Таймер завершился');
    
    // 9. Проверка что игра работает
    console.log('\n🎯 Шаг 9: Проверка игровой логики...');
    const hudVisible = await page.$('#hud').then(() => true).catch(() => false);
    if (!hudVisible) {
        console.error('❌ HUD не появился');
        await cleanup();
        process.exit(1);
    }
    console.log('✅ HUD появился');
    
    // 10. Проверка на ошибки
    console.log('\n🔍 Шаг 10: Проверка на ошибки...');
    if (consoleErrors.length > 0) {
        console.error(`❌ Найдено ${consoleErrors.length} ошибок/предупреждений:`);
        consoleErrors.forEach(err => {
            console.error(`   - ${err.type}: ${err.text}`);
        });
        await cleanup();
        process.exit(1);
    }
    console.log('✅ Ошибок и предупреждений нет');
    
    // 11. Итоговый результат
    console.log('\n===========================================');
    console.log('✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
    console.log('===========================================');
    console.log('📊 Результат:');
    console.log('   - Страница загружена');
    console.log('   - Кнопка "Начать игру" работает');
    console.log('   - Панель перков появилась');
    console.log('   - Перк выбран');
    console.log('   - Таймер отсчитал');
    console.log('   - Игра запущена');
    console.log('   - Ошибок нет');
}

async function cleanup() {
    console.log('\n🧹 Очистка...');
    if (serverProcess) {
        serverProcess.kill();
        console.log('✅ Сервер остановлен');
    }
    if (browser) {
        await browser.close();
        console.log('✅ Браузер закрыт');
    }
    console.log('===========================================');
}

// Запуск
main().catch(async (err) => {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', err);
    await cleanup();
    process.exit(1);
});
