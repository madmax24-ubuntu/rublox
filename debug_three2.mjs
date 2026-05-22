import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log('[C:' + msg.type() + '] ' + msg.text().substring(0, 500));
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

const info = await page.evaluate(() => {
    const three = window.THREE;
    if (!three) return 'no-three';
    return {
        version: three.version,
        hasWebGLRenderer: !!three.WebGLRenderer,
        hasScene: !!three.Scene,
        hasPerspectiveCamera: !!three.PerspectiveCamera,
    };
});

console.log('THREE global: ' + JSON.stringify(info, null, 2));

await browser.close();
