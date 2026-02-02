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
import { BotBrain } from './entities/BotBrain.js';
import { Zombie } from './entities/Zombie.js';
import { EntityManager } from './entities/EntityManager.js';
import { LootManager } from './items/LootManager.js';
import { HUD } from './ui/HUD.js';

class Game {
    constructor() {
        this.isStarted = false;
        this.initializeGame();
    }

    isMobile() {
        return (
            'ontouchstart' in window
            || navigator.maxTouchPoints > 0
            || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
        );
    }

    async enterFullscreen() {
        try {
            const root = document.getElementById('gameRoot') || document.documentElement;
            if (root.requestFullscreen) {
                await root.requestFullscreen();
            } else if (root.webkitRequestFullscreen) {
                await root.webkitRequestFullscreen();
            } else if (root.msRequestFullscreen) {
                await root.msRequestFullscreen();
            } else if (this.renderer?.domElement?.requestFullscreen) {
                await this.renderer.domElement.requestFullscreen();
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

    updateOrientationUI() {
        if (!this.isMobile()) return;
        const rotateOverlay = document.getElementById('rotateOverlay');
        if (!rotateOverlay) return;
        const isPortrait = window.innerHeight > window.innerWidth;
        rotateOverlay.style.display = isPortrait ? 'flex' : 'none';
    }

    initializeGame() {
        const isMobile = this.isMobile();
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.scene.userData.camera = this.camera;

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
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        const gameRoot = document.getElementById('gameRoot');
        if (gameRoot) {
            gameRoot.appendChild(this.renderer.domElement);
        } else {
            document.body.appendChild(this.renderer.domElement);
        }

        this.camera.position.set(0, 1.5, 0);
        if (!isMobile) {
            this.controls = new PointerLockControls(this.camera, this.renderer.domElement);
            this.scene.add(this.controls.getObject());

            this.controls.addEventListener('lock', () => {
                console.log('Pointer lock enabled');
            });

            this.controls.addEventListener('unlock', () => {
                console.log('Pointer lock disabled');
            });
        } else {
            this.controls = null;
            this.scene.add(this.camera);
        }

        this.input = new Input();
        this.audioSynth = new AudioSynth();
        this.hud = new HUD();
        this.roundMode = 'hybrid';
        this.perk = 'none';
        this.partyMode = false;
        this.perkLocked = false;
        this.modeConfig = {
            lootDensity: 0.85,
            zombieMultiplier: 1.4,
            footstepVolume: 0.7,
            botVision: 0.9,
            fogDensity: 0.0024
        };
        this.commandState = { help: false, enemy: false, gather: false };
        this.quickCommandCooldown = 0;
        this.dropTriggeredAt = new Set();
        this.storm = { active: false, timer: 0, triggered: false };
        this.perkMenuOpen = false;
        this.perkMenuIndex = 0;
        this.perkKeyLatch = false;
        this.menuKeyLatch = { w: false, s: false, e: false };
        this.noteCooldown = 0;

        this.env = new Environment(this.scene);
        this.map = new MapGenerator(this.scene);
        this.physics = new Physics(this.scene, this.map);
        this.zone = new Zone(this.scene, this.map.size);
        this.traps = this.map.getTraps?.() || [];

        this.entityManager = new EntityManager(this.scene);
        this.lootManager = new LootManager(this.scene, this.map);

        const spawnPads = this.map.getSpawnPads?.() || [];
        this.player = new Player(this.scene, this.camera, this.input);
        this.player.setHUD(this.hud);
        if (spawnPads.length) {
            const pad = spawnPads[0];
            const padTop = pad.y;
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
        this.zombies = [];
        this.spawnBots();
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
        this.spawnTime = 20;
        this.spawnTimer = this.spawnTime;
        this.zoneShrinkTimer = 60;
        this.zoneShrinkInterval = 35;

        this.gameLoop = new GameLoop(this);
        this.applyRoundMode('hybrid');

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.updateOrientationUI();
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
                const padTop = pad.y;
                spawnPos = new THREE.Vector3(pad.x, padTop + 1.9, pad.z);
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

    applyRoundMode(mode) {
        this.roundMode = mode || 'hybrid';
        if (this.roundMode === 'hybrid') {
            this.modeConfig.lootDensity = 0.85;
            this.modeConfig.zombieMultiplier = 1.4;
            this.modeConfig.footstepVolume = 0.7;
            this.modeConfig.botVision = 0.9;
            this.modeConfig.fogDensity = 0.0024;
        } else if (this.roundMode === 'nightmare') {
            this.modeConfig.lootDensity = 0.6;
            this.modeConfig.zombieMultiplier = 2.2;
            this.modeConfig.footstepVolume = 1;
            this.modeConfig.botVision = 1.05;
            this.modeConfig.fogDensity = 0.0022;
        } else if (this.roundMode === 'stealth') {
            this.modeConfig.lootDensity = 0.9;
            this.modeConfig.zombieMultiplier = 1.1;
            this.modeConfig.footstepVolume = 0.35;
            this.modeConfig.botVision = 0.7;
            this.modeConfig.fogDensity = 0.0035;
        } else {
            this.modeConfig.lootDensity = 1;
            this.modeConfig.zombieMultiplier = 1;
            this.modeConfig.footstepVolume = 1;
            this.modeConfig.botVision = 1;
            this.modeConfig.fogDensity = 0.0015;
        }

        this.hud.setRoundMode(this.roundMode === 'hybrid'
            ? 'Hybrid'
            : this.roundMode === 'nightmare'
                ? 'Nightmare'
                : this.roundMode === 'stealth'
                    ? 'Stealth'
                    : 'Classic');

        this.lootManager.setLootDensity(this.modeConfig.lootDensity);
        this.player.footstepVolume = this.modeConfig.footstepVolume;
        if (this.scene?.fog) {
            this.scene.fog.density = this.modeConfig.fogDensity;
        }
        for (const brain of this.botBrains) {
            brain.visionMultiplier = this.modeConfig.botVision;
        }
    }

    applyPerk(perk) {
        this.perk = perk || 'none';
        this.player.applyPerk(this.perk, this.modeConfig.footstepVolume);
        const perkLabel = this.perk === 'quickHands'
            ? '\u0411\u044b\u0441\u0442\u0440\u044b\u0435 \u0440\u0443\u043a\u0438'
            : this.perk === 'silentStep'
                ? '\u0422\u0438\u0445\u0438\u0439 \u0448\u0430\u0433'
                : this.perk === 'moreAmmo'
                    ? '\u0411\u043e\u043b\u044c\u0448\u0435 \u043f\u0430\u0442\u0440\u043e\u043d\u043e\u0432'
                    : this.perk === 'fastRun'
                        ? '\u0411\u044b\u0441\u0442\u0440\u044b\u0439 \u0431\u0435\u0433'
                        : this.perk === 'thickSkin'
                            ? '\u041f\u043b\u043e\u0442\u043d\u0430\u044f \u043a\u043e\u0436\u0430'
                            : this.perk === 'steadyAim'
                                ? '\u0421\u0442\u0430\u0431\u0438\u043b\u044c\u043d\u044b\u0439 \u043f\u0440\u0438\u0446\u0435\u043b'
                    : '-';
        this.hud.setPerk(perkLabel);
    }

    assignFriendlyBots(count = 2) {
        if (!this.bots.length) return;
        const picks = [...this.bots].sort(() => Math.random() - 0.5).slice(0, count);
        for (const bot of picks) {
            bot.allies = bot.allies || [];
            if (!bot.allies.includes(this.player)) bot.allies.push(this.player);
            bot.teamId = 1;
        }
        this.hud.showGameMessage('\u0421\u043e\u044e\u0437\u043d\u0438\u043a\u0438 \u043f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u0438\u043b\u0438\u0441\u044c!');
    }

    handleQuickCommands(delta) {
        if (this.quickCommandCooldown > 0) {
            this.quickCommandCooldown = Math.max(0, this.quickCommandCooldown - delta);
        }
        const helpPressed = this.input.isKeyPressed('KeyZ');
        const enemyPressed = this.input.isKeyPressed('KeyX');
        const gatherPressed = this.input.isKeyPressed('KeyC');

        if (helpPressed && !this.commandState.help && this.quickCommandCooldown === 0) {
            this.hud.showQuickCommand('\u041f\u043e\u043c\u043e\u0433\u0438\u0442\u0435!');
            this.quickCommandCooldown = 0.6;
        }
        if (enemyPressed && !this.commandState.enemy && this.quickCommandCooldown === 0) {
            this.hud.showQuickCommand('\u0412\u0440\u0430\u0433 \u0441\u043f\u0435\u0440\u0435\u0434\u0438!');
            this.quickCommandCooldown = 0.6;
        }
        if (gatherPressed && !this.commandState.gather && this.quickCommandCooldown === 0) {
            this.hud.showQuickCommand('\u0421\u043e\u0431\u0435\u0440\u0451\u043c\u0441\u044f \u0432\u043c\u0435\u0441\u0442\u0435!');
            for (const bot of this.bots) {
                if (bot.teamId === 1) {
                    bot.assistTarget = this.player;
                    bot.assistTimer = 3.2;
                }
            }
            this.quickCommandCooldown = 0.8;
        }

        this.commandState.help = helpPressed;
        this.commandState.enemy = enemyPressed;
        this.commandState.gather = gatherPressed;
    }

    trySupplyDrop(aliveCount) {
        const thresholds = [16, 8];
        for (const threshold of thresholds) {
            if (aliveCount <= threshold && !this.dropTriggeredAt.has(threshold)) {
                this.dropTriggeredAt.add(threshold);
                const floorTiles = this.map.getFloorTiles?.() || [];
                const pick = floorTiles[Math.floor(Math.random() * floorTiles.length)];
                if (!pick) return;
                const y = this.map.getHeightAt(pick.x, pick.z) + 0.06;
                this.lootManager.spawnSupplyDrop(new THREE.Vector3(pick.x, y, pick.z));
                this.hud.showGameMessage('\u0421\u0431\u0440\u043e\u0441 \u0440\u0435\u0434\u043a\u043e\u0433\u043e \u043b\u0443\u0442\u0430!');
            }
        }
    }

    updateStorm(delta, aliveCount) {
        if (!this.storm.triggered && aliveCount <= 12) {
            this.storm.triggered = true;
            this.storm.active = true;
            this.storm.timer = 12;
            this.hud.setStormActive(true);
            this.hud.showGameMessage('\u0428\u0442\u043e\u0440\u043c! \u0411\u0443\u0434\u044c \u043e\u0441\u0442\u043e\u0440\u043e\u0436\u0435\u043d');
            this.audioSynth.playStorm?.(this.player.position);
        }

        if (this.storm.active) {
            this.storm.timer -= delta;
            const damage = 1.1 * delta;
            this.player.takeDamage(damage, false, null, 0, 'storm');
            for (const bot of this.bots) {
                if (bot.isAlive) bot.takeDamage(damage, false, null, 0, 'storm');
            }
            if (this.storm.timer <= 0) {
                this.storm.active = false;
                this.hud.setStormActive(false);
            }
        }
    }

    showMvpBoard() {
        const entities = this.entityManager.getEntities();
        const stats = entities
            .filter(e => e.stats)
            .map(e => ({
                name: e === this.player ? '\u0418\u0433\u0440\u043e\u043a' : (e.constructor?.name === 'Bot' ? `NPC #${e.id}` : 'NPC'),
                stats: e.stats
            }));
        if (!stats.length) return;

        const topDamage = [...stats].sort((a, b) => b.stats.damage - a.stats.damage)[0];
        const topKills = [...stats].sort((a, b) => b.stats.kills - a.stats.kills)[0];
        const topLoot = [...stats].sort((a, b) => b.stats.loot - a.stats.loot)[0];
        const lines = [
            `\u2b50 MVP \u0443\u0440\u043e\u043d: <strong>${topDamage.name}</strong> (${Math.round(topDamage.stats.damage)})`,
            `\ud83d\udd2a MVP \u0443\u0431\u0438\u0439\u0441\u0442\u0432\u0430: <strong>${topKills.name}</strong> (${topKills.stats.kills})`,
            `\ud83c\udf81 MVP \u043b\u0443\u0442: <strong>${topLoot.name}</strong> (${topLoot.stats.loot})`
        ];
        this.hud.showScoreboard(lines);
    }

    update(delta) {
        this.handleQuickCommands(delta);
        if (this.input.isKeyPressed('KeyP')) {
            if (!this.perkKeyLatch) {
                this.perkMenuOpen = !this.perkMenuOpen;
                this.hud.togglePerkPanel(this.perkMenuOpen);
                if (this.perkMenuOpen) {
                    this.perkMenuIndex = this.hud.getPerkMenuSelection();
                    this.hud.setPerkMenuSelection(this.perkMenuIndex);
                }
                this.perkKeyLatch = true;
            }
        } else {
            this.perkKeyLatch = false;
        }

        if (this.perkMenuOpen) {
            const wPressed = this.input.isKeyPressed('KeyW');
            const sPressed = this.input.isKeyPressed('KeyS');
            const ePressed = this.input.isKeyPressed('KeyE');

            if (wPressed && !this.menuKeyLatch.w) {
                this.perkMenuIndex -= 1;
                this.hud.setPerkMenuSelection(this.perkMenuIndex);
            }
            if (sPressed && !this.menuKeyLatch.s) {
                this.perkMenuIndex += 1;
                this.hud.setPerkMenuSelection(this.perkMenuIndex);
            }
            if (ePressed && !this.menuKeyLatch.e) {
                const perk = this.hud.getPerkMenuValue();
                if (perk) {
                    document.dispatchEvent(new CustomEvent('selectPerk', { detail: perk }));
                }
                this.perkMenuOpen = false;
                this.hud.togglePerkPanel(false);
            }
            this.menuKeyLatch.w = wPressed;
            this.menuKeyLatch.s = sPressed;
            this.menuKeyLatch.e = ePressed;
        } else {
            this.menuKeyLatch.w = false;
            this.menuKeyLatch.s = false;
            this.menuKeyLatch.e = false;
        }
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
                this.spawnZombies();
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
                const newRadius = this.zone.getTargetRadius() * 0.95;
                this.zone.shrink(newRadius);
                this.zoneShrinkTimer = this.zoneShrinkInterval;
            }

            this.zone.update(delta);

            if (!this.zone.isInsideZone(this.player.position)) {
                const damage = this.zone.getDamage(delta);
                this.player.takeDamage(damage, false, null, 0, 'zone');
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
        this.map.updatePropVisibility?.(this.player.position);
        this.noteCooldown = Math.max(0, this.noteCooldown - delta);
        if (this.noteCooldown === 0 && this.map.getStoryNotes) {
            const notes = this.map.getStoryNotes();
            for (const note of notes) {
                if (this.player.position.distanceTo(note.position) < 4) {
                    this.hud.showLoreNote(note.text);
                    this.noteCooldown = 2.2;
                    break;
                }
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
                    if (!this.scoreboardShown) {
                        this.scoreboardShown = true;
                        this.showMvpBoard();
                    }
                }
            } else {
                this.nightNotified = false;
                if (this.gateClosed) {
                    this.map.setCourtyardGateOpen(false);
                }
            }
        }

        if (this.gameState === 'playing') {
            const maxFar = this.isMobile() ? 650 : 1200;
            const targetFar = Math.max(200, Math.min(maxFar, this.zone.getCurrentRadius() + 120));
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
                    this.bots[i].takeDamage(damage, false, null, 0, 'zone');
                }
                if (this.gameState === 'playing' && !this.zone.isInsideZone(this.bots[botIndex].position)) {
                    this.bots[botIndex].moveTowards(new THREE.Vector3(0, this.bots[botIndex].position.y, 0), this.bots[botIndex].physics.speed * 1.25);
                }
            }
        }
        this.botUpdateIndex = (this.botUpdateIndex + botsPerFrame) % this.bots.length;

        for (const zombie of this.zombies) {
            if (zombie.isAlive) {
                zombie.update(delta, this.entityManager, this.audioSynth);
            }
        }

        const aliveCount = this.entityManager.update(delta, this.physics, this.audioSynth);
        if (this.gameState === 'playing') {
            this.trySupplyDrop(aliveCount);
            this.updateStorm(delta, aliveCount);
        }

        this.hud.updateHealth(this.player.health, this.player.maxHealth);
        this.hud.updateArmor(this.player.armor, this.player.maxArmor);
        this.hud.updatePlayersCount(aliveCount);
        this.hud.updateAmmo(this.player.currentWeapon || this.player.fists);
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
        }

        if (!this.player.isAlive && !this.deathHandled) {
            this.deathHandled = true;
            this.hud.showGameOver('\u0418\u0433\u0440\u0430 \u043e\u043a\u043e\u043d\u0447\u0435\u043d\u0430. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 E \u0447\u0442\u043e\u0431\u044b \u043d\u0430\u0447\u0430\u0442\u044c \u0437\u0430\u043d\u043e\u0432\u043e');
            if (!this.scoreboardShown) {
                this.scoreboardShown = true;
                this.showMvpBoard();
            }
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

    spawnZombies() {
        this.zombies = [];
        const floorTiles = this.map.getFloorTiles?.() || [];
        const baseCount = Math.min(10, Math.max(4, Math.floor(floorTiles.length / 250)));
        const count = Math.min(24, Math.max(4, Math.floor(baseCount * (this.modeConfig?.zombieMultiplier || 1))));
        const picks = [...floorTiles].sort(() => Math.random() - 0.5);
        let spawned = 0;
        for (const tile of picks) {
            if (spawned >= count) break;
            const pos = new THREE.Vector3(tile.x, this.map.getHeightAt(tile.x, tile.z) + 1.8, tile.z);
            if (pos.distanceTo(this.player.position) < 20) continue;
            const zombie = new Zombie(this.scene, 1000 + spawned, pos);
            this.physics.addEntity(zombie);
            this.entityManager.addEntity(zombie);
            this.zombies.push(zombie);
            spawned++;
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
        const modeSelect = document.getElementById('roundMode');
        const friendsToggle = document.getElementById('friendsGroup');
        this.partyMode = Boolean(friendsToggle?.checked);
        this.applyRoundMode(modeSelect?.value || 'hybrid');
        if (this.partyMode) {
            this.assignFriendlyBots(2);
        }

        if (this.isMobile()) {
            this.enterFullscreen();
            this.lockOrientation();
            this.updateOrientationUI();
            this.player?.resetView?.();
            const retry = async () => {
                if (!document.fullscreenElement) {
                    await this.enterFullscreen();
                    await this.lockOrientation();
                    this.updateOrientationUI();
                    this.player?.resetView?.();
                }
                window.removeEventListener('touchend', retry);
            };
            window.addEventListener('touchend', retry, { passive: false });
        } else {
            await this.enterFullscreen();
        }

        this.audioSynth.playMusic();
        this.audioSynth.startAmbient();

        this.hud.showCountdown(this.countdownTime);

        if (!this.isMobile() && this.controls) {
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
    if (game.isMobile()) {
        document.body.classList.add('mobile');
        game.updateOrientationUI();
        window.addEventListener('orientationchange', () => game.updateOrientationUI());
    }

    document.addEventListener('selectSlot', (event) => {
        if (!game?.player) return;
        const slot = typeof event.detail === 'number' ? event.detail : null;
        if (slot === null) return;
        game.player.selectSlot(slot);
        game.player.updateViewWeapon();
    });

    document.addEventListener('selectPerk', (event) => {
        const perk = typeof event.detail === 'string' ? event.detail : null;
        if (!perk || !game?.player) return;
        if (game.perkLocked) {
            game.hud.showGameMessage('\u041f\u0435\u0440\u043a \u0443\u0436\u0435 \u0432\u044b\u0431\u0440\u0430\u043d');
            return;
        }
        game.applyPerk(perk);
        game.perkLocked = true;
        game.hud.showGameMessage('\u041f\u0435\u0440\u043a \u0430\u043a\u0442\u0438\u0432\u0438\u0440\u043e\u0432\u0430\u043d');
    });

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
