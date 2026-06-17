import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = './test-results/screenshots';
function mkdir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
mkdir(SCREENSHOT_DIR);

async function main() {
    console.log('[MAP DEBUG] Starting Playwright test...');

    const browser = await chromium.launch({ headless: false }); // Keep visible for debugging
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    const errors = [];
    const logs = [];
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
        else if (msg.type() === 'warning') logs.push(`WARN: ${msg.text()}`);
    });

    // Navigate to game and wait for map generation via URL params
    await page.goto('http://localhost:3001/?testMode=true', { waitUntil: 'networkidle' });

    console.log('[MAP DEBUG] Waiting for window.game...');
    await page.waitForFunction(() => typeof window.getGameInstance === 'function', { timeout: 20000 });

    // Click start button to begin map generation
    const hasStartScreen = await page.$('#startScreen') !== null;
    console.log(`[MAP DEBUG] Start screen visible: ${hasStartScreen}`);

    if (hasStartScreen) {
        const btn = await page.$('button');
        if (btn) await btn.click();
        // Wait for loading overlay to appear then fade out as map generates
        try { await page.waitForSelector('#loadingOverlay', { state: 'visible', timeout: 5000 }); } catch {}
    }

    console.log('[MAP DEBUG] Waiting for game.map (MapGenerator)...');
    const startTime = Date.now();
    let mapReady = false;

    while (!mapReady && Date.now() - startTime < 120000) { // 2 min timeout
        try {
            await page.waitForFunction(() => window.game?.map !== undefined, { timeout: 5000 });
            console.log('[MAP DEBUG] game.map found!');

            // Wait for map to actually finish generating (not just created)
            const checkGen = async () => {
                try {
                    return await page.evaluate(() => window.game?.map._generationComplete === true);
                } catch(e) { return false; }
            };

            if (await checkGen()) { mapReady = true; console.log('[MAP DEBUG] Map generation complete'); break; }

            // Poll every second until done or timeout
            const pollStart = Date.now();
            while (!mapReady && Date.now() - pollStart < 60000) {
                if (await checkGen()) { mapReady = true; console.log('[MAP DEBUG] Map generation complete after polling'); break; }
                await new Promise(r => setTimeout(r, 2000));
            }

        } catch(e) {
            // Try again in next iteration
            if (Date.now() - startTime > 115000) throw e;
        }
    }

    if (!mapReady) { console.log('[MAP DEBUG] Map generation timed out or incomplete'); }

    // Now take screenshots and verify biome elements
    const results = [];

    // Camera 1: Top-down overview (400, 400, 400) - should show all biomes
    try {
        await page.evaluate(() => {
            if (!window.game || !window.game.camera) return;
            window.game.camera.position.set(256, 350, 256); // High overview from corner
            window.game.camera.lookAt(0, 0, 0);
            window.game.camera.fov = 45;
            window.game.camera.updateProjectionMatrix();
        });
        await new Promise(r => setTimeout(r, 3000)); // Wait for camera to settle + render
        const shotPath = path.join(SCREENSHOT_DIR, 'overview-1.png');
        await page.screenshot({ path: shotPath });
        results.push(`OVERVIEW1: ${shotPath}`);

        console.log('[MAP DEBUG] Overview 1 captured (high corner)');
    } catch(e) { console.error('Overview 1 failed:', e.message); }

    // Camera 2: NW quadrant - should show forest biome with trees/bushes
    try {
        await page.evaluate(() => { if (!window.game || !window.game.camera) return; window.game.camera.position.set(-200, 80, -200); });
        await new Promise(r => setTimeout(r, 3000));
        const shotPath = path.join(SCREENSHOT_DIR, 'nw-forest.png');
        await page.screenshot({ path: shotPath });
        results.push(`NW FOREST: ${shotPath}`);
    } catch(e) { console.error('NW failed:', e.message); }

    // Camera 3: NE quadrant - should show stone maze walls (if biome pattern is correct)
    try {
        await page.evaluate(() => { if (!window.game || !window.game.camera) return; window.game.camera.position.set(200, 80, -200); });
        await new Promise(r => setTimeout(r, 3000));
        const shotPath = path.join(SCREENSHOT_DIR, 'ne-stone_maze.png');
        await page.screenshot({ path: shotPath });
        results.push(`NE STONE MAZE: ${shotPath}`);
    } catch(e) { console.error('NE failed:', e.message); }

    // Camera 4: SW quadrant - should show military zone with tanks/barbed wire
    try {
        await page.evaluate(() => { if (!window.game || !window.game.camera) return; window.game.camera.position.set(-200, 80, 200); });
        await new Promise(r => setTimeout(r, 3000));
        const shotPath = path.join(SCREENSHOT_DIR, 'sw-military.png');
        await page.screenshot({ path: shotPath });
        results.push(`SW MILITARY: ${shotPath}`);
    } catch(e) { console.error('SW failed:', e.message); }

    // Camera 5: SE quadrant - should show ice lake with crystals and frozen terrain
    try {
        await page.evaluate(() => { if (!window.game || !window.game.camera) return; window.game.camera.position.set(200, 80, 200); });
        await new Promise(r => setTimeout(r, 3000));
        const shotPath = path.join(SCREENSHOT_DIR, 'se-ice_lake.png');
        await page.screenshot({ path: shotPath });
        results.push(`SE ICE LAKE: ${shotPath}`);
    } catch(e) { console.error('SE failed:', e.message); }

    // Camera 6: Ground level - check if player can walk on terrain
    try {
        await page.evaluate(() => { if (!window.game || !window.game.camera) return; window.game.camera.position.set(0, 5, 10); });
        await new Promise(r => setTimeout(r, 3000));
        const shotPath = path.join(SCREENSHOT_DIR, 'ground-level.png');
        await page.screenshot({ path: shotPath });
        results.push(`GROUND LEVEL: ${shotPath}`);
    } catch(e) { console.error('Ground level failed:', e.message); }

    // Check for biome-specific elements in the scene
    const biomeCheck = await page.evaluate(() => {
        try {
            const scene = window.game?.scene;
            if (!scene || !scene.children) return 'NO_SCENE';

            let meshCount = 0, groupCount = 0;
            for (const child of scene.children) {
                if (child.isMesh) meshCount++;
                else if (child.isGroup) groupCount++;
            }

            // Check voronoi sectors data
            const map = window.game?.map;
            let sectorInfo = null;
            if (map && map.voronoi && map.voronoi.sectors) {
                const biomeCounts = {};
                for (const s of map.voronoi.sectors || []) {
                    const b = s.biome || 'unknown';
                    biomeCounts[b] = (biomeCounts[b] || 0) + 1;
                }
                sectorInfo = JSON.stringify({ count: map.voronoi.sectors.length, biomes: biomeCounts });

                // Sample first few sectors for detail
                const sample = [];
                for (const s of map.voronoi.sectors.slice(0, 8)) {
                    if (s) sample.push(`${s.id}:${s.biome || 'unknown'}`);
                }
                sectorInfo += ` | samples: [${sample.join(', ')}]`;
            }

            // Check for terrain mesh with correct geometry
            let hasTerrain = false, terrainType = '';
            if (map) {
                const propNames = ['terrainMesh', '_terrain', 'heightField'];
                for (const name of propNames) {
                    if (map[name]) {
                        hasTerrain = true;
                        terrainType = map[name].isMesh ? 'mesh' : typeof map[name];
                        break;
                    }
                }

                // Check sector bounds data
                if (map.sectorBounds && Array.isArray(map.sectorBounds)) {
                    sectorInfo += ` | bounds_count: ${map.sectorBounds.length}`;
                }
            }

            return JSON.stringify({ meshCount, groupCount, hasTerrain, terrainType, sectors: sectorInfo });
        } catch(e) { return `ERR:${e.message}`; }
    }).catch(() => 'EVAL_FAILED');

    console.log(`[MAP DEBUG] Biome Check Results:\n  ${biomeCheck}\n\n${results.join('\n  ')}`);

    // Save report
    const report = JSON.stringify({ errors, logs, results: biomeCheck + '\n' + results.join('\n'), timestamp: new Date().toISOString() }, null, 2);
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'debug-report.json'), report);

    console.log(`[MAP DEBUG] Errors found: ${errors.length}`);
    if (errors.length > 0) {
        for (const e of errors.slice(0, 10)) console.log(`  [ERROR] ${e}`);
    }

    await browser.close();
}

main().catch(e => { console.error('CRASH:', e.message); process.exit(1) });
