import * as THREE from 'three';

export class Zombie {
    constructor(scene, id, spawnPosition) {
        this.scene = scene;
        this.id = id;
        this.position = spawnPosition.clone();
        this.rotation = new THREE.Euler(0, 0, 0);
        this.physics = {
            velocity: new THREE.Vector3(0, 0, 0),
            onGround: false,
            height: 1.9,
            radius: 0.45,
            speed: 4.2
        };

        this.health = 120;
        this.maxHealth = 120;
        this.isAlive = true;
        this.attackCooldown = 0;
        this.patrolTarget = null;
        this.soundTimer = 1 + Math.random() * 2;

        this.mesh = this.createMesh();
        this.mesh.scale.setScalar(1.35);
        this.scene.add(this.mesh);
    }

    createMesh() {
        const group = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x4caf50,
            roughness: 0.8,
            flatShading: true
        });
        const headMat = new THREE.MeshStandardMaterial({
            color: 0x7cb342,
            roughness: 0.8,
            flatShading: true
        });
        const grimeMat = new THREE.MeshStandardMaterial({
            color: 0x2e3b2e,
            roughness: 0.95,
            flatShading: true
        });
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 1.1, 0.6),
            bodyMat
        );
        body.position.y = 0.9;
        group.add(body);

        const rib = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.4, 0.08),
            grimeMat
        );
        rib.position.set(0, 0.95, 0.34);
        group.add(rib);

        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.7, 0.7),
            headMat
        );
        head.position.y = 1.7;
        group.add(head);

        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xfff176, emissive: 0xfff176, emissiveIntensity: 0.5 });
        const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
        const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
        leftEye.position.set(-0.14, 1.75, 0.35);
        rightEye.position.set(0.14, 1.75, 0.35);
        group.add(leftEye);
        group.add(rightEye);

        const jaw = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.12, 0.06),
            grimeMat
        );
        jaw.position.set(0, 1.58, 0.34);
        group.add(jaw);

        const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
        const leftArm = new THREE.Mesh(armGeo, bodyMat);
        const rightArm = new THREE.Mesh(armGeo, bodyMat);
        leftArm.position.set(-0.52, 1.0, 0.12);
        rightArm.position.set(0.52, 1.0, 0.12);
        leftArm.rotation.x = -0.6;
        rightArm.rotation.x = -0.6;
        group.add(leftArm);
        group.add(rightArm);

        const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
        const leftLeg = new THREE.Mesh(legGeo, bodyMat);
        const rightLeg = new THREE.Mesh(legGeo, bodyMat);
        leftLeg.position.set(-0.2, 0.25, 0);
        rightLeg.position.set(0.2, 0.25, 0);
        group.add(leftLeg);
        group.add(rightLeg);

        group.userData.isEntity = true;
        group.userData.isZombie = true;
        group.userData.limbs = { leftArm, rightArm, leftLeg, rightLeg };
        return group;
    }

    update(delta, entityManager, audioSynth) {
        if (!this.isAlive) {
            this.mesh.position.copy(this.position);
            return;
        }

        this.attackCooldown = Math.max(0, this.attackCooldown - delta);
        this.soundTimer -= delta;

        const target = this.findNearestTarget(entityManager, 50);
        if (target) {
            const dist = this.position.distanceTo(target.position);
            if (dist < 2.1 && this.attackCooldown <= 0) {
                target.takeDamage(8, false, this, 3);
                this.attackCooldown = 1.0;
            } else {
                this.moveTowards(target.position, this.physics.speed);
            }

            if (audioSynth && this.soundTimer <= 0) {
                audioSynth.playZombieMoan?.(this.position);
                this.soundTimer = 3 + Math.random() * 3;
            }
        } else {
            if (!this.patrolTarget || this.position.distanceTo(this.patrolTarget) < 4) {
                this.setRandomPatrolTarget();
            }
            if (this.patrolTarget) {
                this.moveTowards(this.patrolTarget, this.physics.speed * 0.7);
            }

            if (audioSynth && this.soundTimer <= 0) {
                audioSynth.playZombieMoan?.(this.position);
                this.soundTimer = 4 + Math.random() * 4;
            }
        }

        this.mesh.position.copy(this.position);
        this.mesh.position.y = this.position.y - (this.physics.height - 0.2);
        this.mesh.rotation.y = this.rotation.y;
        this.animateLimbs();
    }

    findNearestTarget(entityManager, maxDistance) {
        let nearest = null;
        let best = maxDistance;
        for (const entity of entityManager.getEntities()) {
            if (!entity.isAlive || entity === this) continue;
            if (entity.constructor?.name === 'Zombie') continue;
            const dist = this.position.distanceTo(entity.position);
            if (dist < best) {
                best = dist;
                nearest = entity;
            }
        }
        return nearest;
    }

    setRandomPatrolTarget() {
        const angle = Math.random() * Math.PI * 2;
        const distance = 12 + Math.random() * 30;
        this.patrolTarget = new THREE.Vector3(
            this.position.x + Math.cos(angle) * distance,
            0,
            this.position.z + Math.sin(angle) * distance
        );
    }

    moveTowards(target, speed) {
        const direction = new THREE.Vector3()
            .subVectors(target, this.position)
            .normalize();
        this.physics.velocity.x = direction.x * speed;
        this.physics.velocity.z = direction.z * speed;
        this.rotation.y = Math.atan2(direction.x, direction.z);
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
        const swing = Math.sin(time * 8) * 0.6 * speedNorm;
        limbs.leftLeg.rotation.x = -swing;
        limbs.rightLeg.rotation.x = swing;
    }

    takeDamage(damage, isHeadshot = false, attacker = null, knockbackStrength = 0) {
        const finalDamage = isHeadshot ? damage * 2 : damage;
        this.health -= finalDamage;
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
            this.physics.velocity.set(0, 0, 0);
            this.mesh.position.copy(this.position);
            this.mesh.position.y = this.position.y - (this.physics.height - 0.2) - 0.8;
            this.mesh.rotation.set(-Math.PI / 2, this.rotation.y, 0);
        }

        if (attacker && this.isAlive) {
            const strength = knockbackStrength > 0 ? knockbackStrength : 2.5;
            const dir = new THREE.Vector3().subVectors(this.position, attacker.position).normalize();
            this.physics.velocity.x += dir.x * strength;
            this.physics.velocity.z += dir.z * strength;
            this.physics.velocity.y += 1.5;
        }
        return true;
    }
}
