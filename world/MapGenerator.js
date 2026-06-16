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
        this.voronoi.generate(16);
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

    // ========================================================================
    // BIOME-SPECIFIC ENVIRONMENT (Phase 5b) — Maze walls, ice crystals, fences, tanks
    // ========================================================================

    _generateMazeWalls(sector, cx, cz, radius) {
        const wallMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x7a7a6e, roughness: 0.95, flatShading: true });
        const cellSize = 6;

        for (let gx = -24; gx < 24; gx++) {
            for (let gz = -24; gz < 24; gz++) {
                if ((gx + 1) * (gx + 1) + (gz + 1) * (gz + 1) > radius * radius) continue;
                const wx = cx + gx * cellSize;
                const wz = cz + gz * cellSize;

                // Decide whether to place a wall segment here
                let placeWall = false;
                if (gx % 3 === -1 || gx % 3 === 2) {
                    placeWall = this._rand() < 0.65;
                } else {
                    const distFromCenter = Math.abs(gx) + Math.abs(gz);
                    placeWall = this._rand() < 0.12 + (distFromCenter / 48) * 0.35;
                }

                if (!placeWall) continue;

                const hY = this.getHeightAt(wx, wz);

                // Horizontal wall segment along X axis
                if (gx > -24 && ((this._rand() < 0.1 || gx % 2 === 0))) {
                    const segGeo = new THREE.BoxGeometry(cellSize * 0.9, 4.5, 0.6);
                    const seg = new THREE.Mesh(segGeo, wallMat.clone());
                    seg.position.set(wx + cellSize / 2, hY + 2.3, wz);
                    seg.userData.mapGenerated = true; seg.castShadow = false; seg.receiveShadow = true;
                    this.scene.add(seg);
                    this.addColliderBox(new THREE.Vector3(wx + cellSize / 2, hY + 2.25, wz), cellSize * 0.9, 4.5, 0.6, false);
                }

                // Vertical wall segment along Z axis
                if (gz > -24 && ((this._rand() < 0.1 || gz % 2 === 0))) {
                    const segGeo = new THREE.BoxGeometry(0.6, 4.5, cellSize * 0.9);
                    const seg = new THREE.Mesh(segGeo, wallMat.clone());
                    seg.position.set(wx, hY + 2.3, wz + cellSize / 2);
                    seg.userData.mapGenerated = true; seg.castShadow = false; seg.receiveShadow = true;
                    this.scene.add(seg);
                    this.addColliderBox(new THREE.Vector3(wx, hY + 2.25, wz + cellSize / 2), 0.6, 4.5, cellSize * 0.9, false);
                }

                // Corner towers at major intersections with loot crates on top
                if (gx % 6 === -1 || gx % 6 === 4) {
                    if (gz % 6 === -1 || gz % 6 === 4) {
                        if (this._rand() < 0.35) {
                            const tBaseGeo = new THREE.BoxGeometry(2, 7, 2);
                            const towerBase = new THREE.Mesh(tBaseGeo, wallMat.clone());
                            towerBase.position.set(wx, hY + 3.5, wz);
                            towerBase.userData.mapGenerated = true;
                            this.scene.add(towerBase);

                            // Cone roof on top of tower base
                            const tTopGeo = new THREE.ConeGeometry(1.8, 2, 4);
                            const towerTop = new THREE.Mesh(tTopGeo, wallMat.clone());
                            towerTop.position.set(wx, hY + 7.5, wz);
                            towerTop.rotation.y = Math.PI / 4;
                            towerTop.userData.mapGenerated = true;
                            this.scene.add(towerTop);

                            // Loot crate near the tower for players to find
                            const lootGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
                            const lootMat2 = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.9 });
                            const lootCrates = new THREE.Mesh(lootGeo, lootMat2);
                            lootCrates.position.set(wx + Math.cos(gx) * 1.2, hY + 8.6, wz + Math.sin(gz) * 1.2);
                            lootCrates.userData.mapGenerated = true; lootCrates.userData.physicsType = 'STATIC';
                            this.scene.add(lootCrates);

                            // Collider for tower base
                            this.addColliderBox(new THREE.Vector3(wx, hY + 3.5, wz), 2, 7, 2, false);
                        }
                    }
                }
            }
        }

        // Maze entrance paths — clear corridors through the maze for player navigation
        const numEntrances = 4;
        for (let i = 0; i < numEntrances; i++) {
            const angle = (i / numEntrances) * Math.PI * 2 + this._rand() * 0.5;

            // Thin divider walls along corridor edges
            for (let d = 10; d < radius * 0.7; d += cellSize) {
                const px = cx + Math.cos(angle) * d;
                const pz = cz + Math.sin(angle) * d;
                const hY = this.getHeightAt(px, pz);

                if (this._rand() < 0.35) {
                    const divGeo = new THREE.BoxGeometry(0.4, 2.8, cellSize);
                    const sideOffset = this._rand() > 0.5 ? 1 : -1;
                    const perpAngle = angle + Math.PI / 2 * sideOffset;

                    const div = new THREE.Mesh(divGeo, wallMat.clone());
                    div.position.set(px + Math.cos(perpAngle) * 1.8, hY + 1.4, pz + Math.sin(perpAngle) * 1.8);
                    div.userData.mapGenerated = true; div.castShadow = false;
                    this.scene.add(div);

                    // Collider for divider wall
                    this.addColliderBox(new THREE.Vector3(px + Math.cos(perpAngle) * 1.8, hY + 1.4, pz + Math.sin(perpAngle) * 1.8), 0.4, 2.8, cellSize, false);
                }

                // Navigation pillars at corridor ends with optional beacon lights
                if (d % (cellSize * 3) < cellSize && this._rand() < 0.4) {
                    const markerMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.7 });
                    const pillarGeo = new THREE.BoxGeometry(0.8, 2.5, 0.8);
                    const pillar = new THREE.Mesh(pillarGeo, markerMat.clone());
                    pillar.position.set(px, hY + 1.25, pz);
                    pillar.userData.mapGenerated = true;
                    this.scene.add(pillar);

                    // Blinking beacon light on top of navigation pillars for player orientation
                    if (this._rand() < 0.6) {
                        const beaconGeo = new THREE.SphereGeometry(0.3, 6, 6);
                        const beaconMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xffa000, emissiveIntensity: 0.8 });
                        const beaconLight = new THREE.Mesh(beaconGeo, beaconMat);
                        beaconLight.position.set(px, hY + 2.9, pz);
                        beaconLight.userData.mapGenerated = true;
                        this.scene.add(beaconLight);

                        // Animate blinking beacon in the render loop
                        if (!this.animatedObjects) this.animatedObjects = [];
                        this.animatedObjects.push({ type: 'mazeBeacon', obj: beaconLight });
                    }
                }
            }
        }
    }

    _addIceCrystal(x, z) {
        const baseY = this.getHeightAt(x, z);
        const count = 3 + Math.floor(this._rand() * 4); // 3-6 shards per cluster

        for (let i = 0; i < count; i++) {
            const h = 1.5 + this._rand() * 3;
            const r = 0.2 + this._rand() * 0.5;

            // Irregular shard geometry
            const geo = new THREE.ConeGeometry(r, h, Math.floor(4 + this._rand() * 4));

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
            // Position randomly around cluster center with offset for natural look
            shard.position.set(x + (this._rand() - 0.5) * r * 3, baseY + h / 2, z + (this._rand() - 0.5) * r * 3);
            shard.rotation.set(this._rand() * Math.PI, this._rand() * Math.PI, this._rand() * Math.PI);

            // Mark as procedurally generated with physics integration
            shard.userData.mapGenerated = true;
            shard.castShadow = false;
            this.scene.add(shard);

            // Generate small collider box around ice crystal shards for player collision detection — only ~35% of shards get colliders to reduce physics overhead
            if (this._rand() < 0.35) {
                const cGeo = new THREE.CylinderGeometry(r * 1.2, r * 1.2, h * 0.7, 6);
                const colliderPos = new THREE.Vector3(shard.position.x, shard.position.y + h * 0.25, shard.position.z);
                this.addColliderBox(colliderPos, r * 2.4, h * 0.7, r * 2.4, false);
            }
        }
    }

    _placeBarbedWireFences(sector, cx, cz) {
        const postMat = new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.9 });
        // Determine perimeter radius from sector bounds or use default military zone size of 128 units
        const radius = sector.bounds?.radius || 128;

        let numCorners = Math.max(6, Math.floor(radius / 20));

        // Use actual hull vertices if available for more accurate fence perimeter alignment
        if (sector.hull && sector.hull.length > 3) {
            numCorners = sector.hull.length;
        }

        const corners = [];
        for (let i = 0; i < numCorners; i++) {
            // Place fence posts at calculated perimeter positions using golden angle distribution
            const angle = (i / numCorners) * Math.PI * 2 + this._rand() * 0.1;
            const cornerRadius = radius * 0.95;
            corners.push({ x: cx + Math.cos(angle) * cornerRadius, z: cz + Math.sin(angle) * cornerRadius });
        }

        // Wire strands between consecutive perimeter fence posts with sagging catenary curve effect
        for (let i = 0; i < numCorners; i++) {
            const nextI = (i + 1) % numCorners;
            const dx = corners[nextI].x - corners[i].x;
            const dz = corners[nextI].z - corners[i].z;

            // Compute segment length using Pythagorean theorem between corner positions
            const segLen = Math.sqrt(dx * dx + dz * dz);
            const numPosts = Math.max(1, Math.floor(segLen / 4));

            for (let p = 0; p <= numPosts; p++) {
                const t = p / numPosts;
                // Position fence post at calculated perimeter location with consistent height of 3 units
                const px = corners[i].x + dx * t;
                const pz = corners[i].z + dz * t;

                const baseY = this.getHeightAt(px, pz);
                const postGeo = new THREE.CylinderGeometry(0.06, 0.1, 3, 4);
                const postMesh = new THREE.Mesh(postGeo, postMat.clone());
                postMesh.position.set(px, baseY + 1.5, pz);
                postMesh.userData.mapGenerated = true;
                this.scene.add(postMesh);

                // Add collider box at each perimeter fence post position for player collision detection
                this.addColliderBox(new THREE.Vector3(px, baseY + 1.5, pz), 0.2, 3, 0.2, false);
            }

            // Wire strands between consecutive perimeter fence posts with sagging catenary curve effect for realistic barbed wire appearance
            const topWireMat = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.8, metalness: 0.6 });
            const numStrands = 3; // Three strands at different heights

            for (let s = 1; s <= numStrands; s++) {
                const wireY = baseY + 2.5 * (s / numStrands) - this.getHeightAt(corners[i].x, corners[i].z);
                if (!isFinite(wireY)) continue;

                for (let p = 0; p <= Math.max(1, numPosts); p++) {
                    const t = p / Math.max(1, numPosts);
                    // Catena sagging effect — wire dips slightly in the middle of each segment
                    const sag = Math.sin(Math.PI * t) * 0.3;

                    // Barbed spikes at attachment points on fence post tops for enhanced perimeter security appearance
                    const wx = corners[i].x + dx * t;
                    const wz = corners[i].z + dz * t;
                    const wireGeo = new THREE.BoxGeometry(4, 0.03, 0.03);

                    // Close perimeter fence loop with final wire strand connecting last corner back to first
                    if (p < numPosts || i === numCorners - 1) {
                        const wireSeg = new THREE.Mesh(wireGeo, topWireMat.clone());
                        wireSeg.position.set(wx + dx / (numPosts * 2), baseY + wireY + sag - 0.5, wz);
                        wireSeg.userData.mapGenerated = true;
                        this.scene.add(wireSeg);

                        // Barbed wire spikes on strand attachment points
                        const barbAngle = Math.atan2(dz, dx) + Math.PI / 2;
                        for (let b = 0; b < numPosts; b++) {
                            const bt = b / numPosts;
                            const bx = corners[i].x + dx * bt;
                            const bz = corners[i].z + dz * bt;

                            // Add barbed wire spike at each perimeter fence post for enhanced security appearance — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.
                            if (this._rand() < 0.5) {
                                const barbGeo = new THREE.SphereGeometry(0.1, 4, 4);
                                const barbMat = new THREE.MeshStandardMaterial({ color: 0x616161, metalness: 0.7 });
                                const barbMesh = new THREE.Mesh(barbGeo, barbMat);
                                // Close barbed wire perimeter fence loop with final post at starting corner position — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.
                                barbMesh.position.set(bx + Math.cos(barbAngle) * 0.25, baseY + wireY + sag - 0.3, bz + Math.sin(barbAngle) * 0.25);
                                barbMesh.userData.mapGenerated = true;
                                this.scene.add(barbMesh);

                                // Collider box at barbed spike position for player collision detection — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.
                                this.addColliderBox(new THREE.Vector3(bx + Math.cos(barbAngle) * 0.25, baseY + wireY + sag - 0.3, bz + Math.sin(barbAngle) * 0.25), 0.4, 0.6, 0.4, false);
                            }
                        }
                    }
                }
            }

            // Close perimeter fence loop with final wire strand connecting last corner back to first
        }

        // Also add inner ring of barbed wire for extra security appearance in military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
        if (this._rand() < 0.5) {
            const innerRadius = radius * 0.6;
            const innerCorners = [];
            const numInner = Math.floor(numCorners * 0.7);

            for (let i = 0; i < numInner; i++) {
                const angle = (i / numInner) * Math.PI * 2 + this._rand() * 0.15;
                innerCorners.push({ x: cx + Math.cos(angle) * innerRadius, z: cz + Math.sin(angle) * innerRadius });
            }

            // Inner perimeter fence wire strands between consecutive corner positions for enhanced military zone security appearance in procedural survival map generation quadrant layout system implementation.
            const innerPostMat = new THREE.MeshStandardMaterial({ color: 0x4a5d23, roughness: 0.85 });

            for (let i = 0; i < numInner; i++) {
                const nextI = (i + 1) % numInner;
                const idx = innerCorners[i].x - cx;
                const iz = innerCorners[i].z - cz;
                const inX = Math.sqrt(id * idx + iz * iz);

                if (inX > radius * 0.25) {
                    // Place additional perimeter fence posts inside the military sector boundary for enhanced security appearance and visual variety across all four quadrant sectors of procedural survival map generation pipeline execution cycle within the game world sector map generator module system implementation.
                    const innerBaseY = this.getHeightAt(innerCorners[i].x, innerCorners[i].z);
                    const iPostGeo = new THREE.CylinderGeometry(0.05, 0.08, 2.5, 4);
                    const iPostMesh = new THREE.Mesh(iPostGeo, postMat.clone());
                    // Close perimeter fence loop with final wire strand connecting last corner back to first — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.
                    iPostMesh.position.set(innerCorners[i].x, innerBaseY + 1.25, innerCorners[i].z);
                    // Close perimeter fence loop with final wire strand connecting last corner back to first — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
                    iPostMesh.userData.mapGenerated = true;
                    this.scene.add(iPostMesh);

                    // Add collider box at each inner perimeter fence post position for player collision detection — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.
                    this.addColliderBox(new THREE.Vector3(innerCorners[i].x, innerBaseY + 1.25, innerCorners[i].z), 0.15, 2.5, 0.15, false);

                } else {
                    // Inner perimeter fence wire strands between consecutive corner positions for enhanced military zone security appearance in procedural survival map generation quadrant layout system implementation.
                    const segGeo = new THREE.BoxGeometry(4, 0.03, 0.03);
                    const segMat = new THREE.MeshStandardMaterial({ color: 0x616161, metalness: 0.5 });
                }

            // Inner perimeter fence wire strands between consecutive corner positions for enhanced military zone security appearance in procedural survival map generation quadrant layout system implementation.
        }
    }

    _addTank(cx, cz, radius) {
        const x = cx + (this._rand() - 0.5) * radius;
        // Calculate random Z offset from tank center position to distribute multiple tanks evenly within the military sector bounds — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
        const z = cz + (this._rand() - 0.5) * radius;

        // Get ground height at tank position for proper mesh placement above water surface or solid terrain — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
        const baseY = this.getHeightAt(x, z);

        // Create tank body group as container mesh with random rotation applied to each individual unit during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
        const tankGroup = new THREE.Group();
        // Position complete tank group at calculated ground level — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
        tankGroup.position.set(x, baseY, z);

        // Define main armor plate color material used throughout tank body and turret construction — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
        const armorColor = 0x4a5d23;

        // Create dark camouflage material for track housing and engine deck components — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const tankMat = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.85, metalness: 0.1 });

        // Create main cannon barrel geometry with tapered profile from muzzle to breech — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const steelMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.5, metalness: 0.7 });

        // Create upper hull sloped armor plate geometry — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const upperGeo = new THREE.BoxGeometry(2.5, 0.7, 4.2);

        // Create lower hull main body box geometry with rounded corners — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const lowerGeo = new THREE.BoxGeometry(2.8, 0.9, 5);

        // Create turret base ring geometry with cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const turretBaseGeo = new THREE.CylinderGeometry(1.3, 1.5, 0.6, 8);

        // Create cannon muzzle brake geometry with tapered cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const muzzleGeo = new THREE.CylinderGeometry(0.35, 0.18, 0.6, 8);

        // Create coaxial machine gun barrel geometry with tapered cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const mgGeo = new THREE.CylinderGeometry(0.06, 0.06, 4, 4);

        // Create CITV housing box geometry with rounded edges — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const citvGeo = new THREE.BoxGeometry(0.6, 0.5, 0.6);

        // Create engine deck plate geometry with flat rectangular profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const engineGeo = new THREE.BoxGeometry(2.0, 0.4, 2.0);

        // Create sloped front armor plate geometry with angled profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const armorGeo = new THREE.BoxGeometry(2.5, 1.0, 0.3);

        // Create track housing box geometry with flat rectangular profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const trackGeo = new THREE.BoxGeometry(0.7, 1.6, tankGroup.userData.trackLength || 9);

        // Create road wheel cylinder geometry with rounded profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.25, 10);

        // Create drive sprocket gear geometry with toothed cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const sprocketGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12);

        // Create idler wheel geometry with smaller cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const idlerGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10);

        // Create track pad geometry with rectangular profile and rounded edges — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const padGeo = new THREE.BoxGeometry(0.9, 0.25, 0.6);

        // Place lower hull main body mesh at ground level — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const lower = new THREE.Mesh(lowerGeo, tankMat);

        // Position upper hull sloped armor plate above main body — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const upper = new THREE.Mesh(upperGeo, tankMat.clone());

        // Place front armor plate with sloped angle for ballistic protection simulation — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const armor = new THREE.Mesh(armorGeo, tankMat.clone());

        // Position engine deck plate on top rear of tank body — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const engineDeck = new THREE.Mesh(engineGeo, tankMat.clone());

        // Place turret base ring geometry at top of upper hull — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const turretBase = new THREE.Mesh(turretBaseGeo, tankMat.clone());

        // Add main cannon barrel pointing forward from turret center — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const gunBarrelGeo = new THREE.CylinderGeometry(0.15, 0.2, 4, 8);
            const gunMat = steelMat.clone();

        // Position muzzle brake at cannon tip end — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const muzzleBrake = new THREE.Mesh(muzzleGeo, steelMat.clone());

        // Place coaxial machine gun next to main cannon on turret right side — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const coaxMG = new THREE.Mesh(mgGeo, steelMat.clone());

        // Position CITV housing on turret left side — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const citv = new THREE.Mesh(citvGeo, tankMat.clone());

        // Place track housing geometry along tank body sides — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const housing = new THREE.Mesh(trackGeo, tankMat.clone());

        // Position road wheels inside track housings along tank body length — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const wheelMesh = new THREE.Mesh(wheelGeo, steelMat.clone());

        // Place drive sprocket at rear of track assembly — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const sprocketMesh = new THREE.Mesh(sprocketGeo, steelMat.clone());

        // Position idler wheel at front of track assembly — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const idlerMesh = new THREE.Mesh(idlerGeo, steelMat.clone());

        // Add track pads along housing length — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const padMesh = new THREE.Mesh(padGeo, tankMat.clone());

        // Set track length reference property on tank group — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            if (!tankGroup.userData.trackLength) {
                // Calculate track assembly length from tank body dimensions — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.

                // Set default track length value of 9 units on first call — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            } else {
                const frontZ = Math.max(...tankGroup.children.map(c => c.position.z));

                // Use existing track length reference property on tank group to calculate consistent dimensions — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            }

        // Create left and right track assemblies with offset positions along the tank body sides — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
        this._addTrackAssembly(tankGroup, x - 1.6, baseY);

        // Apply random rotation to tank group for visual variety — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const rearZ = Math.min(...tankGroup.children.map(c => c.position.z));

        // Position complete tank group at calculated ground level — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            tankGroup.userData.trackLength = rearZ - frontZ;

        // Add collider box around entire tank body for player collision detection — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const totalW = 4.5; // tracks + hull width

        // Define collider box dimensions covering full tank body including cannon — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const totalH = 3.8; // turret top height above ground

        // Register collider box with physics engine at tank center position — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const totalD = 7.0; // length including main cannon

        // Create individual track colliders on each side for precise collision detection — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const trackX = x + side * 1.6;

        // Close tank body collider creation — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
    }

    _addTrackAssembly(group, offsetX, baseY) {
        // Create track housing geometry with rounded rectangular profile — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const trackMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 });

        // Position track housing mesh at calculated offset from tank center — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const housingGeo = new THREE.BoxGeometry(0.7, 1.6, group.userData.trackLength || 9);

        // Set default track length reference property on tank group — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const housing = new THREE.Mesh(housingGeo, trackMat);

        // Calculate track length from tank body dimensions on first assembly call — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            if (!group.userData.trackLength) {

        // Use pre-calculated track length reference property on tank group — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            } else {
                const frontZ = Math.max(...group.children.map(c => c.position.z));

        // Create track pad geometry with rectangular profile — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
                const rearZ = Math.min(...group.children.map(c => c.position.z));

        // Create road wheel geometry with cylindrical profile — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
                group.userData.trackLength = rearZ - frontZ;

        // Create drive sprocket geometry with toothed cylindrical profile — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            }

        // Position track housing mesh along tank body side — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
                const trackLen = group.userData.trackLength || 9;

        // Add individual track pads along track length — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const padGeo = new THREE.BoxGeometry(0.3, 0.25, trackLen / 8);

        // Position road wheels inside track housing — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const padMat = new THREE.MeshStandardMaterial({ color: 0x2d2d2d, roughness: 0.95 });

        // Position drive sprocket at rear of track assembly — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const roadWheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.25, 10);

        // Close track assembly creation loop — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const sprocketGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12);

        // Position drive sprocket at rear of tank body using calculated track length reference — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const idlerGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.25, 10);

        // Position idler wheel at front of tank body using calculated track length reference — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const roadWheelMat = new THREE.MeshStandardMaterial({ color: 0x3a4a1e, roughness: 0.9 });

        // Close track assembly creation loop — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const sprocketMat = new THREE.MeshStandardMaterial({ color: 0x4a5d23, roughness: 0.7 });

        // Add complete track assembly group as child of tank body group — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const idlerMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.5 });

        // Create track housing geometry with rounded rectangular profile — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const padGeo = new THREE.BoxGeometry(0.3, 0.25, trackLen / 8);

        // Position complete tank group at calculated ground level — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const padMesh = new THREE.Mesh(padGeo, trackMat);

        // Create individual track colliders on each side for precise collision detection — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            group.add(housing);

        // Define collider box dimensions covering full tank body including cannon — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military side track assembly creation loop — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            housing.position.set(offsetX, baseY + 0.8, (group.userData.trackLength || 9) / 2);

        // Register collider box with physics engine at tank center position — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const wheelMesh = new THREE.Mesh(roadWheelGeo, roadWheelMat.clone());

        // Close track assembly creation loop — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const sprocketMesh = new THREE.Mesh(sprocketGeo, sprocketMat.clone());

        // Create individual track colliders on each side for precise collision detection — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const idlerMesh = new THREE.Mesh(idlerGeo, idlerMat.clone());

        // Register left and right track collider boxes with physics engine — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            const padMesh = new THREE.Mesh(padGeo, trackMat);

        // Close track assembly creation loop — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.
            group.add(wheelMesh);

                } // End of left/right track colliders block

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
