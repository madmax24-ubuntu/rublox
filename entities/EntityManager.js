import * as THREE from 'three';

export class EntityManager {
    constructor(scene) {
        this.scene = scene;
        this.entities = [];
        this.projectiles = [];
    }

    addEntity(entity) {
        this.entities.push(entity);
    }

    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index > -1) {
            this.entities.splice(index, 1);
            entity.dispose();
        }
    }

    addProjectile(projectile) {
        this.projectiles.push(projectile);
        this.scene.add(projectile.mesh);
    }

    update(delta, physics, audioSynth) {
        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            const prevPos = proj.mesh.position.clone();

            if (proj.velocity) {
                if (proj.gravity) {
                    proj.velocity.y -= proj.gravity * delta;
                }
                proj.mesh.position.add(proj.velocity.clone().multiplyScalar(delta));
                proj.direction.copy(proj.velocity).normalize();
            } else {
                const moveVector = proj.direction.clone().multiplyScalar(proj.speed * delta);
                proj.mesh.position.add(moveVector);
            }
            proj.mesh.lookAt(proj.mesh.position.clone().add(proj.direction));

            const hitEntity = this.checkProjectileHit(proj);
            if (hitEntity) {
                hitEntity.takeDamage(proj.damage, false, proj.owner, proj.knockback || 0);
                this.removeProjectile(i);
                continue;
            }

            if (physics) {
                const hitWall = this.checkProjectileWallHit(proj, prevPos, physics);
                if (hitWall) {
                    this.removeProjectile(i);
                    continue;
                }
            }

            proj.lifetime -= delta;
            if (proj.lifetime <= 0) {
                this.removeProjectile(i);
            }
        }

        const aliveEntities = this.entities.filter(e => e.isAlive && e.constructor?.name !== 'Griever');
        return aliveEntities.length;
    }

    checkProjectileWallHit(projectile, prevPos, physics) {
        if (!physics.getNearbyColliders) return false;
        const pos = projectile.mesh.position;
        const travel = pos.clone().sub(prevPos);
        const length = travel.length();
        if (length <= 0.001) return false;
        const dir = travel.clone().normalize();
        const probe = prevPos.clone().add(dir.clone().multiplyScalar(length * 0.5));
        const nearby = physics.getNearbyColliders(probe, 2.5);
        for (const box of nearby) {
            if (box.enabled === false) continue;
            if (this.segmentIntersectsBox(prevPos, pos, box)) {
                return true;
            }
        }
        return false;
    }

    segmentIntersectsBox(p0, p1, box) {
        let tmin = 0;
        let tmax = 1;
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const dz = p1.z - p0.z;

        const checkAxis = (start, delta, min, max) => {
            if (Math.abs(delta) < 1e-6) {
                return start >= min && start <= max;
            }
            const inv = 1 / delta;
            let t1 = (min - start) * inv;
            let t2 = (max - start) * inv;
            if (t1 > t2) [t1, t2] = [t2, t1];
            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);
            return tmin <= tmax;
        };

        if (!checkAxis(p0.x, dx, box.min.x, box.max.x)) return false;
        if (!checkAxis(p0.y, dy, box.min.y, box.max.y)) return false;
        if (!checkAxis(p0.z, dz, box.min.z, box.max.z)) return false;
        return true;
    }

    checkProjectileHit(projectile) {
        for (const entity of this.entities) {
            if (!entity.isAlive || entity === projectile.owner) continue;

            const distance = projectile.mesh.position.distanceTo(entity.position);
            const hitRadius = (entity.physics?.radius || 0.5) + 0.3;
            if (distance < hitRadius) {
                return entity;
            }
        }
        return null;
    }

    removeProjectile(index) {
        const proj = this.projectiles[index];
        this.scene.remove(proj.mesh);
        proj.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        this.projectiles.splice(index, 1);
    }

    getNearestEnemy(position, maxDistance = Infinity) {
        let nearest = null;
        let minDistance = maxDistance;

        for (const entity of this.entities) {
            if (!entity.isAlive) continue;

            const distance = position.distanceTo(entity.position);
            if (distance < minDistance && distance > 0.1) {
                minDistance = distance;
                nearest = entity;
            }
        }

        return nearest;
    }

    getAliveCount() {
        return this.entities.filter(e => e.isAlive).length;
    }

    getEntityById(id) {
        return this.entities.find(e => e.id === id);
    }

    getEntities() {
        return this.entities;
    }

    getAllEntities() {
        return this.entities;
    }
}
