import { chromium } from 'playwright';

const tests = [
    { name: 'swiftshader', args: ['--headless=new', '--no-sandbox', '--use-gl=swiftshader'] },
    { name: 'swiftshader_no_vulkan', args: ['--headless=new', '--no-sandbox', '--use-gl=swiftshader', '--disable-vulkan', '--disable-gpu', '--use-angle=false'] },
    { name: 'angle_off', args: ['--headless=new', '--no-sandbox', '--use-angle=false', '--disable-gpu'] },
    { name: 'software', args: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-compositor-hardware-acceleration', '--disable-component-update', '--disable-partial-raster', '--in-process-gpu', '--msleep=100'] },
];

for (const cfg of tests) {
    console.log('\n=== ' + cfg.name + ' ===');
    console.log('Args: ' + cfg.args.join(' '));
    try {
        const browser = await chromium.launch({
            headless: true,
            args: cfg.args
        });
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

        page.on('console', msg => {
            const t = msg.text().substring(0, 200);
            if (t.includes('WebGL') || t.includes('GL ') || t.includes('Test]')) {
                if (msg.type() === 'error') console.log('[ERR] ' + t);
            }
        });

        await page.goto('http://localhost:3001/');
        await page.waitForTimeout(5000);

        const btn = await page.$('#startButtonDesktop');
        if (btn) await btn.click();
        await page.waitForTimeout(20000);

        const info = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
            let glInfo = {};
            let pixel = null;
            if (gl) {
                const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                glInfo = {
                    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(37438),
                    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(37485),
                };
                try {
                    const buf = new Uint8Array(4);
                    gl.readPixels(640, 360, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
                    pixel = { r: buf[0], g: buf[1], b: buf[2], a: buf[3] };
                } catch(e) {
                    pixel = { error: e.message };
                }
            }
            return {
                canvas: !!canvas,
                canvasW: canvas?.width,
                canvasH: canvas?.height,
                gl: glInfo,
                pixel,
                gameStarted: document.body?.classList?.contains('game-started'),
            };
        });

        await page.screenshot({ path: './test_' + cfg.name + '.png', fullPage: false });
        console.log('Info: ' + JSON.stringify(info, null, 2));
        await browser.close();
    } catch (e) {
        console.log('Error: ' + e.message.substring(0, 200));
    }
}
