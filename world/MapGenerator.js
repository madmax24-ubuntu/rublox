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

        // Coordinate system
        this.tileSize = 4;
        this.gridWidth = 151;
        this.gridHeight = 151;
        this.size = this.gridWidth * this.tileSize; // 604
        this.halfSize = this.size / 2; // 302

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
        this.voronoi.generate(8);
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
        const sectorBuildings = new Map(); // sectorId → []
        for (const s of this.voronoi.sectors) {
            sectorBuildings.set(s.id, []);
        }

        // Per-sector building placement
        for (const sector of this.voronoi.sectors) {
            const templates = getTemplatesForBiome(sector.biome);
            const density = sector.buildingDensity;
            const numBuildings = Math.floor(5 + density * 15); // 5-20 buildings per sector

            // Poisson disk sampling within sector bounds
            const minDist = 12; // Minimum distance between buildings
            const placed = [];
            const radius = sector.bounds.radius || 50;
            const cx = sector.center.x;
            const cz = sector.center.z;

            // Golden angle initial points
            const goldenAngle = 2.3983789851923124;

            for (let attempt = 0; attempt < numBuildings * 5 && placed.length < numBuildings; attempt++) {
                // Use golden angle for initial distribution
                let px, pz;
                if (attempt < numBuildings * 2) {
                    const angle = attempt * goldenAngle;
                    const r = radius * Math.sqrt(this._rand() * 0.9) * (0.6 + density * 0.4);
                    px = cx + Math.cos(angle) * r;
                    pz = cz + Math.sin(angle) * r;
                } else {
                    // Random retry within bounds
                    px = cx + (this._rand() - 0.5) * 2 * radius;
                    pz = cz + (this._rand() - 0.5) * 2 * radius;
                }

                // Check distance from existing placements
                let tooClose = false;
                for (const p of placed) {
                    const dx = px - p.x;
                    const dz = pz - p.z;
                    if (dx * dx + dz * dz < minDist * minDist) {
                        tooClose = true;
                        break;
                    }
                }
                if (tooClose) continue;

                // Check sector bounds
                if (px < sector.bounds.minX || px > sector.bounds.maxX ||
                    pz < sector.bounds.minZ || pz > sector.bounds.maxZ) {
                    continue;
                }

                // Pick a template
                const template = templates[Math.floor(this._rand() * templates.length)];
                if (!template) continue;

                placed.push({
                    x: px, z: pz,
                    template,
                    sectorId: sector.id
                });
            }

            sectorBuildings.set(sector.id, placed);
            placements.push(...placed);
        }

        return placements;
    }

    // ========================================================================
    // BUILDING GENERATION (Phase 4)
    // ========================================================================
    _buildBuildings(placements) {
        for (const placement of placements) {
            const { template, x, z, sectorId } = placement;
            const baseY = this.getHeightAt(x, z);

            // Adjust for elevated buildings
            const elevation = template.elevated ? (template.elevationHeight || 2) : 0;
            const buildingY = baseY + elevation;

            // Building dimensions
            const w = template.width;
            const d = template.depth;
            const h = template.height;
            const halfW = w / 2;
            const halfD = d / 2;

            // --- Wall material ---
            const wallMat = new THREE.MeshStandardMaterial({
                color: template.wallColor || 0xbcaaa4,
                roughness: 0.85,
                flatShading: true
            });

            // --- Wall thickness ---
            const wallThickness = 0.4;

            // --- Build 4 walls with window/door openings ---
            this._buildWall(x, z, w, d, h, wallThickness, template, wallMat, buildingY, sectorId);

            // --- Floor ---
            if (template.floors >= 1) {
                const floorGeo = new THREE.BoxGeometry(w - wallThickness * 2, 0.15, d - wallThickness * 2);
                const floorMat = new THREE.MeshStandardMaterial({
                    color: template.wallColor || 0x8d6e63,
                    roughness: 0.9
                });
                const floor = new THREE.Mesh(floorGeo, floorMat);
                floor.position.set(x, buildingY + 0.075, z);
                floor.userData.mapGenerated = true;
                floor.userData.walkableSurface = true;
                this.scene.add(floor);
                this.addColliderBox(
                    new THREE.Vector3(x, buildingY + 0.075, z),
                    w - wallThickness * 2, 0.15, d - wallThickness * 2, true
                );
            }

            // --- Second floor (if 2-story) ---
            if (template.floors >= 2) {
                const secondFloorY = buildingY + template.height / 2;
                const floorGeo = new THREE.BoxGeometry(w - wallThickness * 2, 0.15, d - wallThickness * 2);
                const floorMat = new THREE.MeshStandardMaterial({
                    color: template.wallColor || 0x8d6e63,
                    roughness: 0.9
                });
                const floor = new THREE.Mesh(floorGeo, floorMat);
                floor.position.set(x, secondFloorY, z);
                floor.userData.mapGenerated = true;
                floor.userData.walkableSurface = true;
                this.scene.add(floor);
                this.addColliderBox(
                    new THREE.Vector3(x, secondFloorY, z),
                    w - wallThickness * 2, 0.15, d - wallThickness * 2, true
                );
            }

            // --- Roof ---
            if (template.hasRoof) {
                const roofGeo = new THREE.BoxGeometry(w + 1, 0.2, d + 1);
                const roofMat = new THREE.MeshStandardMaterial({
                    color: template.roofColor || 0x5d4037,
                    roughness: 0.85
                });
                const roof = new THREE.Mesh(roofGeo, roofMat);
                const roofY = buildingY + h;
                roof.position.set(x, roofY + 0.1, z);
                roof.userData.mapGenerated = true;
                this.scene.add(roof);
                this.addColliderBox(
                    new THREE.Vector3(x, roofY + 0.1, z),
                    w + 1, 0.2, d + 1, false
                );
            }

            // --- Interior generation ---
            const interiorData = {
                type: template.type,
                position: { x, y: buildingY, z },
                width: w, depth: d, height: h,
                floors: template.floors,
                template
            };
            const interior = InteriorGenerator.generate(interiorData, this.scene, (pos, w, h, d, walkable) => {
                this.addColliderBox(pos, w, h, d, walkable);
            });

            // Store building info for debug
            placement.y = buildingY;
            placement.w = w;
            placement.h = h;
            placement.d = d;
            placement.built = true;
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
    // ENVIRONMENT PROPS (Phase 5) — Trees, rocks, fences
    // ========================================================================
    _generateEnvironment() {
        // Trees per sector
        for (const sector of this.voronoi.sectors) {
            const numTrees = Math.floor(sector.treeDensity * 30);
            const radius = sector.bounds.radius || 50;
            const cx = sector.center.x;
            const cz = sector.center.z;

            for (let i = 0; i < numTrees; i++) {
                const angle = this._rand() * Math.PI * 2;
                const dist = 15 + this._rand() * radius * 0.7;
                const tx = cx + Math.cos(angle) * dist;
                const tz = cz + Math.sin(angle) * dist;

                // Check distance from buildings
                let tooClose = false;
                for (const pad of this.spawnPads) {
                    const dx = tx - pad.x;
                    const dz = tz - pad.z;
                    if (dx * dx + dz * dz < 8) { tooClose = true; break; }
                }
                if (tooClose) continue;

                this._addTree(tx, tz, sector);
            }

            // Rocks
            const numRocks = Math.floor(sector.rockDensity * 15);
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
                rock.rotation.set(this._rand() * Math.PI, this._rand() * Math.PI, this._rand() * Math.PI);
                rock.userData.mapGenerated = true;
                rock.userData.physicsType = 'STATIC';
                this.scene.add(rock);
                this.addColliderBox(rock.position.clone(), size, size, size, false, true, false, 'CONVEX_HULL');
            }

            // Scattered barrels and crates
            const numProps = Math.floor(5 + sector.buildingDensity * 5);
            for (let i = 0; i < numProps; i++) {
                const angle = this._rand() * Math.PI * 2;
                const dist = 8 + this._rand() * radius * 0.5;
                const px = cx + Math.cos(angle) * dist;
                const pz = cz + Math.sin(angle) * dist;
                const baseY = this.getHeightAt(px, pz);

                if (this._rand() < 0.5) {
                    // Barrel
                    const bGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.8, 8);
                    const bMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
                    const barrel = new THREE.Mesh(bGeo, bMat);
                    barrel.position.set(px, baseY + 0.4, pz);
                    barrel.userData.mapGenerated = true;
                    barrel.userData.physicsType = 'STATIC';
                    this.scene.add(barrel);
                    this.addColliderBox(barrel.position.clone(), 0.8, 0.8, 0.8, false);
                } else {
                    // Crate
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
        const trunkColor = 0x5d4037;
        const trunkMat = new THREE.MeshStandardMaterial({ color: trunkColor, roughness: 0.9 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, baseY + trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        trunk.userData.physicsType = 'STATIC';
        this.scene.add(trunk);
        this.addColliderBox(trunk.position.clone(), trunkR * 2, trunkH, trunkR * 2, false);

        // Crown
        const crownGeo = new THREE.DodecahedronGeometry(crownR, 0);
        const crownColor = sector.terrainColor || 0x2e7d32;
        const crownMat = new THREE.MeshStandardMaterial({ color: crownColor, roughness: 0.95, flatShading: true });
        const crown = new THREE.Mesh(crownGeo, crownMat);
        crown.position.set(x, baseY + trunkH + crownR * 0.5, z);
        crown.userData.mapGenerated = true;
        this.scene.add(crown);
    }

    // ========================================================================
    // SPAWN SYSTEM (Phase 6)
    // ========================================================================
    _buildSpawnPads() {
        this.spawnPads = [];
        const padMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.8, flatShading: true });
        const padGeo = new THREE.BoxGeometry(2.2, 0.3, 2.2);
        const pads = [];
        const radius = 11;

        // 64 pads in circle around map center (0, 0)
        for (let i = 0; i < 64; i++) {
            const angle = (i / 64) * Math.PI * 2;
            const wx = Math.round(Math.cos(angle) * radius);
            const wz = Math.round(Math.sin(angle) * radius);
            const floorY = this.getSurfaceHeightAt(wx, wz);

            pads.push({ x: wx, z: wz });
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
        if (width < 2 || height < 2 || depth < 2) return null;
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

    // --- Debug helper ---
    enableDebug() {
        if (!this.debugOverlay) {
            // Access camera/controls from scene — they should be injected by main.js
            this.debugOverlay = new DebugOverlay(this.scene, this, null, null, null);
            this.debugOverlay.enable();
        }
    }
}
