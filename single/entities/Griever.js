import * as THREE from 'three';

export class Griever {
    constructor(scene, id, spawnPosition) {
        this.scene = scene;
        this.id = id;
        this.position = spawnPosition.clone();
        this.rotation = new THREE.Euler(0, 0, 0);
        this.physics = {
            velocity: new THREE.Vector3(0, 0, 0),
            onGround: false,
            height: 2.6,
            radius: 0.9,
            speed: 3.4
        };

        this.health = 90;
        this.maxHealth = 90;
        this.isAlive = true;
        this.attackCooldown = 0;
        this.patrolTarget = null;
        this.soundMoveTimer = 0;
        this.soundRoarTimer = 2 + Math.random() * 3;

        this.mesh = this.createMesh();
        this.scene.add(this.mesh);
    }

    createMesh() {
        const group = new THREE.Group();
        const slimeMat = new THREE.MeshStandardMaterial({
            color: 0x1c1c1c,
            roughness: 0.2,
            metalness: 0.4,
            flatShading: true
        });
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x616161,
            roughness: 0.4,
            metalness: 0.8,
            flatShading: true
        });
        const glowMat = new THREE.MeshStandardMaterial({
            color: 0xff3d3d,
            emissive: 0xff3d3d,
            emissiveIntensity: 0.7,
            flatShading: true
        });

        const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.9, 2.2, 4, 8),
            slimeMat
        );
        body.rotation.z = Math.PI / 2;
        body.position.y = 1.6;
        group.add(body);

        const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(1.1, 8, 8),
            slimeMat
        );
        bulb.position.set(0.9, 1.7, 0);
        group.add(bulb);

        const pistonGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6);
        for (let i = 0; i < 4; i++) {
            const piston = new THREE.Mesh(pistonGeo, metalMat);
            piston.position.set(-0.4 + i * 0.3, 1.2, 0.6);
            piston.rotation.x = Math.PI / 2;
            group.add(piston);
        }

        for (let i = 0; i < 3; i++) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), glowMat);
            eye.position.set(0.6 + i * 0.25, 1.8, 0.85);
            group.add(eye);
        }

        const legs = [];
        const legSegments = [
            new THREE.BoxGeometry(0.18, 0.6, 0.18),
            new THREE.BoxGeometry(0.16, 0.6, 0.16)
        ];
        for (let i = 0; i < 6; i++) {
            const side = i < 3 ? -1 : 1;
            const idx = i % 3;
            const hip = new THREE.Mesh(legSegments[0], metalMat);
            hip.position.set(0.1 + idx * 0.4, 1.1, side * 0.9);
            hip.rotation.z = side * 0.5;
            group.add(hip);

            const shin = new THREE.Mesh(legSegments[1], metalMat);
            shin.position.set(0.1 + idx * 0.4, 0.6, side * 1.25);
            shin.rotation.z = side * 0.2;
            group.add(shin);

            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 6), metalMat);
            spike.position.set(0.1 + idx * 0.4, 0.2, side * 1.45);
            spike.rotation.x = side > 0 ? Math.PI : 0;
            group.add(spike);
            legs.push({ hip, shin });
        }

        const claw = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.25, 0.6),
            metalMat
        );
        claw.position.set(-1.2, 1.2, 0.6);
        group.add(claw);

        const saw = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.4, 0.12, 10),
            metalMat
        );
        saw.position.set(-1.2, 1.2, -0.6);
        saw.rotation.x = Math.PI / 2;
        group.add(saw);

        group.userData.isEntity = true;
        group.userData.isGriever = true;
        group.userData.legs = legs;
        return group;
    }

    update(delta, entityManager, audioSynth) {
        if (!this.isAlive) {
            this.mesh.position.copy(this.position);
            return;
        }

        this.attackCooldown = Math.max(0, this.attackCooldown - delta);
        this.soundMoveTimer = Math.max(0, this.soundMoveTimer - delta);
        this.soundRoarTimer = Math.max(0, this.soundRoarTimer - delta);
        const target = this.findNearestTarget(entityManager, 60);
        if (target) {
            const dist = this.position.distanceTo(target.position);
            if (dist < 2.8 && this.attackCooldown <= 0) {
                target.takeDamage(14, false, this, 5);
                this.attackCooldown = 1.2;
                audioSynth?.playGrieverAttack?.(this.position);
            } else {
                this.moveTowards(target.position, this.physics.speed);
            }
            if (audioSynth && this.soundMoveTimer <= 0) {
                audioSynth.playGrieverMove(this.position);
                this.soundMoveTimer = 0.35;
            }
        } else {
            if (!this.patrolTarget || this.position.distanceTo(this.patrolTarget) < 5) {
                this.setRandomPatrolTarget();
            }
            if (this.patrolTarget) {
                this.moveTowards(this.patrolTarget, this.physics.speed * 0.7);
            }
            if (audioSynth && this.soundMoveTimer <= 0) {
                audioSynth.playGrieverMove(this.position);
                this.soundMoveTimer = 0.6;
            }
        }
        if (audioSynth && this.soundRoarTimer <= 0) {
            audioSynth.playGrieverRoar(this.position);
            this.soundRoarTimer = 6 + Math.random() * 6;
        }

        this.mesh.position.copy(this.position);
        this.mesh.position.y = this.position.y - (this.physics.height - 0.2);
        this.mesh.rotation.y = this.rotation.y;
        this.animateLegs();
    }

    findNearestTarget(entityManager, maxDistance) {
        let nearest = null;
        let best = maxDistance;
        for (const entity of entityManager.getEntities()) {
            if (!entity.isAlive || entity === this) continue;
            if (entity.constructor?.name === 'Griever') continue;
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
        const distance = 18 + Math.random() * 36;
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

    animateLegs() {
        const legs = this.mesh?.userData?.legs;
        if (!legs) return;
        const speed = Math.sqrt(
            this.physics.velocity.x * this.physics.velocity.x +
            this.physics.velocity.z * this.physics.velocity.z
        );
        const speedNorm = Math.min(1, speed / this.physics.speed);
        const time = performance.now() / 1000;
        legs.forEach((leg, idx) => {
            const swing = Math.sin(time * 6 + idx) * 0.4 * speedNorm;
            leg.hip.rotation.x = swing;
            leg.shin.rotation.x = -swing * 0.6;
        });
    }

    takeDamage(damage, isHeadshot = false, attacker = null, knockbackStrength = 0) {
        const finalDamage = isHeadshot ? damage * 2 : damage;
        this.health -= finalDamage;
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
            this.physics.velocity.set(0, 0, 0);
            this.mesh.position.copy(this.position);
            this.mesh.position.y = this.position.y - (this.physics.height - 0.2) - 0.6;
            this.mesh.rotation.set(-Math.PI / 6, this.rotation.y, 0);
        }

        if (attacker && this.isAlive) {
            const strength = knockbackStrength > 0 ? knockbackStrength : 3.5;
            const dir = new THREE.Vector3().subVectors(this.position, attacker.position).normalize();
            this.physics.velocity.x += dir.x * strength;
            this.physics.velocity.z += dir.z * strength;
            this.physics.velocity.y += 1.5;
        }
        return true;
    }
}
