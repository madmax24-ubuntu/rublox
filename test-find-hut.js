import { chromium } from 'playwright';
(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ 
        viewport: { width: 1280, height: 720 },
        bypassCSP: true,
        ignoreHTTPSErrors: true,
        userAgent: 'TestClient'
    });
    const page = await context.newPage();
    
    await context.route('**', route => {
        const request = route.request();
        const url = new URL(request.url());
        url.searchParams.set('_t', Date.now());
        route.continue({ url: url.toString() });
    });

    page.on('console', msg => {
        if (msg.type() === 'log') console.log('LOG:', msg.text());
        if (msg.type() === 'error') console.error('ERR:', msg.text());
    });

    await page.goto('http://localhost:3001/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(5000); // Give time for generation

    console.log('\n=== FULL SCENE OBJECT ANALYSIS ===');

    const sceneData = await page.evaluate(() => {
        const g = window.game;
        if (!g || !g.scene) return { error: 'NO_GAME_OR_SCENE' };

        const objects = [];
        // We traverse the scene graph to find all meshes/groups
        // Since we can't easily access everything without a deep traversal, 
        // let's use the known colliders and buildings as a proxy if possible.
        
        const map = g.map;
        if (!map) return { error: 'NO_MAP' };

        // Check Buildings (log cabins etc)
        const buildings = [];
        for(const b of map._buildings || []) {
            buildings.push({ x: b.x, z: b.z, type: b.template?.type });
        }

        // Check Colliders - these are the most reliable way to find "physical" objects
        const colliders = map.getColliders ? map.getColliders() : [];
        const colliderData = colliders.map(c => {
            return {
                x: (c.min.x + c.max.x) / 2,
                z: (c.min.z + c.max.z) / 2,
                w: c.max.x - c.min.x,
                d: c.max.z - c.min.z,
                walkable: c.walkable,
                // We can't easily get the type from a collider unless we store it
            };
        });

        return { buildings, colliders: colliderData };
    });

    console.log('Buildings found:', JSON.stringify(sceneData.buildings));
    console.log('Colliders count:', sceneData.colliders?.length || 0);

    // Find objects near center (within radius 30)
    const nearbyObjects = await page.evaluate(() => {
        const g = window.game;
        if (!g || !g.map) return [];

        const results = [];
        const colliders = g.map.getColliders ? g.map.getColliders() : [];
        
        for (const c of colliders) {
            // Center of collider
            const cx = (c.min.x + c.max.x) / 2;
            const cz = (c.min.z + c.max.z) / 2;
            const dist = Math.sqrt(cx * cx + cz * cz);

            if (dist < 30) {
                results.push({
                    x: cx.toFixed(2),
                    z: cz.toFixed(2),
                    w: (c.max.x - c.min.x).toFixed(2),
                    d: (c.max.z - c.min.z).toFixed(2),
                    walkable: c.walkable,
                    // We check if it's part of a known building structure
                    isBuilding: g.map._buildings?.some(b => 
                        Math.abs(b.x - cx) < (b.w / 2 + 1) && Math.abs(b.z - cz) < (b.d / 2 + 1)
                    ) || false,
                    buildingType: g.map._buildings?.find(b => 
                        Math.abs(b.x - cx) < (b.w / 2 + 1) && Math.abs(b.z - cz) < (b.d / 2 + 1)
                    )?.template?.type || 'unknown'
                });
            }
        }
        return results;
    });

    console.log('Objects near center:', JSON.stringify(nearbyObjects));

    await browser.close();
})();
