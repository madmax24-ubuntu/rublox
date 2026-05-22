import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log('[C:' + msg.type() + '] ' + msg.text().substring(0, 500));
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

// First, let's check what's in the page before clicking start
const preStart = await page.evaluate(() => {
    // Check if canvas exists
    const canvas = document.querySelector('canvas');
    
    // Check all global symbols on window
    const symbols = Object.getOwnPropertySymbols(window);
    
    // Check for any THREE-related things
    const threeKeys = [];
    for (const key of Object.getOwnPropertyNames(window)) {
        if (key.toLowerCase().includes('three') || key.toLowerCase().includes('webgl')) {
            threeKeys.push(key);
        }
    }
    
    // Check import.meta or any module references
    const bodyChildren = document.body.children.length;
    const scriptTags = document.querySelectorAll('script').length;
    
    return {
        canvasExists: !!canvas,
        canvasW: canvas?.width,
        canvasH: canvas?.height,
        symbolsCount: symbols.length,
        threeKeys,
        bodyChildren,
        scriptTags,
        bodyStyle: document.body?.style?.display,
    };
});

console.log('Pre-start: ' + JSON.stringify(preStart, null, 2));

// Now click start and wait
const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();

await page.waitForTimeout(25000);

// After start, check again
const postStart = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const bodyClass = document.body?.className;
    
    if (canvas) {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const ext = gl ? gl.getSupportedExtensions()?.slice(0, 5) : 'no-gl';
        const vp = gl ? [gl.getParameter(gl.VIEWPORT)[0], gl.getParameter(gl.VIEWPORT)[1], gl.getParameter(gl.VIEWPORT)[2], gl.getParameter(gl.VIEWPORT)[3]] : 'no-vp';
        
        // Check canvas CSS
        const style = getComputedStyle(canvas);
        
        return {
            canvasExists: true,
            canvasW: canvas.width,
            canvasH: canvas.height,
            cssW: style.width,
            cssH: style.height,
            display: style.display,
            opacity: style.opacity,
            bodyClass,
            glContext: !!gl,
            webglVersion: gl ? (gl.getParameter(gl.VERSION)?.substring(0, 30)) : 'none',
            viewport: vp,
            extensions: ext,
        };
    }
    
    return { canvasExists: false, bodyClass };
});

console.log('Post-start: ' + JSON.stringify(postStart, null, 2));

// Now try to patch THREE from page context
// Since THREE is module-scoped, we need to find it
const patchResult = await page.evaluate(() => {
    // Try to find THREE by looking at canvas's context
    const canvas = document.querySelector('canvas');
    if (!canvas) return 'no-canvas';
    
    // Check if canvas has any private properties pointing to renderer
    const canvasProps = Object.getOwnPropertyNames(canvas);
    const canvasSyms = Object.getOwnPropertySymbols(canvas);
    
    // Try to find the renderer through canvas._context or similar
    let renderer = null;
    for (const prop of [...canvasProps, ...canvasSyms.map(s => s.toString())]) {
        try {
            const val = canvas[prop];
            if (val && typeof val === 'object' && typeof val.render === 'function') {
                renderer = val;
                break;
            }
        } catch(e) {}
    }
    
    if (renderer) {
        const origRender = renderer.render;
        let count = 0;
        renderer.render = function(scene, camera) {
            count++;
            if (count <= 10) {
                let mc = 0;
                if (scene) scene.traverse(o => { if (o.isMesh) mc++; });
                console.log('[PATCHED-RENDER#' + count + '] scene=' + !!scene + ' meshes=' + mc);
            }
            return origRender.call(this, scene, camera);
        };
        return 'patched-renderer';
    }
    
    return 'no-renderer-found';
});

console.log('Patch result: ' + patchResult);

await page.waitForTimeout(15000);

// Final check
const fb = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return 'no-canvas';
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 'no-gl';
    const data = new Uint8Array(4 * canvas.width * canvas.height);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let nb = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 0 || data[i+1] > 0 || data[i+2] > 0) nb++;
    }
    return { nonBlack: nb, total: canvas.width * canvas.height };
});

console.log('Frame buffer: ' + JSON.stringify(fb, null, 2));

await page.screenshot({ path: './debug_render6.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
