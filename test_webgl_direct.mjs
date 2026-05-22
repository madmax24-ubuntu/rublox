import { chromium } from 'playwright';

const browser = await chromium.launch({
    headless: true,
    args: ['--headless=new', '--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    if (msg.type() === 'error') console.log('[ERR] ' + t);
    else console.log('[LOG] ' + t);
});

await page.goto('http://localhost:3001/test_minimal_page.html');
await page.waitForTimeout(10000);

// Check WebGL context more carefully
const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };

    // Try different context types
    let gl = canvas.getContext('webgl2');
    if (!gl) gl = canvas.getContext('webgl');
    if (!gl) gl = canvas.getContext('experimental-webgl');

    if (!gl) return { error: 'no gl context' };

    // Check context info
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'N/A';
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : 'N/A';

    // Read a pixel
    const buf = new Uint8Array(4);
    gl.readPixels(640, 360, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);

    return {
        canvasW: canvas.width,
        canvasH: canvas.height,
        glType: canvas.getContext('webgl2') ? 'webgl2' : (canvas.getContext('webgl') ? 'webgl1' : 'unknown'),
        renderer: renderer,
        vendor: vendor,
        centerPixel: Array.from(buf),
        bg: getComputedStyle(canvas).backgroundColor,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyBgColor: getComputedStyle(document.body).backgroundColor,
        canvasVisible: canvas.offsetParent !== null,
        canvasRect: canvas.getBoundingClientRect().toJSON(),
        canvasDisplay: getComputedStyle(canvas).display,
        canvasOpacity: getComputedStyle(canvas).opacity,
        canvasZIndex: getComputedStyle(canvas).zIndex,
    };
});

console.log('Detailed: ' + JSON.stringify(info, null, 2));

await page.screenshot({ path: './test_detail.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
