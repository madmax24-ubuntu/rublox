// Debug Map Test Script
// Запуск: node debug_map_test.js
// Требует: playwright, three.js

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create output directory
const outputDir = path.join(__dirname, 'debug_output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Camera positions for map analysis
const cameraPositions = [
    // High overview
    { name: 'top_center', x: 0, y: 300, z: 0, rx: 0, ry: 0, rz: 0, fov: 90 },
    { name: 'top_left', x: -100, y: 250, z: 100, rx: 0, ry: 0, rz: 0, fov: 60 },
    { name: 'top_right', x: 100, y: 250, z: 100, rx: 0, ry: 0, rz: 0, fov: 60 },
    { name: 'top_front', x: 0, y: 200, z: -150, rx: 0, ry: 0, rz: 0, fov: 75 },
    { name: 'top_back', x: 0, y: 200, z: 150, rx: 0, ry: 0, rz: 0, fov: 75 },

    // Biome ground cameras
    { name: 'citadel_ground', x: -80, y: 25, z: 80, rx: 0, ry: 0, rz: 0, fov: 60 },
    { name: 'crystal_ground', x: 80, y: 25, z: 80, rx: 0, ry: 0, rz: 0, fov: 60 },
    { name: 'wastes_ground', x: -80, y: 25, z: -80, rx: 0, ry: 0, rz: 0, fov: 60 },
    { name: 'forest_ground', x: 80, y: 25, z: -80, rx: 0, ry: 0, rz: 0, fov: 60 },

    // Gate cameras
    { name: 'gate_north', x: 0, y: 15, z: -25, rx: 0, ry: 0, rz: 0, fov: 60 },
    { name: 'gate_south', x: 0, y: 15, z: 25, rx: 0, ry: 0, rz: 0, fov: 60 },
    { name: 'gate_west', x: -25, y: 15, z: 0, rx: 0, ry: 0, rz: 0, fov: 60 },
    { name: 'gate_east', x: 25, y: 15, z: 0, rx: 0, ry: 0, rz: 0, fov: 60 },

    // Close-up
    { name: 'spawn_pad', x: 0, y: 12, z: 0, rx: 0, ry: 0, rz: 0, fov: 70 },
    { name: 'cornucopia', x: 15, y: 15, z: 15, rx: 0, ry: 0, rz: 0, fov: 65 },
    { name: 'center_path', x: 0, y: 20, z: 50, rx: 0, ry: 0, rz: 0, fov: 70 },

    // Arena edges
    { name: 'edge_ne', x: 120, y: 60, z: 120, rx: 0, ry: 0, rz: 0, fov: 65 },
    { name: 'edge_nw', x: -120, y: 60, z: 120, rx: 0, ry: 0, rz: 0, fov: 65 },
    { name: 'edge_se', x: 120, y: 60, z: -120, rx: 0, ry: 0, rz: 0, fov: 65 },
    { name: 'edge_sw', x: -120, y: 60, z: -120, rx: 0, ry: 0, rz: 0, fov: 65 },
];

async function startServer(port = 8080) {
    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const python = process.platform === 'win32' ? 'python' : 'python3';
        const server = spawn(python, ['-m', 'http.server', port, '--bind', '127.0.0.1']);

        server.stdout.on('data', (data) => {
            console.log(`[Server] ${data.toString().trim()}`);
        });

        server.stderr.on('data', (data) => {
            console.error(`[Server Error] ${data.toString().trim()}`);
        });

        // Wait for server to start
        setTimeout(() => {
            resolve(server);
        }, 1000);
    });
}

async function runDebugTest() {
    console.log('🔧 Запуск Debug Map Test...');
    console.log(`📂 Output: ${outputDir}`);

    // Start HTTP server
    const server = await startServer(8080);
    console.log('✅ Сервер запущен на http://127.0.0.1:8080\n');

    // Launch Playwright
    const browser = await chromium.launch({
        headless: false,
        slowMo: 0,
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    // Capture console logs
    const logs = [];
    page.on('console', (msg) => {
        const text = msg.text();
        const time = new Date().toLocaleTimeString();
        logs.push({ time, text, type: msg.type() });
        const color = msg.type() === 'error' ? '❌' : msg.type() === 'warn' ? '⚠️' : '✅';
        console.log(`[${time}] ${color} ${text}`);
    });

    page.on('pageerror', (error) => {
        const time = new Date().toLocaleTimeString();
        logs.push({ time, text: `PageError: ${error}`, type: 'error' });
        console.log(`[${time}] ❌ PageError: ${error}`);
    });

    // Navigate to game
    console.log('\n🌐 Загрузка игры...');
    await page.goto('http://127.0.0.1:8080/');
    await page.waitForSelector('.start-btn', { timeout: 10000 });
    console.log('✅ Страница загружена\n');

    // Click start button
    console.log('🚀 Нажимаем "Начать игру"...');
    const startBtn = await page.$('.start-btn');
    await startBtn.click();
    console.log('✅ Клик по кнопке сделан\n');

    // Wait for map generation
    console.log('⏳ Ждём генерацию карты...');
    const startTime = Date.now();

    // Monitor loading progress
    const loadingMonitor = setInterval(async () => {
        const loadingText = await page.$eval('.loading-screen p', el => el.textContent).catch(() => 'Loading...');
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`⏱️ ${elapsed}с - ${loadingText}`);
    }, 2000);

    // Wait for map ready (max 90 seconds)
    const mapReadyTimeout = setTimeout(() => {
        clearInterval(loadingMonitor);
        console.log('❌ Таймаут генерации карты (90с)');
    }, 90000);

    // Wait for loading screen to disappear
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 90000 }).catch(() => {
        console.log('✅ Загрузочный экран исчез');
    });
    clearTimeout(mapReadyTimeout);
    clearInterval(loadingMonitor);

    const mapTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ Карта сгенерирована за ${mapTime} секунд\n`);

    // Wait a bit for game to stabilize
    console.log('⏳ Стабилизация игры...');
    await page.waitForTimeout(3000);
    console.log('✅ Игра стабильна\n');

    // Take screenshots from all camera positions
    console.log('📸 Делаем скриншоты с камер...\n');

    const screenshots = [];

    for (const camPos of cameraPositions) {
        const time = Date.now();
        console.log(`📷 ${camPos.name}: (${camPos.x}, ${camPos.y}, ${camPos.z})`);

        // Execute camera move and screenshot
        const result = await page.evaluate(async (cam) => {
            // Wait for game instance
            if (!window.gameInstance) {
                await new Promise(r => setTimeout(r, 1000));
            }

            const game = window.gameInstance;
            if (!game || !game.scene || !game.renderer) {
                return { error: 'Game not ready' };
            }

            // Create debug camera
            const { PerspectiveCamera, BoxGeometry, WebGLRenderer } = await import('three');

            const debugCamera = new PerspectiveCamera(cam.fov || 60, 1, 0.1, 1000);
            debugCamera.position.set(cam.x, cam.y, cam.z);
            debugCamera.lookAt(cam.lookAt?.x || 0, cam.lookAt?.y || 0, cam.lookAt?.z || 0);

            // Create debug renderer
            const debugRenderer = new WebGLRenderer({ antialias: false, alpha: false });
            debugRenderer.setSize(800, 450);
            debugRenderer.setClearColor(0x87CEEB, 1);
            debugRenderer.setClearColor(0x000000, 1); // Black background

            // Render scene
            debugRenderer.render(game.scene, debugCamera);

            // Get canvas data
            const canvas = debugRenderer.domElement;
            const dataURL = canvas.toDataURL('image/png');

            return { success: true, dataURL, width: canvas.width, height: canvas.height };
        }, { ...camPos, lookAt: { x: 0, y: 0, z: 0 } });

        screenshots.push({ camera: camPos.name, result, time: Date.now() - time });

        if (result.error) {
            console.log(`  ❌ Ошибка: ${result.error}`);
        } else if (result.success) {
            console.log(`  ✅ OK (${result.width}x${result.height})`);

            // Save screenshot
            const base64Data = result.dataURL.split(',')[1];
            const fileName = `cam_${camPos.name}.png`;
            const filePath = path.join(outputDir, fileName);

            try {
                fs.writeFileSync(filePath, base64Data, 'base64');
                console.log(`  💾 Сохранено: ${fileName}`);
            } catch (err) {
                console.log(`  ❌ Не удалось сохранить: ${err.message}`);
            }
        }

        // Small delay between screenshots
        await page.waitForTimeout(500);
    }

    console.log('\n📊 Результаты тестирования:');
    console.log('═'.repeat(60));

    // Summary
    const successful = screenshots.filter(s => s.result.success);
    const failed = screenshots.filter(s => !s.result.success);

    console.log(`\n📷 Всего камер: ${cameraPositions.length}`);
    console.log(`✅ Успешно: ${successful.length}`);
    console.log(`❌ Ошибки: ${failed.length}`);

    // Scene info
    const sceneInfo = await page.evaluate(() => {
        const game = window.gameInstance;
        if (!game) return null;

        return {
            sceneChildren: game.scene?.children?.length || 0,
            colliders: game.mapGenerator?.colliders?.length || 0,
            animatedObjects: game.mapGenerator?.animatedObjects?.length || 0,
            particleSystems: game.mapGenerator?.particleSystems?.length || 0,
            waterMeshes: game.mapGenerator?.waterMeshes?.length || 0,
            traps: game.mapGenerator?.traps?.length || 0,
            fogZones: game.mapGenerator?.fogZones?.length || 0,
            spawnPads: game.mapGenerator?.spawnPads?.length || 0,
        };
    });

    if (sceneInfo) {
        console.log('\n🗺️ Информация о карте:');
        console.log(`  📦 Объектов в сцене: ${sceneInfo.sceneChildren}`);
        console.log(`  🔒 Коллайдеров: ${sceneInfo.colliders}`);
        console.log(`  ✨ Анимированных объектов: ${sceneInfo.animatedObjects}`);
        console.log(`  💧 Систем частиц: ${sceneInfo.particleSystems}`);
        console.log(`  🌊 Водных объектов: ${sceneInfo.waterMeshes}`);
        console.log(`  💣 Ловушек: ${sceneInfo.traps}`);
        console.log(`  🌫️ Зон тумана: ${sceneInfo.fogZones}`);
        console.log(`  🏁 Падтов спавна: ${sceneInfo.spawnPads}`);
    }

    // Console logs summary
    const errors = logs.filter(l => l.type === 'error');
    const warnings = logs.filter(l => l.type === 'warn');

    console.log('\n📋 Логи консоли:');
    console.log(`  ❌ Ошибки: ${errors.length}`);
    console.log(`  ⚠️ Предупреждения: ${warnings.length}`);
    console.log(`  ℹ️ Всего записей: ${logs.length}`);

    if (errors.length > 0) {
        console.log('\n  Ошибки:');
        errors.slice(0, 10).forEach(err => {
            console.log(`    ${err.time} - ${err.text.substring(0, 100)}`);
        });
        if (errors.length > 10) {
            console.log(`    ... и ещё ${errors.length - 10} ошибок`);
        }
    }

    // Save full log
    const logFile = path.join(outputDir, 'full_log.txt');
    fs.writeFileSync(logFile,
        'Debug Map Test Log\n' +
        '═'.repeat(60) + '\n' +
        `Время: ${new Date().toLocaleString()}\n\n` +
        `Успешных скриншотов: ${successful.length} из ${cameraPositions.length}\n` +
        `Ошибок: ${failed.length}\n\n` +
        'Сцена:\n' +
        JSON.stringify(sceneInfo, null, 2) + '\n\n' +
        'Полные логи:\n' +
        '═'.repeat(60) + '\n' +
        logs.map(l => `[${l.time}] [${l.type}] ${l.text}`).join('\n') + '\n'
    );

    console.log(`\n💾 Полный лог сохранён: ${logFile}`);
    console.log(`📁 Скриншоты сохранены в: ${outputDir}\n`);

    // Keep browser open for manual inspection
    console.log('👀 Браузер оставлен открытым для ручной проверки');
    console.log('   Нажмите Enter для закрытия...');

    // Wait for user input
    await new Promise(resolve => {
        process.stdin.once('data', () => {
            resolve();
        });
        // Auto-resolve after 60 seconds
        setTimeout(resolve, 60000);
    });

    // Cleanup
    await browser.close();
    server.kill();

    console.log('\n✅ Debug тест завершён!\n');
}

// Run the test
runDebugTest().catch(err => {
    console.error('❌ Критическая ошибка:', err);
    process.exit(1);
});
