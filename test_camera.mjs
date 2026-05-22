import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// Patch THREE before loading
await page.addInitScript(() => {
    if (window.THREE && THREE.PerspectiveCamera) {
        const origLookAt = THREE.PerspectiveCamera.prototype.lookAt;
        THREE.PerspectiveCamera.prototype.lookAt = function(target) {
            const result = origLookAt.call(this, target);
            console.log(`[CAM] lookAt called: pos=${this.position.x},${this.position.y},${this.position.z} target=${target.x},${target.y},${target.z} fov=${this.fov}`);
            return result;
        };
    }
});

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

// Check canvas CSS
const canvasCSS = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const style = getComputedStyle(canvas);
    const parent = canvas.parentElement;
    const parentStyle = getComputedStyle(parent);

    // Check if canvas is behind other elements
    const siblings = [];
    for (let i = 0; i < canvas.parentElement.children.length; i++) {
        const sib = canvas.parentElement.children[i];
        const sibStyle = getComputedStyle(sib);
        siblings.push({
            tag: sib.tagName,
            display: sibStyle.display,
            zIndex: sibStyle.zIndex,
            pos: sibStyle.position,
            rect: sib.getBoundingClientRect().toJSON(),
        });
    }

    return {
        canvas: {
            width: canvas.width, height: canvas.height,
            rect: canvas.getBoundingClientRect().toJSON(),
            style: {
                display: style.display,
                pos: style.position,
                zIndex: style.zIndex,
                bg: style.backgroundColor,
                opacity: style.opacity,
            }
        },
        parent: {
            tag: parent.tagName,
            style: {
                display: parentStyle.display,
                pos: parentStyle.position,
                overflow: parentStyle.overflow,
                zIndex: parentStyle.zIndex,
            }
        },
        siblings,
    };
});

console.log('Canvas CSS:', JSON.stringify(canvasCSS, null, 2));

// Screenshot
await page.screenshot({ path: './test_camera.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
