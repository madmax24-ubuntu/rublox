import { chromium } from 'playwright';

const browser = await chromium.launch({
    headless: true,
    args: ['--headless=new', '--no-sandbox', '--use-gl=swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    if (msg.type() === 'error') console.log('[ERR] ' + t);
    else console.log('[LOG] ' + t);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(5000);

// Inject canvas background BEFORE clicking start
await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        canvas.style.background = '#ff0000';
        console.log('[Test] Set canvas background to red');
    }
});

// Click start
const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();
console.log('[Test] Start clicked');

// Wait for map gen
await page.waitForTimeout(25000);

// Check canvas state
const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const style = canvas ? getComputedStyle(canvas) : null;

    let pixel = null;
    if (gl) {
        try {
            const buf = new Uint8Array(4);
            gl.readPixels(640, 360, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            pixel = { r: buf[0], g: buf[1], b: buf[2], a: buf[3] };
        } catch(e) {
            pixel = { error: e.message };
        }
    }

    // Check canvas rect
    const rect = canvas?.getBoundingClientRect();

    return {
        canvas: {
            width: canvas?.width,
            height: canvas?.height,
            cssW: style?.width,
            cssH: style?.height,
            bg: style?.backgroundColor,
            cssBg: style?.background,
            cssBgImage: style?.backgroundImage,
            rect: rect?.toJSON(),
            offsetW: canvas?.offsetWidth,
            offsetH: canvas?.offsetHeight,
        },
        pixel,
        gameStarted: document.body?.classList?.contains('game-started'),
    };
});

console.log('Info: ' + JSON.stringify(info, null, 2));

// Screenshot
await page.screenshot({ path: './test_explicit_bg.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
