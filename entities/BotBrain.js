import * as THREE from 'three';

const STATES = {
    IDLE: 'idle',
    LOOT: 'loot',
    EXPLORE: 'explore',
    ENGAGE: 'engage',
    RELOAD_COVER: 'reloadCover',
    RETREAT: 'retreat',
    SURVIVAL: 'survival',
    ZONE_RETREAT: 'zoneRetreat',
    SHELTER: 'shelter',
    HIDE: 'hide'
};

const WEAPON_PRIORITY = {
    machinegun: 9,
    rifle: 8,
    shotgun: 7,
    laser: 7,
    flamethrower: 6,
    bow: 5,
    pistol: 4,
    knife: 3,
    fists: 1
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
        this.baseVisionRange = 112;
        this.fov = 140 * (Math.PI / 180);
        this.hearingRange = 56;
        this.shotHearingRange = 108;
        this.losMemorySeconds = 3;
        this.reactionMin = 0.12;
        this.reactionMax = 0.3;
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

        this.ensureBestWeaponEquipped(bot);
        this.handleStuck(bot);

        const now = performance.now();
        const phaseGear = this.getGearScore(bot);
        const inPreLootPhase = !!(bot.noCombatUntil && now < bot.noCombatUntil);
        const earlyGamePhase = inPreLootPhase || !!(bot.noCombatUntil && now < bot.noCombatUntil + 30000 && phaseGear < 1.15);

        // Force context refresh when phases change — prevents stale cached state from keeping bots in combat
        const phaseChanged = !!(bot._lastPhase && bot._lastPhase !== earlyGamePhase);
        let ctx = bot._fsmCtx;
        if (!ctx || this.decisionCooldown <= 0 || phaseChanged) {
            ctx = this.collectContext(bot, entityManager, lootManager);
            ctx.earlyGamePhase = earlyGamePhase;
            bot._fsmCtx = ctx;
            bot._lastPhase = earlyGamePhase;
            const nextState = this.pickState(bot, ctx);
            bot.state = nextState;
            if (nextState !== STATES.LOOT && nextState !== STATES.EXPLORE) this.releaseLootReservation(bot);
            if (nextState !== STATES.ENGAGE) this.releaseCombatReservation(bot);
            this.decisionCooldown = 0.28 + ((bot.id * 0.007) % 0.16);
        } else {
            // Refresh earlyGamePhase on cached context so actEngage / actExplore see current phase
            ctx.earlyGamePhase = earlyGamePhase;
            ctx.inPreLootPhase = inPreLootPhase;
            ctx.outsideZone = ctx.zone?.isInsideZone ? !ctx.zone.isInsideZone(bot.position) : false;
            ctx.zoneDistance = ctx.zone?.getDistanceFromZone ? ctx.zone.getDistanceFromZone(bot.position) : 0;
            ctx.sheltered = bot.mapRef?.isShelteredFromRain?.(bot.position) || false;
            // Refresh enemy detection for early-game scatter
            if (earlyGamePhase) {
                ctx.nearestEnemy = this.detectNearestEnemyForEarlyGame(bot, entityManager);
                ctx.nearestEnemyDist = ctx.nearestEnemy ? bot.position.distanceTo(ctx.nearestEnemy.position) : Infinity;
            }
            if (!ctx.shelterTarget) {
                ctx.shelterTarget = this.findNearestShelterTarget(bot);
            }
        }

        if (inPreLootPhase) {
            bot._retaliationTarget = null;
            bot._retaliateUntil = 0;
            this.releaseCombatReservation(bot);
            if ((ctx.nearestEnemyDist < 18 || ctx.nearestZombieDist < 18) && ctx.shelterTarget) {
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

        const retaliating = bot._retaliationTarget?.isAlive && now < (bot._retaliateUntil || 0);
        if (
            retaliating
            && bot.position.distanceTo(bot._retaliationTarget.position) <= 65
            && !bot.forceShelterActive
            && !ctx.outsideZone
        ) {
            ctx.nearestEnemy = bot._retaliationTarget;
            ctx.nearestEnemyDist = bot.position.distanceTo(bot._retaliationTarget.position);
            ctx.inPreLootPhase = false;
            ctx.earlyGamePhase = false;
            bot.state = STATES.ENGAGE;
            this.actEngage(bot, ctx, entityManager);
            return;
        }
        if (bot.assignedBiomeGate && now < (bot.assignedBiomeUntil || 0) && !bot.forceShelterActive && !ctx.outsideZone) {
            if (Math.hypot(bot.position.x, bot.position.z) < 55 && bot.position.distanceTo(bot.assignedBiomeGate) > 3) {
                bot.state = STATES.EXPLORE;
                this.steerMove(bot, bot.assignedBiomeGate, bot.physics.speed * 1.35);
                return;
            }
            bot.assignedBiomeGate = null;
        }
        if (bot.assignedBiomeThreshold && now < (bot.assignedBiomeUntil || 0) && !bot.forceShelterActive && !ctx.outsideZone) {
            if (Math.hypot(bot.position.x, bot.position.z) < 64 && bot.position.distanceTo(bot.assignedBiomeThreshold) > 2.5) {
                bot.state = STATES.EXPLORE;
                this.steerMove(bot, bot.assignedBiomeThreshold, bot.physics.speed * 1.35);
                return;
            }
            bot.assignedBiomeThreshold = null;
        }
        if (!retaliating && bot.assignedBiomeEntry && now < (bot.assignedBiomeUntil || 0) && !bot.forceShelterActive && !ctx.outsideZone) {
            const distToEntry = bot.position.distanceTo(bot.assignedBiomeEntry);
            if (Math.hypot(bot.position.x, bot.position.z) < 72 && distToEntry > 8) {
                bot.state = STATES.EXPLORE;
                this.steerMove(bot, bot.assignedBiomeEntry, bot.physics.speed * 1.25);
                return;
            }
            bot.assignedBiomeEntry = null;
        }

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
        if (bot.state === 'spawn') {
            bot.state = STATES.EXPLORE;
            this.actExplore(bot, ctx);
            return;
        }
        this.actIdle(bot, ctx);
    }

    collectContext(bot, entityManager, lootManager) {
        const now = performance.now();
        const phaseGear = this.getGearScore(bot);
        const inPreLootPhase = !!(bot.noCombatUntil && now < bot.noCombatUntil);
        const earlyGamePhase = inPreLootPhase || !!(bot.noCombatUntil && now < bot.noCombatUntil + 30000 && phaseGear < 1.15);

        const hp = bot.health / Math.max(1, bot.maxHealth || 100);
        const zone = bot.zoneRef;
        const outsideZone = zone?.isInsideZone ? !zone.isInsideZone(bot.position) : false;
        const zoneDistance = zone?.getDistanceFromZone ? zone.getDistanceFromZone(bot.position) : 0;

        // OPTIMIZED: Smaller radius for better performance
        const queryRadius = earlyGamePhase ? 68 : Math.min(104, this.baseVisionRange * this.visionMultiplier);
        const closeCombatRadius = 42;

        // OPTIMIZED: Cache nearby query — reuse if bot hasn't moved much (extended cache to 200ms)
        const cacheAge = (bot._nearbyCacheTime || 0) + 0.2 - (now / 1000);
        let nearby = null;
        if (cacheAge > 0 && bot._cachedNearby && !earlyGamePhase) {
            nearby = bot._cachedNearby;
        } else {
            nearby = entityManager?.getNearbyEntities
                ? entityManager.getNearbyEntities(bot.position, queryRadius)
                : (entityManager?.getEntities?.() || []);
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
        this._tmpForward.set(sin, 0, -cos);
        const forward = this._tmpForward;
        const fovCos = Math.cos(this.fov / 2);

        // OPTIMIZED: Skip LOS checks every other collectContext call
        const skipLos = ((Math.floor(now / 180) + bot.id) & 1) === 0;
        const skipLosEarlyGame = earlyGamePhase;

        const hearingRangeSq = this.hearingRange * this.hearingRange;
        const shotHearingSq = this.shotHearingRange * this.shotHearingRange;

        for (const ent of nearby) {
            if (!ent?.isAlive || ent === bot) continue;
            const type = ent.constructor?.name;
            const isEnemySurvivor = type === 'Player' || type === 'Bot';
            const isZombie = type === 'Zombie';
            if (!isEnemySurvivor && !isZombie) continue;

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
                    hasLos = (bot._cachedLosTarget === ent.id && !!bot._cachedLos) || d < 12;
                }
                const heard = dSq <= hearingRangeSq || (heardShot && dSq <= shotHearingSq);
                if (hasLos || heard) {
                    this._tmpToTarget.set(dx, 0, dz).normalize();
                    const inVisionCone = forward.dot(this._tmpToTarget) >= fovCos || d < 14;
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
        const enemyRecentlySeen = !!nearestEnemy || ((now - (bot.lastSeenEnemyAt || 0)) <= this.losMemorySeconds * 1000);

        const lootRadius = hp < 0.5 ? 160 : 120;
        const chests = lootManager?.getNearbyChests
            ? lootManager.getNearbyChests(bot.position, lootRadius, true)
            : [];
        const lootTarget = this.pickBestChest(bot, chests, entityManager);

        const map = bot.mapRef;
        const sheltered = map?.isShelteredFromRain?.(bot.position) || false;
        const shelterTarget = this.findNearestShelterTarget(bot);
        // earlyGamePhase already computed at top of collectContext
        const crowdNear = this.countNearbyCombatants(bot, entityManager, 6.5);
        const gear = this.getGearScore(bot);
        const combatReady = this.isCombatReady(bot);

        // Compute avoidance force — steer away from nearby players/bots
        // During early game, use larger radius (14m) and stronger force for scatter
        let avoidX = 0, avoidZ = 0;
        let avoidCount = 0;
        const maxAvoidChecks = Math.min(nearby.length, earlyGamePhase ? 16 : 12);
        const avoidRadiusSq = earlyGamePhase ? 196 : 64; // 14m radius during early game, 8m otherwise
        for (let i = 0; i < maxAvoidChecks; i++) {
            const ent = nearby[i];
            if (!ent?.isAlive || ent === bot) continue;
            const type = ent.constructor?.name;
            if (type !== 'Player' && type !== 'Bot') continue;
            const dx = ent.position.x - bot.position.x;
            const dz = ent.position.z - bot.position.z;
            const dSq = dx * dx + dz * dz;
            if (dSq < avoidRadiusSq && dSq > 0.01) {
                const d = Math.sqrt(dSq);
                const force = earlyGamePhase ? (8.5 / (dSq + 0.35)) : (4.2 / (dSq + 0.35));
                avoidX -= (dx / d) * force;
                avoidZ -= (dz / d) * force;
                avoidCount++;
                if (avoidCount >= (earlyGamePhase ? 8 : 6)) break;
            }
        }
        bot._avoidX = avoidX;
        bot._avoidZ = avoidZ;

        // Memory-based avoidance: steer away from recently looted areas and enemy encounters
        const memoryAgeLimit = 120000; // 2 minutes — forget after that
        // Clean old entries
        bot.lootedAreas = bot.lootedAreas.filter(e => now - e.time < memoryAgeLimit);
        bot.enemyEncounters = bot.enemyEncounters.filter(e => now - e.time < memoryAgeLimit);

        // Avoid looted areas (don't waste time going back)
        for (const area of bot.lootedAreas) {
            const dx = bot.position.x - area.pos.x;
            const dz = bot.position.z - area.pos.z;
            const dSq = dx * dx + dz * dz;
            if (dSq < 400 && dSq > 0.01) { // 20m radius
                const d = Math.sqrt(dSq);
                const force = (3.0 / (dSq + 1));
                bot._avoidX += (dx / d) * force;
                bot._avoidZ += (dz / d) * force;
            }
        }

        // Avoid enemy encounter areas (dangerous spots)
        for (const enc of bot.enemyEncounters) {
            const dx = bot.position.x - enc.pos.x;
            const dz = bot.position.z - enc.pos.z;
            const dSq = dx * dx + dz * dz;
            if (dSq < 900 && dSq > 0.01) { // 30m radius
                const d = Math.sqrt(dSq);
                const force = (5.0 / (dSq + 1)) * (enc.damage / 50); // scaled by damage received
                bot._avoidX += (dx / d) * force;
                bot._avoidZ += (dz / d) * force;
            }
        }

        const retaliationTarget = bot._retaliationTarget;
        if (retaliationTarget?.isAlive && now < (bot._retaliateUntil || 0)) {
            const retaliationDist = bot.position.distanceTo(retaliationTarget.position);
            if (retaliationDist <= 65) {
                nearestEnemy = retaliationTarget;
                nearestEnemyDist = retaliationDist;
            }
        } else {
            bot._retaliationTarget = null;
            bot._retaliateUntil = 0;
        }

        return {
            now,
            hp,
            zone,
            outsideZone,
            zoneDistance,
            nearestEnemy,
            nearestEnemyDist,
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
            closeCombatRadius
        };
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
        // Lightweight enemy detection for early-game context refresh
        const nearby = entityManager?.getNearbyEntities
            ? entityManager.getNearbyEntities(bot.position, 50)
            : (entityManager?.getEntities?.() || []);
        let nearest = null;
        let nearestDist = Infinity;
        const fovCos = Math.cos(this.fov / 2);
        const sin = Math.sin(bot.rotation.y);
        const cos = Math.cos(bot.rotation.y);
        this._tmpForward.set(sin, 0, -cos);
        for (const ent of nearby) {
            if (!ent?.isAlive || ent === bot) continue;
            const type = ent.constructor?.name;
            if (type !== 'Player' && type !== 'Bot') continue;
            // OPTIMIZED: use squared distance to avoid sqrt
            const dx = ent.position.x - bot.position.x;
            const dz = ent.position.z - bot.position.z;
            const dSq = dx * dx + dz * dz;
            if (!Number.isFinite(dSq) || dSq < 1e-6) continue;
            if (dSq >= nearestDist * nearestDist) continue;
            // Normalize direction for FOV check
            const invD = 1 / Math.sqrt(dSq);
            this._tmpToTarget.set(dx * invD, 0, dz * invD);
            if (this._tmpForward.dot(this._tmpToTarget) >= fovCos) {
                nearestDist = Math.sqrt(dSq);
                nearest = ent;
            }
        }
        return nearest;
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
            if (ownerType !== 'Player' && ownerType !== 'Bot') continue;
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
        const underPressure = ctx.nearestEnemy && ctx.nearestEnemyDist < ctx.closeCombatRadius;
        const armed = !!bot.currentWeapon && bot.currentWeapon.type !== 'fists';
        const wellArmed = ctx.combatReady;
        const hasMedkit = (bot.medkits || 0) > 0;
        const retaliating = !!bot._retaliationTarget
            && bot._retaliationTarget.isAlive
            && performance.now() < (bot._retaliateUntil || 0);

        // Personality-driven thresholds
        const agg = Math.min(1, Math.max(0.62, bot.personality?.aggression ?? 0.5) + ctx.gear * 0.36);
        const cau = bot.personality?.caution ?? 0.5;
        const lootF = bot.personality?.lootFocus ?? 0.5;

        // Aggression adjusts engagement distance: aggressive bots engage from further away
        const engageDist = ctx.closeCombatRadius * (0.82 + agg * 0.9);
        // Caution adjusts undergeared threshold: cautious bots hide with less gear
        const undergearedThreshold = 0.24 + cau * 0.14;
        // Aggression adjusts crowd tolerance: aggressive bots tolerate more crowd in combat
        const crowdTolerance = ctx.earlyGamePhase ? 2 : Math.max(2, Math.round(1 + agg * 2));
        // Caution adjusts retreat threshold: cautious bots retreat at higher HP
        const retreatHpThreshold = 0.2 + cau * 0.15;

        // Helper: check if bot has a real weapon (not knife/fists)
        const hasRealWeapon = bot.currentWeapon && bot.currentWeapon.type !== 'knife' && bot.currentWeapon.type !== 'fists';

        if (ctx.inPreLootPhase) {
            if ((ctx.nearestEnemyDist < 18 || ctx.nearestZombieDist < 18) && ctx.shelterTarget) return STATES.HIDE;
            if (ctx.lootTarget) return STATES.LOOT;
            return STATES.EXPLORE;
        }

        if (ctx.nearestZombie && ctx.nearestZombieDist < 16) {
            // Zombies are a threat — engage unless critically low HP
            if (veryLowHp) return ctx.shelterTarget ? STATES.RETREAT : STATES.EXPLORE;
            if (lowHp && !wellArmed) return ctx.shelterTarget ? STATES.RETREAT : STATES.EXPLORE;
            return STATES.ENGAGE;
        }
        // Extended zombie threat radius — bots should engage zombies from further away
        if (ctx.nearestZombie && ctx.nearestZombieDist < 45) {
            if (hasRealWeapon && !veryLowHp) return STATES.ENGAGE;
            // If zombie is very close and bot is low HP, retreat
            if (ctx.nearestZombieDist < 10 && lowHp) return ctx.shelterTarget ? STATES.RETREAT : STATES.EXPLORE;
        }

        // === MANDATORY LOOT PRIORITY: if bot has no weapon or only knife, force loot ===
        if (!hasRealWeapon && ctx.lootTarget) {
            return STATES.LOOT;
        }

        // === PHASE 2: Early game (45s after pre-loot) ===
        // Bots prioritize looting — only engage when directly threatened
        if (ctx.earlyGamePhase) {
            // 1. Survival always wins
            if ((veryLowHp && hasMedkit) || (lowHp && hasMedkit && underPressure)) {
                return STATES.SURVIVAL;
            }
            if (veryLowHp && ctx.shelterTarget && (!ctx.nearestEnemy || ctx.nearestEnemyDist > 10)) {
                return STATES.ZONE_RETREAT;
            }
            // Reduced retaliation distance — bots prefer looting over fighting
            if (retaliating && ctx.nearestEnemy && ctx.nearestEnemyDist < 30 && !veryLowHp) return STATES.ENGAGE;

            const undergeared = !wellArmed || ctx.gear < undergearedThreshold;
            if (undergeared) {
                if (ctx.lootTarget) return STATES.LOOT;
                if (ctx.nearestEnemy && ctx.nearestEnemyDist < 60) return STATES.HIDE;
                return STATES.EXPLORE;
            }

            if (ctx.crowdNear >= crowdTolerance) {
                return STATES.EXPLORE;
            }
            // Extra crowd avoidance in early game
            if (ctx.crowdNear >= 2) {
                return STATES.EXPLORE;
            }

            // 4. Critical HP → flee and hide immediately
            if (fleeHp && ctx.shelterTarget) return STATES.HIDE;
            if (fleeHp) return STATES.RETREAT;

            // 4b. Low HP → hide/retreat
            if (lowHp && underPressure && !hasMedkit) return STATES.HIDE;

            // 5. Engagement: personality-adjusted thresholds
            if (ctx.nearestEnemy && ctx.nearestEnemyDist < engageDist) {
                // Self-defense: engage if being shot at close range regardless of gear
                const isBeingShot = ctx.heardShot;
                const closeThreat = ctx.nearestEnemyDist < 15;
                if (isBeingShot && closeThreat && !veryLowHp) {
                    return STATES.ENGAGE;
                }
                // Knife-only bots: engage only if very close (melee range) and being threatened
                if (!hasRealWeapon && ctx.nearestEnemyDist > 8) {
                    return STATES.LOOT;
                }
                if (!hasRealWeapon && isBeingShot && closeThreat && !veryLowHp) {
                    return STATES.ENGAGE;
                }
                // Well-armed bots engage when being shot
                if (isBeingShot && wellArmed && ctx.gear >= undergearedThreshold && ctx.crowdNear < crowdTolerance) {
                    return STATES.ENGAGE;
                }
                // Loot if enemy is not too close
                if (ctx.lootTarget && ctx.nearestEnemyDist > 12) return STATES.LOOT;
                return STATES.EXPLORE;
            }

            // 6. Default: loot then explore
            if (ctx.lootTarget) return STATES.LOOT;
            return STATES.EXPLORE;
        }

        // === PHASE 3: Mid/Late game — normal combat ===

        // 1. Critical Survival
        if ((veryLowHp && hasMedkit) || (lowHp && hasMedkit && underPressure)) {
            return STATES.SURVIVAL;
        }
        // Reduced retaliation distance — prefer looting
        if (retaliating && ctx.nearestEnemy && ctx.nearestEnemyDist < 40 && !veryLowHp) return STATES.ENGAGE;

        // 1b. Critical HP → flee and hide immediately
        if (fleeHp && ctx.shelterTarget) return STATES.HIDE;
        if (fleeHp) return STATES.RETREAT;

        // 2. Retreat/Hide if in trouble (caution-adjusted)
        if (ctx.hp < retreatHpThreshold && ctx.shelterTarget && (!ctx.nearestEnemy || ctx.nearestEnemyDist > 10)) return STATES.ZONE_RETREAT;
        if (lowHp && underPressure && !hasMedkit) return STATES.HIDE;

        // 3. Avoid crowds — leave fights with multiple combatants
        const crowdLeave = Math.max(2, Math.round(crowdTolerance));
        if (ctx.crowdNear >= crowdLeave) {
            return STATES.EXPLORE;
        }
        // Extra guard: don't engage if surrounded by multiple enemies
        if (ctx.nearestEnemy && ctx.crowdNear >= 3 && !ctx.heardShot) {
            return STATES.EXPLORE;
        }

        // 4. Undergeared — prioritize loot, hide from range, but self-defense always allowed
        const undergeared = !wellArmed || ctx.gear < undergearedThreshold;
        if (undergeared) {
            // Self-defense: engage if being shot at close range regardless of gear
            const isBeingShot = ctx.heardShot;
            const closeThreat = ctx.nearestEnemyDist < 15;
            if (isBeingShot && closeThreat && !veryLowHp) return STATES.ENGAGE;
            if (ctx.lootTarget) return STATES.LOOT;
            if (ctx.nearestEnemy && ctx.nearestEnemyDist < 55) return STATES.HIDE;
            return STATES.EXPLORE;
        }

        if (ctx.nearestEnemy && ctx.nearestEnemyDist < engageDist) {
            // BLOCK engage: knife-only bots must not fight at range
            if (!hasRealWeapon && ctx.nearestEnemyDist > 2) {
                return STATES.LOOT;
            }
            const isBeingAttacked = ctx.heardShot || (bot._lastAttackedBy && performance.now() - bot._lastAttackedBy < 3000);
            if (isBeingAttacked && ctx.crowdNear < crowdTolerance) {
                return STATES.ENGAGE;
            }
            if (wellArmed && agg >= 0.7 && ctx.nearestEnemyDist < engageDist * 0.82 && ctx.crowdNear < crowdTolerance) {
                return STATES.ENGAGE;
            }
            // Retaliate for recent attacks
            if (bot._lastAttackedBy && performance.now() - bot._lastAttackedBy < 4000 && ctx.crowdNear < 2) {
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
        if (!bot._lastLookTime || performance.now() - bot._lastLookTime > 4000 + Math.random() * 3000) {
            bot._lookAngle = Math.random() * Math.PI * 2;
            bot._lastLookTime = performance.now();
        }
        if (bot._lastLookTime && performance.now() - bot._lastLookTime < 4000) {
            const elapsed = (performance.now() - bot._lastLookTime) / 4000;
            const lookProgress = Math.sin(elapsed * Math.PI); // smooth back-and-forth
            bot.rotation.y = bot.lerpAngle(bot.rotation.y, bot._lookAngle, lookProgress * 0.15);
        }

        // Occasionally check/reload weapon while idle
        if (bot.currentWeapon && bot.currentWeapon.ammo !== null && bot.currentWeapon.ammo < bot.currentWeapon.maxAmmo * 0.3) {
            if (!bot._reloadCheckTime || performance.now() - bot._reloadCheckTime > 8000) {
                bot._reloadCheckTime = performance.now();
                // Bot briefly stops to check weapon
                if (bot.currentWeapon.ammo <= 0) {
                    bot.currentWeapon.reload?.();
                }
            }
        }

        if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 5 || bot.isStuck) {
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
                Math.sin(angle) * scatterDist
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

        const agg = Math.min(1, (bot.personality?.aggression ?? 0.5) + ctx.gear * 0.32);
        // During loot phase or high crowd, scatter to opposite directions
        // Cautious bots scatter more easily; aggressive bots tolerate more crowd
        const scatterThreshold = ctx.earlyGamePhase ? 1 : Math.max(1, Math.round(2 - agg));
        const isScatterPhase = ctx.earlyGamePhase || ctx.inPreLootPhase;
        const needsScatter = isScatterPhase || ctx.crowdNear >= scatterThreshold;

        if (needsScatter) {
            if (bot.patrolTarget && now < (bot._scatterTargetUntil || 0) && bot.position.distanceTo(bot.patrolTarget) > 5) {
                this.steerMove(bot, bot.patrolTarget, bot.physics.speed * (ctx.inPreLootPhase ? 1.1 : 1.0));
                return;
            }
            // Pick a target far away — avoid ALL nearby bots, not just the nearest enemy
            const entityManager = bot.entityManagerRef;
            const nearby = entityManager?.getNearbyEntities
                ? entityManager.getNearbyEntities(bot.position, 30)
                : [];

            // Compute average direction of nearby entities
            let avgX = 0, avgZ = 0, count = 0;
            for (const ent of nearby) {
                if (!ent?.isAlive || ent === bot) continue;
                const type = ent.constructor?.name;
                if (type !== 'Player' && type !== 'Bot') continue;
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
                const combinedLength = Math.max(0.001, Math.hypot(combinedX, combinedZ));
                const dist = ctx.earlyGamePhase ? (44 + Math.random() * 28) : (32 + Math.random() * 24);
                scatterTarget = new THREE.Vector3(
                    bot.position.x + combinedX / combinedLength * dist,
                    bot.position.y,
                    bot.position.z + combinedZ / combinedLength * dist
                );
            } else if (ctx.nearestEnemy) {
                const dir = this._tmpVec.set(
                    bot.position.x - ctx.nearestEnemy.position.x,
                    0,
                    bot.position.z - ctx.nearestEnemy.position.z
                ).normalize();
                const dist = (ctx.earlyGamePhase ? 48 : 34) + Math.random() * 24;
                scatterTarget = this._tmpSpreadVec.set(
                    bot.position.x + dir.x * dist,
                    bot.position.y,
                    bot.position.z + dir.z * dist
                );
            } else {
                // Unique deterministic direction per bot
                const seedAngle = bot.id * 2.399963227949204;
                const angle = seedAngle + Math.random() * 0.5;
                const radius = ctx.earlyGamePhase ? (46 + Math.random() * 26) : (34 + Math.random() * 20);
                scatterTarget = this._tmpSpreadVec.set(
                    bot.position.x + Math.cos(angle) * radius,
                    bot.position.y,
                    bot.position.z + Math.sin(angle) * radius
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
                    Math.sin(angle) * (27 + 5 * pushDir)
                );
            }
            bot.patrolTarget = scatterTarget.clone();
            bot._scatterTargetUntil = now + 2400 + (bot.id % 7) * 170;
            // Move at natural speed during scatter — no frantic sprinting
            const scatterSpeed = ctx.inPreLootPhase ? 1.1 : (ctx.earlyGamePhase ? 1.05 : 0.95);
            this.steerMove(bot, scatterTarget, bot.physics.speed * scatterSpeed);
        } else {
            if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 5) {
                bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
            }
            if (bot.patrolTarget) {
                // Avoid laser ring
                const d = Math.hypot(bot.patrolTarget.x, bot.patrolTarget.z);
                if (d > 23 && d < 31) {
                    const pushDir = d < 27 ? 1 : -1;
                    const angle = Math.atan2(bot.patrolTarget.z, bot.patrolTarget.x);
                    bot.patrolTarget.set(Math.cos(angle) * (27 + 5 * pushDir), bot.patrolTarget.y, Math.sin(angle) * (27 + 5 * pushDir));
                }
                // Slow down when gunfire is heard
                const exploreSpeed = ctx.heardShot ? 1.05 : 1;
                this.steerMove(bot, bot.patrolTarget, bot.physics.speed * exploreSpeed);
            }
        }
    }

    actLoot(bot, ctx, lootManager) {
        const chest = ctx.lootTarget;
        if (!chest || chest.userData?.isOpen) {
            this.releaseLootReservation(bot);
            bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
            if (bot.patrolTarget) this.steerMove(bot, bot.patrolTarget, bot.physics.speed);
            return;
        }
        if (!this.tryReserveLoot(bot, chest, 3)) {
            bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
            if (bot.patrolTarget) this.steerMove(bot, bot.patrolTarget, bot.physics.speed * 1.05);
            return;
        }
        lootManager?.claimChest?.(chest, bot.id, 1.2);

        const dist = bot.position.distanceTo(chest.position);
        bot.lookAt(chest.position);
        if (dist > 2.9) {
            bot.patrolTarget = chest.position;
            this.steerMove(bot, chest.position, bot.physics.speed * 1.25);
            return;
        }

        const loot = lootManager?.tryOpenChest?.(chest, bot, bot.audioSynthRef);
        if (loot) bot.pickupLoot(loot, chest.position);
        this.releaseLootReservation(bot);
        // EQUIP BEST WEAPON immediately after looting — prevents knife-only bots
        this.ensureBestWeaponEquipped(bot);
        // Reduced pause — bots rush to next chest immediately
        bot._lootPauseUntil = performance.now() + 150 + Math.random() * 250;
        bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
    }

    actHide(bot, ctx) {
        const shelter = ctx.shelterTarget || this.findNearestShelterTarget(bot);
        if (shelter) {
            const enemy = ctx.nearestEnemy;
            let isActuallyHidden = true;
            if (enemy) {
                this._tmpShelterDir.subVectors(shelter, bot.position).normalize();
                this._tmpEnemyDir.subVectors(enemy.position, bot.position).normalize();
                const dot = this._tmpShelterDir.dot(this._tmpEnemyDir);
                if (dot > 0.8) isActuallyHidden = false;
            }

            if (isActuallyHidden) {
                bot.patrolTarget = shelter;
                // При критическом HP боты бегут к укрытию быстрее
                const hideSpeed = ctx.hp < 0.3 ? 1.15 : 0.75;
                this.steerMove(bot, shelter, bot.physics.speed * hideSpeed);
                return;
            }
        }

        bot.physics.velocity.x *= 0.5;
        bot.physics.velocity.z *= 0.5;
        this._tmpRandomDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        bot.patrolTarget = (bot.patrolTarget || new THREE.Vector3()).copy(bot.position).addScaledVector(this._tmpRandomDir, 10);
    }

    actEngage(bot, ctx, entityManager) {
        const agg = Math.min(1, Math.max(0.68, bot.personality?.aggression ?? 0.5) + ctx.gear * 0.28);
        const cau = bot.personality?.caution ?? 0.5;

        // Early-game check: retreat if not being actively shot at
        if (ctx.earlyGamePhase) {
            const isBeingShot = ctx.heardShot || (
                bot._retaliationTarget?.isAlive
                && performance.now() < (bot._retaliateUntil || 0)
            );
            const dist = ctx.nearestEnemy ? bot.position.distanceTo(ctx.nearestEnemy.position) : Infinity;
            // Aggressive bots stay in combat longer; cautious bots retreat easier
            const retreatDist = 10 - agg * 4 + cau * 3;
            if (!isBeingShot && !ctx.combatReady && !ctx.nearestZombie && dist > retreatDist) {
                bot.state = STATES.EXPLORE;
                this.releaseCombatReservation(bot);
                return;
            }
        }

        // Cautious bots occasionally break to check flanks
        if (cau > 0.6 && !bot._lastFlankCheck && performance.now() - (bot._lastFlankCheck || 0) > 5000) {
            bot._lastFlankCheck = performance.now();
            const flankDir = this._tmpVec.set(
                bot.position.x - (ctx.nearestEnemy?.position.x || 0),
                0,
                bot.position.z - (ctx.nearestEnemy?.position.z || 0)
            ).normalize();
            const flankTarget = this._tmpMoveTarget.copy(bot.position).addScaledVector(flankDir, 8);
            if (bot.mapRef?.isWalkableAt?.(flankTarget.x, flankTarget.z)) {
                this.steerMove(bot, flankTarget, bot.physics.speed * 0.8);
                return;
            }
        }

        const target = this.pickCombatTarget(bot, ctx, entityManager);
        if (!target) {
            this.releaseCombatReservation(bot);
            bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
            if (bot.patrolTarget) this.steerMove(bot, bot.patrolTarget, bot.physics.speed);
            return;
        }
        const nowSec = performance.now() / 1000;
        if (!bot._engageWindowUntil || nowSec >= bot._engageWindowUntil) {
            // Shorter engage windows during early game
            const windowDuration = ctx.earlyGamePhase ? (3 + Math.random()) : (5 + Math.random() * 2);
            bot._engageWindowUntil = nowSec + windowDuration;
        }
        if (nowSec >= bot._engageWindowUntil) {
            bot._reloadCoverUntil = nowSec + 1.35 + Math.random() * 0.85;
            bot._engageWindowUntil = nowSec + (ctx.earlyGamePhase ? 3 : 5) + Math.random() * 2;
            bot.state = STATES.RELOAD_COVER;
            this.actReloadCover(bot, ctx);
            return;
        }
        if (!this.tryReserveCombat(bot, target, target.constructor?.name === 'Player' ? 4 : 3)) {
            this.releaseCombatReservation(bot);
            bot.patrolTarget = this.pickSpreadTarget(bot, 40, 120);
            if (bot.patrolTarget) this.steerMove(bot, bot.patrolTarget, bot.physics.speed * 1.02);
            return;
        }
        bot.target = target;
        const dist = bot.position.distanceTo(target.position);
        let weapon = bot.currentWeapon || bot.fists;
        const range = Math.max(2.7, (weapon.range || 3) * (weapon.type === 'shotgun' ? 0.88 : 0.95));

        // Don't waste ammo on close-range targets when melee is available
        if (dist < 3 && weapon.type !== 'fists' && weapon.type !== 'knife' && bot.inventory?.getItems?.()) {
            const meleeItems = bot.inventory.getItems().filter(w => w && (w.type === 'knife' || w.type === 'fists'));
            if (meleeItems.length && (weapon.ammo === null || weapon.ammo <= 3)) {
                const meleeSlot = bot.inventory.getItems().indexOf(meleeItems[0]);
                if (meleeSlot >= 0 && bot.inventory.selectedSlot !== meleeSlot) {
                    bot.selectSlot(meleeSlot);
                    bot._weaponSwitchCooldown = performance.now() + 800;
                }
                weapon = bot.currentWeapon || bot.fists;
            }
        }

        // Retreat earlier — don't fight to the death
        const hpThreshold = ctx.earlyGamePhase
            ? (0.42 - agg * 0.1 + cau * 0.1)
            : (0.35 - agg * 0.1 + cau * 0.1);
        if (ctx.hp < hpThreshold) {
            bot.state = STATES.RETREAT;
            this.actRetreat(bot, ctx);
            return;
        }

        bot.lookAt(target.position);
        if (dist <= range) {
            const targetKey = this.getObjectKey(target) || `${Math.round(target.position.x)}:${Math.round(target.position.z)}`;
            if (bot._reactionTargetKey !== targetKey) {
                bot._reactionTargetKey = targetKey;
                const reactionRange = this.reactionMax - this.reactionMin;
                const reactionDelay = (this.reactionMin + Math.random() * reactionRange) * (1 + cau * 0.8);
                bot._reactionReadyAt = nowSec + reactionDelay;
            }
            // Strafe direction changes less frequently — more natural
            const strafeDir = ((bot.id + Math.floor(nowSec * 2)) % 2 === 0) ? 1 : -1;
            const to = this._tmpVec.subVectors(target.position, bot.position).normalize();
            this._tmpSide.set(-to.z, 0, to.x).multiplyScalar(strafeDir * (3.4 + (bot.id % 3)));
            this._tmpSideTarget.set(bot.position.x + this._tmpSide.x, 0, bot.position.z + this._tmpSide.z);
            if (bot.mapRef?.isWalkableAt?.(this._tmpSideTarget.x, this._tmpSideTarget.z)) {
                this.steerMove(bot, this._tmpSideTarget, bot.physics.speed * 0.92);
            }
            if (this.attackCooldown <= 0) {
                if (bot._reactionReadyAt && nowSec < bot._reactionReadyAt) return;
                const tv = target.physics?.velocity;
                const targetSpeed = tv ? Math.hypot(tv.x || 0, tv.z || 0) : 0;
                const distNorm = Math.max(0, Math.min(1, dist / Math.max(8, (weapon.range || 40))));
                const moveNorm = Math.max(0, Math.min(1, targetSpeed / 9));
                const accuracyFactor = 1 - (agg - 0.5) * 0.3;
                bot._dynamicAimError = (0.01 + distNorm * 0.03 + moveNorm * 0.04) * accuracyFactor;
                bot.attack(target, entityManager);
                bot.applyWeaponRecoil();

                this.attackCooldown = Math.max(0.07, (weapon.cooldown || 0.2) * 0.9);
            }
            return;
        }
        bot._reactionTargetKey = null;
        bot._reactionReadyAt = 0;
        bot.patrolTarget = target.position;
        
        // Cautious approach: move slower when approaching a target from distance
        const approachMult = dist > 20 ? 0.92 : 1.3;
        const cauMod = 1 - (cau - 0.5) * 0.3;
        const approachSpeed = bot.physics.speed * approachMult * cauMod;
        this.steerMove(bot, target.position, approachSpeed);
    }

    actRetreat(bot, ctx) {
        const target = this.findNearestCover(bot, ctx.nearestEnemy?.position || null)
            || ctx.shelterTarget
            || this.pickSpreadTarget(bot, 40, 120);
        if (!target) return;
        bot.patrolTarget = target;
        bot.target = null;
        this.releaseCombatReservation(bot);
        // Бегите быстрее, когда здоровье критически низкое
        const fleeSpeed = ctx.hp < 0.3 ? 1.5 : 1.28;
        this.steerMove(bot, target, bot.physics.speed * fleeSpeed);
    }

    actReloadCover(bot, ctx) {
        const nowSec = performance.now() / 1000;
        if (bot._reloadCoverUntil && nowSec >= bot._reloadCoverUntil) {
            bot.state = STATES.ENGAGE;
            return;
        }
        const cover = this.findNearestCover(bot, ctx.nearestEnemy?.position || null)
            || this.pickSpreadTarget(bot, 40, 120);
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
            target = this._tmpVec.set((bot.position.x / len) * safeRadius, bot.position.y, (bot.position.z / len) * safeRadius);
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
        const localChest = lootManager?.getNearbyChests?.(bot.position, 8, true)?.[0];
        if (localChest) {
            const dist = bot.position.distanceTo(localChest.position);
            if (dist <= 3.2) {
                const loot = lootManager.tryOpenChest(localChest, bot, bot.audioSynthRef);
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
        if ((bot.health / Math.max(1, bot.maxHealth || 100)) < 0.55) {
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

    steerMove(bot, target, speed) {
        if (!bot?.position || !target) return;
        // Natural speed variation — breathing effect
        const breathFactor = 0.92 + Math.sin(performance.now() * 0.003 + bot.id * 7.3) * 0.08;
        const effectiveSpeed = speed * breathFactor;
        const dir = this._tmpMoveDir.set(target.x - bot.position.x, 0, target.z - bot.position.z);
        const len = Math.hypot(dir.x, dir.z);
        if (!Number.isFinite(len) || len < 0.001) return;
        dir.multiplyScalar(1 / len);
        
        // Apply avoidance force — steer away from nearby players/bots
        const avoidX = bot._avoidX || 0;
        const avoidZ = bot._avoidZ || 0;
        if (avoidX !== 0 || avoidZ !== 0) {
            dir.x += avoidX * 0.8;
            dir.z += avoidZ * 0.8;
            const newLen = Math.hypot(dir.x, dir.z);
            if (newLen > 0.001) dir.multiplyScalar(1 / newLen);
        }
        
        let move = dir;
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
        const isCautious = bot.state === STATES.HIDE || (bot.state === STATES.EXPLORE && bot.inventory?.getItems?.().length < 2) || cau > 0.7;
        const finalSpeed = isCautious ? effectiveSpeed * (0.96 + (1 - cau) * 0.04) : effectiveSpeed;

        const step = Math.max(4.5, finalSpeed * 0.9);
        const tx = bot.position.x + move.x * step;
        const tz = bot.position.z + move.z * step;
        this._tmpMoveTarget.set(tx, bot.position.y, tz);
        if (bot.mapRef?.isWalkableAt?.(tx, tz)) {
            bot.moveTowards(this._tmpMoveTarget, finalSpeed);
        } else {
            const waypoint = this.pickLocalNavigationStep(bot, target);
            if (waypoint) bot.moveTowards(waypoint, finalSpeed * 0.92);
            else {
                bot.physics.velocity.x *= 0.35;
                bot.physics.velocity.z *= 0.35;
                bot.isStuck = true;
            }
        }
    }

    pickLocalNavigationStep(bot, target) {
        if (!target) return null;
        const tiles = bot.mapRef?.getNavigationTiles?.();
        if (!tiles?.length) return null;
        const start = ((Number(bot.id) || 0) * 37 + Math.floor(performance.now() * 0.001) * 13) % tiles.length;
        const currentDist = Math.hypot(target.x - bot.position.x, target.z - bot.position.z);
        let best = null;
        let bestScore = currentDist + 8;
        for (let i = 0; i < Math.min(48, tiles.length); i++) {
            const tile = tiles[(start + i * 29) % tiles.length];
            if (!this.isInAssignedBiome(bot, tile)) continue;
            const localDist = Math.hypot(tile.x - bot.position.x, tile.z - bot.position.z);
            if (localDist < 3 || localDist > 28) continue;
            this._tmpRandomDir.set(tile.x - bot.position.x, 0, tile.z - bot.position.z).normalize();
            if (bot.isDirectionBlocked?.(this._tmpRandomDir)) continue;
            const targetDist = Math.hypot(target.x - tile.x, target.z - tile.z);
            const crowd = this.countBotsNearPointForSpread(bot, tile.x, tile.z, 4);
            const score = targetDist + localDist * 0.18 + crowd * 5;
            if (score >= bestScore) continue;
            bestScore = score;
            best = tile;
        }
        return best ? this._tmpCoverVec.set(best.x, bot.position.y, best.z) : null;
    }

    pickCombatTarget(bot, ctx, entityManager) {
        const agg = Math.max(0.55, bot.personality?.aggression ?? 0.5);
        const retaliationTarget = bot._retaliationTarget;
        if (retaliationTarget?.isAlive && performance.now() < (bot._retaliateUntil || 0)) {
            return retaliationTarget;
        }
        // Always prefer zombies over other bots — they're the real threat
        if (ctx.nearestZombie && ctx.nearestZombieDist < 45) return ctx.nearestZombie;
        const preferZombie = ctx.nearestZombie && ctx.nearestZombieDist < 18;
        if (preferZombie) return ctx.nearestZombie;
        const t = ctx.nearestEnemy;
        if (!t?.isAlive) return null;
        const retaliating = bot._retaliationTarget === t && performance.now() < (bot._retaliateUntil || 0);

        // Max attackers per target: aggressive bots tolerate more attackers
        const attackers = this.countAttackers(entityManager, t, bot);
        const maxAttackers = ctx.earlyGamePhase
            ? Math.max(2, Math.round(2 + agg * 2))
            : Math.min(4, Math.max(3, Math.round(3 + agg)));
        if (!retaliating && attackers >= maxAttackers) return null;

        // Don't engage if surrounded (aggressive bots tolerate more)
        const maxCrowd = ctx.earlyGamePhase
            ? Math.min(5, Math.max(3, Math.round(3 + agg * 2)))
            : 5;
        if (!retaliating && ctx.crowdNear >= maxCrowd) return null;

        // During early game, only fight if well-armed (aggressive bots less strict)
        if (ctx.earlyGamePhase && !retaliating) {
            const wellArmed = !!bot.currentWeapon && WEAPON_PRIORITY[bot.currentWeapon?.type] >= 4;
            if (!wellArmed) return null;
        }

        return t;
    }

    pickBestChest(bot, chests, entityManager) {
        if (!chests?.length) return null;
        let best = null;
        let bestScore = -Infinity;
        for (const chest of chests) {
            if (!chest || chest.userData?.isOpen) continue;
            if (!this.isInAssignedBiome(bot, chest.position)) continue;
            if (bot.lootManagerRef?.isChestClaimedByOther?.(chest, bot.id)) continue;

            // Penalize chests bot already looted
            let lootedPenalty = 0;
            for (const area of bot.lootedAreas) {
                const d = chest.position.distanceTo(area.pos);
                if (d < 5) { // Same chest or very nearby
                    lootedPenalty += 3.0 / (d + 0.5);
                }
            }

            const d = bot.position.distanceTo(chest.position);
            const crowd = this.countBotsNearPoint(entityManager, chest.position, 6.5);
            const reserved = this.getLootReservationCount(chest, bot);
            const claimPenalty = chest.userData?.claimedBy && chest.userData.claimedBy !== bot.id ? 0.8 : 0;
            const lootFocusBonus = (bot.personality?.lootFocus ?? 0.5) * 0.3;
            const score = (1 / Math.max(2, d)) - crowd * 0.28 - reserved * 0.75 - claimPenalty - lootedPenalty + (chest.userData?.isSupplyDrop ? 0.8 : 0) + lootFocusBonus;
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
            const tile = floors[(Math.floor((Math.random() + this._rngShift) * floors.length) + i * 23) % floors.length];
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
                if (d < 20) memoryPenalty += 12 / (d + 1) * (enc.damage / 50);
            }

            // Score: prefer distant, isolated targets (far from other bots)
            const isolationBonus = this.countBotsNearPointForSpread(bot, tile.x, tile.z, 8) * -12;
            const score = dist + Math.random() * 5 + isolationBonus - memoryPenalty;
            if (score > bestScore) {
                bestScore = score;
                best = this._tmpSpreadVec.set(tile.x, 0, tile.z);
            }
        }
        return best ? best.clone() : null;
    }

    isInAssignedBiome(bot, point) {
        if (!bot.assignedBiome || performance.now() >= (bot.assignedBiomeUntil || 0)) return true;
        if (Math.hypot(point.x, point.z) < 75) return false;
        // Allow bots to explore the full map outside biome zones
        const halfMap = 120;
        return Math.abs(point.x) <= halfMap && Math.abs(point.z) <= halfMap;
    }

    countBotsNearPointForSpread(bot, px, pz, radius) {
        const entityManager = bot.entityManagerRef;
        if (!entityManager) return 0;
        const nearby = entityManager.getNearbyEntities?.(this._tmpVec.set(px, 0, pz), radius);
        if (!nearby) return 0;
        let count = 0;
        for (const ent of nearby) {
            if (ent === bot) continue;
            const type = ent.constructor?.name;
            if (type === 'Bot' || type === 'Player') count++;
        }
        return count;
    }

    ensureBestWeaponEquipped(bot) {
        // Don't switch weapons too frequently — only throttle when cooldown is set
        if (bot._weaponSwitchCooldown && performance.now() < bot._weaponSwitchCooldown) return;

        const items = bot.inventory?.getItems?.() || [];
        let bestSlot = -1;
        let bestScore = 0;
        for (let i = 0; i < items.length; i++) {
            const w = items[i];
            if (!w) continue;
            const ammoRatio = (w.maxAmmo > 0) ? (w.ammo || 0) / w.maxAmmo : 0;
            const score = (WEAPON_PRIORITY[w.type] || 0)
                + (ammoRatio > 0 ? 0.7 * Math.min(1, ammoRatio * 2) : 0)
                + ((w.durability || 0) > 0 ? 0.4 : 0);
            if (score > bestScore) {
                bestScore = score;
                bestSlot = i;
            }
        }
        if (bestSlot >= 0) {
            const needsSwitch = bot.inventory.selectedSlot !== bestSlot || !bot.currentWeapon;
            if (needsSwitch) {
                bot.selectSlot(bestSlot);
                bot._weaponSwitchCooldown = performance.now() + 800;
            }
        }
    }

    getGearScore(bot) {
        const items = bot.inventory?.getItems?.() || [];
        let score = 0;
        for (const w of items) {
            if (!w) continue;
            score += (WEAPON_PRIORITY[w.type] || 0) * 0.08;
            if (w.ammo !== null && w.maxAmmo) score += Math.min(0.28, (w.ammo / w.maxAmmo) * 0.28);
            if (w.durability !== null && w.maxDurability) score += Math.min(0.18, (w.durability / w.maxDurability) * 0.18);
        }
        score += Math.min(0.25, (bot.armor || 0) / 100 * 0.25);
        return Math.max(0, Math.min(1, score));
    }

    isCombatReady(bot) {
        const items = bot.inventory?.getItems?.() || [];
        const ranged = items.some(item => item && (WEAPON_PRIORITY[item.type] || 0) >= 4 && (item.ammo === null || item.ammo > 0));
        return ranged && ((bot.stats?.loot || 0) > 0 || (bot.lootedAreas?.length || 0) > 0) && this.getGearScore(bot) >= 0.42;
    }

    findNearestShelterTarget(bot) {
        const map = bot.mapRef;
        if (!map) return null;
        const houses = map.getHouseSpots?.() || [];
        const hangars = map.getHangarSpots?.() || [];
        const all = [...houses, ...hangars];
        if (!all.length) return null;
        let best = null;
        let bestD = Infinity;
        for (const s of all) {
            if (!s) continue;
            const d = Math.hypot(bot.position.x - s.x, bot.position.z - s.z);
            if (d < bestD) {
                bestD = d;
                best = s;
            }
        }
        if (!best) return null;
        this._tmpVec.set(best.x, bot.position.y, best.z);
        return this._tmpVec;
    }

    findNearestCover(bot, threatPos = null) {
        const map = bot.mapRef;
        const colliders = map?.getColliders?.() || [];
        let best = null;
        let bestScore = Infinity;
        for (const c of colliders) {
            if (!c || c.enabled === false || c.walkable) continue;
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
                best = this._tmpCoverVec.set(cx, bot.position.y, cz);
            }
        }
        return best;
    }

    countNearbyCombatants(bot, entityManager, radius) {
        const near = entityManager?.getNearbyEntities
            ? entityManager.getNearbyEntities(bot.position, radius)
            : [];
        let count = 0;
        for (const e of near) {
            if (!e?.isAlive || e === bot) continue;
            const type = e.constructor?.name;
            if (type === 'Player' || type === 'Bot' || type === 'Zombie') {
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
            ? entityManager.getNearbyEntities(point, radius, 'Bot')
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
        const near = entityManager.getNearbyEntities(target.position, 16, 'Bot');
        let count = 0;
        for (const bot of near) {
            if (!bot?.isAlive || bot === exceptBot) continue;
            if (bot.target === target) count++;
        }
        return count;
    }

    handleStuck(bot) {
        if (!bot.isStuck) return;
        const escape = this.pickLocalNavigationStep(bot, bot.patrolTarget || bot.target?.position)
            || this.pickSpreadTarget(bot, 24, 70);
        if (escape) bot.patrolTarget = escape;
        bot.target = null;
        this.releaseLootReservation(bot);
        this.releaseCombatReservation(bot);
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
        if (prev && prev !== key) this.releaseFromMap(BotBrain._lootReservations, bot.id, prev);
        const set = this.ensureSet(BotBrain._lootReservations, key);
        if (!set.has(bot.id) && set.size >= maxBots) return false;
        set.add(bot.id);
        bot._lootReservationKey = key;
        return true;
    }

    releaseLootReservation(bot) {
        this.releaseFromMap(BotBrain._lootReservations, bot.id, bot._lootReservationKey);
        bot._lootReservationKey = null;
    }

    getLootReservationCount(chest, exceptBot) {
        const key = this.getObjectKey(chest);
        if (!key) return 0;
        const set = BotBrain._lootReservations.get(key);
        if (!set) return 0;
        return exceptBot && set.has(exceptBot.id) ? Math.max(0, set.size - 1) : set.size;
    }

    tryReserveCombat(bot, target, maxBots = 2) {
        const key = this.getObjectKey(target);
        if (!key) return true;
        // Cap maxBots — max 2 during early game, 3 otherwise
        const now = performance.now();
        const isEarlyGame = bot.noCombatUntil && now < bot.noCombatUntil + 45000;
        const cappedMax = isEarlyGame ? Math.min(maxBots, 2) : Math.min(maxBots, 3);
        const prev = bot._combatReservationKey;
        if (prev && prev !== key) this.releaseFromMap(BotBrain._combatReservations, bot.id, prev);
        const set = this.ensureSet(BotBrain._combatReservations, key);
        if (!set.has(bot.id) && set.size >= cappedMax) return false;
        set.add(bot.id);
        bot._combatReservationKey = key;
        return true;
    }

    releaseCombatReservation(bot) {
        this.releaseFromMap(BotBrain._combatReservations, bot.id, bot._combatReservationKey);
        bot._combatReservationKey = null;
    }
}
