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

    // Set __kilo_test__ BEFORE clicking start so countdown is short
    await page.evaluate(() => { window.__kilo_test__ = true; });
    try { await page.click('button.start-btn'); } catch(e) {}

    // Wait for game to initialize and spawn
    await page.waitForTimeout(500);

    // Capture positions IMMEDIATELY after spawn
    let immediate = await page.evaluate(() => {
        const g = window.game;
        if (!g || !g.player || !g.bots || g.bots.length === 0) return null;
        const pads = g.map.getSpawnPads?.() || [];
        const p = g.player;
        const b0 = g.bots[0];
        return {
            gameState: g.gameState,
            playerY: p.position.y,
            playerX: p.position.x,
            playerZ: p.position.z,
            bot0Y: b0.position.y,
            bot0X: b0.position.x,
            bot0Z: b0.position.z,
            pad0: pads[0] ? {x: pads[0].x, y: pads[0].y, z: pads[0].z} : null,
            pad1: pads[1] ? {x: pads[1].x, y: pads[1].y, z: pads[1].z} : null
        };
    });
    if (immediate) console.log(`[Test] IMMEDIATE: state=${immediate.gameState}, player=(${immediate.playerX}, ${immediate.playerY}, ${immediate.playerZ}), bot0=(${immediate.bot0X}, ${immediate.bot0Y}, ${immediate.bot0Z}), pad0=${JSON.stringify(immediate.pad0)}, pad1=${JSON.stringify(immediate.pad1)}`);

    // Override countdown timer so it doesn't expire before we check
    await page.evaluate(() => {
        const g = window.game;
        if (g && g.gameState === 'countdown') {
            g.countdownTimer = 5; // Give us 5 seconds to check
        }
    });

    // Wait for game to have bots, then check positions during countdown (entities frozen on pads)
    let result = await page.evaluate(() => {
        const g = window.game;
        if (!g || !g.isStarted || !g.player || !g.bots || g.bots.length === 0) {
            return { gameState: g?.gameState, hasBots: false };
        }

        // Check positions regardless of state (they're set at spawn time)
        const pads = g.map.getSpawnPads?.() || [];
        const player = g.player;
        const bots = g.bots || [];

        console.log(`[Test] gameState=${g.gameState}, pads=${pads.length}, bots=${bots.length}`);

        // Debug: check physics colliders
        const physics = g.physics;
        const colliders = physics?.colliders || [];
        console.log(`[Test] Colliders count: ${colliders.length}, grid size: ${physics?.colliderGrid?.size}`);

        // Find center platform collider
        const centerPlatform = colliders.find(c => c.walkable && c.max && Math.abs(c.max.x - 27) < 1 && Math.abs(c.max.y - 2) < 1 && Math.abs(c.max.z - 27) < 1);
        console.log(`[Test] Center platform: ${centerPlatform ? 'found' : 'not found'}, max.y=${centerPlatform?.max?.y}`);

        // Check first bot position and collider query
        const bot = bots[0];
        if (bot) {
            const nearby = physics.getNearbyColliders(bot.position, 4.6);
            console.log(`[Test] Bot 0 pos=(${bot.position.x.toFixed(1)}, ${bot.position.y.toFixed(1)}, ${bot.position.z.toFixed(1)}), nearby colliders: ${nearby.length}`);
            const surfaceHeight = physics.getColliderSurfaceHeight(bot.position, bot.physics?.height || 1.9);
            console.log(`[Test] Bot 0 surface height: ${surfaceHeight}`);
        }

        // Debug: log first few pads
        console.log(`[Test] Pads count: ${pads.length}, first pad: ${JSON.stringify(pads[0])}, second pad: ${JSON.stringify(pads[1])}`);

        // Debug: check if bot positions match spawn positions
        if (bots[0]) {
            const b0 = bots[0];
            console.log(`[Test] Bot 0 mesh.pos=(${b0.mesh?.position?.x?.toFixed(1)}, ${b0.mesh?.position?.y?.toFixed(1)}, ${b0.mesh?.position?.z?.toFixed(1)})`);
            console.log(`[Test] Bot 0 physics.onGround=${b0.physics?.onGround}, isFrozen=${b0.isFrozen}`);
        }
        if (player) {
            console.log(`[Test] Player mesh.pos=(${player.mesh?.position?.x?.toFixed(1)}, ${player.mesh?.position?.y?.toFixed(1)}, ${player.mesh?.position?.z?.toFixed(1)})`);
        }

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
            const b = bots[i];
            const botPad = pads.find(p => {
                const dx = b.position.x - p.x;
                const dz = b.position.z - p.z;
                return Math.sqrt(dx*dx + dz*dz) < 1.5;
            });

            if (botPad) {
                const botHeight = b.physics?.height || 1.9;
                const expectedBotY = botPad.y + botHeight;
                const botYError = b.position.y - expectedBotY;
                botResults.push({
                    id: i,
                    onPad: true,
                    padY: botPad.y,
                    botY: b.position.y,
                    expectedY: expectedBotY,
                    error: botYError,
                    onSurface: Math.abs(botYError) < 0.1
                });
            } else {
                botResults.push({
                    id: i,
                    onPad: false,
                    padY: null,
                    botY: b.position.y,
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
            gameState: g.gameState,
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

    // Poll until we have bots and are in a valid state
    while (result && !result.botCount && result.gameState !== 'ended') {
        await page.waitForTimeout(100);
        result = await page.evaluate(() => {
            const g = window.game;
            if (!g || !g.isStarted || !g.player || !g.bots || g.bots.length === 0) {
                return { gameState: g?.gameState, botCount: 0 };
            }
            const pads = g.map.getSpawnPads?.() || [];
            const player = g.player;
            const bots = g.bots || [];

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
                const b = bots[i];
                const botPad = pads.find(p => {
                    const dx = b.position.x - p.x;
                    const dz = b.position.z - p.z;
                    return Math.sqrt(dx*dx + dz*dz) < 1.5;
                });

                if (botPad) {
                    const botHeight = b.physics?.height || 1.9;
                    const expectedBotY = botPad.y + botHeight;
                    const botYError = b.position.y - expectedBotY;
                    botResults.push({
                        id: i, onPad: true, padY: botPad.y,
                        botY: b.position.y, expectedY: expectedBotY,
                        error: botYError, onSurface: Math.abs(botYError) < 0.1
                    });
                } else {
                    botResults.push({
                        id: i, onPad: false, padY: null,
                        botY: b.position.y, expectedY: null,
                        error: null, onSurface: false
                    });
                }
            }

            return {
                gameState: g.gameState,
                padCount: pads.length,
                botCount: bots.length,
                player: {
                    onPad: playerOnPad, padY: playerPad ? playerPad.y : null,
                    playerY: playerY, expectedY: expectedY,
                    yError: playerYError, onSurface: Math.abs(playerYError) < 0.1
                },
                bots: botResults,
                allBotsOnSurface: botResults.every(b => b.onSurface),
                allBotsOnPads: botResults.every(b => b.onPad),
                playerOnSurface: Math.abs(playerYError) < 0.1
            };
        });
    }

    console.log('\n=== SPAWN TEST RESULTS ===');
    console.log('Game state:', result.gameState);
    console.log('Pad count:', result.padCount);
    console.log('Bot count:', result.botCount);
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
