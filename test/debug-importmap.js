import { chromium } from 'playwright';
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    
    // Capture the exact error
    page.on('pageerror', err => {
        console.log('PAGE ERROR:', err.message);
        console.log('STACK:', err.stack?.substring(0, 2000) || 'no stack');
    });
    
    await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(10000);
    
    // Check if the importmap is being executed as JavaScript
    const importmapContent = await page.evaluate(() => {
        const script = document.querySelector('script[type="importmap"]');
        return script ? script.textContent : 'not found';
    });
    
    console.log('Importmap content:', importmapContent.substring(0, 200));
    
    // Check if there are any scripts that failed
    const failedScripts = await page.evaluate(() => {
        return Array.from(document.scripts).filter(s => s.error);
    });
    
    console.log('Failed scripts:', failedScripts.length);
    
    await browser.close();
})();
