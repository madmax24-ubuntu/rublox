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

    // ========================================================================
    // SPAWN SYSTEM (Phase 6)
    // ========================================================================
    _buildSpawnPads() {
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
            const pad = new THREE.Vector3(p.x, floorY + 0.34, p.z);
            this.spawnPads.push(pad);
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
