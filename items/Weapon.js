import * as THREE from 'three';

const WEAPON_BALANCE = {
    fists: { damage: 8, range: 2.4, cooldown: 0.38, ammo: null, durability: null, projectileSpeed: 0 },
    knife: { damage: 20, range: 3.1, cooldown: 0.45, ammo: null, durability: 80, projectileSpeed: 0 },
    axe: { damage: 30, range: 3.0, cooldown: 0.82, ammo: null, durability: 95, projectileSpeed: 0 },
    bow: { damage: 24, range: 20, cooldown: 1.22, ammo: 48, durability: null, projectileSpeed: 46 },
    laser: { damage: 28, range: 94, cooldown: 0.34, ammo: 30, durability: null, projectileSpeed: 62 },
    shotgun: { damage: 11, range: 17, cooldown: 0.95, ammo: 36, durability: null, projectileSpeed: 52, pellets: 8 },
    flamethrower: { damage: 4.2, range: 14, cooldown: 0.12, ammo: 260, durability: null, projectileSpeed: 16, flameCount: 4 },
    pistol: { damage: 18, range: 68, cooldown: 0.36, ammo: 90, durability: null, projectileSpeed: 82 },
    rifle: { damage: 24, range: 102, cooldown: 0.24, ammo: 120, durability: null, projectileSpeed: 98 }
};

export class Weapon {
    constructor(type, scene) {
        this.type = type; // 'knife', 'bow', 'laser', 'shotgun', 'flamethrower', 'pistol', 'rifle'
        this.scene = scene;
        this.damage = this.getDamage();
        this.range = this.getRange();
        this.cooldown = this.getCooldown();
        this.lastAttackTime = 0;
        this.maxAmmo = this.getMaxAmmo();
        this.ammo = this.maxAmmo;
        this.maxDurability = this.getMaxDurability();
        this.durability = this.maxDurability;
        this.laserColor = this.type === 'laser'
            ? new THREE.Color().setHSL(Math.random(), 0.85, 0.55)
            : null;
        this.mesh = null;
        this.createMesh();
    }

    getProfile() {
        return WEAPON_BALANCE[this.type] || { damage: 12, range: 2, cooldown: 0.5, ammo: null, durability: null, projectileSpeed: 30 };
    }

    getDamage() {
        return this.getProfile().damage;
    }

    getRange() {
        return this.getProfile().range;
    }

    getCooldown() {
        return this.getProfile().cooldown;
    }

    getMaxAmmo() {
        return this.getProfile().ammo ?? null;
    }

    getMaxDurability() {
        return this.getProfile().durability ?? null;
    }

    resetCharges() {
        if (this.maxAmmo !== null) this.ammo = this.maxAmmo;
        if (this.maxDurability !== null) this.durability = this.maxDurability;
    }

    createMesh() {
        const group = new THREE.Group();

        switch(this.type) {
            case 'fists':
                this.mesh = null;
                return;
            case 'knife':
                const bladeMat = new THREE.MeshStandardMaterial({
                    color: 0xd6d6d6,
                    metalness: 0.85,
                    roughness: 0.2,
                    flatShading: true
                });
                const handleMat = new THREE.MeshStandardMaterial({
                    color: 0x4e342e,
                    roughness: 0.85,
                    flatShading: true
                });
                const guardMat = new THREE.MeshStandardMaterial({
                    color: 0x212121,
                    roughness: 0.5,
                    metalness: 0.3,
                    flatShading: true
                });

                const blade = new THREE.Mesh(
                    new THREE.BoxGeometry(0.08, 0.5, 0.02),
                    bladeMat
                );
                blade.position.y = 0.18;
                const tip = new THREE.Mesh(
                    new THREE.ConeGeometry(0.05, 0.18, 6),
                    bladeMat
                );
                tip.position.y = 0.5;

                const guard = new THREE.Mesh(
                    new THREE.BoxGeometry(0.16, 0.04, 0.06),
                    guardMat
                );
                guard.position.y = -0.02;

                const handle = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, 0.2, 0.06),
                    handleMat
                );
                handle.position.y = -0.18;
                const pommel = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, 0.05, 0.06),
                    guardMat
                );
                pommel.position.y = -0.32;

                group.add(blade);
                group.add(tip);
                group.add(guard);
                group.add(handle);
                group.add(pommel);
                break;

            case 'bow': {
                const limbMat = new THREE.MeshStandardMaterial({
                    color: 0x7a4a20,
                    roughness: 0.6,
                    flatShading: true
                });
                const gripMat = new THREE.MeshStandardMaterial({
                    color: 0x2d1b12,
                    roughness: 0.75,
                    flatShading: true
                });
                const tipMat = new THREE.MeshStandardMaterial({
                    color: 0x8d8d8d,
                    metalness: 0.45,
                    roughness: 0.45,
                    flatShading: true
                });

                const limbSegments = [
                    { x: -0.16, y: 0.82, w: 0.12, h: 0.28, r: 0.48 },
                    { x: -0.02, y: 0.5, w: 0.12, h: 0.27, r: 0.28 },
                    { x: 0.06, y: 0.18, w: 0.11, h: 0.24, r: 0.12 },
                    { x: 0.06, y: -0.18, w: 0.11, h: 0.24, r: -0.12 },
                    { x: -0.02, y: -0.5, w: 0.12, h: 0.27, r: -0.28 },
                    { x: -0.16, y: -0.82, w: 0.12, h: 0.28, r: -0.48 }
                ];

                for (const seg of limbSegments) {
                    const limb = new THREE.Mesh(new THREE.BoxGeometry(seg.w, seg.h, 0.09), limbMat);
                    limb.position.set(seg.x, seg.y, 0);
                    limb.rotation.z = seg.r;
                    group.add(limb);
                }

                const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.11), gripMat);
                grip.position.set(0.01, 0, 0);
                group.add(grip);

                const rest = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.06), gripMat);
                rest.position.set(0.12, 0.05, 0);
                group.add(rest);

                const tipTop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.07), tipMat);
                tipTop.position.set(-0.21, 1.0, 0);
                group.add(tipTop);
                const tipBottom = tipTop.clone();
                tipBottom.position.set(-0.21, -1.0, 0);
                group.add(tipBottom);

                const stringMat = new THREE.LineBasicMaterial({ color: 0x111111 });
                const string = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(-0.21, 1.0, 0),
                        new THREE.Vector3(0.14, 0, 0),
                        new THREE.Vector3(-0.21, -1.0, 0)
                    ]),
                    stringMat
                );
                group.add(string);
                group.scale.setScalar(0.82);
                break;
            }

            case 'laser':
                const model = new THREE.Group();
                const bodyMat = new THREE.MeshStandardMaterial({
                    color: 0x2b2b2b,
                    metalness: 0.7,
                    roughness: 0.35,
                    flatShading: true
                });
                const accentMat = new THREE.MeshStandardMaterial({
                    color: this.laserColor,
                    emissive: this.laserColor,
                    emissiveIntensity: 0.65,
                    roughness: 0.2,
                    flatShading: true
                });
                const laserGripMat = new THREE.MeshStandardMaterial({
                    color: 0x1c1c1c,
                    metalness: 0.4,
                    roughness: 0.6,
                    flatShading: true
                });

                const body = new THREE.Mesh(
                    new THREE.BoxGeometry(0.62, 0.2, 0.2),
                    bodyMat
                );
                body.position.set(0, 0.03, 0);
                model.add(body);

                const barrel = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8),
                    bodyMat
                );
                barrel.rotation.z = Math.PI / 2;
                barrel.position.set(0.38, 0.05, 0);
                model.add(barrel);

                const muzzle = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.09, 0.09, 0.06, 8),
                    accentMat
                );
                muzzle.rotation.z = Math.PI / 2;
                muzzle.position.set(0.63, 0.05, 0);
                model.add(muzzle);

                const laserGrip = new THREE.Mesh(
                    new THREE.BoxGeometry(0.14, 0.26, 0.12),
                    laserGripMat
                );
                laserGrip.position.set(-0.1, -0.18, 0);
                model.add(laserGrip);

                const stock = new THREE.Mesh(
                    new THREE.BoxGeometry(0.22, 0.16, 0.16),
                    bodyMat
                );
                stock.position.set(-0.33, 0.02, 0);
                model.add(stock);

                const rail = new THREE.Mesh(
                    new THREE.BoxGeometry(0.42, 0.05, 0.12),
                    laserGripMat
                );
                rail.position.set(0.02, 0.16, 0);
                model.add(rail);

                const core = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8),
                    accentMat
                );
                core.rotation.z = Math.PI / 2;
                core.position.set(0.18, 0.06, 0);
                model.add(core);

                const cell = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, 0.18, 0.12),
                    accentMat
                );
                cell.position.set(-0.02, -0.05, 0);
                model.add(cell);

                model.rotation.y = -Math.PI / 2;
                group.add(model);
                break;
            case 'pistol': {
                const model = new THREE.Group();
                const gunMat = new THREE.MeshStandardMaterial({ color: 0x3b3b3b, roughness: 0.45, flatShading: true });
                const gripMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, flatShading: true });
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.16), gunMat);
                body.position.set(0.05, 0.06, 0);
                model.add(body);
                const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.08), gunMat);
                barrel.position.set(0.36, 0.06, 0);
                model.add(barrel);
                const slide = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.18), gunMat);
                slide.position.set(0.08, 0.16, 0);
                model.add(slide);
                const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.12), gripMat);
                grip.position.set(-0.08, -0.14, 0);
                model.add(grip);
                model.rotation.y = -Math.PI / 2;
                group.add(model);
                break;
            }
            case 'rifle': {
                const model = new THREE.Group();
                const gunMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.45, flatShading: true });
                const stockMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.7, flatShading: true });
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.14), gunMat);
                body.position.set(0.1, 0.06, 0);
                model.add(body);
                const barrel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.08), gunMat);
                barrel.position.set(0.65, 0.06, 0);
                model.add(barrel);
                const stock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.14), stockMat);
                stock.position.set(-0.35, 0.04, 0);
                model.add(stock);
                const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.12), stockMat);
                grip.position.set(-0.02, -0.14, 0);
                model.add(grip);
                const mag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.1), gunMat);
                mag.position.set(0.12, -0.1, 0);
                model.add(mag);
                const sight = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.1), gunMat);
                sight.position.set(0.05, 0.18, 0);
                model.add(sight);
                model.rotation.y = -Math.PI / 2;
                group.add(model);
                break;
            }
            case 'shotgun': {
                const model = new THREE.Group();
                const gunMat = new THREE.MeshStandardMaterial({ color: 0x4b4b4b, roughness: 0.5, flatShading: true });
                const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3f1c, roughness: 0.7, flatShading: true });
                const barrel = new THREE.Mesh(
                    new THREE.BoxGeometry(0.8, 0.08, 0.08),
                    gunMat
                );
                barrel.position.set(0.35, 0.05, 0);
                model.add(barrel);
                const barrel2 = barrel.clone();
                barrel2.position.y = -0.05;
                model.add(barrel2);
                const body = new THREE.Mesh(
                    new THREE.BoxGeometry(0.35, 0.16, 0.12),
                    gunMat
                );
                body.position.set(-0.1, 0, 0);
                model.add(body);
                const stock = new THREE.Mesh(
                    new THREE.BoxGeometry(0.42, 0.16, 0.14),
                    woodMat
                );
                stock.position.set(-0.4, 0, 0);
                model.add(stock);
                const shotgunGrip = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, 0.18, 0.1),
                    woodMat
                );
                shotgunGrip.position.set(-0.18, -0.18, 0);
                model.add(shotgunGrip);
                const pump = new THREE.Mesh(
                    new THREE.BoxGeometry(0.26, 0.12, 0.12),
                    woodMat
                );
                pump.position.set(0.2, -0.05, 0);
                model.add(pump);
                model.rotation.y = -Math.PI / 2;
                group.add(model);
                break;
            }
            case 'flamethrower': {
                const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, flatShading: true });
                const tankMat = new THREE.MeshStandardMaterial({ color: 0x8e9aa2, roughness: 0.4, flatShading: true });
                const model = new THREE.Group();
                const body = new THREE.Mesh(
                    new THREE.BoxGeometry(0.6, 0.22, 0.22),
                    metalMat
                );
                model.add(body);
                const nozzle = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8),
                    metalMat
                );
                nozzle.rotation.z = Math.PI / 2;
                nozzle.position.set(0.45, 0.02, 0);
                model.add(nozzle);
                const tank = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.12, 0.12, 0.4, 8),
                    tankMat
                );
                tank.position.set(-0.35, -0.12, 0);
                model.add(tank);
                const flameGrip = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, 0.2, 0.12),
                    metalMat
                );
                flameGrip.position.set(-0.05, -0.2, 0);
                model.add(flameGrip);
                model.rotation.y = -Math.PI / 2;
                group.add(model);
                break;
            }
            case 'axe': {
                const woodMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.7, flatShading: true });
                const metalMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.6, roughness: 0.3, flatShading: true });
                const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), woodMat);
                handle.position.y = -0.1;
                const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.12), metalMat);
                head.position.set(0.12, 0.35, 0);
                const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.32, 0.08), metalMat);
                blade.position.set(0.32, 0.35, 0);
                group.add(handle, head, blade);
                break;
            }
        }

        this.mesh = group;
        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }

    attack(owner, target, audioSynth, directionOverride = null, options = null) {
        const currentTime = performance.now() / 1000;
        if (currentTime - this.lastAttackTime < this.cooldown) {
            return false;
        }

        if (this.type === 'knife' && this.durability !== null && this.durability <= 0) {
            return false;
        }
        if ((this.type === 'bow' || this.type === 'laser' || this.type === 'shotgun' || this.type === 'flamethrower' || this.type === 'pistol' || this.type === 'rifle') && this.ammo !== null && this.ammo <= 0) {
            return false;
        }

        this.lastAttackTime = currentTime;
        this.animateAttack();

        if (audioSynth) {
            if (this.type === 'knife') {
                audioSynth.playHit();
            } else if (this.type === 'bow') {
                audioSynth.playBowShot();
            } else if (this.type === 'laser') {
                audioSynth.playLaser();
            } else if (this.type === 'shotgun') {
                audioSynth.playShotgun?.();
            } else if (this.type === 'flamethrower') {
                audioSynth.playFlamethrower?.();
            } else if (this.type === 'pistol') {
                audioSynth.playShotgun?.(0.65);
            } else if (this.type === 'rifle') {
                audioSynth.playShotgun?.(0.75);
            }
        }

        if (this.type === 'fists') {
            if (audioSynth) audioSynth.playHit();
            return this.meleeAttack(owner, target);
        } else if (this.type === 'knife') {
            return this.meleeAttack(owner, target);
        }
        return this.rangedAttack(owner, target, directionOverride, options || {});
    }

    meleeAttack(owner, target) {
        const distance = owner.position.distanceTo(target.position);
        const targetRadius = target.physics?.radius || 0.4;
        if (distance > this.range + targetRadius * 0.85) return false;

        const headHeight = target.physics?.height || 1.7;
        const hitHeight = target.position.y + headHeight * 0.9;
        const isHeadshot = Math.abs(owner.position.y - hitHeight) < 0.3;

        const finalDamage = isHeadshot ? this.damage * 2 : this.damage;
        const knockback = this.type === 'knife' ? 5 : this.type === 'axe' ? 6 : 4;
        if ((this.type === 'knife' || this.type === 'axe') && this.durability !== null) {
            this.durability = Math.max(0, this.durability - 1);
        }
        return { hit: true, damage: finalDamage, isHeadshot, knockback };
    }

    rangedAttack(owner, target, directionOverride = null, options = {}) {
        let direction = directionOverride;
        if (!direction && target && target.position) {
            direction = new THREE.Vector3()
                .subVectors(target.position, owner.position)
                .normalize();
        }

        if (!direction) return false;
        if (this.ammo !== null) {
            this.ammo = Math.max(0, this.ammo - 1);
        }

        if (this.type === 'shotgun') {
            const pellets = [];
            const pelletCount = this.getProfile().pellets || 8;
            for (let i = 0; i < pelletCount; i++) {
                const spread = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.2,
                    (Math.random() - 0.5) * 0.14,
                    (Math.random() - 0.5) * 0.2
                );
                const dir = direction.clone().add(spread).normalize();
                const pellet = this.createProjectile(owner.position.clone(), dir);
                pellet.lifetime = 0.32;
                pellet.damage = this.damage;
                pellets.push(pellet);
            }
            return { hit: false, projectiles: pellets };
        }
        if (this.type === 'flamethrower') {
            const flames = [];
            const flameCount = this.getProfile().flameCount || 3;
            for (let i = 0; i < flameCount; i++) {
                const spread = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.1,
                    (Math.random() - 0.5) * 0.05,
                    (Math.random() - 0.5) * 0.1
                );
                const dir = direction.clone().add(spread).normalize();
                flames.push(this.createProjectile(owner.position.clone(), dir, 'flame'));
            }
            return { hit: false, projectiles: flames };
        }
        const projectile = this.createProjectile(owner.position.clone(), direction);
        if (this.type === 'bow') {
            const chargeRatio = Math.max(0.35, Math.min(1, options.chargeRatio ?? 1));
            projectile.damage = Math.round(this.damage * (0.4 + chargeRatio * 0.85));
            projectile.speed = 30 + chargeRatio * 52;
            projectile.velocity.copy(direction).multiplyScalar(projectile.speed);
            projectile.gravity = Math.max(0.008, 0.028 - chargeRatio * 0.017);
            projectile.knockback = 3.4 + chargeRatio * 2.8;
        }
        return { hit: false, projectile };
    }

    createProjectile(startPos, direction, overrideType = null) {
        let mesh;
        let knockback = 4;
        let gravity = 0;
        const type = overrideType || this.type;

        if (type === 'laser') {
            const geometry = new THREE.SphereGeometry(0.1, 8, 8);
            const material = new THREE.MeshStandardMaterial({
                color: this.laserColor || 0x00ffff,
                emissive: this.laserColor || 0x00ffff,
                emissiveIntensity: 0.6,
                roughness: 0.2,
                flatShading: true
            });
            mesh = new THREE.Mesh(geometry, material);
            knockback = 3;
        } else if (type === 'bow') {
            const group = new THREE.Group();
            const shaftMat = new THREE.MeshStandardMaterial({
                color: 0x9a6230,
                roughness: 0.55,
                flatShading: true
            });
            const tipMat = new THREE.MeshStandardMaterial({
                color: 0xc4c7cc,
                metalness: 0.78,
                roughness: 0.18,
                flatShading: true
            });
            const fletchMat = new THREE.MeshStandardMaterial({
                color: 0xf0f4ff,
                emissive: 0x8aa4ff,
                emissiveIntensity: 0.12,
                roughness: 0.62,
                flatShading: true
            });

            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 1.95, 6), shaftMat);
            shaft.rotation.z = Math.PI / 2;
            group.add(shaft);

            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.3, 6), tipMat);
            tip.position.x = 1.1;
            tip.rotation.z = -Math.PI / 2;
            group.add(tip);

            const collar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.11), tipMat);
            collar.position.x = 0.92;
            group.add(collar);

            const fletch1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.03), fletchMat);
            fletch1.position.x = -0.9;
            fletch1.position.y = 0.1;
            group.add(fletch1);
            const fletch2 = fletch1.clone();
            fletch2.position.y = -0.1;
            group.add(fletch2);
            const fletch3 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.12), fletchMat);
            fletch3.position.x = -0.9;
            group.add(fletch3);

            const glow = new THREE.Mesh(
                new THREE.SphereGeometry(0.065, 6, 6),
                new THREE.MeshBasicMaterial({
                    color: 0xf3f7ff,
                    transparent: true,
                    opacity: 0.72
                })
            );
            glow.position.x = -0.9;
            group.add(glow);
            group.scale.setScalar(1.1);
            group.traverse(child => {
                child.frustumCulled = false;
                if (child.isMesh) {
                    child.renderOrder = 6;
                }
            });

            mesh = group;
            knockback = 6;
            gravity = 0.02;
        } else if (type === 'pistol' || type === 'rifle') {
            const bulletMat = new THREE.MeshStandardMaterial({
                color: 0xffd54f,
                emissive: 0xffc107,
                emissiveIntensity: 0.35,
                roughness: 0.3,
                flatShading: true
            });
            const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), bulletMat);
            bullet.rotation.z = Math.PI / 2;
            mesh = bullet;
            knockback = type === 'rifle' ? 4 : 3;
        } else if (type === 'flame') {
            const flameMat = new THREE.MeshStandardMaterial({
                color: 0xff6d00,
                emissive: 0xff8f00,
                emissiveIntensity: 0.7,
                transparent: true,
                opacity: 0.8,
                roughness: 0.4
            });
            const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 6), flameMat);
            flame.rotation.z = Math.PI / 2;
            mesh = flame;
            knockback = 2;
            gravity = 0;
        } else {
            const geometry = new THREE.ConeGeometry(0.1, 0.3, 8);
            const material = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8, flatShading: true });
            mesh = new THREE.Mesh(geometry, material);
        }

        mesh.position.copy(startPos);
        if (type === 'bow') {
            const forward = new THREE.Vector3(1, 0, 0);
            const quat = new THREE.Quaternion().setFromUnitVectors(forward, direction.clone().normalize());
            mesh.quaternion.copy(quat);
        } else {
            mesh.lookAt(startPos.clone().add(direction));
        }

        const projectileSpeed = type === 'flame'
            ? (WEAPON_BALANCE.flamethrower.projectileSpeed || 16)
            : (WEAPON_BALANCE[type]?.projectileSpeed || this.getProfile().projectileSpeed || 30);

        return {
            mesh,
            direction: direction.clone(),
            velocity: direction.clone().multiplyScalar(projectileSpeed),
            speed: projectileSpeed,
            damage: this.damage,
            owner: null,
            knockback,
            gravity,
            lifetime: type === 'flame' ? 0.6 : 5,
            travelled: 0,
            maxDistance: type === 'bow' ? 20 : Infinity,
            align: type === 'bow' ? 'arrow' : null,
            type
        };
    }

    animateAttack() {
        if (!this.mesh) return;

        const originalRotation = this.mesh.rotation.clone();
        const originalPosition = this.mesh.position.clone();
        const animate = () => {
        if (this.type === 'knife') {
            this.mesh.rotation.x = originalRotation.x - 0.6;
            this.mesh.position.z = originalPosition.z - 0.1;
            setTimeout(() => {
                this.mesh.rotation.copy(originalRotation);
                this.mesh.position.copy(originalPosition);
            }, 120);
        } else if (this.type === 'bow') {
            this.mesh.rotation.z = originalRotation.z - 0.2;
            setTimeout(() => {
                this.mesh.rotation.copy(originalRotation);
            }, 200);
        } else if (this.type === 'laser' || this.type === 'shotgun' || this.type === 'pistol' || this.type === 'rifle') {
            this.mesh.rotation.x = originalRotation.x - 0.25;
            this.mesh.position.z = originalPosition.z - 0.06;
            setTimeout(() => {
                this.mesh.rotation.copy(originalRotation);
                this.mesh.position.copy(originalPosition);
            }, 120);
        } else if (this.type === 'flamethrower') {
            this.mesh.rotation.x = originalRotation.x - 0.12;
            setTimeout(() => {
                this.mesh.rotation.copy(originalRotation);
            }, 120);
        }
    };

        animate();
    }

    setVisible(visible) {
        if (this.mesh) {
            this.mesh.visible = visible;
        }
    }

    setPosition(position) {
        if (this.mesh) {
            this.mesh.position.copy(position);
        }
    }

    setRotation(rotation) {
        if (this.mesh) {
            let yawOffset = 0;
            let pitchOffset = 0;
            let rollOffset = 0;
            if (
                this.type === 'laser'
                || this.type === 'shotgun'
                || this.type === 'flamethrower'
                || this.type === 'pistol'
                || this.type === 'rifle'
            ) {
                yawOffset = Math.PI / 2;
            } else if (this.type === 'bow' || this.type === 'knife' || this.type === 'axe') {
                pitchOffset = -Math.PI / 2;
            }
            this.mesh.rotation.set(rotation.x + pitchOffset, rotation.y + yawOffset, rotation.z + rollOffset);
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
    }

    createWoodTexture(primary, secondary, dark) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = primary;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = secondary;
        for (let y = 0; y < canvas.height; y += 10) {
            ctx.fillRect(0, y, canvas.width, 6);
        }
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        for (let x = 0; x < canvas.width; x += 12) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        return new THREE.CanvasTexture(canvas);
    }

    createBowTexture(primary, secondary, dark) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = primary;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = secondary;
        for (let y = 0; y < canvas.height; y += 8) {
            ctx.fillRect(0, y, canvas.width, 4);
        }
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        for (let x = 0; x < canvas.width; x += 12) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + 6, canvas.height);
            ctx.stroke();
        }
        return new THREE.CanvasTexture(canvas);
    }
}
