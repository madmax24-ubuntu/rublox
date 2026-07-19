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
        this.variantSequence = ['normal', 'runner', 'crawler', 'toxic', 'normal', 'runner', 'heavy', 'crawler', 'toxic', 'normal'];
    }

    acquire(spawnPosition, forcedVariant = null) {
        forcedVariant ||= this.variantSequence[this.variantCursor++ % this.variantSequence.length];
        let zombie;
        const poolIndex = forcedVariant
            ? this.pool.findIndex(candidate => candidate.variant === forcedVariant)
            : this.pool.length - 1;
        if (poolIndex >= 0) {
            zombie = this.pool.splice(poolIndex, 1)[0];
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
            zombie.patrolTarget = null;
            zombie.alertTimer = 0;
            zombie.alertTarget = null;
            zombie.alertPosition = null;
            zombie.burnTimer = 0;
            zombie.hitStaggerTimer = 0;
            zombie._animTime = performance.now() * 0.001;
            zombie._roamAngle = Math.random() * Math.PI * 2;
            zombie._roamTimer = 3 + Math.random() * 5;
            zombie.attackCooldown = 0;
            zombie.soundTimer = 2 + Math.random() * 3;
            zombie.target = null;
            zombie._corpseTimer = 0;
            zombie.burnTickTimer = 0;
            zombie.burnDamagePerSecond = 0;
            zombie.burnAttacker = null;
        } else {
            zombie = new Zombie(this.scene, this.nextId++, spawnPosition, forcedVariant);
            zombie.mesh.userData._origScale = zombie.mesh.scale.clone();
        }
        this.physics.addEntity(zombie);
        this.entityManager.addEntity(zombie);
        return zombie;
    }

    release(zombie, force = false) {
        if (!zombie || (zombie.isAlive && !force)) return;
        zombie.isAlive = false;
        zombie.mesh.visible = false;
        if (zombie.mesh.parent) zombie.mesh.parent.remove(zombie.mesh);
        this.physics.removeEntity?.(zombie);
        const idx = this.entityManager.entities?.indexOf(zombie);
        if (idx >= 0) this.entityManager.entities.splice(idx, 1);
        this.pool.push(zombie);
    }
}
