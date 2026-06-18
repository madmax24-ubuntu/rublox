import { chromium } from 'playwright';
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    
    const errors = [];
    const logs = [];
    page.on('console', msg => logs.push({ type: msg.type(), text: msg.text().substring(0, 500) }));
    page.on('pageerror', err => errors.push(err.message.substring(0, 500)));
    
    await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(10000);
    
    const bodyContent = await page.evaluate(() => {
        return {
            bodyHTML: document.body.innerHTML.substring(0, 1000),
            scripts: Array.from(document.scripts).map(s => ({ 
                src: s.src, 
                type: s.type, 
                async: s.async,
                text: s.textContent ? s.textContent.substring(0, 100) : 'none'
            })),
            hasGame: typeof window.game !== 'undefined',
            hasTHREE: typeof THREE !== 'undefined',
            hasImportMap: document.querySelector('script[type="importmap"]') !== null
        };
    });
    
    console.log('Body content (first 500 chars):');
    console.log(bodyContent.bodyHTML.substring(0, 500));
    
    console.log('\nScripts:');
    for (const s of bodyContent.scripts) {
        console.log(' ', JSON.stringify(s).substring(0, 200));
    }
    
    console.log('\nHas window.game:', bodyContent.hasGame);
    console.log('Has THREE:', bodyContent.hasTHREE);
    console.log('Has importmap:', bodyContent.hasImportMap);
    
    console.log('\nErrors:', errors.length);
    for (const e of errors) console.log(' ERROR:', e);
    
    console.log('\nLogs:', logs.length);
    for (const l of logs) console.log(' ', l.type, l.text.substring(0, 200));
    
    await browser.close();
})();
