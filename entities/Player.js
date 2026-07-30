import * as THREE from 'three';
import { Inventory } from '../items/Inventory.js';
import { Weapon } from '../items/Weapon.js';
import { spawnDamagePopup } from './DamagePopup.js';

export class Player {
    constructor(scene, camera, input) {
        this.type = 'Player';
        this.scene = scene;
        this.camera = camera;
        this.input = input;

        this.position = new THREE.Vector3(0, 5, 0);
        this.rotation = new THREE.Euler(0, 0, 0);
        this.quaternion = new THREE.Quaternion();
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
        this.infiniteHealth = false;
        this.isCameraFrozen = false;

        // Кэш видимости рук по типу оружия — не мерцает каждый кадр
        this._lastArmWeaponType = null;
        this._stableFirstPerson = true; // stabilize visibility against pointer-lock flicker

        this.inventory = new Inventory();
        this.fists = new Weapon('fists', this.scene);
        this.currentWeapon = this.fists;

        this.mesh = this.createMesh();
        this.scene.add(this.mesh);

        this.fpArms = this.createFirstPersonArms();
        this.camera.add(this.fpArms);
        this.setupViewModel(this.fpArms);
        this.fpArms.visible = false;
        this.viewWeapon = null;
        this.viewWeaponType = null;
        this.viewWeaponBase = null;
        this.viewWeaponRequestId = 0;
        this.viewKick = 0;
        this.punchTime = 0;
        this.punchDuration = 0.25;
        this.weaponSwingTime = 0;
        this.weaponSwingDuration = 0.2;
        this.weaponActionTime = 0;
        this.weaponActionDuration = 0.18;
        this.weaponActionType = null;
        this.audioSynthRef = null;

        this.cameraOffset = new THREE.Vector3(0, 1.5, 0);
        this._tmpFireDir = new THREE.Vector3();
        this._tmpMuzzle = new THREE.Vector3();
        this._tmpLookTarget = new THREE.Vector3();
        this._tmpZeroMove = new THREE.Vector3();
        this._tmpMoveDirection = new THREE.Vector3();
        this._tmpCameraDirection = new THREE.Vector3();
        this._tmpRightDirection = new THREE.Vector3();
        this._tmpUp = new THREE.Vector3(0, 1, 0);
        this._tmpTrailPos = new THREE.Vector3();

        this._tmpKnockbackDir = new THREE.Vector3();
        this._tmpSocketPos = new THREE.Vector3();
        this._tmpSocketQuat = new THREE.Quaternion();
        // this.lastCameraPosition removed — was causing snap-back teleport
        this._tmpAutoForward = new THREE.Vector3();
        this._tmpAutoToTarget = new THREE.Vector3();
        this._tmpAutoAimPoint = new THREE.Vector3();
        this._tmpAttackDirection = new THREE.Vector3();
        this.mouseSensitivity = 0.003;
        this.mobileLookSensitivity = 0.003;
        this.lookSensitivityMultiplier = 1;
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
        this.attackCooldown = 0;
        this.attackSpeedMultiplier = 1;
        this.footstepVolume = 1;
        this.perk = null;
        this.perkAmmoBonus = 1;
        this.isSilent = false;
        this.damageReduction = 0;
        this.recoilScale = 1;
        this.autoFire = false;
        this.baseSpeed = this.physics.speed;
        this.damageTakenMultiplier = 0.55;
        this.stats = { damage: 0, kills: 0, loot: 0 };
        this.hudRef = null;
        this.cameraShakeTime = 0;
        this.cameraShakeDuration = 0.12;
        this.cameraShakeStrength = 0.035;
        this.trailCooldown = 0;
        this.burnTimer = 0;
        this.burnTickTimer = 0;
        this.burnDamagePerSecond = 0;
        this.burnAttacker = null;
        this.lastFlashTime = 0;
        this.bowCharge = 0;
        this.bowChargeMax = 1.2;
        this.bowMinCharge = 0.14;
        this.wasFireHeld = false;
        this.healthRegenDelay = 7;
        this.healthRegenDuration = 7;
        this.lastDamageAt = -Infinity;

        const starterKnife = new Weapon('knife', this.scene);
        this.inventory.addItem(starterKnife);
        this.selectSlot(0);
    }

    getWeaponDisplayName(type) {
        if (type === 'knife') return 'Нож';
        if (type === 'bow') return 'Лук';
        if (type === 'laser') return 'Лазер';
        if (type === 'shotgun') return 'Дробовик';
        if (type === 'flamethrower') return 'Огнемёт';
        if (type === 'pistol') return 'Пистолет';
        if (type === 'rifle') return 'Винтовка';
        if (type === 'machinegun') return 'Пулемет';
        return type || 'Предмет';
    }

    addAmmoToWeaponType(weaponType, amount) {
        if (!weaponType || !amount || amount <= 0) return 0;
        const target = this.inventory.getItems().find(item => item?.type === weaponType && item.ammo !== null && item.ammo !== undefined);
        if (!target) return 0;
        const before = target.ammo ?? 0;
        const maxAmmo = target.maxAmmo ?? before + amount;
        target.ammo = Math.min(maxAmmo, before + amount);
        return Math.max(0, target.ammo - before);
    }

    setLookSensitivityMultiplier(value = 1) {
        this.lookSensitivityMultiplier = Math.max(0.35, Math.min(2.6, value));
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
            color: 0x2f5d8f,
            roughness: 0.35,
            metalness: 0.0,
            flatShading: true
        });
        const handMat = new THREE.MeshStandardMaterial({
            color: 0x111820,
            roughness: 0.72,
            metalness: 0.0,
            flatShading: true
        });
        const cuffMat = new THREE.MeshStandardMaterial({
            color: 0x2f3e55,
            roughness: 0.5,
            metalness: 0.0,
            flatShading: true
        });

        const leftArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.24, 0.18),
            armMat
        );
        leftArm.position.set(-0.34, -0.56, -0.86);
        group.add(leftArm);
        const leftCuff = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.06, 0.18),
            cuffMat
        );
        leftCuff.position.set(-0.34, -0.7, -0.86);
        group.add(leftCuff);

        const rightArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.24, 0.18),
            armMat
        );
        rightArm.position.set(0.34, -0.56, -0.86);
        group.add(rightArm);
        const rightCuff = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.06, 0.18),
            cuffMat
        );
        rightCuff.position.set(0.34, -0.7, -0.86);
        group.add(rightCuff);

        const leftHand = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.16, 0.18),
            handMat
        );
        leftHand.position.set(-0.34, -0.66, -0.98);
        group.add(leftHand);

        const rightHand = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.16, 0.18),
            handMat
        );
        rightHand.position.set(0.34, -0.66, -0.98);
        group.add(rightHand);

        group.userData.limbs = { leftArm, rightArm, leftCuff, rightCuff, leftHand, rightHand };
        group.userData.base = {
            leftArm: leftArm.position.clone(),
            rightArm: rightArm.position.clone(),
            leftHand: leftHand.position.clone(),
            rightHand: rightHand.position.clone()
        };
        group.userData.isFirstPersonArm = true;
        group.scale.setScalar(1.0);
        return group;
    }

    setupViewModel(object, isViewWeapon = false) {
        object.traverse(child => {
            if (child.isMesh) {
                child.renderOrder = isViewWeapon ? 500 : 999;
                child.frustumCulled = false;
                if (child.material) {
                    child.material.depthTest = true;
                    child.material.depthWrite = true;
                    // Polygon offset prevents z-fighting with hands
                    if (isViewWeapon) {
                        child.material.polygonOffset = true;
                        child.material.polygonOffsetFactor = 1;
                        child.material.polygonOffsetUnits = 1;
                    }
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
            color: 0x3f6fa1,
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

        const handMat = new THREE.MeshStandardMaterial({
            color: 0xffc9a6,
            roughness: 0.4,
            metalness: 0.0,
            flatShading: true
        });
        const leftHand = new THREE.Mesh(
            new THREE.BoxGeometry(0.26, 0.2, 0.26),
            handMat
        );
        leftHand.position.set(-0.54, 0.2, 0);
        group.add(leftHand);
        const rightHand = new THREE.Mesh(
            new THREE.BoxGeometry(0.26, 0.2, 0.26),
            handMat
        );
        rightHand.position.set(0.54, 0.2, 0);
        group.add(rightHand);

        const weaponSocket = new THREE.Object3D();
        weaponSocket.position.set(0.62, 1.1, -0.2);
        weaponSocket.rotation.set(0, Math.PI / 2, 0);
        group.add(weaponSocket);

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
        group.userData.weaponSocket = weaponSocket;
        return group;
    }



    update(delta, audioSynth, lootManager, entityManager, controls) {
        if (!this.isAlive) return;
        this.audioSynthRef = audioSynth;
        this.updateBurning(delta);
        this.updateHealthRegen(delta);
        if (this.trailCooldown > 0) {
            this.trailCooldown = Math.max(0, this.trailCooldown - delta);
        }
        if (this.attackCooldown > 0) {
            this.attackCooldown = Math.max(0, this.attackCooldown - delta);
        }

        const isCameraFrozen = this.isCameraFrozen === true;

        // Читаем вращение камеры напрямую из quaternion — всегда актуально
        if (controls) {
            this.rotation.setFromQuaternion(controls.camera.quaternion, 'YXZ');
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
                        this.mobileLookSensitivity = 5.7 / side;
                    }
                }
                const sensitivity = (this.input.isMobile ? this.mobileLookSensitivity : this.mouseSensitivity * 1.4) * this.lookSensitivityMultiplier;
                this.rotation.y -= dx * sensitivity;
                this.rotation.x -= dy * sensitivity;
                const maxPitch = Math.PI / 2.4;
                this.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.rotation.x));
            }
        }
        if (!Number.isFinite(this.rotation.x) || !Number.isFinite(this.rotation.y)) {
            this.rotation.set(0, 0, 0);
        }

        if (isCameraFrozen) {
            // Skip movement/physics during countdown
            this.physics.velocity.set(0, 0, 0);
            this.physics.onGround = true;
            return;
        }

        const isFrozen = this.isFrozen === true;
        const moveVector = isFrozen ? this._tmpZeroMove.set(0, 0, 0) : this.input.getMovementVector();
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
            const moveDirection = this._tmpMoveDirection.set(0, 0, 0);

            if (controls) {
                const cameraDirection = this._tmpCameraDirection;
                controls.getWorldDirection(cameraDirection);
                cameraDirection.y = 0;
                cameraDirection.normalize();

                const rightDirection = this._tmpRightDirection;
                rightDirection.crossVectors(cameraDirection, this._tmpUp);

                moveDirection.addScaledVector(cameraDirection, -moveVector.z);
                moveDirection.addScaledVector(rightDirection, moveVector.x);
                moveDirection.normalize();
            } else {
                const cameraDirection = this._tmpCameraDirection;
                cameraDirection.set(0, 0, -1).applyEuler(this.rotation);
                cameraDirection.y = 0;
                cameraDirection.normalize();

                const rightDirection = this._tmpRightDirection;
                rightDirection.crossVectors(cameraDirection, this._tmpUp);

                moveDirection.addScaledVector(cameraDirection, -moveVector.z);
                moveDirection.addScaledVector(rightDirection, moveVector.x);
                moveDirection.normalize();
            }

            const heldWeapon = this.currentWeapon || this.fists;
            if (!isFrozen && heldWeapon?.type === 'bow' && this.input.isKeyPressed('MouseLeft')) {
                this.slowFactor = Math.min(this.slowFactor, 0.52);
            }
            const speed = this.physics.speed * this.slowFactor;
            this.physics.velocity.x = moveDirection.x * speed;
            this.physics.velocity.z = moveDirection.z * speed;

            const currentTime = performance.now() / 1000;
            if (this.physics.onGround && currentTime - this.lastFootstepTime > 0.5 && audioSynth) {
                audioSynth.playFootstep(this.footstepVolume);
                const surfaceType = this.mapRef?.getSlowZoneTypeAt?.(this.position.x, this.position.z);
                if (surfaceType === 'glass') {
                    audioSynth.playGlassStep?.(this.position, `player-${Math.floor(currentTime * 10)}`);
                }
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

        // Camera shake — передаём напрямую в CameraController, НЕ меняем позицию игрока
        if (this.cameraShakeTime > 0) {
            const t = this.cameraShakeTime / this.cameraShakeDuration;
            const strength = this.cameraShakeStrength * t;
            controls.setShakeOffset(
                (Math.random() - 0.5) * strength,
                (Math.random() - 0.5) * strength,
                (Math.random() - 0.5) * strength
            );
            this.cameraShakeTime = Math.max(0, this.cameraShakeTime - delta);
        } else {
            controls.clearShake();
        }

        const isFirstPersonRaw = (controls && controls.isLocked) || this.input.isMobile;
        // Stabilize: flip ONLY when pointer-lock activates (prevents flicker on exit)
        // Once in first-person (pointer-lock active), stay in first-person even on brief lock loss
        if (isFirstPersonRaw && !this._stableFirstPerson) {
            this._stableFirstPerson = true;
        }
        const isFirstPerson = this._stableFirstPerson;
        if (isFirstPerson) {
            this.mesh.visible = false;
            this.fpArms.visible = true;
            if (this.currentWeapon) this.currentWeapon.setVisible(false);
        } else {
            this.mesh.visible = true;
            this.fpArms.visible = false;
            if (this.currentWeapon) this.currentWeapon.setVisible(true);
        }
        // Check slot switches BEFORE animateViewModel so viewWeapon is updated in time
        for (let displaySlot = 1; displaySlot <= 10; displaySlot++) {
            const key = displaySlot === 10 ? 0 : displaySlot;
            const slotIndex = displaySlot === 10 ? 9 : displaySlot - 1;
            if ((this.input.isKeyPressed(`Digit${key}`) || this.input.isKeyPressed(`Numpad${key}`)) && this.inventory.hasItem(slotIndex)) {
                this.selectSlot(slotIndex);
            }
        }
        this.updateFirstPersonArmsVisibility(isFirstPerson);
        this.animateViewModel(isFirstPerson, delta);

        const activeWeapon = this.currentWeapon || this.fists;
        const autoTarget = this.autoFire && activeWeapon.type !== 'bow' ? this.getAutoFireTarget(entityManager) : null;
        const isRangedWeapon = ['bow', 'laser', 'shotgun', 'flamethrower', 'pistol', 'rifle', 'machinegun'].includes(activeWeapon.type);
        const fireHeld = this.input.isKeyPressed('MouseLeft');
        const fireRequested = fireHeld || (!!autoTarget && !isFrozen && isRangedWeapon);
        if (activeWeapon.type === 'bow') {
            if (!isFrozen && fireHeld) {
                this.bowCharge = Math.min(this.bowChargeMax, this.bowCharge + delta);
                this.weaponActionTime = this.weaponActionDuration;
                this.weaponActionType = 'bow';
            }

            const shouldReleaseBow = !fireHeld && this.wasFireHeld && this.bowCharge >= this.bowMinCharge;
            if (!isFrozen && shouldReleaseBow && this.attackCooldown <= 0) {
                const direction = this._tmpFireDir;
                controls.getWorldDirection(direction);
                const chargeRatio = Math.max(0.35, Math.min(1, this.bowCharge / this.bowChargeMax));
                const result = activeWeapon.attack(this, null, audioSynth, direction, { chargeRatio });
                const muzzle = this._tmpMuzzle;
                muzzle.copy(controls.camera.position).addScaledVector(direction, 0.6);

                if (result && result.projectiles) {
                    for (const proj of result.projectiles) {
                        proj.owner = this;
                        proj.mesh.position.copy(muzzle);
                        entityManager.addProjectile(proj);
                    }
                } else if (result && result.projectile) {
                    result.projectile.direction.copy(direction);
                    result.projectile.owner = this;
                    result.projectile.mesh.position.copy(muzzle);
                    if (result.projectile.velocity) {
                        result.projectile.velocity.copy(direction).multiplyScalar(result.projectile.speed);
                    }
                    this._tmpLookTarget.copy(muzzle).add(direction);
                    result.projectile.mesh.lookAt(this._tmpLookTarget);
                    entityManager.addProjectile(result.projectile);
                }
                this.viewKick = (0.14 + chargeRatio * 0.18) * this.recoilScale;
                this.weaponActionTime = this.weaponActionDuration + chargeRatio * 0.08;
                this.weaponActionType = activeWeapon.type;
                this.attackCooldown = Math.max(0.35, activeWeapon.cooldown * (0.95 - chargeRatio * 0.3)) * this.attackSpeedMultiplier;
            }
            if (!fireHeld) {
                this.bowCharge = 0;
            }
        } else if (!isFrozen && fireRequested && this.attackCooldown <= 0) {
            if (activeWeapon.type === 'laser' || activeWeapon.type === 'shotgun' || activeWeapon.type === 'flamethrower' || activeWeapon.type === 'pistol' || activeWeapon.type === 'rifle' || activeWeapon.type === 'machinegun') {
                const direction = this._tmpFireDir;
                if (autoTarget) {
                    direction.subVectors(autoTarget.position, controls.camera.position).normalize();
                } else {
                    controls.getWorldDirection(direction);
                }
                const result = activeWeapon.attack(this, null, audioSynth, direction);
                const muzzle = this._tmpMuzzle;
                muzzle.copy(controls.camera.position);
                muzzle.addScaledVector(direction, 0.6);

                if (result && result.projectiles) {
                    for (const proj of result.projectiles) {
                        proj.owner = this;
                        proj.mesh.position.copy(muzzle);
                        entityManager.addProjectile(proj);
                    }
                } else if (result && result.projectile) {
                    result.projectile.direction.copy(direction);
                    result.projectile.owner = this;
                    result.projectile.mesh.position.copy(muzzle);
                    if (result.projectile.velocity) {
                        result.projectile.velocity.copy(direction).multiplyScalar(result.projectile.speed);
                    }
                    this._tmpLookTarget.copy(muzzle).add(direction);
                    result.projectile.mesh.lookAt(this._tmpLookTarget);
                    entityManager.addProjectile(result.projectile);
                }
                const recoilByType = { laser: 0.09, shotgun: 0.42, flamethrower: 0.06, pistol: 0.26, rifle: 0.22, machinegun: 0.13 };
                this.viewKick = (recoilByType[activeWeapon.type] || 0.2) * this.recoilScale;
                this.weaponActionTime = this.weaponActionDuration;
                this.weaponActionType = activeWeapon.type;
            } else {
                const target = entityManager.getNearestEnemy(this.position, activeWeapon.range);
                if (target) {
                    const result = activeWeapon.attack(this, target, audioSynth);
                    if (result && result.hit) {
                        target.takeDamage(result.damage, result.isHeadshot, this, result.knockback || 0);
                        this.viewKick = 0.3 * this.recoilScale;
                        this.onHit();
                    }
                }
            }
            if (activeWeapon.type === 'fists') {
                if (this.punchTime <= 0) {
                    this.punchTime = this.punchDuration;
                }
            }
            if (activeWeapon.type === 'knife') {
                if (this.weaponSwingTime <= 0) {
                    this.weaponSwingTime = this.weaponSwingDuration;
                }
            }
            this.attackCooldown = activeWeapon.cooldown * this.attackSpeedMultiplier;
            if (this.hudRef) {
                this.hudRef.updateAmmo(this.currentWeapon);
            }
        }
        this.wasFireHeld = fireHeld;

        if (!isFrozen && this.input.isKeyPressed('KeyE')) {
            const poi = this.mapRef?.getNearestInteractivePOI?.(this.position, 3.2);
            if (poi) {
                const type = poi.userData.poiType;
                let consumed = false;
                if (type === 'weapon') {
                    const weapons = ['pistol', 'rifle', 'shotgun', 'bow', 'machinegun', 'laser', 'flamethrower'];
                    const index = Math.abs(Math.round(poi.position.x * 13 + poi.position.z * 7)) % weapons.length;
                    this.pickupLoot({ type: 'weapon', weaponType: weapons[index] });
                    consumed = true;
                } else if (type === 'medkit' && (this.health < this.maxHealth || this.armor < this.maxArmor)) {
                    this.pickupLoot({ type: 'heal', amount: 35 });
                    consumed = true;
                } else if (type === 'ammo' && this.inventory.getItems().some(item => item?.ammo !== null && item?.ammo < item?.maxAmmo)) {
                    this.pickupLoot({ type: 'ammo', amount: 25 });
                    consumed = true;
                }
                if (consumed) {
                    this.mapRef.consumeInteractivePOI(poi);
                    audioSynth.playPickup();
                }
            } else {
                const nearestChest = lootManager.getNearestClosedChest
                    ? lootManager.getNearestClosedChest(this.position, 3.2)
                    : lootManager.getChests().find(chest => {
                        if (chest.userData.isOpen) return false;
                        return this.position.distanceTo(chest.position) < 3;
                    });

                if (nearestChest) {
                    const loot = lootManager.tryOpenChest(nearestChest, this, audioSynth);
                    if (loot) this.pickupLoot(loot);
                }
            }
        }

        lootManager.checkNearbyChests(this.position, audioSynth);

        if (!isFirstPerson && this.currentWeapon && this.currentWeapon.mesh) {
            this.updateThirdPersonWeapon();
        }
        this.punchTime = Math.max(0, this.punchTime - delta);
        this.weaponSwingTime = Math.max(0, this.weaponSwingTime - delta);
        this.weaponActionTime = Math.max(0, this.weaponActionTime - delta);
        if (this.weaponActionTime === 0) {
            this.weaponActionType = null;
        }
        this.viewKick = Math.max(0, this.viewKick - delta * 6);
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

    animateViewModel(isFirstPerson, delta) {
        if (!isFirstPerson) {
            // Не прячем viewWeapon — он будет показан когда pointer lock сработает
            // Обновляем позицию рук даже если не first-person (для стабильности)
            const arms = this.fpArms?.userData?.limbs;
            if (!arms) return;
            arms.leftArm.position.copy(this.fpArms.userData.base.leftArm);
            arms.rightArm.position.copy(this.fpArms.userData.base.rightArm);
            arms.leftHand.position.copy(this.fpArms.userData.base.leftHand);
            arms.rightHand.position.copy(this.fpArms.userData.base.rightHand);
            return;
        }

        if (this.viewWeapon) this.viewWeapon.visible = true;

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
            if (this.viewWeaponBase) {
                this.viewWeapon.position.copy(this.viewWeaponBase.position);
                this.viewWeapon.rotation.copy(this.viewWeaponBase.rotation);
            }

            // Update weapon animation system (recoil, sway, bob, heat)
            const isShooting = this.weaponActionTime > 0 || this.viewKick > 0;
            const speed = Math.sqrt(this.physics.velocity.x**2 + this.physics.velocity.z**2);
            // Use mouse delta for weapon sway, then reset
            const mDx = this.input?.mouse?.deltaX || 0;
            const mDy = this.input?.mouse?.deltaY || 0;
            if (this.input?.mouse) { this.input.mouse.deltaX = 0; this.input.mouse.deltaY = 0; }
            this.currentWeapon?.anim?.update(delta, isShooting, speed > 0.3, mDx, mDy);
            this.currentWeapon?.anim?.applyToMesh(this.viewWeapon, this.viewWeaponType);

            if (this.viewWeaponType === 'knife' && this.weaponSwingTime > 0) {
                const t = 1 - this.weaponSwingTime / this.weaponSwingDuration;
                const swing = Math.sin(t * Math.PI);
                const swingMul = 0.6;
                this.viewWeapon.rotation.z -= swing * swingMul;
                this.viewWeapon.position.z -= swing * 0.08;
            }

            if (this.viewWeaponType === 'bow' && this.bowCharge > 0) {
                const draw = Math.min(1, this.bowCharge / this.bowChargeMax);
                this.viewWeapon.position.x -= draw * 0.05;
                this.viewWeapon.position.z += draw * 0.14;
                this.viewWeapon.rotation.y -= draw * 0.045;
                arms.leftHand.position.z -= draw * 0.08;
                arms.rightHand.position.z += draw * 0.16;
            }

            if ((this.viewWeaponType === 'bow' || this.viewWeaponType === 'laser' || this.viewWeaponType === 'shotgun' || this.viewWeaponType === 'pistol' || this.viewWeaponType === 'rifle' || this.viewWeaponType === 'flamethrower' || this.viewWeaponType === 'machinegun') && this.viewKick > 0) {
                this.viewWeapon.position.z -= this.viewKick * 0.2;
                this.viewWeapon.rotation.x -= this.viewKick * 0.6;
            }

            if (this.weaponActionTime > 0 && this.weaponActionType) {
                const t = THREE.MathUtils.clamp(1 - this.weaponActionTime / this.weaponActionDuration, 0, 1);
                const ease = Math.sin(Math.min(1, t * 2.2) * Math.PI);
                if (this.weaponActionType === 'bow') {
                    this.viewWeapon.position.z -= ease * 0.09;
                    this.viewWeapon.position.x -= ease * 0.03;
                    this.viewWeapon.rotation.y += ease * 0.06;
                } else if (this.weaponActionType === 'laser' || this.weaponActionType === 'shotgun' || this.weaponActionType === 'pistol' || this.weaponActionType === 'rifle' || this.weaponActionType === 'flamethrower' || this.weaponActionType === 'machinegun') {
                    this.viewWeapon.position.z -= ease * 0.1;
                    this.viewWeapon.rotation.x -= ease * 0.35;
                }
            }
        }
    }

    updateFirstPersonArmsVisibility(isFirstPerson) {
        if (!this.fpArms) return;
        if (!isFirstPerson) return;
        const limbs = this.fpArms.userData?.limbs;
        if (!limbs) return;
        // Кэшируем тип оружия — руки скрываем/показываем только при смене оружия
        const weaponType = this.currentWeapon?.type || 'fists';
        if (weaponType !== this._lastArmWeaponType) {
            this._lastArmWeaponType = weaponType;
            const showArms = weaponType === 'fists';
            limbs.leftArm.visible = showArms;
            limbs.rightArm.visible = showArms;
            limbs.leftCuff.visible = showArms;
            limbs.rightCuff.visible = showArms;
            limbs.leftHand.visible = showArms;
            limbs.rightHand.visible = showArms;
        }
    }

    selectSlot(slot) {
        const weapon = this.inventory.selectSlot(slot);
        const oldWeapon = this.currentWeapon;
        
        if (oldWeapon && oldWeapon.mesh && this.mesh?.userData?.weaponSocket) {
            // Detach old weapon from socket
            oldWeapon.detachFromSocket();
        }

        if (weapon) {
            this.currentWeapon = weapon;
            // Attach to player's weapon socket for third-person view
            if (weapon.mesh && this.mesh?.userData?.weaponSocket) {
                weapon.attachToSocket(this.mesh.userData.weaponSocket);
            }
        } else {
            this.currentWeapon = null;
            this.fists = new Weapon('fists', this.scene);
        }
        this.updateViewWeapon();
        // Обновляем видимость рук при смене оружия (сразу, не ждём update())
        const isFirstPerson = this._stableFirstPerson ?? (controls && controls.isLocked);
        this.updateFirstPersonArmsVisibility(isFirstPerson);
        if (this.hudRef) {
            this.hudRef.updateAmmo(this.currentWeapon);
        }
    }

    pickupLoot(loot) {
        const feedParts = [];
        if (loot.type === 'weapon') {
            const weapon = new Weapon(loot.weaponType, this.scene);
            this.applyWeaponPerk(weapon);
            const result = this.inventory.addItem(weapon);
            if (result.added) {
                feedParts.push(`Лут: ${this.getWeaponDisplayName(loot.weaponType)}`);
                if (!this.currentWeapon || !this.inventory.getSelectedWeapon()) {
                    this.selectSlot(result.slot);
                }
            } else {
                if (result.slot >= 0) {
                    feedParts.push(`Пополнение: ${this.getWeaponDisplayName(loot.weaponType)}`);
                }
                weapon.dispose();
            }
            this.updateViewWeapon();
        } else if (loot.type === 'armor') {
            this.armor = Math.min(this.maxArmor, this.armor + loot.amount);
            feedParts.push(`Броня +${Math.round(loot.amount)}`);
        } else if (loot.type === 'ammo') {
            const amount = loot.amount || 0;
            if (amount > 0) {
                const candidates = this.inventory.getItems().filter(w => w && w.ammo !== null);
                const target = this.currentWeapon && this.currentWeapon.ammo !== null
                    ? this.currentWeapon
                    : candidates[0];
                if (target) {
                    const before = target.ammo ?? 0;
                    target.ammo = Math.min(target.maxAmmo ?? target.ammo, (target.ammo ?? 0) + amount);
                    const gained = Math.max(0, (target.ammo ?? 0) - before);
                    if (gained > 0) {
                        feedParts.push(`${this.getWeaponDisplayName(target.type)}: +${gained} патр.`);
                    }
                }
            }
        } else if (loot.type === 'heal') {
            const healAmount = loot.amount || 45;
            const beforeHp = this.health;
            this.health = Math.min(this.maxHealth, this.health + healAmount);
            this.armor = Math.min(this.maxArmor, this.armor + Math.round(healAmount * 0.12));
            const restored = Math.max(0, Math.round(this.health - beforeHp));
            if (restored > 0) {
                feedParts.push(`Аптечка: +${restored} HP`);
            }
        }
        if (loot.bonusAmmo) {
            const gained = this.addAmmoToWeaponType(loot.bonusAmmo.weaponType, loot.bonusAmmo.amount);
            if (gained > 0) {
                feedParts.push(`${this.getWeaponDisplayName(loot.bonusAmmo.weaponType)}: +${gained} патр.`);
            }
        }
        this.stats.loot += 1;
        if (feedParts.length) {
            this.hudRef?.showLootNotification?.(feedParts.join(' • '));
        }
    }

    takeDamage(damage, isHeadshot = false, attacker = null, knockbackStrength = 0, source = null) {
        if (this.isInvulnerable || this.infiniteHealth) return false;
        const hpBefore = this.health;
        const armorBefore = this.armor;

        const finalDamage = (isHeadshot ? damage * 2 : damage) * (1 - this.damageReduction) * this.damageTakenMultiplier;
        if (finalDamage > 0) {
            this.lastDamageAt = performance.now() / 1000;
        }
        if (attacker?.stats) {
            attacker.stats.damage += finalDamage;
        }

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
            if (attacker?.stats) {
                attacker.stats.kills += 1;
            }
            this.clearBurning();
        }
        const hpDelta = Math.max(0, hpBefore - this.health);
        const armorDelta = Math.max(0, armorBefore - this.armor);
        const tookRealDamage = (hpDelta + armorDelta) > 0.001;
        const isDotDamage = source === 'zone' || source === 'storm' || source === 'burn' || source === 'trap';
        if (!isDotDamage && tookRealDamage) {
            this.flashDamage();
            spawnDamagePopup(this.scene, this.position, finalDamage, { color: '#ff5b5b', key: 'player' });
        }
        if (source === 'flame' && this.isAlive) {
            this.applyBurn(2.2, 4.2, attacker);
        }
        if (this.audioSynthRef && tookRealDamage) {
            if (source === 'zone' && this.audioSynthRef.playZoneDamage) {
                this.audioSynthRef.playZoneDamage();
            } else if (this.audioSynthRef.playPlayerHurt) {
                this.audioSynthRef.playPlayerHurt();
            } else if (this.audioSynthRef.playHurt) {
                this.audioSynthRef.playHurt();
            }
        }
        if (attacker && this.isAlive) {
            const strength = knockbackStrength > 0 ? knockbackStrength : 3;
            // Use local vars instead of shared _tmpKnockbackDir to avoid race conditions
            const dx = this.position.x - attacker.position.x;
            const dz = this.position.z - attacker.position.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            this.physics.velocity.x += (dx / len) * strength;
            this.physics.velocity.z += (dz / len) * strength;
            this.physics.velocity.y += 2;
        }

        return true;
    }

    onHit() {
        if (this.hudRef?.showHitMarker) {
            this.hudRef.showHitMarker();
        }
        this.cameraShakeTime = this.cameraShakeDuration;
    }

    setHUD(hud) {
        this.hudRef = hud;
    }

    applyPerk(perk, baseFootstep = 1) {
        this.perk = perk;
        this.attackSpeedMultiplier = 1;
        this.footstepVolume = baseFootstep;
        this.perkAmmoBonus = 1;
        this.isSilent = false;
        this.damageReduction = 0;
        this.recoilScale = 1;
        this.autoFire = false;
        this.physics.speed = this.baseSpeed;

        if (perk === 'quickHands') {
            this.attackSpeedMultiplier = 0.5;
        } else if (perk === 'silentStep') {
            this.footstepVolume = Math.min(0.12, baseFootstep);
            this.isSilent = true;
        } else if (perk === 'moreAmmo') {
            this.perkAmmoBonus = 2.1;
        } else if (perk === 'fastRun') {
            this.physics.speed = this.baseSpeed * 1.7;
        } else if (perk === 'thickSkin') {
            this.damageReduction = 0.42;
        } else if (perk === 'steadyAim') {
            this.recoilScale = 0.2;
        } else if (perk === 'autoFire') {
            this.autoFire = true;
            this.recoilScale = 0.55;
        }

        if (this.fists) {
            this.fists.cooldown *= this.attackSpeedMultiplier;
        }
    }

    applyWeaponPerk(weapon) {
        if (!weapon) return;
        if (this.perk === 'quickHands') {
            weapon.cooldown *= this.attackSpeedMultiplier;
        }
        if (this.perk === 'moreAmmo') {
            if (weapon.maxAmmo !== null) {
                weapon.maxAmmo = Math.round(weapon.maxAmmo * this.perkAmmoBonus);
                weapon.ammo = weapon.maxAmmo;
            }
            if (weapon.maxDurability !== null) {
                weapon.maxDurability = Math.round(weapon.maxDurability * this.perkAmmoBonus);
                weapon.durability = weapon.maxDurability;
            }
        }
    }

    updateHealthRegen(delta) {
        if (!this.isAlive || this.health >= this.maxHealth) return;
        const now = performance.now() / 1000;
        if (now - this.lastDamageAt < this.healthRegenDelay) return;
        const regenPerSecond = this.maxHealth / this.healthRegenDuration;
        this.health = Math.min(this.maxHealth, this.health + regenPerSecond * delta);
    }

    setInvulnerable(value) {
        this.isInvulnerable = value;
    }

    flashDamage() {
        if (!this.mesh) return;
        const now = performance.now();
        if (now - this.lastFlashTime < 90) return;
        this.lastFlashTime = now;
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

    applyBurn(duration = 2, damagePerSecond = 4, attacker = null) {
        this.burnTimer = Math.max(this.burnTimer, duration);
        this.burnTickTimer = Math.max(this.burnTickTimer, 0.08);
        this.burnDamagePerSecond = Math.max(this.burnDamagePerSecond, damagePerSecond);
        if (attacker) this.burnAttacker = attacker;
    }

    clearBurning() {
        this.burnTimer = 0;
        this.burnTickTimer = 0;
        this.burnDamagePerSecond = 0;
        this.burnAttacker = null;
        this.setBurnVisual(0);
    }

    updateBurning(delta) {
        if (this.burnTimer <= 0 || !this.isAlive) return;

        this.burnTimer = Math.max(0, this.burnTimer - delta);
        this.burnTickTimer -= delta;
        const pulse = 0.18 + Math.sin(performance.now() * 0.03) * 0.08;
        this.setBurnVisual(Math.max(0.1, pulse));

        while (this.burnTickTimer <= 0 && this.isAlive) {
            const tickDamage = this.burnDamagePerSecond * 0.25;
            this.takeDamage(tickDamage, false, this.burnAttacker, 0, 'burn');
            this.burnTickTimer += 0.25;
        }

        if (this.burnTimer <= 0) {
            this.clearBurning();
        }
    }

    setBurnVisual(intensity) {
        if (!this.mesh) return;
        this.mesh.traverse(child => {
            if (!child.material || !child.material.emissive) return;
            child.material.emissive.setHex(0xff6d00);
            child.material.emissiveIntensity = intensity;
        });
    }

    animateViewModelWeapon(weaponType) {
        // Кэшируем viewWeapon по типу оружия — не пересоздаём каждый кадр
        if (weaponType === this.viewWeaponType && this.viewWeapon) return;

        this.viewWeaponType = weaponType || null;
        if (!this.fpArms) return;
        if (!weaponType || weaponType === 'fists') {
            if (this.viewWeapon) {
                this.fpArms.remove(this.viewWeapon);
                this.viewWeapon = null;
                this.viewWeaponBase = null;
            }
            return;
        }

        if (!this.fpArms) return;

        // Удаляем старый mesh
        if (this.viewWeapon) {
            this.fpArms.remove(this.viewWeapon);
            this.viewWeapon = null;
            this.viewWeaponBase = null;
        }

        try {
            const source = new Weapon(weaponType, this.scene);
            if (!source.mesh) return;

            // Deep clone materials to isolate from shared materials + add polygonOffset to prevent z-fighting
            const matMap = new Map();
            const viewClone = source.mesh.clone();
            viewClone.traverse(child => {
                if (child.isMesh && child.material) {
                    if (!matMap.has(child.material)) {
                        const cloned = child.material.clone();
                        // Polygon offset prevents z-fighting with hands
                        cloned.polygonOffset = true;
                        cloned.polygonOffsetFactor = 1;
                        cloned.polygonOffsetUnits = 1;
                        matMap.set(child.material, cloned);
                    }
                    child.material = matMap.get(child.material);
                }
            });
            viewClone.userData.isViewWeapon = true;
            viewClone.visible = true;
            this.scene.remove(source.mesh);
            const offset = (this.getViewWeaponOffset && this.getViewWeaponOffset(weaponType))
                || { scale: 0.8, position: new THREE.Vector3(0.2, -0.4, -0.78), rotation: new THREE.Euler(0, -Math.PI / 2, 0) };
            viewClone.scale.setScalar(offset.scale);
            viewClone.position.copy(offset.position);
            viewClone.rotation.copy(offset.rotation);
            this.setupViewModel(viewClone, true);
            this.fpArms.add(viewClone);
            this.fpArms.visible = true;
            this.viewWeapon = viewClone;
            const baseRot = offset.rotation.clone();
            this.viewWeaponBase = {
                position: offset.position.clone(),
                rotation: baseRot
            };
            this.viewWeapon.userData.baseRotation = new THREE.Euler(this.viewWeapon.rotation.x, this.viewWeapon.rotation.y, this.viewWeapon.rotation.z);
        } catch (e) {
            console.warn('[Player] animateViewModelWeapon error:', e);
        }
    }

    updateViewWeapon() {
        const weapon = this.currentWeapon || this.fists;
        this.animateViewModelWeapon(weapon?.type);
    }

    getViewWeaponOffset(type) {
        return Weapon.getViewPose(type);
    }

    updateThirdPersonWeapon() {
        // Weapon is now a child of the socket, so it automatically follows
        // Just ensure the mesh is visible and transform is finite
        if (!this.currentWeapon?.mesh) return;
        this.currentWeapon.ensureFiniteTransform?.();
    }

    getAutoFireTarget(entityManager) {
        if (!entityManager) return null;
        const forward = this._tmpAutoForward;
        controls.getWorldDirection(forward);
        const origin = controls.camera.position;
        const maxDistance = this.currentWeapon?.range || 60;
        let best = null;
        let bestDist = maxDistance;

        for (const entity of entityManager.getEntities()) {
            if (!entity || !entity.isAlive || entity === this) continue;
            const toTarget = this._tmpAutoToTarget.subVectors(entity.position, origin);
            const dist = toTarget.length();
            if (dist > maxDistance || dist < 1.2) continue;
            toTarget.normalize();
            const dot = forward.dot(toTarget);
            if (dot < 0.988) continue;
            const aimPoint = this._tmpAutoAimPoint.set(
                entity.position.x,
                entity.position.y + (entity.physics?.height || 1.8) * 0.55,
                entity.position.z
            );
            if (typeof entityManager.hasLineOfSight === 'function') {
                const visible = entityManager.hasLineOfSight(origin, aimPoint, true);
                if (!visible) continue;
            }
            if (dist < bestDist) {
                best = entity;
                bestDist = dist;
            }
        }
        return best;
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
        if ((weapon.type === 'bow' || weapon.type === 'laser' || weapon.type === 'shotgun' || weapon.type === 'flamethrower' || weapon.type === 'pistol' || weapon.type === 'rifle' || weapon.type === 'machinegun') && weapon.ammo !== null && weapon.ammo <= 0) {
            this.currentWeapon = null;
            weapon = this.fists;
        }

        const distance = this.position.distanceTo(target.position);
        const baseRange = weapon.range || (weapon.type === 'fists' ? 2.4 : 3);
        const attackRange = baseRange * (weapon.type === 'shotgun' ? 0.9 : 1.0);

        if (distance > attackRange) return null;

        if (weapon.type === 'laser' || weapon.type === 'bow' || weapon.type === 'shotgun' || weapon.type === 'flamethrower' || weapon.type === 'pistol' || weapon.type === 'rifle' || weapon.type === 'machinegun') {
            const direction = this._tmpAttackDirection
                .subVectors(target.position, this.position)
                .normalize();

            const projectileData = weapon.attack(this, null, this.audioSynthRef, direction);
            if (projectileData && projectileData.projectiles) {
                for (const proj of projectileData.projectiles) {
                    proj.owner = this;
                    entityManager?.addProjectile(proj);
                }
                return { fired: true, damage: weapon.damage };
            }
            if (projectileData && projectileData.projectile) {
                projectileData.projectile.direction = direction;
                projectileData.projectile.owner = this;
                if (entityManager) {
                    entityManager.addProjectile(projectileData.projectile);
                }
                return { fired: true, damage: weapon.damage };
            }
        } else {
            const result = weapon.attack(this, target, this.audioSynthRef);
            if (result && result.hit) {
                target.takeDamage(result.damage, result.isHeadshot, this, result.knockback || 0);
                return { hit: true, damage: result.damage, killed: target.health <= 0 };
            }
        }

        return null;
    }
}

