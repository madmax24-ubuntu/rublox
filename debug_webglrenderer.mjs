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

// Check WebGLRenderer before clicking start
const wrInfo = await page.evaluate(() => {
    const THREE = window.THREE;
    const wr = THREE.WebGLRenderer;
    if (!wr) return 'no-wr';
    
    const proto = wr.prototype;
    const renderMethod = proto.render;
    const keys = Object.keys(proto).slice(0, 20);
    const props = Object.getOwnPropertyNames(proto).slice(0, 20);
    
    return {
        hasRender: !!proto.render,
        renderIsFunction: typeof proto.render === 'function',
        renderName: proto.render?.name,
        keys,
        props,
    };
});

console.log('WebGLRenderer before: ' + JSON.stringify(wrInfo, null, 2));

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();

await page.waitForTimeout(25000);

// Check WebGLRenderer after game starts
const wrInfo2 = await page.evaluate(() => {
    const THREE = window.THREE;
    const wr = THREE.WebGLRenderer;
    const canvas = document.querySelector('canvas');
    
    // Get the renderer from canvas
    let renderer = null;
    if (canvas) {
        // Try to find renderer through canvas properties
        const allProps = Object.getOwnPropertyNames(canvas);
        const allSyms = Object.getOwnPropertySymbols(canvas);
        for (const p of [...allProps, ...allSyms]) {
            try {
                const val = canvas[p];
                if (val && typeof val === 'object' && val !== null) {
                    if (typeof val.render === 'function' && val.domElement === canvas) {
                        renderer = val;
                        break;
                    }
                }
            } catch(e) {}
        }
    }
    
    return {
        canvasExists: !!canvas,
        canvasW: canvas?.width,
        canvasH: canvas?.height,
        foundRenderer: !!renderer,
        rendererType: renderer?.constructor?.name,
        rendererHasRender: renderer ? typeof renderer.render : 'N/A',
        protoKeys: Object.keys(THREE.WebGLRenderer.prototype).slice(0, 20),
    };
});

console.log('WebGLRenderer after: ' + JSON.stringify(wrInfo2, null, 2));

await browser.close();
