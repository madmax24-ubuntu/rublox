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
        this.baseVisionRange = 68;
        this.fov = 60 * (Math.PI / 180);
        this.hearingRange = 34;
        this.shotHearingRange = 76;
        this.losMemorySeconds = 1.4;
        this.reactionMin = 0.2;
        this.reactionMax = 0.5;
    }

    update(bot, delta, entityManager, lootManager, audioSynth) {
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

        let ctx = bot._fsmCtx;
        if (!ctx || this.decisionCooldown <= 0) {
            ctx = this.collectContext(bot, entityManager, lootManager);
            bot._fsmCtx = ctx;
            const nextState = this.pickState(bot, ctx);
            bot.state = nextState;
            if (nextState !== STATES.LOOT && nextState !== STATES.EXPLORE) this.releaseLootReservation(bot);
            if (nextState !== STATES.ENGAGE) this.releaseCombatReservation(bot);
            this.decisionCooldown = 0.2 + ((bot.id * 0.011) % 0.1);
        } else {
            ctx.outsideZone = ctx.zone?.isInsideZone ? !ctx.zone.isInsideZone(bot.position) : false;
            ctx.zoneDistance = ctx.zone?.getDistanceFromZone ? ctx.zone.getDistanceFromZone(bot.position) : 0;
            ctx.sheltered = bot.mapRef?.isShelteredFromRain?.(bot.position) || false;
            if (!ctx.shelterTarget) {
                ctx.shelterTarget = this.findNearestShelterTarget(bot);
            }
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
        this.actIdle(bot, ctx);
    }

    collectContext(bot, entityManager, lootManager) {
        const now = performance.now();
        const hp = bot.health / Math.max(1, bot.maxHealth || 100);
        const zone = bot.zoneRef;
        const outsideZone = zone?.isInsideZone ? !zone.isInsideZone(bot.position) : false;
        const zoneDistance = zone?.getDistanceFromZone ? zone.getDistanceFromZone(bot.position) : 0;

        const visionRadius = Math.max(30, this.baseVisionRange * this.visionMultiplier);
        const queryRadius = Math.max(visionRadius, this.shotHearingRange + 10);
        const closeCombatRadius = 24;
        const nearby = entityManager?.getNearbyEntities
            ? entityManager.getNearbyEntities(bot.position, queryRadius)
            : (entityManager?.getEntities?.() || []);
        const heardShot = this.detectNearbyGunfire(bot, entityManager, this.shotHearingRange);

        let nearestEnemy = null;
        let nearestEnemyDist = Infinity;
        let nearestZombie = null;
        let nearestZombieDist = Infinity;

        const sin = Math.sin(bot.rotation.y);
        const cos = Math.cos(bot.rotation.y);
        this._tmpForward.set(sin, 0, -cos);
        const forward = this._tmpForward;

        for (const ent of nearby) {
            if (!ent?.isAlive || ent === bot) continue;
            const type = ent.constructor?.name;
            const isEnemySurvivor = type === 'Player' || type === 'Bot';
            const isZombie = type === 'Zombie';
            if (!isEnemySurvivor && !isZombie) continue;
            const d = bot.position.distanceTo(ent.position);
            if (isEnemySurvivor && d < nearestEnemyDist) {
                const hasLos = this.hasLoS(bot, ent, entityManager);
                const heard = d <= this.hearingRange || (heardShot && d <= this.shotHearingRange);
                if (hasLos || heard) {
                    // FOV Check
                    this._tmpToTarget.subVectors(ent.position, bot.position).normalize();
                    const dot = forward.dot(this._tmpToTarget);
                    if (dot >= Math.cos(this.fov / 2)) {
                        nearestEnemyDist = d;
                        nearestEnemy = ent;
                        if (hasLos) bot.lastSeenEnemyAt = now;
                        else if (!bot.lastSeenEnemyAt) bot.lastSeenEnemyAt = now;
                    }
                }
            }
            if (isZombie && d < nearestZombieDist) {
                nearestZombieDist = d;
                nearestZombie = ent;
            }
        }
        const enemyRecentlySeen = !!nearestEnemy || ((now - (bot.lastSeenEnemyAt || 0)) <= this.losMemorySeconds * 1000);

        const lootRadius = hp < 0.5 ? 130 : 90;
        const chests = lootManager?.getNearbyChests
            ? lootManager.getNearbyChests(bot.position, lootRadius, true)
            : [];
        const lootTarget = this.pickBestChest(bot, chests, entityManager);

        const map = bot.mapRef;
        const sheltered = map?.isShelteredFromRain?.(bot.position) || false;
        const shelterTarget = this.findNearestShelterTarget(bot);
        const inPreLootPhase = !!(bot.noCombatUntil && now < bot.noCombatUntil);
        const crowdNear = this.countNearbyCombatants(bot, entityManager, 6.5);
        const gear = this.getGearScore(bot);

        // Compute avoidance force — steer away from nearby players/bots
        let avoidX = 0, avoidZ = 0;
        for (const ent of nearby) {
            if (!ent?.isAlive || ent === bot) continue;
            const type = ent.constructor?.name;
            if (type !== 'Player' && type !== 'Bot') continue;
            const d = bot.position.distanceTo(ent.position);
            if (d < 12 && d > 0.1) {
                const force = 1 / (d * d);
                avoidX += (bot.position.x - ent.position.x) / d * force;
                avoidZ += (bot.position.z - ent.position.z) / d * force;
            }
        }
        bot._avoidX = avoidX;
        bot._avoidZ = avoidZ;

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
            crowdNear,
            gear,
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

    detectNearbyGunfire(bot, entityManager, range) {
        const projs = entityManager?.projectiles;
        if (!projs?.length || !bot?.position) return false;
        const now = performance.now();
        const maxAge = 320;
        for (let i = projs.length - 1; i >= 0; i--) {
            const p = projs[i];
            if (!p?.mesh?.position) continue;
            const ownerType = p.owner?.constructor?.name;
            if (ownerType !== 'Player' && ownerType !== 'Bot') continue;
            if (p._bornAt === undefined) p._bornAt = now;
            if (now - p._bornAt > maxAge) continue;
            if (bot.position.distanceTo(p.mesh.position) <= range) return true;
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

        if (ctx.inPreLootPhase) {
            // During loot phase: prioritize looting and scatter away from crowds
            if (ctx.lootTarget) return STATES.LOOT;
            if (ctx.crowdNear >= 2) {
                return STATES.EXPLORE;
            }
            return STATES.EXPLORE;
        }

        const lowHp = ctx.hp < 0.35;
        const veryLowHp = ctx.hp < 0.2;
        const underPressure = ctx.nearestEnemy && ctx.nearestEnemyDist < ctx.closeCombatRadius;
        const armed = !!bot.currentWeapon && bot.currentWeapon.type !== 'fists';
        const hasMedkit = (bot.medkits || 0) > 0;

        // 1. Critical Survival
        if ((veryLowHp && hasMedkit) || (lowHp && hasMedkit && underPressure)) {
            return STATES.SURVIVAL;
        }

        // 2. Retreat/Hide if in trouble
        if (veryLowHp && ctx.shelterTarget && (!ctx.nearestEnemy || ctx.nearestEnemyDist > 10)) return STATES.ZONE_RETREAT;
        if (lowHp && underPressure && !hasMedkit) return STATES.HIDE;

        // 3. Avoid other players/bots — stay alone with strong scatter
        if (ctx.crowdNear >= 2) {
            return STATES.EXPLORE;
        }

        // 4. Early Game / Low Gear Logic
        const undergeared = ctx.gear < 0.35;
        if (undergeared) {
            // If weak, prioritize loot and avoid combat at all costs
            if (ctx.nearestEnemy && ctx.nearestEnemyDist < 50) {
                return STATES.HIDE;
            }
            if (ctx.lootTarget) return STATES.LOOT;
            return STATES.EXPLORE;
        }

        // 5. Only engage if attacked first — strict engagement rules
        if (ctx.nearestEnemy && ctx.nearestEnemyDist < 42) {
            const isBeingAttacked = ctx.heardShot || (bot._lastAttackedBy && performance.now() - bot._lastAttackedBy < 3000);
            if (isBeingAttacked && armed) {
                return STATES.ENGAGE;
            }
            if (ctx.lootTarget) return STATES.LOOT;
            return STATES.EXPLORE;
        }

        // 6. Default — loot first, explore second
        if (ctx.lootTarget) return STATES.LOOT;
        return STATES.EXPLORE;
    }

    actIdle(bot, ctx) {
        if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 2.2 || bot.isStuck) {
            bot.patrolTarget = this.pickSpreadTarget(bot, 24, 72);
        }
        if (bot.patrolTarget) {
            this.steerMove(bot, bot.patrolTarget, bot.physics.speed * 0.95);
        }
    }

    actExplore(bot, ctx) {
        const now = performance.now();
        // During loot phase or high crowd, scatter to opposite directions
        const isScatterPhase = bot.noCombatUntil && now < bot.noCombatUntil;
        const needsScatter = isScatterPhase || ctx.crowdNear >= 2;
        
        if (needsScatter) {
            // Pick a target far away in a direction opposite to nearest entity
            let scatterTarget = null;
            if (ctx.nearestEnemy) {
                const dir = this._tmpVec.set(
                    bot.position.x - ctx.nearestEnemy.position.x,
                    0,
                    bot.position.z - ctx.nearestEnemy.position.z
                ).normalize().multiplyScalar(-1);
                const dist = 50 + Math.random() * 40;
                scatterTarget = new THREE.Vector3(
                    bot.position.x + dir.x * dist,
                    bot.position.y,
                    bot.position.z + dir.z * dist
                );
            } else {
                // Use bot ID to ensure different scatter directions
                const angle = (bot.id * 0.7) + Math.random() * 0.5;
                scatterTarget = new THREE.Vector3(
                    bot.position.x + Math.cos(angle) * 60,
                    bot.position.y,
                    bot.position.z + Math.sin(angle) * 60
                );
            }
            
            if (!scatterTarget) return;
            bot.patrolTarget = scatterTarget;
            this.steerMove(bot, scatterTarget, bot.physics.speed * 1.1);
        } else {
            if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 5) {
                bot.patrolTarget = this.pickSpreadTarget(bot, 30, 80);
            }
            if (bot.patrolTarget) {
                this.steerMove(bot, bot.patrolTarget, bot.physics.speed * 0.85);
            }
        }
    }

    actLoot(bot, ctx, lootManager) {
        const chest = ctx.lootTarget;
        if (!chest || chest.userData?.isOpen) {
            this.releaseLootReservation(bot);
            bot.patrolTarget = this.pickSpreadTarget(bot, 14, 44);
            if (bot.patrolTarget) this.steerMove(bot, bot.patrolTarget, bot.physics.speed);
            return;
        }
        if (!this.tryReserveLoot(bot, chest, 2)) {
            bot.patrolTarget = this.pickSpreadTarget(bot, 18, 58);
            if (bot.patrolTarget) this.steerMove(bot, bot.patrolTarget, bot.physics.speed * 1.05);
            return;
        }
        lootManager?.claimChest?.(chest, bot.id, 2.6);

        const dist = bot.position.distanceTo(chest.position);
        bot.lookAt(chest.position);
        if (dist > 2.9) {
            bot.patrolTarget = chest.position;
            this.steerMove(bot, chest.position, bot.physics.speed * 1.08);
            return;
        }

        const loot = lootManager?.tryOpenChest?.(chest, bot, bot.audioSynthRef);
        if (loot) bot.pickupLoot(loot);
        this.releaseLootReservation(bot);
        bot.patrolTarget = this.pickSpreadTarget(bot, 10, 36);
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
                this.steerMove(bot, shelter, bot.physics.speed * 0.75);
                return;
            }
        }

        bot.physics.velocity.x *= 0.5;
        bot.physics.velocity.z *= 0.5;
        this._tmpRandomDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        if (!bot.patrolTarget) bot.patrolTarget = new THREE.Vector3();
        bot.patrolTarget.copy(bot.position).addScaledVector(this._tmpRandomDir, 10);
    }

    actEngage(bot, ctx, entityManager) {
        const target = this.pickCombatTarget(bot, ctx, entityManager);
        if (!target) {
            this.releaseCombatReservation(bot);
            bot.patrolTarget = this.pickSpreadTarget(bot, 16, 48);
            if (bot.patrolTarget) this.steerMove(bot, bot.patrolTarget, bot.physics.speed);
            return;
        }
        if (ctx.hp < 0.3) {
            bot.state = STATES.RETREAT;
            this.actRetreat(bot, ctx);
            return;
        }
        const nowSec = performance.now() / 1000;
        if (!bot._engageWindowUntil || nowSec >= bot._engageWindowUntil) {
            bot._engageWindowUntil = nowSec + 5 + Math.random() * 2;
        }
        if (nowSec >= bot._engageWindowUntil) {
            bot._reloadCoverUntil = nowSec + 1.35 + Math.random() * 0.85;
            bot._engageWindowUntil = nowSec + 5 + Math.random() * 2;
            bot.state = STATES.RELOAD_COVER;
            this.actReloadCover(bot, ctx);
            return;
        }
        if (!this.tryReserveCombat(bot, target, target.constructor?.name === 'Player' ? 3 : 2)) {
            this.releaseCombatReservation(bot);
            bot.patrolTarget = this.pickSpreadTarget(bot, 18, 54);
            if (bot.patrolTarget) this.steerMove(bot, bot.patrolTarget, bot.physics.speed * 1.02);
            return;
        }
        bot.target = target;
        const dist = bot.position.distanceTo(target.position);
        const weapon = bot.currentWeapon || bot.fists;
        const range = Math.max(2.7, (weapon.range || 3) * (weapon.type === 'shotgun' ? 0.88 : 0.95));
        bot.lookAt(target.position);
        if (dist <= range) {
            const targetKey = this.getObjectKey(target) || `${Math.round(target.position.x)}:${Math.round(target.position.z)}`;
            if (bot._reactionTargetKey !== targetKey) {
                bot._reactionTargetKey = targetKey;
                bot._reactionReadyAt = nowSec + this.reactionMin + Math.random() * (this.reactionMax - this.reactionMin);
            }
            const strafeDir = ((bot.id + Math.floor(nowSec * 4)) % 2 === 0) ? 1 : -1;
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
                bot._dynamicAimError = 0.01 + distNorm * 0.04 + moveNorm * 0.055;
                bot.attack(target, entityManager);
                bot.applyWeaponRecoil();
                this.attackCooldown = Math.max(0.05, (weapon.cooldown || 0.2) * 0.5);
            }
            return;
        }
        bot._reactionTargetKey = null;
        bot._reactionReadyAt = 0;
        bot.patrolTarget = target.position;
        
        // Cautious approach: move slower when approaching a target from distance
        const approachSpeed = dist > 20 ? bot.physics.speed * 0.7 : bot.physics.speed * 1.3;
        this.steerMove(bot, target.position, approachSpeed);
    }

    actRetreat(bot, ctx) {
        const target = this.findNearestCover(bot, ctx.nearestEnemy?.position || null)
            || ctx.shelterTarget
            || this.pickSpreadTarget(bot, 20, 68);
        if (!target) return;
        bot.patrolTarget = target;
        bot.target = null;
        this.releaseCombatReservation(bot);
        this.steerMove(bot, target, bot.physics.speed * 1.28);
    }

    actReloadCover(bot, ctx) {
        const nowSec = performance.now() / 1000;
        if (bot._reloadCoverUntil && nowSec >= bot._reloadCoverUntil) {
            bot.state = STATES.ENGAGE;
            return;
        }
        const cover = this.findNearestCover(bot, ctx.nearestEnemy?.position || null)
            || this.pickSpreadTarget(bot, 12, 40);
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
            target = this.pickSpreadTarget(bot, 14, 40);
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
        const dir = this._tmpMoveDir.set(target.x - bot.position.x, 0, target.z - bot.position.z);
        const len = Math.hypot(dir.x, dir.z);
        if (len < 0.001) return;
        dir.multiplyScalar(1 / len);
        
        // Apply avoidance force — steer away from nearby players/bots
        const avoidX = bot._avoidX || 0;
        const avoidZ = bot._avoidZ || 0;
        if (avoidX !== 0 || avoidZ !== 0) {
            dir.x += avoidX * 0.5;
            dir.z += avoidZ * 0.5;
            const newLen = Math.hypot(dir.x, dir.z);
            if (newLen > 0.001) dir.multiplyScalar(1 / newLen);
        }
        
        const sin = Math.sin(Math.PI / 6);
        const cos = Math.cos(Math.PI / 6);
        this._tmpMoveLeft.set(dir.x * cos - dir.z * sin, 0, dir.x * sin + dir.z * cos);
        this._tmpMoveRight.set(dir.x * cos + dir.z * sin, 0, -dir.x * sin + dir.z * cos);
        const fBlocked = !!bot.isDirectionBlocked?.(dir);
        const lBlocked = !!bot.isDirectionBlocked?.(this._tmpMoveLeft);
        const rBlocked = !!bot.isDirectionBlocked?.(this._tmpMoveRight);
        let move = dir;
        if (fBlocked) {
            if (!lBlocked && !rBlocked) move = (bot.id % 2 === 0) ? this._tmpMoveLeft : this._tmpMoveRight;
            else if (!lBlocked) move = this._tmpMoveLeft;
            else if (!rBlocked) move = this._tmpMoveRight;
            else move = dir.clone().multiplyScalar(-1);
        }
        if (bot.computeAvoidance) {
            const avoid = bot.computeAvoidance(move);
            if (avoid?.lengthSq?.() > 1e-4) move = this._tmpMoveTarget.copy(move).addScaledVector(avoid, 0.75).normalize();
        }
        
        // Cautious movement: if in HIDE or low gear, move slower and more carefully
        const isCautious = bot.state === STATES.HIDE || bot.state === STATES.EXPLORE && bot.inventory?.getItems?.().length < 2;
        const finalSpeed = isCautious ? speed * 0.7 : speed;

        const step = Math.max(4.5, finalSpeed * 0.9);
        const tx = bot.position.x + move.x * step;
        const tz = bot.position.z + move.z * step;
        this._tmpMoveTarget.set(tx, bot.position.y, tz);
        if (bot.mapRef?.isWalkableAt?.(tx, tz)) {
            bot.moveTowards(this._tmpMoveTarget, finalSpeed);
        } else {
            bot.moveTowards(target, finalSpeed * 0.75);
        }
    }

    pickCombatTarget(bot, ctx, entityManager) {
        const preferZombie = ctx.nearestZombie && ctx.nearestZombieDist < 7;
        if (preferZombie) return ctx.nearestZombie;
        const t = ctx.nearestEnemy;
        if (!t?.isAlive) return null;

        // Group Management: If target is part of a large group, avoid engagement
        const attackers = this.countAttackers(entityManager, t, bot);
        if (attackers >= 4) return null;

        // Ensure we don't engage if we are being surrounded by a larger group
        if (ctx.crowdNear >= 4) return null;

        return t;
    }

    pickBestChest(bot, chests, entityManager) {
        if (!chests?.length) return null;
        let best = null;
        let bestScore = -Infinity;
        for (const chest of chests) {
            if (!chest || chest.userData?.isOpen) continue;
            if (bot.lootManagerRef?.isChestClaimedByOther?.(chest, bot.id)) continue;
            const d = bot.position.distanceTo(chest.position);
            const crowd = this.countBotsNearPoint(entityManager, chest.position, 6.5);
            const reserved = this.getLootReservationCount(chest, bot);
            const claimPenalty = chest.userData?.claimedBy && chest.userData.claimedBy !== bot.id ? 0.8 : 0;
            const score = (1 / Math.max(2, d)) - crowd * 0.28 - reserved * 0.75 - claimPenalty + (chest.userData?.isSupplyDrop ? 0.8 : 0);
            if (score > bestScore) {
                bestScore = score;
                best = chest;
            }
        }
        return best;
    }

    pickSpreadTarget(bot, minDist = 20, maxDist = 64) {
        const map = bot.mapRef;
        const floors = map?.getFloorTiles?.();
        if (!floors?.length) return null;
        let best = null;
        let bestScore = -Infinity;
        for (let i = 0; i < 16; i++) {
            const tile = floors[(Math.floor((Math.random() + this._rngShift) * floors.length) + i * 17) % floors.length];
            const dist = Math.hypot(tile.x - bot.position.x, tile.z - bot.position.z);
            if (dist < minDist || dist > maxDist) continue;
            if (!map.isWalkableAt?.(tile.x, tile.z)) continue;
            const score = dist + Math.random() * 5;
            if (score > bestScore) {
                bestScore = score;
                best = this._tmpSpreadVec.set(tile.x, 0, tile.z);
            }
        }
        return best;
    }

    ensureBestWeaponEquipped(bot) {
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
        if (bestSlot >= 0 && bot.inventory.selectedSlot !== bestSlot) {
            bot.selectSlot(bestSlot);
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
        const escape = this.pickSpreadTarget(bot, 14, 52);
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

    tryReserveLoot(bot, chest, maxBots = 2) {
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
        const prev = bot._combatReservationKey;
        if (prev && prev !== key) this.releaseFromMap(BotBrain._combatReservations, bot.id, prev);
        const set = this.ensureSet(BotBrain._combatReservations, key);
        if (!set.has(bot.id) && set.size >= maxBots) return false;
        set.add(bot.id);
        bot._combatReservationKey = key;
        return true;
    }

    releaseCombatReservation(bot) {
        this.releaseFromMap(BotBrain._combatReservations, bot.id, bot._combatReservationKey);
        bot._combatReservationKey = null;
    }
}
