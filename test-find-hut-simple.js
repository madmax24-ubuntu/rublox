import { chromium } from 'playwright';
(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('Attempting to connect to http://127.0.0.1:3001...');
        await page.goto('http://127.0.0.1:3001/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
        console.error('Connection failed:', e.message);
        await browser.close();
        process.exit(1);
    }

    await page.waitForTimeout(5000);

    console.log('\n=== CENTER OBJECTS ===');

    const centerObjects = await page.evaluate(() => {
        const g = window.game;
        if (!g || !g.scene) return 'NO_GAME';

        const results = [];
        const map = g.map;
        if (map && map.getColliders) {
            const cols = map.getColliders();
            for(const c of cols) {
                // Using center point for distance check
                const cx = (c.min.x + c.max.x)/2;
                const cz = (c.min.z + c.max.z)/2;
                const dist = Math.sqrt(cx*cx + cz*cz);

                if (dist < 30) {
                    results.push({
                        x: cx.toFixed(2),
                        z: cz.toFixed(2),
                        w: (c.max.x - c.min.x).toFixed(2),
                        d: (c.max.z - c.min.z).toFixed(2),
                        walkable: c.walkable,
                        buildingType: g.map._buildings?.find(b => 
                            Math.abs(b.x - cx) < (b.w / 2 + 1) && Math.abs(b.z - cz) < (b.d / 2 + 1)
                        )?.template?.type || 'none'
                    });
                }
            }
        }
        return results;
    });

    console.log('Near Center:', JSON.stringify(centerObjects));
    await browser.close();
})();
