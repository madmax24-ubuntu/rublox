import * as THREE from 'three';

export class Input {
    constructor() {
        this.keys = {};
        this.mouse = { x: 0, y: 0, deltaX: 0, deltaY: 0 };
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
            centerX: 0,
            centerY: 0,
            active: false
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
    }

    setupMouse() {
        document.addEventListener('mousemove', (e) => {
            this.mouse.deltaX = e.movementX || 0;
            this.mouse.deltaY = e.movementY || 0;
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        document.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.keys['MouseLeft'] = true;
            if (e.button === 2) this.keys['MouseRight'] = true;
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.keys['MouseLeft'] = false;
            if (e.button === 2) this.keys['MouseRight'] = false;
        });

        document.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    setupTouch() {
        const stick = document.getElementById('touchStick');
        const knob = document.getElementById('touchKnob');
        const touchJump = document.getElementById('touchJump');
        const touchAttack = document.getElementById('touchAttack');
        const touchInteract = document.getElementById('touchInteract');

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
            return Boolean(target.closest('.touch-btn') || target.closest('#inventory'));
        };

        document.addEventListener('touchstart', (e) => {
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.style.display !== 'none') return;
            e.preventDefault();
            for (const touch of e.changedTouches) {
                if (isButtonTarget(touch)) continue;
                if (touch.clientX < window.innerWidth / 2 && this.touch.moveId === null) {
                    this.touch.moveId = touch.identifier;
                    this.touch.centerX = touch.clientX;
                    this.touch.centerY = touch.clientY;
                    if (stick) {
                        stick.style.left = `${this.touch.centerX}px`;
                        stick.style.top = `${this.touch.centerY}px`;
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
                    let dx = touch.clientX - this.touch.centerX;
                    let dy = touch.clientY - this.touch.centerY;
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
    }

    resetLook() {
        this.touch.lookDeltaX = 0;
        this.touch.lookDeltaY = 0;
        this.touch.lastLookX = 0;
        this.touch.lastLookY = 0;
        this.touch.lookId = null;
    }

    isKeyPressed(code) {
        return this.keys[code] === true;
    }

    getMouseDelta() {
        return { x: 0, y: 0 };
    }

    getTouchDelta() {
        return { x: this.touch.moveX * 0.1, y: this.touch.moveY * 0.1 };
    }

    getLookDelta() {
        const delta = { x: this.touch.lookDeltaX, y: this.touch.lookDeltaY };
        this.touch.lookDeltaX = 0;
        this.touch.lookDeltaY = 0;
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
