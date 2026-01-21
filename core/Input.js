import * as THREE from 'three';

export class Input {
    constructor() {
        this.keys = {};
        this.mouse = { x: 0, y: 0, deltaX: 0, deltaY: 0 };
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
            lastLookY: 0
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
        const touchArea = document.getElementById('touchArea');
        const touchJump = document.getElementById('touchJump');
        const touchAttack = document.getElementById('touchAttack');
        const touchInteract = document.getElementById('touchInteract');

        void touchStick;
        void touchArea;

        document.addEventListener('touchstart', (e) => {
            const startScreen = document.getElementById('startScreen');
            if (startScreen && startScreen.style.display !== 'none') return;
            e.preventDefault();
            for (const touch of e.changedTouches) {
                if (touch.clientX < window.innerWidth / 2 && this.touch.moveId === null) {
                    this.touch.startX = touch.clientX;
                    this.touch.startY = touch.clientY;
                    this.touch.isActive = true;
                    this.touch.moveId = touch.identifier;
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
                    this.touch.currentX = touch.clientX - this.touch.startX;
                    this.touch.currentY = touch.clientY - this.touch.startY;
                } else if (this.touch.lookId === touch.identifier) {
                    this.touch.lookDeltaX += touch.clientX - this.touch.lastLookX;
                    this.touch.lookDeltaY += touch.clientY - this.touch.lastLookY;
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

        if (this.touch.isActive) {
            move.x += this.touch.currentX * 0.01;
            move.z += this.touch.currentY * 0.01;
        }

        return move.normalize();
    }
}
