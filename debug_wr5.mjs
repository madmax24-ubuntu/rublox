import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    const type = msg.type();
    if (type === 'error') console.log('[ERR] ' + t);
    else console.log('[LOG] ' + t);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();

await page.waitForTimeout(25000);

// Find the game instance through canvas's parent element or other means
const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return 'no-canvas';
    
    // Check canvas for renderer reference
    const allProps = Object.getOwnPropertyNames(canvas);
    const allSyms = Object.getOwnPropertySymbols(canvas);
    
    // Look for renderer
    let foundRenderer = null;
    for (const p of [...allProps, ...allSyms]) {
        try {
            const val = canvas[p];
            if (val && typeof val === 'object' && val !== null) {
                const pKeys = Object.getOwnPropertyNames(val);
                if (pKeys.includes('render') && pKeys.includes('domElement')) {
                    foundRenderer = {
                        type: val.constructor?.name || 'unknown',
                        props: pKeys.slice(0, 15),
                        renderType: typeof val.render,
                    };
                    break;
                }
            }
        } catch(e) {}
    }
    
    // Check canvas._context
    const context = canvas._context || canvas.getContext('webgl2') || canvas.getContext('webgl');
    const ctxProps = context ? Object.getOwnPropertyNames(context).slice(0, 15) : 'none';
    const ctxSyms = context ? Object.getOwnPropertySymbols(context).map(s => s.toString()) : 'none';
    
    return {
        canvasW: canvas.width,
        canvasH: canvas.height,
        canvasProps: allProps.slice(0, 10),
        canvasSyms: allSyms.map(s => s.toString()).slice(0, 10),
        foundRenderer,
        contextProps: ctxProps,
        contextSyms: ctxSyms,
    };
});

console.log('Canvas info: ' + JSON.stringify(info, null, 2));

await browser.close();
