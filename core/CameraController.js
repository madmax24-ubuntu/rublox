import * as THREE from 'three';

export class CameraController {
    constructor(scene, camera, domElement, physics) {
        this.camera = camera;
        this.scene = scene;
        this.domElement = domElement;
        this.physics = physics;
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        this.camera.rotation.order = 'YXZ';
        this.fov = 75;
        this.isLocked = false;
        this._shakeOffset = new THREE.Vector3(0, 0, 0);
        this._yaw = 0;
        this._pitch = 0;
        this._maxPitch = THREE.MathUtils.degToRad(85);
        this._lookSensitivityMultiplier = 1;
        this.isMobile = false;
    }

    init(isMobile) {
        this.isMobile = !!isMobile;
        this.scene.add(this.camera);
        if (!isMobile) {
            this.domElement.tabIndex = 0;
            this._onLockChange = () => {
                const wasLocked = this.isLocked;
                this.isLocked = document.pointerLockElement === this.domElement;
                if (wasLocked !== this.isLocked) console.log('[Cam] pointerlockchange isLocked=' + this.isLocked);
            };
            document.addEventListener('pointerlockchange', this._onLockChange);
            this._onPointerDown = () => {
                this.domElement.focus?.({ preventScroll: true });
                if (!this.isLocked) this.lock();
            };
            this.domElement.addEventListener('pointerdown', this._onPointerDown);
        }
    }

    update(_delta, input, playerPos, _frozen = false) {
        const targetY = playerPos.y + (this.isMobile ? 0.55 : 0.15);

        const look = input.getLookDelta();
        if (look.x !== 0 || look.y !== 0) {
            const sensitivity = (this.isMobile ? 0.0052 : 0.002) * this._lookSensitivityMultiplier;
            this._yaw -= look.x * sensitivity;
            this._pitch -= look.y * sensitivity;
            if (this._pitch > this._maxPitch) this._pitch = this._maxPitch;
            if (this._pitch < -this._maxPitch) this._pitch = -this._maxPitch;
            this.rotation.set(this._pitch, this._yaw, 0, 'YXZ');
            this.camera.quaternion.setFromEuler(this.rotation);
        }

        this.camera.position.set(
            playerPos.x + this._shakeOffset.x,
            targetY + this._shakeOffset.y,
            playerPos.z + this._shakeOffset.z
        );
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

    setLookSensitivityMultiplier(value) {
        this._lookSensitivityMultiplier = Math.max(0.5, Math.min(2.4, Number(value) || 1));
    }

    lock() {
        try {
            if (document.pointerLockElement === this.domElement) return;
            const result = this.domElement?.requestPointerLock?.();
            result?.catch?.(() => {});
        } catch (e) {
            console.log('[Cam] lock() error:', e.message);
        }
    }

    unlock() {
        if (document.exitPointerLock) {
            document.exitPointerLock();
        }
    }
}
