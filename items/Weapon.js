import * as THREE from 'three';

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

    getDamage() {
        switch(this.type) {
            case 'fists': return 6;
            case 'knife': return 14;
            case 'bow': return 24;
            case 'laser': return 36;
            case 'shotgun': return 8;
            case 'flamethrower': return 4;
            case 'pistol': return 18;
            case 'rifle': return 26;
            case 'axe': return 22;
            case 'spear': return 18;
            default: return 12;
        }
    }

    getRange() {
        switch(this.type) {
            case 'fists': return 2.2;
            case 'knife': return 2;
            case 'bow': return 90;
            case 'laser': return 100;
            case 'shotgun': return 35;
            case 'flamethrower': return 18;
            case 'pistol': return 70;
            case 'rifle': return 95;
            case 'axe': return 2.4;
            case 'spear': return 3.6;
            default: return 2;
        }
    }

    getCooldown() {
        switch(this.type) {
            case 'fists': return 0.4;
            case 'knife': return 0.5;
            case 'bow': return 1.5;
            case 'laser': return 0.3;
            case 'shotgun': return 1.0;
            case 'flamethrower': return 0.15;
            case 'pistol': return 0.45;
            case 'rifle': return 0.32;
            case 'axe': return 0.9;
            case 'spear': return 0.7;
            default: return 0.5;
        }
    }

    getMaxAmmo() {
        if (this.type === 'bow') return 40;
        if (this.type === 'laser') return 20;
        if (this.type === 'shotgun') return 16;
        if (this.type === 'flamethrower') return 200;
        if (this.type === 'pistol') return 24;
        if (this.type === 'rifle') return 30;
        return null;
    }

    getMaxDurability() {
        if (this.type === 'knife') return 60;
        if (this.type === 'axe') return 80;
        if (this.type === 'spear') return 70;
        return null;
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
                const woodMat = new THREE.MeshStandardMaterial({
                    color: 0x8a5a2a,
                    roughness: 0.5,
                    flatShading: true
                });
                const gripMat = new THREE.MeshStandardMaterial({
                    color: 0x3f2a1b,
                    roughness: 0.7,
                    flatShading: true
                });
                const tipMat = new THREE.MeshStandardMaterial({
                    color: 0x2f2f2f,
                    roughness: 0.4,
                    flatShading: true
                });

                const upperArc = [
                    { x: -0.08, y: 0.92, w: 0.12, h: 0.25, r: 0.5 },
                    { x: 0.06, y: 0.6, w: 0.12, h: 0.25, r: 0.28 },
                    { x: 0.14, y: 0.26, w: 0.12, h: 0.22, r: 0.12 }
                ];
                const lowerArc = [
                    { x: 0.14, y: -0.26, w: 0.12, h: 0.22, r: -0.12 },
                    { x: 0.06, y: -0.6, w: 0.12, h: 0.25, r: -0.28 },
                    { x: -0.08, y: -0.92, w: 0.12, h: 0.25, r: -0.5 }
                ];
                for (const seg of [...upperArc, ...lowerArc]) {
                    const limb = new THREE.Mesh(new THREE.BoxGeometry(seg.w, seg.h, 0.1), woodMat);
                    limb.position.set(seg.x, seg.y, 0);
                    limb.rotation.z = seg.r;
                    group.add(limb);
                }

                const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.12), gripMat);
                grip.position.set(0.01, 0, 0.02);
                group.add(grip);

                const tipTop = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.08), tipMat);
                tipTop.position.set(0.01, 1.04, 0.02);
                group.add(tipTop);
                const tipBottom = tipTop.clone();
                tipBottom.position.set(0.01, -1.04, 0.02);
                group.add(tipBottom);

                const stringMat = new THREE.LineBasicMaterial({ color: 0x111111 });
                const string = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(0.16, 1.04, 0),
                        new THREE.Vector3(-0.04, 0, 0),
                        new THREE.Vector3(0.16, -1.04, 0)
                    ]),
                    stringMat
                );
                group.add(string);
                group.scale.setScalar(0.86);
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
                    new THREE.BoxGeometry(0.36, 0.14, 0.12),
                    woodMat
                );
                stock.position.set(-0.38, 0, 0);
                model.add(stock);
                const shotgunGrip = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, 0.18, 0.1),
                    woodMat
                );
                shotgunGrip.position.set(-0.18, -0.18, 0);
                model.add(shotgunGrip);
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
            case 'spear': {
                const woodMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.7, flatShading: true });
                const metalMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.7, roughness: 0.25, flatShading: true });
                const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), woodMat);
                shaft.position.y = 0.1;
                const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 6), metalMat);
                tip.position.y = 0.8;
                group.add(shaft, tip);
                break;
            }
        }

        this.mesh = group;
        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }

    attack(owner, target, audioSynth, directionOverride = null) {
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
        return this.rangedAttack(owner, target, directionOverride);
    }

    meleeAttack(owner, target) {
        const distance = owner.position.distanceTo(target.position);
        const targetRadius = target.physics?.radius || 0.4;
        if (distance > this.range + targetRadius * 0.85) return false;

        const headHeight = target.physics?.height || 1.7;
        const hitHeight = target.position.y + headHeight * 0.9;
        const isHeadshot = Math.abs(owner.position.y - hitHeight) < 0.3;

        const finalDamage = isHeadshot ? this.damage * 2 : this.damage;
        const knockback = this.type === 'knife' ? 5 : this.type === 'axe' ? 6 : this.type === 'spear' ? 5.5 : 4;
        if ((this.type === 'knife' || this.type === 'axe' || this.type === 'spear') && this.durability !== null) {
            this.durability = Math.max(0, this.durability - 1);
        }
        return { hit: true, damage: finalDamage, isHeadshot, knockback };
    }

    rangedAttack(owner, target, directionOverride = null) {
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
            for (let i = 0; i < 6; i++) {
                const spread = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.15,
                    (Math.random() - 0.5) * 0.15,
                    (Math.random() - 0.5) * 0.15
                );
                const dir = direction.clone().add(spread).normalize();
                pellets.push(this.createProjectile(owner.position.clone(), dir));
            }
            return { hit: false, projectiles: pellets };
        }
        if (this.type === 'flamethrower') {
            const flames = [];
            for (let i = 0; i < 3; i++) {
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
            const shaftMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6, flatShading: true });
            const tipMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, metalness: 0.6, roughness: 0.25, flatShading: true });
            const fletchMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.7, flatShading: true });

            const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.04), shaftMat);
            group.add(shaft);

            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), tipMat);
            tip.position.x = 0.8;
            tip.rotation.z = -Math.PI / 2;
            group.add(tip);

            const fletch1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.02), fletchMat);
            fletch1.position.x = -0.68;
            fletch1.position.y = 0.05;
            group.add(fletch1);
            const fletch2 = fletch1.clone();
            fletch2.position.y = -0.05;
            group.add(fletch2);

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

        return {
            mesh,
            direction: direction.clone(),
            velocity: direction.clone().multiplyScalar(
                type === 'laser' ? 50
                    : type === 'bow' ? 75
                        : type === 'shotgun' ? 60
                            : type === 'flame' ? 18
                                : type === 'rifle' ? 90
                                    : type === 'pistol' ? 75
                                        : 30
            ),
            speed: type === 'laser' ? 50
                : type === 'bow' ? 75
                    : type === 'shotgun' ? 60
                        : type === 'flame' ? 18
                            : type === 'rifle' ? 90
                                : type === 'pistol' ? 75
                                    : 30,
            damage: this.damage,
            owner: null,
            knockback,
            gravity,
            lifetime: type === 'flame' ? 0.6 : 5,
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
            this.mesh.rotation.copy(rotation);
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
