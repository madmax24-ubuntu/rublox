import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import Stats from 'three/addons/libs/stats.module.js';

THREE.Cache.enabled = true;

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingFill = document.getElementById('loadingFill');
const loadingText = document.getElementById('loadingText');

const setLoadingProgress = (ratio) => {
    if (!loadingFill || !loadingText) return;
    const pct = Math.max(0, Math.min(100, Math.floor(ratio * 100)));
    loadingFill.style.width = `${pct}%`;
    loadingText.textContent = `${pct}%`;
};

THREE.DefaultLoadingManager.onStart = function() {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    setLoadingProgress(0.05);
};

THREE.DefaultLoadingManager.onProgress = function(url, loaded, total) {
    if (total > 0) {
        setLoadingProgress(loaded / total);
    } else {
        setLoadingProgress(0.2);
    }
};

THREE.DefaultLoadingManager.onLoad = function() {
    setLoadingProgress(1);
    if (loadingOverlay) {
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 300);
    }
};

import { MapGenerator } from './world/MapGenerator.js';
import { Environment } from './world/Environment.js';
import { Physics } from './world/Physics.js';
import { Zone } from './world/Zone.js';
import { GameLoop } from './core/GameLoop.js';
import { Input } from './core/Input.js';
import { AudioSynth } from './core/AudioSynth.js';
import { Player } from './entities/Player.js';
import { Bot } from './entities/Bot.js';
import { Griever } from './entities/Griever.js';
import { BotBrain } from './entities/BotBrain.js';
import { EntityManager } from './entities/EntityManager.js';
import { LootManager } from './items/LootManager.js';
import { HUD } from './ui/HUD.js';

class Game {
    constructor() {
        this.isStarted = false;
        this.initializeGame();
    }

    isMobile() {
        return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    }

    async enterFullscreen() {
        try {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                await elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                await elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                await elem.msRequestFullscreen();
            }
        } catch (err) {
            console.log('Fullscreen failed:', err);
        }
    }

    async lockOrientation() {
        if (!screen.orientation || !screen.orientation.lock) return;
        try {
            await screen.orientation.lock('landscape');
        } catch (err) {
            console.log('Orientation lock failed:', err);
        }
    }

    initializeGame() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance",
            precision: "mediump",
            stencil: false,
            depth: true,
            logarithmicDepthBuffer: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = false;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        document.body.appendChild(this.renderer.domElement);

        this.controls = new PointerLockControls(this.camera, this.renderer.domElement);
        this.camera.position.set(0, 1.5, 0);
        this.scene.add(this.controls.getObject());

        this.controls.addEventListener('lock', () => {
            console.log('Pointer lock enabled');
        });

        this.controls.addEventListener('unlock', () => {
            console.log('Pointer lock disabled');
        });

        this.input = new Input();
        this.audioSynth = new AudioSynth();
        this.hud = new HUD();

        this.env = new Environment(this.scene);
        this.map = new MapGenerator(this.scene);
        this.physics = new Physics(this.scene, this.map);
        this.zone = new Zone(this.scene, this.map.size);
        this.traps = this.map.getTraps?.() || [];

        this.entityManager = new EntityManager(this.scene);
        this.lootManager = new LootManager(this.scene, this.map);

        const spawnPads = this.map.getSpawnPads?.() || [];
        this.player = new Player(this.scene, this.camera, this.input);
        if (spawnPads.length) {
            const pad = spawnPads[0];
            const padTop = pad.y + 0.2;
            this.player.position.set(pad.x, padTop + this.player.physics.height, pad.z);
            this.player.physics.onGround = true;
        } else {
            const angle = Math.random() * Math.PI * 2;
            this.player.position.set(Math.cos(angle) * 16, 2, Math.sin(angle) * 16);
            this.player.physics.onGround = true;
        }
        this.physics.addEntity(this.player);
        this.entityManager.addEntity(this.player);

        this.bots = [];
        this.botBrains = [];
        this.spawnBots();
        this.grievers = [];
        this.spawnGrievers();
        this.gateClosed = false;
        this.nightNotified = false;
        this.returnNoticeShown = false;
        this.oneWayGates = this.map.getOneWayGates?.() || [];

        for (let i = 0; i < this.bots.length; i++) {
            this.botBrains.push(new BotBrain());
        }

        this.gameState = 'countdown';
        this.countdownTime = 10;
        this.countdownTimer = this.countdownTime;
        this.spawnTime = 60;
        this.spawnTimer = this.spawnTime;
        this.zoneShrinkTimer = 40;
        this.zoneShrinkInterval = 20;

        this.gameLoop = new GameLoop(this);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    spawnBots() {
        const botCount = 31;
        const spawnPads = this.map.getSpawnPads?.() || [];
        const spawnRadius = 16;

        for (let i = 0; i < botCount; i++) {
            let spawnPos;
            if (spawnPads.length) {
                const pad = spawnPads[(i + 1) % spawnPads.length];
                const padTop = pad.y + 0.175;
                spawnPos = new THREE.Vector3(pad.x, padTop + 1.8, pad.z);
            } else {
                const angle = (i / botCount) * Math.PI * 2;
                spawnPos = new THREE.Vector3(
                    Math.cos(angle) * spawnRadius,
                    2,
                    Math.sin(angle) * spawnRadius
                );
            }

            const bot = new Bot(this.scene, i, spawnPos);
            bot.mapRef = this.map;
            bot.physics.onGround = true;
            this.physics.addEntity(bot);
            this.entityManager.addEntity(bot);
            this.bots.push(bot);
        }
    }

    spawnGrievers() {
        const grieverCount = 5;
        const centers = this.map.getMazeCenters?.() || [];
        for (let i = 0; i < grieverCount; i++) {
            let x = 0;
            let z = 0;
            if (centers.length) {
                const pick = centers[Math.floor(Math.random() * centers.length)];
                x = pick.x;
                z = pick.z;
            } else {
                const angle = Math.random() * Math.PI * 2;
                const radius = 60 + Math.random() * (this.map.size * 0.28);
                x = Math.cos(angle) * radius;
                z = Math.sin(angle) * radius;
            }
            const y = this.map.getHeightAt(x, z) + 1.4;
            const griever = new Griever(this.scene, i, new THREE.Vector3(x, y, z));
            this.physics.addEntity(griever);
            this.entityManager.addEntity(griever);
            this.grievers.push(griever);
        }
    }

    update(delta) {
        if (this.gameState === 'countdown') {
            this.countdownTimer -= delta;

            this.player.setInvulnerable(true);
            this.bots.forEach(bot => bot.setInvulnerable(true));
            this.player.isFrozen = true;
            this.bots.forEach(bot => { bot.isFrozen = true; });

            this.hud.showCountdown(Math.ceil(this.countdownTimer));

            if (this.countdownTimer <= 0) {
                this.gameState = 'spawn';
                this.hud.hideCountdown();
                this.hud.showGameMessage('\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c \u043d\u0430 \u0413\u043e\u043b\u043e\u0434\u043d\u044b\u0435 \u0438\u0433\u0440\u044b, \u0432\u044b\u0436\u0438\u0432\u0435\u0442 \u0441\u0438\u043b\u044c\u043d\u0435\u0439\u0448\u0438\u0439!');
                this.audioSynth.playBoxArrival?.(new THREE.Vector3(0, 1, 0));
                this.player.isFrozen = false;
                this.bots.forEach(bot => { bot.isFrozen = false; });
            }
        } else if (this.gameState === 'spawn') {
            this.spawnTimer -= delta;
            this.player.isFrozen = false;
            this.bots.forEach(bot => { bot.isFrozen = false; });
            const exitPos = this.map.getCourtyardExitPosition?.();
            if (exitPos) {
                for (const bot of this.bots) {
                    if (this.map.isInsideCourtyard(bot.position)) {
                        bot.moveTowards(exitPos, bot.physics.speed * 1.25);
                    }
                }
            }

            if (this.spawnTimer <= 0) {
                this.gameState = 'playing';
                this.player.setInvulnerable(false);
                this.bots.forEach(bot => bot.setInvulnerable(false));
                this.hud.showGameMessage('\u0412\u044b\u0436\u0438\u0432\u0430\u043d\u0438\u0435 \u043d\u0430\u0447\u0430\u043b\u043e\u0441\u044c!');
                this.map.setCourtyardGateOpen(false);
                this.gateClosed = true;
                this.audioSynth.playStoneDoorClose?.(this.map.getCourtyardExitPosition());
                const kickOut = (entity) => {
                    if (this.map.isInsideCourtyard(entity.position)) {
                        const exitPos = this.map.getCourtyardExitPosition();
                        entity.position.set(exitPos.x, exitPos.y + entity.physics.height, exitPos.z);
                        entity.physics.velocity.set(0, 0, 0);
                    }
                };
                kickOut(this.player);
                this.bots.forEach(kickOut);
            } else {
                this.player.setInvulnerable(true);
                this.bots.forEach(bot => bot.setInvulnerable(true));
            }

            this.hud.showInvulnerabilityTimer(this.spawnTimer);
        }

        if (this.gameState === 'playing') {
            this.zoneShrinkTimer -= delta;

            if (this.zoneShrinkTimer <= 0) {
                const newRadius = this.zone.getTargetRadius() * 0.9;
                this.zone.shrink(newRadius);
                this.zoneShrinkTimer = this.zoneShrinkInterval;
            }

            this.zone.update(delta);

            if (!this.zone.isInsideZone(this.player.position)) {
                const damage = this.zone.getDamage(delta);
                this.player.takeDamage(damage);
            }

            const distanceFromZone = this.zone.getDistanceFromZone(this.player.position);
            if (distanceFromZone > 0) {
                this.hud.updateZoneInfo(`\u0412\u043d\u0435 \u0437\u043e\u043d\u044b! ${Math.ceil(distanceFromZone)}\u043c`, true);
            } else {
                this.hud.updateZoneInfo(`\u0411\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u0430 (\u0440\u0430\u0434\u0438\u0443\u0441 ${Math.ceil(this.zone.getCurrentRadius())}\u043c)`, false);
            }
        }

        this.physics.update(delta);

        this.player.update(delta, this.audioSynth, this.lootManager, this.entityManager, this.controls);
        if (this.grievers && this.grievers.length) {
            for (const griever of this.grievers) {
                griever.update(delta, this.entityManager, this.audioSynth);
            }
        }

        if (this.env && this.gameState === 'playing') {
            const night = this.env.dayTime < 0.18 || this.env.dayTime > 0.78;
            if (night) {
                this.map.setCourtyardGateOpen(true);
                if (!this.nightNotified) {
                    this.hud.showGameMessage('\u041d\u043e\u0447\u044c \u043d\u0430\u0441\u0442\u0443\u043f\u0438\u043b\u0430. \u0412\u0435\u0440\u043d\u0438\u0442\u0435\u0441\u044c \u0432 \u0434\u0432\u043e\u0440!');
                    this.nightNotified = true;
                }
                if (this.map.isInsideCourtyard(this.player.position)) {
                    this.hud.showGameMessage('\u0412\u044b \u0432\u0435\u0440\u043d\u0443\u043b\u0438\u0441\u044c \u0432 \u0434\u0432\u043e\u0440. \u0412\u044b \u043f\u043e\u0431\u0435\u0434\u0438\u043b\u0438!');
                    this.gameState = 'ended';
                }
            } else {
                this.nightNotified = false;
                if (this.gateClosed) {
                    this.map.setCourtyardGateOpen(false);
                }
            }
        }

        if (this.gameState === 'playing') {
            const targetFar = Math.max(200, Math.min(1200, this.zone.getCurrentRadius() + 120));
            if (this.camera.far !== targetFar) {
                this.camera.far = targetFar;
                this.camera.updateProjectionMatrix();
            }
        }
        if (this.audioSynth && this.camera) {
            const forward = new THREE.Vector3();
            this.camera.getWorldDirection(forward);
            this.audioSynth.updateListener(this.camera.position, forward);
        }

        const botsPerFrame = this.bots.length;
        this.botUpdateIndex = (this.botUpdateIndex || 0);

        for (let i = 0; i < botsPerFrame && i < this.bots.length; i++) {
            const botIndex = (this.botUpdateIndex + i) % this.bots.length;
            if (this.bots[botIndex].isAlive) {
                this.bots[botIndex].update(delta, this.botBrains[botIndex], this.entityManager, this.lootManager, this.audioSynth, this.physics);

                if (this.gameState === 'playing' && !this.zone.isInsideZone(this.bots[i].position)) {
                    const damage = this.zone.getDamage(delta);
                    this.bots[i].takeDamage(damage);
                }
                if (this.gameState === 'playing' && !this.zone.isInsideZone(this.bots[botIndex].position)) {
                    this.bots[botIndex].moveTowards(new THREE.Vector3(0, this.bots[botIndex].position.y, 0), this.bots[botIndex].physics.speed * 1.25);
                }
            }
        }
        this.botUpdateIndex = (this.botUpdateIndex + botsPerFrame) % this.bots.length;

        const aliveCount = this.entityManager.update(delta, this.physics, this.audioSynth);

        this.hud.updateHealth(this.player.health, this.player.maxHealth);
        this.hud.updateArmor(this.player.armor, this.player.maxArmor);
        this.hud.updatePlayersCount(aliveCount);
        if (this.traps && this.traps.length) {
            const applyTrap = (entity) => {
                if (!entity.isAlive) return;
                for (const trap of this.traps) {
                    const dx = entity.position.x - trap.position.x;
                    const dz = entity.position.z - trap.position.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist < trap.radius) {
                        if (typeof entity.applySlow === 'function') {
                            entity.applySlow(trap.slow, 0.6);
                        }
                        if (typeof entity.takeDamage === 'function') {
                            entity.takeDamage(trap.damage * delta);
                        }
                    }
                }
            };
            applyTrap(this.player);
            for (const bot of this.bots) {
                applyTrap(bot);
            }
            for (const griever of this.grievers) {
                applyTrap(griever);
            }
        }

        if (!this.player.isAlive && !this.deathHandled) {
            this.deathHandled = true;
            this.hud.showGameOver('\u0418\u0433\u0440\u0430 \u043e\u043a\u043e\u043d\u0447\u0435\u043d\u0430. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 E \u0447\u0442\u043e\u0431\u044b \u043d\u0430\u0447\u0430\u0442\u044c \u0437\u0430\u043d\u043e\u0432\u043e');
        }

        if (this.deathHandled && this.input.isKeyPressed('KeyE')) {
            window.location.reload();
            return;
        }

        const inventoryItems = this.player.inventory.getItems().map(item => {
            if (!item) return null;
            return { type: item.type };
        });
        this.hud.updateInventory(inventoryItems, this.player.inventory.selectedSlot);

        if (this.gameState === 'playing' && aliveCount <= 1 && !this.returnNoticeShown) {
            this.hud.showGameMessage('\u0422\u044b \u043e\u0441\u0442\u0430\u043b\u0441\u044f \u043e\u0434\u0438\u043d. \u0414\u043e\u0436\u0438\u0432\u0438 \u0434\u043e \u043d\u043e\u0447\u0438 \u0438 \u0432\u0435\u0440\u043d\u0438\u0441\u044c \u0432 \u0434\u0432\u043e\u0440, \u0447\u0442\u043e\u0431\u044b \u043f\u043e\u0431\u0435\u0434\u0438\u0442\u044c.');
            this.returnNoticeShown = true;
        }

        if (Math.random() < 0.2) {
            this.env.update(delta);
        }

        if (this.spawnTimer <= 0 || this.spawnTimer % 1 < 0.1) {
            this.hud.updatePlayersCount(this.entityManager.getAliveCount());
        }
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    async startGame() {
        if (this.isStarted) return;
        this.isStarted = true;

        const startScreen = document.getElementById('startScreen');
        if (startScreen) {
            startScreen.style.display = 'none';
        }

        if (this.isMobile()) {
            await this.enterFullscreen();
            await this.lockOrientation();
        } else {
            await this.enterFullscreen();
        }

        this.audioSynth.playMusic();
        this.audioSynth.startAmbient();

        this.hud.showCountdown(this.countdownTime);

        if (!this.isMobile()) {
            setTimeout(() => {
                try {
                    this.controls.lock();
                } catch (err) {
                    console.log('Pointer lock not available:', err);
                }
            }, 100);
        }

        this.gameLoop.start();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();

    const startButton = document.getElementById('startButton');
    if (startButton) {
        startButton.addEventListener('click', async () => {
            await game.startGame();
        });
        startButton.addEventListener('touchstart', async (e) => {
            e.preventDefault();
            await game.startGame();
        }, { passive: false });
    }
});
