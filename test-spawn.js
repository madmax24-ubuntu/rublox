import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] });
    const page = await browser.newPage();

    const logs = [];
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[Game]') || text.includes('[Physics]') || text.includes('[Test]')) {
            logs.push(text);
            console.log(text);
        }
    });
    page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

    const response = await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Page loaded, status:', response.status);

    await page.waitForTimeout(2000);

    await page.evaluate(() => { window.__kilo_test__ = true; });
    try { await page.click('button.start-btn'); } catch(e) {}
    console.log('Clicked start button');
    
    await page.waitForFunction(() => {
        const g = window.game;
        return g && g.isStarted && g.player && g.bots && g.bots.length > 0;
    }, { timeout: 120000 });
    
    // Wait for countdown to finish
    await page.waitForFunction(() => {
        const g = window.game;
        console.log(`[Test] gameState=${g?.gameState}, countdownTimer=${g?.countdownTimer}`);
        return g && g.gameState === 'spawn';
    }, { timeout: 120000 });

    console.log('Game is started, checking spawn positions...');

    const result = await page.evaluate(() => {
        const g = window.game;
        const pads = g.map.getSpawnPads?.() || [];
        const player = g.player;
        const bots = g.bots || [];
        
        // Debug: check physics colliders
        const physics = g.physics;
        const colliders = physics?.colliders || [];
        
        // Find center platform collider
        const centerPlatform = colliders.find(c => c.walkable && c.max && Math.abs(c.max.x - 27) < 1 && Math.abs(c.max.y - 2) < 1 && Math.abs(c.max.z - 27) < 1);
        console.log(`[Test] Center platform: ${centerPlatform ? 'found' : 'not found'}, max.y=${centerPlatform?.max?.y}`);

        const playerPad = pads.find(p => {
            const dx = player.position.x - p.x;
            const dz = player.position.z - p.z;
            return Math.sqrt(dx*dx + dz*dz) < 1.5;
        });

        const playerOnPad = !!playerPad;
        const playerGroundY = playerPad ? playerPad.y : -999;
        const playerY = player.position.y;
        const playerHeight = player.physics?.height || 1.7;
        const expectedY = playerGroundY + playerHeight;
        const playerYError = playerY - expectedY;

        const botResults = [];
        for (let i = 0; i < bots.length; i++) {
            const bot = bots[i];
            const botPad = pads.find(p => {
                const dx = bot.position.x - p.x;
                const dz = bot.position.z - p.z;
                return Math.sqrt(dx*dx + dz*dz) < 1.5;
            });

            if (botPad) {
                const botHeight = bot.physics?.height || 1.9;
                const expectedBotY = botPad.y + botHeight;
                const botYError = bot.position.y - expectedBotY;
                botResults.push({
                    id: i,
                    onPad: true,
                    padY: botPad.y,
                    botY: bot.position.y,
                    expectedY: expectedBotY,
                    error: botYError,
                    onSurface: Math.abs(botYError) < 0.1
                });
            } else {
                botResults.push({
                    id: i,
                    onPad: false,
                    padY: null,
                    botY: bot.position.y,
                    expectedY: null,
                    error: null,
                    onSurface: false
                });
            }
        }

        const allBotsOnSurface = botResults.every(b => b.onSurface);
        const allBotsOnPads = botResults.every(b => b.onPad);
        const playerOnSurface = Math.abs(playerYError) < 0.1;

        return {
            padCount: pads.length,
            botCount: bots.length,
            player: {
                onPad: playerOnPad,
                padY: playerPad ? playerPad.y : null,
                playerY: playerY,
                expectedY: expectedY,
                yError: playerYError,
                onSurface: playerOnSurface
            },
            bots: botResults,
            allBotsOnSurface,
            allBotsOnPads,
            playerOnSurface
        };
    });

    console.log('\n=== SPAWN TEST RESULTS ===');
    console.log('Pad count:', result.padCount);
    console.log('Bot count:', result.bots.length);
    console.log('Player on pad:', result.player.onPad);
    console.log('Player padY:', result.player.padY);
    console.log('Player Y:', result.player.playerY);
    console.log('Expected Y:', result.player.expectedY);
    console.log('Player Y error:', result.player.yError.toFixed(3));
    console.log('Player on surface:', result.player.onSurface);
    console.log('All bots on surface:', result.allBotsOnSurface);
    console.log('All bots on pads:', result.allBotsOnPads);

    const failedBots = result.bots.filter(b => !b.onSurface);
    if (failedBots.length > 0) {
        console.log('\nFailed bots:');
        failedBots.slice(0, 5).forEach(b => {
            console.log(`  Bot ${b.id}: onPad=${b.onPad}, padY=${b.padY}, botY=${b.botY}, expected=${b.expectedY}, error=${b.error?.toFixed(3)}`);
        });
    }

    const pass = result.player.onSurface && result.allBotsOnSurface;
    console.log('\nResult:', pass ? 'PASS' : 'FAIL');

    await browser.close();
    process.exit(pass ? 0 : 1);
})();
