import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const logs = [];
    page.on('console', msg => {
        const text = msg.text();
        logs.push(text);
        if (logs.length % 5 === 0 || text.includes('ERROR') || text.includes('ready')) {
            console.log(`[${logs.length}] ${text}`);
        }
    });

    page.on('pageerror', error => {
        console.log(`PAGE ERROR: ${error.message}`);
    });

    console.log('Loading page...');
    await page.goto('http://127.0.0.1:3001/', { waitUntil: 'load', timeout: 30000 });

    console.log('Clicking start...');
    const startBtn = await page.$('.start-btn, #startBtn, button');
    if (startBtn) await startBtn.click();

    // Wait up to 90 seconds
    for (let i = 0; i < 90; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (logs.some(l => l.includes('ready resolved'))) {
            console.log(`\nSUCCESS: MapGen ready after ${i+1}s!`);
            console.log(`\nTotal logs: ${logs.length}`);
            console.log(`Last 20 logs:`);
            logs.slice(-20).forEach(l => console.log(l));
            await browser.close();
            process.exit(0);
        }
        if (i % 10 === 0) {
            console.log(`\n[${i+1}s] ${logs.length} logs, last: ${logs[logs.length-1] || '(empty)'}`);
        }
    }

    console.log(`\nTIMEOUT after 90s. Total logs: ${logs.length}`);
    console.log('Last 20 logs:');
    logs.slice(-20).forEach(l => console.log(l));
    await browser.close();
    process.exit(1);
})().catch(e => {
    console.error('TEST ERROR:', e);
    process.exit(1);
});
