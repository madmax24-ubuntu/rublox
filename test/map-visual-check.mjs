import playwright from 'playwright';

async function main() {
    console.log('[0.0] Starting map visual analysis with top-down cameras');

    const browser = await playwright.chromium.launch({ headless: false });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    await page.goto('http://localhost:3001/');
    await page.waitForSelector('#startScreen');
    await page.click('button');
    await page.waitForSelector('#loadingOverlay');

    // Wait for map generation
    await new Promise(r => setTimeout(r, 30000));

    const screenshots = [];

    // Camera 1: Original top-down (500, 500, 500)
    await page.evaluate(() => {
        window.game?.player?.camera?.position?.set(0, 500, 500);
        window.game?.player?.camera?.lookAt(0, 0, 0);
    });
    await new Promise(r => setTimeout(r, 2000));
    const p1 = await page.screenshot({ path: 'test-results/visual-cam-top500.png', fullPage: false });
    console.log(`[CAM1] Top-down 500m: ${p1}`);

    // Camera 2: High angle isometric (200, 200, 200)
    await page.evaluate(() => {
        window.game?.player?.camera?.position?.set(200, 200, 200);
    });
    await new Promise(r => setTimeout(r, 2000));
    const p2 = await page.screenshot({ path: 'test-results/visual-cam-iso200.png', fullPage: false });
    console.log(`[CAM2] Isometric 200m: ${p2}`);

    // Camera 3: Closer top-down (100, 100, 100)
    await page.evaluate(() => {
        window.game?.player?.camera?.position?.set(100, 100, 100);
    });
    await new Promise(r => setTimeout(r, 2000));
    const p3 = await page.screenshot({ path: 'test-results/visual-cam-close100.png', fullPage: false });
    console.log(`[CAM3] Close top-down 100m: ${p3}`);

    // Camera 4: Ground level (0, 3, 0) — first person view
    await page.evaluate(() => {
        window.game?.player?.camera?.position?.set(0, 3, 0);
    });
    await new Promise(r => setTimeout(r, 2000));
    const p4 = await page.screenshot({ path: 'test-results/visual-cam-ground.png', fullPage: false });
    console.log(`[CAM4] Ground level: ${p4}`);

    // Camera 5: Near building (50, 10, 50)
    await page.evaluate(() => {
        window.game?.player?.camera?.position?.set(50, 10, 50);
    });
    await new Promise(r => setTimeout(r, 2000));
    const p5 = await page.screenshot({ path: 'test-results/visual-cam-near.png', fullPage: false });
    console.log(`[CAM5] Near building: ${p5}`);

    // Camera 6: Another angle (−80, 60, −80)
    await page.evaluate(() => {
        window.game?.player?.camera?.position?.set(-80, 60, -80);
    });
    await new Promise(r => setTimeout(r, 2000));
    const p6 = await page.screenshot({ path: 'test-results/visual-cam-ang2.png', fullPage: false });
    console.log(`[CAM6] Angled -80,60,-80: ${p6}`);

    // Camera 7: Far top-down (300, 300, 300)
    await page.evaluate(() => {
        window.game?.player?.camera?.position?.set(300, 300, 300);
    });
    await new Promise(r => setTimeout(r, 2000));
    const p7 = await page.screenshot({ path: 'test-results/visual-cam-far300.png', fullPage: false });
    console.log(`[CAM7] Far 300m: ${p7}`);

    // Camera 8: 90-degree rotated view
    await page.evaluate(() => {
        window.game?.player?.camera?.position?.set(0, 500, -200);
    });
    await new Promise(r => setTimeout(r, 2000));
    const p8 = await page.screenshot({ path: 'test-results/visual-cam-rotated.png', fullPage: false });
    console.log(`[CAM8] Rotated back: ${p8}`);

    // Analyze scene objects
    const sceneAnalysis = await page.evaluate(() => {
        const scene = window.game?.scene;
        if (!scene) return 'No scene';

        let meshCount = 0;
        let buildingMeshes = 0;
        let propMeshes = 0;
        let treeCount = 0;
        let rockCount = 0;

        scene.traverse((child) => {
            if (child.isMesh) {
                meshCount++;
                const name = child.name || child.userData?.mapGenerated ? 'generated' : 'unknown';
                if (child.geometry?.type === 'BoxGeometry' || child.geometry?.type === 'CylinderGeometry') {
                    const size = child.geometry.parameters;
                    if (size?.width > 4 || size?.height > 3 || size?.radius > 1) {
                        buildingMeshes++;
                    } else if (size?.width < 2 && size?.height < 1.5) {
                        propMeshes++;
                    }
                }
                if (child.material?.color?.getHex === 0x3a5a2a || child.material?.roughness < 0.7) {
                    treeCount++;
                } else if (child.material?.color?.getHex === 0x808080) {
                    rockCount++;
                }
            }
        });

        return {
            meshCount,
            buildingMeshes,
            propMeshes,
            treeCount,
            rockCount
        };
    });

    console.log('\n[ANALYSIS] Scene object counts:', JSON.stringify(sceneAnalysis, null, 2));

    // Check for specific elements we added
    const elementCheck = await page.evaluate(() => {
        let staircases = 0;
        let ladders = 0;
        let sandbags = 0;
        let concrete = 0;
        let tables = 0;
        let crates = 0;
        let barrels = 0;
        let interiorWalls = 0;
        let breakableWalls = 0;
        let lights = 0;
        let mezzanines = 0;

        window.game?.scene?.traverse((child) => {
            if (child.isMesh) {
                const params = child.geometry?.parameters || {};
                const w = params?.width || 0;
                const h = params?.height || 0;
                const d = params?.depth || params?.radius + params?.radiusTop + params?.radiusBottom || 0;

                // Stairs
                if (h > 0.1 && h < 0.2 && w > 1 && d > 0.2) staircases++;
                // Sandbags: ~0.8x0.6x0.35
                if (w > 0.7 && w < 0.9 && h > 0.5 && h < 0.7 && d > 0.3 && d < 0.5) sandbags++;
                // Concrete: ~1.2x0.6x0.3
                if (w > 1.1 && w < 1.3 && h > 0.5 && h < 0.7 && d > 0.2 && d < 0.4) concrete++;
                // Tables: ~2.4x0.12x1.6
                if (w > 2 && w < 3 && h > 0.05 && h < 0.2 && d > 1.4 && d < 1.8) tables++;
                // Crates: small boxes
                if (w > 0.3 && w < 1 && h > 0.3 && h < 0.8 && d > 0.3 && d < 0.7) crates++;
                // Barrels: cylinder
                if (params?.radius && params?.radius > 0.3 && params?.radius < 0.5 && h > 0.9) barrels++;
                // Interior walls
                if (w > 0.1 && w < 0.5 && h > 1.5 && h < 3 && d > 0.5) interiorWalls++;
                // Lights
                if (child.isPointLight || child.isSpotLight) lights++;
            }
        });

        return { staircases, ladders, sandbags, concrete, tables, crates, barrels, interiorWalls, breakableWalls, lights };
    });

    console.log('\n[ELEMENTS] Detected elements:', JSON.stringify(elementCheck, null, 2));

    await browser.close();
    console.log('\nDone! All screenshots saved.');
}

main().catch(console.error);
