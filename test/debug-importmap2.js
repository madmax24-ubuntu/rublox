import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    
    // Capture all errors
    const errors = [];
    page.on('pageerror', err => {
        errors.push({ message: err.message, stack: err.stack?.substring(0, 2000) });
    });
    
    // Capture all console logs
    const logs = [];
    page.on('console', msg => {
        logs.push({ type: msg.type(), text: msg.text().substring(0, 500) });
    });
    
    await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(10000);
    
    console.log('Errors:', errors.length);
    for (const e of errors) {
        console.log('ERROR:', e.message);
        console.log('STACK:', e.stack?.substring(0, 500) || 'no stack');
    }
    
    console.log('\nLogs:', logs.length);
    for (const l of logs) {
        console.log(' ', l.type, l.text.substring(0, 200));
    }
    
    // Check page state
    const state = await page.evaluate(() => {
        return {
            hasGame: typeof window.game !== 'undefined',
            hasTHREE: typeof THREE !== 'undefined',
            hasModuleError: window.moduleLoadError || 'none',
            scripts: Array.from(document.scripts).map(s => ({
                src: s.src,
                type: s.type,
                async: s.async,
                error: s.error || 'none'
            }))
        };
    });
    
    console.log('\nPage state:', JSON.stringify(state, null, 2));
    
    await browser.close();
})();
