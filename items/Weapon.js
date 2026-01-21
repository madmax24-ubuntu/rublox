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
                const blade = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, 0.3, 0.02),
                    new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 })
                );
                const handle = new THREE.Mesh(
                    new THREE.BoxGeometry(0.08, 0.1, 0.02),
                    new THREE.MeshStandardMaterial({ color: 0x8b4513 })
                );
                handle.position.y = -0.2;
                group.add(blade);
                group.add(handle);
                break;

            case 'bow':
                const bowMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 });
                const limbGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.7, 8);
                const topLimb = new THREE.Mesh(limbGeo, bowMat);
                topLimb.rotation.z = Math.PI / 2.2;
                topLimb.position.set(0, 0.2, 0);
                const bottomLimb = new THREE.Mesh(limbGeo, bowMat);
                bottomLimb.rotation.z = -Math.PI / 2.2;
                bottomLimb.position.set(0, -0.2, 0);
                const bowGrip = new THREE.Mesh(
                    new THREE.BoxGeometry(0.08, 0.2, 0.06),
                    bowMat
                );
                const stringMat = new THREE.LineBasicMaterial({ color: 0x111111 });
                const string = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(0.18, 0.35, 0),
                        new THREE.Vector3(0.1, 0, 0),
                        new THREE.Vector3(0.18, -0.35, 0)
                    ]),
                    stringMat
                );
                group.add(topLimb);
                group.add(bottomLimb);
                group.add(bowGrip);
                group.add(string);
                break;

            case 'laser':
                const bodyMat = new THREE.MeshStandardMaterial({
                    color: 0x2f2f2f,
                    metalness: 0.7,
                    roughness: 0.4,
                    flatShading: true
                });
                const accentMat = new THREE.MeshStandardMaterial({
                    color: this.laserColor,
                    emissive: this.laserColor,
                    emissiveIntensity: 0.6,
                    flatShading: true
                });
                const body = new THREE.Mesh(
                    new THREE.BoxGeometry(0.5, 0.18, 0.18),
                    bodyMat
                );
                body.position.set(0, 0, 0);
                group.add(body);

                const barrel = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.06, 0.08, 0.45, 8),
                    bodyMat
                );
                barrel.rotation.z = Math.PI / 2;
                barrel.position.set(0.32, 0.02, 0);
                group.add(barrel);

                const grip = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, 0.22, 0.1),
                    bodyMat
                );
                grip.position.set(-0.12, -0.18, 0);
                group.add(grip);

                const stock = new THREE.Mesh(
                    new THREE.BoxGeometry(0.18, 0.14, 0.14),
                    bodyMat
                );
                stock.position.set(-0.28, 0.02, 0);
                group.add(stock);

                const core = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8),
                    accentMat
                );
                core.rotation.z = Math.PI / 2;
                core.position.set(0.18, 0.04, 0);
                group.add(core);

                const emitter = new THREE.Mesh(
                    new THREE.SphereGeometry(0.07, 8, 8),
                    accentMat
                );
                emitter.position.set(0.52, 0.02, 0);
                group.add(emitter);
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
                emissive: this.laserColor || 0x00ffff
            });
            mesh = new THREE.Mesh(geometry, material);
            knockback = 3;
        } else if (this.type === 'bow') {
            const group = new THREE.Group();
            const shaft = new THREE.Mesh(
                new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6),
                new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
            );
            shaft.rotation.z = Math.PI / 2;
            group.add(shaft);

            const tip = new THREE.Mesh(
                new THREE.ConeGeometry(0.05, 0.18, 6),
                new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6 })
            );
            tip.position.x = 0.42;
            tip.rotation.z = Math.PI / 2;
            group.add(tip);

            const fletch = new THREE.Mesh(
                new THREE.BoxGeometry(0.14, 0.08, 0.02),
                new THREE.MeshStandardMaterial({ color: 0xf5f5f5 })
            );
            fletch.position.x = -0.35;
            group.add(fletch);

            mesh = group;
            knockback = 6;
            gravity = 0;
        } else {
            const geometry = new THREE.ConeGeometry(0.1, 0.3, 8);
            const material = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
            mesh = new THREE.Mesh(geometry, material);
        }

        mesh.position.copy(startPos);
        mesh.lookAt(startPos.clone().add(direction));

        return {
            mesh,
            direction: direction.clone(),
            velocity: direction.clone().multiplyScalar(this.type === 'laser' ? 50 : (this.type === 'bow' ? 80 : 30)),
            speed: this.type === 'laser' ? 50 : (this.type === 'bow' ? 80 : 30),
            damage: this.damage,
            owner: null,
            knockback,
            gravity,
            lifetime: 5
        };
    }

    animateAttack() {
        if (!this.mesh) return;

        const originalRotation = this.mesh.rotation.z;
        const animate = () => {
            const time = performance.now() / 1000;
            if (this.type === 'knife') {
                this.mesh.rotation.z = originalRotation + Math.sin(time * 20) * 0.5;
            } else if (this.type === 'bow') {
                this.mesh.rotation.z = originalRotation - 0.3;
                setTimeout(() => {
                    this.mesh.rotation.z = originalRotation;
                }, 200);
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
