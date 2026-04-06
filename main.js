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
    if (document.body?.classList?.contains('game-started')) return;
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    setLoadingProgress(0.05);
};

THREE.DefaultLoadingManager.onProgress = function(url, loaded, total) {
    if (document.body?.classList?.contains('game-started')) return;
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
import { GAME_CONFIG, ROUND_MODES } from './core/GameBalance.js';

class Game {
    constructor(yandexBridge = null) {
        this.yandex = yandexBridge || new YandexBridge();
        this.isStarted = false;
        this.startingGame = false;
        this.mobileMode = (
            'ontouchstart' in window
            || navigator.maxTouchPoints > 0
            || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
        );
        this._tmpAudioForward = new THREE.Vector3();
        this.initializeGame();
    }

    isMobile() {
        return this.mobileMode;
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

    applyRendererSizing() {
        if (!this.renderer || !this.camera) return;
        const width = Math.max(1, window.innerWidth);
        const height = Math.max(1, window.innerHeight);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, true);
        const pixelRatio = this.isMobile()
            ? Math.min(window.devicePixelRatio || 1, 1.5)
            : Math.min(window.devicePixelRatio || 1, 1.3);
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setViewport(0, 0, width, height);
        this.renderer.setScissorTest(false);
        if (this.renderer.domElement) {
            this.renderer.domElement.style.width = '100%';
            this.renderer.domElement.style.height = '100%';
            this.renderer.domElement.style.display = 'block';
        }
    }

    onAppHidden() {
        this.input?.clearInputState?.();
        this.gameLoop?.resetDelta?.();
        this.lastVisibilityHiddenAt = performance.now();
        this.resumeGraceTimer = Math.max(this.resumeGraceTimer || 0, 0.45);
        if (this.startingGame) return;
        if (this.startTransitionUntil && performance.now() < this.startTransitionUntil) {
            return;
        }
        if (this.isStarted && !this.isPaused) {
            this.autoPausedByVisibility = true;
            this.setPaused(true);
        }
    }

    onAppVisible(reason = 'resume') {
        this.gameLoop?.resetDelta?.();
        this.applyRendererSizing();
        if (loadingOverlay && loadingOverlay.style.display !== 'none') {
            loadingOverlay.style.display = 'none';
        }
        if (this.isMobile()) {
            setTimeout(() => this.applyRendererSizing(), 120);
            setTimeout(() => this.applyRendererSizing(), 320);
        }
        this.recoverViewState(reason);
        this.resumeGraceTimer = Math.max(this.resumeGraceTimer || 0, 0.45);
        this.propVisibilityTimer = 0.2;
        this.rainUpdateAccumulator = 0;
        if (this.isMobile() && this.autoPausedByVisibility && this.isPaused && this.isStarted) {
            this.setPaused(false);
        }
        if (this.map?.updatePropVisibility && this.player?.position) {
            this.map.updatePropVisibility(this.player.position);
            this.lastPropVisibilityPos.copy(this.player.position);
        }
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
        this.scene.userData.mobileMode = isMobile;
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.2, 1400);
        this.scene.userData.camera = this.camera;

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance",
            precision: "highp",
            stencil: false,
            depth: true,
            logarithmicDepthBuffer: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = false;
        this.applyRendererSizing();
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
            ...ROUND_MODES.hybrid
        };
        this.commandState = { help: false, enemy: false, gather: false };
        this.quickCommandCooldown = 0;
        this.dropTriggeredAt = new Set();
        this.perkMenuOpen = false;
        this.perkSelectionRequired = false;
        this.perkMenuIndex = 0;
        this.perkKeyLatch = false;
        this.pauseKeyLatch = false;
        this.menuKeyLatch = { w: false, s: false, e: false };
        this.hudStatsTimer = 0;
        this.hudInventoryTimer = 0;
        this.lastInventorySignature = '';
        this.lastCountdownSecond = null;
        this.noteCooldown = 0;
        this.achievementState = {
            firstBlood: false,
            hunter: false,
            scavenger: false,
            survivor: false
        };
        this.randomEventTimer = GAME_CONFIG.events.randomTimerMin + Math.random() * GAME_CONFIG.events.randomTimerVariance;
        this.activeEvent = { type: null, timer: 0, prevFog: null };
        this.radiationRainGraceTimer = 0;
        this.radiationRainDamageActive = false;
        this.resumeGraceTimer = 0;
        this.lastVisibilityHiddenAt = 0;
        this.rainUpdateAccumulator = 0;
        this.poiWarmupTimer = 0;
        this.zombieMaintainTimer = 6;

        this.env = new Environment(this.scene);
        this.map = new MapGenerator(this.scene);
        this.physics = new Physics(this.scene, this.map);
        this.zone = new Zone(this.scene, this.map.size);
        this.zoneDuration = GAME_CONFIG.zone.durationSeconds;
        this.zoneMinRadius = Math.max(
            GAME_CONFIG.zone.minRadiusAbsolute,
            this.zone.getCurrentRadius() * GAME_CONFIG.zone.minRadiusFactor
        );
        this.zone.shrink(this.zone.getCurrentRadius());
        this.zone.shrinkSpeed = 0;
        this.traps = this.map.getTraps?.() || [];
        this.localFogZones = this.map.getFogZones?.() || [];
        this.propVisibilityTimer = 0;
        this.lastPropVisibilityPos = new THREE.Vector3(99999, 99999, 99999);
        this.radiationRainEffect = null;
        this.radiationRainActive = false;
        this.initRadiationRainEffect();

        this.entityManager = new EntityManager(this.scene);
        this.entityManager.physicsRef = this.physics;
        this.scene.userData.entityManager = this.entityManager;
        this.lootManager = new LootManager(this.scene, this.map);

        const spawnPads = this.map.getSpawnPads?.() || [];
        this.player = new Player(this.scene, this.camera, this.input);
        this.player.setHUD(this.hud);
        this.player.mapRef = this.map;
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
        this.zombieUpdateIndex = 0;
        this.botUpdateIndex = 0;
        this.botFrameCounter = 0;
        this.botHazardCursor = 0;
        this.trapBotCursor = 0;
        this.pendingZombieBursts = [];
        this.pendingPoiBursts = [];
        this.spawnBurstCooldown = 0;
        this.zombieSpawnCandidates = [];
        this.zombieSpawnCursor = 0;
        this.poiSpawnCandidates = [];
        this.poiSpawnCursor = 0;
        this.spawnBots();
        this.rebuildSpawnCaches();
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
        this.autoPausedByVisibility = false;

        for (let i = 0; i < this.bots.length; i++) {
            this.botBrains.push(new BotBrain());
        }

        this.gameState = 'countdown';
        this.countdownTime = GAME_CONFIG.round.countdownSeconds;
        this.countdownTimer = this.countdownTime;
        this.lastCountdownSecond = null;
        this.spawnTime = GAME_CONFIG.round.preFightInvulnerableSeconds;
        this.spawnTimer = this.spawnTime;
        this.botLootPhaseDuration = GAME_CONFIG.round.botLootPhaseSeconds;
        this.zonePhase = 'waiting';
        this.zonePhaseTimer = GAME_CONFIG.zone.waitStartSeconds;
        this.zonePhaseIndex = 0;
        this.zonePhaseCount = GAME_CONFIG.zone.phaseCount;
        this.zonePhaseTarget = this.zone.getCurrentRadius();
        this.chestRespawnTimer = 55;

        this.gameLoop = new GameLoop(this);
        this.applyRoundMode('hybrid');
        this.applyUserSettings(this.loadUserSettings());
        this.hud.setPerkSelectionEnabled(true);
        this.hud.setPerkPanelLock(true);
        this.hud.showGameMessage(this.isMobile()
            ? 'Выберите перк до старта матча'
            : 'Выберите перк до старта матча. Клавиша P');
        this.perkMenuOpen = true;
        this.perkSelectionRequired = true;
        this.hud.togglePerkPanel(true);

        window.addEventListener('resize', () => {
            this.applyRendererSizing();
            this.updateOrientationUI();
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                this.recoverViewState('fullscreen-exit');
                if (!this.startingGame && this.isStarted && !this.isPaused) {
                    this.setPaused(true);
                }
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.onAppHidden();
                return;
            }
            this.onAppVisible('visibility-resume');
        });
        window.addEventListener('blur', () => {
            this.onAppHidden();
        });
        window.addEventListener('focus', () => {
            this.onAppVisible('focus');
        });
        window.addEventListener('pageshow', () => {
            this.onAppVisible('pageshow');
        });
        window.addEventListener('pagehide', () => {
            this.onAppHidden();
        });

        const canvas = this.renderer.domElement;
        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            this.onAppHidden();
        }, false);
        canvas.addEventListener('webglcontextrestored', () => {
            this.onAppVisible('webglcontextrestored');
        });

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
        if (!this.isPaused) {
            this.autoPausedByVisibility = false;
        }
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
            this.gameLoop?.resetDelta?.();
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
        const botCount = this.isMobile()
            ? GAME_CONFIG.bots.mobileCount
            : GAME_CONFIG.bots.desktopCount;
        const spawnPads = this.map.getSpawnPads?.() || [];
        const spawnRadius = GAME_CONFIG.bots.spawnRadius;
        const botPads = spawnPads.length > 1 ? spawnPads.slice(1) : spawnPads;

        for (let i = 0; i < botCount; i++) {
            let spawnPos;
            if (botPads.length) {
                const padIndex = i % botPads.length;
                const cycle = Math.floor(i / botPads.length);
                const pad = botPads[padIndex];
                const padTop = pad.y;
                const angleBase = (padIndex / Math.max(1, botPads.length)) * Math.PI * 2;
                const angle = angleBase + cycle * (Math.PI / 3);
                const radius = cycle === 0 ? 0 : 0.62 + (cycle - 1) * 0.34;
                const offsetX = Math.cos(angle) * radius;
                const offsetZ = Math.sin(angle) * radius;
                spawnPos = new THREE.Vector3(pad.x + offsetX, padTop + 1.9, pad.z + offsetZ);
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
            bot.state = 'spawn';
            bot.target = null;
            bot.patrolTarget = null;
            bot.pickupLoot?.({ type: 'weapon', weaponType: 'knife' });
            this.physics.addEntity(bot);
            this.entityManager.addEntity(bot);
            this.bots.push(bot);
        }
    }

    applyRoundMode(mode) {
        this.roundMode = mode || 'hybrid';
        const fallback = ROUND_MODES.classic;
        this.modeConfig = { ...(ROUND_MODES[this.roundMode] || fallback) };

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
                sfxVolume: Math.max(0, Math.min(1, Number(saved.sfxVolume ?? 0.48))),
                lookSensitivity: Math.max(0.5, Math.min(2.4, Number(saved.lookSensitivity ?? 1)))
            };
        } catch (_) {
            return { musicVolume: 0.14, sfxVolume: 0.48, lookSensitivity: 1 };
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
            sfxVolume: Math.max(0, Math.min(1, Number(settings.sfxVolume ?? 0.48))),
            lookSensitivity: Math.max(0.5, Math.min(2.4, Number(settings.lookSensitivity ?? 1)))
        };
        this.audioSynth?.setMusicVolume?.(safe.musicVolume);
        this.audioSynth?.setSfxVolume?.(safe.sfxVolume);
        this.player?.setLookSensitivityMultiplier?.(safe.lookSensitivity);
        this.hud?.setSettingsValues?.(safe);
    }

    resetUserSettings() {
        const defaults = { musicVolume: 0.14, sfxVolume: 0.48, lookSensitivity: 1 };
        localStorage.setItem('mazearena_settings', JSON.stringify(defaults));
        this.applyUserSettings(defaults);
        this.hud?.showGameMessage?.('Настройки сброшены');
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
        this.setRadiationRainActive(false);
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

    initRadiationRainEffect() {
        const dropCount = this.isMobile() ? 72 : 120;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(dropCount * 2 * 3);
        const speeds = new Float32Array(dropCount);
        const area = this.isMobile() ? 22 : 28;
        for (let i = 0; i < dropCount; i++) {
            const x = (Math.random() - 0.5) * area;
            const z = (Math.random() - 0.5) * area;
            const y = 6 + Math.random() * 18;
            const idx = i * 6;
            positions[idx] = x;
            positions[idx + 1] = y;
            positions[idx + 2] = z;
            positions[idx + 3] = x;
            positions[idx + 4] = y - (1.8 + Math.random() * 1.2);
            positions[idx + 5] = z;
            speeds[i] = 11 + Math.random() * 10;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({
            color: 0x7fff9a,
            transparent: true,
            opacity: this.isMobile() ? 0.58 : 0.72,
            depthWrite: false
        });
        const lines = new THREE.LineSegments(geometry, material);
        lines.visible = false;
        lines.renderOrder = 28;
        lines.frustumCulled = false;
        this.scene.add(lines);
        this.radiationRainEffect = { lines, positions, speeds, area };
    }

    setRadiationRainActive(active) {
        this.radiationRainActive = !!active;
        if (active) {
            this.radiationRainGraceTimer = GAME_CONFIG.events.radiation.graceSeconds;
            this.radiationRainDamageActive = false;
        } else {
            this.radiationRainGraceTimer = 0;
            this.radiationRainDamageActive = false;
        }
        if (this.radiationRainEffect?.lines) {
            this.radiationRainEffect.lines.visible = !!active;
        }
        if (!active && this.bots?.length) {
            for (const bot of this.bots) {
                if (!bot) continue;
                bot.forceShelterActive = false;
                if (bot.state === 'hide') bot.state = 'patrol';
            }
        }
        this.hud?.setStormActive?.(!!active, active ? 'radiation' : 'storm');
        if (active) {
            this.audioSynth?.startRadiationRain?.();
        } else {
            this.audioSynth?.stopRadiationRain?.();
        }
    }

    updateRadiationRainEffect(delta) {
        if (!this.radiationRainActive || !this.radiationRainEffect?.lines || !this.player) return;
        this.rainUpdateAccumulator = (this.rainUpdateAccumulator || 0) + delta;
        const step = this.isMobile() ? (1 / 36) : (1 / 60);
        if (this.rainUpdateAccumulator < step) return;
        delta = this.rainUpdateAccumulator;
        this.rainUpdateAccumulator = 0;
        const effect = this.radiationRainEffect;
        const positions = effect.positions;
        const area = effect.area;
        const centerX = this.player.position.x;
        const centerZ = this.player.position.z;
        for (let i = 0; i < effect.speeds.length; i++) {
            const idx = i * 6;
            positions[idx + 1] -= effect.speeds[i] * delta;
            positions[idx + 4] = positions[idx + 1] - 2.2;
            if (positions[idx + 4] <= -0.5) {
                const x = centerX + (Math.random() - 0.5) * area;
                const z = centerZ + (Math.random() - 0.5) * area;
                const topY = this.map.getHeightAt(x, z) + 18 + Math.random() * 10;
                positions[idx] = x;
                positions[idx + 1] = topY;
                positions[idx + 2] = z;
                positions[idx + 3] = x;
                positions[idx + 4] = topY - (1.8 + Math.random() * 1.4);
                positions[idx + 5] = z;
                effect.speeds[i] = 11 + Math.random() * 10;
            }
        }
        effect.lines.geometry.attributes.position.needsUpdate = true;
    }

    isShelteredFromRadiation(position) {
        return this.map?.isShelteredFromRain?.(position) || false;
    }

    getNearestShelterTarget(position) {
        const houses = this.map?.getHouseSpots?.() || [];
        const hangars = this.map?.getHangarSpots?.() || [];
        const structures = [...houses.map(s => ({ ...s, type: 'house' })), ...hangars.map(s => ({ ...s, type: 'hangar' }))];
        if (!structures.length) return null;
        let best = null;
        let bestScore = Infinity;
        for (const s of structures) {
            const approach = new THREE.Vector3(
                s.x,
                this.map.getHeightAt(s.x, s.z) + 0.2,
                s.z + (s.depth || (s.type === 'hangar' ? 18 : 8)) * 0.34
            );
            const dist = position.distanceTo(approach);
            if (dist < bestScore) {
                bestScore = dist;
                best = approach;
            }
        }
        return best;
    }

    startZoneCycle() {
        this.zonePhase = 'waiting';
        this.zonePhaseTimer = GAME_CONFIG.zone.waitStartSeconds;
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
                this.zone.shrinkSpeed = Math.max(8, (currentRadius - this.zonePhaseTarget) / GAME_CONFIG.zone.shrinkPhaseSeconds);
                this.zonePhase = 'shrinking';
                this.zonePhaseTimer = GAME_CONFIG.zone.shrinkPhaseSeconds;
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
                this.zonePhaseTimer = this.zonePhaseIndex >= this.zonePhaseCount ? 9999 : GAME_CONFIG.zone.waitBetweenSeconds;
            }
        }
    }

    updateRandomEvents(delta) {
        if (this.activeEvent.type) {
            this.activeEvent.timer -= delta;
            if (this.activeEvent.type === 'radiationRain' && !this.radiationRainDamageActive) {
                this.radiationRainGraceTimer = Math.max(0, this.radiationRainGraceTimer - delta);
                if (this.radiationRainGraceTimer <= 0) {
                    this.radiationRainDamageActive = true;
                    this.hud.showGameMessage("Кислотный дождь начался!");
                }
            }
            if (this.activeEvent.timer <= 0) {
                if (this.activeEvent.type === "blindness") {
                    if (this.env?.clearFogOverride) this.env.clearFogOverride();
                }
                if (this.activeEvent.type === "night" && this.env?.forceNightTimer !== undefined) {
                    this.env.forceNightTimer = 0;
                }
                if (this.activeEvent.type === "radiationRain") {
                    this.setRadiationRainActive(false);
                }
                this.activeEvent = { type: null, timer: 0, prevFog: null };
                this.hud.showGameMessage("Событие завершено");
            }
        }

        this.randomEventTimer -= delta;
        if (this.randomEventTimer > 0 || this.activeEvent.type) return;

        const events = ["blindness", "night", "radiationRain"];
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
        } else if (event === "radiationRain") {
            this.activeEvent.type = "radiationRain";
            this.activeEvent.timer = GAME_CONFIG.events.radiation.durationSeconds;
            this.setRadiationRainActive(true);
            this.hud.showGameMessage("Событие: Радиационный дождь. Прячьтесь в домах или ангарах!");
        }

        this.randomEventTimer = GAME_CONFIG.events.nextEventMin + Math.random() * GAME_CONFIG.events.nextEventVariance;
    }

    queueZombieBurst(reset, multiplier, capOverride, count, chunk = 6) {
        this.pendingZombieBursts.push({
            reset,
            multiplier,
            capOverride,
            remaining: Math.max(0, count | 0),
            chunk: Math.max(1, chunk | 0),
            started: false
        });
    }

    queuePoiBurst(intensity, totalCount, chunk = 3) {
        this.pendingPoiBursts.push({
            intensity,
            remaining: Math.max(0, totalCount | 0),
            chunk: Math.max(1, chunk | 0)
        });
    }

    rebuildSpawnCaches() {
        const floorTiles = this.map.getFloorTiles?.() || [];
        const houseSpots = this.map.getHouseSpots?.() || [];
        const hangarSpots = this.map.getHangarSpots?.() || [];

        if (!floorTiles.length) {
            this.zombieSpawnCandidates = [];
            this.zombieSpawnCursor = 0;
        } else {
            const scored = floorTiles.map((tile) => {
                let houseBoost = 0;
                for (const h of houseSpots) {
                    const d = Math.hypot(tile.x - h.x, tile.z - h.z);
                    if (d < 18) houseBoost = Math.max(houseBoost, 1 - d / 18);
                }
                let hangarBoost = 0;
                for (const h of hangarSpots) {
                    const d = Math.hypot(tile.x - h.x, tile.z - h.z);
                    if (d < 28) hangarBoost = Math.max(hangarBoost, 1 - d / 28);
                }
                const noise = (Math.sin((tile.x + 17.3) * 0.021 + (tile.z - 9.4) * 0.027) + 1) * 0.5;
                return {
                    tile,
                    score: hangarBoost * 2.4 + houseBoost * 1.2 + noise * 0.25
                };
            });
            scored.sort((a, b) => b.score - a.score);
            this.zombieSpawnCandidates = scored.map((s) => s.tile);
            this.zombieSpawnCursor = Math.floor(Math.random() * Math.max(1, this.zombieSpawnCandidates.length));
        }

        this.poiSpawnCandidates = [
            ...houseSpots.map(s => ({ ...s, type: 'house' })),
            ...hangarSpots.map(s => ({ ...s, type: 'hangar' }))
        ];
        this.poiSpawnCursor = Math.floor(Math.random() * Math.max(1, this.poiSpawnCandidates.length));
    }

    processDeferredSpawns(delta) {
        this.spawnBurstCooldown = Math.max(0, this.spawnBurstCooldown - delta);
        if (this.spawnBurstCooldown > 0) return;
        const start = performance.now();
        let operations = 0;
        const opBudget = this.isMobile() ? 2 : 3;
        const msBudget = this.isMobile() ? 1.6 : 2.2;
        while ((this.pendingZombieBursts.length || this.pendingPoiBursts.length) && operations < opBudget) {
            if ((performance.now() - start) > msBudget) break;
            if (this.pendingZombieBursts.length) {
                const job = this.pendingZombieBursts[0];
                const batch = Math.min(job.chunk, job.remaining);
                this.spawnZombies(job.reset && !job.started, job.multiplier, job.capOverride, batch);
                job.started = true;
                job.remaining -= batch;
                if (job.remaining <= 0) this.pendingZombieBursts.shift();
                operations++;
                continue;
            }
            if (this.pendingPoiBursts.length) {
                const job = this.pendingPoiBursts[0];
                const batch = Math.min(job.chunk, job.remaining);
                this.spawnPoiZombieGuards(job.intensity, batch);
                job.remaining -= batch;
                if (job.remaining <= 0) this.pendingPoiBursts.shift();
                operations++;
                continue;
            }
        }
        this.spawnBurstCooldown = this.isMobile() ? 0.03 : 0.02;
    }

    update(delta) {
        if (this.isStarted && loadingOverlay && loadingOverlay.style.display !== 'none') {
            loadingOverlay.style.display = 'none';
        }
        if (this.resumeGraceTimer > 0) {
            this.resumeGraceTimer = Math.max(0, this.resumeGraceTimer - delta);
        }

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
        this.processDeferredSpawns(delta);
        const canSelectPerk = this.gameState === 'countdown' && !this.perkLocked;
        if (this.input.isKeyPressed('KeyP') && canSelectPerk) {
            if (!this.perkKeyLatch) {
                this.perkMenuOpen = this.perkSelectionRequired ? true : !this.perkMenuOpen;
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
        if (this.perkSelectionRequired && canSelectPerk && !this.perkMenuOpen) {
            this.perkMenuOpen = true;
            this.hud.togglePerkPanel(true);
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
            const sec = Math.max(0, Math.ceil(this.countdownTimer));
            if (sec !== this.lastCountdownSecond) {
                this.lastCountdownSecond = sec;
                if (sec > 0) {
                    this.audioSynth?.playTimerTick?.(sec <= 3 ? 1.25 : 0.9);
                }
            }

            this.player.setInvulnerable(true);
            this.bots.forEach(bot => bot.setInvulnerable(true));
            this.player.isFrozen = true;
            this.bots.forEach(bot => { bot.isFrozen = true; });

            this.hud.showCountdown(sec);

            if (this.countdownTimer <= 0) {
                if (!this.perkLocked) {
                    this.applyPerk('quickHands');
                    this.perkLocked = true;
                }
                this.gameState = 'spawn';
                this.perkLocked = true;
                this.perkSelectionRequired = false;
                this.perkMenuOpen = false;
                this.hud.setPerkPanelLock(false);
                this.hud.togglePerkPanel(false);
                this.hud.setPerkSelectionEnabled(false);
                this.hud.hideCountdown();
                this.hud.showGameMessage('\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c \u043d\u0430 \u0413\u043e\u043b\u043e\u0434\u043d\u044b\u0435 \u0438\u0433\u0440\u044b, \u0432\u044b\u0436\u0438\u0432\u0435\u0442 \u0441\u0438\u043b\u044c\u043d\u0435\u0439\u0448\u0438\u0439!');
                this.audioSynth.playBoxArrival?.(new THREE.Vector3(0, 1, 0));
                this.player.isFrozen = false;
                this.bots.forEach(bot => { bot.isFrozen = false; });
                this.queueZombieBurst(true, 1.6, 120, 22, this.isMobile() ? 4 : 6);
                this.queuePoiBurst(1.4, this.isMobile() ? 12 : 18, this.isMobile() ? 3 : 4);
            }
        } else if (this.gameState === 'spawn') {
            this.spawnTimer -= delta;
            this.player.isFrozen = false;
            this.bots.forEach(bot => { bot.isFrozen = false; });
            if (!this.spawnScatterTargets || this.spawnScatterTargets.length === 0) {
                const floor = this.map.getFloorTiles?.() || [];
                const minR = (this.map.spawnCourtyardRadius || 54) + 24;
                this.spawnScatterTargets = floor
                    .filter(t => Math.hypot(t.x, t.z) > minR)
                    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
                for (let i = this.spawnScatterTargets.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const tmp = this.spawnScatterTargets[i];
                    this.spawnScatterTargets[i] = this.spawnScatterTargets[j];
                    this.spawnScatterTargets[j] = tmp;
                }
            }
            const usedScatter = new Set();
            for (let i = 0; i < this.bots.length; i++) {
                const bot = this.bots[i];
                bot.target = null;
                bot.assistTarget = null;
                bot.allies = [];
                bot.state = 'spawn';
                if (!bot.patrolTarget) {
                    let scatter = null;
                    if (this.spawnScatterTargets?.length) {
                        for (let k = 0; k < this.spawnScatterTargets.length; k++) {
                            const idx = (i * 11 + k * 17 + Math.floor(Math.random() * 13)) % this.spawnScatterTargets.length;
                            if (!usedScatter.has(idx)) {
                                usedScatter.add(idx);
                                scatter = this.spawnScatterTargets[idx];
                                break;
                            }
                        }
                    }
                    if (scatter) {
                        const jitterX = (Math.random() - 0.5) * 8;
                        const jitterZ = (Math.random() - 0.5) * 8;
                        bot.patrolTarget = new THREE.Vector3(scatter.x + jitterX, 0, scatter.z + jitterZ);
                    } else {
                        const angle = (i / Math.max(1, this.bots.length)) * Math.PI * 2;
                        const distance = this.zone.getCurrentRadius() * 0.32 + (i % 5) * 3.5;
                        bot.patrolTarget = new THREE.Vector3(
                            Math.cos(angle) * distance,
                            0,
                            Math.sin(angle) * distance
                        );
                    }
                }
            }

            if (this.spawnTimer <= 0) {
                this.gameState = 'playing';
                this.startZoneCycle();
                this.player.setInvulnerable(false);
                this.bots.forEach(bot => bot.setInvulnerable(false));
                const noCombatUntil = performance.now() + this.botLootPhaseDuration * 1000;
                for (const bot of this.bots) {
                    bot.noCombatUntil = noCombatUntil;
                    bot.target = null;
                    bot.assistTarget = null;
                    bot.state = 'explore';
                }
                this.hud.showGameMessage('\u0412\u044b\u0436\u0438\u0432\u0430\u043d\u0438\u0435 \u043d\u0430\u0447\u0430\u043b\u043e\u0441\u044c!');
                this.map.setCourtyardGateOpen(false);
                this.gateClosed = true;
                this.audioSynth.playStoneDoorClose?.(this.map.getCourtyardExitPosition());
                this.poiWarmupTimer = 7;
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
            this.player.setInvulnerable(false);
            this.bots.forEach(bot => bot.setInvulnerable(false));
            if (!this.poiZombieSeeded && this.poiWarmupTimer > 0) {
                this.poiWarmupTimer = Math.max(0, this.poiWarmupTimer - delta);
                if (this.poiWarmupTimer <= 0) {
                    this.queuePoiBurst(1.45, this.isMobile() ? 10 : 14, this.isMobile() ? 3 : 4);
                }
            }
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
            if (this.activeEvent?.type === 'radiationRain' && this.radiationRainDamageActive && !this.isShelteredFromRadiation(this.player.position)) {
                this.player.takeDamage(GAME_CONFIG.events.radiation.playerDps * delta, false, null, 0, 'storm');
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
            const radiationBoost = this.activeEvent?.type === 'radiationRain' && this.radiationRainDamageActive && !this.isShelteredFromRadiation(this.player.position) ? 0.08 : 0;
            this.hud.setVisionIntensity?.(0.12 + nightBoost + shrinkBoost + outsideBoost + fogBoost + blindnessBoost + radiationBoost);
        } else {
            this.hud.setVisionIntensity?.(0);
        }

        this.physics.update(delta);

        this.player.update(delta, this.audioSynth, this.lootManager, this.entityManager, this.controls);
        this.map.update?.(delta, this.player.position);
        this.updateRadiationRainEffect(delta);
        this.propVisibilityTimer -= delta;
        if (this.propVisibilityTimer <= 0) {
            const movedSq = this.lastPropVisibilityPos.distanceToSquared(this.player.position);
            if (movedSq > 9 || this.propVisibilityTimer <= -0.7 || this.resumeGraceTimer > 0) {
                this.map.updatePropVisibility?.(this.player.position);
                this.lastPropVisibilityPos.copy(this.player.position);
            }
            this.propVisibilityTimer = this.isMobile() ? 0.5 : 0.35;
        }
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
                    this.queueZombieBurst(false, 5.6, 260, 34, this.isMobile() ? 6 : 8);
                    this.queuePoiBurst(2.0, this.isMobile() ? 6 : 8, this.isMobile() ? 2 : 3);
                    const spawned = 34;
                    if (spawned > 0) {
                        this.hud.showGameMessage(`Ночь наступила. Заражённых прибыло: ${spawned}`);
                    }
                    this.nightWaveBurstDone = true;
                } else {
                    this.nightWaveTimer -= delta;
                    if (this.nightWaveTimer <= 0) {
                        this.queueZombieBurst(false, 4.2, 260, 20, this.isMobile() ? 5 : 7);
                        this.queuePoiBurst(1.5, this.isMobile() ? 4 : 6, this.isMobile() ? 2 : 3);
                        const spawned = 20;
                        if (spawned >= 3) {
                            this.hud.showGameMessage('Во тьме слышны новые заражённые...');
                        }
                        this.nightWaveTimer = 3.2 + Math.random() * 1.8;
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
            this.camera.getWorldDirection(this._tmpAudioForward);
            this.audioSynth.updateListener(this.camera.position, this._tmpAudioForward);
        }

        this.botFrameCounter = (this.botFrameCounter + 1) % 8;
        const farBotCullDistSq = this.isMobile() ? (95 * 95) : (135 * 135);
        for (let botIndex = 0; botIndex < this.bots.length; botIndex++) {
            const bot = this.bots[botIndex];
            if (!bot.isAlive) continue;
            const distSq = bot.position.distanceToSquared(this.player.position);
            const isFarIdleBot = distSq > farBotCullDistSq
                && !bot.target
                && !bot.assistTarget
                && bot.state !== 'combat'
                && bot.state !== 'chase';
            if (isFarIdleBot && ((this.botFrameCounter + botIndex) % 2) !== 0) {
                if (bot.mesh) {
                    bot.mesh.position.copy(bot.position);
                    bot.mesh.position.y = bot.position.y - (bot.physics.height - 0.2);
                    if (bot.healthBar) bot.updateHealthBar(0.05);
                }
                continue;
            }
            bot.update(delta, this.botBrains[botIndex], this.entityManager, this.lootManager, this.audioSynth, this.physics, this.zone);
        }
        if (this.gameState === 'playing') {
            if (this.activeEvent?.type === 'radiationRain') {
                for (const bot of this.bots) {
                    if (!bot?.isAlive) continue;
                    bot.forceShelterActive = true;
                    if (this.isShelteredFromRadiation(bot.position)) {
                        bot.target = null;
                        bot.assistTarget = null;
                        bot.lootTarget = null;
                        bot.state = 'hide';
                        continue;
                    }
                    const shelter = this.getNearestShelterTarget(bot.position);
                    if (!shelter) continue;
                    bot.target = null;
                    bot.assistTarget = null;
                    bot.lootTarget = null;
                    bot.patrolTarget = shelter.clone();
                    bot.state = 'retreat';
                }
            }
            const hazardBatch = Math.max(
                this.isMobile() ? 10 : 16,
                Math.min(this.bots.length, Math.ceil(this.bots.length * (this.isMobile() ? 0.35 : 0.5)))
            );
            const hazardScale = this.bots.length > 0 ? (this.bots.length / hazardBatch) : 1;
            for (let i = 0; i < hazardBatch && i < this.bots.length; i++) {
                const botIndex = (this.botHazardCursor + i) % this.bots.length;
                const bot = this.bots[botIndex];
                if (!bot.isAlive) continue;
                if (!this.zone.isInsideZone(bot.position)) {
                    const damage = this.zone.getDamage(delta * hazardScale, bot.position);
                    bot.takeDamage(damage, false, null, 0, 'zone');
                    const safePoint = this.getSafeZoneTarget(bot.position);
                    bot.target = null;
                    bot.assistTarget = null;
                    const outside = this.zone.getDistanceFromZone(bot.position);
                    if (outside > 10) {
                        bot.position.lerp(safePoint, 0.18);
                    }
                }
                if (this.activeEvent?.type === 'radiationRain' && !this.isShelteredFromRadiation(bot.position)) {
                    const shelter = this.getNearestShelterTarget(bot.position);
                    if (shelter) {
                        bot.target = null;
                        bot.assistTarget = null;
                        bot.lootTarget = null;
                        bot.patrolTarget = shelter.clone();
                        bot.state = 'retreat';
                    }
                    if (this.radiationRainDamageActive) {
                        const rainDps = shelter
                            ? GAME_CONFIG.events.radiation.botDpsNearShelter
                            : GAME_CONFIG.events.radiation.botDpsFarShelter;
                        bot.takeDamage(rainDps * delta * hazardScale, false, null, 0, 'storm');
                    }
                }
            }
            if (this.bots.length > 0) {
                this.botHazardCursor = (this.botHazardCursor + hazardBatch) % this.bots.length;
            }
        }

        const zombieCount = this.zombies.length;
        const zombiesPerFrame = Math.max(
            this.isMobile() ? 10 : 16,
            Math.min(zombieCount, Math.ceil(zombieCount * (this.isMobile() ? 0.28 : 0.4)))
        );
        for (let i = 0; i < zombiesPerFrame && i < zombieCount; i++) {
            const zIndex = (this.zombieUpdateIndex + i) % zombieCount;
            const zombie = this.zombies[zIndex];
            if (zombie?.isAlive) {
                zombie.update(delta, this.entityManager, this.audioSynth);
            }
        }
        if (zombieCount > 0) {
            this.zombieUpdateIndex = (this.zombieUpdateIndex + zombiesPerFrame) % zombieCount;
        }

        if (this.gameState === 'playing') {
            this.zombieMaintainTimer = Math.max(0, this.zombieMaintainTimer - delta);
            if (this.zombieMaintainTimer <= 0) {
                const aliveZombies = this.zombies.filter(z => z?.isAlive).length;
                const minAlive = this.isMobile() ? 12 : 16;
                if (aliveZombies < minAlive) {
                    const need = minAlive - aliveZombies;
                    this.queuePoiBurst(1.25, Math.min(10, need), this.isMobile() ? 2 : 3);
                    this.queueZombieBurst(false, 1.8, 180, Math.max(0, need - 4), this.isMobile() ? 3 : 4);
                }
                this.zombieMaintainTimer = 6 + Math.random() * 3;
            }
        }

        const aliveCountBeforeHazards = this.entityManager.update(delta, this.physics, this.audioSynth);
        for (const bot of this.bots) {
            if (!bot?.isAlive) continue;
            bot.syncVisualAfterPhysics?.(delta);
        }
        if (this.gameState === 'playing') {
            this.trySupplyDrop(aliveCountBeforeHazards);
            this.updateRandomEvents(delta);
            this.updateAchievements(aliveCountBeforeHazards);
        }

        this.hudStatsTimer -= delta;
        if (this.hudStatsTimer <= 0) {
            this.hud.updateHealth(this.player.health, this.player.maxHealth);
            this.hud.updateArmor(this.player.armor, this.player.maxArmor);
            this.hud.updatePlayersCount(aliveCountBeforeHazards);
            this.hud.updateAmmo(this.player.currentWeapon || this.player.fists);
            this.hudStatsTimer = this.isMobile() ? 0.1 : 0.06;
        }
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
            const trapBatch = Math.max(
                this.isMobile() ? 10 : 16,
                Math.min(this.bots.length, Math.ceil(this.bots.length * (this.isMobile() ? 0.35 : 0.5)))
            );
            for (let i = 0; i < trapBatch && i < this.bots.length; i++) {
                const botIndex = (this.trapBotCursor + i) % this.bots.length;
                applyTrap(this.bots[botIndex]);
            }
            if (this.bots.length > 0) {
                this.trapBotCursor = (this.trapBotCursor + trapBatch) % this.bots.length;
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
        this.hudInventoryTimer -= delta;
        const inventorySignature = `${this.player.inventory.selectedSlot}|${inventoryItems.map(item => item ? item.type : '-').join(',')}`;
        if (this.hudInventoryTimer <= 0 || inventorySignature !== this.lastInventorySignature) {
            this.hud.updateInventory(inventoryItems, this.player.inventory.selectedSlot);
            this.lastInventorySignature = inventorySignature;
            this.hudInventoryTimer = this.isMobile() ? 0.14 : 0.08;
        }

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

        // players count is updated by throttled hudStatsTimer block above
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

    spawnPoiZombieGuards(intensity = 1, maxSpawn = Infinity) {
        const points = this.poiSpawnCandidates?.length ? this.poiSpawnCandidates : [
            ...(this.map.getHouseSpots?.() || []).map(s => ({ ...s, type: "house" })),
            ...(this.map.getHangarSpots?.() || []).map(s => ({ ...s, type: "hangar" }))
        ];
        if (!points.length) return 0;
        const houseSpots = points.filter(p => p.type === 'house');
        const hangarSpots = points.filter(p => p.type === 'hangar');

        const aliveNow = this.zombies.filter(z => z?.isAlive).length;
        const maxAlive = 260;
        let budget = Math.max(0, Math.min(maxAlive - aliveNow, Math.floor((houseSpots.length * 2.0 + hangarSpots.length * 10.5) * intensity)));
        budget = Math.min(budget, Math.max(0, Number.isFinite(maxSpawn) ? maxSpawn : budget));
        if (budget <= 0) return 0;

        let spawned = 0;
        const spawnOneAtPoi = (point, forceInterior = false) => {
            if (!point || budget <= 0 || spawned >= maxSpawn) return false;
            const interiorSpot = this.map.findStructureInteriorPoint?.(
                point,
                point.type,
                point.type === "hangar" ? 1.6 : 0.9,
                forceInterior ? 40 : 24
            );
            const guardSpot = interiorSpot
                || this.map.getStructureEntryPoint?.(point, point.type, this.player?.position || null)
                || this.map.findStructureGuardPoint?.(point, point.type);
            if (!guardSpot) return false;
            const jitter = interiorSpot ? (point.type === "hangar" ? 1.2 : 0.8) : (point.type === "hangar" ? 2.2 : 1.2);
            const x = guardSpot.x + (Math.random() - 0.5) * jitter;
            const z = guardSpot.z + (Math.random() - 0.5) * jitter;
            if (!this.map.isWalkableAt?.(x, z)) return false;
            const baseY = this.map.getSurfaceHeightAt?.(x, z) ?? this.map.getHeightAt(x, z);
            const pos = new THREE.Vector3(x, baseY + 1.8, z);
            if (pos.distanceTo(this.player.position) < 14) return false;
            const zombie = new Zombie(this.scene, this.nextZombieId++, pos);
            this.physics.addEntity(zombie);
            this.entityManager.addEntity(zombie);
            this.zombies.push(zombie);
            spawned++;
            budget--;
            return true;
        };

        // Guaranteed presence: hangars always (dense), houses lightly (1-2).
        for (const hangar of hangarSpots) {
            if (budget <= 0 || spawned >= maxSpawn) break;
            spawnOneAtPoi(hangar, true);
            if (budget > 0 && spawned < maxSpawn) {
                spawnOneAtPoi(hangar, true);
            }
        }
        for (let i = 0; i < houseSpots.length; i += 3) {
            if (budget <= 0 || spawned >= maxSpawn) break;
            spawnOneAtPoi(houseSpots[i], true);
        }

        let attempts = 0;
        const attemptLimit = Math.max(20, points.length * 3);
        while (budget > 0 && spawned < maxSpawn && attempts < attemptLimit) {
            const point = points[this.poiSpawnCursor % points.length];
            this.poiSpawnCursor = (this.poiSpawnCursor + 1) % points.length;
            attempts++;
            if (budget <= 0) break;
            const baseCount = point.type === "hangar"
                ? (14 + Math.floor(Math.random() * 8))
                : (1 + Math.floor(Math.random() * 2));
            const pack = Math.max(1, Math.floor(baseCount * intensity * (point.type === "hangar" ? 1.15 : 1)));
            for (let i = 0; i < pack; i++) {
                if (budget <= 0) break;
                if (spawned >= maxSpawn) break;
                spawnOneAtPoi(point, false);
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

        if (!this.zombieSpawnCandidates?.length) {
            this.rebuildSpawnCaches();
        }
        const floorTiles = this.zombieSpawnCandidates || [];
        if (!floorTiles.length) return 0;

        const baseCount = Math.min(32, Math.max(10, Math.floor(floorTiles.length / 180)));
        const maxAlive = capOverride ?? (reset ? 90 : 180);
        const aliveNow = this.zombies.filter(z => z?.isAlive).length;
        let count = Math.min(
            Math.max(0, maxAlive - aliveNow),
            forceCount ?? Math.max(reset ? 8 : 4, Math.floor(baseCount * (this.modeConfig?.zombieMultiplier || 1) * multiplier))
        );
        if (count <= 0) return 0;

        let spawned = 0;
        let attempts = 0;
        const attemptLimit = Math.max(48, floorTiles.length * 2);
        while (spawned < count && attempts < attemptLimit) {
            const tile = floorTiles[this.zombieSpawnCursor % floorTiles.length];
            this.zombieSpawnCursor = (this.zombieSpawnCursor + 1) % floorTiles.length;
            attempts++;
            if (spawned >= count) break;
            const baseY = this.map.getSurfaceHeightAt?.(tile.x, tile.z) ?? this.map.getHeightAt(tile.x, tile.z);
            const pos = new THREE.Vector3(tile.x, baseY + 1.8, tile.z);
            if (pos.distanceTo(this.player.position) < (reset ? 20 : 24)) continue;
            if (!this.map.isWalkableAt?.(tile.x, tile.z)) continue;
            const zombie = new Zombie(this.scene, this.nextZombieId++, pos);
            this.physics.addEntity(zombie);
            this.entityManager.addEntity(zombie);
            this.zombies.push(zombie);
            spawned++;
        }
        return spawned;
    }

    render() {
        this.renderFrameCount = (this.renderFrameCount || 0) + 1;
        this.renderer.render(this.scene, this.camera);
    }

    async startGame() {
        if (this.isStarted) return;
        this.isStarted = true;
        this.startingGame = true;
        this.startAttemptAt = performance.now();
        try {
            this.hideStartScreen();
            this.startTransitionUntil = performance.now() + 3500;
            this.hud.showPause(false);
            this.isPaused = false;
            this.partyMode = false;
            this.applyRoundMode('hybrid');
            await new Promise(resolve => requestAnimationFrame(() => resolve()));

            if (this.isMobile()) {
                // Important: do not block game start on fullscreen promises (some mobile browsers keep them pending).
                this.enterFullscreen().catch(() => {});
                this.lockOrientation().catch(() => {});
                this.updateOrientationUI();
                this.applyRendererSizing();
                setTimeout(() => this.applyRendererSizing(), 180);
                setTimeout(() => this.applyRendererSizing(), 420);
                this.player?.resetView?.();
                const retry = async () => {
                    if (!document.fullscreenElement) {
                        this.enterFullscreen().catch(() => {});
                        this.lockOrientation().catch(() => {});
                        this.updateOrientationUI();
                        this.applyRendererSizing();
                        setTimeout(() => this.applyRendererSizing(), 180);
                        this.player?.resetView?.();
                    }
                    window.removeEventListener('touchend', retry);
                };
                window.addEventListener('touchend', retry, { passive: false });
            } else {
                try {
                    await this.enterFullscreen();
                } catch (fsErr) {
                    console.warn('Fullscreen/orientation fallback:', fsErr);
                }
            }

            await this.audioSynth.unlock?.();
            this.audioSynth.playMusic();
            this.audioSynth.startAmbient();
            this.yandex?.gameplayStart?.();

            this.perkMenuOpen = !this.perkLocked;
            this.perkSelectionRequired = !this.perkLocked;
            this.hud.setPerkPanelLock(this.perkSelectionRequired);
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
            this.applyRendererSizing();
            this.recoverViewState('start');
            this.render();
            requestAnimationFrame(() => this.hideStartScreen());
            if (loadingOverlay && loadingOverlay.style.display !== 'none') {
                loadingOverlay.style.display = 'none';
            }
            setTimeout(() => {
                if (this.isStarted && loadingOverlay && loadingOverlay.style.display !== 'none') {
                    loadingOverlay.style.display = 'none';
                }
            }, 1200);
            this.startTransitionUntil = 0;
            this.startingGame = false;
        } catch (err) {
            console.error('Failed to start game:', err);
            this.isStarted = false;
            this.startTransitionUntil = 0;
            this.startingGame = false;
            this.showStartScreen();
            if (loadingOverlay && loadingOverlay.style.display !== 'none') {
                loadingOverlay.style.display = 'none';
            }
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
        game.perkSelectionRequired = false;
        game.hud.setPerkPanelLock(false);
        game.perkMenuOpen = false;
        game.hud.togglePerkPanel(false);
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

    document.addEventListener('resetSettings', () => {
        game.resetUserSettings();
    });

    const bindStartButton = (button) => {
        if (!button) return;
        const handleStart = async (e) => {
            if (e?.cancelable) e.preventDefault();
            if (game.startingGame || game.isStarted) return;
            try {
                await game.audioSynth?.unlock?.();
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











