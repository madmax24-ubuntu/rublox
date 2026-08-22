// Diagnostic: verify maze walls sync, gate colliders, bot count, spawn pads
const { chromium } = require("@playwright/test");

(async () => {
    const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=d3d11"] });
    const page = await browser.newPage();
    const logs = [];
    page.on("console", (msg) => {
        const t = msg.text();
        if (t.includes("Synced maze") || t.includes("[MapGenerator] Synced")) logs.push(t);
    });

    console.log("Loading page...");
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 120000 });

    const startBtn = page.locator("#startButtonDesktop");
    const box = await startBtn.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    console.log("Clicked start. Tracking game state...");

    let reachedSpawn = false;
    for (let i = 0; i < 90; i++) {
        await page.waitForTimeout(2000);
        const st = await page.evaluate(() => {
            const g = window.game;
            if (!g) return null;
            return { state: g.gameState, spawnTimer: g.spawnTimer, countdown: g.countdownTimer, paused: g.isPaused, bots: g.bots?.length || 0 };
        });
        if (st) {
            console.log(`t=${(i+1)*2}s state=${st.state} spawnTimer=${st.spawnTimer?.toFixed?.(1)} countdown=${st.countdown?.toFixed?.(1)} paused=${st.paused} bots=${st.bots}`);
            if (st.state === "spawn" || st.state === "playing") { reachedSpawn = true; break; }
        }
    }
    if (!reachedSpawn) console.log("WARNING: did not reach spawn/playing in time");

    await page.waitForTimeout(2000);

    const audit = await page.evaluate(() => {
        const g = window.game;
        const map = g.map;
        const scene = g.scene;
        let mazeMesh = null;
        for (const c of scene.children) if (c.isInstancedMesh && c.userData?.isMazeWalls) { mazeMesh = c; break; }
        const mazeColliders = (map.colliders || []).filter(c => c.isMazeWall === true);
        const gateColliders = map._biomeGateColliders || [];
        const gateEnabled = gateColliders.filter(c => c.enabled === true);
        const pads = map.getSpawnPads ? map.getSpawnPads() : (map.spawnPads || []);
        const ringWallColliders = (map.colliders || []).filter(c => c.isRingWall === true);
        return {
            mazeInstances: mazeMesh ? mazeMesh.count : -1,
            mazeColliders: mazeColliders.length,
            mazeCollidersEnabled: mazeColliders.filter(c => c.enabled !== false).length,
            gateColliders: gateColliders.length,
            gateEnabledCount: gateEnabled.length,
            biomeGatesOpen: map.biomeGatesOpen,
            ringWallColliders: ringWallColliders.length,
            spawnPads: pads.length,
            bots: g.bots?.length || 0,
            state: g.gameState
        };
    });
    console.log("\n=== AUDIT ===");
    console.log(JSON.stringify(audit, null, 2));
    console.log("\n=== MAPGEN SYNC LOGS ===");
    logs.forEach(l => console.log(l));

    await browser.close();
})();
