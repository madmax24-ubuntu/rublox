import * as THREE from "three";

// Debug overlay with camera modes, FPS counter, bounding boxes, sector visualization
export class DebugOverlay {
    constructor(scene, map, renderer, camera, controls) {
        this.scene = scene;
        this.map = map;
        this.renderer = renderer;
        this.camera = camera;
        this.controls = controls;
        this.enabled = false;
        this.modeIndex = 0;
        this.modes = ["orbit", "topDown", "playerFollow"];
        this.lastSwitch = 0;
        this.switchInterval = 8000; // Auto-switch every 8 seconds
        this.fps = 60;
        this.frameCount = 0;
        this.lastFpsTime = performance.now();
        this.overlay = null;
        this.bboxHelper = null;
        this._prevCameraPos = null;

        // Camera state
        this.cameraPos = new THREE.Vector3(0, 150, 200);
        this.cameraTarget = new THREE.Vector3(0, 0, 0);
        this._viewMatrix = new THREE.Matrix4();
        this._projMatrix = new THREE.Matrix4();
    }

    enable() {
        if (this.enabled) return;
        this.enabled = true;
        this._createOverlay();
        this._createBoundingHelpers();
    }

    disable() {
        this.enabled = false;
        if (this.overlay) {
            document.body.removeChild(this.overlay);
            this.overlay = null;
        }
        this._removeBoundingHelpers();
    }

    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
    }

    switchMode() {
        this.modeIndex = (this.modeIndex + 1) % this.modes.length;
        if (this.overlay) {
            const modeEl = this.overlay.querySelector(".mode-label");
            if (modeEl) modeEl.textContent = this.modes[this.modeIndex];
        }
    }

    _createOverlay() {
        const div = document.createElement("div");
        div.style.cssText = `
            position: fixed; top: 0; left: 0; z-index: 99999;
            font-family: 'Courier New', monospace; font-size: 13px;
            color: #0f0; background: rgba(0,0,0,0.7); padding: 10px 14px;
            border: 1px solid #0f0; border-radius: 4px;
            user-select: none; pointer-events: none; line-height: 1.6;
        `;
        div.innerHTML = `
            <div style="font-weight:bold; font-size:15px; color:#f00; text-shadow: 0 0 4px #f00;">TEST MODE</div>
            <div>📷 <span class="mode-label">orbit</span></div>
            <div>⚡ FPS: <span class="fps-counter">60</span></div>
            <div>🏗️ Buildings: <span class="building-count">0</span></div>
            <div>📡 Sectors: <span class="sector-count">0</span></div>
            <div>📦 Colliders: <span class="collider-count">0</span></div>
            <div>👥 Players: <span class="player-count">0</span></div>
        `;
        document.body.appendChild(div);
        this.overlay = div;
    }

    _createBoundingHelpers() {
        // Wireframe bounding boxes around all buildings
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const boxMat = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4 });

        const bbox = new THREE.Group();
        bbox.name = "debug_bounding_boxes";

        // Get building data from map (spawn pads and colliders)
        const pads = this.map.getSpawnPads?.() || [];
        for (const pad of pads) {
            const box = new THREE.LineSegments(
                new THREE.EdgesGeometry(boxGeo),
                new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 })
            );
            box.position.set(pad.x, 0.5, pad.z);
            box.scale.set(2.2, 1, 2.2);
            box.userData.mapGenerated = true;
            bbox.add(box);
        }

        // Building bounding boxes from colliders
        const colliders = this.map.getColliders?.() || [];
        for (const col of colliders) {
            if (!col?.min || !col?.max) continue;
            const w = col.max.x - col.min.x;
            const h = col.max.y - col.min.y;
            const d = col.max.z - col.min.z;
            if (w < 3 && h < 3 && d < 3) continue; // Skip small props

            const box = new THREE.LineSegments(
                new THREE.EdgesGeometry(boxGeo),
                boxMat.clone()
            );
            box.position.set(
                (col.min.x + col.max.x) / 2,
                (col.min.y + col.max.y) / 2,
                (col.min.z + col.max.z) / 2
            );
            box.scale.set(w, h, d);
            box.userData.mapGenerated = true;
            bbox.add(box);
        }

        this.scene.add(bbox);
        this.bboxHelper = bbox;
    }

    _removeBoundingHelpers() {
        if (this.bboxHelper) {
            this.scene.remove(this.bboxHelper);
            this.bboxHelper.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            this.bboxHelper = null;
        }
    }

    update(delta, playerPosition) {
        if (!this.enabled) return;

        // Auto-switch camera
        const now = performance.now();
        if (now - this.lastSwitch > this.switchInterval) {
            this.switchMode();
            this.lastSwitch = now;
        }

        // Update camera position based on mode
        this._updateCameraMode();

        // FPS counter
        this.frameCount++;
        if (now - this.lastFpsTime > 500) {
            this.fps = Math.round(this.frameCount / ((now - this.lastFpsTime) / 1000) * 2);
            this.frameCount = 0;
            this.lastFpsTime = now;

            if (this.overlay) {
                const fpsEl = this.overlay.querySelector(".fps-counter");
                if (fpsEl) {
                    fpsEl.textContent = this.fps;
                    fpsEl.style.color = this.fps >= 50 ? "#0f0" : this.fps >= 30 ? "#ff0" : "#f00";
                }
            }
        }

        // Update overlay info
        this._updateOverlayInfo(playerPosition);
    }

    _updateCameraMode() {
        const mode = this.modes[this.modeIndex];
        const mapCenter = new THREE.Vector3(0, 0, 0);

        switch (mode) {
            case "orbit":
                if (this.controls) {
                    this.controls.enabled = true;
                }
                break;
            case "topDown":
                if (this.controls) this.controls.enabled = false;
                this.camera.position.set(
                    this.cameraTarget.x,
                    180,
                    this.cameraTarget.z + 150
                );
                this.camera.lookAt(this.cameraTarget);
                if (this.controls) {
                    this.controls.target.copy(this.cameraTarget);
                    this.controls.update();
                }
                break;
            case "playerFollow":
                if (this.controls) this.controls.enabled = false;
                if (playerPosition) {
                    this.camera.position.set(
                        playerPosition.x + 20,
                        playerPosition.y + 30,
                        playerPosition.z + 20
                    );
                    this.camera.lookAt(playerPosition);
                }
                break;
        }
    }

    _updateOverlayInfo(playerPosition) {
        if (!this.overlay) return;

        const pads = this.map.getSpawnPads?.() || [];
        const colliders = this.map.getColliders?.() || [];

        const buildingEl = this.overlay.querySelector(".building-count");
        const sectorEl = this.overlay.querySelector(".sector-count");
        const colliderEl = this.overlay.querySelector(".collider-count");
        const playerEl = this.overlay.querySelector(".player-count");

        if (buildingEl) buildingEl.textContent = pads.length;
        if (sectorEl) sectorEl.textContent = "8";
        if (colliderEl) colliderEl.textContent = colliders.length;
        if (playerEl) playerEl.textContent = playerPosition ? "1" : "0";
    }

    // Key handler
    onKeyDown(event) {
        if (!this.enabled) return;
        if (event.key === "c" || event.key === "C" || event.key === "ф" || event.key === "Ф") {
            this.switchMode();
        }
    }
}
