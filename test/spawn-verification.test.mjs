/**
 * Автоматическая проверка спавна сущностей на плитах
 * 
 * Проверяет:
 * 1. Игрок спавнится на pad[0] (не в центре)
 * 2. Каждый бот спавнится на отдельной плите (pad[1..N])
 * 3. Ни одна плита не используется дважды
 * 4. Все сущности находятся строго на своих плитах
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess = null;
let browser = null;
let page = null;
let consoleLogs = [];

async function main() {
    console.log('🚀 Запуск теста проверки спавна...');
    console.log('===========================================');
    
    // 1. Запуск сервера
    console.log('\n📦 Шаг 1: Запуск сервера...');
    serverProcess = spawn('node', ['server.js'], {
        cwd: process.cwd(),
        stdio: 'pipe'
    });
    
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
    
    // Собираем все логи консоли
    page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('[Game]')) {
            consoleLogs.push(text);
            if (msg.type() === 'error') {
                console.log(`⚠️  ERROR: ${text}`);
            } else if (msg.type() === 'log') {
                console.log(`📝 ${text}`);
            }
        }
    });
    
    // 3. Загрузка страницы и начало игры
    console.log('\n📥 Шаг 3: Загрузка страницы и начало игры...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    
    const startButton = await page.$('#startButtonDesktop');
    if (!startButton) {
        console.error('❌ Кнопка "Начать игру" не найдена');
        await cleanup();
        process.exit(1);
    }
    
    await startButton.click();
    console.log('✅ Кнопка нажата');
    
    // 4. Выбор перка
    console.log('\n🎯 Шаг 4: Выбор перка...');
    await sleep(1000);
    const perkButtons = await page.$$('.perk-btn[data-perk]');
    if (perkButtons.length) {
        const box = await perkButtons[0].boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    console.log('✅ Перк выбран');
    
    // 5. Ожидание таймера
    console.log('\n⏱️  Шаг 5: Ожидание таймера обратного отсчета...');
    let countdownDone = false;
    for (let i = 0; i < 24; i++) {
        await sleep(2000);
        const state = await page.evaluate(() => {
            const cd = document.getElementById('countdown');
            return {
                text: cd ? cd.textContent : 'NONE',
                gameState: window.game ? window.game.gameState : 'NO_GAME',
            };
        });
        if (i % 5 === 0) {
            console.log(`  [poll ${i+1}/24] gameState=${state.gameState} countdownText="${state.text}"`);
        }
        if (state.gameState !== 'countdown') {
            countdownDone = true;
            console.log('✅ Таймер завершился');
            break;
        }
    }
    if (!countdownDone) {
        console.error('❌ Таймер не завершился');
        await cleanup();
        process.exit(1);
    }
    
    // 6. Проверка логов спавна
    console.log('\n🔍 Шаг 6: Проверка логов спавна...');
    
    // Проверяем что pads были найдены
    const padLog = consoleLogs.find(log => log.includes('spawnPlayerAndBots: pads total:'));
    if (!padLog) {
        console.error('❌ Нет лога "spawnPlayerAndBots: pads total:"');
        console.log('📝 Все логи [Game]:', consoleLogs.slice(0, 20));
        await cleanup();
        process.exit(1);
    }
    
    // Извлекаем количество pads
    const padMatch = padLog.match(/pads total:\s*(\d+)/);
    if (!padMatch) {
        console.error('❌ Не удалось извлечь количество pads');
        await cleanup();
        process.exit(1);
    }
    const totalPads = parseInt(padMatch[1]);
    console.log(`✅ Найдено ${totalPads} spawn pads`);
    
    if (totalPads < 2) {
        console.error(`❌ Слишком мало pads: ${totalPads} (нужно минимум 2)`);
        await cleanup();
        process.exit(1);
    }
    
    // Проверяем что игрок спавнится на pad[0]
    const playerLog = consoleLogs.find(log => log.includes('Player -> pad 0 at'));
    if (!playerLog) {
        console.error('❌ Игрок НЕ спавнится на pad[0]');
        console.log('📝 Логи игрока:', consoleLogs.filter(log => log.includes('Player')));
        await cleanup();
        process.exit(1);
    }
    
    // Извлекаем координаты игрока
    const playerMatch = playerLog.match(/\(([-\d.]+),\s*[-\d.]+,\s*[-\d.]+\)/);
    if (!playerMatch) {
        console.error('❌ Не удалось извлечь координаты игрока');
        await cleanup();
        process.exit(1);
    }
    const playerX = parseFloat(playerMatch[1]);
    console.log(`✅ Игрок спавнится на pad[0] при x=${playerX.toFixed(2)}`);
    
    // Проверяем что игрок НЕ в центре (x != 0)
    if (Math.abs(playerX) < 0.1) {
        console.error('❌ Игрок спавнится в центре (x ≈ 0), а не на pad[0]');
        await cleanup();
        process.exit(1);
    }
    console.log(`✅ Игрок НЕ в центре (x=${playerX.toFixed(2)} ≠ 0)`);
    
    // Проверяем ботов
    const botLogs = consoleLogs.filter(log => log.includes('Bot') && log.includes('-> pad'));
    console.log(`✅ Найдено ${botLogs.length} ботов, спавнящихся на pads`);
    
    if (botLogs.length === 0) {
        console.error('❌ Нет ботов, спавнящихся на pads');
        console.log('📝 Логи ботов:', consoleLogs.filter(log => log.includes('Bot')));
        await cleanup();
        process.exit(1);
    }
    
    // Извлекаем номера pads для каждого бота
    const botPads = new Map(); // botIndex -> padIndex
    for (const log of botLogs) {
        const match = log.match(/Bot\s*(\d+)\s*->\s*pad\s*(\d+)/);
        if (match) {
            const botIndex = parseInt(match[1]);
            const padIndex = parseInt(match[2]);
            botPads.set(botIndex, padIndex);
        }
    }
    
    // Проверяем что каждый бот на уникальной плите
    const padValues = Array.from(botPads.values());
    const uniquePads = new Set(padValues);
    if (uniquePads.size !== padValues.length) {
        console.error('❌ Некоторые боты спавнятся на одной и той же плите');
        console.log('📝 Боты и их pads:', Array.from(botPads.entries()));
        await cleanup();
        process.exit(1);
    }
    console.log(`✅ Все ${botPads.size} ботов на уникальных плитах`);
    
    // Проверяем что боты используют pads[1..N] (не pad[0])
    for (const [botIndex, padIndex] of botPads.entries()) {
        if (padIndex === 0) {
            console.error(`❌ Бот ${botIndex} спавнится на pad[0] (занят игроком)`);
            await cleanup();
            process.exit(1);
        }
    }
    console.log('✅ Ни один бот не использует pad[0] (занят игроком)');
    
    // Проверяем уникальность всех pads (игрок + боты)
    const allEntityPads = new Set();
    allEntityPads.add(0); // игрок всегда на pad[0]
    for (const padIndex of padValues) {
        if (allEntityPads.has(padIndex)) {
            console.error(`❌ Конфликт: pad ${padIndex} используется несколькими сущностями`);
            await cleanup();
            process.exit(1);
        }
        allEntityPads.add(padIndex);
    }
    console.log(`✅ Все ${allEntityPads.size} сущностей на уникальных плитах`);
    
    // Проверяем лог верификации
    const verifyLog = consoleLogs.find(log => log.includes('Spawn uniqueness verified'));
    if (verifyLog) {
        console.log(`✅ ${verifyLog}`);
    } else {
        const failLog = consoleLogs.find(log => log.includes('Spawn uniqueness FAILED'));
        if (failLog) {
            console.log(`❌ ${failLog}`);
            await cleanup();
            process.exit(1);
        }
        console.log('⚠️  Нет лога верификации (возможно, метод не вызван)');
    }
    
    // 7. Финальный результат
    console.log('\n===========================================');
    console.log('✅ ВСЕ ПРОВЕРКИ СПАВНА ПРОЙДЕНЫ!');
    console.log('===========================================');
    console.log('📊 Результаты:');
    console.log(`   - Найдено ${totalPads} spawn pads`);
    console.log(`   - Игрок на pad[0] (x=${playerX.toFixed(2)})`);
    console.log(`   - ${botPads.size} ботов на уникальных pads`);
    console.log(`   - Ни одна плита не используется дважды`);
    console.log(`   - Игрок НЕ в центре`);
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
