import * as THREE from 'three';

const STATES = {
    SPAWN_SPREAD: 'spawnSpread',
    LOOT: 'loot',
    COMBAT: 'combat',
    CHASE: 'chase',
    ZONE_RETREAT: 'zoneRetreat',
    SHELTER: 'shelter'
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
    constructor() {
        this.visionMultiplier = 1;
        this.decisionCooldown = 0;
        this.attackCooldown = 0;
        this.retargetCooldown = 0;
        this._tmpVec = new THREE.Vector3();
        this._tmpFrom = new THREE.Vector3();
        this._tmpTo = new THREE.Vector3();
        this._rngShift = Math.random() * 1000;
    }

    update(bot, delta, entityManager, lootManager) {
        if (!bot?.isAlive) return;

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
            this.decisionCooldown = 0.24 + ((bot.id * 0.013) % 0.06);
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
        if (bot.state === STATES.LOOT) {
            this.actLoot(bot, ctx, lootManager);
            return;
        }
        if (bot.state === STATES.COMBAT || bot.state === STATES.CHASE) {
            this.actCombat(bot, ctx, entityManager);
            return;
        }
        this.actSpawnSpread(bot, ctx);
    }

    collectContext(bot, entityManager, lootManager) {
        const now = performance.now();
        const hp = bot.health / Math.max(1, bot.maxHealth || 100);
        const zone = bot.zoneRef;
        const outsideZone = zone?.isInsideZone ? !zone.isInsideZone(bot.position) : false;
        const zoneDistance = zone?.getDistanceFromZone ? zone.getDistanceFromZone(bot.position) : 0;

        const visionRadius = Math.max(24, 54 * this.visionMultiplier);
        const closeCombatRadius = 18;
        const nearby = entityManager?.getNearbyEntities
            ? entityManager.getNearbyEntities(bot.position, visionRadius)
            : (entityManager?.getEntities?.() || []);

        let nearestEnemy = null;
        let nearestEnemyDist = Infinity;
        let nearestZombie = null;
        let nearestZombieDist = Infinity;

        for (const ent of nearby) {
            if (!ent?.isAlive || ent === bot) continue;
            const type = ent.constructor?.name;
            const isEnemySurvivor = type === 'Player' || type === 'Bot';
            const isZombie = type === 'Zombie';
            if (!isEnemySurvivor && !isZombie) continue;
            const d = bot.position.distanceTo(ent.position);
            if (isEnemySurvivor && d < nearestEnemyDist) {
                nearestEnemyDist = d;
                nearestEnemy = ent;
            }
            if (isZombie && d < nearestZombieDist) {
                nearestZombieDist = d;
                nearestZombie = ent;
            }
        }

        const lootRadius = hp < 0.5 ? 130 : 90;
        const chests = lootManager?.getNearbyChests
            ? lootManager.getNearbyChests(bot.position, lootRadius, true)
            : [];
        const lootTarget = this.pickBestChest(bot, chests, entityManager);

        const map = bot.mapRef;
        const sheltered = map?.isShelteredFromRain?.(bot.position) || false;
        const shelterTarget = this.findNearestShelterTarget(bot);
        const inPreLootPhase = !!(bot.noCombatUntil && now < bot.noCombatUntil);
        const crowdNear = this.countNearbyBots(bot, entityManager, 6.5);
        const gear = this.getGearScore(bot);

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
            lootTarget,
            sheltered,
            shelterTarget,
            inPreLootPhase,
            crowdNear,
            gear,
            closeCombatRadius
        };
    }

    pickState(bot, ctx) {
        if (bot.forceShelterActive) {
            return ctx.sheltered ? STATES.SHELTER : STATES.ZONE_RETREAT;
        }

        if (ctx.outsideZone || ctx.zoneDistance > 0.5) {
            return STATES.ZONE_RETREAT;
        }

        if (ctx.inPreLootPhase) {
            if (ctx.lootTarget) return STATES.LOOT;
            return STATES.SPAWN_SPREAD;
        }

        const undergeared = ctx.gear < 0.24;
        if (undergeared && ctx.lootTarget && (!ctx.nearestEnemy || ctx.nearestEnemyDist > 9.5)) {
            return STATES.LOOT;
        }

        const lowHp = ctx.hp < 0.35;
        const veryLowHp = ctx.hp < 0.2;
        const underPressure = ctx.nearestEnemy && ctx.nearestEnemyDist < ctx.closeCombatRadius;
        const armed = !!bot.currentWeapon && bot.currentWeapon.type !== 'fists';

        if (veryLowHp && ctx.shelterTarget) return STATES.ZONE_RETREAT;
        if (lowHp && !armed && ctx.lootTarget) return STATES.LOOT;

        if (ctx.nearestZombie && ctx.nearestZombieDist < 8) {
            return STATES.COMBAT;
        }

        if (ctx.nearestEnemy) {
            if (!armed && ctx.lootTarget) return STATES.LOOT;
            if (underPressure || ctx.gear >= 0.45) return STATES.COMBAT;
            return STATES.CHASE;
        }

        if (ctx.lootTarget) return STATES.LOOT;
        return STATES.SPAWN_SPREAD;
    }

    actSpawnSpread(bot, ctx) {
        if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 2.2 || bot.isStuck || ctx.crowdNear >= 3) {
            bot.patrolTarget = this.pickSpreadTarget(bot, 24, 72);
        }
        if (bot.patrolTarget) {
            bot.moveTowards(bot.patrolTarget, bot.physics.speed * 0.95);
        }
    }

    actLoot(bot, ctx, lootManager) {
        const chest = ctx.lootTarget;
        if (!chest || chest.userData?.isOpen) {
            bot.patrolTarget = this.pickSpreadTarget(bot, 14, 44);
            if (bot.patrolTarget) bot.moveTowards(bot.patrolTarget, bot.physics.speed);
            return;
        }
        lootManager?.claimChest?.(chest, bot.id, 2.6);

        const dist = bot.position.distanceTo(chest.position);
        bot.lookAt(chest.position);
        if (dist > 2.9) {
            bot.patrolTarget = chest.position;
            bot.moveTowards(chest.position, bot.physics.speed * 1.05);
            return;
        }

        const loot = lootManager?.tryOpenChest?.(chest, bot, bot.audioSynthRef);
        if (loot) bot.pickupLoot(loot);
        bot.patrolTarget = this.pickSpreadTarget(bot, 10, 36);
    }

    actCombat(bot, ctx, entityManager) {
        const target = this.pickCombatTarget(bot, ctx, entityManager);
        if (!target) {
            bot.patrolTarget = this.pickSpreadTarget(bot, 16, 48);
            if (bot.patrolTarget) bot.moveTowards(bot.patrolTarget, bot.physics.speed);
            return;
        }

        bot.target = target;
        const dist = bot.position.distanceTo(target.position);
        const weapon = bot.currentWeapon || bot.fists;
        const range = Math.max(2.5, (weapon.range || 3) * (weapon.type === 'shotgun' ? 0.82 : 0.9));

        bot.lookAt(target.position);
        if (dist <= range) {
            if (this.attackCooldown <= 0) {
                bot.attack(target, entityManager);
                this.attackCooldown = Math.max(0.08, (weapon.cooldown || 0.2) * 0.8);
            }
            return;
        }

        bot.patrolTarget = target.position;
        bot.moveTowards(target.position, bot.physics.speed * 1.12);
    }

    actZoneRetreat(bot, ctx) {
        let target = null;

        if (bot.forceShelterActive && ctx.shelterTarget) {
            target = ctx.shelterTarget;
        } else if (ctx.zone && !ctx.zone.isInsideZone(bot.position)) {
            const len = Math.hypot(bot.position.x, bot.position.z) || 1;
            const safeRadius = Math.max(4, (ctx.zone.getCurrentRadius?.() || 40) - 8);
            target = new THREE.Vector3((bot.position.x / len) * safeRadius, bot.position.y, (bot.position.z / len) * safeRadius);
        } else if (ctx.shelterTarget && ctx.hp < 0.4) {
            target = ctx.shelterTarget;
        } else {
            target = this.pickSpreadTarget(bot, 14, 40);
        }

        if (!target) return;
        bot.patrolTarget = target;
        bot.moveTowards(target, bot.physics.speed * 1.2);
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
            bot.moveTowards(localChest.position, bot.physics.speed * 0.9);
            return;
        }
        if (ctx.shelterTarget) {
            bot.moveTowards(ctx.shelterTarget, bot.physics.speed * 0.82);
        } else {
            bot.physics.velocity.x *= 0.7;
            bot.physics.velocity.z *= 0.7;
        }
    }

    pickCombatTarget(bot, ctx, entityManager) {
        const preferZombie = ctx.nearestZombie && ctx.nearestZombieDist < 7;
        if (preferZombie) return ctx.nearestZombie;

        const t = ctx.nearestEnemy;
        if (!t?.isAlive) return null;

        const maxAttackers = t.constructor?.name === 'Player' ? 2 : 2;
        const attackers = this.countAttackers(entityManager, t, bot);
        if (attackers >= maxAttackers) return null;
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
            const claimPenalty = chest.userData?.claimedBy && chest.userData.claimedBy !== bot.id ? 0.8 : 0;
            const score = (1 / Math.max(2, d)) - crowd * 0.24 - claimPenalty + (chest.userData?.isSupplyDrop ? 0.8 : 0);
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
                best = new THREE.Vector3(tile.x, 0, tile.z);
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
            const score = (WEAPON_PRIORITY[w.type] || 0)
                + ((w.ammo || 0) > 0 ? 0.7 : 0)
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
        return new THREE.Vector3(best.x, bot.position.y, best.z);
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
        bot.lootTarget = null;
        bot.isStuck = false;
    }
}
