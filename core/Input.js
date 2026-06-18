import * as THREE from "/node_modules/three/build/three.module.js";

export class Input {
    constructor() {
        this.keys = {};
        this.isMobile = (
            'ontouchstart' in window
            || navigator.maxTouchPoints > 0
            || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
        );
        this.keyRemap = this.loadKeyRemap();
        this.sanitizeReservedBindings();
        this.mouse = {
            lookDeltaX: 0,
            lookDeltaY: 0,
            lastClientX: 0,
            lastClientY: 0,
            hasLast: false
        };
        this.touch = {
            moveId: null,
            lookId: null,
            moveX: 0,
            moveY: 0,
            lookDeltaX: 0,
            lookDeltaY: 0,
            lookStartX: 0,
            lookStartY: 0,
            radius: 72,
            deadzone: 10,
            centerX: 0,
            centerY: 0
        };
        this.setupKeyboard();
        this.setupMouse();
        this.setupTouch();
    }

    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        window.addEventListener('blur', () => this.clearInputState());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.clearInputState();
        });
    }

    setupMouse() {
        document.addEventListener('mousemove', (e) => {
            const dx = Number.isFinite(e.movementX)
                ? e.movementX
                : (this.mouse.hasLast ? e.clientX - this.mouse.lastClientX : 0);
            const dy = Number.isFinite(e.movementY)
                ? e.movementY
                : (this.mouse.hasLast ? e.clientY - this.mouse.lastClientY : 0);
            this.mouse.lookDeltaX += dx;
            this.mouse.lookDeltaY += dy;
            this.mouse.lastClientX = e.clientX;
            this.mouse.lastClientY = e.clientY;
            this.mouse.hasLast = true;
        });
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.keys.MouseLeft = true;
            if (e.button === 2) this.keys.MouseRight = true;
        });
        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.keys.MouseLeft = false;
            if (e.button === 2) this.keys.MouseRight = false;
        });
        const prevent = (e) => e.preventDefault();
        document.addEventListener('contextmenu', prevent, { capture: true });
        document.addEventListener('selectstart', prevent, { capture: true });
        document.addEventListener('dragstart', prevent, { capture: true });
    }

    setupTouch() {
        const removeZone = (id) => {
            const el = document.getElementById(id);
            if (el?.parentNode) el.parentNode.removeChild(el);
        };
        if (!this.isMobile) {
            removeZone('touchMoveZone');
            removeZone('touchLookZone');
            return;
        }

        const stick = document.getElementById('touchStick');
        const knob = document.getElementById('touchKnob');
        const touchJump = document.getElementById('touchJump');
        const touchAttack = document.getElementById('touchAttack');
        const touchInteract = document.getElementById('touchInteract');

        const ensureZone = (id, left, right) => {
            let zone = document.getElementById(id);
            if (!zone) {
                zone = document.createElement('div');
                zone.id = id;
                document.body.appendChild(zone);
            }
            zone.style.position = 'fixed';
            zone.style.top = '0';
            zone.style.bottom = '0';
            zone.style.left = left;
            zone.style.right = right;
            zone.style.zIndex = '2';
            zone.style.background = 'transparent';
            zone.style.touchAction = 'none';
            return zone;
        };

        const moveZone = ensureZone('touchMoveZone', '0', '50%');
        const lookZone = ensureZone('touchLookZone', '50%', '0');

        const updateRadius = () => {
            const rect = stick?.getBoundingClientRect?.();
            if (rect?.width) this.touch.radius = rect.width * 0.45;
        };
        updateRadius();
        window.addEventListener('resize', updateRadius);
        window.addEventListener('orientationchange', updateRadius);

        const isUiTarget = (touch) => {
            const target = touch?.target;
            if (!target?.closest) return false;
            return Boolean(
                target.closest('.touch-btn')
                || target.closest('#touchButtons')
                || target.closest('#inventory')
                || target.closest('#perkButton')
                || target.closest('#perkPanel')
                || target.closest('#perkBackdrop')
                || target.closest('#pauseOverlay')
            );
        };

        const setKnob = (dx, dy) => {
            if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
        };

        const resetKnob = () => {
            if (knob) knob.style.transform = 'translate(0px, 0px)';
            if (stick) stick.style.opacity = '0.35';
        };

        const onStart = (e, zone) => {
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.style.display !== 'none') return;
            for (const touch of e.changedTouches) {
                if (isUiTarget(touch)) continue;
                if (zone === 'move' && this.touch.moveId === null) {
                    this.touch.moveId = touch.identifier;
                    this.touch.centerX = touch.clientX;
                    this.touch.centerY = touch.clientY;
                    this.touch.moveX = 0;
                    this.touch.moveY = 0;
                    if (stick) {
                        stick.style.left = `${touch.clientX}px`;
                        stick.style.top = `${touch.clientY}px`;
                        stick.style.opacity = '0.72';
                    }
                    e.preventDefault();
                }
                if (zone === 'look' && this.touch.lookId === null) {
                    this.touch.lookId = touch.identifier;
                    this.touch.lookStartX = touch.clientX;
                    this.touch.lookStartY = touch.clientY;
                    e.preventDefault();
                }
            }
        };

        const onMove = (e, zone) => {
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.style.display !== 'none') return;
            for (const touch of e.changedTouches) {
                if (zone === 'move' && this.touch.moveId === touch.identifier) {
                    let dx = touch.clientX - this.touch.centerX;
                    let dy = touch.clientY - this.touch.centerY;
                    const dist = Math.hypot(dx, dy);
                    if (dist > this.touch.radius) {
                        const ratio = this.touch.radius / dist;
                        dx *= ratio;
                        dy *= ratio;
                    }
                    this.touch.moveX = dx;
                    this.touch.moveY = dy;
                    setKnob(dx, dy);
                    e.preventDefault();
                }
                if (zone === 'look' && this.touch.lookId === touch.identifier) {
                    const dx = touch.clientX - this.touch.lookStartX;
                    const dy = touch.clientY - this.touch.lookStartY;
                    this.touch.lookDeltaX += dx;
                    this.touch.lookDeltaY += dy;
                    this.touch.lookStartX = touch.clientX;
                    this.touch.lookStartY = touch.clientY;
                    e.preventDefault();
                }
            }
        };

        const clearTouch = (touch) => {
            if (this.touch.moveId === touch.identifier) {
                this.touch.moveId = null;
                this.touch.moveX = 0;
                this.touch.moveY = 0;
                resetKnob();
            }
            if (this.touch.lookId === touch.identifier) {
                this.touch.lookId = null;
            }
        };

        const onEnd = (e) => {
            for (const touch of e.changedTouches) clearTouch(touch);
        };

        moveZone.addEventListener('touchstart', (e) => onStart(e, 'move'), { passive: false });
        moveZone.addEventListener('touchmove', (e) => onMove(e, 'move'), { passive: false });
        moveZone.addEventListener('touchend', onEnd, { passive: false });
        moveZone.addEventListener('touchcancel', onEnd, { passive: false });
        lookZone.addEventListener('touchstart', (e) => onStart(e, 'look'), { passive: false });
        lookZone.addEventListener('touchmove', (e) => onMove(e, 'look'), { passive: false });
        lookZone.addEventListener('touchend', onEnd, { passive: false });
        lookZone.addEventListener('touchcancel', onEnd, { passive: false });

        const bindHold = (el, key) => {
            if (!el) return;
            const down = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.keys[key] = true;
            };
            const up = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.keys[key] = false;
            };
            el.addEventListener('touchstart', down, { passive: false });
            el.addEventListener('touchend', up, { passive: false });
            el.addEventListener('touchcancel', up, { passive: false });
        };

        bindHold(touchJump, 'Space');
        bindHold(touchAttack, 'MouseLeft');
        bindHold(touchInteract, 'KeyE');
    }

    loadKeyRemap() {
        try {
            const raw = localStorage.getItem('mazearena_keybinds');
            return raw ? JSON.parse(raw) : {};
        } catch (_) {
            return {};
        }
    }

    saveKeyRemap() {
        try {
            localStorage.setItem('mazearena_keybinds', JSON.stringify(this.keyRemap || {}));
        } catch (_) {}
    }

    sanitizeReservedBindings() {
        if (!this.keyRemap || typeof this.keyRemap !== 'object') return;
        let dirty = false;
        for (const key of Object.keys(this.keyRemap)) {
            if (this.keyRemap[key] === 'Escape') {
                delete this.keyRemap[key];
                dirty = true;
            }
        }
        if (dirty) this.saveKeyRemap();
    }

    setKeyRemap(logical, physical) {
        if (!logical || !physical || physical === 'Escape') return;
        if (!this.keyRemap) this.keyRemap = {};
        for (const key of Object.keys(this.keyRemap)) {
            if (this.keyRemap[key] === physical && key !== logical) delete this.keyRemap[key];
        }
        this.keyRemap[logical] = physical;
        this.saveKeyRemap();
    }

    getKeyRemap() {
        return this.keyRemap || {};
    }

    resolveKey(code) {
        return this.keyRemap?.[code] || code;
    }

    isKeyPressed(code) {
        return !!this.keys[this.resolveKey(code)];
    }

    clearInputState() {
        this.keys = {};
        this.touch.moveX = 0;
        this.touch.moveY = 0;
        this.touch.lookDeltaX = 0;
        this.touch.lookDeltaY = 0;
        this.touch.moveId = null;
        this.touch.lookId = null;
        this.mouse.lookDeltaX = 0;
        this.mouse.lookDeltaY = 0;
        this.mouse.hasLast = false;
    }

    resetLook() {
        this.touch.lookDeltaX = 0;
        this.touch.lookDeltaY = 0;
        this.touch.lookId = null;
        this.mouse.lookDeltaX = 0;
        this.mouse.lookDeltaY = 0;
        this.mouse.hasLast = false;
    }

    getMouseDelta() {
        return { x: 0, y: 0 };
    }

    getTouchDelta() {
        return { x: this.touch.moveX * 0.1, y: this.touch.moveY * 0.1 };
    }

    getLookDelta() {
        const delta = {
            x: this.mouse.lookDeltaX + this.touch.lookDeltaX * 1.9,
            y: this.mouse.lookDeltaY + this.touch.lookDeltaY * 1.9
        };
        this.mouse.lookDeltaX = 0;
        this.mouse.lookDeltaY = 0;
        this.touch.lookDeltaX = 0;
        this.touch.lookDeltaY = 0;
        return delta;
    }

    getMovementAxes() {
        let moveX = 0;
        let moveZ = 0;
        if (this.isKeyPressed('KeyW')) moveZ -= 1;
        if (this.isKeyPressed('KeyS')) moveZ += 1;
        if (this.isKeyPressed('KeyA')) moveX -= 1;
        if (this.isKeyPressed('KeyD')) moveX += 1;
        const dx = this.touch.moveX;
        const dy = this.touch.moveY;
        const dist = Math.hypot(dx, dy);
        if (dist > this.touch.deadzone) {
            moveX += dx / this.touch.radius;
            moveZ += dy / this.touch.radius;
        }
        return {
            x: Math.max(-1, Math.min(1, moveX)),
            z: Math.max(-1, Math.min(1, moveZ))
        };
    }

    getMovementVector() {
        const a = this.getMovementAxes();
        const v = new THREE.Vector3(a.x, 0, a.z);
        if (v.lengthSq() > 1) v.normalize();
        return v;
    }
}
