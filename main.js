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
import { YandexBridge } from './core/YandexBridge.js';

class Game {
    constructor(yandexBridge = null) {
        this.yandex = yandexBridge || new YandexBridge();
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
        rotateOverlay.style.display = this.isStarted && isPortrait ? 'flex' : 'none';
    }

    hideStartScreen() {
        document.body?.classList?.add('game-started');
        const startScreen = document.getElementById('startScreen');
        if (!startScreen) return;
        startScreen.style.opacity = '0';
        startScreen.style.visibility = 'hidden';
        startScreen.style.pointerEvents = 'none';
        startScreen.style.display = 'none';
    }

    showStartScreen() {
        document.body?.classList?.remove('game-started');
        const startScreen = document.getElementById('startScreen');
        if (!startScreen) return;
        startScreen.style.opacity = '1';
        startScreen.style.visibility = 'visible';
        startScreen.style.pointerEvents = 'auto';
        startScreen.style.display = 'grid';
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
                this.input?.clearInputState?.();
                if (this.isStarted && !this.isPaused) {
                    this.setPaused(true);
                }
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
            fogDensity: 0.0032
        };
        this.commandState = { help: false, enemy: false, gather: false };
        this.quickCommandCooldown = 0;
        this.dropTriggeredAt = new Set();
        this.perkMenuOpen = false;
        this.perkMenuIndex = 0;
        this.perkKeyLatch = false;
        this.pauseKeyLatch = false;
        this.menuKeyLatch = { w: false, s: false, e: false };
        this.noteCooldown = 0;
        this.achievementState = {
            firstBlood: false,
            hunter: false,
            scavenger: false,
            survivor: false
        };
        this.randomEventTimer = 35 + Math.random() * 25;
        this.activeEvent = { type: null, timer: 0, prevFog: null };

        this.env = new Environment(this.scene);
        this.map = new MapGenerator(this.scene);
        this.physics = new Physics(this.scene, this.map);
        this.zone = new Zone(this.scene, this.map.size);
        this.zoneDuration = 600;
        this.zoneMinRadius = Math.max(24, this.zone.getCurrentRadius() * 0.15);
        this.zone.shrink(this.zone.getCurrentRadius());
        this.zone.shrinkSpeed = 0;
        this.traps = this.map.getTraps?.() || [];
        this.localFogZones = this.map.getFogZones?.() || [];

        this.entityManager = new EntityManager(this.scene);
        this.entityManager.physicsRef = this.physics;
        this.scene.userData.entityManager = this.entityManager;
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
        this.nightWaveTimer = 0;
        this.nightWaveBurstDone = false;
        this.nextZombieId = 1000;
        this.returnNoticeShown = false;
        this.roundFinished = false;
        this.deathHandled = false;
        this.scoreboardShown = false;
        this.oneWayGates = this.map.getOneWayGates?.() || [];
        this.poiZombieSeeded = false;
        this.isPaused = false;

        for (let i = 0; i < this.bots.length; i++) {
            this.botBrains.push(new BotBrain());
        }

        this.gameState = 'countdown';
        this.countdownTime = 10;
        this.countdownTimer = this.countdownTime;
        this.spawnTime = 20;
        this.spawnTimer = this.spawnTime;
        this.zonePhase = 'waiting';
        this.zonePhaseTimer = 28;
        this.zonePhaseIndex = 0;
        this.zonePhaseCount = 8;
        this.zonePhaseTarget = this.zone.getCurrentRadius();
        this.chestRespawnTimer = 55;

        this.gameLoop = new GameLoop(this);
        this.applyRoundMode('hybrid');
        this.applyUserSettings(this.loadUserSettings());
        this.hud.setPerkSelectionEnabled(true);
        this.hud.showGameMessage('Выберите перк до старта матча. Клавиша P');

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.updateOrientationUI();
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                this.recoverViewState('fullscreen-exit');
                if (this.isStarted && !this.isPaused) {
                    this.setPaused(true);
                }
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.input?.clearInputState?.();
                return;
            }
            this.recoverViewState('visibility-resume');
        });
        window.addEventListener('focus', () => this.recoverViewState('focus'));
        window.addEventListener('pageshow', () => this.recoverViewState('pageshow'));

        document.addEventListener('togglePause', () => {
            this.setPaused(!this.isPaused);
        });

        document.addEventListener('rebindKey', (e) => {
            if (!e?.detail) return;
            this.input.setKeyRemap(e.detail.action, e.detail.code);
        });
    }

    setPaused(value) {
        if (!value && this.isStarted && !document.fullscreenElement) {
            this.enterFullscreen();
            if (this.isMobile()) this.lockOrientation();
        }
        this.isPaused = value;
        this.hud.showPause(this.isPaused);
        this.input?.clearInputState?.();
        if (this.isPaused) this.yandex?.gameplayStop?.();
        else this.yandex?.gameplayStart?.();
        if (!this.isMobile()) {
            document.body.style.cursor = this.isPaused ? 'auto' : 'none';
            if (this.renderer?.domElement) {
                this.renderer.domElement.style.cursor = this.isPaused ? 'auto' : 'none';
            }
        }
        if (this.controls && !this.isMobile()) {
            if (this.isPaused && this.controls.isLocked) this.controls.unlock();
            if (!this.isPaused && !this.controls.isLocked) this.controls.lock();
        }
        this.recoverViewState(this.isPaused ? 'pause' : 'unpause');
        if (!this.isPaused) {
            setTimeout(() => this.recoverViewState('post-unpause'), 40);
        }
    }

    recoverViewState(_reason = 'resume') {
        this.input?.clearInputState?.();
        this.input?.resetLook?.();
        if (!this.player) return;

        const maxPitch = Math.PI / 2.4;
        const safePitch = Number.isFinite(this.player.rotation.x)
            ? Math.max(-maxPitch, Math.min(maxPitch, this.player.rotation.x))
            : 0;
        const safeYaw = Number.isFinite(this.player.rotation.y) ? this.player.rotation.y : 0;

        this.player.rotation.x = safePitch;
        this.player.rotation.y = safeYaw;
        this.player.rotation.z = 0;
        this.player.camera?.rotation?.set(safePitch, safeYaw, 0, 'YXZ');

        if (this.controls) {
            const obj = this.controls.getObject();
            obj.rotation.set(safePitch, safeYaw, 0, 'YXZ');
            obj.quaternion.setFromEuler(obj.rotation);
            obj.position.set(
                this.player.position.x,
                this.player.position.y + this.player.cameraOffset.y,
                this.player.position.z
            );
        }
        this.updateOrientationUI?.();
    }

    spawnBots() {
        const botCount = 60;
        const spawnPads = this.map.getSpawnPads?.() || [];
        const spawnRadius = 16;

        for (let i = 0; i < botCount; i++) {
            let spawnPos;
            if (spawnPads.length) {
                const pad = spawnPads[(i + 1) % spawnPads.length];
                const padTop = pad.y;
                const jitterX = (Math.random() - 0.5) * 0.45;
                const jitterZ = (Math.random() - 0.5) * 0.45;
                spawnPos = new THREE.Vector3(pad.x + jitterX, padTop + 1.9, pad.z + jitterZ);
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
            this.modeConfig.fogDensity = 0.0058;
        } else if (this.roundMode === 'nightmare') {
            this.modeConfig.lootDensity = 0.6;
            this.modeConfig.zombieMultiplier = 2.2;
            this.modeConfig.footstepVolume = 1;
            this.modeConfig.botVision = 1.05;
            this.modeConfig.fogDensity = 0.0068;
        } else if (this.roundMode === 'stealth') {
            this.modeConfig.lootDensity = 0.9;
            this.modeConfig.zombieMultiplier = 1.1;
            this.modeConfig.footstepVolume = 0.35;
            this.modeConfig.botVision = 0.7;
            this.modeConfig.fogDensity = 0.0076;
        } else {
            this.modeConfig.lootDensity = 1;
            this.modeConfig.zombieMultiplier = 1;
            this.modeConfig.footstepVolume = 1;
            this.modeConfig.botVision = 1;
            this.modeConfig.fogDensity = 0.0052;
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
                                : this.perk === 'autoFire'
                                    ? '\u0410\u0432\u0442\u043e\u0441\u0442\u0440\u0435\u043b\u044c\u0431\u0430'
                    : '-';
        this.hud.setPerk(perkLabel);
    }

    loadUserSettings() {
        try {
            const raw = localStorage.getItem('mazearena_settings');
            const saved = raw ? JSON.parse(raw) : {};
            return {
                musicVolume: Math.max(0, Math.min(0.4, Number(saved.musicVolume ?? 0.14))),
                sfxVolume: Math.max(0, Math.min(0.55, Number(saved.sfxVolume ?? 0.22))),
                lookSensitivity: Math.max(0.5, Math.min(2.4, Number(saved.lookSensitivity ?? 1)))
            };
        } catch (_) {
            return { musicVolume: 0.14, sfxVolume: 0.22, lookSensitivity: 1 };
        }
    }

    saveUserSettings(partial = {}) {
        const current = this.loadUserSettings();
        const next = { ...current, ...partial };
        localStorage.setItem('mazearena_settings', JSON.stringify(next));
        return next;
    }

    applyUserSettings(settings = {}) {
        const safe = {
            musicVolume: Math.max(0, Math.min(0.4, Number(settings.musicVolume ?? 0.14))),
            sfxVolume: Math.max(0, Math.min(0.55, Number(settings.sfxVolume ?? 0.22))),
            lookSensitivity: Math.max(0.5, Math.min(2.4, Number(settings.lookSensitivity ?? 1)))
        };
        this.audioSynth?.setMusicVolume?.(safe.musicVolume);
        this.audioSynth?.setSfxVolume?.(safe.sfxVolume);
        this.player?.setLookSensitivityMultiplier?.(safe.lookSensitivity);
        this.hud?.setSettingsValues?.(safe);
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
        const thresholds = [24, 16, 8];
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

    forceEliminateInvalidSurvivors() {
        const maxDistance = (this.map?.size || 240) * 0.75;
        const survivors = this.entityManager.getAliveSurvivors?.() || [];
        for (const entity of survivors) {
            const pos = entity?.position;
            if (!pos) continue;
            const invalid =
                !Number.isFinite(pos.x)
                || !Number.isFinite(pos.y)
                || !Number.isFinite(pos.z)
                || pos.y < -20
                || Math.abs(pos.x) > maxDistance
                || Math.abs(pos.z) > maxDistance;
            if (!invalid) continue;

            entity.health = 0;
            entity.isAlive = false;
            entity.isFrozen = true;
            entity.physics?.velocity?.set?.(0, 0, 0);
            entity.clearBurning?.();
            entity.syncWeaponVisibility?.();
        }
    }

    endRound(message) {
        if (this.roundFinished) return;
        this.roundFinished = true;
        this.gameState = 'ended';
        this.hud.hideScoreboard?.();
        this.hud.showGameOver(message);
    }

    updateAchievements(aliveCount) {
        if (!this.player?.isAlive) return;
        if (!this.achievementState.firstBlood && this.player.stats.kills >= 1) {
            this.achievementState.firstBlood = true;
            this.hud.showGameMessage('\u0414\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u0435: \u041f\u0435\u0440\u0432\u0430\u044f \u043a\u0440\u043e\u0432\u044c');
        }
        if (!this.achievementState.hunter && this.player.stats.kills >= 5) {
            this.achievementState.hunter = true;
            this.hud.showGameMessage('\u0414\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u0435: \u041e\u0445\u043e\u0442\u043d\u0438\u043a');
        }
        if (!this.achievementState.scavenger && this.player.stats.loot >= 8) {
            this.achievementState.scavenger = true;
            this.hud.showGameMessage('\u0414\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u0435: \u041c\u0430\u0440\u043e\u0434\u0435\u0440');
        }
        if (!this.achievementState.survivor && aliveCount <= 5) {
            this.achievementState.survivor = true;
            this.hud.showGameMessage('\u0414\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u0435: \u0412\u044b\u0436\u0438\u0432\u0448\u0438\u0439');
        }
    }

    getSafeZoneTarget(position) {
        const v = new THREE.Vector3(position.x, 0, position.z);
        if (v.lengthSq() < 1e-6) return new THREE.Vector3(0, position.y, 0);
        v.normalize().multiplyScalar(Math.max(0, this.zone.getCurrentRadius() * 0.6));
        return new THREE.Vector3(v.x, position.y, v.z);
    }

    startZoneCycle() {
        this.zonePhase = 'waiting';
        this.zonePhaseTimer = 28;
        this.zonePhaseIndex = 0;
        this.zonePhaseTarget = this.zone.getCurrentRadius();
        this.chestRespawnTimer = 55;
        this.zone.setCurrentRadius(this.zone.getCurrentRadius());
        this.zone.shrink(this.zone.getCurrentRadius());
        this.zone.shrinkSpeed = 0;
    }

    updateZoneCycle(delta) {
        if (this.zonePhaseIndex >= this.zonePhaseCount && this.zone.getCurrentRadius() <= this.zoneMinRadius + 0.25) {
            this.zonePhase = 'final';
            return;
        }

        if (this.zonePhase === 'waiting') {
            this.zonePhaseTimer = Math.max(0, this.zonePhaseTimer - delta);
            if (this.zonePhaseTimer <= 0 && this.zonePhaseIndex < this.zonePhaseCount) {
                const currentRadius = this.zone.getCurrentRadius();
                const remainingSteps = Math.max(1, this.zonePhaseCount - this.zonePhaseIndex);
                const stepDrop = (currentRadius - this.zoneMinRadius) / remainingSteps;
                this.zonePhaseTarget = Math.max(this.zoneMinRadius, currentRadius - stepDrop);
                this.zone.shrink(this.zonePhaseTarget);
                this.zone.shrinkSpeed = Math.max(8, (currentRadius - this.zonePhaseTarget) / 10);
                this.zonePhase = 'shrinking';
                this.zonePhaseTimer = 10;
            }
            return;
        }

        if (this.zonePhase === 'shrinking') {
            this.zone.update(delta);
            this.zonePhaseTimer = Math.max(0, this.zonePhaseTimer - delta);
            if (this.zone.getCurrentRadius() <= this.zonePhaseTarget + 0.25 || this.zonePhaseTimer <= 0) {
                this.zone.setCurrentRadius(this.zonePhaseTarget);
                this.zone.shrink(this.zonePhaseTarget);
                this.zone.shrinkSpeed = 0;
                const restored = this.lootManager.refillOpenedChests?.(10) || 0;
                if (restored > 0) {
                    this.hud.showLootNotification?.(`Сундуки пополнены: ${restored}`);
                }
                this.zonePhaseIndex += 1;
                this.zonePhase = 'waiting';
                this.zonePhaseTimer = this.zonePhaseIndex >= this.zonePhaseCount ? 9999 : 22;
            }
        }
    }

        updateRandomEvents(delta) {
        if (this.activeEvent.type) {
            this.activeEvent.timer -= delta;
            if (this.activeEvent.timer <= 0) {
                if (this.activeEvent.type === "blindness") {
                    if (this.env?.clearFogOverride) this.env.clearFogOverride();
                }
                if (this.activeEvent.type === "night" && this.env?.forceNightTimer !== undefined) {
                    this.env.forceNightTimer = 0;
                }
                this.activeEvent = { type: null, timer: 0, prevFog: null };
                this.hud.showGameMessage("Событие завершено");
            }
        }

        this.randomEventTimer -= delta;
        if (this.randomEventTimer > 0 || this.activeEvent.type) return;

        const events = ["blindness", "night"];
        const event = events[Math.floor(Math.random() * events.length)];

        if (event === "blindness") {
            this.activeEvent.type = "blindness";
            this.activeEvent.timer = 26;
            if (this.env?.setFogOverride) {
                this.env.setFogOverride(0.085, 0x030307);
            } else if (this.scene?.fog) {
                this.scene.fog.density = 0.085;
            }
            this.hud.showGameMessage("Событие: Слепота");
        } else if (event === "night" && this.env?.forceNight) {
            this.activeEvent.type = "night";
            this.activeEvent.timer = 28;
            this.env.forceNight(30);
            this.hud.showGameMessage("Событие: Ночь");
        }

        this.randomEventTimer = 45 + Math.random() * 35;
    }
    update(delta) {
        if (this.input.isKeyPressed('KeyM')) {
            if (!this.pauseKeyLatch) {
                this.setPaused(!this.isPaused);
                this.pauseKeyLatch = true;
            }
        } else {
            this.pauseKeyLatch = false;
        }

        if (this.isPaused) {
            this.hud.showPause(true);
            return;
        }

        this.handleQuickCommands(delta);
        const canSelectPerk = this.gameState === 'countdown' && !this.perkLocked;
        if (this.input.isKeyPressed('KeyP') && canSelectPerk) {
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
                this.perkLocked = true;
                this.perkMenuOpen = false;
                this.hud.togglePerkPanel(false);
                this.hud.setPerkSelectionEnabled(false);
                this.hud.hideCountdown();
                this.hud.showGameMessage('\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c \u043d\u0430 \u0413\u043e\u043b\u043e\u0434\u043d\u044b\u0435 \u0438\u0433\u0440\u044b, \u0432\u044b\u0436\u0438\u0432\u0435\u0442 \u0441\u0438\u043b\u044c\u043d\u0435\u0439\u0448\u0438\u0439!');
                this.audioSynth.playBoxArrival?.(new THREE.Vector3(0, 1, 0));
                this.player.isFrozen = false;
                this.bots.forEach(bot => { bot.isFrozen = false; });
                this.spawnZombies(true, 1.6, 120, 22);
                this.spawnPoiZombieGuards(1.1);
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
                this.startZoneCycle();
                this.player.setInvulnerable(false);
                this.bots.forEach(bot => bot.setInvulnerable(false));
                this.hud.showGameMessage('\u0412\u044b\u0436\u0438\u0432\u0430\u043d\u0438\u0435 \u043d\u0430\u0447\u0430\u043b\u043e\u0441\u044c!');
                this.map.setCourtyardGateOpen(false);
                this.gateClosed = true;
                this.audioSynth.playStoneDoorClose?.(this.map.getCourtyardExitPosition());
                if (!this.poiZombieSeeded) {
                    this.spawnPoiZombieGuards(1.25);
                }
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
            this.updateZoneCycle(delta);
            this.chestRespawnTimer = Math.max(0, this.chestRespawnTimer - delta);
            if (this.chestRespawnTimer <= 0) {
                const restored = this.lootManager.refillOpenedChests?.(6) || 0;
                if (restored > 0) {
                    this.hud.showLootNotification?.(`Сундуки пополнены: ${restored}`);
                }
                this.chestRespawnTimer = 55;
            }

            if (!this.zone.isInsideZone(this.player.position)) {
                const damage = this.zone.getDamage(delta, this.player.position);
                this.player.takeDamage(damage, false, null, 0, 'zone');
            }

            const distanceFromZone = this.zone.getDistanceFromZone(this.player.position);
            if (distanceFromZone > 0) {
                this.hud.updateZoneInfo(`\u0412\u043d\u0435 \u0437\u043e\u043d\u044b! ${Math.ceil(distanceFromZone)}\u043c`, true);
            } else {
                const radius = Math.ceil(this.zone.getCurrentRadius());
                if (this.zonePhase === 'shrinking') {
                    this.hud.updateZoneInfo(`\u0417\u043e\u043d\u0430 \u0441\u0443\u0436\u0430\u0435\u0442\u0441\u044f (\u0440\u0430\u0434\u0438\u0443\u0441 ${radius}\u043c)`, true);
                } else if (this.zonePhase === 'final') {
                    this.hud.updateZoneInfo(`\u0424\u0438\u043d\u0430\u043b\u044c\u043d\u0430\u044f \u0437\u043e\u043d\u0430 (\u0440\u0430\u0434\u0438\u0443\u0441 ${radius}\u043c)`, false);
                } else {
                    this.hud.updateZoneInfo(`\u0411\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u0430: ${Math.ceil(this.zonePhaseTimer)}\u0441 (\u0440\u0430\u0434\u0438\u0443\u0441 ${radius}\u043c)`, false);
                }
            }

            const distanceOutside = this.zone.getDistanceFromZone(this.player.position);
            const fogDensity = this.scene?.fog?.density || 0;
            const nightBoost = this.env && (this.env.dayTime < 0.18 || this.env.dayTime > 0.78) ? 0.14 : 0;
            const shrinkBoost = this.zonePhase === 'shrinking' ? 0.12 : 0;
            const outsideBoost = distanceOutside > 0 ? Math.min(0.24, distanceOutside * 0.015) : 0;
            const fogBoost = Math.min(0.24, Math.max(0, fogDensity - 0.004) * 30);
            const blindnessBoost = this.activeEvent?.type === 'blindness' ? 0.55 : 0;
            this.hud.setVisionIntensity?.(0.12 + nightBoost + shrinkBoost + outsideBoost + fogBoost + blindnessBoost);
        } else {
            this.hud.setVisionIntensity?.(0);
        }

        this.physics.update(delta);

        this.player.update(delta, this.audioSynth, this.lootManager, this.entityManager, this.controls);
        this.map.update?.(delta, this.player.position);
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
                    this.nightWaveBurstDone = false;
                    this.nightWaveTimer = 3.5;
                }
                if (!this.nightWaveBurstDone) {
                    const spawned = this.spawnZombies(false, 4.8, 220, 28);
                    this.spawnPoiZombieGuards(1.6);
                    if (spawned > 0) {
                        this.hud.showGameMessage(`Ночь наступила. Заражённых прибыло: ${spawned}`);
                    }
                    this.nightWaveBurstDone = true;
                } else {
                    this.nightWaveTimer -= delta;
                    if (this.nightWaveTimer <= 0) {
                        const spawned = this.spawnZombies(false, 3.6, 240, 16);
                        this.spawnPoiZombieGuards(1.2);
                        if (spawned >= 3) {
                            this.hud.showGameMessage('Во тьме слышны новые заражённые...');
                        }
                        this.nightWaveTimer = 4 + Math.random() * 2;
                    }
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
                this.nightWaveBurstDone = false;
                this.nightWaveTimer = 0;
                if (this.gateClosed) {
                    this.map.setCourtyardGateOpen(false);
                }
            }
        }

        if (this.gameState === 'playing') {
            const isNight = this.env && (this.env.dayTime < 0.18 || this.env.dayTime > 0.78);
            const fogDensity = this.scene?.fog?.density || 0;
            const localFog = this.getLocalizedFogBoost(this.player.position);
            const maxFar = this.isMobile() ? 210 : 280;
            const fogPenalty = Math.max(0, (fogDensity - 0.004) * 9000);
            const localFogPenalty = localFog * 3800;
            const nightPenalty = isNight ? 35 : 0;
            const targetFar = this.activeEvent?.type === 'blindness'
                ? 15
                : Math.max(55, Math.min(maxFar, this.zone.getCurrentRadius() * 0.2 + 90 - fogPenalty - localFogPenalty - nightPenalty));
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

        const targetFraction = this.isMobile() ? 0.45 : (delta > 0.022 ? 0.5 : 0.75);
        const minBotsPerFrame = this.isMobile() ? 6 : 10;
        const botsPerFrame = Math.min(
            this.bots.length,
            Math.max(minBotsPerFrame, Math.ceil(this.bots.length * targetFraction))
        );
        this.botUpdateIndex = (this.botUpdateIndex || 0);

        for (let i = 0; i < botsPerFrame && i < this.bots.length; i++) {
            const botIndex = (this.botUpdateIndex + i) % this.bots.length;
            if (this.bots[botIndex].isAlive) {
                this.bots[botIndex].update(delta, this.botBrains[botIndex], this.entityManager, this.lootManager, this.audioSynth, this.physics, this.zone);

                if (this.gameState === 'playing' && !this.zone.isInsideZone(this.bots[botIndex].position)) {
                    const damage = this.zone.getDamage(delta, this.bots[botIndex].position);
                    this.bots[botIndex].takeDamage(damage, false, null, 0, 'zone');
                    const safePoint = this.getSafeZoneTarget(this.bots[botIndex].position);
                    this.bots[botIndex].target = null;
                    this.bots[botIndex].assistTarget = null;
                    this.bots[botIndex].moveTowards(safePoint, this.bots[botIndex].physics.speed * 1.35);
                    const outside = this.zone.getDistanceFromZone(this.bots[botIndex].position);
                    if (outside > 10) {
                        this.bots[botIndex].position.lerp(safePoint, 0.18);
                    }
                }
            }
        }
        this.botUpdateIndex = (this.botUpdateIndex + botsPerFrame) % this.bots.length;

        for (const zombie of this.zombies) {
            if (zombie.isAlive) {
                zombie.update(delta, this.entityManager, this.audioSynth);
            }
        }

        const aliveCountBeforeHazards = this.entityManager.update(delta, this.physics, this.audioSynth);
        if (this.gameState === 'playing') {
            this.trySupplyDrop(aliveCountBeforeHazards);
            this.updateRandomEvents(delta);
            this.updateAchievements(aliveCountBeforeHazards);
        }

        this.hud.updateHealth(this.player.health, this.player.maxHealth);
        this.hud.updateArmor(this.player.armor, this.player.maxArmor);
        this.hud.updatePlayersCount(aliveCountBeforeHazards);
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
                            entity.takeDamage(trap.damage * delta, false, null, 0, 'trap');
                        }
                    }
                }
            };
            applyTrap(this.player);
            for (const bot of this.bots) {
                applyTrap(bot);
            }
        }

        this.forceEliminateInvalidSurvivors();
        const aliveSurvivors = this.entityManager.getAliveSurvivors?.() || [];
        const aliveCount = aliveSurvivors.length;

        if (!this.player.isAlive && !this.deathHandled) {
            this.deathHandled = true;
            this.endRound('\u0418\u0433\u0440\u0430 \u043e\u043a\u043e\u043d\u0447\u0435\u043d\u0430. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 E \u0447\u0442\u043e\u0431\u044b \u043d\u0430\u0447\u0430\u0442\u044c \u0437\u0430\u043d\u043e\u0432\u043e');
        }

        if (this.roundFinished && this.input.isKeyPressed('KeyE')) {
            window.location.reload();
            return;
        }

        const inventoryItems = this.player.inventory.getItems().map(item => {
            if (!item) return null;
            return { type: item.type };
        });
        this.hud.updateInventory(inventoryItems, this.player.inventory.selectedSlot);

        if (this.gameState === 'playing' && !this.roundFinished) {
            if (aliveCount === 0) {
                this.endRound('\u0412 \u0436\u0438\u0432\u044b\u0445 \u043d\u0438\u043a\u043e\u0433\u043e \u043d\u0435 \u043e\u0441\u0442\u0430\u043b\u043e\u0441\u044c. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 E \u0447\u0442\u043e\u0431\u044b \u043d\u0430\u0447\u0430\u0442\u044c \u0437\u0430\u043d\u043e\u0432\u043e');
            } else if (aliveCount === 1 && aliveSurvivors[0] === this.player) {
                this.endRound('\u041f\u043e\u0431\u0435\u0434\u0430! \u0422\u044b \u043e\u0441\u0442\u0430\u043b\u0441\u044f \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u043c \u0432\u044b\u0436\u0438\u0432\u0448\u0438\u043c. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 E \u0447\u0442\u043e\u0431\u044b \u043d\u0430\u0447\u0430\u0442\u044c \u0437\u0430\u043d\u043e\u0432\u043e');
            }
        }

        this.env.update(delta);
        if (this.scene?.fog && this.gameState === 'playing') {
            const localFogBoost = this.getLocalizedFogBoost(this.player.position);
            if (localFogBoost > 0) {
                this.scene.fog.density = Math.min(0.12, this.scene.fog.density + localFogBoost);
            }
        }

        if (this.spawnTimer <= 0 || this.spawnTimer % 1 < 0.1) {
            this.hud.updatePlayersCount(this.entityManager.getAliveCount());
        }
    }

    getLocalizedFogBoost(position) {
        if (!position || !this.localFogZones?.length) return 0;
        let boost = 0;
        for (const zone of this.localFogZones) {
            const radius = Math.max(1, zone.radius || 0);
            const dist = Math.hypot(position.x - zone.x, position.z - zone.z);
            if (dist > radius) continue;
            const t = 1 - dist / radius;
            const local = (zone.density || 0.02) * t * t;
            if (local > boost) boost = local;
        }
        return boost;
    }

    spawnPoiZombieGuards(intensity = 1) {
        const houseSpots = this.map.getHouseSpots?.() || [];
        const hangarSpots = this.map.getHangarSpots?.() || [];
        const points = [
            ...houseSpots.map(s => ({ ...s, type: "house" })),
            ...hangarSpots.map(s => ({ ...s, type: "hangar" }))
        ];
        if (!points.length) return 0;

        const aliveNow = this.zombies.filter(z => z?.isAlive).length;
        const maxAlive = 260;
        let budget = Math.max(0, Math.min(maxAlive - aliveNow, Math.floor((houseSpots.length * 1.2 + hangarSpots.length * 4.5) * intensity)));
        if (budget <= 0) return 0;

        points.sort(() => Math.random() - 0.5);
        let spawned = 0;
        for (const point of points) {
            if (budget <= 0) break;
            const baseCount = point.type === "hangar" ? (4 + Math.floor(Math.random() * 4)) : (2 + Math.floor(Math.random() * 2));
            const pack = Math.max(1, Math.floor(baseCount * intensity));
            for (let i = 0; i < pack; i++) {
                if (budget <= 0) break;
                const rx = (Math.random() - 0.5) * (point.width || 8) * 1.25;
                const rz = (Math.random() - 0.5) * (point.depth || 8) * 1.25;
                const x = point.x + rx;
                const z = point.z + rz;
                if (!this.map.isWalkableAt?.(x, z)) continue;
                const pos = new THREE.Vector3(x, this.map.getHeightAt(x, z) + 1.8, z);
                if (pos.distanceTo(this.player.position) < 16) continue;
                const zombie = new Zombie(this.scene, this.nextZombieId++, pos);
                this.physics.addEntity(zombie);
                this.entityManager.addEntity(zombie);
                this.zombies.push(zombie);
                spawned++;
                budget--;
            }
        }
        if (spawned > 0) this.poiZombieSeeded = true;
        return spawned;
    }

    spawnZombies(reset = true, multiplier = 1, capOverride = null, forceCount = null) {
        if (reset) {
            for (const zombie of this.zombies) {
                zombie.isAlive = false;
                if (zombie.mesh?.parent) zombie.mesh.parent.remove(zombie.mesh);
                this.physics?.removeEntity?.(zombie);
                const idx = this.entityManager?.entities?.indexOf(zombie);
                if (idx >= 0) this.entityManager.entities.splice(idx, 1);
            }
            this.zombies = [];
        }

        const floorTiles = this.map.getFloorTiles?.() || [];
        if (!floorTiles.length) return 0;

        const houseSpots = this.map.getHouseSpots?.() || [];
        const hangarSpots = this.map.getHangarSpots?.() || [];
        const baseCount = Math.min(32, Math.max(10, Math.floor(floorTiles.length / 180)));
        const maxAlive = capOverride ?? (reset ? 90 : 180);
        const aliveNow = this.zombies.filter(z => z?.isAlive).length;
        let count = Math.min(
            Math.max(0, maxAlive - aliveNow),
            forceCount ?? Math.max(reset ? 8 : 4, Math.floor(baseCount * (this.modeConfig?.zombieMultiplier || 1) * multiplier))
        );
        if (count <= 0) return 0;

        const picks = [...floorTiles].sort((a, b) => {
            const nearHouseA = houseSpots.some(h => Math.hypot(a.x - h.x, a.z - h.z) < 18) ? 1 : 0;
            const nearHouseB = houseSpots.some(h => Math.hypot(b.x - h.x, b.z - h.z) < 18) ? 1 : 0;
            const nearHangarA = hangarSpots.some(h => Math.hypot(a.x - h.x, a.z - h.z) < 26) ? 1 : 0;
            const nearHangarB = hangarSpots.some(h => Math.hypot(b.x - h.x, b.z - h.z) < 26) ? 1 : 0;
            const scoreA = nearHangarA * 2 + nearHouseA;
            const scoreB = nearHangarB * 2 + nearHouseB;
            return scoreB - scoreA || (Math.random() - 0.5);
        });

        let spawned = 0;
        for (const tile of picks) {
            if (spawned >= count) break;
            const pos = new THREE.Vector3(tile.x, this.map.getHeightAt(tile.x, tile.z) + 1.8, tile.z);
            if (pos.distanceTo(this.player.position) < (reset ? 20 : 24)) continue;
            const zombie = new Zombie(this.scene, this.nextZombieId++, pos);
            this.physics.addEntity(zombie);
            this.entityManager.addEntity(zombie);
            this.zombies.push(zombie);
            spawned++;
        }
        return spawned;
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    async startGame() {
        if (this.isStarted) return;
        this.isStarted = true;
        try {
            this.hideStartScreen();
            this.hud.showPause(false);
            this.isPaused = false;
            this.partyMode = false;
            this.applyRoundMode('hybrid');
            await new Promise(resolve => requestAnimationFrame(() => resolve()));

            try {
                if (this.isMobile()) {
                    await this.enterFullscreen();
                    await this.lockOrientation();
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
            } catch (fsErr) {
                console.warn('Fullscreen/orientation fallback:', fsErr);
            }

            this.audioSynth.playMusic();
            this.audioSynth.startAmbient();
            this.yandex?.gameplayStart?.();

            this.perkMenuOpen = !this.perkLocked;
            this.hud.togglePerkPanel(this.perkMenuOpen);
            if (this.perkMenuOpen) {
                this.hud.showGameMessage('Выберите перк перед стартом матча');
            }
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
            requestAnimationFrame(() => this.hideStartScreen());
        } catch (err) {
            console.error('Failed to start game:', err);
            this.isStarted = false;
            this.showStartScreen();
            this.hud?.showGameMessage?.('Ошибка запуска. Нажмите старт снова.');
            throw err;
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const yandex = new YandexBridge();
    const game = new Game(yandex);
    yandex.init().catch((err) => {
        console.warn('Yandex init fallback:', err);
    });
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

    document.addEventListener('setAudioSettings', (event) => {
        const detail = event.detail || {};
        const settings = game.saveUserSettings({
            musicVolume: detail.musicVolume,
            sfxVolume: detail.sfxVolume
        });
        game.applyUserSettings(settings);
    });

    document.addEventListener('setLookSensitivity', (event) => {
        const value = Number(event.detail);
        if (!Number.isFinite(value)) return;
        const settings = game.saveUserSettings({ lookSensitivity: value });
        game.applyUserSettings(settings);
    });

    const bindStartButton = (button) => {
        if (!button) return;
        const handleStart = async (e) => {
            if (e?.cancelable) e.preventDefault();
            try {
                await game.startGame();
            } catch (err) {
                console.error('Start failed:', err);
            }
        };
        button.addEventListener('click', handleStart);
        button.addEventListener('touchstart', handleStart, { passive: false });
        button.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });
    };

    bindStartButton(document.getElementById('startButtonDesktop'));
    bindStartButton(document.getElementById('startButtonMobile'));
    bindStartButton(document.getElementById('startButton'));
});










