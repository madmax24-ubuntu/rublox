import * as THREE from 'three';
import { Inventory } from '../items/Inventory.js';
import { Weapon } from '../items/Weapon.js';

export class Bot {
    constructor(scene, id, spawnPosition) {
        this.scene = scene;
        this.id = id;
        
        // Позиция и физика
        this.position = spawnPosition.clone();
        this.rotation = new THREE.Euler(0, Math.random() * Math.PI * 2, 0);
        this.physics = {
            velocity: new THREE.Vector3(0, 0, 0),
            onGround: false,
            height: 1.7,
            radius: 0.4,
            speed: 6 + Math.random() * 2 // Разная скорость ботов
        };
        
        // Характеристики
        this.health = 100;
        this.maxHealth = 100;
        this.armor = 0;
        this.maxArmor = 100;
        this.isInvulnerable = false;
        this.isAlive = true;
        
        // Инвентарь и оружие
        this.inventory = new Inventory();
        this.currentWeapon = null;
        
        // ИИ состояние
        this.state = 'spawn'; // spawn, explore, hunt, flee, ally, betray
        this.target = null;
        this.allies = [];
        this.lastStateChange = 0;
        this.patrolTarget = null;
        
        // Визуализация
        this.mesh = this.createMesh();
        this.scene.add(this.mesh);
        
        // Цвет для различия - более яркие и насыщенные цвета
        const colors = [
            0xff4444, // Красный
            0x44ff44, // Зеленый
            0x4444ff, // Синий
            0xffff44, // Желтый
            0xff44ff, // Пурпурный
            0x44ffff, // Голубой
            0xff8844, // Оранжевый
            0x8844ff  // Фиолетовый
        ];
        this.color = colors[id % colors.length];
        this.updateColor();
    }

    createMesh() {
        const group = new THREE.Group();
        
        // ПРОСТОЙ Roblox стиль - БЫСТРО И КРАСИВО
        const bodyMat = new THREE.MeshStandardMaterial({ 
            color: this.color,
            roughness: 0.6,
            metalness: 0.1,
            flatShading: true
        });
        
        const headMat = new THREE.MeshStandardMaterial({ 
            color: 0xffdbac,
            roughness: 0.7,
            flatShading: true
        });
        
        // Тело - простой куб
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 1, 0.4),
            bodyMat
        );
        body.position.y = 0.85;
        group.add(body);
        
        // Голова - простой куб
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.5, 0.5),
            headMat
        );
        head.position.y = 1.6;
        group.add(head);
        
        // Руки - простые кубы
        const armMat = new THREE.MeshStandardMaterial({ 
            color: this.color,
            roughness: 0.6,
            flatShading: true
        });
        
        const leftArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.8, 0.2),
            armMat
        );
        leftArm.position.set(-0.4, 0.6, 0);
        group.add(leftArm);
        
        const rightArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.8, 0.2),
            armMat
        );
        rightArm.position.set(0.4, 0.6, 0);
        group.add(rightArm);
        
        // Ноги - простые кубы
        const legMat = new THREE.MeshStandardMaterial({ 
            color: 0x424242,
            roughness: 0.7,
            flatShading: true
        });
        
        const leftLeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.8, 0.25),
            legMat
        );
        leftLeg.position.set(-0.15, 0.2, 0);
        group.add(leftLeg);
        
        const rightLeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.8, 0.25),
            legMat
        );
        rightLeg.position.set(0.15, 0.2, 0);
        group.add(rightLeg);
        
        // Глаза - простые кубики
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, flatShading: true });
        
        const leftEye = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.08, 0.05),
            eyeMat
        );
        leftEye.position.set(-0.12, 1.65, 0.26);
        group.add(leftEye);
        
        const rightEye = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.08, 0.05),
            eyeMat
        );
        rightEye.position.set(0.12, 1.65, 0.26);
        group.add(rightEye);
        
        group.userData.isEntity = true;
        group.userData.isBot = true;
        group.userData.botId = this.id;
        return group;
    }
        const bodyGeo = new THREE.BoxGeometry(0.7, 1.1, 0.5);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.85;
        body.castShadow = true;
        group.add(body);
        
        // Голова с более округлой формой
        const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6, 2, 2, 2);
        // Скругляем вершины для более естественного вида
        for (let i = 0; i < headGeo.attributes.position.count; i++) {
            const x = headGeo.attributes.position.getX(i);
            const y = headGeo.attributes.position.getY(i);
            const z = headGeo.attributes.position.getZ(i);
            
            const length = Math.sqrt(x * x + y * y + z * z);
            const normalizedLength = length / 0.5;
            
            headGeo.attributes.position.setX(i, x * (0.9 + 0.1 * normalizedLength));
            headGeo.attributes.position.setY(i, y * (0.9 + 0.1 * normalizedLength));
            headGeo.attributes.position.setZ(i, z * (0.9 + 0.1 * normalizedLength));
        }
        
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.7;
        head.castShadow = true;
        group.add(head);
        
        // Добавляем аксессуар в зависимости от типа
        switch (accessoryIndex) {
            case 0: // Шляпа
                const hatGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.3, 8);
                const hat = new THREE.Mesh(hatGeo, accessoryMat);
                hat.position.set(0, 2.1, 0);
                group.add(hat);
                break;
                
            case 1: // Кепка
                const capGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.2, 8, 1, false, 0, Math.PI);
                const cap = new THREE.Mesh(capGeo, accessoryMat);
                cap.position.set(0, 2.05, 0);
                cap.rotation.set(0.2, 0, 0);
                group.add(cap);
                break;
                
            case 2: // Очки
                const eyeGeo = new THREE.BoxGeometry(0.2, 0.15, 0.05);
                const leftEye = new THREE.Mesh(eyeGeo, accessoryMat);
                leftEye.position.set(-0.15, 1.75, 0.33);
                group.add(leftEye);
                
                const rightEye = new THREE.Mesh(eyeGeo, accessoryMat);
                rightEye.position.set(0.15, 1.75, 0.33);
                group.add(rightEye);
                
                const bridgeGeo = new THREE.BoxGeometry(0.1, 0.05, 0.05);
                const bridge = new THREE.Mesh(bridgeGeo, accessoryMat);
                bridge.position.set(0, 1.75, 0.33);
                group.add(bridge);
                break;
                
            case 3: // Бандана
                const bandanaGeo = new THREE.BoxGeometry(0.7, 0.15, 0.7);
                const bandana = new THREE.Mesh(bandanaGeo, accessoryMat);
                bandana.position.set(0, 1.95, 0);
                group.add(bandana);
                break;
                
            case 4: // Повязка на голову
                const headbandGeo = new THREE.TorusGeometry(0.35, 0.05, 8, 16);
                const headband = new THREE.Mesh(headbandGeo, accessoryMat);
                headband.position.set(0, 1.8, 0);
                headband.rotation.set(Math.PI/2, 0, 0);
                group.add(headband);
                break;
                
            case 5: // Шлем
                const helmetGeo = new THREE.SphereGeometry(0.35, 8, 8, 0, Math.PI * 2, 0, Math.PI/1.3);
                const helmet = new THREE.Mesh(helmetGeo, accessoryMat);
                helmet.position.set(0, 1.85, 0);
                group.add(helmet);
                break;
        }
        
        // Глаза
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const leftEyeGeo = new THREE.PlaneGeometry(0.08, 0.1);
        const leftEye = new THREE.Mesh(leftEyeGeo, eyeMat);
        leftEye.position.set(-0.14, 1.72, 0.31);
        group.add(leftEye);
        
        const rightEyeGeo = new THREE.PlaneGeometry(0.08, 0.1);
        const rightEye = new THREE.Mesh(rightEyeGeo, eyeMat);
        rightEye.position.set(0.14, 1.72, 0.31);
        group.add(rightEye);
        
        // Улыбка или хмурость (зависит от ID)
        const mouthMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const mouthGeo = this.id % 2 === 0 ? 
            new THREE.BoxGeometry(0.2, 0.05, 0.05) : // Улыбка
            new THREE.BoxGeometry(0.15, 0.05, 0.05); // Хмурость
        
        const mouth = new THREE.Mesh(mouthGeo, mouthMat);
        mouth.position.set(0, this.id % 2 === 0 ? 1.60 : 1.65, 0.31);
        if (this.id % 2 === 1) { // Хмурость
            mouth.rotation.z = 0.1;
        }
        group.add(mouth);
        
        // Руки с суставами
        // Плечи
        const shoulderGeo = new THREE.SphereGeometry(0.12, 8, 8);
        const leftShoulder = new THREE.Mesh(shoulderGeo, bodyMat);
        leftShoulder.position.set(-0.4, 1.25, 0);
        group.add(leftShoulder);
        
        const rightShoulder = new THREE.Mesh(shoulderGeo, bodyMat);
        rightShoulder.position.set(0.4, 1.25, 0);
        group.add(rightShoulder);
        
        // Предплечья
        const upperArmGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.4);
        const leftUpperArm = new THREE.Mesh(upperArmGeo, bodyMat);
        leftUpperArm.position.set(-0.4, 1, 0);
        leftUpperArm.rotation.x = 0.3; // Легкий наклон к телу
        leftUpperArm.name = "leftUpperArm"; // Для анимации
        group.add(leftUpperArm);
        
        const rightUpperArm = new THREE.Mesh(upperArmGeo, bodyMat);
        rightUpperArm.position.set(0.4, 1, 0);
        rightUpperArm.rotation.x = -0.3; // Легкий наклон к телу, зеркальный
        rightUpperArm.name = "rightUpperArm"; // Для анимации
        group.add(rightUpperArm);
        
        // Локти
        const elbowGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const leftElbow = new THREE.Mesh(elbowGeo, bodyMat);
        leftElbow.position.set(-0.4, 0.8, 0.05);
        group.add(leftElbow);
        
        const rightElbow = new THREE.Mesh(elbowGeo, bodyMat);
        rightElbow.position.set(0.4, 0.8, 0.05);
        group.add(rightElbow);
        
        // Кисти
        const forearmGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.35);
        const leftForearm = new THREE.Mesh(forearmGeo, bodyMat);
        leftForearm.position.set(-0.4, 0.6, 0.05);
        leftForearm.name = "leftForearm"; // Для анимации
        group.add(leftForearm);
        
        const rightForearm = new THREE.Mesh(forearmGeo, bodyMat);
        rightForearm.position.set(0.4, 0.6, 0.05);
        rightForearm.name = "rightForearm"; // Для анимации
        group.add(rightForearm);
        
        // Ноги с улучшенной геометрией
        const legMat = new THREE.MeshStandardMaterial({ 
            color: 0x424242, // Темно-серый для ног
            roughness: 0.7
        });
        
        // Бедра
        const thighGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.4);
        const leftThigh = new THREE.Mesh(thighGeo, legMat);
        leftThigh.position.set(-0.2, 0.5, 0);
        leftThigh.name = "leftThigh"; // Для анимации
        group.add(leftThigh);
        
        const rightThigh = new THREE.Mesh(thighGeo, legMat);
        rightThigh.position.set(0.2, 0.5, 0);
        rightThigh.name = "rightThigh"; // Для анимации
        group.add(rightThigh);
        
        // Колени
        const kneeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const leftKnee = new THREE.Mesh(kneeGeo, legMat);
        leftKnee.position.set(-0.2, 0.3, 0);
        group.add(leftKnee);
        
        const rightKnee = new THREE.Mesh(kneeGeo, legMat);
        rightKnee.position.set(0.2, 0.3, 0);
        group.add(rightKnee);
        
        // Голени
        const calfGeo = new THREE.CylinderGeometry(0.1, 0.08, 0.3);
        const leftCalf = new THREE.Mesh(calfGeo, legMat);
        leftCalf.position.set(-0.2, 0.15, 0);
        leftCalf.name = "leftCalf"; // Для анимации
        group.add(leftCalf);
        
        const rightCalf = new THREE.Mesh(calfGeo, legMat);
        rightCalf.position.set(0.2, 0.15, 0);
        rightCalf.name = "rightCalf"; // Для анимации
        group.add(rightCalf);
        
        // Ступни
        const footGeo = new THREE.BoxGeometry(0.12, 0.08, 0.2);
        const leftFoot = new THREE.Mesh(footGeo, legMat);
        leftFoot.position.set(-0.2, 0, 0.05);
        group.add(leftFoot);
        
        const rightFoot = new THREE.Mesh(footGeo, legMat);
        rightFoot.position.set(0.2, 0, 0.05);
        group.add(rightFoot);
        
        group.userData.isEntity = true;
        group.userData.isBot = true;
        group.userData.botId = this.id;
        return group;
    }

    updateColor() {
        this.mesh.traverse(child => {
            if (child.material && child.material.color) {
                if (child.position.y > 1.5) {
                    // Голова остается телесного цвета
                    return;
                }
                child.material.color.setHex(this.color);
            }
        });
    }

    update(delta, brain, entityManager, lootManager, audioSynth) {
        if (!this.isAlive) return;

        // Обновление ИИ с анимациями
        brain.update(this, delta, entityManager, lootManager);

        // Обновление позиции меша
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation.y;
        
        // Анимация движения
        this.animateBot(delta);

        // Обновление оружия
        if (this.currentWeapon && this.currentWeapon.mesh) {
            const weaponPos = this.position.clone();
            weaponPos.y += 1.2;
            weaponPos.x += Math.cos(this.rotation.y) * 0.5;
            weaponPos.z += Math.sin(this.rotation.y) * 0.5;
            
            this.currentWeapon.setPosition(weaponPos);
            this.currentWeapon.setRotation(this.rotation);
        }
    }
    
    // Упрощенная анимация для производительности
    animateBot(delta) {
        // Анимация отключена для производительности
        return;
    }

    selectSlot(slot) {
        const weapon = this.inventory.selectSlot(slot);
        if (this.currentWeapon) {
            this.currentWeapon.setVisible(false);
        }
        
        if (weapon) {
            this.currentWeapon = weapon;
            this.currentWeapon.setVisible(true);
        } else {
            this.currentWeapon = null;
        }
    }

    pickupLoot(loot) {
        if (loot.type === 'weapon') {
            const weapon = new Weapon(loot.weaponType, this.scene);
            const result = this.inventory.addItem(weapon);
            if (result.added) {
                if (!this.currentWeapon || !this.inventory.getSelectedWeapon()) {
                    this.selectSlot(result.slot);
                }
            } else {
                weapon.dispose();
            }
        } else if (loot.type === 'armor') {
            this.armor = Math.min(this.maxArmor, this.armor + loot.amount);
        }
    }

    takeDamage(damage, isHeadshot = false) {
        if (this.isInvulnerable) return false;

        const finalDamage = isHeadshot ? damage * 2 : damage;
        
        // Сначала тратится броня
        if (this.armor > 0) {
            const armorDamage = Math.min(this.armor, finalDamage);
            this.armor -= armorDamage;
            const remainingDamage = finalDamage - armorDamage;
            
            if (remainingDamage > 0) {
                this.health -= remainingDamage;
            }
        } else {
            this.health -= finalDamage;
        }

        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
            this.mesh.visible = false;
        }

        return true;
    }

    setInvulnerable(value) {
        this.isInvulnerable = value;
        // Визуальный эффект неуязвимости
        if (value) {
            this.mesh.traverse(child => {
                if (child.material) {
                    child.material.emissive = new THREE.Color(0xffff00);
                    child.material.emissiveIntensity = 0.5;
                }
            });
        } else {
            this.mesh.traverse(child => {
                if (child.material) {
                    child.material.emissive = new THREE.Color(0x000000);
                    child.material.emissiveIntensity = 0;
                }
            });
        }
    }

    moveTowards(target, speed) {
        const direction = new THREE.Vector3()
            .subVectors(target, this.position)
            .normalize();
        
        this.physics.velocity.x = direction.x * speed;
        this.physics.velocity.z = direction.z * speed;
        
        // Поворот к цели
        this.rotation.y = Math.atan2(direction.x, direction.z);
    }

    lookAt(target) {
        const direction = new THREE.Vector3()
            .subVectors(target, this.position)
            .normalize();
        this.rotation.y = Math.atan2(direction.x, direction.z);
    }

    attack(target, entityManager) {
        if (!this.currentWeapon || !target || !target.isAlive) return null;
        
        const distance = this.position.distanceTo(target.position);
        const weapon = this.currentWeapon;
        
        // Проверяем дистанцию атаки
        const attackRange = weapon.type === 'laser' ? 40 : 
                           weapon.type === 'bow' ? 25 : 
                           weapon.type === 'fists' ? 2.5 : 3;
        
        if (distance > attackRange) return null;
        
        // Стреляем или бьем
        if (weapon.type === 'laser' || weapon.type === 'bow') {
            // Дальнобойное оружие
            const direction = new THREE.Vector3()
                .subVectors(target.position, this.position)
                .normalize();
            
            const projectileData = weapon.attack(this, null);
            if (projectileData && projectileData.projectile) {
                projectileData.projectile.direction = direction;
                projectileData.projectile.owner = this;
                if (entityManager) {
                    entityManager.addProjectile(projectileData.projectile);
                }
                return { fired: true, damage: weapon.damage };
            }
        } else {
            // Ближний бой
            const result = weapon.attack(this, target);
            if (result && result.hit) {
                const killed = target.takeDamage(result.damage, result.isHeadshot);
                return { hit: true, damage: result.damage, killed: target.health <= 0 };
            }
        }
        
        return null;
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        
        if (this.currentWeapon) {
            this.currentWeapon.dispose();
        }
        
        this.inventory.getItems().forEach(weapon => {
            if (weapon) weapon.dispose();
        });
    }
}

