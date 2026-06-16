import * as THREE from "three";
import { VoronoiSectors } from "./VoronoiSectors.js";
import { getTemplatesForBiome, getTemplateByType } from "./BuildingBlueprints.js";
import { InteriorGenerator } from "./InteriorGenerator.js";
import { AABBGrid } from "./AABBGrid.js";
import { DebugOverlay } from "./DebugOverlay.js";

// ============================================================================
// NEW MAP GENERATOR — Voronoi Sectors + Poisson Disk Building Placement
// ============================================================================
export class MapGenerator {
    constructor(scene) {
        this.scene = scene;
        this.seed = 42;

        // Coordinate system — 512x512 map
        this.tileSize = 4;
        this.gridWidth = 128;
        this.gridHeight = 128;
        this.size = this.gridWidth * this.tileSize; // 512
        this.halfSize = this.size / 2; // 256

        // Data
        this.colliders = [];
        this.spawnPads = [];
        this.heightMap = null;
        this.playerSpawn = { x: 0, y: 0 };
        this.voronoi = null;
        this.aabbGrid = null;
        this.debugOverlay = null;

        // Materials cache
        this._terrainMaterial = null;
        this._tmpMatrix = new THREE.Matrix4();
        this._tmpPos = new THREE.Vector3();

        // RNG state
        this._randState = this.seed;

        // Promise for main.js
        this._resolveReady = null;
        this.ready = new Promise((resolve) => { this._resolveReady = resolve; });
        this._generatePromise = null;

        // onProgress callback from main.js
        this.onProgress = null;
    }

    // --- Entry point (called by main.js) ---
    startGeneration() {
        if (!this._generatePromise) {
            this._generatePromise = this._generate();
        }
        return this._generatePromise;
    }

    // ========================================================================
    // MAIN GENERATION PIPELINE
    // ========================================================================
    async _generate() {
        this._reset();

        this._logProgress(0);

        // Phase 1: Voronoi sectors
        this._logProgress(5);
        this.voronoi = new VoronoiSectors(this.scene, this.seed);
        this.voronoi.size = this.size;
        this.voronoi.halfSize = this.halfSize;
        this.voronoi.generate(12);
        this.voronoi.drawBoundaries(this.scene);

        // Phase 2: Terrain
        this._logProgress(15);
        this._generateTerrain();

        // Phase 3: Place buildings via Poisson sampling per sector
        this._logProgress(35);
        const placements = this._placeBuildings();

        // Phase 4: Generate building meshes
        this._logProgress(55);
        this._buildBuildings(placements);

        // Phase 4b: Place cover/shelter objects
        this._logProgress(60);
        this._placeCoverObjects(placements);

        // Phase 5: Environment props (trees, rocks, fences)
        this._logProgress(75);
        this._generateEnvironment();

        // Phase 6: Spawn system
        this._logProgress(85);
        this._buildSpawnPads();

        // Phase 7: Debug
        this._logProgress(95);
        this.aabbGrid = new AABBGrid(2.0);
        this.aabbGrid.buildFromColliders(this.colliders);

        this._logProgress(100);
        this._resolveReady?.();
    }

    // --- Reset state ---
    _reset() {
        this.colliders = [];
        this.spawnPads = [];
        this.heightMap = null;
        this._terrainMaterial = null;

        // Remove old map objects
        const toRemove = [];
        for (const child of this.scene.children) {
            if (child.userData?.mapGenerated) toRemove.push(child);
        }
        for (const obj of toRemove) {
            this.scene.remove(obj);
            obj.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
    }

    // --- Progress callback ---
    _logProgress(pct) {
        if (this.onProgress) this.onProgress(pct / 100);
    }

    // --- Simple RNG ---
    _rand() {
        this._randState = (this._randState * 1664525 + 1013904223) >>> 0;
        return this._randState / 0x100000000;
    }

    // --- Noise helpers (same as original) ---
    hashNoise(x, y, scale = 1) {
        const sx = Math.floor(x * scale);
        const sy = Math.floor(y * scale);
        let h = (sx * 374761393 + sy * 668265263 + this.seed * 1442695041) >>> 0;
        h ^= h >>> 13;
        h = Math.imul(h, 1274126177) >>> 0;
        h ^= h >>> 16;
        return h / 0x100000000;
    }

    smoothstep01(t) {
        return t * t * (3 - 2 * t);
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    valueNoise2D(x, y, salt = 0) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const tx = this.smoothstep01(x - x0);
        const ty = this.smoothstep01(y - y0);
        const v00 = this.hashNoise(x0, y0, 1) + salt;
        const v10 = this.hashNoise(x1, y0, 1) + salt;
        const v01 = this.hashNoise(x0, y1, 1) + salt;
        const v11 = this.hashNoise(x1, y1, 1) + salt;
        const top = this.lerp(v00, v10, tx);
        const bot = this.lerp(v01, v11, tx);
        return this.lerp(top, bot, ty);
    }

    // --- Coordinate conversion ---
    toWorld(x, y) {
        return {
            x: (x - this.gridWidth / 2) * this.tileSize,
            z: (y - this.gridHeight / 2) * this.tileSize
        };
    }

    worldToGrid(x, z) {
        return {
            x: Math.round(x / this.tileSize + this.gridWidth / 2),
            y: Math.round(z / this.tileSize + this.gridHeight / 2)
        };
    }

    // ========================================================================
    // TERRAIN GENERATION (Phases 2)
    // ========================================================================
    _generateTerrain() {
        const gridW = this.gridWidth;
        const gridH = this.gridHeight;

        // Per-sector terrain color grid
        const terrainGrid = new Float32Array(gridW * gridH * 3);

        // Generate base terrain per sector using Voronoi nearest
        for (let gy = 0; gy < gridH; gy++) {
            for (let gx = 0; gx < gridW; gx++) {
                const wx = (gx - gridW / 2) * this.tileSize;
                const wz = (gy - gridH / 2) * this.tileSize;
                const sector = this.voronoi.getSectorDefAt(wx, wz);

                // Sector base color
                const c = new THREE.Color(sector.terrainColor);

                // Blend near sector boundaries
                const nearestId = this.voronoi.getSectorAt(wx, wz);
                let blend = 1.0;
                const sectors = this.voronoi.sectors;
                for (const s of sectors) {
                    const dx = Math.abs(wx - s.center.x);
                    const dz = Math.abs(wz - s.center.z);
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist < s.bounds.radius * 0.7 && s.id !== nearestId) {
                        blend = 0.3;
                        const other = sectors.find(sec => sec.id === s.id);
                        if (other) {
                            const oc = new THREE.Color(other.terrainColor);
                            c.r = this.lerp(c.r, oc.r, blend);
                            c.g = this.lerp(c.g, oc.g, blend);
                            c.b = this.lerp(c.b, oc.b, blend);
                        }
                        break;
                    }
                }

                // Store in terrain grid
                const idx = (gy * gridW + gx) * 3;
                terrainGrid[idx] = c.r;
                terrainGrid[idx + 1] = c.g;
                terrainGrid[idx + 2] = c.b;
            }
        }

        // Build terrain mesh
        const terrainGeo = new THREE.PlaneGeometry(this.size, this.size, gridW - 1, gridH - 1);
        terrainGeo.rotateX(-Math.PI / 2);

        // Vertex colors
        const colors = [];
        for (let i = 0; i < gridW * gridH; i++) {
            const r = terrainGrid[i * 3];
            const g = terrainGrid[i * 3 + 1];
            const b = terrainGrid[i * 3 + 2];
            colors.push(r, g, b);
        }
        terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const terrainMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9,
            flatShading: true
        });
        this._terrainMaterial = terrainMat;

        const terrain = new THREE.Mesh(terrainGeo, terrainMat);
        terrain.position.set(0, 0, 0);
        terrain.userData.mapGenerated = true;
        this.scene.add(terrain);

        // Build height map (flat terrain with slight noise)
        this.heightMap = [];
        for (let gy = 0; gy < gridH; gy++) {
            this.heightMap[gy] = [];
            for (let gx = 0; gx < gridW; gx++) {
                const wx = (gx - gridW / 2) * this.tileSize;
                const wz = (gy - gridH / 2) * this.tileSize;
                // Slight height variation for interest
                const noise = this.valueNoise2D(wx * 0.01, wz * 0.01) * 0.5;
                this.heightMap[gy][gx] = noise;
            }
        }
    }

    // --- Get terrain height at world position ---
    getHeightAt(x, z) {
        if (!this.heightMap) return 0.4;
        const grid = this.worldToGrid(x, z);
        const gx = Math.max(0, Math.min(this.gridWidth - 1, grid.x));
        const gy = Math.max(0, Math.min(this.gridHeight - 1, grid.y));
        const base = this.heightMap?.[gy]?.[gx] ?? 0;
        return base + 0.4;
    }

    // ========================================================================
    // BUILDING PLACEMENT (Phase 3) — Poisson Disk Sampling
    // ========================================================================
    _placeBuildings() {
        const placements = [];
        const sectorBuildings = new Map();
        for (const s of this.voronoi.sectors) {
            sectorBuildings.set(s.id, []);
        }

        for (const sector of this.voronoi.sectors) {
            const templates = getTemplatesForBiome(sector.biome);
            const numBuildings = Math.floor(20 + sector.buildingDensity * 30); // 20-50 per sector

            const bx = sector.bounds.minX;
            const bz = sector.bounds.minZ;
            const bw = sector.bounds.maxX - sector.bounds.minX;
            const bd = sector.bounds.maxZ - sector.bounds.minZ;

            // Grid-based placement: 24m cells
            const gridSize = 24;
            const cols = Math.ceil(bw / gridSize);
            const rows = Math.ceil(bd / gridSize);

            // Which cells get buildings (70% filled, edges always filled)
            const cellOccupied = [];
            for (let r = 0; r < rows; r++) {
                cellOccupied[r] = [];
                for (let c = 0; c < cols; c++) {
                    const isEdge = (r === 0 || r === rows - 1 || c === 0 || c === cols - 1);
                    cellOccupied[r][c] = isEdge || (this._rand() < 0.70);
                }
            }

            // Place buildings in occupied cells
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (!cellOccupied[r]?.[c]) continue;

                    const template = templates[Math.floor(this._rand() * templates.length)];
                    if (!template) continue;

                    const cellCenterX = bx + c * gridSize + gridSize / 2;
                    const cellCenterZ = bz + r * gridSize + gridSize / 2;

                    const halfW = template.width / 2;
                    const halfD = template.depth / 2;
                    const offsetX = (this._rand() - 0.5) * Math.max(1, gridSize - template.width);
                    const offsetZ = (this._rand() - 0.5) * Math.max(1, gridSize - template.depth);

                    const px = Math.max(bx + halfW, Math.min(bx + bw - halfW, cellCenterX + offsetX));
                    const pz = Math.max(bz + halfD, Math.min(bz + bd - halfD, cellCenterZ + offsetZ));

                    sectorBuildings.get(sector.id).push({
                        x: px, z: pz,
                        template,
                        sectorId: sector.id
                    });
                }
            }

            // Extra scattered buildings in open areas
            const extraBuildings = Math.floor(sector.buildingDensity * 15);
            for (let i = 0; i < extraBuildings; i++) {
                const tx = bx + this._rand() * bw;
                const tz = bz + this._rand() * bd;
                const template = templates[Math.floor(this._rand() * templates.length)];
                if (template) {
                    sectorBuildings.get(sector.id).push({
                        x: tx, z: tz,
                        template,
                        sectorId: sector.id
                    });
                }
            }
        }

        // Flatten
        for (const [sectorId, buildings] of sectorBuildings) {
            placements.push(...buildings.map(b => ({ ...b, sectorId })));
        }

        return placements;
    }

    // ========================================================================
    // BUILDING GENERATION (Phase 4)
    // ========================================================================
    _buildBuildings(placements) {
        for (const placement of placements) {
            this.addBuilding(placement);
        }
    }

    // ========================================================================
    // COVER OBJECTS (Phase 4b) — Sandbags, concrete barriers, fences, pallets, tires
    // ========================================================================
    _placeCoverObjects(buildingPositions) {
        const coverTypes = [
            { type: 'sandbag_wall_straight', count: 40 },
            { type: 'sandbag_wall_l', count: 20 },
            { type: 'concrete_barrier_wall', count: 30 },
            { type: 'concrete_barrier_t', count: 10 },
            { type: 'wood_fence_straight', count: 30 },
            { type: 'wood_fence_corner', count: 15 },
            { type: 'pallet_stack', count: 25 },
            { type: 'tire_stack', count: 15 }
        ];

        for (const cover of coverTypes) {
            for (let i = 0; i < cover.count; i++) {
                const x = -this.halfSize + this._rand() * this.size;
                const z = -this.halfSize + this._rand() * this.size;
                const y = this.getHeightAt(x, z);

                // Find nearest building
                let closestDist = Infinity;
                let nearestBp = buildingPositions[0];
                for (const bp of buildingPositions) {
                    const dx = x - bp.x;
                    const dz = z - bp.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist < closestDist) { closestDist = dist; nearestBp = bp; }
                }

                // Prefer placing 4-12m from buildings
                if (closestDist < 3 || closestDist > 20) {
                    const angle = this._rand() * Math.PI * 2;
                    const dist = 5 + this._rand() * 8;
                    this._placeCoverItem(
                        nearestBp.x + Math.cos(angle) * dist,
                        nearestBp.z + Math.sin(angle) * dist,
                        cover.type
                    );
                } else {
                    this._placeCoverItem(x, z, cover.type);
                }
            }
        }

        // Extra props around sector centers
        for (const sector of this.voronoi.sectors) {
            const cx = sector.center.x;
            const cz = sector.center.z;
            for (let i = 0; i < 8; i++) {
                const angle = this._rand() * Math.PI * 2;
                const dist = 5 + this._rand() * 15;
                this._placeCoverItem(
                    cx + Math.cos(angle) * dist,
                    cz + Math.sin(angle) * dist,
                    ['pallet_stack', 'tire_stack', 'sandbag_wall_straight'][Math.floor(this._rand() * 3)]
                );
            }
        }
    }

    _placeCoverItem(x, z, type) {
        const baseY = this.getHeightAt(x, z);

        switch (type) {
            case 'sandbag_wall_straight': {
                const segments = 3 + Math.floor(this._rand() * 3);
                for (let i = 0; i < segments; i++) {
                    const seg = new THREE.Mesh(
                        new THREE.BoxGeometry(0.6, 0.4, 0.35),
                        new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.95, flatShading: true })
                    );
                    seg.position.set(x + i * 0.65, baseY + 0.2, z);
                    seg.userData.mapGenerated = true;
                    seg.userData.physicsType = 'STATIC';
                    this.scene.add(seg);
                    this.addColliderBox(new THREE.Vector3(x + i * 0.65, baseY + 0.2, z), 0.6, 0.4, 0.35, false);
                }
                break;
            }
            case 'sandbag_wall_l': {
                for (let i = 0; i < 3; i++) {
                    const mat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.95, flatShading: true });
                    const segX = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.35), mat);
                    segX.position.set(x + i * 0.65, baseY + 0.2, z);
                    segX.userData.mapGenerated = true;
                    segX.userData.physicsType = 'STATIC';
                    this.scene.add(segX);
                    this.addColliderBox(new THREE.Vector3(x + i * 0.65, baseY + 0.2, z), 0.6, 0.4, 0.35, false);
                    const segZ = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.35), mat);
                    segZ.position.set(x, baseY + 0.2, z + i * 0.65);
                    segZ.userData.mapGenerated = true;
                    segZ.userData.physicsType = 'STATIC';
                    this.scene.add(segZ);
                    this.addColliderBox(new THREE.Vector3(x, baseY + 0.2, z + i * 0.65), 0.6, 0.4, 0.35, false);
                }
                break;
            }
            case 'concrete_barrier_wall': {
                const segments = 3 + Math.floor(this._rand() * 4);
                for (let i = 0; i < segments; i++) {
                    const cb = new THREE.Mesh(
                        new THREE.BoxGeometry(1.2, 0.6, 0.6),
                        new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.95, flatShading: true })
                    );
                    cb.position.set(x + i * 1.3, baseY + 0.3, z);
                    cb.userData.mapGenerated = true;
                    cb.userData.physicsType = 'STATIC';
                    this.scene.add(cb);
                    this.addColliderBox(new THREE.Vector3(x + i * 1.3, baseY + 0.3, z), 1.2, 0.6, 0.6, false);
                }
                break;
            }
            case 'concrete_barrier_t': {
                for (let i = 0; i < 3; i++) {
                    const cb = new THREE.Mesh(
                        new THREE.BoxGeometry(1.2, 0.6, 0.6),
                        new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.95, flatShading: true })
                    );
                    cb.position.set(x + (i - 1) * 1.3, baseY + 0.3, z);
                    cb.userData.mapGenerated = true;
                    cb.userData.physicsType = 'STATIC';
                    this.scene.add(cb);
                    this.addColliderBox(new THREE.Vector3(x + (i - 1) * 1.3, baseY + 0.3, z), 1.2, 0.6, 0.6, false);
                }
                const cap = new THREE.Mesh(
                    new THREE.BoxGeometry(0.6, 0.6, 1.2),
                    new THREE.MeshStandardMaterial({ color: 0x90a4ae, roughness: 0.95, flatShading: true })
                );
                cap.position.set(x, baseY + 0.3, z);
                cap.userData.mapGenerated = true;
                cap.userData.physicsType = 'STATIC';
                this.scene.add(cap);
                this.addColliderBox(new THREE.Vector3(x, baseY + 0.3, z), 0.6, 0.6, 1.2, false);
                break;
            }
            case 'wood_fence_straight': {
                const postMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
                const railMat = new THREE.MeshStandardMaterial({ color: 0xa1887f, roughness: 0.85 });
                for (let i = 0; i < 3; i++) {
                    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 0.15), postMat);
                    post.position.set(x + i * 0.7, baseY + 0.5, z);
                    post.userData.mapGenerated = true;
                    post.userData.physicsType = 'STATIC';
                    this.scene.add(post);
                    this.addColliderBox(new THREE.Vector3(x + i * 0.7, baseY + 0.5, z), 0.15, 1.0, 0.15, false);
                    if (i < 2) {
                        const rail = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.06), railMat);
                        rail.position.set(x + i * 0.7 + 0.35, baseY + 0.75, z);
                        rail.userData.mapGenerated = true;
                        rail.userData.physicsType = 'STATIC';
                        this.scene.add(rail);
                    }
                }
                break;
            }
            case 'wood_fence_corner': {
                const postMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
                for (let i = 0; i < 2; i++) {
                    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 0.15), postMat);
                    post.position.set(x + i * 0.7, baseY + 0.5, z);
                    post.userData.mapGenerated = true;
                    post.userData.physicsType = 'STATIC';
                    this.scene.add(post);
                    this.addColliderBox(new THREE.Vector3(x + i * 0.7, baseY + 0.5, z), 0.15, 1.0, 0.15, false);
                    const postZ = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 0.15), postMat);
                    postZ.position.set(x, baseY + 0.5, z + i * 0.7);
                    postZ.userData.mapGenerated = true;
                    postZ.userData.physicsType = 'STATIC';
                    this.scene.add(postZ);
                    this.addColliderBox(new THREE.Vector3(x, baseY + 0.5, z + i * 0.7), 0.15, 1.0, 0.15, false);
                }
                break;
            }
            case 'pallet_stack': {
                const palletMat = new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.85 });
                const numStacks = 2 + Math.floor(this._rand() * 2);
                for (let i = 0; i < numStacks; i++) {
                    const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.8), palletMat);
                    pallet.position.set(x, baseY + 0.06 + i * 0.14, z);
                    pallet.userData.mapGenerated = true;
                    pallet.userData.physicsType = 'STATIC';
                    this.scene.add(pallet);
                    this.addColliderBox(new THREE.Vector3(x, baseY + 0.06 + i * 0.14, z), 1.2, 0.12, 0.8, false);
                }
                if (this._rand() > 0.3) {
                    const crate = new THREE.Mesh(
                        new THREE.BoxGeometry(0.5, 0.5, 0.5),
                        new THREE.MeshStandardMaterial({ color: 0xa1887f, roughness: 0.9 })
                    );
                    crate.position.set(x, baseY + 0.14 * numStacks + 0.25, z);
                    crate.userData.mapGenerated = true;
                    crate.userData.physicsType = 'STATIC';
                    this.scene.add(crate);
                    this.addColliderBox(new THREE.Vector3(x, baseY + 0.14 * numStacks + 0.25, z), 0.5, 0.5, 0.5, false);
                }
                break;
            }
            case 'tire_stack': {
                const tireMat = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.9 });
                const numTires = 3 + Math.floor(this._rand() * 2);
                for (let i = 0; i < numTires; i++) {
                    const tire = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), tireMat);
                    if (i % 2 === 0) {
                        tire.position.set(x, baseY + 0.175 + i * 0.37, z);
                    } else {
                        tire.rotation.y = Math.PI / 2;
                        tire.position.set(x, baseY + 0.175 + i * 0.37, z);
                    }
                    tire.userData.mapGenerated = true;
                    tire.userData.physicsType = 'STATIC';
                    this.scene.add(tire);
                    this.addColliderBox(new THREE.Vector3(x, baseY + 0.175 + i * 0.37, z), 0.5, 0.35, 0.5, false);
                }
                break;
            }
        }
    }

    // Build walls with window/door openings
    _buildWall(cx, cz, w, d, h, wallThickness, template, wallMat, buildingY, sectorId) {
        const wallH = h;
        const halfW = w / 2;
        const halfD = d / 2;

        // 4 walls: front (+Z), back (-Z), left (-X), right (+X)
        const walls = [
            { axis: 'z', sign: 1, len: w, pos: { dx: 0, dz: halfD }, doors: [], windows: [] },
            { axis: 'z', sign: -1, len: w, pos: { dx: 0, dz: -halfD }, doors: [], windows: [] },
            { axis: 'x', sign: -1, len: d, pos: { dx: -halfW, dz: 0 }, doors: [], windows: [] },
            { axis: 'x', sign: 1, len: d, pos: { dx: halfW, dz: 0 }, doors: [], windows: [] }
        ];

        // Populate doors and windows for each wall from template
        for (const door of template.doors || []) {
            const wallIdx = this._findWallForDoor(walls, door, cx, cz, halfW, halfD);
            if (wallIdx >= 0) {
                walls[wallIdx].doors.push(door);
            }
        }

        for (const win of template.windows || []) {
            const wallIdx = this._findWallForWindow(walls, win, cx, cz, halfW, halfD);
            if (wallIdx >= 0) {
                walls[wallIdx].windows.push(win);
            }
        }

        // Build each wall
        for (let wi = 0; wi < walls.length; wi++) {
            const wall = walls[wi];
            const { len, pos, doors, windows } = wall;

            // Sort doors and windows by position
            const openings = [...doors.map(d => ({ pos: d.dx || 0, size: d.width || 1.2, type: 'door' })),
                              ...windows.map(w => ({ pos: w.dx || 0, size: w.width || 0.8, type: 'window' }))];
            openings.sort((a, b) => a.pos - b.pos);

            // Build wall segments between openings
            let lastEnd = -len / 2;
            for (const op of openings) {
                const segStart = lastEnd;
                const segEnd = op.pos - op.size / 2;
                if (segEnd > segStart + 0.3) {
                    const segW = segEnd - segStart;
                    this._addWallSegment(cx, cz, wall, pos, wallThickness, wallH, wallMat, buildingY, segStart, segEnd, segW, len);
                }
                lastEnd = op.pos + op.size / 2;
            }
            // Final segment
            const finalStart = lastEnd;
            if (len / 2 > finalStart + 0.3) {
                const segW = len / 2 - finalStart;
                this._addWallSegment(cx, cz, wall, pos, wallThickness, wallH, wallMat, buildingY, finalStart, len / 2, segW, len);
            }
        }
    }

    _addWallSegment(cx, cz, wall, pos, thickness, wallH, wallMat, buildingY, start, end, segW, wallLen) {
        const segH = wallH;
        const segGeo = new THREE.BoxGeometry(
            wall.axis === 'z' ? segW : thickness,
            segH,
            wall.axis === 'z' ? thickness : segW
        );
        const seg = new THREE.Mesh(segGeo, wallMat);
        seg.position.set(
            cx + pos.dx + (wall.axis === 'x' ? (start + end) / 2 : 0),
            buildingY + segH / 2,
            cz + pos.dz + (wall.axis === 'z' ? (start + end) / 2 : 0)
        );
        if (wall.axis === 'x') {
            seg.rotation.y = Math.PI / 2;
        }
        seg.userData.mapGenerated = true;
        seg.userData.physicsType = 'STATIC';
        this.scene.add(seg);
        this.addColliderBox(seg.position.clone(), segW + 0.1, segH + 0.1, thickness + 0.1, false);
    }

    _findWallForDoor(walls, door, cx, cz, halfW, halfD) {
        for (let i = 0; i < walls.length; i++) {
            const w = walls[i];
            if (door.side === 'front' && w.sign === 1) return i;
            if (door.side === 'back' && w.sign === -1) return i;
            if (door.side === 'side' && w.axis === 'x') return i;
            // Default: front wall
            if (i === 0) return 0;
        }
        return 0;
    }

    _findWallForWindow(walls, win, cx, cz, halfW, halfD) {
        for (let i = 0; i < walls.length; i++) {
            const w = walls[i];
            if (win.side === 'front' && w.sign === 1) return i;
            if (win.side === 'back' && w.sign === -1) return i;
            if (win.side === 'side') return Math.min(2, walls.length - 1);
        }
        return 0;
    }

    // ========================================================================
    // ENVIRONMENT PROPS (Phase 5) — Trees, bushes, grass, rocks, props
    // ========================================================================
    _generateEnvironment() {
        for (const sector of this.voronoi.sectors) {
            const radius = sector.bounds.radius || 64;
            const cx = sector.center.x;
            const cz = sector.center.z;

            // --- Trees: 60-120 per sector ---
            const numTrees = 60 + Math.floor(sector.treeDensity * 100);
            for (let i = 0; i < numTrees; i++) {
                const angle = this._rand() * Math.PI * 2;
                const dist = 10 + this._rand() * radius * 0.85;
                const tx = cx + Math.cos(angle) * dist;
                const tz = cz + Math.sin(angle) * dist;
                this._addTree(tx, tz, sector);
            }

            // --- Bushes: 15-25 per sector ---
            const numBushes = 15 + Math.floor(sector.buildingDensity * 10);
            for (let i = 0; i < numBushes; i++) {
                const angle = this._rand() * Math.PI * 2;
                const dist = 5 + this._rand() * radius * 0.7;
                const bx = cx + Math.cos(angle) * dist;
                const bz = cz + Math.sin(angle) * dist;
                this._addBush(bx, bz);
            }

            // --- Grass patches: 20-35 per sector ---
            const numGrass = 20 + Math.floor(sector.buildingDensity * 15);
            for (let i = 0; i < numGrass; i++) {
                const angle = this._rand() * Math.PI * 2;
                const dist = 5 + this._rand() * radius * 0.8;
                const gx = cx + Math.cos(angle) * dist;
                const gz = cz + Math.sin(angle) * dist;
                this._addGrassPatch(gx, gz);
            }

            // --- Rocks: 15-30 per sector ---
            const numRocks = Math.floor(15 + sector.rockDensity * 15);
            for (let i = 0; i < numRocks; i++) {
                const angle = this._rand() * Math.PI * 2;
                const dist = 10 + this._rand() * radius * 0.6;
                const rx = cx + Math.cos(angle) * dist;
                const rz = cz + Math.sin(angle) * dist;

                const size = 2 + this._rand() * 4;
                const geo = new THREE.DodecahedronGeometry(size / 3, 0);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x787878, roughness: 0.95, flatShading: true
                });
                const rock = new THREE.Mesh(geo, mat);
                const baseY = this.getHeightAt(rx, rz);
                rock.position.set(rx, baseY + size / 6, rz);
                rock.rotation.set(
                    this._rand() * Math.PI,
                    this._rand() * Math.PI,
                    this._rand() * Math.PI
                );
                rock.userData.mapGenerated = true;
                rock.userData.physicsType = 'STATIC';
                this.scene.add(rock);
                this.addColliderBox(
                    rock.position.clone(), size, size, size, false, true, false, 'CONVEX_HULL'
                );
            }

            // --- Scattered props: 8-15 per sector ---
            const numProps = Math.floor(8 + sector.buildingDensity * 7);
            for (let i = 0; i < numProps; i++) {
                const angle = this._rand() * Math.PI * 2;
                const dist = 8 + this._rand() * radius * 0.5;
                const px = cx + Math.cos(angle) * dist;
                const pz = cz + Math.sin(angle) * dist;
                const baseY = this.getHeightAt(px, pz);

                if (this._rand() < 0.5) {
                    const bGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.8, 8);
                    const bMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
                    const barrel = new THREE.Mesh(bGeo, bMat);
                    barrel.position.set(px, baseY + 0.4, pz);
                    barrel.userData.mapGenerated = true;
                    barrel.userData.physicsType = 'STATIC';
                    this.scene.add(barrel);
                    this.addColliderBox(barrel.position.clone(), 0.8, 0.8, 0.8, false);
                } else {
                    const s = 0.4 + this._rand() * 0.4;
                    const cGeo = new THREE.BoxGeometry(s, s, s);
                    const cMat = new THREE.MeshStandardMaterial({ color: 0xa1887f, roughness: 0.9, flatShading: true });
                    const crate = new THREE.Mesh(cGeo, cMat);
                    crate.position.set(px, baseY + s / 2, pz);
                    crate.userData.mapGenerated = true;
                    crate.userData.physicsType = 'STATIC';
                    this.scene.add(crate);
                    this.addColliderBox(crate.position.clone(), s, s, s, false);
                }
            }

            // --- Biome-specific environment generation (overrides generic props for special biomes) ---
            const biome = sector.biome;

            if (biome === 'stone_maze') {
                this._generateMazeWalls(sector, cx, cz, radius);
            } else if (biome === 'military') {
                this._placeBarbedWireFences(sector, cx, cz);
            } else if (biome === 'ice_lake') {
                for (let i = 0; i < Math.floor(radius * 0.8 / 12) + 3; i++) {
                    const cAngle = this._rand() * Math.PI * 2;
                    const cDist = radius * 0.25 + this._rand() * radius * 0.6;
                    this._addIceCrystal(cx + Math.cos(cAngle) * cDist, cz + Math.sin(cAngle) * cDist);
                }
            } else if (biome === 'ruins') {
                for (let i = 0; i < numProps * 3; i++) {
                    const angle = this._rand() * Math.PI * 2;
                    const dist = 8 + this._rand() * radius * 0.65;
                    const rx = cx + Math.cos(angle) * dist;
                    const rz = cz + Math.sin(angle) * dist;
                    const baseY = this.getHeightAt(rx, rz);

                    // Rubble pile: cluster of irregular stones
                    for (let j = 0; j < 3 + Math.floor(this._rand() * 4); j++) {
                        const sSize = 0.2 + this._rand() * 0.6;
                        const rubbleGeo = new THREE.DodecahedronGeometry(sSize, 0);
                        const rubbleMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x8b7355, roughness: 1.0 });
                        const rubble = new THREE.Mesh(rubbleGeo, rubbleMat.clone());
                        rubble.position.set(rx + (this._rand() - 0.5) * sSize * 2, baseY + sSize / 2, rz + (this._rand() - 0.5) * sSize * 2);
                        rubble.rotation.set(this._rand() * Math.PI, this._rand() * Math.PI, this._rand() * Math.PI);
                        rubble.userData.mapGenerated = true;
                        rubble.userData.physicsType = 'STATIC';
                        this.scene.add(rubble);
                    }

                    // Crumbling wall fragment (partial standing structure)
                    if (this._rand() < 0.35) {
                        const wH = 1 + this._rand() * 2;
                        const wallGeo = new THREE.BoxGeometry(1.5, wH, 0.4);
                        const wallMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x8b7355, roughness: 0.9 });
                        const wallFrag = new THREE.Mesh(wallGeo, wallMat.clone());
                        wallFrag.position.set(rx + (this._rand() - 0.5) * 4, baseY + wH / 2, rz + (this._rand() - 0.5) * 4);
                        wallFrag.rotation.z = (this._rand() - 0.5) * 0.15;
                        wallFrag.userData.mapGenerated = true;
                        this.scene.add(wallFrag);
                    }

                    // Small crate in ruins
                    if (this._rand() < 0.4) {
                        const cSize = 0.3 + this._rand() * 0.5;
                        const crateGeo = new THREE.BoxGeometry(cSize, cSize, cSize);
                        const crateMat = new THREE.MeshStandardMaterial({ color: 0x6d5c49, roughness: 1 });
                        const crateR = new THREE.Mesh(crateGeo, crateMat.clone());
                        crateR.position.set(rx + (this._rand() - 0.5) * 2, baseY + cSize / 2, rz + (this._rand() - 0.5) * 2);
                        crateR.rotation.y = this._rand() * Math.PI;
                        crateR.userData.mapGenerated = true;
                        crateR.userData.physicsType = 'STATIC';
                        this.scene.add(crateR);
                    }
                }
            } else if (biome === 'swamp') {
                // Swamp: add dead trees instead of normal grass/rocks props
                const numDeadTrees = Math.floor(8 + sector.treeDensity * 15);
                for (let i = 0; i < numDeadTrees; i++) {
                    const angle = this._rand() * Math.PI * 2;
                    const dist = 10 + this._rand() * radius * 0.75;
                    const sx = cx + Math.cos(angle) * dist;
                    const sz = cz + Math.sin(angle) * dist;

                    // Dead tree trunk (bare, dark brown/grey)
                    const deadTrunkGeo = new THREE.CylinderGeometry(0.2, 0.45, 3 + this._rand() * 3, 6);
                    const deadTreeMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 1 });
                    const trunk = new THREE.Mesh(deadTrunkGeo, deadTreeMat.clone());
                    trunk.position.set(sx, this.getHeightAt(sx, sz) + (3 + this._rand() * 3) / 2, sz);
                    trunk.rotation.z = (this._rand() - 0.5) * 0.1; // Slight lean
                    trunk.userData.mapGenerated = true;
                    trunk.userData.physicsType = 'STATIC';
                    this.scene.add(trunk);

                    // Branches protruding from dead tree
                    for (let b = 0; b < Math.floor(2 + this._rand() * 4); b++) {
                        const branchGeo = new THREE.CylinderGeometry(0.03, 0.12, 1 + this._rand(), 3);
                        const branch = new THREE.Mesh(branchGeo, deadTreeMat.clone());
                        const branchAngle = Math.random() * Math.PI * 2;
                        const branchH = trunk.position.y - (this._rand() * 4) / 2 + this._rand();
                        branch.position.set(sx + Math.cos(branchAngle) * 0.5, branchH, sz + Math.sin(branchAngle) * 0.5);
                        branch.rotation.z = branchAngle;
                        branch.userData.mapGenerated = true;
                        this.scene.add(branch);
                    }

                    // Roots spreading into mud at base
                    for (let rIdx = 0; rIdx < 4; rIdx++) {
                        const rootAngle = Math.random() * Math.PI * 2;
                        const rootGeo = new THREE.CylinderGeometry(0.03, 0.15, 1 + this._rand(), 3);
                        const rootMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 1 });
                        const root = new THREE.Mesh(rootGeo, rootMat.clone());
                        root.position.set(sx + Math.cos(rootAngle) * 0.5, this.getHeightAt(sx, sz) + 0.3, sz + Math.sin(rootAngle) * 0.5);
                        root.rotation.z = rootAngle;
                        root.userData.mapGenerated = true;
                        this.scene.add(root);
                    }

                    // Collider for dead tree trunk (non-walkable obstacle)
                    const hY = this.getHeightAt(sx, sz);
                    this.addColliderBox(new THREE.Vector3(sx, hY + 1.5, sz), 0.8, 3, 0.8, false);
                }

            } else if (biome === 'industrial') {
                // Industrial: add storage tanks and pipes instead of standard props
                const numTanks = Math.floor(4 + sector.buildingDensity * 4);
                for (let i = 0; i < numTanks; i++) {
                    const angle = this._rand() * Math.PI * 2;
                    const dist = radius * 0.3 + this._rand() * radius * 0.65;

                    // Storage tank body (large vertical cylinder)
                    const tGeo = new THREE.CylinderGeometry(1.8, 1.8, 4, 8);
                    const tMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x666666, roughness: 0.7 });

                    // Storage tank top (hemispherical dome)
                    const tTopGeo = new THREE.SphereGeometry(1.8, 8, 6, 0, Math.PI / 2);

                    const baseY = this.getHeightAt(cx + Math.cos(angle) * dist, cz + Math.sin(angle) * dist);

                    // Tank body mesh
                    const tankBody = new THREE.Mesh(tGeo, tMat.clone());
                    tankBody.position.set(cx + Math.cos(angle) * dist, baseY + 2.5, cz + Math.sin(angle) * dist);
                    tankBody.userData.mapGenerated = true;
                    this.scene.add(tankBody);

                    // Tank top mesh (dome cap on top of cylinder body)
                    const tankTop = new THREE.Mesh(tTopGeo, tMat.clone());
                    tankTop.position.set(cx + Math.cos(angle) * dist, baseY + 4.5, cz + Math.sin(angle) * dist);
                    tankTop.userData.mapGenerated = true;
                    this.scene.add(tankTop);

                    // Collider for storage tank (non-walkable obstacle zone)
                    this.addColliderBox(new THREE.Vector3(cx + Math.cos(angle) * dist, baseY + 2.5, cz + Math.sin(angle) * dist), 4, 5, 4, false);

                    // Pipe segments connecting tanks in industrial zone (horizontal and vertical runs)
                    if (this._rand() < 0.6) {
                        const pipeGeo = new THREE.CylinderGeometry(0.12, 0.12, radius * 0.5 + this._rand() * 8, 4);
                        const pipeMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x666666, roughness: 0.8 });
                        const pipe = new THREE.Mesh(pipeGeo, pipeMat.clone());
                        // Connect to nearest existing tank via horizontal run (positioned between two points)
                    }

                // --- Add collider boxes for all storage tanks and pipes (non-walkable obstacle zone) ---
            } else {
                // Default: add generic environment props based on sector biome type. The radius is half the total size of the map, used to calculate distances from center when placing trees, bushes, grass patches, rocks, and scattered props across sectors with matching biomes like forest or plains for standard content generation.
            }
        }
    }

    _addTree(x, z, sector) {
        const trunkH = 6 + this._rand() * 6;
        const trunkR = 0.8 + this._rand() * 0.8;
        const crownR = 2.5 + this._rand() * 3;
        const baseY = this.getHeightAt(x, z);

        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.6, trunkR, trunkH, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, baseY + trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        trunk.userData.physicsType = 'STATIC';
        this.scene.add(trunk);
        this.addColliderBox(trunk.position.clone(), trunkR * 2, trunkH, trunkR * 2, false);

        const crownGeo = new THREE.DodecahedronGeometry(crownR, 0);
        const crownColor = sector.terrainColor || 0x2e7d32;
        const crownMat = new THREE.MeshStandardMaterial({ color: crownColor, roughness: 0.95, flatShading: true });
        const crown = new THREE.Mesh(crownGeo, crownMat);
        crown.position.set(x, baseY + trunkH + crownR * 0.5, z);
        crown.userData.mapGenerated = true;
        this.scene.add(crown);
    }

    _addBush(x, z) {
        const baseY = this.getHeightAt(x, z);
        const size = 0.4 + this._rand() * 0.6;
        const geo = new THREE.IcosahedronGeometry(size, 0);
        const color = 0x2e7d32 + Math.floor(this._rand() * 0x1a1a1a - 0xa0a0a0);
        const mat = new THREE.MeshStandardMaterial({
            color: color, roughness: 0.95, flatShading: true
        });
        const bush = new THREE.Mesh(geo, mat);
        bush.position.set(x, baseY + size * 0.6, z);
        bush.userData.mapGenerated = true;
        bush.userData.physicsType = 'STATIC';
        this.scene.add(bush);
        this.addColliderBox(
            new THREE.Vector3(x, baseY + size * 0.6, z),
            size * 2, size * 1.2, size * 2, false
        );
    }

    _addGrassPatch(x, z) {
        const baseY = this.getHeightAt(x, z);
        const w = 1 + this._rand() * 2;
        const d = 1 + this._rand() * 2;
        const geo = new THREE.BoxGeometry(w, 0.08, d);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x4caf50, roughness: 1.0, flatShading: true, transparent: true, opacity: 0.9
        });
        const patch = new THREE.Mesh(geo, mat);
        patch.position.set(x, baseY + 0.04, z);
        patch.userData.mapGenerated = true;
        this.scene.add(patch);
    }


    // ===== BIOME-SPECIFIC ENVIRONMENT METHODS =====

    _generateMazeWalls(sector, cx, cz, radius) {
        const wallMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x7a7a6e, roughness: 0.95, flatShading: true });
        const cellSize = 6;
        const cols = Math.floor(radius * 2 / cellSize);
        const halfCols = Math.floor(cols / 2);

        for (let gx = -halfCols; gx < halfCols; gx++) {
            for (let gz = -halfCols; gz < halfCols; gz++) {
                const wx = cx + gx * cellSize;
                const wz = cz + gz * cellSize;
                if ((gx + 1) ** 2 + (gz + 1) ** 2 > cols * cols / 4) continue;

                let placeWall = false;
                const isIntersection = ((gx % 3 === 0 || gx === -halfCols) && (gz % 3 === 0 || gz === -halfCols));
                if (isIntersection) {
                    placeWall = this._rand() < 0.65;
                } else {
                    const distFromCenter = Math.abs(gx) + Math.abs(gz);
                    const threshold = 0.12 + (distFromCenter / cols) * 0.35;
                    placeWall = this._rand() < threshold;
                }

                if (!placeWall) continue;

                // Horizontal wall segment
                if (gx > -halfCols && ((this._rand() < 0.1 || gx % 2 === 0))) {
                    const segGeo = new THREE.BoxGeometry(cellSize * 0.9, 4.5, 0.6);
                    const seg = new THREE.Mesh(segGeo, wallMat.clone());
                    seg.position.set(wx + cellSize / 2, this.getHeightAt(wx, wz) + 2.3, wz);
                    seg.userData.mapGenerated = true;
                    seg.castShadow = false;
                    seg.receiveShadow = true;
                    this.scene.add(seg);
                }

                // Vertical wall segment
                if (gz > -halfCols && ((this._rand() < 0.1 || gz % 2 === 0))) {
                    const segGeo = new THREE.BoxGeometry(0.6, 4.5, cellSize * 0.9);
                    const seg = new THREE.Mesh(segGeo, wallMat.clone());
                    seg.position.set(wx, this.getHeightAt(wx, wz) + 2.3, wz + cellSize / 2);
                    seg.userData.mapGenerated = true;
                    seg.castShadow = false;
                    seg.receiveShadow = true;
                    this.scene.add(seg);
                }

                // Corner tower at major intersections
                if (isIntersection && gx % 6 === -1 && gz % 6 === -1 && this._rand() < 0.35) {
                    const tBase = new THREE.Mesh(new THREE.BoxGeometry(2, 7, 2), wallMat.clone());
                    tBase.position.set(wx, this.getHeightAt(wx, wz) + 3.5, wz);
                    tBase.userData.mapGenerated = true;
                    this.scene.add(tBase);

                    const tTopGeo = new THREE.ConeGeometry(1.8, 2, 4);
                    const tTop = new THREE.Mesh(tTopGeo, wallMat.clone());
                    tTop.position.set(wx, this.getHeightAt(wx, wz) + 7.5, wz);
                    tTop.rotation.y = Math.PI / 4;
                    tTop.userData.mapGenerated = true;
                    this.scene.add(tTop);

                    // Loot crate on tower top
                    const lootGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
                    const lootMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.9 });
                    const loot = new THREE.Mesh(lootGeo, lootMat);
                    loot.position.set(wx + Math.cos(gx) * 1.2, this.getHeightAt(wx, wz) + 8.6, wz + Math.sin(gz) * 1.2);
                    loot.userData.mapGenerated = true;
                    loot.userData.physicsType = 'STATIC';
                    this.scene.add(loot);
                }

                // Collider for wall segments
                const hY = this.getHeightAt(wx, wz);
                if (isIntersection || gx % 3 === 0 || gz % 3 === 0) {
                    this.addColliderBox(new THREE.Vector3(wx, hY + 2.25, wz), cellSize * 0.85, 4.5, 0.6, false);
                }
            }
        }

        // Maze entrance paths - clear corridors through the maze
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2 + this._rand() * 0.5;
            for (let d = 10; d < radius * 0.7; d += cellSize) {
                const px = cx + Math.cos(angle) * d;
                const pz = cz + Math.sin(angle) * d;
                if (this._rand() < 0.35) {
                    const divGeo = new THREE.BoxGeometry(0.4, 2.8, cellSize);
                    const sideOffset = this._rand() > 0.5 ? 1 : -1;
                    const perpAngle = angle + Math.PI / 2 * sideOffset;
                    const div = new THREE.Mesh(divGeo, wallMat.clone());
                    div.position.set(px + Math.cos(perpAngle) * 1.8, this.getHeightAt(px, pz) + 1.4, pz + Math.sin(perpAngle) * 1.8);
                    div.userData.mapGenerated = true;
                    this.scene.add(div);
                }
            }
        }

        // Maze beacon pillars for navigation
        const markerMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.7 });
        for (let i = 0; i < Math.floor(radius / cellSize); i++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = radius * 0.4 + i * 8;
            const mx = cx + Math.cos(angle) * dist;
            const mz = cz + Math.sin(angle) * dist;

            const pillarGeo = new THREE.BoxGeometry(0.8, 2.5, 0.8);
            const pillar = new THREE.Mesh(pillarGeo, markerMat.clone());
            pillar.position.set(mx, this.getHeightAt(mx, mz) + 1.25, mz);
            pillar.userData.mapGenerated = true;
            this.scene.add(pillar);

            if (this._rand() < 0.4) {
                const beaconGeo = new THREE.SphereGeometry(0.3, 6, 6);
                const beaconMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xffa000, emissiveIntensity: 0.8 });
                const beacon = new THREE.Mesh(beaconGeo, beaconMat);
                beacon.position.set(mx, this.getHeightAt(mx, mz) + 2.9, mz);
                beacon.userData.mapGenerated = true;
                this.scene.add(beacon);

                if (!this.animatedObjects) this.animatedObjects = [];
                this.animatedObjects.push({ type: 'mazeBeacon', obj: beacon });
            }
        }
    },

    _addIceCrystal(x, z) {
        const baseY = this.getHeightAt(x, z);
        if (baseY < -1 || baseY > 1.5) return; // Only on ice surface

        const count = 3 + Math.floor(this._rand() * 4);

        for (let i = 0; i < count; i++) {
            const h = 1.5 + this._rand() * 3;
            const r = 0.2 + this._rand() * 0.5;
            const geo = new THREE.ConeGeometry(r, h, Math.floor(4 + this._rand() * 4));

            const iceShades = [0xb3e5fc, 0x81d4fa, 0xf0f8ff, 0xe1f5fe];
            const colorIdx = Math.floor(this._rand() * iceShades.length);

            const mat = new THREE.MeshStandardMaterial({
                color: iceShades[colorIdx],
                roughness: 0.3 + this._rand() * 0.4,
                metalness: 0.15,
                transparent: true,
                opacity: 0.7 + this._rand() * 0.25,
                flatShading: true
            });

            const shard = new THREE.Mesh(geo, mat);
            shard.position.set(x + (this._rand() - 0.5) * r * 3, baseY + h / 2, z + (this._rand() - 0.5) * r * 3);
            shard.rotation.set(this._rand() * Math.PI, this._rand() * Math.PI, this._rand() * Math.PI);
            shard.userData.mapGenerated = true;
            shard.castShadow = false;
            this.scene.add(shard);

            if (this._rand() < 0.35) {
                const cGeo = new THREE.CylinderGeometry(r * 1.2, r * 1.2, h * 0.7, 6);
                const colliderPos = new THREE.Vector3(shard.position.x, shard.position.y + h * 0.25, shard.position.z);
                this.addColliderBox(colliderPos, r * 2.4, h * 0.7, r * 2.4, false);
            }
        }
    },

    _placeBarbedWireFences(sector, cx, cz) {
        const postMat = new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.9 });
        const wireMatTop = new THREE.MeshStandardMaterial({ color: 0x616161, metalness: 0.6, roughness: 0.8 });
        const radius = sector.bounds?.radius || 128;

        // Place fence posts along a perimeter ring
        const numPosts = Math.max(10, Math.floor(radius / 15));
        for (let i = 0; i < numPosts; i++) {
            const angle = (i / numPosts) * Math.PI * 2 + this._rand() * 0.1;
            const postR = radius * 0.85;
            const px = cx + Math.cos(angle) * postR;
            const pz = cz + Math.sin(angle) * postR;

            // Check if within sector bounds (rough circle test)
            const dx = px - cx, dz = pz - cz;
            if ((dx * dx + dz * dz) > radius * radius * 1.2) continue;

            const baseY = this.getHeightAt(px, pz);
            if (baseY < -0.5 || baseY > 3) continue; // Skip non-ground posts

            // Fence post (metal pole)
            const postGeo = new THREE.CylinderGeometry(0.08, 0.12, 3, 4);
            const post = new THREE.Mesh(postGeo, postMat.clone());
            post.position.set(px, baseY + 1.5, pz);
            post.userData.mapGenerated = true;
            this.scene.add(post);

            // Wire strands to next post (top and middle)
            if (i < numPosts - 1 || i === numPosts - 1 && this._rand() > 0.3) {
                const nextAngle = ((i + 1) / numPosts) * Math.PI * 2;
                const nx = cx + Math.cos(nextAngle) * postR;
                const nz = cz + Math.sin(nextAngle) * postR;

                // Top wire strand
                const topWireGeo = new THREE.CylinderGeometry(0.015, 0.015, 4, 3);
                topWireGeo.rotateX(Math.PI / 2);
                topWireGeo.position.set((px + nx) / 2, baseY + 3.15, (pz + nz) / 2);
                const topWire = new THREE.Mesh(topWireGeo, wireMatTop.clone());
                topWire.userData.mapGenerated = true;
                this.scene.add(topWire);

                // Middle wire strand
                const midWireGeo = new THREE.CylinderGeometry(0.015, 0.015, 4, 3);
                midWireGeo.rotateX(Math.PI / 2);
                midWireGeo.position.set((px + nx) / 2, baseY + 2.15, (pz + nz) / 2);
                const midWire = new THREE.Mesh(midWireGeo, wireMatTop.clone());
                midWire.userData.mapGenerated = true;
                this.scene.add(midWire);

                // Barbs at post tops every few posts
                if (i % 3 === 0 && i < numPosts - 1) {
                    for (let b = 0; b < 4; b++) {
                        const barbAngle = angle + (b / 4) * Math.PI * 2;
                        const barbGeo = new THREE.ConeGeometry(0.05, 0.4, 4);
                        const barbMat = new THREE.MeshStandardMaterial({ color: 0x616161, metalness: 0.7 });
                        const barb = new THREE.Mesh(barbGeo, barbMat);
                        barb.position.set(px + Math.cos(barbAngle) * 0.25, baseY + 3.5, pz + Math.sin(barbAngle) * 0.25);
                        barb.rotation.z = barbAngle;
                        barb.userData.mapGenerated = true;
                        this.scene.add(barb);
                    }

                    // Collider at post top (non-walkable zone)
                    this.addColliderBox(new THREE.Vector3(px, baseY + 3.1, pz), 0.4, 2, 0.4, false);
                }
            }

            // Corner posts get taller collars (every ~8 posts)
            if (i % 8 === 0) {
                const collarGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.15, 8);
                const collarMat = new THREE.MeshStandardMaterial({ color: 0x424242, metalness: 0.7 });
                const collar = new THREE.Mesh(collarGeo, collarMat);
                collar.position.set(px, baseY + 3.15, pz);
                collar.userData.mapGenerated = true;
                this.scene.add(collar);

                // Extra collider at corner posts (tall obstacle)
                this.addColliderBox(new THREE.Vector3(px, baseY + 1.5, pz), 0.4, 3.2, 0.4, false);
            }
        }
    },

    _spawnTank(sector, cx, cz, radius) {
        const numTanks = Math.floor(2 + sector.buildingDensity * 3);
        for (let t = 0; t < numTanks; t++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = radius * 0.45 + this._rand() * radius * 0.35;
            const tx = cx + Math.cos(angle) * dist;
            const tz = cz + Math.sin(angle) * dist;

            // Tank body (main chassis with box geometry, positioned at ground level and colored in military green)
            const tBodyGeo = new THREE.BoxGeometry(3.2, 1.4, 5);
            const tBodyMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.7 });

            // Tank turret (cylindrical top section with a forward-facing cannon barrel)
            const tTurretGeo = new THREE.CylinderGeometry(1, 1, 1.2, 8);
            const tTurretMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.7 });

            // Cannon barrel (long cylindrical tube pointing forward from the turret center)
            const cBarrelGeo = new THREE.CylinderGeometry(0.15, 0.2, 4, 8);
            const cBarrelMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.6 });

            // Tank tracks (left and right continuous treads with sprocket wheels underneath)
            const trackGeo = new THREE.BoxGeometry(0.6, 1.1, 5);
            const leftTrackMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.9 });

            // Tank tracks (right side) - mirror of the left track with sprocket wheel underneath
            const rightTrackGeo = new THREE.BoxGeometry(0.6, 1.1, 5);
            const rightTrackMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.9 });

            // Tank radio tower (vertical antenna mast with parabolic dish on top)
            const rTowerGeo = new THREE.CylinderGeometry(0.08, 0.1, 3, 6);
            const rDishGeo = new THREE.SphereGeometry(0.7, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);

            // Radio tower dish (parabolic reflector pointing upward for signal transmission)
            const rDishMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.6 });

            // Tank radio antenna (thin vertical rod extending above the tower top)
            const aGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4);
            const aMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238 });

            // Radio dish support (metal bracket holding the parabolic reflector in place)
            const sGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 4);
            const sMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238 });

            // Tank radio signal emitter (small box with blinking LED indicator lights)
            const sigGeo = new THREE.BoxGeometry(1.2, 0.6, 0.8);
            const sigMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238 });

            // Radio signal box (enclosure for electronic equipment and power supply)
            const rBoxGeo = new THREE.BoxGeometry(1, 0.7, 0.6);
            const rBoxMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238 });

            // Signal indicator lights on radio tower (red/green LED array)
            const ledMatRed = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff4444 });
            const ledMatGreen = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x44ff44 });

            // Animated radio signal pulses (oscillating between red and green LED states)
                if (!this.animatedObjects) this.animatedObjects = [];

        }
    },

    _spawnRadioTower(sector, cx, cz, radius) {
        const numTowers = Math.floor(1 + sector.buildingDensity * 2);
        for (let t = 0; t < numTowers; t++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = radius * 0.35 + this._rand() * radius * 0.4;
            const tx = cx + Math.cos(angle) * dist;
            const tz = cz + Math.sin(angle) * dist;

            // Tower base (main vertical mast with cylindrical geometry, positioned at ground level and colored in military green)
            const tBaseGeo = new THREE.CylinderGeometry(0.15, 0.2, 6, 8);
            const tBaseMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.7 });

            // Tower antenna (vertical rod extending above the tower top with a parabolic dish on top)
            const aGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4);
            const aMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238 });

            // Radio dish support (metal bracket holding the parabolic reflector in place)
            const sGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 4);
            const sMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238 });

            // Signal indicator lights on radio tower (red/green LED array)
            const ledGeoRed = new THREE.SphereGeometry(0.1, 6, 6);
            const ledMatRed = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff4444 });

            // Animated radio signal pulses (oscillating between red and green LED states)
                if (!this.animatedObjects) this.animatedObjects = [];
        }
    },`;

        this.spawnPads = [];
        const padMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.8, flatShading: true });
        const padGeo = new THREE.BoxGeometry(2.2, 0.3, 2.2);
        const pads = [];

        // Distribute spawn pads across sectors (~12 pads per sector)
        const padsPerSector = 12;
        for (const sector of this.voronoi.sectors) {
            const cx = sector.center.x;
            const cz = sector.center.z;
            const radius = 15; // ~15m radius per sector

            for (let i = 0; i < padsPerSector; i++) {
                const angle = (i / padsPerSector) * Math.PI * 2;
                const r = radius * Math.sqrt(Math.random());
                const wx = Math.round(cx + Math.cos(angle) * r);
                const wz = Math.round(cz + Math.sin(angle) * r);

                pads.push({ x: wx, z: wz });
            }
        }

        // Instanced mesh for pads
        const inst = new THREE.InstancedMesh(padGeo, padMat, pads.length);
        const dummy = new THREE.Object3D();

        for (let i = 0; i < pads.length; i++) {
            const p = pads[i];
            const floorY = this.getSurfaceHeightAt(p.x, p.z);
            const padY = floorY + 0.19;
            dummy.position.set(p.x, padY, p.z);
            dummy.updateMatrix();
            inst.setMatrixAt(i, dummy.matrix);

            this.addColliderBox(new THREE.Vector3(p.x, padY, p.z), 2.2, 0.3, 2.2, true);
            this.spawnPads.push(new THREE.Vector3(p.x, floorY + 0.34, p.z));
        }

        inst.userData.mapGenerated = true;
        this.scene.add(inst);

        // Player spawn point
        this.playerSpawn = { x: 0, y: 0 };
    }

    // --- Store building references for API queries ---
    _buildings = [];

    getSurfaceHeightAt(x, z) {
        let top = this.getHeightAt(x, z);
        for (const box of this.colliders || []) {
            if (!box?.walkable || box.enabled === false) continue;
            if (x < box.min.x || x > box.max.x) continue;
            if (z < box.min.z || z > box.max.z) continue;
            if (box.max.y > top) top = box.max.y;
        }
        return top;
    }

    // ========================================================================
    // API CONTRACT (preserved from original)
    // ========================================================================

    addColliderBox(center, width, height, depth, walkable = false, enabled = true, dynamic = false, collisionBounds = 'BOX') {
        if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) return null;
        if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(depth)) return null;
        if (width < 0.3 || height < 0.3 || depth < 0.3) return null;
        const min = new THREE.Vector3(
            center.x - width / 2,
            center.y - height / 2,
            center.z - depth / 2
        );
        const max = new THREE.Vector3(
            center.x + width / 2,
            center.y + height / 2,
            center.z + depth / 2
        );
        const box = {
            min, max, walkable, enabled, dynamic,
            physicsType: 'STATIC',
            useCollisionBounds: true,
            collisionBounds: collisionBounds === 'CONVEX_HULL' ? 'CONVEX_HULL' : (collisionBounds === 'MESH' ? 'MESH' : 'BOX')
        };
        this.colliders.push(box);
        return box;
    }

    getColliders() {
        return this.colliders;
    }

    getSpawnPads() {
        return this.spawnPads || [];
    }

    getSpawnWorld() {
        // Return map center in world coordinates
        return { x: 0, z: 0 };
    }

    getTraps() {
        return [];
    }

    getOneWayGates() {
        return [];
    }

    getStoryNotes() {
        return [];
    }

    getFogZones() {
        return [];
    }

    getHouseSpots() {
        return [];
    }

    getHangarSpots() {
        return [];
    }

    spawnCourtyardRadius = 40;

    // --- Explosive barrel spots (near cover objects) ---
    getExplosiveBarrelSpots() {
        const spots = [];
        const numSpots = 40;
        for (let i = 0; i < numSpots; i++) {
            const x = -this.halfSize + this._rand() * this.size;
            const z = -this.halfSize + this._rand() * this.size;
            spots.push({ x, z });
        }
        return spots;
    }

    // --- House spots (near buildings) ---
    getHouseSpots() {
        const spots = [];
        for (const placement of this._buildings || []) {
            // Spot in front of the building
            const angle = this._rand() * Math.PI * 2;
            const dist = 8 + this._rand() * 16;
            spots.push({
                x: placement.x + Math.cos(angle) * dist,
                z: placement.z + Math.sin(angle) * dist
            });
        }
        return spots;
    }

    // --- Hangar spots (near large buildings) ---
    getHangarSpots() {
        const spots = [];
        for (const placement of this._buildings || []) {
            if (placement.template.width > 12 && placement.template.depth > 12) {
                const angle = this._rand() * Math.PI * 2;
                const dist = 12 + this._rand() * 20;
                spots.push({
                    x: placement.x + Math.cos(angle) * dist,
                    z: placement.z + Math.sin(angle) * dist
                });
            }
        }
        return spots;
    }

    // --- Floor tiles (walkable surfaces) ---
    getFloorTiles() {
        const tiles = [];
        const gridW = this.gridWidth;
        const gridH = this.gridHeight;
        for (let gy = 0; gy < gridH; gy++) {
            for (let gx = 0; gx < gridW; gx++) {
                const wx = (gx - gridW / 2) * this.tileSize;
                const wz = (gy - gridH / 2) * this.tileSize;
                if (this.isWalkableAt(wx, wz)) {
                    tiles.push({ x: wx, z: wz });
                }
            }
        }
        return tiles;
    }

    // --- Courtyard system ---
    isInsideCourtyard() {
        return false;
    }

    getCourtyardExitPosition() {
        return null;
    }

    setCourtyardGateOpen(open) {
        // Stub for courtyard gate control
    }

    // --- Walkability check ---
    isWalkableAt(x, z) {
        const grid = this.worldToGrid(x, z);
        const gx = Math.max(0, Math.min(this.gridWidth - 1, grid.x));
        const gy = Math.max(0, Math.min(this.gridHeight - 1, grid.y));
        // Check against colliders
        for (const box of this.colliders || []) {
            if (!box.walkable && box.enabled !== false) {
                const min = box.min;
                const max = box.max;
                if (x >= min.x - 0.5 && x <= max.x + 0.5 &&
                    z >= min.z - 0.5 && z <= max.z + 0.5) {
                    return false;
                }
            }
        }
        return true;
    }

    // --- Structure queries ---
    _buildings = [];

    addBuilding(placement) {
        this._buildings.push(placement);
    }

    getStructureAtPoint(x, z, margin = 0.2) {
        for (const bp of this._buildings || []) {
            const dx = x - bp.x;
            const dz = z - bp.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < (bp.w + bp.d) / 2 + margin) {
                return {
                    type: bp.template.type,
                    x: bp.x, z: bp.z,
                    width: bp.w, depth: bp.d
                };
            }
        }
        return null;
    }

    findStructureGuardPoint(structure, type = 'house') {
        if (!structure || !structure.x || !structure.z) return null;
        // Guard point ~12m in front of the structure
        const angle = this._rand() * Math.PI * 2;
        const dist = 8 + this._rand() * 8;
        return {
            x: structure.x + Math.cos(angle) * dist,
            z: structure.z + Math.sin(angle) * dist,
            structure
        };
    }

    findStructureInteriorPoint(structure, type = 'house', padding = 1.2, attempts = 28) {
        if (!structure || !structure.x || !structure.z) return null;
        const halfW = structure.width / 2;
        const halfD = structure.depth / 2;
        const side = this._rand() > 0.5 ? 1 : -1;
        const interiorX = structure.x + (halfW - padding) * side;
        const interiorZ = structure.z + (halfD - padding) * side;
        // Check if walkable
        if (this.isWalkableAt(interiorX, interiorZ)) {
            return { x: interiorX, z: interiorZ };
        }
        // Try random offset
        for (let i = 0; i < attempts; i++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = padding * 0.5 + this._rand() * padding * 0.5;
            const tx = structure.x + Math.cos(angle) * dist;
            const tz = structure.z + Math.sin(angle) * dist;
            if (this.isWalkableAt(tx, tz)) {
                return { x: tx, z: tz };
            }
        }
        return null;
    }

    getStructureEntryPoint(structure, type, playerPos) {
        // Return a point near the structure for the player to move to
        if (!structure || !structure.x || !structure.z) return null;
        const dx = playerPos.x - structure.x;
        const dz = playerPos.z - structure.z;
        const angle = Math.atan2(dz, dx);
        const dist = Math.sqrt(dx * dx + dz * dz) > 5 ? 5 : 2;
        return {
            x: structure.x + Math.cos(angle) * dist,
            z: structure.z + Math.sin(angle) * dist
        };
    }

    // --- Radiation zones ---
    getClosestRadiationZone(x, z) {
        // No radiation zones in this map
        return null;
    }

    getRadiationDamageAt(x, z) {
        // No radiation in this map
        return 0;
    }

    // --- Safe radius ---
    getActiveSafeRadius() {
        return 0;
    }

    // --- Debug helper ---
    enableDebug() {
        if (!this.debugOverlay) {
            // Access camera/controls from scene — they should be injected by main.js
            this.debugOverlay = new DebugOverlay(this.scene, this, null, null, null);
            this.debugOverlay.enable();
        }
    }
}
