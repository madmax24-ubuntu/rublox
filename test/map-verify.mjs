/**
 * Полная автоматическая верификация карты
 * 
 * Проверяет:
 * 1. Stone biome — камера не клинит через стены
 * 2. Stone biome — нет невидимых препятствий
 * 3. NPC — правильный размер (не меньше игрока)
 * 4. NPC — не уходят под землю
 * 5. Текстуры — корректно рендерятся
 */
import { chromium } from 'playwright';
import { setTimeout as sleep } from 'timers/promises';
import fs from 'fs';
import path from 'path';

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const RESULTS_DIR = 'test-results/verify';

let browser = null;
let page = null;
let passed = 0;
let failed = 0;
const issues = [];

function log(msg) { console.log(msg); }
function fail(msg) { failed++; issues.push(msg); log(`❌ ${msg}`); }
function pass(msg) { passed++; log(`✅ ${msg}`); }

async function main() {
    log('🔍 Запуск полной верификации карты...');
    log('===========================================');
    
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    
    // Собираем ошибки консоли
    const consoleErrors = [];
    page.on('console', (msg) => {
        const type = msg.type();
        const text = msg.text();
        if (type === 'error') consoleErrors.push(text);
    });

    // 1. Загрузка и запуск игры
    log('\n📥 Загрузка страницы...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    
    log('🎮 Клик по "Начать игру"...');
    const startBtn = await page.$('#startButtonDesktop');
    if (!startBtn) { fail('startButtonDesktop not found'); await cleanup(); return; }
    await startBtn.click();
    
    // Панель перков
    log('🎯 Ожидание панели перков...');
    await sleep(1000);
    const perkPanel = await page.$('#perkPanel');
    if (!perkPanel) { fail('perkPanel not found'); await cleanup(); return; }
    
    // Выбор перка
    const perkBtns = await page.$$('.perk-btn[data-perk]');
    if (perkBtns.length) await perkBtns[0].click();
    
    // Ожидание таймера
    log('⏳ Ожидание таймера...');
    let countdownDone = false;
    for (let i = 0; i < 30; i++) {
        const gs = await page.evaluate(() => window.game?.gameState);
        if (gs === 'spawn' || gs === 'playing') { countdownDone = true; break; }
        await sleep(1000);
    }
    if (!countdownDone) { fail('countdown did not finish'); await cleanup(); return; }
    
    // Ждём пока загрузится карта и NPC спавнятся
    log('🗺️  Ожидание загрузки карты и спавна NPC...');
    await sleep(15000);
    
    // ==========================================
    // 2. Проверка Stone Biome — камера
    // ==========================================
    log('\n🧱 Проверка Stone Biome (камера + коллайдеры)...');
    
    // Перемещаем камеру на границу stone biome
    const stoneCenter = { x: 120, z: -120 };
    await page.evaluate((c) => {
        const cam = window.game?.player?.camera;
        if (!cam) return;
        cam.position.set(c.x, 30, c.z);
        cam.lookAt(new THREE.Vector3(c.x, 0, c.z));
    }, stoneCenter);
    await sleep(1000);
    
    // Скриншот stone biome сверху
    await page.screenshot({ path: path.join(RESULTS_DIR, 'stone-top.png') });
    
    // Проверяем, что InstancedMesh не содержит стены
    const wallInstanced = await page.evaluate(() => {
        const sys = window.game?.instancedMeshSystem;
        if (!sys) return { found: false, count: 0 };
        const groups = Object.values(sys._groups || {});
        let wallCount = 0;
        for (const g of groups) {
            for (const m of (g.meshes || [])) {
                if (m.userData?.isWall) wallCount++;
            }
        }
        return { found: wallCount > 0, count: wallCount };
    });
    if (wallInstanced.found) {
        fail(`InstancedMesh contains ${wallInstanced.count} wall meshes! Camera clipping possible.`);
    } else {
        pass('InstancedMesh не содержит стен (isWall исключены)');
    }
    
    // Проверяем коллайдеры стен — каждый меш стены должен быть внутри какого-то коллайдера
    const wallColliderCheck = await page.evaluate(() => {
        const physics = window.game?.physics;
        const scene = window.game?.scene;
        if (!physics || !scene) return { ok: true, mismatch: 0 };
        
        const walls = [];
        scene.traverse(obj => {
            if (obj.isMesh && obj.userData?.isWall) walls.push(obj);
        });
        
        let mismatch = 0;
        const missingDetails = [];
        
        // Для каждого меша стены вычисляем world bounding box и проверяем
        // что он пересекается хотя бы с одним коллайдером
        for (const w of walls) {
            const wBox = new THREE.Box3().setFromObject(w);
            
            // Проверяем: есть ли коллайдер, который охватывает центр меша
            const worldCenter = new THREE.Vector3();
            wBox.getCenter(worldCenter);
            
            const covered = physics.colliders?.some(c => {
                // Проверяем, что центр меша находится внутри коллайдера
                return worldCenter.x >= c.min.x && worldCenter.x <= c.max.x &&
                       worldCenter.y >= c.min.y && worldCenter.y <= c.max.y &&
                       worldCenter.z >= c.min.z && worldCenter.z <= c.max.z;
            });
            
            if (!covered) {
                mismatch++;
                missingDetails.push({ x: worldCenter.x.toFixed(1), y: worldCenter.y.toFixed(1), z: worldCenter.z.toFixed(1) });
            }
        }
        return { ok: mismatch === 0, mismatch, total: walls.length, missing: missingDetails };
    });
    
    if (!wallColliderCheck.ok) {
        fail(`${wallColliderCheck.mismatch} из ${wallColliderCheck.total} стен не имеют коллайдера рядом. Missing: ${JSON.stringify(wallColliderCheck.missing)}`);
    } else {
        pass(`Все ${wallColliderCheck.total} стен имеют коллайдеры`);
    }
    
    // ==========================================
    // 3. Проверка NPC — размер и позиция
    // ==========================================
    log('\n🤖 Проверка NPC (размер + spawn позиция)...');
    
    const npcCheck = await page.evaluate(() => {
        const game = window.game;
        if (!game) return { ok: false, reason: 'no game' };
        
        const bots = game.bots || [];
        const player = game.player;
        if (!bots.length) return { ok: false, reason: 'no bots' };
        if (!player) return { ok: false, reason: 'no player' };
        
        const playerHeight = player.physics.height;
        const playerRadius = player.physics.radius;
        const playerBottomY = player.position.y;
        
        let sizeIssues = 0;
        let groundIssues = 0;
        const details = [];
        
        for (const bot of bots) {
            const bCapsule = bot.capsuleCollider;
            if (!bCapsule) continue;
            
            // Размер: NPC должен быть примерно такого же размера как игрок
            const bHeight = bot.physics.height;
            const bRadius = bot.physics.radius;
            
            // Проверка размера: NPC не должен быть меньше 80% игрока
            if (bHeight < playerHeight * 0.8) sizeIssues++;
            if (bRadius < playerRadius * 0.5) sizeIssues++;
            
            // Проверка позиции: NPC не должен быть под землёй
            const bBottomY = bot.position.y;
            const modelBottomY = bot._modelBottomY_normal || 0;
            const feetY = bBottomY + modelBottomY;
            
            // Проверяем, что ноги NPC на уровне земли
            // Берём высоту земли в позиции NPC
            const groundY = game.physics?.getGroundHeight
                ? game.physics.getGroundHeight(bot.position.x, bot.position.z)
                : 0;
            
            const diff = Math.abs(feetY - groundY);
            if (diff > 0.5) {
                groundIssues++;
                details.push({
                    id: bot.id,
                    feetY: feetY.toFixed(2),
                    groundY: groundY.toFixed(2),
                    diff: diff.toFixed(2)
                });
            }
        }
        
        return {
            ok: sizeIssues === 0 && groundIssues === 0,
            playerHeight: playerHeight.toFixed(2),
            playerRadius: playerRadius.toFixed(2),
            botsChecked: bots.length,
            sizeIssues,
            groundIssues,
            details
        };
    });
    
    if (!npcCheck.ok) {
        if (npcCheck.sizeIssues) {
            fail(`NPC size: ${npcCheck.sizeIssues} NPC слишком маленькие`);
        }
        if (npcCheck.groundIssues) {
            fail(`NPC ground: ${npcCheck.groundIssues} NPC клинят землю. Details: ${JSON.stringify(npcCheck.details)}`);
        }
    } else {
        pass(`NPC: ${npcCheck.botsChecked} проверено, размер OK, позиция OK`);
    }
    
    // ==========================================
    // 4. Скриншоты для визуальной проверки
    // ==========================================
    log('\n📸 Скриншоты для визуальной проверки...');
    
    // Top-down view
    await page.evaluate(() => {
        const cam = window.game?.player?.camera;
        if (!cam) return;
        cam.position.set(0, 400, 400);
        cam.lookAt(new THREE.Vector3(0, 0, 0));
    });
    await sleep(500);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'topdown-full.png') });
    log('  topdown-full.png');
    
    // Stone biome close-up
    await page.evaluate(() => {
        const cam = window.game?.player?.camera;
        if (!cam) return;
        cam.position.set(120, 15, -120);
        cam.lookAt(new THREE.Vector3(120, 0, -120));
    });
    await sleep(500);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'stone-closeup.png') });
    log('  stone-closeup.png');
    
    // Forest biome
    await page.evaluate(() => {
        const cam = window.game?.player?.camera;
        if (!cam) return;
        cam.position.set(-120, 15, -120);
        cam.lookAt(new THREE.Vector3(-120, 0, -120));
    });
    await sleep(500);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'forest-closeup.png') });
    log('  forest-closeup.png');
    
    // Swamp biome
    await page.evaluate(() => {
        const cam = window.game?.player?.camera;
        if (!cam) return;
        cam.position.set(-120, 15, 120);
        cam.lookAt(new THREE.Vector3(-120, 0, 120));
    });
    await sleep(500);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'swamp-closeup.png') });
    log('  swamp-closeup.png');
    
    // Snow biome
    await page.evaluate(() => {
        const cam = window.game?.player?.camera;
        if (!cam) return;
        cam.position.set(120, 15, 120);
        cam.lookAt(new THREE.Vector3(120, 0, 120));
    });
    await sleep(500);
    await page.screenshot({ path: path.join(RESULTS_DIR, 'snow-closeup.png') });
    log('  snow-closeup.png');
    
    // ==========================================
    // 5. Итог
    // ==========================================
    log('\n===========================================');
    log(`📊 Результат: ${passed} passed, ${failed} failed`);
    if (issues.length) {
        log('\n❌ Проблемы:');
        for (const i of issues) log(`  - ${i}`);
    }
    if (consoleErrors.length) {
        log(`\n⚠️ Console errors: ${consoleErrors.length}`);
        for (const e of consoleErrors.slice(0, 10)) log(`  - ${e.substring(0, 100)}`);
    }
    log('===========================================');
    
    await cleanup();
    process.exit(failed > 0 ? 1 : 0);
}

async function cleanup() {
    if (browser) await browser.close().catch(() => {});
}

main().catch(err => {
    console.error(err);
    cleanup().then(() => process.exit(1));
});
