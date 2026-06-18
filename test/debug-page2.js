import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    
    const errors = [];
    const logs = [];
    let errorStack = '';
    
    page.on('console', msg => {
        logs.push({ type: msg.type(), text: msg.text().substring(0, 500) });
    });
    page.on('pageerror', err => {
        errors.push(err.message.substring(0, 500));
        errorStack = err.stack || 'no stack';
    });
    
    await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(10000);
    
    console.log('Errors:', errors.length);
    for (const e of errors) {
        console.log(' ERROR:', e);
    }
    
    if (errorStack) {
        console.log('\nError stack trace:');
        console.log(errorStack.substring(0, 2000));
    }
    
    console.log('\nLogs:', logs.length);
    for (const l of logs) {
        console.log(' ', l.type, l.text.substring(0, 200));
    }
    
    // Check if main.js loaded
    const mainLoaded = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[src]'));
        return scripts.find(s => s.src.includes('main.js'));
    });
    console.log('\nMain.js script element:', mainLoaded ? 'Found' : 'Not found');
    
    // Check module errors
    const moduleErrors = await page.evaluate(() => {
        return window.onload ? 'no error' : 'module failed';
    });
    console.log('Module status:', moduleErrors);
    
    await browser.close();
})();
