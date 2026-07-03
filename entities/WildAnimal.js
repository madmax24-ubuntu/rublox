import * as THREE from 'three';

export class WildAnimal {
    constructor(scene, id, spawnPosition) {
        this.scene = scene;
        this.id = `animal-${id}`;
        this.position = spawnPosition.clone();
        this.rotation = new THREE.Euler(0, Math.random() * Math.PI * 2, 0);
        this.physics = {
            velocity: new THREE.Vector3(0, 0, 0),
            onGround: false,
            height: 1.4,
            radius: 0.55,
            speed: 7
        };
        this.isAlive = true;
        this.health = 140;
        this.maxHealth = 140;
        this.attackCooldown = 0;
        this.target = null;
        this.slowTimer = 0;
        this.slowFactor = 1;
        this.mesh = this.createMesh();
        this.scene.add(this.mesh);
    }

    createMesh() {
        const group = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xd9a441,
            roughness: 0.6,
            flatShading: true
        });
        const maneMat = new THREE.MeshStandardMaterial({
            color: 0x8d5a2b,
            roughness: 0.8,
            flatShading: true
        });

        const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 2.0), bodyMat);
        body.position.y = 0.5;
        group.add(body);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), bodyMat);
        head.position.set(0, 0.8, 1.2);
        group.add(head);

        const mane = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.1), maneMat);
        mane.position.set(0, 0.85, 0.7);
        group.add(mane);

        const legGeo = new THREE.BoxGeometry(0.3, 0.6, 0.3);
        const legPositions = [
            [-0.55, 0.2, 0.7],
            [0.55, 0.2, 0.7],
            [-0.55, 0.2, -0.7],
            [0.55, 0.2, -0.7]
        ];
        legPositions.forEach(([x, y, z]) => {
            const leg = new THREE.Mesh(legGeo, bodyMat);
            leg.position.set(x, y, z);
            group.add(leg);
        });

        group.userData.isEntity = true;
        group.userData.isAnimal = true;
        return group;
    }

    update(delta, entityManager) {
        if (!this.isAlive) return;
        if (this.slowTimer > 0) {
            this.slowTimer = Math.max(0, this.slowTimer - delta);
        } else {
            this.slowFactor = 1;
        }
        this.attackCooldown = Math.max(0, this.attackCooldown - delta);

        const target = entityManager.getNearestEnemy(this.position, 18);
        if (target) {
            this.target = target;
            const dist = this.position.distanceTo(target.position);
            if (dist > 1.6) {
                this.moveTowards(target.position, this.physics.speed * this.slowFactor);
            } else if (this.attackCooldown <= 0) {
                target.takeDamage(12, false, this, 4);
                this.attackCooldown = 1.1;
            }
        } else {
            this.physics.velocity.x *= 0.8;
            this.physics.velocity.z *= 0.8;
        }

        this.mesh.position.copy(this.position);
        this.mesh.position.y = this.position.y - (this.physics.height - 0.3);
        this.mesh.rotation.y = this.rotation.y;
    }

    moveTowards(target, speed) {
        const direction = new THREE.Vector3()
            .subVectors(target, this.position)
            .normalize();
        this.physics.velocity.x = direction.x * speed;
        this.physics.velocity.z = direction.z * speed;
        this.rotation.y = Math.atan2(direction.x, direction.z);
    }

    takeDamage(damage) {
        this.health -= damage;
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
            this.mesh.visible = false;
        }
    }

    applySlow(factor, duration) {
        this.slowFactor = Math.min(this.slowFactor, factor);
        this.slowTimer = Math.max(this.slowTimer, duration);
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
