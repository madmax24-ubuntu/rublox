import * as THREE from "three";
import { MapGeneratorNode } from "./MapGeneratorNode.js?v=2";
import { AABBGrid } from "./AABBGrid.js";
import { DebugOverlay } from "./DebugOverlay.js";

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
    militaryTerrain: 0x795548,
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
        this._floorTiles = [];
        this._spawnTiles = [];
        this._meshes = [];
        this._cullDistance = 180;
        this._cullDistanceMobile = 110;
        const _origAdd = this.scene.add.bind(this.scene);
        this.scene.add = (obj) => {
            if (obj.isMesh || obj.isGroup || obj.isInstancedMesh) {
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

        // Phase 8: Cover objects
        this._placeCoverObjects();

        // Phase 9: Logical connections between biomes
        this._generateBiomeConnections();

        // Phase 9.8: Map perimeter walls (glass/blue like reference)
        this._generatePerimeterWalls();

        // Phase 9.9: Compass rose markers
        this._generateCompassMarkers();

        // Phase 9.5: Build collider grid for spatial queries
        this._rebuildColliderGrid();

        // Phase 10: Spawn pads (filtered, no duplicates)
        this._buildSpawnPads();

        // Phase 11: Finalize
        this._logProgress(0.95);
        this.aabbGrid = new AABBGrid(2.0);
        this.aabbGrid.buildFromColliders(this.colliders);
        this._logProgress(1.0);
        this._resolveReady?.();
    }

    _reset() {
        this.colliders = [];
        this.spawnPads = [];
        this.heightMap = null;
        this._terrainMaterial = null;
        this._floorTiles = [];
        this._spawnTiles = [];
        this._buildings = [];

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
            const geo = new THREE.PlaneGeometry(HALF, HALF);
            geo.rotateX(-Math.PI / 2);
            const mat = new THREE.MeshStandardMaterial({
                color: q.color,
                roughness: 0.9,
                flatShading: true
            });
            const plane = new THREE.Mesh(geo, mat);
            plane.position.set(q.x, 0.01, q.z); // Raise above platform base (y=0) so terrain is visible
            plane.userData.mapGenerated = true;
            plane.userData.walkable = true;
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
            if (child.userData && !child.userData.mapGenerated && child.position.length() < 100) {
                child.userData.mapGenerated = true;
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
        const baseRadius = 27; // cover all 50 pads at edgeRadius=18
        this.addColliderBox(new THREE.Vector3(0, 1, 0), baseRadius * 2, 2, baseRadius * 2, true);

        // Fountain collision — solid non-walkable volume (fountain positioned at y=2 in scene)
        this.addColliderBox(new THREE.Vector3(0, 3.0, 0), 7, 2.5, 7, false);
        this.addColliderBox(new THREE.Vector3(0, 5.0, 0), 2, 8, 2, false);
        this.addColliderBox(new THREE.Vector3(0, 7.8, 0), 3, 1.2, 3, false);
    }

    // =========================================================================
    // RIVER — Thin dividers between quadrants
    // =========================================================================
    _generateRiver() {
        const riverMat = new THREE.MeshStandardMaterial({
            color: COLORS.river,
            roughness: 0.2,
            metalness: 0.3,
            transparent: true,
            opacity: 0.6
        });

        // Vertical river (thin line through center)
        const riverGeo = new THREE.PlaneGeometry(2, MAP_SIZE, 1, 1);
        riverGeo.rotateX(-Math.PI / 2);
        const river = new THREE.Mesh(riverGeo, riverMat);
        river.position.set(0, 0.02, 0);
        river.userData.mapGenerated = true;
        this.scene.add(river);

        // Horizontal river
        const river2 = new THREE.Mesh(riverGeo.clone(), riverMat.clone());
        river2.rotation.y = Math.PI / 2;
        river2.position.set(0, 0.02, 0);
        river2.userData.mapGenerated = true;
        this.scene.add(river2);
    }

    // =========================================================================
    // BIOME BOUNDARIES — Clear visual separators between quadrants (no walls)
    // =========================================================================
     _placeBiomeBoundaries() {
         // No walls needed - biomes are separated by terrain and river
     }

    _addBridge(x, z) {
        const bridgeMat = new THREE.MeshStandardMaterial({
            color: COLORS.bridge,
            roughness: 0.8,
            flatShading: true
        });

        // Bridge deck
        const deckGeo = new THREE.BoxGeometry(12, 0.5, 8);
        const deck = new THREE.Mesh(deckGeo, bridgeMat);
        deck.position.set(x, 1, z);
        deck.userData.mapGenerated = true;
        deck.userData.walkable = true;
        this.scene.add(deck);
        this.addColliderBox(new THREE.Vector3(x, 1, z), 12, 0.5, 8, true);

        // Bridge rails
        const railGeo = new THREE.BoxGeometry(0.3, 1.5, 8);
        for (let side of [-1, 1]) {
            const rail = new THREE.Mesh(railGeo, bridgeMat.clone());
            rail.position.set(x + side * 5.5, 1.5, z);
            rail.userData.mapGenerated = true;
            this.scene.add(rail);
        }

        // Bridge supports
        const supportGeo = new THREE.BoxGeometry(1, 2, 1);
        const supportMat = new THREE.MeshStandardMaterial({
            color: 0x6d4c41,
            roughness: 0.8
        });
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
        const forestFloorMat = new THREE.MeshStandardMaterial({
            color: 0x2d5a27, roughness: 0.95, flatShading: true
        });
        const forestFloorGeo = new THREE.PlaneGeometry(size, size);
        const forestFloor = new THREE.Mesh(forestFloorGeo, forestFloorMat);
        forestFloor.rotation.x = -Math.PI / 2;
        forestFloor.position.set(startX + size / 2, 0.02, startZ + size / 2);
        forestFloor.userData.mapGenerated = true;
        this.scene.add(forestFloor);

        // Центральная поляна — светлая зона с травой
        const clearingCX = startX + size * 0.5;
        const clearingCZ = startZ + size * 0.5;
        const clearingRadius = 30;

        // Clearing ground patch
        const clearingGeo = new THREE.CircleGeometry(clearingRadius, 24);
        clearingGeo.rotateX(-Math.PI / 2);
        const clearingMat = new THREE.MeshStandardMaterial({
            color: 0x66bb6a, roughness: 0.9, flatShading: true
        });
        const clearingMesh = new THREE.Mesh(clearingGeo, clearingMat);
        clearingMesh.position.set(clearingCX, 0.06, clearingCZ);
        clearingMesh.userData.mapGenerated = true;
        clearingMesh.userData.walkable = true;
        this.scene.add(clearingMesh);

        // Реки внутри биома — более видимые
        this._addForestRiver(startX + size * 0.3, startZ, startX + size * 0.7, startZ + size * 0.3);
        this._addForestRiver(startZ + size * 0.2, startX, startZ + size * 0.8, startX + size * 0.5);
        this._addForestRiver(clearingCX, clearingCZ - 15, startX + size * 0.1, startZ + size * 0.9);

        // Grid-based tree placement with narrow corridors
        const gridStep = 16;
        const corridorWidth = 4; // Narrow corridors for player movement
        const treeTypes = ['pine', 'oak', 'birch', 'spruce'];

        for (let gx = startX + 8; gx < startX + size - 8; gx += gridStep) {
            for (let gz = startZ + 8; gz < startZ + size - 8; gz += gridStep) {
                // Skip if in clearing
                if (this._distToClearing(gx, gz, clearingCX, clearingCZ, clearingRadius)) continue;

                // Add jitter for natural look
                const jitterX = (this._rand() - 0.5) * 6;
                const jitterZ = (this._rand() - 0.5) * 6;
                const tx = gx + jitterX;
                const tz = gz + jitterZ;

                // Skip if too close to river
                const distToRiverX = Math.abs(tx - clearingCX);
                const distToRiverZ = Math.abs(tz - clearingCZ);
                if (distToRiverX < 5 && distToRiverZ < 5) continue;

                // Pick tree type based on position
                const treeType = treeTypes[Math.floor(this._rand() * treeTypes.length)];
                this._addForestTree(tx, tz, treeType);
            }
        }

        // Dense undergrowth — bushes and flowers
        for (let i = 0; i < 30; i++) {
            const bx = startX + 5 + this._rand() * (size - 10);
            const bz = startZ + 5 + this._rand() * (size - 10);
            if (!this._distToClearing(bx, bz, clearingCX, clearingCZ, clearingRadius + 5)) {
                this._addForestBush(bx, bz);
            }
        }

        for (let i = 0; i < 20; i++) {
            const fx = startX + 5 + this._rand() * (size - 10);
            const fz = startZ + 5 + this._rand() * (size - 10);
            if (!this._distToClearing(fx, fz, clearingCX, clearingCZ, clearingRadius + 5)) {
                this._addForestFlowers(fx, fz);
            }
        }

        // Fallen logs for atmosphere
        for (let i = 0; i < 8; i++) {
            const lx = startX + 10 + this._rand() * (size - 20);
            const lz = startZ + 10 + this._rand() * (size - 20);
            if (!this._distToClearing(lx, lz, clearingCX, clearingCZ, clearingRadius + 5)) {
                this._addFallenLog(lx, lz);
            }
        }

        // Prominent cabins on clearing
        this._addTwoStoryCabin(clearingCX - 15, clearingCZ - 8);
        this._addTwoStoryCabin(clearingCX + 15, clearingCZ - 8);
        this._addTwoStoryCabin(clearingCX, clearingCZ + 15);

        // Additional cabins with details (campfire, barrels, chests)
        this._addTwoStoryCabin(clearingCX - 10, clearingCZ + 15);
        this._addTwoStoryCabin(clearingCX + 10, clearingCZ + 15);

        // Campfire between cabins
        this._addCampfire(clearingCX, clearingCZ + 5);

        // Rocks and moss on clearing
        this._addClearingRocks(clearingCX, clearingCZ, clearingRadius);

        // Edge trees — dense forest near biome borders
        this._addEdgeTrees(startX, startZ, size);

        // Atmospheric fireflies
        this._addFireflies(startX, startZ, size, clearingCX, clearingCZ);

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
            const width = 4 + this._rand() * 2;
            const riverMat = new THREE.MeshStandardMaterial({
                color: 0x29b6f6,
                roughness: 0.1,
                metalness: 0.5,
                transparent: true,
                opacity: 0.8
            });

            const riverGeo = new THREE.PlaneGeometry(width, 5);
            riverGeo.rotateX(-Math.PI / 2);
            const river = new THREE.Mesh(riverGeo, riverMat);
            river.position.set(rx, 0.04, rz);
            river.userData.mapGenerated = true;
            this.scene.add(river);

            // River banks — rocks along edges
            for (let side of [-1, 1]) {
                const bankGeo = new THREE.DodecahedronGeometry(0.4 + this._rand() * 0.4, 0);
                const bankMat = new THREE.MeshStandardMaterial({
                    color: 0x757575, roughness: 0.95, flatShading: true
                });
                const bank = new THREE.Mesh(bankGeo, bankMat);
                bank.position.set(rx + side * width / 2, 0.15, rz + (this._rand() - 0.5) * 2);
                bank.userData.mapGenerated = true;
                this.scene.add(bank);
            }
        }
    }

    _addTwoStoryCabin(x, z) {
        const cabin = new THREE.Group();
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x5d4037, roughness: 0.75, flatShading: true
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x3e2723, roughness: 0.85, flatShading: true
        });
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x795548, roughness: 0.8, flatShading: true
        });

        // Размеры хижины — более крупные и заметные
        const w = 14;
        const d = 12;
        const storyH = 5; // Высота этажа

        // Первый этаж - пол
        const floor1Geo = new THREE.BoxGeometry(w, 0.3, d);
        const floor1 = new THREE.Mesh(floor1Geo, woodMat.clone());
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
            const sideGeo = new THREE.BoxGeometry(wallThick, storyH, d);
            const sideWall = new THREE.Mesh(sideGeo, wallMat.clone());
            sideWall.position.set(side * w / 2, storyH / 2 + 0.3, 0);
            sideWall.userData.mapGenerated = true;
            cabin.add(sideWall);
        }

        // Передняя стена с дверью
        const doorW = 1.5;
        const doorH = 2.5;
        const frontWallLeft = new THREE.BoxGeometry((w / 2 - doorW / 2 - 0.5), storyH, wallThick);
        const frontWallRight = new THREE.BoxGeometry((w / 2 - doorW / 2 - 0.5), storyH, wallThick);
        const frontWallTop = new THREE.BoxGeometry(w, storyH - doorH - 0.5, wallThick);

        const fwl = new THREE.Mesh(frontWallLeft, wallMat.clone());
        fwl.position.set(-w / 4 + doorW / 2 + 0.25, storyH / 2 + 0.3, d / 2);
        fwl.userData.mapGenerated = true;
        cabin.add(fwl);

        const fwr = new THREE.Mesh(frontWallRight, wallMat.clone());
        fwr.position.set(w / 4 - doorW / 2 - 0.25, storyH / 2 + 0.3, d / 2);
        fwr.userData.mapGenerated = true;
        cabin.add(fwr);

        const fwt = new THREE.Mesh(frontWallTop, wallMat.clone());
        fwt.position.set(0, doorH + (storyH - doorH - 0.5) / 2 + 0.3, d / 2);
        fwt.userData.mapGenerated = true;
        cabin.add(fwt);

        // Задняя стена
        const backGeo = new THREE.BoxGeometry(w, storyH, wallThick);
        const backWall = new THREE.Mesh(backGeo, wallMat.clone());
        backWall.position.set(0, storyH / 2 + 0.3, -d / 2);
        backWall.userData.mapGenerated = true;
        cabin.add(backWall);

        // Дверь
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.9 });
        const doorGeo = new THREE.BoxGeometry(doorW, doorH, 0.1);
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, doorH / 2 + 0.3, d / 2 + 0.05);
        door.userData.mapGenerated = true;
        cabin.add(door);

        // Окна первого этажа
        const winMat = new THREE.MeshStandardMaterial({
            color: 0xfff9c4, roughness: 0.3, metalness: 0.1,
            emissive: 0xfff9c4, emissiveIntensity: 0.1
        });
        for (let side of [-1, 1]) {
            const winGeo = new THREE.BoxGeometry(0.1, 1.2, 1.2);
            const win = new THREE.Mesh(winGeo, winMat.clone());
            win.position.set(side * w / 2 + 0.05, 2 + 0.3, 0);
            win.userData.mapGenerated = true;
            cabin.add(win);
        }

        // Второй этаж - пол
        const floor2Geo = new THREE.BoxGeometry(w, 0.3, d);
        const floor2 = new THREE.Mesh(floor2Geo, woodMat.clone());
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
            const sideGeo = new THREE.BoxGeometry(wallThick, storyH, d);
            const sideWall = new THREE.Mesh(sideGeo, wallMat.clone());
            sideWall.position.set(side * w / 2, storyH + storyH / 2 + 0.3, 0);
            sideWall.userData.mapGenerated = true;
            cabin.add(sideWall);
        }

        // Передняя стена второго этажа
        const front2Geo = new THREE.BoxGeometry(w, storyH, wallThick);
        const front2 = new THREE.Mesh(front2Geo, wallMat.clone());
        front2.position.set(0, storyH + storyH / 2 + 0.3, d / 2);
        front2.userData.mapGenerated = true;
        cabin.add(front2);

        // Задняя стена второго этажа
        const back2 = new THREE.Mesh(front2Geo, wallMat.clone());
        back2.position.set(0, storyH + storyH / 2 + 0.3, -d / 2);
        back2.userData.mapGenerated = true;
        cabin.add(back2);

        // Окна второго этажа
        for (let side of [-1, 1]) {
            const winGeo = new THREE.BoxGeometry(0.1, 1.2, 1.2);
            const win = new THREE.Mesh(winGeo, winMat.clone());
            win.position.set(side * w / 2 + 0.05, storyH + 2 + 0.3, 0);
            win.userData.mapGenerated = true;
            cabin.add(win);
        }

        // Крыша
        const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.75, 3, 4);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, storyH * 2 + 1.8, 0);
        roof.rotation.y = Math.PI / 4;
        roof.userData.mapGenerated = true;
        cabin.add(roof);

        // Лестница снаружи (спереди)
        const stairCount = 6;
        const stairH = (storyH + 0.3) / stairCount;
        for (let i = 0; i < stairCount; i++) {
            const stepGeo = new THREE.BoxGeometry(2, 0.2, 1.2);
            const step = new THREE.Mesh(stepGeo, woodMat.clone());
            step.position.set(0, i * stairH + 0.1, d / 2 + 1.5);
            step.userData.mapGenerated = true;
            step.userData.walkable = true;
            cabin.add(step);

            this.addColliderBox(
                new THREE.Vector3(x, i * stairH + 0.1, z + d / 2 + 1.5),
                2, 0.2, 1.2, true
            );
        }

        // Лестница внутри (спирали от первого ко второму этажу)
        const innerStairCount = 10;
        const innerStairH = storyH / innerStairCount;
        const innerStairR = 1.5;
        for (let i = 0; i < innerStairCount; i++) {
            const angle = i * Math.PI / 6;
            const sx = Math.cos(angle) * innerStairR;
            const sz = Math.sin(angle) * innerStairR - d / 4;
            const stepGeo = new THREE.BoxGeometry(1.2, innerStairH, 0.6);
            const step = new THREE.Mesh(stepGeo, woodMat.clone());
            step.position.set(sx, i * innerStairH + 0.3, sz);
            step.rotation.y = -angle;
            step.userData.mapGenerated = true;
            step.userData.walkable = true;
            cabin.add(step);
        }

        // Сундук внутри (на первом этаже)
        const chestMat = new THREE.MeshStandardMaterial({
            color: 0x8B4513, roughness: 0.7, flatShading: true
        });
        const chestGeo = new THREE.BoxGeometry(1.2, 0.8, 0.8);
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.set(0, 0.7, -d / 4);
        chest.userData.mapGenerated = true;
        cabin.add(chest);

        this.addColliderBox(
            new THREE.Vector3(x, 0.7, z - d / 4),
            1.2, 0.8, 0.8, false
        );

        // Сундук на втором этаже
        const chest2 = new THREE.Mesh(chestGeo.clone(), chestMat.clone());
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

        // Коллайдеры для стен
        this.addColliderBox(
            new THREE.Vector3(x, storyH / 2 + 0.3, z),
            w + 0.4, storyH, d + 0.4, false
        );
        this.addColliderBox(
            new THREE.Vector3(x, storyH + storyH / 2 + 0.3, z),
            w + 0.4, storyH, d + 0.4, false
        );

        // Spawn pads managed by MapGeneratorNode.js — one per quadrant
    }

    _addForestBush(x, z) {
        const bush = new THREE.Group();
        const bushMat = new THREE.MeshStandardMaterial({
            color: 0x388e3c,
            roughness: 0.95,
            flatShading: true
        });

        // Multiple spheres for natural bush shape
        const count = 3 + Math.floor(this._rand() * 3);
        for (let i = 0; i < count; i++) {
            const size = 0.5 + this._rand() * 1.2;
            const geo = new THREE.DodecahedronGeometry(size, 0);
            const mesh = new THREE.Mesh(geo, bushMat.clone());
            mesh.position.set(
                (this._rand() - 0.5) * 2,
                size * 0.6,
                (this._rand() - 0.5) * 2
            );
            mesh.userData.mapGenerated = true;
            bush.add(mesh);
        }

        bush.position.set(x, 0, z);
        bush.userData.mapGenerated = true;
        this.scene.add(bush);
    }

    _addForestClearing(x, z) {
        // Clearing ground
        const clearingGeo = new THREE.CircleGeometry(6, 16);
        clearingGeo.rotateX(-Math.PI / 2);
        const clearingMat = new THREE.MeshStandardMaterial({
            color: 0x66bb6a,
            roughness: 1.0,
            flatShading: true
        });
        const clearing = new THREE.Mesh(clearingGeo, clearingMat);
        clearing.position.set(x, 0.02, z);
        clearing.userData.mapGenerated = true;
        clearing.userData.walkable = true;
        this.scene.add(clearing);

        // Small stream from clearing to river
        const streamMat = new THREE.MeshStandardMaterial({
            color: 0x29b6f6,
            roughness: 0.2,
            metalness: 0.3,
            transparent: true,
            opacity: 0.6
        });
        const streamGeo = new THREE.PlaneGeometry(1.5, 15, 1, 1);
        streamGeo.rotateX(-Math.PI / 2);
        const stream = new THREE.Mesh(streamGeo, streamMat);
        stream.position.set(x + 3, 0.04, z - 5);
        stream.userData.mapGenerated = true;
        this.scene.add(stream);
    }

    // Small flowers in forest
    _addForestFlowers(x, z) {
        const flowerMat = new THREE.MeshStandardMaterial({
            color: 0xffeb3b,
            roughness: 0.8
        });
        for (let i = 0; i < 5; i++) {
            const flowerGeo = new THREE.SphereGeometry(0.15, 4, 4);
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
        const trunkMat = new THREE.MeshStandardMaterial({
            color: COLORS.forestTrunk, roughness: 0.8
        });

        if (type === 'pine') {
            this._addPineTree(x, z, trunkMat);
        } else if (type === 'oak') {
            this._addOakTree(x, z, trunkMat);
        } else if (type === 'birch') {
            this._addBirchTree(x, z, trunkMat);
        } else if (type === 'spruce') {
            this._addSpruceTree(x, z, trunkMat);
        }
    }

    _addPineTree(x, z, trunkMat) {
        const trunkH = 14 + this._rand() * 10;
        const trunkR = 0.6 + this._rand() * 0.4;

        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.4, trunkR, trunkH, 6);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat.clone());
        trunk.position.set(x, trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        this.scene.add(trunk);
        this.addColliderBox(new THREE.Vector3(x, trunkH / 2, z), trunkR * 2, trunkH, trunkR * 2, false);

        const crownColors = [0x1b5e20, 0x2e7d32, 0x388e3c];
        const crownColor = crownColors[Math.floor(this._rand() * crownColors.length)];
        const crownMat = new THREE.MeshStandardMaterial({
            color: crownColor, roughness: 0.9, flatShading: true
        });

        // Tall cone layers
        for (let layer = 0; layer < 5; layer++) {
            const layerR = 4 - layer * 0.7;
            const layerY = trunkH - 3 + layer * 3;
            const crownGeo = new THREE.ConeGeometry(layerR, 4, 7);
            const crown = new THREE.Mesh(crownGeo, crownMat.clone());
            crown.position.set(x, layerY, z);
            crown.userData.mapGenerated = true;
            this.scene.add(crown);
        }
    }

    _addOakTree(x, z, trunkMat) {
        const trunkH = 8 + this._rand() * 6;
        const trunkR = 1.0 + this._rand() * 0.6;

        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.5, trunkR, trunkH, 6);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat.clone());
        trunk.position.set(x, trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        this.scene.add(trunk);
        this.addColliderBox(new THREE.Vector3(x, trunkH / 2, z), trunkR * 2, trunkH, trunkR * 2, false);

        const crownColors = [0x33691e, 0x4caf50, 0x66bb6a];
        const crownColor = crownColors[Math.floor(this._rand() * crownColors.length)];
        const crownMat = new THREE.MeshStandardMaterial({
            color: crownColor, roughness: 0.9, flatShading: true
        });

        // Broad, rounded crown — multiple overlapping spheres
        const crownCount = 4 + Math.floor(this._rand() * 3);
        for (let i = 0; i < crownCount; i++) {
            const r = 2 + this._rand() * 2;
            const crownGeo = new THREE.DodecahedronGeometry(r, 0);
            const crown = new THREE.Mesh(crownGeo, crownMat.clone());
            crown.position.set(
                x + (this._rand() - 0.5) * 3,
                trunkH + (this._rand() - 0.5) * 2,
                z + (this._rand() - 0.5) * 3
            );
            crown.userData.mapGenerated = true;
            this.scene.add(crown);
        }
    }

    _addBirchTree(x, z, trunkMat) {
        const trunkH = 16 + this._rand() * 8;
        const trunkR = 0.4 + this._rand() * 0.3;

        // Birch has white/light trunk
        const birchMat = new THREE.MeshStandardMaterial({
            color: 0xf5f5f5, roughness: 0.6
        });
        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.4, trunkR, trunkH, 6);
        const trunk = new THREE.Mesh(trunkGeo, birchMat);
        trunk.position.set(x, trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        this.scene.add(trunk);
        this.addColliderBox(new THREE.Vector3(x, trunkH / 2, z), trunkR * 2, trunkH, trunkR * 2, false);

        // Small green clusters at top
        const crownColors = [0x7cb342, 0x8bc34a, 0x9ccc65];
        const crownColor = crownColors[Math.floor(this._rand() * crownColors.length)];
        const crownMat = new THREE.MeshStandardMaterial({
            color: crownColor, roughness: 0.85, flatShading: true
        });

        const crownCount = 3 + Math.floor(this._rand() * 2);
        for (let i = 0; i < crownCount; i++) {
            const r = 1.5 + this._rand() * 1.5;
            const crownGeo = new THREE.DodecahedronGeometry(r, 0);
            const crown = new THREE.Mesh(crownGeo, crownMat.clone());
            crown.position.set(
                x + (this._rand() - 0.5) * 2,
                trunkH - 1 + (this._rand() - 0.5) * 3,
                z + (this._rand() - 0.5) * 2
            );
            crown.userData.mapGenerated = true;
            this.scene.add(crown);
        }
    }

    _addSpruceTree(x, z, trunkMat) {
        const trunkH = 10 + this._rand() * 8;
        const trunkR = 0.5 + this._rand() * 0.4;

        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.4, trunkR, trunkH, 6);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat.clone());
        trunk.position.set(x, trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        this.scene.add(trunk);
        this.addColliderBox(new THREE.Vector3(x, trunkH / 2, z), trunkR * 2, trunkH, trunkR * 2, false);

        // Spruce: wide, layered cone shape
        const crownColors = [0x004d40, 0x00695c, 0x00897b];
        const crownColor = crownColors[Math.floor(this._rand() * crownColors.length)];
        const crownMat = new THREE.MeshStandardMaterial({
            color: crownColor, roughness: 0.85, flatShading: true
        });

        for (let layer = 0; layer < 6; layer++) {
            const layerR = 5 - layer * 0.7;
            const layerY = trunkH - 5 + layer * 2.5;
            const crownGeo = new THREE.ConeGeometry(layerR, 3, 8);
            const crown = new THREE.Mesh(crownGeo, crownMat.clone());
            crown.position.set(x, layerY, z);
            crown.userData.mapGenerated = true;
            this.scene.add(crown);
        }
    }

    _addFallenLog(x, z) {
        const length = 4 + this._rand() * 4;
        const radius = 0.4 + this._rand() * 0.3;
        const geo = new THREE.CylinderGeometry(radius * 0.8, radius, length, 6);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x5d4037, roughness: 0.9, flatShading: true
        });
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
        // Create winding paths radiating from clearing to edges
        const pathMat = new THREE.MeshStandardMaterial({
            color: COLORS.forestPath,
            roughness: 1.0,
            flatShading: true
        });

        const clearingCX = -130;
        const clearingCZ = -130;

        // 4 paths radiating from clearing to quadrant edges
        const directions = [
            { dx: -1, dz: -1 }, // NW corner
            { dx: -1, dz: 1 },  // SW
            { dx: 1, dz: -1 },  // NE
            { dx: 1, dz: 1 }    // SE
        ];

        for (const dir of directions) {
            let px = clearingCX + dir.dx * 30;
            let pz = clearingCZ + dir.dz * 30;

            for (let i = 0; i < 20; i++) {
                const segGeo = new THREE.BoxGeometry(3, 0.05, 4);
                const seg = new THREE.Mesh(segGeo, pathMat.clone());
                seg.position.set(px, 0.03, pz);
                seg.userData.mapGenerated = true;
                seg.userData.walkable = true;
                this.scene.add(seg);

                px += dir.dx * 5 + (this._rand() - 0.5) * 3;
                pz += dir.dz * 5 + (this._rand() - 0.5) * 3;

                if (px < -245 || px > -15 || pz < -245 || pz > -15) break;
            }
        }

        // SE path connects to center — extends from clearing edge to biome border
        {
            let px = clearingCX + 25;
            let pz = clearingCZ + 25;
            const targetX = -15;
            const targetZ = -15;
            for (let i = 0; i < 15; i++) {
                const t = i / 14;
                const segGeo = new THREE.BoxGeometry(3, 0.05, 4);
                const seg = new THREE.Mesh(segGeo, pathMat.clone());
                seg.position.set(
                    px + (targetX - px) * t,
                    0.03,
                    pz + (targetZ - pz) * t
                );
                seg.userData.mapGenerated = true;
                seg.userData.walkable = true;
                this.scene.add(seg);
                px += (targetX - px) * 0.15 + (this._rand() - 0.5) * 2;
                pz += (targetZ - pz) * 0.15 + (this._rand() - 0.5) * 2;
            }
        }
    }

    _addEdgeTrees(startX, startZ, size) {
        // Dense trees along all 4 biome borders
        const edgeWidth = 20;
        const treeTypes = ['pine', 'oak', 'spruce'];
        const positions = [];

        // Left border (west)
        for (let z = startZ + 10; z < startZ + size - 10; z += 8) {
            for (let ox = 0; ox < edgeWidth; ox += 4) {
                const tx = startX + ox + (this._rand() - 0.5) * 3;
                const tz = z + (this._rand() - 0.5) * 3;
                const key = `${tx.toFixed(0)},${tz.toFixed(0)}`;
                if (!positions.includes(key)) {
                    positions.push(key);
                    const type = treeTypes[Math.floor(this._rand() * treeTypes.length)];
                    this._addForestTree(tx, tz, type);
                }
            }
        }

        // Right border (east)
        for (let z = startZ + 10; z < startZ + size - 10; z += 8) {
            for (let ox = 0; ox < edgeWidth; ox += 4) {
                const tx = startX + size - ox - (this._rand() - 0.5) * 3;
                const tz = z + (this._rand() - 0.5) * 3;
                const key = `${tx.toFixed(0)},${tz.toFixed(0)}`;
                if (!positions.includes(key)) {
                    positions.push(key);
                    const type = treeTypes[Math.floor(this._rand() * treeTypes.length)];
                    this._addForestTree(tx, tz, type);
                }
            }
        }

        // Top border (north)
        for (let x = startX + 10; x < startX + size - 10; x += 8) {
            for (let oz = 0; oz < edgeWidth; oz += 4) {
                const tx = x + (this._rand() - 0.5) * 3;
                const tz = startZ + oz + (this._rand() - 0.5) * 3;
                const key = `${tx.toFixed(0)},${tz.toFixed(0)}`;
                if (!positions.includes(key)) {
                    positions.push(key);
                    const type = treeTypes[Math.floor(this._rand() * treeTypes.length)];
                    this._addForestTree(tx, tz, type);
                }
            }
        }

        // Bottom border (south)
        for (let x = startX + 10; x < startX + size - 10; x += 8) {
            for (let oz = 0; oz < edgeWidth; oz += 4) {
                const tx = x + (this._rand() - 0.5) * 3;
                const tz = startZ + size - oz - (this._rand() - 0.5) * 3;
                const key = `${tx.toFixed(0)},${tz.toFixed(0)}`;
                if (!positions.includes(key)) {
                    positions.push(key);
                    const type = treeTypes[Math.floor(this._rand() * treeTypes.length)];
                    this._addForestTree(tx, tz, type);
                }
            }
        }
    }

    _addClearingRocks(cx, cz, radius) {
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x757575, roughness: 0.95, flatShading: true
        });
        const mossMat = new THREE.MeshStandardMaterial({
            color: 0x4caf50, roughness: 1.0, flatShading: true
        });

        // Scattered rocks around clearing edge
        for (let i = 0; i < 25; i++) {
            const angle = (i / 25) * Math.PI * 2 + (this._rand() - 0.5) * 0.3;
            const dist = radius * 0.6 + this._rand() * (radius * 0.4);
            const rx = cx + Math.cos(angle) * dist;
            const rz = cz + Math.sin(angle) * dist;
            const size = 0.3 + this._rand() * 0.8;
            const geo = new THREE.DodecahedronGeometry(size, 0);
            const rock = new THREE.Mesh(geo, Math.random() > 0.3 ? rockMat.clone() : mossMat.clone());
            rock.position.set(rx, size * 0.3, rz);
            rock.rotation.set(this._rand() * Math.PI, this._rand() * Math.PI, this._rand() * Math.PI);
            rock.userData.mapGenerated = true;
            this.scene.add(rock);
        }

        // Moss patches on clearing ground
        for (let i = 0; i < 15; i++) {
            const mx = cx + (this._rand() - 0.5) * radius * 1.2;
            const mz = cz + (this._rand() - 0.5) * radius * 1.2;
            const mossGeo = new THREE.CircleGeometry(0.5 + this._rand() * 0.8, 6);
            mossGeo.rotateX(-Math.PI / 2);
            const moss = new THREE.Mesh(mossGeo, mossMat.clone());
            moss.position.set(mx, 0.07, mz);
            moss.userData.mapGenerated = true;
            this.scene.add(moss);
        }
    }

    _addCampfire(cx, cz) {
        const campfire = new THREE.Group();

        // Stone ring
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x616161, roughness: 0.9, flatShading: true
        });
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const stoneGeo = new THREE.DodecahedronGeometry(0.3, 0);
            const stone = new THREE.Mesh(stoneGeo, stoneMat);
            stone.position.set(Math.cos(angle) * 0.8, 0.2, Math.sin(angle) * 0.8);
            stone.rotation.set(this._rand(), this._rand(), this._rand());
            stone.userData.mapGenerated = true;
            campfire.add(stone);
        }

        // Logs
        const logMat = new THREE.MeshStandardMaterial({
            color: 0x5d4037, roughness: 1.0, flatShading: true
        });
        for (let i = 0; i < 3; i++) {
            const logGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.2, 5);
            const log = new THREE.Mesh(logGeo, logMat);
            log.position.set(0, 0.3, 0);
            log.rotation.z = Math.PI / 2 + (i - 1) * 0.3;
            log.rotation.y = i * Math.PI / 3;
            log.userData.mapGenerated = true;
            campfire.add(log);
        }

        // Fire glow (emissive sphere)
        const fireMat = new THREE.MeshStandardMaterial({
            color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 5.0,
            transparent: true, opacity: 0.8, flatShading: true
        });
        const fireGeo = new THREE.SphereGeometry(0.4, 6, 6);
        const fire = new THREE.Mesh(fireGeo, fireMat);
        fire.position.set(0, 0.6, 0);
        fire.userData.isCampfire = true;
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
        const barrelMat = new THREE.MeshStandardMaterial({
            color: 0x8d6e63, roughness: 0.9, flatShading: true
        });
        const bandMat = new THREE.MeshStandardMaterial({
            color: 0x424242, roughness: 0.8, metalness: 0.5, flatShading: true
        });

        // Barrel body
        const bodyGeo = new THREE.CylinderGeometry(0.5, 0.6, 1.2, 8);
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
        const fireflyMat = new THREE.MeshStandardMaterial({
            color: 0xffee58, emissive: 0xffcc00, emissiveIntensity: 10.0,
            transparent: true, opacity: 0.9, flatShading: true
        });

        for (let i = 0; i < 40; i++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = 20 + this._rand() * (size * 0.35);
            const fx = cx + Math.cos(angle) * dist;
            const fz = cz + Math.sin(angle) * dist;
            const fy = 1 + this._rand() * 3;

            const geo = new THREE.SphereGeometry(0.1, 4, 4);
            const firefly = new THREE.Mesh(geo, fireflyMat.clone());
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
        const mat = new THREE.MeshStandardMaterial({
            color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 2.0,
            roughness: 0.5, flatShading: true
        });

        // Glowing crate
        const boxGeo = new THREE.BoxGeometry(1.2, 0.8, 0.8);
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
        const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff, emissive: 0xff0000, emissiveIntensity: 2.0,
            roughness: 0.5, flatShading: true
        });

        const boxGeo = new THREE.BoxGeometry(1.0, 0.6, 0.7);
        const box = new THREE.Mesh(boxGeo, mat);
        box.position.y = 0.3;
        box.userData.mapGenerated = true;
        drop.add(box);

        // Red cross
        const crossMat = new THREE.MeshStandardMaterial({
            color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 3.0
        });
        const hGeo = new THREE.BoxGeometry(0.6, 0.05, 0.15);
        const h = new THREE.Mesh(hGeo, crossMat);
        h.position.set(0, 0.63, 0);
        h.userData.mapGenerated = true;
        drop.add(h);
        const vGeo = new THREE.BoxGeometry(0.15, 0.05, 0.5);
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
        const mat = new THREE.MeshStandardMaterial({
            color: 0x4caf50, emissive: 0x2e7d32, emissiveIntensity: 2.0,
            roughness: 0.5, flatShading: true
        });

        const boxGeo = new THREE.BoxGeometry(0.8, 0.5, 0.6);
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
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x5d4037,
            roughness: 0.75,
            flatShading: true
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x3e2723,
            roughness: 0.85,
            flatShading: true
        });

        // Large cabin
        const w = 14 + this._rand() * 6;
        const d = 10 + this._rand() * 4;
        const h = 8;

        // Walls
        const wallThick = 0.3;
        for (let side of [-1, 1]) {
            const sideGeo = new THREE.BoxGeometry(wallThick, h, d);
            const sideWall = new THREE.Mesh(sideGeo, wallMat.clone());
            sideWall.position.set(side * w / 2, h / 2, 0);
            sideWall.userData.mapGenerated = true;
            cabin.add(sideWall);
        }

        const frontGeo = new THREE.BoxGeometry(w, h, wallThick);
        const front = new THREE.Mesh(frontGeo, wallMat);
        front.position.set(0, h / 2, d / 2);
        front.userData.mapGenerated = true;
        cabin.add(front);

        const back = new THREE.Mesh(frontGeo, wallMat.clone());
        back.position.set(0, h / 2, -d / 2);
        back.userData.mapGenerated = true;
        cabin.add(back);

        // Roof (pitched)
        const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.7, 3, 4);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, h + 1.5, 0);
        roof.rotation.y = Math.PI / 4;
        roof.userData.mapGenerated = true;
        cabin.add(roof);

        // Door
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.9 });
        const doorGeo = new THREE.BoxGeometry(1.2, 2.5, 0.1);
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, 1.25, d / 2 + 0.1);
        door.userData.mapGenerated = true;
        cabin.add(door);

        // Windows
        const winMat = new THREE.MeshStandardMaterial({
            color: 0xfff9c4,
            roughness: 0.3,
            metalness: 0.1,
            transparent: true,
            opacity: 0.7
        });
        for (let wx of [-2, 2]) {
            const winGeo = new THREE.BoxGeometry(0.8, 1, 0.1);
            const win = new THREE.Mesh(winGeo, winMat.clone());
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
        const geo = new THREE.DodecahedronGeometry(size, 0);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x787878,
            roughness: 0.95,
            flatShading: true
        });
        const rock = new THREE.Mesh(geo, mat);
        rock.position.set(x, size * 0.4, z);
        rock.rotation.set(
            this._rand() * Math.PI,
            this._rand() * Math.PI,
            this._rand() * Math.PI
        );
        rock.userData.mapGenerated = true;
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

        const wallHeight = 12; // Высокие стены

        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x666666, roughness: 0.85, flatShading: true
        });
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x888888, roughness: 0.9, flatShading: true
        });
        const darkMat = new THREE.MeshStandardMaterial({
            color: COLORS.mazeTower, roughness: 0.9, flatShading: true
        });

        // Каменный пол по всему биому
        const stoneFloorGeo = new THREE.PlaneGeometry(size, size);
        const stoneFloor = new THREE.Mesh(stoneFloorGeo, floorMat.clone());
        stoneFloor.rotation.x = -Math.PI / 2;
        stoneFloor.position.set(startX + size / 2, 0.05, startZ + size / 2);
        stoneFloor.userData.mapGenerated = true;
        this.scene.add(stoneFloor);

        // Maze grid - cell size 5 для широких коридоров
        const cellSize = 5;
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
        for (let i = 0; i < 20; i++) {
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
        const wallColors = [0x666666, 0x777777, 0x5a5a5a, 0x6b6b6b, 0x5e5e5e];
        for (let r = 0; r < mazeRows; r++) {
            for (let c = 0; c < mazeCols; c++) {
                const wx = startX + c * cellSize + cellSize / 2;
                const wz = startZ + r * cellSize + cellSize / 2;

                if (grid[r][c] === 1) {
                    const geo = new THREE.BoxGeometry(cellSize - 0.1, wallHeight, cellSize - 0.1);
                    const color = wallColors[Math.floor(this._rand() * wallColors.length)];
                    const wallMat2 = new THREE.MeshStandardMaterial({
                        color, roughness: 0.85, flatShading: true
                    });
                    const wall = new THREE.Mesh(geo, wallMat2);
                    wall.position.set(wx, wallHeight / 2, wz);
                    wall.userData.mapGenerated = true;
                    this.scene.add(wall);

                    this.addColliderBox(
                        new THREE.Vector3(wx, wallHeight / 2, wz),
                        cellSize - 0.1, wallHeight, cellSize - 0.1, false
                    );
                }
            }
        }

        // Central clearing with loot - open area in the center
        const clearingCX = startX + size * 0.5;
        const clearingCZ = startZ + size * 0.5;
        const clearingRadius = 15;

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

        // Spawn loot on clearing — glowing detailed crates
        this._addMazeLootChests(clearingCX, clearingCZ, clearingRadius);

        // Central tall tower with spiral staircase
        const towerCX = clearingCX;
        const towerCZ = clearingCZ;
        const towerHeight = 30;
        const towerRadius = 4;

        // Tower walls (hollow cylinder)
        const outerWallGeo = new THREE.CylinderGeometry(towerRadius, towerRadius, towerHeight, 16, 1, true);
        const outerWall = new THREE.Mesh(outerWallGeo, wallMat.clone());
        outerWall.position.set(towerCX, towerHeight / 2, towerCZ);
        outerWall.userData.mapGenerated = true;
        this.scene.add(outerWall);

        // Tower floor
        const floorGeo = new THREE.CylinderGeometry(towerRadius, towerRadius, 0.5, 16);
        const floorMesh = new THREE.Mesh(floorGeo, darkMat.clone());
        floorMesh.position.set(towerCX, 0.25, towerCZ);
        floorMesh.userData.mapGenerated = true;
        floorMesh.userData.walkable = true;
        this.scene.add(floorMesh);

        this.addColliderBox(
            new THREE.Vector3(towerCX, 0.25, towerCZ),
            towerRadius * 2, 0.5, towerRadius * 2, true
        );

        // Spiral staircase
        const totalSteps = 50;
        const stepH = towerHeight / totalSteps;
        const spiralR = towerRadius - 1;
        const angleStep = Math.PI * 0.45;

        for (let i = 0; i < totalSteps; i++) {
            const angle = i * angleStep;
            const stepY = i * stepH + 0.5;

            const sx = towerCX + Math.cos(angle) * spiralR;
            const sz = towerCZ + Math.sin(angle) * spiralR;

            const stepGeo = new THREE.BoxGeometry(1.5, stepH, 0.8);
            const stepMesh = new THREE.Mesh(stepGeo, darkMat.clone());
            stepMesh.position.set(sx, stepY, sz);
            stepMesh.rotation.y = -angle + Math.PI / 2;
            stepMesh.userData.mapGenerated = true;
            stepMesh.userData.walkable = true;
            this.scene.add(stepMesh);

            this.addColliderBox(
                new THREE.Vector3(sx, stepY, sz),
                1.5, stepH, 0.8, true
            );
        }

        // Tower top platform
        const topY = totalSteps * stepH + 0.5;
        const topPlatGeo = new THREE.CylinderGeometry(towerRadius + 0.5, towerRadius + 0.5, 0.5, 16);
        const topPlat = new THREE.Mesh(topPlatGeo, darkMat.clone());
        topPlat.position.set(towerCX, topY + 0.25, towerCZ);
        topPlat.userData.mapGenerated = true;
        topPlat.userData.walkable = true;
        this.scene.add(topPlat);

        this.addColliderBox(
            new THREE.Vector3(towerCX, topY + 0.25, towerCZ),
            (towerRadius + 0.5) * 2, 0.5, (towerRadius + 0.5) * 2, true
        );

        // Tower roof
        const roofGeo = new THREE.ConeGeometry(towerRadius + 1, 4, 16);
        const roof = new THREE.Mesh(roofGeo, wallMat.clone());
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
            const tGeo = new THREE.CylinderGeometry(3, 3.5, wallHeight + 2, 8);
            const tower = new THREE.Mesh(tGeo, wallMat.clone());
            tower.position.set(tp.x, (wallHeight + 2) / 2, tp.z);
            tower.userData.mapGenerated = true;
            this.scene.add(tower);

            this.addColliderBox(
                new THREE.Vector3(tp.x, (wallHeight + 2) / 2, tp.z),
                7, wallHeight + 2, 7, false
            );

            const platGeo = new THREE.CylinderGeometry(3.2, 3.2, 0.5, 8);
            const plat = new THREE.Mesh(platGeo, darkMat.clone());
            plat.position.set(tp.x, wallHeight + 2.25, tp.z);
            plat.userData.mapGenerated = true;
            plat.userData.walkable = true;
            this.scene.add(plat);

            this.addColliderBox(
                new THREE.Vector3(tp.x, wallHeight + 2.25, tp.z),
                6.4, 0.5, 6.4, true
            );

            // Torches on corner towers
            this._addCornerTowerTorch(tp.x, tp.z, wallHeight + 2.5);
        }

        // Moss and vines on maze walls
        this._addMazeMoss(startX, startZ, size);

        // Glowing crystals scattered in maze
        this._addMazeCrystals(startX, startZ, size, clearingCX, clearingCZ);

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

        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const dist = radius * 0.6;
            const chestX = cx + Math.cos(angle) * dist;
            const chestZ = cz + Math.sin(angle) * dist;
            const type = chestTypes[i];

            const chest = new THREE.Group();
            const mat = new THREE.MeshStandardMaterial({
                color: type.color, emissive: type.emissive, emissiveIntensity: 3.0,
                roughness: 0.5, flatShading: true
            });

            // Box body
            const boxGeo = new THREE.BoxGeometry(1.2, 0.8, 0.8);
            const box = new THREE.Mesh(boxGeo, mat);
            box.position.y = 0.4;
            box.userData.mapGenerated = true;
            chest.add(box);

            // Lid (half sphere on top)
            const lidGeo = new THREE.SphereGeometry(0.65, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
            const lid = new THREE.Mesh(lidGeo, mat);
            lid.position.y = 0.8;
            lid.userData.mapGenerated = true;
            chest.add(lid);

            // Metal bands
            const bandMat = new THREE.MeshStandardMaterial({
                color: 0x424242, roughness: 0.6, metalness: 0.8, flatShading: true
            });
            for (let by of [0.2, 0.6]) {
                const bandGeo = new THREE.TorusGeometry(0.6, 0.04, 6, 12);
                const band = new THREE.Mesh(bandGeo, bandMat);
                band.position.y = by;
                band.rotation.x = Math.PI / 2;
                band.userData.mapGenerated = true;
                chest.add(band);
            }

            // Lock
            const lockGeo = new THREE.BoxGeometry(0.2, 0.25, 0.1);
            const lock = new THREE.Mesh(lockGeo, bandMat);
            lock.position.set(0, 0.55, 0.45);
            lock.userData.mapGenerated = true;
            chest.add(lock);

            // Glow light
            const glowMat = new THREE.MeshStandardMaterial({
                color: type.color, emissive: type.emissive, emissiveIntensity: 8.0,
                transparent: true, opacity: 0.6, flatShading: true
            });
            const glowGeo = new THREE.SphereGeometry(0.9, 8, 8);
            const glow = new THREE.Mesh(glowGeo, glowMat);
            glow.position.y = 0.6;
            glow.userData.isGlow = true;
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
        const torchMat = new THREE.MeshStandardMaterial({
            color: 0x5d4037, roughness: 0.8, flatShading: true
        });
        const fireMat = new THREE.MeshStandardMaterial({
            color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 10.0,
            transparent: true, opacity: 0.9, flatShading: true
        });

        // Torches at multiple heights around tower interior
        const torchCount = 6;
        for (let i = 0; i < torchCount; i++) {
            const angle = (i / torchCount) * Math.PI * 2;
            const height = 4 + i * (towerHeight - 8) / torchCount;
            const tx = towerCX + Math.cos(angle) * (towerRadius - 1.5);
            const tz = towerCZ + Math.sin(angle) * (towerRadius - 1.5);

            const torch = new THREE.Group();

            // Stick
            const stickGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.6, 5);
            const stick = new THREE.Mesh(stickGeo, torchMat);
            stick.rotation.x = Math.PI / 6;
            stick.position.set(0, 0.3, 0);
            stick.userData.mapGenerated = true;
            torch.add(stick);

            // Flame
            const flameGeo = new THREE.SphereGeometry(0.15, 6, 6);
            const flame = new THREE.Mesh(flameGeo, fireMat.clone());
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

            const chestMat = new THREE.MeshStandardMaterial({
                color: 0x8B4513, emissive: 0xffaa00, emissiveIntensity: 2.0,
                roughness: 0.7, flatShading: true
            });
            const chestGeo = new THREE.BoxGeometry(0.8, 0.6, 0.6);
            const chest = new THREE.Mesh(chestGeo, chestMat);
            chest.position.set(chestX, 0.3, chestZ);
            chest.userData.isTowerChest = true;
            chest.userData.mapGenerated = true;
            this.scene.add(chest);
        }
    }

    _addCornerTowerTorch(x, z, baseY) {
        const torchMat = new THREE.MeshStandardMaterial({
            color: 0x5d4037, roughness: 0.8, flatShading: true
        });
        const fireMat = new THREE.MeshStandardMaterial({
            color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 10.0,
            transparent: true, opacity: 0.9, flatShading: true
        });

        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const torch = new THREE.Group();

            const stickGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.6, 5);
            const stick = new THREE.Mesh(stickGeo, torchMat);
            stick.rotation.x = Math.PI / 6;
            stick.position.set(0, 0.3, 0);
            stick.userData.mapGenerated = true;
            torch.add(stick);

            const flameGeo = new THREE.SphereGeometry(0.15, 6, 6);
            const flame = new THREE.Mesh(flameGeo, fireMat.clone());
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

    _addMazeMoss(startX, startZ, size) {
        const mossMat = new THREE.MeshStandardMaterial({
            color: 0x4caf50, roughness: 1.0, flatShading: true
        });
        const vineMat = new THREE.MeshStandardMaterial({
            color: 0x2e7d32, roughness: 0.9, flatShading: true
        });

        // Moss patches on walls
        for (let i = 0; i < 60; i++) {
            const x = startX + this._rand() * size;
            const z = startZ + this._rand() * size;
            const geo = new THREE.CircleGeometry(0.3 + this._rand() * 0.5, 5);
            const face = Math.floor(this._rand() * 4);
            const moss = new THREE.Mesh(geo, mossMat.clone());
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
            this.scene.add(moss);
        }

        // Vines hanging from wall tops
        for (let i = 0; i < 30; i++) {
            const x = startX + this._rand() * size;
            const z = startZ + this._rand() * size;
            const vineGeo = new THREE.CylinderGeometry(0.05, 0.08, 2 + this._rand() * 3, 4);
            const vine = new THREE.Mesh(vineGeo, vineMat);
            vine.position.set(x, 5 + this._rand() * 3, z);
            vine.userData.mapGenerated = true;
            this.scene.add(vine);
        }
    }

    _addMazeCrystals(startX, startZ, size, cx, cz) {
        const crystalMat = new THREE.MeshStandardMaterial({
            color: 0x7c4dff, emissive: 0x6515ff, emissiveIntensity: 3.0,
            roughness: 0.2, metalness: 0.8, flatShading: true
        });

        for (let i = 0; i < 20; i++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = 10 + this._rand() * (size * 0.3);
            const cx2 = cx + Math.cos(angle) * dist;
            const cz2 = cz + Math.sin(angle) * dist;
            const size2 = 0.3 + this._rand() * 0.7;

            const geo = new THREE.OctahedronGeometry(size2, 0);
            const crystal = new THREE.Mesh(geo, crystalMat.clone());
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
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0x9e9e9e, roughness: 1.0, flatShading: true
        });

        // Path from maze clearing to biome border (toward center)
        const startX2 = clearingCX;
        const startZ2 = clearingCZ;
        const endX = 15;
        const endZ = clearingCZ;

        let px = startX2;
        let pz = startZ2;
        for (let i = 0; i < 15; i++) {
            const t = i / 14;
            const segGeo = new THREE.BoxGeometry(3, 0.05, 4);
            const seg = new THREE.Mesh(segGeo, pathMat.clone());
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
        const militaryFloorMat = new THREE.MeshStandardMaterial({
            color: 0x555555, roughness: 0.9, flatShading: true
        });
        const militaryFloorGeo = new THREE.PlaneGeometry(size, size);
        const militaryFloor = new THREE.Mesh(militaryFloorGeo, militaryFloorMat);
        militaryFloor.rotation.x = -Math.PI / 2;
        militaryFloor.position.set(cx, 0.02, cz);
        militaryFloor.userData.mapGenerated = true;
        this.scene.add(militaryFloor);

        // Колючая проволока по периметру с входом
        this._addBarbedWireFence(startX, startZ, size);

        // Ежи (анти танковые) - больше и заметнее
        for (let i = 0; i < 15; i++) {
            const hx = startX + 10 + this._rand() * (size - 20);
            const hz = startZ + 10 + this._rand() * (size - 20);
            this._addCzechHedgehog(hx, hz, 2.5 + this._rand() * 1.5);
        }

        // Полуразрушенные танки - больше и разнообразнее
        for (let i = 0; i < 5; i++) {
            const tx = startX + 15 + this._rand() * (size - 30);
            const tz = startZ + 15 + this._rand() * (size - 30);
            this._addDestroyedTank(tx, tz);
        }

        // Окопы - больше и заметнее
        this._addTrench(startX + 20, startZ + 20, size * 0.4);
        this._addTrench(startX + size * 0.5, startZ + size * 0.5, size * 0.35);
        this._addTrench(startX + size * 0.7, startZ + 15, size * 0.2);

        // Укрытия из мешков - больше
        for (let i = 0; i < 12; i++) {
            const sx = startX + 15 + this._rand() * (size - 30);
            const sz = startZ + 15 + this._rand() * (size - 30);
            this._addSandbagBunker(sx, sz);
        }

        // 2 трехэтажных дома-коммуналки (огромные и заметные)
        this._addThreeStoryApartment(startX + 15, startZ + 15, 100, 90);
        this._addThreeStoryApartment(startX + size - 115, startZ + size - 105, 102, 92);

        // 1 полуразрушенный дом (разнообразие)
        this._addRuinedBuilding(startX + size * 0.3, startZ + size * 0.7);
        this._addRuinedBuilding(startX + size * 0.6, startZ + size * 0.2);

        // Дорога между домами (асфальт)
        const roadMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.95 });
        const roadGeo = new THREE.BoxGeometry(size - 30, 0.1, 12);
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.position.set(cx, 0.05, cz);
        road.userData.mapGenerated = true;
        this.scene.add(road);

        // Бетонные баррикады вдоль дороги
        for (let b = 0; b < 8; b++) {
            const barrierGeo = new THREE.BoxGeometry(3, 2, 1.5);
            const barrierMat = new THREE.MeshStandardMaterial({ color: 0x666655, roughness: 0.9 });
            const barrier = new THREE.Mesh(barrierGeo, barrierMat);
            barrier.position.set(startX + 30 + b * 25, 1, cz);
            barrier.rotation.y = this._rand() * 0.3;
            barrier.userData.mapGenerated = true;
            this.scene.add(barrier);
            this.addColliderBox(new THREE.Vector3(barrier.position.x, 1, barrier.position.z), 3, 2, 1.5, false);
        }

        // Разбитые машины (упрощенные)
        for (let car = 0; car < 6; car++) {
            const carX = startX + 20 + this._rand() * (size - 40);
            const carZ = startZ + 20 + this._rand() * (size - 40);
            const carBody = new THREE.BoxGeometry(2, 1.5, 4);
            const carMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0, 0, 0.2 + this._rand() * 0.3),
                roughness: 0.8
            });
            const carMesh = new THREE.Mesh(carBody, carMat);
            carMesh.position.set(carX, 0.75, carZ);
            carMesh.rotation.y = this._rand() * Math.PI;
            carMesh.userData.mapGenerated = true;
            this.scene.add(carMesh);
            this.addColliderBox(new THREE.Vector3(carX, 0.75, carZ), 2, 1.5, 4, false);
        }

        // Вспышки и кратеры (разрывные бомбы)
        for (let crater = 0; crater < 12; crater++) {
            const craterX = startX + 10 + this._rand() * (size - 20);
            const craterZ = startZ + 10 + this._rand() * (size - 20);
            const craterSize = 2 + this._rand() * 3;
            const craterGeo = new THREE.CylinderGeometry(craterSize, craterSize * 1.2, 0.5, 8);
            const craterMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 });
            const craterMesh = new THREE.Mesh(craterGeo, craterMat);
            craterMesh.position.set(craterX, 0.25, craterZ);
            craterMesh.userData.mapGenerated = true;
            this.scene.add(craterMesh);
        }

        // Металлические бочки (горящие и обычные)
        for (let barrel = 0; barrel < 15; barrel++) {
            const barrelX = startX + 10 + this._rand() * (size - 20);
            const barrelZ = startZ + 10 + this._rand() * (size - 20);
            const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8);
            const barrelMat = new THREE.MeshStandardMaterial({
                color: this._rand() > 0.5 ? 0x8B4513 : 0x444444,
                roughness: 0.7
            });
            const barrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
            barrelMesh.position.set(barrelX, 0.6, barrelZ);
            barrelMesh.rotation.z = this._rand() * 0.5;
            barrelMesh.userData.mapGenerated = true;
            this.scene.add(barrelMesh);
            this.addColliderBox(new THREE.Vector3(barrelX, 0.6, barrelZ), 0.8, 1.2, 0.8, false);
        }

        // Edge trees — dense military perimeter
        this._addMilitaryEdgeTrees(startX, startZ, size);

        // POI items in military zone
        this._addMilitaryPOI(startX, startZ, size, cx, cz);

        // Path from military to center
        this._addMilitaryToCenterPath(cx, cz);
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
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0x555555, roughness: 1.0, flatShading: true
        });

        // Path from military quadrant to center (toward origin)
        const startX2 = cx;
        const startZ2 = cz;
        const endX = 0;
        const endZ = 0;

        let px = startX2;
        let pz = startZ2;
        for (let i = 0; i < 20; i++) {
            const t = i / 19;
            const segGeo = new THREE.BoxGeometry(3, 0.05, 4);
            const seg = new THREE.Mesh(segGeo, pathMat.clone());
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
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x4a5238, roughness: 0.9
        });
        const wireMat = new THREE.MeshStandardMaterial({
            color: 0x888888, roughness: 0.5, metalness: 0.6
        });

        const postH = 2.5;
        const postGeo = new THREE.BoxGeometry(0.1, postH, 0.1);
        const postSpacing = 8;
        const entranceWidth = 12;
        const entranceStart = size * 0.4;
        const entranceEnd = size * 0.6;

        // Северная сторона
        for (let px = startX; px < startX + size; px += postSpacing) {
            if (px > entranceStart && px < entranceEnd) continue;
            const post = new THREE.Mesh(postGeo, postMat.clone());
            post.position.set(px, postH / 2, startZ);
            post.userData.mapGenerated = true;
            this.scene.add(post);
        }

        // Южная сторона
        for (let px = startX; px < startX + size; px += postSpacing) {
            if (px > entranceStart && px < entranceEnd) continue;
            const post = new THREE.Mesh(postGeo, postMat.clone());
            post.position.set(px, postH / 2, startZ + size);
            post.userData.mapGenerated = true;
            this.scene.add(post);
        }

        // Западная сторона
        for (let pz = startZ; pz < startZ + size; pz += postSpacing) {
            const post = new THREE.Mesh(postGeo, postMat.clone());
            post.position.set(startX, postH / 2, pz);
            post.userData.mapGenerated = true;
            this.scene.add(post);
        }

        // Восточная сторона
        for (let pz = startZ; pz < startZ + size; pz += postSpacing) {
            const post = new THREE.Mesh(postGeo, postMat.clone());
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
                    const wireGeo = new THREE.CylinderGeometry(0.02, 0.02, nPoints[i].distanceTo(nPoints[i + 1]), 4);
                    const wire = new THREE.Mesh(wireGeo, wireMat.clone());
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
                    const wireGeo = new THREE.CylinderGeometry(0.02, 0.02, sPoints[i].distanceTo(sPoints[i + 1]), 4);
                    const wire = new THREE.Mesh(wireGeo, wireMat.clone());
                    wire.position.set((sPoints[i].x + sPoints[i + 1].x) / 2, h, startZ + size);
                    wire.rotation.z = Math.PI / 2;
                    wire.userData.mapGenerated = true;
                    this.scene.add(wire);
                }
            }

            // Запад
            for (let pz = startZ; pz < startZ + size; pz += postSpacing) {
                const wireGeo = new THREE.CylinderGeometry(0.02, 0.02, postSpacing, 4);
                const wire = new THREE.Mesh(wireGeo, wireMat.clone());
                wire.position.set(startX, h, pz + postSpacing / 2);
                wire.rotation.z = Math.PI / 2;
                wire.userData.mapGenerated = true;
                this.scene.add(wire);
            }

            // Восток
            for (let pz = startZ; pz < startZ + size; pz += postSpacing) {
                const wireGeo = new THREE.CylinderGeometry(0.02, 0.02, postSpacing, 4);
                const wire = new THREE.Mesh(wireGeo, wireMat.clone());
                wire.position.set(startX + size, h, pz + postSpacing / 2);
                wire.rotation.z = Math.PI / 2;
                wire.userData.mapGenerated = true;
                this.scene.add(wire);
            }
        }

        // Колючие шипы на проволоке
        const spikeMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.7, roughness: 0.3 });
        for (let i = 0; i < 40; i++) {
            const side = Math.floor(this._rand() * 4);
            let sx, sz;
            if (side === 0) { sx = startX + this._rand() * size; sz = startZ; }
            else if (side === 1) { sx = startX + this._rand() * size; sz = startZ + size; }
            else if (side === 2) { sx = startX; sz = startZ + this._rand() * size; }
            else { sx = startX + size; sz = startZ + this._rand() * size; }

            const spikeGeo = new THREE.ConeGeometry(0.15, 0.5, 4);
            const spike = new THREE.Mesh(spikeGeo, spikeMat.clone());
            spike.position.set(sx, 1.5 + this._rand(), sz);
            spike.rotation.x = Math.PI;
            spike.userData.mapGenerated = true;
            this.scene.add(spike);
        }
    }

    _addCzechHedgehog(x, z) {
        const mat = new THREE.MeshStandardMaterial({
            color: 0x4a5238, roughness: 0.6, metalness: 0.4
        });

        const hedgehog = new THREE.Group();
        const beamLen = 2;
        const beamR = 0.15;

        // 3 скрещенные балки
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI;
            const beamGeo = new THREE.CylinderGeometry(beamR, beamR, beamLen, 6);
            const beam = new THREE.Mesh(beamGeo, mat.clone());
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
        const hullMat = new THREE.MeshStandardMaterial({
            color: 0x54624a, roughness: 0.7, metalness: 0.3
        });

        // Корпус (разрушенный)
        const hullGeo = new THREE.BoxGeometry(4, 2, 6);
        const hull = new THREE.Mesh(hullGeo, hullMat);
        hull.position.y = 1.5;
        hull.rotation.z = (this._rand() - 0.5) * 0.1;
        tank.add(hull);

        // Башня (сломана)
        const turretGeo = new THREE.BoxGeometry(2.5, 1.5, 3);
        const turretMat = new THREE.MeshStandardMaterial({
            color: 0x4a5a3a, roughness: 0.6, metalness: 0.4
        });
        const turret = new THREE.Mesh(turretGeo, turretMat);
        turret.position.set(0, 3, -0.5);
        turret.rotation.z = (this._rand() - 0.5) * 0.3;
        turret.rotation.y = this._rand() * 0.5;
        tank.add(turret);

        // Дуло (поломанное)
        const barrelGeo = new THREE.CylinderGeometry(0.2, 0.25, 4, 6);
        const barrel = new THREE.Mesh(barrelGeo, turretMat.clone());
        barrel.rotation.x = Math.PI / 2 + (this._rand() - 0.5) * 0.3;
        barrel.position.set(0, 3, -3);
        tank.add(barrel);

        // Гусеницы (одна может быть сломана)
        for (let side of [-1, 1]) {
            const trackGeo = new THREE.BoxGeometry(0.8, 0.8, 6.5);
            const trackMat = new THREE.MeshStandardMaterial({
                color: 0x3d3d3d, roughness: 0.9
            });
            const track = new THREE.Mesh(trackGeo, trackMat);
            track.position.set(side * 2.2, 0.4, 0);
            if (side === -1 && this._rand() > 0.5) {
                track.rotation.z = 0.2;
                track.position.y = 0.2;
            }
            tank.add(track);
        }

        // Огненный шар/дым на танке
        const fireGeo = new THREE.SphereGeometry(0.8, 6, 6);
        const fireMat = new THREE.MeshStandardMaterial({
            color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 0.5, transparent: true, opacity: 0.7
        });
        const fire = new THREE.Mesh(fireGeo, fireMat);
        fire.position.set(0, 4, 0);
        fire.userData.mapGenerated = true;
        tank.add(fire);

        tank.position.set(x, 0, z);
        tank.rotation.y = this._rand() * Math.PI * 2;
        tank.userData.mapGenerated = true;
        this.scene.add(tank);

        this.addColliderBox(
            new THREE.Vector3(x, 2, z),
            5, 4, 7, false
        );
    }

    _addTrench(x, z, length) {
        const trenchMat = new THREE.MeshStandardMaterial({
            color: 0x3d3528, roughness: 0.95, flatShading: true
        });

        // Дно окопа
        const bottomGeo = new THREE.BoxGeometry(3, 0.1, length);
        const bottom = new THREE.Mesh(bottomGeo, trenchMat);
        bottom.position.set(x, 0.15, z);
        bottom.userData.mapGenerated = true;
        this.scene.add(bottom);

        // Стенки окопа
        for (let side of [-1, 1]) {
            const wallGeo = new THREE.BoxGeometry(0.3, 1, length);
            const wall = new THREE.Mesh(wallGeo, trenchMat.clone());
            wall.position.set(x + side * 1.5, 0.5, z);
            wall.userData.mapGenerated = true;
            this.scene.add(wall);
        }

        // Повернутый окоп (перпендикулярно)
        const bottom2Geo = new THREE.BoxGeometry(length, 0.1, 3);
        const bottom2 = new THREE.Mesh(bottom2Geo, trenchMat.clone());
        bottom2.position.set(x + length / 2, 0.15, z + length / 2);
        bottom2.userData.mapGenerated = true;
        this.scene.add(bottom2);

        for (let side of [-1, 1]) {
            const wallGeo = new THREE.BoxGeometry(length, 1, 0.3);
            const wall = new THREE.Mesh(wallGeo, trenchMat.clone());
            wall.position.set(x + length / 2, 0.5, z + length / 2 + side * 1.5);
            wall.userData.mapGenerated = true;
            this.scene.add(wall);
        }
    }

    _addSandbagBunker(x, z) {
        const mat = new THREE.MeshStandardMaterial({
            color: 0x9e8e6e, roughness: 0.95, flatShading: true
        });

        const bunker = new THREE.Group();
        const bagW = 0.6;
        const bagH = 0.35;
        const bagD = 0.4;

        // U-образное укрытие
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 2; j++) {
                const bagGeo = new THREE.BoxGeometry(bagW, bagH, bagD);
                const bag = new THREE.Mesh(bagGeo, mat.clone());
                bag.position.set(i * bagW, j * bagH + bagH / 2, 0);
                bag.userData.mapGenerated = true;
                bunker.add(bag);
            }
        }

        // Боковые стенки
        for (let j = 0; j < 2; j++) {
            for (let k = 0; k < 3; k++) {
                const bagGeo = new THREE.BoxGeometry(bagW, bagH, bagD);
                const bag = new THREE.Mesh(bagGeo, mat.clone());
                bag.position.set(0, j * bagH + bagH / 2, k * bagD);
                bag.userData.mapGenerated = true;
                bunker.add(bag);

                const bag2 = new THREE.Mesh(bagGeo, mat.clone());
                bag2.position.set(3 * bagW, j * bagH + bagH / 2, k * bagD);
                bag2.userData.mapGenerated = true;
                bunker.add(bag2);
            }
        }

        bunker.position.set(x, 0, z);
        bunker.userData.mapGenerated = true;
        this.scene.add(bunker);

        this.addColliderBox(
            new THREE.Vector3(x, 0.5, z),
            4 * bagW, 1.2, 3 * bagD, false
        );
    }

    _addThreeStoryApartment(x, z, w = 20, d = 16) {
        const building = new THREE.Group();
        // Soviet-style concrete panel colors - warm gray
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x9e9e96, roughness: 0.85, flatShading: true
        });
        const concreteMat = new THREE.MeshStandardMaterial({
            color: 0xb0b0a8, roughness: 0.9, flatShading: true
        });
        const doorMat = new THREE.MeshStandardMaterial({
            color: 0x4a3525, roughness: 0.8
        });

        const width = w;
        const depth = d;
        const floorH = 5;

        // Пол первого этажа
        const floor1Geo = new THREE.BoxGeometry(width, 0.3, depth);
        const floor1 = new THREE.Mesh(floor1Geo, concreteMat.clone());
        floor1.position.set(0, 0.15, 0);
        floor1.userData.mapGenerated = true;
        floor1.userData.walkable = true;
        building.add(floor1);
        this.addColliderBox(new THREE.Vector3(x, 0.15, z), width, 0.3, depth, true);

        // Стены первого этажа (с разрушениями)
        const wallThick = 0.5;
        // Левая стена
        const leftWallGeo = new THREE.BoxGeometry(wallThick, floorH, depth);
        const leftWall = new THREE.Mesh(leftWallGeo, wallMat.clone());
        leftWall.position.set(-width / 2, floorH / 2 + 0.3, 0);
        leftWall.userData.mapGenerated = true;
        building.add(leftWall);
        this.addColliderBox(new THREE.Vector3(x - width / 2, floorH / 2 + 0.3, z), wallThick, floorH, depth, false);

        // Правая стена (с дырой)
        const rightWallBack = new THREE.BoxGeometry(wallThick, floorH, depth * 0.4);
        const rightWallFront = new THREE.BoxGeometry(wallThick, floorH, depth * 0.3);
        const rwBack = new THREE.Mesh(rightWallBack, wallMat.clone());
        rwBack.position.set(width / 2, floorH / 2 + 0.3, -depth * 0.3);
        rwBack.userData.mapGenerated = true;
        building.add(rwBack);
        this.addColliderBox(new THREE.Vector3(x + width / 2, floorH / 2 + 0.3, z - depth * 0.3), wallThick, floorH, depth * 0.4, false);

        const rwFront = new THREE.Mesh(rightWallFront, wallMat.clone());
        rwFront.position.set(width / 2, floorH / 2 + 0.3, depth * 0.35);
        rwFront.userData.mapGenerated = true;
        building.add(rwFront);
        this.addColliderBox(new THREE.Vector3(x + width / 2, floorH / 2 + 0.3, z + depth * 0.35), wallThick, floorH, depth * 0.3, false);

        // Задняя стена
        const backWallGeo = new THREE.BoxGeometry(width, floorH, wallThick);
        const backWall = new THREE.Mesh(backWallGeo, wallMat.clone());
        backWall.position.set(0, floorH / 2 + 0.3, -depth / 2);
        backWall.userData.mapGenerated = true;
        building.add(backWall);
        this.addColliderBox(new THREE.Vector3(x, floorH / 2 + 0.3, z - depth / 2), width, floorH, wallThick, false);

        // Передняя стена с дверью
        const doorW = 2;
        const doorH = 2.8;
        const frontLeftW = width / 2 - doorW / 2 - 2;
        const frontRightW = width / 2 - doorW / 2 - 2;

        const frontLeftGeo = new THREE.BoxGeometry(frontLeftW, floorH, wallThick);
        const frontLeft = new THREE.Mesh(frontLeftGeo, wallMat.clone());
        frontLeft.position.set(-width / 2 + frontLeftW / 2, floorH / 2 + 0.3, depth / 2);
        frontLeft.userData.mapGenerated = true;
        building.add(frontLeft);
        this.addColliderBox(new THREE.Vector3(x - width / 2 + frontLeftW / 2, floorH / 2 + 0.3, z + depth / 2), frontLeftW, floorH, wallThick, false);

        const frontRightGeo = new THREE.BoxGeometry(frontRightW, floorH, wallThick);
        const frontRight = new THREE.Mesh(frontRightGeo, wallMat.clone());
        frontRight.position.set(width / 2 - frontRightW / 2, floorH / 2 + 0.3, depth / 2);
        frontRight.userData.mapGenerated = true;
        building.add(frontRight);
        this.addColliderBox(new THREE.Vector3(x + width / 2 - frontRightW / 2, floorH / 2 + 0.3, z + depth / 2), frontRightW, floorH, wallThick, false);

        const frontTopGeo = new THREE.BoxGeometry(width, floorH - doorH - 0.5, wallThick);
        const frontTop = new THREE.Mesh(frontTopGeo, wallMat.clone());
        frontTop.position.set(0, doorH + (floorH - doorH - 0.5) / 2 + 0.3, depth / 2);
        frontTop.userData.mapGenerated = true;
        building.add(frontTop);
        this.addColliderBox(new THREE.Vector3(x, doorH + (floorH - doorH - 0.5) / 2 + 0.3, z + depth / 2), width, floorH - doorH - 0.5, wallThick, false);

        // Дверь
        const doorGeo = new THREE.BoxGeometry(doorW, doorH, 0.1);
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, doorH / 2 + 0.3, depth / 2 + 0.05);
        door.userData.mapGenerated = true;
        building.add(door);

        // Окна первого этажа
        const winMat = new THREE.MeshStandardMaterial({
            color: 0x333333, roughness: 0.5, metalness: 0.2
        });
        for (let i = 0; i < 3; i++) {
            const winGeo = new THREE.BoxGeometry(0.1, 1.5, 1.5);
            const win = new THREE.Mesh(winGeo, winMat.clone());
            win.position.set(-width / 2 + 0.05, 2 + 0.3, -depth / 4 + i * depth / 4);
            win.userData.mapGenerated = true;
            building.add(win);
        }

        // Пол второго этажа (с провалами)
        const floor2LeftGeo = new THREE.BoxGeometry(width / 2, 0.3, depth);
        const floor2Left = new THREE.Mesh(floor2LeftGeo, concreteMat.clone());
        floor2Left.position.set(-width / 4, floorH + 0.15, 0);
        floor2Left.userData.mapGenerated = true;
        floor2Left.userData.walkable = true;
        building.add(floor2Left);
        this.addColliderBox(new THREE.Vector3(x - width / 4, floorH + 0.15, z), width / 2, 0.3, depth, true);

        const floor2RightGeo = new THREE.BoxGeometry(width / 2 - 2, 0.3, depth);
        const floor2Right = new THREE.Mesh(floor2RightGeo, concreteMat.clone());
        floor2Right.position.set(width / 4 + 1, floorH + 0.15, 0);
        floor2Right.userData.mapGenerated = true;
        floor2Right.userData.walkable = true;
        building.add(floor2Right);
        this.addColliderBox(new THREE.Vector3(x + width / 4 + 1, floorH + 0.15, z), width / 2 - 2, 0.3, depth, true);

        // Лестница внутри (спирали)
        const stairCount = 12;
        const stairH = floorH / stairCount;
        const stairR = 2;
        for (let i = 0; i < stairCount; i++) {
            const angle = i * Math.PI / 8;
            const sx = Math.cos(angle) * stairR;
            const sz = Math.sin(angle) * stairR - depth / 4;
            const stepGeo = new THREE.BoxGeometry(1.5, stairH, 0.8);
            const step = new THREE.Mesh(stepGeo, concreteMat.clone());
            step.position.set(sx, i * stairH + 0.3, sz);
            step.rotation.y = -angle;
            step.userData.mapGenerated = true;
            step.userData.walkable = true;
            building.add(step);
            this.addColliderBox(
                new THREE.Vector3(x + sx, i * stairH + 0.3, z + sz),
                1.5, stairH, 0.8, true
            );
        }

        // Стены второго этажа
        const leftWall2Geo = new THREE.BoxGeometry(wallThick, floorH, depth);
        const leftWall2 = new THREE.Mesh(leftWall2Geo, wallMat.clone());
        leftWall2.position.set(-width / 2, floorH + floorH / 2 + 0.3, 0);
        leftWall2.userData.mapGenerated = true;
        building.add(leftWall2);
        this.addColliderBox(new THREE.Vector3(x - width / 2, floorH + floorH / 2 + 0.3, z), wallThick, floorH, depth, false);

        // Правая стена 2 этажа (разрушена)
        const rightWall2Geo = new THREE.BoxGeometry(wallThick, floorH, depth * 0.6);
        const rightWall2 = new THREE.Mesh(rightWall2Geo, wallMat.clone());
        rightWall2.position.set(width / 2, floorH + floorH / 2 + 0.3, -depth * 0.2);
        rightWall2.userData.mapGenerated = true;
        building.add(rightWall2);
        this.addColliderBox(new THREE.Vector3(x + width / 2, floorH + floorH / 2 + 0.3, z - depth * 0.2), wallThick, floorH, depth * 0.6, false);

        // Задняя стена 2 этажа
        const backWall2Geo = new THREE.BoxGeometry(width, floorH, wallThick);
        const backWall2 = new THREE.Mesh(backWall2Geo, wallMat.clone());
        backWall2.position.set(0, floorH + floorH / 2 + 0.3, -depth / 2);
        backWall2.userData.mapGenerated = true;
        building.add(backWall2);
        this.addColliderBox(new THREE.Vector3(x, floorH + floorH / 2 + 0.3, z - depth / 2), width, floorH, wallThick, false);

        // Передняя стена 2 этажа с проемом
        const front2LeftGeo = new THREE.BoxGeometry(width / 3, floorH, wallThick);
        const front2Left = new THREE.Mesh(front2LeftGeo, wallMat.clone());
        front2Left.position.set(-width / 3, floorH + floorH / 2 + 0.3, depth / 2);
        front2Left.userData.mapGenerated = true;
        building.add(front2Left);
        this.addColliderBox(new THREE.Vector3(x - width / 3, floorH + floorH / 2 + 0.3, z + depth / 2), width / 3, floorH, wallThick, false);

        const front2RightGeo = new THREE.BoxGeometry(width / 3, floorH, wallThick);
        const front2Right = new THREE.Mesh(front2RightGeo, wallMat.clone());
        front2Right.position.set(width / 3, floorH + floorH / 2 + 0.3, depth / 2);
        front2Right.userData.mapGenerated = true;
        building.add(front2Right);
        this.addColliderBox(new THREE.Vector3(x + width / 3, floorH + floorH / 2 + 0.3, z + depth / 2), width / 3, floorH, wallThick, false);

        // Окна 2 этажа
        for (let i = 0; i < 2; i++) {
            const winGeo = new THREE.BoxGeometry(0.1, 1.5, 1.5);
            const win = new THREE.Mesh(winGeo, winMat.clone());
            win.position.set(-width / 2 + 0.05, floorH + 2 + 0.3, -depth / 4 + i * depth / 3);
            win.userData.mapGenerated = true;
            building.add(win);
        }

        // Пол третьего этажа
        const floor3Geo = new THREE.BoxGeometry(width - 2, 0.3, depth);
        const floor3 = new THREE.Mesh(floor3Geo, concreteMat.clone());
        floor3.position.set(1, floorH * 2 + 0.15, 0);
        floor3.userData.mapGenerated = true;
        floor3.userData.walkable = true;
        building.add(floor3);
        this.addColliderBox(new THREE.Vector3(x + 1, floorH * 2 + 0.15, z), width - 2, 0.3, depth, true);

        // Стены третьего этажа (сильно разрушены)
        const leftWall3Geo = new THREE.BoxGeometry(wallThick, floorH, depth * 0.7);
        const leftWall3 = new THREE.Mesh(leftWall3Geo, wallMat.clone());
        leftWall3.position.set(-width / 2, floorH * 2 + floorH / 2 + 0.3, -depth * 0.15);
        leftWall3.userData.mapGenerated = true;
        building.add(leftWall3);
        this.addColliderBox(new THREE.Vector3(x - width / 2, floorH * 2 + floorH / 2 + 0.3, z - depth * 0.15), wallThick, floorH, depth * 0.7, false);

        const rightWall3Geo = new THREE.BoxGeometry(wallThick, floorH, depth * 0.5);
        const rightWall3 = new THREE.Mesh(rightWall3Geo, wallMat.clone());
        rightWall3.position.set(width / 2, floorH * 2 + floorH / 2 + 0.3, -depth * 0.25);
        rightWall3.userData.mapGenerated = true;
        building.add(rightWall3);
        this.addColliderBox(new THREE.Vector3(x + width / 2, floorH * 2 + floorH / 2 + 0.3, z - depth * 0.25), wallThick, floorH, depth * 0.5, false);

        // Задняя стена 3 этажа
        const backWall3Geo = new THREE.BoxGeometry(width, floorH, wallThick);
        const backWall3 = new THREE.Mesh(backWall3Geo, wallMat.clone());
        backWall3.position.set(0, floorH * 2 + floorH / 2 + 0.3, -depth / 2);
        backWall3.userData.mapGenerated = true;
        building.add(backWall3);
        this.addColliderBox(new THREE.Vector3(x, floorH * 2 + floorH / 2 + 0.3, z - depth / 2), width, floorH, wallThick, false);

        // Крыша (разрушенная) с деталями
        const roofGeo = new THREE.BoxGeometry(width - 1, 0.3, depth - 1);
        const roof = new THREE.Mesh(roofGeo, concreteMat.clone());
        roof.position.set(0, floorH * 3 + 0.3, 0);
        roof.userData.mapGenerated = true;
        building.add(roof);

        // Дымоходы на крыше
        for (let ch = 0; ch < 4; ch++) {
            const chimneyH = 2 + this._rand() * 2;
            const chimneyGeo = new THREE.BoxGeometry(1.5, chimneyH, 1.5);
            const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x666655, roughness: 0.9 });
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
            const ventGeo = new THREE.BoxGeometry(2, 1.5, 2);
            const ventMat = new THREE.MeshStandardMaterial({ color: 0x777766, roughness: 0.8 });
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
        const balconyMat = new THREE.MeshStandardMaterial({ color: 0x888877, roughness: 0.85 });
        for (let floor = 0; floor < 3; floor++) {
            for (let b = 0; b < 4; b++) {
                const balconyGeo = new THREE.BoxGeometry(3, 0.2, 1.5);
                const balcony = new THREE.Mesh(balconyGeo, balconyMat.clone());
                balcony.position.set(
                    -width / 3 + b * (width / 5),
                    floor * floorH + 2.5 + 0.3,
                    depth / 2 + 0.75
                );
                balcony.userData.mapGenerated = true;
                building.add(balcony);
                // Перила балкона
                const railGeo = new THREE.BoxGeometry(3, 1, 0.1);
                const rail = new THREE.Mesh(railGeo, balconyMat.clone());
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
                const winF = new THREE.BoxGeometry(1.5, 2, 0.1);
                const winMeshF = new THREE.Mesh(winF, winMat.clone());
                winMeshF.position.set(
                    -width / 3 + i * (width / 6),
                    floor * floorH + 2.5 + 0.3,
                    depth / 2 + 0.05
                );
                winMeshF.userData.mapGenerated = true;
                building.add(winMeshF);
                // Задняя стена
                const winB = new THREE.Mesh(winF.clone(), winMat.clone());
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
        const partition1Geo = new THREE.BoxGeometry(wallThick, floorH - 0.5, depth - 1);
        const partition1 = new THREE.Mesh(partition1Geo, wallMat.clone());
        partition1.position.set(0, floorH / 2 + 0.3, 0);
        partition1.userData.mapGenerated = true;
        building.add(partition1);
        this.addColliderBox(new THREE.Vector3(x, floorH / 2 + 0.3, z), wallThick, floorH - 0.5, depth - 1, false);

        // 2 этаж: перегородки
        const partition2Geo = new THREE.BoxGeometry(wallThick, floorH - 0.5, depth - 2);
        const partition2 = new THREE.Mesh(partition2Geo, wallMat.clone());
        partition2.position.set(-width / 4, floorH + floorH / 2 + 0.3, 0);
        partition2.userData.mapGenerated = true;
        building.add(partition2);
        this.addColliderBox(new THREE.Vector3(x - width / 4, floorH + floorH / 2 + 0.3, z), wallThick, floorH - 0.5, depth - 2, false);

        // 3 этаж: перегородки
        const partition3Geo = new THREE.BoxGeometry(wallThick, floorH - 0.5, depth * 0.6);
        const partition3 = new THREE.Mesh(partition3Geo, wallMat.clone());
        partition3.position.set(2, floorH * 2 + floorH / 2 + 0.3, -depth * 0.2);
        partition3.userData.mapGenerated = true;
        building.add(partition3);
        this.addColliderBox(new THREE.Vector3(x + 2, floorH * 2 + floorH / 2 + 0.3, z - depth * 0.2), wallThick, floorH - 0.5, depth * 0.6, false);

        // Сундуки (лут) в квартирах
        const chestMat = new THREE.MeshStandardMaterial({
            color: 0x8B4513, roughness: 0.7, flatShading: true
        });
        const chestGeo = new THREE.BoxGeometry(1, 0.7, 0.7);

        // 1 этаж, квартира 1
        const chest1 = new THREE.Mesh(chestGeo, chestMat.clone());
        chest1.position.set(-width / 4, 0.7, -depth / 4);
        chest1.userData.mapGenerated = true;
        building.add(chest1);
        this.addColliderBox(new THREE.Vector3(x - width / 4, 0.7, z - depth / 4), 1, 0.7, 0.7, false);

        // 1 этаж, квартира 2
        const chest2 = new THREE.Mesh(chestGeo, chestMat.clone());
        chest2.position.set(width / 4, 0.7, depth / 4);
        chest2.userData.mapGenerated = true;
        building.add(chest2);
        this.addColliderBox(new THREE.Vector3(x + width / 4, 0.7, z + depth / 4), 1, 0.7, 0.7, false);

        // 2 этаж
        const chest3 = new THREE.Mesh(chestGeo, chestMat.clone());
        chest3.position.set(-width / 3, floorH + 0.7, -depth / 3);
        chest3.userData.mapGenerated = true;
        building.add(chest3);
        this.addColliderBox(new THREE.Vector3(x - width / 3, floorH + 0.7, z - depth / 3), 1, 0.7, 0.7, false);

        // 3 этаж
        const chest4 = new THREE.Mesh(chestGeo, chestMat.clone());
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

        const buildingMat = new THREE.MeshStandardMaterial({
            color: COLORS.militaryBuilding,
            roughness: 0.75,
            flatShading: true
        });
        const wallMat = new THREE.MeshStandardMaterial({
            color: COLORS.militaryRuined,
            roughness: 0.85,
            flatShading: true
        });

        // Solid floor
        const floorGeo = new THREE.BoxGeometry(w, 1, d);
        const floor = new THREE.Mesh(floorGeo, buildingMat.clone());
        floor.position.set(x, 0.5, z);
        floor.userData.mapGenerated = true;
        this.scene.add(floor);

        // Walls
        const wallThick = 0.5;
        for (let side of [-1, 1]) {
            const sideGeo = new THREE.BoxGeometry(wallThick, h, d);
            const sideWall = new THREE.Mesh(sideGeo, wallMat.clone());
            sideWall.position.set(x + side * w / 2, h / 2, z);
            sideWall.userData.mapGenerated = true;
            this.scene.add(sideWall);
            this.addColliderBox(
                new THREE.Vector3(x + side * w / 2, h / 2, z),
                wallThick, h, d, false
            );
        }

        const frontGeo = new THREE.BoxGeometry(w, h, wallThick);
        const front = new THREE.Mesh(frontGeo, wallMat);
        front.position.set(x, h / 2, z + d / 2);
        front.userData.mapGenerated = true;
        this.scene.add(front);
        this.addColliderBox(new THREE.Vector3(x, h / 2, z + d / 2), w, h, wallThick, false);

        const back = new THREE.Mesh(frontGeo, wallMat.clone());
        back.position.set(x, h / 2, z - d / 2);
        back.userData.mapGenerated = true;
        this.scene.add(back);
        this.addColliderBox(new THREE.Vector3(x, h / 2, z - d / 2), w, h, wallThick, false);

        // Partial roof (ruined)
        const roofGeo = new THREE.BoxGeometry(w - 1, 0.3, d - 1);
        const roof = new THREE.Mesh(roofGeo, buildingMat.clone());
        roof.position.set(x, h, z);
        roof.userData.mapGenerated = true;
        this.scene.add(roof);

        this._buildings.push({ x, z, w, d, template: { type: 'military_building' } });
    }

    _addMilitaryTank(x, z) {
        const tank = new THREE.Group();
        const hullMat = new THREE.MeshStandardMaterial({
            color: COLORS.militaryTank,
            roughness: 0.6,
            metalness: 0.4
        });

        // Medium hull
        const hullGeo = new THREE.BoxGeometry(5, 2.5, 8);
        const hull = new THREE.Mesh(hullGeo, hullMat);
        hull.position.y = 2;
        tank.add(hull);

        // Turret
        const turretGeo = new THREE.CylinderGeometry(1.5, 2, 2, 8);
        const turretMat = new THREE.MeshStandardMaterial({
            color: 0x54624a,
            roughness: 0.5,
            metalness: 0.5
        });
        const turret = new THREE.Mesh(turretGeo, turretMat);
        turret.position.set(0, 4.5, 0);
        tank.add(turret);

        // Barrel
        const barrelGeo = new THREE.CylinderGeometry(0.3, 0.4, 6, 6);
        const barrelMat = new THREE.MeshStandardMaterial({
            color: 0x3d4a2f,
            roughness: 0.4,
            metalness: 0.7
        });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 4.5, -4);
        tank.add(barrel);

        // Tracks
        for (let side of [-1, 1]) {
            const trackGeo = new THREE.BoxGeometry(1.2, 1.2, 8.5);
            const trackMat = new THREE.MeshStandardMaterial({
                color: COLORS.militaryTread,
                roughness: 0.9
            });
            const track = new THREE.Mesh(trackGeo, trackMat);
            track.position.set(side * 2.5, 0.6, 0);
            tank.add(track);
        }

        tank.position.set(x, 0, z);
        tank.rotation.y = this._rand() * Math.PI * 2;
        tank.userData.mapGenerated = true;
        this.scene.add(tank);

        this.addColliderBox(
            new THREE.Vector3(x, 2.5, z),
            6, 5, 9, false
        );
    }

    _addMilitaryFences(startX, startZ, size) {
        const fenceMat = new THREE.MeshStandardMaterial({
            color: 0x4a5238,
            roughness: 0.9
        });

        // Perimeter fence posts
        const postGeo = new THREE.BoxGeometry(0.15, 2.5, 0.15);
        for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * Math.PI * 2;
            const r = size * 0.45;
            const px = startX + r * Math.cos(angle);
            const pz = startZ + r * Math.sin(angle);

            const post = new THREE.Mesh(postGeo, fenceMat.clone());
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
        const mat = new THREE.MeshStandardMaterial({
            color: 0x9e9e9e,
            roughness: 0.95,
            flatShading: true
        });

        // L-shape sandbag wall
        for (let i = 0; i < 3; i++) {
            const bagGeo = new THREE.BoxGeometry(0.5, 0.3, 0.35);
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
            const bagGeo = new THREE.BoxGeometry(0.5, 0.3, 0.35);
            const bag = new THREE.Mesh(bagGeo, mat.clone());
            bag.position.set(x, 0.15, z + (i + 1) * 0.55);
            bag.userData.mapGenerated = true;
            this.scene.add(bag);
        }

        // Visual only — no spawn tile
    }

    _addMilitaryCrate(x, z) {
        // Massive military crate — grand scale
        const size = 2.5 + this._rand() * 1.5;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x6d4c41,
            roughness: 0.8,
            flatShading: true
        });
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
        const iceFloorMat = new THREE.MeshStandardMaterial({
            color: 0xddeeff, roughness: 0.8, flatShading: true
        });
        const iceFloorGeo = new THREE.PlaneGeometry(246, 246);
        const iceFloor = new THREE.Mesh(iceFloorGeo, iceFloorMat);
        iceFloor.rotation.x = -Math.PI / 2;
        iceFloor.position.set(133, 0.02, 133);
        iceFloor.userData.mapGenerated = true;
        this.scene.add(iceFloor);

        // ---- СТУПЕНЧАТОЕ КВАДРАТНОЕ ОЗЕРО (как в референсе) ----
        this._generateSteppedIceLake(130, 130);

        // Снежные дюны
        for (let drift = 0; drift < 16; drift++) {
            const driftW = 4 + this._rand() * 7;
            const driftH = 1 + this._rand() * 2;
            const driftD = 3 + this._rand() * 5;
            const driftGeo = new THREE.SphereGeometry(driftW, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
            const driftMat = new THREE.MeshStandardMaterial({
                color: 0xeef4ff, roughness: 0.9, flatShading: true
            });
            const driftMesh = new THREE.Mesh(driftGeo, driftMat);
            driftMesh.position.set(15 + this._rand() * 230, 0, 15 + this._rand() * 230);
            driftMesh.scale.set(1, driftH / driftW, driftD / driftW);
            driftMesh.userData.mapGenerated = true;
            this.scene.add(driftMesh);
        }

        // Иглу — детализированные, ближе к краям как в референсе
        const iglooPositions = [
            { x: 195, z: 50 }, { x: 230, z: 100 }, { x: 215, z: 165 },
            { x: 190, z: 220 }, { x: 60, z: 200 }, { x: 30, z: 145 },
            { x: 70, z: 60 },  { x: 140, z: 35 },
        ];
        for (const pos of iglooPositions) {
            this._addDetailedIgloo(pos.x, pos.z);
        }

        // Ледяные трещины на поверхности озера
        this._addIceCracks(130, 130);

        // Зимний костёр у озера
        this._addIceCampfire(175, 100);

        // Снежные люди (snowmen)
        this._addSnowmen(10, 10, 236);

        // Сани (sleighs)
        this._addSleighs(10, 10, 236);

        // Временные зимние укрытия (snow shelters)
        this._addSnowShelters(10, 10, 236);

        // Крупные ледяные кристаллы по краям
        const crystalPositions = [
            { x: 210, z: 30 }, { x: 240, z: 80 }, { x: 240, z: 185 },
            { x: 200, z: 240 }, { x: 40, z: 230 }, { x: 15, z: 180 },
            { x: 20, z: 70 },  { x: 90, z: 20 },
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
        for (let i = 0; i < 35; i++) {
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
            const wallGeo = new THREE.BoxGeometry(wallW, wallH, 0.5);
            const wallMat = new THREE.MeshStandardMaterial({
                color: 0xccddff, roughness: 0.4, transparent: true, opacity: 0.7
            });
            const wallMesh = new THREE.Mesh(wallGeo, wallMat);
            wallMesh.position.set(15 + this._rand() * 230, wallH / 2, 15 + this._rand() * 230);
            wallMesh.rotation.y = this._rand() * Math.PI;
            wallMesh.userData.mapGenerated = true;
            this.scene.add(wallMesh);
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
        const lakeMat = new THREE.MeshStandardMaterial({
            color: 0x7ecff5,
            roughness: 0.15,
            metalness: 0.3,
            transparent: true,
            opacity: 0.82
        });
        const icePlatMat = new THREE.MeshStandardMaterial({
            color: 0xaaddff,
            roughness: 0.4,
            metalness: 0.1,
            transparent: true,
            opacity: 0.9,
            flatShading: true
        });
        const shallowMat = new THREE.MeshStandardMaterial({
            color: 0x5ab8f0,
            roughness: 0.2,
            metalness: 0.2,
            transparent: true,
            opacity: 0.75
        });

        // Центральное озеро — глубокая часть (самая синяя)
        const deepGeo = new THREE.BoxGeometry(40, 0.3, 40);
        const deep = new THREE.Mesh(deepGeo, lakeMat.clone());
        deep.position.set(cx, 0.15, cz);
        deep.userData.mapGenerated = true;
        this.scene.add(deep);

        // Мелкие зоны вокруг — квадратные плитки
        const tileSize = 14;
        const steps = [
            // Первый уровень ступеней (ближние к центру)
            { dx: -27, dz: -27, w: tileSize, d: tileSize },
            { dx: 0,   dz: -35, w: tileSize * 2, d: tileSize },
            { dx: 27,  dz: -27, w: tileSize, d: tileSize },
            { dx: 35,  dz: 0,   w: tileSize, d: tileSize * 2 },
            { dx: 27,  dz: 27,  w: tileSize, d: tileSize },
            { dx: 0,   dz: 35,  w: tileSize * 2, d: tileSize },
            { dx: -27, dz: 27,  w: tileSize, d: tileSize },
            { dx: -35, dz: 0,   w: tileSize, d: tileSize * 2 },
        ];

        for (const s of steps) {
            const geo = new THREE.BoxGeometry(s.w, 0.2, s.d);
            const mesh = new THREE.Mesh(geo, shallowMat.clone());
            mesh.position.set(cx + s.dx, 0.1, cz + s.dz);
            mesh.userData.mapGenerated = true;
            this.scene.add(mesh);
        }

        // Внешние квадратные плитки льда (разной высоты) — как в референсе
        const outerTiles = [
            { dx: -55, dz: -55, w: 18, d: 18, y: 0.08 },
            { dx: 0,   dz: -60, w: 28, d: 14, y: 0.08 },
            { dx: 55,  dz: -55, w: 18, d: 18, y: 0.08 },
            { dx: 60,  dz: 0,   w: 14, d: 28, y: 0.08 },
            { dx: 55,  dz: 55,  w: 18, d: 18, y: 0.08 },
            { dx: 0,   dz: 60,  w: 28, d: 14, y: 0.08 },
            { dx: -55, dz: 55,  w: 18, d: 18, y: 0.08 },
            { dx: -60, dz: 0,   w: 14, d: 28, y: 0.08 },
            // Угловые дополнительные
            { dx: -28, dz: -55, w: 12, d: 12, y: 0.06 },
            { dx: 28,  dz: -55, w: 12, d: 12, y: 0.06 },
            { dx: 55,  dz: -28, w: 12, d: 12, y: 0.06 },
            { dx: 55,  dz: 28,  w: 12, d: 12, y: 0.06 },
            { dx: 28,  dz: 55,  w: 12, d: 12, y: 0.06 },
            { dx: -28, dz: 55,  w: 12, d: 12, y: 0.06 },
            { dx: -55, dz: 28,  w: 12, d: 12, y: 0.06 },
            { dx: -55, dz: -28, w: 12, d: 12, y: 0.06 },
        ];

        for (const t of outerTiles) {
            const geo = new THREE.BoxGeometry(t.w, 0.15, t.d);
            const mesh = new THREE.Mesh(geo, icePlatMat.clone());
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
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const r = 10 + this._rand() * 15;
            const crackX = cx + Math.cos(angle) * r;
            const crackZ = cz + Math.sin(angle) * r;
            const crackLen = 3 + this._rand() * 6;
            const crackGeo = new THREE.BoxGeometry(crackLen, 0.05, 0.15);
            const crackMat = new THREE.MeshStandardMaterial({
                color: 0x336699, roughness: 0.3, flatShading: true
            });
            const crack = new THREE.Mesh(crackGeo, crackMat);
            crack.position.set(crackX, 0.25, crackZ);
            crack.rotation.y = angle + this._rand() * 0.5;
            crack.userData.mapGenerated = true;
            this.scene.add(crack);
        }

        // Снежные купола на льду (maленькие глыбы льда по краям)
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.85, flatShading: true
        });
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 + this._rand() * 0.3;
            const r = 48 + this._rand() * 12;
            const bx = cx + Math.cos(angle) * r;
            const bz = cz + Math.sin(angle) * r;
            const size = 1.5 + this._rand() * 2.5;
            const geo = new THREE.SphereGeometry(size, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
            const mesh = new THREE.Mesh(geo, snowMat.clone());
            mesh.position.set(bx, 0, bz);
            mesh.userData.mapGenerated = true;
            this.scene.add(mesh);
        }
    }

    _addIceEdgeTrees(startX, startZ, size) {
        const positions = [];
        const edgeWidth = 15;

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
                        this._addSnowTree(tx, tz);
                    }
                }
            }
        }
    }

    _addIceSnowPiles(startX, startZ, size) {
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.9, flatShading: true
        });

        for (let i = 0; i < 40; i++) {
            const x = startX + this._rand() * size;
            const z = startZ + this._rand() * size;
            const pileGeo = new THREE.SphereGeometry(0.5 + this._rand() * 1.5, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
            const pile = new THREE.Mesh(pileGeo, snowMat.clone());
            pile.position.set(x, 0, z);
            pile.scale.y = 0.3;
            pile.userData.mapGenerated = true;
            this.scene.add(pile);
        }
    }

    _addIcePillars(cx, cz) {
        const pillarMat = new THREE.MeshStandardMaterial({
            color: 0xaaddff,
            roughness: 0.2,
            metalness: 0.3,
            transparent: true,
            opacity: 0.7,
            flatShading: true
        });

        // Pillars around lake
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const dist = 35 + this._rand() * 15;
            const px = cx + Math.cos(angle) * dist;
            const pz = cz + Math.sin(angle) * dist;
            const height = 3 + this._rand() * 5;
            const radius = 0.5 + this._rand() * 0.8;

            const geo = new THREE.CylinderGeometry(radius * 0.5, radius, height, 6);
            const pillar = new THREE.Mesh(geo, pillarMat.clone());
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
        const crackMat = new THREE.MeshStandardMaterial({
            color: 0x666666,
            roughness: 0.5,
            flatShading: true
        });

        // Cracks as thin flat boxes on lake surface
        for (let i = 0; i < 20; i++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = 5 + this._rand() * 25;
            const cx2 = cx + Math.cos(angle) * dist;
            const cz2 = cz + Math.sin(angle) * dist;
            const length = 2 + this._rand() * 4;
            const width = 0.05 + this._rand() * 0.1;

            const crackGeo = new THREE.PlaneGeometry(length, width);
            crackGeo.rotateX(-Math.PI / 2);
            const crack = new THREE.Mesh(crackGeo, crackMat);
            crack.position.set(cx2, 0.03, cz2);
            crack.rotation.y = this._rand() * Math.PI;
            crack.userData.mapGenerated = true;
            this.scene.add(crack);
        }
    }

    _addIceCampfire(cx, cz) {
        const campfire = new THREE.Group();
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x616161, roughness: 0.9, flatShading: true
        });
        const fireMat = new THREE.MeshStandardMaterial({
            color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 8.0,
            transparent: true, opacity: 0.8, flatShading: true
        });

        // Stone ring
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const stoneGeo = new THREE.DodecahedronGeometry(0.3, 0);
            const stone = new THREE.Mesh(stoneGeo, stoneMat);
            stone.position.set(Math.cos(angle) * 0.8, 0.2, Math.sin(angle) * 0.8);
            stone.rotation.set(this._rand(), this._rand(), this._rand());
            stone.userData.mapGenerated = true;
            campfire.add(stone);
        }

        // Fire glow
        const fireGeo = new THREE.SphereGeometry(0.4, 6, 6);
        const fire = new THREE.Mesh(fireGeo, fireMat);
        fire.position.set(0, 0.6, 0);
        fire.userData.isCampfire = true;
        campfire.add(fire);

        // Ice blocks around (snow shelter base)
        const iceBlockMat = new THREE.MeshStandardMaterial({
            color: 0xccddff, roughness: 0.4, transparent: true, opacity: 0.6, flatShading: true
        });
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const blockGeo = new THREE.BoxGeometry(1.5, 0.8, 0.5);
            const block = new THREE.Mesh(blockGeo, iceBlockMat.clone());
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
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.9, flatShading: true
        });
        const coalMat = new THREE.MeshStandardMaterial({
            color: 0x222222, roughness: 0.8
        });
        const carrotMat = new THREE.MeshStandardMaterial({
            color: 0xff6600, roughness: 0.7
        });

        for (let i = 0; i < 5; i++) {
            const snowman = new THREE.Group();
            const sx = startX + 20 + this._rand() * (size - 40);
            const sz = startZ + 20 + this._rand() * (size - 40);

            // Body (3 spheres)
            const bodyGeo = new THREE.SphereGeometry(1.2, 8, 6);
            const body = new THREE.Mesh(bodyGeo, snowMat);
            body.position.y = 1.2;
            body.userData.mapGenerated = true;
            snowman.add(body);

            const midGeo = new THREE.SphereGeometry(0.9, 8, 6);
            const mid = new THREE.Mesh(midGeo, snowMat);
            mid.position.y = 2.7;
            mid.userData.mapGenerated = true;
            snowman.add(mid);

            const headGeo = new THREE.SphereGeometry(0.6, 8, 6);
            const head = new THREE.Mesh(headGeo, snowMat);
            head.position.y = 3.8;
            head.userData.mapGenerated = true;
            snowman.add(head);

            // Eyes (coal)
            for (let side of [-0.2, 0.2]) {
                const eyeGeo = new THREE.SphereGeometry(0.08, 4, 4);
                const eye = new THREE.Mesh(eyeGeo, coalMat);
                eye.position.set(side, 3.9, 0.5);
                eye.userData.mapGenerated = true;
                snowman.add(eye);
            }

            // Carrot nose
            const noseGeo = new THREE.ConeGeometry(0.08, 0.3, 6);
            const nose = new THREE.Mesh(noseGeo, carrotMat);
            nose.position.set(0, 3.8, 0.6);
            nose.rotation.x = Math.PI / 2;
            nose.userData.mapGenerated = true;
            snowman.add(nose);

            // Arms (sticks)
            const armMat = new THREE.MeshStandardMaterial({
                color: 0x5d4037, roughness: 0.9
            });
            for (let side of [-1, 1]) {
                const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5);
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
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x6d4c41, roughness: 0.8, flatShading: true
        });
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x757575, roughness: 0.6, metalness: 0.5, flatShading: true
        });

        for (let i = 0; i < 3; i++) {
            const sleigh = new THREE.Group();
            const sx = startX + 30 + this._rand() * (size - 60);
            const sz = startZ + 30 + this._rand() * (size - 60);

            // Body
            const bodyGeo = new THREE.BoxGeometry(1.5, 0.8, 2.5);
            const body = new THREE.Mesh(bodyGeo, woodMat);
            body.position.y = 0.8;
            body.userData.mapGenerated = true;
            sleigh.add(body);

            // Seat
            const seatGeo = new THREE.BoxGeometry(1.2, 0.2, 1.5);
            const seat = new THREE.Mesh(seatGeo, woodMat);
            seat.position.set(0, 1.2, -0.2);
            seat.userData.mapGenerated = true;
            sleigh.add(seat);

            // Runners (metal)
            for (let side of [-0.8, 0.8]) {
                const runnerGeo = new THREE.BoxGeometry(0.1, 0.1, 3);
                const runner = new THREE.Mesh(runnerGeo, metalMat);
                runner.position.set(side, 0.1, 0);
                runner.userData.mapGenerated = true;
                sleigh.add(runner);
            }

            // Decorative front curve
            const frontGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6);
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
        }
    }

    _addSnowShelters(startX, startZ, size) {
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xf0f0f0, roughness: 0.9, flatShading: true
        });
        const canvasMat = new THREE.MeshStandardMaterial({
            color: 0x8d6e63, roughness: 0.95, flatShading: true
        });

        for (let i = 0; i < 4; i++) {
            const shelter = new THREE.Group();
            const sx = startX + 20 + this._rand() * (size - 40);
            const sz = startZ + 20 + this._rand() * (size - 40);

            // Snow block walls (3 sides)
            for (let w = 0; w < 3; w++) {
                const wallGeo = new THREE.BoxGeometry(3, 1.5, 0.5);
                const wall = new THREE.Mesh(wallGeo, snowMat.clone());
                if (w < 2) {
                    wall.position.set((w - 1) * 3, 0.75, -1);
                } else {
                    wall.position.set(0, 0.75, 0);
                }
                wall.userData.mapGenerated = true;
                shelter.add(wall);
            }

            // Canvas roof (angled)
            const roofGeo = new THREE.BoxGeometry(3.5, 0.15, 3.5);
            const roof = new THREE.Mesh(roofGeo, canvasMat);
            roof.position.set(0, 1.6, 0);
            roof.rotation.z = Math.PI / 8;
            roof.userData.mapGenerated = true;
            shelter.add(roof);

            shelter.position.set(sx, 0, sz);
            shelter.userData.isSnowShelter = true;
            shelter.userData.mapGenerated = true;
            this.scene.add(shelter);
        }
    }

    _addWindTurbine(x, z) {
        const group = new THREE.Group();

        // Мачта
        const towerGeo = new THREE.CylinderGeometry(0.2, 0.4, 15, 8);
        const towerMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.6,
            metalness: 0.5,
            flatShading: true
        });
        const tower = new THREE.Mesh(towerGeo, towerMat);
        tower.position.y = 7.5;
        group.add(tower);

        // Носовой обтекатель
        const hubGeo = new THREE.SphereGeometry(0.5, 8, 8);
        const hub = new THREE.Mesh(hubGeo, towerMat);
        hub.position.y = 15;
        group.add(hub);

        // Лопасти
        const bladeMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.4,
            flatShading: true
        });

        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const bladeGeo = new THREE.BoxGeometry(0.3, 5, 0.1);
            const blade = new THREE.Mesh(bladeGeo, bladeMat);
            blade.position.set(
                Math.cos(angle) * 2.5,
                15 + Math.sin(angle) * 2.5,
                0
            );
            blade.rotation.z = angle;
            blade.userData.isBlade = true;
            group.add(blade);
        }

        group.position.set(x, 0, z);
        group.userData.isWindTurbine = true;
        group.userData.mapGenerated = true;
        this.scene.add(group);
    }

    updateWindTurbines(delta) {
        const turbines = this.scene.children.filter(c => c.userData && c.userData.isWindTurbine);
        for (const turbine of turbines) {
            turbine.children.forEach(child => {
                if (child.userData && child.userData.isBlade) {
                    child.rotation.z += delta * 3;
                }
            });
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
        const particles = this.scene.children.find(c => c.userData && c.userData.isSnowParticles);
        if (!particles) return;
        const pos = particles.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            let y = pos.getY(i);
            y -= delta * 2;
            if (y < 0) {
                y = 20 + Math.random() * 10;
                pos.setX(i, 10 + Math.random() * 236);
                pos.setZ(i, 10 + Math.random() * 236);
            }
            pos.setY(i, y);
            pos.setX(i, pos.getX(i) + Math.sin(Date.now() * 0.001 + i) * delta * 0.5);
        }
        pos.needsUpdate = true;
    }

    _addIceToCenterPath(cx, cz) {
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0xeef4ff, roughness: 0.8, flatShading: true
        });

        const startX2 = cx;
        const startZ2 = cz;
        const endX = 0;
        const endZ = 0;

        let px = startX2;
        let pz = startZ2;
        for (let i = 0; i < 20; i++) {
            const t = i / 19;
            const segGeo = new THREE.BoxGeometry(3, 0.05, 4);
            const seg = new THREE.Mesh(segGeo, pathMat.clone());
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
        const iglooMat = new THREE.MeshStandardMaterial({
            color: COLORS.iceIgloo,
            roughness: 0.6,
            flatShading: true
        });
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.8,
            flatShading: true
        });

        // Dome with snow cap
        const domeGeo = new THREE.SphereGeometry(6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const dome = new THREE.Mesh(domeGeo, iglooMat);
        dome.position.y = 0;
        dome.userData.mapGenerated = true;
        igloo.add(dome);

        // Snow cap on top
        const capGeo = new THREE.SphereGeometry(5.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 3);
        const cap = new THREE.Mesh(capGeo, snowMat);
        cap.position.y = 0.5;
        cap.userData.mapGenerated = true;
        igloo.add(cap);

        // Interior floor
        const intFloorGeo = new THREE.CircleGeometry(5, 16);
        intFloorGeo.rotateX(-Math.PI / 2);
        const intFloorMat = new THREE.MeshStandardMaterial({
            color: 0xe0e0e0,
            roughness: 0.7
        });
        const intFloor = new THREE.Mesh(intFloorGeo, intFloorMat);
        intFloor.position.y = 0.2;
        intFloor.userData.mapGenerated = true;
        intFloor.userData.walkable = true;
        igloo.add(intFloor);

        // Entrance tunnel
        const tunnelGeo = new THREE.CylinderGeometry(1.5, 1.5, 4, 8);
        tunnelGeo.rotateZ(Math.PI / 2);
        const tunnel = new THREE.Mesh(tunnelGeo, iglooMat.clone());
        tunnel.position.set(5, 1, 0);
        tunnel.userData.mapGenerated = true;
        igloo.add(tunnel);

        // Interior torch (warm glow inside)
        const torchMat = new THREE.MeshStandardMaterial({
            color: 0x5d4037, roughness: 0.8, flatShading: true
        });
        const fireMat = new THREE.MeshStandardMaterial({
            color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 10.0,
            transparent: true, opacity: 0.9, flatShading: true
        });
        const torch = new THREE.Group();
        const stickGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.6, 5);
        const stick = new THREE.Mesh(stickGeo, torchMat);
        stick.rotation.x = Math.PI / 6;
        stick.position.set(-3, 3, 2);
        stick.userData.mapGenerated = true;
        torch.add(stick);
        const flameGeo = new THREE.SphereGeometry(0.15, 6, 6);
        const flame = new THREE.Mesh(flameGeo, fireMat.clone());
        flame.position.set(-3, 3.4, 2);
        flame.userData.isTorch = true;
        flame.userData.blinkRate = 2.5;
        torch.add(flame);
        torch.userData.mapGenerated = true;
        igloo.add(torch);

        // Interior bench (log bench)
        const benchMat = new THREE.MeshStandardMaterial({
            color: 0x6d4c41, roughness: 0.9, flatShading: true
        });
        const benchGeo = new THREE.BoxGeometry(2, 0.3, 0.5);
        const bench = new THREE.Mesh(benchGeo, benchMat);
        bench.position.set(-2, 0.5, -2);
        bench.userData.mapGenerated = true;
        igloo.add(bench);

        // Chest inside
        const chestMat = new THREE.MeshStandardMaterial({
            color: 0x8B4513, emissive: 0xffaa00, emissiveIntensity: 2.0,
            roughness: 0.7, flatShading: true
        });
        const chestGeo = new THREE.BoxGeometry(0.8, 0.6, 0.6);
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.set(3, 0.3, -2);
        chest.userData.isTowerChest = true;
        chest.userData.mapGenerated = true;
        igloo.add(chest);

        igloo.position.set(x, 0, z);
        igloo.userData.mapGenerated = true;
        this.scene.add(igloo);

        this.addColliderBox(
            new THREE.Vector3(x, 3, z),
            12, 6, 12, false
        );
    }

    _addIceCrystal(x, z) {
        // Large ice crystal
        const height = 5 + this._rand() * 6;
        const radius = 1 + this._rand() * 1;
        const sides = 6 + Math.floor(this._rand() * 3);

        const geo = new THREE.ConeGeometry(radius, height, sides);
        const mat = new THREE.MeshStandardMaterial({
            color: COLORS.iceCrystal + Math.floor(this._rand() * 0x20 - 0x10),
            roughness: 0.2,
            metalness: 0.2,
            flatShading: true,
            transparent: true,
            opacity: 0.85
        });

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
        // Large snow tree
        const trunkH = 15 + this._rand() * 8;
        const trunkR = 0.8 + this._rand() * 0.6;

        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.5, trunkR, trunkH, 6);
        const trunkMat = new THREE.MeshStandardMaterial({
            color: COLORS.forestTrunk,
            roughness: 0.8
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        this.scene.add(trunk);
        this.addColliderBox(
            new THREE.Vector3(x, trunkH / 2, z),
            trunkR * 2, trunkH, trunkR * 2, false
        );

        // Snow layers
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.7,
            flatShading: true
        });

        for (let l = 0; l < 4; l++) {
            const layerR = (6 - l * 1.2) * (0.8 + this._rand() * 0.4);
            const layerGeo = new THREE.ConeGeometry(layerR, 5, 6);
            const snowLayer = new THREE.Mesh(layerGeo, snowMat.clone());
            snowLayer.position.set(x, trunkH - 3 + l * 4, z);
            snowLayer.userData.mapGenerated = true;
            this.scene.add(snowLayer);
        }
    }

    _addRadioTower(x, z) {
        // Large radio tower
        const tower = new THREE.Group();
        const poleMat = new THREE.MeshStandardMaterial({
            color: COLORS.iceTower,
            roughness: 0.6
        });

        // Main pole
        const poleGeo = new THREE.CylinderGeometry(0.5, 0.8, 25, 8);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 12.5;
        pole.userData.mapGenerated = true;
        tower.add(pole);

        // Cross braces
        for (let br = 6; br < 25; br += 5) {
            const braceGeo = new THREE.BoxGeometry(5, 0.2, 5);
            const brace = new THREE.Mesh(braceGeo, poleMat.clone());
            brace.position.y = br;
            brace.userData.mapGenerated = true;
            tower.add(brace);
        }

        // Dish antenna
        const dishGeo = new THREE.ConeGeometry(3, 5, 8, 1, true);
        const dishMat = new THREE.MeshStandardMaterial({
            color: 0x6b7280,
            roughness: 0.3,
            metalness: 0.6
        });
        const dish = new THREE.Mesh(dishGeo, dishMat);
        dish.position.set(0, 26, -1);
        dish.rotation.x = Math.PI / 6;
        dish.userData.mapGenerated = true;
        tower.add(dish);

        tower.position.set(x, 0, z);
        tower.userData.mapGenerated = true;
        this.scene.add(tower);

        this.addColliderBox(
            new THREE.Vector3(x, 12.5, z),
            1.5, 25, 1.5, false
        );
    }

    // =========================================================================
    // COVER OBJECTS — Biome-specific placement
    // =========================================================================
    _placeCoverObjects() {
        // Forest cover: wooden barrels + mushroom clusters (NW quadrant only)
        for (let i = 0; i < 40; i++) {
            const x = -HALF + 15 + this._rand() * (HALF - 40);
            const z = -HALF + 15 + this._rand() * (HALF - 40);
            if (x > -5 || z > -5 || Math.sqrt(x * x + z * z) < 80) continue;
            this._addBarrel(x, z);
        }
        for (let i = 0; i < 30; i++) {
            const x = -HALF + 15 + this._rand() * (HALF - 40);
            const z = -HALF + 15 + this._rand() * (HALF - 40);
            if (x > -5 || z > -5 || Math.sqrt(x * x + z * z) < 80) continue;
            this._addMushroomCluster(x, z);
        }

        // Maze cover: stone crates + mossy rocks (NE quadrant only)
        for (let i = 0; i < 50; i++) {
            const x = 5 + this._rand() * (HALF - 25);
            const z = -HALF + 15 + this._rand() * (HALF - 40);
            if (x < 5 || z > -5 || Math.sqrt(x * x + z * z) < 80) continue;
            this._addCrate(x, z);
        }

        // Military cover: ammo crates + sandbag stacks (SW quadrant only)
        for (let i = 0; i < 40; i++) {
            const x = -HALF + 15 + this._rand() * (HALF - 40);
            const z = 5 + this._rand() * (HALF - 25);
            if (x > -5 || z < 5 || Math.sqrt(x * x + z * z) < 80) continue;
            this._addMilitaryCrate(x, z);
        }
        for (let i = 0; i < 30; i++) {
            const x = -HALF + 15 + this._rand() * (HALF - 40);
            const z = 5 + this._rand() * (HALF - 25);
            if (x > -5 || z < 5 || Math.sqrt(x * x + z * z) < 80) continue;
            this._addSandbagBarrier(x, z);
        }

        // Ice cover: snow mounds + ice chunks (SE quadrant only)
        for (let i = 0; i < 40; i++) {
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
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0x8d6e63,
            roughness: 1.0,
            flatShading: true
        });

        // Forest to Maze path (horizontal) — spawn pads at path endpoints (tile-grid snapped)
        for (let i = 0; i < 10; i++) {
            const px = -80 + i * 16;
            const pz = Math.round((-20 + this._rand() * 10) / TILE_SIZE) * TILE_SIZE;
            const segGeo = new THREE.BoxGeometry(2, 0.05, 2);
            const seg = new THREE.Mesh(segGeo, pathMat);
            seg.position.set(px, 0.03, pz);
            seg.userData.mapGenerated = true;
            seg.userData.walkable = true;
            this.scene.add(seg);
        }
        // Military to Ice path (diagonal)
        for (let i = 0; i < 8; i++) {
            const px = Math.round((-60 + i * 12) / TILE_SIZE) * TILE_SIZE;
            const pz = Math.round((60 + i * 12) / TILE_SIZE) * TILE_SIZE;
            const segGeo = new THREE.BoxGeometry(2, 0.05, 2);
            const seg = new THREE.Mesh(segGeo, pathMat.clone());
            seg.position.set(px, 0.03, pz);
            seg.userData.mapGenerated = true;
            seg.userData.walkable = true;
            this.scene.add(seg);
        }

        // Forest to Military path (vertical)
        for (let i = 0; i < 8; i++) {
            const px = Math.round((-60 + this._rand() * 10) / TILE_SIZE) * TILE_SIZE;
            const pz = Math.round((20 + i * 16) / TILE_SIZE) * TILE_SIZE;
            const segGeo = new THREE.BoxGeometry(2, 0.05, 2);
            const seg = new THREE.Mesh(segGeo, pathMat.clone());
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
        const wallH = 18;   // Wall height
        const wallT = 1.5;  // Thickness
        const half = HALF;  // 256
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x4dd0e1,
            emissive: 0x006064,
            emissiveIntensity: 0.4,
            roughness: 0.1,
            metalness: 0.2,
            transparent: true,
            opacity: 0.55,
            flatShading: false
        });

        // Bottom base plate (solid floor under walls)
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x1565c0,
            roughness: 0.7,
            flatShading: true
        });

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
            const geo = new THREE.BoxGeometry(w.w, w.h, w.d);
            const mesh = new THREE.Mesh(geo, wallMat.clone());
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
            const geo = new THREE.BoxGeometry(b.w, 0.5, b.d);
            const mesh = new THREE.Mesh(geo, baseMat.clone());
            mesh.position.set(b.x, 0.25, b.z);
            mesh.userData.mapGenerated = true;
            this.scene.add(mesh);
        }
    }

    // =========================================================================
    // COMPASS MARKERS — N/S/E/W markers at map edges like reference
    // =========================================================================
    _generateCompassMarkers() {
        const markerH = 22;
        const dirs = [
            { label: 'N', x: 0, z: -HALF + 15, color: 0xff5252 },
            { label: 'S', x: 0, z: HALF - 15,  color: 0xff5252 },
            { label: 'W', x: -HALF + 15, z: 0, color: 0xffffff },
            { label: 'E', x: HALF - 15,  z: 0, color: 0xffffff },
        ];

        for (const d of dirs) {
            // Tall thin pole
            const poleGeo = new THREE.CylinderGeometry(0.3, 0.4, markerH, 8);
            const poleMat = new THREE.MeshStandardMaterial({
                color: d.color, roughness: 0.5, flatShading: true
            });
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(d.x, markerH / 2, d.z);
            pole.userData.mapGenerated = true;
            this.scene.add(pole);

            // Arrow/cone at top
            const coneGeo = new THREE.ConeGeometry(1.0, 3, 6);
            const cone = new THREE.Mesh(coneGeo, poleMat.clone());
            cone.position.set(d.x, markerH + 1.5, d.z);
            cone.userData.mapGenerated = true;
            this.scene.add(cone);

            // Canvas text label
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath();
            ctx.arc(32, 32, 30, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = d.label === 'N' || d.label === 'S' ? '#ff5252' : '#ffffff';
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(d.label, 32, 32);
            const tex = new THREE.CanvasTexture(canvas);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: tex, transparent: true, depthTest: false
            }));
            sprite.position.set(d.x, markerH + 5, d.z);
            sprite.scale.set(5, 5, 1);
            sprite.userData.mapGenerated = true;
            this.scene.add(sprite);
        }
    }

    _addIceChunk(x, z) {
        const size = 0.5 + this._rand() * 1.5;
        const geo = new THREE.DodecahedronGeometry(size, 0);
        const mat = new THREE.MeshStandardMaterial({
            color: COLORS.iceCrystal,
            roughness: 0.3,
            metalness: 0.1,
            transparent: true,
            opacity: 0.8,
            flatShading: true
        });
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
        const geo = new THREE.CylinderGeometry(1.2, 1.2, 2.5, 12);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x5d4037,
            roughness: 0.8
        });
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
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xa1887f,
            roughness: 0.8,
            flatShading: true
        });
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
        const stemMat = new THREE.MeshStandardMaterial({ color: 0xfff9c4, roughness: 0.8 });
        const capMat = new THREE.MeshStandardMaterial({
            color: COLORS.forestMushroom,
            roughness: 0.6,
            flatShading: true
        });

        const count = 3 + Math.floor(this._rand() * 4);
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const r = 0.3 + this._rand() * 0.5;
            const mx = Math.cos(angle) * r;
            const mz = Math.sin(angle) * r;
            const stemH = 0.3 + this._rand() * 0.4;

            const stemGeo = new THREE.CylinderGeometry(0.08, 0.1, stemH, 6);
            const stem = new THREE.Mesh(stemGeo, stemMat);
            stem.position.set(mx, stemH / 2, mz);
            stem.userData.mapGenerated = true;
            cluster.add(stem);

            const capGeo = new THREE.SphereGeometry(0.25 + this._rand() * 0.15, 6, 6);
            capGeo.scale(1, 0.6, 1);
            const cap = new THREE.Mesh(capGeo, capMat.clone());
            cap.position.set(mx, stemH + 0.15, mz);
            cap.userData.mapGenerated = true;
            cluster.add(cap);

            // White spots on cap
            for (let s = 0; s < 3; s++) {
                const spotGeo = new THREE.SphereGeometry(0.05, 4, 4);
                const spotMat = new THREE.MeshStandardMaterial({
                    color: COLORS.forestMushroomSpot,
                    roughness: 0.7
                });
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
            if (b.template?.type === 'log_cabin') {
                spots.push({
                    x: b.x,
                    z: b.z + b.d / 2 + 2,
                    type: 'house'
                });
            }
        }
        return spots;
    }

    getHangarSpots() {
        return [];
    }

    getExplosiveBarrelSpots() {
        const spots = [];
        for (let i = 0; i < 30; i++) {
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

    setCourtyardGateOpen(open) {
        // Stub
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
        for (let i = 0, n = this._meshes.length; i < n; i++) {
            const mesh = this._meshes[i];
            if (!mesh || !mesh.userData || !mesh.userData._mapCulled) continue;
            const dx = mesh.position.x - pos.x;
            const dz = mesh.position.z - pos.z;
            const dSq = dx * dx + dz * dz;
            if (dSq > distSq) {
                mesh.visible = false;
            } else if (mesh.visible === false) {
                mesh.visible = true;
            }
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
        // Distance-based visibility culling for performance
        if (!playerPos) return;
        const cullDist = this.isMobile ? 120 : 200;
        const cullDistFar = this.isMobile ? 180 : 300;
        
        this.scene.traverse((obj) => {
            if (obj.isMesh && obj.userData.mapGenerated !== false) {
                const dist = obj.position.distanceTo(playerPos);
                if (dist > cullDistFar) {
                    obj.visible = false;
                } else if (dist > cullDist) {
                    obj.visible = !obj.userData?.isDetail;
                }
            }
        });
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

    /** Create a simple 3D text sprite for quadrant labels */
    _createTextSprite(text, position, size = 4) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(10, 10, 492, 108, 20);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.copy(position);
        sprite.position.y = 12;
        sprite.scale.set(size * 4, size, 1);
        sprite.userData.mapGenerated = true;
        return sprite;
    }

    _addQuadrantLabels() {
        const labels = [
            { text: 'Forest', pos: new THREE.Vector3(-120, 0, -120) },
            { text: 'Stone Maze', pos: new THREE.Vector3(120, 0, -120) },
            { text: 'Military Ruins', pos: new THREE.Vector3(-120, 0, 120) },
            { text: 'Ice Lake', pos: new THREE.Vector3(120, 0, 120) }
        ];

        for (const label of labels) {
            const sprite = this._createTextSprite(label.text, label.pos, 5);
            this.scene.add(sprite);
        }
    }

    _addCompass() {
        // North arrow
        const northGeo = new THREE.ConeGeometry(2, 6, 4);
        const northMat = new THREE.MeshStandardMaterial({
            color: 0xff5252,
            roughness: 0.6,
            flatShading: true
        });
        const north = new THREE.Mesh(northGeo, northMat);
        north.position.set(0, 3, -HALF + 30);
        north.userData.mapGenerated = true;
        this.scene.add(north);

        // N label
        const nCanvas = document.createElement('canvas');
        const nCtx = nCanvas.getContext('2d');
        nCanvas.width = 64;
        nCanvas.height = 64;
        nCtx.fillStyle = '#ffffff';
        nCtx.font = 'bold 48px Arial';
        nCtx.textAlign = 'center';
        nCtx.textBaseline = 'middle';
        nCtx.fillText('N', 32, 32);

        const nTexture = new THREE.CanvasTexture(nCanvas);
        const nSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: nTexture,
            transparent: true,
            depthTest: false
        }));
        nSprite.position.set(0, 12, -HALF + 30);
        nSprite.scale.set(4, 4, 1);
        nSprite.userData.mapGenerated = true;
        this.scene.add(nSprite);

        // South arrow
        const south = new THREE.Mesh(northGeo.clone(), northMat.clone());
        south.position.set(0, 3, HALF - 30);
        south.userData.mapGenerated = true;
        this.scene.add(south);

        // E/W labels
        const ewCanvas = document.createElement('canvas');
        const ewCtx = ewCanvas.getContext('2d');
        ewCanvas.width = 128;
        ewCanvas.height = 64;
        ewCtx.fillStyle = '#ffffff';
        ewCtx.font = 'bold 36px Arial';
        ewCtx.textAlign = 'center';
        ewCtx.textBaseline = 'middle';
        ewCtx.fillText('E', 96, 32);
        ewCtx.fillText('W', 32, 32);

        const ewTexture = new THREE.CanvasTexture(ewCanvas);
        const ewSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: ewTexture,
            transparent: true,
            depthTest: false
        }));
        ewSprite.position.set(0, 8, 0);
        ewSprite.scale.set(8, 4, 1);
        ewSprite.userData.mapGenerated = true;
        this.scene.add(ewSprite);
    }

    _addLegend() {
        const legendCanvas = document.createElement('canvas');
        const legendCtx = legendCanvas.getContext('2d');
        legendCanvas.width = 256;
        legendCanvas.height = 256;

        // Background
        legendCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        legendCtx.beginPath();
        legendCtx.roundRect(10, 10, 236, 236, 15);
        legendCtx.fill();

        // Title
        legendCtx.fillStyle = '#ffffff';
        legendCtx.font = 'bold 24px Arial';
        legendCtx.textAlign = 'left';
        legendCtx.fillText('Map Legend', 25, 45);

        // Legend items
        const items = [
            { text: 'Forest', color: '#4caf50' },
            { text: 'Stone Maze', color: '#9e9e9e' },
            { text: 'Military Ruins', color: '#795548' },
            { text: 'Ice Lake', color: '#e0f7fa' },
            { text: 'Cornucopia', color: '#ffd700' }
        ];

        items.forEach((item, i) => {
            const y = 80 + i * 35;
            legendCtx.fillStyle = item.color;
            legendCtx.beginPath();
            legendCtx.roundRect(25, y, 20, 20, 4);
            legendCtx.fill();

            legendCtx.fillStyle = '#ffffff';
            legendCtx.font = '18px Arial';
            legendCtx.fillText(item.text, 55, y + 16);
        });

        const legendTexture = new THREE.CanvasTexture(legendCanvas);
        legendTexture.minFilter = THREE.LinearFilter;
        const legendSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: legendTexture,
            transparent: true,
            depthTest: false
        }));
        legendSprite.position.set(HALF - 20, 10, 0);
        legendSprite.scale.set(10, 10, 1);
        legendSprite.userData.mapGenerated = true;
        this.scene.add(legendSprite);
    }

    updateFireflyAnimation(delta) {
        const fireflies = this.scene.children.filter(c => c.userData && c.userData.isFirefly);
        for (const ff of fireflies) {
            const t = Date.now() * 0.001;
            ff.userData.angle += ff.userData.speed * delta;
            ff.position.x = ff.userData.center.x + Math.cos(ff.userData.angle) * ff.userData.radius;
            ff.position.z = ff.userData.center.z + Math.sin(ff.userData.angle) * ff.userData.radius;
            ff.position.y = ff.userData.baseY + Math.sin(t * 2 + ff.userData.blinkPhase) * 0.5;
            const blink = Math.sin(t * ff.userData.blinkRate * Math.PI * 2);
            ff.material.opacity = blink > 0 ? 0.9 : 0.1;
        }
    }

    updateCrystalAnimation(delta) {
        const crystals = this.scene.children.filter(c => c.userData && c.userData.isCrystal);
        for (const cr of crystals) {
            const t = Date.now() * 0.001;
            const blink = Math.sin(t * cr.userData.blinkRate * Math.PI * 2);
            cr.material.emissiveIntensity = 2.0 + blink * 2.0;
            cr.rotation.y += delta * 0.5;
        }
    }

    updateTorchAnimation(delta) {
        const torches = this.scene.children.filter(c => c.userData && c.userData.isTorch);
        for (const t of torches) {
            const t2 = Date.now() * 0.001;
            const flicker = Math.sin(t2 * t.userData.blinkRate * Math.PI * 2) * 0.5 + 0.5;
            t.scale.set(
                0.8 + flicker * 0.4,
                0.8 + flicker * 0.4,
                0.8 + flicker * 0.4
            );
            t.material.emissiveIntensity = 5.0 + flicker * 8.0;
        }
    }

    updateGlowAnimation(delta) {
        const glows = this.scene.children.filter(c => c.userData && c.userData.isGlow);
        for (const g of glows) {
            const t = Date.now() * 0.001;
            const pulse = Math.sin(t * 2) * 0.3 + 0.7;
            g.material.opacity = 0.3 + pulse * 0.4;
            g.scale.setScalar(0.8 + pulse * 0.3);
        }
    }
}
