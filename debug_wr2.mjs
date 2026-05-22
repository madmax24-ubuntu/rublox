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

const info = await page.evaluate(() => {
    const THREE = window.THREE;
    const wr = THREE.WebGLRenderer;
    
    // Check class properties
    const classKeys = Object.getOwnPropertyNames(wr);
    const proto = wr.prototype;
    const protoKeys = Object.getOwnPropertyNames(proto);
    const protoSyms = Object.getOwnPropertySymbols(proto);
    
    // Check if render is on the prototype
    const protoDescriptor = Object.getOwnPropertyDescriptor(proto, 'render');
    const renderMethod = proto.render;
    
    // Check constructor
    const ctor = wr.toString().substring(0, 200);
    
    return {
        classKeys: classKeys.slice(0, 20),
        protoKeys,
        protoSyms: protoSyms.map(s => s.toString()),
        protoHasRender: !!protoDescriptor,
        protoRenderType: typeof renderMethod,
        ctor,
    };
});

console.log('WebGLRenderer structure: ' + JSON.stringify(info, null, 2));

await browser.close();
