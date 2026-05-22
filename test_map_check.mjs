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

// Pause player movement so camera stays still
await page.evaluate(() => {
    if (window.__game) {
        window.__game.paused = true;
    }
});

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();
console.log('[Test] Start clicked');

// Wait for map gen
await page.waitForTimeout(25000);

// Sample a grid of pixels across the canvas
const pixelGrid = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };

    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(canvas, 0, 0);

    const results = [];
    const spacing = 60;
    for (let y = 0; y < canvas.height; y += spacing) {
        for (let x = 0; x < canvas.width; x += spacing) {
            try {
                const px = ctx.getImageData(x, y, 1, 1).data;
                results.push({ x, y, r: px[0], g: px[1], b: px[2], a: px[3] });
            } catch(e) {}
        }
    }
    return results;
});

console.log('Pixel grid sample count: ' + pixelGrid.length);
// Count unique colors
const colorCounts = {};
let uniqueColors = 0;
let skyCount = 0;
let groundCount = 0;
for (const p of pixelGrid) {
    const key = `${Math.round(p.r/32)*32},${Math.round(p.g/32)*32},${Math.round(p.b/32)*32}`;
    colorCounts[key] = (colorCounts[key] || 0) + 1;
    // Sky is roughly blue (high B, medium G, low R)
    if (p.b > 200 && p.g > 150 && p.r < 150) skyCount++;
    // Ground is darker
    if (p.r + p.g + p.b < 200) groundCount++;
}
uniqueColors = Object.keys(colorCounts).length;
console.log(`Unique colors: ${uniqueColors}, Sky pixels: ${skyCount}/${pixelGrid.length}, Ground pixels: ${groundCount}/${pixelGrid.length}`);

// Save screenshot
const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return canvas?.toDataURL('image/png').split(',')[1];
});
if (dataUrl) {
    writeFileSync('./test_map_check.png', Buffer.from(dataUrl, 'base64'));
    console.log('Screenshot saved: ' + dataUrl.length + ' bytes base64');
}

await browser.close();
