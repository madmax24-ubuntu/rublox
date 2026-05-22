import { chromium } from 'playwright';

const URL = 'http://localhost:3001?debug=true';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));
    page.on('pageerror', err => console.error('[PAGE ERROR]', err.message));

    console.log('Opening debug mode...');
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(10000);

    // Verify map dimensions and structure
    const mapCheck = await page.evaluate(() => {
        if (!window.game?.map) return { error: 'no map' };
        const map = window.game.map;
        
        // Count ground meshes by position
        let grounds = [];
        let colliders = map.colliders || [];
        
        // Check biome boundaries
        let biomeWalls = 0;
        let outerWalls = 0;
        
        for (const c of colliders) {
            if (!c || !c.position) continue;
            const px = Math.abs(c.position.x);
            const pz = Math.abs(c.position.z);
            
            // Outer walls at ±256
            if (px > 250 || pz > 250) {
                outerWalls++;
            }
            // Biome boundaries at ±60
            if ((px > 55 && px < 65) || (pz > 55 && pz < 65)) {
                biomeWalls++;
            }
        }
        
        // Count objects
        let objCount = 0;
        map.scene.traverse(() => objCount++);
        
        return {
            mapSize: map.mapSize,
            halfSize: map.halfSize,
            totalColliders: colliders.length,
            biomeWalls,
            outerWalls,
            objectCount: objCount,
            spawnPadCount: map.spawnPads?.length || 0,
            floorTileCount: map.floorTiles?.length || 0
        };
    });

    console.log('\n=== MAP STRUCTURE VERIFICATION ===');
    if (mapCheck.error) {
        console.log(`❌ ${mapCheck.error}`);
    } else {
        console.log(`Map size: ${mapCheck.mapSize}x${mapCheck.mapSize}`);
        console.log(`Half size: ${mapCheck.halfSize}`);
        console.log(`Total colliders: ${mapCheck.totalColliders}`);
        console.log(`Biome boundary walls (±60): ${mapCheck.biomeWalls}`);
        console.log(`Outer walls (±256): ${mapCheck.outerWalls}`);
        console.log(`Objects: ${mapCheck.objectCount}`);
        console.log(`Spawn pads: ${mapCheck.spawnPadCount}`);
        console.log(`Floor tiles: ${mapCheck.floorTileCount}`);
        
        const mapOk = mapCheck.mapSize === 512 && mapCheck.halfSize === 256;
        const wallsOk = mapCheck.biomeWalls > 0 && mapCheck.outerWalls > 0;
        
        console.log(`\nMap size: ${mapOk ? '✅' : '❌'}`);
        console.log(`Walls: ${wallsOk ? '✅' : '❌'}`);
    }

    // Check ground Y levels for z-fighting
    const groundCheck = await page.evaluate(() => {
        if (!window.game?.map) return { error: 'no map' };
        
        // Check for consistent ground Y levels by looking at collider positions
        const colliders = window.game.map.colliders || [];
        let groundYs = new Set();
        
        // Look for flat surfaces (height < 1) which are likely ground
        for (const c of colliders) {
            if (!c || !c.position || !c.size) continue;
            const h = c.size.y || 0;
            if (h < 1) {
                groundYs.add(c.position.y.toFixed(2));
            }
        }
        
        return {
            uniqueGroundYs: [...groundYs],
            count: groundYs.size
        };
    });

    console.log('\n=== GROUND Y LEVELS (z-fighting check) ===');
    if (groundCheck.error) {
        console.log(`❌ ${groundCheck.error}`);
    } else {
        console.log(`Unique ground Y levels: ${groundCheck.uniqueGroundYs.join(', ')}`);
        console.log(`Count: ${groundCheck.count}`);
        console.log(`Z-fighting risk: ${groundCheck.count <= 2 ? '✅ LOW' : '⚠️ MEDIUM'}`);
    }

    // Take screenshots at key positions
    const keyPositions = [
        { name: 'top_overview', pos: { x: 0, y: 400, z: 0.01 } },
        { name: 'north_biome_wall', pos: { x: 0, y: 20, z: -60 } },
        { name: 'south_biome_wall', pos: { x: 0, y: 20, z: 60 } },
        { name: 'east_biome_wall', pos: { x: 60, y: 20, z: 0 } },
        { name: 'west_biome_wall', pos: { x: -60, y: 20, z: 0 } },
        { name: 'outer_north_wall', pos: { x: 0, y: 20, z: -256 } },
        { name: 'outer_south_wall', pos: { x: 0, y: 20, z: 256 } },
        { name: 'outer_east_wall', pos: { x: 256, y: 20, z: 0 } },
        { name: 'outer_west_wall', pos: { x: -256, y: 20, z: 0 } },
        { name: 'center_platform', pos: { x: 0, y: 50, z: 50 } },
    ];

    console.log('\n=== TAKING SCREENSHOTS ===');
    for (const kp of keyPositions) {
        await page.evaluate(({ pos }) => {
            if (window.game?.camera) {
                window.game.camera.position.set(pos.x, pos.y, pos.z);
                window.game.camera.lookAt(0, 0, 0);
            }
        }, { pos: kp.pos });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `test-screenshots/${kp.name}.png`, fullPage: false });
        console.log(`✅ ${kp.name}`);
    }

    console.log('\n=== VERIFICATION COMPLETE ===');
    console.log('Screenshots saved to test-screenshots/');

    await browser.close();
})();
