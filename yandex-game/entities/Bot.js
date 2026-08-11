import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Inventory } from '../items/Inventory.js';
import { Weapon } from '../items/Weapon.js';

let botLodGeometry = null;
const botGeometryCache = new Map();
const getBotBox = (width, height, depth) => {
    const key = `b:${width}:${height}:${depth}`;
    if (!botGeometryCache.has(key)) botGeometryCache.set(key, new THREE.BoxGeometry(width, height, depth));
    return botGeometryCache.get(key);
};
const getBotCylinder = (top, bottom, height, segments = 8) => {
    const key = `c:${top}:${bottom}:${height}:${segments}`;
    if (!botGeometryCache.has(key)) botGeometryCache.set(key, new THREE.CylinderGeometry(top, bottom, height, segments));
    return botGeometryCache.get(key);
};
const getBotLodGeometry = () => {
    if (botLodGeometry) return botLodGeometry;
    const parts = [
        [0.9, 1.0, 0.5, 0, 1.05, 0],
        [0.65, 0.65, 0.65, 0, 1.9, 0],
        [0.25, 0.9, 0.25, -0.58, 1.05, 0],
        [0.25, 0.9, 0.25, 0.58, 1.05, 0],
        [0.3, 0.8, 0.3, -0.22, 0.4, 0],
        [0.3, 0.8, 0.3, 0.22, 0.4, 0]
    ].map(([w, h, d, x, y, z]) => {
        const geometry = new THREE.BoxGeometry(w, h, d);
        geometry.translate(x, y, z);
        return geometry;
    });
    botLodGeometry = BufferGeometryUtils.mergeGeometries(parts);
    for (const part of parts) part.dispose();
    return botLodGeometry;
};

export class Bot {
    constructor(scene, id, spawnPosition) {
        this.scene = scene;
        this.id = id;

        this.position = spawnPosition.clone();
        this.rotation = new THREE.Euler(0, Math.random() * Math.PI * 2, 0);
        this.physics = {
            velocity: new THREE.Vector3(0, 0, 0),
            onGround: false,
            height: 1.7,
            radius: 0.4,
            speed: 8.4 + Math.random() * 1.8
        };

        this.maxHealth = 200;
        this.health = this.maxHealth;
        this.medkits = 1;
        this.armor = 36;
        this.maxArmor = 120;
        this.isInvulnerable = false;
        this.isAlive = true;

        this.inventory = new Inventory();
        this.currentWeapon = null;
        this.fists = new Weapon('fists', this.scene);

        this.state = 'spawn';
        this.target = null;
        this.allies = [];
        this.lastStateChange = 0;
        this._targetScale = 1; // Will be set after outfit assignment
        this._currentScale = 1;
        this.patrolTarget = new THREE.Vector3();
        this.slowTimer = 0;
        this.slowFactor = 1;
        this.lastPosition = this.position.clone();
        this._safePosition = this.position.clone();
        this.stuckTimer = 0;
        this.isStuck = false;
        this.escapeDir = new THREE.Vector3();
        this._hasEscapeDir = false;
        this._tmpEscapeDir = new THREE.Vector3();
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
        // Кэш grip-параметров для каждого типа оружия — не вызывать getThirdPersonGrip каждый кадр
        this._weaponGripCache = {};
        this.ignoreTrainAvoidance = false;
        this.healthRegenDelay = 3;
        this.healthRegenDuration = 5;
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
        this._tmpWeaponRot = new THREE.Vector3();
        this._tmpErr = new THREE.Vector3();
        this._tmpScale = new THREE.Vector3(1, 1, 1);
        this._lodCameraForward = new THREE.Vector3();
        this._lodToEntity = new THREE.Vector3();
        this._animTime = 0;
        this._tintedChildren = new Set();
        this._damageFlashUntil = 0;
        this._weaponRecoilTimer = 0;

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
                scale: 1
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
                scale: 1
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
                scale: 1
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
                scale: 1
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
                scale: 1
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
                scale: 1
            }
        ];
        this.variant = Math.floor(Math.random() * this.variants.length);
        this.outfit = this.variants[this.variant];
        this.color = this.outfit.shirt;
        this._targetScale = this.outfit.scale; // FIX: smooth scale transitions
        this._currentScale = this.outfit.scale;

        // Personality traits — each bot is unique
        this.personality = {
            aggression: 0.82 + Math.random() * 0.18,
            caution: 0.1 + Math.random() * 0.5,
            lootFocus: 0.15 + Math.random() * 0.85
        };

        // Memory systems — remember where we looted and where we got shot at
        this.lootedAreas = [];
        this.enemyEncounters = [];

        this.mesh = this.createMesh();
        this._lodDetailed = false;
        this.baseModelScale = Number.isFinite(this.outfit?.scale) ? this.outfit.scale : 1;
        this.mesh.scale.setScalar(this.baseModelScale);
        // Pre-allocate bounding sphere for frustum culling
        this.mesh._frustumSphere = new THREE.Sphere(new THREE.Vector3(), 1.0);
        this.healthBar = this.createHealthBar();
        this.healthBar.visible = false;
        this.mesh.add(this.healthBar);
        this.scene.add(this.mesh);
        this.updateColor();
    }

    syncWeaponVisibility() {
        const items = this.inventory.getItems?.() || [];
        for (const item of items) {
            if (item?.mesh) {
                const isActive = item === this.currentWeapon && this.isAlive && this._lodDetailed !== false;
                item.setVisible(isActive);
                if (!isActive && item.mesh.parent && item.mesh.parent !== this.scene) {
                    item.mesh.parent.remove(item.mesh);
                }
            }
        }
    }

    updateWeaponTransform() {
        if (!this.currentWeapon || !this.currentWeapon.mesh || !this.isAlive) return;
        // OPTIMIZED: Throttle weapon transform for idle bots — only update every 3 frames when not firing
        this._weaponFrameCounter = (this._weaponFrameCounter || 0) + 1;
        if (this._weaponRecoilTimer <= 0 && this._weaponFrameCounter % 3 !== 0) return;

        const limbs = this.mesh?.userData?.limbs;
        if (!limbs?.rightArm) return;
        const wType = this.currentWeapon.type;
        if (this._cachedGripType !== wType) {
            this._cachedGrip = Weapon.getThirdPersonGrip(wType);
            this._cachedGripType = wType;
        }
        const grip = this._cachedGrip;
        const mesh = this.currentWeapon.mesh;
        if (![grip?.right, grip?.up, grip?.forward].every(Number.isFinite)) {
            this.currentWeapon.ensureFiniteTransform?.();
            return;
        }
        if (mesh.parent !== limbs.rightArm) {
            limbs.rightArm.add(mesh);
        }
        if (!mesh.userData?.damageTintConfigured) {
            mesh.userData.damageTintConfigured = true;
            mesh.userData.ignoreDamageTint = true;
            mesh.traverse((child) => {
                if (!child.userData) child.userData = {};
                child.userData.ignoreDamageTint = true;
            });
        }
        const gripMul = this.currentWeapon.type === 'bow' ? 0.64 : 0.74;
        const armYBias = this.currentWeapon.type === 'bow' ? -0.2 : -0.16;
        mesh.position.set(
            grip.right * gripMul + 0.02,
            grip.up * gripMul + armYBias,
            grip.forward * gripMul + 0.12
        );
        this._tmpWeaponRot.set(0, 0, 0);
        if (this.currentWeapon.type === 'bow') {
            this._tmpWeaponRot.x = -0.12;
            this._tmpWeaponRot.y = 0.04;
        } else if (this.currentWeapon.type === 'knife') {
            this._tmpWeaponRot.x = -0.08;
            this._tmpWeaponRot.y = -0.05;
        } else if (this.currentWeapon.type === 'pistol') {
            this._tmpWeaponRot.x = -0.03;
        } else if (this.currentWeapon.type === 'shotgun' || this.currentWeapon.type === 'rifle' || this.currentWeapon.type === 'machinegun' || this.currentWeapon.type === 'flamethrower' || this.currentWeapon.type === 'laser') {
            this._tmpWeaponRot.x = -0.06;
        }

        // Recoil animation
        if (this._weaponRecoilTimer > 0) {
            const recoilFactor = this._weaponRecoilTimer / 0.12;
            this._tmpWeaponRot.x -= recoilFactor * 0.25;
            this._tmpWeaponRot.z = recoilFactor * 0.1;
            this._weaponRecoilTimer -= 0.016;
        }

        // Apply weapon animation system (idle bob, sway)
        const isShooting = this._weaponRecoilTimer > 0;
        const isMoving = Math.abs(this.physics?.velocity?.x) > 0.2 || Math.abs(this.physics?.velocity?.z) > 0.2;
        this.currentWeapon?.anim?.update(0.016, isShooting, isMoving, 0, 0);
        this.currentWeapon?.anim?.applyToMesh(mesh, this.currentWeapon.type);

        mesh.rotation.set(this._tmpWeaponRot.x, this._tmpWeaponRot.y + Math.PI / 2, this._tmpWeaponRot.z);
    }

    applyWeaponRecoil() {
        this._weaponRecoilTimer = 0.12;
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
            flatShading: true
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
            flatShading: true
        });

        const upperTorso = new THREE.Mesh(getBotBox(0.9, 0.55, 0.5), shirtMat);
        upperTorso.position.y = 1.45;
        upperTorso.userData.tintable = true;
        group.add(upperTorso);

        const lowerTorso = new THREE.Mesh(getBotBox(0.85, 0.45, 0.5), shirtMat);
        lowerTorso.position.y = 1.0;
        lowerTorso.userData.tintable = true;
        group.add(lowerTorso);

        const head = new THREE.Mesh(getBotBox(0.65, 0.65, 0.65), skinMat);
        head.position.y = 2.05;
        group.add(head);

        if (this.outfit.hat !== 'helmet') {
            const hair = new THREE.Mesh(
                getBotBox(0.7, 0.35, 0.7),
                new THREE.MeshStandardMaterial({ color: this.outfit.hair, roughness: 0.6, flatShading: true })
            );
            hair.position.set(0, 2.35, 0);
            group.add(hair);
        }

        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true });
        const leftEye = new THREE.Mesh(getBotBox(0.1, 0.1, 0.05), eyeMat);
        const rightEye = new THREE.Mesh(getBotBox(0.1, 0.1, 0.05), eyeMat);
        leftEye.position.set(-0.16, 2.08, 0.33);
        rightEye.position.set(0.16, 2.08, 0.33);
        group.add(leftEye);
        group.add(rightEye);

        const mouthMat = new THREE.MeshStandardMaterial({ color: 0x444444, flatShading: true });
        const mouth = new THREE.Mesh(getBotBox(0.24, 0.05, 0.05), mouthMat);
        mouth.position.set(0, 1.92, 0.33);
        group.add(mouth);
        if (this.outfit.face === 'serious') {
            mouth.scale.set(1, 0.6, 1);
        } else if (this.outfit.face === 'worried') {
            mouth.scale.set(0.8, 1.2, 1);
        }

        const brow = new THREE.Mesh(getBotBox(0.34, 0.05, 0.05), detailMat);
        brow.position.set(0, 2.2, 0.33);
        group.add(brow);

        const upperArmGeo = getBotBox(0.26, 0.45, 0.26);
        const lowerArmGeo = getBotBox(0.24, 0.4, 0.24);
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

        const upperLegGeo = getBotBox(0.3, 0.45, 0.3);
        const lowerLegGeo = getBotBox(0.28, 0.45, 0.28);
        const leftLeg = new THREE.Mesh(upperLegGeo, pantsMat);
        leftLeg.position.set(-0.22, 0.75, 0);
        group.add(leftLeg);
        const leftShin = new THREE.Mesh(lowerLegGeo, pantsMat);
        leftShin.position.set(-0.22, 0.3, 0);
        group.add(leftShin);
        const leftShoe = new THREE.Mesh(getBotBox(0.32, 0.16, 0.42), shoeMat);
        leftShoe.position.set(-0.22, 0.05, 0.08);
        group.add(leftShoe);

        const rightLeg = new THREE.Mesh(upperLegGeo, pantsMat);
        rightLeg.position.set(0.22, 0.75, 0);
        group.add(rightLeg);
        const rightShin = new THREE.Mesh(lowerLegGeo, pantsMat);
        rightShin.position.set(0.22, 0.3, 0);
        group.add(rightShin);
        const rightShoe = new THREE.Mesh(getBotBox(0.32, 0.16, 0.42), shoeMat);
        rightShoe.position.set(0.22, 0.05, 0.08);
        group.add(rightShoe);

        if (this.outfit.vest) {
            const vest = new THREE.Mesh(
                getBotBox(0.95, 0.5, 0.12),
                new THREE.MeshStandardMaterial({
                    color: this.outfit.vest,
                    roughness: 0.5,
                    flatShading: true
                })
            );
            vest.position.set(0, 1.35, 0.36);
            group.add(vest);
        }

        if (this.outfit.gear) {
            const strap1 = new THREE.Mesh(getBotBox(0.1, 0.9, 0.12), harnessMat);
            strap1.position.set(-0.25, 1.25, 0.26);
            strap1.rotation.z = 0.25;
            group.add(strap1);
            const strap2 = new THREE.Mesh(getBotBox(0.1, 0.9, 0.12), harnessMat);
            strap2.position.set(0.25, 1.25, 0.26);
            strap2.rotation.z = -0.25;
            group.add(strap2);

            const belt = new THREE.Mesh(getBotBox(0.9, 0.1, 0.6), harnessMat);
            belt.position.set(0, 0.95, 0);
            group.add(belt);

            const canteen = new THREE.Mesh(
                getBotCylinder(0.12, 0.12, 0.3, 8),
                new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.6, flatShading: true })
            );
            canteen.position.set(-0.35, 0.9, -0.3);
            canteen.rotation.z = Math.PI / 2;
            group.add(canteen);

            const sheath = new THREE.Mesh(getBotBox(0.08, 0.35, 0.08), harnessMat);
            sheath.position.set(0.35, 0.85, -0.3);
            group.add(sheath);
        }

        if (this.outfit.hat === 'cap') {
            const cap = new THREE.Mesh(
                getBotCylinder(0.36, 0.36, 0.22, 8),
                detailMat
            );
            cap.position.set(0, 2.45, 0);
            group.add(cap);

            const bill = new THREE.Mesh(
                getBotBox(0.48, 0.06, 0.22),
                detailMat
            );
            bill.position.set(0, 2.38, 0.34);
            group.add(bill);
        } else if (this.outfit.hat === 'beanie') {
            const beanie = new THREE.Mesh(
                getBotCylinder(0.36, 0.32, 0.26, 8),
                detailMat
            );
            beanie.position.set(0, 2.42, 0);
            group.add(beanie);
        } else if (this.outfit.hat === 'helmet') {
            const helmet = new THREE.Mesh(
                getBotBox(0.74, 0.4, 0.74),
                detailMat
            );
            helmet.position.set(0, 2.35, 0);
            group.add(helmet);
        }

        group.userData.detailChildren = [...group.children];
        const lodProxy = new THREE.Mesh(getBotLodGeometry(), shirtMat);
        for (const child of group.userData.detailChildren) child.visible = false;
        lodProxy.visible = true;
        lodProxy.userData.isLodProxy = true;
        lodProxy.userData.tintable = true;
        group.add(lodProxy);
        group.userData.lodProxy = lodProxy;
        group.userData.isEntity = true;
        group.userData.isBot = true;
        group.userData.botId = this.id;
        group.userData.limbs = { leftArm, rightArm, leftLeg, rightLeg };
        return group;
    }

    createHealthBar() {
        const group = new THREE.Group();
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8, depthTest: true });
        const fillMat = new THREE.MeshBasicMaterial({ color: 0x4caf50, transparent: true, opacity: 0.95, depthTest: true });
        const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.12), bgMat);
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.08), fillMat);
        fill.position.set(-0.43, 0, 0.01);
        fill.userData.isFill = true;
        group.add(bg);
        group.add(fill);
        group.position.set(0, 2.65, 0);
        bg.renderOrder = 2;
        fill.renderOrder = 3;
        group.traverse(child => {
            if (child.material) {
                child.material.depthTest = true;
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

    update(delta, brain, entityManager, lootManager, audioSynth, physics, zone, gameState) {
        this._deferredDelta = (this._deferredDelta || 0) + delta;
        this._gameState = gameState;
        this.updateDamageFlash();
        if (![this.position.x, this.position.y, this.position.z].every(Number.isFinite)) {
            this.position.copy(this._safePosition);
            this.physics.velocity.set(0, 0, 0);
            this.patrolTarget = null;
            this.target = null;
        }
        if (!this.isAlive) {
            this.mesh.position.copy(this.position);
            if (this.healthBar) this.healthBar.visible = false;
            return;
        }
        if (this.healthBar) this.healthBar.visible = true;

        // Health regen — bots recover HP when not in combat and not burning
        if (this.health < this.maxHealth && !this.burnTimer && !(this._lastAttackedBy && performance.now() - this._lastAttackedBy < 5000)) {
            const regenPerSecond = 1.8 + (this.id % 3) * 0.4; // 1.8-2.8 HP/s
            this.health = Math.min(this.maxHealth, this.health + regenPerSecond * delta);
        }

        // OPTIMIZED: Skip expensive AI for near-idle bots every other frame
        if (this._aiSkipFrame) {
            this.mesh.position.copy(this.position);
            this.mesh.position.y = this.position.y - this.physics.height;
            this.mesh.rotation.y = this.rotation.y;
            if (this._visuallyRelevant) {
                this._animTime = performance.now() / 1000;
                const detailed = this.updateRenderLod(delta);
                if (detailed) this.animateLimbs();
                this.updateHealthBar(delta);
                if (detailed) this.updateWeaponTransform();
            }
            return;
        }

        delta = Math.min(0.12, this._deferredDelta);
        this._deferredDelta = 0;

        this.physicsRef = physics;
        this.zoneRef = zone || this.zoneRef;
        this.entityManagerRef = entityManager || this.entityManagerRef;
        this.lootManagerRef = lootManager || this.lootManagerRef;
        this.audioSynthRef = audioSynth;
        this._animTime = performance.now() / 1000;
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
            this.mesh.position.y = this.position.y - this.physics.height;
            this.mesh.rotation.y = this.rotation.y;
            this.updateWeaponTransform();
            return;
        }

        if (this.assistTimer > 0 && this.assistTarget) {
            this.assistTimer = Math.max(0, this.assistTimer - delta);
            this.moveTowards(this.assistTarget.position, this.physics.speed * 1.35);
            this.mesh.position.copy(this.position);
            this.mesh.position.y = this.position.y - this.physics.height;
            this.mesh.rotation.y = this.rotation.y;
            this.animateLimbs();
            this.updateHealthBar(delta);
            this.updateWeaponTransform();
            this.updateBurning(delta);
            this._healthRegenTimer = (this._healthRegenTimer || 0) + delta;
            if (this._healthRegenTimer >= this.healthRegenDuration && this.health < this.maxHealth) {
                this._healthRegenTimer = 0;
                const heal = 1.8;
                this.health = Math.min(this.maxHealth, this.health + heal);
                this.lastHealTime = performance.now();
            }
            if (this.medkits > 0 && this.health < this.maxHealth * 0.35 && !this._lastMedkitUse) {
                this._lastMedkitUse = performance.now();
                this.health = Math.min(this.maxHealth, this.health + 45);
                this.medkits--;
            }
            return;
        }

        // Skip zone retreat during countdown — bots should loot, not retreat to center
        const isCountdown = gameState === 'countdown';
        if (zone && typeof zone.isInsideZone === 'function' && !zone.isInsideZone(this.position) && !isCountdown) {
            const center = this._tmpCenter.set(0, this.position.y, 0);
            this.target = null;
            this.patrolTarget.copy(center);
            this.moveTowards(center, this.physics.speed * 1.25);
            this.mesh.position.copy(this.position);
            this.mesh.position.y = this.position.y - this.physics.height;
            this.mesh.rotation.y = this.rotation.y;
            this.animateLimbs();
            this.updateHealthBar(delta);
            this.updateBurning(delta);
            this._healthRegenTimer = (this._healthRegenTimer || 0) + delta;
            if (this._healthRegenTimer >= this.healthRegenDuration && this.health < this.maxHealth) {
                this._healthRegenTimer = 0;
                const heal = 1.8;
                this.health = Math.min(this.maxHealth, this.health + heal);
                this.lastHealTime = performance.now();
            }
            if (this.medkits > 0 && this.health < this.maxHealth * 0.35 && !this._lastMedkitUse) {
                this._lastMedkitUse = performance.now();
                this.health = Math.min(this.maxHealth, this.health + 45);
                this.medkits--;
            }
            return;
        }


        this.ignoreTrainAvoidance = false;
        brain.update(this, delta, entityManager, lootManager, audioSynth, gameState);
        if (this.escapeTimer > 0) {
            this.escapeTimer = Math.max(0, this.escapeTimer - delta);
            if (this.escapeTimer === 0) {
                this._hasEscapeDir = false;
            }
        }

        this.updateNavProgress(delta);
        if (this.isStuck && !this._hasEscapeDir) {
            // Bias escape toward previous movement direction for smoother recovery
            if (this.moveDir.lengthSq() > 0.01) {
                const angle = (Math.random() - 0.5) * 1.5;
                this._tmpEscapeDir.copy(this.moveDir).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            } else {
                const angle = Math.random() * Math.PI * 2;
                this._tmpEscapeDir.set(Math.cos(angle), 0, Math.sin(angle));
            }
            this.escapeDir.copy(this._tmpEscapeDir);
            this._hasEscapeDir = true;
            this.escapeTimer = 1.5;
            if (this.mapRef?.getFloorTiles) {
                const tiles = this.mapRef.getFloorTiles();
                if (tiles.length) {
                    for (let i = 0; i < 12; i++) {
                        const tile = tiles[Math.floor(Math.random() * tiles.length)];
                        const dx = tile.x - this.position.x;
                        const dz = tile.z - this.position.z;
                        const dist = Math.hypot(dx, dz);
                        if (dist < 25) continue;
                        if (!this.patrolTarget) this.patrolTarget = new THREE.Vector3();
                        this.patrolTarget.set(tile.x, 0, tile.z);
                        break;
                    }
                }
            }
            this.isStuck = false;
        }

        this.mesh.position.copy(this.position);
        this.mesh.position.y = this.position.y - this.physics.height;
        this.mesh.rotation.y = this.rotation.y;
        if (this._visuallyRelevant) {
            this.animateLimbs();
            this.updateHealthBar(delta);
            this.updateWeaponTransform();
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

        // OPTIMIZED: Separation to avoid bot clumping — throttled per-bot
        const isEarlyGame = this.noCombatUntil && performance.now() < this.noCombatUntil;
        const sepRadius = isEarlyGame ? 8.0 : 4.5;
        const sepRadiusSq = sepRadius * sepRadius;
        this.separationTimer = Math.max(0, this.separationTimer - delta);
        // OPTIMIZED: Increase separation interval to reduce spatial queries
        const sepInterval = isEarlyGame ? (0.32 + (this.id % 5) * 0.025) : (0.52 + (this.id % 7) * 0.025);
        if (entityManager && this.isAlive && !this.isFrozen && this.separationTimer <= 0) {
            const nearby = entityManager.getNearbyEntities
                ? entityManager.getNearbyEntities(this.position, sepRadius, 'Bot')
                : entityManager.getEntities();
            let sepX = 0;
            let sepZ = 0;
            let count = 0;
            for (const e of nearby) {
                if (e === this || !e.isAlive || e.constructor?.name !== 'Bot') continue;
                const dx = this.position.x - e.position.x;
                const dz = this.position.z - e.position.z;
                const distSq = dx * dx + dz * dz;
                if (distSq > 0.0001 && distSq < sepRadiusSq) {
                    const dist = Math.sqrt(distSq);
                    const inv = 1 / dist;
                    const pushPower = (isEarlyGame ? 2.0 : 1.0) / Math.max(0.22, Math.pow(dist, 1.08));
                    sepX += dx * inv * pushPower;
                    sepZ += dz * inv * pushPower;
                    count += 1;
                    if (count >= 6) break;
                }
            }
            if (count > 0) {
                const multiplier = isEarlyGame ? 1.2 : 0.8;
                this.physics.velocity.x += sepX * multiplier + (Math.random() - 0.5) * 0.4;
                this.physics.velocity.z += sepZ * multiplier + (Math.random() - 0.5) * 0.4;
            }
            this.separationTimer = sepInterval;
        }
        if ([this.position.x, this.position.y, this.position.z].every(Number.isFinite)) {
            this._safePosition.copy(this.position);
        } else {
            this.position.copy(this._safePosition);
            this.physics.velocity.set(0, 0, 0);
        }
    }

    animateLimbs() {
        // OPTIMIZED: Throttle limb animation to every 2 frames — visual impact is minimal
        this._animFrameCounter = (this._animFrameCounter || 0) + 1;
        if (this._animFrameCounter % 2 !== 0) return;

        const limbs = this.mesh?.userData?.limbs;
        if (!limbs) return;

        const velocitySpeed = Math.sqrt(
            this.physics.velocity.x * this.physics.velocity.x +
            this.physics.velocity.z * this.physics.velocity.z
        );
        const speed = Math.max(velocitySpeed, this.visualSpeed || 0);
        const speedNorm = Math.min(1, speed / Math.max(0.001, this.physics.speed));
        const time = this._animTime;
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

    pickupLoot(loot, chestPosition) {
        // Record looted area in memory
        if (chestPosition) {
            this.lootedAreas.push({ pos: chestPosition.clone(), time: performance.now() });
            // Cap memory to prevent unbounded growth
            if (this.lootedAreas.length > 20) this.lootedAreas.shift();
        }

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
        } else if (loot.type === 'heal') {
            this.medkits = Math.min(4, (this.medkits || 0) + (loot.amount > 35 ? 2 : 1));
        }
        this.stats.loot += 1;
    }

    takeDamage(damage, isHeadshot = false, attacker = null, knockbackStrength = 0, source = null) {
        if (this.isInvulnerable) return false;

        const now = performance.now();
        const inLootPhase = !!(this.noCombatUntil && now < this.noCombatUntil);
        if (inLootPhase && attacker?.constructor?.name === 'Bot') return false;

        const finalDamage = isHeadshot ? damage * 2 : damage;
        if (finalDamage > 0) {
            this.lastDamageAt = performance.now() / 1000;
            // Stagger effect — bot briefly slows down when hit
            if (finalDamage > 10) {
                this.slowTimer = Math.max(this.slowTimer, 0.3 + finalDamage * 0.02);
                this.slowFactor = Math.min(this.slowFactor, 0.4 + (1 - finalDamage / 100) * 0.4);
            }
        }
        if (attacker?.stats) {
            attacker.stats.damage += finalDamage;
        }

        // Record enemy encounter in memory
        if (attacker && attacker.position) {
            const isDotDamage = source === 'zone' || source === 'storm' || source === 'burn' || source === 'trap';
            if (!isDotDamage && !inLootPhase) {
                this._lastAttackedBy = now;
                this._retaliationTarget = attacker;
                this._retaliateUntil = now + 8000;
                this.target = attacker;
                this.state = 'engage';
                this._fsmCtx = null;
                this.enemyEncounters.push({ pos: attacker.position.clone(), time: performance.now(), damage: finalDamage });
                if (this.enemyEncounters.length > 15) this.enemyEncounters.shift();
            } else if (inLootPhase) {
                this.target = null;
                this.assistTarget = null;
                this._retaliationTarget = null;
                this._retaliateUntil = 0;
            }
        }

        if (source === 'storm') {
            this.health -= finalDamage;
        } else if (this.armor > 0) {
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
            this._corpseExpiresAt = performance.now() + 3500;
            this._corpseCleaned = false;
            this.syncWeaponVisibility();
            if (attacker?.stats) {
                attacker.stats.kills += 1;
            }
            this.clearBurning();
        }
        const isDotDamage = source === 'zone' || source === 'storm' || source === 'burn' || source === 'trap';
        if (!isDotDamage) {
            this.flashDamage();
            // Damage popup removed - spawnDamagePopup.js was cleaned up
        }
        if (source === 'flame' && this.isAlive) {
            this.applyBurn(2.6, 4.5, attacker);
        }
        if (this.audioSynthRef) {
            if (source === 'zone' && this.audioSynthRef.playZoneDamage) {
                this.audioSynthRef.playZoneDamage();
            } else if (this.audioSynthRef.playNpcHurt) {
                this.audioSynthRef.playNpcHurt(this.position, `id:${this.id}`);
            } else if (this.audioSynthRef.playHurt) {
                this.audioSynthRef.playHurt(this.position, `id:${this.id}`);
            }
        }
        if (attacker && this.isAlive) {
            const strength = knockbackStrength > 0 ? knockbackStrength : 3;
            // Use local vars instead of shared _tmpDirection to avoid race conditions
            const dx = this.position.x - attacker.position.x;
            const dz = this.position.z - attacker.position.z;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            this.physics.velocity.x += (dx / len) * strength;
            this.physics.velocity.z += (dz / len) * strength;
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
            if (child.userData?.ignoreDamageTint) return;
            if (!child.material || !child.material.emissive) return;
            this.ensureTintMaterial(child);
            child.material.emissive.setHex(0xff6d00);
            child.material.emissiveIntensity = intensity;
        });
    }

    ensureTintMaterial(child) {
        if (!child?.material || child.userData?.ignoreDamageTint) return;
        if (child.userData?.tintMaterialOwned) return;
        if (Array.isArray(child.material)) return;
        const oldMat = child.material;
        child.material = oldMat.clone();
        oldMat.dispose();
        child.userData.tintMaterialOwned = true;
        this._tintedChildren.add(child);
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
        const camera = this._cachedCamera || (this._cachedCamera = this.scene?.userData?.camera);
        if (camera) {
            this.healthBarLosTimer -= delta;

            const dx = camera.position.x - this.position.x;
            const dz = camera.position.z - this.position.z;
            const distSq = dx * dx + dz * dz;
            // OPTIMIZED: Reduce health bar visibility range
            const visRange = isMobile ? 13 : 17;
            let visible = distSq < (visRange * visRange);

            // OPTIMIZED: Skip LOS for far bots (stale cache is OK)
            if (!visible) {
                this.healthBar.visible = false;
                return;
            }

            const losInterval = (isMobile ? 0.7 : 0.5) + ((this.id % 7) * 0.04);
            if (this.healthBarLosTimer <= 0) {
                const entityManager = this.scene.userData?.entityManager;
                if (entityManager?.hasLineOfSight) {
                    this._tmpLosFrom.copy(camera.position);
                    this._tmpLosTo.set(this.position.x, this.position.y + (this.physics?.height || 1.8) * 0.65, this.position.z);
                    this.healthBarVisibleCached = entityManager.hasLineOfSight(this._tmpLosFrom, this._tmpLosTo, true);
                }
                this.healthBarLosTimer = losInterval;
            }

            this.healthBar.visible = visible && this.healthBarVisibleCached;

            if (this.healthBar.visible) {
                this.healthBar.lookAt(camera.position);
            }
        }
    }

    syncVisualAfterPhysics(delta = 0.016, lightweight = false) {
        if (!this.mesh) return;
        const dt = Math.max(0.001, delta || 0.016);
        const moved = this.position.distanceTo(this.visualLastPosition);
        this.visualSpeed = moved / dt;
        this.visualLastPosition.copy(this.position);
        const stepSpeed = Math.min(1, this.visualSpeed / Math.max(0.001, this.physics.speed));
        const stepNow = performance.now() * 0.001;
        const listener = this.audioSynthRef?.listenerPosition;
        if (listener && stepSpeed > 0.18 && stepNow >= (this._nextFootstepAt || 0)) {
            const dx = this.position.x - listener.x;
            const dy = this.position.y - listener.y;
            const dz = this.position.z - listener.z;
            if (dx * dx + dy * dy + dz * dz <= 2025) {
                this.audioSynthRef.playRemoteFootstep?.(this.position, `bot-${this.id}`, 0.55 + stepSpeed * 0.4);
            }
            this._nextFootstepAt = stepNow + Math.max(0.32, 0.54 - stepSpeed * 0.14);
        }

        const modelScale = Number.isFinite(this.baseModelScale) ? this.baseModelScale : 1;
        if (Math.abs(this.mesh.scale.x - modelScale) > 0.0001) this.mesh.scale.setScalar(modelScale);

        this.mesh.position.copy(this.position);
        this.mesh.position.y = this.position.y - this.physics.height;
        this.mesh.rotation.y = this.rotation.y;
        const detailed = this.updateRenderLod(delta);
        if (lightweight && !detailed) return;
        if (detailed) this.animateLimbs();
        if (this.healthBar) this.updateHealthBar(delta);

        if (detailed) this.updateWeaponTransform();
    }

    updateRenderLod(delta) {
        this._lodTimer = (this._lodTimer ?? ((this.id % 10) * 0.03)) - delta;
        if (this._lodTimer > 0) return this._lodDetailed !== false;
        this._lodTimer = 0.3;
        const camera = this._cachedCamera || (this._cachedCamera = this.scene?.userData?.camera);
        if (!camera) return true;
        camera.getWorldDirection(this._lodCameraForward);
        this._lodToEntity.set(
            this.position.x - camera.position.x,
            this.position.y + 0.9 - camera.position.y,
            this.position.z - camera.position.z
        );
        const distanceSq = this._lodToEntity.lengthSq();
        const distance = Math.sqrt(distanceSq);
        const verticalFov = THREE.MathUtils.degToRad(camera.fov || 60);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * (camera.aspect || 1));
        const visibleAngle = Math.max(verticalFov, horizontalFov) * 0.5 + 0.22;
        const inView = distance > 0.001 && this._lodToEntity.dot(this._lodCameraForward) / distance >= Math.cos(visibleAngle);
        const crowdedStart = this.scene?.userData?.gameState === 'countdown' || this.scene?.userData?.gameState === 'spawn';
        const detailDistance = crowdedStart
            ? (this.scene?.userData?.mobileMode ? 12 : 16)
            : (this.scene?.userData?.mobileMode ? 20 : 28);
        const detailed = distanceSq <= (crowdedStart ? 16 : 64) || (inView && distanceSq <= detailDistance * detailDistance);
        if (this._lodDetailed === detailed) return detailed;
        this._lodDetailed = detailed;
        for (const child of this.mesh.userData.detailChildren || []) child.visible = detailed;
        if (this.mesh.userData.lodProxy) this.mesh.userData.lodProxy.visible = !detailed && !this.mesh.userData.useBatchedLod;
        if (this.currentWeapon?.mesh) this.currentWeapon.mesh.visible = detailed && this.isAlive;
        return detailed;
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

    useMedkit() {
        if (!this.isAlive) return false;
        if ((this.medkits || 0) <= 0) return false;
        if (this.health >= this.maxHealth * 0.98) return false;
        this.medkits -= 1;
        this.health = Math.min(this.maxHealth, this.health + 70);
        this.armor = Math.min(this.maxArmor, this.armor + 12);
        this.lastDamageAt = -Infinity;
        return true;
    }

    moveTowards(target, speed) {
        if (!target || ![target.x, target.z, this.position.x, this.position.z, speed].every(Number.isFinite)) {
            this.physics.velocity.x = 0;
            this.physics.velocity.z = 0;
            return;
        }
        const toTargetX = target.x - this.position.x;
        const toTargetZ = target.z - this.position.z;
        const lenSq = toTargetX * toTargetX + toTargetZ * toTargetZ;
        if (!Number.isFinite(lenSq) || lenSq < 1e-6) {
            this.physics.velocity.x = 0;
            this.physics.velocity.z = 0;
            return;
        }
        const invLen = 1 / Math.sqrt(lenSq);
        const direction = this._tmpDirection.set(toTargetX * invLen, 0, toTargetZ * invLen);

        if (this._hasEscapeDir && this.escapeTimer > 0) {
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

            const angles = [
                0,
                Math.PI / 8, -Math.PI / 8,
                Math.PI / 4, -Math.PI / 4,
                Math.PI / 2, -Math.PI / 2,
                Math.PI
            ];
            let bestScore = Infinity;
            let found = false;
            this._tmpProbe2.copy(direction);
            const steeringColliders = this.physicsRef?.getNearbyColliders?.(this.position, 7) || [];
            for (const angle of angles) {
                this._tmpProbe3.copy(direction).applyAxisAngle(this._tmpUp, angle);
                if (this.isDirectionBlocked(this._tmpProbe3, 4.5, steeringColliders)) continue;
                const px = this.position.x + this._tmpProbe3.x * 4;
                const pz = this.position.z + this._tmpProbe3.z * 4;
                const dx = target.x - px;
                const dz = target.z - pz;
                const score = dx * dx + dz * dz + Math.abs(angle) * 8;
                if (score < bestScore) {
                    bestScore = score;
                    this._tmpProbe2.copy(this._tmpProbe3);
                    found = true;
                }
            }
            if (!found) {
                this._tmpProbe2.copy(direction).multiplyScalar(-1);
                this.escapeDir.copy(this._tmpProbe2);
                this._hasEscapeDir = true;
                this.escapeTimer = 1.1;
            }
            this.cachedMoveDir.copy(this._tmpProbe2).normalize();
            this.steeringCooldown = 0.14 + Math.random() * 0.1;
        }
        direction.copy(this.cachedMoveDir);

        const finalSpeed = speed * this.slowFactor;
        // Movement inertia — blend toward new direction instead of snapping
        const inertia = 0.32;
        this.physics.velocity.x = this.physics.velocity.x * inertia + direction.x * finalSpeed * (1 - inertia);
        this.physics.velocity.z = this.physics.velocity.z * inertia + direction.z * finalSpeed * (1 - inertia);

        const targetRot = Math.atan2(direction.x, direction.z);
        if (finalSpeed > 0.2) {
            this.rotation.y = this.lerpAngle(this.rotation.y, targetRot, 0.15);
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
        this.rotation.y = this.lerpAngle(this.rotation.y, targetRot, 0.15);
    }

    applySlow(factor, duration) {
        this.slowFactor = Math.min(this.slowFactor, factor);
        this.slowTimer = Math.max(this.slowTimer, duration);
    }

    attack(target, entityManager) {
        let weapon = this.currentWeapon || this.fists;
        if (!weapon || !target || !target.isAlive) return null;
        if (this.noCombatUntil && performance.now() < this.noCombatUntil) return null;
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
            const aimErr = Math.max(0, this._dynamicAimError || 0);
            if (aimErr > 0.0001) {
                this._tmpErr.set(
                    (Math.random() - 0.5) * aimErr * 2,
                    (Math.random() - 0.5) * aimErr * 0.9,
                    (Math.random() - 0.5) * aimErr * 2
                );
                direction.add(this._tmpErr).normalize();
            }
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
                ? weapon.attack(this, null, this.audioSynthRef, direction, { chargeRatio: 0.55, ignoreCooldown: true })
                : weapon.attack(this, null, this.audioSynthRef, direction, { ignoreCooldown: true });
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
            const result = weapon.attack(this, target, this.audioSynthRef, null, { ignoreCooldown: true });
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

    isDirectionBlocked(dir, distance = 3.5, colliders = null) {
        if (!this.physicsRef?.getNearbyColliders) return false;
        const bottom = this.position.y - this.physics.height + 0.2;
        const top = this.position.y - 0.05;
        const maxDistance = Math.max(0.8, Number(distance) || 3.5);
        const endX = this.position.x + dir.x * maxDistance;
        const endZ = this.position.z + dir.z * maxDistance;
        if (this.mapRef?.isWalkableAt && !this.mapRef.isWalkableAt(endX, endZ)) return true;
        const nearby = colliders || this.physicsRef.getNearbyColliders(this.position, maxDistance + 1.5);
        for (let probeDistance = Math.min(1.1, maxDistance); probeDistance <= maxDistance + 0.01; probeDistance += 1.1) {
            this._tmpProbe.copy(this.position).addScaledVector(dir, probeDistance);
            for (const box of nearby) {
                if (box.enabled === false || box.walkable) continue;
                if (top < box.min.y + 0.05 || bottom > box.max.y - 0.1) continue;
                if (this._tmpProbe.x < box.min.x - 0.45 || this._tmpProbe.x > box.max.x + 0.45) continue;
                if (this._tmpProbe.z < box.min.z - 0.45 || this._tmpProbe.z > box.max.z + 0.45) continue;
                return true;
            }
        }
        return false;
    }

    computeAvoidance(forward, out = null) {
        const result = out || this._tmpAvoid;
        result.set(0, 0, 0);
        if (!this.physicsRef?.getNearbyColliders) return result;
        const radius = (this.physics?.radius || 0.5) + 0.6;
        const sampleDist = 4.0;
        const bottom = this.position.y - this.physics.height + 0.2;
        const top = this.position.y - 0.05;
        this._tmpProbe2.copy(this.position).addScaledVector(forward, sampleDist);
        const nearby = this.physicsRef.getNearbyColliders(this._tmpProbe2, 2.6);
        for (const box of nearby) {
            if (box.enabled === false) continue;
            if (box.walkable) continue;
            if (top < box.min.y + 0.05 || bottom > box.max.y - 0.1) continue;
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
        this._damageFlashUntil = now + 120;
        this.mesh.traverse(child => {
            if (child.userData?.ignoreDamageTint) return;
            if (!child.material || !child.material.emissive) return;
            this.ensureTintMaterial(child);
            child.material.emissive.setHex(0xff2d2d);
            child.material.emissiveIntensity = 0.7;
        });
    }

    updateDamageFlash() {
        if (!this._damageFlashUntil || performance.now() < this._damageFlashUntil) return;
        this._damageFlashUntil = 0;
        for (const child of this._tintedChildren) {
            if (child?.material?.emissive) child.material.emissiveIntensity = 0;
        }
    }

    lerpAngle(a, b, t) {
        let diff = b - a;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        return a + diff * t;
    }
}
