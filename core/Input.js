import * as THREE from 'three';

export class Input {
    constructor() {
        this.keys = {};
        this.mouse = { x: 0, y: 0, deltaX: 0, deltaY: 0 };
        this.isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        this.touch = {
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            isActive: false,
            moveId: null,
            lookId: null,
            lookDeltaX: 0,
            lookDeltaY: 0,
            lastLookX: 0,
            lastLookY: 0,
            deadzone: 8,
            radius: 60
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
        const touchStick = document.getElementById('touchStick');
        const touchKnob = document.getElementById('touchKnob');
        const touchJump = document.getElementById('touchJump');
        const touchAttack = document.getElementById('touchAttack');
        const touchInteract = document.getElementById('touchInteract');

        const setStick = (x, y, dx, dy) => {
            if (!touchStick || !touchKnob) return;
            touchStick.style.left = `${x - this.touch.radius}px`;
            touchStick.style.top = `${y - this.touch.radius}px`;
            touchStick.style.display = 'block';
            touchKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        };

        const resetStick = () => {
            if (!touchStick || !touchKnob) return;
            touchStick.style.display = 'none';
            touchKnob.style.transform = 'translate(0px, 0px)';
        };

        const isButtonTarget = (touch) => {
            const target = touch?.target;
            if (!target || !target.closest) return false;
            return Boolean(target.closest('.touch-btn'));
        };

        document.addEventListener('touchstart', (e) => {
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.style.display !== 'none') return;
            e.preventDefault();
            for (const touch of e.changedTouches) {
                if (isButtonTarget(touch)) continue;
                if (touch.clientX < window.innerWidth / 2 && this.touch.moveId === null) {
                    this.touch.startX = touch.clientX;
                    this.touch.startY = touch.clientY;
                    this.touch.isActive = true;
                    this.touch.moveId = touch.identifier;
                    setStick(touch.clientX, touch.clientY, 0, 0);
                } else if (this.touch.lookId === null) {
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
                    let dx = touch.clientX - this.touch.startX;
                    let dy = touch.clientY - this.touch.startY;
                    const dist = Math.hypot(dx, dy);
                    const max = this.touch.radius;
                    if (dist > max) {
                        const ratio = max / dist;
                        dx *= ratio;
                        dy *= ratio;
                    }
                    this.touch.currentX = dx;
                    this.touch.currentY = dy;
                    setStick(this.touch.startX, this.touch.startY, dx, dy);
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

        document.addEventListener('touchend', (e) => {
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.style.display !== 'none') return;
            e.preventDefault();
            for (const touch of e.changedTouches) {
                if (this.touch.moveId === touch.identifier) {
                    this.touch.isActive = false;
                    this.touch.currentX = 0;
                    this.touch.currentY = 0;
                    this.touch.moveId = null;
                    resetStick();
                } else if (this.touch.lookId === touch.identifier) {
                    this.touch.lookId = null;
                }
            }
        }, { passive: false });

        document.addEventListener('touchcancel', (e) => {
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.style.display !== 'none') return;
            e.preventDefault();
            for (const touch of e.changedTouches) {
                if (this.touch.moveId === touch.identifier) {
                    this.touch.isActive = false;
                    this.touch.currentX = 0;
                    this.touch.currentY = 0;
                    this.touch.moveId = null;
                    resetStick();
                } else if (this.touch.lookId === touch.identifier) {
                    this.touch.lookId = null;
                }
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

    isKeyPressed(code) {
        return this.keys[code] === true;
    }

    getMouseDelta() {
        return { x: 0, y: 0 };
    }

    getTouchDelta() {
        return { x: this.touch.currentX * 0.1, y: this.touch.currentY * 0.1 };
    }

    getLookDelta() {
        const scale = this.isMobile ? 0.4 : 1.0;
        const delta = { x: this.touch.lookDeltaX * scale, y: this.touch.lookDeltaY * scale };
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

        if (this.touch.isActive) {
            const dx = this.touch.currentX;
            const dy = this.touch.currentY;
            const dist = Math.hypot(dx, dy);
            if (dist > this.touch.deadzone) {
                move.x += dx / this.touch.radius;
                move.z += dy / this.touch.radius;
            }
        }

        return move.normalize();
    }
}
