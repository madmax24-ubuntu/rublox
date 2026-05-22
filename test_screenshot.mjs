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

// Check canvas canvas dimensions and position
const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const startScreen = document.getElementById('startScreen');

    // Get computed styles for all elements
    const canvasStyle = getComputedStyle(canvas);
    const startScreenStyle = getComputedStyle(startScreen);

    return {
        canvas: {
            width: canvas.width,
            height: canvas.height,
            offsetWidth: canvas.offsetWidth,
            offsetHeight: canvas.offsetHeight,
            clientWidth: canvas.clientWidth,
            clientHeight: canvas.clientHeight,
            rect: canvas.getBoundingClientRect().toJSON(),
            style: {
                display: canvasStyle.display,
                position: canvasStyle.position,
                zIndex: canvasStyle.zIndex,
                width: canvasStyle.width,
                height: canvasStyle.height,
                background: canvasStyle.backgroundColor,
                opacity: canvasStyle.opacity,
                visibility: canvasStyle.visibility,
                overflow: canvasStyle.overflow,
            }
        },
        startScreen: {
            display: startScreenStyle.display,
            visibility: startScreenStyle.visibility,
            opacity: startScreenStyle.opacity,
            rect: startScreen.getBoundingClientRect().toJSON(),
        }
    };
});

console.log('Info:', JSON.stringify(info, null, 2));

// Screenshot
await page.screenshot({ path: './test_ss.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
