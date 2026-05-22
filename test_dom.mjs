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

// Get full DOM tree
const dom = await page.evaluate(() => {
    const gameRoot = document.getElementById('gameRoot');
    if (!gameRoot) return 'no gameRoot';

    function nodeToObj(el, depth = 0) {
        if (depth > 4) return null;
        const tag = el.tagName;
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className ? ` class="${el.className}"` : '';
        const style = el.style ? {
            display: el.style.display,
            position: el.style.position,
            zIndex: el.style.zIndex,
            width: el.style.width,
            height: el.style.height,
            background: el.style.background
        } : {};

        let children = [];
        if (el.children && el.children.length > 0) {
            for (let i = 0; i < Math.min(el.children.length, 10); i++) {
                const child = nodeToObj(el.children[i], depth + 1);
                if (child) children.push(child);
            }
            if (el.children.length > 10) children.push(`... +${el.children.length - 10} more`);
        }

        return { tag, id, cls: cls.substring(0, 50), style, children };
    }

    return JSON.stringify(nodeToObj(gameRoot), null, 2);
});

console.log('DOM tree:', dom);

// Also get canvas pixel data
const pixels = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!ctx) return { error: 'no webgl context' };

    // Read a few pixels
    const gl = ctx;
    const glCanvas = gl.drawingBufferWidth + 'x' + gl.drawingBufferHeight;
    return {
        drawingBufferWidth: gl.drawingBufferWidth,
        drawingBufferHeight: gl.drawingBufferHeight,
        glVersion: gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl1',
        // Sample center pixel color
        samples: []
    };
});

console.log('Canvas pixels:', JSON.stringify(pixels, null, 2));

// Screenshot
await page.screenshot({ path: './test_dom.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
