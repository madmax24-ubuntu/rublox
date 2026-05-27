import * as THREE from 'three';
import { Inventory } from '../items/Inventory.js';
import { Weapon } from '../items/Weapon.js';

export class Player extends THREE.Group {
    constructor(scene, camera, input) {
        super();
        this.scene = scene;
        this.camera = camera;
        this.input = input;

        this.yaw = new THREE.Group();
        this.pitch = new THREE.Group();
        this.add(this.yaw);
        this.yaw.add(this.pitch);
        this.pitch.add(this.camera);

        this.mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 2.2, 1.2),
            new THREE.MeshLambertMaterial({ color: 0x3333ff })
        );
        this.mesh.position.y = 1.1;
        this.add(this.mesh);

        // ИНИЦИАЛИЗАЦИЯ ИНВЕНТАРЯ — ДОБАВИТЬ ПЕРЕД СОЗДАНИЕМ FISTS!
        this.inventory = new Inventory();

        // Создаем визуализацию для кулаков (fists не создают mesh автоматически)
        const sleeveMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3f });
        const gloveMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        
        // Позиционируем кулаки как FPS-руки — выдвигаем вперед от камеры
        const leftFist = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.18), gloveMat);
        leftFist.position.set(-0.24, -0.22, -0.88);
        const rightFist = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.18), gloveMat);
        rightFist.position.set(0.24, -0.22, -0.88);
        this.fists = new Weapon('fists', this.scene);
        this.fists.mesh = new THREE.Group();
        this.fists.mesh.add(leftFist, rightFist);
        // ВАЖНО: Добавляем кулаки в иерархию pitch для рендеринга!
        this.pitch.add(this.fists.mesh);  
        // Кулаки видимы по умолчанию — они часть тела игрока
        this.currentWeapon = this.fists;
        
        // ЯВНО устанавливаем видимость кулаков после создания mesh (обход бага Weapon.setVisible)
        if (this.fists && this.fists.mesh) {
            this.fists.visible = true;  
            this.fists.mesh.visible = true;
        }
        
        // ВАЖНО: Добавляем кулаки в инвентарь для управления видимостью!
        this.inventory.items[0] = this.fists;  // Слот 0 всегда занят fists
        this.inventory.selectedSlot = 0;

        // Создаем визуализацию рук для первого лица
        this.arms = new THREE.Group();
        
        // Левая рука (предплечье + кисть)
        const leftForearm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.42), sleeveMat);
        leftForearm.position.set(-0.24, -0.2, -0.64);
        leftForearm.name = 'leftForearm';
        
        const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.2), gloveMat);
        leftHand.position.set(-0.24, -0.22, -0.9);
        leftHand.name = 'leftHand';
        
        // Правая рука (предплечье + кисть)
        const rightForearm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.42), sleeveMat);
        rightForearm.position.set(0.24, -0.2, -0.64);
        rightForearm.name = 'rightForearm';
        
        const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.2), gloveMat);
        rightHand.position.set(0.24, -0.22, -0.9);
        rightHand.name = 'rightHand';
        
        this.arms.add(leftForearm, leftHand, rightForearm, rightHand);
        
        // Отключаем frustum culling для всей группы рук и её содержимого
        this.arms.traverse(child => {
            if (child.isMesh) child.frustumCulled = false;
        });
        
        // Позиционируем группу рук относительно КАМЕРЫ — Z отрицательный = перед камерой!
        this.arms.position.set(0, -0.42, -0.38);
        this.camera.add(this.arms);
        this.leftForearm = leftForearm;
        this.rightForearm = rightForearm;
        this.leftHand = leftHand;
        this.rightHand = rightHand;
        
        // Руки видимы по умолчанию в FPS режиме — hide/show управляется через updateViewWeapon()
        this.viewMode = 'fp';
        this.toggleViewLatch = false;
        this.lookSensitivity = 0.002;
        this.jumpForce = 10;
        this.isAlive = true;
        this.isFrozen = false;
        this.isInvulnerable = false;
        this.stats = { kills: 0, deaths: 0, loot: 0 };
        this.health = 100;
        this.maxHealth = 100;

        // Принудительная инициализация оружия в FPS режиме
        setTimeout(() => {
            if (this.currentWeapon && !this.currentWeapon.mesh) {
                this.updateViewWeapon();
            }
        }, 50);

        this.physics = {
            velocity: new THREE.Vector3(),
            onGround: false,
            height: 2.2,
            radius: 0.6
        };
    }

    setInvulnerable(v) { this.isInvulnerable = v; }
    setHUD(hud) { this.hud = hud; }

    applyPerk(perk, baseFootstepVolume) {
        this.perk = perk;
        if (perk === 'thickSkin') {
            this.maxHealth = 150;
            this.health = 150;
        } else {
            this.maxHealth = 100;
            this.health = Math.min(this.health, 100);
        }
        
        if (perk === 'silentStep') {
            this.footstepVolume = (baseFootstepVolume || 0.4) * 0.1;
        } else {
            this.footstepVolume = baseFootstepVolume || 0.4;
        }

        if (this.currentWeapon) {
            this.currentWeapon.applyPerk?.(perk);
        }
    }

    update(delta, audioSynth, lootManager, entityManager) {
        if (!this.isAlive) return;
        
        this.handleLook();
        if (!this.isFrozen) {
            this.handleMovement(delta);
        } else {
            this.physics.velocity.x = 0;
            this.physics.velocity.z = 0;
        }
        this.handleActions(delta, audioSynth, entityManager, lootManager);
        this.updateCamera();
        this.updateViewWeapon();
    }

    handleLook() {
        const lookDelta = this.input.getLookDelta();
        const sens = this.input.isMobile ? this.lookSensitivity * 2.2 : this.lookSensitivity;
        this.rotation.y -= lookDelta.x * sens;
        this.pitch.rotation.x -= lookDelta.y * sens;
        this.pitch.rotation.x = Math.max(-1.5, Math.min(1.5, this.pitch.rotation.x));
    }

    handleMovement(delta) {
        const axes = this.input.getMovementAxes();
        let moveDir = new THREE.Vector3(axes.x, 0, axes.z);
        moveDir.applyEuler(new THREE.Euler(0, this.rotation.y, 0));

        if (moveDir.lengthSq() > 1) moveDir.normalize();

        const baseSpeed = 12;
        const speed = this.perk === 'fastRun' ? baseSpeed * 1.6 : baseSpeed;
        this.physics.velocity.x = moveDir.x * speed;
        this.physics.velocity.z = moveDir.z * speed;

        if (this.physics.onGround && this.input.isKeyPressed('Space')) {
            this.physics.velocity.y = this.jumpForce;
            this.physics.onGround = false;
        }

    }

    handleActions(delta, audioSynth, entityManager, lootManager) {
        if (this.input.isKeyPressed('KeyV')) {
            if (!this.toggleViewLatch) {
                this.toggleViewLatch = true;
                this.viewMode = this.viewMode === 'fp' ? 'tp' : 'fp';
                this.updateViewWeapon();
            }
        } else {
            this.toggleViewLatch = false;
        }

        if (this.input.isKeyPressed('MouseLeft')) {
            const weapon = this.currentWeapon || this.fists;
            const dir = new THREE.Vector3();
            this.camera.getWorldDirection(dir);
            const result = weapon.attack(this, null, audioSynth, dir);
            
            // Обработка результата атаки оружия
            if (result && result.projectiles) {
                // Дробовик или зажигалка - массив снарядов
                result.projectiles.forEach(p => {
                    p.owner = this;
                    entityManager.addProjectile(p);
                });
            } else if (result && result.projectile) {
                // Одиночный снаряд (лук, пистолет, винтовка и т.д.)
                result.projectile.owner = this;
                entityManager.addProjectile(result.projectile);
            } else if (result && result.hit === true) {
                // Ближний бой - обрабатываем как раньше
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
                const intersects = raycaster.intersectObjects(entityManager.entities.filter(e => e !== this).map(e => e.mesh || e), true);
                if (intersects.length > 0) {
                    const hitObj = intersects[0].object;
                    let target = entityManager.entities.find(e => e.mesh === hitObj || (e.mesh && e.mesh.children.includes(hitObj)));
                    if (target && target.takeDamage) {
                        // Передаем все параметры урона: damage, isHeadshot, attacker, knockback, weaponType
                        target.takeDamage(result.damage, result.isHeadshot, this, result.knockback, weapon.type);
                    }
                }
            }
        }

        if (this.input.isKeyPressed('KeyE')) {
            const nearestChest = lootManager?.getNearestClosedChest?.(this.position, 6);
            if (nearestChest) {
                const loot = lootManager.tryOpenChest(nearestChest, this, audioSynth);
                if (loot) this.pickupLoot(loot);
            }
        }

        for (let i = 0; i < 9; i++) {
            if (this.input.isKeyPressed('Digit' + (i + 1))) this.selectSlot(i);
        }
    }

    pickupLoot(loot) {
        if (loot.type === 'weapon') {
            const weapon = new Weapon(loot.weaponType, this.scene);
            const res = this.inventory.addItem(weapon);
            if (res.added) {
                this.selectSlot(res.slot);
                this.hud?.showGameMessage?.(`Найдено: ${loot.weaponType}`);
            } else {
                this.hud?.showGameMessage?.(`Боеприпасы для ${loot.weaponType}`);
            }
            this.stats.loot++;
        }
    }

    selectSlot(slot) {
        this.inventory.selectSlot(slot);
        const selected = this.inventory.getSelectedWeapon();
        this.currentWeapon = selected || this.fists;
    }

    updateViewWeapon() {
        const weapon = this.currentWeapon;
        if (this.arms?.parent !== this.camera) this.camera.add(this.arms);
        this.arms.position.set(0, -0.42, -0.38);
        this.arms.traverse((child) => {
            if (!child.isMesh) return;
            child.visible = true;
            child.frustumCulled = false;
            child.renderOrder = 1000;
            if (child.material) {
                child.material.depthTest = false;
                child.material.depthWrite = false;
                child.material.transparent = false;
                child.material.opacity = 1;
            }
        });
        
        this.inventory.getItems().forEach(w => {
            if (w && w !== weapon) {
                const isFists = (w.type === 'fists');
                if (!isFists) w.setVisible(false);
            }
        });
        
        if (this.viewMode === 'fp') {
            this.arms.visible = true;
            const unarmed = !weapon || weapon === this.fists || weapon.type === 'fists';
            if (this.leftForearm && this.leftHand && this.rightForearm && this.rightHand) {
                if (unarmed) {
                    this.leftForearm.position.set(-0.24, -0.2, -0.64);
                    this.rightForearm.position.set(0.24, -0.2, -0.64);
                    this.leftHand.position.set(-0.24, -0.22, -0.9);
                    this.rightHand.position.set(0.24, -0.22, -0.9);
                } else {
                    this.leftForearm.position.set(-0.2, -0.22, -0.62);
                    this.rightForearm.position.set(0.16, -0.22, -0.58);
                    this.leftHand.position.set(-0.18, -0.24, -0.84);
                    this.rightHand.position.set(0.12, -0.24, -0.8);
                }
            }
            if (weapon?.mesh) {
                if (weapon !== this.fists && weapon.mesh.parent !== this.camera) this.camera.add(weapon.mesh);
                const pose = Weapon.getViewPose(weapon.type);
                weapon.setPosition(pose.position);
                weapon.setRotation(pose.rotation);
                weapon.setScale(pose.scale);
                weapon.setVisible(true);
            }
            if (this.fists?.mesh) {
                this.fists.visible = true;
                this.fists.mesh.visible = weapon === this.fists;
                this.fists.mesh.traverse((child) => {
                    if (!child.isMesh) return;
                    child.visible = weapon === this.fists;
                    child.frustumCulled = false;
                    child.renderOrder = 1001;
                    if (child.material) {
                        child.material.depthTest = false;
                        child.material.depthWrite = false;
                        child.material.transparent = false;
                        child.material.opacity = 1;
                    }
                });
            }
        } else {
            this.arms.visible = false;
            if (this.fists?.mesh) this.fists.mesh.visible = false;
            if (weapon?.mesh && weapon !== this.fists) {
                const grip = Weapon.getThirdPersonGrip(weapon.type);
                if (weapon.mesh.parent !== this.mesh) this.mesh.add(weapon.mesh);
                weapon.mesh.position.set(grip.right, 1.2 + grip.up, grip.forward);
                weapon.mesh.rotation.set(0, 3.14, 0);
                weapon.mesh.scale.setScalar(0.8);
                weapon.setVisible(true);
            }
        }
    }

    updateCamera() {
        const isTestMode = typeof localStorage !== 'undefined' && localStorage.getItem('testMode') === 'true';
        if (isTestMode) return;
        if (this.viewMode === 'fp') {
            this.camera.position.set(0, 1.8, 0);
            this.camera.rotation.set(0, 0, 0);
            this.mesh.visible = false;
        } else {
            this.camera.position.set(0, 4, 10);
            this.camera.rotation.set(-0.3, 0, 0);
            this.mesh.visible = true;
        }
    }

    takeDamage(amount, source, knockback) {
        if (this.isInvulnerable) return;
        this.health = Math.max(0, this.health - amount);
        this.stats.health = this.health;
        if (this.health <= 0) this.isAlive = false;
    }

    // Новый метод для обработки урона с расширенными параметрами
    takeDamageWithParams(damage, isHeadshot, attacker, knockback, weaponType) {
        if (this.isInvulnerable) return;
        
        let finalDamage = damage;
        
        // Бонус за попадание в голову
        if (isHeadshot) {
            finalDamage *= 2.0;
        }
        
        this.health = Math.max(0, this.health - finalDamage);
        this.stats.health = this.health;
        
        // Применяем откидывание
        if (knockback > 0 && attacker?.position) {
            const knockDir = new THREE.Vector3().subVectors(this.position, attacker.position).normalize();
            knockDir.y = Math.min(knockDir.y + 0.5, 1); // Добавляем немного вверх
            this.physics.velocity.addScaledVector(knockDir, knockback);
        }
        
        if (this.health <= 0) {
            this.isAlive = false;
            if (attacker && typeof attacker.onKill === 'function') {
                attacker.onKill(this);
            }
        }
    }
}