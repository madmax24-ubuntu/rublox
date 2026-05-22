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

// Find game instance through closure trick
const sceneData = await page.evaluate(() => {
    // Get all elements in gameRoot
    const gameRoot = document.getElementById('gameRoot');
    const elements = [];
    for (let i = 0; i < gameRoot.children.length; i++) {
        const el = gameRoot.children[i];
        elements.push({
            tag: el.tagName,
            id: el.id,
            rect: el.getBoundingClientRect().toJSON()
        });
    }

    // Check canvas parent element
    const canvas = document.querySelector('canvas');
    const parentStyle = getComputedStyle(canvas.parentElement);

    // Check if canvas has any CSS that might hide it
    const canvasStyle = getComputedStyle(canvas);

    // Check the renderer's canvas vs the actual canvas
    return {
        elements,
        canvasParent: {
            tag: canvas.parentElement.tagName,
            display: parentStyle.display,
            overflow: parentStyle.overflow,
        },
        canvasStyle: {
            display: canvasStyle.display,
            position: canvasStyle.position,
            zIndex: canvasStyle.zIndex,
            background: canvasStyle.backgroundColor,
            opacity: canvasStyle.opacity,
        }
    };
});

console.log('Scene data:', JSON.stringify(sceneData, null, 2));

// Check if canvas is actually visible by checking if it's behind other elements
const zIndexInfo = await page.evaluate(() => {
    const gameRoot = document.getElementById('gameRoot');
    const children = [];

    for (let i = 0; i < gameRoot.children.length; i++) {
        const child = gameRoot.children[i];
        const style = getComputedStyle(child);
        children.push({
            tag: child.tagName,
            id: child.id || '',
            display: style.display,
            zIndex: style.zIndex,
            position: style.position,
            rect: child.getBoundingClientRect().toJSON(),
        });
    }

    return children;
});

console.log('Z-index info:', JSON.stringify(zIndexInfo, null, 2));

// Screenshot
await page.screenshot({ path: './test_cam.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
