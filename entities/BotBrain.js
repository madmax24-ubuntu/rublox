import * as THREE from "three";

const STATES = {
	IDLE: "idle",
	LOOT: "loot",
	EXPLORE: "explore",
	ENGAGE: "engage",
	RELOAD_COVER: "reloadCover",
	RETREAT: "retreat",
	SURVIVAL: "survival",
	ZONE_RETREAT: "zoneRetreat",
	SHELTER: "shelter",
	HIDE: "hide",
};

const WEAPON_PRIORITY = {
	bazooka: 10,
	machinegun: 9,
	rifle: 8,
	shotgun: 7,
	laser: 7,
	flamethrower: 6,
	bow: 5,
	pistol: 4,
	knife: 3,
	fists: 1,
};

export class BotBrain {
	static clearReservations() {
		BotBrain._lootReservations?.clear();
		BotBrain._combatReservations?.clear();
	}

	constructor() {
		if (!BotBrain._lootReservations) BotBrain._lootReservations = new Map();
		if (!BotBrain._combatReservations) BotBrain._combatReservations = new Map();
		this.visionMultiplier = 1;
		this.decisionCooldown = 0;
		this.attackCooldown = 0;
		this.retargetCooldown = 0;
		this._tmpVec = new THREE.Vector3();
		this._tmpFrom = new THREE.Vector3();
		this._tmpTo = new THREE.Vector3();
		this._tmpMoveDir = new THREE.Vector3();
		this._tmpMoveLeft = new THREE.Vector3();
		this._tmpMoveRight = new THREE.Vector3();
		this._tmpMoveTarget = new THREE.Vector3();
		this._rngShift = Math.random() * 1000;
		this._tmpForward = new THREE.Vector3();
		this._tmpToTarget = new THREE.Vector3();
		this._tmpShelterDir = new THREE.Vector3();
		this._tmpEnemyDir = new THREE.Vector3();
		this._tmpRandomDir = new THREE.Vector3();
		this._tmpSide = new THREE.Vector3();
        this._tmpSideTarget = new THREE.Vector3();
        this._tmpCoverVec = new THREE.Vector3();
        this._tmpSpreadVec = new THREE.Vector3();
        this._spreadResult = new THREE.Vector3();
        this._candidates = [];
        this._cand1 = {};
        this._cand2 = {};
        this._cand3 = {};
        this._meleeItems = [];
        this._tmpStuckEscape = new THREE.Vector3();
        this._cachedCtx = {};
	this.baseVisionRange = 144;
		this.fov = 178 * (Math.PI / 180);
		this.hearingRange = 64;
		this.shotHearingRange = 120;
		this.losMemorySeconds = 4;
		this.reactionMin = 0.04;
		this.reactionMax = 0.1;
		this._nextElevatedRouteAt = 0;
	}

	getNearbySnapshot(bot, entityManager, radius) {
		const source = entityManager?.getNearbyEntities
			? entityManager.getNearbyEntities(bot.position, radius)
			: entityManager?.getEntities?.() || [];
		const snapshot =
			bot._nearbyEntitySnapshot || (bot._nearbyEntitySnapshot = []);
		snapshot.length = 0;
		for (const entity of source) snapshot.push(entity);
		return snapshot;
	}

	update(bot, delta, entityManager, lootManager, audioSynth, gameState) {
		if (!bot?.isAlive) {
			if (bot) {
				this.releaseLootReservation(bot);
				this.releaseCombatReservation(bot);
			}
			return;
		}

		this.decisionCooldown = Math.max(0, this.decisionCooldown - delta);
		this.attackCooldown = Math.max(0, this.attackCooldown - delta);
		this.retargetCooldown = Math.max(0, this.retargetCooldown - delta);

		bot._cachedItems = bot.inventory?.items || [];
		this.ensureBestWeaponEquipped(bot);
		this.handleStuck(bot);

		const now = performance.now();
		const inPreLootPhase = !!(bot.noCombatUntil && now < bot.noCombatUntil);
		const earlyGamePhase = inPreLootPhase;

		// Force context refresh when phases change — prevents stale cached state from keeping bots in combat
		const phaseChanged = !!(
			bot._lastPhase && bot._lastPhase !== earlyGamePhase
		);
		let ctx = bot._fsmCtx;
		if (!ctx || this.decisionCooldown <= 0 || phaseChanged) {
			const currentFps = bot.scene?.userData?.fps || 60;
			const skipFactor = currentFps >= 50 ? 1 : currentFps >= 35 ? 2 : currentFps >= 25 ? 3 : 4;
			if (skipFactor > 1 && (Number(bot.id) % skipFactor) !== 0 && !phaseChanged) {
				this.decisionCooldown = Math.max(this.decisionCooldown, 0.15);
			} else {
				ctx = this.collectContext(bot, entityManager, lootManager, gameState, bot._fsmCtx);
				ctx.earlyGamePhase = earlyGamePhase;
				bot._fsmCtx = ctx;
				bot._lastPhase = earlyGamePhase;
				const nextState = this.pickState(bot, ctx);
				bot.state = nextState;
				if (nextState !== STATES.LOOT && nextState !== STATES.EXPLORE)
					this.releaseLootReservation(bot);
				if (nextState !== STATES.ENGAGE) this.releaseCombatReservation(bot);
				this.decisionCooldown =
					nextState === STATES.ENGAGE
						? 0.2 + ((bot.id * 0.007) % 0.08)
						: 0.34 + ((bot.id * 0.007) % 0.13);
			}
		} else {
			ctx.earlyGamePhase = earlyGamePhase;
			ctx.inPreLootPhase = inPreLootPhase;
			if (ctx.zone) {
				ctx.outsideZone = !ctx.zone.isInsideZone(bot.position);
				ctx.zoneDistance = ctx.zone.getDistanceFromZone(bot.position);
			}
			if (bot.state === STATES.ENGAGE && ctx.nearestEnemy?.isAlive === false) {
				bot.state = STATES.EXPLORE;
				this.releaseCombatReservation(bot);
				ctx.nearestEnemy = null;
				ctx.nearestEnemyDist = Infinity;
			}
			if (bot.state === STATES.LOOT && ctx.lootTarget) {
				const chest = ctx.lootTarget;
				if (chest.userData?.isOpen || chest._isOpen || bot.position.distanceTo(chest.position) > 80) {
					ctx.lootTarget = null;
					this.releaseLootReservation(bot);
				}
			}
		}

		if (inPreLootPhase || gameState === "spawn") {
			ctx.inPreLootPhase = true;
			ctx.earlyGamePhase = true;
			ctx.nearestEnemy = null;
			ctx.nearestEnemyDist = Infinity;
			bot._retaliationTarget = null;
			bot._retaliateUntil = 0;
			bot.target = null;
			bot.assistTarget = null;
			this.releaseCombatReservation(bot);
			if (bot.assignedBiomeGate && now < (bot.assignedBiomeUntil || 0)) {
				if (
					Math.hypot(bot.position.x, bot.position.z) < 55 &&
					bot.position.distanceTo(bot.assignedBiomeGate) > 3
				) {
					bot.state = STATES.EXPLORE;
					this.steerMove(bot, bot.assignedBiomeGate, bot.physics.speed * 1.35);
					return;
				}
				bot.assignedBiomeGate = null;
			}
			if (bot.assignedBiomeThreshold && now < (bot.assignedBiomeUntil || 0)) {
				if (
					Math.hypot(bot.position.x, bot.position.z) < 64 &&
					bot.position.distanceTo(bot.assignedBiomeThreshold) > 2.5
				) {
					bot.state = STATES.EXPLORE;
					this.steerMove(
						bot,
						bot.assignedBiomeThreshold,
						bot.physics.speed * 1.35,
					);
					return;
				}
				bot.assignedBiomeThreshold = null;
			}
			if (bot.assignedBiomeEntry && now < (bot.assignedBiomeUntil || 0)) {
				if (
					Math.hypot(bot.position.x, bot.position.z) < 72 &&
					bot.position.distanceTo(bot.assignedBiomeEntry) > 8
				) {
					bot.state = STATES.EXPLORE;
					this.steerMove(bot, bot.assignedBiomeEntry, bot.physics.speed * 1.25);
					return;
				}
				bot.assignedBiomeEntry = null;
			}
			if (ctx.nearestZombieDist < 18 && ctx.shelterTarget) {
				bot.state = STATES.HIDE;
				this.actHide(bot, ctx);
			} else if (ctx.lootTarget) {
				bot.state = STATES.LOOT;
				this.actLoot(bot, ctx, lootManager);
			} else {
				bot.state = STATES.EXPLORE;
				this.actExplore(bot, ctx);
			}
			return;
		}

		const retaliating =
			bot._retaliationTarget?.isAlive && now < (bot._retaliateUntil || 0);
		if (
			!earlyGamePhase &&
			retaliating &&
			bot.position.distanceTo(bot._retaliationTarget.position) <= 65 &&
			!bot.forceShelterActive &&
			!ctx.outsideZone
		) {
			ctx.nearestEnemy = bot._retaliationTarget;
			ctx.nearestEnemyDist = bot.position.distanceTo(
				bot._retaliationTarget.position,
			);
			ctx.inPreLootPhase = false;
			ctx.earlyGamePhase = false;
			bot.state = STATES.ENGAGE;
			this.actEngage(bot, ctx, entityManager);
			return;
		}
		if (
			bot.assignedBiomeGate &&
			now < (bot.assignedBiomeUntil || 0) &&
			!bot.forceShelterActive &&
			!ctx.outsideZone
		) {
			if (
				Math.hypot(bot.position.x, bot.position.z) < 55 &&
				bot.position.distanceTo(bot.assignedBiomeGate) > 3
			) {
				bot.state = STATES.EXPLORE;
				this.steerMove(bot, bot.assignedBiomeGate, bot.physics.speed * 1.35);
				return;
			}
			bot.assignedBiomeGate = null;
		}
		if (
			bot.assignedBiomeThreshold &&
			now < (bot.assignedBiomeUntil || 0) &&
			!bot.forceShelterActive &&
			!ctx.outsideZone
		) {
			if (
				Math.hypot(bot.position.x, bot.position.z) < 64 &&
				bot.position.distanceTo(bot.assignedBiomeThreshold) > 2.5
			) {
				bot.state = STATES.EXPLORE;
				this.steerMove(
					bot,
					bot.assignedBiomeThreshold,
					bot.physics.speed * 1.35,
				);
				return;
			}
			bot.assignedBiomeThreshold = null;
		}
		if (
			!retaliating &&
			bot.assignedBiomeEntry &&
			now < (bot.assignedBiomeUntil || 0) &&
			!bot.forceShelterActive &&
			!ctx.outsideZone
		) {
			const distToEntry = bot.position.distanceTo(bot.assignedBiomeEntry);
			if (Math.hypot(bot.position.x, bot.position.z) < 72 && distToEntry > 8) {
				bot.state = STATES.EXPLORE;
				this.steerMove(bot, bot.assignedBiomeEntry, bot.physics.speed * 1.25);
				return;
			}
			bot.assignedBiomeEntry = null;
		}

		if (
			bot._centerEvacuationTarget &&
			now < (bot._centerEvacuationUntil || 0)
		) {
			if (Math.hypot(bot.position.x, bot.position.z) < 66) {
				bot.state = STATES.ZONE_RETREAT;
				this.steerMove(
					bot,
					bot._centerEvacuationTarget,
					bot.physics.speed * 1.45,
				);
				return;
			}
			bot._centerEvacuationTarget = null;
		}

		if (this.followElevatedRoute(bot, ctx, now)) return;

		if (bot.state === STATES.SHELTER) {
			this.actShelter(bot, ctx, lootManager);
			return;
		}
		if (bot.state === STATES.ZONE_RETREAT) {
			this.actZoneRetreat(bot, ctx);
			return;
		}
		if (bot.state === STATES.SURVIVAL) {
			this.actSurvival(bot, ctx);
			return;
		}
		if (bot.state === STATES.RETREAT) {
			this.actRetreat(bot, ctx);
			return;
		}
		if (bot.state === STATES.RELOAD_COVER) {
			this.actReloadCover(bot, ctx);
			return;
		}
		// Respect loot pause — bot stands still briefly after looting
		if (bot._lootPauseUntil && performance.now() < bot._lootPauseUntil) {
			bot.physics.velocity.x *= 0.8;
			bot.physics.velocity.z *= 0.8;
			return;
		}

		if (bot.state === STATES.LOOT) {
			this.actLoot(bot, ctx, lootManager);
			return;
		}
		if (bot.state === STATES.EXPLORE) {
			this.actExplore(bot, ctx);
			return;
		}
		if (bot.state === STATES.HIDE) {
			this.actHide(bot, ctx);
			return;
		}
		if (bot.state === STATES.ENGAGE) {
			this.actEngage(bot, ctx, entityManager);
			return;
		}
		// Handle 'spawn' state — transition to proper state immediately
		if (bot.state === "spawn") {
			bot.state = STATES.EXPLORE;
			this.actExplore(bot, ctx);
			return;
		}
		this.actIdle(bot, ctx);
	}

	collectContext(bot, entityManager, lootManager, gameState, ctx) {
		if (!ctx) ctx = {};
		const now = performance.now();
		const phaseGear = this.getGearScore(bot);
		const inPreLootPhase = !!(bot.noCombatUntil && now < bot.noCombatUntil);
		const earlyGamePhase = inPreLootPhase;

		const hp = bot.health / Math.max(1, bot.maxHealth || 100);
		const zone = bot.zoneRef;
		const outsideZone = zone?.isInsideZone
			? !zone.isInsideZone(bot.position)
			: false;
		const zoneDistance = zone?.getDistanceFromZone
			? zone.getDistanceFromZone(bot.position)
			: 0;

		const queryRadius = earlyGamePhase
			? 76
			: Math.min(144, this.baseVisionRange * this.visionMultiplier);
		const closeCombatRadius = 56;

		const cacheAge = (bot._nearbyCacheTime || 0) + 0.2 - now / 1000;
		let nearby = null;
		if (cacheAge > 0) {
			nearby = bot._cachedNearby;
		} else {
			nearby = this.getNearbySnapshot(bot, entityManager, queryRadius);
			bot._cachedNearby = nearby;
			bot._nearbyCacheTime = now / 1000;
		}

		// OPTIMIZED: Skip gunfire detection during early game (rare shots)
		const heardShot = earlyGamePhase
			? false
			: this.detectNearbyGunfire(bot, entityManager, this.shotHearingRange);

		let nearestEnemy = null;
		let nearestEnemyDist = Infinity;
		let nearestZombie = null;
		let nearestZombieDist = Infinity;

		const sin = Math.sin(bot.rotation.y);
		const cos = Math.cos(bot.rotation.y);
		this._tmpForward.set(sin, 0, cos);
		const forward = this._tmpForward;
		const fovCos = Math.cos(this.fov / 2);

		const skipLos = (Math.floor(now / 240) + bot.id) % 4 < 3;
		const skipLosEarlyGame = earlyGamePhase;

		const hearingRangeSq = this.hearingRange * this.hearingRange;
		const shotHearingSq = this.shotHearingRange * this.shotHearingRange;

		for (const ent of nearby) {
			if (!ent?.isAlive || ent === bot) continue;
			const type = ent.constructor?.name;
			const isEnemySurvivor = type === "Player" || type === "Bot";
			const isZombie = type === "Zombie";
			if (!isEnemySurvivor && !isZombie) continue;
			// FIX: During early game / pre-loot phase, survivors are NOT enemies — only zombies
			if (earlyGamePhase && isEnemySurvivor) continue;

			const dx = ent.position.x - bot.position.x;
			const dz = ent.position.z - bot.position.z;
			const dSq = dx * dx + dz * dz;
			if (!Number.isFinite(dSq) || dSq < 1e-6) continue;

			if (isEnemySurvivor && dSq < nearestEnemyDist * nearestEnemyDist) {
				const d = Math.sqrt(dSq);
				let hasLos;
				if (skipLosEarlyGame) {
					hasLos = d < 15;
				} else if (!skipLos) {
					hasLos = this.hasLoS(bot, ent, entityManager);
				} else {
					hasLos =
						(bot._cachedLosTarget === ent.id && !!bot._cachedLos) || d < 12;
				}
				const heard =
					dSq <= hearingRangeSq || (heardShot && dSq <= shotHearingSq);
				if (hasLos || heard) {
					this._tmpToTarget.set(dx, 0, dz).normalize();
					const inVisionCone =
						forward.dot(this._tmpToTarget) >= fovCos || d < 14;
					if ((hasLos && inVisionCone) || heard) {
						nearestEnemyDist = d;
						nearestEnemy = ent;
						if (hasLos && !skipLosEarlyGame) {
							bot.lastSeenEnemyAt = now;
							bot._cachedLos = true;
							bot._cachedLosTarget = ent.id;
						}
					}
				}
			}

			if (isZombie && dSq < nearestZombieDist * nearestZombieDist) {
				nearestZombieDist = Math.sqrt(dSq);
				nearestZombie = ent;
			}
		}
		const enemyRecentlySeen =
			!!nearestEnemy ||
			now - (bot.lastSeenEnemyAt || 0) <= this.losMemorySeconds * 1000;

		const lootRadius = hp < 0.5 ? 150 : 112;
		let lootTarget = bot._lootSearchTarget;
		if (lootTarget?.userData?.isOpen || !lootTarget?.position)
			lootTarget = null;
		if (bot._nextLootSearchAt === undefined) {
			bot._nextLootSearchAt = now + (Number(bot.id) % 12) * 37;
		}
		if (now >= bot._nextLootSearchAt) {
			const chests = lootManager?.getNearbyChests
				? lootManager.getNearbyChests(bot.position, lootRadius, true)
				: [];
			lootTarget = this.pickBestChest(bot, chests, entityManager);
			bot._lootSearchTarget = lootTarget;
			bot._nextLootSearchAt = now + 700 + (Number(bot.id) % 11) * 43;
		}

		const map = bot.mapRef;
		const sheltered = map?.isShelteredFromRain?.(bot.position) || false;
		const shelterTarget = this.findNearestShelterTarget(bot);
		// earlyGamePhase already computed at top of collectContext
		const crowdNear = this.countNearbyCombatants(bot, entityManager, 6.5);
		const gear = this.getGearScore(bot);
		const combatReady = this.isCombatReady(bot);
		let huntTarget = bot._huntTarget;
		if (!earlyGamePhase && combatReady) {
			if (
				!huntTarget?.isAlive ||
				now >= (bot._huntUntil || 0) ||
				!this.isInAssignedBiome(bot, huntTarget.position)
			) {
				huntTarget = null;
			}
			if (now >= (bot._nextHuntSearchAt || 0)) {
				const alive = entityManager?.getAliveSurvivors?.();
				const survivors = alive?.length
					? alive
					: entityManager?.getEntities?.() || [];
				const limit = Math.min(28, survivors.length);
				const start = survivors.length
					? (Number(bot.id) * 17) % survivors.length
					: 0;
				let bestScore = Infinity;
				for (let i = 0; i < limit; i++) {
					const candidate = survivors[(start + i * 11) % survivors.length];
					if (
						!candidate?.isAlive ||
						candidate === bot ||
						!this.isInAssignedBiome(bot, candidate.position)
					)
						continue;
					const distance = bot.position.distanceTo(candidate.position);
					if (distance < 12 || distance > 170) continue;
					const spread =
						((Number(candidate.id) * 19 + Number(bot.id) * 31) % 47) * 0.7;
					const score = distance + spread;
					if (score < bestScore) {
						bestScore = score;
						huntTarget = candidate;
					}
				}
				bot._huntTarget = huntTarget;
				bot._huntUntil = huntTarget
					? now + 5000 + (Number(bot.id) % 7) * 240
					: 0;
				bot._nextHuntSearchAt = now + 1700 + (Number(bot.id) % 13) * 73;
			}
		} else {
			huntTarget = null;
			bot._huntTarget = null;
		}

		// Compute avoidance force — steer away from nearby players/bots
		// During early game, use larger radius (14m) and stronger force for scatter
		let avoidX = 0,
			avoidZ = 0;
		let avoidCount = 0;
		const maxAvoidChecks = Math.min(nearby.length, earlyGamePhase ? 16 : 12);
		const avoidRadiusSq = earlyGamePhase ? 196 : 64; // 14m radius during early game, 8m otherwise
		for (let i = 0; i < maxAvoidChecks; i++) {
			const ent = nearby[i];
			if (!ent?.isAlive || ent === bot) continue;
			const type = ent.constructor?.name;
			if (type !== "Player" && type !== "Bot") continue;
			const dx = ent.position.x - bot.position.x;
			const dz = ent.position.z - bot.position.z;
			const dSq = dx * dx + dz * dz;
			if (dSq < avoidRadiusSq && dSq > 0.01) {
				const d = Math.sqrt(dSq);
				const force = earlyGamePhase ? 8.5 / (dSq + 0.35) : 4.2 / (dSq + 0.35);
				avoidX -= (dx / d) * force;
				avoidZ -= (dz / d) * force;
				avoidCount++;
				if (avoidCount >= (earlyGamePhase ? 8 : 6)) break;
			}
		}
		bot._avoidX = avoidX;
		bot._avoidZ = avoidZ;

		// Ally awareness: count nearby bots and find the closest one
		let nearestAlly = null;
		let nearestAllyDist = Infinity;
		let allyCount = 0;
		const allyRadiusSq = 64 * 64;
		for (const ent of nearby) {
			if (!ent?.isAlive || ent === bot) continue;
			if (ent.constructor?.name !== 'Bot') continue;
			const dx = ent.position.x - bot.position.x;
			const dz = ent.position.z - bot.position.z;
			const dSq = dx * dx + dz * dz;
			if (dSq < allyRadiusSq) {
				allyCount++;
				const d = Math.sqrt(dSq);
				if (d < nearestAllyDist) {
					nearestAllyDist = d;
					nearestAlly = ent;
				}
			}
		}

		// Memory-based avoidance: steer away from recently looted areas and enemy encounters
		const memoryAgeLimit = 120000; // 2 minutes — forget after that
		if (now >= (bot._nextMemoryCleanupAt || 0)) {
			while (
				bot.lootedAreas.length &&
				now - bot.lootedAreas[0].time >= memoryAgeLimit
			)
				bot.lootedAreas.shift();
			while (
				bot.enemyEncounters.length &&
				now - bot.enemyEncounters[0].time >= memoryAgeLimit
			)
				bot.enemyEncounters.shift();
			bot._nextMemoryCleanupAt = now + 4000 + (Number(bot.id) % 13) * 97;
		}

		// Avoid looted areas (don't waste time going back)
		for (const area of bot.lootedAreas) {
			const dx = bot.position.x - area.pos.x;
			const dz = bot.position.z - area.pos.z;
			const dSq = dx * dx + dz * dz;
			if (dSq < 400 && dSq > 0.01) {
				// 20m radius
				const d = Math.sqrt(dSq);
				const force = 3.0 / (dSq + 1);
				bot._avoidX += (dx / d) * force;
				bot._avoidZ += (dz / d) * force;
			}
		}

		// Avoid enemy encounter areas (dangerous spots)
		for (const enc of bot.enemyEncounters) {
			const dx = bot.position.x - enc.pos.x;
			const dz = bot.position.z - enc.pos.z;
			const dSq = dx * dx + dz * dz;
			if (dSq < 900 && dSq > 0.01) {
				// 30m radius
				const d = Math.sqrt(dSq);
				const force = (5.0 / (dSq + 1)) * (enc.damage / 50); // scaled by damage received
				bot._avoidX += (dx / d) * force;
				bot._avoidZ += (dz / d) * force;
			}
		}

		const retaliationTarget = bot._retaliationTarget;
		if (retaliationTarget?.isAlive && now < (bot._retaliateUntil || 0)) {
			const retaliationDist = bot.position.distanceTo(
				retaliationTarget.position,
			);
			if (retaliationDist <= 65) {
				nearestEnemy = retaliationTarget;
				nearestEnemyDist = retaliationDist;
			}
		} else {
		bot._retaliationTarget = null;
			bot._retaliateUntil = 0;
		}

		const targetFloorDiff = nearestEnemy
			? Math.abs(nearestEnemy.position.y - bot.position.y)
			: 0;

		if (!ctx) ctx = {};
		Object.assign(ctx, {
			now,
			hp,
			zone,
			outsideZone,
			zoneDistance,
			nearestEnemy,
			nearestEnemyDist,
			targetFloorDiff,
			nearestZombie,
			nearestZombieDist,
			heardShot,
			enemyRecentlySeen,
			lootTarget,
			sheltered,
			shelterTarget,
			inPreLootPhase,
			earlyGamePhase,
			crowdNear,
			gear,
			combatReady,
			huntTarget,
			closeCombatRadius,
			allyCount,
			nearestAlly,
			nearestAllyDist,
			survivorCount: Number(bot.scene?.userData?.aliveSurvivorCount) || 100,
			gameState,
		});
		return ctx;
	}

	hasLoS(bot, target, entityManager) {
		if (!bot?.position || !target?.position) return false;
		if (!entityManager?.hasLineOfSight) return true;
		const fromY = bot.position.y + (bot.physics?.height || 1.8) * 0.55;
		const toY = target.position.y + (target.physics?.height || 1.8) * 0.55;
		this._tmpFrom.set(bot.position.x, fromY, bot.position.z);
		this._tmpTo.set(target.position.x, toY, target.position.z);
		return entityManager.hasLineOfSight(this._tmpFrom, this._tmpTo, true);
	}

	detectNearestEnemyForEarlyGame(bot, entityManager) {
		// FIX: During early game, survivors are NOT enemies — return null so bots don't target each other
		return null;
	}

	detectNearbyGunfire(bot, entityManager, range) {
		const projs = entityManager?.projectiles;
		if (!projs?.length || !bot?.position) return false;
		const now = performance.now();
		const maxAge = 320;
		const rangeSq = range * range;
		for (let i = projs.length - 1; i >= 0; i--) {
			const p = projs[i];
			if (!p?.mesh?.position) continue;
			const ownerType = p.owner?.constructor?.name;
			if (ownerType !== "Player" && ownerType !== "Bot") continue;
			if (p._bornAt === undefined) p._bornAt = now;
			if (now - p._bornAt > maxAge) continue;
			// OPTIMIZED: use squared distance
			const dx = bot.position.x - p.mesh.position.x;
			const dz = bot.position.z - p.mesh.position.z;
			if (dx * dx + dz * dz <= rangeSq) return true;
		}
		return false;
	}

	pickState(bot, ctx) {
		if (bot.forceShelterActive) {
			return ctx.sheltered ? STATES.SHELTER : STATES.ZONE_RETREAT;
		}

		if (ctx.outsideZone || ctx.zoneDistance > 0.5) {
			return STATES.ZONE_RETREAT;
		}

		const lowHp = ctx.hp < 0.35;
		const veryLowHp = ctx.hp < 0.2;
		const fleeHp = ctx.hp < 0.3;
		const underPressure =
			ctx.nearestEnemy && ctx.nearestEnemyDist < ctx.closeCombatRadius;
		const armed = !!bot.currentWeapon && bot.currentWeapon.type !== "fists";
		const wellArmed = ctx.combatReady;
		const hasMedkit = (bot.medkits || 0) > 0;
		const retaliating =
			!!bot._retaliationTarget &&
			bot._retaliationTarget.isAlive &&
			performance.now() < (bot._retaliateUntil || 0);

		// Personality-driven thresholds
		const agg = Math.min(
			1,
			Math.max(0.76, bot.personality?.aggression ?? 0.5) + ctx.gear * 0.4,
		);
		const cau = bot.personality?.caution ?? 0.5;
		const lootF = bot.personality?.lootFocus ?? 0.5;

		// Aggression adjusts engagement distance: aggressive bots engage from further away
		const endgame = ctx.survivorCount <= 20;
		const engageDist =
			ctx.closeCombatRadius * (0.9 + agg * 0.95) * (endgame ? 1.25 : 1);
		// Caution adjusts undergeared threshold: cautious bots hide with less gear
		const undergearedThreshold = 0.24 + cau * 0.14;
		// Aggression adjusts crowd tolerance: aggressive bots tolerate more crowd in combat
		const crowdTolerance = ctx.earlyGamePhase
			? 2
			: Math.min(5, Math.max(4, Math.round(3 + agg * 2)));
		// Caution adjusts retreat threshold: cautious bots retreat at higher HP
		const retreatHpThreshold = 0.2 + cau * 0.15;

		// Helper: check if bot has a real weapon (not knife/fists)
		const hasRealWeapon =
			bot.currentWeapon &&
			bot.currentWeapon.type !== "knife" &&
			bot.currentWeapon.type !== "fists";

		if (ctx.inPreLootPhase) {
			if (
				(ctx.nearestEnemyDist < 18 || ctx.nearestZombieDist < 18) &&
				ctx.shelterTarget
			)
				return STATES.HIDE;
			if (ctx.lootTarget) return STATES.LOOT;
			return STATES.EXPLORE;
		}
		// === MANDATORY LOOT PRIORITY: if bot has no weapon or only knife, force loot ===
		if (!hasRealWeapon && ctx.lootTarget) {
			return STATES.LOOT;
		}

		// === PHASE 1: Pre-loot (0-35s) ===
		// Bots NEVER engage — only loot, explore, or hide from very close threats
		if (ctx.inPreLootPhase) {
			if (
				ctx.nearestZombie &&
				ctx.nearestZombieDist < 12 &&
				ctx.shelterTarget
			) {
				return STATES.HIDE;
			}
			if (ctx.lootTarget) return STATES.LOOT;
			return STATES.EXPLORE;
		}

		// FIX: Also block engagement during SPAWN game phase (pre-combat invulnerable window)
		// During spawn phase, bots should ONLY loot and explore
		if (ctx.gameState === "spawn") {
			if (
				ctx.nearestZombie &&
				ctx.nearestZombieDist < 12 &&
				ctx.shelterTarget
			) {
				return STATES.HIDE;
			}
			if (ctx.lootTarget) return STATES.LOOT;
			return STATES.EXPLORE;
		}

		// === PHASE 2: Early game (35-80s) — still prioritize looting ===
		// Undergeared bots never engage — well-armed bots engage cautiously
		if (ctx.earlyGamePhase) {
			// Survival always wins
			if ((veryLowHp && hasMedkit) || (lowHp && hasMedkit && underPressure)) {
				return STATES.SURVIVAL;
			}
			if (
				veryLowHp &&
				ctx.shelterTarget &&
				(!ctx.nearestEnemy || ctx.nearestEnemyDist > 10)
			) {
				return STATES.ZONE_RETREAT;
			}
			const undergeared = !wellArmed || ctx.gear < undergearedThreshold;
			if (undergeared) {
				if (
					ctx.nearestZombie &&
					ctx.nearestZombieDist < 12 &&
					ctx.shelterTarget
				) {
					return STATES.HIDE;
				}
				if (ctx.lootTarget) return STATES.LOOT;
				if (ctx.nearestEnemy && ctx.nearestEnemyDist < 60) return STATES.HIDE;
				return STATES.EXPLORE;
			}

			// Well-armed bots: still avoid combat unless threatened
			if (ctx.crowdNear >= crowdTolerance) return STATES.EXPLORE;
			if (ctx.crowdNear >= 2) return STATES.EXPLORE;

			if (fleeHp && ctx.shelterTarget) return STATES.HIDE;
			if (fleeHp) return STATES.RETREAT;
			if (lowHp && underPressure && !hasMedkit) return STATES.HIDE;

			if (ctx.nearestEnemy && ctx.nearestEnemyDist < engageDist) {
				const isBeingShot = ctx.heardShot;
				const closeThreat = ctx.nearestEnemyDist < 15;
				if (isBeingShot && closeThreat && !veryLowHp) {
					return STATES.ENGAGE;
				}
				if (!hasRealWeapon && ctx.nearestEnemyDist > 8) {
					return STATES.LOOT;
				}
				if (
					isBeingShot &&
					wellArmed &&
					ctx.gear >= undergearedThreshold &&
					ctx.crowdNear < crowdTolerance
				) {
					return STATES.ENGAGE;
				}
				if (
					wellArmed &&
					ctx.nearestEnemyDist < engageDist * 0.72 &&
					ctx.crowdNear < 3 &&
					ctx.hp > 0.42
				)
					return STATES.ENGAGE;
				if (ctx.lootTarget && ctx.nearestEnemyDist > 12) return STATES.LOOT;
				return STATES.EXPLORE;
			}

			if (ctx.lootTarget) return STATES.LOOT;
			return STATES.EXPLORE;
		}

		// === PHASE 3: Mid/Late game — normal combat ===
		// Only engage zombies after both phases are over
		if (ctx.nearestZombie && ctx.nearestZombieDist < 16) {
			// Zombies are a threat — engage unless critically low HP
			if (veryLowHp) return ctx.shelterTarget ? STATES.RETREAT : STATES.EXPLORE;
			if (lowHp && !wellArmed)
				return ctx.shelterTarget ? STATES.RETREAT : STATES.EXPLORE;
			return STATES.ENGAGE;
		}
		// Extended zombie threat radius — bots engage zombies aggressively
		if (ctx.nearestZombie && ctx.nearestZombieDist < 40) {
			if (hasRealWeapon && !veryLowHp && !lowHp) return STATES.ENGAGE;
			if (ctx.nearestZombieDist < 25 && !veryLowHp) return STATES.ENGAGE;
			if (ctx.nearestZombieDist < 12 && !veryLowHp) return STATES.ENGAGE;
			if (ctx.nearestZombieDist < 10 && lowHp) return STATES.RETREAT;
		}

		// Hunt active target — engage if weapon ready
		if (
			hasRealWeapon &&
			ctx.huntTarget?.isAlive &&
			ctx.hp >= 0.28 &&
			ctx.crowdNear < 8
		) {
			return STATES.ENGAGE;
		}

		// === PHASE 3: Mid/Late game — normal combat ===
		// 1. Critical Survival
		if ((veryLowHp && hasMedkit) || (lowHp && hasMedkit && underPressure)) {
			return STATES.SURVIVAL;
		}
		// FIX: NO retaliation engagement during extended earlyGamePhase — bots must NOT fight each other
		// (This check is only valid when earlyGamePhase is FALSE — i.e., well-geared normal combat)

		// 1b. Critical HP → flee and hide immediately
		if (fleeHp && ctx.shelterTarget) return STATES.HIDE;
		if (fleeHp) return STATES.RETREAT;

		// 2. Retreat/Hide if in trouble (caution-adjusted)
		if (
			ctx.hp < retreatHpThreshold &&
			ctx.shelterTarget &&
			(!ctx.nearestEnemy || ctx.nearestEnemyDist > 10)
		)
			return STATES.ZONE_RETREAT;
		if (lowHp && underPressure && !hasMedkit) return STATES.HIDE;

		// 3. Avoid crowds — leave fights with multiple combatants
		const crowdLeave = Math.max(7, Math.round(crowdTolerance + 2));
		if (ctx.crowdNear >= crowdLeave) {
			return STATES.EXPLORE;
		}
		// Extra guard: don't engage if surrounded by multiple enemies
		if (ctx.nearestEnemy && ctx.crowdNear >= crowdLeave && !ctx.heardShot) {
			return STATES.EXPLORE;
		}

		// 4. Undergeared — prioritize loot, hide from range, but self-defense always allowed
		const undergeared = !wellArmed || ctx.gear < undergearedThreshold;
		if (undergeared) {
			// Self-defense: engage if being shot at close range regardless of gear
			const isBeingShot = ctx.heardShot;
			const closeThreat = ctx.nearestEnemyDist < 15;
			if (isBeingShot && closeThreat && !veryLowHp) return STATES.ENGAGE;
			if (ctx.nearestEnemy && ctx.nearestEnemyDist < 8 && !veryLowHp)
				return STATES.ENGAGE;
			// Better self-defense: engage if enemy is visible and within medium range
			if (
				hasRealWeapon &&
				ctx.nearestEnemy &&
				ctx.nearestEnemyDist < 48 &&
				ctx.crowdNear < 5 &&
				!veryLowHp
			)
				return STATES.ENGAGE;
			if (ctx.lootTarget) return STATES.LOOT;
			if (ctx.nearestEnemy && ctx.nearestEnemyDist < 45) return STATES.HIDE;
			return STATES.EXPLORE;
		}

		if (
			endgame &&
			armed &&
			ctx.hp >= 0.28 &&
			ctx.nearestEnemy &&
			ctx.nearestEnemyDist < engageDist &&
			ctx.crowdNear < 6
		) {
			return STATES.ENGAGE;
		}

		if (ctx.nearestEnemy && ctx.nearestEnemyDist < engageDist) {
			// BLOCK engage: knife-only bots must not fight at range
			if (!hasRealWeapon && ctx.nearestEnemyDist > 2) {
				return STATES.LOOT;
			}
			const isBeingAttacked =
				ctx.heardShot ||
				(bot._lastAttackedBy && performance.now() - bot._lastAttackedBy < 3500);
			if (isBeingAttacked && ctx.crowdNear < crowdTolerance) {
				return STATES.ENGAGE;
			}
			if (
				wellArmed &&
				ctx.nearestEnemyDist < engageDist &&
				ctx.crowdNear < crowdLeave
			) {
				return STATES.ENGAGE;
			}
			// Retaliate for recent attacks — extended window
			if (
				bot._lastAttackedBy &&
				performance.now() - bot._lastAttackedBy < 5000 &&
				ctx.crowdNear < 3
			) {
				return STATES.ENGAGE;
			}
			// Always loot if target available and enemy not too close
			if (ctx.lootTarget && ctx.nearestEnemyDist > 15) return STATES.LOOT;
			return STATES.EXPLORE;
		}

		// 6. Default — loot first, explore second
		if (ctx.lootTarget) return STATES.LOOT;
		return STATES.EXPLORE;
	}

	actIdle(bot, ctx) {
		// Occasional look-around — bot rotates to survey surroundings
		if (
			!bot._lastLookTime ||
			performance.now() - bot._lastLookTime > 4000 + Math.random() * 3000
		) {
			bot._lookAngle = Math.random() * Math.PI * 2;
			bot._lastLookTime = performance.now();
		}
		if (bot._lastLookTime && performance.now() - bot._lastLookTime < 4000) {
			const elapsed = (performance.now() - bot._lastLookTime) / 4000;
			const lookProgress = Math.sin(elapsed * Math.PI); // smooth back-and-forth
			bot.rotation.y = bot.lerpAngle(
				bot.rotation.y,
				bot._lookAngle,
				lookProgress * 0.15,
			);
		}

		// Occasionally check/reload weapon while idle
		if (
			bot.currentWeapon &&
			bot.currentWeapon.ammo !== null &&
			bot.currentWeapon.ammo < bot.currentWeapon.maxAmmo * 0.3
		) {
			if (
				!bot._reloadCheckTime ||
				performance.now() - bot._reloadCheckTime > 8000
			) {
				bot._reloadCheckTime = performance.now();
				// Bot briefly stops to check weapon
				if (bot.currentWeapon.ammo <= 0) {
					bot.currentWeapon.reload?.();
				}
			}
		}

		if (
			!bot.patrolTarget ||
			bot.position.distanceTo(bot.patrolTarget) < 5 ||
			bot.isStuck
		) {
			bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
		}
		if (bot.patrolTarget) {
			this.steerMove(bot, bot.patrolTarget, bot.physics.speed * 0.95);
		}
	}

	actExplore(bot, ctx) {
		const now = performance.now();
		// Move away from center during first 60 seconds — prevents cluster deaths
		const matchTime = bot._matchStartTime || 0;
		const elapsed = now - (matchTime || now);
		if (elapsed < 60000 && Math.hypot(bot.position.x, bot.position.z) < 30) {
			const angle = Math.atan2(bot.position.z, bot.position.x);
			const scatterDist = 40 + (bot.id % 5) * 8;
			const scatterTarget = this._tmpSpreadVec.set(
				Math.cos(angle) * scatterDist,
				bot.position.y,
				Math.sin(angle) * scatterDist,
			);
			this.steerMove(bot, scatterTarget, bot.physics.speed * 1.3);
			return;
		}
		if (bot.assignedBiomeEntry && now < (bot.assignedBiomeUntil || 0)) {
			if (Math.hypot(bot.position.x, bot.position.z) < 72) {
				this.steerMove(bot, bot.assignedBiomeEntry, bot.physics.speed * 1.25);
				return;
			}
			bot.assignedBiomeEntry = null;
		}
		if (bot.assignedBiomeTarget && now < (bot.assignedBiomeUntil || 0)) {
			if (bot.position.distanceTo(bot.assignedBiomeTarget) > 7) {
				bot.patrolTarget = bot.assignedBiomeTarget;
				this.steerMove(bot, bot.assignedBiomeTarget, bot.physics.speed * 1.25);
				return;
			}
			bot.assignedBiomeTarget = null;
		}

		// Active hunting: pursue known targets aggressively
		if (
			!ctx.earlyGamePhase &&
			ctx.combatReady &&
			ctx.huntTarget?.isAlive &&
			ctx.crowdNear < 6
		) {
			bot.patrolTarget = ctx.huntTarget.position;
			this.steerMove(bot, ctx.huntTarget.position, bot.physics.speed * 1.22);
			return;
		}
		// Respond to nearby gunfire — move toward sound or cover
		if (
			!ctx.earlyGamePhase &&
			ctx.heardShot &&
			!ctx.nearestEnemy &&
			bot.patrolTarget
		) {
			const dToTarget = bot.position.distanceTo(bot.patrolTarget);
			if (dToTarget < 10) {
				// Near patrol target but heard gunfire — reposition or investigate
				const reposition = this.pickSpreadTarget(bot, 20, 50);
				if (reposition) {
					bot.patrolTarget = reposition;
					bot._scatterTargetUntil = now + 6000;
					this.steerMove(bot, bot.patrolTarget, bot.physics.speed * 1.1);
					return;
				}
			}
		}

		const agg = Math.min(
			1,
			(bot.personality?.aggression ?? 0.5) + ctx.gear * 0.32,
		);
		// During loot phase or high crowd, scatter to opposite directions
		// Cautious bots scatter more easily; aggressive bots tolerate more crowd
		const scatterThreshold = ctx.earlyGamePhase ? 2 : 4;
		const isScatterPhase = ctx.earlyGamePhase || ctx.inPreLootPhase;
		const needsScatter = isScatterPhase || ctx.crowdNear >= scatterThreshold;

		if (needsScatter) {
			if (
				bot.patrolTarget &&
				now < (bot._scatterTargetUntil || 0) &&
				bot.position.distanceTo(bot.patrolTarget) > 5
			) {
				this.steerMove(
					bot,
					bot.patrolTarget,
					bot.physics.speed * (ctx.inPreLootPhase ? 1.1 : 1.0),
				);
				return;
			}
                // Pick a target far away — avoid ALL nearby bots, not just the nearest enemy
                const entityManager = bot.entityManagerRef;
                const nearby = bot._cachedNearby || [];

			// Compute average direction of nearby entities
			let avgX = 0,
				avgZ = 0,
				count = 0;
			for (const ent of nearby) {
				if (!ent?.isAlive || ent === bot) continue;
				const type = ent.constructor?.name;
				if (type !== "Player" && type !== "Bot") continue;
				avgX += ent.position.x;
				avgZ += ent.position.z;
				count++;
			}
			if (count > 0) {
				avgX /= count;
				avgZ /= count;
			}

			let scatterTarget = null;
			if (count >= 2) {
				// Scatter AWAY from the center of nearby entities
				const dirX = bot.position.x - avgX;
				const dirZ = bot.position.z - avgZ;
				const dirLength = Math.max(0.001, Math.hypot(dirX, dirZ));
				const nx = dirX / dirLength;
				const nz = dirZ / dirLength;
				const idAngle = ((Number(bot.id) || 0) * 2.399963229) % (Math.PI * 2);
				const uniqueWeight = 0.42;
				const combinedX = nx + Math.cos(idAngle) * uniqueWeight;
				const combinedZ = nz + Math.sin(idAngle) * uniqueWeight;
				const combinedLength = Math.max(
					0.001,
					Math.hypot(combinedX, combinedZ),
				);
                        const dist = ctx.earlyGamePhase
                                ? 44 + Math.random() * 28
                                : 32 + Math.random() * 24;
                        scatterTarget = this._spreadResult.set(
                                bot.position.x + (combinedX / combinedLength) * dist,
                                bot.position.y,
                                bot.position.z + (combinedZ / combinedLength) * dist,
                        );
			} else if (ctx.nearestEnemy) {
				const dir = this._tmpVec
					.set(
						bot.position.x - ctx.nearestEnemy.position.x,
						0,
						bot.position.z - ctx.nearestEnemy.position.z,
					)
					.normalize();
				const dist = (ctx.earlyGamePhase ? 48 : 34) + Math.random() * 24;
				scatterTarget = this._tmpSpreadVec.set(
					bot.position.x + dir.x * dist,
					bot.position.y,
					bot.position.z + dir.z * dist,
				);
			} else {
				// Unique deterministic direction per bot
				const seedAngle = bot.id * 2.399963227949204;
				const angle = seedAngle + Math.random() * 0.5;
				const radius = ctx.earlyGamePhase
					? 46 + Math.random() * 26
					: 34 + Math.random() * 20;
				scatterTarget = this._tmpSpreadVec.set(
					bot.position.x + Math.cos(angle) * radius,
					bot.position.y,
					bot.position.z + Math.sin(angle) * radius,
				);
			}

			if (!scatterTarget) return;
			if (!this.isInAssignedBiome(bot, scatterTarget)) {
				scatterTarget = this.pickSpreadTarget(bot, 40, 120);
				if (!scatterTarget) return;
			}
			// Avoid laser ring at radius 27
			const distToLaser = Math.hypot(scatterTarget.x, scatterTarget.z);
			if (distToLaser > 23 && distToLaser < 31) {
				const pushDir = distToLaser < 27 ? 1 : -1;
				const angle = Math.atan2(scatterTarget.z, scatterTarget.x);
				scatterTarget.set(
					Math.cos(angle) * (27 + 5 * pushDir),
					scatterTarget.y,
					Math.sin(angle) * (27 + 5 * pushDir),
                        );
                }
                if (bot.patrolTarget) bot.patrolTarget.copy(scatterTarget);
                bot._scatterTargetUntil = now + 5600 + (bot.id % 7) * 310;
			// Move at natural speed during scatter — no frantic sprinting
			const scatterSpeed = ctx.inPreLootPhase
				? 1.1
				: ctx.earlyGamePhase
					? 1.05
					: 0.95;
			this.steerMove(bot, scatterTarget, bot.physics.speed * scatterSpeed);
		} else {
			if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 5) {
				let target = this.pickSpreadTarget(bot, 40, 120);
				// Ally attraction: bias patrol toward nearby allies during exploration
				if (ctx.nearestAlly && ctx.nearestAllyDist < 50 && target) {
					const dx = ctx.nearestAlly.position.x - bot.position.x;
					const dz = ctx.nearestAlly.position.z - bot.position.z;
					const allyWeight = Math.max(0, (50 - ctx.nearestAllyDist) / 50) * 0.35;
					target.x += dx * allyWeight;
					target.z += dz * allyWeight;
				}
				bot.patrolTarget = target;
			}
			if (bot.patrolTarget) {
				// Avoid laser ring
				const d = Math.hypot(bot.patrolTarget.x, bot.patrolTarget.z);
				if (d > 23 && d < 31) {
					const pushDir = d < 27 ? 1 : -1;
					const angle = Math.atan2(bot.patrolTarget.z, bot.patrolTarget.x);
					bot.patrolTarget.set(
						Math.cos(angle) * (27 + 5 * pushDir),
						bot.patrolTarget.y,
						Math.sin(angle) * (27 + 5 * pushDir),
					);
				}
				// Slow down when gunfire is heard
				const exploreSpeed = ctx.heardShot ? 1.05 : 1;
				this.steerMove(bot, bot.patrolTarget, bot.physics.speed * exploreSpeed);
			}
		}
	}

	actLoot(bot, ctx, lootManager) {
		const chest = ctx.lootTarget;
		// FIX: If chest is null/open, pick new target immediately
		if (!chest || chest.userData?.isOpen) {
			this.releaseLootReservation(bot);
			bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
			if (bot.patrolTarget)
				this.steerMove(bot, bot.patrolTarget, bot.physics.speed);
			return;
		}
		// FIX: If bot reached chest but can't loot (reserved by another), pick new target
		if (!this.tryReserveLoot(bot, chest, 1)) {
			bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
			if (bot.patrolTarget)
				this.steerMove(bot, bot.patrolTarget, bot.physics.speed * 1.05);
			return;
		}
		lootManager?.claimChest?.(chest, bot.id, 1.2);

		if (
			this.followStructureApproach(
				bot,
				chest.position,
				`loot:${this.getObjectKey(chest)}`,
			)
		)
			return;

		const dist = bot.position.distanceTo(chest.position);
		bot.lookAt(chest.position);
		// FIX: If bot is at chest, loot it immediately and pick new target
		if (dist <= 2.9) {
			const now = performance.now();
			if (now < (BotBrain._nextLootOpenAt || 0)) {
				bot.physics.velocity.x *= 0.6;
				bot.physics.velocity.z *= 0.6;
				return;
			}
			BotBrain._nextLootOpenAt = now + 72;
			const loot = lootManager?.tryOpenChest?.(chest, bot, bot.audioSynthRef);
			if (loot) bot.pickupLoot(loot, chest.position);
			this.releaseLootReservation(bot);
			this.ensureBestWeaponEquipped(bot);
			bot._lootPauseUntil = now + 150 + Math.random() * 250;
			bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
			// FIX: Immediate FSM transition to EXPLORE after loot — don't wait for next context refresh
			bot.state = STATES.EXPLORE;
			this.actExplore(bot, ctx);
			return;
		}
		// Bot is walking to chest
		bot.patrolTarget = chest.position;
		this.steerMove(bot, chest.position, bot.physics.speed * 1.25);
	}

	actHide(bot, ctx) {
		const shelter = ctx.shelterTarget || this.findNearestShelterTarget(bot);
		if (shelter) {
			const enemy = ctx.nearestEnemy;
			const zombie = ctx.nearestZombie;

			// FIX: If at shelter and threat is far, leave immediately
			const distToShelter = bot.position.distanceTo(shelter);
			const distToEnemy = enemy
				? bot.position.distanceTo(enemy.position)
				: Infinity;
			const distToZombie = zombie
				? bot.position.distanceTo(zombie.position)
				: Infinity;
			const minThreatDist = Math.min(distToEnemy, distToZombie);

			if (distToShelter < 3 && minThreatDist > 30) {
				const now = performance.now();
				if (!bot._hideUntil) bot._hideUntil = now + 3000 + (bot.id % 5) * 700;
				if (now < bot._hideUntil) {
					bot.physics.velocity.x *= 0.35;
					bot.physics.velocity.z *= 0.35;
					return;
				}
				bot._hideUntil = 0;
				bot.state = STATES.EXPLORE;
				bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
				if (bot.patrolTarget)
					this.steerMove(bot, bot.patrolTarget, bot.physics.speed * 0.95);
				return;
			}

			// FIX: If no threat within 20 units, leave hiding after reaching shelter
			if (distToShelter < 5 && (minThreatDist > 20 || (!enemy && !zombie))) {
				bot.state = STATES.EXPLORE; // Explicit transition
				bot.patrolTarget = this.pickSpreadTarget(bot, 30, 80);
				if (bot.patrolTarget)
					this.steerMove(bot, bot.patrolTarget, bot.physics.speed * 0.85);
				return;
			}

			let isActuallyHidden = true;
			if (enemy) {
				this._tmpShelterDir.subVectors(shelter, bot.position).normalize();
				this._tmpEnemyDir.subVectors(enemy.position, bot.position).normalize();
				const dot = this._tmpShelterDir.dot(this._tmpEnemyDir);
				if (dot > 0.8) isActuallyHidden = false;
			}

			if (isActuallyHidden && distToShelter >= 3) {
				if (
					distToShelter > 5 &&
					this.followStructureApproach(
						bot,
						shelter,
						`hide:${Math.round(shelter.x)}:${Math.round(shelter.z)}`,
					)
				)
					return;
				// Not at shelter yet — move towards it
				bot.patrolTarget = shelter;
				// При критическом HP боты бегут к укрытию быстрее
				const hideSpeed = ctx.hp < 0.3 ? 1.15 : 0.75;
				this.steerMove(bot, shelter, bot.physics.speed * hideSpeed);
				return;
			}
		}

		bot.physics.velocity.x *= 0.5;
		bot.physics.velocity.z *= 0.5;
		this._tmpRandomDir
			.set(Math.random() - 0.5, 0, Math.random() - 0.5)
			.normalize();
		bot.patrolTarget = (bot.patrolTarget || new THREE.Vector3())
			.copy(bot.position)
			.addScaledVector(this._tmpRandomDir, 10);
	}

	actEngage(bot, ctx, entityManager) {
		const agg = Math.min(
			1,
			Math.max(0.74, bot.personality?.aggression ?? 0.5) + ctx.gear * 0.3,
		);
		const cau = bot.personality?.caution ?? 0.5;

		// Early-game check: retreat if not being actively shot at
		if (ctx.earlyGamePhase) {
			const isBeingShot =
				ctx.heardShot ||
				(bot._retaliationTarget?.isAlive &&
					performance.now() < (bot._retaliateUntil || 0));
			const dist = ctx.nearestEnemy
				? bot.position.distanceTo(ctx.nearestEnemy.position)
				: Infinity;
			// Aggressive bots stay in combat longer; cautious bots retreat easier
			const retreatDist = 10 - agg * 4 + cau * 3;
			if (
				!isBeingShot &&
				!ctx.combatReady &&
				!ctx.nearestZombie &&
				dist > retreatDist
			) {
				bot.state = STATES.EXPLORE;
				this.releaseCombatReservation(bot);
				return;
			}
		}

		// Cautious bots occasionally break to check flanks
		if (
			cau > 0.6 &&
			!bot._lastFlankCheck &&
			performance.now() - (bot._lastFlankCheck || 0) > 5000
		) {
			bot._lastFlankCheck = performance.now();
			const flankDir = this._tmpVec
				.set(
					bot.position.x - (ctx.nearestEnemy?.position.x || 0),
					0,
					bot.position.z - (ctx.nearestEnemy?.position.z || 0),
				)
				.normalize();
			const flankTarget = this._tmpMoveTarget
				.copy(bot.position)
				.addScaledVector(flankDir, 8);
			if (bot.mapRef?.isWalkableAt?.(flankTarget.x, flankTarget.z)) {
				this.steerMove(bot, flankTarget, bot.physics.speed * 0.8);
				return;
			}
		}

		const target = this.pickCombatTarget(bot, ctx, entityManager);
		if (!target) {
			this.releaseCombatReservation(bot);
			bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
			if (bot.patrolTarget)
				this.steerMove(bot, bot.patrolTarget, bot.physics.speed);
			return;
		}
		const nowSec = performance.now() / 1000;
		// Continuous fire: remove engage window gaps — bots shoot when they see target
		if (bot._reloadCoverUntil && nowSec < bot._reloadCoverUntil) {
			// Only enter cover if out of ammo or critically low HP
			const weapon = bot.currentWeapon;
			if (
				(weapon?.type === "shotgun" ||
					weapon?.type === "machinegun" ||
					weapon?.type === "rifle") &&
				weapon.ammo > 0 &&
				ctx.hp > 0.15
			) {
				// Keep shooting — don't reload during active combat unless critical
			} else if (ctx.hp < 0.15 || !weapon?.ammo || weapon.ammo <= 1) {
				bot.state = STATES.RELOAD_COVER;
				this.actReloadCover(bot, ctx);
				return;
			} else {
				// Short reload only during early game or very low ammo
				if (ctx.earlyGamePhase && (!weapon?.ammo || weapon.ammo <= 0)) {
					bot.state = STATES.RELOAD_COVER;
					this.actReloadCover(bot, ctx);
					return;
				}
			}
		}
		bot._reloadCoverUntil =
			nowSec + (ctx.earlyGamePhase ? 8 : 15) + Math.random() * 5;
		if (
			!this.tryReserveCombat(
				bot,
				target,
				target.constructor?.name === "Zombie" ? 4 : 5,
			)
		) {
			this.releaseCombatReservation(bot);
			bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
			if (bot.patrolTarget)
				this.steerMove(bot, bot.patrolTarget, bot.physics.speed * 1.02);
			return;
		}
		bot.target = target;
		const dist = bot.position.distanceTo(target.position);
		let weapon = bot.currentWeapon || bot.fists;
		const range = Math.max(
			2.7,
			(weapon.range || 3) * (weapon.type === "shotgun" ? 0.88 : 0.95),
		);

		if (
			dist > 5 &&
			!this.hasLoS(bot, target, entityManager) &&
			this.followStructureApproach(
				bot,
				target.position,
				`combat:${this.getObjectKey(target)}`,
			)
		) {
			return;
		}

		// Don't waste ammo on close-range targets when melee is available
		if (
			dist < 3 &&
			weapon.type !== "fists" &&
			weapon.type !== "knife" &&
                        bot._cachedItems?.length
                ) {
                        const items = bot._cachedItems;
                        this._meleeItems.length = 0;
                        for (const w of items) {
                                if (w && (w.type === "knife" || w.type === "fists")) this._meleeItems.push(w);
                        }
                        const meleeItems = this._meleeItems;
                        if (meleeItems.length && (weapon.ammo === null || weapon.ammo <= 3)) {
				const meleeSlot = bot._cachedItems.indexOf(meleeItems[0]);
				if (meleeSlot >= 0 && bot.inventory.selectedSlot !== meleeSlot) {
					bot.selectSlot(meleeSlot);
					bot._weaponSwitchCooldown = performance.now() + 800;
				}
				weapon = bot.currentWeapon || bot.fists;
			}
		}

		// Retreat when HP drops below threshold — smarter timing
		const hpThreshold = ctx.earlyGamePhase
			? 0.4 - agg * 0.08 + cau * 0.1
			: 0.25 - agg * 0.06 + cau * 0.1;
		if (ctx.hp < hpThreshold) {
			bot.state = STATES.RETREAT;
			this.actRetreat(bot, ctx);
			return;
		}

		bot.lookAt(target.position);
		if (dist <= range) {
			const targetKey =
				this.getObjectKey(target) ||
				`${Math.round(target.position.x)}:${Math.round(target.position.z)}`;
			if (bot._reactionTargetKey !== targetKey) {
				bot._reactionTargetKey = targetKey;
				const reactionRange = this.reactionMax - this.reactionMin;
				const reactionDelay =
					(this.reactionMin + Math.random() * reactionRange) *
					(0.6 + cau * 0.4);
				bot._reactionReadyAt = nowSec + reactionDelay;
			}
			// Improved strafe: larger circles, less frequent changes, smarter movement
			if (!bot._strafeUntil || nowSec >= bot._strafeUntil) {
				bot._strafeDir = bot._strafeDir ? -bot._strafeDir : (bot.id % 3) - 1;
				// Ensure strafe direction is never 0 — always move
				if (bot._strafeDir === 0) bot._strafeDir = bot.id % 2 === 0 ? 1 : -1;
				bot._strafeUntil = nowSec + (agg > 0.6 ? 2 : 3.5) + (bot.id % 4) * 0.25;
			}
			const strafeDir = bot._strafeDir || 1;
			const to = this._tmpVec
				.subVectors(target.position, bot.position)
				.normalize();
			const strafeRadius = agg > 0.6 ? 6 + (bot.id % 4) * 0.6 : 3 + (bot.id % 4) * 0.3;
			this._tmpSide
				.set(-to.z, 0, to.x)
				.multiplyScalar(strafeDir * strafeRadius);
			// Coordinated flanking: if allies attack the same target, spread to different sides
			if (ctx.nearestAlly && ctx.nearestAllyDist < 30) {
				const allySide = ctx.nearestAlly.position.x - target.position.x > 0 ? -1 : 1;
				this._tmpSide.multiplyScalar(allySide * 0.6 + 0.4);
			}
			this._tmpSideTarget.set(
				bot.position.x + this._tmpSide.x,
				0,
				bot.position.z + this._tmpSide.z,
			);
			if (
				bot.mapRef?.isWalkableAt?.(this._tmpSideTarget.x, this._tmpSideTarget.z)
			) {
				this.steerMove(bot, this._tmpSideTarget, bot.physics.speed * 0.88);
			}
			bot.lookAt(target.position);
			// Burst fire with ammo conservation
			if (this.attackCooldown <= 0) {
				if (bot._reactionReadyAt && nowSec < bot._reactionReadyAt) return;
				const wType = weapon.type;
				const ammo = weapon.ammo;
				// Ammo conservation: switch to melee when critically low
				if (ammo !== null && ammo > 0) {
					const meleeThreshold = wType === "shotgun" ? 1 : wType === "pistol" ? 2 : 3;
                        if (ammo <= meleeThreshold && dist > 4) {
                                const items2 = bot._cachedItems;
                                this._meleeItems.length = 0;
                                for (const w of items2) {
                                        if (w && (w.type === "knife" || w.type === "fists")) this._meleeItems.push(w);
                                }
                               if (this._meleeItems.length) {
							const meleeSlot = bot._cachedItems.indexOf(this._meleeItems[0]);
							if (meleeSlot >= 0 && bot.inventory.selectedSlot !== meleeSlot) {
								bot.selectSlot(meleeSlot);
								bot._weaponSwitchCooldown = performance.now() + 800;
								weapon = bot.currentWeapon || bot.fists;
							}
						}
					}
					// Hold fire if low ammo and target is far
					if (ammo <= 5 && dist > (weapon.range || 40) * 0.5) {
						bot._burstPauseEnd = nowSec + 1.5;
						return;
					}
				}
				// Burst state tracking
				const burstSize = wType === "pistol" ? 3 : wType === "rifle" ? 4 : wType === "machinegun" ? 6 : 1;
				const burstPause = wType === "pistol" ? 0.4 : wType === "rifle" ? 0.5 : wType === "machinegun" ? 0.6 : 0;
				if (burstSize > 1) {
					if (nowSec >= (bot._burstPauseEnd || 0)) {
						bot._burstCount = 0;
					}
					if ((bot._burstCount || 0) >= burstSize && burstPause > 0) {
						bot._burstPauseEnd = nowSec + burstPause + Math.random() * 0.2;
						return;
					}
				}
				const tv = target.physics?.velocity;
				const targetSpeed = tv ? Math.hypot(tv.x || 0, tv.z || 0) : 0;
				const distNorm = Math.max(0, Math.min(1, dist / Math.max(8, weapon.range || 40)));
				const moveNorm = Math.max(0, Math.min(1, targetSpeed / 9));
				bot._dynamicAimError = (0.008 + distNorm * 0.025 + moveNorm * 0.03) * (1.0 - agg * 0.1);
				bot.attack(target, entityManager);
				bot.applyWeaponRecoil();
				if (burstSize > 1) bot._burstCount = (bot._burstCount || 0) + 1;
				this.attackCooldown = Math.max(0.04, (weapon.cooldown || 0.2) * 0.55);
			}
			return;
		}
		bot._reactionTargetKey = null;
		bot._reactionReadyAt = 0;
		if (ctx.targetFloorDiff > 2.5 && dist > range) {
			if (this.followElevatedRoute(bot, ctx, nowSec)) {
				return;
			}
			if (this.followStructureApproach(bot, target.position, `elevated:${this.getObjectKey(target)}`)) {
				return;
			}
		}
		bot.patrolTarget = target.position;

		const flankRadius = agg > 0.6 ? 6 + (bot.id % 4) * 0.6 : 3 + (bot.id % 4) * 0.3;
		const approachMult = dist > 30 ? 1.35 : dist > 15 ? 1.5 : 1.65;
		const cauMod = cau > 0.6 ? 0.85 : 1 - (cau - 0.5) * 0.2;
		if (cau > 0.65 && dist < 14) {
			const cover = this.findNearestCover(bot, target.position);
			if (cover && bot.position.distanceTo(cover) < 20) {
				this.steerMove(bot, cover, bot.physics.speed * 0.9);
				return;
			}
		}
		this.steerMove(
			bot,
			target.position,
			bot.physics.speed * approachMult * cauMod,
		);
		// If bot is stuck, clear velocity and pick escape target
		if (bot.isStuck) {
			bot.physics.velocity.x = 0;
			bot.physics.velocity.z = 0;
                const escape = this.pickSpreadTarget(bot, 20, 50);
                if (escape) {
                        if (bot.patrolTarget) bot.patrolTarget.copy(escape);
                        if (bot._navWaypoint) bot._navWaypoint.copy(escape);
                }
		}
	}

	actRetreat(bot, ctx) {
		const target =
			this.findNearestCover(bot, ctx.nearestEnemy?.position || null) ||
			ctx.shelterTarget ||
			this.pickSpreadTarget(bot, 40, 120);
		if (!target) return;
		bot.patrolTarget = target;
		bot.target = null;
		this.releaseCombatReservation(bot);
		// Faster flee when HP is critical
		const fleeSpeed = ctx.hp < 0.2 ? 1.65 : ctx.hp < 0.35 ? 1.5 : 1.35;
		this.steerMove(bot, target, bot.physics.speed * fleeSpeed);
		// Stop fighting and fully disengage
		if (bot._reactionTargetKey) bot._reactionTargetKey = null;
		if (bot._reactionReadyAt) bot._reactionReadyAt = 0;
	}

	actReloadCover(bot, ctx) {
		const nowSec = performance.now() / 1000;
		if (bot._reloadCoverUntil && nowSec >= bot._reloadCoverUntil) {
			bot.state = STATES.ENGAGE;
			return;
		}
		const cover =
			this.findNearestCover(bot, ctx.nearestEnemy?.position || null) ||
			this.pickSpreadTarget(bot, 40, 120);
		if (!cover) return;
		bot.patrolTarget = cover;
		this.steerMove(bot, cover, bot.physics.speed * 1.12);
	}

	actZoneRetreat(bot, ctx) {
		let target = null;
		if (bot.forceShelterActive && ctx.shelterTarget) {
			target = ctx.shelterTarget;
		} else if (ctx.zone && !ctx.zone.isInsideZone(bot.position)) {
			const len = Math.hypot(bot.position.x, bot.position.z) || 1;
			const safeRadius = Math.max(4, (ctx.zone.getCurrentRadius?.() || 40) - 8);
			target = this._tmpVec.set(
				(bot.position.x / len) * safeRadius,
				bot.position.y,
				(bot.position.z / len) * safeRadius,
			);
		} else if (ctx.shelterTarget && ctx.hp < 0.4) {
			target = ctx.shelterTarget;
		} else {
			target = this.pickSpreadTarget(bot, 40, 120);
		}
		if (!target) return;
		bot.patrolTarget = target;
		bot.moveTowards(target, bot.physics.speed * 1.25);
	}

	actShelter(bot, ctx, lootManager) {
		const localChest = lootManager?.getNearbyChests?.(
			bot.position,
			8,
			true,
		)?.[0];
		if (localChest) {
			const dist = bot.position.distanceTo(localChest.position);
			if (dist <= 3.2) {
				const loot = lootManager.tryOpenChest(
					localChest,
					bot,
					bot.audioSynthRef,
				);
				if (loot) bot.pickupLoot(loot);
				return;
			}
			this.steerMove(bot, localChest.position, bot.physics.speed * 0.9);
			return;
		}
		if (ctx.shelterTarget) {
			this.steerMove(bot, ctx.shelterTarget, bot.physics.speed * 0.82);
		} else {
			bot.physics.velocity.x *= 0.7;
			bot.physics.velocity.z *= 0.7;
		}
	}

	actSurvival(bot, ctx) {
		if (bot.health / Math.max(1, bot.maxHealth || 100) < 0.55) {
			bot.useMedkit?.();
		}
		const shelter = ctx.shelterTarget || this.findNearestShelterTarget(bot);
		if (shelter) {
			bot.patrolTarget = shelter;
			this.steerMove(bot, shelter, bot.physics.speed * 1.18);
			return;
		}
		this.actZoneRetreat(bot, ctx);
	}

	followElevatedRoute(bot, ctx, now) {
		if (
			ctx.outsideZone ||
			bot.forceShelterActive ||
			ctx.lootTarget ||
			ctx.nearestEnemyDist < 26 ||
			ctx.nearestZombieDist < 18
		) {
			bot._elevatedRoute = null;
			return false;
		}
		let routeState = bot._elevatedRoute;
		if (!routeState) {
			if ((Number(bot.id) || 0) % 5 !== 0 || now < this._nextElevatedRouteAt)
				return false;
			const routes = bot.mapRef?.getElevatedRoutes?.() || [];
			if (!routes.length) return false;
			let route = null;
			let bestDistance = 110;
			for (const candidate of routes) {
				const start = candidate?.[0];
				if (!start) continue;
				const distance = Math.hypot(
					start.x - bot.position.x,
					start.z - bot.position.z,
				);
				if (distance >= bestDistance) continue;
				bestDistance = distance;
				route = candidate;
			}
			this._nextElevatedRouteAt =
				now + 5500 + ((Number(bot.id) || 0) % 7) * 420;
			if (!route) return false;
			routeState = bot._elevatedRoute = {
				points: route,
				index: 0,
				startedAt: now,
			};
		}
		if (now - routeState.startedAt > 24000) {
			bot._elevatedRoute = null;
			return false;
		}
		const target = routeState.points[routeState.index];
		if (!target) {
			bot._elevatedRoute = null;
			return false;
		}
		const horizontalDistance = Math.hypot(
			target.x - bot.position.x,
			target.z - bot.position.z,
		);
		if (horizontalDistance < 1.8 && Math.abs(target.y - bot.position.y) < 3.2) {
			routeState.index++;
			if (routeState.index >= routeState.points.length) {
				bot._elevatedRoute = null;
				bot._lootPauseUntil = now + 1800 + ((Number(bot.id) || 0) % 5) * 300;
				return true;
			}
		}
		const nextTarget = routeState.points[routeState.index];
		bot.patrolTarget = nextTarget;
		this.steerMove(bot, nextTarget, bot.physics.speed * 1.02);
		return true;
	}

	followStructureApproach(bot, target, key) {
		const map = bot.mapRef;
		const route = map?.getStructureApproachRoute?.(
			target.x,
			target.z,
			bot.position,
		);
		if (!route?.length) {
			bot._structureRoute = null;
			return false;
		}
		const now = performance.now();
		let state = bot._structureRoute;
		if (!state || state.key !== key || now - state.startedAt > 16000) {
			state = bot._structureRoute = {
				key,
				points: route,
				index: 0,
				startedAt: now,
			};
		}
		while (state.index < state.points.length) {
			const point = state.points[state.index];
			const distance = Math.hypot(
				point.x - bot.position.x,
				point.z - bot.position.z,
			);
			if (distance > (state.index === state.points.length - 1 ? 2.7 : 1.9))
				break;
			state.index++;
		}
		if (state.index >= state.points.length) {
			bot._structureRoute = null;
			return false;
		}
		const point = state.points[state.index];
		bot.patrolTarget = point;
		this.steerMove(bot, point, bot.physics.speed * 1.22);
		return true;
	}

	steerMove(bot, target, speed) {
		if (!bot?.position || !target) return;
		const effectiveSpeed = speed;
		const dir = this._tmpMoveDir.set(
			target.x - bot.position.x,
			0,
			target.z - bot.position.z,
		);
		const len = Math.hypot(dir.x, dir.z);
		if (!Number.isFinite(len) || len < 0.001) return;
		dir.multiplyScalar(1 / len);

		// Apply avoidance force — steer away from nearby players/bots
		const avoidX = bot._avoidX || 0;
		const avoidZ = bot._avoidZ || 0;
		if (avoidX !== 0 || avoidZ !== 0) {
			const avoidanceWeight = bot._structureRoute
				? 0.08
				: bot.state === STATES.ENGAGE
					? 0.2
					: bot.state === STATES.LOOT
						? 0.16
						: 0.34;
			dir.x += avoidX * avoidanceWeight;
			dir.z += avoidZ * avoidanceWeight;
			const newLen = Math.hypot(dir.x, dir.z);
			if (newLen > 0.001) dir.multiplyScalar(1 / newLen);
		}

		const move = dir;
		if (bot.isStuck) {
			const waypoint = this.pickLocalNavigationStep(bot, target);
			if (waypoint) {
				bot.isStuck = false;
				bot.moveTowards(waypoint, effectiveSpeed);
				return;
			}
		}

		// Cautious movement: if in HIDE or low gear, move slower and more carefully
		const cau = bot.personality?.caution ?? 0.5;
		const isCautious =
			bot.state === STATES.HIDE ||
			(bot.state === STATES.EXPLORE &&
				bot._cachedItems?.length < 2) ||
			cau > 0.7;
		const finalSpeed = isCautious
			? effectiveSpeed * (0.96 + (1 - cau) * 0.04)
			: effectiveSpeed;

		const step = Math.max(4.5, finalSpeed * 0.9);
		const tx = bot.position.x + move.x * step;
		const tz = bot.position.z + move.z * step;
		this._tmpMoveTarget.set(tx, bot.position.y, tz);
		if (bot.mapRef?.isWalkableAt?.(tx, tz)) {
			bot._navWaypoint = null;
			bot._navWaypointUntil = 0;
			bot.moveTowards(this._tmpMoveTarget, finalSpeed);
		} else {
			const now = performance.now();
			const targetKey = `${Math.round(target.x / 4)}:${Math.round(target.z / 4)}`;
			let waypoint = bot._navWaypoint;
			if (
				!waypoint ||
				now >= (bot._navWaypointUntil || 0) ||
				bot._navWaypointTargetKey !== targetKey ||
				bot.position.distanceToSquared(waypoint) < 4
			) {
				const next = this.pickLocalNavigationStep(bot, target);
				waypoint = next
					? (bot._navWaypoint || new THREE.Vector3()).copy(next)
					: null;
				bot._navWaypoint = waypoint;
				bot._navWaypointUntil = waypoint ? now + 2400 : 0;
				bot._navWaypointTargetKey = targetKey;
			}
			if (waypoint) bot.moveTowards(waypoint, finalSpeed * 0.92);
			else {
				const turn = ((bot.id + (bot._stuckRecoveries || 0)) & 1) ? 1 : -1;
				const sideX = -move.z * turn;
				const sideZ = move.x * turn;
				const sideTarget = this._tmpMoveTarget.set(
					bot.position.x + sideX * 5,
					bot.position.y,
					bot.position.z + sideZ * 5,
				);
				if (bot.mapRef?.isWalkableAt?.(sideTarget.x, sideTarget.z))
					bot.moveTowards(sideTarget, finalSpeed * 0.82);
				else {
					bot.physics.velocity.x = 0;
					bot.physics.velocity.z = 0;
					bot.isStuck = true;
				}
			}
		}
	}

	pickLocalNavigationStep(bot, target) {
		if (!target) return null;
		const tiles = bot.mapRef?.getNavigationTiles?.();
		if (!tiles?.length) return null;
		const start =
			((Number(bot.id) || 0) * 37 +
				Math.floor(performance.now() * 0.001) * 13) %
			tiles.length;
		const currentDist = Math.hypot(
			target.x - bot.position.x,
			target.z - bot.position.z,
		);
		let best = null;
		let bestScore = currentDist + 8;
		for (let i = 0; i < Math.min(48, tiles.length); i++) {
			const tile = tiles[(start + i * 29) % tiles.length];
			if (!this.isInAssignedBiome(bot, tile)) continue;
			const localDist = Math.hypot(
				tile.x - bot.position.x,
				tile.z - bot.position.z,
			);
			if (localDist < 3 || localDist > 28) continue;
			this._tmpRandomDir
				.set(tile.x - bot.position.x, 0, tile.z - bot.position.z)
				.normalize();
			if (bot.isDirectionBlocked?.(this._tmpRandomDir)) continue;
			const targetDist = Math.hypot(target.x - tile.x, target.z - tile.z);
			const crowd = this.countBotsNearPointForSpread(bot, tile.x, tile.z, 4);
			const score = targetDist + localDist * 0.18 + crowd * 5;
			if (score >= bestScore) continue;
			bestScore = score;
			best = tile;
		}
		return best ? this._tmpCoverVec.set(best.x, best.y ?? bot.position.y, best.z) : null;
	}

	scoreTarget(target, dist, bot, ctx, entityManager) {
		if (!target?.isAlive) return -Infinity;
		const tw = target.currentWeapon;
		const wp = WEAPON_PRIORITY[tw?.type] ?? 1;
		const hp = target.physics?.health ?? 1;
		const threat = (wp * 20 + hp * 10) / (dist + 5);
		let score = threat;
		if (ctx.nearestAlly && ctx.nearestAllyDist < 30) {
			const allyTarget = ctx.nearestAlly.target;
			if (allyTarget && allyTarget === target) {
				score *= 0.7;
			}
		}
		const attackers = this.countAttackers(entityManager, target, bot);
		if (attackers > 2) score *= 0.8;
		if (attackers > 4) score *= 0.6;
		const type = target.constructor?.name;
		if (type === "Zombie") score *= 0.6;
		if (type === "Player") score *= 1.3;
		return score;
	}

	pickCombatTarget(bot, ctx, entityManager) {
		const agg = Math.max(0.55, bot.personality?.aggression ?? 0.5);
		// FIX: Don't retaliate against survivors during early game — only zombies are enemies
		const retaliationTarget = bot._retaliationTarget;
		const isRetaliationTargetEnemy =
			retaliationTarget?.isAlive &&
			performance.now() < (bot._retaliateUntil || 0) &&
			(retaliationTarget.constructor?.name === "Zombie" || !ctx.earlyGamePhase);
		if (isRetaliationTargetEnemy) {
			return retaliationTarget;
		}
		const cands = this._candidates;
		cands.length = 0;
		let hasZombie = false, hasEnemy = false;
		if (ctx.nearestZombie?.isAlive) {
			this._cand1.target = ctx.nearestZombie;
			this._cand1.dist = ctx.nearestZombieDist;
			cands.push(this._cand1);
			hasZombie = true;
		}
		if (ctx.nearestEnemy?.isAlive) {
			this._cand2.target = ctx.nearestEnemy;
			this._cand2.dist = ctx.nearestEnemyDist;
			cands.push(this._cand2);
			hasEnemy = true;
		}
		if (ctx.huntTarget?.isAlive && ctx.huntTarget !== ctx.nearestZombie && ctx.huntTarget !== ctx.nearestEnemy) {
			this._cand3.target = ctx.huntTarget;
			this._cand3.dist = bot.position.distanceTo(ctx.huntTarget.position);
			cands.push(this._cand3);
		}
		if (cands.length === 0) return null;
		let best = null;
		let bestScore = -Infinity;
		for (let i = 0; i < cands.length; i++) {
			const c = cands[i];
			const s = this.scoreTarget(c.target, c.dist, bot, ctx, entityManager);
			if (s > bestScore) {
				bestScore = s;
				best = c.target;
			}
		}
		const t = best;
		if (!t?.isAlive) return null;
		const retaliating =
			bot._retaliationTarget === t &&
			performance.now() < (bot._retaliateUntil || 0);

		// Max attackers per target: aggressive bots tolerate more attackers
		const attackers = this.countAttackers(entityManager, t, bot);
		const maxAttackers = ctx.earlyGamePhase
			? Math.max(2, Math.round(2 + agg * 2))
			: Math.min(4, Math.max(3, Math.round(3 + agg)));
		if (!retaliating && attackers >= maxAttackers) return null;

		// Don't engage if surrounded (aggressive bots tolerate more)
		const maxCrowd = ctx.earlyGamePhase
			? Math.min(5, Math.max(3, Math.round(3 + agg * 2)))
			: 7;
		if (!retaliating && ctx.crowdNear >= maxCrowd) return null;

		// During early game, only fight if well-armed (aggressive bots less strict)
		if (ctx.earlyGamePhase && !retaliating) {
			const wellArmed =
				!!bot.currentWeapon && WEAPON_PRIORITY[bot.currentWeapon?.type] >= 4;
			if (!wellArmed) return null;
		}

		return t;
	}

	pickBestChest(bot, chests, entityManager) {
		if (!chests?.length) return null;
		let best = null;
		let bestScore = -Infinity;
		const stride = Math.max(1, Math.floor(chests.length / 28));
		const offset = (Number(bot.id) || 0) % stride;
		for (
			let i = offset, checked = 0;
			i < chests.length && checked < 28;
			i += stride, checked++
		) {
			const chest = chests[i];
			if (!chest || chest.userData?.isOpen) continue;
			if (!this.isInAssignedBiome(bot, chest.position)) continue;
			if (bot.lootManagerRef?.isChestClaimedByOther?.(chest, bot.id)) continue;

			// Penalize chests bot already looted
			let lootedPenalty = 0;
			for (const area of bot.lootedAreas) {
				const d = chest.position.distanceTo(area.pos);
				if (d < 5) {
					// Same chest or very nearby
					lootedPenalty += 3.0 / (d + 0.5);
				}
			}

			const d = bot.position.distanceTo(chest.position);
			const reserved = this.getLootReservationCount(chest, bot);
			const claimPenalty =
				chest.userData?.claimedBy && chest.userData.claimedBy !== bot.id
					? 0.8
					: 0;
			const lootFocusBonus = (bot.personality?.lootFocus ?? 0.5) * 0.3;
			const structure = bot.mapRef?.getStructureAtPoint?.(
				chest.position.x,
				chest.position.z,
				0.2,
			);
			const structureBonus =
				structure?.template?.type === "maze_tower"
					? 0.72
					: structure
						? 0.38
						: 0;
			const score =
				1 / Math.max(2, d) -
				reserved * 0.75 -
				claimPenalty -
				lootedPenalty +
				structureBonus +
				(chest.userData?.isSupplyDrop ? 0.8 : 0) +
				lootFocusBonus;
			if (score > bestScore) {
				bestScore = score;
				best = chest;
			}
		}
		return best;
	}

	pickSpreadTarget(bot, minDist = 40, maxDist = 120) {
		const map = bot.mapRef;
		const floors = map?.getNavigationTiles?.() || map?.getFloorTiles?.();
		if (!floors?.length) return null;
		let best = null;
		let bestScore = -Infinity;
		for (let i = 0; i < 20; i++) {
			const tile =
				floors[
					(Math.floor((Math.random() + this._rngShift) * floors.length) +
						i * 23) %
						floors.length
				];
			if (!this.isInAssignedBiome(bot, tile)) continue;
			const distFromCenter = Math.hypot(tile.x, tile.z);
			// Avoid laser ring at radius 27
			if (distFromCenter > 23 && distFromCenter < 31) continue;
			const dist = Math.hypot(tile.x - bot.position.x, tile.z - bot.position.z);
			if (dist < minDist || dist > maxDist) continue;
			if (!map.isWalkableAt?.(tile.x, tile.z)) continue;

			// Penalize targets near looted areas and enemy encounters
			let memoryPenalty = 0;
			for (const area of bot.lootedAreas) {
				const d = Math.hypot(tile.x - area.pos.x, tile.z - area.pos.z);
				if (d < 15) memoryPenalty += 8 / (d + 1);
			}
			for (const enc of bot.enemyEncounters) {
				const d = Math.hypot(tile.x - enc.pos.x, tile.z - enc.pos.z);
				if (d < 20) memoryPenalty += (12 / (d + 1)) * (enc.damage / 50);
			}

			// Score: prefer distant, isolated targets (far from other bots)
			const angle = Math.atan2(
				tile.z - bot.position.z,
				tile.x - bot.position.x,
			);
			const preferred = bot.id * 2.399963229728653;
			const angularSpread = Math.cos(angle - preferred) * 8;
			const score = dist + angularSpread + Math.random() * 5 - memoryPenalty;
			if (score > bestScore) {
				bestScore = score;
				best = this._tmpSpreadVec.set(tile.x, 0, tile.z);
			}
		}
		// FIX: If no tile found in 20 attempts, try a broader range or fallback
		if (!best) {
			// Try with smaller distance range
			for (let i = 0; i < 100; i++) {
				const tile =
					floors[
						(Math.floor((Math.random() + this._rngShift) * floors.length) +
							i * 23) %
							floors.length
					];
				if (!tile) continue;
				const dist = Math.hypot(
					tile.x - bot.position.x,
					tile.z - bot.position.z,
				);
				if (dist < 15 || dist > 180) continue; // Wider range
				if (!map.isWalkableAt?.(tile.x, tile.z)) continue;
                        if (Math.abs(tile.x) > 150 || Math.abs(tile.z) > 150) continue;
                        this._spreadResult.copy(this._tmpSpreadVec.set(tile.x, 0, tile.z));
                        return this._spreadResult;
                }
                // Absolute fallback: random direction
                const angle = Math.random() * Math.PI * 2;
                const radius = 20 + Math.random() * 30;
                this._spreadResult.set(
                        bot.position.x + Math.cos(angle) * radius,
                        0,
                        bot.position.z + Math.sin(angle) * radius,
                );
                return this._spreadResult;
        }
        this._spreadResult.copy(best);
        return this._spreadResult;
	}

	isInAssignedBiome(bot, point) {
		if (
			!bot.assignedBiome ||
			performance.now() >= (bot.assignedBiomeUntil || 0)
		)
			return true;
		if (Math.hypot(point.x, point.z) < 75) return false;
		// Allow bots to explore the full map outside biome zones
		const halfMap = 120;
		return Math.abs(point.x) <= halfMap && Math.abs(point.z) <= halfMap;
	}

	countBotsNearPointForSpread(bot, px, pz, radius) {
		const entityManager = bot.entityManagerRef;
		if (!entityManager) return 0;
		const nearby = entityManager.getNearbyEntities?.(
			this._tmpVec.set(px, 0, pz),
			radius,
		);
		if (!nearby) return 0;
		let count = 0;
		for (const ent of nearby) {
			if (ent === bot) continue;
			const type = ent.constructor?.name;
			if (type === "Bot" || type === "Player") count++;
		}
		return count;
	}

	ensureBestWeaponEquipped(bot) {
		// Don't switch weapons too frequently — only throttle when cooldown is set
		if (
			bot._weaponSwitchCooldown &&
			performance.now() < bot._weaponSwitchCooldown
		)
			return;

		const items = bot._cachedItems || [];
		let bestSlot = -1;
		let bestScore = 0;
		for (let i = 0; i < items.length; i++) {
			const w = items[i];
			if (!w) continue;
			const ammoRatio = w.maxAmmo > 0 ? (w.ammo || 0) / w.maxAmmo : 0;
			const score =
				(WEAPON_PRIORITY[w.type] || 0) +
				(ammoRatio > 0 ? 0.7 * Math.min(1, ammoRatio * 2) : 0) +
				((w.durability || 0) > 0 ? 0.4 : 0);
			if (score > bestScore) {
				bestScore = score;
				bestSlot = i;
			}
		}
		if (bestSlot >= 0) {
			const needsSwitch =
				bot.inventory.selectedSlot !== bestSlot || !bot.currentWeapon;
			if (needsSwitch) {
				bot.selectSlot(bestSlot);
				bot._weaponSwitchCooldown = performance.now() + 800;
			}
		}
	}

	getGearScore(bot) {
		const items = bot._cachedItems || [];
		let score = 0;
		for (const w of items) {
			if (!w) continue;
			score += (WEAPON_PRIORITY[w.type] || 0) * 0.08;
			if (w.ammo !== null && w.maxAmmo)
				score += Math.min(0.28, (w.ammo / w.maxAmmo) * 0.28);
			if (w.durability !== null && w.maxDurability)
				score += Math.min(0.18, (w.durability / w.maxDurability) * 0.18);
		}
		score += Math.min(0.25, ((bot.armor || 0) / 100) * 0.25);
		return Math.max(0, Math.min(1, score));
	}

	isCombatReady(bot) {
		const items = bot._cachedItems || [];
		let ranged = false;
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item && (WEAPON_PRIORITY[item.type] || 0) >= 4 && (item.ammo === null || item.ammo > 0)) {
				ranged = true;
				break;
			}
		}
		return ranged && this.getGearScore(bot) >= 0.22;
	}

	findNearestShelterTarget(bot) {
		const map = bot.mapRef;
		if (!map) return null;
		const now = performance.now();
		if (bot._shelterTargetCache && now < (bot._shelterTargetCacheUntil || 0))
			return bot._shelterTargetCache;
		const houses = map.getHouseSpots?.() || [];
		const hangars = map.getHangarSpots?.() || [];
		let best = null;
		let bestD = Infinity;
		for (const list of [houses, hangars]) {
			for (const s of list) {
				if (!s) continue;
				const d = Math.hypot(bot.position.x - s.x, bot.position.z - s.z);
				if (d < bestD) {
					bestD = d;
					best = s;
				}
			}
		}
		if (!best) return null;
		bot._shelterTargetCache = (bot._shelterTargetCache || new THREE.Vector3()).set(
			best.x,
			bot.position.y,
			best.z,
		);
		bot._shelterTargetCacheUntil = now + 1800 + (bot.id % 5) * 120;
		return bot._shelterTargetCache;
	}

	findNearestCover(bot, threatPos = null) {
		const map = bot.mapRef;
		const now = performance.now();
		if (bot._coverTargetCache && now < (bot._coverTargetCacheUntil || 0))
			return bot._coverTargetCache;
		const colliders =
			map?.getNearbyCollidersForSpawn?.(bot.position, 48) ||
			map?.getColliders?.() ||
			[];
		let best = null;
		let bestScore = Infinity;
		for (const c of colliders) {
			if (!c || c.enabled === false || c.walkable) continue;
			// Skip colliders whose source mesh was removed from scene
			if (c.source && (!c.source.parent || c.source.userData?._instancedRemoved)) continue;
			const cx = (c.min.x + c.max.x) * 0.5;
			const cz = (c.min.z + c.max.z) * 0.5;
			if (!map?.isWalkableAt?.(cx, cz)) continue;
			const dBot = Math.hypot(bot.position.x - cx, bot.position.z - cz);
			if (dBot < 3 || dBot > 46) continue;
			let score = dBot;
			if (threatPos) {
				const dThreat = Math.hypot(threatPos.x - cx, threatPos.z - cz);
				score -= Math.min(20, dThreat * 0.35);
			}
			if (score < bestScore) {
				bestScore = score;
				best = { x: cx, z: cz };
			}
		}
		if (!best) return null;
		bot._coverTargetCache = (bot._coverTargetCache || new THREE.Vector3()).set(
			best.x,
			bot.position.y,
			best.z,
		);
		bot._coverTargetCacheUntil = now + 850 + (bot.id % 4) * 90;
		return bot._coverTargetCache;
	}

	countNearbyCombatants(bot, entityManager, radius) {
		const near = entityManager?.getNearbyEntities
			? entityManager.getNearbyEntities(bot.position, radius)
			: [];
		let count = 0;
		for (const e of near) {
			if (!e?.isAlive || e === bot) continue;
			const type = e.constructor?.name;
			if (type === "Player" || type === "Bot" || type === "Zombie") {
				count++;
			}
		}
		return count;
	}

	countNearbyBots(bot, entityManager, radius) {
		return this.countBotsNearPoint(entityManager, bot.position, radius, bot);
	}

	countBotsNearPoint(entityManager, point, radius, exclude = null) {
		const near = entityManager?.getNearbyEntities
			? entityManager.getNearbyEntities(point, radius, "Bot")
			: [];
		let count = 0;
		for (const e of near) {
			if (!e?.isAlive || e === exclude) continue;
			count++;
		}
		return count;
	}

	countAttackers(entityManager, target, exceptBot) {
		if (!entityManager?.getNearbyEntities || !target?.position) return 0;
		const near = entityManager.getNearbyEntities(target.position, 16, "Bot");
		let count = 0;
		for (const bot of near) {
			if (!bot?.isAlive || bot === exceptBot) continue;
			if (bot.target === target) count++;
		}
		return count;
	}

	handleStuck(bot) {
		if (!bot.isStuck) return;
		const combatTarget =
			bot.state === STATES.ENGAGE && bot.target?.isAlive ? bot.target : null;
		const now = performance.now();
		if (now - (bot._lastStuckRecoveryAt || 0) > 4500) bot._stuckRecoveries = 0;
		bot._lastStuckRecoveryAt = now;
		bot._stuckRecoveries = (bot._stuckRecoveries || 0) + 1;
		if (bot._stuckRecoveries >= 2) {
			bot.assignedBiomeEntry = null;
			bot.assignedBiomeTarget = null;
			bot.assignedBiomeGate = null;
			bot._huntTarget = null;
			bot._huntUntil = 0;
			bot.patrolTarget = null;
		}
		let escape =
			this.pickLocalNavigationStep(
				bot,
				combatTarget?.position || bot.patrolTarget || bot.target?.position,
			) || this.pickSpreadTarget(bot, bot._stuckRecoveries >= 2 ? 55 : 30, 90);
		if (
			!escape ||
			bot.position.distanceToSquared(escape) < 16 ||
			bot.mapRef?.isWalkableAt?.(escape.x, escape.z) === false
		) {
			let best = null;
			let bestScore = -Infinity;
			const radius = 8 + Math.min(12, bot._stuckRecoveries * 3);
			for (let i = 0; i < 16; i++) {
				const angle = ((i + bot.id * 5) % 16) * (Math.PI / 8);
				const x = bot.position.x + Math.cos(angle) * radius;
				const z = bot.position.z + Math.sin(angle) * radius;
				if (bot.mapRef?.isWalkableAt?.(x, z) === false) continue;
				this._tmpRandomDir.set(x - bot.position.x, 0, z - bot.position.z).normalize();
				if (bot.isDirectionBlocked?.(this._tmpRandomDir, 4.5)) continue;
				const crowd = this.countBotsNearPointForSpread(bot, x, z, 5);
				const score = -crowd * 12 + ((i * 7 + bot.id) % 11);
				if (score <= bestScore) continue;
				bestScore = score;
				best = new THREE.Vector3(x, bot.position.y, z);
			}
			escape = best;
		}
        if (escape) {
            if (bot.patrolTarget) bot.patrolTarget.copy(escape);
            if (bot._navWaypoint) bot._navWaypoint.copy(bot.patrolTarget || escape);
            bot._navWaypointUntil = now + 3200;
			bot.escapeDir.subVectors(bot.patrolTarget || escape, bot.position).normalize();
			bot._hasEscapeDir = true;
			bot.escapeTimer = 1.1;
		}
		bot._scatterTargetUntil = now + 4500;
		bot._elevatedRoute = null;
		bot._structureRoute = null;
		bot._fsmCtx = null;
		bot.steeringCooldown = 0;
		if (!combatTarget) bot.target = null;
		this.releaseLootReservation(bot);
		if (!combatTarget) this.releaseCombatReservation(bot);
		bot.isStuck = false;
	}

	getObjectKey(obj) {
		if (!obj) return null;
		if (obj.uuid) return obj.uuid;
		if (obj.userData?.uuid) return obj.userData.uuid;
		if (obj.id !== undefined) return `id:${obj.id}`;
		const p = obj.position;
		if (p) return `p:${Math.round(p.x)}:${Math.round(p.z)}`;
		return null;
	}

	ensureSet(map, key) {
		let s = map.get(key);
		if (!s) {
			s = new Set();
			map.set(key, s);
		}
		return s;
	}

	releaseFromMap(map, botId, key) {
		if (key && map.has(key)) {
			const set = map.get(key);
			set.delete(botId);
			if (!set.size) map.delete(key);
		}
	}

	tryReserveLoot(bot, chest, maxBots = 4) {
		const key = this.getObjectKey(chest);
		if (!key) return true;
		const prev = bot._lootReservationKey;
		if (prev && prev !== key)
			this.releaseFromMap(BotBrain._lootReservations, bot.id, prev);
		const set = this.ensureSet(BotBrain._lootReservations, key);
		if (!set.has(bot.id) && set.size >= maxBots) return false;
		set.add(bot.id);
		bot._lootReservationKey = key;
		return true;
	}

	releaseLootReservation(bot) {
		this.releaseFromMap(
			BotBrain._lootReservations,
			bot.id,
			bot._lootReservationKey,
		);
		bot._lootReservationKey = null;
	}

	getLootReservationCount(chest, exceptBot) {
		const key = this.getObjectKey(chest);
		if (!key) return 0;
		const set = BotBrain._lootReservations.get(key);
		if (!set) return 0;
		return exceptBot && set.has(exceptBot.id)
			? Math.max(0, set.size - 1)
			: set.size;
	}

	tryReserveCombat(bot, target, maxBots = 2) {
		const key = this.getObjectKey(target);
		if (!key) return true;
		// Cap maxBots — max 2 during early game, 3 otherwise
		const now = performance.now();
		const isEarlyGame = bot.noCombatUntil && now < bot.noCombatUntil;
		const cappedMax = isEarlyGame ? Math.min(maxBots, 2) : Math.min(maxBots, 3);
		const prev = bot._combatReservationKey;
		if (prev && prev !== key)
			this.releaseFromMap(BotBrain._combatReservations, bot.id, prev);
		const set = this.ensureSet(BotBrain._combatReservations, key);
		if (!set.has(bot.id) && set.size >= cappedMax) return false;
		set.add(bot.id);
		bot._combatReservationKey = key;
		return true;
	}

	releaseCombatReservation(bot) {
		this.releaseFromMap(
			BotBrain._combatReservations,
			bot.id,
			bot._combatReservationKey,
		);
		bot._combatReservationKey = null;
	}
}
