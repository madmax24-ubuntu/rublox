import * as THREE from 'three';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const VARIANT_CONFIG = {
    runner: {
        health: 42, speed: 7.6, damage: 5.8, knockbackMultiplier: 1.2,
        scale: 1.2, radius: 0.48, bodyColor: 0xc34b2f, headColor: 0xc8c2a7, detailColor: 0xf0a13b,
        eyeColor: 0xff4411, glowColor: 0x44ff22, glowIntensity: 1.8,
        attackCooldown: 0.52, patrolSpeed: 0.7, alertRadius: 80,
        moanInterval: [1.2, 2.4], attackInterval: [0.3, 0.8],
        hasHorns: false, hasMask: true, hasSpikes: false, hasBackpack: false,
        hasArmorPlates: false, armAngle: -0.8, clawLength: 0.25,
        walkSpeed: 8, idleBreathe: 0.02,
        behavior: 'rush'
    },
    normal: {
        health: 72, speed: 5.1, damage: 7.2, knockbackMultiplier: 0.8,
        scale: 1.35, radius: 0.54, bodyColor: 0x6f3434, headColor: 0xb9b49b, detailColor: 0xd7c7a2,
        eyeColor: 0xff6600, glowColor: 0x8bff4f, glowIntensity: 1.35,
        attackCooldown: 0.72, patrolSpeed: 0.7, alertRadius: 68,
        moanInterval: [1.8, 3.6], attackInterval: [0.5, 1.2],
        hasHorns: true, hasMask: false, hasSpikes: false, hasBackpack: false,
        hasArmorPlates: true, armAngle: -0.85, clawLength: 0.3,
        walkSpeed: 6, idleBreathe: 0.015,
        behavior: 'patrol'
    },
    heavy: {
        health: 180, speed: 3.2, damage: 9.2, knockbackMultiplier: 0,
        scale: 1.56, radius: 0.6, bodyColor: 0x3f4a50, headColor: 0x9c7a70, detailColor: 0xb23b2f,
        eyeColor: 0xff2200, glowColor: 0x3dff1f, glowIntensity: 2.2,
        attackCooldown: 1.05, patrolSpeed: 0.7, alertRadius: 55,
        moanInterval: [2.5, 4.5], attackInterval: [0.8, 1.8],
        hasHorns: true, hasMask: false, hasSpikes: true, hasBackpack: true,
        hasArmorPlates: true, armAngle: -0.95, clawLength: 0.35,
        walkSpeed: 4, idleBreathe: 0.01,
        behavior: 'tank'
    },
    crawler: {
        health: 58, speed: 6.4, damage: 6.4, knockbackMultiplier: 1.05,
        scale: 1.15, radius: 0.5, bodyColor: 0x405e72, headColor: 0xa8bbc0, detailColor: 0x5dd9ef,
        eyeColor: 0xb7f4ff, glowColor: 0x38b9d6, glowIntensity: 1.15,
        attackCooldown: 0.58, patrolSpeed: 0.82, alertRadius: 76,
        moanInterval: [1.5, 3.0], attackInterval: [0.4, 0.9],
        hasHorns: false, hasMask: false, hasSpikes: true, hasBackpack: false,
        hasArmorPlates: false, armAngle: -1.25, clawLength: 0.38,
        walkSpeed: 9, idleBreathe: 0.025,
        behavior: 'crawl'
    },
    toxic: {
        health: 105, speed: 4.35, damage: 8.1, knockbackMultiplier: 0.55,
        scale: 1.42, radius: 0.57, bodyColor: 0xb5a52f, headColor: 0xc4bd82, detailColor: 0x24352e,
        eyeColor: 0xe8ff3d, glowColor: 0xa6ff19, glowIntensity: 2.7,
        attackCooldown: 0.82, patrolSpeed: 0.68, alertRadius: 88,
        moanInterval: [2.0, 4.0], attackInterval: [0.6, 1.3],
        hasHorns: false, hasMask: true, hasSpikes: false, hasBackpack: true,
        hasArmorPlates: false, armAngle: -0.72, clawLength: 0.28,
        walkSpeed: 5.5, idleBreathe: 0.035,
        behavior: 'toxic'
    }
};

export class Zombie {
    constructor(scene, id, spawnPosition, forcedVariant = null) {
        this.scene = scene;
        this.id = id;
        this.isAlive = true;
        this.position = spawnPosition.clone();
        this.rotation = new THREE.Euler(0, 0, 0);
        this.physics = {
            velocity: new THREE.Vector3(0, 0, 0),
            onGround: false,
            height: 1.9,
            radius: 0.52,
            speed: 4.8
        };

        const variants = ['normal', 'runner', 'crawler', 'toxic', 'heavy'];
        this.variant = VARIANT_CONFIG[forcedVariant] ? forcedVariant : variants[Math.floor(Math.random() * variants.length)];
        const cfg = VARIANT_CONFIG[this.variant];
        this.maxHealth = cfg.health;
        this.health = cfg.health;
        this.physics.speed = cfg.speed;
        this.physics.radius = cfg.radius;
        this.knockbackMultiplier = cfg.knockbackMultiplier;
        this.damage = cfg.damage;
        this.attackCooldown = 0;
        this.patrolTarget = null;
        this.soundTimer = 2 + Math.random() * 3;
        this.alertTimer = 0;
        this.alertTarget = null;
        this.alertPosition = null;
        this.stats = { damage: 0, kills: 0, loot: 0 };
        this.burnTimer = 0;
        this.burnTickTimer = 0;
        this.burnDamagePerSecond = 0;
        this.burnAttacker = null;
        this.hitStaggerTimer = 0;
        this._deathAudioSynth = null;
        this._corpseTimer = 0;
        this._animTime = performance.now() * 0.001;
        this._moanPhase = Math.random() * Math.PI * 2;
        this._roamAngle = Math.random() * Math.PI * 2;
        this._roamTimer = 3 + Math.random() * 5;

        this.mesh = this.createMesh();
        this.mesh.traverse(child => {
            if (!child.material?.emissive) return;
            child.material.userData.baseEmissive = child.material.emissive.getHex();
            child.material.userData.baseEmissiveIntensity = child.material.emissiveIntensity;
        });
        this.mesh.scale.setScalar(cfg.scale);
        this.scene.add(this.mesh);
    }

    createMesh() {
        const group = new THREE.Group();
        const cfg = VARIANT_CONFIG[this.variant];

        const bodyMat = new THREE.MeshStandardMaterial({
            color: cfg.bodyColor, emissive: cfg.bodyColor, emissiveIntensity: 0.08, roughness: 0.85, flatShading: true
        });
        const headMat = new THREE.MeshStandardMaterial({
            color: cfg.headColor, emissive: cfg.headColor, emissiveIntensity: 0.07, roughness: 0.85, flatShading: true
        });
        const grimeMat = new THREE.MeshStandardMaterial({
            color: 0x2e3b2e, roughness: 0.95, flatShading: true
        });
        const armorMat = new THREE.MeshStandardMaterial({
            color: 0x263238, roughness: 0.6, metalness: 0.2, flatShading: true
        });
        const glowMat = new THREE.MeshStandardMaterial({
            color: cfg.glowColor, emissive: cfg.glowColor,
            emissiveIntensity: cfg.glowIntensity, roughness: 0.2, flatShading: true
        });
        const eyeMat = new THREE.MeshStandardMaterial({
            color: cfg.eyeColor, emissive: cfg.eyeColor, emissiveIntensity: 2.4
        });
        const detailMat = new THREE.MeshStandardMaterial({
            color: cfg.detailColor, roughness: 0.72, flatShading: true
        });

        if (this.variant === 'runner') {
            const leanBody = new THREE.BoxGeometry(0.85, 1.0, 0.55);
            const body = new THREE.Mesh(leanBody, bodyMat);
            body.position.set(0.05, 0.85, 0.1);
            body.rotation.x = -0.15;
            group.add(body);

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), headMat);
            head.position.set(0.1, 1.6, 0.25);
            head.rotation.x = -0.2;
            group.add(head);

            const maskMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, flatShading: true });
            const mask = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.25), maskMat);
            mask.position.set(0.12, 1.55, 0.5);
            group.add(mask);

            const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
            const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
            eyeL.position.set(0.05, 1.62, 0.55);
            eyeR.position.set(0.18, 1.62, 0.55);
            group.add(eyeL);
            group.add(eyeR);

            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), grimeMat);
            jaw.position.set(0.1, 1.45, 0.52);
            group.add(jaw);

            const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
            const leftArm = new THREE.Mesh(armGeo, bodyMat);
            const rightArm = new THREE.Mesh(armGeo, bodyMat);
            leftArm.position.set(-0.48, 0.9, 0.2);
            rightArm.position.set(0.58, 0.9, 0.2);
            leftArm.rotation.x = cfg.armAngle;
            rightArm.rotation.x = cfg.armAngle;
            group.add(leftArm);
            group.add(rightArm);

            const clawGeo = new THREE.ConeGeometry(0.07, cfg.clawLength, 5);
            const clawMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.5, metalness: 0.4, flatShading: true });
            const leftClaw = new THREE.Mesh(clawGeo, clawMat);
            const rightClaw = new THREE.Mesh(clawGeo, clawMat);
            leftClaw.position.set(-0.48, 0.6, 0.45);
            rightClaw.position.set(0.58, 0.6, 0.45);
            leftClaw.rotation.x = Math.PI / 2;
            rightClaw.rotation.x = Math.PI / 2;
            group.add(leftClaw);
            group.add(rightClaw);

            const legGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
            const leftLeg = new THREE.Mesh(legGeo, bodyMat);
            const rightLeg = new THREE.Mesh(legGeo, bodyMat);
            leftLeg.position.set(-0.18, 0.25, 0);
            rightLeg.position.set(0.18, 0.25, 0);
            group.add(leftLeg);
            group.add(rightLeg);

            const spine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), glowMat);
            spine.position.set(0, 0.9, -0.25);
            group.add(spine);

        } else if (this.variant === 'heavy') {
            const thickBody = new THREE.BoxGeometry(1.1, 1.3, 0.8);
            const body = new THREE.Mesh(thickBody, bodyMat);
            body.position.y = 1.0;
            group.add(body);

            const armorPlate = new THREE.Mesh(
                new THREE.BoxGeometry(1.15, 0.2, 0.85),
                armorMat
            );
            armorPlate.position.set(0, 1.55, 0);
            group.add(armorPlate);

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), headMat);
            head.position.y = 1.85;
            group.add(head);

            const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), eyeMat);
            const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), eyeMat);
            eyeL.position.set(-0.18, 1.9, 0.4);
            eyeR.position.set(0.18, 1.9, 0.4);
            group.add(eyeL);
            group.add(eyeR);

            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), grimeMat);
            jaw.position.set(0, 1.65, 0.4);
            group.add(jaw);

            const hornMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.2, flatShading: true });
            const hornGeo = new THREE.ConeGeometry(0.1, 0.35, 6);
            const leftHorn = new THREE.Mesh(hornGeo, hornMat);
            const rightHorn = new THREE.Mesh(hornGeo, hornMat);
            leftHorn.position.set(-0.3, 2.25, 0);
            rightHorn.position.set(0.3, 2.25, 0);
            leftHorn.rotation.z = Math.PI / 2;
            rightHorn.rotation.z = -Math.PI / 2;
            group.add(leftHorn);
            group.add(rightHorn);

            const armGeo = new THREE.BoxGeometry(0.25, 0.8, 0.25);
            const leftArm = new THREE.Mesh(armGeo, bodyMat);
            const rightArm = new THREE.Mesh(armGeo, bodyMat);
            leftArm.position.set(-0.65, 1.0, 0.15);
            rightArm.position.set(0.65, 1.0, 0.15);
            leftArm.rotation.x = cfg.armAngle;
            rightArm.rotation.x = cfg.armAngle;
            group.add(leftArm);
            group.add(rightArm);

            const clawGeo = new THREE.ConeGeometry(0.09, cfg.clawLength, 5);
            const clawMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.5, metalness: 0.4, flatShading: true });
            const leftClaw = new THREE.Mesh(clawGeo, clawMat);
            const rightClaw = new THREE.Mesh(clawGeo, clawMat);
            leftClaw.position.set(-0.65, 0.65, 0.4);
            rightClaw.position.set(0.65, 0.65, 0.4);
            leftClaw.rotation.x = Math.PI / 2;
            rightClaw.rotation.x = Math.PI / 2;
            group.add(leftClaw);
            group.add(rightClaw);

            const legGeo = new THREE.BoxGeometry(0.25, 0.75, 0.25);
            const leftLeg = new THREE.Mesh(legGeo, bodyMat);
            const rightLeg = new THREE.Mesh(legGeo, bodyMat);
            leftLeg.position.set(-0.25, 0.3, 0);
            rightLeg.position.set(0.25, 0.3, 0);
            group.add(leftLeg);
            group.add(rightLeg);

            const backpack = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.75, 0.3),
                armorMat
            );
            backpack.position.set(0, 1.1, -0.45);
            group.add(backpack);

            const spine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), glowMat);
            spine.position.set(0, 1.1, -0.35);
            group.add(spine);

            const spikesGeo = new THREE.ConeGeometry(0.07, 0.22, 5);
            const spikesMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.5, flatShading: true });
            for (let i = 0; i < 6; i++) {
                const spike = new THREE.Mesh(spikesGeo, spikesMat);
                spike.position.set(-0.35 + i * 0.15, 1.4, -0.5);
                spike.rotation.x = -Math.PI / 2;
                group.add(spike);
            }

        } else if (this.variant === 'crawler') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.55, 1.15), bodyMat);
            body.position.set(0, 0.58, 0.12);
            body.rotation.x = -0.08;
            group.add(body);

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.66), headMat);
            head.position.set(0, 0.68, 0.82);
            head.rotation.x = -0.28;
            group.add(head);

            for (const x of [-0.16, 0.16]) {
                const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.04), eyeMat);
                eye.position.set(x, 0.76, 1.16);
                group.add(eye);
            }

            const limbGeo = new THREE.BoxGeometry(0.17, 0.62, 0.17);
            const limbs = [
                [-0.47, 0.36, 0.48, -1.25],
                [0.47, 0.36, 0.48, -1.25],
                [-0.42, 0.32, -0.32, -0.9],
                [0.42, 0.32, -0.32, -0.9]
            ];
            for (const [x, y, z, rot] of limbs) {
                const limb = new THREE.Mesh(limbGeo, bodyMat);
                limb.position.set(x, y, z);
                limb.rotation.x = rot;
                group.add(limb);
            }

            const ridgeGeo = new THREE.ConeGeometry(0.08, 0.3, 5);
            for (let i = 0; i < 5; i++) {
                const ridge = new THREE.Mesh(ridgeGeo, glowMat);
                ridge.position.set(0, 0.9, -0.3 + i * 0.22);
                ridge.rotation.x = -Math.PI / 2;
                group.add(ridge);
            }
        } else if (this.variant === 'toxic') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.2, 0.68), bodyMat);
            body.position.set(0, 0.95, 0);
            body.rotation.z = 0.08;
            group.add(body);

            const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.46, 0), headMat);
            head.position.set(0.12, 1.82, 0.08);
            group.add(head);

            for (const x of [-0.13, 0.17]) {
                const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), eyeMat);
                eye.position.set(x, 1.87, 0.48);
                group.add(eye);
            }

            const armGeo = new THREE.BoxGeometry(0.22, 0.76, 0.22);
            const leftArm = new THREE.Mesh(armGeo, bodyMat);
            const rightArm = new THREE.Mesh(armGeo, bodyMat);
            leftArm.position.set(-0.58, 1.02, 0.12);
            rightArm.position.set(0.6, 0.94, 0.18);
            leftArm.rotation.x = -0.68;
            rightArm.rotation.x = -0.92;
            group.add(leftArm, rightArm);

            const legGeo = new THREE.BoxGeometry(0.23, 0.72, 0.23);
            const leftLeg = new THREE.Mesh(legGeo, grimeMat);
            const rightLeg = new THREE.Mesh(legGeo, grimeMat);
            leftLeg.position.set(-0.23, 0.28, 0);
            rightLeg.position.set(0.23, 0.28, 0);
            group.add(leftLeg, rightLeg);

            for (const [x, y, z, s] of [[-0.42, 1.28, -0.34, 0.3], [0.38, 1.02, -0.4, 0.38], [0.06, 1.5, -0.38, 0.24]]) {
                const sac = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), glowMat);
                sac.position.set(x, y, z);
                group.add(sac);
            }
        } else {
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.6), bodyMat);
            body.position.y = 0.9;
            group.add(body);

            const rib = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.08), grimeMat);
            rib.position.set(0, 0.95, 0.34);
            group.add(rib);

            const shoulderPlate = new THREE.Mesh(
                new THREE.BoxGeometry(1.05, 0.18, 0.6),
                armorMat
            );
            shoulderPlate.position.set(0, 1.5, 0);
            group.add(shoulderPlate);

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), headMat);
            head.position.y = 1.7;
            group.add(head);

            const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
            const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
            eyeL.position.set(-0.14, 1.75, 0.35);
            eyeR.position.set(0.14, 1.75, 0.35);
            group.add(eyeL);
            group.add(eyeR);

            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), grimeMat);
            jaw.position.set(0, 1.56, 0.36);
            group.add(jaw);

            const hornMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.2, flatShading: true });
            const hornGeo = new THREE.ConeGeometry(0.09, 0.28, 6);
            const leftHorn = new THREE.Mesh(hornGeo, hornMat);
            const rightHorn = new THREE.Mesh(hornGeo, hornMat);
            leftHorn.position.set(-0.24, 2.05, 0);
            rightHorn.position.set(0.24, 2.05, 0);
            leftHorn.rotation.z = Math.PI / 2;
            rightHorn.rotation.z = -Math.PI / 2;
            group.add(leftHorn);
            group.add(rightHorn);

            const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
            const leftArm = new THREE.Mesh(armGeo, bodyMat);
            const rightArm = new THREE.Mesh(armGeo, bodyMat);
            leftArm.position.set(-0.52, 1.0, 0.12);
            rightArm.position.set(0.52, 1.0, 0.12);
            leftArm.rotation.x = cfg.armAngle;
            rightArm.rotation.x = cfg.armAngle;
            group.add(leftArm);
            group.add(rightArm);

            const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
            const leftLeg = new THREE.Mesh(legGeo, bodyMat);
            const rightLeg = new THREE.Mesh(legGeo, bodyMat);
            leftLeg.position.set(-0.2, 0.25, 0);
            rightLeg.position.set(0.2, 0.25, 0);
            group.add(leftLeg);
            group.add(rightLeg);

            const clawGeo = new THREE.ConeGeometry(0.08, cfg.clawLength, 6);
            const clawMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.5, metalness: 0.4, flatShading: true });
            const leftClaw = new THREE.Mesh(clawGeo, clawMat);
            const rightClaw = new THREE.Mesh(clawGeo, clawMat);
            leftClaw.position.set(-0.52, 0.7, 0.34);
            rightClaw.position.set(0.52, 0.7, 0.34);
            leftClaw.rotation.x = Math.PI / 2;
            rightClaw.rotation.x = Math.PI / 2;
            group.add(leftClaw);
            group.add(rightClaw);

            const spine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), glowMat);
            spine.position.set(0, 1.1, -0.3);
            group.add(spine);
        }

        if (this.variant !== 'crawler') {
            const chestWidth = this.variant === 'heavy' ? 0.82 : 0.58;
            const chestY = this.variant === 'heavy' ? 1.02 : 0.92;
            const chestZ = this.variant === 'heavy' ? 0.43 : 0.34;
            const chest = new THREE.Mesh(new THREE.BoxGeometry(chestWidth, 0.48, 0.08), detailMat);
            chest.position.set(0, chestY, chestZ);
            group.add(chest);
            const bootMat = new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.92, flatShading: true });
            for (const x of [-0.22, 0.22]) {
                const boot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.38), bootMat);
                boot.position.set(x, 0.08, 0.08);
                group.add(boot);
            }
        } else {
            const ribs = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.78), detailMat);
            ribs.position.set(0, 0.65, 0.18);
            group.add(ribs);
        }
        if (this.variant === 'toxic') {
            const respirator = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.22), detailMat);
            respirator.position.set(0.12, 1.72, 0.42);
            group.add(respirator);
            for (const x of [-0.22, 0.22]) {
                const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8), glowMat);
                filter.rotation.z = Math.PI / 2;
                filter.position.set(x + 0.12, 1.68, 0.43);
                group.add(filter);
            }
        }
        if (this.variant === 'normal') {
            for (const x of [-0.23, 0, 0.23]) {
                const rib = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), detailMat);
                rib.position.set(x, 1.02, 0.38);
                group.add(rib);
            }
        }
        group.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
            child.userData.zombieVariant = this.variant;
        });
        group.userData.isEntity = true;
        group.userData.isZombie = true;
        group.userData.limbs = group.children.filter(c =>
            c.geometry?.type === 'BoxGeometry' &&
            (c.position.x < -0.3 || c.position.x > 0.3 || c.position.y < 0.5)
        );
        if (group.children.length >= 4) {
            const arms = group.children.filter(c => c.position.y > 0.5 && c.position.y < 1.3 && Math.abs(c.position.x) > 0.3);
            const legs = group.children.filter(c => c.position.y < 0.5 && Math.abs(c.position.x) < 0.3);
            group.userData.limbs = {
                leftArm: arms[0] || null,
                rightArm: arms[1] || null,
                leftLeg: legs[0] || null,
                rightLeg: legs[1] || null
            };
        }
        if (this.variant === 'crawler') {
            group.userData.limbs = {
                leftArm: group.children[4],
                rightArm: group.children[5],
                leftLeg: group.children[6],
                rightLeg: group.children[7]
            };
        }
        return group;
    }

    update(delta, entityManager, audioSynth) {
        if (!this.isAlive) {
            this.mesh.position.copy(this.position);
            this._corpseTimer -= delta;
            if (this._corpseTimer <= 0) {
                this.dispose();
            }
            return;
        }

        if (![this.position.x, this.position.y, this.position.z].every(Number.isFinite)) {
            this.position.set(0, this.physics.height + 0.2, 0);
        }
        if (![this.physics.velocity.x, this.physics.velocity.y, this.physics.velocity.z].every(Number.isFinite)) {
            this.physics.velocity.set(0, 0, 0);
        }

        this.attackCooldown = Math.max(0, this.attackCooldown - delta);
        this.soundTimer -= delta;
        this.alertTimer = Math.max(0, this.alertTimer - delta);
        this.updateBurning(delta);
        if (audioSynth) {
            this._deathAudioSynth = audioSynth;
        }
        this._animTime += delta;

        const sharedAlert = this.scene?.userData?.zombieAlert;
        const aggression = clamp(this.scene?.userData?.zombieAggression || 1, 1, 2.6);
        if (sharedAlert && (performance.now() * 0.001 - sharedAlert.time) < 3.8) {
            const alertDist = this.position.distanceTo(sharedAlert.position);
            if (alertDist < 34 * aggression) {
                this.alertTarget = sharedAlert.target || this.alertTarget;
                this.alertPosition = sharedAlert.position.clone();
                this.alertTimer = Math.max(this.alertTimer, 2.6);
            }
        }

        let target = this.findNearestTarget(entityManager, 68 * aggression);
        if (!target && this.alertTarget?.isAlive && this.alertTimer > 0 && this.isFinitePosition(this.alertTarget.position)) {
            target = this.alertTarget;
        }

        const cfg = VARIANT_CONFIG[this.variant];

        if (target) {
            const dist = this.position.distanceTo(target.position);
            this.broadcastAlert(target);
            this.alertTarget = target;
            this.alertPosition = target.position.clone();
            this.alertTimer = 2.8;

            if (dist < 2.6 && this.attackCooldown <= 0) {
                const targetType = target?.constructor?.name;
                const damage = targetType === 'Bot' ? this.damage * 0.42 : this.damage;
                target.takeDamage(damage, false, this, 3.2);
                this.attackCooldown = cfg.attackCooldown;
                if (audioSynth) {
                    audioSynth.playZombieAttack?.(this.position, { variant: this.variant, emitterKey: this.id });
                }
            } else {
                const rush = (dist < 8 ? 1.32 : dist < 18 ? 1.18 : 1.04) * Math.min(1.55, 0.88 + aggression * 0.17);
                if (this.variant === 'runner') {
                    const zigzag = Math.sin(this._animTime * 3) * 0.3;
                    const dir = new THREE.Vector3().subVectors(target.position, this.position).normalize();
                    dir.x += zigzag;
                    dir.normalize();
                    this.physics.velocity.x = dir.x * this.physics.speed * rush;
                    this.physics.velocity.z = dir.z * this.physics.speed * rush;
                    this.rotation.y = Math.atan2(dir.x, dir.z);
                } else {
                    this.moveTowards(target.position, this.physics.speed * rush);
                }
            }

            if (audioSynth && this.soundTimer <= 0) {
                const moanInterval = cfg.moanInterval;
                audioSynth.playZombieMoan?.(this.position, { variant: this.variant, emitterKey: this.id });
                this.soundTimer = moanInterval[0] + Math.random() * (moanInterval[1] - moanInterval[0]);
            }
        } else {
            if (this.alertPosition && this.alertTimer > 0) {
                this.moveTowards(this.alertPosition, this.physics.speed * 1.08);
                if (this.position.distanceTo(this.alertPosition) < 3.5) {
                    this.alertPosition = null;
                }
            } else {
                this._roamTimer -= delta;
                if (this._roamTimer <= 0) {
                    this._roamAngle = Math.random() * Math.PI * 2;
                    this._roamTimer = 3 + Math.random() * 5;
                }
                const roamSpeed = this.physics.speed * cfg.patrolSpeed;
                this.physics.velocity.x = Math.cos(this._roamAngle) * roamSpeed;
                this.physics.velocity.z = Math.sin(this._roamAngle) * roamSpeed;
                this.rotation.y = this._roamAngle;

                if (audioSynth && this.soundTimer <= 0) {
                    const moanInterval = cfg.moanInterval;
                    audioSynth.playZombieMoan?.(this.position, { variant: this.variant, emitterKey: this.id });
                    this.soundTimer = moanInterval[0] + Math.random() * (moanInterval[1] - moanInterval[0]);
                }
            }
        }

        this.mesh.position.copy(this.position);
        this.mesh.position.y = this.position.y - this.physics.height + 0.03;
        this.mesh.rotation.y = this.rotation.y;
        this.animateLimbs(delta);
    }

    findNearestTarget(entityManager, maxDistance) {
        const nearby = entityManager?.getNearbyEntities
            ? entityManager.getNearbyEntities(this.position, maxDistance)
            : entityManager.getEntities();
        const maxDistSq = maxDistance * maxDistance;
        let nearest = null;
        let bestScore = Infinity;
        for (const entity of nearby) {
            if (!entity.isAlive || entity === this) continue;
            if (entity.constructor?.name === 'Zombie') continue;
            if (!this.isFinitePosition(entity.position)) continue;
            const distSq = this.position.distanceToSquared(entity.position);
            if (distSq > maxDistSq) continue;
            const dist = Math.sqrt(distSq);
            let score = dist;
            if (entity.constructor?.name === 'Player') score -= 7;
            if (entity.constructor?.name === 'Bot') score += 2.5;
            if (score < bestScore) {
                bestScore = score;
                nearest = entity;
            }
        }
        return nearest;
    }

    broadcastAlert(target) {
        if (!target || !this.scene?.userData || !this.isFinitePosition(target.position)) return;
        this.scene.userData.zombieAlert = {
            position: target.position.clone(),
            target,
            time: performance.now() * 0.001
        };
    }

    moveTowards(target, speed) {
        if (!this.isFinitePosition(target) || !Number.isFinite(speed)) {
            this.physics.velocity.x = 0;
            this.physics.velocity.z = 0;
            return;
        }
        const direction = new THREE.Vector3()
            .subVectors(target, this.position)
            .normalize();
        this.physics.velocity.x = direction.x * speed;
        this.physics.velocity.z = direction.z * speed;
        this.rotation.y = Math.atan2(direction.x, direction.z);
    }

    isFinitePosition(position) {
        return !!position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
    }

    animateLimbs(delta) {
        const limbs = this.mesh?.userData?.limbs;
        if (!limbs || !limbs.leftArm) return;
        const speed = Math.sqrt(
            this.physics.velocity.x * this.physics.velocity.x +
            this.physics.velocity.z * this.physics.velocity.z
        );
        const speedNorm = Math.min(1, speed / this.physics.speed);
        const t = this._animTime;
        const cfg = VARIANT_CONFIG[this.variant];

        if (this.variant === 'crawler') {
            const swing = Math.sin(t * 12) * 0.5 * speedNorm;
            limbs.leftArm.rotation.z = -0.45 + swing;
            limbs.rightArm.rotation.z = 0.45 - swing;
            limbs.leftLeg.rotation.z = -0.35 - swing;
            limbs.rightLeg.rotation.z = 0.35 + swing;
            this.mesh.rotation.x = 0.04 + Math.sin(t * 8) * 0.025 * speedNorm;
        } else if (this.variant === 'toxic') {
            const swing = Math.sin(t * 5.5) * 0.5 * speedNorm;
            limbs.leftLeg.rotation.x = -swing;
            limbs.rightLeg.rotation.x = swing;
            limbs.leftArm.rotation.x = -0.55 + Math.sin(t * 4.2) * 0.28;
            limbs.rightArm.rotation.x = -0.75 + Math.sin(t * 4.2 + 1.1) * 0.28;
            this.mesh.rotation.z = Math.sin(t * 2.1) * 0.045;
        } else if (this.variant === 'runner') {
            const swing = Math.sin(t * 10) * 0.7 * speedNorm;
            limbs.leftLeg.rotation.x = -swing;
            limbs.rightLeg.rotation.x = swing;
            limbs.leftArm.rotation.x = Math.sin(t * 8 + 0.8) * 0.5 * speedNorm;
            limbs.rightArm.rotation.x = Math.sin(t * 8) * 0.5 * speedNorm;
            limbs.leftArm.rotation.z = -0.2;
            limbs.rightArm.rotation.z = 0.2;
        } else if (this.variant === 'heavy') {
            const swing = Math.sin(t * 5) * 0.4 * speedNorm;
            limbs.leftLeg.rotation.x = -swing;
            limbs.rightLeg.rotation.x = swing;
            limbs.leftArm.rotation.x = Math.sin(t * 4 + 0.3) * 0.3 * speedNorm;
            limbs.rightArm.rotation.x = Math.sin(t * 4) * 0.3 * speedNorm;
            limbs.leftArm.rotation.z = -0.1;
            limbs.rightArm.rotation.z = 0.1;
        } else {
            const swing = Math.sin(t * 7) * 0.55 * speedNorm;
            limbs.leftLeg.rotation.x = -swing;
            limbs.rightLeg.rotation.x = swing;
            limbs.leftArm.rotation.x = Math.sin(t * 6 + 0.5) * 0.4 * speedNorm;
            limbs.rightArm.rotation.x = Math.sin(t * 6) * 0.4 * speedNorm;
            limbs.leftArm.rotation.z = -0.15;
            limbs.rightArm.rotation.z = 0.15;
        }

        if (speedNorm < 0.05) {
            limbs.leftLeg.rotation.x *= 0.85;
            limbs.rightLeg.rotation.x *= 0.85;
            limbs.leftArm.rotation.x *= 0.85;
            limbs.rightArm.rotation.x *= 0.85;
        }

        if (this.hitStaggerTimer > 0) {
            this.hitStaggerTimer -= delta;
            const stagger = Math.sin(this.hitStaggerTimer * 25) * 0.15 * this.hitStaggerTimer;
            limbs.leftArm.rotation.x += stagger;
            limbs.rightArm.rotation.x -= stagger;
        }
    }

    applyHitReaction() {
        this.hitStaggerTimer = 0.25;
    }

    takeDamage(damage, isHeadshot = false, attacker = null, knockbackStrength = 0, source = null) {
        const finalDamage = isHeadshot ? damage * 2 : damage;
        if (attacker?.stats) {
            attacker.stats.damage += finalDamage;
        }
        this.health -= finalDamage;
        if (source === 'flame' && this.isAlive) {
            this.applyBurn(2.8, 5.5, attacker);
        }
        if (this.isAlive && knockbackStrength > 0) {
            this.applyHitReaction();
        }
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
            this.physics.velocity.set(0, 0, 0);
            this.mesh.position.copy(this.position);
            this.mesh.position.y = this.position.y - (this.physics.height - 0.2) - 0.8;
            this.mesh.rotation.set(-Math.PI / 2, this.rotation.y, 0);
            this._corpseTimer = 10;
            if (attacker?.stats) {
                attacker.stats.kills += 1;
            }
            this.clearBurning();
            if (this._deathAudioSynth) {
                this._deathAudioSynth.playDeath(this.position);
                this._deathAudioSynth = null;
            }
        }

        if (attacker && this.isAlive) {
            const strengthBase = knockbackStrength > 0 ? knockbackStrength : 2.5;
            const strength = strengthBase * (this.knockbackMultiplier ?? 1);
            const dir = new THREE.Vector3().subVectors(this.position, attacker.position).normalize();
            this.physics.velocity.x += dir.x * strength;
            this.physics.velocity.z += dir.z * strength;
            this.physics.velocity.y += 1.5 * (this.knockbackMultiplier ?? 1);
            this.alertTarget = attacker;
            this.alertPosition = attacker.position.clone();
            this.alertTimer = Math.max(this.alertTimer, 3.2);
            this.broadcastAlert(attacker);
        }
        return !this.isAlive;
    }

    applyBurn(duration = 2.6, damagePerSecond = 5, attacker = null) {
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
        const pulse = 0.26 + Math.sin(performance.now() * 0.03 + this.id) * 0.12;
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
            if (intensity > 0) {
                child.material.emissive.setHex(0xff6d00);
                child.material.emissiveIntensity = intensity;
            } else {
                child.material.emissive.setHex(child.material.userData.baseEmissive ?? 0x000000);
                child.material.emissiveIntensity = child.material.userData.baseEmissiveIntensity ?? 0;
            }
        });
    }

    dispose() {
        if (this.mesh?.parent) this.mesh.parent.remove(this.mesh);
        this.mesh.visible = false;
    }
}
