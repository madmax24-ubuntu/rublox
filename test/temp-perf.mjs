import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
    const text = message.text();
    if (text.includes('InstancedMesh') || text.includes('[MapGenerator]')) console.log(text);
});
await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });
await page.locator('#startButtonDesktop').click();
await page.waitForTimeout(500);
const perk = page.locator('.perk-btn[data-perk]').first();
if (await perk.count()) await perk.click();
await page.waitForTimeout(1000);
await page.evaluate(() => {
    if (!window.game) return;
    window.game.countdownTimer = 0;
    window.game.player.position.set(-80, 2, 70);
    const game = window.game;
    const update = game.update.bind(game);
    const render = game.render.bind(game);
    game.userDataPerf = { update: 0, render: 0, updates: 0, renders: 0 };
    game.update = delta => {
        const start = performance.now();
        update(delta);
        game.userDataPerf.update += performance.now() - start;
        game.userDataPerf.updates++;
    };
    game.render = () => {
        const start = performance.now();
        render();
        game.userDataPerf.render += performance.now() - start;
        game.userDataPerf.renders++;
    };
});
await page.waitForTimeout(3000);
const data = await page.evaluate(async () => {
    const game = window.game;
    const scene = game.scene;
    let center = 0;
    const centerObjects = [];
    let barbedMeshes = 0;
    let barbedInstances = 0;
    let visibleMeshes = 0;
    const box = new THREE.Box3();
    scene.updateMatrixWorld(true);
    for (const object of scene.children) {
        if (object.userData?.isBarbedWire) {
            barbedMeshes++;
            barbedInstances += object.count || 1;
        }
        if (object.visible && (object.isMesh || object.isInstancedMesh)) visibleMeshes++;
        if (!object.userData?.mapGenerated || object.userData?.isCornucopia || object.userData?.isTerrain || object.userData?.biomeBoundary || object.userData?.isBiomeEntrance || object.userData?.isSnowParticles || object.userData?.gameplayBoundary) continue;
        if (object.isInstancedMesh) {
            object.geometry.computeBoundingBox();
            const local = new THREE.Matrix4();
            const world = new THREE.Matrix4();
            for (let i = 0; i < object.count; i++) {
                object.getMatrixAt(i, local);
                world.multiplyMatrices(object.matrixWorld, local);
                box.copy(object.geometry.boundingBox).applyMatrix4(world);
                const x = box.min.x > 0 ? box.min.x : box.max.x < 0 ? box.max.x : 0;
                const z = box.min.z > 0 ? box.min.z : box.max.z < 0 ? box.max.z : 0;
                if (x * x + z * z < 76 * 76) {
                    center++;
                    centerObjects.push(`instance:${object.userData?.isMazeWalls ? 'maze' : 'generic'}`);
                }
            }
        } else {
            box.setFromObject(object);
            const x = box.min.x > 0 ? box.min.x : box.max.x < 0 ? box.max.x : 0;
            const z = box.min.z > 0 ? box.min.z : box.max.z < 0 ? box.max.z : 0;
            if (x * x + z * z < 76 * 76) {
                center++;
                centerObjects.push({
                    type: object.type,
                    name: object.name || 'unnamed',
                    keys: Object.keys(object.userData || {}),
                    position: object.position.toArray().map(value => Number(value.toFixed(1))),
                    bounds: [box.min.x, box.min.z, box.max.x, box.max.z].map(value => Number(value.toFixed(1)))
                });
            }
        }
    }
    const categories = {};
    scene.traverse(object => {
        if (!object.visible || !object.isMesh) return;
        let root = object;
        while (root.parent && root.parent !== scene) root = root.parent;
        const key = root.userData?.mapGenerated ? 'map' : root.userData?.isBot ? 'bot' : root.userData?.isZombie ? 'zombie' : root.type;
        categories[key] = (categories[key] || 0) + 1;
    });
    let frames = 0;
    const start = performance.now();
    await new Promise(resolve => {
        const tick = () => {
            frames++;
            if (performance.now() - start < 5000) requestAnimationFrame(tick);
            else resolve();
        };
        requestAnimationFrame(tick);
    });
    return {
        state: game.gameState,
        center,
        centerObjects: centerObjects.slice(0, 20),
        categories,
        barbedMeshes,
        barbedInstances,
        visibleMeshes,
        draws: game.renderer.info.render.calls,
        triangles: game.renderer.info.render.triangles,
        fps: frames / 5,
        bots: game.bots.length,
        details: game.bots.filter(bot => bot._lodDetailed).length
        ,botVisibility: game.bots[0].mesh.children.map(child => [child.userData?.isLodProxy || false, child.visible, child.type])
        ,timings: game.userDataPerf
    };
});
console.log(JSON.stringify({ data, errors }, null, 2));
await page.evaluate(() => {
    const game = window.game;
    game.gameLoop.stop();
    game.camera.position.set(-70, 9, 32);
    game.camera.lookAt(-108, 1.5, 5);
    game.render();
});
await page.screenshot({ path: 'test-results/military-perf.png' });
await browser.close();
