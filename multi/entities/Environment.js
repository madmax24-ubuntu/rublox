import * as THREE from 'three';

export class ExplosiveBarrel {
    constructor(scene, position, options = {}) {
        this.scene = scene;
        this.position = position.clone();
        this.id = options.id ?? `barrel-${Math.floor(Math.random() * 1e9)}`;
        this.health = options.health ?? 26;
        this.maxHealth = this.health;
        this.isAlive = true;
        this.isDetonating = false;
        this.detonationTimer = 0;
        this.explosionRadius = options.explosionRadius ?? 10;
        this.explosionDamage = options.explosionDamage ?? 48;
        this.knockback = options.knockback ?? 9.5;
        this.physics = {
            radius: 0.9,
            height: 1.7,
            velocity: new THREE.Vector3(0, 0, 0),
            onGround: true
        };
        this.mesh = this.createMesh();
        this.scene.add(this.mesh);
    }

    createMesh() {
        const group = new THREE.Group();

        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xb43a2f,
            roughness: 0.76,
            metalness: 0.22,
            flatShading: true
        });
        const ringMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.55,
            metalness: 0.4,
            flatShading: true
        });
        const hazardMat = new THREE.MeshStandardMaterial({
            color: 0xf8d54a,
            emissive: 0xb8860b,
            emissiveIntensity: 0.25,
            roughness: 0.52,
            flatShading: true
        });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 1.35, 10), bodyMat);
        body.position.y = 0.72;
        group.add(body);

        const ringTop = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.06, 8, 18), ringMat);
        ringTop.position.y = 1.34;
        ringTop.rotation.x = Math.PI / 2;
        group.add(ringTop);

        const ringMid = ringTop.clone();
        ringMid.position.y = 0.72;
        group.add(ringMid);

        const ringBottom = ringTop.clone();
        ringBottom.position.y = 0.1;
        group.add(ringBottom);

        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.22, 0.08), hazardMat);
        stripe.position.set(0, 0.74, 0.56);
        group.add(stripe);

        group.position.copy(this.position);
        group.userData.isEntity = true;
        group.userData.isExplosiveBarrel = true;
        group.userData.ignoreDamageTint = true;
        return group;
    }

    takeDamage(amount, _isHeadshot = false, _attacker = null) {
        if (!this.isAlive || this.isDetonating) return false;
        this.health -= Math.max(0, amount || 0);
        if (this.health <= 0) {
            this.health = 0;
            this.isDetonating = true;
            this.detonationTimer = 0.5;
            this.flash();
        } else {
            this.flash(0.55);
        }
        return true;
    }

    flash(intensity = 0.9) {
        this.mesh?.traverse((child) => {
            if (!child.isMesh || !child.material?.emissive) return;
            child.material.emissive.setHex(0xff6d00);
            child.material.emissiveIntensity = intensity;
            setTimeout(() => {
                if (child.material?.emissive) child.material.emissiveIntensity = 0;
            }, 90);
        });
    }

    update(delta, entityManager, mapGenerator, audioSynth) {
        if (!this.isAlive) return;
        if (!this.isDetonating) return;
        this.detonationTimer -= delta;
        if (this.detonationTimer > 0) return;
        this.explode(entityManager, mapGenerator, audioSynth);
    }

    explode(entityManager, mapGenerator, audioSynth) {
        if (!this.isAlive) return;
        this.isAlive = false;

        const center = this.position;
        const targets = entityManager?.getNearbyEntities
            ? entityManager.getNearbyEntities(center, this.explosionRadius)
            : [];

        for (const ent of targets) {
            if (!ent?.isAlive) continue;
            if (ent.constructor?.name !== 'Zombie') continue;
            const dx = ent.position.x - center.x;
            const dz = ent.position.z - center.z;
            const dist = Math.max(0.01, Math.hypot(dx, dz));
            if (dist > this.explosionRadius) continue;
            const t = 1 - dist / this.explosionRadius;
            const damage = this.explosionDamage * (0.45 + t * 0.55);
            ent.takeDamage(damage, false, null, this.knockback * t, 'barrel');
            if (ent.physics?.velocity) {
                ent.physics.velocity.x += (dx / dist) * this.knockback * t;
                ent.physics.velocity.z += (dz / dist) * this.knockback * t;
                ent.physics.velocity.y += 2.4 * t;
            }
        }

        mapGenerator?.addCraterSlowZone?.(center.x, center.z, 4.8 + Math.random() * 2.4, 0.6, 40);
        audioSynth?.playExplosion?.(center);
        this.scene.remove(this.mesh);
    }

    dispose() {
        this.isAlive = false;
        if (this.mesh?.parent) this.mesh.parent.remove(this.mesh);
    }
}

