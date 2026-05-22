import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    const type = msg.type();
    if (type === 'error') console.log('[ERR] ' + t);
    else console.log('[LOG] ' + t);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();

await page.waitForTimeout(45000);

// Check scene and camera details
const sceneInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const THREE = window.THREE;
    
    // Find the renderer through canvas
    let renderer = null;
    // Check canvas parent element
    const parent = canvas.parentElement;
    
    // Check for renderer reference
    const allProps = Object.getOwnPropertyNames(canvas);
    const allSyms = Object.getOwnPropertySymbols(canvas);
    
    // Try to find renderer by checking canvas._context
    const context = canvas._context || canvas.getContext('webgl2') || canvas.getContext('webgl');
    
    // Check if there's a global scene reference
    const sceneKeys = [];
    for (const k of Object.keys(window)) {
        if (k.length > 5 && k.length < 30) {
            const val = window[k];
            if (val && typeof val === 'object') {
                const proto = Object.getPrototypeOf(val);
                if (proto && proto.constructor && proto.constructor.name === 'Scene') {
                    sceneKeys.push(k);
                }
            }
        }
    }
    
    // Check canvas CSS
    const style = getComputedStyle(canvas);
    const parentStyle = getComputedStyle(canvas.parentElement);
    
    // Check framebuffer info
    const vp = gl ? gl.getParameter(gl.VIEWPORT) : null;
    const rs = gl ? gl.getParameter(gl.RENDERBUFFER_WIDTH) : null;
    const fb = gl ? gl.getParameter(gl.FRAMEBUFFER_BINDING) : null;
    const maxTex = gl ? gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) : null;
    const vendor = gl ? gl.getParameter(gl.VENDOR) : null;
    const renderer_gl = gl ? gl.getParameter(gl.RENDERER) : null;
    
    return {
        canvasW: canvas.width,
        canvasH: canvas.height,
        cssW: style.width,
        cssH: style.height,
        display: style.display,
        opacity: style.opacity,
        zIndex: style.zIndex,
        parentTag: canvas.parentElement?.tagName,
        parentClass: canvas.parentElement?.className,
        parentStyle: {
            display: parentStyle.display,
            pos: parentStyle.position,
            zIndex: parentStyle.zIndex,
            overflow: parentStyle.overflow,
            bg: parentStyle.backgroundColor,
        },
        siblingCount: canvas.parentElement?.children?.length,
        siblings: (() => {
            const sibs = [];
            for (let i = 0; i < canvas.parentElement.children.length; i++) {
                const sib = canvas.parentElement.children[i];
                const sibStyle = getComputedStyle(sib);
                sibs.push({
                    tag: sib.tagName,
                    id: sib.id,
                    display: sibStyle.display,
                    zIndex: sibStyle.zIndex,
                    pos: sibStyle.position,
                    opacity: sibStyle.opacity,
                    rect: sib.getBoundingClientRect().toJSON(),
                });
            }
            return sibs;
        })(),
        viewport: vp,
        framebuffer: fb,
        maxTextureUnits: maxTex,
        vendor,
        renderer_gl,
        sceneGlobals: sceneKeys,
    };
});

console.log('Scene info: ' + JSON.stringify(sceneInfo, null, 2));

await browser.close();
