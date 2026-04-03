import * as THREE from 'three';
import { UtilityAI } from './UtilityAI.js';

/**
 * РЈРњРќР«Р™ AI Р”Р›РЇ Р‘РћРўРћР’ - Р’РµСЂСЃРёСЏ 2.0
 * Р‘РѕС‚С‹ С‚РµРїРµСЂСЊ:
 * - РђРЅР°Р»РёР·РёСЂСѓСЋС‚ СЃРёС‚СѓР°С†РёСЋ Рё СѓРіСЂРѕР·С‹
 * - Р¤РѕСЂРјРёСЂСѓСЋС‚ Рё РїСЂРµРґР°СЋС‚ СЃРѕСЋР·С‹ СЃС‚СЂР°С‚РµРіРёС‡РµСЃРєРё
 * - РСЃРїРѕР»СЊР·СѓСЋС‚ СѓРєСЂС‹С‚РёСЏ Рё С‚Р°РєС‚РёРєСѓ
 * - Р—Р°РїРѕРјРёРЅР°СЋС‚ РѕРїР°СЃРЅС‹Рµ Р·РѕРЅС‹
 * - РђРґР°РїС‚РёСЂСѓСЋС‚ СЃС‚СЂР°С‚РµРіРёСЋ РґРёРЅР°РјРёС‡РµСЃРєРё
 */
export class BotBrain {
    constructor() {
        // Р‘Р°Р·РѕРІС‹Рµ РїР°СЂР°РјРµС‚СЂС‹
        this.decisionCooldown = 0;
        this.attackCooldown = 0;
        this.lastChestCheck = 0;
        this.perceptionCooldown = 0.2 + Math.random() * 0.25;
        this.memoryCleanupCooldown = 1.2 + Math.random() * 0.7;
        
        // РџРµСЂСЃРѕРЅР°Р»РёР·Р°С†РёСЏ - РєР°Р¶РґС‹Р№ Р±РѕС‚ СѓРЅРёРєР°Р»РµРЅ
        this.personality = {
            aggression: 0.68 + Math.random() * 0.32, // РђРіСЂРµСЃСЃРёРІРЅРѕСЃС‚СЊ (0-1)
            intelligence: 0.5 + Math.random() * 0.5, // РРЅС‚РµР»Р»РµРєС‚ (0.5-1)
            courage: 0.58 + Math.random() * 0.42, // РҐСЂР°Р±СЂРѕСЃС‚СЊ (0-1)
            loyalty: 0.2 + Math.random() * 0.8, // Р›РѕСЏР»СЊРЅРѕСЃС‚СЊ (0.2-1)
            greed: 0.3 + Math.random() * 0.7, // Р–Р°РґРЅРѕСЃС‚СЊ (0-1)
            teamwork: 0.2 + Math.random() * 0.8, // РљРѕРјР°РЅРґРЅР°СЏ СЂР°Р±РѕС‚Р° (0-1)
            sneakiness: 0.3 + Math.random() * 0.7, // РЎРєСЂС‹С‚РЅРѕСЃС‚СЊ (0-1)
            adaptability: 0.6 + Math.random() * 0.4 // РђРґР°РїС‚РёРІРЅРѕСЃС‚СЊ (0.6-1)
        };
        
        // Р Р°СЃС€РёСЂРµРЅРЅР°СЏ РїР°РјСЏС‚СЊ
        this.memory = {
            lastSeenEnemies: {},  // id -> {position, lastSeen, health, weapon, threat}
            knownChests: [],      // [{position, isOpen, priority}]
            dangerousAreas: [],   // [{position, dangerLevel, lastUpdate}]
            kills: 0,             // РЈР±РёР№СЃС‚РІР°
            damageDealt: 0,       // РќР°РЅРµСЃРµРЅРЅС‹Р№ СѓСЂРѕРЅ
            damageTaken: 0,       // РџРѕР»СѓС‡РµРЅРЅС‹Р№ СѓСЂРѕРЅ
            lastAttacker: null    // РџРѕСЃР»РµРґРЅРёР№ Р°С‚Р°РєСѓСЋС‰РёР№
        };
        
        // РЎС‚СЂР°С‚РµРіРёСЏ
        this.strategy = this.chooseInitialStrategy();
        this.stateTimer = 0;
        this.currentPriority = 'survive'; // survive, loot, hunt, regroup
        this.visionMultiplier = 1;
        this.poiRetargetCooldown = 0;
        this.combatProfileRoll = Math.random();
        this.prefersTrainCombat = this.combatProfileRoll < 0.24;
        this.prefersHangarLoot = this.combatProfileRoll >= 0.24 && this.combatProfileRoll < 0.74;
        this.trainLockTimer = 0;
        this.trainBoardCooldown = 0;
        this.utilityAI = new UtilityAI();
        this.lastUtilityDecision = null;
        this.independentMode = true;
        this.simpleMode = true;
        this.scanCooldown = 0;
        this.lootingCooldown = 0;
        this.simpleTarget = null;
        this.botListCache = null;
        this.botListCacheExpire = 0;
        this.botListCacheManager = null;
    }
    
    chooseInitialStrategy() {
        const p = this.personality;
        if (p.aggression > 0.7 && p.courage > 0.6) return 'aggressive';
        if (p.sneakiness > 0.7) return 'stealthy';
        if (p.teamwork > 0.6) return 'cooperative';
        if (p.intelligence > 0.8) return 'tactical';
        return 'balanced';
    }

    update(bot, delta, entityManager, lootManager, audioSynth) {
        if (!bot.isAlive) return;
        if (this.simpleMode) {
            this.updateSimple(bot, delta, entityManager, lootManager);
            return;
        }
        if (this.independentMode) {
            bot.allies = [];
            bot.assistTarget = null;
        }
        
        this.decisionCooldown -= delta;
        this.attackCooldown -= delta;
        this.perceptionCooldown -= delta;
        this.memoryCleanupCooldown -= delta;
        this.stateTimer -= delta;
        this.poiRetargetCooldown -= delta;
        this.trainLockTimer = Math.max(0, this.trainLockTimer - delta);
        this.trainBoardCooldown = Math.max(0, this.trainBoardCooldown - delta);
        bot.preferTrainCombat = this.prefersTrainCombat;
        bot.ignoreTrainAvoidance = this.prefersTrainCombat && this.trainLockTimer > 0;
        
        // 1. Р’РѕСЃРїСЂРёСЏС‚РёРµ
        if (this.perceptionCooldown <= 0) {
            this.updatePerception(bot, entityManager, lootManager);
            this.perceptionCooldown = Math.max(0.45, 0.9 - this.personality.intelligence * 0.2);
        }
        
        // 2. РћС†РµРЅРєР° СѓРіСЂРѕР·С‹
        const threatLevel = this.assessThreatLevel(bot, entityManager);
        
        // 3. UtilityAI выбирает ключевое действие
        if (this.decisionCooldown <= 0) {
            this.makeSmartDecision(bot, entityManager, lootManager, threatLevel);
            this.decisionCooldown = Math.max(0.35, 0.7 - this.personality.intelligence * 0.2);
        }

        if (this.prefersTrainCombat) {
            this.tryAcquireTrainCombat(bot, entityManager);
        }

        // 5. Rail awareness before movement state execution
        const avoidedTrain = this.avoidActiveTrain(bot);

        // 6. Р’С‹РїРѕР»РЅРµРЅРёРµ СЃРѕСЃС‚РѕСЏРЅРёСЏ
        if (!avoidedTrain) {
            this.executeState(bot, delta, entityManager, lootManager, audioSynth, threatLevel);
        }
        
        // 7. РћР±РЅРѕРІР»РµРЅРёРµ РїР°РјСЏС‚Рё
        if (this.memoryCleanupCooldown <= 0) {
            this.updateMemory(bot, entityManager);
            this.memoryCleanupCooldown = 1.1 + Math.random() * 0.7;
        }
        
        // 8. РЈРїСЂР°РІР»РµРЅРёРµ СЃРѕСЋР·Р°РјРё
        if (!this.independentMode) {
            this.manageAlliances(bot, delta);
        }
    }

    // ===== Р’РћРЎРџР РРЇРўРР• =====
    updatePerception(bot, entityManager, lootManager) {
        const visionRange = (60 + this.personality.intelligence * 40) * (this.visionMultiplier || 1); // 50-80 РјРµС‚СЂРѕРІ
        const entities = entityManager.getNearbyEntities
            ? entityManager.getNearbyEntities(bot.position, visionRange)
            : entityManager.getEntities();
        const maxTracked = 22;
        let tracked = 0;
        let losBudget = 7;
        const botHead = new THREE.Vector3(
            bot.position.x,
            bot.position.y + (bot.physics?.height || 1.8) * 0.55,
            bot.position.z
        );

        for (const entity of entities) {
            if (entity === bot || !entity.isAlive) continue;
            
            const distance = bot.position.distanceTo(entity.position);
            
            let effectiveRange = visionRange;
            if (entity.isSilent) {
                effectiveRange *= 0.7;
            }
            if (distance < effectiveRange) {
                const isAlly = bot.allies && bot.allies.includes(entity);
                
                if (!isAlly) {
                    if (typeof entityManager.hasLineOfSight === 'function') {
                        if (distance > 8 && losBudget > 0) {
                            const targetHead = new THREE.Vector3(
                                entity.position.x,
                                entity.position.y + (entity.physics?.height || 1.8) * 0.55,
                                entity.position.z
                            );
                            const visible = entityManager.hasLineOfSight(botHead, targetHead, true);
                            losBudget--;
                            if (!visible) {
                                continue;
                            }
                        }
                    }
                    // Р—Р°РїРѕРјРёРЅР°РµРј РІСЂР°РіР°
                    const threatScore = this.calculateThreatScore(bot, entity, distance);
                    
                    this.memory.lastSeenEnemies[entity.id] = {
                        position: entity.position.clone(),
                        lastSeen: performance.now(),
                        health: entity.health,
                        hasWeapon: !!entity.currentWeapon,
                        weaponType: entity.currentWeapon?.type,
                        isPlayer: entity.constructor.name === 'Player',
                        threat: threatScore,
                        distance: distance
                    };
                    tracked++;
                    if (tracked >= maxTracked) {
                        break;
                    }
                }
            }
        }
        
        // РћС‡РёСЃС‚РєР° СЃС‚Р°СЂС‹С… РґР°РЅРЅС‹С… (>15 СЃРµРє)
        const now = performance.now();
        for (const id in this.memory.lastSeenEnemies) {
            if (now - this.memory.lastSeenEnemies[id].lastSeen > 15000) {
                delete this.memory.lastSeenEnemies[id];
            }
        }
    }

    calculateThreatScore(bot, enemy, distance) {
        let threat = 0;
        
        // Р‘Р»РёР·РѕСЃС‚СЊ = РѕРїР°СЃРЅРѕСЃС‚СЊ
        threat += (50 - distance) / 50 * 30; // РњР°РєСЃ 30 Р·Р° Р±Р»РёР·РѕСЃС‚СЊ
        
        // Р—РґРѕСЂРѕРІСЊРµ РІСЂР°РіР°
        threat += (enemy.health / 100) * 20; // РњР°РєСЃ 20
        
        // РћСЂСѓР¶РёРµ
        if (enemy.currentWeapon) {
            const weaponDamage = enemy.currentWeapon.damage || 10;
            threat += weaponDamage / 2; // РЈСЂРѕРЅ РѕСЂСѓР¶РёСЏ
        }
        
        // РРіСЂРѕРє РѕРїР°СЃРЅРµРµ Р±РѕС‚Р°
        if (enemy.constructor.name === 'Player') {
            threat += 25;
        }
        
        // Р‘СЂРѕРЅСЏ РІСЂР°РіР°
        if (enemy.armor > 0) {
            threat += enemy.armor / 10;
        }
        
        return Math.min(100, threat); // РњР°РєСЃ СѓРіСЂРѕР·Р° = 100
    }

    // ===== РћР¦Р•РќРљРђ РЈР“Р РћР—Р« =====
    assessThreatLevel(bot, entityManager) {
        const enemies = Object.values(this.memory.lastSeenEnemies);
        
        if (enemies.length === 0) return 'none';
        
        // РЎС‡РёС‚Р°РµРј СЃСЂРµРґРЅСЋСЋ СѓРіСЂРѕР·Сѓ
        const avgThreat = enemies.reduce((sum, e) => sum + e.threat, 0) / enemies.length;
        
        // Р‘Р»РёР·РєРёРµ РІСЂР°РіРё РѕРїР°СЃРЅРµРµ
        const closeEnemies = enemies.filter(e => e.distance < 20).length;
        
        if (closeEnemies >= 2 || avgThreat > 70) return 'critical';
        if (closeEnemies >= 1 || avgThreat > 50) return 'high';
        if (avgThreat > 30) return 'medium';
        return 'low';
    }

    // ===== РЈРњРќРћР• РџР РРќРЇРўРР• Р Р•РЁР•РќРР™ =====
    makeSmartDecision(bot, entityManager, lootManager, threatLevel) {
        const context = this.buildUtilityContext(bot, entityManager, lootManager, threatLevel);
        const decision = this.utilityAI.chooseBestAction(context);
        const localCrowd = this.countBotsNearPoint(bot, bot.position, 8.5);
        if (localCrowd >= 4 && (decision.action === 'attack' || decision.action === 'ambush')) {
            decision.action = context.lowResources ? 'loot' : 'patrol';
        }
        if (this.independentMode && decision.action === 'regroup') {
            decision.action = 'loot';
        }
        this.lastUtilityDecision = decision;
        this.currentPriority = decision.action;

        if ((decision.action === 'attack' || decision.action === 'ambush') && this.prefersTrainCombat) {
            if (this.tryAcquireTrainCombat(bot, entityManager)) {
                return;
            }
        }

        switch (decision.action) {
            case 'run_to_safe_zone':
                this.decideRunToSafeZone(bot);
                break;
            case 'heal':
                this.decideHeal(bot, entityManager, threatLevel);
                break;
            case 'regroup':
                this.decideRegroup(bot, entityManager, lootManager);
                break;
            case 'ambush':
                this.decideAmbushAction(bot, entityManager, lootManager);
                break;
            case 'patrol':
                this.decidePatrolAction(bot, lootManager);
                break;
            case 'attack':
                this.decideHunt(bot, entityManager);
                break;
            case 'loot':
            default:
                this.decideLoot(bot, lootManager, entityManager);
                break;
        }
    }

    buildUtilityContext(bot, entityManager, lootManager, threatLevel) {
        const visibleEnemies = Object.values(this.memory.lastSeenEnemies || {})
            .filter(enemy => enemy && enemy.distance < 60);
        const nearbyEnemies = visibleEnemies.filter(enemy => enemy.distance < 32);
        const nearbyLoot = (lootManager?.getChests?.() || [])
            .filter(chest => chest && !chest.userData?.isOpen)
            .map(chest => ({ chest, distance: bot.position.distanceTo(chest.position) }))
            .filter(entry => entry.distance < 42);

        const closestEnemyDistance = visibleEnemies.length
            ? Math.min(...visibleEnemies.map(enemy => enemy.distance))
            : Infinity;
        const closestLootDistance = nearbyLoot.length
            ? Math.min(...nearbyLoot.map(entry => entry.distance))
            : Infinity;
        const zoneDistance = bot.zoneRef?.getDistanceFromZone?.(bot.position) || 0;
        const allyCandidate = this.independentMode ? null : this.findPotentialAlly(bot, entityManager);
        const trainOpportunity = this.prefersTrainCombat ? this.getTrainCombatOpportunity(bot, entityManager) : null;
        const strategicHangar = this.findStrategicHangarTarget(bot, lootManager);
        const strategicHouse = this.findStrategicHouseTarget(bot, lootManager);
        let poiUrgency = 0;
        if (strategicHangar) {
            poiUrgency = Math.max(poiUrgency, this.getTargetUrgency(bot, strategicHangar, 160, 0.9));
        }
        if (strategicHouse) {
            poiUrgency = Math.max(poiUrgency, this.getTargetUrgency(bot, strategicHouse, 120, 0.7));
        }

        return {
            healthRatio: bot.health / Math.max(1, bot.maxHealth || 100),
            zoneDistance,
            zonePressure: this.getZonePressure(bot),
            outsideZone: zoneDistance > 0.01,
            nearbyEnemiesCount: nearbyEnemies.length,
            closestEnemyDistance,
            closestEnemyDistanceNorm: Math.min(1, closestEnemyDistance / 35),
            nearbyLootCount: nearbyLoot.length,
            closestLootDistance,
            closestLootDistanceNorm: Math.min(1, closestLootDistance / 42),
            hasWeapon: !!(bot.currentWeapon && bot.currentWeapon.type !== 'fists') ? 1 : 0,
            lowResources: this.hasLowCombatResources(bot) ? 1 : 0,
            threatLevel,
            allyCount: this.independentMode ? 0 : (bot.allies?.length || 0),
            allyCandidateNearby: !!allyCandidate,
            teamwork: this.independentMode ? 0 : this.personality.teamwork,
            sneakiness: this.personality.sneakiness,
            courage: this.personality.courage,
            intelligence: this.personality.intelligence,
            hasTrainOpportunity: !!trainOpportunity,
            hasHangarOpportunity: !!strategicHangar,
            hasHouseOpportunity: !!strategicHouse,
            poiUrgency
        };
    }

    getTargetUrgency(bot, target, maxDistance = 120, maxValue = 0.8) {
        if (!target) return 0;
        const dist = bot.position.distanceTo(target);
        if (dist > maxDistance) return 0;
        const normalized = 1 - Math.min(1, dist / maxDistance);
        return normalized * maxValue;
    }

    decideRunToSafeZone(bot) {
        bot.state = 'retreat';
        bot.target = null;
        bot.patrolTarget = this.getInwardTarget(bot, 34);
        this.stateTimer = 3.5;
    }

    decideHeal(bot, entityManager, threatLevel) {
        const nearestEnemy = this.findBestTarget(bot, entityManager);
        if (nearestEnemy && (threatLevel === 'high' || threatLevel === 'critical')) {
            bot.state = 'flee';
            bot.target = nearestEnemy;
            bot.patrolTarget = this.getInwardTarget(bot, 28);
            this.stateTimer = 4.5;
            return;
        }

        bot.state = 'cover';
        bot.target = null;
        bot.patrolTarget = this.getInwardTarget(bot, 20);
        this.stateTimer = 3.2;
    }

    decideAmbushAction(bot, entityManager, lootManager) {
        const enemy = this.findBestTarget(bot, entityManager);
        if (!enemy) {
            this.decidePatrolAction(bot, lootManager);
            return;
        }

        bot.state = 'ambush';
        bot.target = enemy;
        const backDir = new THREE.Vector3().subVectors(bot.position, enemy.position).normalize();
        if (backDir.lengthSq() > 0.0001) {
            bot.patrolTarget = enemy.position.clone().add(backDir.multiplyScalar(8 + Math.random() * 6));
        }
        this.stateTimer = 6.5;
    }

    decidePatrolAction(bot, lootManager) {
        const houseTarget = this.findStrategicHouseTarget(bot, lootManager);
        const hangarTarget = this.findStrategicHangarTarget(bot, lootManager);
        if (hangarTarget && Math.random() < 0.42) {
            bot.state = 'patrol';
            bot.target = null;
            this.setBotPatrolTarget(bot, hangarTarget);
            this.stateTimer = 7.5;
            return;
        }
        if (houseTarget && Math.random() < 0.48) {
            bot.state = 'patrol';
            bot.target = null;
            this.setBotPatrolTarget(bot, houseTarget);
            this.stateTimer = 6.5;
            return;
        }
        bot.state = 'patrol';
        bot.target = null;
        this.setRandomPatrolTarget(bot, 18, 60);
        this.stateTimer = 6;
    }

    decideHunt(bot, entityManager) {
        if (bot.noCombatUntil && performance.now() < bot.noCombatUntil) {
            bot.state = 'explore';
            bot.target = null;
            this.setRandomPatrolTarget(bot, 35, 95);
            this.stateTimer = 4.5;
            return;
        }
        const enemy = this.findBestTarget(bot, entityManager);
        
        if (enemy) {
            if (this.strategy === 'tactical') {
                // РўР°РєС‚РёС‡РµСЃРєР°СЏ Р·Р°СЃР°РґР°
                bot.state = 'ambush';
                bot.target = enemy;
                this.stateTimer = 8;
            } else {
                // РџСЂСЏРјР°СЏ РѕС…РѕС‚Р°
                bot.state = 'hunt';
                bot.target = enemy;
                this.stateTimer = 10;
            }
        } else {
            // РџР°С‚СЂСѓР»РёСЂСѓРµРј РІ РїРѕРёСЃРєР°С…
            bot.state = 'patrol';
            this.stateTimer = 5;
        }
    }

    decideLoot(bot, lootManager, entityManager) {
        const hangarChest = this.findBestHangarChest(bot, lootManager);
        if (hangarChest && (this.prefersHangarLoot || this.hasLowCombatResources(bot))) {
            bot.state = 'explore';
            this.setBotPatrolTarget(bot, this.getLootApproachTarget(bot, hangarChest.position));
            this.stateTimer = 10;
            return;
        }

        const chest = this.findNearestChest(bot, lootManager, 80);
        
        const playerTarget = this.findPreferredPlayerTarget(bot, entityManager);
        if (playerTarget && bot.currentWeapon && this.countAttackersForTarget(bot, playerTarget, entityManager) < 1) {
            bot.state = 'hunt';
            bot.target = playerTarget;
            this.stateTimer = 8;
            return;
        }

        if (chest) {
            bot.state = 'explore';
            this.setBotPatrolTarget(bot, this.getLootApproachTarget(bot, chest.position));
            this.stateTimer = 10;
        } else {
            const hangarTarget = this.findStrategicHangarTarget(bot, lootManager);
            if (hangarTarget) {
                bot.state = 'explore';
                this.setBotPatrolTarget(bot, hangarTarget);
                this.stateTimer = 11;
                return;
            }
            const houseTarget = this.findStrategicHouseTarget(bot, lootManager);
            if (houseTarget) {
                bot.state = 'explore';
                this.setBotPatrolTarget(bot, houseTarget);
                this.stateTimer = 9;
                return;
            }
            // РСЃСЃР»РµРґСѓРµРј РЅРѕРІС‹Рµ РѕР±Р»Р°СЃС‚Рё
            bot.state = 'explore';
            this.setRandomPatrolTarget(bot, 40, 100);
            this.stateTimer = 8;
        }
    }

    decideRegroup(bot, entityManager, lootManager) {
        if (this.independentMode) {
            this.decideLoot(bot, lootManager, entityManager);
            return;
        }
        const ally = this.findPotentialAlly(bot, entityManager);
        
        if (ally) {
            bot.state = 'ally';
            bot.target = ally;
            if (!ally.allies) ally.allies = [];
            if (!ally.allies.includes(bot)) ally.allies.push(bot);
            if (!bot.allies.includes(ally)) bot.allies.push(ally);
            this.stateTimer = 20;
        } else {
            // РС‰РµРј Р»СѓС‚, С‡С‚РѕР±С‹ СЃС‚Р°С‚СЊ СЃРёР»СЊРЅРµРµ
            this.decideLoot(bot, lootManager, entityManager);
        }
    }

    // ===== Р’РЎРџРћРњРћР“РђРўР•Р›Р¬РќР«Р• РњР•РўРћР”Р« =====
    
    findNearestEnemy(bot, maxRange) {
        const enemies = Object.values(this.memory.lastSeenEnemies);
        if (enemies.length === 0) return null;
        
        let nearest = null;
        let minDist = maxRange;
        
        for (const enemy of enemies) {
            if (enemy.distance < minDist) {
                minDist = enemy.distance;
                nearest = enemy;
            }
        }
        
        return nearest;
    }

    findBestTarget(bot, entityManager) {
        if (bot.noCombatUntil && performance.now() < bot.noCombatUntil) {
            return null;
        }
        const enemies = Object.values(this.memory.lastSeenEnemies);
        if (enemies.length === 0) return null;
        
        // РЈРјРЅС‹Р№ РІС‹Р±РѕСЂ С†РµР»Рё
        let bestTarget = null;
        let bestScore = -1;
        for (const enemyData of enemies) {
            const entity = entityManager.getEntityById(enemyData.id);
            if (!entity || !entity.isAlive) continue;
            const attackers = this.countAttackersForTarget(bot, entity, entityManager);
            const attackerLimit = entity?.constructor?.name === 'Player' ? 2 : 1;
            if (attackers >= attackerLimit) continue;
            
            let score = 0;
            
            // РЎР»Р°Р±С‹Рµ РІСЂР°РіРё РїСЂРµРґРїРѕС‡С‚РёС‚РµР»СЊРЅРµРµ
            score += (100 - enemyData.health) / 2;
            
            // Р‘Р»РёР·РєРёРµ РІСЂР°РіРё РїСЂРµРґРїРѕС‡С‚РёС‚РµР»СЊРЅРµРµ
            score += (50 - enemyData.distance);
            
            if (!enemyData.hasWeapon) score += 18;
            if (enemyData.hasWeapon) score += 18;
            if (enemyData.distance < 35) score += 20;
            if (enemyData.distance < 70) score += 12;
            if (enemyData.isPlayer) {
                score += this.personality.aggression > 0.52 ? 55 : 24;
            }
            score -= attackers * 18;
            
            if (score > bestScore) {
                bestScore = score;
                bestTarget = entity;
            }
        }
        
        return bestTarget;
    }

    countAttackersForTarget(bot, target, entityManager) {
        if (!target || !entityManager?.entities) return 0;
        let count = 0;
        for (const entity of entityManager.entities) {
            if (!entity?.isAlive) continue;
            if (entity === bot) continue;
            if (entity.constructor?.name !== 'Bot') continue;
            if (entity.target !== target) continue;
            const dist = entity.position?.distanceTo ? entity.position.distanceTo(target.position) : Infinity;
            if (dist > 28) continue;
            if (['hunt', 'ambush', 'trainCombat', 'betray'].includes(entity.state)) {
                count += 1;
                continue;
            }
            count += 0.5;
        }
        return count;
    }

    findPreferredPlayerTarget(bot, entityManager) {
        const enemies = Object.values(this.memory.lastSeenEnemies)
            .filter(enemy => enemy.isPlayer && enemy.distance < 90);
        if (!enemies.length) return null;
        enemies.sort((a, b) => (a.distance - b.distance) || ((b.hasWeapon ? 1 : 0) - (a.hasWeapon ? 1 : 0)));
        return entityManager.getEntityById(enemies[0].id) || null;
    }

    findNearestChest(bot, lootManager, maxRange) {
        const chests = lootManager.getChests();
        let nearest = null;
        let bestScore = Infinity;
        const candidates = [];
        for (const chest of chests) {
            if (chest.userData.isOpen) continue;
            const dist = bot.position.distanceTo(chest.position);
            if (dist > maxRange) continue;
            candidates.push({ chest, dist });
        }
        if (!candidates.length) return null;

        candidates.sort((a, b) => a.dist - b.dist);
        const limit = Math.min(6, candidates.length);
        for (let i = 0; i < limit; i++) {
            const item = candidates[i];
            const crowd = this.countBotsTargetingPoint(bot, item.chest.position, 10.5);
            const near = this.countBotsNearPoint(bot, item.chest.position, 8.5);
            if (crowd >= 2 || near >= 3) continue;
            const score = item.dist + crowd * 34 + near * 18;
            if (score < bestScore) {
                bestScore = score;
                nearest = item.chest;
            }
        }

        return nearest;
    }

    getLootApproachTarget(bot, targetPosition) {
        const map = bot.mapRef;
        if (!map || !targetPosition) return null;
        const info = map.getStructureAtPoint?.(targetPosition.x, targetPosition.z, 0.35);
        if (!info) {
            return new THREE.Vector3(targetPosition.x, 0, targetPosition.z);
        }

        const inside = map.isPointInsideStructure?.(bot.position.x, bot.position.z, info.structure, info.type, 0.2);
        if (inside) {
            return new THREE.Vector3(targetPosition.x, 0, targetPosition.z);
        }

        const entry = map.getStructureEntryPoint?.(info.structure, info.type, bot.position);
        if (entry) {
            return new THREE.Vector3(entry.x, 0, entry.z);
        }
        return new THREE.Vector3(targetPosition.x, 0, targetPosition.z);
    }

    setBotPatrolTarget(bot, targetPosition) {
        if (!bot || !targetPosition) return;
        const target = new THREE.Vector3(targetPosition.x, 0, targetPosition.z);
        const map = bot.mapRef;
        bot.routeFinalTarget = null;
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
            bot.position.x,
            bot.position.z,
            info.structure,
            info.type,
            0.2
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

    updatePatrolRoute(bot) {
        if (!bot?.routeFinalTarget || !bot?.patrolTarget) return;
        if (bot.position.distanceTo(bot.patrolTarget) > 3.4) return;
        bot.patrolTarget = bot.routeFinalTarget.clone();
        bot.routeFinalTarget = null;
    }

    getBotListForScoring(bot) {
        const manager = bot.entityManagerRef;
        if (!manager) return [];
        const now = performance.now();
        if (
            this.botListCache &&
            this.botListCacheManager === manager &&
            now < this.botListCacheExpire
        ) {
            return this.botListCache;
        }
        const entities = manager.entities || [];
        this.botListCache = entities.filter(entity => entity?.isAlive && entity.constructor?.name === 'Bot');
        this.botListCacheManager = manager;
        this.botListCacheExpire = now + 120;
        return this.botListCache;
    }

    countBotsTargetingPoint(bot, point, radius = 10) {
        if (!point) return 0;
        const radiusSq = radius * radius;
        let count = 0;
        const entities = this.getBotListForScoring(bot);
        for (const entity of entities) {
            if (!entity?.isAlive || entity === bot) continue;
            const target = entity.patrolTarget || entity.target?.position;
            if (!target) continue;
            const dx = target.x - point.x;
            const dz = target.z - point.z;
            if (dx * dx + dz * dz <= radiusSq) count++;
        }
        return count;
    }

    countBotsNearPoint(bot, point, radius = 8) {
        if (!point) return 0;
        const radiusSq = radius * radius;
        let count = 0;
        const entities = this.getBotListForScoring(bot);
        for (const entity of entities) {
            if (!entity?.isAlive || entity === bot) continue;
            const dx = entity.position.x - point.x;
            const dz = entity.position.z - point.z;
            if (dx * dx + dz * dz <= radiusSq) count++;
        }
        return count;
    }

    findBestHangarChest(bot, lootManager) {
        const map = bot.mapRef;
        if (!map?.getHangarSpots || !lootManager?.getChests) return null;
        const hangars = map.getHangarSpots();
        if (!hangars.length) return null;

        const chests = lootManager.getChests();
        let best = null;
        let bestScore = Infinity;
        for (const chest of chests) {
            if (!chest || chest.userData?.isOpen) continue;
            const grade = chest.userData?.grade;
            let nearHangar = grade === 'hangar';
            if (!nearHangar) {
                nearHangar = hangars.some(h => {
                    const lim = Math.max(10, Math.max(h.width || 24, h.depth || 24) * 0.6);
                    return Math.hypot(chest.position.x - h.x, chest.position.z - h.z) < lim;
                });
            }
            if (!nearHangar) continue;
            const dist = bot.position.distanceTo(chest.position);
            if (dist > 120) continue;
            const score = dist + (grade === 'hangar' ? -8 : 0);
            if (score < bestScore) {
                bestScore = score;
                best = chest;
            }
        }
        return best;
    }

    findStrategicHangarTarget(bot, lootManager = null) {
        const map = bot.mapRef;
        if (!map?.getHangarSpots) return null;
        const hangars = map.getHangarSpots();
        if (!hangars.length) return null;

        const lowResources = this.hasLowCombatResources(bot);
        let best = null;
        let bestScore = Infinity;

        for (const hangar of hangars) {
            const center = new THREE.Vector3(hangar.x, 0, hangar.z);
            const front = new THREE.Vector3(hangar.x, 0, hangar.z + (hangar.depth || 18) * 0.48);
            const back = new THREE.Vector3(hangar.x, 0, hangar.z - (hangar.depth || 18) * 0.48);
            const candidate = bot.position.distanceTo(front) < bot.position.distanceTo(back) ? front : back;
            const target = map.isWalkableAt?.(candidate.x, candidate.z) ? candidate : center;

            const dist = bot.position.distanceTo(target);
            if (dist < 12) continue;

            let closedChestBonus = 0;
            if (lootManager?.getChests) {
                const chests = lootManager.getChests();
                for (const chest of chests) {
                    if (chest?.userData?.isOpen) continue;
                    const chestDist = Math.hypot(chest.position.x - hangar.x, chest.position.z - hangar.z);
                    if (chestDist < Math.max(10, (hangar.width || 28) * 0.5)) {
                        closedChestBonus += 9;
                    }
                }
            }

            const zonePressure = this.getZonePressure(bot);
            const pressurePenalty = zonePressure > 0.82 ? dist * 0.35 : 0;
            const lowResBoost = lowResources ? -16 : 0;
            const score = dist - closedChestBonus + pressurePenalty + lowResBoost;
            const crowd = this.countBotsTargetingPoint(bot, target, 18) + this.countBotsNearPoint(bot, target, 15);
            if (crowd >= 4) continue;
            const finalScore = score + crowd * 26;
            if (finalScore < bestScore) {
                bestScore = finalScore;
                best = target;
            }
        }
        return best;
    }

    findStrategicHouseTarget(bot, lootManager = null) {
        const map = bot.mapRef;
        if (!map?.getHouseSpots) return null;
        const houses = map.getHouseSpots();
        if (!houses.length) return null;

        let best = null;
        let bestScore = Infinity;
        for (const house of houses) {
            const center = new THREE.Vector3(house.x, 0, house.z);
            const dist = bot.position.distanceTo(center);
            if (dist < 8 || dist > 135) continue;

            let closedChestBonus = 0;
            if (lootManager?.getChests) {
                for (const chest of lootManager.getChests()) {
                    if (!chest || chest.userData?.isOpen) continue;
                    if (chest.userData?.grade === 'hangar') continue;
                    const chestDist = Math.hypot(chest.position.x - house.x, chest.position.z - house.z);
                    if (chestDist < Math.max(8, Math.max(house.width || 12, house.depth || 12) * 0.6)) {
                        closedChestBonus += 7;
                    }
                }
            }

            const score =
                dist -
                closedChestBonus +
                (this.getZonePressure(bot) > 0.82 ? dist * 0.25 : 0);
            const crowd = this.countBotsTargetingPoint(bot, center, 16) + this.countBotsNearPoint(bot, center, 14);
            if (crowd >= 4) continue;
            const finalScore = score + crowd * 20;
            if (finalScore < bestScore) {
                bestScore = finalScore;
                best = center;
            }
        }
        return best;
    }

    hasLowCombatResources(bot) {
        const weapon = bot.currentWeapon;
        if (!weapon || weapon.type === 'fists') return true;
        if (weapon.ammo !== null && weapon.maxAmmo) {
            return weapon.ammo / Math.max(1, weapon.maxAmmo) < 0.35;
        }
        if (weapon.durability !== null && weapon.maxDurability) {
            return weapon.durability / Math.max(1, weapon.maxDurability) < 0.35;
        }
        return bot.health / Math.max(1, bot.maxHealth || 100) < 0.5;
    }

    avoidActiveTrain(bot) {
        const map = bot.mapRef;
        if (!map?.getTrainCarsSnapshot || !map?.isNearRailCorridor) return false;
        if (bot.ignoreTrainAvoidance || bot.state === 'trainCombat') return false;

        const nearRailNow = map.isNearRailCorridor(bot.position.x, bot.position.z, 1.4);
        const nearRailTarget = bot.patrolTarget ? map.isNearRailCorridor(bot.patrolTarget.x, bot.patrolTarget.z, 1.4) : false;
        if (!nearRailNow && !nearRailTarget) return false;

        const trains = map.getTrainCarsSnapshot();
        if (!trains.length) return false;

        let danger = null;
        for (const train of trains) {
            const alongDist = train.axis === 'x'
                ? Math.abs(train.x - bot.position.x)
                : Math.abs(train.z - bot.position.z);
            const acrossDist = train.axis === 'x'
                ? Math.abs(train.z - bot.position.z)
                : Math.abs(train.x - bot.position.x);
            const corridorHalf = (train.width || 4.8) * 0.5 + 3.2;
            if (acrossDist > corridorHalf) continue;
            if (alongDist < 16) {
                danger = train;
                break;
            }
        }

        if (!danger) return false;

        const axisX = danger.axis === 'x';
        const signBase = axisX
            ? (bot.position.z >= danger.z ? 1 : -1)
            : (bot.position.x >= danger.x ? 1 : -1);
        const lateral = 6.2 + Math.random() * 2.2;
        const evadeTarget = bot.position.clone();
        if (axisX) evadeTarget.z += signBase * lateral;
        else evadeTarget.x += signBase * lateral;

        if (map.isWalkableAt?.(evadeTarget.x, evadeTarget.z)) {
            bot.state = 'explore';
            bot.patrolTarget = new THREE.Vector3(evadeTarget.x, 0, evadeTarget.z);
            bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.2);
            this.stateTimer = 0.7;
            return true;
        }

        return false;
    }

    getTrainCombatOpportunity(bot, entityManager) {
        const map = bot.mapRef;
        if (!map?.getTrainCarsSnapshot) return null;
        const trains = map.getTrainCarsSnapshot();
        if (!trains.length) return null;

        const entities = entityManager.getEntities();
        let best = null;
        let bestScore = Infinity;
        for (const enemy of entities) {
            if (!enemy || enemy === bot || !enemy.isAlive) continue;
            if (bot.allies && bot.allies.includes(enemy)) continue;

            for (const train of trains) {
                const axisX = train.axis === 'x';
                const enemyAlong = axisX ? Math.abs(enemy.position.x - train.x) : Math.abs(enemy.position.z - train.z);
                const enemyAcross = axisX ? Math.abs(enemy.position.z - train.z) : Math.abs(enemy.position.x - train.x);
                const botAlong = axisX ? Math.abs(bot.position.x - train.x) : Math.abs(bot.position.z - train.z);
                const botAcross = axisX ? Math.abs(bot.position.z - train.z) : Math.abs(bot.position.x - train.x);
                const halfW = (train.width || 4.8) * 0.5 + 1.8;
                const halfL = (train.length || 14.2) * 0.62 + 4.5;

                if (enemyAcross > halfW + 1.6 || enemyAlong > halfL + 2.5) continue;
                if (botAcross > halfW + 10.5 || botAlong > halfL + 24) continue;

                const score =
                    bot.position.distanceTo(enemy.position) * 0.78 +
                    botAlong * 0.22 +
                    botAcross * 0.9 -
                    (enemy.constructor?.name === 'Player' ? 8 : 0) -
                    (enemy.currentWeapon ? 4.5 : 0) -
                    (bot.currentWeapon ? 3.2 : 0);
                if (score < bestScore) {
                    bestScore = score;
                    best = { train, enemy };
                }
            }
        }
        return best;
    }

    tryAcquireTrainCombat(bot, entityManager) {
        if (!this.prefersTrainCombat) return false;
        if (bot.state === 'flee' || bot.state === 'cover' || bot.state === 'retreat') return false;
        if (!bot.currentWeapon || this.hasLowCombatResources(bot) || bot.health < bot.maxHealth * 0.24) return false;
        if (this.trainBoardCooldown > 0 && bot.state !== 'trainCombat') return false;
        if (this.getZonePressure(bot) > 0.88) return false;

        const opportunity = this.getTrainCombatOpportunity(bot, entityManager);
        if (!opportunity) return false;

        bot.state = 'trainCombat';
        bot.target = opportunity.enemy;
        bot.trainTarget = opportunity.train;
        this.stateTimer = Math.max(this.stateTimer, 6 + Math.random() * 4);
        this.trainLockTimer = Math.max(this.trainLockTimer, 4.5);
        bot.ignoreTrainAvoidance = true;
        return true;
    }

    findClosestTrain(bot) {
        const trains = bot.mapRef?.getTrainCarsSnapshot?.() || [];
        if (!trains.length) return null;
        let best = null;
        let bestDist = Infinity;
        for (const train of trains) {
            const dx = bot.position.x - train.x;
            const dz = bot.position.z - train.z;
            const d = Math.hypot(dx, dz);
            if (d < bestDist) {
                bestDist = d;
                best = train;
            }
        }
        return best;
    }

    getTrainBoardingPoint(bot, train) {
        const axisX = train.axis === 'x';
        const side = axisX
            ? (bot.position.z >= train.z ? 1 : -1)
            : (bot.position.x >= train.x ? 1 : -1);
        const sideOffset = (train.width || 4.8) * 0.5 + 1.05;
        const alongOffset = (Math.random() - 0.5) * Math.max(2.4, (train.length || 14.2) * 0.35);
        if (axisX) {
            return new THREE.Vector3(train.x + alongOffset, 0, train.z + side * sideOffset);
        }
        return new THREE.Vector3(train.x + side * sideOffset, 0, train.z + alongOffset);
    }

    isBotOnTrain(bot, train) {
        const axisX = train.axis === 'x';
        const along = axisX ? Math.abs(bot.position.x - train.x) : Math.abs(bot.position.z - train.z);
        const across = axisX ? Math.abs(bot.position.z - train.z) : Math.abs(bot.position.x - train.x);
        const topY = train.y + 0.86;
        return along < (train.length || 14.2) * 0.48 &&
            across < (train.width || 4.8) * 0.48 &&
            bot.position.y > topY;
    }

    findPotentialAlly(bot, entityManager) {
        if (this.independentMode) return null;
        const entities = entityManager.getEntities();
        
        for (const entity of entities) {
            if (entity === bot || !entity.isAlive) continue;
            if (entity.constructor.name === 'Player') continue; // РќРµ СЃРѕСЋР·РЅРёС‡Р°РµРј СЃ РёРіСЂРѕРєРѕРј
            if (bot.allies.includes(entity)) continue;
            
            const dist = bot.position.distanceTo(entity.position);
            
            // РС‰РµРј СЃР»Р°Р±С‹С… РёР»Рё Р±Р»РёР·РєРёС… Р±РѕС‚РѕРІ
            if (dist < 30 && (entity.health < 60 || bot.health < 60)) {
                return entity;
            }
        }
        
        return null;
    }

    getZonePressure(bot) {
        const zone = bot.zoneRef;
        if (!zone?.getCurrentRadius) return 0;
        const dist = Math.hypot(bot.position.x, bot.position.z);
        const radius = zone.getCurrentRadius();
        if (radius <= 0.001) return 0;
        return dist / radius;
    }

    getInwardTarget(bot, distance = 26) {
        const dir = new THREE.Vector3(-bot.position.x, 0, -bot.position.z);
        if (dir.lengthSq() < 0.001) {
            dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        }
        dir.normalize();
        return bot.position.clone().add(dir.multiplyScalar(distance));
    }

    shouldRecenter(bot) {
        return this.getZonePressure(bot) > 0.72;
    }

    setRandomPatrolTarget(bot, minDist, maxDist) {
        const map = bot.mapRef;
        const zoneRadius = bot.zoneRef?.getCurrentRadius?.() || (map?.halfSize ? map.halfSize * 0.9 : null);
        const safeRadius = zoneRadius ? Math.max(18, zoneRadius * 0.78) : null;
        const hangarBias = this.prefersHangarLoot ? 0.74 : (this.prefersTrainCombat ? 0.28 : 0.42);
        if (this.poiRetargetCooldown <= 0 && map?.getHangarSpots && Math.random() < hangarBias) {
            const hangarTarget = this.findStrategicHangarTarget(bot);
            if (hangarTarget) {
                this.setBotPatrolTarget(bot, hangarTarget);
                this.poiRetargetCooldown = 2.5 + Math.random() * 2.5;
                return;
            }
        }
        if (map && typeof map.getFloorTiles === 'function') {
            const tiles = map.getFloorTiles();
            if (tiles.length) {
                let bestTarget = null;
                let bestScore = Infinity;
                const preferredAngle = ((bot.id * 0.61803398875) % 1) * Math.PI * 2;
                for (let i = 0; i < 12; i++) {
                    const tile = tiles[Math.floor(Math.random() * tiles.length)];
                    const dx = tile.x - bot.position.x;
                    const dz = tile.z - bot.position.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist < minDist || dist > maxDist) continue;
                    if (safeRadius && Math.hypot(tile.x, tile.z) > safeRadius) continue;
                    if (map.isWalkableAt && !map.isWalkableAt(tile.x, tile.z)) continue;
                    if (map.isNearRailCorridor?.(tile.x, tile.z, 0.7)) continue;
                    const angle = Math.atan2(dz, dx);
                    const angleDiff = Math.abs(Math.atan2(Math.sin(angle - preferredAngle), Math.cos(angle - preferredAngle)));
                    let crowd = 0;
                    if (i % 2 === 0) {
                        crowd = this.countBotsTargetingPoint(bot, tile, 14) + this.countBotsNearPoint(bot, tile, 10);
                    }
                    const score = Math.abs(dist - (minDist + maxDist) * 0.5) + crowd * 12 + angleDiff * 2.2;
                    if (score < bestScore) {
                        bestScore = score;
                        bestTarget = tile;
                    }
                }
                if (bestTarget) {
                    this.setBotPatrolTarget(bot, new THREE.Vector3(bestTarget.x, 0, bestTarget.z));
                    return;
                }
            }
        }

        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = minDist + Math.random() * (maxDist - minDist);
            const x = bot.position.x + Math.cos(angle) * distance;
            const z = bot.position.z + Math.sin(angle) * distance;
            if (map && map.halfSize) {
                if (Math.abs(x) > map.halfSize - 5 || Math.abs(z) > map.halfSize - 5) continue;
                if (safeRadius && Math.hypot(x, z) > safeRadius) continue;
                const y = map.getHeightAt(x, z);
                if (y < map.waterLevel + 0.6) continue;
                if (map.isWalkableAt && !map.isWalkableAt(x, z)) continue;
                if (map.isNearRailCorridor?.(x, z, 0.8)) continue;
                bot.patrolTarget = new THREE.Vector3(x, 0, z);
                return;
            }
            bot.patrolTarget = new THREE.Vector3(x, 0, z);
            return;
        }
        bot.patrolTarget = new THREE.Vector3(bot.position.x, 0, bot.position.z);
    }

    // ===== РЈРџР РђР’Р›Р•РќРР• РЎРћР®Р—РђРњР =====
    manageAlliances(bot, delta) {
        if (!bot.allies || bot.allies.length === 0) return;
        
        // РџСЂРѕРІРµСЂРєР° РїСЂРµРґР°С‚РµР»СЊСЃС‚РІР°
        const shouldBetray = this.shouldBetrayAlly(bot);
        
        if (shouldBetray) {
            const weakestAlly = bot.allies.reduce((weakest, ally) => 
                (!weakest || ally.health < weakest.health) ? ally : weakest
            , null);
            
            if (weakestAlly) {
                bot.state = 'betray';
                bot.target = weakestAlly;
                
                // РЈРґР°Р»СЏРµРј РёР· СЃРѕСЋР·РЅРёРєРѕРІ
                bot.allies = bot.allies.filter(a => a !== weakestAlly);
                if (weakestAlly.allies) {
                    weakestAlly.allies = weakestAlly.allies.filter(a => a !== bot);
                }
                
                this.stateTimer = 5;
            }
        }
    }

    shouldBetrayAlly(bot) {
        const healthPercent = bot.health / bot.maxHealth;
        const allyCount = bot.allies.length;
        
        // РџСЂРµРґР°РµРј РµСЃР»Рё:
        // 1. РќРёР·РєР°СЏ Р»РѕСЏР»СЊРЅРѕСЃС‚СЊ Рё С…РѕСЂРѕС€РµРµ Р·РґРѕСЂРѕРІСЊРµ
        if (this.personality.loyalty < 0.3 && healthPercent > 0.7) return true;
        
        // 2. РњРЅРѕРіРѕ СЃРѕСЋР·РЅРёРєРѕРІ (РЅСѓР¶РЅРѕ СЃРѕРєСЂР°С‚РёС‚СЊ РєРѕРЅРєСѓСЂРµРЅС†РёСЋ)
        if (allyCount > 2 && this.personality.greed > 0.7) return true;
        
        // 3. РҐРѕСЂРѕС€Рѕ РІРѕРѕСЂСѓР¶РµРЅС‹ Рё Р·Р°Р»СѓС‚Р°РЅС‹
        if (bot.currentWeapon && bot.currentWeapon.damage > 30 && healthPercent > 0.8) {
            return this.personality.loyalty < 0.5 && Math.random() < 0.2;
        }
        
        return false;
    }

    updateMemory(bot, entityManager) {
        // РћС‡РёСЃС‚РєР° СѓСЃС‚Р°СЂРµРІС€РёС… РґР°РЅРЅС‹С…
        const now = performance.now();
        for (const id in this.memory.lastSeenEnemies) {
            if (now - this.memory.lastSeenEnemies[id].lastSeen > 20000) {
                delete this.memory.lastSeenEnemies[id];
            }
        }
    }

    // ===== РћР‘Р РђР‘РћРўР§РРљР РЎРћРЎРўРћРЇРќРР™ =====
    
    executeState(bot, delta, entityManager, lootManager, audioSynth, threatLevel) {
        switch(bot.state) {
            case 'spawn':
                this.handleSpawn(bot, delta, lootManager);
                break;
            case 'explore':
                this.handleExplore(bot, delta, lootManager, entityManager, threatLevel);
                break;
            case 'hunt':
                this.handleHunt(bot, delta, entityManager, audioSynth);
                break;
            case 'trainCombat':
                this.handleTrainCombat(bot, delta, entityManager, audioSynth);
                break;
            case 'flee':
                this.handleFlee(bot, delta, entityManager, threatLevel);
                break;
            case 'ally':
                this.handleAlly(bot, delta, entityManager, lootManager);
                break;
            case 'betray':
                this.handleBetray(bot, delta, entityManager, audioSynth);
                break;
            case 'ambush':
                this.handleAmbush(bot, delta, entityManager, audioSynth);
                break;
            case 'patrol':
                this.handlePatrol(bot, delta, entityManager, lootManager, threatLevel);
                break;
            case 'cover':
                this.handleCover(bot, delta, entityManager, threatLevel);
                break;
            case 'retreat':
                this.handleRetreat(bot, delta, entityManager);
                break;
        }
    }

    handleSpawn(bot, delta, lootManager) {
        // Р Р°Р·Р±РµРіР°РµРјСЃСЏ РѕС‚ С†РµРЅС‚СЂР° СЃС‚СЂР°С‚РµРіРёС‡РµСЃРєРё
        const map = bot.mapRef;
        if (map && typeof map.getFloorTiles === 'function') {
            if (!bot.patrolTarget) {
                this.setRandomPatrolTarget(bot, 20, 60);
            }
            if (bot.patrolTarget) {
                bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.5);
                if (bot.position.distanceTo(bot.patrolTarget) < 6) {
                    bot.state = 'explore';
                    this.stateTimer = 0;
                }
                return;
            }
        }

        const totalSlots = 32;
        const angle = (bot.id / totalSlots) * Math.PI * 2;
        const distance = 14 + this.personality.courage * 6;
        const target = new THREE.Vector3(
            Math.cos(angle) * distance,
            0,
            Math.sin(angle) * distance
        );
        const currentDist = bot.position.distanceTo(new THREE.Vector3(0, 0, 0));

        if (currentDist < distance - 2) {
            bot.moveTowards(target, bot.physics.speed * 1.5);
        } else {
            bot.state = 'explore';
            this.stateTimer = 0;
        }
    }

    handleExplore(bot, delta, lootManager, entityManager, threatLevel) {
        // Р•СЃР»Рё РµСЃС‚СЊ СѓРіСЂРѕР·Р° - СЂРµР°РіРёСЂСѓРµРј
        if ((threatLevel === 'critical' || threatLevel === 'high') && bot.health / bot.maxHealth < 0.32) {
            bot.state = 'flee';
            const enemy = this.findNearestEnemy(bot, 50);
            if (enemy) bot.target = enemy;
            return;
        }

        const preferredPlayer = this.findPreferredPlayerTarget(bot, entityManager);
        if (preferredPlayer && bot.currentWeapon && bot.health / bot.maxHealth > 0.38) {
            bot.state = 'hunt';
            bot.target = preferredPlayer;
            return;
        }
        if (this.prefersTrainCombat && this.tryAcquireTrainCombat(bot, entityManager)) {
            return;
        }

        const localCrowd = this.countBotsNearPoint(bot, bot.position, 7.5);
        if (localCrowd >= 4 && Math.random() < 0.55) {
            this.setRandomPatrolTarget(bot, 24, 70);
            bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.2);
            return;
        }

        if (bot.isStuck) {
            bot.isStuck = false;
            this.setRandomPatrolTarget(bot, 18, 64);
        }

        if (this.shouldRecenter(bot)) {
            this.setBotPatrolTarget(bot, this.getInwardTarget(bot, 28));
            bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.15);
            return;
        }
        
        // Р”РІРёР¶РµРјСЃСЏ Рє С†РµР»Рё
        if (bot.patrolTarget) {
            this.updatePatrolRoute(bot);
            if (bot.mapRef?.isWalkableAt && !bot.mapRef.isWalkableAt(bot.patrolTarget.x, bot.patrolTarget.z)) {
                this.setRandomPatrolTarget(bot, 30, 80);
            }
            const dist = bot.position.distanceTo(bot.patrolTarget);
            
            if (dist < 3) {
                // РџСЂРѕРІРµСЂСЏРµРј СЃСѓРЅРґСѓРєРё СЂСЏРґРѕРј
                const chest = this.findNearestChest(bot, lootManager, 5);
                if (chest && !chest.userData.isOpen) {
                    const approach = this.getLootApproachTarget(bot, chest.position);
                    if (approach && bot.position.distanceTo(approach) > 2.6) {
                        this.setBotPatrolTarget(bot, approach);
                        bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.08);
                        return;
                    }
                    const loot = lootManager.tryOpenChest(chest, bot);
                    if (loot && bot.pickupLoot) bot.pickupLoot(loot);
                }
                
                // РЎС‚Р°РІРёРј РЅРѕРІСѓСЋ С†РµР»СЊ
                const hangarTarget = this.findStrategicHangarTarget(bot, lootManager);
                if (hangarTarget && Math.random() < 0.48) {
                    this.setBotPatrolTarget(bot, hangarTarget);
                } else {
                    this.setRandomPatrolTarget(bot, 18, 56);
                }
            } else {
                bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.06);
            }
        } else {
            this.setRandomPatrolTarget(bot, 18, 56);
        }
    }

    handleHunt(bot, delta, entityManager, audioSynth) {
        if (this.prefersTrainCombat && this.tryAcquireTrainCombat(bot, entityManager)) {
            return;
        }
        if (!bot.target || !bot.target.isAlive) {
            bot.state = 'patrol';
            return;
        }
        const attackers = this.countAttackersForTarget(bot, bot.target, entityManager);
        const attackerLimit = bot.target?.constructor?.name === 'Player' ? 2 : 1;
        if (attackers >= attackerLimit) {
            bot.target = null;
            bot.state = 'patrol';
            this.setRandomPatrolTarget(bot, 24, 70);
            return;
        }
        
        const dist = bot.position.distanceTo(bot.target.position);
        const head = (ent) => new THREE.Vector3(
            ent.position.x,
            ent.position.y + (ent.physics?.height || 1.8) * 0.55,
            ent.position.z
        );
        if (entityManager?.hasLineOfSight) {
            const visible = entityManager.hasLineOfSight(head(bot), head(bot.target), true);
            if (!visible && dist > 10) {
                const lastSeen = this.memory.lastSeenEnemies?.[bot.target.id]?.position;
                if (lastSeen) {
                    bot.patrolTarget = lastSeen.clone();
                    bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.05);
                    bot.lookAt(lastSeen);
                    return;
                }
            }
        }
        
        // Р”РёСЃС‚Р°РЅС†РёСЏ Р°С‚Р°РєРё
        const attackRange = bot.currentWeapon
            ? (bot.currentWeapon.range || 3) * (bot.currentWeapon.type === 'shotgun' ? 0.92 : 0.86)
            : 2.2;
        
        if (dist < attackRange && this.attackCooldown <= 0) {
            // РђРўРђРљРЈР•Рњ
            bot.lookAt(bot.target.position);
            
            if (bot.currentWeapon && bot.attack) {
                const result = bot.attack(bot.target, entityManager);
                if (result) {
                    this.memory.damageDealt += result.damage || 0;
                    if (result.killed) this.memory.kills++;
                }
            }
            
            this.attackCooldown = (bot.currentWeapon ? bot.currentWeapon.cooldown : 1) * 0.68;
        } else if (dist < attackRange * 1.4) {
            // Лёгкий стрейф, чтобы не стоять на месте
            const toTarget = new THREE.Vector3().subVectors(bot.target.position, bot.position).normalize();
            const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toTarget).normalize();
            const strafeDir = Math.random() > 0.5 ? side : side.clone().multiplyScalar(-1);
            const strafeTarget = bot.position.clone().add(strafeDir.multiplyScalar(6));
            bot.moveTowards(strafeTarget, bot.physics.speed);
            bot.lookAt(bot.target.position);
        } else if (dist < attackRange * 3) {
            // РџСЂРёР±Р»РёР¶Р°РµРјСЃСЏ
            bot.moveTowards(bot.target.position, bot.physics.speed * 1.32);
            bot.lookAt(bot.target.position);
        } else {
            // РЎР»РёС€РєРѕРј РґР°Р»РµРєРѕ - РїРµСЂРµРєР»СЋС‡Р°РµРјСЃСЏ
            bot.state = 'patrol';
        }
    }

    handleFlee(bot, delta, entityManager, threatLevel) {
        if (!bot.target) {
            bot.state = 'explore';
            return;
        }
        
        // РЈР±РµРіР°РµРј РІ РїСЂРѕС‚РёРІРѕРїРѕР»РѕР¶РЅСѓСЋ СЃС‚РѕСЂРѕРЅСѓ
        const fleeDirection = new THREE.Vector3()
            .subVectors(bot.position, bot.target.position)
            .normalize();
        
        let fleeTarget = bot.position.clone().add(fleeDirection.multiplyScalar(50));
        if (this.shouldRecenter(bot)) {
            fleeTarget = this.getInwardTarget(bot, 30);
        }
        
        bot.moveTowards(fleeTarget, bot.physics.speed * 1.3);
        
        // Р•СЃР»Рё СѓР±РµР¶Р°Р»Рё РґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РґР°Р»РµРєРѕ
        const dist = bot.position.distanceTo(bot.target.position);
        if (dist > 40 || threatLevel === 'none') {
            bot.state = 'cover';
            this.stateTimer = 3;
        }
    }

    handleAlly(bot, delta, entityManager, lootManager) {
        if (!bot.target || !bot.target.isAlive) {
            bot.state = 'explore';
            return;
        }
        
        // Р”РµСЂР¶РёРјСЃСЏ СЂСЏРґРѕРј СЃ СЃРѕСЋР·РЅРёРєРѕРј
        const dist = bot.position.distanceTo(bot.target.position);
        
        if (dist > 15) {
            bot.moveTowards(bot.target.position, bot.physics.speed * 0.9);
        } else if (dist < 5) {
            // РЎР»РёС€РєРѕРј Р±Р»РёР·РєРѕ - РѕС‚С…РѕРґРёРј РЅРµРјРЅРѕРіРѕ
            const away = new THREE.Vector3()
                .subVectors(bot.position, bot.target.position)
                .normalize()
                .multiplyScalar(8);
            bot.moveTowards(bot.position.clone().add(away), bot.physics.speed * 0.5);
        }
        
        // РџРѕРјРѕРіР°РµРј СЃРѕСЋР·РЅРёРєСѓ РµСЃР»Рё РѕРЅ Р°С‚Р°РєРѕРІР°РЅ
        // TODO: СЂРµР°Р»РёР·РѕРІР°С‚СЊ Р·Р°С‰РёС‚Сѓ СЃРѕСЋР·РЅРёРєР°
    }

    handleBetray(bot, delta, entityManager, audioSynth) {
        // РџСЂРµРґР°С‚РµР»СЊСЃС‚РІРѕ = РІРЅРµР·Р°РїРЅР°СЏ Р°С‚Р°РєР°
        this.handleHunt(bot, delta, entityManager, audioSynth);
        
        if (this.stateTimer <= 0) {
            bot.state = 'hunt';
        }
    }

    handleAmbush(bot, delta, entityManager, audioSynth) {
        // РЎРёРґРёРј РІ Р·Р°СЃР°РґРµ
        const enemy = this.findNearestEnemy(bot, 15);
        
        if (enemy && bot.currentWeapon) {
            // Р’РЅРµР·Р°РїРЅР°СЏ Р°С‚Р°РєР°
            bot.state = 'hunt';
            bot.target = enemy;
        } else if (this.stateTimer <= 0) {
            // Р—Р°СЃР°РґР° Р·Р°РєРѕРЅС‡РёР»Р°СЃСЊ
            bot.state = 'patrol';
        }
    }

    handlePatrol(bot, delta, entityManager, lootManager, threatLevel) {
        if (this.prefersTrainCombat && this.tryAcquireTrainCombat(bot, entityManager)) {
            return;
        }
        if (bot.isStuck) {
            bot.isStuck = false;
            this.setRandomPatrolTarget(bot, 28, 80);
        }
        if (this.shouldRecenter(bot)) {
            this.setBotPatrolTarget(bot, this.getInwardTarget(bot, 30));
        }
        if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 5) {
            this.setRandomPatrolTarget(bot, 18, 56);
        }
        if (bot.mapRef?.isWalkableAt && bot.patrolTarget && !bot.mapRef.isWalkableAt(bot.patrolTarget.x, bot.patrolTarget.z)) {
            this.setRandomPatrolTarget(bot, 18, 56);
        }

        this.updatePatrolRoute(bot);
        bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.02);
        
        // РџСЂРѕРІРµСЂСЏРµРј СЃСѓРЅРґСѓРєРё РїРѕ РїСѓС‚Рё
        const chest = this.findNearestChest(bot, lootManager, 5);
        if (chest && !chest.userData.isOpen) {
            const loot = lootManager.tryOpenChest(chest, bot);
            if (loot && bot.pickupLoot) bot.pickupLoot(loot);
        } else if (Math.random() < 0.06) {
            const hangarTarget = this.findStrategicHangarTarget(bot, lootManager);
            if (hangarTarget) {
                this.setBotPatrolTarget(bot, hangarTarget);
            }
        }
    }

    handleTrainCombat(bot, delta, entityManager, audioSynth) {
        const opportunity = this.getTrainCombatOpportunity(bot, entityManager);
        if (!opportunity) {
            bot.state = 'patrol';
            bot.trainTarget = null;
            this.trainLockTimer = 0;
            return;
        }

        bot.target = opportunity.enemy;
        bot.trainTarget = opportunity.train;
        const attackers = this.countAttackersForTarget(bot, bot.target, entityManager);
        if (attackers >= 2) {
            bot.state = 'patrol';
            bot.target = null;
            bot.trainTarget = null;
            this.setRandomPatrolTarget(bot, 24, 70);
            return;
        }
        const train = opportunity.train;
        const onTrain = this.isBotOnTrain(bot, train);

        if (!onTrain) {
            const boardPoint = this.getTrainBoardingPoint(bot, train);
            bot.moveTowards(boardPoint, bot.physics.speed * 1.2);
            const boardDist = bot.position.distanceTo(boardPoint);
            if (boardDist < 1.9 && this.trainBoardCooldown <= 0) {
                const axisX = train.axis === 'x';
                const alongOffset = (Math.random() - 0.5) * Math.max(2.2, (train.length || 14.2) * 0.42);
                if (axisX) {
                    bot.position.x = train.x + alongOffset;
                    bot.position.z = train.z;
                } else {
                    bot.position.x = train.x;
                    bot.position.z = train.z + alongOffset;
                }
                bot.position.y = Math.max(bot.position.y, train.y + 0.94 + bot.physics.height);
                bot.physics.velocity.y = 0;
                bot.physics.onGround = true;
                this.trainBoardCooldown = 2.2;
            }
            this.trainLockTimer = Math.max(this.trainLockTimer, 1.6);
            return;
        }

        const attackRange = bot.currentWeapon
            ? (bot.currentWeapon.range || 3) * (bot.currentWeapon.type === 'shotgun' ? 0.94 : 0.88)
            : 2.2;
        const dist = bot.position.distanceTo(bot.target.position);

        if (dist < attackRange && this.attackCooldown <= 0) {
            bot.lookAt(bot.target.position);
            if (bot.currentWeapon && bot.attack) {
                const result = bot.attack(bot.target, entityManager);
                if (result) {
                    this.memory.damageDealt += result.damage || 0;
                    if (result.killed) this.memory.kills++;
                }
            }
            this.attackCooldown = (bot.currentWeapon ? bot.currentWeapon.cooldown : 1) * 0.7;
        } else {
            bot.moveTowards(bot.target.position, bot.physics.speed * 1.08);
            bot.lookAt(bot.target.position);
        }

        this.trainLockTimer = Math.max(this.trainLockTimer, 0.75);
        if (!bot.target?.isAlive || this.stateTimer <= 0) {
            bot.state = 'patrol';
            bot.trainTarget = null;
            this.trainLockTimer = 0;
        }
    }

    updateSimple(bot, delta, entityManager, lootManager) {
        this.attackCooldown = Math.max(0, this.attackCooldown - delta);
        this.scanCooldown = Math.max(0, this.scanCooldown - delta);
        this.lootingCooldown = Math.max(0, this.lootingCooldown - delta);

        // 1) Жесткий приоритет укрытия при радиационном дожде.
        if (bot.state === 'retreat' && bot.patrolTarget) {
            bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.1);
            return;
        }

        // 2) Возврат в зону.
        if (this.shouldRecenter(bot)) {
            const inward = this.getInwardTarget(bot, 30);
            this.setBotPatrolTarget(bot, inward);
            bot.state = 'retreat';
            bot.target = null;
            bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.12);
            return;
        }

        // 3) Лёгкий anti-crowd: при локальной толпе разводим бота.
        const localCrowd = this.countBotsNearPoint(bot, bot.position, 7.2);
        if (localCrowd >= 3 && Math.random() < 0.5) {
            this.setRandomPatrolTarget(bot, 16, 42);
            bot.state = 'patrol';
            bot.target = null;
            bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.03);
            return;
        }

        // 4) Периодический скан ближайших целей.
        if (this.scanCooldown <= 0) {
            this.simpleTarget = this.findCombatTargetSimple(bot, entityManager);
            this.scanCooldown = 0.35 + Math.random() * 0.25;
        }

        const target = this.simpleTarget;
        if (target?.isAlive && !target.isFrozen) {
            const attackers = this.countAttackersForTarget(bot, target, entityManager);
            const attackerLimit = target?.constructor?.name === 'Player' ? 2 : 1;
            if (attackers <= attackerLimit) {
                const dist = bot.position.distanceTo(target.position);
                const attackRange = bot.currentWeapon
                    ? Math.max(2.2, (bot.currentWeapon.range || 3) * 0.84)
                    : 2.1;
                bot.target = target;
                bot.state = 'hunt';
                if (dist <= attackRange) {
                    bot.lookAt(target.position);
                    if (this.attackCooldown <= 0) {
                        bot.attack(target, entityManager);
                        this.attackCooldown = (bot.currentWeapon?.cooldown || 1) * 0.75;
                    }
                } else {
                    bot.moveTowards(target.position, bot.physics.speed * 1.08);
                    bot.lookAt(target.position);
                }
                return;
            }
        }

        // 5) Лутаемся, если рядом есть неоткрытый сундук и на нем нет толпы.
        if (this.lootingCooldown <= 0) {
            const chest = this.findNearestChest(bot, lootManager, 72);
            if (chest && !chest.userData?.isOpen) {
                const approach = this.getLootApproachTarget(bot, chest.position) || chest.position;
                this.setBotPatrolTarget(bot, approach);
                bot.state = 'explore';
                bot.target = null;
                const d = bot.position.distanceTo(bot.patrolTarget);
                if (d <= 3.2) {
                    const loot = lootManager.tryOpenChest(chest, bot);
                    if (loot && bot.pickupLoot) bot.pickupLoot(loot);
                    this.lootingCooldown = 0.9 + Math.random() * 0.8;
                } else {
                    bot.moveTowards(bot.patrolTarget, bot.physics.speed * 1.02);
                }
                return;
            }
            this.lootingCooldown = 0.25;
        }

        // 6) Дефолтный патруль.
        if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 4) {
            this.setRandomPatrolTarget(bot, 16, 46);
        }
        bot.state = 'patrol';
        bot.target = null;
        this.updatePatrolRoute(bot);
        bot.moveTowards(bot.patrolTarget, bot.physics.speed);
    }

    findCombatTargetSimple(bot, entityManager) {
        const nearby = entityManager.getNearbyEntities
            ? entityManager.getNearbyEntities(bot.position, 36)
            : entityManager.getEntities();
        let best = null;
        let bestScore = -Infinity;
        for (const ent of nearby) {
            if (!ent || ent === bot || !ent.isAlive) continue;
            if (ent.constructor?.name !== 'Bot' && ent.constructor?.name !== 'Player') continue;
            if (bot.noCombatUntil && performance.now() < bot.noCombatUntil) continue;
            const dist = bot.position.distanceTo(ent.position);
            if (dist > 36) continue;
            let score = 100 - dist * 2.2;
            if (ent.constructor?.name === 'Player') score += 16;
            if (ent.currentWeapon) score += 8;
            if (ent.health < 45) score += 12;
            const attackers = this.countAttackersForTarget(bot, ent, entityManager);
            score -= attackers * 20;
            if (score > bestScore) {
                bestScore = score;
                best = ent;
            }
        }
        return best;
    }

    handleCover(bot, delta, entityManager, threatLevel) {
        // РС‰РµРј СѓРєСЂС‹С‚РёРµ РёР»Рё РїСЂРѕСЃС‚Рѕ РѕСЃС‚Р°РЅР°РІР»РёРІР°РµРјСЃСЏ
        // TODO: РґРѕР±Р°РІРёС‚СЊ РїРѕРёСЃРє СѓРєСЂС‹С‚РёР№ РЅР° РєР°СЂС‚Рµ
        
        if (this.stateTimer <= 0 || threatLevel === 'none') {
            bot.state = 'explore';
        }
    }

    handleRetreat(bot, delta, entityManager) {
        const retreatTarget = this.getInwardTarget(bot, 34);
        
        bot.moveTowards(retreatTarget, bot.physics.speed);
        
        if (this.stateTimer <= 0) {
            bot.state = 'explore';
        }
    }
}



