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

        this.executeState(bot, entityManager, lootManager);
    }

    makeDecision(bot, entityManager, lootManager) {
        const lowHealth = bot.health / bot.maxHealth < 0.52;
        const lowResources = !bot.currentWeapon || lowHealth;
        const localCrowd = this.countBotsNearPoint(bot, bot.position, 7);

        const enemy = this.findBestEnemy(bot, entityManager, lowResources ? 34 : 46);
        const chest = this.findBestChest(bot, lootManager, lowResources ? 92 : 72);

        // If crowd is high, disperse first.
        if (localCrowd >= 3 && Math.random() < 0.62) {
            bot.target = null;
            bot.lootTarget = null;
            bot.state = 'patrol';
            this.setRandomPatrolTarget(bot, 16, 44);
            return;
        }

        // Combat decision.
        if (enemy && (bot.currentWeapon || bot.fists)) {
            const dist = bot.position.distanceTo(enemy.position);
            const enemyType = enemy.constructor?.name;
            const isZombie = enemyType === 'Zombie';
            const prefersFight = !lowResources || dist < 6 || enemyType === 'Player' || isZombie;
            const forceFight = isZombie && dist < 12;
            if (forceFight || (prefersFight && Math.random() < (this.aggression + 0.18))) {
                bot.target = enemy;
                bot.lootTarget = null;
                bot.state = 'hunt';
                return;
            }
        }

        // Loot decision.
        if (chest && (lowResources || Math.random() < this.lootBias)) {
            bot.target = null;
            bot.lootTarget = chest;
            bot.state = 'explore';
            const approach = this.getLootApproachTarget(bot, chest.position);
            this.setPatrolTarget(bot, approach || chest.position);
            return;
        }

        // Patrol fallback.
        bot.target = null;
        bot.lootTarget = null;
        bot.state = 'patrol';
        this.setRandomPatrolTarget(bot, 16, 46);
    }

    executeState(bot, entityManager, lootManager) {
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
            this.setRandomPatrolTarget(bot, 14, 36);
            return;
        }

        const attackers = this.countAttackersForTarget(bot, target, entityManager);
        const targetType = target.constructor?.name;
        const maxAttackers = targetType === 'Player' ? 2 : (targetType === 'Zombie' ? 3 : 1);
        if (attackers > maxAttackers) {
            bot.target = null;
            bot.state = 'patrol';
            this.setRandomPatrolTarget(bot, 14, 34);
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
            this.setRandomPatrolTarget(bot, 14, 34);
            return;
        }

        const approach = this.getLootApproachTarget(bot, chest.position) || chest.position;
        this.setPatrolTarget(bot, approach);
        this.updateRouteFinal(bot);

        const dist = bot.position.distanceTo(bot.patrolTarget);
        if (dist > 2.8) {
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
        this.setRandomPatrolTarget(bot, 16, 40);
    }

    handlePatrol(bot) {
        if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 4.2 || this.repathCooldown <= 0) {
            this.setRandomPatrolTarget(bot, 15, 42);
            this.repathCooldown = 1.2 + Math.random() * 1.1;
        }

        if (bot.mapRef?.isWalkableAt && !bot.mapRef.isWalkableAt(bot.patrolTarget.x, bot.patrolTarget.z)) {
            this.setRandomPatrolTarget(bot, 16, 44);
        }

        this.updateRouteFinal(bot);
        bot.moveTowards(bot.patrolTarget, bot.physics.speed);
    }

    findBestEnemy(bot, entityManager, range = 36) {
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

            let score = 100 - dist * 2.1;
            if (isPlayer) score += 16;
            if (isZombie) score += 10;
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
            if (crowdTarget >= 2 || crowdNear >= 3) continue;

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

