import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

let zombieLodGeometry = null;
const ACID_GEOMETRY = new THREE.SphereGeometry(0.22, 8, 6);
const ACID_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xb8ff24 });
const getZombieLodGeometry = () => {
    if (zombieLodGeometry) return zombieLodGeometry;
    const parts = [
        [0.9, 1.1, 0.62, 0, 0.9, 0],
        [0.68, 0.68, 0.68, 0, 1.72, 0],
        [0.22, 0.8, 0.22, -0.54, 0.98, 0.08],
        [0.22, 0.8, 0.22, 0.54, 0.98, 0.08],
        [0.24, 0.72, 0.24, -0.21, 0.3, 0],
        [0.24, 0.72, 0.24, 0.21, 0.3, 0]
    ].map(([w, h, d, x, y, z]) => {
        const geometry = new THREE.BoxGeometry(w, h, d);
        geometry.translate(x, y, z);
        return geometry;
    });
    zombieLodGeometry = BufferGeometryUtils.mergeGeometries(parts);
    for (const part of parts) part.dispose();
    return zombieLodGeometry;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const ZOMBIE_TEXTURES = {};
const _createZombieTexture = (variant, baseColorHex) => {
    const key = `zombie_${variant}`;
    if (ZOMBIE_TEXTURES[key]) return ZOMBIE_TEXTURES[key];
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const baseColor = new THREE.Color(baseColorHex);
    const r = Math.floor(baseColor.r * 255);
    const g = Math.floor(baseColor.g * 255);
    const b = Math.floor(baseColor.b * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, size, size);
    const addNoise = (intensity = 30) => {
        for (let i = 0; i < 3000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const v = (Math.random() - 0.5) * intensity;
            ctx.fillStyle = `rgba(${clamp(r + v, 0, 255)},${clamp(g + v, 0, 255)},${clamp(b + v, 0, 255)},0.6)`;
            ctx.fillRect(x, y, 1 + Math.random() * 2, 1);
        }
    };
    const addStain = (x, y, radius, darkness = 40) => {
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, `rgba(${clamp(r - darkness, 0, 255)},${clamp(g - darkness, 0, 255)},${clamp(b - darkness, 0, 255)},0.5)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
    };
    const addScratch = () => {
        ctx.strokeStyle = `rgba(${clamp(r - 50, 0, 255)},${clamp(g - 50, 0, 255)},${clamp(b - 50, 0, 255)},0.7)`;
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        ctx.moveTo(Math.random() * size, Math.random() * size);
        ctx.lineTo(Math.random() * size, Math.random() * size);
        ctx.stroke();
    };
    addNoise();
    for (let i = 0; i < 8; i++) addStain(Math.random() * size, Math.random() * size, 15 + Math.random() * 30);
    for (let i = 0; i < 6; i++) addScratch();
    if (variant === 'runner') {
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = `rgba(80,40,30,0.4)`;
            ctx.fillRect(Math.random() * size, Math.random() * size, 8 + Math.random() * 15, 2 + Math.random() * 3);
        }
    } else if (variant === 'heavy') {
        for (let i = 0; i < 12; i++) {
            ctx.fillStyle = `rgba(100,80,60,0.35)`;
            ctx.fillRect(Math.random() * size, Math.random() * size, 3 + Math.random() * 5, 3 + Math.random() * 5);
        }
    } else if (variant === 'crawler') {
        for (let i = 0; i < 15; i++) {
            ctx.fillStyle = `rgba(60,120,140,0.3)`;
            ctx.beginPath();
            ctx.arc(Math.random() * size, Math.random() * size, 3 + Math.random() * 8, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (variant === 'toxic') {
        for (let i = 0; i < 10; i++) {
            ctx.fillStyle = `rgba(100,200,50,0.25)`;
            ctx.beginPath();
            ctx.arc(Math.random() * size, Math.random() * size, 5 + Math.random() * 12, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    ZOMBIE_TEXTURES[key] = texture;
    return texture;
};

const VARIANT_CONFIG = {
    runner: {
        health: 42, speed: 9.0, damage: 6.4, knockbackMultiplier: 1.2,
        scale: 1.2, radius: 0.48, bodyColor: 0xc34b2f, headColor: 0xc8c2a7, detailColor: 0xf0a13b,
        eyeColor: 0xff4411, glowColor: 0x44ff22, glowIntensity: 1.8,
        attackCooldown: 0.46, patrolSpeed: 0.82, alertRadius: 94,
        moanInterval: [1.2, 2.4], attackInterval: [0.3, 0.8],
        hasHorns: false, hasMask: true, hasSpikes: false, hasBackpack: false,
        hasArmorPlates: false, armAngle: -0.8, clawLength: 0.25,
        walkSpeed: 8, idleBreathe: 0.02,
        behavior: 'rush'
    },
    normal: {
        health: 72, speed: 6.15, damage: 7.8, knockbackMultiplier: 0.8,
        scale: 1.35, radius: 0.54, bodyColor: 0x6f3434, headColor: 0xb9b49b, detailColor: 0xd7c7a2,
        eyeColor: 0xff6600, glowColor: 0x8bff4f, glowIntensity: 1.35,
        attackCooldown: 0.64, patrolSpeed: 0.78, alertRadius: 82,
        moanInterval: [1.8, 3.6], attackInterval: [0.5, 1.2],
        hasHorns: true, hasMask: false, hasSpikes: false, hasBackpack: false,
        hasArmorPlates: true, armAngle: -0.85, clawLength: 0.3,
        walkSpeed: 6, idleBreathe: 0.015,
        behavior: 'patrol'
    },
    heavy: {
        health: 180, speed: 3.85, damage: 10.2, knockbackMultiplier: 0,
        scale: 1.56, radius: 0.6, bodyColor: 0x3f4a50, headColor: 0x9c7a70, detailColor: 0xb23b2f,
        eyeColor: 0xff2200, glowColor: 0x3dff1f, glowIntensity: 2.2,
        attackCooldown: 0.94, patrolSpeed: 0.76, alertRadius: 70,
        moanInterval: [2.5, 4.5], attackInterval: [0.8, 1.8],
        hasHorns: true, hasMask: false, hasSpikes: true, hasBackpack: true,
        hasArmorPlates: true, armAngle: -0.95, clawLength: 0.35,
        walkSpeed: 4, idleBreathe: 0.01,
        behavior: 'tank'
    },
    crawler: {
        health: 58, speed: 7.7, damage: 7.0, knockbackMultiplier: 1.05,
        scale: 1.15, radius: 0.5, bodyColor: 0x405e72, headColor: 0xa8bbc0, detailColor: 0x5dd9ef,
        eyeColor: 0xb7f4ff, glowColor: 0x38b9d6, glowIntensity: 1.15,
        attackCooldown: 0.5, patrolSpeed: 0.92, alertRadius: 90,
        moanInterval: [1.5, 3.0], attackInterval: [0.4, 0.9],
        hasHorns: false, hasMask: false, hasSpikes: true, hasBackpack: false,
        hasArmorPlates: false, armAngle: -1.25, clawLength: 0.38,
        walkSpeed: 9, idleBreathe: 0.025,
        behavior: 'crawl'
    },
    toxic: {
        health: 105, speed: 5.25, damage: 8.8, knockbackMultiplier: 0.55,
        scale: 1.42, radius: 0.57, bodyColor: 0xb5a52f, headColor: 0xc4bd82, detailColor: 0x24352e,
        eyeColor: 0xe8ff3d, glowColor: 0xa6ff19, glowIntensity: 2.7,
        attackCooldown: 0.72, patrolSpeed: 0.78, alertRadius: 102,
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
        this._alertPositionVec = new THREE.Vector3();
        this.stats = { damage: 0, kills: 0, loot: 0 };
        this.burnTimer = 0;
        this.burnTickTimer = 0;
        this.burnDamagePerSecond = 0;
        this.burnAttacker = null;
        this.hitStaggerTimer = 0;
        this._deathAudioSynth = null;
        this._lodCameraForward = new THREE.Vector3();
        this._lodToEntity = new THREE.Vector3();
        this._dirVec = new THREE.Vector3();
        this._corpseTimer = 0;
        this._animTime = performance.now() * 0.001;
        this._moanPhase = Math.random() * Math.PI * 2;
        this._roamAngle = Math.random() * Math.PI * 2;
        this._roamTimer = 3 + Math.random() * 5;
        this.abilityCooldown = 1.2 + Math.random() * 2.4;
        this.abilityAnimationTimer = 0;
        this.acidProjectile = null;
        this._abilityDirection = new THREE.Vector3();
        this._projectileStart = new THREE.Vector3();
        this._projectileToTarget = new THREE.Vector3();

        this.mesh = this.createMesh();
        this._lodDetailed = true;
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

        const bodyTex = _createZombieTexture(this.variant, cfg.bodyColor);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: cfg.bodyColor, map: bodyTex, emissive: cfg.bodyColor, emissiveIntensity: 0.25, roughness: 0.75, flatShading: true
        });
        const headTex = _createZombieTexture(this.variant, cfg.headColor);
        const headMat = new THREE.MeshStandardMaterial({
            color: cfg.headColor, map: headTex, emissive: cfg.headColor, emissiveIntensity: 0.2, roughness: 0.75, flatShading: true
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
            child.frustumCulled = true;
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
        group.userData.detailChildren = [...group.children];
        const lodProxy = new THREE.Mesh(getZombieLodGeometry(), bodyMat);
        lodProxy.visible = false;
        lodProxy.userData.isLodProxy = true;
        group.add(lodProxy);
        group.userData.lodProxy = lodProxy;
        return group;
    }

    update(delta, entityManager, audioSynth) {
        this.updateAcidProjectile(delta, audioSynth);
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
        this.abilityCooldown = Math.max(0, this.abilityCooldown - delta);
        this.abilityAnimationTimer = Math.max(0, this.abilityAnimationTimer - delta);
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
                this.alertPosition = this._alertPositionVec.copy(sharedAlert.position);
                this.alertTimer = Math.max(this.alertTimer, 2.6);
            }
        }

        const cfg = VARIANT_CONFIG[this.variant];
        let target = this.findNearestTarget(entityManager, cfg.alertRadius * aggression);
        if (!target && this.alertTarget?.isAlive && this.alertTimer > 0 && this.isFinitePosition(this.alertTarget.position)) {
            target = this.alertTarget;
        }

        if (target) {
            const dist = this.position.distanceTo(target.position);
            this.broadcastAlert(target);
            this.alertTarget = target;
            this.alertPosition = this._alertPositionVec.copy(target.position);
            this.alertTimer = 2.8;

            let usedAbility = false;
            if (this.variant === 'toxic' && dist >= 5 && dist <= 18 && this.abilityCooldown <= 0) {
                this.spitAcid(target, audioSynth);
                usedAbility = true;
            } else if (this.variant === 'crawler' && dist >= 4 && dist <= 12 && this.physics.onGround && this.abilityCooldown <= 0) {
                this.leapAt(target, audioSynth);
                usedAbility = true;
            } else if (this.variant === 'runner' && dist >= 4 && dist <= 14 && this.abilityCooldown <= 0) {
                this.dashAt(target, audioSynth);
                usedAbility = true;
            }

            if (!usedAbility && dist < 2.6 && this.attackCooldown <= 0) {
                const targetType = target?.constructor?.name;
                const damage = targetType === 'Bot' ? this.damage * 0.42 : this.damage;
                const knockback = this.variant === 'heavy' ? 11 : 3.2;
                target.takeDamage(damage, false, this, knockback, this.variant === 'heavy' ? 'heavySmash' : 'zombie');
                if (this.variant === 'normal') target.applySlow?.(0.68, 1.5);
                this.attackCooldown = cfg.attackCooldown;
                this.abilityAnimationTimer = this.variant === 'heavy' ? 0.55 : 0.28;
                if (audioSynth) {
                    audioSynth.playZombieAttack?.(this.position, { variant: this.variant, emitterKey: this.id });
                    if (this.variant === 'heavy') {
                        audioSynth.playZombieAbility?.(this.position, { variant: 'heavy', emitterKey: this.id });
                    }
                }
            } else if (!usedAbility) {
                const rush = (dist < 8 ? 1.32 : dist < 18 ? 1.18 : 1.04) * Math.min(1.55, 0.88 + aggression * 0.17);
                if (this.variant === 'runner') {
                    const zigzag = Math.sin(this._animTime * 3) * 0.3;
                    this._dirVec.subVectors(target.position, this.position).normalize();
                    this._dirVec.x += zigzag;
                    this._dirVec.normalize();
                    this.physics.velocity.x = this._dirVec.x * this.physics.speed * rush;
                    this.physics.velocity.z = this._dirVec.z * this.physics.speed * rush;
                    this.rotation.y = Math.atan2(this._dirVec.x, this._dirVec.z);
                } else if (this.variant === 'crawler') {
                    this._dirVec.subVectors(target.position, this.position).normalize();
                    const flank = Math.sin(this._animTime * 4.2 + this.id) * 0.48;
                    const x = this._dirVec.x - this._dirVec.z * flank;
                    const z = this._dirVec.z + this._dirVec.x * flank;
                    const length = Math.hypot(x, z) || 1;
                    this.physics.velocity.x = x / length * this.physics.speed * rush;
                    this.physics.velocity.z = z / length * this.physics.speed * rush;
                    this.rotation.y = Math.atan2(x, z);
                } else if (this.variant === 'toxic') {
                    this._dirVec.subVectors(target.position, this.position).normalize();
                    const sway = Math.sin(this._animTime * 2.1 + this.id * 0.7) * 0.22;
                    this.physics.velocity.x = (this._dirVec.x - this._dirVec.z * sway) * this.physics.speed * rush;
                    this.physics.velocity.z = (this._dirVec.z + this._dirVec.x * sway) * this.physics.speed * rush;
                    this.rotation.y = Math.atan2(this.physics.velocity.x, this.physics.velocity.z);
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
        this.mesh.position.y = this.position.y - this.physics.height;
        this.mesh.rotation.y = this.rotation.y;
        if (this.updateRenderLod(delta)) this.animateLimbs(delta);
    }

    dashAt(target, audioSynth) {
        this._abilityDirection.subVectors(target.position, this.position).setY(0).normalize();
        this.physics.velocity.x = this._abilityDirection.x * this.physics.speed * 2.15;
        this.physics.velocity.z = this._abilityDirection.z * this.physics.speed * 2.15;
        this.rotation.y = Math.atan2(this._abilityDirection.x, this._abilityDirection.z);
        this.abilityCooldown = 3.2 + Math.random();
        this.abilityAnimationTimer = 0.42;
        audioSynth?.playZombieAbility?.(this.position, { variant: 'runner', emitterKey: this.id });
    }

    leapAt(target, audioSynth) {
        this._abilityDirection.subVectors(target.position, this.position).setY(0).normalize();
        this.physics.velocity.x = this._abilityDirection.x * this.physics.speed * 1.45;
        this.physics.velocity.z = this._abilityDirection.z * this.physics.speed * 1.45;
        this.physics.velocity.y = 7.4;
        this.physics.onGround = false;
        this.rotation.y = Math.atan2(this._abilityDirection.x, this._abilityDirection.z);
        this.abilityCooldown = 4.2 + Math.random() * 1.4;
        this.abilityAnimationTimer = 0.75;
        audioSynth?.playZombieAbility?.(this.position, { variant: 'crawler', emitterKey: this.id });
    }

    spitAcid(target, audioSynth) {
        this.clearAcidProjectile();
        const origin = this.position.clone();
        origin.y -= 0.25;
        const aim = target.position.clone();
        aim.y -= 0.45;
        const direction = aim.sub(origin).normalize();
        const mesh = new THREE.Mesh(ACID_GEOMETRY, ACID_MATERIAL);
        mesh.position.copy(origin);
        mesh.frustumCulled = false;
        mesh.renderOrder = 3;
        this.scene.add(mesh);
        const velocity = direction.multiplyScalar(14);
        velocity.y += 1.5;
        this.acidProjectile = {
            mesh,
            target,
            velocity,
            life: 1.8
        };
        this.physics.velocity.x *= 0.25;
        this.physics.velocity.z *= 0.25;
        this.abilityCooldown = 5.2 + Math.random() * 1.8;
        this.attackCooldown = 0.9;
        this.abilityAnimationTimer = 0.65;
        audioSynth?.playZombieAbility?.(this.position, { variant: 'toxic', emitterKey: this.id });
    }

    updateAcidProjectile(delta, audioSynth) {
        const projectile = this.acidProjectile;
        if (!projectile) return;
        projectile.life -= delta;
        projectile.velocity.y -= 4.2 * delta;
        this._projectileStart.copy(projectile.mesh.position);
        projectile.mesh.position.addScaledVector(projectile.velocity, delta);
        const pulse = 1 + Math.sin(this._animTime * 20) * 0.18;
        projectile.mesh.scale.setScalar(pulse);
        const target = projectile.target;
        let hitTarget = false;
        if (target?.isAlive) {
            this._abilityDirection.subVectors(projectile.mesh.position, this._projectileStart);
            this._projectileToTarget.subVectors(target.position, this._projectileStart);
            const lengthSq = this._abilityDirection.lengthSq();
            const t = lengthSq > 0
                ? clamp(this._projectileToTarget.dot(this._abilityDirection) / lengthSq, 0, 1)
                : 0;
            this._projectileToTarget.copy(this._projectileStart).addScaledVector(this._abilityDirection, t);
            hitTarget = this._projectileToTarget.distanceToSquared(target.position) < 1.5;
        }
        if (hitTarget) {
            target.takeDamage(this.damage * 0.78, false, this, 1.4, 'acid');
            target.applySlow?.(0.55, 2.2);
            audioSynth?.playZombieAbility?.(projectile.mesh.position, { variant: 'acidImpact', emitterKey: this.id });
            this.clearAcidProjectile();
            return;
        }
        if (projectile.life <= 0) this.clearAcidProjectile();
    }

    clearAcidProjectile() {
        if (!this.acidProjectile) return;
        this.scene.remove(this.acidProjectile.mesh);
        this.acidProjectile = null;
    }

    updateRenderLod(delta) {
        this._lodTimer = (this._lodTimer ?? ((this.id % 10) * 0.03)) - delta;
        if (this._lodTimer > 0) return this._lodDetailed !== false;
        this._lodTimer = 0.3;
        const camera = this.scene?.userData?.camera;
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
        const detailDistance = this.scene?.userData?.mobileMode ? 50 : 70;
        const lodDistance = this._lodDetailed ? detailDistance + 12 : detailDistance;
        const detailed = distanceSq <= 225 || (inView && distanceSq <= lodDistance * lodDistance);
        if (this._lodDetailed === detailed) return detailed;
        this._lodDetailed = detailed;
        for (const child of this.mesh.userData.detailChildren || []) child.visible = detailed;
        if (this.mesh.userData.lodProxy) {
            this.mesh.userData.lodProxy.visible = !detailed && (!this.mesh.userData.useBatchedLod || this.burnTimer > 0);
        }
        return detailed;
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
        const alert = this.scene.userData.zombieAlert || {
            position: new THREE.Vector3(),
            target: null,
            time: 0
        };
        alert.position.copy(target.position);
        alert.target = target;
        alert.time = performance.now() * 0.001;
        this.scene.userData.zombieAlert = alert;
    }

    moveTowards(target, speed) {
        if (!this.isFinitePosition(target) || !Number.isFinite(speed)) {
            this.physics.velocity.x = 0;
            this.physics.velocity.z = 0;
            return;
        }
        const dx = target.x - this.position.x;
        const dz = target.z - this.position.z;
        const invLength = 1 / Math.max(0.0001, Math.hypot(dx, dz));
        const dirX = dx * invLength;
        const dirZ = dz * invLength;
        this.physics.velocity.x = dirX * speed;
        this.physics.velocity.z = dirZ * speed;
        this.rotation.y = Math.atan2(dirX, dirZ);
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
            if (this.abilityAnimationTimer > 0) {
                const leap = Math.sin((1 - this.abilityAnimationTimer / 0.75) * Math.PI);
                limbs.leftArm.rotation.z -= leap * 0.85;
                limbs.rightArm.rotation.z += leap * 0.85;
                this.mesh.rotation.x = -leap * 0.2;
            }
        } else if (this.variant === 'toxic') {
            const swing = Math.sin(t * 5.5) * 0.5 * speedNorm;
            limbs.leftLeg.rotation.x = -swing;
            limbs.rightLeg.rotation.x = swing;
            limbs.leftArm.rotation.x = -0.55 + Math.sin(t * 4.2) * 0.28;
            limbs.rightArm.rotation.x = -0.75 + Math.sin(t * 4.2 + 1.1) * 0.28;
            this.mesh.rotation.z = Math.sin(t * 2.1) * 0.045;
            if (this.abilityAnimationTimer > 0) {
                const spit = Math.sin((1 - this.abilityAnimationTimer / 0.65) * Math.PI);
                limbs.leftArm.rotation.x = -1.25 * spit;
                limbs.rightArm.rotation.x = -1.25 * spit;
                this.mesh.rotation.x = -0.12 * spit;
            }
        } else if (this.variant === 'runner') {
            const swing = Math.sin(t * 10) * 0.7 * speedNorm;
            limbs.leftLeg.rotation.x = -swing;
            limbs.rightLeg.rotation.x = swing;
            limbs.leftArm.rotation.x = Math.sin(t * 8 + 0.8) * 0.5 * speedNorm;
            limbs.rightArm.rotation.x = Math.sin(t * 8) * 0.5 * speedNorm;
            limbs.leftArm.rotation.z = -0.2;
            limbs.rightArm.rotation.z = 0.2;
            if (this.abilityAnimationTimer > 0) {
                limbs.leftArm.rotation.x = -1.05;
                limbs.rightArm.rotation.x = -1.05;
                this.mesh.rotation.x = -0.18;
            }
        } else if (this.variant === 'heavy') {
            const swing = Math.sin(t * 5) * 0.4 * speedNorm;
            limbs.leftLeg.rotation.x = -swing;
            limbs.rightLeg.rotation.x = swing;
            limbs.leftArm.rotation.x = Math.sin(t * 4 + 0.3) * 0.3 * speedNorm;
            limbs.rightArm.rotation.x = Math.sin(t * 4) * 0.3 * speedNorm;
            limbs.leftArm.rotation.z = -0.1;
            limbs.rightArm.rotation.z = 0.1;
            if (this.abilityAnimationTimer > 0) {
                const smash = Math.sin((1 - this.abilityAnimationTimer / 0.55) * Math.PI);
                limbs.leftArm.rotation.x = -2.1 * smash;
                limbs.rightArm.rotation.x = -2.1 * smash;
                this.mesh.rotation.x = 0.12 * smash;
            }
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
            this._corpseTimer = this.scene?.userData?.mobileMode ? 1.2 : 2.2;
            this._corpseExpiresAt = performance.now() + this._corpseTimer * 1000;
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
            this.alertPosition = this._alertPositionVec.copy(attacker.position);
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
        this.clearAcidProjectile();
        if (this.mesh?.parent) this.mesh.parent.remove(this.mesh);
        this.mesh.visible = false;
    }
}
