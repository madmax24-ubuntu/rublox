export class InputController {
    constructor(options = {}) {
        this.isMobile = options.isMobile ?? this._detectMobile();
        this.moveSpeed = 8;
        this.mouseSensitivity = options.mouseSensitivity ?? 0.002;
        this.touchLookSensitivity = options.touchLookSensitivity ?? 0.012;
        this.joystickRadius = options.joystickRadius ?? 60;
        this.deadZone = options.deadZone ?? 15;
        this.maxPitchDeg = 89;
        this._maxPitchRad = this.maxPitchDeg * Math.PI / 180;
        this.keys = {};
        this._domElement = options.domElement ?? document.body;
        this.yaw = 0;
        this.pitch = 0;
        this.joystick = {
            active: false,
            baseX: 0, baseY: 0,
            currentX: 0, currentY: 0,
            dx: 0, dy: 0,
            touchId: -1
        };
        this.trackpad = {
            active: false,
            startX: 0, startY: 0,
            touchId: -1
        };
        this.pointerLocked = false;
        this.keyRemap = this._loadKeyRemap();
        this._sanitizeReservedBindings();
        this._lookDx = 0;
        this._lookDy = 0;
        this._lookDeltaObj = { x: 0, y: 0 };
    }

    attachListeners() {
        this._setupKeyboard();
        if (this.isMobile) {
            this._attachTouchListeners();
        } else {
            this._attachDesktopListeners();
        }
    }

    destroy() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('mouseup', this._onMouseUp);
        document.removeEventListener('pointerlockchange', this._onLockChange);
        if (this.isMobile) {
            this._detachTouchListeners();
        }
    }

    update(dt) {
        this._lookDx = 0;
        this._lookDy = 0;
    }

    lock() {
        if (!this.isMobile && this._domElement) {
            try {
                const request = this._domElement.requestPointerLock?.();
                request?.catch?.(() => {});
            } catch (_) {}
        }
    }

    unlock() {
        if (document.exitPointerLock) {
            document.exitPointerLock();
        }
    }

    isKeyPressed(code) {
        const resolved = this._resolveKey(code);
        return !!this.keys[resolved];
    }

    getLookDelta() {
        const delta = this._lookDeltaObj;
        delta.x = this._lookDx;
        delta.y = this._lookDy;
        this._lookDx = 0;
        this._lookDy = 0;
        return delta;
    }

    getMovementVector() {
        const THREE = globalThis.THREE;
        if (!THREE) throw new Error('THREE not loaded');
        const move = new THREE.Vector3();

        if (this.isMobile) {
            move.x = this.joystick.dx;
            move.z = this.joystick.dy;
        } else {
            move.set(0, 0, 0);
            if (this.isKeyPressed('KeyW')) move.z -= 1;
            if (this.isKeyPressed('KeyS')) move.z += 1;
            if (this.isKeyPressed('KeyA')) move.x -= 1;
            if (this.isKeyPressed('KeyD')) move.x += 1;
        }

        return move.normalize();
    }

    resetLook() {
        this._lookDx = 0;
        this._lookDy = 0;
    }

    clearInputState() {
        this.keys = {};
        this._lookDx = 0;
        this._lookDy = 0;
        this.joystick.dx = 0;
        this.joystick.dy = 0;
        this.joystick.active = false;
    }

    setKeyRemap(logical, physical) {
        if (!logical || !physical) return;
        if (physical === 'Escape') return;
        if (!this.keyRemap) this.keyRemap = {};
        for (const key in this.keyRemap) {
            if (this.keyRemap[key] === physical && key !== logical) {
                delete this.keyRemap[key];
            }
        }
        this.keyRemap[logical] = physical;
        this._saveKeyRemap();
    }

    getKeyRemap() {
        return this.keyRemap || {};
    }

    _setupKeyboard() {
        this._onKeyDown = (e) => { this._handleKey(e, true); };
        this._onKeyUp = (e) => { this._handleKey(e, false); };
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('blur', () => { this.clearInputState(); });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.clearInputState();
        });
    }

    _attachDesktopListeners() {
        this._onMouseMove = (e) => {
            if (!this.pointerLocked && document.activeElement !== this._domElement) return;
            this._lookDx += e.movementX || 0;
            this._lookDy += e.movementY || 0;
        };
        document.addEventListener('mousemove', this._onMouseMove);

        this._onMouseDown = (e) => {
            if (e.button === 0) this.keys['MouseLeft'] = true;
            if (e.button === 2) this.keys['MouseRight'] = true;
        };
        document.addEventListener('mousedown', this._onMouseDown);

        this._onMouseUp = (e) => {
            if (e.button === 0) this.keys['MouseLeft'] = false;
            if (e.button === 2) this.keys['MouseRight'] = false;
        };
        document.addEventListener('mouseup', this._onMouseUp);

        this._onLockChange = () => {
            this.pointerLocked = document.pointerLockElement === this._domElement;
        };
        document.addEventListener('pointerlockchange', this._onLockChange);
    }

    _handleKey(e, pressed) {
        const code = e.code;
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
            e.preventDefault();
        }
        const resolved = this._resolveKey(code);
        this.keys[resolved] = pressed;
    }

    _resolveKey(code) {
        const remap = this.keyRemap || {};
        return remap[code] || code;
    }

    _attachTouchListeners() {
        this._onTouchStart = (e) => { this._handleTouchStart(e); };
        this._onTouchMove = (e) => { this._handleTouchMove(e); };
        this._onTouchEnd = (e) => { this._handleTouchEnd(e); };
        this._onTouchCancel = (e) => { this._handleTouchEnd(e); };

        this._domElement.addEventListener('touchstart', this._onTouchStart, { passive: false });
        this._domElement.addEventListener('touchmove', this._onTouchMove, { passive: false });
        this._domElement.addEventListener('touchend', this._onTouchEnd, { passive: false });
        this._domElement.addEventListener('touchcancel', this._onTouchCancel, { passive: false });

        this._bindHoldButton('touchJump', 'Space');
        this._bindHoldButton('touchAttack', 'MouseLeft');
        this._bindHoldButton('touchInteract', 'KeyE');
    }

    _detachTouchListeners() {
        this._domElement.removeEventListener('touchstart', this._onTouchStart);
        this._domElement.removeEventListener('touchmove', this._onTouchMove);
        this._domElement.removeEventListener('touchend', this._onTouchEnd);
        this._domElement.removeEventListener('touchcancel', this._onTouchCancel);
    }

    _bindHoldButton(elementId, key) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.keys[key] = true;
        }, { passive: false });

        element.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.keys[key] = false;
        }, { passive: false });

        element.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.keys[key] = false;
        }, { passive: false });
    }

    _handleTouchStart(e) {
        e.preventDefault();
        const half = this._domElement.clientWidth / 2;

        for (const touch of e.changedTouches) {
            const x = touch.clientX;
            const id = touch.identifier;

            if (x < half) {
                if (this.joystick.active) continue;
                this.joystick.active = true;
                this.joystick.touchId = id;
                this.joystick.baseX = x;
                this.joystick.baseY = touch.clientY;
                this.joystick.currentX = x;
                this.joystick.currentY = touch.clientY;
                this.joystick.dx = 0;
                this.joystick.dy = 0;
            } else {
                if (this.trackpad.active) continue;
                this.trackpad.active = true;
                this.trackpad.touchId = id;
                this.trackpad.startX = x;
                this.trackpad.startY = touch.clientY;
            }
        }
    }

    _handleTouchMove(e) {
        e.preventDefault();

        for (const touch of e.changedTouches) {
            const id = touch.identifier;
            const x = touch.clientX;
            const y = touch.clientY;

            if (this.joystick.active && this.joystick.touchId === id) {
                this.joystick.currentX = x;
                this.joystick.currentY = y;
                let dx = x - this.joystick.baseX;
                let dy = y - this.joystick.baseY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < this.deadZone) {
                    this.joystick.dx = 0;
                    this.joystick.dy = 0;
                    continue;
                }

                if (dist > this.joystickRadius) {
                    dx = (dx / dist) * this.joystickRadius;
                    dy = (dy / dist) * this.joystickRadius;
                }

                this.joystick.dx = dx / this.joystickRadius;
                this.joystick.dy = dy / this.joystickRadius;
            }

            if (this.trackpad.active && this.trackpad.touchId === id) {
                const dx = x - this.trackpad.startX;
                const dy = y - this.trackpad.startY;
                this._lookDx += dx;
                this._lookDy += dy;
                this.trackpad.startX = x;
                this.trackpad.startY = y;
            }
        }
    }

    _handleTouchEnd(e) {
        e.preventDefault();

        for (const touch of e.changedTouches) {
            const id = touch.identifier;

            if (this.joystick.active && this.joystick.touchId === id) {
                this.joystick.active = false;
                this.joystick.dx = 0;
                this.joystick.dy = 0;
                this.joystick.touchId = -1;
            }

            if (this.trackpad.active && this.trackpad.touchId === id) {
                this.trackpad.active = false;
                this.trackpad.touchId = -1;
            }
        }
    }

    _detectMobile() {
        if (navigator.maxTouchPoints > 0 && /Mobi|Android/i.test(navigator.userAgent)) {
            return true;
        }
        return false;
    }

    _loadKeyRemap() {
        try {
            const raw = localStorage.getItem('mazearena_keybinds');
            return raw ? JSON.parse(raw) : {};
        } catch (_) {
            return {};
        }
    }

    _saveKeyRemap() {
        try {
            localStorage.setItem('mazearena_keybinds', JSON.stringify(this.keyRemap || {}));
        } catch (_) {}
    }

    _sanitizeReservedBindings() {
        if (!this.keyRemap || typeof this.keyRemap !== 'object') return;
        let dirty = false;
        for (const key of Object.keys(this.keyRemap)) {
            if (this.keyRemap[key] === 'Escape') {
                delete this.keyRemap[key];
                dirty = true;
            }
        }
        if (dirty) this._saveKeyRemap();
    }
}
