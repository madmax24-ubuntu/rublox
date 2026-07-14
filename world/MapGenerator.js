import * as THREE from "three";
import { MapGeneratorNode } from "./MapGeneratorNode.js?v=1783108959290";
import { AABBGrid } from "./AABBGrid.js";
import { DebugOverlay } from "./DebugOverlay.js";
import { InstancedMeshSystem } from "./InstancedMeshSystem.js";
import { MeshPool } from "./MeshPool.js";

// ============================================================================
// QUADRANT-BASED MAP GENERATOR — Structured hierarchy with logical biome connections
// ============================================================================
// Hierarchy:
//   1. Central Cornucopia (spawn platform + fountain)
//   2. River divider (connects to bridges)
//   3. Four biomes with clear boundaries and connecting paths
//   4. Biome-specific objects strictly within their zones
//   5. Spawn pads only on walkable surfaces (platforms, bridges, clearings)
// ============================================================================

const MAP_SIZE = 512;
const TILE_SIZE = 4;
const GRID_W = MAP_SIZE / TILE_SIZE; // 128
const GRID_H = MAP_SIZE / TILE_SIZE; // 128
const HALF = MAP_SIZE / 2; // 256

// Safety constants for building placement to prevent overlap with central cornucopia zone
const CORNUCOPIA_RADIUS = 30;
const BUILDING_BUFFER = 5;
const MIN_BUILDING_DISTANCE = CORNUCOPIA_RADIUS + BUILDING_BUFFER;
const COLORS = {
    forestTerrain: 0x4caf50,
    forestPath: 0x8d6e63,
    forestTree: 0x2e7d32,
    forestTrunk: 0x5d4037,
    forestMushroom: 0xff5252,
    forestMushroomSpot: 0xfff9c4,
    mazeTerrain: 0x9e9e9e,
    mazeWall: 0x757575,
    mazeTower: 0x616161,
    militaryTerrain: 0x737373,
    militaryGround: 0x607d8b,
    militaryBuilding: 0x455a64,
    militaryRuined: 0x78909c,
    militaryTank: 0x4a5238,
    militaryTread: 0x37474f,
    iceTerrain: 0xe0f7fa,
    iceLake: 0x4dd0e1,
    iceCrystal: 0x80deea,
    iceIgloo: 0xffffff,
    iceTower: 0x4a5238,
    cornucopia: 0xffd700,
    cornucopiaInner: 0xdaa549,
    spawnPad: 0xd7ccc8,
    river: 0x29b6f6,
    bridge: 0x8d6e63,
    mapBoundary: 0x37474f,
    textLabel: 0xffffff,
};

export class MapGenerator {
    constructor(scene) {
        this.scene = scene;
        this.seed = 42;
        this.tileSize = TILE_SIZE;
        this.gridWidth = GRID_W;
        this.gridHeight = GRID_H;
        this.size = MAP_SIZE;
        this.halfSize = HALF;

        this.colliders = [];
        this.spawnPads = [];
        this.colliderGrid = new Map();
        this.colliderGridCellSize = 16;
        this.heightMap = null;
        this._terrainMaterial = null;
        this._tmpMatrix = new THREE.Matrix4();
        this._tmpPos = new THREE.Vector3();
        this._randState = this.seed;
        this._sharedGeos = new Map();
        this._sharedMats = new Map();
        this._resolveReady = null;
        this.ready = new Promise((resolve) => { this._resolveReady = resolve; });
        this._generatePromise = null;
        this.onProgress = null;
        this._buildings = [];
        this._chestSpots = [];
        this._biomeGates = [];
        this._biomeGateColliders = [];
        this._floorTiles = [];
        this._navigationTiles = [];
        this._spawnTiles = [];
        this._meshes = [];
        this._cullDistance = 400;
        this._cullDistanceMobile = 300;
        this.pool = new MeshPool();
        const _origAdd = this.scene.add.bind(this.scene);
        this.scene.add = (obj) => {
            // Only track map-generated MESHES and GROUPS for culling (not InstancedMesh — created after generation)
            if ((obj.isMesh || obj.isGroup) && !obj.isInstancedMesh && obj.userData?.mapGenerated) {
                obj.userData._mapCulled = true;
                this._meshes.push(obj);
            }
            return _origAdd(obj);
        };
    }

    startGeneration() {
        if (!this._generatePromise) {
            this._generatePromise = this._generate();
        }
        return this._generatePromise;
    }

    _generate() {
        this._reset();
        this._logProgress(0);
        this._logProgress(0.15);

        // Phase 1: Terrain base
        this._generateTerrain();

        // Phase 2: Central cornucopia + spawn courtyard
        this._generateCornucopia();

        // Phase 3: River + bridges (simplified - just thin dividers)
        this._generateRiver();

        // Phase 4: Forest quadrant (NW)
        this._generateForestQuadrant();

        // Phase 5: Stone maze quadrant (NE)
        this._generateMazeQuadrant();

        // Phase 6: Military ruins quadrant (SW)
        this._generateMilitaryQuadrant();

        // Phase 7: Ice quadrant (SE)
        this._generateIceQuadrant();

        // CLEANUP PASS: Remove any biome objects that encroached on the central Cornucopia zone
        const toRemove = [];
        for (const child of this.scene.children) {
            if (child.userData?.mapGenerated && !child.userData?.isCornucopia) {
                const dist = Math.sqrt(child.position.x * child.position.x + child.position.z * child.position.z);
                if (dist < 75) {
                    toRemove.push(child);
                }
            }
        }
        for (const obj of toRemove) {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        }
        this.colliders = this.colliders.filter(c => {
            if (c.isCornucopia) return true;
            const cx = (c.min.x + c.max.x) / 2;
            const cz = (c.min.z + c.max.z) / 2;
            return Math.sqrt(cx*cx + cz*cz) >= 75;
        });

        // Phase 8: Cover objects
        this._placeCoverObjects();
        this._placeBiomeDecor();

        this._placeBiomeBoundaries();

        // Phase 9.8: Map perimeter walls (glass/blue like reference)
        this._generatePerimeterWalls();

        // Phase 9.5: Build collider grid for spatial queries
        this._rebuildColliderGrid();
        this._buildNavigationTiles();

        // Phase 10: Spawn pads (filtered, no duplicates)
        this._buildSpawnPads();

        // Phase 11: InstancedMesh optimization — convert repeated meshes to InstancedMesh
        const totalBefore = this._meshes.length;
        const instResult = this._optimizeInstancing(2);
        console.log(`[MapGenerator] InstancedMesh: ${instResult.replaced} meshes merged into ${instResult.instancedMeshes.length} InstancedMesh (total before: ${totalBefore}, after: ${this._meshes.length})`);

        // Phase 12: Finalize
        this._logProgress(0.95);
        this.aabbGrid = new AABBGrid(2.0);
        this.aabbGrid.buildFromColliders(this.colliders);
        this._logProgress(1.0);
        // Cache animated object references for per-frame updates
        this._cacheAnimatedObjects();
        this._resolveReady?.();
    }

    _reset() {
        this.colliders = [];
        this.spawnPads = [];
        this.heightMap = null;
        this._terrainMaterial = null;
        this._floorTiles = [];
        this._navigationTiles = [];
        this._spawnTiles = [];
        this._buildings = [];
        this._chestSpots = [];
        this._biomeGates = [];
        this._biomeGateColliders = [];

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

    getSpawnPads() {
        return this.spawnPads;
    }

    _logProgress(pct) {
        if (this.onProgress) this.onProgress(pct);
    }

    _rand() {
        this._randState = (this._randState * 1664525 + 1013904223) >>> 0;
        return this._randState / 0x100000000;
    }

    lerp(a, b, t) { return a + (b - a) * t; }

    _getSharedGeo(key, factory) {
        let geo = this._sharedGeos.get(key);
        if (!geo) {
            geo = factory();
            this._sharedGeos.set(key, geo);
        }
        return geo;
    }

    _getSharedMat(key, factory) {
        let mat = this._sharedMats.get(key);
        if (!mat) {
            mat = factory();
            this._sharedMats.set(key, mat);
        }
        return mat;
    }

    // =========================================================================
    // TERRAIN — 4 separate quadrant planes with distinct colors
    // =========================================================================
    _generateTerrain() {
        // 4 плоскости для каждого квадранта (центр каждого квадранта)
        const quadrants = [
            { x: -128, z: -128, color: COLORS.forestTerrain },   // СЗ
            { x: 128, z: -128, color: COLORS.mazeTerrain },      // СВ
            { x: -128, z: 128, color: COLORS.militaryTerrain },  // ЮЗ
            { x: 128, z: 128, color: COLORS.iceTerrain }         // ЮВ
        ];

        for (const q of quadrants) {
            const geo = this.pool.getGeoPlane(HALF, HALF);
            const mat = this.pool.getMatTerrain(q.color, 0.9, true);
            const plane = new THREE.Mesh(geo, mat);
            plane.rotation.x = -Math.PI / 2;
            plane.position.set(q.x, 0.02, q.z); // Raise above platform base (y=0) so terrain is visible
            plane.userData.mapGenerated = true;
            plane.userData.walkable = true;
            plane.userData.isTerrain = true; // Never cull terrain
            this.scene.add(plane);
        }

        this.addColliderBox(new THREE.Vector3(0, 0.01, 0), HALF * 2, 0.1, HALF * 2, true);

        // Height map (flat = 0)
        this.heightMap = [];
        for (let gy = 0; gy < GRID_H; gy++) {
            this.heightMap[gy] = [];
            for (let gx = 0; gx < GRID_W; gx++) {
                this.heightMap[gy][gx] = 0;
            }
        }
    }

    _getTerrainColor(x, z) {
        const distFromCenter = Math.sqrt(x * x + z * z);

        // Cornucopia center area — compact
        if (distFromCenter < 28) {
            return new THREE.Color(0xc8b88a);
        }

        // River (vertical line between NW and NE, SW and SE) — thin
        if (Math.abs(x) < 2 && distFromCenter > 30) {
            return new THREE.Color(COLORS.river);
        }

        // Чёткое разделение по квадрантам без смешивания
        if (x < 0 && z < 0) {
            return new THREE.Color(COLORS.forestTerrain);
        } else if (x >= 0 && z < 0) {
            return new THREE.Color(COLORS.mazeTerrain);
        } else if (x < 0 && z >= 0) {
            return new THREE.Color(COLORS.militaryTerrain);
        } else {
            return new THREE.Color(COLORS.iceTerrain);
        }
    }

    getHeightAt(x, z) {
        return 0;
    }

    getSurfaceHeightAt(x, z) {
        return 0;
    }

    // =========================================================================
    // LARGE DETAILED GOLDEN FOUNTAIN + SPAWN TILE GRID
    // =========================================================================
    _generateCornucopia() {
        // Use the high-detail MapGeneratorNode implementation for the central hub to reach 99% fidelity
        const node = new MapGeneratorNode(this.scene);
        node.init();

        // The init() method adds objects directly to this.scene. We mark them as mapGenerated so they can be cleaned up later.
        this.scene.traverse((child) => {
            if (child.userData && !child.userData.mapGenerated) {
                child.userData.mapGenerated = true;
                child.userData.isCornucopia = true;
            }
        });

        // Sync spawn pads from the high-detail node to our main generator's tracking system.
        const nodePads = node.getSpawnPads();
        if (nodePads && nodePads.length > 0) {
            for (const pad of nodePads) {
                this.spawnPads.push(new THREE.Vector3(pad.x, pad.y ?? 2, pad.z));
                // Snap to tile grid for consistency with the rest of the map generation logic
                this._spawnTiles.push({ 
                    x: Math.round(pad.x / TILE_SIZE) * TILE_SIZE, 
                    z: Math.round(pad.z / TILE_SIZE) * TILE_SIZE 
                });
            }
        }

        // First spawn pad is at the edge of the platform — main player spawns there
        // No center pad needed; all pads are on the edge

        // Add collision for the high-detail structure to match its geometry perfectly.
        // Base platform: BoxGeometry(50,2,50) at y=1 → top surface at y=2
        // Collider: center.y=1, height=2 → min.y=0, max.y=2 ✅
        const baseRadius = 55;
        const platformCollider = this.addColliderBox(new THREE.Vector3(0, 1, 0), baseRadius * 2, 2, baseRadius * 2, true);
        platformCollider.isCornucopia = true;

        // Fountain collision — solid basin ring + column (fountain positioned at y=2 in scene)
        const fountainScale = 3.2;
        for (let i = 0; i < 32; i++) {
            const angle = (i / 32) * Math.PI * 2;
            const r = 6.5 * fountainScale;
            const wall = this.addColliderBox(
                new THREE.Vector3(Math.cos(angle) * r, 2 + 0.75 * fountainScale, Math.sin(angle) * r),
                4.8, 1.5 * fountainScale, 2.4, false
            );
            wall.isCornucopia = true;
        }
        const basinFloor = this.addColliderBox(new THREE.Vector3(0, 2.08, 0), 13 * fountainScale, 0.16, 13 * fountainScale, false);
        basinFloor.isCornucopia = true;
        const columnCol = this.addColliderBox(new THREE.Vector3(0, 2 + 3 * fountainScale, 0), 4.2 * fountainScale, 4 * fountainScale, 4.2 * fountainScale, false);
        columnCol.isCornucopia = true;
        const upperCol = this.addColliderBox(new THREE.Vector3(0, 2 + 5.4 * fountainScale, 0), 6.2 * fountainScale, 0.8 * fountainScale, 6.2 * fountainScale, false);
        upperCol.isCornucopia = true;
    }

    // =========================================================================
    // RIVER — Thin dividers between quadrants
    // =========================================================================
    _generateRiver() {
        const riverMat = this.pool.getMatStd(COLORS.river, 0.2, 0.3, false, true, 0.6, 0, 0);
        const bankMat = this.pool.getMatStd(0x1565c0, 0.7, 0, true, false, 1, 0, 0);
        const strips = [
            { x: -7, z: -154, w: 10, d: 192 },
            { x: 7, z: 154, w: 10, d: 192 },
            { x: 154, z: 7, w: 192, d: 10 }
        ];
        for (const strip of strips) {
            const water = new THREE.Mesh(this.pool.getGeoBox(strip.w, 0.08, strip.d), riverMat);
            water.position.set(strip.x, 0.04, strip.z);
            water.userData.mapGenerated = true;
            this.scene.add(water);
            const horizontal = strip.w > strip.d;
            for (const side of [-1, 1]) {
                const bank = new THREE.Mesh(
                    this.pool.getGeoBox(horizontal ? strip.w : 1.2, 0.12, horizontal ? 1.2 : strip.d),
                    bankMat
                );
                bank.position.set(
                    strip.x + (horizontal ? 0 : side * strip.w * 0.56),
                    0.06,
                    strip.z + (horizontal ? side * strip.d * 0.56 : 0)
                );
                bank.userData.mapGenerated = true;
                this.scene.add(bank);
            }
        }
        const roadMat = this.pool.getMatStd(0x6d4c41, 0.95, 0, true, false, 1, 0, 0);
        const forestMilitaryRoad = new THREE.Mesh(this.pool.getGeoBox(192, 0.12, 10), roadMat);
        forestMilitaryRoad.position.set(-154, 0.06, 0);
        forestMilitaryRoad.userData.mapGenerated = true;
        forestMilitaryRoad.userData.walkable = true;
        this.scene.add(forestMilitaryRoad);
    }

    // =========================================================================
    // BIOME BOUNDARIES — Clear visual separators between quadrants (no walls)
    // =========================================================================
    _placeBiomeBoundaries() {
        const wallH = 30;
        const wallT = 2.4;
        const wallMat = this.pool.getMatStd(0x58636b, 0.9, 0, true, false, 1, 0, 0, true);
        wallMat.polygonOffset = true;
        wallMat.polygonOffsetFactor = 12;
        wallMat.polygonOffsetUnits = 6;
        const gateMat = this.pool.getMatStd(0xb74b18, 0.45, 0.15, false, true, 0.16, 0x7a2108, 0.12);
        gateMat.polygonOffset = true;
        gateMat.polygonOffsetFactor = 12;
        gateMat.polygonOffsetUnits = 6;
        const addWall = (x, z, w, d, rotation = 0) => {
            const mesh = new THREE.Mesh(this.pool.getGeoBox(w, wallH, d), wallMat);
            mesh.position.set(x, wallH / 2, z);
            mesh.rotation.y = rotation;
            mesh.userData.mapGenerated = true;
            mesh.userData.biomeBoundary = true;
            mesh.frustumCulled = false;
            this.scene.add(mesh);
            const c = Math.abs(Math.cos(rotation));
            const s = Math.abs(Math.sin(rotation));
            this.addColliderBox(new THREE.Vector3(x, wallH / 2, z), w * c + d * s, wallH, w * s + d * c, false);
        };
        const ringRadius = 64;
        const ringSegments = 40;
        const segmentLength = Math.PI * 2 * ringRadius / ringSegments + 0.8;
        const gateIndices = new Set([5, 15, 25, 35]);
        for (let i = 0; i < ringSegments; i++) {
            const angle = i / ringSegments * Math.PI * 2;
            const x = Math.cos(angle) * ringRadius;
            const z = Math.sin(angle) * ringRadius;
            const rotation = Math.PI / 2 - angle;
            if (gateIndices.has(i)) {
                const gate = new THREE.Mesh(this.pool.getGeoBox(segmentLength, 16, wallT), gateMat);
                gate.position.set(x, 8, z);
                gate.rotation.y = rotation;
                gate.userData.mapGenerated = true;
                gate.userData.biomeGate = true;
                gate.frustumCulled = false;
                this.scene.add(gate);
                const c = Math.abs(Math.cos(rotation));
                const s = Math.abs(Math.sin(rotation));
                const collider = this.addColliderBox(new THREE.Vector3(x, 8, z), segmentLength * c + wallT * s, 16, segmentLength * s + wallT * c, false);
                collider.enabled = false;
                this._biomeGates.push(gate);
                this._biomeGateColliders.push(collider);
            } else {
                addWall(x, z, segmentLength, wallT, rotation);
            }
        }
        const dividerStart = ringRadius - 1;
        const dividerEnd = HALF + wallT;
        const dividerLength = dividerEnd - dividerStart;
        const dividerCenter = dividerStart + dividerLength / 2;
        for (const sign of [-1, 1]) {
            addWall(0, sign * dividerCenter, wallT, dividerLength);
            addWall(sign * dividerCenter, 0, dividerLength, wallT);
        }
        this.setBiomeGatesOpen(true);
    }

    _addBridge(x, z) {
        const bridgeMat = this.pool.getMatStd(COLORS.bridge, 0.8, 0, true, false, 1, 0, 0);

        // Bridge deck
        const deckGeo = this.pool.getGeoBox(12, 0.5, 8);
        const deck = new THREE.Mesh(deckGeo, bridgeMat);
        deck.position.set(x, 1, z);
        deck.userData.mapGenerated = true;
        deck.userData.walkable = true;
        this.scene.add(deck);
        this.addColliderBox(new THREE.Vector3(x, 1, z), 12, 0.5, 8, true);

        // Bridge rails
        const railGeo = this.pool.getGeoBox(0.3, 1.5, 8);
        for (let side of [-1, 1]) {
            const rail = new THREE.Mesh(railGeo, bridgeMat);
            rail.position.set(x + side * 5.5, 1.5, z);
            rail.userData.mapGenerated = true;
            this.scene.add(rail);
        }

        // Bridge supports
        const supportGeo = this.pool.getGeoBox(1, 2, 1);
        const supportMat = this.pool.getMatStd(0x6d4c41, 0.8, 0, false, false, 1, 0, 0);
        for (let i = -2; i <= 2; i++) {
            const support = new THREE.Mesh(supportGeo, supportMat);
            support.position.set(x + i * 3, 0.5, z);
            support.userData.mapGenerated = true;
            this.scene.add(support);
        }
    }

    // =========================================================================
    // FOREST QUADRANT (NW: x < 0, z < 0)
    // =========================================================================
    _generateForestQuadrant() {
        // СЗ квадрант: x в [-256, -10], z в [-256, -10]
        const startX = -250;
        const startZ = -250;
        const size = 240;

        // Лесной пол с текстурой
        const forestFloorMat = this.pool.getMatStd(0x2d5a27, 0.95, 0, true, false, 1, 0, 0);
        const forestFloorGeo = this.pool.getGeoBox(size, 0.3, size);
        const forestFloor = new THREE.Mesh(forestFloorGeo, forestFloorMat);
        forestFloor.position.set(startX + size / 2, -0.15, startZ + size / 2); // top surface at Y=0
        forestFloor.userData.mapGenerated = true;
        this.scene.add(forestFloor);

        // Центральная поляна — светлая зона с травой
        const clearingCX = startX + size * 0.5;
        const clearingCZ = startZ + size * 0.5;
        const clearingRadius = 24;

        // Clearing ground patch
        const clearingGeo = new THREE.CircleGeometry(clearingRadius, 32);
        const clearingMat = this.pool.getMatStd(0x66bb6a, 0.9, 0, true, false, 1, 0, 0);
        const clearingMesh = new THREE.Mesh(clearingGeo, clearingMat);
        clearingMesh.rotation.x = -Math.PI / 2;
        clearingMesh.position.set(clearingCX, 0.06, clearingCZ);
        clearingMesh.userData.mapGenerated = true;
        clearingMesh.userData.walkable = true;
        this.scene.add(clearingMesh);

        // Grid-based tree placement with wider corridors
        const gridStep = 18;
        const corridorWidth = 8; // Wider corridors for player movement
        const treeTypes = ['pine', 'oak', 'birch', 'spruce'];
        let forestLootSpots = 0;

        for (let gx = startX + 8; gx < startX + size - 8; gx += gridStep) {
            for (let gz = startZ + 8; gz < startZ + size - 8; gz += gridStep) {
                // Skip if in clearing
                if (this._distToClearing(gx, gz, clearingCX, clearingCZ, clearingRadius)) continue;

                // Add jitter for natural look
                const jitterX = (this._rand() - 0.5) * 6;
                const jitterZ = (this._rand() - 0.5) * 6;
                const tx = gx + jitterX;
                const tz = gz + jitterZ;

                const relX = tx - clearingCX;
                const relZ = tz - clearingCZ;
                if (this._isForestPathClearance(tx, tz)) continue;

                // Skip if too close to river
                const distToRiverX = Math.abs(tx - clearingCX);
                const distToRiverZ = Math.abs(tz - clearingCZ);
                if (distToRiverX < 8 && distToRiverZ < 8) continue;

                // Pick tree type based on position
                const treeType = treeTypes[Math.floor(this._rand() * treeTypes.length)];
                this._addForestTree(tx, tz, treeType);
                if (forestLootSpots < 24 && this._rand() < 0.28) {
                    this._registerChestSpot(tx + 2.2, tz + 1.4, 'forest');
                    forestLootSpots++;
                }
            }
        }

        // Dense undergrowth — bushes and flowers
        for (let i = 0; i < 48; i++) {
            const bx = startX + 5 + this._rand() * (size - 10);
            const bz = startZ + 5 + this._rand() * (size - 10);
            if (!this._distToClearing(bx, bz, clearingCX, clearingCZ, clearingRadius + 5)) {
                this._addForestBush(bx, bz);
            }
        }

        for (let i = 0; i < 24; i++) {
            const fx = startX + 5 + this._rand() * (size - 10);
            const fz = startZ + 5 + this._rand() * (size - 10);
            if (!this._distToClearing(fx, fz, clearingCX, clearingCZ, clearingRadius + 5)) {
                this._addForestFlowers(fx, fz);
            }
        }

        // Fallen logs for atmosphere
        for (let i = 0; i < 5; i++) {
            const lx = startX + 10 + this._rand() * (size - 20);
            const lz = startZ + 10 + this._rand() * (size - 20);
            if (!this._distToClearing(lx, lz, clearingCX, clearingCZ, clearingRadius + 5)) {
                this._addFallenLog(lx, lz);
            }
        }

        this._addForestRiver(startX + 8, clearingCZ + 38, startX + size - 8, clearingCZ + 38);
        this._addForestRiver(clearingCX + 52, startZ + 8, clearingCX + 52, startZ + size - 8);

        this._addTwoStoryCabin(clearingCX - 34, clearingCZ - 18);
        this._addTwoStoryCabin(clearingCX + 34, clearingCZ - 18);

        // Rocks and moss on clearing
        this._addClearingRocks(clearingCX, clearingCZ, clearingRadius);

        // Edge trees — dense forest near biome borders
        this._addEdgeTrees(startX, startZ, size);

        // POI items scattered in forest
        this._addForestPOI(startX, startZ, size, clearingCX, clearingCZ);

        // Winding forest paths from clearing to edges
        this._generateForestPaths();
    }

    _distToClearing(x, z, cx, cz, radius) {
        return Math.sqrt((x - cx) ** 2 + (z - cz) ** 2) < radius + 5;
    }

    _addForestRiver(x1, z1, x2, z2) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const length = Math.sqrt(dx * dx + dz * dz);
        const segments = Math.floor(length / 3);

        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const rx = x1 + dx * t + (this._rand() - 0.5) * 2;
            const rz = z1 + dz * t + (this._rand() - 0.5) * 2;

            // Wider, more visible river segments
            const width = 8 + this._rand() * 4;
            const riverMat = this.pool.getMatStd(0x29b6f6, 0.1, 0.5, false, true, 0.8, 0, 0);

            const riverGeo = this.pool.getGeoPlane(width, 5);
            const river = new THREE.Mesh(riverGeo, riverMat);
            river.rotation.x = -Math.PI / 2;
            river.position.set(rx, 0.04, rz);
            river.userData.mapGenerated = true;
            this.scene.add(river);

            // River banks — rocks along edges
            for (let side of [-1, 1]) {
                const bankGeo = this.pool.getGeoDodecahedron(0.4 + this._rand() * 0.4, 0);
                const bankMat = this.pool.getMatStd(0x757575, 0.95, 0, true, false, 1, 0, 0);
                const bank = new THREE.Mesh(bankGeo, bankMat);
                bank.position.set(rx + side * width / 2, 0.15, rz + (this._rand() - 0.5) * 2);
                bank.userData.mapGenerated = true;
                bank.userData.instancable = true;
                this.scene.add(bank);
            }
        }
    }

    _addTwoStoryCabin(x, z) {
        const cabin = new THREE.Group();
        const wallMat = this.pool.getMatStd(0x5d4037, 0.75, 0, true, false, 1, 0, 0, true);
        const roofMat = this.pool.getMatStd(0x3e2723, 0.85, 0, true, false, 1, 0, 0, true);
        const woodMat = this.pool.getMatStd(0x795548, 0.8, 0, true, false, 1, 0, 0, true);

        // Размеры хижины — более крупные и заметные
        const w = 14;
        const d = 12;
        const storyH = 5; // Высота этажа

        // Первый этаж - пол
        const floor1Geo = this.pool.getGeoBox(w, 0.3, d);
        const floor1 = new THREE.Mesh(floor1Geo, woodMat);
        floor1.position.set(0, 0.15, 0);
        floor1.userData.mapGenerated = true;
        floor1.userData.walkable = true;
        cabin.add(floor1);

        this.addColliderBox(
            new THREE.Vector3(x, 0.15, z),
            w, 0.3, d, true
        );

        // Стены первого этажа
        const wallThick = 0.4;
        for (let side of [-1, 1]) {
            const sideGeo = this.pool.getGeoBox(wallThick, storyH, d);
            const sideWall = new THREE.Mesh(sideGeo, wallMat);
            sideWall.position.set(side * w / 2, storyH / 2 + 0.3, 0);
            sideWall.userData.mapGenerated = true;
            cabin.add(sideWall);
        }

        // Передняя стена с дверью
        const doorW = 1.5;
        const doorH = 2.5;
        const frontWallLeft = this.pool.getGeoBox(w / 2 - doorW / 2 - 0.5, storyH, wallThick);
        const frontWallRight = this.pool.getGeoBox(w / 2 - doorW / 2 - 0.5, storyH, wallThick);
        const frontWallTop = this.pool.getGeoBox(w, storyH - doorH - 0.5, wallThick);

        const fwl = new THREE.Mesh(frontWallLeft, wallMat);
        fwl.position.set(-w / 4 + doorW / 2 + 0.25, storyH / 2 + 0.3, d / 2);
        fwl.userData.mapGenerated = true;
        cabin.add(fwl);

        const fwr = new THREE.Mesh(frontWallRight, wallMat);
        fwr.position.set(w / 4 - doorW / 2 - 0.25, storyH / 2 + 0.3, d / 2);
        fwr.userData.mapGenerated = true;
        cabin.add(fwr);

        const fwt = new THREE.Mesh(frontWallTop, wallMat);
        fwt.position.set(0, doorH + (storyH - doorH - 0.5) / 2 + 0.3, d / 2);
        fwt.userData.mapGenerated = true;
        cabin.add(fwt);

        // Задняя стена
        const backGeo = this.pool.getGeoBox(w, storyH, wallThick);
        const backWall = new THREE.Mesh(backGeo, wallMat);
        backWall.position.set(0, storyH / 2 + 0.3, -d / 2);
        backWall.userData.mapGenerated = true;
        cabin.add(backWall);

        // Дверь
        const doorMat = this.pool.getMatStd(0x4e342e, 0.9, 0, false, false, 1, 0, 0, true);
        const doorGeo = this.pool.getGeoBox(doorW, doorH, 0.1);
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, doorH / 2 + 0.3, d / 2 + 0.05);
        door.userData.mapGenerated = true;
        cabin.add(door);

        // Окна первого этажа
        const winMat = this.pool.getMatStd(0xfff9c4, 0.3, 0.1, false, false, 1, 0xfff9c4, 0.1);
        for (let side of [-1, 1]) {
            const winGeo = this.pool.getGeoBox(0.1, 1.2, 1.2);
            const win = new THREE.Mesh(winGeo, winMat);
            win.position.set(side * w / 2 + 0.05, 2 + 0.3, 0);
            win.userData.mapGenerated = true;
            cabin.add(win);
        }

        // Второй этаж - пол
        const floor2Geo = this.pool.getGeoBox(w, 0.3, d);
        const floor2 = new THREE.Mesh(floor2Geo, woodMat);
        floor2.position.set(0, storyH + 0.15, 0);
        floor2.userData.mapGenerated = true;
        floor2.userData.walkable = true;
        cabin.add(floor2);

        this.addColliderBox(
            new THREE.Vector3(x, storyH + 0.15, z),
            w, 0.3, d, true
        );

        // Стены второго этажа
        for (let side of [-1, 1]) {
            const sideGeo = this.pool.getGeoBox(wallThick, storyH, d);
            const sideWall = new THREE.Mesh(sideGeo, wallMat);
            sideWall.position.set(side * w / 2, storyH + storyH / 2 + 0.3, 0);
            sideWall.userData.mapGenerated = true;
            cabin.add(sideWall);
        }

        // Передняя стена второго этажа
        const front2Geo = this.pool.getGeoBox(w, storyH, wallThick);
        const front2 = new THREE.Mesh(front2Geo, wallMat);
        front2.position.set(0, storyH + storyH / 2 + 0.3, d / 2);
        front2.userData.mapGenerated = true;
        cabin.add(front2);

        // Задняя стена второго этажа
        const back2 = new THREE.Mesh(front2Geo, wallMat);
        back2.position.set(0, storyH + storyH / 2 + 0.3, -d / 2);
        back2.userData.mapGenerated = true;
        cabin.add(back2);

        // Окна второго этажа
        for (let side of [-1, 1]) {
            const winGeo = this.pool.getGeoBox(0.1, 1.2, 1.2);
            const win = new THREE.Mesh(winGeo, winMat);
            win.position.set(side * w / 2 + 0.05, storyH + 2 + 0.3, 0);
            win.userData.mapGenerated = true;
            cabin.add(win);
        }

        // Крыша
        const roofGeo = this.pool.getGeoCone(Math.max(w, d) * 0.75, 3, 4);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, storyH * 2 + 1.8, 0);
        roof.rotation.y = Math.PI / 4;
        roof.userData.mapGenerated = true;
        cabin.add(roof);

        // Лестница снаружи (спереди)
        const stairCount = 6;
        const stairH = (storyH + 0.3) / stairCount;
        for (let i = 0; i < stairCount; i++) {
            const stepGeo = this.pool.getGeoBox(2, 0.2, 1.2);
            const step = new THREE.Mesh(stepGeo, woodMat);
            const stairZ = d / 2 + 1 + (stairCount - 1 - i) * 1.05;
            step.position.set(0, i * stairH + 0.1, stairZ);
            step.userData.mapGenerated = true;
            step.userData.walkable = true;
            cabin.add(step);

            this.addColliderBox(
                new THREE.Vector3(x, i * stairH + 0.1, z + stairZ),
                2, 0.2, 1.2, true
            );
        }

        // Сундук внутри (на первом этаже)
        const chestMat = this.pool.getMatStd(0x8B4513, 0.7, 0, true, false, 1, 0, 0);
        const chestGeo = this.pool.getGeoBox(1.2, 0.8, 0.8);
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.set(0, 0.7, -d / 4);
        chest.userData.mapGenerated = true;
        cabin.add(chest);

        this.addColliderBox(
            new THREE.Vector3(x, 0.7, z - d / 4),
            1.2, 0.8, 0.8, false
        );

        // Сундук на втором этаже
        const chest2 = new THREE.Mesh(chestGeo, chestMat);
        chest2.position.set(0, storyH + 0.7, -d / 4);
        chest2.userData.mapGenerated = true;
        cabin.add(chest2);

        this.addColliderBox(
            new THREE.Vector3(x, storyH + 0.7, z - d / 4),
            1.2, 0.8, 0.8, false
        );

        cabin.position.set(x, 0, z);
        cabin.userData.mapGenerated = true;
        this.scene.add(cabin);

        this.addColliderBox(new THREE.Vector3(x - w / 2, storyH + 0.3, z), wallThick, storyH * 2, d, false);
        this.addColliderBox(new THREE.Vector3(x + w / 2, storyH + 0.3, z), wallThick, storyH * 2, d, false);
        this.addColliderBox(new THREE.Vector3(x, storyH + 0.3, z - d / 2), w, storyH * 2, wallThick, false);
        const frontSegmentW = (w - doorW) / 2;
        this.addColliderBox(new THREE.Vector3(x - (doorW + frontSegmentW) / 2, storyH / 2 + 0.3, z + d / 2), frontSegmentW, storyH, wallThick, false);
        this.addColliderBox(new THREE.Vector3(x + (doorW + frontSegmentW) / 2, storyH / 2 + 0.3, z + d / 2), frontSegmentW, storyH, wallThick, false);
        this.addColliderBox(new THREE.Vector3(x, storyH + storyH / 2 + 0.3, z + d / 2), w, storyH, wallThick, false);
        this._buildings.push({ x, z, w, d, template: { type: 'log_cabin' } });
        this._registerChestSpot(x - 3.5, z - 3.5, 'house');
        this._registerChestSpot(x + 3.5, z - 3.5, 'house');
        this._registerChestSpot(x - 3.5, z + 1.5, 'house');
        this._registerChestSpot(x + 3.5, z + 1.5, 'house');

        // Spawn pads managed by MapGeneratorNode.js — one per quadrant
    }

    /** Small 1-story wooden hut (6x8) — matches reference forest houses */
    _addSmallHut(x, z) {
        const hut = new THREE.Group();
        const wallMat = this.pool.getMatStd(0x8d6e63, 0.8, 0, true, false, 1, 0, 0, true);
        const roofMat = this.pool.getMatStd(0x5d4037, 0.85, 0, true, false, 1, 0, 0, true);
        const w = 10;
        const d = 12;
        const h = 5;

        // Floor
        const floorGeo = this.pool.getGeoBox(w, 0.3, d);
        const floor = new THREE.Mesh(floorGeo, wallMat);
        floor.position.set(0, 0.15, 0);
        floor.userData.mapGenerated = true;
        floor.userData.walkable = true;
        hut.add(floor);

        // Walls
        const wt = 0.3;
        for (let side of [-1, 1]) {
            const sw = new THREE.Mesh(this.pool.getGeoBox(wt, h, d), wallMat);
            sw.position.set(side * w / 2, h / 2 + 0.3, 0);
            sw.userData.mapGenerated = true;
            hut.add(sw);
        }

        // Front wall with door
        const dw = 1.5, dh = 2.5;
        const fwL = new THREE.Mesh(this.pool.getGeoBox(w / 2 - dw / 2 - 0.3, h, wt), wallMat);
        fwL.position.set(-w / 4 + dw / 2 + 0.15, h / 2 + 0.3, d / 2);
        fwL.userData.mapGenerated = true;
        hut.add(fwL);

        const fwR = new THREE.Mesh(this.pool.getGeoBox(w / 2 - dw / 2 - 0.3, h, wt), wallMat);
        fwR.position.set(w / 4 - dw / 2 - 0.15, h / 2 + 0.3, d / 2);
        fwR.userData.mapGenerated = true;
        hut.add(fwR);

        const fwT = new THREE.Mesh(this.pool.getGeoBox(w, h - dh - 0.3, wt), wallMat);
        fwT.position.set(0, dh + (h - dh - 0.3) / 2 + 0.3, d / 2);
        fwT.userData.mapGenerated = true;
        hut.add(fwT);

        // Back wall
        const bw = new THREE.Mesh(this.pool.getGeoBox(w, h, wt), wallMat);
        bw.position.set(0, h / 2 + 0.3, -d / 2);
        bw.userData.mapGenerated = true;
        hut.add(bw);

        // Door
        const doorMat = this.pool.getMatStd(0x4e342e, 0.9, 0, false, false, 1, 0, 0, true);
        const door = new THREE.Mesh(this.pool.getGeoBox(dw, dh, 0.1), doorMat);
        door.position.set(0, dh / 2 + 0.3, d / 2 + 0.05);
        door.userData.mapGenerated = true;
        hut.add(door);

        // Window on back wall
        const winMat = this.pool.getMatStd(0xfff9c4, 0.3, 0.1, false, false, 1, 0xfff9c4, 0.1);
        const win = new THREE.Mesh(this.pool.getGeoBox(0.1, 1.2, 1.2), winMat);
        win.position.set(0, 2 + 0.3, -d / 2 - 0.05);
        win.userData.mapGenerated = true;
        hut.add(win);

        const roofGeo = this.pool.getGeoBox(w * 0.62, 0.45, d + 1.2);
        for (const side of [-1, 1]) {
            const roof = new THREE.Mesh(roofGeo, roofMat);
            roof.position.set(side * w * 0.23, h + 1.35, 0);
            roof.rotation.z = side * -0.52;
            roof.userData.mapGenerated = true;
            hut.add(roof);
        }

        // Chest inside
        const chestMat = this.pool.getMatStd(0x8B4513, 0.7, 0, true, false, 1, 0, 0);
        const chest = new THREE.Mesh(this.pool.getGeoBox(1.2, 0.8, 0.8), chestMat);
        chest.position.set(0, 0.7, -d / 4);
        chest.userData.mapGenerated = true;
        hut.add(chest);

        hut.position.set(x, 0, z);
        hut.userData.mapGenerated = true;
        this.scene.add(hut);

        // Floor collider
        this.addColliderBox(new THREE.Vector3(x, 0.15, z), w, 0.3, d, true);
        // Wall colliders
        this.addColliderBox(new THREE.Vector3(x, h / 2 + 0.3, z), w + 0.6, h, d + 0.6, false);
    }

    _addForestBush(x, z) {
        const bush = new THREE.Group();
        bush.userData.mapGenerated = true;
        bush.userData.instancable = true;
        const bushMat = this.pool.getMat(0x388e3c, true);

        const count = 3 + Math.floor(this._rand() * 3);
        for (let i = 0; i < count; i++) {
            const size = 0.5 + this._rand() * 1.2;
            const geo = this.pool.getGeoDodecahedron(size);
            const mesh = new THREE.Mesh(geo, bushMat);
            mesh.userData.mapGenerated = true;
            mesh.userData.instancable = true;
            mesh.position.set(
                (this._rand() - 0.5) * 2,
                size * 0.6,
                (this._rand() - 0.5) * 2
            );
            bush.add(mesh);
        }

        bush.position.set(x, 0, z);
        this.scene.add(bush);
    }

    _addForestClearing(x, z) {
        // Clearing ground
        const clearingGeo = this.pool.getGeoDodecahedron(6);
        const clearingMat = this.pool.getMatStd(0x66bb6a, 1.0, 0, true, false, 1, 0, 0);
        const clearing = new THREE.Mesh(clearingGeo, clearingMat);
        clearing.rotation.x = -Math.PI / 2;
        clearing.position.set(x, 0.02, z);
        clearing.userData.mapGenerated = true;
        clearing.userData.walkable = true;
        this.scene.add(clearing);

        // Small stream from clearing to river
        const streamMat = this.pool.getMatStd(0x29b6f6, 0.2, 0.3, false, true, 0.6, 0, 0);
        const streamGeo = this.pool.getGeoPlane(1.5, 15);
        const stream = new THREE.Mesh(streamGeo, streamMat);
        stream.rotation.x = -Math.PI / 2;
        stream.position.set(x + 3, 0.04, z - 5);
        stream.userData.mapGenerated = true;
        this.scene.add(stream);
    }

    // Small flowers in forest
    _addForestFlowers(x, z) {
        const flowerMat = this.pool.getMatStd(0xffeb3b, 0.8, 0, false, false, 1, 0, 0);
        for (let i = 0; i < 5; i++) {
            const flowerGeo = this.pool.getGeoSphere(0.15);
            const flower = new THREE.Mesh(flowerGeo, flowerMat);
            flower.position.set(
                x + (this._rand() - 0.5) * 3,
                0.3,
                z + (this._rand() - 0.5) * 3
            );
            flower.userData.mapGenerated = true;
            this.scene.add(flower);
        }
    }

    _addForestTree(x, z, type = 'pine') {
        if (Math.sqrt(x * x + z * z) < 75) return;
        const trunkMat = this.pool.getMatStd(COLORS.forestTrunk, 0.8, 0, false, false, 1, 0, 0);

        if (type === 'pine') {
            this._addPineTree(x, z);
        } else if (type === 'oak') {
            this._addOakTree(x, z);
        } else if (type === 'birch') {
            this._addBirchTree(x, z);
        } else if (type === 'spruce') {
            this._addSpruceTree(x, z);
        }
    }

    _addPineTree(x, z) {
        const trunkH = 14 + this._rand() * 10;
        const trunkR = 0.6 + this._rand() * 0.4;

        const trunkGeo = this.pool.getGeoCylinder(trunkR * 0.4, trunkR, trunkH);
        const trunkMat = this.pool.getMat(0x8B4513, true);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        this.scene.add(trunk);
        this.addColliderBox(new THREE.Vector3(x, trunkH / 2, z), trunkR * 2, trunkH, trunkR * 2, false);

        const crownColors = [0x1b5e20, 0x2e7d32, 0x388e3c];
        const crownColor = crownColors[Math.floor(this._rand() * crownColors.length)];

        // Tall cone layers
        for (let layer = 0; layer < 5; layer++) {
            const layerR = 4 - layer * 0.7;
            const layerY = trunkH - 3 + layer * 3;
            const crownGeo = this.pool.getGeoCone(layerR, 4);
            const crownMat = this.pool.getMat(crownColor, true);
            const crown = new THREE.Mesh(crownGeo, crownMat);
            crown.position.set(x, layerY, z);
            crown.userData.mapGenerated = true;
            this.scene.add(crown);
        }
    }

    _addOakTree(x, z) {
        const trunkH = 8 + this._rand() * 6;
        const trunkR = 1.0 + this._rand() * 0.6;

        const trunkGeo = this.pool.getGeoCylinder(trunkR * 0.5, trunkR, trunkH);
        const trunkMat = this.pool.getMat(0x8B4513, true);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        this.scene.add(trunk);
        this.addColliderBox(new THREE.Vector3(x, trunkH / 2, z), trunkR * 2, trunkH, trunkR * 2, false);

        const crownColors = [0x33691e, 0x4caf50, 0x66bb6a];
        const crownColor = crownColors[Math.floor(this._rand() * crownColors.length)];

        // Broad, rounded crown — multiple overlapping spheres
        const crownCount = 4 + Math.floor(this._rand() * 3);
        for (let i = 0; i < crownCount; i++) {
            const r = 2 + this._rand() * 2;
            const crownGeo = this.pool.getGeoDodecahedron(r);
            const crownMat = this.pool.getMat(crownColor, true);
            const crown = new THREE.Mesh(crownGeo, crownMat);
            crown.position.set(
                x + (this._rand() - 0.5) * 3,
                trunkH + (this._rand() - 0.5) * 2,
                z + (this._rand() - 0.5) * 3
            );
            crown.userData.mapGenerated = true;
            this.scene.add(crown);
        }
    }

    _addBirchTree(x, z) {
        const trunkH = 16 + this._rand() * 8;
        const trunkR = 0.4 + this._rand() * 0.3;

        const trunkGeo = this.pool.getGeoCylinder(trunkR * 0.4, trunkR, trunkH);
        const birchMat = this.pool.getMat(0xf5f5f5, false);
        const trunk = new THREE.Mesh(trunkGeo, birchMat);
        trunk.position.set(x, trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        this.scene.add(trunk);
        this.addColliderBox(new THREE.Vector3(x, trunkH / 2, z), trunkR * 2, trunkH, trunkR * 2, false);

        // Small green clusters at top
        const crownColors = [0x7cb342, 0x8bc34a, 0x9ccc65];
        const crownColor = crownColors[Math.floor(this._rand() * crownColors.length)];

        const crownCount = 3 + Math.floor(this._rand() * 2);
        for (let i = 0; i < crownCount; i++) {
            const r = 1.5 + this._rand() * 1.5;
            const crownGeo = this.pool.getGeoDodecahedron(r);
            const crownMat = this.pool.getMat(crownColor, true);
            const crown = new THREE.Mesh(crownGeo, crownMat);
            crown.position.set(
                x + (this._rand() - 0.5) * 2,
                trunkH - 1 + (this._rand() - 0.5) * 3,
                z + (this._rand() - 0.5) * 2
            );
            crown.userData.mapGenerated = true;
            this.scene.add(crown);
        }
    }

    _addSpruceTree(x, z) {
        const trunkH = 10 + this._rand() * 8;
        const trunkR = 0.5 + this._rand() * 0.4;

        const trunkGeo = this.pool.getGeoCylinder(trunkR * 0.4, trunkR, trunkH);
        const trunkMat = this.pool.getMat(0x8B4513, true);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        this.scene.add(trunk);
        this.addColliderBox(new THREE.Vector3(x, trunkH / 2, z), trunkR * 2, trunkH, trunkR * 2, false);

        // Spruce: wide, layered cone shape
        const crownColors = [0x004d40, 0x00695c, 0x00897b];
        const crownColor = crownColors[Math.floor(this._rand() * crownColors.length)];

        for (let layer = 0; layer < 6; layer++) {
            const layerR = 5 - layer * 0.7;
            const layerY = trunkH - 5 + layer * 2.5;
            const crownGeo = this.pool.getGeoCone(layerR, 3);
            const crownMat = this.pool.getMat(crownColor, true);
            const crown = new THREE.Mesh(crownGeo, crownMat);
            crown.position.set(x, layerY, z);
            crown.userData.mapGenerated = true;
            this.scene.add(crown);
        }
    }

    _addFallenLog(x, z) {
        const length = 4 + this._rand() * 4;
        const radius = 0.4 + this._rand() * 0.3;
        const geo = this.pool.getGeoCylinder(radius * 0.8, radius, length);
        const mat = this.pool.getMat(0x5d4037, true);
        const log = new THREE.Mesh(geo, mat);
        log.position.set(x, radius, z);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = this._rand() * Math.PI;
        log.userData.mapGenerated = true;
        this.scene.add(log);
        this.addColliderBox(
            new THREE.Vector3(x, radius, z),
            length, radius * 2, radius * 2, false
        );
    }

    _generateForestPaths() {
        const pathMat = this.pool.getMatStd(COLORS.forestPath, 1.0, 0, true, false, 1, 0, 0);
        const routes = [
            [[-238, -120], [-196, -126], [-160, -132], [-130, -130]],
            [[-130, -130], [-108, -104], [-82, -82], [-58, -58]],
            [[-130, -130], [-148, -164], [-174, -194], [-205, -230]],
            [[-130, -130], [-104, -156], [-72, -186], [-38, -220]],
            [[-130, -130], [-158, -102], [-190, -74], [-226, -44]]
        ];
        for (const route of routes) {
            for (let p = 0; p < route.length - 1; p++) {
                const [x1, z1] = route[p];
                const [x2, z2] = route[p + 1];
                const dx = x2 - x1;
                const dz = z2 - z1;
                const distance = Math.hypot(dx, dz);
                const count = Math.ceil(distance / 7);
                const angle = Math.atan2(dx, dz);
                for (let i = 0; i <= count; i++) {
                    const t = i / count;
                    const seg = new THREE.Mesh(this.pool.getGeoBox(8.5, 0.16, 8.5), pathMat);
                    seg.position.set(x1 + dx * t, 0.1, z1 + dz * t);
                    seg.rotation.y = angle;
                    seg.userData.mapGenerated = true;
                    seg.userData.walkable = true;
                    this.scene.add(seg);
                }
            }
        }
    }

    _isForestPathClearance(x, z) {
        const segments = [
            [-238, -120, -196, -126], [-196, -126, -160, -132], [-160, -132, -130, -130],
            [-130, -130, -108, -104], [-108, -104, -82, -82], [-82, -82, -58, -58],
            [-130, -130, -148, -164], [-148, -164, -174, -194], [-174, -194, -205, -230],
            [-130, -130, -104, -156], [-104, -156, -72, -186], [-72, -186, -38, -220],
            [-130, -130, -158, -102], [-158, -102, -190, -74], [-190, -74, -226, -44]
        ];
        return segments.some(([x1, z1, x2, z2]) => {
            const dx = x2 - x1;
            const dz = z2 - z1;
            const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
            return Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t)) < 7;
        });
    }

    _addEdgeTrees(startX, startZ, size) {
        const treeTypes = ['pine', 'oak', 'spruce'];
        const add = (x, z) => this._addForestTree(x + (this._rand() - 0.5) * 3, z + (this._rand() - 0.5) * 3, treeTypes[Math.floor(this._rand() * treeTypes.length)]);
        for (let i = 10; i < size - 10; i += 14) {
            add(startX + 5, startZ + i);
            add(startX + size - 5, startZ + i);
            add(startX + i, startZ + 5);
            add(startX + i, startZ + size - 5);
        }
    }

    _addClearingRocks(cx, cz, radius) {
        const rockMat = this.pool.getMatStd(0x757575, 0.95, 0, true, false, 1, 0, 0);
        const mossMat = this.pool.getMatStd(0x4caf50, 1.0, 0, true, false, 1, 0, 0);

        // Scattered rocks around clearing edge
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 + (this._rand() - 0.5) * 0.3;
            const dist = radius * 0.6 + this._rand() * (radius * 0.4);
            const rx = cx + Math.cos(angle) * dist;
            const rz = cz + Math.sin(angle) * dist;
            const size = 0.3 + this._rand() * 0.8;
            const geo = this.pool.getGeoDodecahedron(size);
            const rock = new THREE.Mesh(geo, Math.random() > 0.3 ? this.pool.getMat(0x757575, true) : this.pool.getMat(0x4caf50, true));
            rock.position.set(rx, size * 0.3, rz);
            rock.rotation.set(this._rand() * Math.PI, this._rand() * Math.PI, this._rand() * Math.PI);
            rock.userData.mapGenerated = true;
            rock.userData.instancable = true;
            this.scene.add(rock);
        }

        // Moss patches on clearing ground
        for (let i = 0; i < 8; i++) {
            const mx = cx + (this._rand() - 0.5) * radius * 1.2;
            const mz = cz + (this._rand() - 0.5) * radius * 1.2;
            const mossGeo = this.pool.getGeoDodecahedron(0.5 + this._rand() * 0.8);
            const moss = new THREE.Mesh(mossGeo, this.pool.getMat(0x4caf50, true));
            moss.rotation.x = -Math.PI / 2;
            moss.position.set(mx, 0.07, mz);
            moss.userData.mapGenerated = true;
            moss.userData.instancable = true;
            this.scene.add(moss);
        }
    }

    _addCampfire(cx, cz) {
        const campfire = new THREE.Group();

        // Stone ring
        const stoneMat = this.pool.getMatStd(0x616161, 0.9, 0, true, false, 1, 0, 0);
        for (let i = 0; i < 4; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const stoneGeo = this.pool.getGeoDodecahedron(0.3);
            const stone = new THREE.Mesh(stoneGeo, stoneMat);
            stone.position.set(Math.cos(angle) * 0.8, 0.2, Math.sin(angle) * 0.8);
            stone.rotation.set(this._rand(), this._rand(), this._rand());
            stone.userData.mapGenerated = true;
            campfire.add(stone);
        }

        // Logs
        const logMat = this.pool.getMatStd(0x5d4037, 1.0, 0, true, false, 1, 0, 0);
        for (let i = 0; i < 3; i++) {
            const logGeo = this.pool.getGeoCylinder(0.1, 0.12, 1.2);
            const log = new THREE.Mesh(logGeo, logMat);
            log.position.set(0, 0.3, 0);
            log.rotation.z = Math.PI / 2 + (i - 1) * 0.3;
            log.rotation.y = i * Math.PI / 3;
            log.userData.mapGenerated = true;
            campfire.add(log);
        }

        // Fire glow (emissive sphere)
        const fireMat = this.pool.getMatStd(0xff6600, 0.9, 0, true, true, 0.8, 0xff4400, 5.0);
        const fireGeo = this.pool.getGeoSphere(0.4);
        const fire = new THREE.Mesh(fireGeo, fireMat);
        fire.position.set(0, 0.6, 0);
        fire.userData.isCampfire = true;
        fire.userData.mapGenerated = true;
        campfire.add(fire);

        campfire.position.set(cx, 0, cz);
        campfire.userData.mapGenerated = true;
        this.scene.add(campfire);

        // Barrels near campfire
        this._addBarrel(cx + 3, cz + 2);
        this._addBarrel(cx - 2, cz + 3);
    }

    _addBarrel(x, z) {
        const barrel = new THREE.Group();
        const barrelMat = this.pool.getMatStd(0x8d6e63, 0.9, 0, true, false, 1, 0, 0);
        const bandMat = this.pool.getMatStd(0x424242, 0.8, 0.5, true, false, 1, 0, 0);

        // Barrel body
        const bodyGeo = this.pool.getGeoCylinder(0.5, 0.6, 1.2);
        const body = new THREE.Mesh(bodyGeo, barrelMat);
        body.position.y = 0.6;
        body.userData.mapGenerated = true;
        barrel.add(body);

        // Metal bands
        for (let y of [0.3, 0.9]) {
            const bandGeo = new THREE.TorusGeometry(0.55, 0.04, 6, 12);
            const band = new THREE.Mesh(bandGeo, bandMat);
            band.position.y = y;
            band.rotation.x = Math.PI / 2;
            band.userData.mapGenerated = true;
            barrel.add(band);
        }

        barrel.position.set(x, 0, z);
        barrel.userData.mapGenerated = true;
        barrel.userData.isBarrel = true;
        this.scene.add(barrel);
    }

    _addFireflies(startX, startZ, size, cx, cz) {
        const fireflyMat = this.pool.getMatStd(0xffee58, 0.9, 0, true, true, 0.9, 0xffcc00, 10.0);

        for (let i = 0; i < 10; i++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = 20 + this._rand() * (size * 0.35);
            const fx = cx + Math.cos(angle) * dist;
            const fz = cz + Math.sin(angle) * dist;
            const fy = 1 + this._rand() * 3;

            const geo = this.pool.getGeoSphere(0.1);
            const firefly = new THREE.Mesh(geo, fireflyMat);
            firefly.position.set(fx, fy, fz);
            firefly.userData.isFirefly = true;
            firefly.userData.baseY = fy;
            firefly.userData.angle = angle;
            firefly.userData.speed = 0.3 + this._rand() * 0.5;
            firefly.userData.radius = dist;
            firefly.userData.center = { x: cx, z: cz };
            firefly.userData.blinkRate = 0.5 + this._rand() * 2;
            firefly.userData.blinkPhase = this._rand() * Math.PI * 2;
            firefly.userData.mapGenerated = true;
            this.scene.add(firefly);
        }
    }

    _addForestPOI(startX, startZ, size, cx, cz) {
        const poiPositions = [
            { x: cx - 40, z: cz - 30, type: 'weapon' },
            { x: cx + 35, z: cz - 25, type: 'medkit' },
            { x: cx - 25, z: cz + 35, type: 'ammo' },
            { x: cx + 40, z: cz + 30, type: 'weapon' },
            { x: cx - 50, z: cz + 10, type: 'medkit' },
            { x: cx + 20, z: cz - 45, type: 'ammo' },
            { x: cx - 15, z: cz - 50, type: 'weapon' },
            { x: cx + 45, z: cz + 10, type: 'medkit' },
        ];

        for (const poi of poiPositions) {
            if (this._distToClearing(poi.x, poi.z, cx, cz, 35)) continue;

            if (poi.type === 'weapon') {
                this._addWeaponDrop(poi.x, poi.z);
            } else if (poi.type === 'medkit') {
                this._addMedkitDrop(poi.x, poi.z);
            } else {
                this._addAmmoDrop(poi.x, poi.z);
            }
        }

    }

    _addWeaponDrop(x, z) {
        const drop = new THREE.Group();
        const mat = this.pool.getMatStd(0xff6600, 0.5, 0, true, false, 1, 0xff4400, 2.0);

        // Glowing crate
        const boxGeo = this.pool.getGeoBox(1.2, 0.8, 0.8);
        const box = new THREE.Mesh(boxGeo, mat);
        box.position.y = 0.4;
        box.userData.mapGenerated = true;
        drop.add(box);

        drop.position.set(x, 0, z);
        drop.userData.isPOI = true;
        drop.userData.poiType = 'weapon';
        drop.userData.mapGenerated = true;
        this.scene.add(drop);
    }

    _addMedkitDrop(x, z) {
        const drop = new THREE.Group();
        const mat = this.pool.getMatStd(0xffffff, 0.5, 0, true, false, 1, 0xff0000, 2.0);

        const boxGeo = this.pool.getGeoBox(1.0, 0.6, 0.7);
        const box = new THREE.Mesh(boxGeo, mat);
        box.position.y = 0.3;
        box.userData.mapGenerated = true;
        drop.add(box);

        // Red cross
        const crossMat = this.pool.getMatStd(0xff0000, 0.9, 0, false, false, 1, 0xff0000, 3.0);
        const hGeo = this.pool.getGeoBox(0.6, 0.05, 0.15);
        const h = new THREE.Mesh(hGeo, crossMat);
        h.position.set(0, 0.63, 0);
        h.userData.mapGenerated = true;
        drop.add(h);
        const vGeo = this.pool.getGeoBox(0.15, 0.05, 0.5);
        const v = new THREE.Mesh(vGeo, crossMat);
        v.position.set(0, 0.63, 0);
        v.userData.mapGenerated = true;
        drop.add(v);

        drop.position.set(x, 0, z);
        drop.userData.isPOI = true;
        drop.userData.poiType = 'medkit';
        drop.userData.mapGenerated = true;
        this.scene.add(drop);
    }

    _addAmmoDrop(x, z) {
        const drop = new THREE.Group();
        const mat = this.pool.getMatStd(0x4caf50, 0.5, 0, true, false, 1, 0x2e7d32, 2.0);

        const boxGeo = this.pool.getGeoBox(0.8, 0.5, 0.6);
        const box = new THREE.Mesh(boxGeo, mat);
        box.position.y = 0.25;
        box.userData.mapGenerated = true;
        drop.add(box);

        drop.position.set(x, 0, z);
        drop.userData.isPOI = true;
        drop.userData.poiType = 'ammo';
        drop.userData.mapGenerated = true;
        this.scene.add(drop);
    }

    _addLogCabin(x, z) {
        const cabin = new THREE.Group();
        const wallMat = this.pool.getMatStd(0x5d4037, 0.75, 0, true, false, 1, 0, 0, true);
        const roofMat = this.pool.getMatStd(0x3e2723, 0.85, 0, true, false, 1, 0, 0, true);

        // Large cabin
        const w = 14 + this._rand() * 6;
        const d = 10 + this._rand() * 4;
        const h = 8;

        // Walls
        const wallThick = 0.3;
        for (let side of [-1, 1]) {
            const sideGeo = this.pool.getGeoBox(wallThick, h, d);
            const sideWall = new THREE.Mesh(sideGeo, wallMat);
            sideWall.position.set(side * w / 2, h / 2, 0);
            sideWall.userData.mapGenerated = true;
            cabin.add(sideWall);
        }

        const frontGeo = this.pool.getGeoBox(w, h, wallThick);
        const front = new THREE.Mesh(frontGeo, wallMat);
        front.position.set(0, h / 2, d / 2);
        front.userData.mapGenerated = true;
        cabin.add(front);

        const back = new THREE.Mesh(frontGeo, wallMat);
        back.position.set(0, h / 2, -d / 2);
        back.userData.mapGenerated = true;
        cabin.add(back);

        // Roof (pitched)
        const roofGeo = this.pool.getGeoCone(Math.max(w, d) * 0.7, 3, 4);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, h + 1.5, 0);
        roof.rotation.y = Math.PI / 4;
        roof.userData.mapGenerated = true;
        cabin.add(roof);

        // Door
        const doorMat = this.pool.getMatStd(0x4e342e, 0.9, 0, false, false, 1, 0, 0, true);
        const doorGeo = this.pool.getGeoBox(1.2, 2.5, 0.1);
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, 1.25, d / 2 + 0.1);
        door.userData.mapGenerated = true;
        cabin.add(door);

        // Windows
        const winMat = this.pool.getMatStd(0xfff9c4, 0.3, 0.1, false, true, 0.7, 0, 0);
        for (let wx of [-2, 2]) {
            const winGeo = this.pool.getGeoBox(0.8, 1, 0.1);
            const win = new THREE.Mesh(winGeo, winMat);
            win.position.set(wx, h * 0.6, d / 2 + 0.1);
            win.userData.mapGenerated = true;
            cabin.add(win);
        }

        cabin.position.set(x, 0, z);
        cabin.userData.mapGenerated = true;
        this.scene.add(cabin);

        this.addColliderBox(
            new THREE.Vector3(x, h / 2, z),
            w + 0.5, h, d + 0.5, false
        );
        this._buildings.push({ x, z, w, d, template: { type: 'log_cabin' } });
    }

    _addForestRock(x, z) {
        const size = 0.5 + this._rand() * 1.5;
        const geo = this.pool.getGeoDodecahedron(size);
        const mat = this.pool.getMatStd(0x787878, 0.95, 0, true, false, 1, 0, 0);
        const rock = new THREE.Mesh(geo, mat);
        rock.position.set(x, size * 0.4, z);
        rock.rotation.set(
            this._rand() * Math.PI,
            this._rand() * Math.PI,
            this._rand() * Math.PI
        );
        rock.userData.mapGenerated = true;
            rock.userData.instancable = true;
        this.scene.add(rock);
        this.addColliderBox(
            new THREE.Vector3(x, size * 0.4, z),
            size * 1.5, size * 0.8, size * 1.5, false
        );
    }

    // =========================================================================
    // STONE MAZE QUADRANT (NE: x > 0, z < 0)
    // =========================================================================
    _generateMazeQuadrant() {
        // СВ квадрант: x в [10, 245], z в [-250, -10]
        const startX = 10;
        const startZ = -250;
        const size = HALF - 20; // ~236

        const wallHeight = 18; // Высокие стены замка

        const wallMat = this.pool.getMatStd(0x666666, 0.85, 0, true, false, 1, 0, 0, true);
        const floorMat = this.pool.getMatStd(0x888888, 0.9, 0, true, false, 1, 0, 0);
        const darkMat = this.pool.getMatStd(COLORS.mazeTower, 0.9, 0, true, false, 1, 0, 0);

        // Каменный пол по всему биому
        const stoneFloorGeo = this.pool.getGeoBox(size, 0.3, size);
        const stoneFloor = new THREE.Mesh(stoneFloorGeo, floorMat);
        stoneFloor.position.set(startX + size / 2, -0.15, startZ + size / 2); // top surface at Y=0
        stoneFloor.userData.mapGenerated = true;
        this.scene.add(stoneFloor);

        // Maze grid - cell size 12 для масштабных стен замка
        const cellSize = 12;
        const cols = Math.floor(size / cellSize);
        const rows = Math.floor(size / cellSize);

        const mazeCols = cols % 2 === 0 ? cols - 1 : cols;
        const mazeRows = rows % 2 === 0 ? rows - 1 : rows;

        // Grid: 1 = wall, 0 = passage
        const grid = [];
        for (let r = 0; r < mazeRows; r++) {
            grid[r] = new Array(mazeCols).fill(1);
        }

        // Iterative recursive backtracker
        const stack = [];
        grid[1][1] = 0;
        stack.push({ cx: 1, cy: 1 });

        while (stack.length > 0) {
            const cur = stack[stack.length - 1];
            const cx = cur.cx;
            const cy = cur.cy;

            const neighbors = [];
            const dirs = [
                { dx: 0, dy: -2 },
                { dx: 2, dy: 0 },
                { dx: 0, dy: 2 },
                { dx: -2, dy: 0 }
            ];

            for (const d of dirs) {
                const nx = cx + d.dx;
                const ny = cy + d.dy;
                if (nx > 0 && nx < mazeCols - 1 && ny > 0 && ny < mazeRows - 1 && grid[ny][nx] === 1) {
                    neighbors.push({ nx, ny, wx: cx + d.dx / 2, wy: cy + d.dy / 2 });
                }
            }

            if (neighbors.length > 0) {
                const chosen = neighbors[Math.floor(this._rand() * neighbors.length)];
                grid[chosen.wy][chosen.wx] = 0;
                grid[chosen.ny][chosen.nx] = 0;
                stack.push({ cx: chosen.nx, cy: chosen.ny });
            } else {
                stack.pop();
            }
        }

        // Add small rooms (clear 3x3 areas)
        for (let i = 0; i < 6; i++) {
            const rx = 3 + Math.floor(this._rand() * (mazeCols - 6));
            const ry = 3 + Math.floor(this._rand() * (mazeRows - 6));
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const r = ry + dr;
                    const c = rx + dc;
                    if (r > 0 && r < mazeRows - 1 && c > 0 && c < mazeCols - 1) {
                        grid[r][c] = 0;
                    }
                }
            }
        }

        // Add dead-end corridors
        for (let i = 0; i < 10; i++) {
            const sx = 1 + Math.floor(this._rand() * (mazeCols - 2));
            const sy = 1 + Math.floor(this._rand() * (mazeRows - 2));
            if (grid[sy][sx] === 0) {
                const len = 1 + Math.floor(this._rand() * 4);
                const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
                const d = dirs[Math.floor(this._rand() * 4)];
                for (let step = 1; step <= len; step++) {
                    const nx = sx + d.dx * step;
                    const ny = sy + d.dy * step;
                    if (nx > 0 && nx < mazeCols - 1 && ny > 0 && ny < mazeRows - 1) {
                        grid[ny][nx] = 0;
                    } else break;
                }
            }
        }

        // Build walls — varied stone colors
        const clearingCX = startX + size * 0.5;
        const clearingCZ = startZ + size * 0.5;
        const clearingRadius = 25;
        let hiddenMazeLoot = 0;
        for (let r = 1; r < mazeRows - 1 && hiddenMazeLoot < 28; r++) {
            for (let c = 1; c < mazeCols - 1 && hiddenMazeLoot < 28; c++) {
                if (grid[r][c] !== 0) continue;
                const adjacentWalls = Number(grid[r - 1][c] === 1) + Number(grid[r + 1][c] === 1) + Number(grid[r][c - 1] === 1) + Number(grid[r][c + 1] === 1);
                if (adjacentWalls < 3) continue;
                this._registerChestSpot(startX + c * cellSize + cellSize / 2, startZ + r * cellSize + cellSize / 2, 'maze');
                hiddenMazeLoot++;
            }
        }
        const wallColors = [0x666666, 0x777777, 0x5a5a5a, 0x6b6b6b, 0x5e5e5e];
        for (let r = 0; r < mazeRows; r++) {
            for (let c = 0; c < mazeCols; c++) {
                const wx = startX + c * cellSize + cellSize / 2;
                const wz = startZ + r * cellSize + cellSize / 2;
                
                if (Math.sqrt(wx*wx + wz*wz) < 35) continue;

                if (grid[r][c] === 1) {
                    if (Math.hypot(wx - clearingCX, wz - clearingCZ) < clearingRadius + cellSize) continue;
                    const wallWidth = cellSize * 0.9;
                    const geo = this.pool.getGeoBox(wallWidth, wallHeight, wallWidth);
                    const color = wallColors[Math.floor(this._rand() * wallColors.length)];
                    const wallMat2 = this.pool.getMatStd(color, 0.85, 0, true, false, 1, 0, 0, true);
                    const wall = new THREE.Mesh(geo, wallMat2);
                    wall.position.set(wx, wallHeight / 2, wz);
                    wall.userData.mapGenerated = true;
                    this.scene.add(wall);

                    this.addColliderBox(
                        new THREE.Vector3(wx, wallHeight / 2, wz),
                        wallWidth, wallHeight, wallWidth, false
                    );
                }
            }
        }

        // Central clearing with loot - open area in the center
        // Clear area in center - remove walls around clearing
        for (let r = 0; r < mazeRows; r++) {
            for (let c = 0; c < mazeCols; c++) {
                const wx = startX + c * cellSize + cellSize / 2;
                const wz = startZ + r * cellSize + cellSize / 2;
                const dist = Math.sqrt((wx - clearingCX) ** 2 + (wz - clearingCZ) ** 2);
                if (dist < clearingRadius) {
                    grid[r][c] = 0;
                }
            }
        }

        this._registerChestSpot(clearingCX - 4, clearingCZ, 'tower');
        this._registerChestSpot(clearingCX + 4, clearingCZ, 'tower');

        // Central tall tower with spiral staircase
        const towerCX = clearingCX;
        const towerCZ = clearingCZ;
        const towerHeight = 50;
        const towerRadius = 8;

        const towerWallSegments = 20;
        for (let i = 0; i < towerWallSegments; i++) {
            if (i <= 1) continue;
            const angle = i / towerWallSegments * Math.PI * 2;
            const segmentLength = 2 * Math.PI * towerRadius / towerWallSegments + 0.35;
            const sx = towerCX + Math.cos(angle) * towerRadius;
            const sz = towerCZ + Math.sin(angle) * towerRadius;
            const segment = new THREE.Mesh(this.pool.getGeoBox(0.8, towerHeight, segmentLength), wallMat);
            segment.position.set(sx, towerHeight / 2, sz);
            segment.rotation.y = -angle;
            segment.userData.mapGenerated = true;
            this.scene.add(segment);
            this.addColliderBox(new THREE.Vector3(sx, towerHeight / 2, sz), 1.2, towerHeight, segmentLength, false);
        }

        // Tower floor
        const floorGeo = this.pool.getGeoCylinder(towerRadius, towerRadius, 0.5);
        const floorMesh = new THREE.Mesh(floorGeo, darkMat);
        floorMesh.position.set(towerCX, 0.25, towerCZ);
        floorMesh.userData.mapGenerated = true;
        floorMesh.userData.walkable = true;
        this.scene.add(floorMesh);

        this.addColliderBox(
            new THREE.Vector3(towerCX, 0.25, towerCZ),
            towerRadius * 2, 0.5, towerRadius * 2, true
        );

        // Spiral staircase
        const totalSteps = 80;
        const stepH = towerHeight / totalSteps;
        const spiralR = towerRadius - 2;
        const angleStep = Math.PI * 0.45;

        for (let i = 0; i < totalSteps; i++) {
            const angle = i * angleStep;
            const stepY = i * stepH + 0.5;

            const sx = towerCX + Math.cos(angle) * spiralR;
            const sz = towerCZ + Math.sin(angle) * spiralR;

            const stepGeo = this.pool.getGeoBox(3, stepH, 1.5);
            const stepMesh = new THREE.Mesh(stepGeo, darkMat);
            stepMesh.position.set(sx, stepY, sz);
            stepMesh.rotation.y = -angle + Math.PI / 2;
            stepMesh.userData.mapGenerated = true;
            stepMesh.userData.walkable = true;
            this.scene.add(stepMesh);

            this.addColliderBox(
                new THREE.Vector3(sx, stepY, sz),
                3, stepH, 1.5, true
            );
        }

        // Tower top platform
        const topY = totalSteps * stepH + 0.5;
        const topPlatGeo = this.pool.getGeoCylinder(towerRadius + 0.5, towerRadius + 0.5, 0.5);
        const topPlat = new THREE.Mesh(topPlatGeo, darkMat);
        topPlat.position.set(towerCX, topY + 0.25, towerCZ);
        topPlat.userData.mapGenerated = true;
        topPlat.userData.walkable = true;
        this.scene.add(topPlat);

        this.addColliderBox(
            new THREE.Vector3(towerCX, topY + 0.25, towerCZ),
            (towerRadius + 0.5) * 2, 0.5, (towerRadius + 0.5) * 2, true
        );

        // Tower roof
        const roofGeo = this.pool.getGeoCone(towerRadius + 1, 4);
        const roof = new THREE.Mesh(roofGeo, wallMat);
        roof.position.set(towerCX, topY + 2.25, towerCZ);
        roof.userData.mapGenerated = true;
        this.scene.add(roof);

        // Tower interior — torches and chests
        this._addTowerInterior(towerCX, towerCZ, towerHeight, towerRadius);

        // Corner towers
        const corners = [
            { x: startX + cellSize, z: startZ + cellSize },
            { x: startX + (mazeCols - 1) * cellSize, z: startZ + cellSize },
            { x: startX + cellSize, z: startZ + (mazeRows - 1) * cellSize },
            { x: startX + (mazeCols - 1) * cellSize, z: startZ + (mazeRows - 1) * cellSize }
        ];

        for (const tp of corners) {
            const tGeo = this.pool.getGeoCylinder(6, 7, wallHeight + 4);
            const tower = new THREE.Mesh(tGeo, wallMat);
            tower.position.set(tp.x, (wallHeight + 4) / 2, tp.z);
            tower.userData.mapGenerated = true;
            this.scene.add(tower);

            this.addColliderBox(
                new THREE.Vector3(tp.x, (wallHeight + 4) / 2, tp.z),
                14, wallHeight + 4, 14, false
            );

            const platGeo = this.pool.getGeoCylinder(6.5, 6.5, 0.8);
            const plat = new THREE.Mesh(platGeo, darkMat);
            plat.position.set(tp.x, wallHeight + 4.4, tp.z);
            plat.userData.mapGenerated = true;
            plat.userData.walkable = true;
            this.scene.add(plat);

            this.addColliderBox(
                new THREE.Vector3(tp.x, wallHeight + 4.4, tp.z),
                13, 0.8, 13, true
            );

            // Torches on corner towers
            this._addCornerTowerTorch(tp.x, tp.z, wallHeight + 4.5);
        }

        // Battlements along outer perimeter walls (castle crenellations)

        // Castle gate at entrance from center (south-west side)
        this._addCastleGate(startX + cellSize * 2, startZ + cellSize, wallHeight);

        // Moss and vines — removed (not on reference)
        // this._addMazeMoss(startX, startZ, size);

        // Glowing crystals — removed (not on reference)
        // this._addMazeCrystals(startX, startZ, size, clearingCX, clearingCZ);

        // POI items in maze
        this._addMazePOI(startX, startZ, size, clearingCX, clearingCZ);

        // Path from maze to center
        this._addMazeToCenterPath(clearingCX, clearingCZ);
    }

    _addMazeLootChests(cx, cz, radius) {
        const chestTypes = [
            { color: 0xff6600, emissive: 0xff4400, name: 'weapon' },
            { color: 0xff6600, emissive: 0xff4400, name: 'weapon' },
            { color: 0xff0000, emissive: 0xff0000, name: 'medkit' },
            { color: 0x4caf50, emissive: 0x2e7d32, name: 'ammo' },
            { color: 0xff6600, emissive: 0xff4400, name: 'weapon' },
            { color: 0xff0000, emissive: 0xff0000, name: 'medkit' },
            { color: 0x4caf50, emissive: 0x2e7d32, name: 'ammo' },
            { color: 0xff6600, emissive: 0xff4400, name: 'weapon' },
        ];

        for (let i = 0; i < 4; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const dist = radius * 0.6;
            const chestX = cx + Math.cos(angle) * dist;
            const chestZ = cz + Math.sin(angle) * dist;
            const type = chestTypes[i];

            const chest = new THREE.Group();
            const mat = this.pool.getMatStd(type.color, 0.5, 0, true, false, 1, type.emissive, 3.0);

            // Box body
            const boxGeo = this.pool.getGeoBox(1.2, 0.8, 0.8);
            const box = new THREE.Mesh(boxGeo, mat);
            box.position.y = 0.4;
            box.userData.mapGenerated = true;
            chest.add(box);

            // Lid (half sphere on top)
            const lidGeo = this.pool.getGeoSphere(0.65);
            const lid = new THREE.Mesh(lidGeo, mat);
            lid.position.y = 0.8;
            lid.userData.mapGenerated = true;
            chest.add(lid);

            // Metal bands
            const bandMat = this.pool.getMatStd(0x424242, 0.6, 0.8, true, false, 1, 0, 0);
            for (let by of [0.2, 0.6]) {
                const bandGeo = new THREE.TorusGeometry(0.6, 0.04, 6, 12);
                const band = new THREE.Mesh(bandGeo, bandMat);
                band.position.y = by;
                band.rotation.x = Math.PI / 2;
                band.userData.mapGenerated = true;
                chest.add(band);
            }

            // Lock
            const lockGeo = this.pool.getGeoBox(0.2, 0.25, 0.1);
            const lock = new THREE.Mesh(lockGeo, bandMat);
            lock.position.set(0, 0.55, 0.45);
            lock.userData.mapGenerated = true;
            chest.add(lock);

            // Glow light
            const glowMat = this.pool.getMatStd(type.color, 0.9, 0, true, true, 0.6, type.emissive, 8.0);
            const glowGeo = this.pool.getGeoSphere(0.9);
            const glow = new THREE.Mesh(glowGeo, glowMat);
            glow.position.y = 0.6;
            glow.userData.isGlow = true;
            glow.userData.mapGenerated = true;
            glow.userData.baseIntensity = 8.0;
            chest.add(glow);

            chest.position.set(chestX, 0, chestZ);
            chest.userData.isPOI = true;
            chest.userData.poiType = type.name;
            chest.userData.mapGenerated = true;
            this.scene.add(chest);

            this.addColliderBox(
                new THREE.Vector3(chestX, 0.4, chestZ),
                1.2, 0.8, 0.8, false
            );
        }
    }

    _addTowerInterior(towerCX, towerCZ, towerHeight, towerRadius) {
        const torchMat = this.pool.getMatStd(0x5d4037, 0.8, 0, true, false, 1, 0, 0);
        const fireMat = this.pool.getMatStd(0xff6600, 0.9, 0, true, true, 0.9, 0xff4400, 10.0);

        // Torches at multiple heights around tower interior
        const torchCount = 6;
        for (let i = 0; i < torchCount; i++) {
            const angle = (i / torchCount) * Math.PI * 2;
            const height = 4 + i * (towerHeight - 8) / torchCount;
            const tx = towerCX + Math.cos(angle) * (towerRadius - 1.5);
            const tz = towerCZ + Math.sin(angle) * (towerRadius - 1.5);

            const torch = new THREE.Group();

            // Stick
            const stickGeo = this.pool.getGeoCylinder(0.06, 0.08, 0.6);
            const stick = new THREE.Mesh(stickGeo, torchMat);
            stick.rotation.x = Math.PI / 6;
            stick.position.set(0, 0.3, 0);
            stick.userData.mapGenerated = true;
            torch.add(stick);

            // Flame
            const flameGeo = this.pool.getGeoSphere(0.15);
            const flame = new THREE.Mesh(flameGeo, fireMat);
            flame.position.set(0.15, 0.6, 0);
            flame.userData.isTorch = true;
            flame.userData.blinkRate = 2 + Math.random();
            torch.add(flame);

            torch.position.set(tx, height, tz);
            torch.userData.mapGenerated = true;
            this.scene.add(torch);
        }

        // Chests on tower floor
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const dist = 2;
            const chestX = towerCX + Math.cos(angle) * dist;
            const chestZ = towerCZ + Math.sin(angle) * dist;

            const chestMat = this.pool.getMatStd(0x8B4513, 0.7, 0, true, false, 1, 0xffaa00, 2.0);
            const chestGeo = this.pool.getGeoBox(0.8, 0.6, 0.6);
            const chest = new THREE.Mesh(chestGeo, chestMat);
            chest.position.set(chestX, 0.3, chestZ);
            chest.userData.isTowerChest = true;
            chest.userData.mapGenerated = true;
            this.scene.add(chest);
        }
    }

    _addCornerTowerTorch(x, z, baseY) {
        const torchMat = this.pool.getMatStd(0x5d4037, 0.8, 0, true, false, 1, 0, 0);
        const fireMat = this.pool.getMatStd(0xff6600, 0.9, 0, true, true, 0.9, 0xff4400, 10.0);

        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const torch = new THREE.Group();

            const stickGeo = this.pool.getGeoCylinder(0.06, 0.08, 0.6);
            const stick = new THREE.Mesh(stickGeo, torchMat);
            stick.rotation.x = Math.PI / 6;
            stick.position.set(0, 0.3, 0);
            stick.userData.mapGenerated = true;
            torch.add(stick);

            const flameGeo = this.pool.getGeoSphere(0.15);
            const flame = new THREE.Mesh(flameGeo, fireMat);
            flame.position.set(0.15, 0.6, 0);
            flame.userData.isTorch = true;
            flame.userData.blinkRate = 2 + Math.random();
            torch.add(flame);

            torch.position.set(
                x + Math.cos(angle) * 2.5,
                baseY + 1.5,
                z + Math.sin(angle) * 2.5
            );
            torch.userData.mapGenerated = true;
            this.scene.add(torch);
        }
    }

    /** Castle gate — arched entrance with portcullis */
    _addCastleGate(x, z, wallHeight) {
        const gateGroup = new THREE.Group();
        const mat = this.pool.getMatStd(0x5a5a5a, 0.85, 0, true, false, 1, 0, 0);

        // Gate arch (semi-cylinder on top of opening)
        const archGeo = this.pool.getGeoCylinder(5, 5, 6, 8, 1, false, 0, Math.PI);
        const arch = new THREE.Mesh(archGeo, mat);
        arch.rotation.y = Math.PI / 2;
        arch.position.set(0, wallHeight + 2.5, 0);
        arch.userData.mapGenerated = true;
        gateGroup.add(arch);

        // Gate pillars
        for (let side of [-1, 1]) {
            const pillarGeo = this.pool.getGeoBox(3, wallHeight + 6, 3);
            const pillar = new THREE.Mesh(pillarGeo, mat);
            pillar.position.set(side * 5, (wallHeight + 6) / 2, 0);
            pillar.userData.mapGenerated = true;
            gateGroup.add(pillar);
        }

        // Portcullis (vertical bars)
        const barMat = this.pool.getMatStd(0x333333, 0.8, 0, false, false, 1, 0, 0);
        for (let i = -3; i <= 3; i++) {
            const barGeo = this.pool.getGeoBox(0.25, wallHeight - 6, 0.25);
            const bar = new THREE.Mesh(barGeo, barMat);
            bar.position.set(i * 1.8, wallHeight / 2 + 3, 0);
            bar.userData.mapGenerated = true;
            gateGroup.add(bar);
        }

        // Gate roof
        const roofGeo = this.pool.getGeoCone(7, 4, 4);
        const roofMat = this.pool.getMatStd(0x3e2723, 0.85, 0, true, false, 1, 0, 0, true);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, wallHeight + 6.5, 0);
        roof.rotation.y = Math.PI / 4;
        roof.userData.mapGenerated = true;
        gateGroup.add(roof);

        gateGroup.position.set(x, 0, z);
        gateGroup.userData.mapGenerated = true;
        this.scene.add(gateGroup);
    }

    _addMazeMoss(startX, startZ, size) {
        const mossMat = this.pool.getMatStd(0x4caf50, 1.0, 0, true, false, 1, 0, 0);
        const vineMat = this.pool.getMatStd(0x2e7d32, 0.9, 0, true, false, 1, 0, 0);

        // Moss patches on walls
        for (let i = 0; i < 15; i++) {
            const x = startX + this._rand() * size;
            const z = startZ + this._rand() * size;
            const geo = this.pool.getGeoDodecahedron(0.3 + this._rand() * 0.5, 5);
            const face = Math.floor(this._rand() * 4);
            const moss = new THREE.Mesh(geo, mossMat);
            if (face === 0) {
                moss.rotation.y = 0;
                moss.position.set(x + 0.1, 1 + this._rand() * 3, z);
            } else if (face === 1) {
                moss.rotation.y = Math.PI;
                moss.position.set(x - 0.1, 1 + this._rand() * 3, z);
            } else if (face === 2) {
                moss.rotation.y = Math.PI / 2;
                moss.position.set(x, z + 0.1, 1 + this._rand() * 3);
            } else {
                moss.rotation.y = -Math.PI / 2;
                moss.position.set(x, z - 0.1, 1 + this._rand() * 3);
            }
            moss.userData.mapGenerated = true;
            moss.userData.instancable = true;
            this.scene.add(moss);
        }

        // Vines hanging from wall tops
        for (let i = 0; i < 8; i++) {
            const x = startX + this._rand() * size;
            const z = startZ + this._rand() * size;
            const vineGeo = this.pool.getGeoCylinder(0.05, 0.08, 2 + this._rand() * 3, 4);
            const vine = new THREE.Mesh(vineGeo, vineMat);
            vine.position.set(x, 5 + this._rand() * 3, z);
            vine.userData.mapGenerated = true;
            this.scene.add(vine);
        }
    }

    _addMazeCrystals(startX, startZ, size, cx, cz) {
        const crystalMat = this.pool.getMatStd(0x7c4dff, 0.2, 0.8, true, false, 1, 0x6515ff, 3.0);

        for (let i = 0; i < 5; i++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = 10 + this._rand() * (size * 0.3);
            const cx2 = cx + Math.cos(angle) * dist;
            const cz2 = cz + Math.sin(angle) * dist;
            const size2 = 0.3 + this._rand() * 0.7;

            const geo = this.pool.getGeoDodecahedron(size2);
            const crystal = new THREE.Mesh(geo, this.pool.getMat(0x7c4dff, true));
            crystal.position.set(cx2, size2, cz2);
            crystal.rotation.set(this._rand() * Math.PI, this._rand() * Math.PI, 0);
            crystal.userData.isCrystal = true;
            crystal.userData.blinkRate = 1 + this._rand() * 2;
            crystal.userData.mapGenerated = true;
            this.scene.add(crystal);
        }
    }

    _addMazePOI(startX, startZ, size, cx, cz) {
        const poiPositions = [
            { x: cx - 30, z: cz - 20, type: 'weapon' },
            { x: cx + 25, z: cz - 15, type: 'medkit' },
            { x: cx - 20, z: cz + 25, type: 'ammo' },
            { x: cx + 30, z: cz + 20, type: 'weapon' },
            { x: cx - 35, z: cz + 5, type: 'medkit' },
            { x: cx + 15, z: cz - 35, type: 'ammo' },
        ];

        for (const poi of poiPositions) {
            if (poi.type === 'weapon') {
                this._addWeaponDrop(poi.x, poi.z);
            } else if (poi.type === 'medkit') {
                this._addMedkitDrop(poi.x, poi.z);
            } else {
                this._addAmmoDrop(poi.x, poi.z);
            }
        }
    }

    _addMazeToCenterPath(clearingCX, clearingCZ) {
        const pathMat = this.pool.getMatStd(0x9e9e9e, 1.0, 0, true, false, 1, 0, 0);

        // Path from maze clearing to biome border (toward center)
        const startX2 = clearingCX;
        const startZ2 = clearingCZ;
        const endX = 15;
        const endZ = clearingCZ;

        let px = startX2;
        let pz = startZ2;
        for (let i = 0; i < 15; i++) {
            const t = i / 14;
            const segGeo = this.pool.getGeoBox(3, 0.05, 4);
            const seg = new THREE.Mesh(segGeo, pathMat);
            seg.position.set(
                px + (endX - px) * t,
                0.03,
                pz + (endZ - pz) * t
            );
            seg.userData.mapGenerated = true;
            seg.userData.walkable = true;
            this.scene.add(seg);
            px += (endX - px) * 0.15 + (this._rand() - 0.5) * 2;
            pz += (endZ - pz) * 0.15 + (this._rand() - 0.5) * 2;
        }
    }

    // =========================================================================
    // MILITARY RUINS QUADRANT (SW: x < 0, z > 0)
    // =========================================================================
    _generateMilitaryQuadrant() {
        const startX = -250;
        const startZ = 10;
        const size = 240;
        const cx = startX + size / 2;
        const cz = startZ + size / 2;

        // Военный пол (бетон/асфальт)
        const militaryFloorMat = this.pool.getMatStd(0x747474, 0.94, 0, true, false, 1, 0, 0);
        const militaryFloorGeo = this.pool.getGeoBox(size, 0.3, size);
        const militaryFloor = new THREE.Mesh(militaryFloorGeo, militaryFloorMat);
        militaryFloor.position.set(cx, -0.15, cz); // top surface at Y=0
        militaryFloor.userData.mapGenerated = true;
        this.scene.add(militaryFloor);

        // Колючая проволока по периметру с входом
        this._addBarbedWireFence(startX, startZ, size);

        // Ежи (анти танковые)
        for (let i = 0; i < 8; i++) {
            const hx = startX + 10 + this._rand() * (size - 20);
            const hz = startZ + 10 + this._rand() * (size - 20);
            this._addCzechHedgehog(hx, hz, 2.5 + this._rand() * 1.5);
        }

        // Полуразрушенные танки
        for (let i = 0; i < 2; i++) {
            const tx = startX + 15 + this._rand() * (size - 30);
            const tz = startZ + 15 + this._rand() * (size - 30);
            this._addDestroyedTank(tx, tz);
        }
        [[-212, 70], [-104, 54], [-72, 188]].forEach(([x, z]) => this._addMilitaryTank(x, z));

        // Окопы - больше и заметнее
        this._addTrench(startX + 20, startZ + 20, size * 0.4);
        this._addTrench(startX + size * 0.5, startZ + size * 0.5, size * 0.35);
        this._addTrench(startX + size * 0.7, startZ + 15, size * 0.2);

        // Укрытия из мешков
        for (let i = 0; i < 4; i++) {
            const sx = startX + 15 + this._rand() * (size - 30);
            const sz = startZ + 15 + this._rand() * (size - 30);
            this._addSandbagBunker(sx, sz);
        }

        this._addReferenceMilitaryRuin(startX + 42, startZ + 42, 34, 28);
        this._addReferenceMilitaryRuin(startX + 188, startZ + 44, 32, 30);
        this._addReferenceMilitaryRuin(startX + 46, startZ + 188, 36, 26);
        this._addReferenceMilitaryRuin(startX + 184, startZ + 184, 34, 30);
        this._addMilitaryHangar(cx, cz, 42, 54, 16);

        // Дорога между домами (асфальт)
        const roadMat = this.pool.getMatStd(0x333333, 0.95, 0, false, false, 1, 0, 0);
        const roadGeo = this.pool.getGeoBox(size - 30, 0.1, 12);
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.position.set(cx, 0.05, cz);
        road.userData.mapGenerated = true;
        this.scene.add(road);

        // Бетонные баррикады вдоль дороги
        for (let b = 0; b < 6; b++) {
            const barrierGeo = this.pool.getGeoBox(5, 3.5, 2.5);
            const barrierMat = this.pool.getMatStd(0x666655, 0.9, 0, false, false, 1, 0, 0);
            const barrier = new THREE.Mesh(barrierGeo, barrierMat);
            barrier.position.set(startX + 34 + b * 34, 1.75, cz);
            barrier.rotation.y = this._rand() * 0.3;
            barrier.userData.mapGenerated = true;
            this.scene.add(barrier);
            this.addColliderBox(new THREE.Vector3(barrier.position.x, 1.75, barrier.position.z), 5, 3.5, 2.5, false);
        }

        for (let crater = 0; crater < 2; crater++) {
            const craterX = startX + 10 + this._rand() * (size - 20);
            const craterZ = startZ + 10 + this._rand() * (size - 20);
            const craterSize = 4 + this._rand() * 4;
            const craterGeo = new THREE.CircleGeometry(craterSize, 16);
            const craterMat = this.pool.getMatStd(0x222222, 1, 0, false, false, 1, 0, 0);
            const craterMesh = new THREE.Mesh(craterGeo, craterMat);
            craterMesh.rotation.x = -Math.PI / 2;
            craterMesh.position.set(craterX, 0.025, craterZ);
            craterMesh.userData.mapGenerated = true;
            this.scene.add(craterMesh);
        }

        // Металлические бочки
        for (let barrel = 0; barrel < 3; barrel++) {
            const barrelX = startX + 10 + this._rand() * (size - 20);
            const barrelZ = startZ + 10 + this._rand() * (size - 20);
            const barrelGeo = this.pool.getGeoCylinder(0.8, 0.8, 2.5);
            const barrelMat = this.pool.getMatStd(this._rand() > 0.5 ? 0x8B4513 : 0x444444, 0.7, 0, false, false, 1, 0, 0);
            const barrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
            barrelMesh.position.set(barrelX, 1.25, barrelZ);
            barrelMesh.rotation.z = this._rand() * 0.5;
            barrelMesh.userData.mapGenerated = true;
            this.scene.add(barrelMesh);
            this.addColliderBox(new THREE.Vector3(barrelX, 1.25, barrelZ), 1.6, 2.5, 1.6, false);
        }

        // Edge trees — dense military perimeter

        // Path from military to center
        this._addMilitaryToCenterPath(cx, cz);
    }

    _addMilitaryHangar(x, z, w, d, h) {
        const group = new THREE.Group();
        const floorMat = this.pool.getMatStd(0x34383d, 0.94, 0.05, true, false, 1, 0, 0);
        const wallMat = this.pool.getMatStd(0x59636c, 0.72, 0.28, true, false, 1, 0, 0, true);
        const floor = new THREE.Mesh(this.pool.getGeoBox(w, 0.3, d), floorMat);
        floor.position.y = 0.15;
        floor.userData.mapGenerated = true;
        floor.userData.walkable = true;
        group.add(floor);
        for (const side of [-1, 1]) {
            const wall = new THREE.Mesh(this.pool.getGeoBox(0.9, h, d), wallMat);
            wall.position.set(side * w / 2, h / 2, 0);
            wall.userData.mapGenerated = true;
            group.add(wall);
            this.addColliderBox(new THREE.Vector3(x + side * w / 2, h / 2, z), 0.9, h, d, false);
        }
        const roof = new THREE.Mesh(this.pool.getGeoBox(w + 1.8, 0.8, d + 1.8), wallMat);
        roof.position.y = h;
        roof.userData.mapGenerated = true;
        group.add(roof);
        this.addColliderBox(new THREE.Vector3(x, h, z), w + 1.8, 0.8, d + 1.8, false);
        for (const end of [-1, 1]) {
            for (const side of [-1, 1]) {
                const post = new THREE.Mesh(this.pool.getGeoBox(1.2, h, 1.2), wallMat);
                post.position.set(side * (w / 2 - 0.6), h / 2, end * (d / 2 - 0.6));
                post.userData.mapGenerated = true;
                group.add(post);
            }
        }
        group.position.set(x, 0, z);
        group.userData.mapGenerated = true;
        group.userData.buildingType = 'hangar';
        this.scene.add(group);
        this._buildings.push({ x, z, w, d, template: { type: 'hangar' } });
        for (const [ox, oz] of [[-12, -18], [12, -18], [-12, 0], [12, 0], [-12, 18], [12, 18]]) {
            this._registerChestSpot(x + ox, z + oz, 'hangar', 3);
        }
    }

    _addReferenceMilitaryRuin(x, z, w, d) {
        const group = new THREE.Group();
        const floorMat = this.pool.getMatStd(0x34383d, 0.95, 0, true, false, 1, 0, 0);
        const wallMat = this.pool.getMatStd(0x4f5963, 0.9, 0, true, false, 1, 0, 0, true);
        const floor = new THREE.Mesh(this.pool.getGeoBox(w, 0.35, d), floorMat);
        floor.position.y = 0.18;
        floor.userData.mapGenerated = true;
        group.add(floor);
        const segments = [
            [-w * 0.28, 4, -d / 2, w * 0.44, 8, 0.7],
            [w * 0.3, 2.8, -d / 2, w * 0.32, 5.6, 0.7],
            [-w / 2, 3.5, -d * 0.2, 0.7, 7, d * 0.58],
            [-w / 2, 2.5, d * 0.38, 0.7, 5, d * 0.24],
            [w / 2, 3.2, d * 0.18, 0.7, 6.4, d * 0.55],
            [-w * 0.3, 3, d / 2, w * 0.3, 6, 0.7],
            [w * 0.3, 4, d / 2, w * 0.34, 8, 0.7]
        ];
        for (const [lx, ly, lz, sw, sh, sd] of segments) {
            const wall = new THREE.Mesh(this.pool.getGeoBox(sw, sh, sd), wallMat);
            wall.position.set(lx, ly, lz);
            wall.userData.mapGenerated = true;
            group.add(wall);
            this.addColliderBox(new THREE.Vector3(x + lx, ly, z + lz), sw, sh, sd, false);
        }
        const upperFloorMat = this.pool.getMatStd(0x434b52, 0.94, 0, true, false, 1, 0, 0);
        for (const side of [-1, 1]) {
            const slabW = w * 0.42;
            const slab = new THREE.Mesh(this.pool.getGeoBox(slabW, 0.35, d * 0.78), upperFloorMat);
            slab.position.set(side * w * 0.27, 6, 0);
            slab.userData.mapGenerated = true;
            slab.userData.walkable = true;
            group.add(slab);
            this.addColliderBox(new THREE.Vector3(x + side * w * 0.27, 6, z), slabW, 0.35, d * 0.78, true);
        }
        group.position.set(x, 0, z);
        group.userData.mapGenerated = true;
        this.scene.add(group);
        this._buildings.push({ x, z, w, d, template: { type: 'military_ruin' } });
        this._registerChestSpot(x - w * 0.28, z, 'military');
        this._registerChestSpot(x + w * 0.26, z - d * 0.24, 'military');
        this._registerChestSpot(x + w * 0.22, z + d * 0.24, 'military');
    }

    _addMilitaryEdgeTrees(startX, startZ, size) {
        const treeTypes = ['pine', 'spruce'];
        const positions = [];
        const edgeWidth = 18;

        for (let side = 0; side < 4; side++) {
            for (let i = 10; i < size - 10; i += 6) {
                for (let ox = 0; ox < edgeWidth; ox += 3) {
                    let tx, tz;
                    if (side === 0) {
                        tx = startX + ox + (this._rand() - 0.5) * 2;
                        tz = startZ + i + (this._rand() - 0.5) * 2;
                    } else if (side === 1) {
                        tx = startX + size - ox - (this._rand() - 0.5) * 2;
                        tz = startZ + i + (this._rand() - 0.5) * 2;
                    } else if (side === 2) {
                        tx = startX + i + (this._rand() - 0.5) * 2;
                        tz = startZ + ox + (this._rand() - 0.5) * 2;
                    } else {
                        tx = startX + i + (this._rand() - 0.5) * 2;
                        tz = startZ + size - ox - (this._rand() - 0.5) * 2;
                    }
                    const key = `${tx.toFixed(0)},${tz.toFixed(0)}`;
                    if (!positions.includes(key)) {
                        positions.push(key);
                        const type = treeTypes[Math.floor(this._rand() * treeTypes.length)];
                        this._addForestTree(tx, tz, type);
                    }
                }
            }
        }
    }

    _addMilitaryPOI(startX, startZ, size, cx, cz) {
        const poiPositions = [
            { x: cx - 30, z: cz - 20, type: 'weapon' },
            { x: cx + 25, z: cz + 15, type: 'ammo' },
            { x: cx - 15, z: cz + 30, type: 'medkit' },
            { x: cx + 35, z: cz - 10, type: 'weapon' },
        ];

        for (const poi of poiPositions) {
            if (poi.type === 'weapon') {
                this._addWeaponDrop(poi.x, poi.z);
            } else if (poi.type === 'medkit') {
                this._addMedkitDrop(poi.x, poi.z);
            } else {
                this._addAmmoDrop(poi.x, poi.z);
            }
        }
    }

    _addMilitaryToCenterPath(cx, cz) {
        const pathMat = this.pool.getMatStd(0x555555, 1.0, 0, true, false, 1, 0, 0);

        // Path from military quadrant to center (toward origin)
        const startX2 = cx;
        const startZ2 = cz;
        const endX = 0;
        const endZ = 0;

        let px = startX2;
        let pz = startZ2;
        for (let i = 0; i < 10; i++) {
            const t = i / 19;
            const segGeo = this.pool.getGeoBox(3, 0.05, 4);
            const seg = new THREE.Mesh(segGeo, pathMat);
            seg.position.set(
                px + (endX - px) * t,
                0.03,
                pz + (endZ - pz) * t
            );
            seg.userData.mapGenerated = true;
            seg.userData.walkable = true;
            this.scene.add(seg);
            px += (endX - px) * 0.12 + (this._rand() - 0.5) * 2;
            pz += (endZ - pz) * 0.12 + (this._rand() - 0.5) * 2;
        }
    }

    _addBarbedWireFence(startX, startZ, size) {
        const postMat = this.pool.getMatStd(0x4a5238, 0.9, 0, false, false, 1, 0, 0);
        const wireMat = this.pool.getMatStd(0x888888, 0.5, 0.6, false, false, 1, 0, 0);

        const postH = 2.5;
        const postGeo = this.pool.getGeoBox(0.1, postH, 0.1);
        const postSpacing = 8;
        const entranceWidth = 12;
        const entranceStart = size * 0.4;
        const entranceEnd = size * 0.6;

        // Северная сторона
        for (let px = startX; px < startX + size; px += postSpacing) {
            if (px > entranceStart && px < entranceEnd) continue;
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.set(px, postH / 2, startZ);
            post.userData.mapGenerated = true;
            this.scene.add(post);
        }

        // Южная сторона
        for (let px = startX; px < startX + size; px += postSpacing) {
            if (px > entranceStart && px < entranceEnd) continue;
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.set(px, postH / 2, startZ + size);
            post.userData.mapGenerated = true;
            this.scene.add(post);
        }

        // Западная сторона
        for (let pz = startZ; pz < startZ + size; pz += postSpacing) {
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.set(startX, postH / 2, pz);
            post.userData.mapGenerated = true;
            this.scene.add(post);
        }

        // Восточная сторона
        for (let pz = startZ; pz < startZ + size; pz += postSpacing) {
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.set(startX + size, postH / 2, pz);
            post.userData.mapGenerated = true;
            this.scene.add(post);
        }

        // Проволока между столбами (горизонтальные линии)
        const wireHeight = [0.8, 1.5, 2.2];
        for (let h of wireHeight) {
            // Север
            const nPoints = [];
            for (let px = startX; px < startX + size; px += postSpacing) {
                if (px > entranceStart && px < entranceEnd) {
                    nPoints.push(null);
                    continue;
                }
                nPoints.push(new THREE.Vector3(px, h, startZ));
            }
            for (let i = 0; i < nPoints.length - 1; i++) {
                if (nPoints[i] && nPoints[i + 1]) {
                    const wireGeo = this.pool.getGeoCylinder(0.02, 0.02, nPoints[i].distanceTo(nPoints[i + 1]), 4);
                    const wire = new THREE.Mesh(wireGeo, wireMat);
                    wire.position.set((nPoints[i].x + nPoints[i + 1].x) / 2, h, startZ);
                    wire.rotation.z = Math.PI / 2;
                    wire.userData.mapGenerated = true;
                    this.scene.add(wire);
                }
            }

            // Юг
            const sPoints = [];
            for (let px = startX; px < startX + size; px += postSpacing) {
                if (px > entranceStart && px < entranceEnd) {
                    sPoints.push(null);
                    continue;
                }
                sPoints.push(new THREE.Vector3(px, h, startZ + size));
            }
            for (let i = 0; i < sPoints.length - 1; i++) {
                if (sPoints[i] && sPoints[i + 1]) {
                    const wireGeo = this.pool.getGeoCylinder(0.02, 0.02, sPoints[i].distanceTo(sPoints[i + 1]), 4);
                    const wire = new THREE.Mesh(wireGeo, wireMat);
                    wire.position.set((sPoints[i].x + sPoints[i + 1].x) / 2, h, startZ + size);
                    wire.rotation.z = Math.PI / 2;
                    wire.userData.mapGenerated = true;
                    this.scene.add(wire);
                }
            }

            // Запад
            for (let pz = startZ; pz < startZ + size; pz += postSpacing) {
                const wireGeo = this.pool.getGeoCylinder(0.02, 0.02, postSpacing);
                const wire = new THREE.Mesh(wireGeo, wireMat);
                wire.position.set(startX, h, pz + postSpacing / 2);
                wire.rotation.z = Math.PI / 2;
                wire.userData.mapGenerated = true;
                this.scene.add(wire);
            }

            // Восток
            for (let pz = startZ; pz < startZ + size; pz += postSpacing) {
                const wireGeo = this.pool.getGeoCylinder(0.02, 0.02, postSpacing);
                const wire = new THREE.Mesh(wireGeo, wireMat);
                wire.position.set(startX + size, h, pz + postSpacing / 2);
                wire.rotation.z = Math.PI / 2;
                wire.userData.mapGenerated = true;
                this.scene.add(wire);
            }
        }

        // Колючие шипы на проволоке
        const spikeMat = this.pool.getMatStd(0x999999, 0.3, 0.7, false, false, 1, 0, 0);
        for (let i = 0; i < 8; i++) {
            const side = Math.floor(this._rand() * 4);
            let sx, sz;
            if (side === 0) { sx = startX + this._rand() * size; sz = startZ; }
            else if (side === 1) { sx = startX + this._rand() * size; sz = startZ + size; }
            else if (side === 2) { sx = startX; sz = startZ + this._rand() * size; }
            else { sx = startX + size; sz = startZ + this._rand() * size; }

            const spikeGeo = this.pool.getGeoCone(0.15, 0.5);
            const spike = new THREE.Mesh(spikeGeo, spikeMat);
            spike.position.set(sx, 1.5 + this._rand(), sz);
            spike.rotation.x = Math.PI;
            spike.userData.mapGenerated = true;
            this.scene.add(spike);
        }
    }

    _addCzechHedgehog(x, z) {
        const mat = this.pool.getMatStd(0x4a5238, 0.6, 0.4, false, false, 1, 0, 0);

        const hedgehog = new THREE.Group();
        const beamLen = 2;
        const beamR = 0.15;

        // 3 скрещенные балки
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI;
            const beamGeo = this.pool.getGeoCylinder(beamR, beamR, beamLen);
            const beam = new THREE.Mesh(beamGeo, mat);
            beam.position.set(
                Math.cos(angle) * beamLen / 2,
                beamLen / 2,
                Math.sin(angle) * beamLen / 2
            );
            beam.rotation.z = Math.PI / 2;
            beam.rotation.y = angle;
            beam.userData.mapGenerated = true;
            hedgehog.add(beam);
        }

        hedgehog.position.set(x, 0, z);
        hedgehog.userData.mapGenerated = true;
        this.scene.add(hedgehog);

        this.addColliderBox(
            new THREE.Vector3(x, beamLen / 2, z),
            beamLen, beamLen, beamLen, false
        );
    }

    _addDestroyedTank(x, z) {
        const tank = new THREE.Group();
        const hullMat = this.pool.getMatStd(0x54624a, 0.7, 0.3, false, false, 1, 0, 0);

        // Корпус (разрушенный)
        const hullGeo = this.pool.getGeoBox(6.5, 2.6, 9);
        const hull = new THREE.Mesh(hullGeo, hullMat);
        hull.userData.mapGenerated = true;
        hull.position.y = 1.8;
        hull.rotation.z = (this._rand() - 0.5) * 0.1;
        tank.add(hull);

        // Башня (сломана)
        const turretGeo = this.pool.getGeoBox(3.8, 1.9, 4.2);
        const turretMat = this.pool.getMatStd(0x4a5a3a, 0.6, 0.4, false, false, 1, 0, 0);
        const turret = new THREE.Mesh(turretGeo, turretMat);
        turret.userData.mapGenerated = true;
        turret.position.set(0, 4, -0.6);
        turret.rotation.z = (this._rand() - 0.5) * 0.3;
        turret.rotation.y = this._rand() * 0.5;
        tank.add(turret);

        // Дуло (поломанное)
        const barrelGeo = this.pool.getGeoCylinder(0.3, 0.42, 6.5);
        const barrel = new THREE.Mesh(barrelGeo, turretMat);
        barrel.userData.mapGenerated = true;
        barrel.rotation.x = Math.PI / 2 + (this._rand() - 0.5) * 0.3;
        barrel.position.set(0, 4, -4.7);
        tank.add(barrel);

        // Гусеницы (одна может быть сломана)
        for (let side of [-1, 1]) {
            const trackGeo = this.pool.getGeoBox(1.25, 1.25, 9.8);
            const trackMat = this.pool.getMatStd(0x3d3d3d, 0.9, 0, false, false, 1, 0, 0);
            const track = new THREE.Mesh(trackGeo, trackMat);
            track.userData.mapGenerated = true;
            track.position.set(side * 3.35, 0.63, 0);
            if (side === -1 && this._rand() > 0.5) {
                track.rotation.z = 0.2;
                track.position.y = 0.2;
            }
            tank.add(track);
        }

        // Огненный шар/дым на танке
        const fireGeo = this.pool.getGeoSphere(0.8);
        const fireMat = this.pool.getMatStd(0xff6600, 0.9, 0, false, true, 0.7, 0xff4400, 0.5);
        const fire = new THREE.Mesh(fireGeo, fireMat);
        fire.position.set(0, 5.2, 0);
        fire.userData.mapGenerated = true;
        tank.add(fire);

        tank.position.set(x, 0, z);
        tank.rotation.y = this._rand() * Math.PI * 2;
        tank.userData.mapGenerated = true;
        this.scene.add(tank);

        this.addColliderBox(
            new THREE.Vector3(x, 2.8, z),
            8, 5.6, 10.5, false
        );
    }

    _addTrench(x, z, length) {
        const trenchMat = this.pool.getMatStd(0x3d3528, 0.95, 0, true, false, 1, 0, 0);

        // Дно окопа
        const bottomGeo = this.pool.getGeoBox(3, 0.1, length);
        const bottom = new THREE.Mesh(bottomGeo, trenchMat);
        bottom.position.set(x, 0.15, z);
        bottom.userData.mapGenerated = true;
        this.scene.add(bottom);

        // Стенки окопа
        for (let side of [-1, 1]) {
            const wallGeo = this.pool.getGeoBox(0.3, 1, length);
            const wall = new THREE.Mesh(wallGeo, trenchMat);
            wall.position.set(x + side * 1.5, 0.5, z);
            wall.userData.mapGenerated = true;
            this.scene.add(wall);
        }

        // Повернутый окоп (перпендикулярно)
        const bottom2Geo = this.pool.getGeoBox(length, 0.1, 3);
        const bottom2 = new THREE.Mesh(bottom2Geo, trenchMat);
        bottom2.position.set(x + length / 2, 0.15, z + length / 2);
        bottom2.userData.mapGenerated = true;
        this.scene.add(bottom2);

        for (let side of [-1, 1]) {
            const wallGeo = this.pool.getGeoBox(length, 1, 0.3);
            const wall = new THREE.Mesh(wallGeo, trenchMat);
            wall.position.set(x + length / 2, 0.5, z + length / 2 + side * 1.5);
            wall.userData.mapGenerated = true;
            this.scene.add(wall);
        }
    }

    _addSandbagBunker(x, z) {
        const mat = this.pool.getMatStd(0x9e8e6e, 0.95, 0, true, false, 1, 0, 0);

        const bunker = new THREE.Group();
        const bagW = 0.6;
        const bagH = 0.35;
        const bagD = 0.4;

        // U-образное укрытие
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 2; j++) {
                const bagGeo = this.pool.getGeoBox(bagW, bagH, bagD);
                const bag = new THREE.Mesh(bagGeo, mat);
                bag.position.set(i * bagW, j * bagH + bagH / 2, 0);
                bag.userData.mapGenerated = true;
                bunker.add(bag);
            }
        }

        // Боковые стенки
        for (let j = 0; j < 2; j++) {
            for (let k = 0; k < 3; k++) {
                const bagGeo = this.pool.getGeoBox(bagW, bagH, bagD);
                const bag = new THREE.Mesh(bagGeo, mat);
                bag.position.set(0, j * bagH + bagH / 2, k * bagD);
                bag.userData.mapGenerated = true;
                bunker.add(bag);

                const bag2 = new THREE.Mesh(bagGeo, mat);
                bag2.position.set(3 * bagW, j * bagH + bagH / 2, k * bagD);
                bag2.userData.mapGenerated = true;
                bunker.add(bag2);
            }
        }

        bunker.position.set(x, 0, z);
        bunker.userData.mapGenerated = true;
        this.scene.add(bunker);
        this._registerChestSpot(x + bagW * 1.5, z + bagD * 1.5, 'military');

        this.addColliderBox(
            new THREE.Vector3(x, 0.5, z),
            4 * bagW, 1.2, 3 * bagD, false
        );
    }

    _addThreeStoryApartment(x, z, w = 20, d = 16) {
        const building = new THREE.Group();
        // Soviet-style concrete panel colors - warm gray
        const wallMat = this.pool.getMatStd(0x9e9e96, 0.85, 0, true, false, 1, 0, 0, true);
        const concreteMat = this.pool.getMatStd(0xb0b0a8, 0.9, 0, true, false, 1, 0, 0);
        const doorMat = this.pool.getMatStd(0x4a3525, 0.8, 0, false, false, 1, 0, 0, true);

        const width = w;
        const depth = d;
        const floorH = 5;

        // Пол первого этажа
        const floor1Geo = this.pool.getGeoBox(width, 0.3, depth);
        const floor1 = new THREE.Mesh(floor1Geo, concreteMat);
        floor1.position.set(0, 0.15, 0);
        floor1.userData.mapGenerated = true;
        floor1.userData.walkable = true;
        building.add(floor1);
        this.addColliderBox(new THREE.Vector3(x, 0.15, z), width, 0.3, depth, true);

        // Стены первого этажа (с разрушениями)
        const wallThick = 0.5;
        // Левая стена
        const leftWallGeo = this.pool.getGeoBox(wallThick, floorH, depth);
        const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
        leftWall.position.set(-width / 2, floorH / 2 + 0.3, 0);
        leftWall.userData.mapGenerated = true;
        building.add(leftWall);
        this.addColliderBox(new THREE.Vector3(x - width / 2, floorH / 2 + 0.3, z), wallThick, floorH, depth, false);

        // Правая стена (с дырой)
        const rightWallBack = this.pool.getGeoBox(wallThick, floorH, depth * 0.4);
        const rightWallFront = this.pool.getGeoBox(wallThick, floorH, depth * 0.3);
        const rwBack = new THREE.Mesh(rightWallBack, wallMat);
        rwBack.position.set(width / 2, floorH / 2 + 0.3, -depth * 0.3);
        rwBack.userData.mapGenerated = true;
        building.add(rwBack);
        this.addColliderBox(new THREE.Vector3(x + width / 2, floorH / 2 + 0.3, z - depth * 0.3), wallThick, floorH, depth * 0.4, false);

        const rwFront = new THREE.Mesh(rightWallFront, wallMat);
        rwFront.position.set(width / 2, floorH / 2 + 0.3, depth * 0.35);
        rwFront.userData.mapGenerated = true;
        building.add(rwFront);
        this.addColliderBox(new THREE.Vector3(x + width / 2, floorH / 2 + 0.3, z + depth * 0.35), wallThick, floorH, depth * 0.3, false);

        // Задняя стена
        const backWallGeo = this.pool.getGeoBox(width, floorH, wallThick);
        const backWall = new THREE.Mesh(backWallGeo, wallMat);
        backWall.position.set(0, floorH / 2 + 0.3, -depth / 2);
        backWall.userData.mapGenerated = true;
        building.add(backWall);
        this.addColliderBox(new THREE.Vector3(x, floorH / 2 + 0.3, z - depth / 2), width, floorH, wallThick, false);

        // Передняя стена с дверью
        const doorW = 2;
        const doorH = 2.8;
        const frontLeftW = width / 2 - doorW / 2 - 2;
        const frontRightW = width / 2 - doorW / 2 - 2;

        const frontLeftGeo = this.pool.getGeoBox(frontLeftW, floorH, wallThick);
        const frontLeft = new THREE.Mesh(frontLeftGeo, wallMat);
        frontLeft.position.set(-width / 2 + frontLeftW / 2, floorH / 2 + 0.3, depth / 2);
        frontLeft.userData.mapGenerated = true;
        building.add(frontLeft);
        this.addColliderBox(new THREE.Vector3(x - width / 2 + frontLeftW / 2, floorH / 2 + 0.3, z + depth / 2), frontLeftW, floorH, wallThick, false);

        const frontRightGeo = this.pool.getGeoBox(frontRightW, floorH, wallThick);
        const frontRight = new THREE.Mesh(frontRightGeo, wallMat);
        frontRight.position.set(width / 2 - frontRightW / 2, floorH / 2 + 0.3, depth / 2);
        frontRight.userData.mapGenerated = true;
        building.add(frontRight);
        this.addColliderBox(new THREE.Vector3(x + width / 2 - frontRightW / 2, floorH / 2 + 0.3, z + depth / 2), frontRightW, floorH, wallThick, false);

        const frontTopGeo = this.pool.getGeoBox(width, floorH - doorH - 0.5, wallThick);
        const frontTop = new THREE.Mesh(frontTopGeo, wallMat);
        frontTop.position.set(0, doorH + (floorH - doorH - 0.5) / 2 + 0.3, depth / 2);
        frontTop.userData.mapGenerated = true;
        building.add(frontTop);
        this.addColliderBox(new THREE.Vector3(x, doorH + (floorH - doorH - 0.5) / 2 + 0.3, z + depth / 2), width, floorH - doorH - 0.5, wallThick, false);

        // Дверь
        const doorGeo = this.pool.getGeoBox(doorW, doorH, 0.1);
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, doorH / 2 + 0.3, depth / 2 + 0.05);
        door.userData.mapGenerated = true;
        building.add(door);

        // Окна первого этажа
        const winMat = this.pool.getMatStd(0x333333, 0.5, 0.2, false, false, 1, 0, 0);
        for (let i = 0; i < 3; i++) {
            const winGeo = this.pool.getGeoBox(0.1, 1.5, 1.5);
            const win = new THREE.Mesh(winGeo, winMat);
            win.position.set(-width / 2 + 0.05, 2 + 0.3, -depth / 4 + i * depth / 4);
            win.userData.mapGenerated = true;
            building.add(win);
        }

        // Пол второго этажа (с провалами)
        const floor2LeftGeo = this.pool.getGeoBox(width / 2, 0.3, depth);
        const floor2Left = new THREE.Mesh(floor2LeftGeo, concreteMat);
        floor2Left.position.set(-width / 4, floorH + 0.15, 0);
        floor2Left.userData.mapGenerated = true;
        floor2Left.userData.walkable = true;
        building.add(floor2Left);
        this.addColliderBox(new THREE.Vector3(x - width / 4, floorH + 0.15, z), width / 2, 0.3, depth, true);

        const floor2RightGeo = this.pool.getGeoBox(width / 2 - 2, 0.3, depth);
        const floor2Right = new THREE.Mesh(floor2RightGeo, concreteMat);
        floor2Right.position.set(width / 4 + 1, floorH + 0.15, 0);
        floor2Right.userData.mapGenerated = true;
        floor2Right.userData.walkable = true;
        building.add(floor2Right);
        this.addColliderBox(new THREE.Vector3(x + width / 4 + 1, floorH + 0.15, z), width / 2 - 2, 0.3, depth, true);

        // Стены второго этажа
        const leftWall2Geo = this.pool.getGeoBox(wallThick, floorH, depth);
        const leftWall2 = new THREE.Mesh(leftWall2Geo, wallMat);
        leftWall2.position.set(-width / 2, floorH + floorH / 2 + 0.3, 0);
        leftWall2.userData.mapGenerated = true;
        building.add(leftWall2);
        this.addColliderBox(new THREE.Vector3(x - width / 2, floorH + floorH / 2 + 0.3, z), wallThick, floorH, depth, false);

        // Правая стена 2 этажа (разрушена)
        const rightWall2Geo = this.pool.getGeoBox(wallThick, floorH, depth * 0.6);
        const rightWall2 = new THREE.Mesh(rightWall2Geo, wallMat);
        rightWall2.position.set(width / 2, floorH + floorH / 2 + 0.3, -depth * 0.2);
        rightWall2.userData.mapGenerated = true;
        building.add(rightWall2);
        this.addColliderBox(new THREE.Vector3(x + width / 2, floorH + floorH / 2 + 0.3, z - depth * 0.2), wallThick, floorH, depth * 0.6, false);

        // Задняя стена 2 этажа
        const backWall2Geo = this.pool.getGeoBox(width, floorH, wallThick);
        const backWall2 = new THREE.Mesh(backWall2Geo, wallMat);
        backWall2.position.set(0, floorH + floorH / 2 + 0.3, -depth / 2);
        backWall2.userData.mapGenerated = true;
        building.add(backWall2);
        this.addColliderBox(new THREE.Vector3(x, floorH + floorH / 2 + 0.3, z - depth / 2), width, floorH, wallThick, false);

        // Передняя стена 2 этажа с проемом
        const front2LeftGeo = this.pool.getGeoBox(width / 3, floorH, wallThick);
        const front2Left = new THREE.Mesh(front2LeftGeo, wallMat);
        front2Left.position.set(-width / 3, floorH + floorH / 2 + 0.3, depth / 2);
        front2Left.userData.mapGenerated = true;
        building.add(front2Left);
        this.addColliderBox(new THREE.Vector3(x - width / 3, floorH + floorH / 2 + 0.3, z + depth / 2), width / 3, floorH, wallThick, false);

        const front2RightGeo = this.pool.getGeoBox(width / 3, floorH, wallThick);
        const front2Right = new THREE.Mesh(front2RightGeo, wallMat);
        front2Right.position.set(width / 3, floorH + floorH / 2 + 0.3, depth / 2);
        front2Right.userData.mapGenerated = true;
        building.add(front2Right);
        this.addColliderBox(new THREE.Vector3(x + width / 3, floorH + floorH / 2 + 0.3, z + depth / 2), width / 3, floorH, wallThick, false);

        // Окна 2 этажа
        for (let i = 0; i < 2; i++) {
            const winGeo = this.pool.getGeoBox(0.1, 1.5, 1.5);
            const win = new THREE.Mesh(winGeo, winMat);
            win.position.set(-width / 2 + 0.05, floorH + 2 + 0.3, -depth / 4 + i * depth / 3);
            win.userData.mapGenerated = true;
            building.add(win);
        }

        // Пол третьего этажа
        const floor3Geo = this.pool.getGeoBox(width - 2, 0.3, depth);
        const floor3 = new THREE.Mesh(floor3Geo, concreteMat);
        floor3.position.set(1, floorH * 2 + 0.15, 0);
        floor3.userData.mapGenerated = true;
        floor3.userData.walkable = true;
        building.add(floor3);
        this.addColliderBox(new THREE.Vector3(x + 1, floorH * 2 + 0.15, z), width - 2, 0.3, depth, true);

        // Стены третьего этажа (сильно разрушены)
        const leftWall3Geo = this.pool.getGeoBox(wallThick, floorH, depth * 0.7);
        const leftWall3 = new THREE.Mesh(leftWall3Geo, wallMat);
        leftWall3.position.set(-width / 2, floorH * 2 + floorH / 2 + 0.3, -depth * 0.15);
        leftWall3.userData.mapGenerated = true;
        building.add(leftWall3);
        this.addColliderBox(new THREE.Vector3(x - width / 2, floorH * 2 + floorH / 2 + 0.3, z - depth * 0.15), wallThick, floorH, depth * 0.7, false);

        const rightWall3Geo = this.pool.getGeoBox(wallThick, floorH, depth * 0.5);
        const rightWall3 = new THREE.Mesh(rightWall3Geo, wallMat);
        rightWall3.position.set(width / 2, floorH * 2 + floorH / 2 + 0.3, -depth * 0.25);
        rightWall3.userData.mapGenerated = true;
        building.add(rightWall3);
        this.addColliderBox(new THREE.Vector3(x + width / 2, floorH * 2 + floorH / 2 + 0.3, z - depth * 0.25), wallThick, floorH, depth * 0.5, false);

        // Задняя стена 3 этажа
        const backWall3Geo = this.pool.getGeoBox(width, floorH, wallThick);
        const backWall3 = new THREE.Mesh(backWall3Geo, wallMat);
        backWall3.position.set(0, floorH * 2 + floorH / 2 + 0.3, -depth / 2);
        backWall3.userData.mapGenerated = true;
        building.add(backWall3);
        this.addColliderBox(new THREE.Vector3(x, floorH * 2 + floorH / 2 + 0.3, z - depth / 2), width, floorH, wallThick, false);

        // Крыша (разрушенная) с деталями
        const roofGeo = this.pool.getGeoBox(width - 1, 0.3, depth - 1);
        const roof = new THREE.Mesh(roofGeo, concreteMat);
        roof.position.set(0, floorH * 3 + 0.3, 0);
        roof.userData.mapGenerated = true;
        building.add(roof);

        // Дымоходы на крыше
        for (let ch = 0; ch < 4; ch++) {
            const chimneyH = 2 + this._rand() * 2;
            const chimneyGeo = this.pool.getGeoBox(1.5, chimneyH, 1.5);
            const chimneyMat = this.pool.getMatStd(0x666655, 0.9, 0, false, false, 1, 0, 0);
            const chimney = new THREE.Mesh(chimneyGeo, chimneyMat);
            chimney.position.set(
                -width / 4 + ch * (width / 6),
                floorH * 3 + 0.3 + chimneyH / 2,
                -depth / 4 + this._rand() * 5
            );
            chimney.userData.mapGenerated = true;
            building.add(chimney);
        }

        // Вентиляции на крыше
        for (let v = 0; v < 3; v++) {
            const ventGeo = this.pool.getGeoBox(2, 1.5, 2);
            const ventMat = this.pool.getMatStd(0x777766, 0.8, 0, false, false, 1, 0, 0);
            const vent = new THREE.Mesh(ventGeo, ventMat);
            vent.position.set(
                width / 4 + this._rand() * 5,
                floorH * 3 + 0.3 + 0.75,
                depth / 4 + this._rand() * 5
            );
            vent.userData.mapGenerated = true;
            building.add(vent);
        }

        // Балконы на фасадах
        const balconyMat = this.pool.getMatStd(0x888877, 0.85, 0, false, false, 1, 0, 0);
        for (let floor = 0; floor < 3; floor++) {
            for (let b = 0; b < 4; b++) {
                const balconyGeo = this.pool.getGeoBox(3, 0.2, 1.5);
                const balcony = new THREE.Mesh(balconyGeo, balconyMat);
                balcony.position.set(
                    -width / 3 + b * (width / 5),
                    floor * floorH + 2.5 + 0.3,
                    depth / 2 + 0.75
                );
                balcony.userData.mapGenerated = true;
                building.add(balcony);
                // Перила балкона
                const railGeo = this.pool.getGeoBox(3, 1, 0.1);
                const rail = new THREE.Mesh(railGeo, balconyMat);
                rail.position.set(
                    -width / 3 + b * (width / 5),
                    floor * floorH + 2.5 + 0.3 + 0.5,
                    depth / 2 + 1.4
                );
                rail.userData.mapGenerated = true;
                building.add(rail);
            }
        }

        // Окна на всех этажах и стенах
        for (let floor = 0; floor < 3; floor++) {
            for (let i = 0; i < 6; i++) {
                // Передняя стена
                const winF = this.pool.getGeoBox(1.5, 2, 0.1);
                const winMeshF = new THREE.Mesh(winF, winMat);
                winMeshF.position.set(
                    -width / 3 + i * (width / 6),
                    floor * floorH + 2.5 + 0.3,
                    depth / 2 + 0.05
                );
                winMeshF.userData.mapGenerated = true;
                building.add(winMeshF);
                // Задняя стена
                const winB = new THREE.Mesh(winF, winMat);
                winB.position.set(
                    -width / 3 + i * (width / 6),
                    floor * floorH + 2.5 + 0.3,
                    -depth / 2 - 0.05
                );
                winB.userData.mapGenerated = true;
                building.add(winB);
            }
        }

        // Квартиры (внутри дома) - перегородки
        // 1 этаж: 2 квартиры
        const partition1Geo = this.pool.getGeoBox(wallThick, floorH - 0.5, depth - 1);
        const partition1 = new THREE.Mesh(partition1Geo, wallMat);
        partition1.position.set(0, floorH / 2 + 0.3, 0);
        partition1.userData.mapGenerated = true;
        building.add(partition1);
        this.addColliderBox(new THREE.Vector3(x, floorH / 2 + 0.3, z), wallThick, floorH - 0.5, depth - 1, false);

        // 2 этаж: перегородки
        const partition2Geo = this.pool.getGeoBox(wallThick, floorH - 0.5, depth - 2);
        const partition2 = new THREE.Mesh(partition2Geo, wallMat);
        partition2.position.set(-width / 4, floorH + floorH / 2 + 0.3, 0);
        partition2.userData.mapGenerated = true;
        building.add(partition2);
        this.addColliderBox(new THREE.Vector3(x - width / 4, floorH + floorH / 2 + 0.3, z), wallThick, floorH - 0.5, depth - 2, false);

        // 3 этаж: перегородки
        const partition3Geo = this.pool.getGeoBox(wallThick, floorH - 0.5, depth * 0.6);
        const partition3 = new THREE.Mesh(partition3Geo, wallMat);
        partition3.position.set(2, floorH * 2 + floorH / 2 + 0.3, -depth * 0.2);
        partition3.userData.mapGenerated = true;
        building.add(partition3);
        this.addColliderBox(new THREE.Vector3(x + 2, floorH * 2 + floorH / 2 + 0.3, z - depth * 0.2), wallThick, floorH - 0.5, depth * 0.6, false);

        // Сундуки (лут) в квартирах
        const chestMat = this.pool.getMatStd(0x8B4513, 0.7, 0, true, false, 1, 0, 0);
        const chestGeo = this.pool.getGeoBox(1, 0.7, 0.7);

        // 1 этаж, квартира 1
        const chest1 = new THREE.Mesh(chestGeo, chestMat);
        chest1.position.set(-width / 4, 0.7, -depth / 4);
        chest1.userData.mapGenerated = true;
        building.add(chest1);
        this.addColliderBox(new THREE.Vector3(x - width / 4, 0.7, z - depth / 4), 1, 0.7, 0.7, false);

        // 1 этаж, квартира 2
        const chest2 = new THREE.Mesh(chestGeo, chestMat);
        chest2.position.set(width / 4, 0.7, depth / 4);
        chest2.userData.mapGenerated = true;
        building.add(chest2);
        this.addColliderBox(new THREE.Vector3(x + width / 4, 0.7, z + depth / 4), 1, 0.7, 0.7, false);

        // 2 этаж
        const chest3 = new THREE.Mesh(chestGeo, chestMat);
        chest3.position.set(-width / 3, floorH + 0.7, -depth / 3);
        chest3.userData.mapGenerated = true;
        building.add(chest3);
        this.addColliderBox(new THREE.Vector3(x - width / 3, floorH + 0.7, z - depth / 3), 1, 0.7, 0.7, false);

        // 3 этаж
        const chest4 = new THREE.Mesh(chestGeo, chestMat);
        chest4.position.set(3, floorH * 2 + 0.7, -depth / 3);
        chest4.userData.mapGenerated = true;
        building.add(chest4);
        this.addColliderBox(new THREE.Vector3(x + 3, floorH * 2 + 0.7, z - depth / 3), 1, 0.7, 0.7, false);

        building.position.set(x, 0, z);
        building.userData.mapGenerated = true;
        this.scene.add(building);
    }

    _addRuinedBuilding(x, z) {
        // Medium ruined building
        const w = 12 + this._rand() * 8;
        const d = 10 + this._rand() * 6;
        const h = 8 + this._rand() * 6;

        const buildingMat = this.pool.getMatStd(COLORS.militaryBuilding, 0.75, 0, true, false, 1, 0, 0);
        const wallMat = this.pool.getMatStd(COLORS.militaryRuined, 0.85, 0, true, false, 1, 0, 0, true);

        // Solid floor
        const floorGeo = this.pool.getGeoBox(w, 1, d);
        const floor = new THREE.Mesh(floorGeo, buildingMat);
        floor.position.set(x, 0.5, z);
        floor.userData.mapGenerated = true;
        this.scene.add(floor);

        // Walls
        const wallThick = 0.5;
        for (let side of [-1, 1]) {
            const sideGeo = this.pool.getGeoBox(wallThick, h, d);
            const sideWall = new THREE.Mesh(sideGeo, wallMat);
            sideWall.position.set(x + side * w / 2, h / 2, z);
            sideWall.userData.mapGenerated = true;
            this.scene.add(sideWall);
            this.addColliderBox(
                new THREE.Vector3(x + side * w / 2, h / 2, z),
                wallThick, h, d, false
            );
        }

        const frontGeo = this.pool.getGeoBox(w, h, wallThick);
        const front = new THREE.Mesh(frontGeo, wallMat);
        front.position.set(x, h / 2, z + d / 2);
        front.userData.mapGenerated = true;
        this.scene.add(front);
        this.addColliderBox(new THREE.Vector3(x, h / 2, z + d / 2), w, h, wallThick, false);

        const back = new THREE.Mesh(frontGeo, wallMat);
        back.position.set(x, h / 2, z - d / 2);
        back.userData.mapGenerated = true;
        this.scene.add(back);
        this.addColliderBox(new THREE.Vector3(x, h / 2, z - d / 2), w, h, wallThick, false);

        // Partial roof (ruined)
        const roofGeo = this.pool.getGeoBox(w - 1, 0.3, d - 1);
        const roof = new THREE.Mesh(roofGeo, buildingMat);
        roof.position.set(x, h, z);
        roof.userData.mapGenerated = true;
        this.scene.add(roof);

        this._buildings.push({ x, z, w, d, template: { type: 'military_building' } });
    }

    _addMilitaryTank(x, z) {
        const tank = new THREE.Group();
        const hullMat = this.pool.getMatStd(COLORS.militaryTank, 0.6, 0.4, false, false, 1, 0, 0);

        // Medium hull
        const hullGeo = this.pool.getGeoBox(7, 2.8, 10);
        const hull = new THREE.Mesh(hullGeo, hullMat);
        hull.userData.mapGenerated = true;
        hull.position.y = 2.2;
        tank.add(hull);

        // Turret
        const turretGeo = this.pool.getGeoCylinder(2.1, 2.7, 2.2);
        const turretMat = this.pool.getMatStd(0x54624a, 0.5, 0.5, false, false, 1, 0, 0);
        const turret = new THREE.Mesh(turretGeo, turretMat);
        turret.userData.mapGenerated = true;
        turret.position.set(0, 5, 0);
        tank.add(turret);

        // Barrel
        const barrelGeo = this.pool.getGeoCylinder(0.34, 0.48, 8);
        const barrelMat = this.pool.getMatStd(0x3d4a2f, 0.4, 0.7, false, false, 1, 0, 0);
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.userData.mapGenerated = true;
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 5, -5.2);
        tank.add(barrel);

        // Tracks
        for (let side of [-1, 1]) {
            const trackGeo = this.pool.getGeoBox(1.4, 1.5, 10.8);
            const trackMat = this.pool.getMatStd(COLORS.militaryTread, 0.9, 0, false, false, 1, 0, 0);
            const track = new THREE.Mesh(trackGeo, trackMat);
            track.userData.mapGenerated = true;
            track.position.set(side * 3.2, 0.75, 0);
            tank.add(track);
        }

        tank.position.set(x, 0, z);
        tank.rotation.y = this._rand() * Math.PI * 2;
        tank.userData.mapGenerated = true;
        this.scene.add(tank);

        this.addColliderBox(
            new THREE.Vector3(x, 3, z),
            8, 6, 12, false
        );
    }

    _addMilitaryFences(startX, startZ, size) {
        const fenceMat = this.pool.getMatStd(0x4a5238, 0.9, 0, false, false, 1, 0, 0);

        // Perimeter fence posts
        const postGeo = this.pool.getGeoBox(0.15, 2.5, 0.15);
        for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * Math.PI * 2;
            const r = size * 0.45;
            const px = startX + r * Math.cos(angle);
            const pz = startZ + r * Math.sin(angle);

            const post = new THREE.Mesh(postGeo, fenceMat);
            post.position.set(px, 1.25, pz);
            post.userData.mapGenerated = true;
            this.scene.add(post);
        }

        // Barbed wire between posts
        const wireMat = new THREE.LineBasicMaterial({ color: 0x666666 });
        for (let i = 0; i < 24; i++) {
            const angle1 = (i / 24) * Math.PI * 2;
            const angle2 = ((i + 1) / 24) * Math.PI * 2;
            const r = size * 0.45;

            const x1 = startX + r * Math.cos(angle1);
            const z1 = startZ + r * Math.sin(angle1);
            const x2 = startX + r * Math.cos(angle2);
            const z2 = startZ + r * Math.sin(angle2);

            const wireGeo = new THREE.BufferGeometry();
            wireGeo.setAttribute('position', new THREE.Float32BufferAttribute([
                x1, 2.3, z1, x2, 2.3, z2
            ], 3));

            const wireLine = new THREE.Line(wireGeo, wireMat);
            wireLine.userData.mapGenerated = true;
            this.scene.add(wireLine);
        }
    }

    _addSandbagBarrier(x, z) {
        const mat = this.pool.getMatStd(0x9e9e9e, 0.95, 0, true, false, 1, 0, 0);

        // L-shape sandbag wall
        for (let i = 0; i < 3; i++) {
            const bagGeo = this.pool.getGeoBox(0.5, 0.3, 0.35);
            const bag = new THREE.Mesh(bagGeo, mat);
            bag.position.set(x + i * 0.55, 0.15, z);
            bag.userData.mapGenerated = true;
            this.scene.add(bag);
            this.addColliderBox(
                new THREE.Vector3(x + i * 0.55, 0.15, z),
                0.5, 0.3, 0.35, false
            );
        }
        for (let i = 0; i < 2; i++) {
            const bagGeo = this.pool.getGeoBox(0.5, 0.3, 0.35);
            const bag = new THREE.Mesh(bagGeo, mat);
            bag.position.set(x, 0.15, z + (i + 1) * 0.55);
            bag.userData.mapGenerated = true;
            this.scene.add(bag);
        }

        // Visual only — no spawn tile
    }

    _addMilitaryCrate(x, z) {
        // Massive military crate — grand scale
        const size = 2.5 + this._rand() * 1.5;
        const geo = this.pool.getGeoBox(size, size, size);
        const mat = this.pool.getMatStd(0x6d4c41, 0.8, 0, true, false, 1, 0, 0);
        const crate = new THREE.Mesh(geo, mat);
        crate.position.set(x, size / 2, z);
        crate.rotation.y = this._rand() * Math.PI;
        crate.userData.mapGenerated = true;
        this.scene.add(crate);
        this.addColliderBox(
            new THREE.Vector3(x, size / 2, z),
            size, size, size, false
        );

        // Visual only — no spawn tile
    }

    // =========================================================================
    // ICE/SNOW QUADRANT (SE: x > 0, z > 0)
    // =========================================================================
    _generateIceQuadrant() {
        // ЮВ квадрант: x в [10, 256], z в [10, 256]
        const iceFloorMat = this.pool.getMatStd(0xddeeff, 0.8, 0, true, false, 1, 0, 0);
        const iceFloorGeo = this.pool.getGeoBox(246, 0.3, 246);
        const iceFloor = new THREE.Mesh(iceFloorGeo, iceFloorMat);
        iceFloor.position.set(133, -0.15, 133); // top surface at Y=0
        iceFloor.userData.mapGenerated = true;
        this.scene.add(iceFloor);

        // ---- СТУПЕНЧАТОЕ КВАДРАТНОЕ ОЗЕРО (как в референсе) ----
        this._generateSteppedIceLake(130, 130);

        // Снежные дюны — больше
        for (let drift = 0; drift < 6; drift++) {
            const driftW = 8 + this._rand() * 12;
            const driftH = 2 + this._rand() * 4;
            const driftD = 6 + this._rand() * 10;
            const driftGeo = this.pool.getGeoSphere(driftW);
            const driftMat = this.pool.getMatStd(0xeef4ff, 0.9, 0, true, false, 1, 0, 0);
            const driftMesh = new THREE.Mesh(driftGeo, driftMat);
            driftMesh.position.set(15 + this._rand() * 230, 0, 15 + this._rand() * 230);
            driftMesh.scale.set(1, driftH / driftW, driftD / driftW);
            driftMesh.userData.mapGenerated = true;
            this.scene.add(driftMesh);
            this.addColliderBox(new THREE.Vector3(driftMesh.position.x, driftH / 2, driftMesh.position.z), driftW * 2, driftH, driftD * 2, true);
        }

        // Иглу — детализированные, ближе к краям как в референсе
        const iglooPositions = [
            { x: 210, z: 70 }, { x: 205, z: 205 },
            { x: 130, z: 220 }, { x: 55, z: 205 }
        ];
        for (const pos of iglooPositions) {
            this._addDetailedIgloo(pos.x, pos.z);
        }

        // Ледяные трещины на поверхности озера
        this._addIceCracks(130, 130);

        // Зимний костёр у озера
        this._addIceCampfire(175, 100);

        this._addSnowShelters(10, 10, 236);
        this._addSnowBarrack(60, 58);
        this._addSnowBarrack(205, 166);

        // Крупные ледяные кристаллы по краям
        const crystalPositions = [
            { x: 225, z: 35 }, { x: 225, z: 225 },
            { x: 35, z: 225 }, { x: 35, z: 45 }
        ];
        for (const cp of crystalPositions) {
            this._addIceCrystal(cp.x, cp.z);
            // Несколько мелких рядом
            for (let j = 0; j < 3; j++) {
                this._addIceCrystal(
                    cp.x + (this._rand() - 0.5) * 12,
                    cp.z + (this._rand() - 0.5) * 12
                );
            }
        }

        // Снежные деревья — сгруппированные как в референсе
        for (let i = 0; i < 30; i++) {
            const tx = 12 + this._rand() * 232;
            const tz = 12 + this._rand() * 232;
            // Не ставим деревья прямо в озеро
            const distToLake = Math.sqrt((tx - 130) ** 2 + (tz - 130) ** 2);
            if (distToLake < 55) continue;
            this._addSnowTree(tx, tz);
        }

        // Ледяные стены (остатки стен)
        for (let wall = 0; wall < 6; wall++) {
            const wallW = 3 + this._rand() * 6;
            const wallH = 2 + this._rand() * 3;
            const wallGeo = this.pool.getGeoBox(wallW, wallH, 0.5);
            const wallMat = this.pool.getMatStd(0xccddff, 0.4, 0, false, true, 0.7, 0, 0);
            const wallMesh = new THREE.Mesh(wallGeo, wallMat);
            wallMesh.position.set(15 + this._rand() * 230, wallH / 2, 15 + this._rand() * 230);
            wallMesh.rotation.y = this._rand() * Math.PI;
            wallMesh.userData.mapGenerated = true;
            this.scene.add(wallMesh);
            const c = Math.abs(Math.cos(wallMesh.rotation.y));
            const s = Math.abs(Math.sin(wallMesh.rotation.y));
            this.addColliderBox(wallMesh.position.clone(), wallW * c + 0.5 * s, wallH, wallW * s + 0.5 * c, false);
        }

        // Радиовышка (как в референсе — справа от озера)
        this._addRadioTower(185, 105);

        // Edge trees — dense ice perimeter
        this._addIceEdgeTrees(10, 10, 236);

        // Snow piles around igloos
        this._addIceSnowPiles(10, 10, 236);

        // POI items in ice zone
        this._addIcePOI(10, 10, 236);

        // Path from ice to center
        this._addIceToCenterPath(100, 100);

        // Falling snow particles
        this._addSnowParticles();
    }

    // =========================================================================
    // STEPPED ICE LAKE — квадратные ступенчатые платформы льда как в референсе
    // =========================================================================
    _generateSteppedIceLake(cx, cz) {
        const lakeMat = this.pool.getMatStd(0x7ecff5, 0.15, 0.3, false, true, 0.82, 0, 0);
        const icePlatMat = this.pool.getMatStd(0xaaddff, 0.4, 0.1, true, true, 0.9, 0, 0);
        const shallowMat = this.pool.getMatStd(0x5ab8f0, 0.2, 0.2, false, true, 0.75, 0, 0);

        // Центральное озеро — глубокая часть (самая синяя)
        const deepGeo = this.pool.getGeoBox(60, 0.3, 60);
        const deep = new THREE.Mesh(deepGeo, lakeMat);
        deep.position.set(cx, 0.15, cz);
        deep.userData.mapGenerated = true;
        this.scene.add(deep);

        // Мелкие зоны вокруг — квадратные плитки
        const tileSize = 20;
        const steps = [
            // Первый уровень ступеней (ближние к центру)
            { dx: -40, dz: -40, w: tileSize, d: tileSize },
            { dx: 0,   dz: -50, w: tileSize * 2, d: tileSize },
            { dx: 40,  dz: -40, w: tileSize, d: tileSize },
            { dx: 50,  dz: 0,   w: tileSize, d: tileSize * 2 },
            { dx: 40,  dz: 40,  w: tileSize, d: tileSize },
            { dx: 0,   dz: 50,  w: tileSize * 2, d: tileSize },
            { dx: -40, dz: 40,  w: tileSize, d: tileSize },
            { dx: -50, dz: 0,   w: tileSize, d: tileSize * 2 },
        ];

        for (const s of steps) {
            const geo = this.pool.getGeoBox(s.w, 0.2, s.d);
            const mesh = new THREE.Mesh(geo, shallowMat);
            mesh.position.set(cx + s.dx, 0.1, cz + s.dz);
            mesh.userData.mapGenerated = true;
            this.scene.add(mesh);
        }

        // Внешние квадратные плитки льда (разной высоты) — как в референсе
        const outerTiles = [
            { dx: -80, dz: -80, w: 28, d: 28, y: 0.08 },
            { dx: 0,   dz: -85, w: 40, d: 20, y: 0.08 },
            { dx: 80,  dz: -80, w: 28, d: 28, y: 0.08 },
            { dx: 85,  dz: 0,   w: 20, d: 40, y: 0.08 },
            { dx: 80,  dz: 80,  w: 28, d: 28, y: 0.08 },
            { dx: 0,   dz: 85,  w: 40, d: 20, y: 0.08 },
            { dx: -80, dz: 80,  w: 28, d: 28, y: 0.08 },
            { dx: -85, dz: 0,   w: 20, d: 40, y: 0.08 },
            // Угловые дополнительные
            { dx: -40, dz: -80, w: 18, d: 18, y: 0.06 },
            { dx: 40,  dz: -80, w: 18, d: 18, y: 0.06 },
            { dx: 80,  dz: -40, w: 18, d: 18, y: 0.06 },
            { dx: 80,  dz: 40,  w: 18, d: 18, y: 0.06 },
            { dx: 40,  dz: 80,  w: 18, d: 18, y: 0.06 },
            { dx: -40, dz: 80,  w: 18, d: 18, y: 0.06 },
            { dx: -80, dz: 40,  w: 18, d: 18, y: 0.06 },
            { dx: -80, dz: -40, w: 18, d: 18, y: 0.06 },
        ];

        for (const t of outerTiles) {
            const geo = this.pool.getGeoBox(t.w, 0.15, t.d);
            const mesh = new THREE.Mesh(geo, icePlatMat);
            mesh.position.set(cx + t.dx, t.y, cz + t.dz);
            mesh.userData.mapGenerated = true;
            mesh.userData.walkable = true;
            this.scene.add(mesh);
            this.addColliderBox(
                new THREE.Vector3(cx + t.dx, t.y, cz + t.dz),
                t.w, 0.15, t.d, true
            );
        }

        // Ледяные трещины и детали на центральной части
        for (let i = 0; i < 4; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const r = 10 + this._rand() * 15;
            const crackX = cx + Math.cos(angle) * r;
            const crackZ = cz + Math.sin(angle) * r;
            const crackLen = 3 + this._rand() * 6;
            const crackGeo = this.pool.getGeoBox(crackLen, 0.05, 0.15);
            const crackMat = this.pool.getMatStd(0x336699, 0.3, 0, true, false, 1, 0, 0);
            const crack = new THREE.Mesh(crackGeo, crackMat);
            crack.position.set(crackX, 0.25, crackZ);
            crack.rotation.y = angle + this._rand() * 0.5;
            crack.userData.mapGenerated = true;
            this.scene.add(crack);
        }

        // Снежные купола на льду (большие глыбы льда по краям)
        const snowMat = this.pool.getMatStd(0xffffff, 0.85, 0, true, false, 1, 0, 0);
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 + this._rand() * 0.3;
            const r = 70 + this._rand() * 15;
            const bx = cx + Math.cos(angle) * r;
            const bz = cz + Math.sin(angle) * r;
            const size = 3 + this._rand() * 4;
            const geo = this.pool.getGeoSphere(size);
            const mesh = new THREE.Mesh(geo, snowMat);
            mesh.position.set(bx, 0, bz);
            mesh.userData.mapGenerated = true;
            this.scene.add(mesh);
        }
    }

    _addIceEdgeTrees(startX, startZ, size) {
        const add = (x, z) => this._addSnowTree(x + (this._rand() - 0.5) * 3, z + (this._rand() - 0.5) * 3);
        for (let i = 18; i < size - 18; i += 34) {
            add(startX + 8, startZ + i);
            add(startX + size - 8, startZ + i);
            add(startX + i, startZ + 8);
            add(startX + i, startZ + size - 8);
        }
    }

    _addIceSnowPiles(startX, startZ, size) {
        const snowMat = this.pool.getMatStd(0xffffff, 0.9, 0, true, false, 1, 0, 0);

        for (let i = 0; i < 6; i++) {
            const x = startX + this._rand() * size;
            const z = startZ + this._rand() * size;
            const pileGeo = this.pool.getGeoSphere(0.5 + this._rand() * 1.5, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
            const pile = new THREE.Mesh(pileGeo, snowMat);
            pile.position.set(x, 0, z);
            pile.scale.y = 0.3;
            pile.userData.mapGenerated = true;
            this.scene.add(pile);
        }
    }

    _addIcePillars(cx, cz) {
        const pillarMat = this.pool.getMatStd(0xaaddff, 0.2, 0.3, true, true, 0.7, 0, 0);

        // Pillars around lake
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const dist = 35 + this._rand() * 15;
            const px = cx + Math.cos(angle) * dist;
            const pz = cz + Math.sin(angle) * dist;
            const height = 3 + this._rand() * 5;
            const radius = 0.5 + this._rand() * 0.8;

            const geo = this.pool.getGeoCylinder(radius * 0.5, radius, height);
            const pillar = new THREE.Mesh(geo, pillarMat);
            pillar.position.set(px, height / 2, pz);
            pillar.rotation.z = (this._rand() - 0.5) * 0.2;
            pillar.userData.isIcePillar = true;
            pillar.userData.mapGenerated = true;
            this.scene.add(pillar);

            if (height > 4) {
                this.addColliderBox(
                    new THREE.Vector3(px, height / 2, pz),
                    radius * 2, height, radius * 2, false
                );
            }
        }
    }

    _addIceCracks(cx, cz) {
        const crackMat = this.pool.getMatStd(0x666666, 0.5, 0, true, false, 1, 0, 0);

        // Cracks as thin flat boxes on lake surface
        for (let i = 0; i < 10; i++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = 5 + this._rand() * 25;
            const cx2 = cx + Math.cos(angle) * dist;
            const cz2 = cz + Math.sin(angle) * dist;
            const length = 2 + this._rand() * 4;
            const width = 0.05 + this._rand() * 0.1;

            const crackGeo = this.pool.getGeoPlane(length, width);
            const crack = new THREE.Mesh(crackGeo, crackMat);
            crack.rotation.x = -Math.PI / 2;
            crack.position.set(cx2, 0.03, cz2);
            crack.rotation.y = this._rand() * Math.PI;
            crack.userData.mapGenerated = true;
            this.scene.add(crack);
        }
    }

    _addIceCampfire(cx, cz) {
        const campfire = new THREE.Group();
        const stoneMat = this.pool.getMatStd(0x616161, 0.9, 0, true, false, 1, 0, 0);
        const fireMat = this.pool.getMatStd(0xff6600, 0.9, 0, true, true, 0.8, 0xff4400, 8.0);

        // Stone ring
        for (let i = 0; i < 1; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const stoneGeo = this.pool.getGeoDodecahedron(0.3);
            const stone = new THREE.Mesh(stoneGeo, stoneMat);
            stone.position.set(Math.cos(angle) * 0.8, 0.2, Math.sin(angle) * 0.8);
            stone.rotation.set(this._rand(), this._rand(), this._rand());
            stone.userData.mapGenerated = true;
            campfire.add(stone);
        }

        // Fire glow
        const fireGeo = this.pool.getGeoSphere(0.4);
        const fire = new THREE.Mesh(fireGeo, fireMat);
        fire.position.set(0, 0.6, 0);
        fire.userData.isCampfire = true;
        campfire.add(fire);

        // Ice blocks around (snow shelter base)
        const iceBlockMat = this.pool.getMatStd(0xccddff, 0.4, 0, true, true, 0.6, 0, 0);
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const blockGeo = this.pool.getGeoBox(1.5, 0.8, 0.5);
            const block = new THREE.Mesh(blockGeo, iceBlockMat);
            block.position.set(Math.cos(angle) * 2, 0.4, Math.sin(angle) * 2);
            block.rotation.y = angle;
            block.userData.mapGenerated = true;
            campfire.add(block);
        }

        campfire.position.set(cx, 0, cz);
        campfire.userData.mapGenerated = true;
        this.scene.add(campfire);
    }

    _addSnowmen(startX, startZ, size) {
        const snowMat = this.pool.getMatStd(0xffffff, 0.9, 0, true, false, 1, 0, 0);
        const coalMat = this.pool.getMatStd(0x222222, 0.8, 0, false, false, 1, 0, 0);
        const carrotMat = this.pool.getMatStd(0xff6600, 0.7, 0, false, false, 1, 0, 0);

        for (let i = 0; i < 5; i++) {
            const snowman = new THREE.Group();
            const sx = startX + 20 + this._rand() * (size - 40);
            const sz = startZ + 20 + this._rand() * (size - 40);

            // Body (3 spheres)
            const bodyGeo = this.pool.getGeoSphere(1.2);
            const body = new THREE.Mesh(bodyGeo, snowMat);
            body.position.y = 1.2;
            body.userData.mapGenerated = true;
            snowman.add(body);

            const midGeo = this.pool.getGeoSphere(0.9);
            const mid = new THREE.Mesh(midGeo, snowMat);
            mid.position.y = 2.7;
            mid.userData.mapGenerated = true;
            snowman.add(mid);

            const headGeo = this.pool.getGeoSphere(0.6);
            const head = new THREE.Mesh(headGeo, snowMat);
            head.position.y = 3.8;
            head.userData.mapGenerated = true;
            snowman.add(head);

            // Eyes (coal)
            for (let side of [-0.2, 0.2]) {
                const eyeGeo = this.pool.getGeoSphere(0.08);
                const eye = new THREE.Mesh(eyeGeo, coalMat);
                eye.position.set(side, 3.9, 0.5);
                eye.userData.mapGenerated = true;
                snowman.add(eye);
            }

            // Carrot nose
            const noseGeo = this.pool.getGeoCone(0.08, 0.3);
            const nose = new THREE.Mesh(noseGeo, carrotMat);
            nose.position.set(0, 3.8, 0.6);
            nose.rotation.x = Math.PI / 2;
            nose.userData.mapGenerated = true;
            snowman.add(nose);

            // Arms (sticks)
            const armMat = this.pool.getMatStd(0x5d4037, 0.9, 0, false, false, 1, 0, 0);
            for (let side of [-1, 1]) {
                const armGeo = this.pool.getGeoCylinder(0.05, 0.05, 1.2);
                const arm = new THREE.Mesh(armGeo, armMat);
                arm.position.set(side * 1.1, 2.7, 0);
                arm.rotation.z = side * Math.PI / 4;
                arm.userData.mapGenerated = true;
                snowman.add(arm);
            }

            snowman.position.set(sx, 0, sz);
            snowman.userData.isSnowman = true;
            snowman.userData.mapGenerated = true;
            this.scene.add(snowman);
        }
    }

    _addSleighs(startX, startZ, size) {
        const woodMat = this.pool.getMatStd(0x6d4c41, 0.8, 0, true, false, 1, 0, 0, true);
        const metalMat = this.pool.getMatStd(0x757575, 0.6, 0.5, true, false, 1, 0, 0);

        for (let i = 0; i < 3; i++) {
            const sleigh = new THREE.Group();
            const sx = startX + 30 + this._rand() * (size - 60);
            const sz = startZ + 30 + this._rand() * (size - 60);

            // Body
            const bodyGeo = this.pool.getGeoBox(1.5, 0.8, 2.5);
            const body = new THREE.Mesh(bodyGeo, woodMat);
            body.position.y = 0.8;
            body.userData.mapGenerated = true;
            sleigh.add(body);

            // Seat
            const seatGeo = this.pool.getGeoBox(1.2, 0.2, 1.5);
            const seat = new THREE.Mesh(seatGeo, woodMat);
            seat.position.set(0, 1.2, -0.2);
            seat.userData.mapGenerated = true;
            sleigh.add(seat);

            // Runners (metal)
            for (let side of [-0.8, 0.8]) {
                const runnerGeo = this.pool.getGeoBox(0.1, 0.1, 3);
                const runner = new THREE.Mesh(runnerGeo, metalMat);
                runner.position.set(side, 0.1, 0);
                runner.userData.mapGenerated = true;
                sleigh.add(runner);
            }

            // Decorative front curve
            const frontGeo = this.pool.getGeoCylinder(0.1, 0.1, 1.5);
            const front = new THREE.Mesh(frontGeo, metalMat);
            front.position.set(0, 0.5, 1.5);
            front.rotation.x = Math.PI / 2;
            front.userData.mapGenerated = true;
            sleigh.add(front);

            sleigh.position.set(sx, 0, sz);
            sleigh.rotation.y = this._rand() * Math.PI;
            sleigh.userData.isSleigh = true;
            sleigh.userData.mapGenerated = true;
            this.scene.add(sleigh);
            this.addColliderBox(new THREE.Vector3(sx, 0.75, sz), 2.2, 1.5, 3.5, false);
        }
    }

    _addSnowShelters(startX, startZ, size) {
        const snowMat = this.pool.getMatStd(0xf0f0f0, 0.9, 0, true, false, 1, 0, 0);
        const canvasMat = this.pool.getMatStd(0x8d6e63, 0.95, 0, true, false, 1, 0, 0);

        for (let i = 0; i < 4; i++) {
            const shelter = new THREE.Group();
            const sx = startX + 20 + this._rand() * (size - 40);
            const sz = startZ + 20 + this._rand() * (size - 40);

            // Snow block walls (3 sides)
            for (let w = 0; w < 3; w++) {
                const wallGeo = this.pool.getGeoBox(3, 1.5, 0.5);
                const wall = new THREE.Mesh(wallGeo, snowMat);
                if (w < 2) {
                    wall.position.set((w - 1) * 3, 0.75, -1);
                } else {
                    wall.position.set(0, 0.75, 0);
                }
                wall.userData.mapGenerated = true;
                shelter.add(wall);
            }

            // Canvas roof (angled)
            const roofGeo = this.pool.getGeoBox(3.5, 0.15, 3.5);
            const roof = new THREE.Mesh(roofGeo, canvasMat);
            roof.position.set(0, 1.6, 0);
            roof.rotation.z = Math.PI / 8;
            roof.userData.mapGenerated = true;
            shelter.add(roof);

            shelter.position.set(sx, 0, sz);
            shelter.userData.isSnowShelter = true;
            shelter.userData.mapGenerated = true;
            this.scene.add(shelter);
            this.addColliderBox(new THREE.Vector3(sx - 3, 0.75, sz - 1), 3, 1.5, 0.5, false);
            this.addColliderBox(new THREE.Vector3(sx, 0.75, sz - 1), 3, 1.5, 0.5, false);
            this.addColliderBox(new THREE.Vector3(sx, 0.75, sz), 3, 1.5, 0.5, false);
            this._registerChestSpot(sx, sz + 0.5, 'ice');
        }
    }

    _addSnowBarrack(x, z) {
        const group = new THREE.Group();
        const wallMat = this.pool.getMatStd(0xe8f2ff, 0.82, 0, true, false, 1, 0, 0, true);
        const roofMat = this.pool.getMatStd(0x8fb7d7, 0.65, 0.05, true, false, 1, 0, 0, true);
        const floorMat = this.pool.getMatStd(0xb6cedf, 0.9, 0, true, false, 1, 0, 0);
        const w = 18;
        const d = 26;
        const h = 8;
        const wt = 0.55;
        const doorW = 3;
        const floor = new THREE.Mesh(this.pool.getGeoBox(w, 0.35, d), floorMat);
        floor.position.y = 0.18;
        floor.userData.mapGenerated = true;
        floor.userData.walkable = true;
        group.add(floor);
        for (const side of [-1, 1]) {
            const wall = new THREE.Mesh(this.pool.getGeoBox(wt, h, d), wallMat);
            wall.position.set(side * w / 2, h / 2, 0);
            wall.userData.mapGenerated = true;
            group.add(wall);
            this.addColliderBox(new THREE.Vector3(x + side * w / 2, h / 2, z), wt, h, d, false);
        }
        const back = new THREE.Mesh(this.pool.getGeoBox(w, h, wt), wallMat);
        back.position.set(0, h / 2, -d / 2);
        back.userData.mapGenerated = true;
        group.add(back);
        this.addColliderBox(new THREE.Vector3(x, h / 2, z - d / 2), w, h, wt, false);
        const frontW = (w - doorW) / 2;
        for (const side of [-1, 1]) {
            const front = new THREE.Mesh(this.pool.getGeoBox(frontW, h, wt), wallMat);
            front.position.set(side * (doorW + frontW) / 2, h / 2, d / 2);
            front.userData.mapGenerated = true;
            group.add(front);
            this.addColliderBox(new THREE.Vector3(x + side * (doorW + frontW) / 2, h / 2, z + d / 2), frontW, h, wt, false);
        }
        const upperY = h * 0.54;
        const upperSlabW = (w - 4) / 2;
        for (const side of [-1, 1]) {
            const slab = new THREE.Mesh(this.pool.getGeoBox(upperSlabW, 0.3, d - 1.2), floorMat);
            slab.position.set(side * (2 + upperSlabW / 2), upperY, 0);
            slab.userData.mapGenerated = true;
            slab.userData.walkable = true;
            group.add(slab);
            this.addColliderBox(new THREE.Vector3(x + slab.position.x, upperY, z), upperSlabW, 0.3, d - 1.2, true);
        }
        const roofGeo = this.pool.getGeoBox(w * 0.58, 0.55, d + 1.5);
        for (const side of [-1, 1]) {
            const roof = new THREE.Mesh(roofGeo, roofMat);
            roof.position.set(side * w * 0.22, h + 1.7, 0);
            roof.rotation.z = side * -0.48;
            roof.userData.mapGenerated = true;
            group.add(roof);
        }
        group.position.set(x, 0, z);
        group.userData.mapGenerated = true;
        this.scene.add(group);
        this.addColliderBox(new THREE.Vector3(x, 0.18, z), w, 0.35, d, true);
        this._buildings.push({ x, z, w, d, template: { type: 'snow_barrack' } });
        for (const ox of [-5, 0, 5]) {
            this._registerChestSpot(x + ox, z - 8, 'ice');
            this._registerChestSpot(x + ox, z + 2, 'ice');
        }
    }

    _addWindTurbine(x, z) {
        const group = new THREE.Group();

        // Мачта
        const towerGeo = this.pool.getGeoCylinder(0.2, 0.4, 15);
        const towerMat = this.pool.getMatStd(0xcccccc, 0.6, 0.5, true, false, 1, 0, 0);
        const tower = new THREE.Mesh(towerGeo, towerMat);
        tower.userData.mapGenerated = true;
        tower.position.y = 7.5;
        group.add(tower);

        // Носовой обтекатель
        const hubGeo = this.pool.getGeoSphere(0.5);
        const hub = new THREE.Mesh(hubGeo, towerMat);
        hub.userData.mapGenerated = true;
        hub.position.y = 15;
        group.add(hub);

        // Лопасти
        const bladeMat = this.pool.getMatStd(0xffffff, 0.4, 0, true, false, 1, 0, 0);

        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const bladeGeo = this.pool.getGeoBox(0.3, 5, 0.1);
            const blade = new THREE.Mesh(bladeGeo, bladeMat);
            blade.position.set(
                Math.cos(angle) * 2.5,
                15 + Math.sin(angle) * 2.5,
                0
            );
            blade.rotation.z = angle;
            blade.userData.isBlade = true;
            blade.userData.mapGenerated = true;
            group.add(blade);
        }

        group.position.set(x, 0, z);
        group.userData.isWindTurbine = true;
        group.userData.mapGenerated = true;
        this.scene.add(group);
    }

    updateWindTurbines(delta) {
        const turbines = this._cachedTurbines;
        if (!turbines?.length) return;
        const px = this._lastPlayerPos?.x, pz = this._lastPlayerPos?.z;
        const cullDistSq = px ? 10000 : Infinity;
        for (const turbine of turbines) {
            if (px) {
                const dx = turbine.position.x - px, dz = turbine.position.z - pz;
                if (dx * dx + dz * dz > cullDistSq) continue;
            }
            for (const child of turbine.children) {
                if (child.userData?.isBlade) child.rotation.z += delta * 3;
            }
        }
    }

    _addIcePOI(startX, startZ, size) {
        const poiPositions = [
            { x: 80, z: 80, type: 'weapon' },
            { x: 180, z: 100, type: 'medkit' },
            { x: 100, z: 180, type: 'ammo' },
            { x: 180, z: 180, type: 'weapon' },
            { x: 60, z: 160, type: 'medkit' },
            { x: 160, z: 60, type: 'ammo' },
            { x: 130, z: 80, type: 'weapon' },
            { x: 80, z: 130, type: 'medkit' },
        ];

        for (const poi of poiPositions) {
            if (poi.type === 'weapon') {
                this._addWeaponDrop(poi.x, poi.z);
            } else if (poi.type === 'medkit') {
                this._addMedkitDrop(poi.x, poi.z);
            } else {
                this._addAmmoDrop(poi.x, poi.z);
            }
        }
    }

    _addSnowParticles() {
        const snowCount = 500;
        const positions = new Float32Array(snowCount * 3);
        const snowMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.3,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true
        });

        for (let i = 0; i < snowCount; i++) {
            const x = 10 + Math.random() * 236;
            const y = 5 + Math.random() * 20;
            const z = 10 + Math.random() * 236;
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const snowParticles = new THREE.Points(geo, snowMat);
        snowParticles.userData.isSnowParticles = true;
        snowParticles.userData.mapGenerated = true;
        this.scene.add(snowParticles);
    }

    updateSnowParticles(delta) {
        const particles = this._cachedSnow;
        if (!particles) return;
        // Distance check — skip if player > 200m away
        const px = this._lastPlayerPos?.x, pz = this._lastPlayerPos?.z;
        if (px) {
            const dx = px - particles.position.x, dz = pz - particles.position.z;
            if (dx * dx + dz * dz > 40000) return;
        }
        const pos = particles.geometry.attributes.position;
        const t = performance.now() * 0.001;
        for (let i = 0; i < pos.count; i++) {
            let y = pos.getY(i) - delta * 2;
            if (y < 0) {
                y = 20 + Math.random() * 10;
                pos.setX(i, 10 + Math.random() * 236);
                pos.setZ(i, 10 + Math.random() * 236);
            }
            pos.setY(i, y);
            pos.setX(i, pos.getX(i) + Math.sin(t + i) * delta * 0.5);
        }
        pos.needsUpdate = true;
    }

    _addIceToCenterPath(cx, cz) {
        const pathMat = this.pool.getMatStd(0xeef4ff, 0.8, 0, true, false, 1, 0, 0);

        const startX2 = cx;
        const startZ2 = cz;
        const endX = 0;
        const endZ = 0;

        let px = startX2;
        let pz = startZ2;
        for (let i = 0; i < 10; i++) {
            const t = i / 19;
            const segGeo = this.pool.getGeoBox(3, 0.05, 4);
            const seg = new THREE.Mesh(segGeo, pathMat);
            seg.position.set(
                px + (endX - px) * t,
                0.03,
                pz + (endZ - pz) * t
            );
            seg.userData.mapGenerated = true;
            seg.userData.walkable = true;
            this.scene.add(seg);
            px += (endX - px) * 0.12 + (this._rand() - 0.5) * 2;
            pz += (endZ - pz) * 0.12 + (this._rand() - 0.5) * 2;
        }
    }

    _addDetailedIgloo(x, z) {
        const igloo = new THREE.Group();
        const iglooMat = this.pool.getMatStd(COLORS.iceIgloo, 0.6, 0, true, false, 1, 0, 0);
        const snowMat = this.pool.getMatStd(0xffffff, 0.8, 0, true, false, 1, 0, 0);

        // Dome with snow cap
        const domeGeo = this.pool.getGeoSphere(10);
        const dome = new THREE.Mesh(domeGeo, iglooMat);
        dome.position.y = 0;
        dome.userData.mapGenerated = true;
        igloo.add(dome);

        // Snow cap on top
        const capGeo = this.pool.getGeoSphere(9.5);
        const cap = new THREE.Mesh(capGeo, snowMat);
        cap.position.y = 0.8;
        cap.userData.mapGenerated = true;
        igloo.add(cap);

        // Interior floor
        const intFloorGeo = this.pool.getGeoDodecahedron(9);
        const intFloorMat = this.pool.getMatStd(0xe0e0e0, 0.7, 0, false, false, 1, 0, 0);
        const intFloor = new THREE.Mesh(intFloorGeo, intFloorMat);
        intFloor.rotation.x = -Math.PI / 2;
        intFloor.position.y = 0.2;
        intFloor.userData.mapGenerated = true;
        intFloor.userData.walkable = true;
        igloo.add(intFloor);

        // Entrance tunnel
        const tunnelGeo = this.pool.getGeoCylinder(2.5, 2.5, 6);
        const tunnel = new THREE.Mesh(tunnelGeo, iglooMat);
        tunnel.rotation.z = Math.PI / 2;
        tunnel.position.set(8.5, 1.5, 0);
        tunnel.userData.mapGenerated = true;
        igloo.add(tunnel);

        // Interior torch (warm glow inside)
        const torchMat = this.pool.getMatStd(0x5d4037, 0.8, 0, true, false, 1, 0, 0);
        const fireMat = this.pool.getMatStd(0xff6600, 0.9, 0, true, true, 0.9, 0xff4400, 10.0);
        const torch = new THREE.Group();
        const stickGeo = this.pool.getGeoCylinder(0.08, 0.1, 0.8);
        const stick = new THREE.Mesh(stickGeo, torchMat);
        stick.rotation.x = Math.PI / 6;
        stick.position.set(-5, 5, 3);
        stick.userData.mapGenerated = true;
        torch.add(stick);
        const flameGeo = this.pool.getGeoSphere(0.2);
        const flame = new THREE.Mesh(flameGeo, fireMat);
        flame.position.set(-5, 5.5, 3);
        flame.userData.isTorch = true;
        flame.userData.blinkRate = 2.5;
        torch.add(flame);
        torch.userData.mapGenerated = true;
        igloo.add(torch);

        // Interior bench (log bench)
        const benchMat = this.pool.getMatStd(0x6d4c41, 0.9, 0, true, false, 1, 0, 0);
        const benchGeo = this.pool.getGeoBox(3, 0.4, 0.8);
        const bench = new THREE.Mesh(benchGeo, benchMat);
        bench.position.set(-3, 0.5, -3);
        bench.userData.mapGenerated = true;
        igloo.add(bench);

        // Chest inside
        const chestMat = this.pool.getMatStd(0x8B4513, 0.7, 0, true, false, 1, 0xffaa00, 2.0);
        const chestGeo = this.pool.getGeoBox(1.2, 0.9, 0.9);
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.set(5, 0.45, -3);
        chest.userData.isTowerChest = true;
        chest.userData.mapGenerated = true;
        igloo.add(chest);

        igloo.position.set(x, 0, z);
        igloo.userData.mapGenerated = true;
        this.scene.add(igloo);

        this.addColliderBox(
            new THREE.Vector3(x, 5, z),
            20, 10, 20, false
        );
    }

    _addIceCrystal(x, z) {
        // Large ice crystal — bigger
        const height = 8 + this._rand() * 10;
        const radius = 2 + this._rand() * 2;
        const sides = 6 + Math.floor(this._rand() * 3);

        const geo = this.pool.getGeoCone(radius, height);
        const mat = this.pool.getMatStd(COLORS.iceCrystal + Math.floor(this._rand() * 0x20 - 0x10), 0.2, 0.2, true, true, 0.85, 0, 0);

        const crystal = new THREE.Mesh(geo, mat);
        crystal.position.set(x, height / 2, z);
        crystal.rotation.y = this._rand() * Math.PI;
        crystal.rotation.z = (this._rand() - 0.5) * 0.2;
        crystal.userData.mapGenerated = true;
        this.scene.add(crystal);

        if (height > 2) {
            this.addColliderBox(
                new THREE.Vector3(x, height * 0.3, z),
                radius * 2, height * 0.6, radius * 2, false
            );
        }
    }

    _addSnowTree(x, z) {
        if (Math.sqrt(x * x + z * z) < 75) return;
        // Large snow tree — bigger
        const trunkH = 11 + this._rand() * 6;
        const trunkR = 0.5 + this._rand() * 0.3;

        // Trunk
        const trunkGeo = this.pool.getGeoCylinder(trunkR * 0.5, trunkR, trunkH);
        const trunkMat = this.pool.getMatStd(COLORS.forestTrunk, 0.8, 0, false, false, 1, 0, 0);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        this.scene.add(trunk);
        this.addColliderBox(
            new THREE.Vector3(x, trunkH / 2, z),
            trunkR * 2, trunkH, trunkR * 2, false
        );

        // Snow layers
        const snowMat = this.pool.getMatStd(0xffffff, 0.7, 0, true, false, 1, 0, 0);

        for (let l = 0; l < 5; l++) {
            const layerR = (4.8 - l * 0.75) * (0.9 + this._rand() * 0.2);
            const layerGeo = this.pool.getGeoCone(layerR, 4.5);
            const snowLayer = new THREE.Mesh(layerGeo, snowMat);
            snowLayer.position.set(x, trunkH - 3 + l * 2.7, z);
            snowLayer.userData.mapGenerated = true;
            this.scene.add(snowLayer);
        }
    }

    _addRadioTower(x, z) {
        // Large radio tower — bigger
        const tower = new THREE.Group();
        const poleMat = this.pool.getMatStd(COLORS.iceTower, 0.6, 0, false, false, 1, 0, 0);

        // Main pole
        const poleGeo = this.pool.getGeoCylinder(0.8, 1.2, 40);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 20;
        pole.userData.mapGenerated = true;
        tower.add(pole);

        // Cross braces
        for (let br = 10; br < 40; br += 8) {
            const braceGeo = this.pool.getGeoBox(8, 0.3, 8);
            const brace = new THREE.Mesh(braceGeo, poleMat);
            brace.position.y = br;
            brace.userData.mapGenerated = true;
            tower.add(brace);
        }

        // Dish antenna
        const dishGeo = this.pool.getGeoCone(5, 7);
        const dishMat = this.pool.getMatStd(0x6b7280, 0.3, 0.6, false, false, 1, 0, 0);
        const dish = new THREE.Mesh(dishGeo, dishMat);
        dish.position.set(0, 42, -1.5);
        dish.rotation.x = Math.PI / 6;
        dish.userData.mapGenerated = true;
        tower.add(dish);

        tower.position.set(x, 0, z);
        tower.userData.mapGenerated = true;
        this.scene.add(tower);

        this.addColliderBox(
            new THREE.Vector3(x, 20, z),
            3, 40, 3, false
        );
    }

    // =========================================================================
    // COVER OBJECTS — Biome-specific placement
    // =========================================================================
    _placeBiomeDecor() {
        for (const [x, z] of [[-220, -72], [-188, -208], [-92, -190], [-212, -152], [-76, -92]]) this._addFallenLog(x, z);
        const stoneMat = this.pool.getMatStd(0x59616b, 0.92, 0, true, false, 1, 0, 0);
        const iceMat = this.pool.getMatStd(0xa9d9f4, 0.35, 0.08, true, true, 0.88, 0, 0);
        for (const [x, z, r] of [[82, -82, 0], [132, -68, Math.PI / 2], [194, -92, 0], [96, -192, Math.PI / 2], [192, -190, 0]]) this._addThemeArch(x, z, r, stoneMat);
        for (const [x, z] of [[-214, 92], [-174, 214], [-76, 92], [-74, 214]]) this._addGuardPost(x, z);
        for (const [x, z, r] of [[78, 82, 0], [132, 70, Math.PI / 2], [194, 88, 0], [82, 192, Math.PI / 2], [192, 190, 0]]) this._addThemeArch(x, z, r, iceMat);
    }

    _addThemeArch(x, z, rotation, material) {
        const group = new THREE.Group();
        for (const side of [-1, 1]) {
            const pillar = new THREE.Mesh(this.pool.getGeoBox(2, 7, 2), material);
            pillar.position.set(side * 4, 3.5, 0);
            pillar.userData.mapGenerated = true;
            group.add(pillar);
        }
        const beam = new THREE.Mesh(this.pool.getGeoBox(10, 2, 2), material);
        beam.position.y = 7;
        beam.userData.mapGenerated = true;
        group.add(beam);
        group.position.set(x, 0, z);
        group.rotation.y = rotation;
        group.userData.mapGenerated = true;
        this.scene.add(group);
        const c = Math.abs(Math.cos(rotation));
        const s = Math.abs(Math.sin(rotation));
        for (const side of [-1, 1]) {
            const lx = side * 4;
            this.addColliderBox(new THREE.Vector3(x + lx * c, 3.5, z - lx * s), 2, 7, 2, false);
        }
    }

    _addGuardPost(x, z) {
        const group = new THREE.Group();
        const postMat = this.pool.getMatStd(0x4c553d, 0.82, 0.2, true, false, 1, 0, 0);
        const roofMat = this.pool.getMatStd(0x343b34, 0.72, 0.35, true, false, 1, 0, 0, true);
        for (const px of [-2.5, 2.5]) {
            for (const pz of [-2.5, 2.5]) {
                const post = new THREE.Mesh(this.pool.getGeoBox(0.7, 6, 0.7), postMat);
                post.position.set(px, 3, pz);
                post.userData.mapGenerated = true;
                group.add(post);
                this.addColliderBox(new THREE.Vector3(x + px, 3, z + pz), 0.7, 6, 0.7, false);
            }
        }
        const roof = new THREE.Mesh(this.pool.getGeoBox(7, 0.6, 7), roofMat);
        roof.position.y = 6.3;
        roof.userData.mapGenerated = true;
        group.add(roof);
        group.position.set(x, 0, z);
        group.userData.mapGenerated = true;
        this.scene.add(group);
    }

    _placeCoverObjects() {
        // Forest cover: wooden barrels + mushroom clusters (NW quadrant only)
        for (let i = 0; i < 20; i++) {
            const x = -HALF + 15 + this._rand() * (HALF - 40);
            const z = -HALF + 15 + this._rand() * (HALF - 40);
            if (x > -5 || z > -5 || Math.sqrt(x * x + z * z) < 80) continue;
            this._addBarrel(x, z);
        }
        for (let i = 0; i < 4; i++) {
            const x = -HALF + 15 + this._rand() * (HALF - 40);
            const z = -HALF + 15 + this._rand() * (HALF - 40);
            if (x > -5 || z > -5 || Math.sqrt(x * x + z * z) < 80) continue;
            this._addMushroomCluster(x, z);
        }

        // Maze cover: stone crates + mossy rocks (NE quadrant only)
        for (let i = 0; i < 5; i++) {
            const x = 5 + this._rand() * (HALF - 25);
            const z = -HALF + 15 + this._rand() * (HALF - 40);
            if (x < 5 || z > -5 || Math.sqrt(x * x + z * z) < 80) continue;
            this._addCrate(x, z);
        }

        // Military cover: ammo crates + sandbag stacks (SW quadrant only)
        for (let i = 0; i < 4; i++) {
            const x = -HALF + 15 + this._rand() * (HALF - 40);
            const z = 5 + this._rand() * (HALF - 25);
            if (x > -5 || z < 5 || Math.sqrt(x * x + z * z) < 80) continue;
            this._addMilitaryCrate(x, z);
        }
        for (let i = 0; i < 6; i++) {
            const x = -HALF + 15 + this._rand() * (HALF - 40);
            const z = 5 + this._rand() * (HALF - 25);
            if (x > -5 || z < 5 || Math.sqrt(x * x + z * z) < 80) continue;
            this._addSandbagBarrier(x, z);
        }

        // Ice cover: snow mounds + ice chunks (SE quadrant only)
        for (let i = 0; i < 4; i++) {
            const x = 5 + this._rand() * (HALF - 25);
            const z = 5 + this._rand() * (HALF - 25);
            if (x < 5 || z < 5 || Math.sqrt(x * x + z * z) < MIN_BUILDING_DISTANCE) continue;
            this._addIceChunk(x, z);
        }
    }

    // =========================================================================
    // BIOME CONNECTIONS — Logical paths between quadrants
    // =========================================================================
    _generateBiomeConnections() {
        // Path from forest (NW) to maze (NE) — crosses river
        const pathMat = this.pool.getMatStd(0x8d6e63, 1.0, 0, true, false, 1, 0, 0);

        // Forest to Maze path (horizontal) — spawn pads at path endpoints (tile-grid snapped)
        for (let i = 0; i < 10; i++) {
            const px = -80 + i * 16;
            const pz = Math.round((-20 + this._rand() * 10) / TILE_SIZE) * TILE_SIZE;
            const segGeo = this.pool.getGeoBox(2, 0.05, 2);
            const seg = new THREE.Mesh(segGeo, pathMat);
            seg.position.set(px, 0.03, pz);
            seg.userData.mapGenerated = true;
            seg.userData.walkable = true;
            this.scene.add(seg);
        }
        // Military to Ice path (diagonal)
        for (let i = 0; i < 4; i++) {
            const px = Math.round((-60 + i * 12) / TILE_SIZE) * TILE_SIZE;
            const pz = Math.round((60 + i * 12) / TILE_SIZE) * TILE_SIZE;
            const segGeo = this.pool.getGeoBox(2, 0.05, 2);
            const seg = new THREE.Mesh(segGeo, pathMat);
            seg.position.set(px, 0.03, pz);
            seg.userData.mapGenerated = true;
            seg.userData.walkable = true;
            this.scene.add(seg);
        }

        // Forest to Military path (vertical)
        for (let i = 0; i < 4; i++) {
            const px = Math.round((-60 + this._rand() * 10) / TILE_SIZE) * TILE_SIZE;
            const pz = Math.round((20 + i * 16) / TILE_SIZE) * TILE_SIZE;
            const segGeo = this.pool.getGeoBox(2, 0.05, 2);
            const seg = new THREE.Mesh(segGeo, pathMat);
            seg.position.set(px, 0.03, pz);
            seg.userData.mapGenerated = true;
            seg.userData.walkable = true;
            this.scene.add(seg);
        }
    }

    // =========================================================================
    // PERIMETER WALLS — Glass blue border walls like in reference image
    // =========================================================================
    _generatePerimeterWalls() {
        const wallH = 30;   // Wall height
        const wallT = 1.5;  // Thickness
        const half = HALF;  // 256
        const wallMat = this.pool.getMatStd(0x4dd0e1, 0.1, 0.2, false, true, 0.55, 0x006064, 0.4);

        // Bottom base plate (solid floor under walls)
        const baseMat = this.pool.getMatStd(0x1565c0, 0.7, 0, true, false, 1, 0, 0);

        // Four perimeter walls
        const walls = [
            // North wall
            { x: 0, y: wallH / 2, z: -half, w: half * 2 + wallT * 2, h: wallH, d: wallT },
            // South wall
            { x: 0, y: wallH / 2, z: half,  w: half * 2 + wallT * 2, h: wallH, d: wallT },
            // West wall
            { x: -half, y: wallH / 2, z: 0, w: wallT, h: wallH, d: half * 2 },
            // East wall
            { x: half,  y: wallH / 2, z: 0, w: wallT, h: wallH, d: half * 2 },
        ];

        for (const w of walls) {
            const geo = this.pool.getGeoBox(w.w, w.h, w.d);
            const mesh = new THREE.Mesh(geo, wallMat);
            mesh.position.set(w.x, w.y, w.z);
            mesh.userData.mapGenerated = true;
            this.scene.add(mesh);
            this.addColliderBox(new THREE.Vector3(w.x, w.y, w.z), w.w, w.h, w.d, false);
        }

        // Blue base strip (floor level frame)
        const baseWalls = [
            { x: 0, z: -half - wallT * 0.5, w: half * 2 + wallT * 4, d: wallT * 2 },
            { x: 0, z: half + wallT * 0.5,  w: half * 2 + wallT * 4, d: wallT * 2 },
            { x: -half - wallT * 0.5, z: 0, w: wallT * 2, d: half * 2 },
            { x: half + wallT * 0.5,  z: 0, w: wallT * 2, d: half * 2 },
        ];

        for (const b of baseWalls) {
            const geo = this.pool.getGeoBox(b.w, 0.5, b.d);
            const mesh = new THREE.Mesh(geo, baseMat);
            mesh.position.set(b.x, 0.25, b.z);
            mesh.userData.mapGenerated = true;
            this.scene.add(mesh);
        }
    }

    _addIceChunk(x, z) {
        const size = 0.5 + this._rand() * 1.5;
        const geo = this.pool.getGeoDodecahedron(size);
        const mat = this.pool.getMatStd(COLORS.iceCrystal, 0.3, 0.1, true, true, 0.8, 0, 0);
        const chunk = new THREE.Mesh(geo, mat);
        chunk.position.set(x, size * 0.3, z);
        chunk.rotation.set(
            this._rand() * Math.PI,
            this._rand() * Math.PI,
            this._rand() * Math.PI
        );
        chunk.userData.mapGenerated = true;
        this.scene.add(chunk);
        this.addColliderBox(
            new THREE.Vector3(x, size * 0.3, z),
            size * 1.2, size * 0.6, size * 1.2, false
        );
    }

    _addBarrel(x, z) {
        // Massive barrel — grand scale
        const geo = this.pool.getGeoCylinder(1.2, 1.2, 2.5);
        const mat = this.pool.getMatStd(0x5d4037, 0.8, 0, false, false, 1, 0, 0);
        const barrel = new THREE.Mesh(geo, mat);
        barrel.position.set(x, 1.25, z);
        barrel.userData.mapGenerated = true;
        barrel.userData.physicsType = 'STATIC';
        this.scene.add(barrel);
        this.addColliderBox(new THREE.Vector3(x, 1.25, z), 2.5, 2.5, 2.5, false);
    }

    _addCrate(x, z) {
        // Grand crate — massive scale
        const size = 2 + this._rand() * 1.5;
        const geo = this.pool.getGeoBox(size, size, size);
        const mat = this.pool.getMatStd(0xa1887f, 0.8, 0, true, false, 1, 0, 0);
        const crate = new THREE.Mesh(geo, mat);
        crate.position.set(x, size / 2, z);
        crate.rotation.y = this._rand() * Math.PI;
        crate.userData.mapGenerated = true;
        crate.userData.physicsType = 'STATIC';
        this.scene.add(crate);
        this.addColliderBox(
            new THREE.Vector3(x, size / 2, z),
            size, size, size, false
        );
    }

    _addMushroomCluster(x, z) {
        const cluster = new THREE.Group();
        const stemMat = this.pool.getMatStd(0xfff9c4, 0.8, 0, false, false, 1, 0, 0);
        const capMat = this.pool.getMatStd(COLORS.forestMushroom, 0.6, 0, true, false, 1, 0, 0);

        const count = 3 + Math.floor(this._rand() * 4);
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const r = 0.3 + this._rand() * 0.5;
            const mx = Math.cos(angle) * r;
            const mz = Math.sin(angle) * r;
            const stemH = 0.3 + this._rand() * 0.4;

            const stemGeo = this.pool.getGeoCylinder(0.08, 0.1, stemH);
            const stem = new THREE.Mesh(stemGeo, stemMat);
            stem.position.set(mx, stemH / 2, mz);
            stem.userData.mapGenerated = true;
            cluster.add(stem);

            const capGeo = this.pool.getGeoSphere(0.25 + this._rand() * 0.15, 6, 6);
            capGeo.scale(1, 0.6, 1);
            const cap = new THREE.Mesh(capGeo, capMat);
            cap.position.set(mx, stemH + 0.15, mz);
            cap.userData.mapGenerated = true;
            cluster.add(cap);

            // White spots on cap
            for (let s = 0; s < 3; s++) {
                const spotGeo = this.pool.getGeoSphere(0.05);
                const spotMat = this.pool.getMatStd(COLORS.forestMushroomSpot, 0.7, 0, false, false, 1, 0, 0);
                const spot = new THREE.Mesh(spotGeo, spotMat);
                spot.position.set(
                    mx + (this._rand() - 0.5) * 0.3,
                    stemH + 0.25,
                    mz + (this._rand() - 0.5) * 0.3
                );
                spot.userData.mapGenerated = true;
                cluster.add(spot);
            }
        }

        cluster.position.set(x, 0, z);
        cluster.userData.mapGenerated = true;
        this.scene.add(cluster);
    }

    // =========================================================================
    // SPAWN PADS — Filter out pads inside buildings/walls (protect cornucopia center)
    // =========================================================================
    _buildSpawnPads() {
        const valid = [];
        const seen = new Set();
        console.log(`[MapGenerator] Before filter: ${this.spawnPads.length} pads, first: (${this.spawnPads[0]?.x.toFixed(1)}, ${this.spawnPads[0]?.z.toFixed(1)})`);
        for (const pad of this.spawnPads) {
            const key = `${pad.x.toFixed(4)},${pad.z.toFixed(4)}`;
            if (seen.has(key)) continue;
            seen.add(key);

            // Filter: must be on a walkable surface
            const queryRadius = 3;
            const tempColliders = this.getNearbyCollidersForSpawn(pad, queryRadius);
            let onWalkable = false;
            let insideNonWalkable = false;
            for (const col of tempColliders) {
                if (pad.x >= col.min.x && pad.x <= col.max.x &&
                    pad.z >= col.min.z && pad.z <= col.max.z) {
                    const padBottom = pad.y - 1.8;
                    const padTop = pad.y + 0.5;
                    if (padTop > col.min.y && padBottom < col.max.y) {
                        if (col.walkable) {
                            onWalkable = true;
                        } else {
                            insideNonWalkable = true;
                        }
                    }
                }
            }
            const dist = Math.sqrt(pad.x * pad.x + pad.z * pad.z);
            if (!onWalkable && dist <= 50) {
                // Cornucopia platform edge pads are always valid
                valid.push(pad);
                continue;
            }
            if (onWalkable && !insideNonWalkable) {
                valid.push(pad);
            }
        }
        this.spawnPads = valid;
        console.log(`[MapGenerator] After filter: ${this.spawnPads.length} pads, first: (${this.spawnPads[0]?.x.toFixed(1)}, ${this.spawnPads[0]?.z.toFixed(1)})`);
    }

    // =========================================================================
    // API CONTRACT
    // =========================================================================
    getNearbyCollidersForSpawn(position, radius) {
        const results = [];
        const cellSize = 16;
        const minCx = Math.floor((position.x - radius) / cellSize);
        const maxCx = Math.floor((position.x + radius) / cellSize);
        const minCz = Math.floor((position.z - radius) / cellSize);
        const maxCz = Math.floor((position.z + radius) / cellSize);
        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cz = minCz; cz <= maxCz; cz++) {
                const key = `${cx},${cz}`;
                const bucket = this.colliderGrid?.get(key);
                if (!bucket) continue;
                for (const box of bucket) {
                    results.push(box);
                }
            }
        }
        return results;
    }

    addColliderBox(center, width, height, depth, walkable = false) {
        const box = {
            min: new THREE.Vector3(
                center.x - width / 2,
                center.y - height / 2,
                center.z - depth / 2
            ),
            max: new THREE.Vector3(
                center.x + width / 2,
                center.y + height / 2,
                center.z + depth / 2
            ),
            walkable,
            enabled: true,
            dynamic: false,
            physicsType: 'STATIC'
        };
        this.colliders.push(box);
        return box;
    }

    finalizeColliders() {
        this._rebuildColliderGrid();
    }

    _rebuildColliderGrid() {
        this.colliderGrid.clear();
        const cellSize = this.colliderGridCellSize;
        for (const box of this.colliders) {
            if (!box || !box.min || !box.max) continue;
            const minX = Math.floor(box.min.x / cellSize);
            const maxX = Math.floor(box.max.x / cellSize);
            const minZ = Math.floor(box.min.z / cellSize);
            const maxZ = Math.floor(box.max.z / cellSize);
            for (let x = minX; x <= maxX; x++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const key = `${x},${z}`;
                    let bucket = this.colliderGrid.get(key);
                    if (!bucket) {
                        bucket = [];
                        this.colliderGrid.set(key, bucket);
                    }
                    bucket.push(box);
                }
            }
        }
    }

    _buildNavigationTiles() {
        this._navigationTiles.length = 0;
        const step = 12;
        const limit = HALF - 8;
        for (let x = -limit; x <= limit; x += step) {
            for (let z = -limit; z <= limit; z += step) {
                if (Math.hypot(x, z) < 38 || !this.isWalkableAt(x, z)) continue;
                this._navigationTiles.push({ x, y: this.getSurfaceHeightAt(x, z), z });
            }
        }
    }

    getColliders() {
        return this.colliders;
    }

    getSpawnPads() {
        return this.spawnPads;
    }

    getSpawnWorld() {
        return { x: 0, z: 0 };
    }

    // Raycast to find ground Y at given X,Z — returns surface height or fallback
    raycastGroundY(x, z, fallbackY = 0) {
        // For spawn pads near the center, platform surface is at y=2
        const distFromCenter = Math.sqrt(x * x + z * z);
        if (distFromCenter <= 30) {
            // Center platform always at y=2
            return 2.0;
        }

        // Find the highest walkable surface at this position
        const maxSearchY = fallbackY + 3;
        let closestY = fallbackY;
        let found = false;
        for (const col of this.colliders) {
            if (!col.walkable) continue;
            if (col.max.y > maxSearchY) continue;
            if (x >= col.min.x && x <= col.max.x && z >= col.min.z && z <= col.max.z) {
                if (!found || col.max.y > closestY) {
                    closestY = col.max.y;
                    found = true;
                }
            }
        }
        return found ? closestY : fallbackY;
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
        const spots = [];
        for (const b of this._buildings) {
            if (b.template?.type === 'log_cabin' || b.template?.type === 'military_ruin') {
                spots.push({
                    x: b.x,
                    z: b.z + b.d / 2 + 2,
                    type: 'house'
                });
            }
        }
        return spots;
    }

    _registerChestSpot(x, z, grade = 'house') {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        if (this._chestSpots.some(s => Math.hypot(s.x - x, s.z - z) < 2.5)) return;
        this._chestSpots.push({ x, z, grade });
    }

    getChestSpots() {
        return this._chestSpots;
    }

    getHangarSpots() {
        return this._buildings
            .filter(b => b.template?.type === 'military_building')
            .map(b => ({ x: b.x, z: b.z, width: b.w, depth: b.d, type: 'hangar' }));
    }

    getExplosiveBarrelSpots() {
        const spots = [];
        for (let i = 0; i < 15; i++) {
            spots.push({
                x: -HALF + 30 + this._rand() * (MAP_SIZE - 60),
                z: -HALF + 30 + this._rand() * (MAP_SIZE - 60)
            });
        }
        return spots;
    }

    getStructureAtPoint(x, z, margin = 2) {
        for (const bp of this._buildings) {
            const dx = x - bp.x;
            const dz = z - bp.z;
            if (Math.abs(dx) < bp.w / 2 + margin && Math.abs(dz) < bp.d / 2 + margin) {
                return bp;
            }
        }
        return null;
    }

    isWalkableAt(x, z) {
        const radius = 0.5;
        const minX = Math.floor((x - radius) / this.colliderGridCellSize);
        const maxX = Math.floor((x + radius) / this.colliderGridCellSize);
        const minZ = Math.floor((z - radius) / this.colliderGridCellSize);
        const maxZ = Math.floor((z + radius) / this.colliderGridCellSize);
        for (let cx = minX; cx <= maxX; cx++) {
            for (let cz = minZ; cz <= maxZ; cz++) {
                const bucket = this.colliderGrid.get(`${cx},${cz}`);
                if (!bucket) continue;
                for (const box of bucket) {
                    if (!box.walkable && box.enabled !== false) {
                        if (x >= box.min.x - 0.5 && x <= box.max.x + 0.5 &&
                            z >= box.min.z - 0.5 && z <= box.max.z + 0.5) {
                            return false;
                        }
                    }
                }
            }
        }
        return true;
    }

    isInsideCourtyard(pos) {
        const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
        return dist < 38;
    }

    getCourtyardExitPosition() {
        // Exit position just outside courtyard on platform
        return new THREE.Vector3(0, 0.5, -35);
    }

    getCornucopiaCenter() {
        // Center of the central hub where cornucopia sits
        return new THREE.Vector3(0, 0, 0);
    }

    setCourtyardGateOpen(open) {
        this.setBiomeGatesOpen(open);
    }

    setBiomeGatesOpen(open) {
        const isOpen = !!open;
        for (const gate of this._biomeGates) {
            gate.visible = true;
            gate.material.transparent = true;
            gate.material.opacity = isOpen ? 0.14 : 0.96;
            gate.material.depthWrite = !isOpen;
            gate.material.emissiveIntensity = isOpen ? 0.1 : 0.45;
            gate.material.needsUpdate = true;
        }
        for (const collider of this._biomeGateColliders) {
            collider.enabled = !isOpen;
        }
        this.biomeGatesOpen = isOpen;
    }

    getActiveSafeRadius() {
        return this.halfSize * 0.8;
    }

    activateFogPhase(index) {
        const phases = [this.halfSize * 0.3, this.halfSize * 0.5, this.halfSize * 0.7, this.halfSize * 0.9];
        return phases[index] || phases[phases.length - 1];
    }

    getFloorTiles() {
        return this._spawnTiles;
    }

    getNavigationTiles() {
        return this._navigationTiles;
    }

    isShelteredFromRain(pos) {
        if (!pos) return false;
        const structure = this.getStructureAtPoint(pos.x, pos.z, 3);
        return !!structure;
    }

    getClosestRadiationZone(x, z) {
        return null;
    }

    getRadiationDamageAt(x, z) {
        return 0;
    }

    getFogDamageAt(x, z) {
        return 0;
    }

    activateTrapsNearEntity(entity) {
        // No traps in this map
    }

    updatePropVisibility(pos) {
        const dist = this.isMobile === true ? this._cullDistanceMobile : this._cullDistance;
        const distSq = dist * dist;
        // Hysteresis margin — objects stay visible 30m past cull boundary to prevent flickering
        const hysteresis = 30;
        const nearDistSq = (dist - hysteresis) * (dist - hysteresis);
        for (let i = 0, n = this._meshes.length; i < n; i++) {
            const mesh = this._meshes[i];
            if (!mesh || !mesh.userData || !mesh.userData._mapCulled) continue;
            // Never cull terrain planes, POI/loot, spawn pads, or interactive objects
            if (mesh.userData.isTerrain || mesh.userData.isPOI || mesh.userData.isSpawnPlatform) continue;
            const dx = mesh.position.x - pos.x;
            const dz = mesh.position.z - pos.z;
            const dSq = dx * dx + dz * dz;
            if (dSq > distSq) {
                // Far away — hide
                mesh.visible = false;
            } else if (dSq < nearDistSq) {
                // Close enough — show
                mesh.visible = true;
            }
            // Between nearDistSq and distSq — keep current state (hysteresis zone)
        }
    }

    enableOptimizedCulling() {
        this._cullDistance = this.isMobile ? this._cullDistanceMobile : this._cullDistance;
    }

    setupLOD(isMobile) {
        this.isMobile = isMobile;
        if (isMobile) {
            this._cullDistance = this._cullDistanceMobile;
        }
        // Enable frustum culling on all scene objects
        this.scene.traverse((obj) => {
            if (obj.isMesh || obj.isGroup) {
                obj.frustumCulled = true;
            }
        });
    }

    update(delta, playerPos) {
        // Culling handled by updatePropVisibility() called from main.js — no duplicate work here
    }

    updateAllAnimations(delta, playerPos) {
        // Store player position for distance checks
        if (playerPos) this._lastPlayerPos = playerPos;
        // Throttle animation updates to every 0.5s (2x/sec) — subtle visual changes don't need high frequency
        this._animSkipTimer = (this._animSkipTimer || 0) - delta;
        if (this._animSkipTimer > 0) return;
        this._animSkipTimer = 0.5;
        // Batch all animation updates with distance culling
        this.updateFountainAnimation(delta);
        this.updateFireflyAnimation(delta);
        this.updateCrystalAnimation(delta);
        this.updateTorchAnimation(delta);
        this.updateGlowAnimation(delta);
        this.updateSnowParticles(delta);
        this.updateWindTurbines(delta);
    }

    updateZoneAnimations(delta) {
        // No zone animations on map itself
    }

    updateParticles(delta) {
        // No particles
    }

    setWetTerrain(active) {
        // No wet terrain
    }

    setRainPuddles(active, center) {
        // No puddles
    }

    enableDebugOverlay() {
        if (!this.debugOverlay) {
            this.debugOverlay = new DebugOverlay(this.scene, this, null, null, null);
            this.debugOverlay.enable();
        }
    }

    // =========================================================================
    // VISUAL ELEMENTS — Labels, Compass, Legend
    // =========================================================================

    _cacheAnimatedObjects() {
        // Cache references to animated objects — avoid filtering scene.children every frame
        this._cachedFireflies = this.scene.children.filter(c => c.userData?.isFirefly);
        this._cachedCrystals = this.scene.children.filter(c => c.userData?.isCrystal);
        this._cachedTorches = this.scene.children.filter(c => c.userData?.isTorch);
        this._cachedGlows = this.scene.children.filter(c => c.userData?.isGlow);
        this._cachedTurbines = this.scene.children.filter(c => c.userData?.isWindTurbine);
        this._cachedSnow = this.scene.children.find(c => c.userData?.isSnowParticles);
    }

    updateFireflyAnimation(delta) {
        const fireflies = this._cachedFireflies;
        if (!fireflies?.length) return;
        const px = this._lastPlayerPos?.x, pz = this._lastPlayerPos?.z;
        const cullDistSq = px ? 10000 : Infinity; // 100m
        const t = performance.now() * 0.001;
        for (const ff of fireflies) {
            if (px) {
                const dx = ff.position.x - px, dz = ff.position.z - pz;
                if (dx * dx + dz * dz > cullDistSq) continue;
            }
            ff.userData.angle += ff.userData.speed * delta;
            ff.position.x = ff.userData.center.x + Math.cos(ff.userData.angle) * ff.userData.radius;
            ff.position.z = ff.userData.center.z + Math.sin(ff.userData.angle) * ff.userData.radius;
            ff.position.y = ff.userData.baseY + Math.sin(t * 2 + ff.userData.blinkPhase) * 0.5;
            const blink = Math.sin(t * ff.userData.blinkRate * Math.PI * 2);
            ff.material.opacity = blink > 0 ? 0.9 : 0.1;
        }
    }

    updateCrystalAnimation(delta) {
        const crystals = this._cachedCrystals;
        if (!crystals?.length) return;
        const px = this._lastPlayerPos?.x, pz = this._lastPlayerPos?.z;
        const cullDistSq = px ? 10000 : Infinity;
        const t = performance.now() * 0.001;
        for (const cr of crystals) {
            if (px) {
                const dx = cr.position.x - px, dz = cr.position.z - pz;
                if (dx * dx + dz * dz > cullDistSq) continue;
            }
            const blink = Math.sin(t * cr.userData.blinkRate * Math.PI * 2);
            cr.material.emissiveIntensity = 2.0 + blink * 2.0;
            cr.rotation.y += delta * 0.5;
        }
    }

    updateTorchAnimation(delta) {
        const torches = this._cachedTorches;
        if (!torches?.length) return;
        const px = this._lastPlayerPos?.x, pz = this._lastPlayerPos?.z;
        const cullDistSq = px ? 10000 : Infinity;
        const t2 = performance.now() * 0.001;
        for (const tc of torches) {
            if (px) {
                const dx = tc.position.x - px, dz = tc.position.z - pz;
                if (dx * dx + dz * dz > cullDistSq) continue;
            }
            const flicker = Math.sin(t2 * tc.userData.blinkRate * Math.PI * 2) * 0.5 + 0.5;
            tc.scale.set(
                0.8 + flicker * 0.4,
                0.8 + flicker * 0.4,
                0.8 + flicker * 0.4
            );
            tc.material.emissiveIntensity = 5.0 + flicker * 8.0;
        }
    }

    updateGlowAnimation(delta) {
        const glows = this._cachedGlows;
        if (!glows?.length) return;
        const px = this._lastPlayerPos?.x, pz = this._lastPlayerPos?.z;
        const cullDistSq = px ? 10000 : Infinity;
        const t = performance.now() * 0.001;
        for (const g of glows) {
            if (px) {
                const dx = g.position.x - px, dz = g.position.z - pz;
                if (dx * dx + dz * dz > cullDistSq) continue;
            }
            const pulse = Math.sin(t * 2) * 0.3 + 0.7;
            g.material.opacity = 0.3 + pulse * 0.4;
            g.scale.setScalar(0.8 + pulse * 0.3);
        }
    }

    updateFountainAnimation(delta) {
        // Cache fountain reference instead of searching every frame
        if (!this._cachedFountain) {
            for (const child of this.scene.children) {
                if (child.userData && child.userData.isFountain) {
                    this._cachedFountain = child;
                    break;
                }
            }
        }
        const fountain = this._cachedFountain;
        if (!fountain) return;

        // Distance check — skip if player > 200m away
        if (this._lastPlayerPos) {
            const dx = this._lastPlayerPos.x - fountain.position.x;
            const dz = this._lastPlayerPos.z - fountain.position.z;
            if (dx * dx + dz * dz > 40000) return; // 200m²
        }

        const time = performance.now() * 0.001;

        // Струи воды — пульсация прозрачности и масштаба
        const streams = fountain.userData.streams;
        if (streams) {
            for (const stream of streams) {
                const pulse = 0.5 + Math.sin(time * 3 + stream.userData.streamAngle) * 0.2;
                stream.material.opacity = 0.5 + pulse * 0.3;
                stream.material.emissiveIntensity = 0.2 + pulse * 0.15;
                stream.scale.x = 1 + Math.sin(time * 4 + stream.userData.streamAngle) * 0.15;
                stream.scale.z = stream.scale.x;
            }
        }

        // Каdrops падают вдоль струй от верхней чаши к бассейну
        const drops = fountain.userData.drops;
        if (drops) {
            for (const drop of drops) {
                const speed = drop.userData.dropSpeed || 5;
                drop.position.y -= speed * delta;
                const progress = 1 - (drop.position.y - (drop.userData.dropEndY || 1.2)) / ((drop.userData.dropStartY || 5.4) - (drop.userData.dropEndY || 1.2));
                const scale = 0.4 + Math.max(0, Math.min(1, progress)) * 0.8;
                drop.scale.setScalar(scale);
                if (drop.position.y < (drop.userData.dropEndY || 1.2)) {
                    drop.position.y = drop.userData.dropStartY || 5.4;
                    drop.scale.setScalar(0.4);
                }
            }
        }

        // Брызги у поверхности бассейна
        const splashes = fountain.userData.splashes;
        if (splashes) {
            for (const splash of splashes) {
                const phase = splash.userData.splashPhase;
                splash.position.y = 1.35 + Math.sin(time * 5 + phase) * 0.15;
                splash.scale.setScalar(0.5 + Math.sin(time * 7 + phase) * 0.3);
            }
        }

        // Пульсация воды в бассейнах
        for (const child of fountain.children) {
            if (child.userData?.isWater) {
                child.material.emissiveIntensity = 0.3 + Math.sin(time * 2) * 0.1;
                child.scale.y = 1 + Math.sin(time * 3) * 0.05;
            }
        }
    }

    /**
     * Post-process map meshes and convert compatible groups to InstancedMesh.
     */
    _optimizeInstancing(minCount = 50) {
        this.instancedMeshSystem = new InstancedMeshSystem(this.pool);
        const result = this.instancedMeshSystem.optimize(this.scene, minCount);
        for (const im of result.instancedMeshes) {
            this._meshes.push(im);
        }
        return result;
    }
}
