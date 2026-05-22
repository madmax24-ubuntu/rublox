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

// Check THREE.WebGLRenderer source
const wrSource = await page.evaluate(() => {
    const THREE = window.THREE;
    const wr = THREE.WebGLRenderer;
    
    // Get the full constructor source
    const src = wr.toString();
    
    // Check if render is defined as a getter or class method
    const proto = wr.prototype;
    const descriptors = {};
    for (const key of Object.getOwnPropertyNames(proto)) {
        const desc = Object.getOwnPropertyDescriptor(proto, key);
        descriptors[key] = { type: desc.value ? 'value' : (desc.get ? 'getter' : 'N/A') };
    }
    
    // Check for render on prototype using getOwnPropertyDescriptor
    let hasRender = false;
    let renderDesc = null;
    let obj = proto;
    while (obj && obj !== Object.prototype) {
        renderDesc = Object.getOwnPropertyDescriptor(obj, 'render');
        if (renderDesc) { hasRender = true; break; }
        obj = Object.getPrototypeOf(obj);
    }
    
    // Check if render is a symbol
    const allSyms = Object.getOwnPropertySymbols(proto);
    
    return {
        hasRenderOnProto: hasRender,
        renderDesc: renderDesc ? { enumerable: renderDesc.enumerable, writable: renderDesc.writable, configurable: renderDesc.configurable } : null,
        protoKeys: Object.getOwnPropertyNames(proto),
        allProtoSyms: allSyms.map(s => s.toString()),
        ctorLength: wr.length,
        ctorName: wr.name,
        protoLength: Object.getOwnPropertyNames(proto).length,
    };
});

console.log('WR structure: ' + JSON.stringify(wrSource, null, 2));

await browser.close();
