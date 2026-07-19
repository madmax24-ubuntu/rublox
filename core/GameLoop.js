import * as THREE from 'three';

export class GameLoop {
    constructor(game) {
        this.game = game;
        this.clock = new THREE.Clock();
        this.isRunning = false;
        // FPS tracking for tests
        this.fpsSamples = [];
        this._fpsFrameCount = 0;
        this._fpsAccumulator = 0;
        // Fixed timestep for deterministic game logic (60 Hz)
        this._fixedDt = 1 / 60;
        this._accumulator = 0;
        this._boundAnimate = () => this.animate();
        this._frameHandle = 0;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.clock.start();
        this.resetDelta();
        this.game.renderer?.setAnimationLoop?.(null);
        this._frameHandle = requestAnimationFrame(this._boundAnimate);
    }

    stop() {
        this.isRunning = false;
        if (this._frameHandle) cancelAnimationFrame(this._frameHandle);
        this._frameHandle = 0;
    }

    resetDelta() {
        if (!this.clock.running) {
            this.clock.start();
        }
        this.clock.getDelta();
        this._accumulator = 0;
    }

    animate() {
        if (!this.isRunning) return;

        // Do not advance simulation when the tab/app is hidden.
        // In headless mode, document.hidden is always true, so check for it.
        const isHeadless = typeof navigator !== 'undefined' && navigator.userAgent?.includes('Headless');
        if (typeof document !== 'undefined' && document.hidden && !window.__kilo_test__ && !isHeadless) {
            this.resetDelta();
            this._frameHandle = requestAnimationFrame(this._boundAnimate);
            return;
        }

        const delta = this.clock.getDelta();
        const safeDelta = Math.min(0.05, Math.max(0.001, Number.isFinite(delta) ? delta : this._fixedDt));
        if (this.game.update) this.game.update(safeDelta);
        this._fpsFrameCount++;
        this._fpsAccumulator += Number.isFinite(delta) ? delta : safeDelta;
        if (this._fpsAccumulator >= 0.5) {
            const fps = Math.round(this._fpsFrameCount / this._fpsAccumulator);
            this.fpsSamples.push(fps);
            this.game.hud?.updateFpsDisplay?.(fps);
            this._fpsFrameCount = 0;
            this._fpsAccumulator = 0;
        }

        if (this.game.render) this.game.render();

        this._frameHandle = requestAnimationFrame(this._boundAnimate);
    }
}
