import * as THREE from "three";
import { MapGeneratorNode } from "./MapGeneratorNode.js";
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

            // === SPECIAL BIOME HANDLING ===
            const isStoneMaze = (sector.biome === 'stone_maze');
            const isMilitary = (sector.biome === 'military' || sector.id === 4);
            const isIceLake = (sector.biome === 'ice_lake');

            if (isStoneMaze) {
                // Stone maze: corridor walls instead of trees/rocks
                this._generateMazeWalls(sector, cx, cz, radius);
            } else if (isMilitary) {
                // Military zone: tanks + barbed wire fences instead of standard props
                const numTanks = 6 + Math.floor(this._rand() * 4);
                for (let i = 0; i < numTanks; i++) this._addTank(cx, cz, sector.bounds.radius || 128);
                this._placeBarbedWireFences(sector, cx, cz);
            } else if (isIceLake) {
                // Ice lake: frozen surface + ice crystals + radio tower
                const numCrystals = Math.floor(12 * sector.rockDensity);

                // Frozen water plane at center of sector
                const surfY = this.getHeightAt(cx, cz);
                const surfGeo = new THREE.CircleGeometry(radius * 0.95, 32);
                const surfMat = new THREE.MeshStandardMaterial({
                    color: sector.terrainColor || 0xb0d4e3, roughness: 0.6, metalness: 0.1, flatShading: true
                });
                const surfaceMesh = new THREE.Mesh(surfGeo, surfMat);
                surfaceMesh.rotation.x = -Math.PI / 2;
                surfaceMesh.position.set(cx, surfY + 0.05, cz);
                surfaceMesh.userData.mapGenerated = true;
                this.scene.add(surfaceMesh);

                // Walkable platform for spawn pads on ice lake
                const padGeo = new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.35, 32);
                const padMat = new THREE.MeshStandardMaterial({ color: 0xc8e6f0, roughness: 0.7, flatShading: true });
                const padMesh = new THREE.Mesh(padGeo, padMat);
                padMesh.position.set(cx, surfY + 0.18, cz);
                padMesh.userData.mapGenerated = true;
                this.scene.add(padMesh);

                for (let i = 0; i < numCrystals; i++) {
                    const cAngle = this._rand() * Math.PI * 2;
                    const cDist = 10 + this._rand() * radius * 0.85;
                    this._addIceCrystal(cx + Math.cos(cAngle) * cDist, cz + Math.sin(cAngle) * cDist);
                }

                if (!sector.bounds?.minX || cx > 100) { // Only one radio tower per ice sector
                    const angle = Math.random() * Math.PI * 2;
                    this._addRadioTower(
                        cx + Math.cos(angle) * (radius - 30),
                        cz + Math.sin(angle) * (radius - 30)
                    );
                }
            } else {
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

    _generateMazeWalls(sector, cx, cz, radius) {
        const wallMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x7a7a6e, roughness: 0.95, flatShading: true });
        const cellSize = 6;
        const cols = Math.floor(radius * 2 / cellSize);
        const halfCols = Math.floor(cols / 2);

        // Maze wall pattern using cellular automata rules
        for (let gx = -halfCols; gx < halfCols; gx++) {
            for (let gz = -halfCols; gz < halfCols; gz++) {
                const wx = cx + gx * cellSize;
                const wz = cz + gz * cellSize;
                if ((gx + 1) * (gx + 1) + (gz + 1) * (gz + 1) > cols * cols / 4) continue;

                // Place walls at intersections and random corridors
                let placeWall = false;
                const isIntersection = ((gx % 3 === 0 || gx === -halfCols) && (gz % 3 === 0 || gz === -halfCols));
                if (isIntersection) {
                    placeWall = this._rand() < 0.65;
                } else {
                    // Random wall with bias toward connected corridors
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

                // Corner tower at major intersections (every ~9 cells)
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

                // Collider for every wall segment
                const hY = this.getHeightAt(wx, wz);
                if (isIntersection || gx % 3 === 0 || gz % 3 === 0) {
                    const minW = Math.min(gx + halfCols, cols - 1 - Math.abs(gz));
                    this.addColliderBox(new THREE.Vector3(wx, hY + 2.25, wz), cellSize * 0.85, 4.5, 0.6, false);
                }
            }
        }

        // Maze entrance paths (clear corridors through the maze)
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2 + this._rand() * 0.5;
            for (let d = 10; d < radius * 0.7; d += cellSize) {
                const px = cx + Math.cos(angle) * d;
                const pz = cz + Math.sin(angle) * d;
                // Clear path: place only thin divider walls on sides
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

        // Maze wall markers (small pillars at corridor ends for navigation)
        const markerMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.7 });
        for (let i = 0; i < Math.floor(radius / cellSize); i++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = radius * 0.4 + i * 8;
            const mx = cx + Math.cos(angle) * dist;
            const mz = cz + Math.sin(angle) * dist;
            if (mx * mx + mz * mz < sector.bounds?.minX || this._rand() > 0.5) continue;

            const pillarGeo = new THREE.BoxGeometry(0.8, 2.5, 0.8);
            const pillar = new THREE.Mesh(pillarGeo, markerMat.clone());
            pillar.position.set(mx, this.getHeightAt(mx, mz) + 1.25, mz);
            pillar.userData.mapGenerated = true;
            this.scene.add(pillar);

            // Beacon light on top of some pillars
            if (this._rand() < 0.4) {
                const beaconGeo = new THREE.SphereGeometry(0.3, 6, 6);
                const beaconMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xffa000, emissiveIntensity: 0.8 });
                const beacon = new THREE.Mesh(beaconGeo, beaconMat);
                beacon.position.set(mx, this.getHeightAt(mx, mz) + 2.9, mz);
                beacon.userData.mapGenerated = true;
                this.scene.add(beacon);

                // Animate blinking signal
                if (!this.animatedObjects) this.animatedObjects = [];
                this.animatedObjects.push({ type: 'mazeBeacon', obj: beacon });
            }
        }
    }

    _addIceCrystal(x, z) {
        const baseY = this.getHeightAt(x, z);
        const count = 3 + Math.floor(this._rand() * 4); // 3-6 shards per cluster

        for (let i = 0; i < count; i++) {
            const h = 1.5 + this._rand() * 3;
            const r = 0.2 + this._rand() * 0.5;
            const geo = new THREE.ConeGeometry(r, h, Math.floor(4 + this._rand() * 4)); // Irregular shards (4-8 sides)

            // Ice material with varying shades of blue-white
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

            // Small collider for the crystal (non-walkable obstacle)
            if (this._rand() < 0.35) {
                const cGeo = new THREE.CylinderGeometry(r * 1.2, r * 1.2, h * 0.7, 6);
                const colliderPos = new THREE.Vector3(shard.position.x, shard.position.y + h * 0.25, shard.position.z);
                this.addColliderBox(colliderPos, r * 2.4, h * 0.7, r * 2.4, false);
            }

        // Barbed wire fence posts with wire strands between them
    _placeBarbedWireFences(sector, cx, cz) {
        const postMat = new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.9 });
        const radius = sector.bounds?.radius || 128;

        // Calculate perimeter corners using golden angle for even distribution
        let numCorners = Math.max(6, Math.floor(radius / 20));
        if (sector.hull) {
            numCorners = sector.hull.length; // Use actual hull vertices
        }

        const cornerRadius = radius * 0.95;
        const corners = [];
        for (let i = 0; i < numCorners; i++) {
            const angle = (i / numCorners) * Math.PI * 2 + this._rand() * 0.1;
            corners.push({ x: cx + Math.cos(angle) * cornerRadius, z: cz + Math.sin(angle) * cornerRadius });
        }

        // Place fence posts along perimeter with wire strands between them
        for (let i = 0; i < corners.length; i++) {
            const nextI = (i + 1) % corners.length;
            if (!corners[nextI]) continue;

            const dx = corners[nextI].x - corners[i].x;
            const dz = corners[nextI].z - corners[i].z;
            const segLen = Math.sqrt(dx * dx + dz * dz);
            const numPosts = Math.max(1, Math.floor(segLen / 4));

            for (let j = 0; j <= numPosts; j++) {
                const t = j / numPosts;
                const px = corners[i].x + dx * t;
                const pz = corners[i].z + dz * t;
                const postH = this.getHeightAt(px, pz);

                // Fence post (metal pole)
                const postGeo = new THREE.CylinderGeometry(0.08, 0.12, 3, 4);
                const post = new THREE.Mesh(postGeo, postMat.clone());
                post.position.set(px, postH + 1.5, pz);
                post.userData.mapGenerated = true;
                this.scene.add(post);

                // Wire strands between consecutive posts (top and middle)
                if (j < numPosts) {
                    const nextPx = corners[i].x + dx * ((j + 0.7) / numPosts);
                    const nextPz = corners[i].z + dz * ((j + 0.7) / numPosts);
                    const wireGeo = new THREE.CylinderGeometry(0.02, 0.02, segLen * t + 1, 3);

                    // Top strand
                    const topWireMat = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.8, metalness: 0.6 });
                    wireGeo.rotateX(Math.PI / 2);
                    wireGeo.position.set((px + nextPx) / 2, postH + 3.15, (pz + nextPz) / 2);
                    const topWire = new THREE.Mesh(wireGeo, topWireMat.clone());
                    topWire.userData.mapGenerated = true;
                    this.scene.add(topWire);

                    // Middle strand
                    wireGeo.position.set((px + nextPx) / 2, postH + 2.15, (pz + nextPz) / 2);
                    const midWire = new THREE.Mesh(wireGeo.clone(), topWireMat.clone());
                    midWire.userData.mapGenerated = true;
                    this.scene.add(midWire);
                }

                // Barbs at post tops (small spikes every few posts)
                if (j % 3 === 0 && j < numPosts - 1) {
                    const barbGeo = new THREE.ConeGeometry(0.05, 0.4, 4);
                    for (let b = 0; b < 4; b++) {
                        const barbAngle = (b / 4) * Math.PI * 2;
                        const barbMat = new THREE.MeshStandardMaterial({ color: 0x616161, metalness: 0.7 });
                        const barb = new THREE.Mesh(barbGeo, barbMat);
                        barb.position.set(px + Math.cos(barbAngle) * 0.25, postH + 3.2, pz + Math.sin(barbAngle) * 0.25);
                        barb.rotation.z = barbAngle;
                        barb.userData.mapGenerated = true;
                        this.scene.add(barb);
                    }
                }

            // Add collider box at each corner (taller than regular posts)
            const postGeo = new THREE.CylinderGeometry(0.15, 0.2, 3.5, 6);
            const post = new THREE.Mesh(postGeo, postMat.clone());
            post.position.set(px, postH + 1.75, pz);
            post.userData.mapGenerated = true;
            this.scene.add(post);

        // Add wire strands between posts (barbed wire)
        for (let i = 0; i < corners.length - 1; i++) {
            const c1 = corners[i];
            const c2 = corners[i + 1];
            if (!c2 || !c2.x && Math.abs(c2.z)) continue;

            // Horizontal wire strand (top)
            for (let w = 0; w < numPosts - 1; w++) {
                const p1x = c1.x + (dx * w / numPosts);
                const p1z = c1.z + (dz * w / numPosts);
                const p2x = c1.x + (dx * (w + 1) / numPosts);
                const p2z = c1.z + (dz * (w + 1) / numPosts);

                // Wire strand between consecutive posts
                const wireLen = Math.sqrt((p2x - p1x) ** 2 + (p2z - p1z) ** 2);
                if (wireLen < 0.5) continue;

                for (let strand = 0; strand < 3; strand++) { // Three strands per segment
                    const wireGeo = new THREE.CylinderGeometry(0.03, 0.03, wireLen + strand * 0.2, 4);
                    const wireMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.7, metalness: 0.8 });

                    // Angle the wires slightly for barbed effect
                    wireGeo.rotateZ((strand - 1) * 0.2);
                    const midX = (p1x + p2x) / 2;
                    const midZ = (pz + nextPz) / 2;

                    // Position at post height with slight sagging between posts
                    wireGeo.position.set(midX, baseY + 3.0 - strand * 0.5, midZ);
                    wire.userData.mapGenerated = true;
                    this.scene.add(wire);
                }
            }
        }

        // Add barbed wires at post tops (small spikes)
        for (let i = 0; i < numPosts - 1; i++) {
            const px = c1.x + dx * (i / numPosts);
            const pz = c1.z + dz * (i / numPosts);

            // Barbed wire at post top (cross pattern)
            for (let b = 0; b < 4; b++) {
                const barbGeo = new THREE.CylinderGeometry(0.03, 0.02, 1.5, 3);
                const barbMat = new THREE.MeshStandardMaterial({ color: 0x757575, roughness: 0.8 });
                const barb = new THREE.Mesh(barbGeo, barbMat);
                barb.position.set(px + Math.cos(b * Math.PI / 2) * 1.3, baseY + 4.6, pz + Math.sin(b * Math.PI / 2) * 1.3);
                barb.rotation.z = b; // Rotate each barbed wire segment at different angles (0, π/2, π, 3π/2)
                barb.userData.mapGenerated = true;
                this.scene.add(barb);
            }

        // Add collider boxes for fence posts (walkable only on top surface)
        for (let i = 0; i < corners.length - 1; i++) {
            const c1 = corners[i];
            const c2 = corners[i + 1] || corners[0];
            if (!c2 || !c2.x && Math.abs(c2.z)) continue;

            // Walkable platform (surface) between fence posts
            for (let w = 0; w < numPosts - 1; w++) {
                const px = c1.x + dx * (w / numPosts);
                const pz = c1.z + dz * (i / numPosts);

                // Walkable platform segment between consecutive posts
                this.addColliderBox(new THREE.Vector3(px, baseY + 0.25, pz), Math.abs(dx) / numPosts + 1, 0.4, Math.abs(dz) / numPosts + 1, true);
            }

        // Add collider boxes for fence posts (non-walkable obstacles)
        for (let i = 0; i < corners.length - 1; i++) {
            const c1 = corners[i];
            if (!c2 || !c2.x && Math.abs(c2.z)) continue;

            // Walkable platform segment between consecutive posts
            this.addColliderBox(new THREE.Vector3((px + p2x) / 2, baseY + 0.25, (pz + pz) / 2), wireLen * 1.5, 0.4, wireLen * 1.5, true);

        // Add collider boxes for fence posts
        const c1 = corners[i];
        this.addColliderBox(new THREE.Vector3(c1.x, baseY + 1.75, c1.z), 0.2, 3.5, 0.2, false);
    }

    _addTank(cx, cz, radius) {
        const x = cx + (this._rand() - 0.5) * radius * 1.8;
        const z = cz + (this._rand() - 0.5) * radius * 1.8;
        const baseY = this.getHeightAt(x, z);

        // Tank body group
        const tankGroup = new THREE.Group();
        const armorColor = 0x4a5d23;
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a4a1e, roughness: 0.9 });
        const steelMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.5, metalness: 0.7 });

        // Lower hull (main body)
        const lowerGeo = new THREE.BoxGeometry(2.8, 0.9, 5);
        const lowerMat = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.85, metalness: 0.1 });
        const lower = new THREE.Mesh(lowerGeo, lowerMat);
        lower.position.y = 1.2;
        lower.castShadow = true;
        tankGroup.add(lower);

        // Upper hull (sloped front armor)
        const upperGeo = new THREE.BoxGeometry(2.5, 0.7, 4.2);
        const upper = new THREE.Mesh(upperGeo, darkMat.clone());
        upper.position.set(0, 1.9, -0.3);
        tankGroup.add(upper);

        // Sloped front armor plate
        const armorGeo = new THREE.BoxGeometry(2.5, 1.0, 0.3);
        const armorMat = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.8 });
        const armor = new THREE.Mesh(armorGeo, armorMat.clone());
        armor.position.set(0, 1.7, 2.5);
        armor.rotation.x = -0.3; // Sloped forward
        tankGroup.add(armor);

        // Engine deck (rear top)
        const engineGeo = new THREE.BoxGeometry(2.0, 0.4, 2.0);
        const engineMat = new THREE.MeshStandardMaterial({ color: 0x1a1f0d, roughness: 0.95 });
        const engineDeck = new THREE.Mesh(engineGeo, engineMat.clone());
        engineDeck.position.set(0, 2.4, -1.8);
        tankGroup.add(engineDeck);

        // Turret base (ring)
        const turretBaseGeo = new THREE.CylinderGeometry(1.3, 1.5, 0.6, 8);
        const turretMat = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.7, metalness: 0.2 });
        const turretBase = new THREE.Mesh(turretBaseGeo, turretMat.clone());
        turretBase.position.set(0, 2.35, -0.1);
        tankGroup.add(turretBase);

        // Turret dome (hemisphere)
        const turretDomeGeo = new THREE.SphereGeometry(1.4, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
        const turretDomeMat = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.6 });
        const turretDome = new THREE.Mesh(turretDomeGeo, turretDomeMat.clone());
        turretDome.position.set(0, 2.35, -0.1);
        tankGroup.add(turretDome);

        // Main cannon (centered on turret)
        const gunBarrelGeo = new THREE.CylinderGeometry(0.18, 0.28, 6.5, 8);
        const gunMat = steelMat.clone();
        const mainGun = new THREE.Mesh(gunBarrelGeo, gunMat);
        mainGun.rotation.x = Math.PI / 2; // Point forward (along Z axis)
        mainGun.position.set(0, 2.5, 4.8);
        tankGroup.add(mainGun);

        // Muzzle brake at cannon tip
        const muzzleGeo = new THREE.CylinderGeometry(0.35, 0.18, 0.6, 8);
        const muzzleMat = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.4 });
        const muzzleBrake = new THREE.Mesh(muzzleGeo, muzzleMat.clone());
        muzzleBrake.rotation.x = Math.PI / 2;
        muzzleBrake.position.set(0, 2.5, 8.1);
        tankGroup.add(muzzleBrake);

        // Coaxial machine gun (next to main cannon)
        const mgGeo = new THREE.CylinderGeometry(0.06, 0.06, 4, 4);
        const mgMat = steelMat.clone();
        const coaxMG = new THREE.Mesh(mgGeo, mgMat);
        coaxMG.rotation.x = Math.PI / 2;
        coaxMG.position.set(0.8, 2.55, 4.3);
        tankGroup.add(coaxMG);

        // Commander's independent thermal viewer (CITV) housing
        const citvGeo = new THREE.BoxGeometry(0.6, 0.5, 0.6);
        const citvMat = darkMat.clone();
        const citv = new THREE.Mesh(citvGeo, citvMat);
        citv.position.set(-1.2, 3.0, -0.8);
        tankGroup.add(citv);

        // Left track assembly (detailed)
        this._addTrackAssembly(tankGroup, x - 1.6, baseY, darkMat.clone());
        // Right track assembly
        this._addTrackAssembly(tankGroup, x + 1.6, baseY, darkMat.clone());

        // Random tank rotation (0-360 degrees) for variety
        tankGroup.rotation.y = Math.random() * Math.PI * 2;
        tankGroup.position.set(x, baseY, z);
        this.scene.add(tankGroup);

        // Collider box around entire tank body
        const totalW = 4.5; // tracks + hull width
        const totalH = 3.8; // turret top height above ground
        const totalD = 7.0; // length including cannon
        this.addColliderBox(new THREE.Vector3(x, baseY + totalH / 2, z), totalW, totalH, totalD, false);

        // Track colliders (separate for collision detection)
        for (let side of [-1, 1]) {
            const trackX = x + side * 1.6;
            this.addColliderBox(new THREE.Vector3(trackX, baseY + 0.9, z), 1.2, 1.8, totalD - 1, false);
        }
    }

    _addTrackAssembly(tankGroup, offsetX, baseY) {
        const trackMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 });
        // Track housing (main body of the track system)
        const housingGeo = new THREE.BoxGeometry(0.7, 1.6, tankGroup.userData.trackLength || 8);
        const housingMat = new THREE.MeshStandardMaterial({ color: 0x2d2d2d, roughness: 0.95 });
        const housing = new THREE.Mesh(housingGeo, trackMat.clone());
        housing.position.set(offsetX, baseY + 0.8, tankGroup.userData.trackLength ? 0 : 0);
        if (!tankGroup.userData.trackLength) {
            // Set the length for reference by other side
            const frontZ = new THREE.Vector3(0, 0, 5).applyQuaternion(tankGroup.quaternion);
            housing.position.z = tankGroup.children.length > 0 ? (frontZ.z + baseY * 2) : 0;
        } else {
            // This is the second call - set length from first assembly
            const len = Math.abs(offsetX) < 1.7 ? tankGroup.userData.trackLength : offsetX;
        }

        // Track pads (individual segments along track)
        for (let i = -4; i <= 4; i++) {
            if (!tankGroup.userData.trackLength) {
                const padGeo = new THREE.BoxGeometry(0.9, 0.25, 0.5);
                const padMat = new THREE.MeshStandardMaterial({ color: 0x1a1f0d, roughness: 0.9 });
                const pad = new THREE.Mesh(padGeo, padMat.clone());
                // Position relative to tank center (not offset by track position)
                const centerX = offsetX + baseY;
                const zIndex = i * 0.85;
                pad.position.set(centerX, baseY + 0.2, z);
                pad.userData.mapGenerated = true;
                this.scene.add(pad);

                // Barbed wire strand (top) - sagging between posts
                for (let s = 0; s < numPosts * 3; s++) { // Three strands per segment
                    const startT = s / (numPosts * 3);
                    const endT = (s + 1.5) / (numPosts * 3);

                    const sagAmount = Math.sin((startT + endT) / 2 * Math.PI) * 0.4; // Maximum sag in middle

                    for (let strandIdx = 0; strandIdx < 3; strandIdx++) {
                        const wireGeo = new THREE.CylinderGeometry(0.015, 0.015, segLen / numPosts, 2);
                        const wireMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.6 });

                        // Calculate wire position with sagging effect
                        const midT = (startT + endT) / 2;
                        const wx1 = p1.x + dx * startT;
                        const wz1 = c1.z + dz * startT;
                        const wx2 = p1x + (p2x - p1x) * endT;
                        const wz2 = pz + dz * endT;

                        wireGeo.position.set(
                            cx + Math.cos(angle) * dist,
                            baseY + 4.65 - strandIdx * 0.3 + sagAmount, // Slight curve for barbed effect
                            cz + Math.sin(angle) * dist
                        );
                        wireGeo.rotation.y = angle; // Align with fence line direction

                        const wireMat = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.8 });
                        const wire = new THREE.Mesh(wireGeo, wireMat);
                        wire.userData.mapGenerated = true;
                        this.scene.add(wire);
                    }

                // Sagging effect (catenary curve) - wires droop slightly between posts
                for (let s = 0; s < numPosts * 3; s++) { // Three strands per segment
                    const startT = s / (numPosts * 3);
                    const endT = (s + 1.5) / (numPosts * 3);

                    const sagAmount = Math.sin((startT + endT) / 2 * Math.PI) * 0.4; // Maximum sag in middle

                    for (let strandIdx = 0; strandIdx < 3; strandIdx++) {
                        const wireGeo = new THREE.CylinderGeometry(0.015, 0.015, segLen / numPosts, 2);
                        const wireMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.8 });

                        // Calculate wire position with sagging effect
                        const midT = (startT + endT) / 2;
                        const wx1 = c1.x + dx * startT;
                        const wz1 = c1.z + dz * startT;
                        const p2x = corners[i+1].x || corners[0].x;
                        const pz = corners[nextI] ? (corners[nextI].z) : cz;

                        wireGeo.position.set(
                            cx + Math.cos(angle) * dist,
                            baseY + 4.65 - strandIdx * 0.3 + sagAmount, // Slight curve for barbed effect
                            cz + Math.sin(angle) * dist
                        );
                        wire.rotation.z = (strandIdx % 2 === 0 ? -1 : 1) * 0.8; // Cross pattern

                    if (!tankGroup.userData.trackLength) {
                        tankGroup.userData.trackLength = 9;
                        const trackLen = tankGroup.userData.trackLength || 9;
                        for (let i = -4; i <= 4; i++) {
                            const padGeo = new THREE.BoxGeometry(1.0, 0.25, 0.6);
                            const padMat = new THREE.MeshStandardMaterial({ color: 0x1a1f0d, roughness: 0.9 });
                            const pad = new THREE.Mesh(padGeo, padMat.clone());
                            pad.position.set(offsetX, baseY + trackLen / 2, i * 0.85);
                            tankGroup.add(pad);
                        }

                    // Road wheels (inside the tracks)
                    for (let i = -3; i <= 3; i++) {
                        const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.25, 10);
                        const wheelMat = trackMat.clone();
                        const roadWheel = new THREE.Mesh(wheelGeo, wheelMat);
                        roadWheel.rotation.z = Math.PI / 2; // Rotate to face sideways (like real wheels)
                        roadWheel.position.set(offsetX, baseY + 0.55, i * 1.2);
                        tankGroup.add(roadWheel);
                    }

                    // Drive sprocket at rear of track
                    const sprocketGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12);
                    const sprocketMat = trackMat.clone();
                    const sprocket = new THREE.Mesh(sprocketGeo, sprocketMat);
                    sprocket.rotation.z = Math.PI / 2; // Rotate to face sideways (like real wheels)
                    sprocket.position.set(offsetX, baseY + 0.85, -4);
                    tankGroup.add(sprocket);

                    // Idler wheel at front of track
                    const idlerGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10);
                    const idlerMat = trackMat.clone();
                    const idlerWheel = new THREE.Mesh(idlerGeo, idlerMat);
                    idlerWheel.rotation.z = Math.PI / 2; // Rotate to face sideways (like real wheels)
                    idlerWheel.position.set(offsetX, baseY + 0.85, 4);
                    tankGroup.add(idlerWheel);
                }

    _addRadioTower(x, z) {
        const baseY = this.getHeightAt(x, z);
        const towerMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.5, metalness: 0.7 });

        // Main mast (tapered pole)
        const mastGeo = new THREE.CylinderGeometry(0.2, 0.4, 18, 6);
        const mastMat = towerMat.clone();
        const mastMesh = new THREE.Mesh(mastGeo, mastMat);
        mastMesh.position.set(x, baseY + 9, z);
        mastMesh.userData.mapGenerated = true;
        this.scene.add(mastMesh);

        // Cross beams at different heights (2 crossbars)
        for (let i = 0; i < 3; i++) {
            const beamLen = 4 - i * 1.2; // Tapering length as we go up
            const beamGeo = new THREE.BoxGeometry(beamLen, 0.15, 0.15);
            const beamMat = towerMat.clone();

            // Two perpendicular beams at each level (forming a cross)
            for (let b = 0; b < 2; b++) {
                const beamAngle = b * Math.PI / 2; // Alternate between X and Z axis alignment
                const beam = new THREE.Mesh(beamGeo, beamMat);
                beam.position.set(x + Math.cos(b) * beamLen / 4, baseY + 5.5 + i * 5, z + Math.sin(b) * beamLen / 4);
                beam.rotation.y = b; // Rotate around Y to alternate X/Z alignment (0 or π/2)
                beam.userData.mapGenerated = true;
                this.scene.add(beam);

            }
        }

        // Antenna dishes at different heights, each pointing in a unique direction
        for (let i = 0; i < 3; i++) {
            const dishGeo = new THREE.ConeGeometry(1.5 + i * 0.8, 0.6, 8, 1, true); // Open cone shape (side: THREE.DoubleSide)
            const dishMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.4, metalness: 0.5 });

            // Position each dish at different height on the mast
            const dishHeight = baseY + 8 + i * 3; // Spaced vertically along tower (8m, 11m, 14m)
            const dishAngle = Math.PI / 2 + i * Math.PI / 6; // Slight angle offset per dish for variety

            // Orient dishes in different directions based on their height index
            const directionX = Math.cos(dishHeight); // Use height as unique identifier for each dish's X rotation
            const directionZ = Math.sin(dishHeight); // Same for Z axis variation
            const dirLen = Math.sqrt(directionX * directionX + directionZ * directionZ) || 1;

            // Rotate dishes to face different directions (unique per dish, not along mast height)
            const dishMesh = new THREE.Mesh(dishGeo, dishMat);
            dishMesh.position.set(
                x + (directionX / dirLen) * 0.8, // Offset from center by normalized direction X component * distance offset
                dishHeight, // Position at calculated height along mast
                z + (directionZ / dirLen) * 0.8 // Offset from center by normalized direction Z component * distance offset
            );

            const rotX = Math.atan2(directionZ, directionX); // Calculate rotation angle from X and Z components using atan2 for proper orientation in XY plane
            const rotY = dishAngle; // Apply unique height-based angle to Y axis rotation (each dish faces different horizontal direction)
            const rotZ = i * 0.35; // Slight tilt variation per dish along Z axis

            dishMesh.rotation.set(rotX, rotY, rotZ); // Combine all three rotations for full 3D orientation
            dishMesh.userData.mapGenerated = true;
            this.scene.add(dishMesh);
        }

        // Blinking red signal light at tower top (animated)
        const beaconGeo = new THREE.SphereGeometry(0.25, 8, 6);
        const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff0000, emissiveIntensity: 1.5 });
        const beaconLight = new THREE.Mesh(beaconGeo, beaconMat.clone());
        beaconLight.position.set(x, baseY + 20, z); // At top of mast (just above highest dish)
        beaconLight.userData.mapGenerated = true;

        if (!this.animatedObjects) this.animatedObjects = [];
        this.animatedObjects.push({ type: 'towerBeacon', obj: beaconLight });
        this.scene.add(beaconLight);

        // Colliders for tower mast and dishes
        const minRadius = Math.min(dishGeo.parameters.widthSegments || 8, dishMat.parameters.heightSegments || 6) || 1;
        if (minRadius > 0 && !isNaN(minRadius)) {
            this.addColliderBox(
                new THREE.Vector3(x + directionX * 0.5 / dirLen, baseY + 9, z), // Offset by normalized dish position along X axis scaled by half distance offset from center
                Math.abs(directionZ) < 0.1 ? beamLen : minRadius * 2, // Use beam length if aligned with Z (flat side facing camera), otherwise use dish radius for proper bounding box collision detection
                Math.abs(directionX) < 0.1 ? minRadius * 2 : beamLen, // Same logic applied to X axis - prefer beam dimensions over dish size when direction is perpendicular to beam alignment
                false
            );
        }

    _addTrackAssembly(group, offsetZ, baseY) {
        const trackHousingGeo = new THREE.BoxGeometry(0.9, 1.8, group.userData.trackLength || 10);
        if (!group.userData.trackLength) group.userData.trackLength = 10; // Set default length for reference by other side

        const trackMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 });
        const housing = new THREE.Mesh(trackHousingGeo, trackMat.clone());
        housing.position.set(offsetZ - baseY * 2, group.userData.trackLength ? offsetZ : (offsetX + baseY), Math.abs(offsetZ) < 1.7 ? -4.5 : 0);

        // Track pads along the length of each side (left and right tracks)
        for (let i = -4; i <= 4; i++) {
            const padGeo = new THREE.BoxGeometry(1.2, 0.3, group.userData.trackLength || 9);
            if (!group.userData.trackLength) {
                // Calculate track length from existing geometry or use default (9 units long along Z axis for standard tank dimensions)
                const frontZ = Math.max(...tankGroup.children.map(c => c.position.z));
                const rearZ = Math.min(...tankGroup.children.map(c => c.position.z));
                group.userData.trackLength = (frontZ - rearZ); // Track length from front to back of vehicle body
            }

            const trackLen = group.userData.trackLength || 9;
            const padGeo2 = new THREE.BoxGeometry(1.0, 0.3, trackLen / numPosts);
            const padMat2 = darkMat.clone();
            const padMesh = new THREE.Mesh(padGeo2, padMat2);

            // Position pads along the X axis (width of tank) instead of Z axis (lengthwise)
            // This creates tracks running front-to-back on each side of vehicle body
            padMesh.position.set(offsetX + baseY * 0.5, group.userData.trackLength ? offsetZ : (offsetX - baseY), i * trackLen / numPosts);

            tankGroup.add(padMesh);
        }

        // Road wheels inside the tracks (visible through gaps)
        for (let i = -3; i <= 3; i++) {
            const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.25, 10);
            const wheelMat = trackMat.clone();
            // Rotate cylinder to face sideways (like real tank road wheels) - align along X axis for side-mounted wheels
            const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat.clone());
            wheelMesh.rotation.z = Math.PI / 2;
            if (!group.userData.trackLength) {
                group.userData.trackLength = trackLen || (Math.abs(offsetZ + baseY * 2) < 5 ? tankGroup.userData.trackLength : 10);
                offsetZ = group.userData.trackLength ? i * (trackLen / numPosts) : offsetZ; // Use calculated length for proper Z positioning along track
            }

            wheelMesh.position.set(offsetX, baseY + 0.6, z + Math.abs(i * 1.2));
            tankGroup.add(wheelMesh);
        }

        // Drive sprocket at the rear of each track (larger gear for track drive)
        const sprocketGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.4, 12);
        const sprocketMat = trackMat.clone();
        const sprocketMesh = new THREE.Mesh(sprocketGeo, sprocketMat);

        // Position at rear of tank (negative Z direction from center) - offset by baseY for proper height alignment
        sprocketMesh.rotation.z = Math.PI / 2;
        if (!group.userData.trackLength) {
            group.userData.trackLength = trackLen || 10;
            sprocketMesh.position.set(offsetX, group.userData.trackLength ? (offsetZ - baseY * 2 + baseY) : offsetZ, z); // Position at rear of tank body using calculated length for proper alignment
        }

        tankGroup.add(sprocketMesh);

        // Idler wheel at the front of each track assembly (smaller gear that guides track return path)
        const idlerGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10);
        const idlerMat = trackMat.clone();

        // Position idler at front of tank body using calculated length to determine exact location relative to vehicle center
        if (!group.userData.trackLength) {
            group.userData.trackLength = trackLen || (Math.abs(offsetX + baseY * 2) < 5 ? tankGroup.userData.trackLength : 10);
            idlerMesh.position.set(, Math.abs(offsetZ) > 4.8 ? offsetZ - 3 : offsetZ + 3, z + group.userData.trackLength / 2); // Position at front of vehicle body using calculated track length for proper location relative to center
        } else {
            const idlerMesh = new THREE.Mesh(idlerGeo, idlerMat.clone());
            idlerMesh.rotation.z = Math.PI / 2;

            tankGroup.add(idlerMesh);
        }
    }

}
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
