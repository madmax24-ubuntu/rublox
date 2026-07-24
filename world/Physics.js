import * as THREE from "../node_modules/three/build/three.module.js";

export class Physics {
    constructor(scene, mapGenerator) {
        this.scene = scene;
        this.mapGenerator = mapGenerator;
        this.gravity = -28;
        this.entities = [];
        this.colliders = mapGenerator.getColliders?.() || [];
        this.colliderGridCellSize = 16;
        this.colliderGrid = new Map();
        this.colliderGridCount = this.colliders.length;
        this.dynamicColliders = this.colliders.filter(box => box.dynamic);
        this._nearbyResults = [];
        this._queryStamp = 1;

        // Wall sliding
        this.slideDamping = 0.85;
        this.maxCompression = 1.5;
        this.boundaryMargin = Math.max(180, (mapGenerator?.halfSize || 256) - 0.75);
        this.boundaryForce = 12;

        // Reusable vectors
        this._tmpVec1 = new THREE.Vector3();
        this._tmpVec2 = new THREE.Vector3();
        this._tmpVec3 = new THREE.Vector3();
        this._tmpVec4 = new THREE.Vector3();
        this._tmpVec5 = new THREE.Vector3();
        this._slideDir = new THREE.Vector3();
        this._boundForce = new THREE.Vector3();

        // Per-frame damping cache
        this._groundDamping = 1;
        this._airDamping = 1;

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

    update(delta, gameState) {
        // Cache colliders (check once)
        const newColliders = this.mapGenerator.getColliders?.() || this.colliders;
        if (newColliders !== this.colliders) {
            this.colliders = newColliders;
            this.colliderGridCount = this.colliders.length;
            this.dynamicColliders = this.colliders.filter(box => box.dynamic);
            this.rebuildColliderGrid();
        }

        // Pre-compute damping factors (shared across entities)
        const expBase = Math.min(delta, 0.05); // clamp to avoid explosion
        this._groundDamping = Math.exp(-14 * expBase);
        this._airDamping = Math.exp(-2.5 * expBase);
        const isCountdown = gameState === 'countdown';

        for (const entity of this.entities) {
            if (!entity.physics) continue;
            const type = entity.constructor?.name;
            // Skip bots and zombies during countdown — frozen on spawn pads
            if (isCountdown && (type === 'Bot' || type === 'Zombie')) continue;
            const pos = entity.position;

            // Validate position
            if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
                pos?.set?.(0, (entity.physics.height || 1.7) + 0.2, 0);
                entity.physics.velocity?.set?.(0, 0, 0);
                entity.physics.onGround = true;
                continue;
            }

            const isFrozen = entity.isFrozen === true;
            const height = entity.physics.height || 1.7;
            const vel = entity.physics.velocity;

            // Init tracking state
            if (entity.physics.wasOnGround === undefined) {
                entity.physics.wasOnGround = entity.physics.onGround;
                entity.physics.fallStartY = pos.y;
            }

            // --- Stuck detection (throttled, shares nearby query) ---
            const isPlayer = entity.type === 'Player' || type === 'Player';
            let insideNonWalkable = false;
            if (!isPlayer) {
                if (!entity.physics._stuckCount) entity.physics._stuckCount = 0;
                entity.physics._stuckCheckTimer = (entity.physics._stuckCheckTimer ?? 0) - delta;
                if (entity.physics._stuckCheckTimer <= 0) {
                    entity.physics._stuckCheckTimer = 0.3;
                    const bottom = pos.y - height;
                    const nearby = this.getNearbyColliders(pos, 2.0);
                    for (const box of nearby) {
                        if (!box.walkable && box.min && box.max) {
                            if (pos.x >= box.min.x && pos.x <= box.max.x &&
                                pos.z >= box.min.z && pos.z <= box.max.z &&
                                bottom < box.max.y && pos.y > box.min.y) {
                                insideNonWalkable = true;
                                break;
                            }
                        }
                    }
                }
            }

            if (insideNonWalkable && !isPlayer) {
                entity.physics._stuckCount++;
                if (entity.physics._stuckCount > 120) {
                    const pads = this.mapGenerator?.spawnPads || [];
                    if (pads.length > 0) {
                        const pad = pads[Math.floor(Math.random() * pads.length)];
                        pos.set(pad.x, pad.y + height, pad.z);
                    } else {
                        pos.set(0, 5, 0);
                    }
                    vel?.set?.(0, 0, 0);
                    entity.physics.onGround = false;
                    entity.physics._stuckCount = 0;
                }
            } else {
                entity.physics._stuckCount = 0;
            }

            // --- Gravity ---
            if (isFrozen) {
                vel.set(0, 0, 0);
            } else {
                vel.y = entity.physics.onGround ? 0 : vel.y + this.gravity * delta;
            }

            // --- Move ---
            if (!isFrozen) {
                const moveX = vel.x * delta;
                const moveZ = vel.z * delta;
                const totalMove = Math.abs(moveX) + Math.abs(moveZ);
                pos.y += vel.y * delta;
                if (totalMove > 0.005) {
                    const steps = Math.max(1, Math.ceil(totalMove / 0.28));
                    for (let step = 0; step < steps; step++) {
                        pos.x += moveX / steps;
                        pos.z += moveZ / steps;
                        this.resolveCollisions(entity);
                    }
                }
            }

            // --- Single surface height query (merged) ---
            const surfaceY = this._getSurfaceHeight(pos, height);

            // Ground clamp: entity bottom must be >= surface
            const entityBottom = pos.y - height;
            if (entityBottom <= surfaceY) {
                pos.y = surfaceY + height;
                entity.physics.onGround = true;
                vel.y = 0;
            } else {
                entity.physics.onGround = false;
            }

            // --- Fall damage ---
            if (!entity.physics.wasOnGround && entity.physics.onGround) {
                const fallDist = entity.physics.fallStartY - pos.y;
                if (fallDist > 6 && typeof entity.takeDamage === 'function') {
                    const dmg = (fallDist - 6) * 6;
                    if (dmg > 0) entity.takeDamage(dmg);
                }
                entity.physics.fallStartY = pos.y;
            }
            if (entity.physics.wasOnGround && !entity.physics.onGround) {
                entity.physics.fallStartY = pos.y;
            }
            entity.physics.wasOnGround = entity.physics.onGround;

            // --- Environment effects (lava, water, zone) ---
            if (this.mapGenerator.isLavaAt?.(pos.x, pos.z, pos.y)) {
                if (typeof entity.takeDamage === 'function') entity.takeDamage(this.lavaDamagePerSecond * delta);
                if (typeof entity.applyBurn === 'function') entity.applyBurn(1.8, 3.2, null);
            }
            if (this.mapGenerator.isWaterAt?.(pos.x, pos.z)) {
                if (typeof entity.applySlow === 'function') entity.applySlow(0.68, 0.2);
            }
            const zoneSlow = this.mapGenerator.getSlowFactorAt?.(pos.x, pos.z) ?? 1;
            if (zoneSlow < 0.999) {
                if (typeof entity.applySlow === 'function') entity.applySlow(zoneSlow, 0.2);
                else { vel.x *= zoneSlow; vel.z *= zoneSlow; }
            }

            // --- Velocity damping ---
            const dmg = entity.physics.onGround ? this._groundDamping : this._airDamping;
            vel.x *= dmg;
            vel.z *= dmg;
            if (Math.abs(vel.x) < 0.01) vel.x = 0;
            if (Math.abs(vel.z) < 0.01) vel.z = 0;

            // --- Boundary enforcement ---
            if (!isFrozen && entity.isInvulnerable !== true) {
                const limit = this.boundaryMargin;
                if (pos.x < -limit || pos.x > limit) {
                    pos.x = THREE.MathUtils.clamp(pos.x, -limit, limit);
                    vel.x = 0;
                }
                if (pos.z < -limit || pos.z > limit) {
                    pos.z = THREE.MathUtils.clamp(pos.z, -limit, limit);
                    vel.z = 0;
                }
            }
        }
    }

    /**
     * Returns the highest walkable surface Y at position, or 0 (terrain base).
     */
    _getSurfaceHeight(position, height) {
        const bottom = position.y - height;
        const radius = 0.6;
        const nearby = this.getNearbyColliders(position, radius + 4);

        let maxY = -Infinity;
        for (const box of nearby) {
            if (box.enabled === false || !box.walkable) continue;
            if (!this._containsWalkableSurface(box, position.x, position.z, radius)) continue;
            const min = box.min;
            const max = box.max;
            if (!min || !max) continue;
            if (position.x + radius < min.x || position.x - radius > max.x) continue;
            if (position.z + radius < min.z || position.z - radius > max.z) continue;
            if (position.y + height < min.y - 0.5) continue;
            if (position.y > max.y + height + 0.5) continue;
            if (bottom > max.y + 0.5 || max.y > bottom + 0.65) continue;
            const dist = Math.abs(max.y - bottom);
            if (maxY === -Infinity || dist < Math.abs(maxY - bottom)) maxY = max.y;
        }

        if (maxY === -Infinity && !this.colliderGrid.size) {
            for (const box of this.colliders) {
                if (box.enabled === false || !box.walkable) continue;
                if (!this._containsWalkableSurface(box, position.x, position.z, radius)) continue;
                const min = box.min;
                const max = box.max;
                if (!min || !max) continue;
                if (position.x + radius < min.x || position.x - radius > max.x) continue;
                if (position.z + radius < min.z || position.z - radius > max.z) continue;
                if (position.y + height < min.y - 0.5) continue;
                if (position.y > max.y + height + 0.5) continue;
                if (bottom > max.y + 0.5 || max.y > bottom + 0.65) continue;
                const dist = Math.abs(max.y - bottom);
                if (maxY === -Infinity || dist < Math.abs(maxY - bottom)) maxY = max.y;
            }
        }

        return maxY === -Infinity ? 0 : maxY;
    }

    _containsWalkableSurface(box, x, z, radius = 0) {
        const source = box.source;
        if (source && (!source.parent || source.visible === false)) return false;
        const circle = box.surfaceCircle;
        if (!circle) return true;
        const dx = x - circle.x;
        const dz = z - circle.z;
        const limit = Math.max(0, circle.radius - radius);
        return dx * dx + dz * dz <= limit * limit;
    }

    resolveCollisions(entity) {
        if (!this.colliders.length) return;
        const type = entity.constructor?.name;
        const bonusRadius = type === 'Zombie' ? 0.1 : type === 'Bot' ? 0.35 : 0;
        const baseRadius = (entity.physics?.radius || 0.5) + bonusRadius;
        const pos = entity.position;
        const bottom = pos.y - (entity.physics?.height || 1.7);
        const pushDistSq = (baseRadius + 0.5) * (baseRadius + 0.5);

        // Limit per-step push to prevent teleportation when deeply embedded
        const maxPushPerStep = 0.24;

        const nearby = this.getNearbyColliders(pos, baseRadius + 1.2);
        if (!nearby.length) return;

        // Multi-pass resolution with clamped push distance
        let pushed = false;
        for (let pass = 0; pass < 2; pass++) {
            pushed = false;

            for (const box of nearby) {
                if (box.enabled === false) continue;

                const min = box.min;
                const max = box.max;
                if (!min || !max) continue;

                // Y overlap check
                if (pos.y < min.y - 0.3) continue;
                if (bottom > max.y + 0.3) continue;

                // Walkable floor: skip when entity stands on top
                if (box.walkable && bottom >= max.y - 0.5) continue;
                // Only step onto walkable surfaces (stairs, platforms), not invisible colliders
                if (!box.walkable) continue;
                const stepHeight = max.y - bottom;
                if (stepHeight > 0.02 && stepHeight <= 0.78 && bottom >= min.y - 0.2) {
                    pos.y = max.y + (entity.physics?.height || 1.7);
                    entity.physics.onGround = true;
                    if (entity.physics.velocity) entity.physics.velocity.y = 0;
                    continue;
                }

                // AABB vs point (XZ plane)
                const clampedX = min.x + Math.max(0, Math.min(max.x - min.x, pos.x - min.x));
                const clampedZ = min.z + Math.max(0, Math.min(max.z - min.z, pos.z - min.z));
                const dx = pos.x - clampedX;
                const dz = pos.z - clampedZ;
                const distSq = dx * dx + dz * dz;

                if (distSq > pushDistSq) continue;

                if (distSq < 0.0001) {
                    // Center inside box — push along shortest axis, clamped
                    const left = Math.abs(pos.x - min.x);
                    const right = Math.abs(max.x - pos.x);
                    const back = Math.abs(pos.z - min.z);
                    const front = Math.abs(max.z - pos.z);
                    const minPen = Math.min(left, right, back, front);

                    const pushAmt = Math.min(minPen + baseRadius, maxPushPerStep);
                    if (minPen === left) pos.x -= pushAmt;
                    else if (minPen === right) pos.x += pushAmt;
                    else if (minPen === back) pos.z -= pushAmt;
                    else pos.z += pushAmt;
                    pushed = true;
                } else {
                    const dist = Math.sqrt(distSq);
                    const penetration = baseRadius - dist;
                    if (penetration > 0.005) {
                        const push = Math.min(penetration * this.maxCompression, maxPushPerStep);
                        const invDist = 1 / dist;
                        pos.x += dx * invDist * Math.max(0.01, push);
                        pos.z += dz * invDist * Math.max(0.01, push);
                        pushed = true;
                    }
                }
            }

            if (!pushed) break;
        }

        // Wall sliding for fast movers
        if (entity.physics?.velocity && !pushed) {
            const velX = entity.physics.velocity.x;
            const velZ = entity.physics.velocity.z;
            const velMag = Math.sqrt(velX * velX + velZ * velZ);

            if (velMag > 1.5) {
                let wallDot = -Infinity;
                let bestDx = 0, bestDz = 0;

                for (const box of nearby) {
                    if (!box.enabled || box.walkable) continue;
                    const min = box.min, max = box.max;
                    if (!min || !max) continue;
                    const cx = (min.x + max.x) / 2;
                    const cz = (min.z + max.z) / 2;
                    const ddx = pos.x - cx;
                    const ddz = pos.z - cz;
                    const dMag = Math.sqrt(ddx * ddx + ddz * ddz);
                    if (dMag < 1.5 && dMag > 0.01) {
                        const dot = (velX * ddx + velZ * ddz) / (dMag * Math.max(0.01, velMag));
                        if (dot > wallDot && dot > 0.3) {
                            wallDot = dot;
                            bestDx = ddx / dMag;
                            bestDz = ddz / dMag;
                        }
                    }
                }

                if (wallDot > -Infinity) {
                    const tangentX = -bestDz;
                    const tangentZ = bestDx;
                    const slideDot = velX * tangentX + velZ * tangentZ;
                    if (Math.abs(slideDot) > 0.3) {
                        const slideFactor = Math.min(0.7, this.slideDamping);
                        entity.physics.velocity.x = tangentX * slideDot * slideFactor;
                        entity.physics.velocity.z = tangentZ * slideDot * slideFactor;
                    }
                }
            }
        }
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
                    // OPTIMIZED: numeric key with bit shifting to avoid string concatenation
                    const key = (x << 16) | (z & 0xFFFF);
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
                const key = (cx << 16) | (cz & 0xFFFF);
                const bucket = this.colliderGrid.get(key);
                if (!bucket) continue;
                for (let i = 0; i < bucket.length; i++) {
                    const box = bucket[i];
                    if (box._qStamp === stamp) continue;
                    box._qStamp = stamp;
                    results.push(box);
                }
            }
        }
        if (this.dynamicColliders.length) {
            for (let i = 0; i < this.dynamicColliders.length; i++) {
                const box = this.dynamicColliders[i];
                if (box._qStamp === stamp) continue;
                box._qStamp = stamp;
                results.push(box);
            }
        }
        return results;
    }

    getColliderSurfaceHeight(position, height) {
        return this._getSurfaceHeight(position, height);
    }
}
