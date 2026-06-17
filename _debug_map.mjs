import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const URL = 'http://localhost:3001/';
const SCREENSHOT_DIR = './test-results/screenshots';

function mkdir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
mkdir(SCREENSHOT_DIR);

async function main() {
    console.log('[MAP DEBUG] Starting Playwright test...');

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    // Collect console errors and warnings
    const errors = [];
    const logs = [];
    page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error') { errors.push(text); }
        else if (msg.type() === 'warning') { logs.push(`WARN: ${text}`); }
    });

    // Navigate to the page with test mode enabled
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });

    console.log('[MAP DEBUG] Page loaded, checking for start screen...');

    // Check if there's a start screen or loading overlay
    const hasStartScreen = await page.$('#startScreen') !== null;
    const hasLoadingOverlay = await page.$('#loadingOverlay') !== null;
    console.log(`[MAP DEBUG] Start screen: ${hasStartScreen}, Loading: ${hasLoadingOverlay}`);

    // Click start button if it exists
    if (hasStartScreen) {
        const btn = await page.$('button');
        if (btn) await btn.click();
        console.log('[MAP DEBUG] Clicked start button');
        await page.waitForSelector('#loadingOverlay', { timeout: 10000 });
    }

    // Enable test mode to skip UI and speed up generation
    await page.evaluate(() => { window.testMode = true; localStorage.setItem('testMode', 'true'); });

    console.log('[MAP DEBUG] Map generation in progress... waiting for completion');
    // Wait for map generator to complete (timeout 60s)
    const startTime = Date.now();
    while (Date.now() - startTime < 90000) {
        await page.waitForFunction(() => window.game?.map?.ready?.then(r => r === true || typeof r === 'function'), { timeout: 5000 });
        break;
    }

    // Check if game.map exists and has voronoi data
    const mapInfo = await page.evaluate(() => {
        try {
            const g = window.game;
            if (!g || !g.map) return 'NO_MAP';

            const m = g.map;
            let info = {};

            // Check Voronoi sectors
            if (m.voronoi && m.voronoi.sectors) {
                info.sectorCount = m.voronoi.sectors.length;
                info.biomes = [...new Set(m.voronoi.sectors.map(s => s?.biome || 'unknown'))];
            }

            // Check scene objects count (terrain + buildings)
            if (m.sceneChildren !== undefined) {
                info.childrenCount = m.sceneChildren.length;
            } else {
                info.hasScene = !!g.scene;
            }

            // Check terrain mesh exists
            if (m.terrainMesh) {
                info.terrainType = typeof m.terrainMesh.geometry?.attributes?.position;
            }

            // Get biome distribution from sectors
            const biomeCounts = {};
            if (m.voronoi && m.voronoi.sectors) {
                for (const s of m.voronoi.sectors || []) {
                    const b = s.biome || 'unknown';
                    biomeCounts[b] = (biomeCounts[b] || 0) + 1;
                }
            }
            info.biomeDistribution = biomeCounts;

            // Check for special biome elements
            if (g.scene && g.scene.children) {
                const meshes = g.scene.children.filter(c => c.isMesh);
                info.meshCount = meshes.length;

                // Look for specific biome features
                let hasCrystals = false, hasTanks = false, hasMazeWalls = false;
                for (const m of meshes) {
                    const name = m.name || '';
                    if (name.includes('crystal')) hasCrystals = true;
                    if (name.includes('tank')) hasTanks = true;
                    if (name.includes('wall') && !m.isLineSegments) hasMazeWalls = true;
                }
                info.hasIceCrystal = hasCrystals;
                info.hasTanks = hasTanks;
                info.hasMazeWalls = hasMazeWalls;
            }

            return JSON.stringify(info);
        } catch(e) { return `ERROR: ${e.message}`; }
    });

    console.log(`[MAP DEBUG] Map Info: ${mapInfo}`);

    // Take screenshots from different camera angles
    const cameras = [
        { name: 'top-down', pos: [0, 400, 400], lookAt: [0, 0, 0], fov: 90 },
        { name: 'isometric-nw', pos: [-200, 300, -200], lookAt: [0, 0, 0], fov: 45 },
        { name: 'isometric-se', pos: [200, 300, 200], lookAt: [0, 0, 0], fov: 45 },
    ];

    for (const cam of cameras) {
        try {
            await page.evaluate((p, l, f) => {
                const g = window.game;
                if (!g || !g.camera) return false;
                g.camera.position.set(...p);
                g.camera.lookAt(new THREE.Vector3(...l));
                g.camera.fov = f;
                g.camera.updateProjectionMatrix();
            }, cam.pos, cam.lookAt, cam.fov);

            await new Promise(r => setTimeout(r, 1000)); // Let camera settle

            const shotPath = path.join(SCREENSHOT_DIR, `cam-${cam.name}.png`);
            await page.screenshot({ path: shotPath });
            console.log(`[MAP DEBUG] Screenshot saved: ${shotPath}`);
        } catch(e) {
            console.error(`[MAP DEBUG] Camera ${cam.name} failed:`, e.message);
        }
    }

    // Wait for map generation to actually complete if not already done
    await new Promise(r => setTimeout(r, 15000));

    // Final check - count meshes and look for biome-specific elements
    const finalCheck = await page.evaluate(() => {
        try {
            const scene = window.game?.scene;
            if (!scene) return 'NO_SCENE';

            let totalMeshes = 0, terrainCount = 0, buildingCount = 0;
            for (const child of scene.children || []) {
                if (child.isMesh || child.isGroup) totalMeshes++;
                if (child.userData?.mapGenerated) buildingCount++;
            }

            // Check voronoi sectors data
            const map = window.game?.map;
            let sectorData = null;
            if (map && map.voronoi && map.voronoi.sectors) {
                sectorData = { count: map.voronoi.sectors.length };

                // Sample first few sectors for biome info
                const sample = [];
                for (const s of map.voronoi.sectors.slice(0, 4)) {
                    if (s && s.biome) sample.push({ id: s.id, name: s.name, biome: s.biome });
                }
                sectorData.sample = sample;
            }

            return JSON.stringify({ meshes: totalMeshes, generatedProps: buildingCount, sectors: sectorData });
        } catch(e) { return `ERR:${e.message}`; }
    });

    console.log(`[MAP DEBUG] Final Check: ${finalCheck}`);

    // Save report
    const report = JSON.stringify({
        errors, logs, mapInfo, finalCheck, cameras: cameras.map(c => c.name),
        timestamp: new Date().toISOString()
    }, null, 2);

    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'debug-report.json'), report);

    // Take one more screenshot before closing for visual confirmation
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'final-overview.png') });

    console.log(`[MAP DEBUG] Test complete. Errors found: ${errors.length}, Screenshots in ${SCREENSHOT_DIR}`);

    await browser.close();
}

main().catch(e => { console.error('CRASH:', e.message); process.exit(1) });
