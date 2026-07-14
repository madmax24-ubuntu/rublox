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
    }

    start() {
        this.isRunning = true;
        this.clock.start();
        this.resetDelta();
        this.animate();
    }

    stop() {
        this.isRunning = false;
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
            requestAnimationFrame(() => this.animate());
            return;
        }

        const delta = this.clock.getDelta();
        // Use real delta for accumulator (time must flow correctly).
        // Clamp ONLY when passing to update() to prevent physics explosions.
        const safeDelta = Number.isFinite(delta) ? delta : this._fixedDt;
        this._accumulator += safeDelta;

        // Fixed timestep: process game logic at fixed 60 Hz intervals
        while (this._accumulator >= this._fixedDt) {
            if (this.game.update) {
                this.game.update(this._fixedDt);
            }
            this._accumulator -= this._fixedDt;
        }

        // Prevent accumulator from growing indefinitely (if FPS very low)
        if (this._accumulator > this._fixedDt * 2) {
            this._accumulator = 0;
        }

        // FPS tracking: accumulate frames, sample every second (use real delta)
        this._fpsFrameCount++;
        this._fpsAccumulator += delta;
        if (this._fpsAccumulator >= 1.0) {
            this.fpsSamples.push(this._fpsFrameCount);
            this._fpsFrameCount = 0;
            this._fpsAccumulator -= 1.0;
        }

        // Render every frame (independent of fixed timestep)
        if (this.game.render) {
            this.game.render();
        }

        // Use renderer.setAnimationLoop for better performance with Three.js
        if (this.game.renderer) {
            this.game.renderer.setAnimationLoop(() => this.animate());
        } else {
            requestAnimationFrame(() => this.animate());
        }
    }
}