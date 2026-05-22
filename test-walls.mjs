import { chromium } from 'playwright';

const URL = 'http://localhost:3001?debug=true';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));
    page.on('pageerror', err => console.error('[PAGE ERROR]', err.message));

    console.log('Opening debug mode...');
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    // Check colliders count and positions
    const colliderInfo = await page.evaluate(() => {
        if (!window.game?.map) return null;
        const colliders = window.game.map.colliders || [];
        
        // Count colliders by approximate position
        let centerWalls = 0;  // Should be 0 (no internal walls)
        let outerWalls = 0;   // Should be 4 (outer perimeter)
        let cornerPillars = 0;
        let pathColliders = 0;
        
        for (const c of colliders) {
            if (!c || !c.position) continue;
            const px = c.position.x;
            const pz = c.position.z;
            
            // Check if near center (internal wall)
            if (Math.abs(px) < 5 && Math.abs(pz) < 5) {
                centerWalls++;
            }
            
            // Check if at outer edges (±128)
            if ((Math.abs(px) > 120 || Math.abs(pz) > 120)) {
                if (Math.abs(px) < 5 || Math.abs(pz) < 5 || Math.abs(px - pz) < 5 || Math.abs(Math.abs(px) - Math.abs(pz)) < 5) {
                    outerWalls++;
                }
            }
            
            // Check path colliders (near winding paths)
            if (Math.abs(c.position.y - 0) < 1 && c.size && c.size.x === 3) {
                pathColliders++;
            }
        }
        
        return {
            total: colliders.length,
            centerWalls,
            outerWalls,
            cornerPillars,
            pathColliders
        };
    });
    
    console.log('Collider info:', colliderInfo);
    
    // Verify: no center walls, has outer walls, has path colliders
    if (colliderInfo) {
        console.log(`Total colliders: ${colliderInfo.total}`);
        console.log(`Center walls (should be 0): ${colliderInfo.centerWalls}`);
        console.log(`Outer walls (should be >0): ${colliderInfo.outerWalls}`);
        console.log(`Path colliders (should be >0): ${colliderInfo.pathColliders}`);
        
        if (colliderInfo.centerWalls === 0 && colliderInfo.outerWalls > 0 && colliderInfo.pathColliders > 0) {
            console.log('✅ ALL CHECKS PASSED');
        } else {
            console.log('❌ SOME CHECKS FAILED');
        }
    }

    await browser.close();
})();
