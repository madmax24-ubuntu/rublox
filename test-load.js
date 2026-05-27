const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const logs = [];
    page.on('console', msg => {
        const text = msg.text();
        logs.push(text);
        if (text.includes('MapGen')) console.log(text);
    });

    page.on('pageerror', error => {
        console.log('PAGE ERROR:', error.message);
    });

    console.log('Loading game...');
    const start = Date.now();
    await page.goto('http://127.0.0.1:3001/', { waitUntil: 'networkidle', timeout: 60000 });

    const elapsed = Date.now() - start;
    console.log(`\nPage loaded in ${elapsed}ms`);
    console.log(`Total logs: ${logs.length}`);

    // Check for key milestones
    const mapReady = logs.some(l => l.includes('ready resolved'));
    const playing = logs.some(l => l.includes('playing'));
    const error = logs.some(l => l.includes('ERROR'));

    console.log(`MapGen ready: ${mapReady}`);
    console.log(`Playing state: ${playing}`);
    console.log(`Errors: ${error}`);

    if (logs.length > 0) {
        console.log('\n--- Last 20 logs ---');
        console.log(logs.slice(-20).join('\n'));
    }

    await browser.close();

    process.exit(mapReady || playing ? 0 : 1);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
