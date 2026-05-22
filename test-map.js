import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOT_DIR = path.join(__dirname, 'test-screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function screenshot(page, name) {
    const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`  [shot] ${name}`);
}

async function js(page, script) {
    return await page.evaluate(script);
}

async function runMapTest() {
    console.log('[test] Starting map test...\n');
    
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    
    try {
        // Navigate
        console.log('[1] Navigate...');
        await page.goto('http://localhost:3001');
        await screenshot(page, '01-start');
        
        // Click start
        console.log('[2] Start game...');
        await page.click('button.start-btn');
        
        // Wait for game
        console.log('[3] Waiting for game load...');
        let mapObjects = 0;
        for (let i = 0; i < 120; i++) {
            const info = await js(page, `(function() {
                var g = window.game;
                if (!g || !g.map) return null;
                var s = g.scene;
                var c = 0;
                s?.traverse(function(o) { if (o?.userData?.mapGenerated) c++; });
                return { ok: true, objects: c, state: g.gameState };
            })()`);
            if (info && info.ok && info.objects > 100) {
                mapObjects = info.objects;
                console.log(`  Loaded: ${info.objects} objects, state: ${info.state}`);
                break;
            }
            if (i % 10 === 0) console.log(`  Waiting... (${info?.objects || 0} objects)`);
            await new Promise(r => setTimeout(r, 1000));
        }
        if (mapObjects === 0) throw new Error('Game failed to load');
        await screenshot(page, '02-loaded');
        
        // Force playing state and hide UI
        console.log('[4] Fix game state...');
        await js(page, `(function() {
            var g = window.game;
            if (!g) return;
            g.gameState = 'playing';
            g.isStarted = true;
            g.perk = 'none';
            g.perkMenuOpen = false;
            g.perkSelectionRequired = false;
            g.countdownTime = 0;
            g.countdownTimer = 0;
            
            // Hide ALL UI
            var ids = ['perk-panel', 'hud', 'startScreen', 'loadingOverlay', 'rotateOverlay'];
            ids.forEach(function(id) {
                var el = document.getElementById(id);
                if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
            });
            document.querySelectorAll('button').forEach(function(b) { b.style.display = 'none'; });
        })()`);
        
        await new Promise(r => setTimeout(r, 2000));
        await screenshot(page, '03-fixed');
        
        // Camera positions to test
        const positions = [
            { name: 'top-down', x: 0, y: 200, z: 100, lookAt: [0, 0, 0] },
            { name: 'center-close', x: 30, y: 20, z: 30, lookAt: [0, 0, 0] },
            { name: 'center-far', x: 100, y: 60, z: 100, lookAt: [0, 0, 0] },
            { name: 'forest-nw', x: -80, y: 30, z: -80, lookAt: [-100, 0, -100] },
            { name: 'stone-ne', x: 80, y: 30, z: 80, lookAt: [100, 0, 100] },
            { name: 'military-sw', x: -80, y: 30, z: 80, lookAt: [-100, 0, 100] },
            { name: 'snow-se', x: 80, y: 30, z: -80, lookAt: [100, 0, -100] },
            { name: 'boundary-north', x: 0, y: 10, z: -130, lookAt: [0, 0, -150] },
            { name: 'boundary-south', x: 0, y: 10, z: 130, lookAt: [0, 0, 150] },
            { name: 'boundary-east', x: 130, y: 10, z: 0, lookAt: [150, 0, 0] },
            { name: 'boundary-west', x: -130, y: 10, z: 0, lookAt: [-150, 0, 0] },
        ];
        
        // Test each position
        for (const pos of positions) {
            console.log(`[5] Camera: ${pos.name} (${pos.x},${pos.y},${pos.z})`);
            await js(page, `(function() {
                var g = window.game;
                if (g?.camera) {
                    g.camera.position.set(${pos.x}, ${pos.y}, ${pos.z});
                    g.camera.lookAt(${pos.lookAt[0]}, ${pos.lookAt[1]}, ${pos.lookAt[2]});
                    g.camera.updateProjectionMatrix();
                }
            })()`);
            await screenshot(page, `04-${pos.name}`);
            await new Promise(r => setTimeout(r, 300));
        }
        
        // Camera orbit
        console.log('[6] Camera orbit...');
        for (let i = 0; i <= 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const r = 120;
            await js(page, `(function() {
                var g = window.game;
                if (g?.camera) {
                    g.camera.position.set(${Math.cos(angle) * r}, 80, ${Math.sin(angle) * r});
                    g.camera.lookAt(0, 0, 0);
                    g.camera.updateProjectionMatrix();
                }
            })()`);
            await screenshot(page, `05-orbit-${i.toString().padStart(2, '0')}`);
            await new Promise(r => setTimeout(r, 300));
        }
        
        // Final stats
        console.log('[7] Final stats...');
        const stats = await js(page, `(function() {
            var g = window.game;
            var s = g?.scene;
            if (!s) return { error: 'no scene' };
            var mc = 0, vc = 0, mg = 0;
            var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            var minY = Infinity, maxY = -Infinity;
            s?.traverse(function(o) {
                if (o?.userData?.mapGenerated) {
                    mc++;
                    if (o?.visible) vc++;
                    var wp = new THREE.Vector3();
                    o.getWorldPosition(wp);
                    if (wp.x < minX) minX = wp.x;
                    if (wp.x > maxX) maxX = wp.x;
                    if (wp.z < minZ) minZ = wp.z;
                    if (wp.z > maxZ) maxZ = wp.z;
                    if (wp.y < minY) minY = wp.y;
                    if (wp.y > maxY) maxY = wp.y;
                }
                if (o?.isMesh) mg++;
            });
            return {
                total: mc, visible: vc, meshes: mg,
                bounds: {
                    x: [minX, maxX], z: [minZ, maxZ], y: [minY, maxY]
                },
                camera: g?.camera?.position ? {
                    x: g.camera.position.x, y: g.camera.position.y, z: g.camera.position.z
                } : null,
                lights: (function() {
                    var dl = null, al = null;
                    s?.traverse(function(o) {
                        if (o?.isDirectionalLight) dl = o;
                        if (o?.isAmbientLight) al = o;
                    });
                    return { directional: dl?.intensity || 0, ambient: al?.intensity || 0 };
                })()
            };
        })()`);
        console.log('  Stats:', JSON.stringify(stats, null, 2));
        
        await screenshot(page, '06-final');
        
        console.log('\n✓ Test complete!');
        console.log(`  Screenshots: ${SCREENSHOT_DIR}`);
        const files = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'));
        console.log(`  Files: ${files.length}`);
        
    } catch (err) {
        console.error('[ERROR]', err.message);
        await screenshot(page, 'ERROR');
    } finally {
        await browser.close();
    }
}

runMapTest().catch(console.error);
