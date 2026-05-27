import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('pageerror', error => console.log(`PAGE ERROR: ${error.message}`));

    console.log('Loading game...');
    await page.goto('http://127.0.0.1:3001/', { waitUntil: 'load', timeout: 30000 });

    console.log('Clicking start...');
    const startBtn = await page.$('.start-btn, #startBtn, button');
    if (startBtn) await startBtn.click();

    for (let i = 0; i < 55; i++) {
        await page.waitForTimeout(1000);
        try {
            const logs = await page.evaluate(() => window.getConsoleLogs?.(100) || []);
            const logMsgs = logs.map(l => l.msg || String(l));
            const mapReady = logMsgs.some(l => l.includes('ready resolved'));
            if (mapReady) {
                console.log(`\nSUCCESS: MapGen ready after ${i+1}s!`);
                console.log('\n--- Last 40 logs ---');
                console.log(logMsgs.slice(-40).join('\n'));
                await browser.close();
                process.exit(0);
            }
            if (i === 3 || i === 4 || i === 5) {
                console.log(`\n[${i+1}s] ${logMsgs.length} logs:`);
                console.log(logMsgs.slice(-15).join('\n'));
            }
            if (i % 10 === 0) console.log(`[${i+1}s] ${logMsgs.length} logs`);
        } catch (e) {
            if (e.message.includes('closed')) {
                console.log(`\nPage closed at ${i+1}s`);
                // Get what we had
                try {
                    const logs = await page.evaluate(() => window.getConsoleLogs?.(100) || []);
                    const logMsgs = logs.map(l => l.msg || String(l));
                    console.log(`Last ${logMsgs.length} logs:`);
                    console.log(logMsgs.slice(-20).join('\n'));
                } catch {}
                break;
            }
        }
    }

    await browser.close();
    process.exit(1);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
