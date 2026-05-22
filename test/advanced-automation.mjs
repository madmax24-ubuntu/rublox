import { GameAutomation } from './run-automation.mjs';

/**
 * Advanced automation with visual analysis
 * Usage: node test/advanced-automation.mjs [options]
 *   --quick     Quick test (4 screenshots + stats)
 *   --full      Full test (all biomes + views)
 *   --biome     Test specific biome: --biome NW_лес
 *   --watch     Continuous watch mode
 */

const args = process.argv.slice(2);
const mode = args.includes('--quick') ? 'quick' : 
             args.includes('--biome') ? 'biome' : 'full';
const biomeName = args.find(a => a.startsWith('--biome='))?.split('=')[1] || 
                  args.find(a => a === '--biome');

async function run() {
    console.log(`🤖 Running automation in ${mode} mode`);
    console.log('='.repeat(60));

    const auto = new GameAutomation();
    await auto.init();

    try {
        // Check if game is already running (from previous test)
        const gameRunning = await auto.page.evaluate(() => {
            return !!(window.game && window.game.scene);
        });

        if (!gameRunning) {
            await auto.clickStart();
            await auto.selectPerk();
        }
        await auto.page.waitForTimeout(3000);

        if (mode === 'quick') {
            // Quick smoke test
            console.log('\n🔍 Quick smoke test...');
            await auto.positionCamera(0, 20, 50, { x: 0, y: 0, z: 0 });
            await auto.screenshot('center', 'Center platform');
            await auto.checkObjectCount(6000);
            await auto.positionPlayer(-100, 3, -100);
            await auto.page.waitForTimeout(1000);
            await auto.positionCamera(-100, 20, -50, { x: -100, y: 0, z: -100 });
            await auto.screenshot('biome_NW', 'NW Forest biome');
        } else if (mode === 'biome' && biomeName) {
            // Test specific biome
            console.log(`\n🔍 Testing biome: ${biomeName}`);
            const biomeMap = {
                'NW_лес': { x: -100, z: -100 },
                'NE_камень': { x: 100, z: -100 },
                'SW_военка': { x: -100, z: 100 },
                'SE_снег': { x: 100, z: 100 }
            };
            const pos = biomeMap[biomeName];
            if (pos) {
                await auto.positionPlayer(pos.x, 3, pos.z);
                await auto.positionCamera(pos.x, 20, pos.z - 50, { x: pos.x, y: 0, z: pos.z });
                await auto.screenshot(`biome_${biomeName}`, `${biomeName} view`);
                await auto.positionCamera(pos.x, 3, pos.z + 10, { x: pos.x, y: 0, z: pos.z });
                await auto.screenshot(`biome_${biomeName}_ground`, `${biomeName} ground`);
            }
        } else {
            // Full test
            await auto.testGameFlow();
        }

        console.log('\n✅ All tests passed');
    } catch (err) {
        console.error('\n❌ Test failed:', err.message);
        await auto.browser.close();
        process.exit(1);
    }

    await auto.browser.close();
    console.log('\n🤖 Automation complete');
}

run();
