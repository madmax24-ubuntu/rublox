import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    const type = msg.type();
    if (type === 'error') console.log(`[ERR] ${t}`);
    else if (type === 'log') console.log(`[LOG] ${t}`);
});
page.on('pageerror', err => {
    console.log(`[PAGEERR] ${err.message.substring(0, 500)}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(8000);

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();
await page.waitForTimeout(35000);

// Inject debug code into the page
await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return;

    // Check GL context info
    const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const dbgVersion = gl.getExtension('WEBGL_debug_shaders');
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    console.log(`[WEBGL] renderer: ${dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : 'N/A'}`);
    console.log(`[WEBGL] version: ${gl.getParameter(gl.VERSION)}`);
    console.log(`[WEBGL] maxTexture: ${maxTextureSize}`);

    // Check if there are any shader compilation errors
    // Check if canvas is clearing to black
    const clearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE);
    console.log(`[WEBGL] clear color: ${clearColor?.red}, ${clearColor?.green}, ${clearColor?.blue}`);

    // Get framebuffer status
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    console.log(`[WEBGL] framebuffer: ${status === gl.FRAMEBUFFER_COMPLETE ? 'OK' : 'ERROR ' + status}`);

    // Check canvas dimensions
    console.log(`[WEBGL] drawingBufferWidth: ${gl.drawingBufferWidth}, drawingBufferHeight: ${gl.drawingBufferHeight}`);
});

// Also check the actual rendered pixels by reading canvas data
const pixelData = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    // Try to read pixel data
    try {
        const imgData = ctx.getImageData(320, 180, 1, 1); // sample center area
        const imgData2 = ctx.getImageData(640, 360, 1, 1); // exact center
        const imgData3 = ctx.getImageData(960, 540, 1, 1); // another area
        return {
            center: { r: imgData2.data[0], g: imgData2.data[1], b: imgData2.data[2] },
            top: { r: imgData.data[0], g: imgData.data[1], b: imgData.data[2] },
            bottom: { r: imgData3.data[0], g: imgData3.data[1], b: imgData3.data[2] },
        };
    } catch(e) {
        return { error: e.message };
    }
});

console.log('Pixel data:', JSON.stringify(pixelData, null, 2));

// Screenshot
await page.screenshot({ path: './test_webgl.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
