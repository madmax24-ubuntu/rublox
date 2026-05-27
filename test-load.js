import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const allLogs = [];

    page.on('console', msg => {
        const text = msg.text();
        allLogs.push(text);
        if (text.includes('ERROR') || text.includes('error')) {
            console.log(`CONSOLE: ${text}`);
        }
    });

    page.on('pageerror', error => {
        console.log(`PAGE ERROR: ${error.message}`);
        console.log(`PAGE ERROR STACK: ${error.stack}`);
    });

    console.log('Loading game...');
    await page.goto('http://127.0.0.1:3001/', { waitUntil: 'load', timeout: 30000 });

    console.log('Clicking start...');
    const startBtn = await page.$('.start-btn, #startBtn, button');
    if (startBtn) await startBtn.click();

    for (let i = 0; i < 80; i++) {
        await page.waitForTimeout(1000);
        try {
            const logs = await page.evaluate(() => window.getConsoleLogs?.(1000) || []);
            const logMsgs = logs.map(l => l.msg || String(l));

            const mapReady = logMsgs.some(l => l.includes('ready resolved'));
            if (mapReady) {
                console.log(`\nSUCCESS: MapGen ready after ${i+1}s!`);
                console.log('\n--- Last 50 logs ---');
                console.log(logMsgs.slice(-50).join('\n'));
                await browser.close();
                process.exit(0);
            }

            // Print every 2s
            if (i % 2 === 0) {
                const recent = logMsgs.slice(Math.max(0, logMsgs.length - 20)).join('\n');
                console.log(`\n[${i+1}s] ${logMsgs.length} total logs:`, logMsgs[logMsgs.length-1] || '(empty)');
            }
        } catch (e) {
            console.log(`\n[${i+1}s] Error: ${e.message}`);
            if (e.message.includes('closed') || e.message.includes('closed')) {
                console.log('Page closed!');
                break;
            }
        }
    }

    console.log('\nFINAL STATE:');
    try {
        const logs = await page.evaluate(() => window.getConsoleLogs?.(1000) || []);
        console.log('Last 30 logs:');
        logs.slice(-30).forEach(l => console.log(l.msg || String(l)));
    } catch {}

    await browser.close();
    process.exit(1);
})().catch(e => {
    console.error('TEST ERROR:', e);
    process.exit(1);
});
