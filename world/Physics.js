import * as THREE from "../node_modules/three/build/three.module.js";

export class Physics {
    constructor(scene, mapGenerator) {
        this.scene = scene;
        this.mapGenerator = mapGenerator;
        this.gravity = -28;
        this.entities = [];
        this.lavaDamagePerSecond = 10;
        this.colliders = mapGenerator.getColliders?.() || [];
        this.colliderGridCellSize = 16;
        this.colliderGrid = new Map();
        this.colliderGridCount = this.colliders.length;
        this.dynamicColliders = this.colliders.filter(box => box.dynamic);
        this._nearbyResults = [];
        this._queryStamp = 1;

        // Wall sliding and boundary enforcement
        this.slideDamping = 0.85;
        this.slideThreshold = 0.15;
        this.maxCompression = 0.95;
        this.boundaryMargin = 180;
        this.boundaryForce = 12;

        // Reusable vectors to avoid GC pressure
        this._tmpVec1 = new THREE.Vector3();
        this._tmpVec2 = new THREE.Vector3();
        this._tmpVec3 = new THREE.Vector3();
        this._tmpVec4 = new THREE.Vector3();
        this._tmpVec5 = new THREE.Vector3();
        this._slideDir = new THREE.Vector3();
        this._boundForce = new THREE.Vector3();

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
        const newColliders = this.mapGenerator.getColliders?.() || this.colliders;
        if (newColliders !== this.colliders) {
            this.colliders = newColliders;
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

            // Safety: detect stuck entities using spatial query (throttled)
            if (!entity.physics._stuckCount) entity.physics._stuckCount = 0;
            entity.physics._stuckCheckTimer = (entity.physics._stuckCheckTimer ?? 0) - delta;
            let insideNonWalkable = false;
            if (entity.physics._stuckCheckTimer <= 0) {
                entity.physics._stuckCheckTimer = 0.3;
                const checkPos = entity.position;
                const entityBottom = checkPos.y - (entity.physics.height || 1.7);
                const nearby = this.getNearbyColliders(checkPos, 2.0);
                for (const box of nearby) {
                    if (!box.walkable && box.min && box.max) {
                        if (checkPos.x >= box.min.x && checkPos.x <= box.max.x &&
                            checkPos.z >= box.min.z && checkPos.z <= box.max.z &&
                            entityBottom < box.max.y && checkPos.y > box.min.y) {
                            insideNonWalkable = true;
                            break;
                        }
                    }
                }
            }

            if (insideNonWalkable) {
                entity.physics._stuckCount++;
                if (entity.physics._stuckCount > 120) {
                    const pads = this.mapGenerator?.spawnPads || [];
                    if (pads.length > 0) {
                        const pad = pads[Math.floor(Math.random() * pads.length)];
                        entity.position.set(pad.x, pad.y + (entity.physics.height || 1.8), pad.z);
                    } else {
                        entity.position.set(0, 5, 0);
                    }
                    entity.physics.velocity?.set?.(0, 0, 0);
                    entity.physics.onGround = false;
                    entity.physics._stuckCount = 0;
                }
            } else {
                entity.physics._stuckCount = 0;
            }


            // Apply gravity
            if (isFrozen) {
                entity.physics.velocity.set(0, 0, 0);
            } else {
                if (entity.physics.onGround) {
                    entity.physics.velocity.y = 0;
                } else {
                    entity.physics.velocity.y += this.gravity * delta;
                }
            }

            // Update position
            if (!isFrozen) {
                entity.position.x += entity.physics.velocity.x * delta;
                entity.position.y += entity.physics.velocity.y * delta;
                entity.position.z += entity.physics.velocity.z * delta;
            }

            // Ground collision check
            const groundHeightRaw = this.mapGenerator.getHeightAt(entity.position.x, entity.position.z);
            const groundHeight = Number.isFinite(groundHeightRaw) ? groundHeightRaw : 0;
            const baseGroundY = 0;
            const terrainHeight = baseGroundY + Math.max(0, groundHeight);
            const colliderHeight = this.getColliderSurfaceHeight(entity.position, entity.physics.height);
            const surfaceHeight = Math.max(terrainHeight, colliderHeight);
            
            if (entity.position.y <= surfaceHeight + entity.physics.height) {
                entity.position.y = surfaceHeight + entity.physics.height;
                entity.physics.onGround = true;
                entity.physics.velocity.y = 0;
            } else {
                entity.physics.onGround = false;
            }

            this.resolveCollisions(entity);

            // Post-collision surface clamp
            const postColliderHeight = this.getColliderSurfaceHeight(entity.position, entity.physics.height);
            const finalSurfaceHeight = Math.max(terrainHeight, postColliderHeight);

            if (entity.position.y < finalSurfaceHeight + entity.physics.height) {
                entity.position.y = finalSurfaceHeight + entity.physics.height;
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

            // Boundary enforcement — push entities back toward center
            if (!isFrozen && entity.isInvulnerable !== true) {
                const distSq = entity.position.x * entity.position.x + entity.position.z * entity.position.z;
                if (distSq > this.boundaryMargin * this.boundaryMargin) {
                    const dist = Math.sqrt(distSq);
                    const pushBack = (dist - this.boundaryMargin) / Math.max(1, dist);
                    this._boundForce.set(-entity.position.x * pushBack, 0, -entity.position.z * pushBack);
                    const mag = this._boundForce.length();
                    if (mag > 0.01) {
                        this._boundForce.normalize().multiplyScalar(this.boundaryForce * delta);
                        entity.position.x += this._boundForce.x;
                        entity.position.z += this._boundForce.z;
                        entity.physics.velocity.x -= this._boundForce.x * 0.5;
                        entity.physics.velocity.z -= this._boundForce.z * 0.5;
                    }
                }
            }
        }
    }

    resolveCollisions(entity) {
        if (!this.colliders.length) return;
        const type = entity.constructor?.name;
        const bonusRadius = type === 'Zombie' ? 0.1 : type === 'Bot' ? 0.07 : 0;
        const baseRadius = (entity.physics?.radius || 0.5) + bonusRadius;
        const pos = entity.position;
        const height = entity.physics?.height || 1.7;
        const bottom = pos.y - height;

        const nearby = this.getNearbyColliders(pos, baseRadius + 1.2);
        if (!nearby.length) return;

        // Multi-pass resolution for solid collision (prevents clipping)
        let pushed = false;
        for (let pass = 0; pass < 3; pass++) {
            pushed = false;

            for (const box of nearby) {
                if (box.enabled === false) continue;

                const min = box.min;
                const max = box.max;
                if (!min || !max) continue;

                // Expand Y check to catch entities near top/bottom edges
                if (pos.y < min.y - 0.3) continue;
                if (bottom > max.y + 0.3) continue;

                const clampedX = Math.max(min.x, Math.min(max.x, pos.x));
                const clampedZ = Math.max(min.z, Math.min(max.z, pos.z));
                const dx = pos.x - clampedX;
                const dz = pos.z - clampedZ;
                const distSq = dx * dx + dz * dz;

                if (distSq > (baseRadius + 0.2) * (baseRadius + 0.2)) continue;

                if (distSq === 0) {
                    const left = Math.abs(pos.x - min.x);
                    const right = Math.abs(max.x - pos.x);
                    const back = Math.abs(pos.z - min.z);
                    const front = Math.abs(max.z - pos.z);
                    const minPen = Math.min(left, right, back, front);

                    pos.x = minPen === left ? min.x - baseRadius : minPen === right ? max.x + baseRadius : pos.x;
                    pos.z = minPen === back ? min.z - baseRadius : front === minPen ? max.z + baseRadius : pos.z;
                    pushed = true;
                } else {
                    const dist = Math.sqrt(distSq);
                    const penetration = baseRadius - dist;
                    const effectivePush = Math.max(0.01, penetration * this.maxCompression);

                    if (effectivePush > 0.005) {
                        const nx = dx / dist;
                        const nz = dz / dist;
                        pos.x += nx * effectivePush;
                        pos.z += nz * effectivePush;
                        pushed = true;
                    }
                }
            }

            if (!pushed) break;
        }

        // Wall sliding — only check for fast-moving entities
        if (entity.physics?.velocity && !pushed) {
            const velX = entity.physics.velocity.x;
            const velZ = entity.physics.velocity.z;
            const velMag = Math.sqrt(velX * velX + velZ * velZ);

            if (velMag > 1.5) {
                const nearby2 = this.getNearbyColliders(pos, baseRadius + 1.0);
                let wallNormal = null;
                let wallDot = -Infinity;

                for (const box of nearby2) {
                    if (!box.enabled || box.walkable) continue;
                    const min = box.min, max = box.max;
                    if (!min || !max) continue;
                    const cx = (min.x + max.x) / 2;
                    const cz = (min.z + max.z) / 2;
                    const ddx = pos.x - cx;
                    const ddz = pos.z - cz;
                    const dMag = Math.sqrt(ddx * ddx + ddz * ddz);
                    if (dMag < 1.5 && dMag > 0.01) {
                        const dot = (velX * (ddx / dMag) + velZ * (ddz / dMag)) / Math.max(0.01, velMag);
                        if (dot > wallDot && dot > 0.3) {
                            wallDot = dot;
                            wallNormal = this._tmpVec1.set(ddx / dMag, 0, ddz / dMag);
                        }
                    }
                }

                if (wallNormal) {
                    const tangent = this._slideDir.set(-wallNormal.z, 0, wallNormal.x);
                    const slideDot = velX * tangent.x + velZ * tangent.z;
                    if (Math.abs(slideDot) > 0.3) {
                        const slideMag = Math.sqrt(slideDot * slideDot);
                        const slideFactor = Math.min(0.7, this.slideDamping);
                        entity.physics.velocity.x = tangent.x * slideDot * slideFactor;
                        entity.physics.velocity.z = tangent.z * slideDot * slideFactor;
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
        const nearby = this.getNearbyColliders(position, radius + 4);
        let debugCount = 0;
        if (nearby.length === 0 && this.colliders.length > 0) {
            // Fallback: iterate all colliders
            for (const box of this.colliders) {
                if (box.enabled === false || !box.walkable) continue;
                const min = box.min;
                const max = box.max;
                if (!min || !max) continue;
                if (position.x + radius < min.x || position.x - radius > max.x) continue;
                if (position.z + radius < min.z || position.z - radius > max.z) continue;
                if (position.y + height < min.y - 0.5) continue;
                if (position.y > max.y + height + 0.5) continue;
                if (bottom > max.y + 0.5) continue;
                debugCount++;
                const dist = Math.abs(max.y - bottom);
                if (maxY === -Infinity || dist < Math.abs(maxY - bottom)) maxY = max.y;
            }
            if (debugCount > 0) {
                console.log(`[Physics] FALLBACK found platform: pos=(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}), maxY=${maxY}, count=${debugCount}`);
            }
        }
        for (const box of nearby) {
            if (box.enabled === false || !box.walkable) continue;
            
            const min = box.min;
            const max = box.max;
            if (!min || !max) continue;
            
            if (position.x + radius < min.x || position.x - radius > max.x) continue;
            if (position.z + radius < min.z || position.z - radius > max.z) continue;
            if (position.y + height < min.y - 0.5) continue;
            if (position.y > max.y + height + 0.5) continue;
            if (bottom > max.y + 0.5) continue;
            const dist = Math.abs(max.y - bottom);
            if (maxY === -Infinity || dist < Math.abs(maxY - bottom)) maxY = max.y;
        }
        if (maxY === -Infinity && this.colliders.length > 0) {
            for (const box of this.colliders) {
                if (box.enabled === false || !box.walkable) continue;
                const min = box.min;
                const max = box.max;
                if (!min || !max) continue;
                if (position.x + radius < min.x || position.x - radius > max.x) continue;
                if (position.z + radius < min.z || position.z - radius > max.z) continue;
                if (position.y + height < min.y - 0.5) continue;
                if (position.y > max.y + height + 0.5) continue;
                if (bottom > max.y + 0.5) continue;
                debugCount++;
                const dist = Math.abs(max.y - bottom);
                if (maxY === -Infinity || dist < Math.abs(maxY - bottom)) maxY = max.y;
            }
        }
        if (debugCount > 0 && maxY !== -Infinity) {
            console.log(`[Physics] getColliderSurfaceHeight: pos=(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}), maxY=${maxY}, count=${debugCount}`);
        }
        return maxY;
    }

    rebuildColliderGrid() {
        this.colliderGrid.clear();
        const cellSize = this.colliderGridCellSize;
        for (const box of this.colliders) {
            if (!box) continue;
            
            let min, max;
            if (box.min && box.max) {
                min = box.min;
                max = box.max;
            } else if (box.position && box.size) {
                min = this._tmpVec1.set(box.position.x - box.size.x / 2, box.position.y - box.size.y / 2, box.position.z - box.size.z / 2);
                max = this._tmpVec2.set(box.position.x + box.size.x / 2, box.position.y + box.size.y / 2, box.position.z + box.size.z / 2);
                box.min = min.clone();
                box.max = max.clone();
            } else {
                continue;
            }

            const minX = Math.floor(min.x / cellSize);
            const maxX = Math.floor(max.x / cellSize);
            const minZ = Math.floor(min.z / cellSize);
            const maxZ = Math.floor(max.z / cellSize);
            for (let x = minX; x <= maxX; x++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const key = `${x},${z}`;
                    let bucket = this.colliderGrid.get(key);
                    if (!bucket) {
                        bucket = [];
                        this.colliderGrid.set(key, bucket);
                    }
                    bucket.push(box);
                }
            }
        }
    }

    getNearbyColliders(position, radius) {
        if (!this.colliderGrid.size) return this.colliders;
        const results = this._nearbyResults;
        results.length = 0;
        const cellSize = this.colliderGridCellSize;
        const minCx = Math.floor((position.x - radius) / cellSize);
        const maxCx = Math.floor((position.x + radius) / cellSize);
        const minCz = Math.floor((position.z - radius) / cellSize);
        const maxCz = Math.floor((position.z + radius) / cellSize);
        let stamp = this._queryStamp++;
        if (stamp >= 0x3fffffff) {
            this._queryStamp = 1;
            stamp = 1;
        }
        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cz = minCz; cz <= maxCz; cz++) {
                const key = `${cx},${cz}`;
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
                
                let min, max;
                if (box.min && box.max) {
                    min = box.min;
                    max = box.max;
                } else {
                    min = this._tmpVec1.set(box.position.x - box.size.x / 2, box.position.y - box.size.y / 2, box.position.z - box.size.z / 2);
                    max = this._tmpVec2.set(box.position.x + box.size.x / 2, box.position.y + box.size.y / 2, box.position.z + box.size.z / 2);
                }
                
                if (position.x + radius < min.x || position.x - radius > max.x) continue;
                if (position.z + radius < min.z || position.z - radius > max.z) continue;
                box._qStamp = stamp;
                results.push(box);
            }
        }
        return results;
    }

    checkCollision(entity1, entity2) {
        const distance = entity1.position.distanceTo(entity2.position);
        const minDistance = (entity1.physics?.radius || 0.5) + (entity2.physics?.radius || 0.5);
        return distance < minDistance;
    }

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
