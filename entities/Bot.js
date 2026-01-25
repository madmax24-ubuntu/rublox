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
            radius: 0.4,
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

    update(delta, brain, entityManager, lootManager, audioSynth, physics) {
        if (!this.isAlive) {
            this.mesh.position.copy(this.position);
            if (this.healthBar) this.healthBar.visible = false;
            return;
        }
        if (this.healthBar) this.healthBar.visible = true;

        this.physicsRef = physics;
        this.audioSynthRef = audioSynth;

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

        brain.update(this, delta, entityManager, lootManager, audioSynth);
        if (this.escapeTimer > 0) {
            this.escapeTimer = Math.max(0, this.escapeTimer - delta);
            if (this.escapeTimer === 0) {
                this.escapeDir = null;
            }
        }
        if (this.isStuck && !this.escapeDir) {
            const angle = Math.random() * Math.PI * 2;
            this.escapeDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
            this.escapeTimer = 0.6;
            this.isStuck = false;
        }

        this.mesh.position.copy(this.position);
        this.mesh.position.y = this.position.y - (this.physics.height - 0.2);
        this.mesh.rotation.y = this.rotation.y;
        this.animateLimbs();
        this.updateHealthBar();

        if (this.currentWeapon && this.currentWeapon.mesh) {
            const weaponPos = this.position.clone();
            weaponPos.y += 1.2;
            weaponPos.x += Math.cos(this.rotation.y) * 0.5;
            weaponPos.z += Math.sin(this.rotation.y) * 0.5;

            this.currentWeapon.setPosition(weaponPos);
            this.currentWeapon.setRotation(this.rotation);
        }

        const moved = this.position.distanceTo(this.lastPosition);
        if (moved < 0.05 && !this.isFrozen) {
            this.stuckTimer += delta;
            if (this.stuckTimer > 1.0) {
                this.isStuck = true;
            }
        } else {
            this.stuckTimer = 0;
            this.isStuck = false;
            this.lastPosition.copy(this.position);
        }
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
            this.mesh.position.y = this.position.y - (this.physics.height - 0.2) - 0.8;
            this.mesh.rotation.set(-Math.PI / 2, this.rotation.y, 0);
        }
        this.flashDamage();
        spawnDamagePopup(this.scene, this.position, finalDamage, { color: '#ff5b5b' });
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

    updateHealthBar() {
        if (!this.healthBar) return;
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
            this.healthBar.lookAt(camera.position);
        }
    }

    setInvulnerable(value) {
        this.isInvulnerable = value;
    }

    moveTowards(target, speed) {
        let direction = new THREE.Vector3()
            .subVectors(target, this.position)
            .normalize();

        if (this.escapeDir && this.escapeTimer > 0) {
            direction = this.escapeDir.clone();
        }

        if (this.physicsRef) {
            const isBlocked = dir => {
                if (!this.physicsRef.getNearbyColliders) return false;
                const probe = this.position.clone().add(dir.clone().multiplyScalar(1.2));
                const nearby = this.physicsRef.getNearbyColliders(probe, 1.6);
                const bottom = this.position.y - this.physics.height + 0.2;
                for (const box of nearby) {
                    if (box.enabled === false) continue;
                    if (probe.x < box.min.x - 0.1 || probe.x > box.max.x + 0.1) continue;
                    if (probe.z < box.min.z - 0.1 || probe.z > box.max.z + 0.1) continue;
                    if (bottom > box.max.y - 0.1) continue;
                    return true;
                }
                return false;
            };

            if (isBlocked(direction)) {
                const left = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
                const right = left.clone().multiplyScalar(-1);
                if (!isBlocked(left)) direction = left;
                else if (!isBlocked(right)) direction = right;
                else direction = direction.clone().multiplyScalar(-1);
            }
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
        const direction = new THREE.Vector3()
            .subVectors(target, this.position)
            .normalize();
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
                const killed = target.takeDamage(result.damage, result.isHeadshot, this, result.knockback || 0);
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

    flashDamage() {
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
