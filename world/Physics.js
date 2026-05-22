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
        this.dynamicColliders = this.colliders.filter(box => box.dynamic);
        this._nearbyResults = [];
        this._queryStamp = 1;
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
            this.dynamicColliders = this.colliders.filter(box => box.dynamic);
            this.rebuildColliderGrid();
        }
        for (const entity of this.entities) {
            if (!entity.physics) continue;
            if (!entity.position || !Number.isFinite(entity.position.x) || !Number.isFinite(entity.position.y) || !Number.isFinite(entity.position.z)) {
                entity.position?.set?.(0, (entity.physics.height || 1.7) + 0.2, 0);
                entity.physics.velocity?.set?.(0, 0, 0);
                entity.physics.onGround = true;
                continue;
            }
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
                entity.position.x += entity.physics.velocity.x * delta;
                entity.position.y += entity.physics.velocity.y * delta;
                entity.position.z += entity.physics.velocity.z * delta;
            }

            // Проверка коллизии с землей
            const groundHeightRaw = this.mapGenerator.getHeightAt(entity.position.x, entity.position.z);
            const groundHeight = Number.isFinite(groundHeightRaw) ? groundHeightRaw : 0;
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

            const surfaceAfterCollisions = Math.max(
                Number.isFinite(this.mapGenerator.getHeightAt(entity.position.x, entity.position.z))
                    ? this.mapGenerator.getHeightAt(entity.position.x, entity.position.z)
                    : 0,
                this.getColliderSurfaceHeight(entity.position, entity.physics.height)
            );
            if (entity.position.y < surfaceAfterCollisions + entity.physics.height) {
                entity.position.y = surfaceAfterCollisions + entity.physics.height;
                entity.physics.onGround = true;
                entity.physics.velocity.y = Math.max(0, entity.physics.velocity.y);
            }

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
                if (typeof entity.applyBurn === 'function') {
                    entity.applyBurn(1.8, 3.2, null);
                }
            }

            if (this.mapGenerator.isWaterAt?.(entity.position.x, entity.position.z)) {
                if (typeof entity.applySlow === 'function') {
                    entity.applySlow(0.68, 0.2);
                }
            }

            const zoneSlow = this.mapGenerator.getSlowFactorAt?.(entity.position.x, entity.position.z) ?? 1;
            if (zoneSlow < 0.999) {
                if (typeof entity.applySlow === 'function') {
                    entity.applySlow(zoneSlow, 0.2);
                } else if (entity.physics?.velocity) {
                    entity.physics.velocity.x *= zoneSlow;
                    entity.physics.velocity.z *= zoneSlow;
                }
            }

            if (entity.physics.onGround) {
                const groundDamping = Math.exp(-14 * delta);
                entity.physics.velocity.x *= groundDamping;
                entity.physics.velocity.z *= groundDamping;
            } else {
                const airDamping = Math.exp(-2.5 * delta);
                entity.physics.velocity.x *= airDamping;
                entity.physics.velocity.z *= airDamping;
            }
            if (Math.abs(entity.physics.velocity.x) < 0.01) entity.physics.velocity.x = 0;
            if (Math.abs(entity.physics.velocity.z) < 0.01) entity.physics.velocity.z = 0;
        }
    }

resolveCollisions(entity) {
        if (!this.colliders.length) return;
        const type = entity.constructor?.name;
        const bonusRadius = type === 'Zombie' ? 0.1 : type === 'Bot' ? 0.07 : 0;
        const radius = (entity.physics?.radius || 0.5) + bonusRadius;
        const pos = entity.position;
        const height = entity.physics?.height || 1.7;
        const bottom = pos.y - height;

        const nearby = this.getNearbyColliders(pos, radius + 0.5);
        for (let pass = 0; pass < 2; pass++) {
            for (const box of nearby) {
                if (box.enabled === false) continue;
                
                // Handle both old format (position + size) and new format (min/max)
                let min, max;
                if (box.min && box.max) {
                    min = box.min;
                    max = box.max;
                } else {
                    min = new THREE.Vector3(
                        box.position.x - box.size.x / 2,
                        box.position.y - box.size.y / 2,
                        box.position.z - box.size.z / 2
                    );
                    max = new THREE.Vector3(
                        box.position.x + box.size.x / 2,
                        box.position.y + box.size.y / 2,
                        box.position.z + box.size.z / 2
                    );
                }
                
                if (pos.y < min.y + 0.05) continue;
                if (bottom > max.y - 0.05) continue;

                const clampedX = Math.max(min.x, Math.min(max.x, pos.x));
                const clampedZ = Math.max(min.z, Math.min(max.z, pos.z));
                const dx = pos.x - clampedX;
                const dz = pos.z - clampedZ;
                const distSq = dx * dx + dz * dz;

                if (distSq > radius * radius) continue;

                if (distSq === 0) {
                    const left = Math.abs(pos.x - min.x);
                    const right = Math.abs(max.x - pos.x);
                    const back = Math.abs(pos.z - min.z);
                    const front = Math.abs(max.z - pos.z);
                    const minPen = Math.min(left, right, back, front);

                    if (minPen === left) pos.x = min.x - radius;
                    else if (minPen === right) pos.x = max.x + radius;
                    else if (minPen === back) pos.z = min.z - radius;
                    else pos.z = max.z + radius;
                } else {
                    const dist = Math.sqrt(distSq);
                    const push = (radius - dist) + 0.012;
                    const nx = dx / dist;
                    const nz = dz / dist;
                    pos.x += nx * push;
                    pos.z += nz * push;
                    if (entity.physics?.velocity) {
                        const outDot = entity.physics.velocity.x * nx + entity.physics.velocity.z * nz;
                        if (outDot < 0) {
                            entity.physics.velocity.x -= nx * outDot;
                            entity.physics.velocity.z -= nz * outDot;
                        }
                    }
                }
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
            
            // Handle both old format (position + size) and new format (min/max)
            let min, max;
            if (box.min && box.max) {
                min = box.min;
                max = box.max;
            } else {
                min = new THREE.Vector3(
                    box.position.x - box.size.x / 2,
                    box.position.y - box.size.y / 2,
                    box.position.z - box.size.z / 2
                );
                max = new THREE.Vector3(
                    box.position.x + box.size.x / 2,
                    box.position.y + box.size.y / 2,
                    box.position.z + box.size.z / 2
                );
            }
            
            if (position.x + radius < min.x || position.x - radius > max.x) continue;
            if (position.z + radius < min.z || position.z - radius > max.z) continue;
            if (position.y + height < min.y - 0.5) continue;
            if (position.y > max.y + height) continue;
            if (bottom < max.y - 0.2) continue;
            if (max.y > maxY) maxY = max.y;
        }
        return maxY;
    }

rebuildColliderGrid() {
        this.colliderGrid.clear();
        const cellSize = this.colliderGridCellSize;
        for (const box of this.colliders) {
            if (!box) continue; // Skip undefined/null colliders
            // Handle both old format (position + size) and new format (min/max)
            let min, max;
            if (box.min && box.max) {
                min = box.min;
                max = box.max;
            } else if (box.position && box.size) {
                min = new THREE.Vector3(
                    box.position.x - box.size.x / 2,
                    box.position.y - box.size.y / 2,
                    box.position.z - box.size.z / 2
                );
                max = new THREE.Vector3(
                    box.position.x + box.size.x / 2,
                    box.position.y + box.size.y / 2,
                    box.position.z + box.size.z / 2
                );
            } else {
                continue; // Skip colliders missing position/size
            }
            const minX = Math.floor(min.x / cellSize);
            const maxX = Math.floor(max.x / cellSize);
            const minZ = Math.floor(min.z / cellSize);
            const maxZ = Math.floor(max.z / cellSize);
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
        const results = this._nearbyResults;
        results.length = 0;
        const cellSize = this.colliderGridCellSize;
        const minX = Math.floor((position.x - radius) / cellSize);
        const maxX = Math.floor((position.x + radius) / cellSize);
        const minZ = Math.floor((position.z - radius) / cellSize);
        const maxZ = Math.floor((position.z + radius) / cellSize);
        let stamp = this._queryStamp++;
        if (stamp >= 0x3fffffff) {
            this._queryStamp = 1;
            stamp = 1;
        }
        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const key = `${x},${z}`;
                const bucket = this.colliderGrid.get(key);
                if (!bucket) continue;
                for (const box of bucket) {
                    if (box._qStamp === stamp) continue;
                    box._qStamp = stamp;
                    results.push(box);
                }
            }
        }
        if (this.dynamicColliders.length) {
            for (const box of this.dynamicColliders) {
                if (box._qStamp === stamp) continue;
                
                // Handle both old format (position + size) and new format (min/max)
                let min, max;
                if (box.min && box.max) {
                    min = box.min;
                    max = box.max;
                } else {
                    min = new THREE.Vector3(
                        box.position.x - box.size.x / 2,
                        box.position.y - box.size.y / 2,
                        box.position.z - box.size.z / 2
                    );
                    max = new THREE.Vector3(
                        box.position.x + box.size.x / 2,
                        box.position.y + box.size.y / 2,
                        box.position.z + box.size.z / 2
                    );
                }
                
                if (position.x + radius < min.x || position.x - radius > max.x) continue;
                if (position.z + radius < min.z || position.z - radius > max.z) continue;
                box._qStamp = stamp;
                results.push(box);
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



