import * as THREE from 'three';

export class Physics {
    constructor(scene, mapGenerator) {
        this.scene = scene;
        this.mapGenerator = mapGenerator;
        this.gravity = -28;
        this.entities = [];
        this.lavaDamagePerSecond = 10;
        this.colliders = mapGenerator.getColliders?.() || [];
        this.colliderGrid = new Map();
        this.colliderGridCellSize = 16;
        this.colliderGridCount = this.colliders.length;
        if (this.colliders.length) {
            this.rebuildColliderGrid();
        }
    }

    addEntity(entity) {
        this.entities.push(entity);
    }

    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index > -1) {
            this.entities.splice(index, 1);
        }
    }

    update(delta) {
        this.colliders = this.mapGenerator.getColliders?.() || this.colliders;
        if (this.colliders.length !== this.colliderGridCount) {
            this.colliderGridCount = this.colliders.length;
            this.rebuildColliderGrid();
        }
        for (const entity of this.entities) {
            if (!entity.physics) continue;
            const isFrozen = entity.isFrozen === true;
            if (entity.physics.wasOnGround === undefined) {
                entity.physics.wasOnGround = entity.physics.onGround;
                entity.physics.fallStartY = entity.position.y;
            }

            // Применяем гравитацию
            if (isFrozen) {
                entity.physics.velocity.set(0, 0, 0);
            } else {
                if (entity.physics.onGround) {
                    entity.physics.velocity.y = 0;
                } else {
                    entity.physics.velocity.y += this.gravity * delta;
                }
            }

            // Обновляем позицию
            if (!isFrozen) {
                entity.position.add(entity.physics.velocity.clone().multiplyScalar(delta));
            }

            // Проверка коллизии с землей
            const groundHeight = this.mapGenerator.getHeightAt(entity.position.x, entity.position.z);
            const surfaceHeight = Math.max(
                groundHeight,
                this.getColliderSurfaceHeight(entity.position, entity.physics.height)
            );
            
            if (entity.position.y <= surfaceHeight + entity.physics.height) {
                entity.position.y = surfaceHeight + entity.physics.height;
                entity.physics.onGround = true;
                entity.physics.velocity.y = 0;
            } else {
                entity.physics.onGround = false;
            }

            this.resolveCollisions(entity);

            if (!entity.physics.wasOnGround && entity.physics.onGround) {
                const fallDistance = entity.physics.fallStartY - entity.position.y;
                if (fallDistance > 6 && typeof entity.takeDamage === 'function') {
                    const damage = Math.max(0, (fallDistance - 6) * 6);
                    if (damage > 0) entity.takeDamage(damage);
                }
                entity.physics.fallStartY = entity.position.y;
            }
            if (entity.physics.wasOnGround && !entity.physics.onGround) {
                entity.physics.fallStartY = entity.position.y;
            }
            entity.physics.wasOnGround = entity.physics.onGround;

            if (this.mapGenerator.isLavaAt?.(entity.position.x, entity.position.z, entity.position.y)) {
                if (typeof entity.takeDamage === 'function') {
                    entity.takeDamage(this.lavaDamagePerSecond * delta);
                }
            }

            // Трение
            if (entity.physics.onGround) {
                entity.physics.velocity.x *= 0.8;
                entity.physics.velocity.z *= 0.8;
            }
        }
    }

    resolveCollisions(entity) {
        if (!this.colliders.length) return;
        const radius = entity.physics?.radius || 0.5;
        const pos = entity.position;
        const height = entity.physics?.height || 1.7;
        const bottom = pos.y - height;

        const nearby = this.getNearbyColliders(pos, radius + 0.5);
        for (const box of nearby) {
            if (box.enabled === false) continue;
            if (pos.y < box.min.y + 0.05) continue;
            if (bottom > box.max.y - 0.05) continue;

            const clampedX = Math.max(box.min.x, Math.min(box.max.x, pos.x));
            const clampedZ = Math.max(box.min.z, Math.min(box.max.z, pos.z));
            const dx = pos.x - clampedX;
            const dz = pos.z - clampedZ;
            const distSq = dx * dx + dz * dz;

            if (distSq > radius * radius) continue;

            if (distSq === 0) {
                const left = Math.abs(pos.x - box.min.x);
                const right = Math.abs(box.max.x - pos.x);
                const back = Math.abs(pos.z - box.min.z);
                const front = Math.abs(box.max.z - pos.z);
                const minPen = Math.min(left, right, back, front);

                if (minPen === left) pos.x = box.min.x - radius;
                else if (minPen === right) pos.x = box.max.x + radius;
                else if (minPen === back) pos.z = box.min.z - radius;
                else pos.z = box.max.z + radius;
            } else {
                const dist = Math.sqrt(distSq);
                const push = (radius - dist) + 0.01;
                pos.x += (dx / dist) * push;
                pos.z += (dz / dist) * push;
            }
        }
    }

    getColliderSurfaceHeight(position, height) {
        if (!this.colliders.length) return -Infinity;
        let maxY = -Infinity;
        const radius = 0.6;
        const bottom = position.y - height;
        const nearby = this.getNearbyColliders(position, radius + 0.5);
        for (const box of nearby) {
            if (box.enabled === false) continue;
            if (!box.walkable) continue;
            if (position.x + radius < box.min.x || position.x - radius > box.max.x) continue;
            if (position.z + radius < box.min.z || position.z - radius > box.max.z) continue;
            if (position.y + height < box.min.y - 0.5) continue;
            if (position.y > box.max.y + height) continue;
            if (bottom < box.max.y - 0.2) continue;
            if (box.max.y > maxY) maxY = box.max.y;
        }
        return maxY;
    }

    rebuildColliderGrid() {
        this.colliderGrid.clear();
        const cellSize = this.colliderGridCellSize;
        for (const box of this.colliders) {
            const minX = Math.floor(box.min.x / cellSize);
            const maxX = Math.floor(box.max.x / cellSize);
            const minZ = Math.floor(box.min.z / cellSize);
            const maxZ = Math.floor(box.max.z / cellSize);
            for (let x = minX; x <= maxX; x++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const key = `${x},${z}`;
                    if (!this.colliderGrid.has(key)) {
                        this.colliderGrid.set(key, []);
                    }
                    this.colliderGrid.get(key).push(box);
                }
            }
        }
    }

    getNearbyColliders(position, radius) {
        if (!this.colliderGrid.size) return this.colliders;
        const cellSize = this.colliderGridCellSize;
        const minX = Math.floor((position.x - radius) / cellSize);
        const maxX = Math.floor((position.x + radius) / cellSize);
        const minZ = Math.floor((position.z - radius) / cellSize);
        const maxZ = Math.floor((position.z + radius) / cellSize);
        const results = [];
        const seen = new Set();
        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const key = `${x},${z}`;
                const bucket = this.colliderGrid.get(key);
                if (!bucket) continue;
                for (const box of bucket) {
                    if (seen.has(box)) continue;
                    seen.add(box);
                    results.push(box);
                }
            }
        }
        return results;
    }

    // Проверка коллизии между двумя объектами
    checkCollision(entity1, entity2) {
        const distance = entity1.position.distanceTo(entity2.position);
        const minDistance = (entity1.physics?.radius || 0.5) + (entity2.physics?.radius || 0.5);
        return distance < minDistance;
    }

    // Raycast для проверки попаданий
    raycast(origin, direction, maxDistance = 1000) {
        const raycaster = new THREE.Raycaster(origin, direction.normalize(), 0, maxDistance);
        const objects = this.scene.children.filter(obj => 
            obj !== this.mapGenerator.groundMesh && 
            obj.userData.isEntity !== false
        );
        
        const intersects = raycaster.intersectObjects(objects, true);
        return intersects.length > 0 ? intersects[0] : null;
    }
}



