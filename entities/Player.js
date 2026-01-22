import * as THREE from 'three';
import { Inventory } from '../items/Inventory.js';
import { Weapon } from '../items/Weapon.js';

export class Player {
    constructor(scene, camera, input) {
        this.scene = scene;
        this.camera = camera;
        this.input = input;

        this.position = new THREE.Vector3(0, 5, 0);
        this.rotation = new THREE.Euler(0, 0, 0);
        this.physics = {
            velocity: new THREE.Vector3(0, 0, 0),
            onGround: false,
            height: 1.7,
            radius: 0.4,
            speed: 8
        };

        this.health = 100;
        this.maxHealth = 100;
        this.armor = 0;
        this.maxArmor = 100;
        this.isInvulnerable = false;
        this.isAlive = true;

        this.inventory = new Inventory();
        this.currentWeapon = null;
        this.fists = new Weapon('fists', this.scene);

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

        this.cameraOffset = new THREE.Vector3(0, 1.5, 0);
        this.mouseSensitivity = 0.001;
        this.mobileLookSensitivity = 0.003;
        this.lastLookSide = 0;
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');

        this.animationState = 'idle';
        this.lastFootstepTime = 0;
        this.coyoteTime = 0;
        this.coyoteDuration = 0.12;
        this.jumpBufferTime = 0;
        this.jumpBufferDuration = 0.12;
        this.slowTimer = 0;
        this.slowFactor = 1;
    }

    resetView() {
        this.rotation.set(0, 0, 0);
        if (this.input && this.input.resetLook) {
            this.input.resetLook();
        }
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

        if (controls && controls.isLocked) {
            const euler = new THREE.Euler();
            euler.setFromQuaternion(controls.getObject().quaternion);
            this.rotation.y = euler.y;
            this.rotation.x = euler.x;
        } else {
            const look = this.input.getLookDelta();
            if (look.x !== 0 || look.y !== 0) {
                const maxDelta = 90;
                const dx = Math.max(-maxDelta, Math.min(maxDelta, look.x));
                const dy = Math.max(-maxDelta, Math.min(maxDelta, look.y));
                if (this.input.isMobile) {
                    const side = Math.max(window.innerWidth, window.innerHeight);
                    if (side !== this.lastLookSide) {
                        this.lastLookSide = side;
                        this.mobileLookSensitivity = 1.9 / side;
                    }
                }
                const sensitivity = this.input.isMobile ? this.mobileLookSensitivity : this.mouseSensitivity * 1.4;
                this.rotation.y -= dx * sensitivity;
                this.rotation.x -= dy * sensitivity;
                const maxPitch = Math.PI / 2.4;
                this.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.rotation.x));
            }
        }

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
                const cameraDirection = new THREE.Vector3();
                controls.getObject().getWorldDirection(cameraDirection);
                cameraDirection.y = 0;
                cameraDirection.normalize();

                const rightDirection = new THREE.Vector3();
                rightDirection.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));

                moveDirection.addScaledVector(cameraDirection, -moveVector.z);
                moveDirection.addScaledVector(rightDirection, moveVector.x);
                moveDirection.normalize();
            } else {
                moveDirection.x = moveVector.x * Math.cos(this.rotation.y) - moveVector.z * Math.sin(this.rotation.y);
                moveDirection.z = moveVector.x * Math.sin(this.rotation.y) + moveVector.z * Math.cos(this.rotation.y);
            }

            const speed = this.physics.speed * this.slowFactor;
            this.physics.velocity.x = moveDirection.x * speed;
            this.physics.velocity.z = moveDirection.z * speed;

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

        this.mesh.position.copy(this.position);
        this.mesh.position.y = this.position.y - (this.physics.height - 0.15);
        this.mesh.rotation.y = this.rotation.y;
        this.animateLimbs();

        const cameraPosition = new THREE.Vector3(
            Math.round(this.position.x * 100) / 100,
            this.position.y + this.cameraOffset.y,
            Math.round(this.position.z * 100) / 100
        );

        if (controls && controls.isLocked) {
            controls.getObject().position.copy(cameraPosition);
            controls.getObject().position.y = this.position.y + this.cameraOffset.y;
            if (this.lastCameraPosition) {
                const dist = cameraPosition.distanceTo(this.lastCameraPosition);
                if (dist < 0.05) {
                    controls.getObject().position.copy(this.lastCameraPosition);
                } else {
                    this.lastCameraPosition.copy(cameraPosition);
                }
            } else {
                this.lastCameraPosition = cameraPosition.clone();
            }
        } else {
            this.camera.position.copy(cameraPosition);
            this.camera.rotation.set(this.rotation.x, this.rotation.y, 0, 'YXZ');
            this.camera.up.set(0, 1, 0);
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

        for (let i = 0; i <= 9; i++) {
            if (this.input.isKeyPressed(`Digit${i}`) || this.input.isKeyPressed(`Numpad${i}`)) {
                this.selectSlot(i);
            }
        }

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

        lootManager.checkNearbyChests(this.position, audioSynth);

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

        const arms = this.fpArms?.userData?.limbs;
        if (!arms) return;

        const swing = Math.sin(performance.now() * 0.01) * 0.02;
        arms.leftArm.position.copy(this.fpArms.userData.base.leftArm);
        arms.rightArm.position.copy(this.fpArms.userData.base.rightArm);
        arms.leftHand.position.copy(this.fpArms.userData.base.leftHand);
        arms.rightHand.position.copy(this.fpArms.userData.base.rightHand);

        const bob = Math.sin(performance.now() * 0.008) * 0.03;
        arms.leftArm.position.y += bob;
        arms.rightArm.position.y += bob;
        arms.leftHand.position.y += bob;
        arms.rightHand.position.y += bob;

        if (this.punchTime > 0) {
            const t = 1 - this.punchTime / this.punchDuration;
            const punch = Math.sin(t * Math.PI) * 0.25;
            arms.rightArm.position.z += punch;
            arms.rightHand.position.z += punch;
        }

        if (this.viewWeapon && this.viewWeapon.visible) {
            this.viewWeapon.rotation.x = -0.1;
            this.viewWeapon.rotation.y = 0.15;
            this.viewWeapon.rotation.z = 0;
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
            this.fists = new Weapon('fists', this.scene);
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
            this.isFrozen = true;
            this.physics.velocity.set(0, 0, 0);
            this.mesh.position.copy(this.position);
            this.mesh.position.y = this.position.y - (this.physics.height - 0.15) - 0.8;
            this.mesh.rotation.set(-Math.PI / 2, this.rotation.y, 0);
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
    }

    flashDamage() {
        if (!this.mesh) return;
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.material.emissive = new THREE.Color(0xff0000);
                child.material.emissiveIntensity = 0.5;
                setTimeout(() => {
                    if (child.material) {
                        child.material.emissiveIntensity = 0;
                    }
                }, 200);
            }
        });
    }

    animateViewModelWeapon(weaponType) {
        if (!this.fpArms) return;

        if (this.viewWeapon) {
            this.fpArms.remove(this.viewWeapon);
            this.viewWeapon = null;
        }

        if (!weaponType) return;

        const viewClone = new Weapon(weaponType, this.scene).mesh.clone();
        viewClone.scale.setScalar(1.1);
        viewClone.position.set(0.15, -0.4, -0.55);
        viewClone.rotation.set(0, Math.PI, 0);
        this.fpArms.add(viewClone);
        this.viewWeapon = viewClone;
    }

    updateViewWeapon() {
        const weapon = this.currentWeapon || this.fists;
        this.animateViewModelWeapon(weapon?.type);
    }

    applySlow(factor, duration) {
        this.slowFactor = Math.min(this.slowFactor, factor);
        this.slowTimer = Math.max(this.slowTimer, duration);
    }

    attack(target, entityManager) {
        let weapon = this.currentWeapon || this.fists;
        if (!weapon || !target || !target.isAlive) return null;

        if (weapon.type === 'knife' && weapon.durability !== null && weapon.durability <= 0) {
            this.currentWeapon = null;
            weapon = this.fists;
        }
        if ((weapon.type === 'bow' || weapon.type === 'laser') && weapon.ammo !== null && weapon.ammo <= 0) {
            this.currentWeapon = null;
            weapon = this.fists;
        }

        const distance = this.position.distanceTo(target.position);
        const attackRange = weapon.type === 'laser'
            ? 40
            : weapon.type === 'bow'
                ? 40
                : weapon.type === 'fists'
                    ? 2.5
                    : 3;

        if (distance > attackRange) return null;

        if (weapon.type === 'laser' || weapon.type === 'bow') {
            const direction = new THREE.Vector3()
                .subVectors(target.position, this.position)
                .normalize();

            const projectileData = weapon.attack(this, null, null, direction);
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
                target.takeDamage(result.damage, result.isHeadshot, this, result.knockback || 0);
                return { hit: true, damage: result.damage, killed: target.health <= 0 };
            }
        }

        return null;
    }
}
