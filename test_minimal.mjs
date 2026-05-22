import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    if (msg.type() === 'error') console.log('[ERR] ' + t);
    else console.log('[LOG] ' + t);
});

await page.goto('http://localhost:3001/test_minimal_page.html');

await page.waitForTimeout(8000);

// Take screenshot
await page.screenshot({ path: './test_minimal.png', fullPage: false });
console.log('Minimal screenshot saved');

// Read pixel from center
const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const buf = new Uint8Array(4);
    if (gl) {
        gl.readPixels(640, 360, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    }
    return {
        canvasW: canvas?.width,
        canvasH: canvas?.height,
        bg: canvas ? getComputedStyle(canvas).backgroundColor : 'none',
        centerPixel: Array.from(buf),
        glRenderer: gl ? gl.getParameter(gl.RENDERER) : 'none',
    };
});

console.log('Minimal: ' + JSON.stringify(info, null, 2));
await browser.close();
