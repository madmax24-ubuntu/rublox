import * as THREE from 'three';

export class EntityManager {
    constructor(scene) {
        this.scene = scene;
        this.entities = [];
        this.projectiles = [];
        this.effects = [];
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
        this.physicsRef = physics || this.physicsRef;
        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            const prevPos = proj.mesh.position.clone();
            proj.prevPos = prevPos.clone();

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
            if (proj.type === 'flame' && proj.mesh.material) {
                const flicker = 0.85 + Math.random() * 0.3;
                proj.mesh.scale.setScalar(flicker);
                proj.mesh.material.opacity = Math.max(0, proj.lifetime / 0.6);
            }
            if (proj.align === 'arrow') {
                const forward = new THREE.Vector3(1, 0, 0);
                const quat = new THREE.Quaternion().setFromUnitVectors(forward, proj.direction.clone().normalize());
                proj.mesh.quaternion.copy(quat);
            } else {
                proj.mesh.lookAt(proj.mesh.position.clone().add(proj.direction));
            }

            if (physics) {
                const hitWall = this.checkProjectileWallHit(proj, prevPos, physics);
                if (hitWall) {
                    this.spawnImpactEffect(hitWall, proj.type, false);
                    this.removeProjectile(i);
                    continue;
                }
            }

            const hitEntity = this.checkProjectileHit(proj);
            if (hitEntity) {
                hitEntity.takeDamage(proj.damage, false, proj.owner, proj.knockback || 0, proj.type);
                if (proj.owner && typeof proj.owner.onHit === 'function') {
                    proj.owner.onHit({ position: proj.mesh.position.clone(), type: proj.type });
                }
                this.spawnImpactEffect(proj.mesh.position.clone(), proj.type, true);
                this.removeProjectile(i);
                continue;
            }

            proj.lifetime -= delta;
            if (proj.lifetime <= 0) {
                this.removeProjectile(i);
            }
        }

        const aliveEntities = this.entities.filter(e => e.isAlive && e.constructor?.name !== 'Griever');
        this.updateEffects(delta);
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
                return pos.clone();
            }
        }
        return false;
    }

    hasLineOfSight(from, to, ignoreWalkable = true) {
        const physics = this.physicsRef;
        if (!physics?.getNearbyColliders) return true;
        const p0 = from.clone();
        const p1 = to.clone();
        const travel = p1.clone().sub(p0);
        const length = travel.length();
        if (length <= 0.001) return true;
        const probe = p0.clone().add(travel.multiplyScalar(0.5));
        const nearby = physics.getNearbyColliders(probe, Math.max(2.5, length * 0.5 + 1.0));
        for (const box of nearby) {
            if (box.enabled === false) continue;
            if (ignoreWalkable && box.walkable) continue;
            if (this.segmentIntersectsBox(p0, p1, box)) {
                return false;
            }
        }
        return true;
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
        const p0 = projectile.prevPos || projectile.mesh.position;
        const p1 = projectile.mesh.position;
        for (const entity of this.entities) {
            if (!entity.isAlive || entity === projectile.owner) continue;

            const basePos = entity.position;
            const h = entity.physics?.height || 1.8;
            const r = entity.physics?.radius || 0.45;
            const bodyBonus = entity.constructor?.name === 'Bot' ? 0.75 : entity.constructor?.name === 'Zombie' ? 0.65 : 0.45;
            const hitRadius = r + bodyBonus;

            const points = [
                new THREE.Vector3(basePos.x, basePos.y + h * 0.2, basePos.z),
                new THREE.Vector3(basePos.x, basePos.y + h * 0.55, basePos.z),
                new THREE.Vector3(basePos.x, basePos.y + h * 0.9, basePos.z)
            ];
            const hit = points.some(pt => this.distancePointToSegment(pt, p0, p1) <= hitRadius);
            if (hit) {
                return entity;
            }
        }
        return null;
    }

    distancePointToSegment(point, a, b) {
        const ab = new THREE.Vector3().subVectors(b, a);
        const ap = new THREE.Vector3().subVectors(point, a);
        const abLenSq = ab.lengthSq();
        if (abLenSq < 1e-6) return point.distanceTo(a);
        const t = Math.max(0, Math.min(1, ap.dot(ab) / abLenSq));
        const closest = a.clone().add(ab.multiplyScalar(t));
        return point.distanceTo(closest);
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

    spawnImpactEffect(position, type = 'generic', isHit = false) {
        const group = new THREE.Group();
        const color = type === 'laser'
            ? 0xfff176
            : type === 'flame'
                ? 0xff8a65
                : type === 'bow'
                    ? 0xbca27f
                    : 0xcfd8dc;
        const mat = new THREE.MeshStandardMaterial({
            color,
            emissive: isHit ? color : 0x000000,
            emissiveIntensity: isHit ? 0.6 : 0.0,
            roughness: 0.5,
            transparent: true,
            opacity: 0.9
        });
        const geo = new THREE.SphereGeometry(type === 'laser' ? 0.18 : 0.12, 8, 8);
        const puff = new THREE.Mesh(geo, mat);
        group.add(puff);
        group.position.copy(position);
        group.userData.effect = true;
        group.userData.life = type === 'flame' ? 0.3 : 0.45;
        this.scene.add(group);
        this.effects.push(group);
    }

    spawnSpeedTrail(position, color = 0x4bb3ff) {
        const geo = new THREE.PlaneGeometry(0.6, 0.25);
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(position);
        mesh.position.y += 0.05;
        mesh.userData.effect = true;
        mesh.userData.type = 'trail';
        mesh.userData.life = 0.35;
        this.scene.add(mesh);
        this.effects.push(mesh);
    }

    updateEffects(delta) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const fx = this.effects[i];
            fx.userData.life -= delta;
            if (fx.userData.type === 'trail') {
                fx.scale.addScalar(delta * 0.8);
                if (fx.material) {
                    fx.material.opacity = Math.max(0, fx.userData.life * 2);
                }
            } else {
                fx.scale.addScalar(delta * 1.8);
                fx.traverse(child => {
                    if (child.material) {
                        child.material.opacity = Math.max(0, fx.userData.life * 2);
                    }
                });
            }
            if (fx.userData.life <= 0) {
                this.scene.remove(fx);
                this.effects.splice(i, 1);
            }
        }
    }

    getNearestEnemy(position, maxDistance = Infinity) {
        let nearest = null;
        let minDistance = maxDistance;

        for (const entity of this.entities) {
            if (!entity.isAlive) continue;

            const distance = position.distanceTo(entity.position);
            const radius = entity.physics?.radius || 0.4;
            const effective = Math.max(0, distance - radius * 0.6);
            if (effective < minDistance && distance > 0.1) {
                minDistance = effective;
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
