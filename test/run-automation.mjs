import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

const SCREENSHOT_DIR = 'test/automated';
const SERVER_URL = 'http://localhost:3001';

// Ensure output directory
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

class GameAutomation {
    constructor() {
        this.browser = null;
        this.page = null;
        this.game = null;
        this.screenshots = [];
    }

    async init() {
        this.browser = await chromium.launch({ headless: true });
        this.page = await this.browser.newPage({ viewport: { width: 1920, height: 1080 } });

        this.page.on('console', msg => {
            const text = msg.text();
            if (text.includes('MapGenerator') || text.includes('MAIN') || text.includes('ERROR') || 
                text.includes('scene') || text.includes('WARN') || text.includes('DEBUG') ||
                text.includes('objects') || text.includes('loaded')) {
                console.log(`  📡 ${text.substring(0, 200)}`);
            }
        });
        this.page.on('pageerror', err => console.log(`  ❌ ${err.message}`));

        console.log('🌐 Opening game...');
        await this.page.goto(SERVER_URL, { waitUntil: 'networkidle', timeout: 30000 });
        console.log('✅ Game loaded');
    }

    async clickStart() {
        try {
            await this.page.waitForSelector('#startButtonDesktop', { timeout: 5000 });
            await this.page.click('#startButtonDesktop');
            console.log('🖱️ Clicked start');
            await this.page.waitForTimeout(2000);
        } catch (e) {
            console.log('⚠️ Start button not found (game may already be running)');
        }
    }

    async selectPerk() {
        try {
            await this.page.waitForFunction(() => {
                const panel = document.getElementById('perkPanel');
                return panel && panel.offsetParent !== null;
            }, { timeout: 5000 });

            await this.page.evaluate(() => {
                const perkPanel = document.getElementById('perkPanel');
                if (perkPanel) {
                    const btn = perkPanel.querySelector('button[data-perk]');
                    if (btn) btn.click();
                }
            });
            console.log('🖱️ Selected perk');
        } catch (e) {
            console.log('⚠️ Perk panel not found (game may already be running)');
        }
        await this.page.waitForTimeout(1000);
    }

    async positionPlayer(x, y, z) {
        await this.page.evaluate((pos) => {
            if (window.game && window.game.player) {
                window.game.player.position.set(pos.x, pos.y || 3, pos.z);
            }
        }, { x, y, z });
        await this.page.waitForTimeout(1000);
    }

    async positionCamera(x, y, z, lookAt = { x: 0, y: 0, z: 0 }) {
        await this.page.evaluate((data) => {
            if (window.game && window.game.camera) {
                window.game.camera.position.set(data.pos.x, data.pos.y, data.pos.z);
                window.game.camera.lookAt(data.look.x, data.look.y, data.look.z);
            }
        }, { pos: { x, y, z }, look: lookAt });
        await this.page.waitForTimeout(1500);
    }

    async screenshot(name, desc = '') {
        const filePath = path.join(SCREENSHOT_DIR, `ss_${name}.png`);
        await this.page.screenshot({ path: filePath, fullPage: false });
        this.screenshots.push({ name, path: filePath, desc });
        console.log(`  📸 ${name}${desc ? ` (${desc})` : ''}`);
        return filePath;
    }

    async getSceneStats() {
        const stats = await this.page.evaluate(() => {
            if (!window.game || !window.game.scene) return { total: 0, meshes: 0, groups: 0 };

            let total = 0;
            let meshes = 0;
            let groups = 0;

            function count(obj) {
                total++;
                if (obj.isMesh) meshes++;
                if (obj.isGroup) groups++;

                const children = obj.children || [];
                for (const child of children) {
                    count(child);
                }
            }

            count(window.game.scene);
            return { total, meshes, groups };
        });
        console.log(`  📊 Scene: ${stats.total} objects (${stats.meshes} meshes, ${stats.groups} groups)`);
        return stats;
    }

    async checkObjectCount(maxExpected = 5000) {
        const stats = await this.getSceneStats();
        const pass = stats.total <= maxExpected;
        console.log(`  ${pass ? '✅' : '⚠️'} Object count: ${stats.total} (max: ${maxExpected})`);
        return { pass, ...stats };
    }

    async testGameFlow() {
        console.log('\n=== TESTING GAME FLOW ===\n');

        // 1. Menu screen
        console.log('📋 Phase 1: Menu');
        await this.screenshot('menu', 'Start screen');

        // 2. Start game
        console.log('\n🎮 Phase 2: Starting game');
        await this.clickStart();
        await this.screenshot('after_start', 'After clicking start');

        // 3. Perk selection
        console.log('\n🎁 Phase 3: Perk selection');
        await this.selectPerk();
        await this.screenshot('perk_selected', 'Perk panel visible');

        // 4. Wait for map generation
        console.log('\n🗺️ Phase 4: Map generation');
        await this.page.waitForTimeout(5000);
        await this.screenshot('map_generated', 'Map loaded');

        // 5. Check scene stats
        console.log('\n📊 Phase 5: Scene statistics');
        await this.checkObjectCount(6000);

        // 6. Test center view
        console.log('\n🎯 Phase 6: Center platform');
        await this.positionCamera(0, 20, 50, { x: 0, y: 0, z: 0 });
        await this.screenshot('center_top', 'Center platform (top view)');
        await this.positionCamera(0, 3, 10, { x: 0, y: 0, z: 0 });
        await this.screenshot('center_ground', 'Center platform (ground view)');

        // 7. Test all 4 biomes
        console.log('\n🌲 Phase 7: Biome checks');
        const biomePositions = [
            { name: 'NW_лес', x: -100, z: -100, camY: 20, camZ: -50 },
            { name: 'NE_камень', x: 100, z: -100, camY: 20, camZ: -50 },
            { name: 'SW_военка', x: -100, z: 100, camY: 20, camZ: 150 },
            { name: 'SE_снег', x: 100, z: 100, camY: 20, camZ: 150 }
        ];

        for (const biome of biomePositions) {
            console.log(`  Checking ${biome.name}...`);
            await this.positionPlayer(biome.x, 3, biome.z);
            await this.positionCamera(biome.x, biome.camY, biome.camZ, { x: biome.x, y: 0, z: biome.z });
            await this.screenshot(`biome_${biome.name}_top`, `${biome.name} (top)`);
            await this.positionCamera(biome.x, 3, biome.z + 15, { x: biome.x, y: 0, z: biome.z });
            await this.screenshot(`biome_${biome.name}_ground`, `${biome.name} (ground)`);
        }

        // 8. Check boundary fence
        console.log('\n🚧 Phase 8: Boundary fence check');
        await this.positionCamera(0, 50, 150, { x: 0, y: 0, z: 0 });
        await this.screenshot('fence_view', 'Boundary fence from center');

        // 9. Corner views
        console.log('\n📐 Phase 9: Corner views');
        const corners = [
            { name: 'corner_NE', x: 130, z: -130 },
            { name: 'corner_NW', x: -130, z: -130 },
            { name: 'corner_SE', x: 130, z: 130 },
            { name: 'corner_SW', x: -130, z: 130 }
        ];
        for (const corner of corners) {
            await this.positionCamera(corner.x, 50, corner.z + 50, { x: corner.x, y: 0, z: corner.z });
            await this.screenshot(`corner_${corner.name}`, `Corner ${corner.name}`);
        }

        // 10. Final summary
        console.log('\n📋 Phase 10: Final summary');
        await this.positionCamera(0, 300, 200, { x: 0, y: 0, z: 0 });
        await this.screenshot('global_view', 'Global overview');

        // Get final stats
        const finalStats = await this.getSceneStats();

        await this.browser.close();

        console.log('\n=== AUTOMATION COMPLETE ===\n');
        console.log(`📸 Screenshots saved: ${this.screenshots.length}`);
        console.log(`📊 Final scene stats: ${JSON.stringify(finalStats)}`);
        console.log(`📁 Directory: ${SCREENSHOT_DIR}/\n`);

        return { screenshots: this.screenshots, stats: finalStats };
    }

    async shutdown() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// Run if executed directly
if (process.argv[1] === path.resolve(__filename)) {
    const automation = new GameAutomation();
    automation.init()
        .then(() => automation.testGameFlow())
        .then(result => {
            console.log('✅ Automation finished successfully');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Automation failed:', err.message);
            automation.shutdown();
            process.exit(1);
        });
}

export { GameAutomation };
export default GameAutomation;
