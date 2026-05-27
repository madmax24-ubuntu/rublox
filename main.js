import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';

window.THREE = THREE;
THREE.Cache.enabled = true;

// Check for debug mode via URL parameter
const urlParams = new URLSearchParams(window.location.search);
const isDebugMode = urlParams.get('debug') === 'true' || window.location.hash === '#debug';

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingFill = document.getElementById('loadingFill');
const loadingText = document.getElementById('loadingText');

// Smooth animated loading system
let _loadingTarget = 0;
let _loadingCurrent = 0;
let _loadingStatus = '';
let _loadingAnimId = null;

const LOADING_STATUSES = {
    0: 'Инициализация движка...',
    0.15: 'Загрузка ресурсов...',
    0.35: 'Генерация карты...',
    0.65: 'Построение ландшафта...',
    0.80: 'Размещение объектов...',
    0.90: 'Настройка освещения...',
    0.97: 'Подготовка мира...',
    1.0: 'Готово!'
};

const setStatus = (text) => {
    if (text !== _loadingStatus) {
        _loadingStatus = text;
        if (loadingText && loadingText.parentElement) {
            const statusEl = loadingText.parentElement.querySelector('.loading-status');
            if (statusEl) statusEl.textContent = text;
        }
    }
};

const animateLoading = () => {
    if (_loadingCurrent >= _loadingTarget) {
        _loadingAnimId = null;
        return;
    }
    const speed = 0.08 + _loadingTarget * 0.05;
    _loadingCurrent += Math.min((_loadingTarget - _loadingCurrent) * speed, 0.03);

    if (loadingFill) {
        const pct = Math.max(0, Math.min(100, Math.floor(_loadingCurrent * 100)));
        loadingFill.style.width = `${pct}%`;
    }
    if (loadingText) {
        const pct = Math.max(0, Math.min(100, Math.floor(_loadingCurrent * 100)));
        const statusKey = Object.keys(LOADING_STATUSES).reverse().find(k => _loadingCurrent >= k * 0.95);
        const statusText = statusKey !== undefined ? LOADING_STATUSES[statusKey] : '';
        loadingText.textContent = `${pct}% ${statusText}`;
    }

    if (_loadingCurrent < _loadingTarget) {
        _loadingAnimId = requestAnimationFrame(animateLoading);
    } else {
        _loadingAnimId = null;
    }
};

const setLoadingProgress = (ratio) => {
    _loadingTarget = Math.max(0, Math.min(1, ratio));
    if (_loadingAnimId) return; // animation running
    _loadingAnimId = requestAnimationFrame(animateLoading);
};

const smoothSetProgress = (increment, status) => {
    _loadingTarget = Math.min(1, _loadingTarget + increment);
    if (status) setStatus(status);
    if (!_loadingAnimId) {
        _loadingAnimId = requestAnimationFrame(animateLoading);
    }
};

// Insert status text into loading overlay
(() => {
    if (loadingOverlay && loadingText) {
        const statusEl = document.createElement('div');
        statusEl.className = 'loading-status';
        statusEl.style.cssText = 'margin-top:6px;font-size:12px;opacity:0.6;min-height:16px;';
        loadingText.parentElement.appendChild(statusEl);
    }
})();

let gameHasStarted = false;

function hideLoadingOverlay() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

THREE.DefaultLoadingManager.onStart = function () {
    if (gameHasStarted || document.body?.classList?.contains('game-started')) {
        return;
    }
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    setLoadingProgress(0.05);
};

THREE.DefaultLoadingManager.onProgress = function (url, loaded, total) {
    if (gameHasStarted || document.body?.classList?.contains('game-started')) return;
    if (total > 0) {
        smoothSetProgress(loaded / total * 0.05);
    }
};

// Loading overlay stays visible until explicitly hidden by startGame()
THREE.DefaultLoadingManager.onLoad = function () {
    if (gameHasStarted || document.body?.classList?.contains('game-started')) return;
    smoothSetProgress(0.1, 'Ресурсы загружены');
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
import { ExplosiveBarrel } from './entities/ExplosiveBarrel.js';
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
        this.initialized = false;
        this._testMode = typeof window.setTestMode === 'function' && window.setTestMode() === true;
        if (!this._testMode && typeof localStorage !== 'undefined') {
            this._testMode = localStorage.getItem('testMode') === 'true';
        }
        this.mobileMode = (
            'ontouchstart' in window
            || navigator.maxTouchPoints > 0
            || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
        );
        this._tmpAudioForward = new THREE.Vector3();
        // Минимальная инициализация - только базовые поля
        // Полная инициализация будет в initAsync()
    }

    async initAsync() {
        if (this.initialized) return;
        try {
            await this.initializeGame();
        } catch (err) {
            console.error('[Game] initAsync error:', err);
            console.error(err.stack);
        }
        this.initialized = true;
    }

    isMobile() {
        return this.mobileMode;
    }

    async enterFullscreen() {
        const root = document.getElementById('gameRoot') || document.documentElement;
        if (document.fullscreenElement === root || document.fullscreenElement === this.renderer?.domElement) return true;
        if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false;
        try {
            if (root.requestFullscreen) {
                await root.requestFullscreen();
            } else if (root.webkitRequestFullscreen) {
                await root.webkitRequestFullscreen();
            } else if (root.msRequestFullscreen) {
                await root.msRequestFullscreen();
            } else if (this.renderer?.domElement?.requestFullscreen) {
                await this.renderer.domElement.requestFullscreen();
            }
            return true;
        } catch (err) {
            return false;
        }
    }

    async lockOrientation() {
        if (!screen.orientation || !screen.orientation.lock) return;
        try {
            await screen.orientation.lock('landscape');
        } catch (err) {
            return;
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
        this.syncCameraToPlayer();
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

    applyCameraRescuePose() {
        if (!this.camera) return;
        this.camera.near = 0.1;
        this.camera.far = 5000;
        this.camera.up.set(0, 1, 0);
        this.camera.updateProjectionMatrix();
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

    async initializeGame() {
        this.showStartScreen();
        if (!this.isMobile()) document.body.style.cursor = 'auto';
        const isMobile = this.isMobile();
        console.log('[Game] Starting initializeGame...');

        // Этап 1: Базовая инициализация Three.js
        this.scene = new THREE.Scene();
        this.scene.userData.mobileMode = isMobile;
        this.scene.fog = new THREE.FogExp2(0x8899aa, 0.006);
        this.scene.background = new THREE.Color(0x8899aa);
        this.scene.environment = null;
        
        console.log('🔧 Creating camera...');
        try {
            const camOptions = { fov: 75, aspect: window.innerWidth / window.innerHeight, near: 0.1, far: 5000 };
            console.log('Camera options:', JSON.stringify(camOptions));
            
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
            console.log('✅ Camera created at position:', this.camera.position?.x, this.camera.position?.y, this.camera.position?.z);
        } catch(err) {
            console.error('❌ Failed to create camera:', err.message);
            throw err;
        }
        this.scene.userData.camera = this.camera;
        this.camera.layers.enable(0);
        this.camera.layers.disable(1);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance",
            precision: "highp",
            stencil: false,
            depth: true,
            preserveDrawingBuffer: true,
            logarithmicDepthBuffer: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.applyRendererSizing();
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        if (!this.scene.userData.globalAmbientLight) {
            const ambient = new THREE.AmbientLight(0xffffff, 2.0);
            this.scene.add(ambient);
            this.scene.userData.globalAmbientLight = ambient;
            const hemi = new THREE.HemisphereLight(0x87ceeb, 0x2d4a1d, 2.0);
            this.scene.add(hemi);
            this.scene.userData.hemiLight = hemi;
        }
        if (!this.scene.userData.globalSunLight) {
            const sun = new THREE.DirectionalLight(0xfff4e0, 3.0);
            sun.position.set(80, 120, 60);
            sun.castShadow = true;
            sun.shadow.mapSize.width = 2048;
            sun.shadow.mapSize.height = 2048;
            sun.shadow.camera.near = 10;
            sun.shadow.camera.far = 400;
            sun.shadow.camera.left = -150;
            sun.shadow.camera.right = 150;
            sun.shadow.camera.top = 150;
            sun.shadow.camera.bottom = -150;
            sun.shadow.bias = -0.001;
            this.scene.add(sun);
            this.scene.userData.globalSunLight = sun;
        }

        const gameRoot = document.getElementById('gameRoot');
        if (gameRoot) {
            gameRoot.appendChild(this.renderer.domElement);
        } else {
            document.body.appendChild(this.renderer.domElement);
        }

        this.applyCameraRescuePose();
        this.scene.add(this.camera);
        console.log('[Game] Stage 1 done (Three.js setup)');

        // Этап 2: Системные компоненты
                this.input = new Input();
        console.log('[Game] Input created');
        this.audioSynth = new AudioSynth();
        console.log('[Game] AudioSynth created');
        this.hud = new HUD();
        console.log('[Game] HUD created');
        
        // Инициализация переменных состояния
        this.roundMode = 'hybrid';
        this.perk = 'none';
        this.partyMode = false;
        this.perkLocked = false;
        this.modeConfig = { ...ROUND_MODES.hybrid };
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
        this.pauseInputLockUntil = 0;
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
        this.weatherSyncTimer = 0;
        this.lastWeatherType = 'clear';
        this.biomeAudioSyncTimer = 0;
        this.lastBiomeAudioKey = '';
        this.poiWarmupTimer = 0;
        this.zombieMaintainTimer = 3.6;

        // Этап 3: Environment
                console.log('[Game] Creating Environment...');
                this.env = new Environment(this.scene);
        this.env.enableWeather = true;
        this.audioSynth?.setWeatherState?.('clear');
        console.log('[Game] Environment done');
        
        // Yield чтобы браузер успел обработать события
        console.log('[Game] Yielding 100ms before map...');
        await new Promise(r => setTimeout(r, 100));
        console.log('[Game] Yield done, creating MapGenerator...');

        // Этап 4: Генерация карты (самый долгий этап)
                this.map = new MapGenerator(this.scene);
        console.log('[Game] MapGenerator instance created');
        this.map.onProgress = (ratio, status) => {
            smoothSetProgress(ratio * 0.5, status);
        };
        this.map.startGeneration();
        console.log('[Game] waiting for map ready...');
        await this.map.ready;
        console.log('[Game] map ready!');

        // Performance: setup LOD and frustum culling
        console.log('[Game] setupLOD:', this.map.setupLOD?.toString().substring(0, 20));
        this.map.setupLOD?.(this.isMobile());
        this.map.enableOptimizedCulling?.();
        console.log('[Game] after setupLOD/enhancedCulling');
        
        // Камера для тестирования карты (вид сверху)
        if (this.camera) {
            const isTestMode = this._testMode || (typeof localStorage !== 'undefined' && localStorage.getItem('testMode') === 'true');
            if (isTestMode) {
                this.camera.position.set(0, 200, 0.01);
                this.camera.lookAt(0, -50, 0);
                this.camera.fov = 90;
                this.camera.updateProjectionMatrix();
            } else {
                this.camera.position.set(0, 500, 0);
                this.camera.lookAt(0, 0, 0);
                this.camera.fov = 60;
                this.camera.updateProjectionMatrix();
            }
        }
        
        // Создаём остальные объекты, которые зависят от карты
        console.log('[Game] creating Physics...');
        this.physics = new Physics(this.scene, this.map);
        console.log('[Game] Physics created');
        console.log('[Game] creating Zone...');
        this.zone = new Zone(this.scene, this.map.size);
        console.log('[Game] Zone created');
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
        this.weatherRainEffect = null;
        this.weatherRainActive = false;
        this.initRadiationRainEffect();
        this.initWeatherRainEffect();

        this.entityManager = new EntityManager(this.scene);
        this.entityManager.physicsRef = this.physics;
        this.scene.userData.entityManager = this.entityManager;
        this.lootManager = new LootManager(this.scene, this.map);
        this.lootManager.generateChests?.();

        const spawnPads = this.map.getSpawnPads?.() || [];
        this.player = new Player(this.scene, this.camera, this.input);
        this.player.setHUD(this.hud);
        this.player.mapRef = this.map;
        if (!this.player.parent) this.scene.add(this.player);
        if (spawnPads.length) {
            const pad = spawnPads[0];
            const groundY = this.map?.getHeightAt?.(pad.x, pad.z) ?? 0.3;
            const surfaceY = Math.max(1.54 + Math.max(0, groundY), 1.54);
            this.player.position.set(pad.x, surfaceY + this.player.physics.height, pad.z);
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
        this.environmentEntities = [];
        this.environmentUpdateIndex = 0;
        this.zombieUpdateIndex = 0;
        this.botUpdateIndex = 0;
        this.botFrameCounter = 0;
        this.botHazardCursor = 0;
        this.pendingZombieBursts = [];
        this.pendingPoiBursts = [];
        this.spawnBurstCooldown = 0;
        this.zombieSpawnCandidates = [];
        this.zombieSpawnCursor = 0;
        this.poiSpawnCandidates = [];
        this.poiSpawnCursor = 0;
        this.spawnBots();
        this.rebuildSpawnCaches();
        this.spawnEnvironmentEntities();
        this.gateClosed = false;
        this.nightNotified = false;
        this.nightWaveTimer = 0;
        this.nightWaveBurstDone = false;
        this.nextZombieId = 1000;
        this.returnNoticeShown = false;
        this.roundFinished = false;
        this.roundEvalDelay = 0;
        this.postStartShieldTimer = 0;
        this.deathHandled = false;
        this.scoreboardShown = false;
        this.oneWayGates = this.map.getOneWayGates?.() || [];
        this.minimapTimer = 0;
        this.noBugCheckTimer = 0;
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
        this.spawnTime = 10;
        this.spawnTimer = this.spawnTime;
        
        // Test mode - skip countdown/spawn, hide UI, keep camera high
        const isTestMode = this._testMode || (typeof localStorage !== 'undefined' && localStorage.getItem('testMode') === 'true');
        if (isTestMode) {
            this.gameState = 'playing';
            this.countdownTimer = 0;
            this.spawnTimer = 0;
            this.perkLocked = true;
            this.perkSelectionRequired = false;
            this.hud?.togglePerkPanel(false);
            this.hud?.setPerkSelectionEnabled(false);
            setTimeout(() => {
                if (document.getElementById('perkPanel')) document.getElementById('perkPanel').style.display = 'none';
                if (document.getElementById('perkBackdrop')) document.getElementById('perkBackdrop').style.display = 'none';
                if (document.getElementById('hud')) document.getElementById('hud').style.display = 'none';
            }, 100);
        }
        this.botLootPhaseDuration = GAME_CONFIG.round.botLootPhaseSeconds;
        this.zonePhase = 'waiting';
        this.zonePhaseTimer = GAME_CONFIG.zone.waitStartSeconds;
        this.zonePhaseIndex = 0;
        this.zonePhaseCount = GAME_CONFIG.zone.phaseCount;
        this.zonePhaseTarget = this.zone.getCurrentRadius();
        this.chestRespawnTimer = 55;

        // Fog zone phase tracking
        this.fogPhaseTimer = 0;
        this.fogPhaseEnabled = false;
        this.lastRadiationLevel = null;
        this.zoneDamageTickTimer = 0;

        this.gameLoop = new GameLoop(this);
        this.applyRoundMode('hybrid');
        this.applyUserSettings(this.loadUserSettings());
        if (!this._testMode) {
            this.hud.setPerkSelectionEnabled(true);
            this.hud.setPerkPanelLock(true);
            this.hud.showGameMessage(this.isMobile()
                ? 'Выберите перк до старта матча'
                : 'Выберите перк до старта матча. Клавиша P');
            this.perkMenuOpen = true;
            this.perkSelectionRequired = true;
            this.hud.togglePerkPanel(true);
        }

        window.addEventListener('resize', () => {
            this.applyRendererSizing();
            this.updateOrientationUI();
        });

        document.addEventListener('fullscreenchange', () => {
            this.syncCameraToPlayer();
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
        this.setupPointerLock();
        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            this.onAppHidden();
        }, false);
        canvas.addEventListener('webglcontextrestored', () => {
            this.onAppVisible('webglcontextrestored');
        });

        document.addEventListener('togglePause', () => {
            if (!this.isStarted) return;
            if (performance.now() < (this.pauseInputLockUntil || 0)) return;
            this.setPaused(!this.isPaused);
        });
        document.addEventListener('rebindKey', (e) => {
            if (!e?.detail) return;
            this.input.setKeyRemap(e.detail.action, e.detail.code);
        });

        window.addEventListener('keydown', (e) => {
            if (this.perkMenuOpen) {
                const code = e.code;
                const key = e.key.toLowerCase();
                if (code === 'KeyE' || code === 'Enter' || key === 'e' || key === 'у') {
                    if (this.hud && this.hud.perkButtons) {
                        const idx = this.hud.getPerkMenuSelection();
                        const btn = this.hud.perkButtons[idx];
                        if (btn) {
                            btn.click();
                        }
                    }
                }
            }
        });
    }

    applyPerk(perk) {
        if (!this.player) return;
        this.player.perk = perk;
        if (perk === 'healthBoost') {
            this.player.maxHealth = 150;
            this.player.health = 150;
        } else if (perk === 'tank') {
            this.player.isInvulnerable = true;
            setTimeout(() => { if (this.player) this.player.isInvulnerable = false; }, 5000);
        }
        this.hud?.showGameMessage?.(`Активирован перк: ${perk}`);
    }

    setPaused(value) {
        if (this.isPaused === value) return;
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
            if (this.isPaused && document.pointerLockElement) {
                document.exitPointerLock?.();
            }
            document.body.style.cursor = this.isPaused ? 'auto' : 'none';
            if (this.renderer?.domElement) {
                this.renderer.domElement.style.cursor = this.isPaused ? 'auto' : 'none';
            }
        }
        this.syncCameraToPlayer();
        if (!this.isPaused) {
            this.gameLoop?.resetDelta?.();
            setTimeout(() => this.syncCameraToPlayer(), 40);
        }
    }

    updateDesktopCursorMode() {
        if (this.isMobile()) return;
        const uiActive = this.isPaused || this.perkMenuOpen || this.perkSelectionRequired || !this.isStarted;
        const cursor = uiActive ? 'auto' : 'none';
        document.body.style.cursor = cursor;
        if (this.renderer?.domElement) {
            this.renderer.domElement.style.cursor = cursor;
        }
        if (uiActive && document.pointerLockElement) {
            document.exitPointerLock?.();
        }
    }

    tryEnterGameplayPointerLock() {
        if (this.isMobile() || !this.isStarted || this.isPaused || this.perkMenuOpen || this.perkSelectionRequired) return;
        this.enterFullscreen().catch(() => { });
        this.updateDesktopCursorMode();
        setTimeout(() => {
            if (this.isMobile() || !this.isStarted || this.isPaused || this.perkMenuOpen || this.perkSelectionRequired) return;
            this.renderer?.domElement?.focus?.();
            this.renderer?.domElement?.requestPointerLock?.();
        }, 30);
    }

    setupPointerLock() {
        if (this.isMobile() || !this.renderer?.domElement) return;
        const canvas = this.renderer.domElement;
        const lock = () => {
            if (!this.isStarted || this.isPaused || this.perkMenuOpen || this.perkSelectionRequired) return;
            if (document.pointerLockElement === canvas) return;
            canvas.requestPointerLock?.();
        };
        canvas.addEventListener('click', lock);
        document.addEventListener('pointerlockchange', () => {
            const locked = document.pointerLockElement === canvas;
            if (!locked && this.isStarted && !this.isPaused) {
                document.body.style.cursor = 'none';
            }
        });
    }

    syncCameraToPlayer() {
        const isTestMode = this._testMode || (typeof localStorage !== 'undefined' && localStorage.getItem('testMode') === 'true');
        if (isTestMode) return;
        if (!this.player || !this.camera) return;
        if (!this.player.parent && this.scene) this.scene.add(this.player);
        if (this.player.pitch && this.camera.parent !== this.player.pitch) {
            this.player.pitch.add(this.camera);
            this.camera.position.set(0, 0, 0);
            this.camera.rotation.set(0, 0, 0);
        }
    }

    getSafePlayerSpawn() {
        const spawnPads = this.map?.getSpawnPads?.() || [];
        const pad = spawnPads[0];
        if (pad && Number.isFinite(pad.x) && Number.isFinite(pad.y) && Number.isFinite(pad.z)) {
            const y = this.map?.getHeightAt?.(pad.x, pad.z) ?? pad.y;
            return new THREE.Vector3(pad.x, (Number.isFinite(y) ? y : pad.y) + this.player.physics.height, pad.z);
        }
        const center = this.map?.getSpawnWorld?.() || { x: 0, z: 0 };
        const y = this.map?.getHeightAt?.(center.x, center.z) ?? 0.4;
        return new THREE.Vector3(center.x, (Number.isFinite(y) ? y : 0.4) + this.player.physics.height, center.z);
    }

    resetInvalidPlayerState() {
        if (!this.player?.position) return;
        const p = this.player.position;
        const invalidPos = !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) || Math.abs(p.x) > 5000 || Math.abs(p.z) > 5000 || p.y < -120 || p.y > 1200;
        if (!invalidPos) return;
        const safe = this.getSafePlayerSpawn();
        this.player.position.copy(safe);
        this.player.physics?.velocity?.set?.(0, 0, 0);
        this.player.physics.onGround = true;
        this.syncCameraToPlayer();
    }

    ensureSceneRenderable() {
        if (!this.scene) return 0;
        
        const mapGroup = this.map?.mapObjectsCollection;
        if (mapGroup) {
            mapGroup.visible = true;
            if (!mapGroup.parent) this.scene.add(mapGroup);
            for (const child of mapGroup.children || []) {
                child.visible = true;
                child.layers?.enable?.(0);
                child.layers?.disable?.(1);
                child.frustumCulled = false;
            }
        }
        let total = 0;
        let renderables = 0;
        const biomeCount = Object.create(null);
        this.scene.traverse((obj) => {
            if (obj?.userData?.mapGenerated) {
                obj.visible = true;
                obj.layers?.enable?.(0);
                obj.layers?.disable?.(1);
                obj.frustumCulled = false;
                const biomeId = obj.userData?.biomeId || obj.userData?.biome || obj.userData?.realm;
                if (biomeId) biomeCount[biomeId] = (biomeCount[biomeId] || 0) + 1;
                if (obj.material) {
                    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                    for (let i = 0; i < mats.length; i++) {
                        const m = mats[i];
                        if (!m) continue;
                        m.transparent = false;
                        m.opacity = 1;
                    }
                }
                if (obj.isInstancedMesh && obj.geometry) {
                    try { obj.geometry.computeBoundingSphere?.(); } catch (_) { }
                }
                if (obj.isMesh || obj.isInstancedMesh || obj.isLine || obj.isPoints) renderables++;
                total++;
            }
        });
        console.log(`DEBUG: Total map objects in scene: ${total}; renderables: ${renderables}`);
        Object.keys(biomeCount).forEach((k) => console.log(`Biome Spawned: ${k} Count: ${biomeCount[k]}`));
        return total;
    }

    spawnBots() {
        const totalParticipants = 100;
        const botCount = Math.max(0, totalParticipants - 1);
        const center = this.map?.getSpawnWorld?.() || { x: 0, z: 0 };
        const plazaRadius = 60;
        const minDistance = 8.2;
        const slots = [];
        const spawnPads = this.map?.getSpawnPads?.() || [];

        // Use Pads First (Skip checks as pads are guaranteed safe)
        const surfaceY = Math.max(1.54, 1.54 + (this.map?.getHeightAt?.(center.x, center.z) ?? 0.3));
        const padPositions = spawnPads.map(p => ({ x: p.x, y: surfaceY, z: p.z }));
        for (let i = 0; i < padPositions.length && slots.length < botCount; i++) {
            slots.push(padPositions[i]);
        }

        const canUsePoint = (x, z) => {
            if (!this.map?.isWalkableAt?.(x, z)) return false;
            return !slots.some(s => Math.hypot(s.x - x, s.z - z) < minDistance);
        };
        const tryAddSlot = (x, z) => {
            if (!canUsePoint(x, z)) return false;
            const y0 = this.map?.getHeightAt?.(x, z) ?? 1.5;
            slots.push({ x, y: y0 + 1.9, z });
            return true;
        };

        const ringStep = 10;
        for (let ring = 0; ring < 10 && slots.length < botCount; ring++) {
            const radius = Math.min(plazaRadius - 2.5, 10 + ring * ringStep);
            const circumference = Math.max(12, Math.PI * 2 * radius);
            const count = Math.max(10, Math.floor(circumference / minDistance));
            const phase = Math.random() * Math.PI * 2;
            for (let i = 0; i < count && slots.length < botCount; i++) {
                const angle = phase + (i / count) * Math.PI * 2;
                tryAddSlot(center.x + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius);
            }
        }
        let attempts = 0;
        while (slots.length < botCount && attempts++ < 12000) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 8 + Math.random() * (plazaRadius - 10);
            const x = center.x + Math.cos(angle) * radius;
            const z = center.z + Math.sin(angle) * radius;
            tryAddSlot(x, z);
        }

        for (let i = 0; i < botCount; i++) {
            const s = slots[i] || slots[slots.length - 1] || { x: center.x, y: surfaceY, z: center.z };
            const spawnPos = new THREE.Vector3(s.x, s.y, s.z);

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

        this.hud?.setRoundMode?.(this.roundMode === 'hybrid'
            ? 'Hybrid'
            : this.roundMode === 'nightmare'
                ? 'Nightmare'
                : this.roundMode === 'stealth'
                    ? 'Stealth'
                    : 'Classic');

        this.lootManager?.setLootDensity?.(this.modeConfig.lootDensity);
        if (this.player) {
            this.player.footstepVolume = this.modeConfig.footstepVolume;
        }
        if (this.scene?.fog) {
            this.scene.fog.density = this.modeConfig.fogDensity;
        }
        if (this.botBrains) {
            for (const brain of this.botBrains) {
                brain.visionMultiplier = this.modeConfig.botVision;
            }
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

    initWeatherRainEffect() {
        const dropCount = this.isMobile() ? 64 : 110;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(dropCount * 2 * 3);
        const speeds = new Float32Array(dropCount);
        const area = this.isMobile() ? 20 : 30;
        for (let i = 0; i < dropCount; i++) {
            const x = (Math.random() - 0.5) * area;
            const z = (Math.random() - 0.5) * area;
            const y = 7 + Math.random() * 16;
            const idx = i * 6;
            positions[idx] = x;
            positions[idx + 1] = y;
            positions[idx + 2] = z;
            positions[idx + 3] = x;
            positions[idx + 4] = y - (1.6 + Math.random() * 1.2);
            positions[idx + 5] = z;
            speeds[i] = 10 + Math.random() * 7;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({ color: 0x7da7cc, transparent: true, opacity: this.isMobile() ? 0.42 : 0.55, depthWrite: false });
        const lines = new THREE.LineSegments(geometry, material);
        lines.visible = false;
        lines.renderOrder = 18;
        lines.frustumCulled = false;
        this.scene.add(lines);
        this.weatherRainEffect = { lines, positions, speeds, area };
    }

    setWeatherRainActive(active) {
        this.weatherRainActive = !!active;
        if (this.weatherRainEffect?.lines) {
            this.weatherRainEffect.lines.visible = this.weatherRainActive;
            if (this.weatherRainActive) {
                if (this.weatherRainEffect.lines.parent !== this.camera) {
                    this.camera.add(this.weatherRainEffect.lines);
                }
                this.weatherRainEffect.lines.position.set(0, 0, 0);
            } else if (this.weatherRainEffect.lines.parent !== this.scene) {
                this.scene.add(this.weatherRainEffect.lines);
            }
        }
        this.map?.setWetTerrain?.(this.weatherRainActive);
        this.map?.setRainPuddles?.(this.weatherRainActive, this.player?.position || this.map?.getSpawnWorld?.());
    }

    updateWeatherRainEffect(delta) {
        if (!this.weatherRainActive || !this.weatherRainEffect?.lines || !this.player) return;
        const effect = this.weatherRainEffect;
        const positions = effect.positions;
        const area = effect.area;
        for (let i = 0; i < effect.speeds.length; i++) {
            const idx = i * 6;
            positions[idx + 1] -= effect.speeds[i] * delta;
            positions[idx + 4] = positions[idx + 1] - 1.95;
            if (positions[idx + 4] <= -0.5) {
                const x = (Math.random() - 0.5) * area;
                const z = (Math.random() - 0.5) * area;
                const topY = 8 + Math.random() * 9;
                positions[idx] = x;
                positions[idx + 1] = topY;
                positions[idx + 2] = z;
                positions[idx + 3] = x;
                positions[idx + 4] = topY - (1.5 + Math.random() * 1.4);
                positions[idx + 5] = z;
                effect.speeds[i] = 10 + Math.random() * 7;
            }
        }
        effect.lines.geometry.attributes.position.needsUpdate = true;
    }

    enforceNoBugPolicy(delta) {
        this.noBugCheckTimer = Math.max(0, this.noBugCheckTimer - delta);
        if (this.noBugCheckTimer > 0) return;
        this.noBugCheckTimer = this.isMobile() ? 0.45 : 0.3;

        if (this.isStarted) {
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.style.display !== 'none') {
                this.hideStartScreen();
            }
        }

        const mapSize = this.map?.size || 512;
        const maxAbs = mapSize * 0.78;
        const sanitize = (entity) => {
            if (!entity?.position) return;
            const p = entity.position;
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
                const pads = this.map.getSpawnPads?.() || [];
                const base = pads[0] || new THREE.Vector3(0, 1.6, 0);
                p.set(base.x, base.y + (entity.physics?.height || 1.8), base.z);
                entity.physics?.velocity?.set?.(0, 0, 0);
                return;
            }
            p.x = Math.max(-maxAbs, Math.min(maxAbs, p.x));
            p.z = Math.max(-maxAbs, Math.min(maxAbs, p.z));
            const surface = this.map?.getSurfaceHeightAt?.(p.x, p.z) ?? (this.map?.getHeightAt?.(p.x, p.z) ?? 0.4);
            const minY = surface + (entity.physics?.height || 1.8) - 2.5;
            const maxY = surface + 140;
            if (p.y < minY || p.y > maxY) {
                p.y = surface + (entity.physics?.height || 1.8);
                entity.physics?.velocity?.set?.(0, 0, 0);
            }
        };

        sanitize(this.player);
        for (let i = 0; i < this.bots.length; i++) sanitize(this.bots[i]);
        for (let i = 0; i < this.zombies.length; i++) sanitize(this.zombies[i]);

        if (this.zone) {
            if (!this.zone.zoneMesh || !this.zone.ringMesh) {
                this.zone.createZone?.();
            }
            this.zone.syncVisuals?.();
        }
    }

    spawnEnvironmentEntities() {
        if (!this.map?.getExplosiveBarrelSpots) return;
        if (this.environmentEntities?.length) {
            for (const ent of this.environmentEntities) {
                ent?.dispose?.();
            }
        }
        this.environmentEntities = [];
        const spots = this.map.getExplosiveBarrelSpots() || [];
        const maxCount = this.isMobile() ? 26 : 44;
        for (let i = 0; i < spots.length && i < maxCount; i++) {
            const s = spots[i];
            const barrel = new ExplosiveBarrel(
                this.scene,
                new THREE.Vector3(s.x, s.y, s.z),
                {
                    id: `barrel-${i}`,
                    explosionRadius: 10,
                    explosionDamage: 56,
                    knockback: 11
                }
            );
            this.environmentEntities.push(barrel);
            this.entityManager.addEntity(barrel);
            this.physics.addEntity(barrel);
        }
        this.environmentUpdateIndex = 0;
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
        const fullRadius = Math.min(this.map?.halfSize || this.zone.getCurrentRadius(), 300);
        this.zone.setCurrentRadius(fullRadius);
        this.zone.shrink(fullRadius);
        this.zone.shrinkSpeed = GAME_CONFIG.zone.shrinkPhaseSeconds > 0 ? fullRadius / GAME_CONFIG.zone.shrinkPhaseSeconds : 0;
        if (this.zone.zoneMesh) this.zone.zoneMesh.visible = true;
        if (this.zone.ringMesh) this.zone.ringMesh.visible = true;

        // Enable fog zones
        this.fogPhaseEnabled = true;
        this.fogPhaseTimer = 0;
        this.lastRadiationLevel = null;
        this.zoneDamageTickTimer = 0;
        if (this.map?.activateFogPhase) {
            this.map.activateFogPhase(0);
        }
    }

    updateZoneCycle(delta) {
        if (this.zonePhase === 'waiting') {
            this.zonePhaseTimer -= delta;
            if (this.zonePhaseTimer <= 0) {
                // Start first fog phase
                this.zonePhase = 'active';
                this.zonePhaseIndex = 0;
                this.fogPhaseTimer = 0;
                this.zonePhaseTarget = this.map?.getActiveSafeRadius?.() || this.zone.getCurrentRadius();
                if (this.zonePhaseTarget < this.zone.getCurrentRadius()) {
                    this.zone.shrink(this.zonePhaseTarget);
                }
            }
            return;
        }

        if (this.zonePhase !== 'active') return;

        // Track fog phase timer
        if (this.fogPhaseEnabled && this.map?.activateFogPhase) {
            this.fogPhaseTimer += delta;
            const intervals = GAME_CONFIG.fogZones?.phaseIntervals || [60, 120, 180, Infinity];
            const nextInterval = intervals[this.zonePhaseIndex] || Infinity;

            if (this.fogPhaseTimer >= nextInterval && this.zonePhaseIndex < 3) {
                this.zonePhaseIndex++;
                this.fogPhaseTimer = 0;
                const safeRadius = this.map.activateFogPhase(this.zonePhaseIndex);
                this.zonePhaseTarget = safeRadius || this.zonePhaseTarget;
                if (this.zonePhaseTarget < this.zone.getCurrentRadius()) {
                    this.zone.shrink(this.zonePhaseTarget);
                }

                // Sound + HUD warning
                this.audioSynth?.playZonePhaseTransition?.(this.zonePhaseIndex);
                const arenaRadius = this.map?.halfSize || this.zone.getCurrentRadius();
                this.hud?.updateFogPhase?.(this.zonePhaseIndex, safeRadius, arenaRadius);
                const phaseName = (GAME_CONFIG.fogZones?.phaseNames || [])[this.zonePhaseIndex] || 'Финальная';
                this.hud?.showZoneWarning?.(`\u0422\u0443\u043c\u0430\u043d: ${phaseName}!`, 4000);
            }
        }

        // Zone damage tick (every 1s)
        this.zoneDamageTickTimer += delta;
        if (this.zoneDamageTickTimer >= 1) {
            this.zoneDamageTickTimer = 0;
            const entities = [this.player, ...this.bots];
            for (const entity of entities) {
                if (!entity || entity.health <= 0) continue;
                const pos = entity.position;
                const fogDmg = this.map?.getFogDamageAt?.(pos.x, pos.z) || 0;
                const radDmg = this.map?.getRadiationDamageAt?.(pos.x, pos.z) || 0;
                if (fogDmg > 0) {
                    entity.takeDamage(fogDmg, false, null, 0, 'storm');
                    this.audioSynth?.playRadiationTick?.();
                }
                if (radDmg > 0) {
                    entity.takeDamage(radDmg, false, null, 0, 'radiation');
                }
            }
        }

        // Radiation warnings (check player only)
        if (this.map?.getClosestRadiationZone) {
            const radInfo = this.map.getClosestRadiationZone(this.player.position.x, this.player.position.z);
            if (radInfo) {
                const intensity = radInfo.zone.intensity || 'low';
                if (intensity !== this.lastRadiationLevel) {
                    this.lastRadiationLevel = intensity;
                    this.audioSynth?.playRadiationWarning?.(intensity);
                }
                this.hud?.showRadiationWarning?.(intensity, Math.round(radInfo.distance));
            } else {
                if (this.lastRadiationLevel !== null) {
                    this.lastRadiationLevel = null;
                    this.hud?.clearRadiationWarning?.();
                }
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
            this.activeEvent.timer = 3.5;
            if (this.env?.setFogOverride) {
                this.env.setFogOverride(0.06, 0x04060a);
            } else if (this.scene?.fog) {
                this.scene.fog.density = 0.06;
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

    // Adjust ambient light based on player's biome location
    updateBiomeAmbient(delta) {
        if (!this.scene.userData.globalAmbientLight || !this.map) return;
        const px = this.player.position.x;
        const pz = this.player.position.z;
        let color = 0xffffff;
        let intensity = 1.5;

        // Check radiation zones first (dark orange/red tint)
        const radDmg = this.map.getRadiationDamageAt?.(px, pz) || 0;
        if (radDmg > 0.25) {
            color = 0xffaa66;
            intensity = 1.2;
        } else if (radDmg > 0.1) {
            color = 0xffcc88;
            intensity = 1.35;
        }

        // Burning wastes - dark orange
        if (px > 30 && pz < -30 && Math.hypot(px - 100, pz + 100) < 50) {
            color = 0xff8844;
            intensity = 1.1;
        }

        // Luminous forest - cyan/blue tint
        if (px < -30 && pz > 30 && Math.hypot(px + 60, pz - 60) < 50) {
            color = 0xaaddff;
            intensity = 1.4;
        }

        // Crystal grotto - blue tint
        if (px > 30 && pz > 30 && Math.hypot(px - 60, pz - 60) < 50) {
            color = 0x8899cc;
            intensity = 1.2;
        }

        // Dark areas (inside structures)
        const inside = this.map.getStructureAtPoint?.(px, pz, 8);
        if (inside && (inside.userData.isInnerRing || inside.userData.isCornucopia)) {
            intensity *= 0.85;
        }

        // Apply with smooth interpolation
        const target = new THREE.Color(color);
        const ambient = this.scene.userData.globalAmbientLight;
        ambient.color.lerp(target, delta * 3);
        ambient.intensity += (intensity - ambient.intensity) * delta * 3;
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
            }
        }
        this.spawnBurstCooldown = this.isMobile() ? 0.03 : 0.02;
    }

    update(delta) {
        // Handle perk menu navigation WITHOUT blocking game loop
        let perkMenuBlocking = false;
        if (this.perkMenuOpen) {
            const wPressed = !!this.input.keys['KeyW'] || !!this.input.keys['ArrowUp'];
            const sPressed = !!this.input.keys['KeyS'] || !!this.input.keys['ArrowDown'];
            const ePressed = !!this.input.keys['KeyE'] || !!this.input.keys['Enter'] || !!this.input.keys['Space'];

            if (wPressed && !this.menuKeyLatch.w) {
                this.perkMenuIndex -= 1;
                this.hud.setPerkMenuSelection(this.perkMenuIndex);
            }
            if (sPressed && !this.menuKeyLatch.s) {
                this.perkMenuIndex += 1;
                this.hud.setPerkMenuSelection(this.perkMenuIndex);
            }

            if (ePressed && !this.menuKeyLatch.e) {
                if (this.hud && this.hud.perkButtons) {
                    const idx = this.hud.getPerkMenuSelection();
                    const btn = this.hud.perkButtons[idx];
                    if (btn) btn.click();
                }
            }

            this.menuKeyLatch.w = wPressed;
            this.menuKeyLatch.s = sPressed;
            this.menuKeyLatch.e = ePressed;
            document.exitPointerLock?.();
            perkMenuBlocking = true;
        } else {
            this.menuKeyLatch.w = false;
            this.menuKeyLatch.s = false;
            this.menuKeyLatch.e = false;
        }

        if (this.isVisible === false) return;
        if (this.activeEvent.type === 'radiation_rain') {
            this.updateRadiationRainDamage(delta);
        }
        if (this.resumeGraceTimer > 0) {
            this.resumeGraceTimer = Math.max(0, this.resumeGraceTimer - delta);
        }

        if (this.input.isKeyPressed('KeyM')) {
            if (!this.pauseKeyLatch && performance.now() >= (this.pauseInputLockUntil || 0)) {
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

        // ===== COUNTDOWN HANDLER (always runs) =====
        if (this.gameState === 'countdown') {
            this.countdownTimer -= delta;
            const sec = Math.max(0, Math.ceil(this.countdownTimer));
            if (sec !== this.lastCountdownSecond) {
                this.lastCountdownSecond = sec;
                if (sec > 0) this.audioSynth?.playTimerTick?.(sec <= 3 ? 1.25 : 0.9);
            }
            this.player.setInvulnerable(true);
            this.bots.forEach(bot => bot.setInvulnerable(true));
            this.player.isFrozen = true;
            this.bots.forEach(bot => { bot.isFrozen = true; });
            this.hud.showCountdown(sec);
            if (this.countdownTimer <= 0) {
                if (!this.perkLocked) { this.applyPerk('quickHands'); this.perkLocked = true; }
                this.gameState = 'spawn';
                this.perkLocked = true;
                this.perkSelectionRequired = false;
                this.perkMenuOpen = false;
                this.hud.setPerkPanelLock(false);
                this.hud.togglePerkPanel(false);
                this.hud.setPerkSelectionEnabled(false);
                this.updateDesktopCursorMode();
                this.tryEnterGameplayPointerLock();
                this.hud.hideCountdown();
                this.hud.showGameMessage('\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c \u043d\u0430 \u0413\u043e\u043b\u043e\u0434\u043d\u044b\u0435 \u0438\u0433\u0440\u044b, \u0432\u044b\u0436\u0438\u0432\u0435\u0442 \u0441\u0438\u043b\u044c\u043d\u0435\u0439\u0448\u0438\u0439!');
                this.audioSynth.playBoxArrival?.(new THREE.Vector3(0, 1, 0));
                this.player.isFrozen = false;
                this.bots.forEach(bot => { bot.isFrozen = false; });
                this.queueZombieBurst(true, 1.6, 120, 22, this.isMobile() ? 4 : 6);
                this.queuePoiBurst(1.7, this.isMobile() ? 18 : 28, this.isMobile() ? 4 : 5);
            }
        }

        if (perkMenuBlocking) {
            // Perk menu is open — skip player/bot logic below
        } else {
        const canSelectPerk = this.gameState === 'countdown' && !this.perkLocked;
        if (this.input.isKeyPressed('KeyP') && canSelectPerk) {
            if (!this.perkKeyLatch) {
                this.perkMenuOpen = this.perkSelectionRequired ? true : !this.perkMenuOpen;
                this.hud.togglePerkPanel(this.perkMenuOpen);
                this.updateDesktopCursorMode();
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
            this.menuKeyLatch.e = this.input.isKeyPressed('KeyE');
            this.menuKeyLatch.w = this.input.isKeyPressed('KeyW');
            this.menuKeyLatch.s = this.input.isKeyPressed('KeyS');
            this.hud.togglePerkPanel(true);
            this.updateDesktopCursorMode();
        }

        // ===== SPAWN HANDLER (always runs) =====
        if (this.gameState === 'spawn') {
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
                this.roundEvalDelay = 6;
                this.postStartShieldTimer = 2.5;
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
            this.postStartShieldTimer = Math.max(0, this.postStartShieldTimer - delta);
            this.roundEvalDelay = Math.max(0, this.roundEvalDelay - delta);
            const startProtected = this.postStartShieldTimer > 0;
            this.player.setInvulnerable(startProtected);
            this.bots.forEach(bot => bot.setInvulnerable(startProtected));
            if (!this.poiZombieSeeded && this.poiWarmupTimer > 0) {
                this.poiWarmupTimer = Math.max(0, this.poiWarmupTimer - delta);
                if (this.poiWarmupTimer <= 0) {
                    this.queuePoiBurst(1.65, this.isMobile() ? 16 : 22, this.isMobile() ? 4 : 5);
                }
            }
          this.updateZoneCycle(delta);
            this.updateBiomeAmbient(delta);
            this.chestRespawnTimer = Math.max(0, this.chestRespawnTimer - delta);
            if (this.chestRespawnTimer <= 0) {
                const restored = this.lootManager.refillOpenedChests?.(6) || 0;
                if (restored > 0) {
                    this.hud.showLootNotification?.(`Сундуки пополнены: ${restored}`);
                }
                this.chestRespawnTimer = 55;
            }

            if (this.activeEvent?.type === 'radiationRain' && this.radiationRainDamageActive && !this.isShelteredFromRadiation(this.player.position)) {
                this.player.takeDamage(GAME_CONFIG.events.radiation.playerDps * delta, false, null, 0, 'storm');
            }

            // Dynamic zone info
            if (this.zonePhase === 'waiting') {
                this.hud.updateZoneInfo(`\u0417\u043e\u043d\u0430 \u0441\u0436\u0430\u0442\u0438\u044f: ${Math.ceil(this.zonePhaseTimer)}s`, false);
            } else if (this.fogPhaseEnabled && this.map?.getActiveSafeRadius) {
                const safeRadius = this.map.getActiveSafeRadius();
                const arenaRadius = this.map?.halfSize || this.zone.getCurrentRadius();
                this.hud.updateFogPhase(this.zonePhaseIndex, safeRadius, arenaRadius);
            } else {
                this.hud.updateZoneInfo(`\u0417\u043e\u043d\u0430: R=${Math.round(this.zone.getCurrentRadius())}`, false);
            }

            const fogDensity = this.scene?.fog?.density || 0;
            const nightBoost = this.env && (this.env.dayTime < 0.18 || this.env.dayTime > 0.78) ? 0.14 : 0;
            const shrinkBoost = 0;
            const outsideBoost = 0;
            const fogBoost = Math.min(0.24, Math.max(0, fogDensity - 0.004) * 30);
            const blindnessBoost = this.activeEvent?.type === 'blindness' ? 0.55 : 0;
            const radiationBoost = this.activeEvent?.type === 'radiationRain' && this.radiationRainDamageActive && !this.isShelteredFromRadiation(this.player.position) ? 0.08 : 0;
            this.hud.setVisionIntensity?.(0.12 + nightBoost + shrinkBoost + outsideBoost + fogBoost + blindnessBoost + radiationBoost);
        } else {
            this.hud.setVisionIntensity?.(0);
        }

        this.physics.update(delta);

        this.resetInvalidPlayerState();
        this.player.update(delta, this.audioSynth, this.lootManager, this.entityManager);
        this.map?.activateTrapsNearEntity?.(this.player);
        this.syncCameraToPlayer();
        this.map.update?.(delta, this.player.position);
        this.updateRadiationRainEffect(delta);
        this.updateWeatherRainEffect(delta);
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
                ? 22
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
                && bot.state !== 'chase'
                && bot.state !== 'engage';
            if (isFarIdleBot && ((this.botFrameCounter + botIndex) % 2) !== 0) {
                if (bot.mesh) {
                    bot.mesh.position.copy(bot.position);
                    bot.mesh.position.y = bot.position.y - (bot.physics.height - 0.2);
                    if (bot.healthBar) bot.updateHealthBar(0.05);
                }
                continue;
            }
            bot.update(delta, this.botBrains[botIndex], this.entityManager, this.lootManager, this.audioSynth, this.physics, this.zone);
            this.map?.activateTrapsNearEntity?.(bot);
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

        if (this.environmentEntities?.length) {
            const envCount = this.environmentEntities.length;
            const perFrame = Math.max(
                this.isMobile() ? 6 : 10,
                Math.min(envCount, Math.ceil(envCount * 0.5))
            );
            for (let i = 0; i < perFrame; i++) {
                const idx = (this.environmentUpdateIndex + i) % envCount;
                const ent = this.environmentEntities[idx];
                if (!ent?.isAlive) continue;
                ent.update?.(delta, this.entityManager, this.map, this.audioSynth);
            }
            this.environmentUpdateIndex = (this.environmentUpdateIndex + perFrame) % envCount;
        }

        if (this.gameState === 'playing') {
            this.zombieMaintainTimer = Math.max(0, this.zombieMaintainTimer - delta);
            if (this.zombieMaintainTimer <= 0) {
                const aliveZombies = this.zombies.filter(z => z?.isAlive).length;
                const minAlive = this.isMobile() ? 16 : 22;
                if (aliveZombies < minAlive) {
                    const need = minAlive - aliveZombies;
                    this.queuePoiBurst(1.45, Math.min(14, need + 2), this.isMobile() ? 3 : 4);
                    this.queueZombieBurst(false, 2.0, 180, Math.max(0, need - 2), this.isMobile() ? 4 : 5);
                }
                this.ensurePoiZombiePresence(this.isMobile() ? 8 : 12);
                this.zombieMaintainTimer = 3.2 + Math.random() * 1.4;
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
        this.minimapTimer -= delta;
        if (this.minimapTimer <= 0) {
            const botPoints = [];
            for (let i = 0; i < this.bots.length; i++) {
                const bot = this.bots[i];
                if (!bot?.isAlive) continue;
                botPoints.push({ x: bot.position.x, z: bot.position.z });
            }
            const zombiePoints = [];
            for (let i = 0; i < this.zombies.length && zombiePoints.length < 96; i++) {
                const zombie = this.zombies[i];
                if (!zombie?.isAlive) continue;
                zombiePoints.push({ x: zombie.position.x, z: zombie.position.z });
            }
            this.hud.updateMinimap?.({
                mapSize: this.map.size,
                zoneRadius: this.zone.getCurrentRadius(),
                player: { x: this.player.position.x, z: this.player.position.z },
                bots: botPoints,
                zombies: zombiePoints
            });
            this.minimapTimer = this.isMobile() ? 0.16 : 0.1;
        }

        if (this.gameState === 'playing' && !this.roundFinished && this.roundEvalDelay <= 0) {
            if (aliveCount === 0) {
                this.endRound('\u0412 \u0436\u0438\u0432\u044b\u0445 \u043d\u0438\u043a\u043e\u0433\u043e \u043d\u0435 \u043e\u0441\u0442\u0430\u043b\u043e\u0441\u044c. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 E \u0447\u0442\u043e\u0431\u044b \u043d\u0430\u0447\u0430\u0442\u044c \u0437\u0430\u043d\u043e\u0432\u043e');
            } else if (aliveCount === 1 && aliveSurvivors[0] === this.player) {
                this.endRound('\u041f\u043e\u0431\u0435\u0434\u0430! \u0422\u044b \u043e\u0441\u0442\u0430\u043b\u0441\u044f \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u043c \u0432\u044b\u0436\u0438\u0432\u0448\u0438\u043c. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 E \u0447\u0442\u043e\u0431\u044b \u043d\u0430\u0447\u0430\u0442\u044c \u0437\u0430\u043d\u043e\u0432\u043e');
            }
        }

        this.env.update(delta);
        this.map?.updateZoneAnimations?.(delta);
        this.map?.updateParticles?.(delta);
        if ((this.env?.getWeatherType?.() || 'clear') === 'rain') {
            this.scene.background = new THREE.Color(0x3b3f46);
        }
        this.weatherSyncTimer = Math.max(0, this.weatherSyncTimer - delta);
        if (this.weatherSyncTimer <= 0) {
            const changedWeather = this.env?.consumeWeatherChange?.();
            const weatherType = changedWeather || this.env?.getWeatherType?.() || 'clear';
            if (weatherType !== this.lastWeatherType) {
                this.lastWeatherType = weatherType;
                this.audioSynth?.setWeatherState?.(weatherType);
                this.setWeatherRainActive(weatherType === 'rain');
                if (this.gameState === 'playing') {
                    if (weatherType === 'rain') {
                        this.hud.showGameMessage('Погода: Дождь');
                    } else if (weatherType === 'snow') {
                        this.hud.showGameMessage('Погода: Снег');
                    } else {
                        this.hud.showGameMessage('Погода: Ясно');
                    }
                }
            }
            this.weatherSyncTimer = 1.2;
        }
        const isNightNow = !!(this.env && (this.env.dayTime < 0.18 || this.env.dayTime > 0.78));
        this.map?.setNightEmissive?.(isNightNow);
        this.biomeAudioSyncTimer = Math.max(0, this.biomeAudioSyncTimer - delta);
        if (this.biomeAudioSyncTimer <= 0) {
            const biomeMat = this.map?.getTerrainMaterialAt?.(this.player.position.x, this.player.position.z) || 'stone';
            const weather = this.env?.getWeatherType?.() || 'clear';
            const key = `${biomeMat}:${weather}:${isNightNow ? 1 : 0}`;
            if (key !== this.lastBiomeAudioKey) {
                this.lastBiomeAudioKey = key;
                this.audioSynth?.setBiomeAmbience?.(biomeMat, weather, isNightNow);
            }
            this.biomeAudioSyncTimer = 0.8;
        }
        if (this.renderer) {
            const targetExposure = Number.isFinite(this.scene?.userData?.targetExposure) ? this.scene.userData.targetExposure : 1;
            const curr = Number.isFinite(this.renderer.toneMappingExposure) ? this.renderer.toneMappingExposure : 1;
            this.renderer.toneMappingExposure = THREE.MathUtils.lerp(curr, targetExposure, Math.min(1, delta * 3.5));
        }
        if (this.scene?.fog && this.gameState === 'playing') {
            const terrainMat = this.map?.getTerrainMaterialAt?.(this.player.position.x, this.player.position.z) || 'stone';
            const fogTargetColor =
                terrainMat === 'urban' ? new THREE.Color(0x6b7278) :
                    terrainMat === 'wild' ? new THREE.Color(0x46624d) :
                        new THREE.Color(0x9cb8cc);
            this.scene.fog.color.lerp(fogTargetColor, Math.min(1, delta * 2.4));
            const localFogBoost = this.getLocalizedFogBoost(this.player.position);
            if (localFogBoost > 0) {
                this.scene.fog.density = Math.min(0.12, this.scene.fog.density + localFogBoost);
            }
        }

        // players count is updated by throttled hudStatsTimer block above
        } // end else (perkMenuBlocking)
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
        const maxAlive = 320;
        let budget = Math.max(0, Math.min(maxAlive - aliveNow, Math.floor((houseSpots.length * 2.4 + hangarSpots.length * 13.0) * intensity)));
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
            const fallbackSpot = guardSpot || { x: point.x, z: point.z };
            const jitter = interiorSpot
                ? (point.type === "hangar" ? 1.2 : 0.8)
                : (point.type === "hangar" ? 2.0 : 1.05);
            const x = fallbackSpot.x + (Math.random() - 0.5) * jitter;
            const z = fallbackSpot.z + (Math.random() - 0.5) * jitter;
            if (!interiorSpot && !this.map.isWalkableAt?.(x, z)) return false;
            const baseY = this.map.raycastGroundY?.(
                x,
                z,
                this.map.getSurfaceHeightAt?.(x, z) ?? this.map.getHeightAt?.(x, z) ?? 0
            ) ?? 0;
            const pos = new THREE.Vector3(x, baseY + 1.8, z);
            if (pos.distanceTo(this.player.position) < 14) return false;
            const zombie = new Zombie(this.scene, this.nextZombieId++, pos, Zombie.pickWeightedType());
            this.physics.addEntity(zombie);
            this.entityManager.addEntity(zombie);
            this.zombies.push(zombie);
            spawned++;
            budget--;
            return true;
        };

        // Guaranteed presence: hangars always dense, houses always at least one guard.
        for (const hangar of hangarSpots) {
            if (budget <= 0 || spawned >= maxSpawn) break;
            spawnOneAtPoi(hangar, true);
            if (budget > 0 && spawned < maxSpawn) {
                spawnOneAtPoi(hangar, true);
            }
            if (budget > 0 && spawned < maxSpawn) {
                spawnOneAtPoi(hangar, false);
            }
        }
        for (let i = 0; i < houseSpots.length; i++) {
            if (budget <= 0 || spawned >= maxSpawn) break;
            spawnOneAtPoi(houseSpots[i], true);
            if (budget > 0 && spawned < maxSpawn && Math.random() < 0.55) {
                spawnOneAtPoi(houseSpots[i], false);
            }
        }

        let attempts = 0;
        const attemptLimit = Math.max(20, points.length * 3);
        while (budget > 0 && spawned < maxSpawn && attempts < attemptLimit) {
            const point = points[this.poiSpawnCursor % points.length];
            this.poiSpawnCursor = (this.poiSpawnCursor + 1) % points.length;
            attempts++;
            if (budget <= 0) break;
            const baseCount = point.type === "hangar"
                ? (16 + Math.floor(Math.random() * 10))
                : (2 + Math.floor(Math.random() * 2));
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

    ensurePoiZombiePresence(limitPerTick = 6) {
        const points = this.poiSpawnCandidates?.length ? this.poiSpawnCandidates : [
            ...(this.map.getHouseSpots?.() || []).map(s => ({ ...s, type: 'house' })),
            ...(this.map.getHangarSpots?.() || []).map(s => ({ ...s, type: 'hangar' }))
        ];
        if (!points.length) return 0;
        const checks = Math.min(points.length, Math.max(1, limitPerTick | 0));
        let injected = 0;
        const aliveNow = this.zombies.filter(z => z?.isAlive).length;
        const maxAlive = this.isMobile() ? 190 : 260;
        let remainingBudget = Math.max(0, maxAlive - aliveNow);
        if (remainingBudget <= 0) return 0;

        const spawnNearPoint = (point) => {
            if (!point || remainingBudget <= 0) return 0;
            const localNeed = point.type === 'hangar' ? 3 : 1;
            let made = 0;
            for (let n = 0; n < localNeed && remainingBudget > 0; n++) {
                const interiorSpot = this.map.findStructureInteriorPoint?.(
                    point,
                    point.type,
                    point.type === 'hangar' ? 1.9 : 1.0,
                    42
                );
                const guardSpot = interiorSpot
                    || this.map.getStructureEntryPoint?.(point, point.type, this.player?.position || null)
                    || this.map.findStructureGuardPoint?.(point, point.type)
                    || { x: point.x, z: point.z };
                const jitter = interiorSpot ? (point.type === 'hangar' ? 1.25 : 0.85) : (point.type === 'hangar' ? 2.25 : 1.15);
                const x = guardSpot.x + (Math.random() - 0.5) * jitter;
                const z = guardSpot.z + (Math.random() - 0.5) * jitter;
                if (!interiorSpot && !this.map.isWalkableAt?.(x, z)) continue;
                const y = this.map.getHeightAt?.(x, z) ?? 0;
                const pos = new THREE.Vector3(x, y + 1.8, z);
                if (this.player?.position && pos.distanceTo(this.player.position) < 10) continue;
                const zombie = new Zombie(this.scene, this.nextZombieId++, pos, Zombie.pickWeightedType());
                this.physics.addEntity(zombie);
                this.entityManager.addEntity(zombie);
                this.zombies.push(zombie);
                remainingBudget--;
                made++;
            }
            return made;
        };

        for (let i = 0; i < checks; i++) {
            const point = points[(this.poiSpawnCursor + i) % points.length];
            const radius = point.type === 'hangar' ? 18 : 11;
            let present = false;
            for (let z = 0; z < this.zombies.length; z++) {
                const zombie = this.zombies[z];
                if (!zombie?.isAlive) continue;
                if (Math.hypot(zombie.position.x - point.x, zombie.position.z - point.z) <= radius) {
                    present = true;
                    break;
                }
            }
            if (present) continue;
            injected += spawnNearPoint(point);
        }
        this.poiSpawnCursor = (this.poiSpawnCursor + checks) % points.length;
        return injected;
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
            const baseY = this.map.raycastGroundY?.(
                tile.x,
                tile.z,
                this.map.getSurfaceHeightAt?.(tile.x, tile.z) ?? this.map.getHeightAt?.(tile.x, tile.z) ?? 0
            ) ?? 0;
            const pos = new THREE.Vector3(tile.x, baseY + 1.8, tile.z);
            if (pos.distanceTo(this.player.position) < (reset ? 20 : 24)) continue;
            if (!this.map.isWalkableAt?.(tile.x, tile.z)) continue;
            const zombie = new Zombie(this.scene, this.nextZombieId++, pos, Zombie.pickWeightedType());
            this.physics.addEntity(zombie);
            this.entityManager.addEntity(zombie);
            this.zombies.push(zombie);
            spawned++;
        }
        return spawned;
    }

    render() {
        this.renderFrameCount = (this.renderFrameCount || 0) + 1;
        this.camera.layers.enableAll();
        if (this.renderFrameCount === 1) {
            console.log('[Game] FIRST render: renderer=' + this.renderer?.constructor?.name + ' renderMethod=' + typeof this.renderer.render + ' renderName=' + this.renderer.render?.name);
            console.log('[Game] Camera: pos=' + this.camera.position.x + ',' + this.camera.position.y + ',' + this.camera.position.z + ' near=' + this.camera.near + ' far=' + this.camera.far);
            console.log('[Game] Scene children: ' + this.scene.children.length + ' mapGround=' + (this.map?.scene?.children?.length || 0));
            // Check if ground planes exist
            this.scene.traverse(obj => {
                if (obj.isMesh && (obj.geometry?.type === 'PlaneGeometry' || obj.geometry?.type === 'BoxGeometry')) {
                    const geo = obj.geometry;
                    const params = geo.parameters || {};
                    if ((params.width || 0) > 200 || (params.width || 0) > 10 && (params.height || 0) > 10) {
                        console.log('[Game] Large mesh: type=' + obj.geometry?.type + ' pos=' + obj.position.x + ',' + obj.position.y + ',' + obj.position.z + ' size=' + (params.width || '?') + 'x' + (params.height || '?') + 'x' + (params.depth || '?'));
                    }
                }
            });
        }
        this.renderer.render(this.scene, this.camera);
    }

    async startGame() {
        if (!this.initialized) {
            if (loadingOverlay) loadingOverlay.style.display = 'flex';
            smoothSetProgress(0.05, 'Инициализация...');
            await this.initAsync();
            smoothSetProgress(0.2, 'Ресурсы загружены');
            await new Promise(r => setTimeout(r, 100));
        }
        if (this.isStarted) return;
        this.isStarted = true;
        gameHasStarted = true;
        this.startingGame = true;
        this.startAttemptAt = performance.now();
        try {
            // Hide start screen (but keep loading overlay visible)
            this.hideStartScreen();
            smoothSetProgress(0.05, 'Генерация мира...');

            // Hide HUD during map generation
            const hudEl = document.getElementById('hud');
            if (hudEl) hudEl.style.display = 'none';

            await new Promise(r => setTimeout(r, 100));

            // Wait for full map generation BEFORE entering fullscreen
            if (this.map?.ready?.then) {
                await this.map.ready;
            }

            smoothSetProgress(0.08, 'Мир построен');

            // NOW enter fullscreen — map is fully loaded
            this.enterFullscreen().catch(() => { });
            if (this.isMobile()) {
                this.lockOrientation().catch(() => { });
                this.updateOrientationUI();
                this.applyRendererSizing();
                setTimeout(() => this.applyRendererSizing(), 180);
                setTimeout(() => this.applyRendererSizing(), 420);
                this.player?.resetView?.();
                const retry = async () => {
                    if (!document.fullscreenElement) {
                        this.enterFullscreen().catch(() => { });
                        this.lockOrientation().catch(() => { });
                        this.updateOrientationUI();
                        this.applyRendererSizing();
                        setTimeout(() => this.applyRendererSizing(), 180);
                        this.player?.resetView?.();
                    }
                    window.removeEventListener('touchend', retry);
                };
                window.addEventListener('touchend', retry, { passive: false });
            }

            // Show HUD after map generation is complete
            if (hudEl) hudEl.style.display = '';
            this.hud?.showPause?.(false);
            this.isPaused = false;
            this.partyMode = false;
            this.applyRoundMode('hybrid');
            this.ensureSceneRenderable();

            this.audioSynth?.unlock?.().catch(() => { });
            this.audioSynth?.playMusic?.();
            this.audioSynth?.startAmbient?.();
            this.yandex?.gameplayStart?.();

            this.perkMenuOpen = !this.perkLocked;
            this.perkSelectionRequired = !this.perkLocked;
            this.hud?.setPerkPanelLock?.(this.perkSelectionRequired);

            this.updateDesktopCursorMode();

            this.gameLoop.start();
            this.applyRendererSizing();
            this.syncCameraToPlayer();
            this.render();
            smoothSetProgress(0.07, 'Запуск...');

            // Hide loading overlay BEFORE perk panel — loading is complete
            if (loadingOverlay && loadingOverlay.style.display !== 'none') {
                loadingOverlay.style.display = 'none';
            }

            // Show perk panel AFTER loading is fully complete
            if (this.perkMenuOpen) {
                this.hud?.togglePerkPanel?.(true);
                document.exitPointerLock?.();
                this.hud?.showGameMessage?.('Выберите перк перед стартом матча');
            }
            if (this.perkMenuOpen) {
                this.hud?.showCountdown?.(this.countdownTime);
            }
            setLoadingProgress(0.9);
            this.pauseInputLockUntil = performance.now() + 1200;
            this.startingGame = false;
        } catch (err) {
            console.error('Failed to start game:', err);
            this.isStarted = false;
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
    window.game = new Game(yandex);
    const game = window.game;

    // Debug mode camera controls (activated via ?debug=true or #hash)
    setTimeout(() => {
        console.log('DEBUG: Checking game object properties...');
        console.log('  camera:', !!game.camera, typeof game.camera);
        console.log('  scene:', !!game.scene, typeof game.scene);
        if (game.camera) {
            console.log('  camera.position:', game.camera.position?.x, game.camera.position?.y, game.camera.position?.z);
        }
    }, 100);
    
    // Debug mode camera controls (activated via ?debug=true or #hash)
    if (isDebugMode && typeof Stats !== 'undefined') {
        console.log('🗺️ Debug Map Viewer activated');
        
        // Create debug overlay UI
        const overlay = document.createElement('div');
        overlay.style.cssText = `position:fixed;top:10px;left:10px;z-index:9999;background:rgba(0,0,0,.85);color:#0f0;padding:12px;border-radius:6px;font-size:13px;line-height:1.6;min-width:280px;user-select:none;pointer-events:auto;border:1px solid #0f04`;
        overlay.innerHTML = `<h3 style="margin-bottom:8px;color:#fff">🗺️ Debug Map Viewer</h3>
            <div><span style="color:#aaa">FPS:</span><span id="dbgFps">0</span></div>
            <div><span style="color:#aaa">Cam X,Y,Z:</span><span id="dbgPos">0, 0, 0</span></div>
            <div><span style="color:#aaa">FOV:</span><span id="dbgFov">60</span></div>
            <div><span style="color:#aaa">Mode:</span><span id="dbgMode">manual</span></div>`;
        document.body.appendChild(overlay);

        // Debug state
        let frameCount = 0, frameTime = 0, lastFrame = performance.now();
        
        window.debugCamState = { x: 100, y: 80, z: -100, lookAtX: 0, lookAtY: 0, lookAtZ: 0 };
        window.setDebugCamera = function(x, y, z, lx, ly, lz) {
            debugCamState.x = x; debugCamState.y = y; debugCamState.z = z;
            debugCamState.lookAtX = lx; debugCamState.lookAtY = ly; debugCamState.lookAtZ = lz;
        };
        const keysDown = {};

        // Multi-camera test mode for comprehensive map verification
        const testCameras = [
            { name: 'center_high', pos: { x: 0, y: 100, z: 0.01 }, lookAt: { x: 0, y: 0, z: 0 }, delay: 3000 },
            { name: 'center_low', pos: { x: 0, y: 15, z: 10 }, lookAt: { x: 0, y: 0, z: 0 }, delay: 3000 },
            { name: 'forest_nw', pos: { x: -158, y: 50, z: -158 }, lookAt: { x: -158, y: 0, z: -158 }, delay: 3000 },
            { name: 'stone_ne', pos: { x: 158, y: 50, z: -158 }, lookAt: { x: 158, y: 0, z: -158 }, delay: 3000 },
            { name: 'military_sw', pos: { x: -158, y: 50, z: 158 }, lookAt: { x: -158, y: 0, z: 158 }, delay: 3000 },
            { name: 'snow_se', pos: { x: 158, y: 50, z: 158 }, lookAt: { x: 158, y: 0, z: 158 }, delay: 3000 },
            { name: 'north_wall', pos: { x: 0, y: 20, z: -256 }, lookAt: { x: 0, y: 0, z: -128 }, delay: 3000 },
            { name: 'south_wall', pos: { x: 0, y: 20, z: 256 }, lookAt: { x: 0, y: 0, z: 128 }, delay: 3000 },
            { name: 'east_wall', pos: { x: 256, y: 20, z: 0 }, lookAt: { x: 128, y: 0, z: 0 }, delay: 3000 },
            { name: 'west_wall', pos: { x: -256, y: 20, z: 0 }, lookAt: { x: -128, y: 0, z: 0 }, delay: 3000 },
            { name: 'boundary_n', pos: { x: 0, y: 15, z: -60 }, lookAt: { x: 0, y: 0, z: -30 }, delay: 3000 },
            { name: 'boundary_s', pos: { x: 0, y: 15, z: 60 }, lookAt: { x: 0, y: 0, z: 30 }, delay: 3000 },
            { name: 'boundary_e', pos: { x: 60, y: 15, z: 0 }, lookAt: { x: 30, y: 0, z: 0 }, delay: 3000 },
            { name: 'boundary_w', pos: { x: -60, y: 15, z: 0 }, lookAt: { x: -30, y: 0, z: 0 }, delay: 3000 },
        ];
        
        let testModeActive = false;
        let testCameraIndex = 0;
        let testScreenshots = [];
        
        window.runTestCameras = function() {
            testModeActive = true;
            testCameraIndex = 0;
            testScreenshots = [];
            console.log('📷 Starting multi-camera test with ' + testCameras.length + ' cameras');
        };
        
        window.takeTestScreenshot = function(name) {
            if (!game || !game.renderer || !game.camera) return;
            game.renderer.render(game.scene, game.camera);
            const canvas = game.renderer.domElement;
            const link = document.createElement('a');
            link.download = `test-screenshot-${name}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            console.log(`📷 Screenshot: ${name}`);
        };

        window.addEventListener('keydown', (e) => {
            keysDown[e.code] = true;
            if (!game.camera || !game.scene) return;
            
            switch(e.code) {
                case 'KeyR': debugCamState.x = 100; debugCamState.y = 80; debugCamState.z = -100; break;
                case 'KeyT': debugCamState.x = 0; debugCamState.y = 200; debugCamState.z = 0.01; game.camera.up.set(0, -1, 0); game.camera.rotation.order = 'YXZ'; break;
            }
        });

        window.addEventListener('keyup', (e) => { keysDown[e.code] = false; });

        // Mouse wheel for zoom
        window.addEventListener('wheel', (e) => {
            if (!game.camera || !game.scene) return;
            
            const dirX = game.camera.position.x - debugCamState.lookAtX;
            const dirZ = game.camera.position.z - debugCamState.lookAtZ;
            const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);
            if (dist > 0) {
                debugCamState.x -= (dirX / dist) * e.deltaY * 0.15;
                debugCamState.z -= (dirZ / dist) * e.deltaY * 0.15;
            }
            
            // Also adjust Y based on scroll direction for vertical zoom
            if (game.camera.position.y > 20) {
                debugCamState.y = Math.max(10, game.camera.position.y - e.deltaY * 0.3);
            }
            
            e.preventDefault();
        }, { passive: false });

        // Mouse drag to orbit camera
        let isDragging = false;
        let lastMouseX = 0, lastMouseY = 0;

        window.addEventListener('mousedown', (e) => {
            if (!game.camera || !game.scene) return;
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        });

        window.addEventListener('mouseup', () => { isDragging = false; });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging || !game.camera || !game.scene) return;
            
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            
            // Orbit around lookAt point using spherical coordinates
            const offsetX = game.camera.position.x - debugCamState.lookAtX;
            const offsetZ = game.camera.position.z - debugCamState.lookAtZ;
            const offsetY = game.camera.position.y - debugCamState.lookAtY;
            
            const horizontalDist = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ);
            let distance = Math.sqrt(horizontalDist * horizontalDist + offsetY * offsetY) || 100;
            
            let theta = Math.atan2(offsetX, offsetZ);
            let phi = Math.acos(Math.max(-1, Math.min(1, offsetY / (distance || 1))));
            
            theta -= dx * 0.015;
            phi += dy * 0.015;
            phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
            
            debugCamState.x = debugCamState.lookAtX + Math.sin(theta) * Math.sin(phi) * distance;
            debugCamState.z = debugCamState.lookAtZ + Math.cos(theta) * Math.sin(phi) * distance;
        });

        // Override syncCameraToPlayer to disable automatic camera control during gameplay
        const origSyncCameraToPlayer = game.syncCameraToPlayer.bind(game);
        game.syncCameraToPlayer = function() { /* disabled in debug mode */ };

        // Debug update loop
        let testTimer = 0;
        window.updateDebugOverlay = function(delta) {
            if (!game || !game.camera || !game.scene) return;

            frameCount++;
            frameTime += (performance.now() - lastFrame);
            lastFrame = performance.now();
            
            if (frameTime >= 1000) {
                document.getElementById('dbgFps').textContent = Math.round(frameCount * 1000 / frameTime);
                frameCount = 0;
                frameTime = 0;
            }

            // Test camera mode - automatically switch between cameras
            if (testModeActive && game.camera) {
                testTimer += delta * 1000; // ms
                if (testTimer >= testCameras[testCameraIndex]?.delay) {
                    testTimer = 0;
                    testCameraIndex++;
                    
                    if (testCameraIndex >= testCameras.length) {
                        testModeActive = false;
                        console.log('✅ Multi-camera test complete. Took ' + testScreenshots.length + ' screenshots.');
                        document.getElementById('dbgMode').textContent = 'complete';
                        return;
                    }
                    
                    const cam = testCameras[testCameraIndex];
                    game.camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
                    game.camera.lookAt(cam.lookAt.x, cam.lookAt.y, cam.lookAt.z);
                    document.getElementById('dbgMode').textContent = cam.name;
                    console.log(`📷 Camera: ${cam.name} (${cam.pos.x}, ${cam.pos.y}, ${cam.pos.z})`);
                    
                    // Signal test runner to take screenshot
                    window._testCameraName = cam.name;
                    window._testCameraReady = true;
                }
            } else if (game.camera) {
                // WASD movement
                const moveSpeed = 3;
                
                const dirX = debugCamState.lookAtX - game.camera.position.x;
                const dirZ = debugCamState.lookAtZ - game.camera.position.z;
                const dist = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
                
                const fwdX = dirX / dist, fwdZ = dirZ / dist;
                const rightX = -fwdZ, rightZ = fwdX;

                if (keysDown['KeyW']) { debugCamState.x += fwdX * moveSpeed; debugCamState.z += fwdZ * moveSpeed; }
                if (keysDown['KeyS']) { debugCamState.x -= fwdX * moveSpeed; debugCamState.z -= fwdZ * moveSpeed; }
                if (keysDown['KeyA']) { debugCamState.x -= rightX * moveSpeed; debugCamState.z -= rightZ * moveSpeed; }
                if (keysDown['KeyD']) { debugCamState.x += rightX * moveSpeed; debugCamState.z += rightZ * moveSpeed; }

                // Q/E for up/down movement
                if (keysDown['KeyQ']) debugCamState.y -= moveSpeed;
                if (keysDown['KeyE']) debugCamState.y += moveSpeed;

                game.camera.position.set(debugCamState.x, debugCamState.y, debugCamState.z);
                game.camera.lookAt(debugCamState.lookAtX, debugCamState.lookAtY, debugCamState.lookAtZ);

                // Update overlay info
                document.getElementById('dbgPos').textContent = 
                    `${game.camera.position.x.toFixed(1)}, ${game.camera.position.y.toFixed(1)}, ${game.camera.position.z.toFixed(1)}`;
                document.getElementById('dbgFov').textContent = Math.round(game.camera.fov);
                if (!testModeActive) {
                    document.getElementById('dbgMode').textContent = 'manual';
                }

                // Update object count periodically
                if (frameCount % 60 === 0 && !window._debugObjCountCached) {
                    let count = 0;
                    game.scene.traverse((child) => {
                        if (child.isMesh || child.isGroup) count++;
                    });
                    const div = document.createElement('div');
                    div.innerHTML = `<span style="color:#aaa">Objects:</span> ${count.toLocaleString()}`;
                    overlay.appendChild(div);
                }
            }

            requestAnimationFrame(window.updateDebugOverlay);
        };

      // Start debug loop - poll until game.scene and game.camera are ready
        const startDebugLoop = () => {
            if (game && game.scene && game.camera) {
                console.log('🗺️ Starting debug camera controls...');
                
                // Override syncCameraToPlayer to disable automatic player camera control  
                const origSync = game.syncCameraToPlayer.bind(game);
                game.syncCameraToPlayer = function() { /* disabled in debug mode */ };

                debugCamState.x = 100; debugCamState.y = 80; debugCamState.z = -100;
                game.camera.position.set(debugCamState.x, debugCamState.y, debugCamState.z);
                game.camera.lookAt(0, 0, 0);
                
                requestAnimationFrame(window.updateDebugOverlay);
            } else {
                if (game && !game.isStarted) {
                    // Auto-start the game in debug mode so scene/camera get initialized  
                    console.log('🚀 Auto-starting game for debug mode...');
                    game.startGame().then(() => {
                        console.log('✅ Game started, waiting for camera ready...');
                    }).catch(err => {
                        console.error('❌ Failed to start game:', err);
                    });
                } else if (!game) {
                    console.warn('⚠️ window.game not found!');
                }
                
                setTimeout(startDebugLoop, 500);
            }
        };

        // Auto-start the game immediately in debug mode  
        if (game && !game.isStarted) {
            console.log('🚀 Starting game for debug mode...');
            game.startGame().then(() => {
                console.log('✅ Game started successfully');
            }).catch(err => {
                console.error('❌ Failed to start game:', err);
            });
        }

        startDebugLoop();

        console.log('🗺️ Debug controls: WASD move | Q/E up-down | Scroll zoom | R reset view | T top-down');
    }

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
            game.hud?.showGameMessage?.('\u041f\u0435\u0440\u043a \u0443\u0436\u0435 \u0432\u044b\u0431\u0440\u0430\u043d');
            return;
        }
        game.applyPerk(perk);
        game.perkLocked = true;
        game.perkSelectionRequired = false;
        game.hud.setPerkPanelLock(false);
        game.perkMenuOpen = false;
        game.hud.togglePerkPanel(false);
        game.updateDesktopCursorMode();
        game.tryEnterGameplayPointerLock();
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
            if (loadingOverlay) {
                loadingOverlay.style.display = 'flex';
                setLoadingProgress(0.05);
            }
            try {
                game.audioSynth?.unlock?.().catch(() => { });
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

















