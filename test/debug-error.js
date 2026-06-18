import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    
    // Capture the exact error
    page.on('pageerror', err => {
        console.log('PAGE ERROR:', err.message);
        console.log('STACK:', err.stack?.substring(0, 2000) || 'no stack');
        console.log('FULL ERROR:', err);
    });
    
    await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(10000);
    
    // Check if main.js is loading
    const mainStatus = await page.evaluate(() => {
        return {
            hasGame: typeof window.game !== 'undefined',
            hasTHREE: typeof THREE !== 'undefined',
            moduleError: window.moduleLoadError || 'none',
            scripts: Array.from(document.scripts).map(s => ({
                src: s.src,
                type: s.type,
                async: s.async,
                error: s.error || 'none'
            }))
        };
    });
    
    console.log('Main status:', JSON.stringify(mainStatus, null, 2));
    
    await browser.close();
})();
