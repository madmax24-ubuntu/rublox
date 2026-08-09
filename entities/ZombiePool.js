import * as THREE from 'three';
import { Zombie } from './Zombie.js';

export class ZombiePool {
    constructor(scene, physics, entityManager) {
        this.scene = scene;
        this.physics = physics;
        this.entityManager = entityManager;
        this.pool = [];
        this.nextId = 1;
        this.variantCursor = 0;
        this.variantSequence = ['normal', 'runner', 'crawler', 'toxic', 'normal', 'runner', 'heavy', 'crawler', 'toxic', 'normal', 'stalker'];
    }

    async prewarm(count = 20) {
        const origin = new THREE.Vector3(0, -100, 0);
        const warmed = [];
        for (let i = 0; i < count; i++) {
            const variant = this.variantSequence[i % this.variantSequence.length];
            const zombie = this.acquire(origin, variant);
            warmed.push(zombie);
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        for (const zombie of warmed) this.release(zombie, true);
    }

    acquire(spawnPosition, forcedVariant = null) {
        forcedVariant ||= this.variantSequence[this.variantCursor++ % this.variantSequence.length];
        let zombie;
        const poolIndex = forcedVariant
            ? this.pool.findIndex(candidate => candidate.variant === forcedVariant)
            : this.pool.length - 1;
        if (poolIndex >= 0) {
            zombie = this.pool.splice(poolIndex, 1)[0];
            // FULL STATE RESET — prevent stale references from previous use
            zombie.isAlive = true;
            zombie.health = zombie.maxHealth;
            zombie.position.copy(spawnPosition);
            zombie.rotation.set(0, 0, 0);
            zombie.physics.velocity.set(0, 0, 0);
            zombie.mesh.visible = true;
            if (!zombie.mesh.parent) this.scene.add(zombie.mesh);
            zombie.mesh.position.copy(spawnPosition);
            zombie.mesh.rotation.set(0, 0, 0);
            zombie.mesh.scale.copy(zombie.mesh.userData._origScale || new THREE.Vector3(1, 1, 1));
            // Entity references — MUST be null to prevent chasing ghosts
            zombie.target = null;
            zombie.alertTarget = null;
            zombie.alertPosition = null;
            zombie.patrolTarget = null;
            zombie._elevatedRoute = null;
            zombie._nextElevatedRouteAt = 0;
            zombie.burnAttacker = null;
            // Timers
            zombie.alertTimer = 0;
            zombie.burnTimer = 0;
            zombie.burnTickTimer = 0;
            zombie.burnDamagePerSecond = 0;
            zombie.hitStaggerTimer = 0;
            zombie.attackCooldown = 0;
            zombie.abilityCooldown = 1.2 + Math.random() * 2.4;
            zombie.abilityAnimationTimer = 0;
            zombie.clearAcidProjectile?.();
            zombie.soundTimer = 2 + Math.random() * 3;
            zombie._corpseTimer = 0;
            zombie._corpseExpiresAt = 0;
            zombie._pooled = false;
            zombie._animTime = performance.now() * 0.001;
            zombie._roamAngle = Math.random() * Math.PI * 2;
            zombie._roamTimer = 3 + Math.random() * 5;
        } else {
            zombie = new Zombie(this.scene, this.nextId++, spawnPosition, forcedVariant);
            zombie.mesh.userData._origScale = zombie.mesh.scale.clone();
            zombie._pooled = false;
        }
        this.physics.addEntity(zombie);
        this.entityManager.addEntity(zombie);
        return zombie;
    }

    release(zombie, force = false) {
        if (!zombie || zombie._pooled || (zombie.isAlive && !force)) return;

        zombie.isAlive = false;
        zombie._pooled = true;
        zombie.clearAcidProjectile?.();
        zombie.mesh.visible = false;

        // Remove from scene graph
        if (zombie.mesh.parent) {
            zombie.mesh.parent.remove(zombie.mesh);
        }

        // Remove from physics world
        this.physics.removeEntity?.(zombie);

        // Remove from entityManager.entities without calling dispose()
        // (we're pooling, not destroying — dispose() would free shared materials)
        const entities = this.entityManager.entities;
        const idx = entities?.indexOf(zombie);
        if (idx >= 0) {
            entities.splice(idx, 1);
        }

        // Move off-map to prevent any stray references from causing issues
        zombie.position.set(0, -100, 0);
        zombie.physics.velocity.set(0, 0, 0);

        this.pool.push(zombie);
    }
}
