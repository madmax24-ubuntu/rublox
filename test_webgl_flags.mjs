import { chromium } from 'playwright';

// Test with different WebGL/GPU flags
const tests = [
    { name: 'headless_old', launchArgs: [] },
    { name: 'headless_new_no_gpu', launchArgs: ['--headless=new', '--disable-gpu'] },
    { name: 'headless_new_no_sandbox', launchArgs: ['--headless=new', '--no-sandbox'] },
];

for (const cfg of tests) {
    console.log('\n=== Testing: ' + cfg.name + ' ===');
    try {
        const browser = await chromium.launch({
            headless: true,
            args: cfg.launchArgs
        });
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

        page.on('console', msg => {
            const t = msg.text().substring(0, 200);
            if (msg.type() === 'error') console.log('[ERR] ' + t);
        });

        await page.goto('http://localhost:3001/test_minimal_page.html');
        await page.waitForTimeout(8000);

        const info = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
            const buf = new Uint8Array(4);
            if (gl) {
                gl.readPixels(640, 360, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            }
            const renderer = gl ? gl.getParameter(37438) : 'none';
            const vendor = gl ? gl.getParameter(37485) : 'none';
            const version = gl ? gl.getParameter(37479) : 'none';
            return {
                canvasW: canvas?.width,
                canvasH: canvas?.height,
                bg: canvas ? getComputedStyle(canvas).backgroundColor : 'none',
                centerPixel: gl ? Array.from(buf) : 'no-gl',
                glRenderer: renderer,
                glVendor: vendor,
                glVersion: version,
            };
        });

        await page.screenshot({ path: './test_' + cfg.name + '.png', fullPage: false });
        console.log('Info: ' + JSON.stringify(info, null, 2));
        await browser.close();
    } catch (e) {
        console.log('Error: ' + e.message);
    }
}
