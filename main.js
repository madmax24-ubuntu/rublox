import * as THREE from "three";
import { CameraController } from "./core/CameraController.js";
import { yieldScheduler } from "./core/YieldScheduler.js";

const positionsSetSegment = (positions, index, x, y, z, length) => {
	positions[index] = x;
	positions[index + 1] = y;
	positions[index + 2] = z;
	positions[index + 3] = x;
	positions[index + 4] = y + length;
	positions[index + 5] = z;
};

window.THREE = THREE;
try {
	THREE.Cache.enabled = true;
} catch (e) {}
window.__moduleTopLevelExecuted__ = true;
window.__moduleTopLevelExecutedAt__ = Date.now();

const loadingOverlay = document.getElementById("loadingOverlay");
const loadingFill = document.getElementById("loadingFill");
const loadingText = document.getElementById("loadingText");

const setLoadingProgress = (ratio) => {
	if (!loadingFill || !loadingText) return;
	const pct = Math.max(0, Math.min(100, Math.floor(ratio * 100)));
	loadingFill.style.width = `${pct}%`;
	loadingText.textContent = `${pct}%`;
};
setLoadingProgress._current = 0;

const smoothSetProgress = (increment, status) => {
	setLoadingProgress._current = Math.min(
		1,
		setLoadingProgress._current + increment,
	);
	setLoadingProgress(setLoadingProgress._current);
	if (status && loadingText) {
		loadingText.textContent = `${Math.floor(setLoadingProgress._current * 100)}% ${status}`;
	}
};

THREE.DefaultLoadingManager.onStart = () => {
	if (document.body?.classList?.contains("game-started")) return;
	if (loadingOverlay) loadingOverlay.style.display = "flex";
	setLoadingProgress(0.05);
};

THREE.DefaultLoadingManager.onProgress = (_, loaded, total) => {
	if (document.body?.classList?.contains("game-started")) return;
	if (total > 0) {
		setLoadingProgress(loaded / total);
	} else {
		setLoadingProgress(0.2);
	}
};

THREE.DefaultLoadingManager.onLoad = () => {
	setLoadingProgress(1);
	if (loadingOverlay) {
		setTimeout(() => {
			loadingOverlay.style.display = "none";
		}, 300);
	}
};

import { MapGenerator } from "./world/MapGenerator.js";
import { Environment } from "./world/Environment.js";
import { Physics } from "./world/Physics.js";
import { Zone } from "./world/Zone.js";
import { GameLoop } from "./core/GameLoop.js";
import { InputController } from "./core/InputController.js";
import { AudioSynth } from "./core/AudioSynth.js";
import { Player } from "./entities/Player.js";
import { Bot } from "./entities/Bot.js";
import { BotBrain } from "./entities/BotBrain.js";
import { Zombie as _Zombie } from "./entities/Zombie.js";
import { ZombiePool } from "./entities/ZombiePool.js";
import { ExplosiveBarrel } from "./entities/ExplosiveBarrel.js";
import { EntityManager } from "./entities/EntityManager.js";
import { LootManager } from "./items/LootManager.js";
import { Weapon } from "./items/Weapon.js";
import { HUD } from "./ui/HUD.js";
import { YandexBridge } from "./core/YandexBridge.js";
import { GAME_CONFIG, ROUND_MODES } from "./core/GameBalance.js";

class Game {
	constructor(yandexBridge = null) {
		this.yandex = yandexBridge || new YandexBridge();
		this.isStarted = false;
		this.startingGame = false;
		this._constructorRan = true;
		this.nextSpawnIndex = 0;
		this.mobileMode =
			"ontouchstart" in window ||
			navigator.maxTouchPoints > 0 ||
			/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
		this._tmpAudioForward = new THREE.Vector3();
		this._frustumBox = new THREE.Box3();
		this._tmpSafeZone = new THREE.Vector3();
		this._tmpEasterPos = new THREE.Vector3();
		this.initialized = false;
		// YieldScheduler для предотвращения фризов >1ms
		this.yieldScheduler = yieldScheduler;
		this.yieldScheduler.setYieldBudget(4);
		this.ready = this.initializeGame()
			.then(() => {
				this.initialized = true;
				document.dispatchEvent(new CustomEvent("gameReady"));
				return this;
			})
			.catch((err) => {
				this._constructorError = err.message;
				console.error("[Game] constructor init failed:", err);
				throw err;
			});
	}

	isMobile() {
		return this.mobileMode;
	}

	enableTestMode() {
		this._testMode = true;
		// Disable camera controls completely
		if (this.cameraController) {
			if (this.cameraController.controls) {
				this.cameraController.controls.enabled = false;
				this.cameraController.controls.dispose();
			}
		}
		if (this.camera) {
			this.camera.position.set(0, 800, 0);
			this.camera.lookAt(0, 0, 0);
			this.camera.fov = 90;
			this.camera.updateProjectionMatrix();
		}
		// Hide UI
		this.showUI = false;
		this.hud?.hide?.();
	}

	disableTestMode() {
		this._testMode = false;
		if (this.cameraController && this.cameraController.controls) {
			this.cameraController.controls.enabled = true;
		}
		this.camera.position.set(0, 1.5, 0);
		this.camera.lookAt(0, 0, 0);
		this.camera.fov = 75;
		this.camera.updateProjectionMatrix();
		this.showUI = true;
		this.hud?.show?.();
	}

	// Специальная функция для автотеста — захватывает скриншот с видом сверху
	takeTopDownScreenshot(x, z, height = 400) {
		if (!this.camera || !this.renderer || !this.scene) return null;

		// Сохраняем текущую камеру
		const savedPosition = this.camera.position.clone();
		const savedLookAt = this.camera.getWorldDirection(new THREE.Vector3());

		// Переключаем камеру на вид сверху
		this.camera.position.set(x, height, z);
		this.camera.lookAt(x, 0, z);
		this.camera.fov = 90;
		this.camera.updateProjectionMatrix();

		// Рендерим кадр
		this.renderer.render(this.scene, this.camera);

		// Захватываем скриншот
		const dataUrl = this.renderer.domElement.toDataURL("image/png");

		// Восстанавливаем камеру
		this.camera.position.copy(savedPosition);
		this.camera.lookAt(
			savedPosition.x + savedLookAt.x,
			savedPosition.y + savedLookAt.y,
			savedPosition.z + savedLookAt.z,
		);
		this.camera.fov = 75;
		this.camera.updateProjectionMatrix();

		return dataUrl;
	}

	async enterFullscreen() {
		const root =
			document.getElementById("gameRoot") || document.documentElement;
		if (document.fullscreenElement) return true;
		if (root.msRequestFullscreen) {
			try {
				root.msRequestFullscreen();
			} catch {}
			return true;
		}
		const target = root.requestFullscreen ? root : this.renderer?.domElement;
		if (!target?.requestFullscreen) return false;
		try {
			const result = target.requestFullscreen();
			if (result?.then) await result;
			return true;
		} catch {
			return false;
		}
	}

	async lockOrientation() {
		if (!screen.orientation || !screen.orientation.lock) return;
		try {
			await screen.orientation.lock("landscape");
		} catch (err) {
			console.log("Orientation lock failed:", err);
		}
	}

	updateOrientationUI() {
		if (!this.isMobile()) return;
		const rotateOverlay = document.getElementById("rotateOverlay");
		if (!rotateOverlay) return;
		const isPortrait = window.innerHeight > window.innerWidth;
		rotateOverlay.style.display =
			this.isStarted && isPortrait ? "flex" : "none";
	}

	applyRendererSizing() {
		if (!this.renderer || !this.camera) return;
		const width = Math.max(1, window.innerWidth);
		const height = Math.max(1, window.innerHeight);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(width, height, true);
		const pixelRatio = this.isMobile()
			? Math.min(window.devicePixelRatio || 1, 2)
			: Math.min(window.devicePixelRatio || 1, 2);
		this.renderer.setPixelRatio(pixelRatio);
		this.renderer.setViewport(0, 0, width, height);
		this.renderer.setScissorTest(false);
		if (this.renderer.domElement) {
			this.renderer.domElement.style.width = "100%";
			this.renderer.domElement.style.height = "100%";
			this.renderer.domElement.style.display = "block";
		}
	}

	onAppHidden() {
		this.input?.clearInputState?.();
		this.gameLoop?.resetDelta?.();
		this.lastVisibilityHiddenAt = performance.now();
		this.resumeGraceTimer = Math.max(this.resumeGraceTimer || 0, 0.45);
		if (this.startingGame) return;
		if (
			this.startTransitionUntil &&
			performance.now() < this.startTransitionUntil
		) {
			return;
		}
		if (this.isStarted && !this.isPaused) {
			this.autoPausedByVisibility = true;
			this.setPaused(true);
		}
	}

	onAppVisible(reason = "resume") {
		this.gameLoop?.resetDelta?.();
		this.applyRendererSizing();
		if (loadingOverlay && loadingOverlay.style.display !== "none") {
			loadingOverlay.style.display = "none";
		}
		if (this.isMobile()) {
			setTimeout(() => this.applyRendererSizing(), 120);
			setTimeout(() => this.applyRendererSizing(), 320);
		}
		this.recoverViewState(reason);
		this.resumeGraceTimer = Math.max(this.resumeGraceTimer || 0, 0.45);
		this.propVisibilityTimer = 0.2;
		this.rainUpdateAccumulator = 0;
		if (
			this.isMobile() &&
			this.autoPausedByVisibility &&
			this.isPaused &&
			this.isStarted
		) {
			this.setPaused(false);
		}
		if (this.map?.updatePropVisibility && this.player?.position) {
			this.map.updatePropVisibility(this.player.position);
			this.lastPropVisibilityPos.copy(this.player.position);
		}
	}

	hideStartScreen() {
		document.body?.classList?.add("game-started");
		const startScreen = document.getElementById("startScreen");
		if (!startScreen) return;
		startScreen.style.opacity = "0";
		startScreen.style.visibility = "hidden";
		startScreen.style.pointerEvents = "none";
		startScreen.style.display = "none";
		this.hud?.show?.();
	}

	showStartScreen() {
		document.body?.classList?.remove("game-started");
		const startScreen = document.getElementById("startScreen");
		if (!startScreen) return;
		startScreen.style.opacity = "1";
		startScreen.style.visibility = "visible";
		startScreen.style.pointerEvents = "auto";
		startScreen.style.display = "grid";
	}

	async initializeGame() {
		console.log("[initGame] START, isMobile:", this.isMobile());
		try {
			const isMobile = this.isMobile();
			console.log("[initGame] creating scene...");
			this.scene = new THREE.Scene();
			console.log("[initGame] scene created:", !!this.scene);
			this.scene.userData.mobileMode = isMobile;
			this.scene.fog = new THREE.FogExp2(0x8899aa, 0.0008);
			this.camera = new THREE.PerspectiveCamera(
				75,
				window.innerWidth / window.innerHeight,
				0.05,
				400,
			);
			this.scene.userData.camera = this.camera;

			this.renderer = new THREE.WebGLRenderer({
				antialias: false,
				powerPreference: "high-performance",
				precision: "highp",
				stencil: false,
				depth: true,
				logarithmicDepthBuffer: false,
			});
			this.renderer.setSize(window.innerWidth, window.innerHeight);
			this.renderer.shadowMap.enabled = false;
			this.renderer.sortObjects = false; // Disable sorting for FPS
			this.renderer.polygonOffset = false;
			this.renderer.outputColorSpace = THREE.SRGBColorSpace;
			this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
			this.renderer.toneMappingExposure = 1.15;
			this.renderer.frustumCulled = true; // Enable frustum culling globally
			this.renderer.autoClear = true; // Auto-clear buffers (default, but explicit)

			this.camera.position.set(0, 1.5, 0);
			this.cameraController = new CameraController(
				this.scene,
				this.camera,
				this.renderer.domElement,
			);
			this.cameraController.init(isMobile);

			this.input = new InputController({
				domElement: this.renderer.domElement,
			});
			this.input.attachListeners();
			this.audioSynth = new AudioSynth();
			this.hud = new HUD();

			// Insert canvas AFTER HUD so HUD panels can capture pointer events
			const gameRootEl = document.getElementById("gameRoot");
			if (gameRootEl) {
				gameRootEl.appendChild(this.renderer.domElement);
			} else {
				document.body.appendChild(this.renderer.domElement);
			}

			// Init audio in background — sync phase (audioContext) completes immediately, async phase (worker + samples) runs in background
			this.audioSynth.init().catch(() => {});

			this.roundMode = "hybrid";
			this.perk = "none";
			this.partyMode = false;
			this.perkLocked = false;
			this.modeConfig = {
				...ROUND_MODES.hybrid,
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
			this.hudStatsTimer = 0.08; // Start at max interval to avoid immediate update on first frame
			this.hudInventoryTimer = 0.1; // Start at max interval to avoid immediate update on first frame
			this.lastInventorySignature = "";
			this.lastCountdownSecond = null;
			this.noteCooldown = 0;
			this.achievementState = {
				firstBlood: false,
				hunter: false,
				scavenger: false,
				survivor: false,
			};
			this.claimedKillRewards = new Set();
			this.queuedKillRewards = new Set();
			this.killRewardQueue = [];
			this.killRewardActive = false;
			this.randomEventTimer =
				GAME_CONFIG.events.randomTimerMin +
				Math.random() * GAME_CONFIG.events.randomTimerVariance;
			this.activeEvent = { type: null, timer: 0, prevFog: null };
			this.eventDeck = [];
			this.lastEventType = null;
			this.eventTimeline = [
				{ at: 150, type: "night", duration: 55 },
				{
					at: 220,
					type: "radiationRain",
					duration: GAME_CONFIG.events.radiation.durationSeconds,
				},
				{ at: 380, type: "night", duration: 65 },
			];
			this.eventTimelineIndex = 0;
			this.radiationRainGraceTimer = 0;
			this.radiationRainDamageActive = false;
			this.resumeGraceTimer = 0;
			this.lastVisibilityHiddenAt = 0;
			this.rainUpdateAccumulator = 0;
			this.weatherSyncTimer = 0;
			this.lastWeatherType = "clear";
			this.lastAudioWeatherType = "clear";
			this.lastAmbientBiome = null;
			this.poiWarmupTimer = 0;
			this.zombieMaintainTimer = 3.6;
			this.roundStartTime = performance.now() * 0.001;
			this.waveTimer = GAME_CONFIG.events.waveIntervalSeconds;
			this.platformGateCycleOpen = false;
			this.platformGateCycleTimer = 45;
			this.platformGateWarning10 = false;
			this.platformGateEvacuationStarted = false;
			this.fullChestRefillDone = false;

			this.env = new Environment(this.scene);
			this.env.enableWeather = false;
			this.audioSynth?.setWeatherState?.(
				this.env.getWeatherType?.() || "clear",
			);

			// Map generation
			this.map = new MapGenerator(this.scene);
			this.map.onProgress = (ratio, status) => {
				smoothSetProgress(ratio * 0.5, status);
			};
			this.map.startGeneration();

			// Wait for map generation to complete (populates spawnPads)
			await this.map._generatePromise;

			this.map.finalizeColliders();

			// Performance: setup LOD and frustum culling
			this.map.setupLOD?.(this.isMobile());
			this.map.enableOptimizedCulling?.();

			this.physics = new Physics(this.scene, this.map);
			this.zone = new Zone(this.scene, this.map.size);
			this.zoneDuration = GAME_CONFIG.zone.durationSeconds;
			this.zoneMinRadius = 9999;
			this.zone.shrink(this.zone.getCurrentRadius());
			this.zone.shrinkSpeed = 0;
			this.traps = this.map.getTraps?.() || [];
			this.localFogZones = this.map.getFogZones?.() || [];
			this.propVisibilityTimer = 0;
			this.lastPropVisibilityPos = new THREE.Vector3(99999, 99999, 99999);
			this._lastCullPos = new THREE.Vector3(99999, 99999, 99999);
			this.radiationRainEffect = null;
			this.radiationRainActive = false;
			this.initRadiationRainEffect();

			this.entityManager = new EntityManager(this.scene);
			this.entityManager.physicsRef = this.physics;
			this.entityManager.mapGenerator = this.map;
			this.entityManager.audioSynth = this.audioSynth;
			this.scene.userData.entityManager = this.entityManager;
			this.zombiePool = new ZombiePool(
				this.scene,
				this.physics,
				this.entityManager,
			);
			await this.zombiePool.prewarm(isMobile ? 16 : 24);
			this.lootManager = new LootManager(this.scene, this.map);
			this.lootEvents = 0; // counter for test validation

			this.player = new Player(this.scene, this.camera, this.input);
			this.player.setHUD(this.hud);
			this.player.mapRef = this.map;
			this.player.updateViewWeapon();
			this.bots = [];
			this.botBrains = [];
			this.zombies = [];
			this.environmentEntities = [];
			this.environmentUpdateIndex = 0;
			this.zombieUpdateIndex = 0;
			this.corpseCleanupTimer = 0;
			this.botUpdateIndex = 0;
			this.botFrameCounter = 0;
			this.botHazardCursor = 0;
			this.trapBotCursor = 0;
			this.pendingZombieBursts = [];
			this.pendingPoiBursts = [];
			this.spawnBurstCooldown = 0;
			this.zombieSpawnCandidates = [];
			this.zombieSpawnCursor = 0;
			this.zombieSpawnCandidatesByBiome = [[], [], [], []];
			this.zombieSpawnBiomeCursors = [0, 0, 0, 0];
			this.zombieSpawnBiomeCursor = 0;
			this.poiSpawnCandidates = [];
			this.poiSpawnCursor = 0;
			this.spawnPlayerAndBots();
			this.rebuildSpawnCaches();
			this.spawnEnvironmentEntities();
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
			this.centerBlast = {
				active: false,
				timer: 0,
				radius: 0,
				cooldown: 0,
			};
			this.centerBlastVfx = null;
			this.laserGraceTimer = 0;
			this.minimapTimer = 0.18; // Start at max interval to avoid immediate update on first frame
			this.noBugCheckTimer = 0;
			this.poiZombieSeeded = false;
			this.isPaused = false;
			this.autoPausedByVisibility = false;

			this.gameState = "countdown";
			this.countdownTime = GAME_CONFIG.round.countdownSeconds;
			this.countdownTimer = this.countdownTime;
			this.lastCountdownSecond = null;
			// Test mode: keep countdown long enough for tests to verify spawn positions
			if (window.__kilo_test__) {
				this.countdownTimer = 5;
			}
			this.spawnTime = GAME_CONFIG.round.preFightInvulnerableSeconds;
			this.spawnTimer = this.spawnTime;
			this.weaponPrewarmQueue = [
				"bow",
				"pistol",
				"rifle",
				"machinegun",
				"shotgun",
				"flamethrower",
				"laser",
				"bazooka",
			];
			this.weaponPrewarmAt = 0;
			this.botLootPhaseDuration = GAME_CONFIG.round.botLootPhaseSeconds;
			this.zonePhase = "waiting";
			this.zonePhaseTimer = GAME_CONFIG.zone.waitStartSeconds;
			this.zonePhaseIndex = 0;
			this.zonePhaseCount = GAME_CONFIG.zone.phaseCount;
			this.zonePhaseTarget = this.zone.getCurrentRadius();
			this.chestRespawnTimer = 55;

			this.gameLoop = new GameLoop(this);
			this.gameLoop.start();
			this.applyRoundMode("hybrid");
			this.applyUserSettings(this.loadUserSettings());
			this.hud.setPerkSelectionEnabled(true);
			this.hud.setPerkPanelLock(true);
			this.hud.showGameMessage(
				this.isMobile()
					? "Выберите перк до старта матча"
					: "Выберите перк до старта матча. Клавиша P",
			);
			this.perkMenuOpen = false;
			this.perkSelectionRequired = true;
			this.hud.togglePerkPanel(false);

			window.addEventListener("resize", () => {
				this.applyRendererSizing();
				this.updateOrientationUI();
			});

			document.addEventListener("fullscreenchange", () => {
				if (!document.fullscreenElement) {
					this.recoverViewState("fullscreen-exit");
					if (!this.startingGame && this.isStarted && !this.isPaused) {
						this.setPaused(true);
					}
				}
			});
			document.addEventListener("visibilitychange", () => {
				if (document.hidden) {
					this.onAppHidden();
					return;
				}
				this.onAppVisible("visibility-resume");
			});
			window.addEventListener("blur", () => {
				this.onAppHidden();
			});
			window.addEventListener("focus", () => {
				this.onAppVisible("focus");
			});
			window.addEventListener("pageshow", () => {
				this.onAppVisible("pageshow");
			});
			window.addEventListener("pagehide", () => {
				this.onAppHidden();
			});

			const canvas = this.renderer.domElement;
			canvas.addEventListener(
				"webglcontextlost",
				(event) => {
					event.preventDefault();
					this.onAppHidden();
				},
				false,
			);
			canvas.addEventListener("webglcontextrestored", () => {
				this.onAppVisible("webglcontextrestored");
			});

			document.addEventListener("togglePause", () => {
				this.setPaused(!this.isPaused);
			});

			document.addEventListener("rebindKey", (e) => {
				if (!e?.detail) return;
				this.input.setKeyRemap(e.detail.action, e.detail.code);
			});
			this._easterKeyBuffer = "";
			this._easterMobileBuffer = [];
			this._easterBufferTimer = 0;
			document.addEventListener("keydown", (e) => {
				if (!/^\d$/.test(e.key || "")) return;
				this._easterKeyBuffer = (this._easterKeyBuffer + e.key).slice(-6);
				clearTimeout(this._easterBufferTimer);
				this._easterBufferTimer = setTimeout(
					() => (this._easterKeyBuffer = ""),
					3000,
				);
				if (this._easterKeyBuffer === "787898") this.toggleInvincibility();
			});
			document.addEventListener("mobileAction", (e) => {
				const sequence = [
					"Space",
					"MouseLeft",
					"Space",
					"MouseLeft",
					"KeyE",
					"Space",
				];
				this._easterMobileBuffer.push(e.detail);
				if (this._easterMobileBuffer.length > sequence.length)
					this._easterMobileBuffer.shift();
				if (
					sequence.every(
						(key, index) => this._easterMobileBuffer[index] === key,
					)
				) {
					this.toggleInvincibility();
					this._easterMobileBuffer.length = 0;
				}
			});
			console.log(
				"[initGame] done:",
				!!this.scene,
				!!this.camera,
				!!this.renderer,
			);
		} catch (err) {
			console.error("[Game] initializeGame failed:", err);
			throw err;
		}
	}

	toggleInvincibility() {
		if (!this.player) return;
		this._invincible = !this._invincible;
		this.player.infiniteHealth = this._invincible;
		this.player.setInvulnerable(this._invincible);
		if (this._invincible) this.player.health = this.player.maxHealth;
		this.hud?.updateHealth?.(this.player.health, this.player.maxHealth);
		this.hud?.showGameMessage?.(
			`Пасхалка: бессмертие ${this._invincible ? "включено" : "выключено"}!`,
		);
	}

	setPaused(value) {
		const needsFullscreen =
			!value && this.isStarted && !document.fullscreenElement;
		let fullscreenRequest = null;
		if (needsFullscreen) {
			fullscreenRequest = this.enterFullscreen();
			if (this.isMobile()) this.lockOrientation();
		}
		this.isPaused = value;
		if (!this.isPaused) {
			this.autoPausedByVisibility = false;
		}
		this.hud.showPause(this.isPaused && !this.killRewardActive);
		this.input?.clearInputState?.();
		if (this.isPaused) this.yandex?.gameplayStop?.();
		else this.yandex?.gameplayStart?.();
		if (!this.isMobile()) {
			document.body.style.cursor = this.isPaused ? "auto" : "none";
			if (this.renderer?.domElement) {
				this.renderer.domElement.style.cursor = this.isPaused ? "auto" : "none";
			}
		}
		if (this.cameraController && !this.isMobile()) {
			if (this.isPaused && this.cameraController.isLocked)
				this.cameraController.unlock();
			if (!this.isPaused && !this.cameraController.isLocked) {
				if (fullscreenRequest)
					fullscreenRequest.finally(() => this.cameraController.lock());
				else this.cameraController.lock();
			}
		}
		if (!this.isPaused) {
			this.gameLoop?.resetDelta?.();
			setTimeout(() => this.recoverViewState("post-unpause"), 40);
		}
	}

	recoverViewState(_reason = "resume") {
		// CameraController автоматически восстанавливает состояние при разблокировке.
		// Мы просто сбрасываем ввод.
		this.input?.clearInputState?.();
		this.input?.resetLook?.();
	}

	spawnBots() {
		if (this.botSpawnStarted || this.bots.length) return;
		this.botSpawnStarted = true;
		// Player uses pad[0], bots use pads[1..] — each entity gets strictly its own pad
		const spawnPads = this.map.getSpawnPads?.() || [];
		const botPads = spawnPads.length > 1 ? spawnPads.slice(1) : spawnPads;

		// YieldScheduler: разбиваем спавн ботов на чанки для предотвращения фризов
		this.yieldScheduler.registerTask(
			"spawnBots",
			(pad, index) => {
				const botHeight = 1.7;
				const spawnPos = new THREE.Vector3(pad.x, pad.y + botHeight, pad.z);

				const bot = new Bot(this.scene, index, spawnPos);
				bot.mapRef = this.map;
				bot.physics.onGround = true;
				bot.isFrozen = true;
				bot.state = "spawn";
				bot.target = null;
				bot.patrolTarget = null;
				bot.noCombatUntil =
					performance.now() + this.botLootPhaseDuration * 1000;
				bot.pickupLoot?.({ type: "weapon", weaponType: "knife" });
				this.physics.addEntity(bot);
				this.entityManager.addEntity(bot);
				this.bots.push(bot);
				const brain = new BotBrain();
				brain.visionMultiplier = this.modeConfig.botVision;
				this.botBrains.push(brain);

				if (index < 3) {
					console.log(
						`[SpawnDebug] Bot ${index}: spawn=(${spawnPos.x.toFixed(2)}, ${spawnPos.z.toFixed(2)}) distFromCenter=${Math.sqrt(pad.x * pad.x + pad.z * pad.z).toFixed(2)}`,
					);
				}
			},
			{
				priority: "HIGH",
				chunkSize: 5,
				onComplete: () => this._onBotsSpawned(),
			},
		);

		// Запускаем спавн с yield-контролем
		this.yieldScheduler.startTask("spawnBots", botPads);
	}

	_onBotsSpawned() {
		this.botSpawnCompleted = true;
		this.setupBotLodBatch();
	}

	setupBotLodBatch() {
		this.botLodBatch?.parent?.remove(this.botLodBatch);
		if (!this.bots.length) return;
		const group = new THREE.Group();
		const parts = [
			["shirt", new THREE.BoxGeometry(0.9, 1, 0.5), 1.05],
			["skin", new THREE.BoxGeometry(0.65, 0.65, 0.65), 1.9],
			["pants", new THREE.BoxGeometry(0.72, 0.8, 0.34), 0.4],
			["hair", new THREE.BoxGeometry(0.69, 0.22, 0.69), 2.24],
		];
		this.botLodBatches = [];
		this.botLodBatchesByVariant = Array.from(
			{ length: this.bots[0].variants.length },
			() => [],
		);
		for (let variant = 0; variant < this.bots[0].variants.length; variant++) {
			const outfit = this.bots[0].variants[variant];
			for (const [colorKey, geometry, y] of parts) {
				const material = new THREE.MeshBasicMaterial({
					color: outfit[colorKey] || 0x5588aa,
					fog: false,
					toneMapped: false,
				});
				const batch = new THREE.InstancedMesh(
					geometry,
					material,
					this.bots.length,
				);
				batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
				batch.frustumCulled = false;
				batch.count = 0;
				batch.userData.entityLodBatch = true;
				batch.userData.variant = variant;
				batch.userData.localMatrix = new THREE.Matrix4().makeTranslation(
					0,
					y,
					0,
				);
				this.botLodBatches.push(batch);
				this.botLodBatchesByVariant[variant].push(batch);
				group.add(batch);
			}
		}
		for (const bot of this.bots) {
			bot.mesh.userData.useBatchedLod = true;
			if (bot.mesh.userData.lodProxy)
				bot.mesh.userData.lodProxy.visible = false;
		}
		this.scene.add(group);
		this.botLodBatch = group;
		this._botLodMatrix = new THREE.Matrix4();
		this._botLodCounts = new Uint16Array(this.botLodBatchesByVariant.length);
	}

	updateBotLodBatch(delta = 0.016) {
		const batches = this.botLodBatches;
		if (!batches?.length) return;
		this.botLodUpdateTimer = (this.botLodUpdateTimer || 0) - delta;
		if (this.botLodUpdateTimer > 0) return;
		this.botLodUpdateTimer = this.isMobile() ? 0.05 : 0.033;
		const counts = this._botLodCounts;
		counts.fill(0);
		for (const bot of this.bots) {
			if (!bot.isAlive || bot._lodDetailed !== false) continue;
			bot.mesh.updateMatrixWorld(true);
			const variant =
				bot.variant >= 0 && bot.variant < counts.length ? bot.variant : 0;
			const count = counts[variant]++;
			for (const batch of this.botLodBatchesByVariant[variant]) {
				this._botLodMatrix.multiplyMatrices(
					bot.mesh.matrixWorld,
					batch.userData.localMatrix,
				);
				batch.setMatrixAt(count, this._botLodMatrix);
			}
		}
		for (const batch of batches) {
			batch.count = counts[batch.userData.variant];
			batch.visible = batch.count > 0;
			batch.instanceMatrix.needsUpdate = true;
		}
	}

	ensureZombieLodBatch(zombie) {
		if (!zombie?.mesh?.userData?.lodProxy) return null;
		if (!this.zombieLodBatchGroup) {
			this.zombieLodBatchGroup = new THREE.Group();
			this.zombieLodBatchGroup.userData.entityLodBatch = true;
			this.zombieLodBatches = new Map();
			this._zombieLodMatrix = new THREE.Matrix4();
			this.scene.add(this.zombieLodBatchGroup);
		}
		let batch = this.zombieLodBatches.get(zombie.variant);
		if (!batch) {
			const proxy = zombie.mesh.userData.lodProxy;
			const material = proxy.material.clone();
			batch = new THREE.InstancedMesh(proxy.geometry, material, 256);
			batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
			batch.frustumCulled = false;
			batch.count = 0;
			batch.userData.entityLodBatch = true;
			batch.userData.variant = zombie.variant;
			batch.userData.capacity = 256;
			this.zombieLodBatches.set(zombie.variant, batch);
			this.zombieLodBatchGroup.add(batch);
		}
		zombie.mesh.userData.useBatchedLod = true;
		zombie.mesh.userData.lodProxy.visible = false;
		return batch;
	}

	updateZombieLodBatch(delta = 0.016) {
		this.zombieLodUpdateTimer = (this.zombieLodUpdateTimer || 0) - delta;
		if (this.zombieLodUpdateTimer > 0) return;
		this.zombieLodUpdateTimer = this.isMobile() ? 0.066 : 0.045;
		if (this.zombieLodBatches) {
			for (const batch of this.zombieLodBatches.values())
				batch.userData.nextCount = 0;
		}
		for (const zombie of this.zombies) {
			if (
				!zombie?.isAlive ||
				zombie._lodDetailed !== false ||
				zombie.burnTimer > 0
			)
				continue;
			const batch = this.ensureZombieLodBatch(zombie);
			if (!batch) continue;
			const index = batch.userData.nextCount || 0;
			if (index >= batch.userData.capacity) continue;
			zombie.mesh.updateMatrixWorld(true);
			this._zombieLodMatrix.copy(zombie.mesh.matrixWorld);
			batch.setMatrixAt(index, this._zombieLodMatrix);
			batch.userData.nextCount = index + 1;
		}
		if (!this.zombieLodBatches) return;
		for (const batch of this.zombieLodBatches.values()) {
			batch.count = batch.userData.nextCount || 0;
			batch.visible = batch.count > 0;
			if (batch.visible) batch.instanceMatrix.needsUpdate = true;
		}
	}

	_updateCountdownState(delta) {
		const dt = Number.isFinite(delta) ? delta : 0.016;
		const now = performance.now();
		if (this.weaponPrewarmQueue?.length && now >= this.weaponPrewarmAt) {
			Weapon.prewarm(this.weaponPrewarmQueue.shift());
			this.weaponPrewarmAt = now + (this.isMobile() ? 180 : 110);
		}
		this.countdownTimer -= dt;
		const sec = Math.max(0, Math.ceil(this.countdownTimer));
		if (sec !== this.lastCountdownSecond) {
			this.lastCountdownSecond = sec;
			if (sec > 0) {
				this.audioSynth?.playTimerTick?.(sec <= 3 ? 1.25 : 0.9);
			}
		}

		this.player.setInvulnerable(true);
		this.bots.forEach((bot) => bot.setInvulnerable(true));
		this.player.isFrozen = true;
		// Freeze bots during countdown — they should be static like the player
		this.bots.forEach((bot) => {
			bot.isFrozen = true;
		});
		this.player.isCameraFrozen = true;

		this.hud.showCountdown(sec);

		if (this.countdownTimer <= 0) {
			BotBrain.clearReservations();
			if (!this.perkLocked) {
				this.applyPerk("quickHands");
				this.perkLocked = true;
			}
			this.spawnScatterInitialized = false;
			this._spawnScatterWork = null;
			this.gameState = "spawn";
			this.perkLocked = true;
			this.perkSelectionRequired = false;
			this.perkMenuOpen = false;
			this.hud.setPerkPanelLock(false);
			this.hud.togglePerkPanel(false);
			if (this.renderer?.domElement)
				this.renderer.domElement.style.pointerEvents = "auto";
			this.hud.setPerkSelectionEnabled(false);
			this.hud.hideCountdown();
			const hudRoot = document.getElementById("hud");
			if (hudRoot) {
				hudRoot.style.display = "block";
				hudRoot.style.visibility = "visible";
				hudRoot.style.opacity = "1";
			}
			this.hud.updateHealth(this.player.health, this.player.maxHealth);
			this.hud.updateArmor(this.player.armor, this.player.maxArmor);
			this.hud.updateAmmo(this.player.currentWeapon || this.player.fists);
			this.hud.showGameMessage(
				"Добро пожаловать на Голодные игры, выживет сильнейший!",
			);
			this.audioSynth.playBoxArrival?.(new THREE.Vector3(0, 1, 0));
			this.centerPlatformOpen = true;
			this.map?.setBiomeGatesOpen?.(true);
			this.map?.setSpawnPadCollidersEnabled?.(false);
			this.player.isFrozen = false;
			this.player.isCameraFrozen = false;
			this.player._frozenCamPos = null;
			this.bots.forEach((bot) => {
				bot.isFrozen = false;
			});
		}
	}

	_updateSpawnState(delta) {
		this.spawnTimer -= delta;
		this.player.isFrozen = false;
		this.player.isCameraFrozen = false;
		this.player.lastCameraPosition = null;
		this.bots.forEach((bot) => {
			bot.isFrozen = false;
		});

		if (!this.spawnScatterInitialized && !this._spawnScatterWork) {
			const floor =
				this.map.getNavigationTiles?.() || this.map.getFloorTiles?.() || [];
			const minR = (this.map.spawnCourtyardRadius || 54) + 18;
			const biomeDefs = [
				["forest", (t) => t.x < -5 && t.z < -5],
				["maze", (t) => t.x > 5 && t.z < -5],
				["military", (t) => t.x < -5 && t.z > 5],
				["ice", (t) => t.x > 5 && t.z > 5],
			];
			const pools = biomeDefs.map(([, test]) =>
				floor.filter((t) => {
					const r = Math.hypot(t.x, t.z);
					return (
						r > minR &&
						r < (this.map.halfSize || 256) - 18 &&
						test(t) &&
						this.map.isWalkableAt?.(t.x, t.z) !== false
					);
				}),
			);
			const usedByBiome = pools.map(() => new Set());
			const assignedCounts = [0, 0, 0, 0];
			const assignmentLimits = [25, 25, 25, Math.max(0, this.bots.length - 75)];
			const biomeAngles = [
				-Math.PI * 0.75,
				-Math.PI * 0.25,
				Math.PI * 0.75,
				Math.PI * 0.25,
			];
			this._spawnScatterWork = {
				biomeDefs,
				pools,
				usedByBiome,
				assignedCounts,
				assignmentLimits,
				biomeAngles,
				cursor: 0,
			};
		}

		if (!this.spawnScatterInitialized && this._spawnScatterWork) {
			const work = this._spawnScatterWork;
			const {
				biomeDefs,
				pools,
				usedByBiome,
				assignedCounts,
				assignmentLimits,
				biomeAngles,
			} = work;
			const deadline = performance.now() + (this.isMobile() ? 0.75 : 1.25);
			const batchEnd = Math.min(
				this.bots.length,
				work.cursor + (this.isMobile() ? 4 : 8),
			);
			let i = work.cursor;
			for (; i < batchEnd && performance.now() < deadline; i++) {
				const bot = this.bots[i];
				let biomeIndex =
					bot.position.x < 0
						? bot.position.z < 0
							? 0
							: 2
						: bot.position.z < 0
							? 1
							: 3;
				if (assignedCounts[biomeIndex] >= assignmentLimits[biomeIndex]) {
					const spawnAngle = Math.atan2(bot.position.z, bot.position.x);
					let bestIndex = -1;
					let bestDelta = Infinity;
					for (let b = 0; b < biomeDefs.length; b++) {
						if (assignedCounts[b] >= assignmentLimits[b]) continue;
						const deltaAngle = Math.abs(
							Math.atan2(
								Math.sin(spawnAngle - biomeAngles[b]),
								Math.cos(spawnAngle - biomeAngles[b]),
							),
						);
						if (deltaAngle < bestDelta) {
							bestDelta = deltaAngle;
							bestIndex = b;
						}
					}
					if (bestIndex >= 0) {
						biomeIndex = bestIndex;
					} else {
						let minCount = Infinity;
						for (let b = 0; b < biomeDefs.length; b++) {
							if (assignedCounts[b] < minCount) {
								minCount = assignedCounts[b];
								biomeIndex = b;
							}
						}
					}
				}
				assignedCounts[biomeIndex]++;
				const pool = pools[biomeIndex];
				const used = usedByBiome[biomeIndex];
				bot.target = null;
				bot.assistTarget = null;
				bot.allies = [];
				bot.state = "spawn";
				let scatter = null;
				if (pool.length) {
					for (let k = 0; k < pool.length; k++) {
						const idx = (Math.floor(i / 4) * 17 + k * 23) % pool.length;
						if (!used.has(idx)) {
							used.add(idx);
							scatter = pool[idx];
							break;
						}
					}
				}
				if (scatter) {
					bot.patrolTarget = new THREE.Vector3(scatter.x, 0, scatter.z);
				} else {
					const signs = [
						[-1, -1],
						[1, -1],
						[-1, 1],
						[1, 1],
					][biomeIndex];
					const offset = 78 + (Math.floor(i / 4) % 5) * 6;
					bot.patrolTarget = new THREE.Vector3(
						signs[0] * offset,
						0,
						signs[1] * offset,
					);
				}
				bot.assignedBiome = biomeDefs[biomeIndex][0];
				bot.assignedBiomeUntil = performance.now() + 180000;
				const signs = [
					[-1, -1],
					[1, -1],
					[-1, 1],
					[1, 1],
				][biomeIndex];
				const laneIndex = assignedCounts[biomeIndex] - 1;
				const laneOffset = ((laneIndex % 9) - 4) * 0.1;
				const routeOffset = [-16, -16, 16, 20][biomeIndex] + laneOffset;
				const entryDistance = 82 + Math.floor(laneIndex / 9) * 0.35;
				const gateDistance = 51.5;
				const entryX = signs[0] * entryDistance + signs[1] * routeOffset;
				const entryZ = signs[1] * entryDistance - signs[0] * routeOffset;
				bot.assignedBiomeGate = new THREE.Vector3(
					signs[0] * gateDistance + signs[1] * laneOffset,
					0,
					signs[1] * gateDistance - signs[0] * laneOffset,
				);
				bot.assignedBiomeThreshold = new THREE.Vector3(
					signs[0] * 62 + signs[1] * laneOffset,
					0,
					signs[1] * 62 - signs[0] * laneOffset,
				);
				bot.assignedBiomeEntry = new THREE.Vector3(entryX, 0, entryZ);
				bot.assignedBiomeTarget = bot.patrolTarget.clone();
			}
			work.cursor = i;
			if (work.cursor >= this.bots.length) {
				this.spawnScatterInitialized = true;
				this._spawnScatterWork = null;
			}
		}

		if (this.spawnTimer <= 0 && this.spawnScatterInitialized) {
			this.gameState = "playing";
			this.setCenterPlatformOpen(true);
			this.platformGateCycleOpen = true;
			this.platformGateCycleTimer = 30;
			this.platformGateWarning10 = false;
			this.platformGateEvacuationStarted = false;
			this.fullChestRefillDone = false;
			this.chestRespawnTimer = 60;
			this.roundStartTime = performance.now() * 0.001;
			this.eventTimelineIndex = 0;
			this.activeEvent = { type: null, timer: 0, prevFog: null };
			this.initialZombieWaveQueued = false;
			const initialZombieTarget = this.isMobile() ? 44 : 60;
			const initialZombieCount = 6;
			this.spawnZombies(true, 1.1, 140, initialZombieCount);
			this.queueZombieBurst(
				false,
				1.1,
				140,
				initialZombieTarget - initialZombieCount,
				2,
			);
			this.queuePoiBurst(0.9, this.isMobile() ? 20 : 28, 1);
			this.randomEventTimer =
				GAME_CONFIG.events.randomTimerMin +
				Math.random() * GAME_CONFIG.events.randomTimerVariance;
			this.startZoneCycle();
			this.player.setInvulnerable(!!this._invincible);
			this.bots.forEach((bot) => bot.setInvulnerable(false));
			const matchStartTime = performance.now();
			for (let i = 0; i < this.bots.length; i++) {
				const bot = this.bots[i];
				bot.noCombatUntil = matchStartTime;
				bot._matchStartTime = matchStartTime;
				bot.target = null;
				bot.assistTarget = null;
				bot.state = "explore";
				bot._fsmCtx = null;
				if (this.botBrains[i]) {
					this.botBrains[i].decisionCooldown =
						(i % 12) * 0.04 + Math.floor(i / 12) * 0.02;
				}
			}
			this.hud.showGameMessage("Выживание началось!");
			this.gateClosed = true;
			this.audioSynth.playStoneDoorClose?.(this.map.getCourtyardExitPosition());
			this.poiWarmupTimer = 7;
		} else {
			this.player.setInvulnerable(true);
			this.bots.forEach((bot) => bot.setInvulnerable(true));
		}

		this.hud.showInvulnerabilityTimer(this.spawnTimer);
	}

	_updatePlayingHazards(delta) {
		this.updatePlatformGateCycle(delta);
		if (!this.poiZombieSeeded && this.poiWarmupTimer > 0) {
			this.poiWarmupTimer = Math.max(0, this.poiWarmupTimer - delta);
			if (this.poiWarmupTimer <= 0) {
				this.queuePoiBurst(
					1.65,
					this.isMobile() ? 16 : 22,
					this.isMobile() ? 4 : 5,
				);
			}
		}
		this.updateZoneCycle(delta);
		this.chestRespawnTimer = Math.max(0, this.chestRespawnTimer - delta);
		if (this.chestRespawnTimer <= 0) {
			const openedCount = this.lootManager.getOpenedChestCount?.() || 0;
			const refillCount = this.fullChestRefillDone
				? Math.max(4, Math.ceil(openedCount * 0.32))
				: openedCount;
			const restored = this.lootManager.refillOpenedChests?.(refillCount) || 0;
			if (restored > 0) {
				if (!this.fullChestRefillDone) {
					this.fullChestRefillDone = true;
					this.hud.showGameMessage?.(
						"Событие: сундуки пополнены и снова закрыты!",
					);
				} else {
					this.hud.showLootNotification?.(
						`Часть сундуков пополнена: ${restored}`,
					);
				}
			}
			this.chestRespawnTimer = 60;
		}

		if (!this.zone.isInsideZone(this.player.position)) {
			const damage = this.zone.getDamage(delta, this.player.position);
			this.player.takeDamage(damage, false, null, 0, "zone");
		}

		if (this.laserActive && this.laserRing) {
			this.laserGraceTimer = Math.max(0, this.laserGraceTimer - delta);
			if (this.laserGraceTimer <= 0) {
				const center =
					this.map?.getCornucopiaCenter?.() || this.laserRing.position;
				const damageCenter = (entity) => {
					if (
						!entity?.isAlive ||
						!entity.position ||
						typeof entity.takeDamage !== "function"
					)
						return;
					const dx = entity.position.x - center.x;
					const dz = entity.position.z - center.z;
					if (dx * dx + dz * dz < 57 * 57) {
						entity.takeDamage(320 * delta, false, null, 0, "laser");
					}
				};
				damageCenter(this.player);
				for (const bot of this.bots) damageCenter(bot);
				for (const zombie of this.zombies) damageCenter(zombie);
			}
		}
		if (
			this.activeEvent?.type === "radiationRain" &&
			this.radiationRainDamageActive &&
			!this.isShelteredFromRadiation(this.player.position)
		) {
			this.player.takeDamage(
				GAME_CONFIG.events.radiation.playerDps * delta,
				false,
				null,
				0,
				"storm",
			);
		}

		const distanceFromZone = this.zone.getDistanceFromZone(
			this.player.position,
		);
		if (distanceFromZone > 0) {
			this.hud.updateZoneInfo(
				`Вне зоны! ${Math.ceil(distanceFromZone)}м`,
				true,
			);
		} else {
			const radius = Math.ceil(this.zone.getCurrentRadius());
			if (this.zonePhase === "shrinking") {
				this.hud.updateZoneInfo(`Зона сужается (радиус ${radius}м)`, true);
			} else if (this.zonePhase === "final") {
				this.hud.updateZoneInfo(`Финальная зона (радиус ${radius}м)`, false);
			} else {
				this.hud.updateZoneInfo(
					`Безопасна: ${Math.ceil(this.zonePhaseTimer)}с (радиус ${radius}м)`,
					false,
				);
			}
		}

		const distanceOutside = this.zone.getDistanceFromZone(this.player.position);
		const fogDensity = this.scene?.fog?.density || 0;
		const nightBoost =
			this.env && (this.env.dayTime < 0.18 || this.env.dayTime > 0.78)
				? 0.14
				: 0;
		const shrinkBoost = this.zonePhase === "shrinking" ? 0.12 : 0;
		const outsideBoost =
			distanceOutside > 0 ? Math.min(0.24, distanceOutside * 0.015) : 0;
		const fogBoost = Math.min(0.24, Math.max(0, fogDensity - 0.004) * 30);
		const radiationBoost =
			this.activeEvent?.type === "radiationRain" &&
			this.radiationRainDamageActive &&
			!this.isShelteredFromRadiation(this.player.position)
				? 0.08
				: 0;
		this.hud.setVisionIntensity?.(
			0.12 +
				nightBoost +
				shrinkBoost +
				outsideBoost +
				fogBoost +
				radiationBoost,
		);
	}

	/**
	 * Spawn player and all bots on strictly reserved spawn pads.
	 * One entity per pad — player gets pad[0], bots get pads[1..N].
	 */
	spawnPlayerAndBots() {
		const spawnPads = this.map.getSpawnPads?.() || [];

		// Spawn player on pad[0]
		if (spawnPads.length > 0) {
			const pad = spawnPads[0];
			const groundY = this.map.raycastGroundY?.(pad.x, pad.z, pad.y) ?? pad.y;
			this.player.position.set(
				pad.x,
				groundY + this.player.physics.height,
				pad.z,
			);
			this.player.physics.onGround = true;
		} else {
			// Fallback to center if no pads
			this.player.position.set(0, 2 + this.player.physics.height, 0);
			this.player.physics.onGround = true;
			console.log("[SpawnDebug] Player spawn: fallback center Y=3.7");
		}

		this.physics.addEntity(this.player);
		this.entityManager.addEntity(this.player);

		// Spawn bots on remaining pads
		this.spawnBots();

		// Verify no two entities share the same pad
		this._verifySpawnUniqueness();
	}

	/**
	 * Verify that no two entities share the same spawn pad.
	 */
	_verifySpawnUniqueness() {
		const entities = [this.player, ...this.bots];
		const padUsage = new Map(); // padIndex -> entityIndex
		let duplicates = 0;

		for (let i = 0; i < entities.length; i++) {
			const ent = entities[i];
			if (!ent || !ent.position) continue;

			// Find which pad this entity is on
			const spawnPads = this.map.getSpawnPads?.() || [];
			let assignedPad = -1;
			for (let p = 0; p < spawnPads.length; p++) {
				const pad = spawnPads[p];
				const dx = ent.position.x - pad.x;
				const dz = ent.position.z - pad.z;
				if (Math.sqrt(dx * dx + dz * dz) < 1.5) {
					assignedPad = p;
					break;
				}
			}

			if (assignedPad >= 0) {
				if (padUsage.has(assignedPad)) {
					duplicates++;
				} else {
					padUsage.set(assignedPad, i);
				}
			}
		}

		if (duplicates === 0) {
		}
	}

	applyRoundMode(mode) {
		this.roundMode = mode || "hybrid";
		const fallback = ROUND_MODES.classic;
		this.modeConfig = { ...(ROUND_MODES[this.roundMode] || fallback) };

		this.hud.setRoundMode(
			this.roundMode === "hybrid"
				? "Hybrid"
				: this.roundMode === "nightmare"
					? "Nightmare"
					: this.roundMode === "stealth"
						? "Stealth"
						: "Classic",
		);

		this.lootManager.setLootDensity(this.modeConfig.lootDensity);
		if (this.player)
			this.player.footstepVolume = this.modeConfig.footstepVolume;
		if (this.scene?.fog) {
			this.scene.fog.density = this.modeConfig.fogDensity;
		}
		for (const brain of this.botBrains) {
			brain.visionMultiplier = this.modeConfig.botVision;
		}
	}

	applyPerk(perk) {
		this.perk = perk || "none";
		if (this.player)
			this.player.applyPerk(this.perk, this.modeConfig.footstepVolume);
		const perkLabel =
			this.perk === "quickHands"
				? "\u0411\u044b\u0441\u0442\u0440\u044b\u0435 \u0440\u0443\u043a\u0438"
				: this.perk === "silentStep"
					? "\u0422\u0438\u0445\u0438\u0439 \u0448\u0430\u0433"
					: this.perk === "moreAmmo"
						? "\u0411\u043e\u043b\u044c\u0448\u0435 \u043f\u0430\u0442\u0440\u043e\u043d\u043e\u0432"
						: this.perk === "fastRun"
							? "\u0411\u044b\u0441\u0442\u0440\u044b\u0439 \u0431\u0435\u0433"
							: this.perk === "thickSkin"
								? "\u041f\u043b\u043e\u0442\u043d\u0430\u044f \u043a\u043e\u0436\u0430"
								: this.perk === "steadyAim"
									? "\u0421\u0442\u0430\u0431\u0438\u043b\u044c\u043d\u044b\u0439 \u043f\u0440\u0438\u0446\u0435\u043b"
									: this.perk === "autoFire"
										? "\u0410\u0432\u0442\u043e\u0441\u0442\u0440\u0435\u043b\u044c\u0431\u0430"
										: "-";
		this.hud.setPerk(perkLabel);
	}

	loadUserSettings() {
		try {
			const raw = localStorage.getItem("mazearena_settings");
			const saved = raw ? JSON.parse(raw) : {};
			return {
				musicVolume: Math.max(
					0,
					Math.min(0.4, Number(saved.musicVolume ?? 0.17)),
				),
				sfxVolume: Math.max(0, Math.min(1, Number(saved.sfxVolume ?? 0.48))),
				lookSensitivity: Math.max(
					0.5,
					Math.min(2.4, Number(saved.lookSensitivity ?? 1)),
				),
			};
		} catch (_) {
			return { musicVolume: 0.17, sfxVolume: 0.48, lookSensitivity: 1 };
		}
	}

	saveUserSettings(partial = {}) {
		const current = this.loadUserSettings();
		const next = { ...current, ...partial };
		localStorage.setItem("mazearena_settings", JSON.stringify(next));
		return next;
	}

	applyUserSettings(settings = {}) {
		const safe = {
			musicVolume: Math.max(
				0,
				Math.min(0.4, Number(settings.musicVolume ?? 0.17)),
			),
			sfxVolume: Math.max(0, Math.min(1, Number(settings.sfxVolume ?? 0.48))),
			lookSensitivity: Math.max(
				0.5,
				Math.min(2.4, Number(settings.lookSensitivity ?? 1)),
			),
		};
		this.audioSynth?.setMusicVolume?.(safe.musicVolume);
		this.audioSynth?.setSfxVolume?.(safe.sfxVolume);
		this.player?.setLookSensitivityMultiplier?.(safe.lookSensitivity);
		this.hud?.setSettingsValues?.(safe);
	}

	resetUserSettings() {
		const defaults = { musicVolume: 0.17, sfxVolume: 0.48, lookSensitivity: 1 };
		localStorage.setItem("mazearena_settings", JSON.stringify(defaults));
		this.applyUserSettings(defaults);
		this.hud?.showGameMessage?.("Настройки сброшены");
	}

	assignFriendlyBots(count = 2) {
		if (!this.bots.length) return;
		const picks = [...this.bots]
			.sort(() => Math.random() - 0.5)
			.slice(0, count);
		for (const bot of picks) {
			bot.allies = bot.allies || [];
			if (!bot.allies.includes(this.player)) bot.allies.push(this.player);
			bot.teamId = 1;
		}
		this.hud.showGameMessage(
			"\u0421\u043e\u044e\u0437\u043d\u0438\u043a\u0438 \u043f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u0438\u043b\u0438\u0441\u044c!",
		);
	}

	handleQuickCommands(delta) {
		if (this.quickCommandCooldown > 0) {
			this.quickCommandCooldown = Math.max(
				0,
				this.quickCommandCooldown - delta,
			);
		}
		const helpPressed = this.input.isKeyPressed("KeyZ");
		const enemyPressed = this.input.isKeyPressed("KeyX");
		const gatherPressed = this.input.isKeyPressed("KeyC");

		if (
			helpPressed &&
			!this.commandState.help &&
			this.quickCommandCooldown === 0
		) {
			this.hud.showQuickCommand(
				"\u041f\u043e\u043c\u043e\u0433\u0438\u0442\u0435!",
			);
			this.quickCommandCooldown = 0.6;
		}
		if (
			enemyPressed &&
			!this.commandState.enemy &&
			this.quickCommandCooldown === 0
		) {
			this.hud.showQuickCommand(
				"\u0412\u0440\u0430\u0433 \u0441\u043f\u0435\u0440\u0435\u0434\u0438!",
			);
			this.quickCommandCooldown = 0.6;
		}
		if (
			gatherPressed &&
			!this.commandState.gather &&
			this.quickCommandCooldown === 0
		) {
			this.hud.showQuickCommand(
				"\u0421\u043e\u0431\u0435\u0440\u0451\u043c\u0441\u044f \u0432\u043c\u0435\u0441\u0442\u0435!",
			);
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

	_updatePerkMenu() {
		const canSelectPerk = this.gameState === "countdown" && !this.perkLocked;
		if (this.input.isKeyPressed("KeyP") && canSelectPerk) {
			if (!this.perkKeyLatch) {
				this.perkMenuOpen = this.perkSelectionRequired
					? true
					: !this.perkMenuOpen;
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
			const wPressed = this.input.isKeyPressed("KeyW");
			const sPressed = this.input.isKeyPressed("KeyS");
			const ePressed = this.input.isKeyPressed("KeyE");

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
					document.dispatchEvent(
						new CustomEvent("selectPerk", { detail: perk }),
					);
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
				this.hud.showGameMessage(
					"\u0421\u0431\u0440\u043e\u0441 \u0440\u0435\u0434\u043a\u043e\u0433\u043e \u043b\u0443\u0442\u0430!",
				);
			}
		}
	}

	showMvpBoard() {
		const entities = this.entityManager.getEntities();
		const stats = entities
			.filter((e) => e.stats)
			.map((e) => ({
				name:
					e === this.player
						? "\u0418\u0433\u0440\u043e\u043a"
						: e.constructor?.name === "Bot"
							? `NPC #${e.id}`
							: "NPC",
				stats: e.stats,
			}));
		if (!stats.length) return;

		const topDamage = [...stats].sort(
			(a, b) => b.stats.damage - a.stats.damage,
		)[0];
		const topKills = [...stats].sort(
			(a, b) => b.stats.kills - a.stats.kills,
		)[0];
		const topLoot = [...stats].sort((a, b) => b.stats.loot - a.stats.loot)[0];
		const lines = [
			`\u2b50 MVP \u0443\u0440\u043e\u043d: <strong>${topDamage.name}</strong> (${Math.round(topDamage.stats.damage)})`,
			`\ud83d\udd2a MVP \u0443\u0431\u0438\u0439\u0441\u0442\u0432\u0430: <strong>${topKills.name}</strong> (${topKills.stats.kills})`,
			`\ud83c\udf81 MVP \u043b\u0443\u0442: <strong>${topLoot.name}</strong> (${topLoot.stats.loot})`,
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
				!Number.isFinite(pos.x) ||
				!Number.isFinite(pos.y) ||
				!Number.isFinite(pos.z) ||
				pos.y < -20 ||
				Math.abs(pos.x) > maxDistance ||
				Math.abs(pos.z) > maxDistance;
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
		this.gameState = "ended";
		this.setRadiationRainActive(false);
		this.hud.hideScoreboard?.();
		this.hud.showGameOver(message);
	}

	updateAchievements(aliveCount) {
		if (!this.player?.isAlive) return;
		if (!this.achievementState.firstBlood && this.player.stats.kills >= 1) {
			this.achievementState.firstBlood = true;
			this.hud.showGameMessage(
				"\u0414\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u0435: \u041f\u0435\u0440\u0432\u0430\u044f \u043a\u0440\u043e\u0432\u044c",
			);
		}
		if (!this.achievementState.hunter && this.player.stats.kills >= 5) {
			this.achievementState.hunter = true;
			this.hud.showGameMessage(
				"\u0414\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u0435: \u041e\u0445\u043e\u0442\u043d\u0438\u043a",
			);
		}
		if (!this.achievementState.scavenger && this.player.stats.loot >= 8) {
			this.achievementState.scavenger = true;
			this.hud.showGameMessage(
				"\u0414\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u0435: \u041c\u0430\u0440\u043e\u0434\u0435\u0440",
			);
		}
		if (!this.achievementState.survivor && aliveCount <= 5) {
			this.achievementState.survivor = true;
			this.hud.showGameMessage(
				"\u0414\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u0435: \u0412\u044b\u0436\u0438\u0432\u0448\u0438\u0439",
			);
		}
	}

	_checkWinLoseConditions() {
		if (this.gameState !== "playing" || this.roundFinished) return;
		const survivors = this.entityManager.getAliveSurvivors?.() || [];
		if (!this.player?.isAlive) {
			this.endRound("Вы погибли. Нажмите E, чтобы начать новую игру");
		} else if (survivors.length === 0) {
			this.endRound(
				"\u0412 \u0436\u0438\u0432\u044b\u0445 \u043d\u0438\u043a\u043e\u0433\u043e \u043d\u0435 \u043e\u0441\u0442\u0430\u043b\u043e\u0441\u044c. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 E \u0447\u0442\u043e\u0431\u044b \u043d\u0430\u0447\u0430\u0442\u044c \u0437\u0430\u043d\u043e\u0432\u043e",
			);
		} else if (survivors.length === 1 && survivors[0] === this.player) {
			this.endRound(
				"\u041f\u043e\u0431\u0435\u0434\u0430! \u0422\u044b \u043e\u0441\u0442\u0430\u043b\u0441\u044f \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u043c \u0432\u044b\u0436\u0438\u0432\u0448\u0438\u043c. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 E \u0447\u0442\u043e\u0431\u044b \u043d\u0430\u0447\u0430\u0442\u044c \u0437\u0430\u043d\u043e\u0432\u043e",
			);
		}
	}

	_checkStalkerCorpseEasterEgg() {
		if (this.gameState !== "playing" || !this.player?.isAlive) return;
		if (this._easterCorpseTriggered) return;
		if (!this.input.isKeyPressed("KeyE")) return;

		const playerPos = this.player.position;
		const threshold = 3.0;

		// Walk the scene children to find the corpse (use world position)
		this.scene.traverse((obj) => {
			if (obj.userData?.easterEgg && !obj.userData?.easterEggCollected) {
				const worldPos = obj.getWorldPosition(this._tmpEasterPos);
				const dist = playerPos.distanceTo(worldPos);
				if (dist < threshold) {
					obj.userData.easterEggCollected = true;
					this._easterCorpseTriggered = true;
					const weaponType = obj.userData.easterEggWeapon || "bazooka";

					// Give the player the bazooka (unlimited ammo)
					this.player.pickupLoot({ type: "weapon", weaponType });
					this.hud.showGameMessage(
						`\ud83d\udea8 Найден легендарный БАЗУКА! Бесконечные ракеты.`,
					);
					this.audioSynth?.playPickup?.();
				}
			}
		});
	}

	getSafeZoneTarget(position) {
		const v = this._tmpSafeZone.set(position.x, 0, position.z);
		if (v.lengthSq() < 1e-6) {
			this._tmpSafeZone.set(0, position.y, 0);
		} else
			v.normalize().multiplyScalar(
				Math.max(0, this.zone.getCurrentRadius() * 0.6),
			);
		return this._tmpSafeZone;
	}

	initRadiationRainEffect() {
		const dropCount = this.isMobile() ? 84 : 144;
		const geometry = new THREE.BufferGeometry();
		const positions = new Float32Array(dropCount * 6);
		const speeds = new Float32Array(dropCount);
		const lengths = new Float32Array(dropCount);
		const area = this.isMobile() ? 22 : 28;
		for (let i = 0; i < dropCount; i++) {
			speeds[i] = 11 + Math.random() * 10;
			lengths[i] = 0.75 + Math.random() * 0.9;
		}
		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		const material = new THREE.LineBasicMaterial({
			color: 0x61ff48,
			transparent: true,
			opacity: this.isMobile() ? 0.72 : 0.78,
			depthWrite: false,
		});
		const lines = new THREE.LineSegments(geometry, material);
		lines.visible = false;
		lines.renderOrder = 28;
		lines.frustumCulled = false;
		this.scene.add(lines);
		this.radiationRainEffect = { lines, positions, speeds, lengths, area };
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
			if (active && this.player) {
				const effect = this.radiationRainEffect;
				for (let i = 0; i < effect.speeds.length; i++) {
					const idx = i * 6;
					const x =
						this.player.position.x + (Math.random() - 0.5) * effect.area;
					const z =
						this.player.position.z + (Math.random() - 0.5) * effect.area;
					const y = this.map.getHeightAt(x, z) + 7 + Math.random() * 21;
					positionsSetSegment(
						effect.positions,
						idx,
						x,
						y,
						z,
						effect.lengths[i],
					);
				}
				effect.lines.geometry.attributes.position.needsUpdate = true;
			}
		}
		if (this.bots?.length) {
			for (const bot of this.bots) {
				if (!bot) continue;
				bot.forceShelterActive = !!active;
				if (!active && bot.state === "hide") bot.state = "patrol";
			}
		}
		this.hud?.setStormActive?.(!!active, active ? "radiation" : "storm");
		if (active) {
			this.audioSynth?.stopWeatherLoop?.();
			this.audioSynth?.startRadiationRain?.();
		} else {
			this.audioSynth?.stopRadiationRain?.();
			if (this.audioSynth && this.env) {
				const weather = this.env.getWeatherType?.() || "clear";
				this.audioSynth.currentWeatherState = "";
				this.audioSynth.setWeatherState?.(weather);
			}
		}
	}

	updateRadiationRainEffect(delta) {
		if (
			!this.radiationRainActive ||
			!this.radiationRainEffect?.lines ||
			!this.player
		)
			return;
		this.rainUpdateAccumulator = (this.rainUpdateAccumulator || 0) + delta;
		const step = this.isMobile() ? 1 / 36 : 1 / 60;
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
			positions[idx + 4] -= effect.speeds[i] * delta;
			if (
				positions[idx + 1] <=
				this.map.getHeightAt(positions[idx], positions[idx + 2])
			) {
				const x = centerX + (Math.random() - 0.5) * area;
				const z = centerZ + (Math.random() - 0.5) * area;
				const topY = this.map.getHeightAt(x, z) + 18 + Math.random() * 10;
				positionsSetSegment(positions, idx, x, topY, z, effect.lengths[i]);
				effect.speeds[i] = 11 + Math.random() * 10;
			}
		}
		effect.lines.geometry.attributes.position.needsUpdate = true;
	}

	isShelteredFromRadiation(position) {
		return this.map?.isShelteredFromRain?.(position) || false;
	}

	enforceNoBugPolicy(delta) {
		this.noBugCheckTimer = Math.max(0, this.noBugCheckTimer - delta);
		if (this.noBugCheckTimer > 0) return;
		this.noBugCheckTimer = this.isMobile() ? 0.45 : 0.3;

		if (this.isStarted) {
			const startScreen = document.getElementById("startScreen");
			if (startScreen && startScreen.style.display !== "none") {
				this.hideStartScreen();
			}
		}

		const mapSize = this.map?.size || 512;
		const maxAbs = Math.max(1, (this.map?.halfSize || mapSize * 0.5) - 0.75);
		const sanitize = (entity) => {
			if (!entity?.position) return;
			const p = entity.position;
			if (
				!Number.isFinite(p.x) ||
				!Number.isFinite(p.y) ||
				!Number.isFinite(p.z)
			) {
				const pads = this.map.getSpawnPads?.() || [];
				const base = pads[0] || new THREE.Vector3(0, 1.6, 0);
				p.set(base.x, base.y + (entity.physics?.height || 1.8), base.z);
				entity.physics?.velocity?.set?.(0, 0, 0);
				return;
			}
			p.x = Math.max(-maxAbs, Math.min(maxAbs, p.x));
			p.z = Math.max(-maxAbs, Math.min(maxAbs, p.z));
			const surface =
				this.map?.getSurfaceHeightAt?.(p.x, p.z) ??
				this.map?.getHeightAt?.(p.x, p.z) ??
				0.4;
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
					knockback: 11,
				},
			);
			this.environmentEntities.push(barrel);
			this.entityManager.addEntity(barrel);
			this.physics.addEntity(barrel);
		}
		this.environmentUpdateIndex = 0;
	}

	triggerCenterDetonation() {
		const center =
			this.map?.getCornucopiaCenter?.() || new THREE.Vector3(0, 0.8, 0);
		this.centerBlast.active = true;
		this.centerBlast.timer = 5.0;
		this.centerBlast.radius = 18;
		this.centerBlast.cooldown = 0;
		this.map?.detonateCornucopia?.();
		this.audioSynth?.playExplosion?.(center);
	}

	triggerPlatformUnavailable(notify = true) {
		const center =
			this.map?.getCornucopiaCenter?.() || new THREE.Vector3(0, 0.8, 0);
		this.centerPlatformOpen = false;
		this.map?.setBiomeGatesOpen?.(false);
		this.laserGraceTimer = 0.35;
		if (notify)
			this.hud.showGameMessage(
				"Центральная платформа закрыта. Покиньте опасную зону!",
			);
		if (!this.laserRing) {
			const laserRadius = 57;
			const laserSegments = 64;
			const coreGeo = new THREE.TorusGeometry(
				laserRadius,
				0.5,
				16,
				laserSegments,
			);
			const coreMat = new THREE.MeshStandardMaterial({
				color: 0xff2200,
				emissive: 0xff4400,
				emissiveIntensity: 2.0,
				transparent: true,
				opacity: 0.95,
				depthWrite: false,
			});
			this.laserRing = new THREE.Mesh(coreGeo, coreMat);
			this.laserRing.rotation.x = -Math.PI / 2;
			this.laserRing.position.set(center.x, 1.5, center.z);
			this.scene.add(this.laserRing);
			const glowGeo = new THREE.TorusGeometry(
				laserRadius,
				1.5,
				8,
				laserSegments,
			);
			const glowMat = new THREE.MeshBasicMaterial({
				color: 0xff4400,
				transparent: true,
				opacity: 0.25,
				depthWrite: false,
			});
			this.laserGlow = new THREE.Mesh(glowGeo, glowMat);
			this.laserGlow.rotation.x = -Math.PI / 2;
			this.laserGlow.position.copy(this.laserRing.position);
			this.scene.add(this.laserGlow);
			const curtainGeo = new THREE.CylinderGeometry(
				laserRadius,
				laserRadius,
				38,
				laserSegments,
				1,
				true,
			);
			const curtainMat = new THREE.MeshBasicMaterial({
				color: 0xff2200,
				transparent: true,
				opacity: 0.12,
				side: THREE.DoubleSide,
				depthWrite: false,
			});
			this.laserCurtain = new THREE.Mesh(curtainGeo, curtainMat);
			this.laserCurtain.position.set(center.x, 19, center.z);
			this.scene.add(this.laserCurtain);
			const domeGeo = new THREE.SphereGeometry(
				laserRadius,
				48,
				24,
				0,
				Math.PI * 2,
				0,
				Math.PI / 2,
			);
			const domeMat = new THREE.MeshBasicMaterial({
				color: 0xff3d00,
				transparent: true,
				opacity: 0.1,
				side: THREE.DoubleSide,
				depthWrite: false,
			});
			this.laserDome = new THREE.Mesh(domeGeo, domeMat);
			this.laserDome.position.set(center.x, 0.5, center.z);
			this.scene.add(this.laserDome);
		}
		this.laserRing.visible = true;
		this.laserGlow.visible = true;
		this.laserCurtain.visible = true;
		this.laserDome.visible = true;
		this.laserActive = true;
	}

	setCenterPlatformOpen(open) {
		this.centerPlatformOpen = !!open;
		this.map?.setBiomeGatesOpen?.(open);
		this.laserActive = !open;
		for (const mesh of [
			this.laserRing,
			this.laserGlow,
			this.laserCurtain,
			this.laserDome,
		]) {
			if (mesh) mesh.visible = !open;
		}
	}

	updatePlatformGateCycle(delta) {
		this.platformGateCycleTimer = Math.max(
			0,
			this.platformGateCycleTimer - delta,
		);
		if (
			this.platformGateCycleOpen &&
			!this.platformGateWarning10 &&
			this.platformGateCycleTimer <= 10
		) {
			this.platformGateWarning10 = true;
			this.hud.showGameMessage(
				"Внимание: ворота закроются через 10 секунд. Покиньте центр!",
			);
		}
		if (
			this.platformGateCycleOpen &&
			!this.platformGateEvacuationStarted &&
			this.platformGateCycleTimer <= 12
		) {
			this.platformGateEvacuationStarted = true;
			this.evacuateCenterEntities();
		}
		if (this.platformGateCycleTimer > 0) return;
		if (this.platformGateCycleOpen) {
			this.platformGateCycleOpen = false;
			this.platformGateCycleTimer = 45;
			this.platformGateWarning10 = false;
			this.platformGateEvacuationStarted = false;
			this.triggerPlatformUnavailable(false);
			this.hud.showGameMessage(
				"Ворота закрыты. Лазер уничтожает оставшихся в центре!",
			);
			return;
		}
		this.platformGateCycleOpen = true;
		this.platformGateCycleTimer = 30;
		this.platformGateWarning10 = false;
		this.platformGateEvacuationStarted = false;
		this.setCenterPlatformOpen(true);
		this.hud.showGameMessage(
			"Ворота открыты. Через 30 секунд центр закроется и включится лазер!",
		);
	}

	evacuateCenterEntities() {
		const center = this.map?.getCornucopiaCenter?.() || new THREE.Vector3();
		const redirect = (entity) => {
			if (!entity?.isAlive || !entity.position) return;
			const dx = entity.position.x - center.x;
			const dz = entity.position.z - center.z;
			const dist = Math.hypot(dx, dz);
			if (dist >= 62) return;
			const angle =
				dist > 0.1
					? Math.atan2(dz, dx)
					: (Number(entity.id) || 0) * 2.399963229;
			entity.target = null;
			entity.assistTarget = null;
			const evacuationTarget = new THREE.Vector3(
				center.x + Math.cos(angle) * 76,
				entity.position.y,
				center.z + Math.sin(angle) * 76,
			);
			entity.patrolTarget = evacuationTarget;
			entity._fsmCtx = null;
			if (entity.constructor?.name === "Bot") {
				entity.state = "zoneRetreat";
				entity._centerEvacuationTarget = evacuationTarget;
				entity._centerEvacuationUntil = performance.now() + 15000;
			} else {
				entity.alertPosition = evacuationTarget;
				entity.alertTarget = null;
				entity.alertTimer = 15;
			}
		};
		for (const bot of this.bots) redirect(bot);
		for (const zombie of this.zombies) redirect(zombie);
	}

	updateCenterDetonation(delta) {
		if (!this.centerBlast.active) return;
		this.centerBlast.timer = Math.max(0, this.centerBlast.timer - delta);
		this.centerBlast.cooldown = Math.max(0, this.centerBlast.cooldown - delta);
		const center =
			this.map?.getCornucopiaCenter?.() || new THREE.Vector3(0, 0.8, 0);
		const radius = this.centerBlast.radius || 18;
		const radiusSq = radius * radius;
		const applyLethalTick = (entity) => {
			if (
				!entity?.isAlive ||
				!entity?.position ||
				typeof entity.takeDamage !== "function"
			)
				return;
			const dx = entity.position.x - center.x;
			const dz = entity.position.z - center.z;
			if (dx * dx + dz * dz > radiusSq) return;
			entity.takeDamage(85 * delta, false, null, 0, "centerBlast");
		};
		applyLethalTick(this.player);
		for (const bot of this.bots) applyLethalTick(bot);
		for (const zombie of this.zombies) applyLethalTick(zombie);

		if (this.centerBlastVfx) {
			const pulse = 1 + Math.sin(performance.now() * 0.016) * 0.05;
			this.centerBlastVfx.scale.setScalar(pulse);
			this.centerBlastVfx.material.opacity =
				0.28 + (this.centerBlast.timer / 5) * 0.45;
		}

		if (this.centerBlast.timer <= 0) {
			this.centerBlast.active = false;
			if (this.centerBlastVfx?.parent) {
				this.centerBlastVfx.parent.remove(this.centerBlastVfx);
			}
			this.centerBlastVfx = null;
		}
	}

	getNearestShelterTarget(position) {
		const houses = this.map?.getHouseSpots?.() || [];
		const hangars = this.map?.getHangarSpots?.() || [];
		if (!houses.length && !hangars.length) return null;
		let best = null;
		let bestScore = Infinity;
		const check = (s, type) => {
			const depth = s.depth || (type === "hangar" ? 18 : 8);
			const ax = s.x;
			const ay = this.map.getHeightAt(s.x, s.z) + 0.2;
			const az = s.z + depth * 0.34;
			const dx = position.x - ax;
			const dy = position.y - ay;
			const dz = position.z - az;
			const distSq = dx * dx + dy * dy + dz * dz;
			if (distSq < bestScore) {
				bestScore = distSq;
				best = { x: ax, y: ay, z: az };
			}
		};
		for (const s of houses) check(s, "house");
		for (const s of hangars) check(s, "hangar");
		return best;
	}

	startZoneCycle() {
		this.zonePhase = "waiting";
		this.zonePhaseTimer = GAME_CONFIG.zone.waitStartSeconds;
		this.zonePhaseIndex = 0;
		this.zonePhaseTarget = this.zone.getCurrentRadius();
		this.chestRespawnTimer = 55;
		this.zone.setCurrentRadius(this.zone.getCurrentRadius());
		this.zone.shrink(this.zone.getCurrentRadius());
		this.zone.shrinkSpeed = 0;
	}

	updateZoneCycle(_) {
		// Zone shrinking disabled - zone stays at full size
		return;
	}

	updateRandomEvents(delta) {
		if (this.activeEvent.type) {
			this.activeEvent.timer -= delta;
			if (
				this.activeEvent.type === "radiationRain" &&
				!this.radiationRainDamageActive
			) {
				this.radiationRainGraceTimer = Math.max(
					0,
					this.radiationRainGraceTimer - delta,
				);
				if (this.radiationRainGraceTimer <= 0) {
					this.radiationRainDamageActive = true;
					this.hud.showGameMessage("Кислотный дождь начался!");
				}
			}
			if (this.activeEvent.timer <= 0) {
				if (
					this.activeEvent.type === "night" &&
					this.env?.forceNightTimer !== undefined
				) {
					this.env.forceDay?.();
				}
				if (this.activeEvent.type === "radiationRain") {
					this.setRadiationRainActive(false);
				}
				this.lastEventType = this.activeEvent.type;
				this.activeEvent = { type: null, timer: 0, prevFog: null };
				this.hud.showGameMessage("Событие завершено");
			}
		}

		const roundElapsed = performance.now() * 0.001 - this.roundStartTime;
		if (this.gameState !== "playing" || this.activeEvent.type) return;
		const scheduled = this.eventTimeline[this.eventTimelineIndex];
		if (!scheduled || roundElapsed < scheduled.at) return;
		this.eventTimelineIndex++;
		const event = scheduled.type;

		if (event === "night" && this.env?.forceNight) {
			this.activeEvent.type = "night";
			this.activeEvent.timer = scheduled.duration;
			this.env.forceNight(scheduled.duration);
			this.queueZombieBurst(
				false,
				2.4,
				200,
				this.isMobile() ? 20 : 30,
				this.isMobile() ? 3 : 5,
			);
			this.queuePoiBurst(
				1.8,
				this.isMobile() ? 10 : 16,
				this.isMobile() ? 2 : 4,
			);
			this.hud.showGameMessage(
				"Событие: Ночь. Заражённые слышат и видят дальше!",
			);
		} else if (event === "radiationRain") {
			this.activeEvent.type = "radiationRain";
			this.activeEvent.timer = scheduled.duration;
			this.setRadiationRainActive(true);
			this.queueZombieBurst(
				false,
				1.7,
				180,
				this.isMobile() ? 10 : 16,
				this.isMobile() ? 2 : 4,
			);
			this.hud.showGameMessage(
				"Событие: Радиационный дождь. Прячьтесь в домах или ангарах!",
			);
		}
	}

	spawnSupplyDrop() {
		const angle = Math.random() * Math.PI * 2;
		const distance = 40 + Math.random() * 120;
		const x = Math.cos(angle) * distance;
		const z = Math.sin(angle) * distance;
		const y = this.map.getHeightAt?.(x, z) ?? 0;
		if (y > this.map.waterLevel + 1) {
			this.lootManager.spawnSupplyDrop(new THREE.Vector3(x, y + 0.5, z));
		}
	}

	queueZombieBurst(
		reset,
		multiplier,
		capOverride,
		count,
		chunk = 6,
		variant = null,
	) {
		this.pendingZombieBursts.push({
			reset,
			multiplier,
			capOverride,
			remaining: Math.max(0, count | 0),
			chunk: Math.max(1, chunk | 0),
			variant,
			started: false,
		});
	}

	queuePoiBurst(intensity, totalCount, chunk = 3) {
		this.pendingPoiBursts.push({
			intensity,
			remaining: Math.max(0, totalCount | 0),
			chunk: Math.max(1, chunk | 0),
		});
	}

	isBiomeZombieSpawnPoint(x, z) {
		if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
		const minRadius = Math.max(70, (this.map?.spawnCourtyardRadius || 54) + 16);
		const maxCoordinate = (this.map?.halfSize || 256) - 2;
		return (
			Math.hypot(x, z) >= minRadius &&
			Math.abs(x) <= maxCoordinate &&
			Math.abs(z) <= maxCoordinate &&
			this.map?.isWalkableAt?.(x, z) !== false
		);
	}

	getZombieBiomeIndex(x, z) {
		if (x < 0 && z < 0) return 0;
		if (x >= 0 && z < 0) return 1;
		if (x < 0) return 2;
		return 3;
	}

	rebuildSpawnCaches() {
		const floorTiles = (
			this.map.getNavigationTiles?.() ||
			this.map.getFloorTiles?.() ||
			[]
		).filter((tile) => this.isBiomeZombieSpawnPoint(tile.x, tile.z));
		const houseSpots = (this.map.getHouseSpots?.() || []).filter((spot) =>
			this.isBiomeZombieSpawnPoint(spot.x, spot.z),
		);
		const hangarSpots = (this.map.getHangarSpots?.() || []).filter((spot) =>
			this.isBiomeZombieSpawnPoint(spot.x, spot.z),
		);

		if (!floorTiles.length) {
			this.zombieSpawnCandidates = [];
			this.zombieSpawnCursor = 0;
		} else {
			const houseGrid = new Map();
			for (const house of houseSpots) {
				const key = `${Math.floor(house.x / 18)},${Math.floor(house.z / 18)}`;
				if (!houseGrid.has(key)) houseGrid.set(key, []);
				houseGrid.get(key).push(house);
			}
			const hangarGrid = new Map();
			for (const hangar of hangarSpots) {
				const key = `${Math.floor(hangar.x / 28)},${Math.floor(hangar.z / 28)}`;
				if (!hangarGrid.has(key)) hangarGrid.set(key, []);
				hangarGrid.get(key).push(hangar);
			}
			const scored = floorTiles.map((tile) => {
				let houseBoost = 0;
				const houseX = Math.floor(tile.x / 18);
				const houseZ = Math.floor(tile.z / 18);
				for (let dx = -1; dx <= 1; dx++) {
					for (let dz = -1; dz <= 1; dz++) {
						const nearby = houseGrid.get(`${houseX + dx},${houseZ + dz}`);
						if (!nearby) continue;
						for (const house of nearby) {
							const distance = Math.hypot(tile.x - house.x, tile.z - house.z);
							if (distance < 18)
								houseBoost = Math.max(houseBoost, 1 - distance / 18);
						}
					}
				}
				let hangarBoost = 0;
				const hangarX = Math.floor(tile.x / 28);
				const hangarZ = Math.floor(tile.z / 28);
				for (let dx = -1; dx <= 1; dx++) {
					for (let dz = -1; dz <= 1; dz++) {
						const nearby = hangarGrid.get(`${hangarX + dx},${hangarZ + dz}`);
						if (!nearby) continue;
						for (const hangar of nearby) {
							const distance = Math.hypot(tile.x - hangar.x, tile.z - hangar.z);
							if (distance < 28)
								hangarBoost = Math.max(hangarBoost, 1 - distance / 28);
						}
					}
				}
				const noise =
					(Math.sin((tile.x + 17.3) * 0.021 + (tile.z - 9.4) * 0.027) + 1) *
					0.5;
				return {
					tile,
					score: hangarBoost * 2.4 + houseBoost * 1.2 + noise * 0.25,
				};
			});
			scored.sort((a, b) => b.score - a.score);
			this.zombieSpawnCandidates = scored.map((s) => s.tile);
			this.zombieSpawnCursor = Math.floor(
				Math.random() * Math.max(1, this.zombieSpawnCandidates.length),
			);
			this.zombieSpawnCandidatesByBiome = [[], [], [], []];
			for (const candidate of this.zombieSpawnCandidates) {
				this.zombieSpawnCandidatesByBiome[
					this.getZombieBiomeIndex(candidate.x, candidate.z)
				].push(candidate);
			}
			this.zombieSpawnBiomeCursors = this.zombieSpawnCandidatesByBiome.map(
				(pool) => Math.floor(Math.random() * Math.max(1, pool.length)),
			);
			this.zombieSpawnBiomeCursor = Math.floor(Math.random() * 4);
		}

		this.poiSpawnCandidates = [
			...houseSpots.map((s) => ({ ...s, type: "house" })),
			...hangarSpots.map((s) => ({ ...s, type: "hangar" })),
		];
		this.poiSpawnCursor = Math.floor(
			Math.random() * Math.max(1, this.poiSpawnCandidates.length),
		);
	}

	processDeferredSpawns(delta) {
		if (this.gameState !== "playing") return;
		this.spawnBurstCooldown = Math.max(0, this.spawnBurstCooldown - delta);
		if (this.spawnBurstCooldown > 0) return;
		const start = performance.now();
		let operations = 0;
		const opBudget = 1;
		const msBudget = this.isMobile() ? 0.75 : 1.25;
		while (
			(this.pendingZombieBursts.length || this.pendingPoiBursts.length) &&
			operations < opBudget
		) {
			if (performance.now() - start > msBudget) break;
			if (this.pendingZombieBursts.length) {
				const job = this.pendingZombieBursts[0];
				const batch = Math.min(
					this.isMobile() ? 1 : 2,
					job.chunk,
					job.remaining,
				);
				const spawned = this.spawnZombies(
					job.reset && !job.started,
					job.multiplier,
					job.capOverride,
					batch,
					job.variant,
				);
				job.started = true;
				job.remaining -= spawned;
				job.failedAttempts = spawned > 0 ? 0 : (job.failedAttempts || 0) + 1;
				if (job.failedAttempts >= 8) job.remaining = 0;
				if (job.remaining <= 0) this.pendingZombieBursts.shift();
				operations++;
				continue;
			}
			if (this.pendingPoiBursts.length) {
				const job = this.pendingPoiBursts[0];
				const batch = Math.min(
					this.isMobile() ? 1 : 2,
					job.chunk,
					job.remaining,
				);
				this.spawnPoiZombieGuards(job.intensity, batch);
				job.remaining -= batch;
				if (job.remaining <= 0) this.pendingPoiBursts.shift();
				operations++;
			}
		}
		this.spawnBurstCooldown = 0.016;
	}

	update(delta) {
		this.scene.userData.gameState = this.gameState;
		if (this.gameState === "ended") {
			if (this.input.isKeyPressed("KeyE")) window.location.reload();
			return;
		}
		this.enforceNoBugPolicy(delta);
		if (
			this.isStarted &&
			loadingOverlay &&
			loadingOverlay.style.display !== "none"
		) {
			loadingOverlay.style.display = "none";
		}
		if (this.resumeGraceTimer > 0) {
			this.resumeGraceTimer = Math.max(0, this.resumeGraceTimer - delta);
		}

		if (this.input.isKeyPressed("KeyM")) {
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
		this.updateCenterDetonation(delta);
		this._updatePerkMenu();
		if (this.gameState === "countdown" && this.isStarted) {
			this._updateCountdownState(delta);
		} else if (this.gameState === "spawn" && this.isStarted) {
			this._updateSpawnState(delta);
		}

		if (this.gameState === "playing") {
			this._updatePlayingHazards(delta);
		} else {
			this.hud.setVisionIntensity?.(0);
		}

		this.physics.update(delta, this.gameState);
		this.player.update(
			delta,
			this.audioSynth,
			this.lootManager,
			this.entityManager,
			this.cameraController,
		);
		// Easter egg: Stalker corpse → infinite Bazooka
		this._checkStalkerCorpseEasterEgg();
		// Обновляем камеру (позиция + вращение); frozen=true во время таймера старта
		this.cameraController.update(
			delta,
			this.input,
			this.player.position,
			this.gameState === "countdown",
		);
		// Batch animation updates — distance-culled in MapGenerator
		this.map.updateAllAnimations?.(delta, this.player.position);
		this.updateRadiationRainEffect(delta);
		this.propVisibilityTimer -= delta;
		if (this.propVisibilityTimer <= 0) {
			const movedSq = this.lastPropVisibilityPos.distanceToSquared(
				this.player.position,
			);
			if (
				movedSq > 9 ||
				this.propVisibilityTimer <= -0.7 ||
				this.resumeGraceTimer > 0
			) {
				this.map.updatePropVisibility?.(this.player.position);
				this.lastPropVisibilityPos.copy(this.player.position);
			}
			this.propVisibilityTimer = this.isMobile() ? 0.6 : 0.45;
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
		if (this.env && this.gameState === "playing") {
			const night = this.env.dayTime < 0.18 || this.env.dayTime > 0.78;
			if (night) {
				if (!this.nightNotified) {
					this.hud.showGameMessage(
						"Ночь наступила. Заражённые стали активнее.",
					);
					this.nightNotified = true;
					this.nightWaveBurstDone = false;
					this.nightWaveTimer = 18;
				}
				if (!this.nightWaveBurstDone) {
					this.queueZombieBurst(false, 5.6, 260, 16, this.isMobile() ? 4 : 6);
					this.queuePoiBurst(
						2.0,
						this.isMobile() ? 4 : 6,
						this.isMobile() ? 2 : 3,
					);
					const spawned = 16;
					if (spawned > 0) {
						this.hud.showGameMessage(
							`Ночь наступила. Заражённых прибыло: ${spawned}`,
						);
					}
					this.nightWaveBurstDone = true;
				} else {
					this.nightWaveTimer -= delta;
					if (this.nightWaveTimer <= 0) {
						this.queueZombieBurst(false, 4.2, 260, 10, this.isMobile() ? 4 : 5);
						this.queuePoiBurst(
							1.5,
							this.isMobile() ? 3 : 4,
							this.isMobile() ? 2 : 3,
						);
						const spawned = 10;
						if (spawned >= 3) {
							this.hud.showGameMessage("Во тьме слышны новые заражённые...");
						}
						this.nightWaveTimer = 18 + Math.random() * 8;
					}
				}
			} else {
				this.nightNotified = false;
				this.nightWaveBurstDone = false;
				this.nightWaveTimer = 0;
			}
		}

		if (this.gameState === "playing") {
			const isNight =
				this.env && (this.env.dayTime < 0.18 || this.env.dayTime > 0.78);
			const fogDensity = this.scene?.fog?.density || 0;
			const localFog = this.getLocalizedFogBoost(this.player.position);
			const maxFar = this.isMobile() ? 210 : 280;
			const fogPenalty = Math.max(0, (fogDensity - 0.004) * 9000);
			const localFogPenalty = localFog * 3800;
			const nightPenalty = isNight ? 35 : 0;
			const targetFar = Math.max(
				55,
				Math.min(
					maxFar,
					this.zone.getCurrentRadius() * 0.2 +
						90 -
						fogPenalty -
						localFogPenalty -
						nightPenalty,
				),
			);
			if (this.camera.far !== targetFar) {
				this.camera.far = targetFar;
				this.camera.updateProjectionMatrix();
			}
		}
		if (this.audioSynth && this.camera) {
			this.camera.getWorldDirection(this._tmpAudioForward);
			this.audioSynth.updateListener(
				this.camera.position,
				this._tmpAudioForward,
			);
		}

		this._updateBots(delta);
		this._updateBotHazards(delta);

		this._updateZombies(delta);
		this.updateZombieLodBatch(delta);
		this._cleanupCorpses(delta);

		this._updateEnvironmentEntities(delta);

		this._updateZombieWaves(delta);

		const aliveCountBeforeHazards = this.entityManager.update(
			delta,
			this.physics,
			this.audioSynth,
		);
		const refreshFarBots = (this.botLodUpdateTimer || 0) <= delta;
		for (let i = 0; i < this.bots.length; i++) {
			const bot = this.bots[i];
			if (!bot?.isAlive) continue;
			const far = bot._lodDetailed === false;
			if (far && !refreshFarBots) continue;
			bot.syncVisualAfterPhysics?.(
				far ? (this.isMobile() ? 0.05 : 0.033) : delta,
				far,
			);
		}
		this.updateBotLodBatch(delta);
		if (this.gameState === "playing") {
			this.updateRandomEvents(delta);
			this.updateAchievements(aliveCountBeforeHazards);
			this.updateKillRewards();
		}

		this._updateHUDStats(delta, aliveCountBeforeHazards);
		this._applyTraps(delta);

		this._checkWinLoseConditions();

		this._updateHUDInventory(delta);
		this._updateMinimap(delta);

		this._updateWeather(delta);

		// players count is updated by throttled hudStatsTimer block above
	}

	_updateBots(delta) {
		const botCount = this.bots.length;
		if (botCount === 0) return;
		// Bots update during countdown to enable pre-fight looting
		const lootOnly = this.bots[0]?.noCombatUntil > performance.now();
		const batch = Math.min(
			botCount,
			lootOnly ? (this.isMobile() ? 6 : 8) : this.isMobile() ? 6 : 8,
		);
		const scaledDelta = Math.min(0.25, (delta * botCount) / Math.max(1, batch));
		for (let i = 0; i < batch; i++) {
			const botIndex = (this.botUpdateIndex + i) % botCount;
			const bot = this.bots[botIndex];
			if (!bot?.isAlive) continue;
			bot.update(
				scaledDelta,
				this.botBrains[botIndex],
				this.entityManager,
				this.lootManager,
				this.audioSynth,
				this.physics,
				this.zone,
				this.gameState,
			);
		}
		this.botUpdateIndex = (this.botUpdateIndex + batch) % botCount;
	}

	_updateBotHazards(delta) {
		if (this.gameState !== "playing") return;

		const hazardBatch = Math.max(
			this.isMobile() ? 8 : 12,
			Math.min(
				this.bots.length,
				Math.ceil(this.bots.length * (this.isMobile() ? 0.14 : 0.22)),
			),
		);
		const hazardScale =
			this.bots.length > 0 ? this.bots.length / hazardBatch : 1;
		for (let i = 0; i < hazardBatch && i < this.bots.length; i++) {
			const botIndex = (this.botHazardCursor + i) % this.bots.length;
			const bot = this.bots[botIndex];
			if (!bot.isAlive) continue;
			if (!this.zone.isInsideZone(bot.position)) {
				const damage = this.zone.getDamage(delta * hazardScale, bot.position);
				bot.takeDamage(damage, false, null, 0, "zone");
				const safePoint = this.getSafeZoneTarget(bot.position);
				bot.target = null;
				bot.assistTarget = null;
				const outside = this.zone.getDistanceFromZone(bot.position);
				if (outside > 10) {
					bot.position.lerp(safePoint, 0.18);
				}
			}
			if (
				this.activeEvent?.type === "radiationRain" &&
				!this.isShelteredFromRadiation(bot.position)
			) {
				const shelter = this.getNearestShelterTarget(bot.position);
				if (shelter) {
					bot.target = null;
					bot.assistTarget = null;
					bot.lootTarget = null;
					if (!bot.patrolTarget) bot.patrolTarget = new THREE.Vector3();
					bot.patrolTarget.copy(shelter);
					bot.state = "retreat";
				}
				if (this.radiationRainDamageActive) {
					const rainDps = shelter
						? GAME_CONFIG.events.radiation.botDpsNearShelter
						: GAME_CONFIG.events.radiation.botDpsFarShelter;
					bot.takeDamage(
						rainDps * delta * hazardScale,
						false,
						null,
						0,
						"storm",
					);
				}
			}
		}
		if (this.bots.length > 0) {
			this.botHazardCursor =
				(this.botHazardCursor + hazardBatch) % this.bots.length;
		}
	}

	_updateZombies(delta) {
		const zombieCount = this.zombies.length;
		if (zombieCount === 0) return;

		const mobile = this.isMobile();
		const farZombieCullDistSq = mobile ? 10000 : 20736;
		const zombiesPerFrame = Math.min(
			zombieCount,
			Math.max(
				mobile ? 8 : 12,
				Math.ceil(zombieCount * (mobile ? 0.18 : 0.28)),
			),
		);
		const scaledDelta = Math.min(
			0.1,
			(delta * zombieCount) / Math.max(1, zombiesPerFrame),
		);
		for (let i = 0; i < zombiesPerFrame && i < zombieCount; i++) {
			const zIndex = (this.zombieUpdateIndex + i) % zombieCount;
			const zombie = this.zombies[zIndex];
			if (zombie && zombie.isAlive) {
				zombie.updateRenderLod(scaledDelta);
				const distSq = zombie.position.distanceToSquared(this.player.position);
				const shouldUpdate =
					distSq < farZombieCullDistSq ||
					zombie.alertTarget ||
					zombie.alertTimer > 0;
				if (shouldUpdate) {
					zombie.update(scaledDelta, this.entityManager, this.audioSynth);
				} else if (zombie.mesh) {
					zombie.mesh.position.copy(zombie.position);
				}
			}
		}
		this.zombieUpdateIndex =
			(this.zombieUpdateIndex + zombiesPerFrame) % zombieCount;
	}

	_cleanupCorpses(delta) {
		this.corpseCleanupTimer -= delta;
		if (this.corpseCleanupTimer > 0) return;
		this.corpseCleanupTimer = 0.2;
		const now = performance.now();
		for (let i = this.zombies.length - 1; i >= 0; i--) {
			const zombie = this.zombies[i];
			if (!zombie || zombie.isAlive || now < (zombie._corpseExpiresAt || 0))
				continue;
			this.zombiePool.release(zombie, true);
			this.zombies.splice(i, 1);
		}
		for (const bot of this.bots) {
			if (
				!bot ||
				bot.isAlive ||
				bot._corpseCleaned ||
				now < (bot._corpseExpiresAt || 0)
			)
				continue;
			bot._corpseCleaned = true;
			if (bot.mesh) bot.mesh.visible = false;
			this.physics.removeEntity?.(bot);
			const index = this.entityManager.entities.indexOf(bot);
			if (index >= 0) this.entityManager.entities.splice(index, 1);
		}
	}

	updateKillRewards() {
		const kills = this.player?.stats?.kills || 0;
		const tiers = [5, 10, 15, 25, 40];
		for (const tier of tiers) {
			if (
				kills < tier ||
				this.claimedKillRewards.has(tier) ||
				this.queuedKillRewards.has(tier)
			)
				continue;
			this.queuedKillRewards.add(tier);
			this.killRewardQueue.push(tier);
		}
		if (this.killRewardActive || !this.killRewardQueue.length) return;
		const tier = this.killRewardQueue.shift();
		this.killRewardActive = true;
		const options =
			tier === 5
				? [
						{ id: "ammoAll35", label: "Боезапас: +35 ко всему оружию" },
						{ id: "ammoCurrent70", label: "Боезапас: +70 к выбранному оружию" },
					]
				: tier === 10
					? [
							{ id: "healFull", label: "Полное восстановление здоровья" },
							{ id: "armor60", label: "Броня: +60" },
							{ id: "ammoAll55", label: "Боезапас: +55 ко всему оружию" },
						]
					: tier === 15
						? [
								{ id: "weaponPistol", label: "Пистолет с боезапасом" },
								{ id: "weaponShotgun", label: "Дробовик с боезапасом" },
								{ id: "weaponRifle", label: "Винтовка с боезапасом" },
							]
						: tier === 25
							? [
									{ id: "weaponMachinegun", label: "Пулемёт" },
									{ id: "weaponLaser", label: "Лазерган" },
									{ id: "weaponFlamethrower", label: "Огнемёт" },
								]
							: [
									{
										id: "eliteRestore",
										label: "Полное здоровье, броня и боезапас",
									},
									{ id: "weaponMachinegun", label: "Пулемёт" },
									{ id: "weaponLaser", label: "Лазерган" },
								];
		this.setPaused(true);
		this.hud.showPause(false);
		this.hud.showKillReward(tier, options, (reward) => {
			this.applyKillReward(reward);
			this.claimedKillRewards.add(tier);
			this.queuedKillRewards.delete(tier);
			this.killRewardActive = false;
			if (this.isPaused) this.setPaused(false);
		});
	}

	canSpawnZombieAt(x, z, radius = 18, maximum = 1) {
		let nearby = 0;
		const radiusSq = radius * radius;
		for (const zombie of this.zombies) {
			if (!zombie?.isAlive) continue;
			const dx = zombie.position.x - x;
			const dz = zombie.position.z - z;
			if (dx * dx + dz * dz > radiusSq) continue;
			nearby++;
			if (nearby >= maximum) return false;
		}
		return true;
	}

	applyKillReward(reward) {
		const refillAll = (amount) => {
			for (const item of this.player.inventory.getItems()) {
				if (item?.ammo !== null && item?.ammo !== undefined)
					this.player.addAmmoToWeaponType(item.type, amount);
			}
		};
		if (reward === "ammoAll35") refillAll(35);
		else if (reward === "ammoAll55") refillAll(55);
		else if (reward === "ammoCurrent70") {
			const weapon = this.player.currentWeapon;
			if (weapon?.type) this.player.addAmmoToWeaponType(weapon.type, 70);
		} else if (reward === "healFull")
			this.player.health = this.player.maxHealth;
		else if (reward === "armor60")
			this.player.armor = Math.min(
				this.player.maxArmor,
				this.player.armor + 60,
			);
		else if (reward === "eliteRestore") {
			this.player.health = this.player.maxHealth;
			this.player.armor = this.player.maxArmor;
			refillAll(120);
		} else if (reward?.startsWith("weapon")) {
			const type = reward.slice(6).toLowerCase();
			this.player.pickupLoot({ type: "weapon", weaponType: type });
			this.player.addAmmoToWeaponType(type, 80);
		}
		this.hud.showGameMessage("Груз с парашютом получен");
	}

	_updateEnvironmentEntities(delta) {
		if (!this.environmentEntities?.length) return;

		const envCount = this.environmentEntities.length;
		const perFrame = Math.max(
			this.isMobile() ? 6 : 10,
			Math.min(envCount, Math.ceil(envCount * 0.5)),
		);
		for (let i = 0; i < perFrame; i++) {
			const idx = (this.environmentUpdateIndex + i) % envCount;
			const ent = this.environmentEntities[idx];
			if (!ent?.isAlive) continue;
			ent.update?.(delta, this.entityManager, this.map, this.audioSynth);
		}
		this.environmentUpdateIndex =
			(this.environmentUpdateIndex + perFrame) % envCount;
	}

	_updateZombieWaves(delta) {
		if (this.gameState !== "playing") return;

		const elapsed = performance.now() * 0.001 - this.roundStartTime;
		const gracePeriod = GAME_CONFIG.events.gracePeriodSeconds;
		const isNight =
			this.env && (this.env.dayTime < 0.18 || this.env.dayTime > 0.78);
		this.scene.userData.zombieAggression =
			1 + Math.min(1, elapsed / 600) * 0.8 + (isNight ? 0.75 : 0);

		if (elapsed >= gracePeriod && !this.initialZombieWaveQueued) {
			this.initialZombieWaveQueued = true;
			this.queueZombieBurst(
				false,
				1.35,
				140,
				this.isMobile() ? 14 : 20,
				this.isMobile() ? 3 : 5,
			);
			this.queuePoiBurst(
				1.2,
				this.isMobile() ? 12 : 18,
				this.isMobile() ? 3 : 4,
			);
		}

		this.zombieMaintainTimer = Math.max(0, this.zombieMaintainTimer - delta);
		if (this.zombieMaintainTimer <= 0) {
			// YieldScheduler: кэшируем aliveZombies для исключения filter() каждый кадр
			const aliveZombies = this.zombies.filter((z) => z?.isAlive).length;
			const growth = Math.floor(Math.min(5, elapsed / 120)) * 2;
			const basePersistent =
				elapsed < gracePeriod
					? this.isMobile()
						? 34
						: 46
					: this.isMobile()
						? 44
						: 60;
			const nightZombies =
				basePersistent + growth + (isNight ? (this.isMobile() ? 16 : 24) : 0);
			const minAlive = isNight ? nightZombies : Math.floor(nightZombies / 2);
			if (aliveZombies < minAlive) {
				const need = minAlive - aliveZombies;
				this.queuePoiBurst(
					1.45,
					Math.min(14, need + 2),
					this.isMobile() ? 3 : 4,
				);
				this.queueZombieBurst(
					false,
					2.0,
					180,
					Math.max(0, need - 2),
					this.isMobile() ? 4 : 5,
				);
			}
			this.ensurePoiZombiePresence(this.isMobile() ? 8 : 12);
			this.zombieMaintainTimer = 3.2 + Math.random() * 1.4;
		}
	}

	_updateHUDStats(delta, aliveCount) {
		this.scene.userData.aliveSurvivorCount = aliveCount;
		this.hudStatsTimer -= delta;
		if (this.hudStatsTimer <= 0) {
			this.hud.updateHealth(this.player.health, this.player.maxHealth);
			this.hud.updateArmor(this.player.armor, this.player.maxArmor);
			this.hud.updatePlayersCount(aliveCount);
			this.hud.updateAmmo(this.player.currentWeapon || this.player.fists);
			this.hudStatsTimer = this.isMobile() ? 0.15 : 0.08;
		}
		if (this.isMobile()) {
			this.hud.updateJoystick?.(this.input.joystick);
		}
	}

	_applyTraps(delta) {
		if (!this.traps?.length) return;
		this.trapUpdateAccumulator = (this.trapUpdateAccumulator || 0) + delta;
		const interval = this.isMobile() ? 0.12 : 0.08;
		if (this.trapUpdateAccumulator < interval) return;
		delta = Math.min(0.2, this.trapUpdateAccumulator);
		this.trapUpdateAccumulator = 0;

		const applyTrap = (entity) => {
			if (!entity.isAlive) return;
			for (const trap of this.traps) {
				if (trap.type === "mine") continue;
				if (trap.active === false) continue;
				const dx = entity.position.x - trap.position.x;
				const dz = entity.position.z - trap.position.z;
				if (dx * dx + dz * dz < trap.radius * trap.radius) {
					if (typeof entity.applySlow === "function") {
						entity.applySlow(trap.slow, 0.6);
					}
					if (typeof entity.takeDamage === "function") {
						entity.takeDamage(trap.damage * delta, false, null, 0, "trap");
					}
				}
			}
		};
		const now = performance.now() * 0.001;
		const living = this.trapLivingEntities || (this.trapLivingEntities = []);
		living.length = 0;
		if (this.player?.isAlive) living.push(this.player);
		for (const bot of this.bots) if (bot?.isAlive) living.push(bot);
		for (const zombie of this.zombies || [])
			if (zombie?.isAlive) living.push(zombie);
		for (const trap of this.traps) {
			if (trap.type !== "mine" || (trap.rearmAt || 0) > now) continue;
			const triggerRadiusSq = trap.radius * trap.radius;
			let triggered = false;
			for (const entity of living) {
				const dx = entity.position.x - trap.position.x;
				const dz = entity.position.z - trap.position.z;
				if (dx * dx + dz * dz <= triggerRadiusSq) {
					triggered = true;
					break;
				}
			}
			if (!triggered) continue;
			trap.rearmAt = now + 7;
			trap.active = false;
			if (trap.visual) trap.visual.visible = false;
			const blastRadius = 4.4;
			for (const entity of living) {
				const dx = entity.position.x - trap.position.x;
				const dz = entity.position.z - trap.position.z;
				const distSq = dx * dx + dz * dz;
				if (distSq > blastRadius * blastRadius) continue;
				entity.takeDamage?.(
					62 * (1 - Math.sqrt(distSq) / (blastRadius * 1.4)),
					false,
					null,
					8,
					"mine",
				);
				if (entity.physics?.velocity) {
					const inv = 1 / Math.max(0.35, Math.sqrt(distSq));
					entity.physics.velocity.x += dx * inv * 7.5;
					entity.physics.velocity.z += dz * inv * 7.5;
					entity.physics.velocity.y = Math.max(
						entity.physics.velocity.y || 0,
						3.2,
					);
				}
			}
			this.audioSynth?.playExplosion?.(trap.position);
			for (let i = 0; i < 7; i++) {
				const angle = (i * Math.PI * 2) / 7;
				this._tmpSafeZone.set(
					trap.position.x + Math.cos(angle) * (0.3 + (i % 3) * 0.35),
					trap.position.y + 0.25 + (i % 2) * 0.35,
					trap.position.z + Math.sin(angle) * (0.3 + (i % 3) * 0.35),
				);
				this.entityManager?.spawnImpactEffect?.(
					this._tmpSafeZone,
					"flame",
					true,
					false,
				);
			}
		}
		applyTrap(this.player);
		const trapBatch = Math.max(
			this.isMobile() ? 10 : 16,
			Math.min(
				this.bots.length,
				Math.ceil(this.bots.length * (this.isMobile() ? 0.35 : 0.5)),
			),
		);
		for (let i = 0; i < trapBatch && i < this.bots.length; i++) {
			const botIndex = (this.trapBotCursor + i) % this.bots.length;
			applyTrap(this.bots[botIndex]);
		}
		if (this.bots.length > 0) {
			this.trapBotCursor = (this.trapBotCursor + trapBatch) % this.bots.length;
		}
		const zombieBatch = Math.min(
			this.zombies?.length || 0,
			this.isMobile() ? 8 : 14,
		);
		this.trapZombieCursor ||= 0;
		for (let i = 0; i < zombieBatch; i++) {
			applyTrap(
				this.zombies[(this.trapZombieCursor + i) % this.zombies.length],
			);
		}
		if (this.zombies?.length) {
			this.trapZombieCursor =
				((this.trapZombieCursor || 0) + zombieBatch) % this.zombies.length;
		}
	}

	_updateHUDInventory(delta) {
		this.hudInventoryTimer -= delta;
		if (this.hudInventoryTimer <= 0) {
			const inv = this.player.inventory;
			const items = inv.getItems();
			let sig = inv.selectedSlot + "|";
			for (let i = 0; i < items.length; i++) {
				sig += (items[i] ? items[i].type : "-") + ",";
			}
			if (sig !== this.lastInventorySignature) {
				const inventoryItems = items.map((item) =>
					item ? { type: item.type } : null,
				);
				this.hud.updateInventory(inventoryItems, inv.selectedSlot);
				this.lastInventorySignature = sig;
			}
			this.hudInventoryTimer = this.isMobile() ? 0.18 : 0.1;
		}
	}

	_updateMinimap(delta) {
		this.minimapTimer -= delta;
		if (this.minimapTimer <= 0) {
			const botPoints = this._minimapBotPoints || (this._minimapBotPoints = []);
			botPoints.length = 0;
			for (let i = 0; i < this.bots.length; i++) {
				const bot = this.bots[i];
				if (!bot?.isAlive) continue;
				botPoints.push(bot.position);
			}
			const zombiePoints =
				this._minimapZombiePoints || (this._minimapZombiePoints = []);
			zombiePoints.length = 0;
			for (
				let i = 0;
				i < this.zombies.length && zombiePoints.length < 48;
				i++
			) {
				const zombie = this.zombies[i];
				if (!zombie?.isAlive) continue;
				zombiePoints.push(zombie.position);
			}
			this.hud.updateMinimap?.({
				mapSize: this.map.size,
				zoneRadius: this.zone.getCurrentRadius(),
				zoneShape: "square",
				player: this.player.position,
				bots: botPoints,
				zombies: zombiePoints,
			});
			this.minimapTimer = this.isMobile() ? 0.25 : 0.18;
		}
	}

	_updateWeather(delta) {
		this.env.update(delta);
		const targetExposure = Number.isFinite(this.scene?.userData?.targetExposure)
			? this.scene.userData.targetExposure
			: 1;
		const currentExposure = Number.isFinite(this.renderer.toneMappingExposure)
			? this.renderer.toneMappingExposure
			: 1;
		this.renderer.toneMappingExposure = THREE.MathUtils.lerp(
			currentExposure,
			targetExposure,
			Math.min(1, delta * 1.2),
		);
		this.weatherSyncTimer = Math.max(0, this.weatherSyncTimer - delta);
		if (this.weatherSyncTimer <= 0) {
			const changedWeather = this.env?.consumeWeatherChange?.();
			const weatherType =
				changedWeather || this.env?.getWeatherType?.() || "clear";
			if (weatherType !== this.lastAudioWeatherType) {
				this.lastAudioWeatherType = weatherType;
				this.audioSynth?.setWeatherState?.(weatherType);
			}
			if (
				weatherType === "clear" &&
				changedWeather === "clear" &&
				!this.activeEvent?.type
			) {
				this.env.forceNightTimer = 0;
				this.env.dayTime = 0.3;
			}
			const displayedWeather =
				this.activeEvent?.type === "radiationRain"
					? "radiationRain"
					: this.activeEvent?.type === "night"
						? "night"
						: weatherType;
			if (displayedWeather !== this.lastWeatherType) {
				this.lastWeatherType = displayedWeather;
				if (this.gameState === "playing") {
					const weatherLabels = {
						clear: "Ясно",
						rain: "Дождь",
						snow: "Снег",
						night: "Ночь",
						radiationRain: "Радиационный дождь",
					};
					this.hud.showGameMessage(
						`Погода: ${weatherLabels[displayedWeather] || "Ясно"}`,
					);
				}
			}
			this.weatherSyncTimer = this.isMobile() ? 1.5 : 0.9;
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

	spawnPoiZombieGuards(intensity = 1, maxSpawn = Infinity) {
		if (this.gameState !== "playing") return 0;
		const points = this.poiSpawnCandidates?.length
			? this.poiSpawnCandidates
			: [
					...(this.map.getHouseSpots?.() || []).map((s) => ({
						...s,
						type: "house",
					})),
					...(this.map.getHangarSpots?.() || []).map((s) => ({
						...s,
						type: "hangar",
					})),
				].filter((point) => this.isBiomeZombieSpawnPoint(point.x, point.z));
		if (!points.length) return 0;
		const houseSpots = points.filter((p) => p.type === "house");
		const hangarSpots = points.filter((p) => p.type === "hangar");

		const aliveNow = this.zombies.filter((z) => z?.isAlive).length;
		const maxAlive = this.isMobile() ? 96 : 128;
		let budget = Math.max(
			0,
			Math.min(
				maxAlive - aliveNow,
				Math.floor(
					(houseSpots.length * 3.2 + hangarSpots.length * 16) * intensity,
				),
			),
		);
		budget = Math.min(
			budget,
			Math.max(0, Number.isFinite(maxSpawn) ? maxSpawn : budget),
		);
		if (budget <= 0) return 0;

		let spawned = 0;
		const spawnOneAtPoi = (point, forceInterior = false) => {
			if (!point || budget <= 0 || spawned >= maxSpawn) return false;
			const interiorSpot = this.map.findStructureInteriorPoint?.(
				point,
				point.type,
				point.type === "hangar" ? 1.6 : 0.9,
				forceInterior ? 40 : 24,
			);
			const guardSpot =
				interiorSpot ||
				this.map.getStructureEntryPoint?.(
					point,
					point.type,
					this.player?.position || null,
				) ||
				this.map.findStructureGuardPoint?.(point, point.type);
			const fallbackSpot = guardSpot || { x: point.x, z: point.z };
			const jitter = interiorSpot
				? point.type === "hangar"
					? 1.2
					: 0.8
				: point.type === "hangar"
					? 2.0
					: 1.05;
			const x = fallbackSpot.x + (Math.random() - 0.5) * jitter;
			const z = fallbackSpot.z + (Math.random() - 0.5) * jitter;
			if (!this.isBiomeZombieSpawnPoint(x, z)) return false;
			if (!interiorSpot && !this.map.isWalkableAt?.(x, z)) return false;
			if (!this.canSpawnZombieAt(x, z)) return false;
			const baseY =
				this.map.raycastGroundY?.(
					x,
					z,
					this.map.getSurfaceHeightAt?.(x, z) ??
						this.map.getHeightAt?.(x, z) ??
						0,
				) ?? 0;
			const pos = new THREE.Vector3(x, baseY + 1.8, z);
			if (pos.distanceTo(this.player.position) < 14) return false;
			const zombie = this.zombiePool.acquire(pos);
			zombie.mapRef = this.map;
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
			if (budget > 0 && spawned < maxSpawn) {
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
			const baseCount =
				point.type === "hangar"
					? 16 + Math.floor(Math.random() * 10)
					: 2 + Math.floor(Math.random() * 2);
			const pack = Math.max(
				1,
				Math.floor(
					baseCount * intensity * (point.type === "hangar" ? 1.15 : 1),
				),
			);
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
		if (this.gameState !== "playing") return 0;
		const points = this.poiSpawnCandidates?.length
			? this.poiSpawnCandidates
			: [
					...(this.map.getHouseSpots?.() || []).map((s) => ({
						...s,
						type: "house",
					})),
					...(this.map.getHangarSpots?.() || []).map((s) => ({
						...s,
						type: "hangar",
					})),
				].filter((point) => this.isBiomeZombieSpawnPoint(point.x, point.z));
		if (!points.length) return 0;
		const checks = Math.min(points.length, Math.max(1, limitPerTick | 0));
		let injected = 0;
		const aliveNow = this.zombies.filter((z) => z?.isAlive).length;
		const maxAlive = this.isMobile() ? 96 : 128;
		let remainingBudget = Math.max(0, maxAlive - aliveNow);
		if (remainingBudget <= 0) return 0;

		const spawnNearPoint = (point) => {
			if (!point || remainingBudget <= 0) return 0;
			const localNeed = point.type === "hangar" ? 4 : 2;
			let made = 0;
			for (let n = 0; n < localNeed && remainingBudget > 0; n++) {
				const interiorSpot = this.map.findStructureInteriorPoint?.(
					point,
					point.type,
					point.type === "hangar" ? 1.9 : 1.0,
					42,
				);
				const guardSpot = interiorSpot ||
					this.map.getStructureEntryPoint?.(
						point,
						point.type,
						this.player?.position || null,
					) ||
					this.map.findStructureGuardPoint?.(point, point.type) || {
						x: point.x,
						z: point.z,
					};
				const jitter = interiorSpot
					? point.type === "hangar"
						? 1.25
						: 0.85
					: point.type === "hangar"
						? 2.25
						: 1.15;
				const x = guardSpot.x + (Math.random() - 0.5) * jitter;
				const z = guardSpot.z + (Math.random() - 0.5) * jitter;
				if (!this.isBiomeZombieSpawnPoint(x, z)) continue;
				if (!interiorSpot && !this.map.isWalkableAt?.(x, z)) continue;
				if (!this.canSpawnZombieAt(x, z)) continue;
				const y = this.map.getHeightAt?.(x, z) ?? 0;
				const pos = new THREE.Vector3(x, y + 1.8, z);
				if (this.player?.position && pos.distanceTo(this.player.position) < 10)
					continue;
				const zombie = this.zombiePool.acquire(pos);
				zombie.mapRef = this.map;
				this.zombies.push(zombie);
				remainingBudget--;
				made++;
			}
			return made;
		};

		for (let i = 0; i < checks; i++) {
			const point = points[(this.poiSpawnCursor + i) % points.length];
			const radius = point.type === "hangar" ? 18 : 11;
			let present = false;
			for (let z = 0; z < this.zombies.length; z++) {
				const zombie = this.zombies[z];
				if (!zombie?.isAlive) continue;
				if (
					Math.hypot(
						zombie.position.x - point.x,
						zombie.position.z - point.z,
					) <= radius
				) {
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

	spawnZombies(
		reset = true,
		multiplier = 1,
		capOverride = null,
		forceCount = null,
		forcedVariant = null,
	) {
		if (this.gameState !== "playing") return 0;
		if (reset) {
			for (const zombie of this.zombies) {
				this.zombiePool.release(zombie, true);
			}
			this.zombies = [];
		}

		if (!this.zombieSpawnCandidates?.length) {
			this.rebuildSpawnCaches();
		}
		const floorTiles = this.zombieSpawnCandidates || [];
		if (!floorTiles.length) return 0;

		const baseCount = Math.min(
			48,
			Math.max(16, Math.floor(floorTiles.length / 140)),
		);
		const maxAlive = Math.min(
			capOverride ?? (reset ? 104 : 180),
			this.isMobile() ? 96 : 128,
		);
		const aliveNow = this.zombies.filter((z) => z?.isAlive).length;
		const count = Math.min(
			Math.max(0, maxAlive - aliveNow),
			forceCount ??
				Math.max(
					reset ? 16 : 8,
					Math.floor(
						baseCount * (this.modeConfig?.zombieMultiplier || 1) * multiplier,
					),
				),
		);
		if (count <= 0) return 0;

		let spawned = 0;
		const biomePools = (this.zombieSpawnCandidatesByBiome || []).filter(
			(pool) => pool.length,
		);
		const attempts = Math.min(floorTiles.length, Math.max(24, count * 12));
		const start = this.zombieSpawnCursor % floorTiles.length;

		// Collect valid spawn points first, then pick randomly for even distribution
		const validTiles = [];
		for (let i = 0; i < attempts && validTiles.length < count * 6; i++) {
			let tile;
			if (biomePools.length) {
				const poolIndex = (this.zombieSpawnBiomeCursor + i) % biomePools.length;
				const pool = biomePools[poolIndex];
				const biomeIndex = this.zombieSpawnCandidatesByBiome.indexOf(pool);
				const cursor = this.zombieSpawnBiomeCursors[biomeIndex] % pool.length;
				tile = pool[cursor];
				this.zombieSpawnBiomeCursors[biomeIndex] = (cursor + 1) % pool.length;
			} else {
				tile = floorTiles[(start + i) % floorTiles.length];
			}
			if (!tile) continue;
			if (!this.isBiomeZombieSpawnPoint(tile.x, tile.z)) continue;
			if (!this.map.isWalkableAt?.(tile.x, tile.z)) continue;
			if (!this.canSpawnZombieAt(tile.x, tile.z)) continue;
			const baseY =
				this.map.raycastGroundY?.(
					tile.x,
					tile.z,
					this.map.getSurfaceHeightAt?.(tile.x, tile.z) ??
						this.map.getHeightAt?.(tile.x, tile.z) ??
						0,
				) ?? 0;
			const pos = new THREE.Vector3(tile.x, baseY + 1.8, tile.z);
			if (pos.distanceTo(this.player.position) < (reset ? 24 : 28)) continue;
			validTiles.push(tile);
		}

		// Shuffle valid tiles for random spawn distribution
		for (let i = validTiles.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[validTiles[i], validTiles[j]] = [validTiles[j], validTiles[i]];
		}

		for (const tile of validTiles) {
			if (spawned >= count) break;
			if (!this.canSpawnZombieAt(tile.x, tile.z)) continue;
			const baseY =
				this.map.raycastGroundY?.(
					tile.x,
					tile.z,
					this.map.getSurfaceHeightAt?.(tile.x, tile.z) ??
						this.map.getHeightAt?.(tile.x, tile.z) ??
						0,
				) ?? 0;
			const pos = new THREE.Vector3(tile.x, baseY + 1.8, tile.z);
			const zombie = this.zombiePool.acquire(pos, forcedVariant);
			zombie.mapRef = this.map;
			this.zombies.push(zombie);
			spawned++;
		}
		this.zombieSpawnCursor = (start + attempts) % floorTiles.length;
		this.zombieSpawnBiomeCursor =
			(this.zombieSpawnBiomeCursor + Math.max(1, spawned)) % 4;
		return spawned;
	}

	render() {
		this.renderFrameCount = (this.renderFrameCount || 0) + 1;
		if (this.laserRing && this.laserActive) {
			const t = performance.now() * 0.008;
			// Core ring pulse
			this.laserRing.rotation.z += 0.5 * 0.016;
			this.laserRing.material.opacity = 0.8 + Math.sin(t) * 0.2;
			this.laserRing.material.emissiveIntensity = 1.5 + Math.sin(t * 1.3) * 1.0;
			// Glow ring pulse
			if (this.laserGlow) {
				this.laserGlow.material.opacity = 0.15 + Math.sin(t * 0.7) * 0.12;
			}
			// Curtain pulse
			if (this.laserCurtain) {
				this.laserCurtain.material.opacity = 0.06 + Math.sin(t * 0.9) * 0.04;
			}
			if (this.laserDome) {
				this.laserDome.material.opacity = 0.075 + Math.sin(t * 0.55) * 0.025;
			}
		}
		this.renderer.render(this.scene, this.camera);
		if (this.renderFrameCount % 300 === 0 && this.gameState === "playing") {
			const info = this.renderer.info;
			console.log(
				`[Perf] frames=${info.render.frame} draws=${info.render.calls} tris=${info.render.triangles} geos=${info.memory.geometries} mats=${info.memory.textures}`,
			);
		}
	}

	_destroyLaserRing() {
		if (this.laserRing?.parent) {
			this.laserRing.parent.remove(this.laserRing);
		}
		if (this.laserGlow?.parent) {
			this.laserGlow.parent.remove(this.laserGlow);
		}
		if (this.laserCurtain?.parent) {
			this.laserCurtain.parent.remove(this.laserCurtain);
		}
		if (this.laserDome?.parent) {
			this.laserDome.parent.remove(this.laserDome);
		}
		this.laserRing = null;
		this.laserGlow = null;
		this.laserCurtain = null;
		this.laserDome = null;
		this.laserActive = false;
		this.laserGraceTimer = 0;
	}

	async startGame() {
		if (!this.initialized) await this.ready;
		if (this.isStarted) return;
		this.isStarted = true;
		this.startingGame = true;
		this.startAttemptAt = performance.now();
		this.setCenterPlatformOpen(true);
		try {
			this.hideStartScreen();
			this.startTransitionUntil = performance.now() + 3500;
			this.hud.showPause(false);
			this.isPaused = false;

			// Enable canvas pointer events now that game is running
			if (this.renderer?.domElement) {
				this.renderer.domElement.style.pointerEvents = "auto";
				this.renderer.domElement.style.zIndex = "0";
				// Request pointer lock immediately so camera pitch is set
				this.cameraController?.lock?.();
			}
			this.partyMode = false;
			this.applyRoundMode("hybrid");
			await new Promise((resolve) => requestAnimationFrame(() => resolve()));

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
					window.removeEventListener("touchend", retry);
				};
				window.addEventListener("touchend", retry, { passive: false });
			} else {
				try {
					await this.enterFullscreen();
				} catch (fsErr) {
					console.warn("Fullscreen/orientation fallback:", fsErr);
				}
			}

			this.audioSynth.unlock?.().catch(() => {});
			setTimeout(() => {
				try {
					this.audioSynth.playMusic?.();
				} catch (e) {}
				try {
					this.audioSynth.startAmbient?.();
				} catch (e) {}
			}, 50);
			this.yandex?.gameplayStart?.();

			this.perkMenuOpen = !this.perkLocked;
			this.perkSelectionRequired = !this.perkLocked;
			this.hud.setPerkPanelLock(this.perkSelectionRequired);
			this.hud.togglePerkPanel(this.perkMenuOpen);
			if (this.perkMenuOpen) {
				this.renderer.domElement.style.pointerEvents = "none";
				this.hud.showGameMessage("Выберите перк перед стартом матча");
			}
			this.hud.showCountdown(this.countdownTime);

			this.applyRendererSizing();
			this.recoverViewState("start");
			this.render();
			requestAnimationFrame(() => this.hideStartScreen());
			if (loadingOverlay && loadingOverlay.style.display !== "none") {
				loadingOverlay.style.display = "none";
			}
			setTimeout(() => {
				if (
					this.isStarted &&
					loadingOverlay &&
					loadingOverlay.style.display !== "none"
				) {
					loadingOverlay.style.display = "none";
				}
			}, 1200);
			this.startTransitionUntil = 0;
			this.startingGame = false;
		} catch (err) {
			console.error("Failed to start game:", err);
			this.isStarted = false;
			this.startTransitionUntil = 0;
			this.startingGame = false;
			this.showStartScreen();
			if (loadingOverlay && loadingOverlay.style.display !== "none") {
				loadingOverlay.style.display = "none";
			}
			this.hud?.showGameMessage?.("Ошибка запуска. Нажмите старт снова.");
			throw err;
		}
	}
}

window.addEventListener("DOMContentLoaded", () => {
	const yandex = new YandexBridge();
	const game = new Game(yandex);
	window.game = game;
	const yandexReady = yandex.init().catch((err) => {
		console.warn("Yandex init fallback:", err);
		return yandex;
	});
	Promise.all([game.ready, yandexReady]).then(() => yandex.signalReady());
	if (game.isMobile()) {
		document.body.classList.add("mobile");
		game.updateOrientationUI();
		window.addEventListener("orientationchange", () =>
			game.updateOrientationUI(),
		);
	}

	document.addEventListener("selectSlot", (event) => {
		if (!game?.player) return;
		const slot = typeof event.detail === "number" ? event.detail : null;
		if (slot === null) return;
		game.player.selectSlot(slot);
		game.player.updateViewWeapon();
	});

	document.addEventListener("selectPerk", (event) => {
		console.log("[selectPerk] DEBUG: event received", event);
		const perk = typeof event.detail === "string" ? event.detail : null;
		if (!perk) {
			console.warn("[selectPerk] no perk detail");
			return;
		}
		if (!game) {
			console.warn("[selectPerk] game is null");
			return;
		}
		if (!game.player) {
			console.warn("[selectPerk] game.player is null");
			return;
		}
		if (game.perkLocked) {
			game.hud.showGameMessage(
				"\u041f\u0435\u0440\u043a \u0443\u0436\u0435 \u0432\u044b\u0431\u0440\u0430\u043d",
			);
			return;
		}
		game.applyPerk(perk);
		game.perkLocked = true;
		game.perkSelectionRequired = false;
		game.hud.setPerkPanelLock(false);
		game.perkMenuOpen = false;
		game.hud.togglePerkPanel(false);
		if (game.renderer?.domElement) {
			game.renderer.domElement.style.pointerEvents = "auto";
			game.renderer.domElement.focus?.({ preventScroll: true });
		}
		if (!game.isMobile()) game.cameraController?.lock?.();
		game.hud.showGameMessage(
			"\u041f\u0435\u0440\u043a \u0430\u043a\u0442\u0438\u0432\u0438\u0440\u043e\u0432\u0430\u043d",
		);
		console.log("[selectPerk] Applied:", perk);
	});

	document.addEventListener("setAudioSettings", (event) => {
		const detail = event.detail || {};
		const settings = game.saveUserSettings({
			musicVolume: detail.musicVolume,
			sfxVolume: detail.sfxVolume,
		});
		game.applyUserSettings(settings);
	});

	document.addEventListener("setLookSensitivity", (event) => {
		const value = Number(event.detail);
		if (!Number.isFinite(value)) return;
		const settings = game.saveUserSettings({ lookSensitivity: value });
		game.applyUserSettings(settings);
	});

	document.addEventListener("resetSettings", () => {
		game.resetUserSettings();
	});

	const bindStartButton = (button) => {
		if (!button) return;

		let _startHandled = false;

		const handleStart = async (event) => {
			if (event?.cancelable) event.preventDefault();
			if (_startHandled || game.startingGame || game.isStarted) return;
			_startHandled = true;
			button.setAttribute("aria-busy", "true");
			try {
				await game.ready;
				// Ensure AudioContext is unlocked before game starts (critical on mobile/Android)
				await game.audioSynth?.unlock?.();
				game.enterFullscreen?.().catch(() => {});
				await game.startGame();
			} catch (err) {
				console.error("startGame failed:", err);
			} finally {
				button.removeAttribute("aria-busy");
				if (!game.isStarted) _startHandled = false;
			}
		};

		button.addEventListener("pointerup", handleStart);
		button.addEventListener("click", handleStart);
		button.addEventListener("touchend", handleStart, { passive: false });
	};

	bindStartButton(document.getElementById("startButtonDesktop"));
	bindStartButton(document.getElementById("startButtonMobile"));
	bindStartButton(document.getElementById("startButtonMobileLandscape"));
	bindStartButton(document.getElementById("startButton"));
});
