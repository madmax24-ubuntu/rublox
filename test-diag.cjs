const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }});
  await page.goto('http://localhost:3001');

  // Inject diagnostic script before game starts
  await page.evaluateOnPageLoad(() => {
    window.__diagnostics = [];

    // Track canvas
    const origGetCanvas = HTMLCanvasElement.getContext;
    HTMLCanvasElement.prototype.getContext = function(...args) {
      const ctx = origGetCanvas.apply(this, args);
      if (ctx && (ctx instanceof WebGL2RenderingContext || ctx instanceof WebGLRenderingContext)) {
        window.__diagnostics.push(`Canvas ${this.id} got WebGL context`);
        // Wrap WebGL methods to catch errors
        const gl = ctx;
        const origGetError = gl.getError.bind(gl);
        gl.getError = function() {
          const err = origGetError();
          if (err !== 0) {
            const names = { 0x0500: 'NO_ERROR', 0x0501: 'INVALID_ENUM', 0x0502: 'INVALID_VALUE',
              0x0503: 'INVALID_OPERATION', 0x0504: 'OUT_OF_MEMORY', 0x0506: 'STACK_UNDERFLOW', 0x0507: 'STACK_OVERFLOW' };
            window.__diagnostics.push(`GL ERROR: ${names[err] || err}`);
          }
          return err;
        };
      }
      return ctx;
    };

    // Track console errors
    const origError = console.error;
    console.error = function(...args) {
      window.__diagnostics.push(`CONSOLE ERROR: ${args.join(' ')}`);
      origError.apply(console, args);
    };
  });

  // Click start button
  await page.waitForSelector('#startButtonDesktop', { timeout: 5000 });
  await page.click('#startButtonDesktop');
  console.log('Start clicked');

  // Wait a bit for initialization
  await new Promise(r => setTimeout(r, 3000));

  // Get comprehensive diagnostic info
  const diag = await page.evaluate(() => {
    const info = {
      canvas: null,
      renderer: null,
      scene: null,
      camera: null,
      game: !!window.game,
      gameProps: null,
      webgl: false,
      canvasWidth: 0,
      canvasHeight: 0,
      canvasStyleWidth: 0,
      canvasStyleHeight: 0,
      canvasDisplay: '',
      canvasVisible: false,
      domChildren: [],
    };

    // Find canvas
    const canvases = document.querySelectorAll('canvas');
    if (canvases.length > 0) {
      const c = canvases[0];
      info.canvas = c.id || c.className || 'canvas';
      info.canvasWidth = c.width;
      info.canvasHeight = c.height;
      info.canvasStyleWidth = parseInt(getComputedStyle(c).width) || 0;
      info.canvasStyleHeight = parseInt(getComputedStyle(c).height) || 0;
      info.canvasDisplay = getComputedStyle(c).display;
      info.canvasVisible = getComputedStyle(c).visibility !== 'hidden' && getComputedStyle(c).opacity !== '0';
      info.canvasParent = c.parentElement?.tagName + '.' + (c.parentElement?.id || c.parentElement?.className);
    }

    if (window.game) {
      info.gameProps = {
        renderer: window.game.renderer ? 'exists' : 'null',
        rendererType: window.game.renderer?.domElement?.tagName,
        rendererSize: window.game.renderer?.domElement?.width + 'x' + window.game.renderer?.domElement?.height,
        scene: !!window.game.scene,
        camera: !!window.game.camera,
        gameState: window.game.gameState,
        meshes: window.game.scene?.children?.length,
        fog: window.game.scene?.fog?.constructor?.name,
        lights: [],
        terrain: window.game.map ? 'hasMap' : 'null',
        errors: window.__diagnostics?.slice(-20),
      };

      // Count lights
      let lightCount = 0;
      if (window.game.scene) {
        window.game.scene.traverse(obj => {
          if (obj.isLight) lightCount++;
        });
      }
      info.gameProps.lightCount = lightCount;

      // Check if scene was rendered at least once
      if (window.game.renderer) {
        info.gameProps.autoClear = window.game.renderer.autoClear;
        info.gameProps.powerPreference = window.game.renderer.domElement.getAttribute('data-context-id');
      }
    }

    // Check for WebGL context
    if (canvases.length > 0 && canvases[0].getContext('webgl2')) {
      info.webgl = true;
    }

    return info;
  });

  console.log('=== DIAGNOSTICS ===');
  console.log(JSON.stringify(diag, null, 2));

  // Check for console errors specifically
  const errors = await page.evaluate(() => {
    const errors = [];
    const origConsole = console;
    // Already captured in window.__diagnostics
    return window.__diagnostics?.slice(-30) || ['none'];
  });
  console.log('\n=== DIAG LOGS ===');
  console.log(errors.join('\n'));

  // Try to render a frame manually
  console.log('\n=== FORCE RENDER ===');
  await page.evaluate(() => {
    if (window.game && window.game.renderer && window.game.scene && window.game.camera) {
      try {
        window.game.renderer.render(window.game.scene, window.game.camera);
        console.log('Manual render succeeded');
      } catch (e) {
        console.log('Manual render failed:', e.message);
      }
    } else {
      console.log('Cannot render: renderer=', !!window.game?.renderer, 'scene=', !!window.game?.scene, 'camera=', !!window.game?.camera);
    }
  });

  // Take screenshot after diagnostic
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: './screenshots/diag.png', fullPage: false });

  // Inspect the canvas element directly
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return 'NO CANVAS FOUND';
    const ctx = c.getContext('webgl2') || c.getContext('webgl');
    if (ctx) {
      const gl = ctx;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'unknown';
      return {
        width: c.width,
        height: c.height,
        styleWidth: parseInt(getComputedStyle(c).width),
        styleHeight: parseInt(getComputedStyle(c).height),
        display: getComputedStyle(c).display,
        position: getComputedStyle(c).position,
        zIndex: getComputedStyle(c).zIndex,
        opacity: getComputedStyle(c).opacity,
        visibility: getComputedStyle(c).visibility,
        parent: c.parentElement?.className || c.parentElement?.tagName,
        ctxType: c.getContextAttribs ? 'webgl2' : 'webgl',
        renderer,
        vendor,
        canvasDataURL: c.toDataURL?.()?.substring(0, 100),
      };
    }
    return { noCtx: true, width: c.width, height: c.height, styleW: parseInt(getComputedStyle(c).width), styleH: parseInt(getComputedStyle(c).height), display: getComputedStyle(c).display };
  });
  console.log('\n=== CANVAS INFO ===');
  console.log(JSON.stringify(canvasInfo, null, 2));

  await browser.close();
})();
