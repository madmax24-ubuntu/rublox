import * as THREE from 'three';
import { Inventory } from '../items/Inventory.js';
import { Weapon } from '../items/Weapon.js';
import { spawnDamagePopup } from './DamagePopup.js';

export class Bot {
    constructor(scene, id, spawnPosition) {
        this.scene = scene;
        this.id = id;

        this.position = spawnPosition.clone();
        this.rotation = new THREE.Euler(0, Math.random() * Math.PI * 2, 0);
        this.physics = {
            velocity: new THREE.Vector3(0, 0, 0),
            onGround: false,
            height: 1.9,
            radius: 0.47,
            speed: 6 + Math.random() * 2
        };

        this.maxHealth = 80;
        this.health = this.maxHealth;
        this.armor = 0;
        this.maxArmor = 100;
        this.isInvulnerable = false;
        this.isAlive = true;

        this.inventory = new Inventory();
        this.currentWeapon = null;
        this.fists = new Weapon('fists', this.scene);

        this.state = 'spawn';
        this.target = null;
        this.allies = [];
        this.lastStateChange = 0;
        this.patrolTarget = null;
        this.slowTimer = 0;
        this.slowFactor = 1;
        this.lastPosition = this.position.clone();
        this.stuckTimer = 0;
        this.isStuck = false;
        this.audioSynthRef = null;
        this.escapeDir = null;
        this.escapeTimer = 0;
        this.moveDir = new THREE.Vector3(0, 0, 1);
        this.stats = { damage: 0, kills: 0, loot: 0 };
        this.teamId = 0;
        this.assistTimer = 0;
        this.assistTarget = null;
        this.nextAttackTime = 0;
        this.navProgressTimer = 0;
        this.navLastDistance = Infinity;
        this.navLastTargetKey = null;
        this.separationTimer = 0;
        this.burnTimer = 0;
        this.burnTickTimer = 0;
        this.burnDamagePerSecond = 0;
        this.burnAttacker = null;
        this.lastFlashTime = 0;
        this.preferTrainCombat = false;
        this.ignoreTrainAvoidance = false;
        this.healthRegenDelay = 7;
        this.healthRegenDuration = 7;
        this.lastDamageAt = -Infinity;
        this.noCombatUntil = 0;
        this.healthBarRefreshTimer = Math.random() * 0.12;
        this.healthBarLosTimer = 0;
        this.healthBarAimTimer = 0;
        this.healthBarVisibleCached = true;
        this.steeringCooldown = 0;
        this.cachedMoveDir = new THREE.Vector3(0, 0, 1);
        this.visualLastPosition = this.position.clone();
        this.visualSpeed = 0;
        this._tmpDirection = new THREE.Vector3();
        this._tmpAvoid = new THREE.Vector3();
        this._tmpTrainAvoid = new THREE.Vector3();
        this._tmpProbe = new THREE.Vector3();
        this._tmpProbe2 = new THREE.Vector3();
        this._tmpProbe3 = new THREE.Vector3();
        this._tmpUp = new THREE.Vector3(0, 1, 0);
        this._tmpCenter = new THREE.Vector3();
        this._tmpLosFrom = new THREE.Vector3();
        this._tmpLosTo = new THREE.Vector3();
        this._tmpArmWorld = new THREE.Vector3();
        this._tmpForward = new THREE.Vector3();
        this._tmpRight = new THREE.Vector3();
        this._tmpErr = new THREE.Vector3();

        this.variants = [
            {
                shirt: 0x4aa3ff,
                pants: 0x1b263b,
                harness: 0x263238,
                vest: 0x2b2b2b,
                hair: 0x1b1b1b,
                face: 'serious',
                gear: true,
                hat: 'cap',
                skin: 0xffd6b5,
                scale: 1.38
            },
            {
                shirt: 0xff7043,
                pants: 0x4e342e,
                harness: 0x3e2723,
                vest: 0x263238,
                hair: 0x3e2723,
                face: 'focused',
                gear: true,
                hat: 'beanie',
                skin: 0xf2c9a0,
                scale: 1.4
            },
            {
                shirt: 0x8e24aa,
                pants: 0x212121,
                harness: 0x4e342e,
                vest: null,
                hair: 0x5d4037,
                face: 'worried',
                gear: false,
                hat: null,
                skin: 0xf5d7b2,
                scale: 1.35
            },
            {
                shirt: 0x43a047,
                pants: 0x1b5e20,
                harness: 0x263238,
                vest: 0x1c313a,
                hair: 0x263238,
                face: 'serious',
                gear: true,
                hat: 'helmet',
                skin: 0xffd1a6,
                scale: 1.42
            },
            {
                shirt: 0xfdd835,
                pants: 0x6d4c41,
                harness: 0x3e2723,
                vest: null,
                hair: 0x212121,
                face: 'focused',
                gear: false,
                hat: 'hair',
                skin: 0xf7c59f,
                scale: 1.34
            },
            {
                shirt: 0x26a69a,
                pants: 0x004d40,
                harness: 0x1b1b1b,
                vest: 0x263238,
                hair: 0x4e342e,
                face: 'serious',
                gear: true,
                hat: 'cap',
                skin: 0xeec4a0,
                scale: 1.4
            }
        ];
        this.variant = Math.floor(Math.random() * this.variants.length);
        this.outfit = this.variants[this.variant];
        this.color = this.outfit.shirt;

        this.mesh = this.createMesh();
        this.mesh.scale.setScalar(this.outfit.scale || 1.4);
        this.healthBar = this.createHealthBar();
        this.mesh.add(this.healthBar);
        this.scene.add(this.mesh);
        this.updateColor();
    }

    syncWeaponVisibility() {
        const items = this.inventory.getItems?.() || [];
        for (const item of items) {
            if (item?.mesh) {
                item.setVisible(item === this.currentWeapon && this.isAlive);
            }
        }
    }

    createMesh() {
        const group = new THREE.Group();

        const skinMat = new THREE.MeshStandardMaterial({
            color: this.outfit.skin || 0xffd6b5,
            roughness: 0.4,
            metalness: 0.0,
            flatShading: true
        });
        const shirtMat = new THREE.MeshStandardMaterial({
            color: this.outfit.shirt,
            roughness: 0.35,
            metalness: 0.0,
            flatShading: true
        });
        const pantsMat = new THREE.MeshStandardMaterial({
            color: this.outfit.pants,
            roughness: 0.45,
            flatShading: true
        });
        const harnessMat = new THREE.MeshStandardMaterial({
            color: this.outfit.harness,
            roughness: 0.7,
            flatShading: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        const shoeMat = new THREE.MeshStandardMaterial({
            color: 0x3e3e3e,
            roughness: 0.6,
            flatShading: true
        });
        const gloveMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.7,
            flatShading: true
        });
        const detailMat = new THREE.MeshStandardMaterial({
            color: 0x263238,
            roughness: 0.6,
            flatShading: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });

        const upperTorso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.5), shirtMat);
        upperTorso.position.y = 1.45;
        upperTorso.userData.tintable = true;
        group.add(upperTorso);

        const lowerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.5), shirtMat);
        lowerTorso.position.y = 1.0;
        lowerTorso.userData.tintable = true;
        group.add(lowerTorso);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), skinMat);
        head.position.y = 2.05;
        group.add(head);

        if (this.outfit.hat !== 'helmet') {
            const hair = new THREE.Mesh(
                new THREE.BoxGeometry(0.7, 0.35, 0.7),
                new THREE.MeshStandardMaterial({ color: this.outfit.hair, roughness: 0.6, flatShading: true })
            );
            hair.position.set(0, 2.35, 0);
            group.add(hair);
        }

        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true });
        const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
        const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
        leftEye.position.set(-0.16, 2.08, 0.33);
        rightEye.position.set(0.16, 2.08, 0.33);
        group.add(leftEye);
        group.add(rightEye);

        const mouthMat = new THREE.MeshStandardMaterial({ color: 0x444444, flatShading: true });
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05), mouthMat);
        mouth.position.set(0, 1.92, 0.33);
        group.add(mouth);
        if (this.outfit.face === 'serious') {
            mouth.scale.set(1, 0.6, 1);
        } else if (this.outfit.face === 'worried') {
            mouth.scale.set(0.8, 1.2, 1);
        }

        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.05), detailMat);
        brow.position.set(0, 2.2, 0.33);
        group.add(brow);

        const upperArmGeo = new THREE.BoxGeometry(0.26, 0.45, 0.26);
        const lowerArmGeo = new THREE.BoxGeometry(0.24, 0.4, 0.24);
        const leftArm = new THREE.Mesh(upperArmGeo, shirtMat);
        leftArm.position.set(-0.62, 1.35, 0);
        leftArm.userData.tintable = true;
        group.add(leftArm);
        const leftForearm = new THREE.Mesh(lowerArmGeo, gloveMat);
        leftForearm.position.set(-0.62, 0.95, 0);
        group.add(leftForearm);

        const rightArm = new THREE.Mesh(upperArmGeo, shirtMat);
        rightArm.position.set(0.62, 1.35, 0);
        rightArm.userData.tintable = true;
        group.add(rightArm);
        const rightForearm = new THREE.Mesh(lowerArmGeo, gloveMat);
        rightForearm.position.set(0.62, 0.95, 0);
        group.add(rightForearm);

        const upperLegGeo = new THREE.BoxGeometry(0.3, 0.45, 0.3);
        const lowerLegGeo = new THREE.BoxGeometry(0.28, 0.45, 0.28);
        const leftLeg = new THREE.Mesh(upperLegGeo, pantsMat);
        leftLeg.position.set(-0.22, 0.75, 0);
        group.add(leftLeg);
        const leftShin = new THREE.Mesh(lowerLegGeo, pantsMat);
        leftShin.position.set(-0.22, 0.3, 0);
        group.add(leftShin);
        const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.42), shoeMat);
        leftShoe.position.set(-0.22, 0.05, 0.08);
        group.add(leftShoe);

        const rightLeg = new THREE.Mesh(upperLegGeo, pantsMat);
        rightLeg.position.set(0.22, 0.75, 0);
        group.add(rightLeg);
        const rightShin = new THREE.Mesh(lowerLegGeo, pantsMat);
        rightShin.position.set(0.22, 0.3, 0);
        group.add(rightShin);
        const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.42), shoeMat);
        rightShoe.position.set(0.22, 0.05, 0.08);
        group.add(rightShoe);

        if (this.outfit.vest) {
            const vest = new THREE.Mesh(
                new THREE.BoxGeometry(0.95, 0.5, 0.12),
                new THREE.MeshStandardMaterial({
                    color: this.outfit.vest,
                    roughness: 0.5,
                    flatShading: true,
                    polygonOffset: true,
                    polygonOffsetFactor: -1,
                    polygonOffsetUnits: -1
                })
            );
            vest.position.set(0, 1.35, 0.36);
            group.add(vest);
        }

        if (this.outfit.gear) {
            const strap1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.12), harnessMat);
            strap1.position.set(-0.25, 1.25, 0.26);
            strap1.rotation.z = 0.25;
            group.add(strap1);
            const strap2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.12), harnessMat);
            strap2.position.set(0.25, 1.25, 0.26);
            strap2.rotation.z = -0.25;
            group.add(strap2);

            const belt = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.6), harnessMat);
            belt.position.set(0, 0.95, 0);
            group.add(belt);

            const canteen = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8),
                new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.6, flatShading: true })
            );
            canteen.position.set(-0.35, 0.9, -0.3);
            canteen.rotation.z = Math.PI / 2;
            group.add(canteen);

            const sheath = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), harnessMat);
            sheath.position.set(0.35, 0.85, -0.3);
            group.add(sheath);
        }

        if (this.outfit.hat === 'cap') {
            const cap = new THREE.Mesh(
                new THREE.CylinderGeometry(0.36, 0.36, 0.22, 8),
                detailMat
            );
            cap.position.set(0, 2.45, 0);
            group.add(cap);

            const bill = new THREE.Mesh(
                new THREE.BoxGeometry(0.48, 0.06, 0.22),
                detailMat
            );
            bill.position.set(0, 2.38, 0.34);
            group.add(bill);
        } else if (this.outfit.hat === 'beanie') {
            const beanie = new THREE.Mesh(
                new THREE.CylinderGeometry(0.36, 0.32, 0.26, 8),
                detailMat
            );
            beanie.position.set(0, 2.42, 0);
            group.add(beanie);
        } else if (this.outfit.hat === 'helmet') {
            const helmet = new THREE.Mesh(
                new THREE.BoxGeometry(0.74, 0.4, 0.74),
                detailMat
            );
            helmet.position.set(0, 2.35, 0);
            group.add(helmet);
        }

        group.userData.isEntity = true;
        group.userData.isBot = true;
        group.userData.botId = this.id;
        group.userData.limbs = { leftArm, rightArm, leftLeg, rightLeg };
        return group;
    }

    createHealthBar() {
        const group = new THREE.Group();
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8, depthTest: false });
        const fillMat = new THREE.MeshBasicMaterial({ color: 0x4caf50, transparent: true, opacity: 0.95, depthTest: false });
        const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.12), bgMat);
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.08), fillMat);
        fill.position.set(-0.43, 0, 0.01);
        fill.userData.isFill = true;
        group.add(bg);
        group.add(fill);
        group.position.set(0, 2.65, 0);
        group.renderOrder = 900;
        group.traverse(child => {
            if (child.material) {
                child.material.depthTest = false;
                child.material.depthWrite = false;
            }
        });
        return group;
    }

    updateColor() {
        this.mesh.traverse(child => {
            if (!child.userData?.tintable) return;
            if (child.material && child.material.color) {
                child.material.color.setHex(this.color);
            }
        });
    }

    update(delta, brain, entityManager, lootManager, audioSynth, physics, zone) {
        if (!this.isAlive) {
            this.mesh.position.copy(this.position);
            if (this.healthBar) this.healthBar.visible = false;
            return;
        }
        if (this.healthBar) this.healthBar.visible = true;

        this.physicsRef = physics;
        this.zoneRef = zone || this.zoneRef;
        this.entityManagerRef = entityManager || this.entityManagerRef;
        this.lootManagerRef = lootManager || this.lootManagerRef;
        this.audioSynthRef = audioSynth;
        this.updateBurning(delta);
        this.updateHealthRegen(delta);
        this.steeringCooldown = Math.max(0, this.steeringCooldown - delta);

        if (this.slowTimer > 0) {
            this.slowTimer = Math.max(0, this.slowTimer - delta);
        } else {
            this.slowFactor = 1;
        }

        if (this.isFrozen) {
            this.physics.velocity.x = 0;
            this.physics.velocity.z = 0;
            this.mesh.position.copy(this.position);
            this.mesh.position.y = this.position.y - (this.physics.height - 0.2);
            this.mesh.rotation.y = this.rotation.y;
            return;
        }

        if (this.assistTimer > 0 && this.assistTarget) {
            this.assistTimer = Math.max(0, this.assistTimer - delta);
            this.moveTowards(this.assistTarget.position, this.physics.speed * 1.35);
            this.mesh.position.copy(this.position);
            this.mesh.position.y = this.position.y - (this.physics.height - 0.2);
            this.mesh.rotation.y = this.rotation.y;
            this.animateLimbs();
            this.updateHealthBar(delta);
            return;
        }

        if (zone && typeof zone.isInsideZone === 'function' && !zone.isInsideZone(this.position)) {
            const center = this._tmpCenter.set(0, this.position.y, 0);
            this.target = null;
            if (!this.patrolTarget) this.patrolTarget = new THREE.Vector3();
            this.patrolTarget.copy(center);
            this.moveTowards(center, this.physics.speed * 1.25);
            this.mesh.position.copy(this.position);
            this.mesh.position.y = this.position.y - (this.physics.height - 0.2);
            this.mesh.rotation.y = this.rotation.y;
            this.animateLimbs();
            this.updateHealthBar(delta);
            return;
        }


        this.ignoreTrainAvoidance = false;
        brain.update(this, delta, entityManager, lootManager, audioSynth);
        if (this.escapeTimer > 0) {
            this.escapeTimer = Math.max(0, this.escapeTimer - delta);
            if (this.escapeTimer === 0) {
                this.escapeDir = null;
            }
        }

        this.updateNavProgress(delta);
        if (this.isStuck && !this.escapeDir) {
            const angle = Math.random() * Math.PI * 2;
            this.escapeDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
            this.escapeTimer = 1.2;
            if (this.mapRef?.getFloorTiles) {
                const tiles = this.mapRef.getFloorTiles();
                if (tiles.length) {
                    for (let i = 0; i < 12; i++) {
                        const tile = tiles[Math.floor(Math.random() * tiles.length)];
                        const dx = tile.x - this.position.x;
                        const dz = tile.z - this.position.z;
                        const dist = Math.hypot(dx, dz);
                        if (dist < 25) continue;
                        this.patrolTarget = new THREE.Vector3(tile.x, 0, tile.z);
                        break;
                    }
                }
            }
            this.isStuck = false;
        }

        this.mesh.position.copy(this.position);
        this.mesh.position.y = this.position.y - (this.physics.height - 0.2);
        this.mesh.rotation.y = this.rotation.y;
        this.animateLimbs();
        this.updateHealthBar(delta);

        if (this.currentWeapon && this.currentWeapon.mesh && this.isAlive) {
            const limbs = this.mesh?.userData?.limbs;
            if (limbs?.rightArm) {
                this.mesh.updateMatrixWorld();
                limbs.rightArm.getWorldPosition(this._tmpArmWorld);
                this._tmpForward.set(Math.sin(this.rotation.y), 0, Math.cos(this.rotation.y));
                this._tmpRight.set(Math.cos(this.rotation.y), 0, -Math.sin(this.rotation.y));
                const grip = Weapon.getThirdPersonGrip(this.currentWeapon.type);
                this._tmpProbe
                    .copy(this._tmpArmWorld)
                    .addScaledVector(this._tmpForward, grip.forward)
                    .addScaledVector(this._tmpRight, grip.right)
                    .setY(this._tmpArmWorld.y + grip.up);

                this.currentWeapon.setPosition(this._tmpProbe);
                this.currentWeapon.setRotation(this.rotation);
            }
        }

        const moved = this.position.distanceTo(this.lastPosition);
        if (moved < 0.05 && !this.isFrozen) {
            this.stuckTimer += delta;
            if (this.stuckTimer > 1.0) {
                this.isStuck = true;
                if (this.mapRef) {
                    this.patrolTarget = null;
                }
            }
        } else {
            this.stuckTimer = 0;
            this.isStuck = false;
            this.lastPosition.copy(this.position);
        }

        // Simple separation to avoid bot clumping
        this.separationTimer = Math.max(0, this.separationTimer - delta);
        if (entityManager && this.isAlive && !this.isFrozen && this.separationTimer <= 0) {
            const nearby = entityManager.getNearbyEntities
                ? entityManager.getNearbyEntities(this.position, 5.2, 'Bot')
                : entityManager.getEntities();
            let sepX = 0;
            let sepZ = 0;
            let count = 0;
            for (const e of nearby) {
                if (e === this || !e.isAlive || e.constructor?.name !== 'Bot') continue;
                const dx = this.position.x - e.position.x;
                const dz = this.position.z - e.position.z;
                const distSq = dx * dx + dz * dz;
                if (distSq > 0.0001 && distSq < 23.04) {
                    const dist = Math.sqrt(distSq);
                    const inv = 1 / dist;
                    const pushPower = 1.55 / Math.max(0.22, Math.pow(dist, 1.08));
                    sepX += dx * inv * pushPower;
                    sepZ += dz * inv * pushPower;
                    count += 1;
                }
            }
            if (count > 0) {
                this.physics.velocity.x += sepX * 1.35 + (Math.random() - 0.5) * 0.45;
                this.physics.velocity.z += sepZ * 1.35 + (Math.random() - 0.5) * 0.45;
            }
            this.separationTimer = 0.12 + Math.random() * 0.06;
        }
    }

    animateLimbs() {
        const limbs = this.mesh?.userData?.limbs;
        if (!limbs) return;

        const velocitySpeed = Math.sqrt(
            this.physics.velocity.x * this.physics.velocity.x +
            this.physics.velocity.z * this.physics.velocity.z
        );
        const speed = Math.max(velocitySpeed, this.visualSpeed || 0);
        const speedNorm = Math.min(1, speed / Math.max(0.001, this.physics.speed));
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

    selectSlot(slot) {
        const weapon = this.inventory.selectSlot(slot);
        if (this.currentWeapon) {
            this.currentWeapon.setVisible(false);
        }

        if (weapon) {
            this.currentWeapon = weapon;
        } else {
            this.currentWeapon = null;
        }
        this.syncWeaponVisibility();
    }

    pickupLoot(loot) {
        if (loot.type === 'weapon') {
            const weapon = new Weapon(loot.weaponType, this.scene);
            const result = this.inventory.addItem(weapon);
            if (result.added) {
                if (!this.currentWeapon || !this.inventory.getSelectedWeapon()) {
                    this.selectSlot(result.slot);
                } else {
                    weapon.setVisible(false);
                }
            } else {
                weapon.dispose();
            }
        } else if (loot.type === 'armor') {
            this.armor = Math.min(this.maxArmor, this.armor + loot.amount);
        } else if (loot.type === 'ammo') {
            const amount = loot.amount || 0;
            if (amount > 0) {
                const candidates = this.inventory.getItems().filter(w => w && w.ammo !== null);
                const target = this.currentWeapon && this.currentWeapon.ammo !== null
                    ? this.currentWeapon
                    : candidates[0];
                if (target) {
                    target.ammo = Math.min(target.maxAmmo ?? target.ammo, (target.ammo ?? 0) + amount);
                }
            }
        }
        this.stats.loot += 1;
    }

    takeDamage(damage, isHeadshot = false, attacker = null, knockbackStrength = 0, source = null) {
        if (this.isInvulnerable) return false;

        const finalDamage = isHeadshot ? damage * 2 : damage;
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
            this.mesh.position.y = this.position.y - (this.physics.height - 0.2) - 0.8;
            this.mesh.rotation.set(-Math.PI / 2, this.rotation.y, 0);
            this.syncWeaponVisibility();
            if (attacker?.stats) {
                attacker.stats.kills += 1;
            }
            this.clearBurning();
        }
        const isDotDamage = source === 'zone' || source === 'storm' || source === 'burn' || source === 'trap';
        if (!isDotDamage) {
            this.flashDamage();
            spawnDamagePopup(this.scene, this.position, finalDamage, { color: '#ff5b5b', key: `bot-${this.id}` });
        }
        if (source === 'flame' && this.isAlive) {
            this.applyBurn(2.6, 4.5, attacker);
        }
        if (this.audioSynthRef) {
            if (source === 'zone' && this.audioSynthRef.playZoneDamage) {
                this.audioSynthRef.playZoneDamage();
            } else if (this.audioSynthRef.playHurt) {
                this.audioSynthRef.playHurt();
            }
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

    applyBurn(duration = 2.5, damagePerSecond = 4, attacker = null) {
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
        const pulse = 0.2 + Math.sin(performance.now() * 0.03 + this.id) * 0.1;
        this.setBurnVisual(Math.max(0.12, pulse));

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
        this.mesh.traverse(child => {
            if (!child.material || !child.material.emissive) return;
            child.material.emissive.setHex(0xff6d00);
            child.material.emissiveIntensity = intensity;
        });
    }

    updateHealthBar(delta = 0.016) {
        if (!this.healthBar) return;
        const isMobile = !!this.scene?.userData?.mobileMode;
        const ratio = Math.max(0, Math.min(1, this.health / this.maxHealth));
        const fill = this.healthBar.children.find(child => child.userData?.isFill);
        if (fill) {
            fill.scale.x = ratio;
            fill.position.x = -0.43 + 0.43 * ratio;
            if (ratio < 0.3) fill.material.color.setHex(0xf44336);
            else if (ratio < 0.6) fill.material.color.setHex(0xffc107);
            else fill.material.color.setHex(0x4caf50);
        }
        const camera = this.scene.userData?.camera;
        if (camera) {
            this.healthBarRefreshTimer = Math.max(0, this.healthBarRefreshTimer - delta);
            this.healthBarLosTimer = Math.max(0, this.healthBarLosTimer - delta);
            this.healthBarAimTimer = Math.max(0, this.healthBarAimTimer - delta);
            if (this.healthBarRefreshTimer > 0) return;
            this.healthBarRefreshTimer = isMobile ? 0.2 + Math.random() * 0.1 : 0.08 + Math.random() * 0.06;
            const dx = camera.position.x - this.position.x;
            const dz = camera.position.z - this.position.z;
            const distSq = dx * dx + dz * dz;
            const entityManager = this.scene.userData?.entityManager;
            let visible = distSq < (isMobile ? (13 * 13) : (19 * 19));
            if (!isMobile && visible && entityManager?.hasLineOfSight && this.healthBarLosTimer <= 0) {
                this._tmpLosFrom.copy(camera.position);
                this._tmpLosTo.set(this.position.x, this.position.y + (this.physics?.height || 1.8) * 0.65, this.position.z);
                this.healthBarVisibleCached = entityManager.hasLineOfSight(this._tmpLosFrom, this._tmpLosTo, true);
                this.healthBarLosTimer = 0.22 + Math.random() * 0.12;
            }
            this.healthBar.visible = isMobile ? visible : (visible && this.healthBarVisibleCached);
            if (this.healthBar.visible && this.healthBarAimTimer <= 0) {
                this.healthBar.lookAt(camera.position);
                this.healthBarAimTimer = isMobile ? 0.22 : 0.12;
            }
        }
    }

    syncVisualAfterPhysics(delta = 0.016) {
        if (!this.mesh) return;
        const dt = Math.max(0.001, delta || 0.016);
        const moved = this.position.distanceTo(this.visualLastPosition);
        this.visualSpeed = moved / dt;
        this.visualLastPosition.copy(this.position);

        this.mesh.position.copy(this.position);
        this.mesh.position.y = this.position.y - (this.physics.height - 0.2);
        this.mesh.rotation.y = this.rotation.y;
        this.animateLimbs();
        if (this.healthBar) this.updateHealthBar(delta);

        if (this.currentWeapon && this.currentWeapon.mesh && this.isAlive) {
            const limbs = this.mesh?.userData?.limbs;
            if (limbs?.rightArm) {
                this.mesh.updateMatrixWorld();
                limbs.rightArm.getWorldPosition(this._tmpArmWorld);
                this._tmpForward.set(Math.sin(this.rotation.y), 0, Math.cos(this.rotation.y));
                this._tmpRight.set(Math.cos(this.rotation.y), 0, -Math.sin(this.rotation.y));
                const grip = Weapon.getThirdPersonGrip(this.currentWeapon.type);
                this._tmpProbe
                    .copy(this._tmpArmWorld)
                    .addScaledVector(this._tmpForward, grip.forward)
                    .addScaledVector(this._tmpRight, grip.right)
                    .setY(this._tmpArmWorld.y + grip.up);
                this.currentWeapon.setPosition(this._tmpProbe);
                this.currentWeapon.setRotation(this.rotation);
            }
        }
    }

    setInvulnerable(value) {
        this.isInvulnerable = value;
    }

    updateHealthRegen(delta) {
        if (!this.isAlive || this.health >= this.maxHealth) return;
        const now = performance.now() / 1000;
        if (now - this.lastDamageAt < this.healthRegenDelay) return;
        const regenPerSecond = this.maxHealth / this.healthRegenDuration;
        this.health = Math.min(this.maxHealth, this.health + regenPerSecond * delta);
    }

    moveTowards(target, speed) {
        const toTargetX = target.x - this.position.x;
        const toTargetZ = target.z - this.position.z;
        const lenSq = toTargetX * toTargetX + toTargetZ * toTargetZ;
        if (lenSq < 1e-6) {
            this.physics.velocity.x = 0;
            this.physics.velocity.z = 0;
            return;
        }
        const invLen = 1 / Math.sqrt(lenSq);
        const direction = this._tmpDirection.set(toTargetX * invLen, 0, toTargetZ * invLen);

        if (this.escapeDir && this.escapeTimer > 0) {
            direction.copy(this.escapeDir);
        }

        if (this.steeringCooldown <= 0) {
            this.computeAvoidance(direction, this._tmpAvoid);
            if (this._tmpAvoid.lengthSq() > 0.0001) {
                direction.addScaledVector(this._tmpAvoid, 1.2).normalize();
            }

            this.computeTrainAvoidance(direction, this._tmpTrainAvoid);
            if (this._tmpTrainAvoid.lengthSq() > 0.0001) {
                direction.addScaledVector(this._tmpTrainAvoid, 1.35).normalize();
            }

            const angles = [0, Math.PI / 10, -Math.PI / 10, Math.PI / 4, -Math.PI / 4];
            let bestScore = Infinity;
            let found = false;
            this._tmpProbe2.copy(direction);
            for (const angle of angles) {
                this._tmpProbe3.copy(direction).applyAxisAngle(this._tmpUp, angle);
                if (this.isDirectionBlocked(this._tmpProbe3)) continue;
                const px = this.position.x + this._tmpProbe3.x * 2.2;
                const pz = this.position.z + this._tmpProbe3.z * 2.2;
                const dx = target.x - px;
                const dz = target.z - pz;
                const score = dx * dx + dz * dz;
                if (score < bestScore) {
                    bestScore = score;
                    this._tmpProbe2.copy(this._tmpProbe3);
                    found = true;
                }
            }
            if (!found) {
                const angle = (Math.random() * 0.8 - 0.4) + Math.PI / 2;
                this._tmpProbe2.copy(direction).applyAxisAngle(this._tmpUp, angle);
                this.escapeDir = this._tmpProbe2.clone();
                this.escapeTimer = 0.8;
            }
            this.cachedMoveDir.copy(this._tmpProbe2).normalize();
            this.steeringCooldown = 0.12 + Math.random() * 0.06;
        } else {
            direction.copy(this.cachedMoveDir);
        }

        const finalSpeed = speed * this.slowFactor;
        this.physics.velocity.x = direction.x * finalSpeed;
        this.physics.velocity.z = direction.z * finalSpeed;

        const targetRot = Math.atan2(direction.x, direction.z);
        if (finalSpeed > 0.2) {
            this.rotation.y = this.lerpAngle(this.rotation.y, targetRot, 0.25);
            this.moveDir.copy(direction);
        }
    }

    lookAt(target) {
        const direction = this._tmpProbe.set(
            target.x - this.position.x,
            0,
            target.z - this.position.z
        );
        if (direction.lengthSq() < 1e-6) return;
        direction.normalize();
        const targetRot = Math.atan2(direction.x, direction.z);
        this.rotation.y = this.lerpAngle(this.rotation.y, targetRot, 0.25);
    }

    applySlow(factor, duration) {
        this.slowFactor = Math.min(this.slowFactor, factor);
        this.slowTimer = Math.max(this.slowTimer, duration);
    }

    attack(target, entityManager) {
        let weapon = this.currentWeapon || this.fists;
        if (!weapon || !target || !target.isAlive) return null;
        const now = performance.now() / 1000;
        if (now < this.nextAttackTime) return null;

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
            const direction = this._tmpDirection
                .subVectors(target.position, this.position)
                .normalize();
            if (entityManager?.hasLineOfSight) {
                this._tmpLosFrom.set(this.position.x, this.position.y + (this.physics?.height || 1.8) * 0.55, this.position.z);
                this._tmpLosTo.set(target.position.x, target.position.y + (target.physics?.height || 1.8) * 0.55, target.position.z);
                if (!entityManager.hasLineOfSight(this._tmpLosFrom, this._tmpLosTo, true)) {
                    this.nextAttackTime = now + 0.12;
                    return null;
                }
            }

            if (weapon.type === 'bow') {
                this._tmpErr.set(
                    (Math.random() - 0.5) * 0.08,
                    (Math.random() - 0.5) * 0.045,
                    (Math.random() - 0.5) * 0.08
                );
                direction.add(this._tmpErr).normalize();
            }

            const projectileData = weapon.type === 'bow'
                ? weapon.attack(this, null, null, direction, { chargeRatio: 0.55 })
                : weapon.attack(this, null, null, direction);
            const cadence = Math.max(0.09, (weapon.cooldown || 0.2) * (weapon.type === 'bow' ? 0.95 : 0.82));
            if (projectileData && projectileData.projectiles) {
                for (const proj of projectileData.projectiles) {
                    proj.owner = this;
                    entityManager?.addProjectile(proj);
                }
                this.nextAttackTime = now + cadence;
                return { fired: true, damage: weapon.damage };
            }
            if (projectileData && projectileData.projectile) {
                projectileData.projectile.direction = direction;
                projectileData.projectile.owner = this;
                if (entityManager) {
                    entityManager.addProjectile(projectileData.projectile);
                }
                this.nextAttackTime = now + cadence;
                return { fired: true, damage: weapon.damage };
            }
        } else {
            const result = weapon.attack(this, target);
            if (result && result.hit) {
                const killed = target.takeDamage(result.damage, result.isHeadshot, this, result.knockback || 0);
                this.nextAttackTime = now + Math.max(0.12, (weapon.cooldown || 0.3) * 0.85);
                return { hit: true, damage: result.damage, killed: target.health <= 0 };
            }
        }

        return null;
    }

    updateNavProgress(delta) {
        const target = this.target?.position || this.patrolTarget;
        if (!target) {
            this.navProgressTimer = 0;
            this.navLastDistance = Infinity;
            this.navLastTargetKey = null;
            return;
        }
        const key = `${Math.round(target.x)}:${Math.round(target.z)}`;
        const dist = this.position.distanceTo(target);
        if (this.navLastTargetKey !== key) {
            this.navLastTargetKey = key;
            this.navLastDistance = dist;
            this.navProgressTimer = 0;
            return;
        }
        if (dist < this.navLastDistance - 0.2) {
            this.navLastDistance = dist;
            this.navProgressTimer = 0;
            return;
        }
        this.navProgressTimer += delta;
        if (this.navProgressTimer > 1.4) {
            this.isStuck = true;
            this.navProgressTimer = 0;
            this.navLastDistance = dist;
            this.patrolTarget = null;
        }
    }

    isDirectionBlocked(dir) {
        if (!this.physicsRef?.getNearbyColliders) return false;
        this._tmpProbe.copy(this.position).addScaledVector(dir, 1.55);
        if (this.mapRef?.isWalkableAt && !this.mapRef.isWalkableAt(this._tmpProbe.x, this._tmpProbe.z)) {
            return true;
        }
        const nearby = this.physicsRef.getNearbyColliders(this._tmpProbe, 1.8);
        const bottom = this.position.y - this.physics.height + 0.2;
        for (const box of nearby) {
            if (box.enabled === false) continue;
            if (this._tmpProbe.x < box.min.x - 0.1 || this._tmpProbe.x > box.max.x + 0.1) continue;
            if (this._tmpProbe.z < box.min.z - 0.1 || this._tmpProbe.z > box.max.z + 0.1) continue;
            if (bottom > box.max.y - 0.1) continue;
            return true;
        }
        return false;
    }

    computeAvoidance(forward, out = null) {
        const result = out || this._tmpAvoid;
        result.set(0, 0, 0);
        if (!this.physicsRef?.getNearbyColliders) return result;
        const radius = (this.physics?.radius || 0.5) + 0.6;
        const sampleDist = 2.2;
        this._tmpProbe2.copy(this.position).addScaledVector(forward, sampleDist);
        const nearby = this.physicsRef.getNearbyColliders(this._tmpProbe2, 2.6);
        for (const box of nearby) {
            if (box.enabled === false) continue;
            if (box.walkable) continue;
            const closestX = Math.max(box.min.x, Math.min(box.max.x, this.position.x));
            const closestZ = Math.max(box.min.z, Math.min(box.max.z, this.position.z));
            const dx = this.position.x - closestX;
            const dz = this.position.z - closestZ;
            const distSq = dx * dx + dz * dz;
            const minDist = radius;
            if (distSq < minDist * minDist && distSq > 1e-4) {
                const dist = Math.sqrt(distSq);
                const push = (minDist - dist) / minDist;
                result.x += (dx / dist) * push;
                result.z += (dz / dist) * push;
            }
        }
        return result;
    }

    computeTrainAvoidance(forward, out = null) {
        const result = out || this._tmpTrainAvoid;
        result.set(0, 0, 0);
        if (this.ignoreTrainAvoidance || this.state === 'trainCombat') return result;
        const map = this.mapRef;
        if (!map?.getTrainCarsSnapshot) return result;
        const trains = map.getTrainCarsSnapshot();
        if (!trains.length) return result;

        for (const train of trains) {
            const axisX = train.axis === 'x';
            const alongDist = axisX
                ? Math.abs(this.position.x - train.x)
                : Math.abs(this.position.z - train.z);
            const acrossDist = axisX
                ? Math.abs(this.position.z - train.z)
                : Math.abs(this.position.x - train.x);
            const halfWidth = (train.width || 4.8) * 0.5 + 1.4;
            if (acrossDist > halfWidth || alongDist > 13.5) continue;

            const intensity = Math.max(0.1, 1 - alongDist / 13.5);
            if (axisX) {
                result.z += (this.position.z >= train.z ? 1 : -1) * intensity;
            } else {
                result.x += (this.position.x >= train.x ? 1 : -1) * intensity;
            }
        }

        if (result.lengthSq() <= 0.0001) return result;
        result.normalize();
        if (result.dot(forward) < -0.2) {
            result.multiplyScalar(0.45);
        }
        return result;
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

    flashDamage() {
        const now = performance.now();
        if (now - this.lastFlashTime < 90) return;
        this.lastFlashTime = now;
        this.mesh.traverse(child => {
            if (!child.material || !child.material.emissive) return;
            child.material.emissive.setHex(0xff2d2d);
            child.material.emissiveIntensity = 0.7;
        });
        setTimeout(() => {
            this.mesh.traverse(child => {
                if (!child.material || !child.material.emissive) return;
                child.material.emissiveIntensity = 0;
            });
        }, 120);
    }

    lerpAngle(a, b, t) {
        let diff = b - a;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        return a + diff * t;
    }
}

