import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    
    // Wait for module error
    page.on('pageerror', err => {
        console.log('PAGE ERROR:', err.message);
        console.log('STACK:', err.stack?.substring(0, 1000) || 'no stack');
    });
    
    await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(10000);
    
    // Check if main.js is executing
    const mainStatus = await page.evaluate(() => {
        return {
            hasGame: typeof window.game !== 'undefined',
            hasTHREE: typeof THREE !== 'undefined',
            moduleError: window.moduleLoadError || 'none'
        };
    });
    
    console.log('Main status:', JSON.stringify(mainStatus));
    
    // Check for any scripts that failed
    const failedScripts = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script'));
        return scripts.filter(s => s.error || s.dataset.error).map(s => ({
            src: s.src,
            type: s.type,
            error: s.error,
            dataset: s.dataset
        }));
    });
    
    console.log('Failed scripts:', failedScripts.length);
    for (const s of failedScripts) console.log(' ', s);
    
    await browser.close();
})();
