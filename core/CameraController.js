import * as THREE from 'three';

export class CameraController {
    constructor(scene, camera, domElement, physics) {
        this.camera = camera;
        this.scene = scene;
        this.domElement = domElement;
        this.physics = physics;
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        this.fov = 75;
        this.isLocked = false;
        this._lastPos = new THREE.Vector3();
        this._posDirty = true;
        this._shakeOffset = new THREE.Vector3(0, 0, 0);
        this._tmpFrozenTarget = new THREE.Vector3();
        this._tmpQYaw = new THREE.Quaternion();
        this._tmpQPitch = new THREE.Quaternion();
        this._tmpAxisY = new THREE.Vector3(0, 1, 0);
        this._tmpAxisX = new THREE.Vector3(1, 0, 0);
        this._yaw = 0;
        this._pitch = 0;
        this._maxPitch = Math.PI / 2.4;
        this._mouseDx = 0;
        this._mouseDy = 0;
        this._cameraRadius = 0.15;
        this._tmpVec1 = new THREE.Vector3();
        this._tmpVec2 = new THREE.Vector3();
        this._tmpVec3 = new THREE.Vector3();
        this._tmpVec4 = new THREE.Vector3();
        this.isMobile = false;
    }

    init(isMobile) {
        this.isMobile = !!isMobile;
        this.scene.add(this.camera);
        if (!isMobile) {
            this.domElement.tabIndex = 0;
            this._onMouseMove = (e) => {
                if (!this.isLocked && e.target !== this.domElement) return;
                this._mouseDx += e.movementX || 0;
                this._mouseDy += e.movementY || 0;
            };
            document.addEventListener('mousemove', this._onMouseMove);

            this._onLockChange = () => {
                this.isLocked = document.pointerLockElement === this.domElement;
            };
            document.addEventListener('pointerlockchange', this._onLockChange);
            this._onPointerDown = () => {
                this.domElement.focus?.({ preventScroll: true });
                if (!this.isLocked) this.lock();
            };
            this.domElement.addEventListener('pointerdown', this._onPointerDown);
        }
    }

    _raycastAABB(origin, dir, box) {
        const { min, max } = box;
        let tmin = -Infinity, tmax = Infinity;

        for (const axis of ['x', 'y', 'z']) {
            const d = dir[axis];
            if (Math.abs(d) < 1e-8) {
                if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null;
            } else {
                const invD = 1 / d;
                let t0, t1;
                if (d > 0) { t0 = (min[axis] - origin[axis]) * invD; t1 = (max[axis] - origin[axis]) * invD; }
                else { t0 = (max[axis] - origin[axis]) * invD; t1 = (min[axis] - origin[axis]) * invD; }
                if (t0 > tmin) tmin = t0;
                if (t1 < tmax) tmax = t1;
                if (tmin > tmax) return null;
            }
        }

        if (tmin < 0) {
            // Origin inside AABB — return tmax (exit point)
            return tmax > 0 ? tmax : null;
        }
        // Camera is in front of the box
        if (tmin >= 0 && tmin < tmax) return tmin;
        return null;
    }

    _clampCamera(cameraPos, playerPos) {
        const colliders = this.physics?.colliders;
        if (!colliders || colliders.length === 0) return;

        // Direction from player to camera
        const dir = this._tmpVec1.subVectors(cameraPos, playerPos);
        const dist = dir.length();
        if (dist < 0.1) return; // too close — nothing to block
        dir.normalize();

        // Query colliders along the ray using spatial grid
        const grid = this.physics.colliderGrid;
        const cellSize = this.physics.colliderGridCellSize;
        const pCx = Math.floor(playerPos.x / cellSize);
        const pCz = Math.floor(playerPos.z / cellSize);
        const cCx = Math.floor(cameraPos.x / cellSize);
        const cCz = Math.floor(cameraPos.z / cellSize);

        // Collect colliders from cells along the path
        const minX = Math.min(pCx, cCx) - 1;
        const maxX = Math.max(pCx, cCx) + 1;
        const minZ = Math.min(pCz, cCz) - 1;
        const maxZ = Math.max(pCz, cCz) + 1;

        let closestT = Infinity;
        for (let cx = minX; cx <= maxX; cx++) {
            for (let cz = minZ; cz <= maxZ; cz++) {
                const key = (cx << 16) | (cz & 0xFFFF);
                const cell = grid.get(key);
                if (!cell) continue;
                for (let i = 0; i < cell.length; i++) {
                    const box = cell[i];
                    if (!box.min || !box.max) continue;
                    const t = this._raycastAABB(playerPos, dir, box);
                    if (t !== null && t > 0.05 && t < closestT && t < dist) {
                        closestT = t;
                    }
                }
            }
        }

        // If an obstacle blocks the camera, move it closer to player
        if (closestT < dist - 0.15) {
            const newDist = closestT - 0.15;
            cameraPos.set(
                playerPos.x + dir.x * newDist,
                playerPos.y + dir.y * newDist,
                playerPos.z + dir.z * newDist
            );
        }

        // Additional sphere-AABB check: ensure camera is not inside any collider
        const r = this._cameraRadius;
        for (let cx = Math.floor(cameraPos.x / cellSize) - 1; cx <= Math.floor(cameraPos.x / cellSize) + 1; cx++) {
            for (let cz = Math.floor(cameraPos.z / cellSize) - 1; cz <= Math.floor(cameraPos.z / cellSize) + 1; cz++) {
                const key = (cx << 16) | (cz & 0xFFFF);
                const cell = grid.get(key);
                if (!cell) continue;
                for (let i = 0; i < cell.length; i++) {
                    const box = cell[i];
                    if (!box.min || !box.max) continue;
                    // Sphere-AABB intersection test
                    const closestX = Math.max(box.min.x, Math.min(cameraPos.x, box.max.x));
                    const closestY = Math.max(box.min.y, Math.min(cameraPos.y, box.max.y));
                    const closestZ = Math.max(box.min.z, Math.min(cameraPos.z, box.max.z));
                    const dx = cameraPos.x - closestX;
                    const dy = cameraPos.y - closestY;
                    const dz = cameraPos.z - closestZ;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    if (distSq < r * r && distSq > 0.0001) {
                        // Camera sphere intersects collider — push away
                        const dist = Math.sqrt(distSq);
                        const push = r - dist + 0.05;
                        const invDist = 1 / dist;
                        cameraPos.x += dx * invDist * push;
                        cameraPos.y += dy * invDist * push;
                        cameraPos.z += dz * invDist * push;
                    }
                }
            }
        }
    }

    resolveCollision(cameraPos, playerPos) {
        const colliders = this.physics?.colliders;
        if (!colliders || colliders.length === 0) return;
        const grid = this.physics.colliderGrid;
        const cellSize = this.physics.colliderGridCellSize;
        const r = this._cameraRadius;

        // Query nearby cells
        const cx = Math.floor(cameraPos.x / cellSize);
        const cz = Math.floor(cameraPos.z / cellSize);
        const nearby = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const gx = cx + dx;
                const gz = cz + dz;
                const key = (gx << 16) | (gz & 0xFFFF);
                const cell = grid.get(key);
                if (cell) {
                    for (let i = 0; i < cell.length; i++) {
                        nearby.push(cell[i]);
                    }
                }
            }
        }

        // AABB point test + push-out on shortest axis
        let pushed = true;
        let iterations = 0;
        while (pushed && iterations < 4) {
            pushed = false;
            iterations++;
            for (const box of nearby) {
                if (!box.min || !box.max) continue;
                const min = box.min;
                const max = box.max;

                // Check if camera is inside this collider
                if (cameraPos.x + r <= min.x || cameraPos.x - r >= max.x) continue;
                if (cameraPos.y + r <= min.y || cameraPos.y - r >= max.y) continue;
                if (cameraPos.z + r <= min.z || cameraPos.z - r >= max.z) continue;

                // Camera is inside — push out along shortest axis
                const overlapX = Math.min(cameraPos.x + r - min.x, max.x - (cameraPos.x - r));
                const overlapY = Math.min(cameraPos.y + r - min.y, max.y - (cameraPos.y - r));
                const overlapZ = Math.min(cameraPos.z + r - min.z, max.z - (cameraPos.z - r));

                let axis = 'x', amount = overlapX;
                if (overlapY < amount) { axis = 'y'; amount = overlapY; }
                if (overlapZ < amount) { axis = 'z'; amount = overlapZ; }

                // Push away from center of collider
                const center = this._tmpVec1;
                center.set(
                    (min.x + max.x) * 0.5,
                    (min.y + max.y) * 0.5,
                    (min.z + max.z) * 0.5
                );
                const sign = cameraPos[axis] >= center[axis] ? 1 : -1;
                cameraPos[axis] += sign * amount;

                pushed = true;
            }
        }
    }

    update(delta, input, playerPos, frozen = false) {
        const targetY = playerPos.y + (this.isMobile ? 0.55 : 0.15);
        const hasShake = this._shakeOffset.lengthSq() > 0;
        // Debug log
        if (this._updateCount === undefined) this._updateCount = 0;
        if (++this._updateCount % 300 === 0) {
            console.log('[CameraController] playerPos=' + playerPos.toArray().map(v=>v.toFixed(2)).join(',') + ' targetY=' + targetY.toFixed(2) + ' camPos=' + this.camera.position.toArray().map(v=>v.toFixed(2)).join(','));
        }

        if (this.isLocked) {
            const sensitivity = 0.002;
            this._yaw -= this._mouseDx * sensitivity;
            this._pitch -= this._mouseDy * sensitivity;
            if (this._pitch > this._maxPitch) this._pitch = this._maxPitch;
            if (this._pitch < -this._maxPitch) this._pitch = -this._maxPitch;
            this.rotation.set(this._pitch, this._yaw, 0, 'YXZ');
            this.camera.quaternion.setFromEuler(this.rotation);
        } else {
            const look = input.getLookDelta();
            if (look.x !== 0 || look.y !== 0) {
                const sensitivity = input.isMobile ? 0.0052 : 0.0042;
                this._yaw -= look.x * sensitivity;
                this._pitch -= look.y * sensitivity;
                if (this._pitch > this._maxPitch) this._pitch = this._maxPitch;
                if (this._pitch < -this._maxPitch) this._pitch = -this._maxPitch;
                this.rotation.set(this._pitch, this._yaw, 0, 'YXZ');
                this.camera.quaternion.setFromEuler(this.rotation);
            }
        }

        this._mouseDx = 0;
        this._mouseDy = 0;

        const dx = playerPos.x - this._lastPos.x;
        const dy = targetY - this._lastPos.y;
        const dz = playerPos.z - this._lastPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (frozen || this._posDirty || hasShake || distSq > 0.0001) {
            this.camera.position.set(
                playerPos.x + this._shakeOffset.x,
                targetY + this._shakeOffset.y,
                playerPos.z + this._shakeOffset.z
            );

            // Clamp camera so it never goes behind obstacles
            this._clampCamera(this.camera.position, playerPos);

            if (!hasShake) {
                this._lastPos.x = playerPos.x;
                this._lastPos.y = targetY;
                this._lastPos.z = playerPos.z;
                this._posDirty = false;
            }
        }
    }

    setShakeOffset(x, y, z) {
        this._shakeOffset.set(x, y, z);
    }

    clearShake() {
        if (this._shakeOffset.lengthSq() > 0) {
            this._shakeOffset.set(0, 0, 0);
        }
    }

    getWorldDirection(target) {
        target.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        return target;
    }

    lock() {
        try {
            const request = this.domElement.requestPointerLock?.();
            request?.catch?.(() => {});
        } catch (_) {}
        // Начальный downward pitch — чтобы видеть нож/руку при старте
        this._pitch = -0.25; // ~-14° вниз
    }

    unlock() {
        if (document.exitPointerLock) {
            document.exitPointerLock();
        }
    }
}
