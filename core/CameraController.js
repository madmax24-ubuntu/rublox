import * as THREE from 'three';

export class CameraController {
    constructor(scene, camera, domElement) {
        this.camera = camera;
        this.scene = scene;
        this.domElement = domElement;
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
            const look = input.getLookDelta();
            if (look.x !== 0 || look.y !== 0) {
                const side = Math.max(window.innerWidth, window.innerHeight);
                const sensitivity = input.isMobile ? (5.7 / side) : 0.0042;
                this._tmpQYaw.setFromAxisAngle(this._tmpAxisY, -look.x * sensitivity);
                this._tmpQPitch.setFromAxisAngle(this._tmpAxisX, -look.y * sensitivity);
                this.camera.quaternion.multiply(this._tmpQYaw).multiply(this._tmpQPitch);
                this.rotation.setFromQuaternion(this.camera.quaternion, 'YXZ');
                if (this.rotation.x > this._maxPitch) {
                    this.rotation.x = this._maxPitch;
                    this.camera.quaternion.setFromEuler(this.rotation);
                }
                if (this.rotation.x < -this._maxPitch) {
                    this.rotation.x = -this._maxPitch;
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
