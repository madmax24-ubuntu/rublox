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
    }

    init(isMobile) {
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
                const key = `${cx + dx},${cz + dz}`;
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
                const dir = this._tmpVec2.subVectors(cameraPos, center).normalize();

                if (axis === 'x') cameraPos.x += dir.x * amount;
                else if (axis === 'y') cameraPos.y += dir.y * amount;
                else cameraPos.z += dir.z * amount;

                pushed = true;
            }
        }
    }

    update(delta, input, playerPos, frozen = false) {
        const targetY = playerPos.y + 1.5;
        const hasShake = this._shakeOffset.lengthSq() > 0;

        if (frozen) {
            this._tmpFrozenTarget.set(0, targetY, 0);
            this.camera.lookAt(this._tmpFrozenTarget);
            this.rotation.setFromQuaternion(this.camera.quaternion, 'YXZ');
            this._yaw = this.rotation.y;
            this._pitch = this.rotation.x;
        } else if (this.isLocked) {
            const sensitivity = 0.002;
            this._yaw -= this._mouseDx * sensitivity;
            this._pitch -= this._mouseDy * sensitivity;
            if (this._pitch > this._maxPitch) this._pitch = this._maxPitch;
            if (this._pitch < -this._maxPitch) this._pitch = -this._maxPitch;
            this.rotation.set(this._pitch, this._yaw, 0, 'YXZ');
            this.camera.quaternion.setFromEuler(this.rotation);
        } else {
            if (input.isMobile) {
                this._yaw = input.yaw;
                this._pitch = input.pitch;
                this.rotation.set(this._pitch, this._yaw, 0, 'YXZ');
                this.camera.quaternion.setFromEuler(this.rotation);
            } else {
                const look = input.getLookDelta();
                if (look.x !== 0 || look.y !== 0) {
                    const sensitivity = 0.0042;
                    this._yaw -= look.x * sensitivity;
                    this._pitch -= look.y * sensitivity;
                    if (this._pitch > this._maxPitch) this._pitch = this._maxPitch;
                    if (this._pitch < -this._maxPitch) this._pitch = -this._maxPitch;
                    this.rotation.set(this._pitch, this._yaw, 0, 'YXZ');
                    this.camera.quaternion.setFromEuler(this.rotation);
                }
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

            // Resolve camera collision with world
            this.resolveCollision(this.camera.position, playerPos);

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
    }

    unlock() {
        if (document.exitPointerLock) {
            document.exitPointerLock();
        }
    }
}
