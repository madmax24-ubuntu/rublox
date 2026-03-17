import * as THREE from 'three';

export class BotBrain {
    constructor() {
        // Базовые параметры
        this.decisionCooldown = 0;
        this.attackCooldown = 0;
        this.lastChestCheck = 0;
        
        // Персонализация поведения ботов - ОЧЕНЬ УМНЫЕ
        this.personality = {
            aggression: Math.random(), // 0-1: насколько агрессивен бот
            intelligence: 0.5 + Math.random() * 0.5, // 0.5-1: высокий интеллект
            courage: Math.random(), // 0-1: храбрость
            loyalty: 0.2 + Math.random() * 0.8, // 0.2-1: лояльность союзникам
            greed: Math.random(), // 0-1: жадность к луту
            teamwork: Math.random(), // 0-1: склонность к командной работе
            sneakiness: Math.random(), // 0-1: скрытность
            adaptability: 0.6 + Math.random() * 0.4 // 0.6-1: способность адаптироваться
        };
        
        // Память бота - РАСШИРЕННАЯ
        this.memory = {
            lastSeenEnemies: {}, // id -> {position, lastSeen, health, weapon, threat}
            knownChests: [], // [{position, isOpen, priority}]
            dangerousAreas: [], // [{position, dangerLevel, lastUpdate}]
            allies: [], // id союзников
            kills: 0, // Количество убийств
            damageDealt: 0, // Нанесенный урон
            damageTaken: 0, // Полученный урон
            lastAttacker: null, // Последний атакующий
            preferredWeapon: null // Предпочитаемое оружие
        };
        
        // Стратегия - динамическая
        this.strategy = this.chooseInitialStrategy();
        
        // Счетчик для состояний
        this.stateTimer = 0;
        
        // Текущий приоритет (что важнее всего прямо сейчас)
        this.currentPriority = 'survive'; // survive, loot, hunt, regroup
    }
    
    chooseInitialStrategy() {
        // Выбор начальной стратегии на основе личности
        if (this.personality.aggression > 0.7 && this.personality.courage > 0.6) {
            return 'aggressive';
        } else if (this.personality.sneakiness > 0.7) {
            return 'stealthy';
        } else if (this.personality.teamwork > 0.6) {
            return 'cooperative';
        } else if (this.personality.intelligence > 0.8) {
            return 'tactical';
        } else {
            return 'balanced';
        }
    }

    update(bot, delta, entityManager, lootManager, audioSynth) {
        if (!bot.isAlive) return;
        
        // Уменьшение кулдаунов
        this.decisionCooldown -= delta;
        this.attackCooldown -= delta;
        this.lastChestCheck -= delta;
        this.stateTimer -= delta;
        
        // 1. ВОСПРИЯТИЕ ОКРУЖЕНИЯ - боты видят и анализируют
        this.updatePerception(bot, entityManager, lootManager);
        
        // 2. ОЦЕНКА УГРОЗЫ - определяем уровень опасности
        const threatLevel = this.assessThreatLevel(bot, entityManager);
        
        // 3. ВЫБОР ПРИОРИТЕТА на основе ситуации
        this.updatePriority(bot, entityManager, lootManager, threatLevel);

        // 4. ПРИНЯТИЕ СТРАТЕГИЧЕСКИХ РЕШЕНИЙ
        if (this.decisionCooldown <= 0) {
            // Адаптируем стратегию УМНО
            this.adaptStrategy(bot, entityManager, threatLevel);
            
            // Принимаем УМНОЕ решение
            this.makeSmartDecision(bot, entityManager, lootManager, threatLevel);
            
            // Умные боты решают быстрее
            this.decisionCooldown = 0.3 - this.personality.intelligence * 0.15; // 0.15-0.3с
        }

        // 5. ВЫПОЛНЕНИЕ ДЕЙСТВИЙ - реализация выбранной тактики
        this.executeState(bot, delta, entityManager, lootManager, audioSynth, threatLevel);
        
        // 6. ОБНОВЛЕНИЕ ПАМЯТИ
        this.updateMemory(bot, entityManager);
        
        // 7. УПРАВЛЕНИЕ СОЮЗАМИ - проверка предательства
        this.manageAlliances(bot, delta);
    }
    
    // НОВАЯ СИСТЕМА: Выполнение состояний
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
            case 'cover': // НОВОЕ: укрытие
                this.handleCover(bot, delta, entityManager, threatLevel);
                break;
            case 'retreat': // НОВОЕ: тактическое отступление
                this.handleRetreat(bot, delta, entityManager);
                break;
        }
    }

    // Обновляем восприятие окружения
    updatePerception(bot, entityManager, lootManager) {
        // Запоминаем позиции противников
        const enemies = entityManager.getEntities().filter(entity => 
            entity !== bot && 
            entity.isAlive && 
            !bot.allies.includes(entity)
        );
        
        for (const enemy of enemies) {
            const distance = bot.position.distanceTo(enemy.position);
            
            // Запоминаем только врагов, которых видим (в радиусе 50 единиц)
            if (distance < 50) {
                this.memory.lastSeenEnemies[enemy.id] = {
                    position: enemy.position.clone(),
                    lastSeen: performance.now(),
                    health: enemy.health,
                    hasWeapon: !!enemy.currentWeapon,
                    isPlayer: enemy.userData && enemy.userData.isPlayer
                };
            }
        }
        
        // Удаляем устаревшие записи (старее 20 секунд)
        const now = performance.now();
        for (const id in this.memory.lastSeenEnemies) {
            if (now - this.memory.lastSeenEnemies[id].lastSeen > 20000) {
                delete this.memory.lastSeenEnemies[id];
            }
        }
    }
    
    // Адаптируем стратегию в зависимости от ситуации
    adaptStrategy(bot, entityManager) {
        const healthPercent = bot.health / bot.maxHealth;
        const hasWeapon = !!bot.currentWeapon;
        const nearbyEnemies = entityManager.getEntities().filter(e => 
            e !== bot && e.isAlive && !bot.allies.includes(e) && 
            bot.position.distanceTo(e.position) < 50
        ).length;
        
        // Определяем оптимальную стратегию исходя из ситуации
        if (healthPercent < 0.3) {
            // При низком здоровье
            this.strategy = hasWeapon ? 'stealthy' : 'defensive';
        } else if (nearbyEnemies >= 2) {
            // Много врагов поблизости
            this.strategy = healthPercent > 0.7 && hasWeapon && this.personality.aggression > 0.6 ? 'aggressive' : 'defensive';
        } else if (hasWeapon && healthPercent > 0.8) {
            // Высокое здоровье и есть оружие
            this.strategy = this.personality.aggression > 0.5 ? 'aggressive' : 'patrol';
        } else if (hasWeapon && this.personality.intelligence > 0.7) {
            // Умный бот с оружием
            this.strategy = 'ambush';
        } else {
            // По умолчанию - сбор лута
            this.strategy = 'defensive';
        }
    }
    
    makeDecision(bot, entityManager, lootManager) {
        if (!bot.isAlive) return;
        
        // Расчет базовых параметров
        const healthPercent = bot.health / bot.maxHealth;
        const hasStrongWeapon = bot.currentWeapon && bot.currentWeapon.damage > 20;
        
        // Принятие решений на основе стратегии
        switch(this.strategy) {
            case 'aggressive':
                // Агрессивная стратегия: ищем врагов
                this.makeAggressiveDecision(bot, entityManager, healthPercent, hasStrongWeapon);
                break;
                
            case 'defensive':
                // Защитная стратегия: ищем лут и союзников
                this.makeDefensiveDecision(bot, entityManager, lootManager, healthPercent);
                break;
                
            case 'stealthy':
                // Скрытная стратегия: избегаем конфликтов, ищем лут
                this.makeStealthyDecision(bot, entityManager, lootManager, healthPercent);
                break;
                
            case 'ambush':
                // Засадная стратегия: прячемся и ждем жертв
                this.makeAmbushDecision(bot, entityManager, healthPercent, hasStrongWeapon);
                break;
                
            default:
                // Патрульная стратегия: исследуем карту
                this.makePatrolDecision(bot, entityManager, lootManager);
                break;
        }
    }
    
    // Решения для агрессивной стратегии
    makeAggressiveDecision(bot, entityManager, healthPercent, hasStrongWeapon) {
        // Ищем ближайшего врага для охоты
        const nearestEnemy = entityManager.getNearestEnemy(bot.position, 60);
        
        // Есть ли противник и не является ли союзником
        if (nearestEnemy && !bot.allies.includes(nearestEnemy)) {
            const distance = bot.position.distanceTo(nearestEnemy.position);
            
            // Охота на дистанции
            if (distance < 40 && hasStrongWeapon) {
                bot.state = 'hunt';
                bot.target = nearestEnemy;
                this.stateTimer = 10;
                return;
            }
            // При сильном преимуществе - охота
            else if (nearestEnemy.health < 40 && healthPercent > 0.7) {
                bot.state = 'hunt';
                bot.target = nearestEnemy;
                this.stateTimer = 15;
                return;
            }
        }
        
        // Если врагов нет - патрулируем в поисках жертв
        bot.state = 'patrol';
        this.stateTimer = 5 + Math.random() * 5;
    }
    
    // Решения для защитной стратегии
    makeDefensiveDecision(bot, entityManager, lootManager, healthPercent) {
        // При низком здоровье ищем союзников
        if (healthPercent < 0.5 && bot.allies.length === 0 && Math.random() < 0.7) {
            const potentialAlly = entityManager.getNearestEnemy(bot.position, 25);
            if (potentialAlly && potentialAlly.health / potentialAlly.maxHealth < 0.6) {
                // Предлагаем союз более слабым
                this.formAlliance(bot, potentialAlly);
                return;
            }
        }
        
        // При хорошем здоровье, но отсутствии оружия - поиск лута
        if (!bot.currentWeapon || healthPercent < 0.4) {
            // Проверяем известные сундуки
            const nearestChest = lootManager.getChests().find(chest => {
                if (chest.userData.isOpen) return false;
                const chestPos = new THREE.Vector3(chest.position.x, chest.position.y, chest.position.z);
                return bot.position.distanceTo(chestPos) < 70;
            });
            
            if (nearestChest) {
                bot.state = 'explore';
                bot.patrolTarget = new THREE.Vector3(
                    nearestChest.position.x,
                    nearestChest.position.y,
                    nearestChest.position.z
                );
                this.lastChestCheck = 3;
                this.stateTimer = 7;
                return;
            }
        }
        
        // Убегаем от сильных противников
        const nearestEnemy = entityManager.getNearestEnemy(bot.position, 25);
        if (nearestEnemy && 
            !bot.allies.includes(nearestEnemy) && 
            (nearestEnemy.health > bot.health * 1.5 || !bot.currentWeapon)) {
            bot.state = 'flee';
            bot.target = nearestEnemy;
            this.stateTimer = 5;
            return;
        }
        
        // По умолчанию - исследуем территорию
        bot.state = 'explore';
        this.stateTimer = 3 + Math.random() * 5;
        
        // Если алгоритм выбрал режим исследования - создаем новую точку для патрулирования
        if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 3) {
            this.setNewPatrolTarget(bot, 30, 50);
        }
    }
    
    // Решения для скрытной стратегии
    makeStealthyDecision(bot, entityManager, lootManager, healthPercent) {
        // Формирование союзов для выживания
        if (healthPercent < 0.4 && bot.allies.length === 0) {
            const potentialAlly = entityManager.getEntities().find(entity => 
                entity !== bot && 
                entity.isAlive && 
                entity.health > bot.health && 
                bot.position.distanceTo(entity.position) < 30
            );
            
            if (potentialAlly) {
                this.formAlliance(bot, potentialAlly);
                return;
            }
        }
        
        // Избегаем любых противников при скрытном режиме
        const nearEnemies = entityManager.getEntities().filter(entity => 
            entity !== bot && 
            entity.isAlive && 
            !bot.allies.includes(entity) && 
            bot.position.distanceTo(entity.position) < 40
        );
        
        if (nearEnemies.length > 0) {
            // Убегаем от ближайшего
            bot.state = 'flee';
            bot.target = nearEnemies[0];
            this.stateTimer = 7;
            return;
        }
        
        // Ищем ресурсы вдали от других
        const farChests = lootManager.getChests().filter(chest => {
            if (chest.userData.isOpen) return false;
            
            const chestPos = new THREE.Vector3(chest.position.x, chest.position.y, chest.position.z);
            const distToBot = bot.position.distanceTo(chestPos);
            
            // Проверяем, что рядом с сундуком нет других ботов
            const hasEnemiesNearby = entityManager.getEntities().some(entity => 
                entity !== bot && 
                entity.isAlive && 
                entity.position.distanceTo(chestPos) < 20
            );
            
            return distToBot < 100 && !hasEnemiesNearby;
        });
        
        if (farChests.length > 0) {
            const targetChest = farChests[0];
            bot.state = 'explore';
            bot.patrolTarget = new THREE.Vector3(
                targetChest.position.x,
                targetChest.position.y,
                targetChest.position.z
            );
            this.stateTimer = 8;
            return;
        }
        
        // Патрулируем скрытно, избегая центра карты
        bot.state = 'patrol';
        if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 5) {
            // Выбираем точку подальше от центра
            const angle = Math.random() * Math.PI * 2;
            const distance = 100 + Math.random() * 150;
            bot.patrolTarget = new THREE.Vector3(
                Math.cos(angle) * distance,
                0,
                Math.sin(angle) * distance
            );
        }
    }
    
    // Решения для засадной стратегии
    makeAmbushDecision(bot, entityManager, healthPercent, hasStrongWeapon) {
        // Если бот уже в засаде - проверяем наличие целей
        if (bot.state === 'ambush' && this.stateTimer > 0) {
            // Проверяем, не появился ли кто-то в поле зрения
            const potentialVictims = entityManager.getEntities().filter(entity => 
                entity !== bot && 
                entity.isAlive && 
                !bot.allies.includes(entity) && 
                bot.position.distanceTo(entity.position) < 20
            );
            
            // Если жертва подошла близко - атакуем
            if (potentialVictims.length > 0 && healthPercent > 0.5 && hasStrongWeapon) {
                const victim = potentialVictims[0];
                bot.state = 'hunt';
                bot.target = victim;
                this.stateTimer = 5;
                return;
            }
            
            // Продолжаем сидеть в засаде
            return;
        }
        
        // Устанавливаем точку засады рядом с ресурсами или в стратегическом месте
        if (Math.random() < 0.7) {
            // Ищем стратегическую точку (вблизи центра, но не совсем в центре)
            const angle = Math.random() * Math.PI * 2;
            const distance = 50 + Math.random() * 30; // Относительно близко к центру
            
            bot.patrolTarget = new THREE.Vector3(
                Math.cos(angle) * distance,
                0,
                Math.sin(angle) * distance
            );
            
            bot.state = 'ambush';
            this.stateTimer = 15 + Math.random() * 10; // Ждем в засаде 15-25 секунд
            return;
        }
        
        // Если не нашли хорошую точку - обычное патрулирование
        bot.state = 'patrol';
        if (!bot.patrolTarget || bot.position.distanceTo(bot.patrolTarget) < 5) {
            this.setNewPatrolTarget(bot, 40, 70);
        }
    }
    
    // Решения для патрульной стратегии
    makePatrolDecision(bot, entityManager, lootManager) {
        // При патрулировании периодически меняем цель
        if (bot.state !== 'patrol' || !bot.patrolTarget || 
            bot.position.distanceTo(bot.patrolTarget) < 5 || 
            this.stateTimer <= 0) {
            
            // Решаем, куда патрулировать
            if (Math.random() < 0.3 || !bot.currentWeapon) {
                // Идем к сундукам, если они известны или ищем новые
                const nearestChest = lootManager.getChests().find(chest => {
                    if (chest.userData.isOpen) return false;
                    const chestPos = new THREE.Vector3(chest.position.x, chest.position.y, chest.position.z);
                    return bot.position.distanceTo(chestPos) < 80;
                });
                
                if (nearestChest) {
                    bot.state = 'explore';
                    bot.patrolTarget = new THREE.Vector3(
                        nearestChest.position.x,
                        nearestChest.position.y,
                        nearestChest.position.z
                    );
                    this.stateTimer = 8;
                    return;
                }
            }
            
            // Патрулирование с учетом последних известных позиций врагов
            const enemyLocations = Object.values(this.memory.lastSeenEnemies);
            
            if (enemyLocations.length > 0 && Math.random() < 0.4) {
                // Патрулируем в район, где были замечены враги
                const randomEnemyLocation = enemyLocations[Math.floor(Math.random() * enemyLocations.length)];
                
                // Не подходим слишком близко
                const direction = new THREE.Vector3()
                    .subVectors(randomEnemyLocation.position, bot.position)
                    .normalize()
                    .multiplyScalar(20 + Math.random() * 30);
                
                bot.patrolTarget = randomEnemyLocation.position.clone().add(direction);
                bot.state = 'patrol';
                this.stateTimer = 10;
                return;
            }
            
            // Случайное патрулирование
            bot.state = 'patrol';
            this.setNewPatrolTarget(bot, 40, 80);
            this.stateTimer = 8 + Math.random() * 7;
        }
    }
    
    // Обновление памяти о противниках
    updateMemory(bot, entityManager) {
        // Обновляем только если бот жив
        if (!bot.isAlive) return;
        
        // Очищаем устаревшие записи (старше 30 секунд)
        const now = performance.now();
        const obsoleteThreshold = 30000; // 30 секунд
        
        for (const id in this.memory.lastSeenEnemies) {
            if (now - this.memory.lastSeenEnemies[id].lastSeen > obsoleteThreshold) {
                delete this.memory.lastSeenEnemies[id];
            }
        }
    }
    
    // Формирование союза
    formAlliance(bot, target) {
        bot.state = 'ally';
        bot.target = target;
        
        // Инициализация массивов союзников, если необходимо
        if (!target.allies) target.allies = [];
        
        // Добавление в союзники
        if (!target.allies.includes(bot)) {
            target.allies.push(bot);
        }
        if (!bot.allies.includes(target)) {
            bot.allies.push(target);
        }
        
        // Время в состоянии союзника
        this.stateTimer = 15 + Math.random() * 10;
    }
    
    // Установка новой точки патрулирования
    setNewPatrolTarget(bot, minDist, maxDist) {
        const angle = Math.random() * Math.PI * 2;
        const distance = minDist + Math.random() * (maxDist - minDist);
        
        bot.patrolTarget = new THREE.Vector3(
            Math.cos(angle) * distance,
            0,
            Math.sin(angle) * distance
        );
    }
    
    // Новые методы для дополнительных состояний
    handleAmbush(bot, delta, entityManager) {
        // В режиме засады бот остается на месте и ждет жертв
        // Только поворачивает голову в сторону ближайшего врага, если такой есть
        const nearestEnemy = entityManager.getNearestEnemy(bot.position, 30);
        
        if (nearestEnemy && !bot.allies.includes(nearestEnemy)) {
            // Только смотрим, но не двигаемся
            bot.lookAt(nearestEnemy.position);
            
            // Если враг подошел слишком близко и мы вооружены - атакуем
            const distance = bot.position.distanceTo(nearestEnemy.position);
            
            if (distance < 10 && bot.currentWeapon && this.attackCooldown <= 0) {
                // Внезапная атака
                if (bot.currentWeapon.type === 'bow' || bot.currentWeapon.type === 'laser') {
                    const direction = new THREE.Vector3()
                        .subVectors(nearestEnemy.position, bot.position)
                        .normalize();
                    const result = bot.currentWeapon.attack(bot, null);
                    if (result && result.projectile) {
                        result.projectile.direction = direction;
                        result.projectile.owner = bot;
                        entityManager.addProjectile(result.projectile);
                    }
                } else {
                    const result = bot.currentWeapon.attack(bot, nearestEnemy);
                    if (result && result.hit) {
                        nearestEnemy.takeDamage(result.damage, result.isHeadshot);
                    }
                }
                this.attackCooldown = bot.currentWeapon.cooldown;
                
                // После атаки можем перейти в режим охоты
                if (Math.random() < 0.7) {
                    bot.state = 'hunt';
                    bot.target = nearestEnemy;
                    this.stateTimer = 10;
                }
            }
        }
        
        // По истечении времени засады или если нет врагов рядом - возвращаемся к патрулированию
        if (this.stateTimer <= 0) {
            bot.state = 'patrol';
            this.setNewPatrolTarget(bot, 30, 70);
        }
    }
    
    handlePatrol(bot, delta, entityManager, lootManager) {
        // В режиме патрулирования бот ходит по заданным точкам и осматривается
        if (!bot.patrolTarget) {
            this.setNewPatrolTarget(bot, 20, 60);
        }
        
        // Движение к точке патрулирования
        if (bot.patrolTarget) {
            const distance = bot.position.distanceTo(bot.patrolTarget);
            
            // Если пришли к точке - задаем новую
            if (distance < 3) {
                // Небольшая пауза перед сменой направления
                if (Math.random() < 0.1) {
                    this.setNewPatrolTarget(bot, 20, 60);
                }
            } else {
                // Двигаемся к точке с разной скоростью в зависимости от личности
                const speed = bot.physics.speed * (0.6 + this.personality.courage * 0.3);
                bot.moveTowards(bot.patrolTarget, speed);
            }
        }
        
        // Проверка сундуков поблизости
        const nearestChest = lootManager.getChests().find(chest => {
            if (chest.userData.isOpen) return false;
            const chestPos = new THREE.Vector3(chest.position.x, chest.position.y, chest.position.z);
            return bot.position.distanceTo(chestPos) < 5;
        });
        
        if (nearestChest) {
            const loot = lootManager.tryOpenChest(nearestChest, bot);
            if (loot) {
                bot.pickupLoot(loot);
            }
        }
        
        // Если закончилось время патрулирования - переходим к другому состоянию
        if (this.stateTimer <= 0) {
            // Обновляем стратегию и принимаем новое решение
            this.decisionCooldown = 0;
            this.makeDecision(bot, entityManager, lootManager);
        }
    }

    handleSpawn(bot, delta) {
        // Более стратегический разбег от центра
        const center = new THREE.Vector3(0, 0, 0);
        
        // Выбираем направление в зависимости от номера бота (распределение по секторам)
        const angle = (bot.id / 20) * Math.PI * 2; // Равномерно распределяем по кругу
        const direction = new THREE.Vector3(
            Math.cos(angle),
            0,
            Math.sin(angle)
        );
        
        // Увеличиваем начальное отклонение
        const minDist = 15;
        const maxDist = 25;
        const distance = minDist + (maxDist - minDist) * this.personality.aggression;
        
        const targetPos = center.clone().add(direction.multiplyScalar(distance));
        
        // Агрессивные боты бегут быстрее к центру
        const speed = bot.physics.speed * (1 + this.personality.aggression * 0.2);
        bot.moveTowards(targetPos, speed);
        
        // После разбегания на достаточное расстояние, переходим к исследованию
        if (bot.position.distanceTo(center) > minDist) {
            // Более разумные боты быстрее переходят к сбору лута
            bot.state = this.personality.intelligence > 0.5 ? 'explore' : 'patrol';
        }
    }

    handleExplore(bot, delta, lootManager, entityManager) {
        if (!bot.patrolTarget) {
            // Создаем новую точку исследования
            this.setNewPatrolTarget(bot, 30, 60);
            return;
        }
        
        // Движение к цели с учетом личности бота
        const speed = bot.physics.speed * (0.6 + this.personality.greed * 0.3);
        bot.moveTowards(bot.patrolTarget, speed);
        
        // Проверка сундуков поблизости с разной вероятностью обнаружения
        const searchRadius = 3 + this.personality.intelligence * 2; // Умные боты видят сундуки дальше
        
        const nearestChest = lootManager.getChests().find(chest => {
            if (chest.userData.isOpen) return false;
            const chestPos = new THREE.Vector3(chest.position.x, chest.position.y, chest.position.z);
            return bot.position.distanceTo(chestPos) < searchRadius;
        });

        if (nearestChest) {
            // Запоминаем сундук для будущего использования
            if (this.memory.knownChests.findIndex(c => c.x === nearestChest.position.x && 
                                                   c.z === nearestChest.position.z) === -1) {
                this.memory.knownChests.push({
                    x: nearestChest.position.x,
                    y: nearestChest.position.y,
                    z: nearestChest.position.z,
                    isOpen: false
                });
            }
            
            // Открываем сундук
            const loot = lootManager.tryOpenChest(nearestChest, bot);
            if (loot) {
                bot.pickupLoot(loot);
                
                // Отмечаем сундук как открытый в памяти
