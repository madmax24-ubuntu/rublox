import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log('[C:' + msg.type() + '] ' + msg.text().substring(0, 500));
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

const threeInfo = await page.evaluate(() => {
    const three = window.__THREE__;
    if (!three) return 'no-three';
    
    // Check what's in __THREE__
    const keys = Object.keys(three).slice(0, 30);
    const hasWebGLRenderer = !!three.WebGLRenderer;
    const hasScene = !!three.Scene;
    const hasPerspectiveCamera = !!three.PerspectiveCamera;
    const version = three.version;
    
    return {
        version,
        hasWebGLRenderer,
        hasScene,
        hasPerspectiveCamera,
        keys,
        type: typeof three,
    };
});

console.log('__THREE__ info: ' + JSON.stringify(threeInfo, null, 2));

await browser.close();
