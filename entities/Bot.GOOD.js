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
            speed: 6 + Math.random() * 2
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
        this.state = 'spawn';
        this.target = null;
        this.allies = [];
        this.lastStateChange = 0;
        this.patrolTarget = null;
        
        // Визуализация
        this.mesh = this.createMesh();
        this.scene.add(this.mesh);
        
        // Цвет для различия - ЯРКИЕ цвета Roblox
        const colors = [
            0xFF4444, 0xFF8844, 0xFFFF44, 0x88FF44,
            0x44FF44, 0x44FF88, 0x44FFFF, 0x4488FF,
            0x4444FF, 0x8844FF, 0xFF44FF, 0xFF4488
        ];
        this.color = colors[id % colors.length];
        this.updateColor();
    }

    createMesh() {
        const group = new THREE.Group();
        
        // КРАСИВЫЙ Roblox стиль - детализированный но оптимизированный
        const bodyMat = new THREE.MeshStandardMaterial({ 
            color: this.color,
            roughness: 0.5,
            metalness: 0.2,
            flatShading: true
        });
        
        const headMat = new THREE.MeshStandardMaterial({ 
            color: 0xFFDBAC,
            roughness: 0.6,
            flatShading: true
        });
        
        // Тело
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 1.1, 0.5),
            bodyMat
        );
        body.position.y = 0.85;
        group.add(body);
        
        // Голова - слегка округленная
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.6, 0.6),
            headMat
        );
        head.position.y = 1.7;
        group.add(head);
        
        // Глаза - выразительные
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.12, 0.05),
            eyeMat
        );
        leftEye.position.set(-0.15, 1.75, 0.31);
        group.add(leftEye);
        
        const rightEye = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.12, 0.05),
            eyeMat
        );
        rightEye.position.set(0.15, 1.75, 0.31);
        group.add(rightEye);
        
        // Улыбка
        const smile = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.05, 0.05),
            new THREE.MeshStandardMaterial({ color: 0x444444 })
        );
        smile.position.set(0, 1.62, 0.31);
        group.add(smile);
        
        // Руки
        const armMat = new THREE.MeshStandardMaterial({ 
            color: this.color,
            roughness: 0.5,
            flatShading: true
        });
        
        const leftArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.9, 0.25),
            armMat
        );
        leftArm.position.set(-0.475, 0.7, 0);
        group.add(leftArm);
        
        const rightArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.9, 0.25),
            armMat
        );
        rightArm.position.set(0.475, 0.7, 0);
        group.add(rightArm);
        
        // Ноги
        const legMat = new THREE.MeshStandardMaterial({ 
            color: 0x424242,
            roughness: 0.7,
            flatShading: true
        });
        
        const leftLeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.85, 0.3),
            legMat
        );
        leftLeg.position.set(-0.2, 0.25, 0);
        group.add(leftLeg);
        
        const rightLeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.85, 0.3),
            legMat
        );
        rightLeg.position.set(0.2, 0.25, 0);
        group.add(rightLeg);
        
        // Аксессуар (разный для каждого бота)
        const accessoryType = this.id % 6;
        
        if (accessoryType === 0) {
            // Шляпа
            const hat = new THREE.Mesh(
                new THREE.CylinderGeometry(0.35, 0.4, 0.3, 8),
                new THREE.MeshStandardMaterial({ color: 0xDD2C00, flatShading: true })
            );
            hat.position.set(0, 2.1, 0);
            group.add(hat);
        } else if (accessoryType === 1) {
            // Кепка
            const cap = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, 0.15, 0.35),
                new THREE.MeshStandardMaterial({ color: 0x1565C0, flatShading: true })
            );
            cap.position.set(0, 2.05, 0.1);
            group.add(cap);
        } else if (accessoryType === 2) {
            // Очки
            const glasses = new THREE.Mesh(
                new THREE.BoxGeometry(0.35, 0.12, 0.05),
                new THREE.MeshStandardMaterial({ color: 0x212121, metalness: 0.8, flatShading: true })
            );
            glasses.position.set(0, 1.75, 0.33);
            group.add(glasses);
        } else if (accessoryType === 3) {
            // Повязка
            const band = new THREE.Mesh(
                new THREE.TorusGeometry(0.35, 0.05, 8, 16),
                new THREE.MeshStandardMaterial({ color: 0xFFD600, flatShading: true })
            );
            band.position.set(0, 1.85, 0);
            band.rotation.x = Math.PI / 2;
            group.add(band);
        } else if (accessoryType === 4) {
            // Шлем
            const helmet = new THREE.Mesh(
                new THREE.SphereGeometry(0.35, 8, 8, 0, Math.PI * 2, 0, Math.PI / 1.5),
                new THREE.MeshStandardMaterial({ color: 0x607D8B, metalness: 0.6, flatShading: true })
            );
            helmet.position.set(0, 1.9, 0);
            group.add(helmet);
        }
        
        group.userData.isEntity = true;
        group.userData.isBot = true;
        group.userData.botId = this.id;
        return group;
    }

    updateColor() {
        this.mesh.traverse(child => {
            if (child.material && child.material.color && child.position.y < 1.5) {
                child.material.color.setHex(this.color);
            }
        });
    }

    update(delta, brain, entityManager, lootManager, audioSynth) {
        if (!this.isAlive) return;

        // Обновление ИИ
        brain.update(this, delta, entityManager, lootManager, audioSynth);

        // Обновление позиции меша
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation.y;

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
    }

    moveTowards(target, speed) {
        const direction = new THREE.Vector3()
            .subVectors(target, this.position)
            .normalize();
        
        this.physics.velocity.x = direction.x * speed;
        this.physics.velocity.z = direction.z * speed;
        
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
        
        const attackRange = weapon.type === 'laser' ? 40 : 
                           weapon.type === 'bow' ? 25 : 
                           weapon.type === 'fists' ? 2.5 : 3;
        
        if (distance > attackRange) return null;
        
        if (weapon.type === 'laser' || weapon.type === 'bow') {
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

