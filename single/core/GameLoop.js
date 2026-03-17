import * as THREE from 'three';

export class GameLoop {
    constructor(game) {
        this.game = game;
        this.clock = new THREE.Clock();
        this.isRunning = false;
        this.lastFrameTime = 0;
        this.targetFPS = 60;
        this.frameTime = 1000 / this.targetFPS;
    }

    start() {
        this.isRunning = true;
        this.clock.start();
        this.animate();
    }

    stop() {
        this.isRunning = false;
    }

    animate() {
        if (!this.isRunning) return;

        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();
        
        // Ограничиваем delta для предотвращения больших скачков
        const clampedDelta = Math.min(delta, 0.1);

        // Обновление игры
        if (this.game.update) {
            this.game.update(clampedDelta);
        }

        // Рендеринг
        if (this.game.render) {
            this.game.render();
        }
    }
}
