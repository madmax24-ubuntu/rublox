import * as THREE from 'three';

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
        
        // РџРµСЂСЃРѕРЅР°Р»РёР·Р°С†РёСЏ - РєР°Р¶РґС‹Р№ Р±РѕС‚ СѓРЅРёРєР°Р»РµРЅ
        this.personality = {
            aggression: Math.random(), // РђРіСЂРµСЃСЃРёРІРЅРѕСЃС‚СЊ (0-1)
            intelligence: 0.5 + Math.random() * 0.5, // РРЅС‚РµР»Р»РµРєС‚ (0.5-1)
            courage: Math.random(), // РҐСЂР°Р±СЂРѕСЃС‚СЊ (0-1)
            loyalty: 0.2 + Math.random() * 0.8, // Р›РѕСЏР»СЊРЅРѕСЃС‚СЊ (0.2-1)
            greed: Math.random(), // Р–Р°РґРЅРѕСЃС‚СЊ (0-1)
            teamwork: Math.random(), // РљРѕРјР°РЅРґРЅР°СЏ СЂР°Р±РѕС‚Р° (0-1)
            sneakiness: Math.random(), // РЎРєСЂС‹С‚РЅРѕСЃС‚СЊ (0-1)
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
        
        this.decisionCooldown -= delta;
        this.attackCooldown -= delta;
        this.stateTimer -= delta;
        
        // 1. Р’РѕСЃРїСЂРёСЏС‚РёРµ
        this.updatePerception(bot, entityManager, lootManager);
        
        // 2. РћС†РµРЅРєР° СѓРіСЂРѕР·С‹
        const threatLevel = this.assessThreatLevel(bot, entityManager);
        
        // 3. РћР±РЅРѕРІР»РµРЅРёРµ РїСЂРёРѕСЂРёС‚РµС‚Р°
        this.updatePriority(bot, entityManager, lootManager, threatLevel);

        // 4. РџСЂРёРЅСЏС‚РёРµ СЂРµС€РµРЅРёР№
        if (this.decisionCooldown <= 0) {
            this.adaptStrategy(bot, entityManager, threatLevel);
            this.makeSmartDecision(bot, entityManager, lootManager, threatLevel);
            this.decisionCooldown = 0.3 - this.personality.intelligence * 0.15;
        }

        // 5. Р’С‹РїРѕР»РЅРµРЅРёРµ СЃРѕСЃС‚РѕСЏРЅРёСЏ
        this.executeState(bot, delta, entityManager, lootManager, audioSynth, threatLevel);
        
        // 6. РћР±РЅРѕРІР»РµРЅРёРµ РїР°РјСЏС‚Рё
        this.updateMemory(bot, entityManager);
        
        // 7. РЈРїСЂР°РІР»РµРЅРёРµ СЃРѕСЋР·Р°РјРё
        this.manageAlliances(bot, delta);
    }

    // ===== Р’РћРЎРџР РРЇРўРР• =====
    updatePerception(bot, entityManager, lootManager) {
        const visionRange = 50 + this.personality.intelligence * 30; // 50-80 РјРµС‚СЂРѕРІ
        const entities = entityManager.getEntities();
        
        for (const entity of entities) {
            if (entity === bot || !entity.isAlive) continue;
            
            const distance = bot.position.distanceTo(entity.position);
            
            if (distance < visionRange) {
                const isAlly = bot.allies && bot.allies.includes(entity);
                
                if (!isAlly) {
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

    // ===== РћР‘РќРћР’Р›Р•РќРР• РџР РРћР РРўР•РўРђ =====
    updatePriority(bot, entityManager, lootManager, threatLevel) {
        const healthPercent = bot.health / bot.maxHealth;
        const hasWeapon = !!bot.currentWeapon;
        const aliveCount = entityManager.getAliveCount();
        
        // РљСЂРёС‚РёС‡РµСЃРєРѕРµ Р·РґРѕСЂРѕРІСЊРµ = РІС‹Р¶РёРІР°РЅРёРµ
        if (healthPercent < 0.3 || threatLevel === 'critical') {
            this.currentPriority = 'survive';
        }
        // РњР°Р»Рѕ РёРіСЂРѕРєРѕРІ РѕСЃС‚Р°Р»РѕСЃСЊ = РѕС…РѕС‚Р°
        else if (aliveCount <= 10 && hasWeapon && healthPercent > 0.5) {
            this.currentPriority = 'hunt';
        }
        // РќРµС‚ РѕСЂСѓР¶РёСЏ = Р»СѓС‚
        else if (!hasWeapon || healthPercent < 0.6) {
            this.currentPriority = 'loot';
        }
        // РћРґРёРЅРѕРєРёР№ Рё СЃР»Р°Р±С‹Р№ = РіСЂСѓРїРїРёСЂРѕРІРєР°
        else if (bot.allies.length === 0 && healthPercent < 0.7 && this.personality.teamwork > 0.5) {
            this.currentPriority = 'regroup';
        }
        // РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ - Р±Р°Р»Р°РЅСЃ РјРµР¶РґСѓ Р»СѓС‚РѕРј Рё РѕС…РѕС‚РѕР№
        else {
            this.currentPriority = this.personality.aggression > 0.6 ? 'hunt' : 'loot';
        }
    }

    // ===== РђР”РђРџРўРђР¦РРЇ РЎРўР РђРўР•Р“РР =====
    adaptStrategy(bot, entityManager, threatLevel) {
        const healthPercent = bot.health / bot.maxHealth;
        const hasWeapon = !!bot.currentWeapon;
        const aliveCount = entityManager.getAliveCount();
        
        // РљСЂРёС‚РёС‡РµСЃРєР°СЏ СЃРёС‚СѓР°С†РёСЏ
        if (threatLevel === 'critical' || healthPercent < 0.25) {
            this.strategy = 'survival';
        }
        // РљРѕРЅРµС† РёРіСЂС‹ - Р°РіСЂРµСЃСЃРёСЏ
        else if (aliveCount <= 5 && hasWeapon) {
            this.strategy = 'aggressive';
        }
        // РЎРёР»СЊРЅС‹Р№ Рё РІРѕРѕСЂСѓР¶РµРЅРЅС‹Р№
        else if (hasWeapon && healthPercent > 0.8 && this.personality.aggression > 0.6) {
            this.strategy = 'aggressive';
        }
        // РЈРјРЅС‹Р№ Рё С‚РµСЂРїРµР»РёРІС‹Р№
        else if (this.personality.intelligence > 0.8 && hasWeapon) {
            this.strategy = 'tactical';
        }
        // РЎРєСЂС‹С‚РЅС‹Р№
        else if (this.personality.sneakiness > 0.7) {
            this.strategy = 'stealthy';
        }
        // РљРѕРјР°РЅРґРЅС‹Р№ РёРіСЂРѕРє
        else if (this.personality.teamwork > 0.6 && bot.allies.length > 0) {
            this.strategy = 'cooperative';
        }
        // Р‘Р°Р»Р°РЅСЃ
        else {
            this.strategy = 'balanced';
        }
    }

    // ===== РЈРњРќРћР• РџР РРќРЇРўРР• Р Р•РЁР•РќРР™ =====
    makeSmartDecision(bot, entityManager, lootManager, threatLevel) {
        // Р РµС€РµРЅРёСЏ РЅР° РѕСЃРЅРѕРІРµ РїСЂРёРѕСЂРёС‚РµС‚Р° Рё СЃС‚СЂР°С‚РµРіРёРё
        
        if (this.currentPriority === 'survive') {
            this.decideSurvival(bot, entityManager, lootManager);
        } else if (this.currentPriority === 'hunt') {
            this.decideHunt(bot, entityManager);
        } else if (this.currentPriority === 'loot') {
            this.decideLoot(bot, lootManager, entityManager);
        } else if (this.currentPriority === 'regroup') {
            this.decideRegroup(bot, entityManager);
        }
    }

    decideSurvival(bot, entityManager, lootManager) {
        const nearestEnemy = this.findNearestEnemy(bot, 40);
        
        if (nearestEnemy) {
            // РЈР±РµРіР°РµРј РѕС‚ РѕРїР°СЃРЅРѕСЃС‚Рё
            bot.state = 'flee';
            bot.target = nearestEnemy;
            this.stateTimer = 5;
        } else {
            // РС‰РµРј СѓРєСЂС‹С‚РёРµ РёР»Рё Р»РµС‡РµРЅРёРµ
            bot.state = 'cover';
            this.stateTimer = 3;
        }
    }

    decideHunt(bot, entityManager) {
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
        const chest = this.findNearestChest(bot, lootManager, 80);
        
        if (chest) {
            bot.state = 'explore';
            bot.patrolTarget = new THREE.Vector3(chest.position.x, chest.position.y, chest.position.z);
            this.stateTimer = 10;
        } else {
            // РСЃСЃР»РµРґСѓРµРј РЅРѕРІС‹Рµ РѕР±Р»Р°СЃС‚Рё
            bot.state = 'explore';
            this.setRandomPatrolTarget(bot, 40, 100);
            this.stateTimer = 8;
        }
    }

    decideRegroup(bot, entityManager) {
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
        const enemies = Object.values(this.memory.lastSeenEnemies);
        if (enemies.length === 0) return null;
        
        // РЈРјРЅС‹Р№ РІС‹Р±РѕСЂ С†РµР»Рё
        let bestTarget = null;
        let bestScore = -1;
        
        for (const enemyData of enemies) {
            const entity = entityManager.getEntityById(enemyData.id);
            if (!entity || !entity.isAlive) continue;
            
            let score = 0;
            
            // РЎР»Р°Р±С‹Рµ РІСЂР°РіРё РїСЂРµРґРїРѕС‡С‚РёС‚РµР»СЊРЅРµРµ
            score += (100 - enemyData.health) / 2;
            
            // Р‘Р»РёР·РєРёРµ РІСЂР°РіРё РїСЂРµРґРїРѕС‡С‚РёС‚РµР»СЊРЅРµРµ
            score += (50 - enemyData.distance);
            
            // Р‘РµР·РѕСЂСѓР¶РЅС‹Рµ РІСЂР°РіРё РїСЂРµРґРїРѕС‡С‚РёС‚РµР»СЊРЅРµРµ
            if (!enemyData.hasWeapon) score += 30;
            
            // РРіСЂРѕРєРѕРІ С…Р°РЅС‚РёРј Р±РѕР»СЊС€Рµ
            if (enemyData.isPlayer && this.personality.aggression > 0.7) {
                score += 40;
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestTarget = entity;
            }
        }
        
        return bestTarget;
    }

    findNearestChest(bot, lootManager, maxRange) {
        const chests = lootManager.getChests();
        let nearest = null;
        let minDist = maxRange;
        
        for (const chest of chests) {
            if (chest.userData.isOpen) continue;
            
            const dist = bot.position.distanceTo(chest.position);
            if (dist < minDist) {
                minDist = dist;
                nearest = chest;
            }
        }
        
        return nearest;
    }

    findPotentialAlly(bot, entityManager) {
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

    setRandomPatrolTarget(bot, minDist, maxDist) {
        const angle = Math.random() * Math.PI * 2;
        const distance = minDist + Math.random() * (maxDist - minDist);
        
        bot.patrolTarget = new THREE.Vector3(
            Math.cos(angle) * distance,
            0,
            Math.sin(angle) * distance
        );
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
        const angle = (bot.id / 32) * Math.PI * 2; // Р Р°РІРЅРѕРјРµСЂРЅРѕ РїРѕ РєСЂСѓРіСѓ
        const distance = 15 + this.personality.courage * 10; // РЎРјРµР»С‹Рµ РґР°Р»СЊС€Рµ
        
        const target = new THREE.Vector3(
            Math.cos(angle) * distance,
            0,
            Math.sin(angle) * distance
        );
        
        const currentDist = bot.position.distanceTo(new THREE.Vector3(0, 0, 0));
        
        if (currentDist < distance - 2) {
            bot.moveTowards(target, bot.physics.speed * 1.5);
        } else {
            // РџРµСЂРµС…РѕРґРёРј Рє СЃР±РѕСЂСѓ Р»СѓС‚Р°
            bot.state = 'explore';
            this.stateTimer = 0;
        }
    }

    handleExplore(bot, delta, lootManager, entityManager, threatLevel) {
        // Р•СЃР»Рё РµСЃС‚СЊ СѓРіСЂРѕР·Р° - СЂРµР°РіРёСЂСѓРµРј
        if (threatLevel === 'critical' || threatLevel === 'high') {
            bot.state = 'flee';
            const enemy = this.findNearestEnemy(bot, 50);
            if (enemy) bot.target = enemy;
            return;
        }
        
        // Р”РІРёР¶РµРјСЃСЏ Рє С†РµР»Рё
        if (bot.patrolTarget) {
            const dist = bot.position.distanceTo(bot.patrolTarget);
            
            if (dist < 3) {
                // РџСЂРѕРІРµСЂСЏРµРј СЃСѓРЅРґСѓРєРё СЂСЏРґРѕРј
                const chest = this.findNearestChest(bot, lootManager, 5);
                if (chest && !chest.userData.isOpen) {
                    const loot = lootManager.tryOpenChest(chest, bot);
                    if (loot && bot.pickupLoot) bot.pickupLoot(loot);
                }
                
                // РЎС‚Р°РІРёРј РЅРѕРІСѓСЋ С†РµР»СЊ
                this.setRandomPatrolTarget(bot, 30, 80);
            } else {
                bot.moveTowards(bot.patrolTarget, bot.physics.speed * 0.8);
            }
        } else {
            this.setRandomPatrolTarget(bot, 30, 80);
        }
    }

    handleHunt(bot, delta, entityManager, audioSynth) {
        if (!bot.target || !bot.target.isAlive) {
            bot.state = 'patrol';
            return;
        }
        
        const dist = bot.position.distanceTo(bot.target.position);
        
        // Р”РёСЃС‚Р°РЅС†РёСЏ Р°С‚Р°РєРё
        const attackRange = bot.currentWeapon ? 
            (bot.currentWeapon.type === 'laser' ? 30 : 
             bot.currentWeapon.type === 'bow' ? 20 : 3) : 2;
        
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
            
            this.attackCooldown = bot.currentWeapon ? bot.currentWeapon.cooldown : 1;
        } else if (dist < attackRange * 3) {
            // РџСЂРёР±Р»РёР¶Р°РµРјСЃСЏ
            bot.moveTowards(bot.target.position, bot.physics.speed * 1.1);
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
        
        const fleeTarget = bot.position.clone().add(fleeDirection.multiplyScalar(50));
        
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
        if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 5) {
            this.setRandomPatrolTarget(bot, 30, 70);
        }
        
        bot.moveTowards(bot.patrolTarget, bot.physics.speed * 0.7);
        
        // РџСЂРѕРІРµСЂСЏРµРј СЃСѓРЅРґСѓРєРё РїРѕ РїСѓС‚Рё
        const chest = this.findNearestChest(bot, lootManager, 5);
        if (chest && !chest.userData.isOpen) {
            const loot = lootManager.tryOpenChest(chest, bot);
            if (loot && bot.pickupLoot) bot.pickupLoot(loot);
        }
    }

    handleCover(bot, delta, entityManager, threatLevel) {
        // РС‰РµРј СѓРєСЂС‹С‚РёРµ РёР»Рё РїСЂРѕСЃС‚Рѕ РѕСЃС‚Р°РЅР°РІР»РёРІР°РµРјСЃСЏ
        // TODO: РґРѕР±Р°РІРёС‚СЊ РїРѕРёСЃРє СѓРєСЂС‹С‚РёР№ РЅР° РєР°СЂС‚Рµ
        
        if (this.stateTimer <= 0 || threatLevel === 'none') {
            bot.state = 'explore';
        }
    }

    handleRetreat(bot, delta, entityManager) {
        // РўР°РєС‚РёС‡РµСЃРєРѕРµ РѕС‚СЃС‚СѓРїР»РµРЅРёРµ Рє Р±РµР·РѕРїР°СЃРЅРѕР№ Р·РѕРЅРµ
        const safeDistance = 100;
        const angle = Math.random() * Math.PI * 2;
        
        const retreatTarget = new THREE.Vector3(
            Math.cos(angle) * safeDistance,
            0,
            Math.sin(angle) * safeDistance
        );
        
        bot.moveTowards(retreatTarget, bot.physics.speed);
        
        if (this.stateTimer <= 0) {
            bot.state = 'explore';
        }
    }
}

