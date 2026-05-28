import * as THREE from 'three';

export class GameLoop {
    constructor(game) {
        this.game = game;
        this.clock = new THREE.Clock();
        this.isRunning = false;
        this.lastFrameTime = 0;
        this.targetFPS = 60;
        this.frameTime = 1000 / this.targetFPS;
        this._frameCount = 0;
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
    }

    animate() {
        if (!this.isRunning) {
            return;
        }

        requestAnimationFrame(() => this.animate());

        // Do not advance simulation when the tab/app is hidden.
        if (typeof document !== 'undefined' && document.hidden) {
            this.resetDelta();
            return;
        }

        // Do not advance simulation when paused.
        if (this.game.isPaused) {
            this.resetDelta();
            return;
        }

        const delta = this.clock.getDelta();
        // Clamp delta to avoid large physics/AI jumps after tab switching.
        const clampedDelta = Math.min(delta, 0.1);

        if (this.game.update) {
            this.game.update(clampedDelta);
        }

        if (this.game.render) {
            this.game.render();
        }

        this._frameCount++;
        if (this._frameCount === 1) {
            console.log('[GameLoop] first frame: update=' + typeof this.game.update + ' render=' + typeof this.game.render + ' paused=' + this.game.isPaused + ' hidden=' + document.hidden);
        }
        if (this._frameCount % 120 === 0) {
            console.log('[GameLoop] frame#' + this._frameCount);
        }
    }
}
