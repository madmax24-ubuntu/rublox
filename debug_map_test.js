// Debug Map Test - Автоматический тест карты с несколькими камерами
// Запуск: node debug_map_test.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'debug_output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const cameraPositions = [
    // Высокие обзоры
    { name: 'top_center', x: 0, y: 300, z: 0, fov: 90, color: '#ff0000' },
    { name: 'top_left', x: -100, y: 250, z: 100, fov: 60, color: '#ff4400' },
    { name: 'top_right', x: 100, y: 250, z: 100, fov: 60, color: '#ff8800' },
    { name: 'top_front', x: 0, y: 200, z: -150, fov: 75, color: '#ffaa00' },
    { name: 'top_back', x: 0, y: 200, z: 150, fov: 75, color: '#ffcc00' },

    // Биомы на земле
    { name: 'citadel_ground', x: -80, y: 25, z: 80, fov: 60, color: '#00ff00' },
    { name: 'crystal_ground', x: 80, y: 25, z: 80, fov: 60, color: '#00ff44' },
    { name: 'wastes_ground', x: -80, y: 25, z: -80, fov: 60, color: '#00ff88' },
    { name: 'forest_ground', x: 80, y: 25, z: -80, fov: 60, color: '#00ffcc' },

    // Ворота
    { name: 'gate_north', x: 0, y: 15, z: -25, fov: 60, color: '#0088ff' },
    { name: 'gate_south', x: 0, y: 15, z: 25, fov: 60, color: '#0044ff' },
    { name: 'gate_west', x: -25, y: 15, z: 0, fov: 60, color: '#4400ff' },
    { name: 'gate_east', x: 25, y: 15, z: 0, fov: 60, color: '#8800ff' },

    // Ближие ракурсы
    { name: 'spawn_pad', x: 0, y: 12, z: 0, fov: 70, color: '#cc00ff' },
    { name: 'cornucopia', x: 15, y: 15, z: 15, fov: 65, color: '#ff00cc' },
    { name: 'center_path', x: 0, y: 20, z: 50, fov: 70, color: '#ff0088' },

    // Края арены
    { name: 'edge_ne', x: 120, y: 60, z: 120, fov: 65, color: '#ff0044' },
    { name: 'edge_nw', x: -120, y: 60, z: 120, fov: 65, color: '#ff0066' },
    { name: 'edge_se', x: 120, y: 60, z: -120, fov: 65, color: '#ff0022' },
    { name: 'edge_sw', x: -120, y: 60, z: -120, fov: 65, color: '#ff0011' },
];

async function runDebugTest() {
    console.log('🔧 Запуск Debug Map Test...\n');
    console.log(`📂 Output: ${outputDir}\n`);

    const browser = await chromium.launch({
        headless: false,
        slowMo: 0,
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    const logs = [];
    page.on('console', (msg) => {
        const text = msg.text();
        logs.push({ time: Date.now(), text, type: msg.type() });
        const icon = msg.type() === 'error' ? '❌' : msg.type() === 'warn' ? '⚠️' : '✅';
        console.log(`  ${icon} ${text.substring(0, 120)}`);
    });

    page.on('pageerror', (error) => {
        logs.push({ time: Date.now(), text: `PageError: ${error}`, type: 'error' });
        console.log(`  ❌ PageError: ${error}`);
    });

    // Запуск сервера
    const { spawn } = require('child_process');
    const python = process.platform === 'win32' ? 'python' : 'python3';
    const server = spawn(python, ['-m', 'http.server', '8080', '--bind', '127.0.0.1']);

    console.log('⏳ Ожидание запуска сервера...');
    await new Promise(r => setTimeout(r, 2000));

    // Загрузка игры
    console.log('\n🌐 Загрузка игры...');
    await page.goto('http://127.0.0.1:8080/');
    await page.waitForSelector('.start-btn', { timeout: 10000 });
    console.log('✅ Страница загружена\n');

    // Клик по кнопке
    console.log('🚀 Нажимаем "Начать игру"...');
    await page.$eval('.start-btn', btn => btn.click());
    console.log('✅ Клик сделан\n');

    // Ожидание генерации карты
    console.log('⏳ Ожидание генерации карты...');
    const startTime = Date.now();
    let loadingText = '';

    const progressInterval = setInterval(async () => {
        try {
            loadingText = await page.$eval('.loading-screen p', el => el.textContent) || 'Загрузка...';
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            process.stdout.write(`\r  ⏱️ ${elapsed}с - ${loadingText}   `);
        } catch (e) {
            // Ignore
        }
    }, 1000);

    // Таймаут 120 секунд
    const timeout = setTimeout(() => {
        clearInterval(progressInterval);
        console.log('\n❌ Таймаут генерации карты (120с)');
    }, 120000);

    // Ожидание исчезновения загрузочного экрана
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 120000 }).catch(() => {
        console.log('\n✅ Загрузочный экран исчез');
    });

    clearTimeout(timeout);
    clearInterval(progressInterval);
    const mapTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✅ Карта сгенерирована за ${mapTime} секунд\n`);

    // Стабилизация
    console.log('⏳ Стабилизация игры (3с)...');
    await page.waitForTimeout(3000);
    console.log('✅ Игра стабильна\n');

    // Делаем скриншоты
    console.log('📸 Делаем скриншоты с камер...\n');
    const results = [];

    for (let i = 0; i < cameraPositions.length; i++) {
        const cam = cameraPositions[i];
        console.log(`📷 ${cam.name}: (${cam.x}, ${cam.y}, ${cam.z})`);

        try {
            await page.evaluate((cam) => {
                if (window.gameInstance && window.gameInstance.camera) {
                    window.gameInstance.camera.position.set(cam.x, cam.y, cam.z);
                    window.gameInstance.camera.lookAt(0, 0, 0);
                    window.gameInstance.camera.fov = cam.fov || 60;
                    window.gameInstance.camera.updateProjectionMatrix();
                    window.gameInstance.render();
                }
            }, cam);

            // Сохраняем скриншот
            const screenshot = await page.screenshot({
                type: 'png',
                clip: { x: 0, y: 0, width: 1280, height: 720 }
            });

            const fileName = `${String(i + 1).padStart(2, '_')}_${cam.name}.png`;
            const filePath = path.join(outputDir, fileName);
            fs.writeFileSync(filePath, screenshot);

            console.log(`  ✅ Сохранено: ${fileName}`);
            results.push({ camera: cam.name, status: 'success', time: Date.now() });

        } catch (err) {
            console.log(`  ❌ Ошибка: ${err.message}`);
            results.push({ camera: cam.name, status: 'error', error: err.message, time: Date.now() });
        }

        await page.waitForTimeout(200);
    }

    // Информация о сцене
    console.log('\n📊 Информация о карте:');
    const sceneInfo = await page.evaluate(() => {
        const game = window.gameInstance;
        if (!game) return null;

        let meshCount = 0;
        let biomeCount = 0;
        let decorationCount = 0;
        let zoneDividerCount = 0;
        let treeCount = 0;
        let rockCount = 0;
        let barrelCount = 0;
        let crateCount = 0;

        game.scene.traverse((obj) => {
            if (obj.isMesh) {
                meshCount++;
            }
            if (obj.isGroup) {
                // Count groups
            }
            if (obj.userData?.isBiome) biomeCount++;
            if (obj.userData?.isDecoration) decorationCount++;
            if (obj.userData?.decorationType === 'zoneDivider') zoneDividerCount++;
            if (obj.userData?.decorationType === 'tree' || obj.userData?.treeType) treeCount++;
            if (obj.userData?.decorationType === 'rock') rockCount++;
            if (obj.userData?.decorationType === 'barrel') barrelCount++;
            if (obj.userData?.decorationType === 'crate') crateCount++;
        });

        return {
            meshCount,
            biomeCount,
            decorationCount,
            zoneDividerCount,
            treeCount,
            rockCount,
            barrelCount,
            crateCount,
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
        console.log(`  📦 Треугольников (mesh): ${sceneInfo.meshCount}`);
        console.log(`  🗺️ Биом-зон: ${sceneInfo.biomeCount}`);
        console.log(`  🎨 Декораций: ${sceneInfo.decorationCount}`);
        console.log(`  🚧 Разделителей зон: ${sceneInfo.zoneDividerCount}`);
        console.log(`  🌳 Деревьев: ${sceneInfo.treeCount}`);
        console.log(`  🪨 Камней: ${sceneInfo.rockCount}`);
        console.log(`  🛢️ Бочек: ${sceneInfo.barrelCount}`);
        console.log(`  📦 Ящиков: ${sceneInfo.crateCount}`);
        console.log(`  🔒 Коллайдеров: ${sceneInfo.colliders}`);
        console.log(`  ✨ Анимированных: ${sceneInfo.animatedObjects}`);
        console.log(`  💧 Частиц: ${sceneInfo.particleSystems}`);
        console.log(`  🌊 Воды: ${sceneInfo.waterMeshes}`);
        console.log(`  💣 Ловушек: ${sceneInfo.traps}`);
        console.log(`  🌫️ Тумана: ${sceneInfo.fogZones}`);
        console.log(`  🏁 Падтов: ${sceneInfo.spawnPads}`);
    }

    // Итоги логов
    const errors = logs.filter(l => l.type === 'error');
    const warnings = logs.filter(l => l.type === 'warn');

    console.log(`\n📋 Логи консоли:`);
    console.log(`  ❌ Ошибки: ${errors.length}`);
    console.log(`  ⚠️ Предупреждения: ${warnings.length}`);
    console.log(`  ℹ️ Всего: ${logs.length}`);

    if (errors.length > 0) {
        console.log(`\n  Первые ошибки:`);
        errors.slice(0, 5).forEach(err => {
            console.log(`    ${err.text.substring(0, 100)}`);
        });
    }

    // Сохраняем полный лог
    const logFile = path.join(outputDir, 'full_log.txt');
    fs.writeFileSync(logFile,
        'Debug Map Test - Full Log\n' +
        '═'.repeat(60) + '\n' +
        `Время: ${new Date().toLocaleString()}\n` +
        `Время генерации: ${mapTime}с\n\n` +
        `Успешных камер: ${results.filter(r => r.status === 'success').length} из ${cameraPositions.length}\n` +
        `Ошибок камер: ${results.filter(r => r.status === 'error').length}\n\n` +
        'Сцена:\n' +
        JSON.stringify(sceneInfo, null, 2) + '\n\n' +
        'Логи:\n' +
        '═'.repeat(60) + '\n' +
        logs.map(l => `[${new Date(l.time).toLocaleTimeString()}] [${l.type.toUpperCase()}] ${l.text}`).join('\n') + '\n'
    );

    console.log(`\n💾 Полный лог: ${logFile}`);
    console.log(`📁 Скриншоты: ${outputDir}\n`);

    console.log('👀 Браузер оставлен открытым для проверки');
    console.log('   Нажмите Enter для закрытия...\n');

    await new Promise(resolve => {
        process.stdin.once('data', () => resolve());
        setTimeout(resolve, 60000);
    });

    await browser.close();
    server.kill();

    console.log('\n✅ Debug тест завершён!\n');
}

runDebugTest().catch(err => {
    console.error('❌ Критическая ошибка:', err);
    process.exit(1);
});
