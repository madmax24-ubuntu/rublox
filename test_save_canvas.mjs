import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

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

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();
console.log('[Test] Start clicked');

await page.waitForTimeout(25000);

// Save canvas as PNG via toDataURL
const pngData = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');

    let pixelInfo = null;
    if (gl) {
        const buf = new Uint8Array(4);
        gl.readPixels(640, 360, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        pixelInfo = { center: { r: buf[0], g: buf[1], b: buf[2], a: buf[3] } };
    }

    const dataUrl = canvas?.toDataURL('image/png');
    return {
        pngSize: dataUrl ? Math.floor(dataUrl.length * 3 / 4) : 0,
        pixelInfo,
        canvasW: canvas?.width,
        canvasH: canvas?.height,
        gameStarted: document.body?.classList?.contains('game-started'),
    };
});

console.log('Canvas data: ' + JSON.stringify(pngData, null, 2));

// Save canvas PNG to disk
const base64 = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return canvas?.toDataURL('image/png').split(',')[1];
});

if (base64) {
    writeFileSync('./test_canvas_capture.png', Buffer.from(base64, 'base64'));
    console.log('Canvas PNG saved to test_canvas_capture.png (' + pngData.pngSize + ' bytes)');
}

await browser.close();
