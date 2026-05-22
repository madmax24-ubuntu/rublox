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

// Wait for map gen + rendering
await page.waitForTimeout(25000);

// Convert canvas to PNG via toDataURL and save
const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };

    try {
        const dataUrl = canvas.toDataURL('image/png');
        // Remove data:image/png;base64, prefix
        const base64 = dataUrl.split(',')[1];
        const buffer = Buffer.from(base64, 'base64');
        console.log('[Test] toDataURL: ' + buffer.length + ' bytes');
        return {
            size: buffer.length,
            // Sample a few pixels from the base64-decoded image
            // PNG header is 8 bytes, then IHDR chunk, then IDAT
            // We'll decode via canvas
        };
    } catch(e) {
        return { error: e.message };
    }
});

console.log('toDataURL result: ' + JSON.stringify(result, null, 2));

// Also try pixel sampling via temp canvas
const pixels = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;

    // Create temp canvas and draw the main canvas onto it
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(canvas, 0, 0);

    // Sample pixels
    const samples = [];
    const positions = [
        {x: 0, y: 0, label: 'top-left'},
        {x: 640, y: 360, label: 'center'},
        {x: 1279, y: 719, label: 'bottom-right'},
        {x: 640, y: 0, label: 'top-center'},
        {x: 0, y: 360, label: 'left-center'},
    ];
    for (const pos of positions) {
        try {
            const px = ctx.getImageData(pos.x, pos.y, 1, 1).data;
            samples.push({
                ...pos,
                r: px[0], g: px[1], b: px[2], a: px[3]
            });
        } catch(e) {
            samples.push({ ...pos, error: e.message });
        }
    }
    return samples;
});

console.log('Pixel samples: ' + JSON.stringify(pixels, null, 2));

// Screenshot
await page.screenshot({ path: './test_todataurl.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
