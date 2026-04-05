import * as THREE from 'three';

export class BotBrain {
    constructor() {
        this.decisionCooldown = 0;
        this.attackCooldown = 0;
        this.repathCooldown = 0;
        this.lootCooldown = 0;
        this.visionMultiplier = 1;

        this.roleBias = Math.random();
        this.aggression = 0.45 + Math.random() * 0.35;
        this.lootBias = 0.45 + Math.random() * 0.4;

        this.cachedBots = null;
        this.cachedBotsUntil = 0;
        this.cachedManager = null;
        this._tmpInward = new THREE.Vector3();
        this._tmpPatrolVec = new THREE.Vector3();
    }

    update(bot, delta, entityManager, lootManager, audioSynth) {
        if (!bot?.isAlive) return;

        this.decisionCooldown = Math.max(0, this.decisionCooldown - delta);
        this.attackCooldown = Math.max(0, this.attackCooldown - delta);
        this.repathCooldown = Math.max(0, this.repathCooldown - delta);
        this.lootCooldown = Math.max(0, this.lootCooldown - delta);

        if (bot.forceShelterActive) {
            if (bot.state === 'hide') {
                bot.target = null;
                bot.lootTarget = null;
                return;
            }
            if (bot.state === 'retreat' && bot.patrolTarget) {
                this.updateRouteFinal(bot);
                bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.14);
                if (bot.position.distanceTo(bot.patrolTarget) < 2.2) {
                    bot.state = 'hide';
                }
                return;
            }
        }

        // Forced retreat (set by main.js during radiation rain).
        if (bot.state === 'retreat' && bot.patrolTarget) {
            this.updateRouteFinal(bot);
            bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.12);
            if (bot.position.distanceTo(bot.patrolTarget) < 2.4) {
                bot.state = 'explore';
            }
            return;
        }

        // Hard zone safety priority.
        if (this.getZonePressure(bot) > 0.84) {
            bot.target = null;
            bot.lootTarget = null;
            bot.state = 'retreat';
            this.setPatrolTarget(bot, this.getInwardTarget(bot, 30));
            bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.15);
            return;
        }

        if (this.decisionCooldown <= 0) {
            this.makeDecision(bot, entityManager, lootManager);
            this.decisionCooldown = 0.34 + Math.random() * 0.22;
        }

        this.executeState(bot, entityManager, lootManager, delta);
    }

    makeDecision(bot, entityManager, lootManager) {
        const now = performance.now();
        const preLootPhase = !!(bot.noCombatUntil && now < bot.noCombatUntil);
        const gear = this.getBotGearScore(bot);
        const lowHealth = bot.health / bot.maxHealth < 0.48;
        const lowResources = gear < 0.44 || lowHealth;
        const localCrowd = this.countBotsNearPoint(bot, bot.position, 6.6);
        const nearbyZombieThreat = this.countNearbyZombies(bot, entityManager, 10);
        const nearbyLoot = this.findBestChest(bot, lootManager, lowResources ? 105 : 76);
        const enemy = this.findBestEnemy(bot, entityManager, lowResources ? 30 : 52, gear);

        // Anti-stuck and anti-clump priority.
        if (bot.isStuck || (localCrowd >= 3 && Math.random() < 0.74)) {
            bot.target = null;
            bot.lootTarget = null;
            bot.state = 'patrol';
            this.setSpreadPatrolTarget(bot, 24, 72);
            return;
        }

        // Survival: if zombies are too close, defend first.
        if (nearbyZombieThreat > 0) {
            const z = this.findClosestZombie(bot, entityManager, 13);
            if (z) {
                bot.target = z;
                bot.lootTarget = null;
                bot.state = 'hunt';
                return;
            }
        }

        // During loot phase bots should primarily gather resources and rotate through POIs.
        if (preLootPhase) {
            if (nearbyLoot) {
                bot.target = null;
                bot.lootTarget = nearbyLoot;
                bot.state = 'explore';
                const approach = this.getLootApproachTarget(bot, nearbyLoot.position);
                this.setPatrolTarget(bot, approach || nearbyLoot.position);
                return;
            }
            const poi = this.getPoitarget(bot, lowResources ? 'loot' : 'safe');
            if (poi) {
                bot.target = null;
                bot.lootTarget = null;
                bot.state = 'patrol';
                this.setPatrolTarget(bot, poi);
                return;
            }
        }

        // Main rule: weak bot must loot first.
        if (nearbyLoot && (lowResources || !bot.currentWeapon || Math.random() < this.lootBias)) {
            bot.target = null;
            bot.lootTarget = nearbyLoot;
            bot.state = 'explore';
            const approach = this.getLootApproachTarget(bot, nearbyLoot.position);
            this.setPatrolTarget(bot, approach || nearbyLoot.position);
            return;
        }

        // Well-geared bots sometimes take train fights.
        if (gear > 0.72 && this.shouldDoTrainCombat(bot)) {
            const trainPoint = this.getTrainCombatTarget(bot);
            if (trainPoint) {
                bot.target = null;
                bot.lootTarget = null;
                bot.state = 'trainCombat';
                bot.preferTrainCombat = true;
                bot.trainCombatTimer = 9 + Math.random() * 7;
                this.setPatrolTarget(bot, trainPoint);
                return;
            }
        }

        // Geared combat/hunt stage.
        if (!preLootPhase && enemy && (bot.currentWeapon || bot.fists)) {
            bot.target = enemy;
            bot.lootTarget = null;
            bot.state = 'hunt';
            return;
        }

        // Optional continued looting even when geared.
        if (nearbyLoot && Math.random() < 0.38) {
            bot.target = null;
            bot.lootTarget = nearbyLoot;
            bot.state = 'explore';
            const approach = this.getLootApproachTarget(bot, nearbyLoot.position);
            this.setPatrolTarget(bot, approach || nearbyLoot.position);
            return;
        }

        // Patrol fallback.
        bot.target = null;
        bot.lootTarget = null;
        bot.preferTrainCombat = false;
        bot.state = 'patrol';
        const poiFallback = this.getPoitarget(bot, 'safe');
        if (poiFallback) {
            this.setPatrolTarget(bot, poiFallback);
        } else {
            this.setRandomPatrolTarget(bot, 18, 52);
        }
    }

    executeState(bot, entityManager, lootManager, delta = 0.016) {
        if (bot.state === 'trainCombat') {
            this.handleTrainCombat(bot, entityManager, delta);
            return;
        }

        if (bot.state === 'hunt') {
            this.handleHunt(bot, entityManager);
            return;
        }

        if (bot.state === 'explore' && bot.lootTarget) {
            this.handleLoot(bot, lootManager);
            return;
        }

        this.handlePatrol(bot);
    }

    handleHunt(bot, entityManager) {
        const target = bot.target;
        if (!target?.isAlive) {
            bot.target = null;
            bot.state = 'patrol';
            this.setSpreadPatrolTarget(bot, 18, 44);
            return;
        }

        const attackers = this.countAttackersForTarget(bot, target, entityManager);
        const targetType = target.constructor?.name;
        const maxAttackers = targetType === 'Player' ? 2 : (targetType === 'Zombie' ? 3 : 1);
        if (attackers > maxAttackers) {
            bot.target = null;
            bot.state = 'patrol';
            this.setSpreadPatrolTarget(bot, 16, 40);
            return;
        }

        const dist = bot.position.distanceTo(target.position);
        const attackRange = bot.currentWeapon
            ? Math.max(2.2, (bot.currentWeapon.range || 3) * 0.84)
            : 2.1;

        bot.lookAt(target.position);
        if (dist <= attackRange) {
            if (this.attackCooldown <= 0) {
                bot.attack(target, entityManager);
                this.attackCooldown = (bot.currentWeapon?.cooldown || 1) * 0.78;
            }
            return;
        }

        this.setPatrolTarget(bot, target.position);
        bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.08);
    }

    handleLoot(bot, lootManager) {
        const chest = bot.lootTarget;
        if (!chest || chest.userData?.isOpen) {
            bot.lootTarget = null;
            bot.state = 'patrol';
            this.setSpreadPatrolTarget(bot, 16, 40);
            return;
        }

        const approach = this.getLootApproachTarget(bot, chest.position) || chest.position;
        this.setPatrolTarget(bot, approach);
        this.updateRouteFinal(bot);

        const dist = bot.position.distanceTo(bot.patrolTarget);
        if (dist > 2.8) {
            if (bot.isStuck) {
                const newApproach = this.getLootApproachTarget(bot, chest.position);
                if (newApproach) {
                    this.setPatrolTarget(bot, newApproach);
                } else {
                    this.setSpreadPatrolTarget(bot, 12, 34);
                }
            }
            bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.03);
            return;
        }

        if (this.lootCooldown <= 0) {
            const loot = lootManager.tryOpenChest(chest, bot);
            if (loot && bot.pickupLoot) bot.pickupLoot(loot);
            this.lootCooldown = 0.9 + Math.random() * 0.8;
        }
        bot.lootTarget = null;
        bot.state = 'patrol';
        this.setSpreadPatrolTarget(bot, 18, 42);
    }

    handleTrainCombat(bot, entityManager, delta = 0.016) {
        bot.trainCombatTimer = Math.max(0, (bot.trainCombatTimer || 0) - delta);
        bot.ignoreTrainAvoidance = true;

        const trainEnemy = this.findBestEnemy(bot, entityManager, 34, this.getBotGearScore(bot));
        if (trainEnemy) {
            bot.target = trainEnemy;
            this.handleHunt(bot, entityManager);
            return;
        }

        if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 3.2 || bot.trainCombatTimer <= 0) {
            const nextPoint = this.getTrainCombatTarget(bot);
            if (nextPoint) {
                this.setPatrolTarget(bot, nextPoint);
                bot.trainCombatTimer = 7 + Math.random() * 6;
            } else {
                bot.state = 'patrol';
                bot.preferTrainCombat = false;
                bot.ignoreTrainAvoidance = false;
                this.setSpreadPatrolTarget(bot, 20, 50);
                return;
            }
        }
        this.updateRouteFinal(bot);
        bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.08);
    }

    handlePatrol(bot) {
        const crowdNearTarget = bot.patrolTarget ? this.countBotsNearPoint(bot, bot.patrolTarget, 8.4) : 0;
        if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 4.2 || this.repathCooldown <= 0 || crowdNearTarget >= 3) {
            const poi = this.getPoitarget(bot, 'safe');
            if (poi) {
                this.setPatrolTarget(bot, poi);
            } else {
                this.setSpreadPatrolTarget(bot, 18, 52);
            }
            this.repathCooldown = 1.2 + Math.random() * 1.1;
        }

        if (bot.mapRef?.isWalkableAt && !bot.mapRef.isWalkableAt(bot.patrolTarget.x, bot.patrolTarget.z)) {
            this.setSpreadPatrolTarget(bot, 18, 52);
        }

        if (bot.isStuck && this.tryGuardPointRecovery(bot)) {
            this.repathCooldown = 0.9;
        } else if (bot.isStuck) {
            this.setSpreadPatrolTarget(bot, 20, 58);
        }

        this.updateRouteFinal(bot);
        bot.moveTowards(bot.patrolTarget, bot.physics.speed);
    }

    getPoitarget(bot, mode = 'safe') {
        const map = bot?.mapRef;
        if (!map) return null;
        const houses = map.getHouseSpots?.() || [];
        const hangars = map.getHangarSpots?.() || [];
        const points = [
            ...houses.map((s) => ({ x: s.x, z: s.z, type: 'house', width: s.width || 9, depth: s.depth || 8 })),
            ...hangars.map((s) => ({ x: s.x, z: s.z, type: 'hangar', width: s.width || 58, depth: s.depth || 36 }))
        ];
        if (!points.length) return null;

        const zoneRadius = bot.zoneRef?.getCurrentRadius?.() || (map.size ? map.size * 0.5 : 220);
        let best = null;
        let bestScore = Infinity;
        for (const p of points) {
            const dist = Math.hypot(bot.position.x - p.x, bot.position.z - p.z);
            if (dist < 6) continue;
            if (Math.hypot(p.x, p.z) > zoneRadius * 0.88) continue;
            const crowd = this.countBotsNearPoint(bot, p, p.type === 'hangar' ? 18 : 11);
            if (crowd >= (p.type === 'hangar' ? 5 : 3)) continue;
            const lootBias = mode === 'loot' ? (p.type === 'hangar' ? -10 : -4) : 0;
            const score = dist + crowd * 16 + lootBias;
            if (score < bestScore) {
                bestScore = score;
                best = p;
            }
        }
        if (!best) return null;
        const entry = map.getStructureEntryPoint?.(best, best.type, bot.position);
        if (entry) return new THREE.Vector3(entry.x, 0, entry.z);
        return new THREE.Vector3(best.x, 0, best.z);
    }

    findBestEnemy(bot, entityManager, range = 36, gearScore = 0.5) {
        const nearby = entityManager.getNearbyEntities
            ? entityManager.getNearbyEntities(bot.position, range)
            : (entityManager.getEntities?.() || []);

        let best = null;
        let bestScore = -Infinity;
        for (const ent of nearby) {
            if (!ent || ent === bot || !ent.isAlive) continue;
            const type = ent.constructor?.name;
            const isBot = type === 'Bot';
            const isPlayer = type === 'Player';
            const isZombie = type === 'Zombie';
            if (!isBot && !isPlayer && !isZombie) continue;
            if (!isZombie && bot.noCombatUntil && performance.now() < bot.noCombatUntil) continue;

            const dist = bot.position.distanceTo(ent.position);
            if (dist > range) continue;

            const attackers = this.countAttackersForTarget(bot, ent, entityManager);
            const limit = type === 'Player' ? 2 : (type === 'Zombie' ? 3 : 1);
            if (attackers > limit) continue;

            let score = 100 - dist * 2.05;
            if (isPlayer) score += (gearScore > 0.65 ? 24 : 12);
            if (isZombie) score += (dist < 12 ? 16 : -8);
            if (!isZombie && !ent.currentWeapon) score += 7;
            if (ent.health < 45) score += 12;
            if (this.getZonePressure(bot) > 0.72) score -= 16;
            score -= attackers * 20;

            if (score > bestScore) {
                bestScore = score;
                best = ent;
            }
        }
        return best;
    }

    findBestChest(bot, lootManager, maxRange = 80) {
        const chests = lootManager?.getNearbyChests
            ? lootManager.getNearbyChests(bot.position, maxRange, true)
            : (lootManager?.getChests?.() || []);
        let best = null;
        let bestScore = Infinity;

        for (const chest of chests) {
            if (!chest || chest.userData?.isOpen) continue;

            const dist = bot.position.distanceTo(chest.position);
            if (dist > maxRange) continue;

            const crowdTarget = this.countBotsTargetingPoint(bot, chest.position, 10);
            const crowdNear = this.countBotsNearPoint(bot, chest.position, 8);
            if (crowdTarget >= 1 || crowdNear >= 2) continue;

            const grade = chest.userData?.grade || 'house';
            const gradeBonus = grade === 'hangar' ? -8 : 0;
            const score = dist + crowdTarget * 24 + crowdNear * 15 + gradeBonus;
            if (score < bestScore) {
                bestScore = score;
                best = chest;
            }
        }

        return best;
    }

    setPatrolTarget(bot, targetPosition) {
        if (!targetPosition) return;
        const target = new THREE.Vector3(targetPosition.x, 0, targetPosition.z);
        bot.routeFinalTarget = null;

        const map = bot.mapRef;
        if (!map) {
            bot.patrolTarget = target;
            return;
        }

        const info = map.getStructureAtPoint?.(target.x, target.z, 0.35);
        if (!info) {
            bot.patrolTarget = target;
            return;
        }

        const inside = map.isPointInsideStructure?.(
            bot.position.x, bot.position.z, info.structure, info.type, 0.25
        );
        if (inside) {
            bot.patrolTarget = target;
            return;
        }

        const entry = map.getStructureEntryPoint?.(info.structure, info.type, bot.position);
        if (entry) {
            bot.patrolTarget = new THREE.Vector3(entry.x, 0, entry.z);
            bot.routeFinalTarget = target;
            return;
        }

        bot.patrolTarget = target;
    }

    updateRouteFinal(bot) {
        if (!bot.routeFinalTarget || !bot.patrolTarget) return;
        if (bot.position.distanceTo(bot.patrolTarget) > 2.6) return;
        bot.patrolTarget.set(bot.routeFinalTarget.x, bot.routeFinalTarget.y || 0, bot.routeFinalTarget.z);
        bot.routeFinalTarget = null;
    }

    getLootApproachTarget(bot, chestPosition) {
        const map = bot.mapRef;
        if (!map || !chestPosition) return null;
        const info = map.getStructureAtPoint?.(chestPosition.x, chestPosition.z, 0.35);
        if (!info) return new THREE.Vector3(chestPosition.x, 0, chestPosition.z);

        const inside = map.isPointInsideStructure?.(bot.position.x, bot.position.z, info.structure, info.type, 0.25);
        if (inside) return new THREE.Vector3(chestPosition.x, 0, chestPosition.z);

        const entry = map.getStructureEntryPoint?.(info.structure, info.type, bot.position);
        if (entry) return new THREE.Vector3(entry.x, 0, entry.z);

        return new THREE.Vector3(chestPosition.x, 0, chestPosition.z);
    }

    setRandomPatrolTarget(bot, minDist = 14, maxDist = 40) {
        const map = bot.mapRef;
        const tiles = map?.getFloorTiles?.() || [];
        if (!tiles.length) {
            const angle = Math.random() * Math.PI * 2;
            const d = minDist + Math.random() * (maxDist - minDist);
            bot.patrolTarget = new THREE.Vector3(
                bot.position.x + Math.cos(angle) * d,
                0,
                bot.position.z + Math.sin(angle) * d
            );
            return;
        }

        const zoneRadius = bot.zoneRef?.getCurrentRadius?.() || (map?.halfSize ? map.halfSize * 0.9 : 120);
        const safeRadius = Math.max(20, zoneRadius * 0.82);

        let best = null;
        let bestScore = Infinity;
        for (let i = 0; i < 12; i++) {
            const t = tiles[Math.floor(Math.random() * tiles.length)];
            const dx = t.x - bot.position.x;
            const dz = t.z - bot.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist < minDist || dist > maxDist) continue;
            if (Math.hypot(t.x, t.z) > safeRadius) continue;
            if (map.isWalkableAt && !map.isWalkableAt(t.x, t.z)) continue;
            if (map.isNearRailCorridor?.(t.x, t.z, 1.0)) continue;

            const crowd = this.countBotsNearPoint(bot, t, 9);
            const spreadAngle = ((bot.id * 0.61803398875 + this.roleBias) % 1) * Math.PI * 2;
            const a = Math.atan2(dz, dx);
            const ad = Math.abs(Math.atan2(Math.sin(a - spreadAngle), Math.cos(a - spreadAngle)));
            const score = Math.abs(dist - (minDist + maxDist) * 0.5) + crowd * 12 + ad * 2.4;
            if (score < bestScore) {
                bestScore = score;
                best = t;
            }
        }

        if (best) {
            bot.patrolTarget = new THREE.Vector3(best.x, 0, best.z);
            return;
        }

        bot.patrolTarget = new THREE.Vector3(bot.position.x, 0, bot.position.z);
    }

    setSpreadPatrolTarget(bot, minDist = 20, maxDist = 58) {
        const preferredAngle = ((bot.id * 0.61803398875 + this.roleBias) % 1) * Math.PI * 2;
        const targetDist = minDist + Math.random() * Math.max(1, (maxDist - minDist));
        const angleJitter = (Math.random() - 0.5) * 1.6;
        const candidate = this._tmpPatrolVec.set(
            bot.position.x + Math.cos(preferredAngle + angleJitter) * targetDist,
            0,
            bot.position.z + Math.sin(preferredAngle + angleJitter) * targetDist
        );

        if (bot.mapRef?.isWalkableAt && bot.mapRef.isWalkableAt(candidate.x, candidate.z)) {
            this.setPatrolTarget(bot, candidate);
            return;
        }
        this.setRandomPatrolTarget(bot, minDist, maxDist);
    }

    tryGuardPointRecovery(bot) {
        const map = bot?.mapRef;
        if (!map?.getStructureAtPoint) return false;

        const target = bot.routeFinalTarget || bot.patrolTarget;
        if (!target) return false;

        const info = map.getStructureAtPoint(target.x, target.z, 0.45);
        if (!info) return false;

        const guard = map.findStructureGuardPoint?.(info.structure, info.type);
        if (guard) {
            this.setPatrolTarget(bot, new THREE.Vector3(guard.x, 0, guard.z));
            return true;
        }

        const entry = map.getStructureEntryPoint?.(info.structure, info.type, bot.position);
        if (entry) {
            this.setPatrolTarget(bot, new THREE.Vector3(entry.x, 0, entry.z));
            return true;
        }
        return false;
    }

    getBotGearScore(bot) {
        let score = 0;
        const weaponType = bot.currentWeapon?.type || 'fists';
        if (weaponType === 'fists') score += 0.04;
        else if (weaponType === 'knife') score += 0.2;
        else if (weaponType === 'bow') score += 0.42;
        else if (weaponType === 'shotgun') score += 0.65;
        else if (weaponType === 'flamethrower') score += 0.7;
        else if (weaponType === 'laser') score += 0.82;
        else if (weaponType === 'pistol') score += 0.58;
        else if (weaponType === 'rifle') score += 0.76;
        score += Math.min(0.24, Math.max(0, (bot.armor || 0) / (bot.maxArmor || 100)) * 0.24);
        score += Math.min(0.2, Math.max(0, bot.health / Math.max(1, bot.maxHealth)) * 0.2);
        return Math.min(1, Math.max(0, score));
    }

    countNearbyZombies(bot, entityManager, range = 10) {
        const near = entityManager.getNearbyEntities
            ? entityManager.getNearbyEntities(bot.position, range)
            : (entityManager.getEntities?.() || []);
        let c = 0;
        for (const e of near) {
            if (!e?.isAlive) continue;
            if (e.constructor?.name === 'Zombie') c++;
        }
        return c;
    }

    findClosestZombie(bot, entityManager, range = 12) {
        const near = entityManager.getNearbyEntities
            ? entityManager.getNearbyEntities(bot.position, range)
            : (entityManager.getEntities?.() || []);
        let best = null;
        let bestD = range;
        for (const e of near) {
            if (!e?.isAlive || e.constructor?.name !== 'Zombie') continue;
            const d = bot.position.distanceTo(e.position);
            if (d < bestD) {
                bestD = d;
                best = e;
            }
        }
        return best;
    }

    shouldDoTrainCombat(bot) {
        if (!bot?.mapRef?.getRailLayout) return false;
        if (bot.forceShelterActive) return false;
        const rail = bot.mapRef.getRailLayout() || [];
        if (!rail.length) return false;
        return bot.preferTrainCombat || Math.random() < 0.28;
    }

    getTrainCombatTarget(bot) {
        const map = bot?.mapRef;
        if (!map?.getRailLayout) return null;
        const rails = map.getRailLayout() || [];
        if (!rails.length) return null;
        let best = null;
        let bestScore = Infinity;
        const half = Math.max(40, (map.size || 240) * 0.42);
        for (const r of rails) {
            const along = (Math.random() * 2 - 1) * half;
            const cx = r.axis === 'x' ? along : r.offset;
            const cz = r.axis === 'x' ? r.offset : along;
            const dx = bot.position.x - cx;
            const dz = bot.position.z - cz;
            const d = Math.hypot(dx, dz);
            if (d < 7) continue;
            const crowd = this.countBotsNearPoint(bot, { x: cx, z: cz }, 9);
            const score = d + crowd * 18;
            if (score < bestScore) {
                bestScore = score;
                best = { axis: r.axis, x: cx, z: cz };
            }
        }
        if (!best) return null;
        const side = Math.random() < 0.5 ? -1 : 1;
        const offset = 1.9 + Math.random() * 0.8;
        if (best.axis === 'x') {
            return new THREE.Vector3(best.x, 0, best.z + side * offset);
        }
        return new THREE.Vector3(best.x + side * offset, 0, best.z);
    }

    countAttackersForTarget(bot, target, entityManager) {
        if (!target || !entityManager) return 0;
        const nearby = entityManager.getNearbyEntities
            ? entityManager.getNearbyEntities(target.position, 24, 'Bot')
            : (this.getBotList(bot) || []);
        let count = 0;
        for (const ent of nearby) {
            if (!ent || ent === bot || !ent.isAlive) continue;
            if (ent.target !== target) continue;
            if (ent.state === 'hunt' || ent.state === 'trainCombat') {
                count += 1;
            } else {
                count += 0.5;
            }
        }
        return count;
    }

    getBotList(bot) {
        const manager = bot.entityManagerRef;
        if (!manager) return [];
        return manager.entities || [];
    }

    countBotsNearPoint(bot, point, radius = 8) {
        if (!point) return 0;
        let count = 0;
        const manager = bot.entityManagerRef;
        const list = manager?.getNearbyEntities
            ? manager.getNearbyEntities(point, radius + 1.2, 'Bot')
            : this.getBotList(bot);
        const radiusSq = radius * radius;
        for (const e of list) {
            if (e === bot || !e.isAlive) continue;
            if (e.constructor?.name !== 'Bot') continue;
            const dx = e.position.x - point.x;
            const dz = e.position.z - point.z;
            if (dx * dx + dz * dz <= radiusSq) count++;
        }
        return count;
    }

    countBotsTargetingPoint(bot, point, radius = 10) {
        if (!point) return 0;
        let count = 0;
        const manager = bot.entityManagerRef;
        const list = manager?.getNearbyEntities
            ? manager.getNearbyEntities(point, radius + 6, 'Bot')
            : this.getBotList(bot);
        const radiusSq = radius * radius;
        for (const e of list) {
            if (e === bot || !e.isAlive) continue;
            if (e.constructor?.name !== 'Bot') continue;
            const t = e.patrolTarget || e.target?.position;
            if (!t) continue;
            const dx = t.x - point.x;
            const dz = t.z - point.z;
            if (dx * dx + dz * dz <= radiusSq) count++;
        }
        return count;
    }

    getZonePressure(bot) {
        const zone = bot.zoneRef;
        if (!zone?.getCurrentRadius) return 0;
        const radius = zone.getCurrentRadius();
        if (radius <= 0.001) return 0;
        return Math.hypot(bot.position.x, bot.position.z) / radius;
    }

    getInwardTarget(bot, distance = 26) {
        const dir = this._tmpInward.set(-bot.position.x, 0, -bot.position.z);
        if (dir.lengthSq() < 0.001) {
            dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        }
        dir.normalize();
        return {
            x: bot.position.x + dir.x * distance,
            y: bot.position.y,
            z: bot.position.z + dir.z * distance
        };
    }
}

