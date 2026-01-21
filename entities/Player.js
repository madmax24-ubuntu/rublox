import * as THREE from 'three';
import { Inventory } from '../items/Inventory.js';
import { Weapon } from '../items/Weapon.js';

export class Player {
    constructor(scene, camera, input) {
        this.scene = scene;
        this.camera = camera;
        this.input = input;
        
        // Позиция и физика
        this.position = new THREE.Vector3(0, 5, 0);
        this.rotation = new THREE.Euler(0, 0, 0);
        this.physics = {
            velocity: new THREE.Vector3(0, 0, 0),
            onGround: false,
            height: 1.7,
            radius: 0.4,
            speed: 8
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
        this.fists = new Weapon('fists', this.scene);
        
        // Визуализация
        this.mesh = this.createMesh();
        this.scene.add(this.mesh);

        this.fpArms = this.createFirstPersonArms();
        this.camera.add(this.fpArms);
        this.setupViewModel(this.fpArms);
        this.fpArms.visible = false;
        this.viewWeapon = null;
        this.viewKick = 0;
        this.punchTime = 0;
        this.punchDuration = 0.25;
        this.audioSynthRef = null;
        
        // Управление камерой
        this.cameraOffset = new THREE.Vector3(0, 1.5, 0);
        this.mouseSensitivity = 0.001; // Уменьшаем чувствительность
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        // Анимация
        this.animationState = 'idle';
        this.lastFootstepTime = 0;
        this.coyoteTime = 0;
        this.coyoteDuration = 0.12;
        this.jumpBufferTime = 0;
        this.jumpBufferDuration = 0.12;
        this.slowTimer = 0;
        this.slowFactor = 1;
    }

    createFirstPersonArms() {
        const group = new THREE.Group();
        const armMat = new THREE.MeshStandardMaterial({
            color: 0x4a90e2,
            roughness: 0.35,
            metalness: 0.0,
            flatShading: true
        });
        const handMat = new THREE.MeshStandardMaterial({
            color: 0xffd6b5,
            roughness: 0.4,
            metalness: 0.0,
            flatShading: true
        });

        const leftArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.5, 0.16),
            armMat
        );
        leftArm.position.set(-0.26, -0.45, -0.62);
        group.add(leftArm);

        const rightArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.5, 0.16),
            armMat
        );
        rightArm.position.set(0.26, -0.45, -0.62);
        group.add(rightArm);

        const leftHand = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.16, 0.16),
            handMat
        );
        leftHand.position.set(-0.26, -0.62, -0.8);
        group.add(leftHand);

        const rightHand = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.16, 0.16),
            handMat
        );
        rightHand.position.set(0.26, -0.62, -0.8);
        group.add(rightHand);

        group.userData.limbs = { leftArm, rightArm, leftHand, rightHand };
        group.userData.base = {
            leftArm: leftArm.position.clone(),
            rightArm: rightArm.position.clone(),
            leftHand: leftHand.position.clone(),
            rightHand: rightHand.position.clone()
        };

        group.scale.setScalar(1.0);
        return group;
    }

    setupViewModel(object) {
        object.traverse(child => {
            if (child.isMesh) {
                child.renderOrder = 999;
                child.frustumCulled = false;
                if (child.material) {
                    child.material.depthTest = false;
                    child.material.depthWrite = false;
                }
            }
        });
    }

    createMesh() {
        const group = new THREE.Group();
        
        // Тело (Roblox стиль) - простой и быстрый
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x4a90e2,
            roughness: 0.35,
            metalness: 0.0,
            flatShading: true
        });
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 1.0, 0.6),
            bodyMat
        );
        body.position.y = 0.85;
        group.add(body);
        
        // Голова
        const headMat = new THREE.MeshStandardMaterial({
            color: 0xffd6b5,
            roughness: 0.4,
            metalness: 0.0,
            flatShading: true
        });
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.7, 0.7),
            headMat
        );
        head.position.y = 1.65;
        group.add(head);
        
        // Руки
        const armMat = new THREE.MeshStandardMaterial({
            color: 0x4a90e2,
            roughness: 0.35,
            metalness: 0.0,
            flatShading: true
        });
        const leftArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.9, 0.28),
            armMat
        );
        leftArm.position.set(-0.54, 0.7, 0);
        group.add(leftArm);

        const rightArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.9, 0.28),
            armMat
        );
        rightArm.position.set(0.54, 0.7, 0);
        group.add(rightArm);
        
        // Ноги
        const legMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.5,
            metalness: 0.0,
            flatShading: true
        });
        const leftLeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.32, 0.9, 0.32),
            legMat
        );
        leftLeg.position.set(-0.2, 0.3, 0);
        group.add(leftLeg);

        const rightLeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.32, 0.9, 0.32),
            legMat
        );
        rightLeg.position.set(0.2, 0.3, 0);
        group.add(rightLeg);
        
        group.userData.isEntity = true;
        group.userData.isPlayer = true;
        group.userData.limbs = { leftArm, rightArm, leftLeg, rightLeg };
        return group;
    }

    update(delta, audioSynth, lootManager, entityManager, controls) {
        if (!this.isAlive) return;
        this.audioSynthRef = audioSynth;

        // КАМЕРА УПРАВЛЯЕТСЯ ТОЛЬКО PointerLockControls - НЕ ТРОГАЕМ ЕЕ!
        // Просто получаем направление для движения
        if (controls && controls.isLocked) {
            const euler = new THREE.Euler();
            euler.setFromQuaternion(controls.getObject().quaternion);
            this.rotation.y = euler.y;
            this.rotation.x = euler.x;
        } else {
            const look = this.input.getLookDelta();
            if (look.x !== 0 || look.y !== 0) {
                const maxDelta = 30;
                const dx = Math.max(-maxDelta, Math.min(maxDelta, look.x));
                const dy = Math.max(-maxDelta, Math.min(maxDelta, look.y));
                const sensitivity = this.input.isMobile ? this.mouseSensitivity * 0.9 : this.mouseSensitivity * 1.4;
                this.rotation.y -= dx * sensitivity;
                this.rotation.x -= dy * sensitivity;
                const maxPitch = Math.PI / 2.4;
                this.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.rotation.x));
            }
        }

        // Движение относительно направления камеры
        const isFrozen = this.isFrozen === true;
        const moveVector = isFrozen ? new THREE.Vector3() : this.input.getMovementVector();
        if (this.slowTimer > 0) {
            this.slowTimer = Math.max(0, this.slowTimer - delta);
        } else {
            this.slowFactor = 1;
        }

        if (isFrozen) {
            this.physics.velocity.x = 0;
            this.physics.velocity.z = 0;
        }
        if (moveVector.length() > 0) {
            let moveDirection = new THREE.Vector3();
            
            if (controls && controls.isLocked) {
                // Используем направление камеры для движения
                const cameraDirection = new THREE.Vector3();
                controls.getObject().getWorldDirection(cameraDirection);
                cameraDirection.y = 0; // Убираем вертикальную составляющую
                cameraDirection.normalize();
                
                // Правое направление
                const rightDirection = new THREE.Vector3();
                rightDirection.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));
                
                // Комбинируем направления - ПРАВИЛЬНО (moveVector.z: W=-1, S=+1)
                moveDirection.addScaledVector(cameraDirection, -moveVector.z); // W идет вперед
                moveDirection.addScaledVector(rightDirection, moveVector.x); // D вправо, A влево
                moveDirection.normalize();
            } else {
                // Fallback для случая без controls
                moveDirection.x = moveVector.x * Math.cos(this.rotation.y) - moveVector.z * Math.sin(this.rotation.y);
                moveDirection.z = moveVector.x * Math.sin(this.rotation.y) + moveVector.z * Math.cos(this.rotation.y);
            }
            
            const speed = this.physics.speed * this.slowFactor;
            this.physics.velocity.x = moveDirection.x * speed;
            this.physics.velocity.z = moveDirection.z * speed;
            
            // Звуки шагов
            const currentTime = performance.now() / 1000;
            if (this.physics.onGround && currentTime - this.lastFootstepTime > 0.5 && audioSynth) {
                audioSynth.playFootstep();
                this.lastFootstepTime = currentTime;
            }
            
            this.animationState = 'walking';
        } else {
            this.physics.velocity.x *= 0.8;
            this.physics.velocity.z *= 0.8;
            this.animationState = 'idle';
        }

        // Прыжок
        if (!isFrozen && this.input.isKeyPressed('Space')) {
            this.jumpBufferTime = this.jumpBufferDuration;
        }

        if (this.physics.onGround) {
            this.coyoteTime = this.coyoteDuration;
        } else {
            this.coyoteTime = Math.max(0, this.coyoteTime - delta);
        }

        if (!isFrozen && this.jumpBufferTime > 0) {
            if (this.physics.onGround || this.coyoteTime > 0) {
                this.physics.velocity.y = 10.2;
                this.physics.onGround = false;
                this.jumpBufferTime = 0;
                this.coyoteTime = 0;
            }
        }
        this.jumpBufferTime = Math.max(0, this.jumpBufferTime - delta);

        // Обновление позиции меша
        this.mesh.position.copy(this.position);
        this.mesh.position.y = this.position.y - (this.physics.height - 0.15);
        this.mesh.rotation.y = this.rotation.y;
        this.animateLimbs();

        // Полностью фиксированное позиционирование камеры
        const cameraPosition = new THREE.Vector3(
            Math.round(this.position.x * 100) / 100,
            this.position.y + this.cameraOffset.y,
            Math.round(this.position.z * 100) / 100
        );
        
        if (controls && controls.isLocked) {
            // Прямая установка позиции без интерполяции и округлений
            controls.getObject().position.copy(cameraPosition);
            
            // Принудительная фиксация высоты камеры (критично для предотвращения плавания)
            controls.getObject().position.y = this.position.y + this.cameraOffset.y;
            
            // Блокируем любые микро-движения, делая дискретные шаги
            if (this.lastCameraPosition) {
                const dist = cameraPosition.distanceTo(this.lastCameraPosition);
                if (dist < 0.05) { // Игнорируем микро-движения
                    controls.getObject().position.copy(this.lastCameraPosition);
                } else {
                    this.lastCameraPosition.copy(cameraPosition);
                }
            } else {
                this.lastCameraPosition = cameraPosition.clone();
            }
        } else {
            // Стандартная камера с жёсткой фиксацией
            this.camera.position.copy(cameraPosition);
            const cameraRotation = new THREE.Euler(
                Math.round(this.rotation.x * 10) / 10, // Округляем для устранения микро-дрожания
                Math.round(this.rotation.y * 10) / 10,
                0
            );
            this.camera.rotation.copy(cameraRotation);
        }

        const isFirstPerson = controls && controls.isLocked;
        if (isFirstPerson) {
            this.mesh.visible = false;
            this.fpArms.visible = true;
            if (this.currentWeapon) this.currentWeapon.setVisible(false);
        } else {
            this.mesh.visible = true;
            this.fpArms.visible = false;
            if (this.currentWeapon) this.currentWeapon.setVisible(true);
        }
        this.animateViewModel(isFirstPerson);

        // Переключение слотов инвентаря
        for (let i = 0; i <= 9; i++) {
            if (this.input.isKeyPressed(`Digit${i}`) || this.input.isKeyPressed(`Numpad${i}`)) {
                this.selectSlot(i);
            }
        }

        // Атака
        if (!isFrozen && this.input.isKeyPressed('MouseLeft')) {
            const activeWeapon = this.currentWeapon || this.fists;
            if (activeWeapon.type === 'bow' || activeWeapon.type === 'laser') {
                const direction = new THREE.Vector3();
                this.camera.getWorldDirection(direction);
                const result = activeWeapon.attack(this, null, audioSynth, direction);
                if (result && result.projectile) {
                    result.projectile.direction = direction;
                    result.projectile.owner = this;
                    const muzzle = new THREE.Vector3();
                    this.camera.getWorldPosition(muzzle);
                    muzzle.add(direction.clone().multiplyScalar(0.6));
                    result.projectile.mesh.position.copy(muzzle);
                    if (result.projectile.velocity) {
                        result.projectile.velocity.copy(direction).multiplyScalar(result.projectile.speed);
                    }
                    result.projectile.mesh.lookAt(muzzle.clone().add(direction));
                    entityManager.addProjectile(result.projectile);
                    this.viewKick = 0.25;
                }
            } else {
                const target = entityManager.getNearestEnemy(this.position, activeWeapon.range);
                if (target) {
                    const result = activeWeapon.attack(this, target, audioSynth);
                    if (result && result.hit) {
                        target.takeDamage(result.damage, result.isHeadshot, this, result.knockback || 0);
                        this.viewKick = 0.3;
                    }
                }
            }
            if (activeWeapon.type === 'fists' || activeWeapon.type === 'knife') {
                if (this.punchTime <= 0) {
                    this.punchTime = this.punchDuration;
                }
            }
        }

        // Взаимодействие с сундуками
        if (!isFrozen && this.input.isKeyPressed('KeyE')) {
            const nearestChest = lootManager.getChests().find(chest => {
                if (chest.userData.isOpen) return false;
                return this.position.distanceTo(chest.position) < 3;
            });
            
            if (nearestChest) {
                const loot = lootManager.tryOpenChest(nearestChest, this, audioSynth);
                if (loot) {
                    this.pickupLoot(loot);
                }
            }
        }

        // Проверка сундуков поблизости
        lootManager.checkNearbyChests(this.position, audioSynth);

        // Обновление оружия
        if (!isFirstPerson && this.currentWeapon && this.currentWeapon.mesh) {
            const weaponPos = this.position.clone();
            weaponPos.y += 1.2;
            weaponPos.x += Math.cos(this.rotation.y) * 0.5;
            weaponPos.z += Math.sin(this.rotation.y) * 0.5;
            
            this.currentWeapon.setPosition(weaponPos);
            this.currentWeapon.setRotation(this.rotation);
        }
        this.punchTime = Math.max(0, this.punchTime - delta);
    }

    animateLimbs() {
        const limbs = this.mesh?.userData?.limbs;
        if (!limbs) return;

        const speed = Math.sqrt(
            this.physics.velocity.x * this.physics.velocity.x +
            this.physics.velocity.z * this.physics.velocity.z
        );
        const speedNorm = Math.min(1, speed / this.physics.speed);
        const time = performance.now() / 1000;

        if (speedNorm > 0.05) {
            const swing = Math.sin(time * 10) * 0.8 * speedNorm;
            limbs.leftArm.rotation.x = swing;
            limbs.rightArm.rotation.x = -swing;
            limbs.leftLeg.rotation.x = -swing;
            limbs.rightLeg.rotation.x = swing;
        } else {
            const idle = Math.sin(time * 2) * 0.08;
            limbs.leftArm.rotation.x = idle;
            limbs.rightArm.rotation.x = -idle;
            limbs.leftLeg.rotation.x = -idle;
            limbs.rightLeg.rotation.x = idle;
        }
    }

    animateViewModel(isFirstPerson) {
        if (!isFirstPerson) {
            if (this.viewWeapon) this.viewWeapon.visible = false;
            return;
        }

        if (this.viewWeapon) this.viewWeapon.visible = true;
        const speed = Math.sqrt(
            this.physics.velocity.x * this.physics.velocity.x +
            this.physics.velocity.z * this.physics.velocity.z
        );
        const speedNorm = Math.min(1, speed / this.physics.speed);
        const time = performance.now() / 1000;
        const bob = Math.sin(time * 10) * 0.02 * speedNorm;
        const sway = Math.sin(time * 2.5) * 0.01;
        const swayY = Math.cos(time * 2.0) * 0.008;
        const punch = this.punchTime > 0 ? this.punchTime / this.punchDuration : 0;

        this.viewKick *= 0.85;
        if (this.viewWeapon) {
            this.viewWeapon.position.set(
                0.32 + sway,
                -0.08 - bob - this.viewKick * 0.1 + swayY,
                -0.62 + bob + punch * 0.16
            );
            this.viewWeapon.rotation.set(
                -0.1 + this.viewKick + swayY - punch * 0.6,
                -Math.PI / 2 + sway * 2,
                0
            );
        }
        if (this.fpArms) {
            this.fpArms.position.set(
                0 + sway * 0.6,
                -0.06 - bob * 0.25 + swayY * 0.35,
                punch * 0.1
            );
            this.fpArms.rotation.x = 0;

            const limbs = this.fpArms.userData?.limbs;
            const base = this.fpArms.userData?.base;
            if (limbs && base) {
                const punchZ = punch * 0.18;
                limbs.rightArm.position.copy(base.rightArm).add(new THREE.Vector3(0, 0, -punchZ));
                limbs.rightHand.position.copy(base.rightHand).add(new THREE.Vector3(0, 0, -punchZ));
                limbs.leftArm.position.copy(base.leftArm);
                limbs.leftHand.position.copy(base.leftHand);
                limbs.rightArm.rotation.set(0, 0, 0);
                limbs.rightHand.rotation.set(0, 0, 0);
                limbs.leftArm.rotation.set(0, 0, 0);
                limbs.leftHand.rotation.set(0, 0, 0);
            }
        }
    }

    selectSlot(slot) {
        const weapon = this.inventory.selectSlot(slot);
        if (this.currentWeapon) {
            this.currentWeapon.setVisible(false);
        }

        if (this.viewWeapon) {
            this.camera.remove(this.viewWeapon);
            this.viewWeapon = null;
        }

        if (weapon) {
            this.currentWeapon = weapon;
            this.currentWeapon.setVisible(true);
                if (weapon.mesh) {
                    const viewClone = weapon.mesh.clone(true);
                    viewClone.visible = true;
                    viewClone.position.set(0.32, -0.08, -0.62);
                    viewClone.rotation.set(-0.12, -Math.PI / 2, 0);
                    viewClone.scale.setScalar(1.1);
                    this.setupViewModel(viewClone);
                    this.camera.add(viewClone);
                this.viewWeapon = viewClone;
            } else {
                this.viewWeapon = null;
            }
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

    takeDamage(damage, isHeadshot = false, attacker = null, knockbackStrength = 0) {
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
        this.flashDamage();
        if (this.audioSynthRef && this.audioSynthRef.playHurt) {
            this.audioSynthRef.playHurt();
        }
        if (attacker && this.isAlive) {
            const strength = knockbackStrength > 0 ? knockbackStrength : 3;
            const dir = new THREE.Vector3().subVectors(this.position, attacker.position).normalize();
            this.physics.velocity.x += dir.x * strength;
            this.physics.velocity.z += dir.z * strength;
            this.physics.velocity.y += 2;
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

    applySlow(factor, duration) {
        this.slowFactor = Math.min(this.slowFactor, factor);
        this.slowTimer = Math.max(this.slowTimer, duration);
    }

    flashDamage() {
        const tint = (root) => {
            root.traverse(child => {
                if (!child.material || !child.material.color) return;
                if (!child.userData.baseColor) {
                    child.userData.baseColor = child.material.color.getHex();
                }
                child.material.color.setHex(0xff4d4d);
            });
        };
        const clear = (root) => {
            root.traverse(child => {
                if (!child.material || !child.userData.baseColor) return;
                child.material.color.setHex(child.userData.baseColor);
            });
        };
        tint(this.mesh);
        if (this.fpArms) tint(this.fpArms);
        setTimeout(() => {
            clear(this.mesh);
            if (this.fpArms) clear(this.fpArms);
        }, 120);
    }
}
















