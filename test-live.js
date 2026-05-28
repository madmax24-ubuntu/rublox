import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 0 });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    
    const errors = [];
    const consoleLogs = [];
    
    page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error') {
            errors.push({ type: 'error', text });
        }
        if (text.includes('[Game]') || text.includes('[MapGen]') || text.includes('[Loot]') || text.includes('[Bot]')) {
            consoleLogs.push(text);
            console.log(text);
        }
    });
    page.on('pageerror', err => {
        errors.push({ type: 'pageerror', text: err });
        console.log('PAGE ERROR:', err);
    });

    console.log('=== Opening game... ===');
    const response = await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Page loaded, status:', response.status);
    await page.waitForTimeout(2000);

    console.log('=== Clicking start button... ===');
    try { await page.click('button.start-btn'); } catch(e) { console.log('Start button click failed:', e.message); }
    console.log('Clicked start button');

    // Wait for loading overlay to disappear
    const start = Date.now();
    let overlayHidden = false;
    while (Date.now() - start < 180000 && !overlayHidden) {
        try {
            const display = await page.evaluate(() => {
                const ol = document.getElementById('loadingOverlay');
                return ol ? ol.style.display : 'no-overlay';
            }, { timeout: 3000 });
            if (display === 'none') {
                overlayHidden = true;
                console.log('Overlay hidden after', Math.round((Date.now() - start) / 1000), 'seconds');
            }
        } catch(e) {
            console.log('Overlay check error:', e.message.substring(0, 100));
            break;
        }
        await page.waitForTimeout(2000);
    }

    if (!overlayHidden) {
        console.log('Overlay did not disappear');
        await browser.close();
        process.exit(1);
    }

    console.log('\n=== Game loaded! Testing 120 seconds... ===\n');
    
    // Now wait 2 minutes while game runs
    const testStart = Date.now();
    let errorCount = 0;
    let lastLogCount = consoleLogs.length;
    
    while (Date.now() - testStart < 120000) {
        const elapsed = Math.round((Date.now() - testStart) / 1000);
        
        // Check for new console errors
        if (errors.length > 0 && errors[errors.length - 1].time > testStart) {
            const newErrors = errors.filter(e => e.time > testStart);
            if (newErrors.length > errorCount) {
                console.log('NEW ERRORS:', newErrors.length - errorCount);
                errorCount = newErrors.length;
            }
        }
        
        // Check game state periodically
        if (elapsed % 10 === 0 && elapsed > 0) {
            try {
                const gs = await page.evaluate(() => {
                    if (!window.game) return null;
                    const g = window.game;
                    return {
                        gameState: g.gameState,
                        hasPlayer: !!g.player,
                        hasMap: !!g.map,
                        botCount: Array.isArray(g.bots) ? g.bots.length : 0,
                        isStarted: g.isStarted,
                    };
                }, { timeout: 5000 });
                if (gs) {
                    const newLogs = consoleLogs.length - lastLogCount;
                    lastLogCount = consoleLogs.length;
                    console.log(`[${elapsed}s] gameState=${gs.gameState} player=${gs.hasPlayer} bots=${gs.botCount} map=${gs.hasMap} newLogs=${newLogs}`);
                }
            } catch(e) {
                console.log(`[${elapsed}s] State check failed:`, e.message.substring(0, 50));
            }
        }
        
        await page.waitForTimeout(1000);
    }

    console.log('\n=== 2-minute test complete ===');
    console.log('Total errors:', errors.length);
    console.log('Total console logs:', consoleLogs.length);
    
    // Take screenshot
    try {
        await page.screenshot({ path: './live-test-screenshot.png' });
        console.log('Screenshot saved');
    } catch(e) {}
    
    await browser.close();
    process.exit(errors.length > 0 ? 1 : 0);
})();
