import { chromium } from 'playwright';

const browser = await chromium.launch({
    headless: true,
    args: ['--headless=new', '--no-sandbox', '--disable-gpu', '--use-gl=egl']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    if (msg.type() === 'error') console.log('[ERR] ' + t);
    else console.log('[LOG] ' + t);
});

// Inject a custom test that uses a canvas with explicit attributes
await page.evaluate(() => {
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
        import * as THREE from 'three';

        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        canvas.style.background = '#00ff00';
        document.body.appendChild(canvas);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xff0000);

        const camera = new THREE.PerspectiveCamera(75, 1280/720, 0.1, 1000);
        camera.position.z = 2;

        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: false,
            failIfMajorPerformanceCaveat: false,
        });
        renderer.setSize(1280, 720);
        renderer.setPixelRatio(1);

        const box = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
        scene.add(box);

        const ambient = new THREE.AmbientLight(0xffffff, 1);
        scene.add(ambient);

        let frameCount = 0;
        function animate() {
            requestAnimationFrame(animate);
            frameCount++;
            renderer.render(scene, camera);
            if (frameCount === 1) console.log('[Offscreen] First render done');
            if (frameCount === 100) {
                console.log('[Offscreen] 100 frames, canvas rect: ' + canvas.getBoundingClientRect().toJSON());
            }
        }
        animate();
    `;
    document.body.appendChild(script);
});

await page.waitForTimeout(15000);

// Take screenshot
await page.screenshot({ path: './test_offscreen.png', fullPage: false });
console.log('Screenshot saved');

// Check pixel values
const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const buf = new Uint8Array(4);
    if (gl) {
        gl.readPixels(640, 360, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    }
    return {
        canvasW: canvas?.width,
        canvasH: canvas?.height,
        canvasBg: canvas ? getComputedStyle(canvas).backgroundColor : 'none',
        centerPixel: gl ? Array.from(buf) : 'no-gl',
        glRenderer: gl ? gl.getParameter(37438) : 'none',
        canvasRect: canvas?.getBoundingClientRect?.().toJSON(),
    };
});

console.log('Offscreen: ' + JSON.stringify(info, null, 2));
await browser.close();
