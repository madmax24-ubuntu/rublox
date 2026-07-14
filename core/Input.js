import * as THREE from 'three';

export class Input {
    constructor() {
        this.keys = {};
        this.mouse = {
            x: 0,
            y: 0,
            deltaX: 0,
            deltaY: 0,
            lookDeltaX: 0,
            lookDeltaY: 0,
            lastClientX: 0,
            lastClientY: 0,
            hasLast: false
        };
        this.isMobile = (
            'ontouchstart' in window
            || navigator.maxTouchPoints > 0
            || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
        );
        this.touch = {
            moveId: null,
            lookId: null,
            moveX: 0,
            moveY: 0,
            lookDeltaX: 0,
            lookDeltaY: 0,
            lastLookX: 0,
            lastLookY: 0,
            deadzone: 8,
            radius: 60,
            originX: 0,
            originY: 0,
            active: false
        };

        this.keyRemap = this.loadKeyRemap();
        this.sanitizeReservedBindings();

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

        // Prevent stuck keys when browser focus changes (pause/menu/fullscreen transitions).
        window.addEventListener('blur', () => {
            this.clearInputState();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.clearInputState();
        });
    }

    setupMouse() {
        document.addEventListener('mousemove', (e) => {
            this.mouse.deltaX = e.movementX || 0;
            this.mouse.deltaY = e.movementY || 0;
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;

            // Accumulate pointer-lock movement as look delta (primary FPS control)
            if (document.pointerLockElement) {
                this.mouse.lookDeltaX += e.movementX || 0;
                this.mouse.lookDeltaY += e.movementY || 0;
            } else if (!this.isMobile) {
                const startScreen = document.getElementById('startScreen');
                const isPlaying = !startScreen || startScreen.style.display === 'none';
                if (isPlaying && this.mouse.hasLast) {
                    this.mouse.lookDeltaX += e.clientX - this.mouse.lastClientX;
                    this.mouse.lookDeltaY += e.clientY - this.mouse.lastClientY;
                }
                this.mouse.lastClientX = e.clientX;
                this.mouse.lastClientY = e.clientY;
                this.mouse.hasLast = true;
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.keys['MouseLeft'] = true;
            if (e.button === 2) this.keys['MouseRight'] = true;
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.keys['MouseLeft'] = false;
            if (e.button === 2) this.keys['MouseRight'] = false;
        });

        const prevent = (e) => e.preventDefault();
        document.addEventListener('contextmenu', prevent, { capture: true });
        document.addEventListener('selectstart', prevent, { capture: true });
        document.addEventListener('dragstart', prevent, { capture: true });
    }

    setupTouch() {
        const stick = document.getElementById('touchStick');
        const knob = document.getElementById('touchKnob');
        const touchJump = document.getElementById('touchJump');
        const touchAttack = document.getElementById('touchAttack');
        const touchInteract = document.getElementById('touchInteract');
        const touchHelp = null;
        const touchEnemy = null;
        const touchGather = null;

        const updateStickRadius = () => {
            if (!stick) return;
            const rect = stick.getBoundingClientRect();
            this.touch.radius = rect.width * 0.45;
        };

        updateStickRadius();
        window.addEventListener('resize', updateStickRadius);
        window.addEventListener('orientationchange', updateStickRadius);

        const setKnob = (dx, dy) => {
            if (!knob) return;
            knob.style.transform = `translate(${dx}px, ${dy}px)`;
        };

        const resetKnob = () => {
            if (!knob) return;
            knob.style.transform = 'translate(0px, 0px)';
        };

        const isButtonTarget = (touch) => {
            const target = touch?.target;
            if (!target || !target.closest) return false;
            return Boolean(
                target.closest('.touch-btn') ||
                target.closest('#touchButtons') ||
                target.closest('#inventory') ||
                target.closest('#perkButton') ||
                target.closest('#perkPanel')
            );
        };

        document.addEventListener('touchstart', (e) => {
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.style.display !== 'none') return;
            e.preventDefault();
            for (const touch of e.changedTouches) {
                if (isButtonTarget(touch)) continue;
                if (touch.clientX < window.innerWidth / 2 && this.touch.moveId === null) {
                    this.touch.moveId = touch.identifier;
                    this.touch.originX = touch.clientX;
                    this.touch.originY = touch.clientY;
                    if (stick) {
                        const rect = stick.getBoundingClientRect();
                        this.touch.defaultX = rect.left;
                        this.touch.defaultY = rect.top;
                        stick.style.left = `${this.touch.originX}px`;
                        stick.style.top = `${this.touch.originY}px`;
                        stick.style.opacity = '0.7';
                    }
                    this.touch.active = true;
                } else if (touch.clientX >= window.innerWidth / 2 && this.touch.lookId === null) {
                    this.touch.lookId = touch.identifier;
                    this.touch.lastLookX = touch.clientX;
                    this.touch.lastLookY = touch.clientY;
                }
            }
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.style.display !== 'none') return;
            e.preventDefault();
            for (const touch of e.changedTouches) {
                if (this.touch.moveId === touch.identifier) {
                    // Use original touch point, not updated center
                    let dx = touch.clientX - this.touch.originX;
                    let dy = touch.clientY - this.touch.originY;
                    const dist = Math.hypot(dx, dy);
                    const max = this.touch.radius;
                    if (dist > max) {
                        const ratio = max / dist;
                        dx *= ratio;
                        dy *= ratio;
                    }
                    this.touch.moveX = dx;
                    this.touch.moveY = dy;
                    setKnob(dx, dy);
                    // Update stick position to follow touch
                    if (stick) {
                        stick.style.left = `${touch.clientX}px`;
                        stick.style.top = `${touch.clientY}px`;
                    }
                } else if (this.touch.lookId === touch.identifier) {
                    const dx = touch.clientX - this.touch.lastLookX;
                    const dy = touch.clientY - this.touch.lastLookY;
                    this.touch.lookDeltaX += dx;
                    this.touch.lookDeltaY += dy;
                    this.touch.lastLookX = touch.clientX;
                    this.touch.lastLookY = touch.clientY;
                }
            }
        }, { passive: false });

        const endTouch = (touch) => {
            if (this.touch.moveId === touch.identifier) {
                this.touch.moveId = null;
                this.touch.moveX = 0;
                this.touch.moveY = 0;
                resetKnob();
                this.touch.active = false;
                if (stick) {
                    stick.style.opacity = '0.35';
                    stick.style.left = `${this.touch.defaultX}px`;
                    stick.style.top = `${this.touch.defaultY}px`;
                    // Reset default on next touch
                    this.touch.defaultX = undefined;
                    this.touch.defaultY = undefined;
                }
            } else if (this.touch.lookId === touch.identifier) {
                this.touch.lookId = null;
            }
        };

        document.addEventListener('touchend', (e) => {
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.style.display !== 'none') return;
            e.preventDefault();
            for (const touch of e.changedTouches) {
                endTouch(touch);
            }
        }, { passive: false });

        document.addEventListener('touchcancel', (e) => {
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.style.display !== 'none') return;
            e.preventDefault();
            for (const touch of e.changedTouches) {
                endTouch(touch);
            }
        }, { passive: false });

        const bindHoldButton = (element, key) => {
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
        };

        bindHoldButton(touchJump, 'Space');
        bindHoldButton(touchAttack, 'MouseLeft');
        bindHoldButton(touchInteract, 'KeyE');
        // Quick command buttons removed for mobile
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
        this.saveKeyRemap();
    }

    getKeyRemap() {
        return this.keyRemap || {};
    }

    resolveKey(code) {
        const remap = this.keyRemap || {};
        return remap[code] || code;
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

    isKeyPressed(code) {
        const resolved = this.resolveKey(code);
        return !!this.keys[resolved];
    }

    resetLook() {
        this.touch.lookDeltaX = 0;
        this.touch.lookDeltaY = 0;
        this.touch.lastLookX = 0;
        this.touch.lastLookY = 0;
        this.touch.lookId = null;
        this.mouse.lookDeltaX = 0;
        this.mouse.lookDeltaY = 0;
        this.mouse.hasLast = false;
    }

    clearInputState() {
        this.keys = {};
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
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

    getMouseDelta() {
        return { x: 0, y: 0 };
    }

    getTouchDelta() {
        return { x: this.touch.moveX * 0.1, y: this.touch.moveY * 0.1 };
    }

    getLookDelta() {
        const delta = {
            x: this.touch.lookDeltaX + this.mouse.lookDeltaX,
            y: this.touch.lookDeltaY + this.mouse.lookDeltaY
        };
        this.touch.lookDeltaX = 0;
        this.touch.lookDeltaY = 0;
        this.mouse.lookDeltaX = 0;
        this.mouse.lookDeltaY = 0;
        return delta;
    }

    getMovementVector() {
        const move = new THREE.Vector3();

        if (this.isKeyPressed('KeyW')) move.z -= 1;
        if (this.isKeyPressed('KeyS')) move.z += 1;
        if (this.isKeyPressed('KeyA')) move.x -= 1;
        if (this.isKeyPressed('KeyD')) move.x += 1;

        const dx = this.touch.moveX;
        const dy = this.touch.moveY;
        const dist = Math.hypot(dx, dy);
        if (dist > this.touch.deadzone) {
            move.x += dx / this.touch.radius;
            move.z += dy / this.touch.radius;
        }

        return move.normalize();
    }
}

