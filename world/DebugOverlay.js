import * as THREE from "three";

// Debug overlay: FPS counter, bounding boxes, sector visualization
// IMPORTANT: Does NOT control camera — camera stays in main.js hands
export class DebugOverlay {
    constructor(scene, map, renderer, camera, controls) {
        this.scene = scene;
        this.map = map;
        this.renderer = renderer;
        this.camera = camera;
        this.controls = controls;
        this.enabled = false;
        this.fps = 60;
        this.frameCount = 0;
        this.lastFpsTime = performance.now();
        this.overlay = null;
        this.bboxHelper = null;
        this._sectorLines = null;
    }

    enable() {
        if (this.enabled) return;
        this.enabled = true;
        this._createOverlay();
        this._createBoundingHelpers();
        this._drawSectorBoundaries();
    }

    disable() {
        this.enabled = false;
        if (this.overlay) {
            document.body.removeChild(this.overlay);
            this.overlay = null;
        }
        this._removeBoundingHelpers();
        this._clearSectorBoundaries();
    }

    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
    }

    _createOverlay() {
        const div = document.createElement("div");
        div.id = "debug-overlay";
        div.style.cssText = `
            position: fixed; top: 10px; right: 10px; z-index: 99999;
            font-family: 'Courier New', monospace; font-size: 13px;
            color: #0f0; background: rgba(0,0,0,0.7); padding: 10px 14px;
            border: 1px solid #0f0; border-radius: 4px;
            user-select: none; pointer-events: none; line-height: 1.6;
        `;
        div.innerHTML = `
            <div style="font-weight:bold; font-size:15px; color:#f00; text-shadow: 0 0 4px #f00; margin-bottom:6px;">TEST MODE</div>
            <div>📡 Sectors: <span class="sector-count">8</span></div>
            <div>📦 Colliders: <span class="collider-count">0</span></div>
            <div>🏗️ Spawn pads: <span class="pad-count">0</span></div>
            <div>👥 Player: <span class="player-count">0</span></div>
        `;
        document.body.appendChild(div);
        this.overlay = div;
    }

    _createBoundingHelpers() {
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const boxMat = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.35 });

        const bbox = new THREE.Group();
        bbox.name = "debug_bounding_boxes";

        // Spawn pad markers
        const pads = this.map.getSpawnPads?.() || [];
        for (const pad of pads) {
            const box = new THREE.LineSegments(
                new THREE.EdgesGeometry(boxGeo),
                new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4 })
            );
            box.position.set(pad.x, 0.5, pad.z);
            box.scale.set(2.2, 1, 2.2);
            box.userData.mapGenerated = true;
            bbox.add(box);
        }

        // Building bounding boxes (filter out tiny props)
        const colliders = this.map.getColliders?.() || [];
        for (const col of colliders) {
            if (!col?.min || !col?.max) continue;
            const w = col.max.x - col.min.x;
            const h = col.max.y - col.min.y;
            const d = col.max.z - col.min.z;
            if (w < 2 && h < 2 && d < 2) continue; // Skip tiny props

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

    _drawSectorBoundaries() {
        if (!this.voronoi?.sectors) return;
        const sectors = this.voronoi.sectors;
        const positions = [];
        const colors = [];

        for (const sector of sectors) {
            const b = sector.bounds;
            const c = new THREE.Color(sector.terrainColor);
            // Draw bounding box edges
            positions.push(
                b.minX, 0, b.minZ,  b.maxX, 0, b.minZ,
                b.maxX, 0, b.minZ,  b.maxX, 0, b.maxZ,
                b.maxX, 0, b.maxZ,  b.minX, 0, b.maxZ,
                b.minX, 0, b.maxZ,  b.minX, 0, b.minZ
            );
            for (let i = 0; i < 8; i++) {
                colors.push(c.r, c.g, c.b);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5 });
        const lines = new THREE.LineSegments(geo, mat);
        lines.userData.mapGenerated = true;
        this.scene.add(lines);
        this._sectorLines = lines;
    }

    _clearSectorBoundaries() {
        if (this._sectorLines) {
            this.scene.remove(this._sectorLines);
            this._sectorLines.geometry.dispose();
            this._sectorLines.material.dispose();
            this._sectorLines = null;
        }
    }

    update(delta, playerPosition) {
        if (!this.enabled) return;

        // FPS counter
        this.frameCount++;
        const now = performance.now();
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

        // Update overlay info (every ~1 second)
        if (this.overlay && now - this.lastFpsTime > 400) {
            const pads = this.map.getSpawnPads?.() || [];
            const colliders = this.map.getColliders?.() || [];
            const buildingEl = this.overlay.querySelector(".pad-count");
            const colliderEl = this.overlay.querySelector(".collider-count");
            const playerEl = this.overlay.querySelector(".player-count");

            if (buildingEl) buildingEl.textContent = pads.length;
            if (colliderEl) colliderEl.textContent = colliders.length;
            if (playerEl) playerEl.textContent = playerPosition ? "1" : "0";
        }
    }

    // Set reference to voronoi for sector boundary drawing
    setVoronoi(voronoi) {
        this.voronoi = voronoi;
        if (this.enabled) {
            this._clearSectorBoundaries();
            this._drawSectorBoundaries();
        }
    }
}
