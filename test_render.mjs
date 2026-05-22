import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    const type = msg.type();
    if (type === 'error') console.log(`[ERR] ${t}`);
    else console.log(`[LOG] ${t}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(8000);

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();
await page.waitForTimeout(35000);

// Inject a render test - draw a red square on canvas using 2D context
// But first, check if canvas is WebGL-only
const test = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return 'no canvas';

    // Try to get WebGL context
    const gl = canvas.getContext('webgl2');
    if (gl) {
        // Check what the last rendered frame looks like
        // Read the framebuffer
        const pixels = new Uint8ClampedArray(4 * 1280 * 720 / 4); // quarter resolution
        gl.readPixels(
            640, 360,
            10, 10,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels
        );

        // Count unique colors
        const colors = new Set();
        for (let i = 0; i < pixels.length; i += 4) {
            const key = `${pixels[i]},${pixels[i+1]},${pixels[i+2]}`;
            colors.add(key);
        }

        // Get sample colors
        const samples = [];
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 5; x++) {
                const idx = (360 + y * 100) * 1280 * 4 + (640 + x * 100) * 4;
                gl.readPixels(640 + x * 100, 360 + y * 100, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                samples.push({
                    x: 640 + x * 100,
                    y: 360 + y * 100,
                    r: pixels[0],
                    g: pixels[1],
                    b: pixels[2]
                });
            }
        }

        return {
            glVersion: 'webgl2',
            uniqueColors: colors.size,
            samples,
            centerPixel: {
                r: pixels[0], g: pixels[1], b: pixels[2]
            }
        };
    } else {
        const gl1 = canvas.getContext('webgl');
        if (gl1) {
            return { glVersion: 'webgl1' };
        }
        return { error: 'no webgl context' };
    }
});

console.log('Render test:', JSON.stringify(test, null, 2));

// Also check if the canvas background is set via CSS
const bgInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const style = getComputedStyle(canvas);
    return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        background: style.background,
    };
});

console.log('BG info:', JSON.stringify(bgInfo, null, 2));

// Screenshot
await page.screenshot({ path: './test_render.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
