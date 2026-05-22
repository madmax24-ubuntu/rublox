import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    const type = msg.type();
    if (type === 'error') console.log(`[ERR] ${t}`);
    else if (type === 'log') console.log(`[LOG] ${t}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(8000);

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();
await page.waitForTimeout(35000);

// Check canvas and renderer directly
const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };

    // Find game instance via DOM - look for __reactFiber or similar
    // Check renderer.domElement properties
    const rect = canvas.getBoundingClientRect();
    const computedStyle = getComputedStyle(canvas);

    return {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        styleWidth: computedStyle.width,
        styleHeight: computedStyle.height,
        styleDisplay: computedStyle.display,
        styleBackground: computedStyle.backgroundColor,
        stylePosition: computedStyle.position,
        styleZIndex: computedStyle.zIndex,
        rectWidth: rect.width,
        rectHeight: rect.height,
        canvasVisible: computedStyle.display !== 'none' && rect.width > 0,
    };
});

console.log('Canvas info:', JSON.stringify(info, null, 2));

// Also try to find THREE scene via window
const sceneInfo = await page.evaluate(() => {
    // Check if game is accessible
    const gameEl = document.getElementById('gameRoot');
    if (!gameEl) return { error: 'no gameRoot' };

    // Get all canvas children
    const canvases = gameEl.querySelectorAll('canvas');
    const canvasInfo = [];
    canvases.forEach(c => {
        canvasInfo.push({
            w: c.width, h: c.height,
            vis: getComputedStyle(c).display
        });
    });

    // Check if there's a renderer that owns a canvas
    const rendererCanvas = document.querySelector('canvas');
    if (rendererCanvas) {
        const parent = rendererCanvas.parentElement;
        return {
            canvasCount: canvases.length,
            canvasDetails: canvasInfo,
            parentTag: parent?.tagName,
            parentClass: parent?.className,
            parentDisplay: parent ? getComputedStyle(parent).display : 'N/A',
            parentZIndex: parent ? getComputedStyle(parent).zIndex : 'N/A',
        };
    }

    return { error: 'no canvas found' };
});

console.log('Scene info:', JSON.stringify(sceneInfo, null, 2));

// Screenshot
await page.screenshot({ path: './test_debug2.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
