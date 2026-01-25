import * as THREE from 'three';

export class Weapon {
    constructor(type, scene) {
        this.type = type; // 'knife', 'bow', 'laser'
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
            default: return 12;
        }
    }

    getRange() {
        switch(this.type) {
            case 'fists': return 2.2;
            case 'knife': return 2;
            case 'bow': return 90;
            case 'laser': return 100;
            default: return 2;
        }
    }

    getCooldown() {
        switch(this.type) {
            case 'fists': return 0.4;
            case 'knife': return 0.5;
            case 'bow': return 1.5;
            case 'laser': return 0.3;
            default: return 0.5;
        }
    }

    getMaxAmmo() {
        if (this.type === 'bow') return 20;
        if (this.type === 'laser') return 10;
        return null;
    }

    getMaxDurability() {
        if (this.type === 'knife') return 30;
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

            case 'bow':
                const bowMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.55, flatShading: true });
                const wrapMat = new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: 0.7, flatShading: true });
                const segmentGeo = new THREE.BoxGeometry(0.08, 0.28, 0.1);
                const segments = 5;
                for (let i = 0; i < segments; i++) {
                    const t = i / (segments - 1);
                    const angle = (-0.55 + t * 1.1);
                    const y = 0.55 - t * 1.1;
                    const x = 0.18 + Math.abs(Math.sin(angle)) * 0.22;
                    const seg = new THREE.Mesh(segmentGeo, bowMat);
                    seg.position.set(x, y, 0);
                    seg.rotation.z = angle;
                    group.add(seg);
                    const segMirror = seg.clone();
                    segMirror.position.x = -x;
                    segMirror.rotation.z = -angle;
                    group.add(segMirror);
                }
                const bowGrip = new THREE.Mesh(
                    new THREE.BoxGeometry(0.16, 0.36, 0.12),
                    wrapMat
                );
                group.add(bowGrip);
                const gripWrap = new THREE.Mesh(
                    new THREE.BoxGeometry(0.18, 0.12, 0.14),
                    wrapMat
                );
                gripWrap.position.set(0, 0.04, 0);
                group.add(gripWrap);

                const stringMat = new THREE.LineBasicMaterial({ color: 0x111111 });
                const string = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(0.38, 0.7, 0),
                        new THREE.Vector3(0.08, 0, 0),
                        new THREE.Vector3(0.38, -0.7, 0)
                    ]),
                    stringMat
                );
                const string2 = string.clone();
                string2.scale.x = -1;
                group.add(string);
                group.add(string2);
                group.scale.setScalar(0.8);
                break;

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
                const gripMat = new THREE.MeshStandardMaterial({
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

                const grip = new THREE.Mesh(
                    new THREE.BoxGeometry(0.14, 0.26, 0.12),
                    gripMat
                );
                grip.position.set(-0.1, -0.18, 0);
                model.add(grip);

                const stock = new THREE.Mesh(
                    new THREE.BoxGeometry(0.22, 0.16, 0.16),
                    bodyMat
                );
                stock.position.set(-0.33, 0.02, 0);
                model.add(stock);

                const rail = new THREE.Mesh(
                    new THREE.BoxGeometry(0.42, 0.05, 0.12),
                    gripMat
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
        if ((this.type === 'bow' || this.type === 'laser') && this.ammo !== null && this.ammo <= 0) {
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
        if (distance > this.range) return false;

        const headHeight = target.physics?.height || 1.7;
        const hitHeight = target.position.y + headHeight * 0.9;
        const isHeadshot = Math.abs(owner.position.y - hitHeight) < 0.3;

        const finalDamage = isHeadshot ? this.damage * 2 : this.damage;
        const knockback = this.type === 'knife' ? 5 : 4;
        if (this.type === 'knife' && this.durability !== null) {
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

        const projectile = this.createProjectile(owner.position.clone(), direction);
        return { hit: false, projectile };
    }

    createProjectile(startPos, direction) {
        let mesh;
        let knockback = 4;
        let gravity = 0;

        if (this.type === 'laser') {
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
        } else if (this.type === 'bow') {
            const group = new THREE.Group();
            const shaft = new THREE.Mesh(
                new THREE.BoxGeometry(1.1, 0.05, 0.05),
                new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6, flatShading: true })
            );
            group.add(shaft);

            const tip = new THREE.Mesh(
                new THREE.ConeGeometry(0.05, 0.24, 6),
                new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6, roughness: 0.2, flatShading: true })
            );
            tip.position.x = 0.62;
            tip.rotation.z = Math.PI / 2;
            group.add(tip);

            const fletch = new THREE.Mesh(
                new THREE.BoxGeometry(0.22, 0.12, 0.02),
                new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.7, flatShading: true })
            );
            fletch.position.x = -0.56;
            group.add(fletch);

            mesh = group;
            knockback = 6;
            gravity = 0;
        } else {
            const geometry = new THREE.ConeGeometry(0.1, 0.3, 8);
            const material = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8, flatShading: true });
            mesh = new THREE.Mesh(geometry, material);
        }

        mesh.position.copy(startPos);
        if (this.type === 'bow') {
            const forward = new THREE.Vector3(1, 0, 0);
            const quat = new THREE.Quaternion().setFromUnitVectors(forward, direction.clone().normalize());
            mesh.quaternion.copy(quat);
        } else {
            mesh.lookAt(startPos.clone().add(direction));
        }

        return {
            mesh,
            direction: direction.clone(),
            velocity: direction.clone().multiplyScalar(this.type === 'laser' ? 50 : (this.type === 'bow' ? 80 : 30)),
            speed: this.type === 'laser' ? 50 : (this.type === 'bow' ? 80 : 30),
            damage: this.damage,
            owner: null,
            knockback,
            gravity,
            lifetime: 5,
            align: this.type === 'bow' ? 'arrow' : null
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
            } else if (this.type === 'laser') {
                this.mesh.rotation.x = originalRotation.x - 0.25;
                this.mesh.position.z = originalPosition.z - 0.06;
                setTimeout(() => {
                    this.mesh.rotation.copy(originalRotation);
                    this.mesh.position.copy(originalPosition);
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
}
