import * as THREE from "../node_modules/three/build/three.module.js";
import { MapGeneratorNode } from "./MapGeneratorNode.js";
import { AABBGrid } from "./AABBGrid.js";
import { DebugOverlay } from "./DebugOverlay.js";

// ============================================================================
// QUADRANT-BASED MAP GENERATOR — Matches reference screenshot layout
// ============================================================================
// Quadrants:
//   NW (top-left)  = Forest (зелёный, деревья, хижинки, тропы, грибы)
//   NE (top-right) = Stone Maze (серый лабиринт из стен)
//   SW (bottom-left) = Military Ruins (разрушенные здания, танки, баррикады)
//   SE (bottom-right) = Ice/Snow (лёд, иглу, сосульки, радиовышка)
//   Center         = Golden Cornucopia (золотой рог + круглая платформа спавна)
// ============================================================================

const MAP_SIZE = 512;
const TILE_SIZE = 4;
const GRID_W = MAP_SIZE / TILE_SIZE; // 128
const GRID_H = MAP_SIZE / TILE_SIZE; // 128
const HALF = MAP_SIZE / 2; // 256

// Biome colors matching reference image
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
        this.heightMap = null;
        this._terrainMaterial = null;
        this._tmpMatrix = new THREE.Matrix4();
        this._tmpPos = new THREE.Vector3();
        this._randState = this.seed;
        this._resolveReady = null;
        this.ready = new Promise((resolve) => { this._resolveReady = resolve; });
        this._generatePromise = null;
        this.onProgress = null;
        this._buildings = [];
        this._floorTiles = [];
    }

    startGeneration() {
        if (!this._generatePromise) {
            this._generatePromise = this._generate();
        }
        return this._generatePromise;
    }

    async _generate() {
        this._reset();
        this._logProgress(0);
        this._logProgress(0.15);

        // Phase 1: Terrain base
        this._generateTerrain();

        // Phase 2: Central cornucopia + spawn courtyard
        this._generateCornucopia();

        // Phase 3: River + bridges
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

        // Phase 9: Spawn pads
        this._buildSpawnPads();

        // Phase 10: Finalize
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

    // =========================================================================
    // TERRAIN — Circular map with quadrant-based vertex colors
    // =========================================================================
    _generateTerrain() {
        // Create circular terrain with quadrant-based vertex colors
        const geo = new THREE.CircleGeometry(HALF - 10, 64);
        geo.rotateX(-Math.PI / 2);

        const colors = [];
        const posAttr = geo.getAttribute('position');
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const z = posAttr.getZ(i);
            const color = this._getTerrainColor(x, z);
            colors.push(color.r, color.g, color.b);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9,
            flatShading: true
        });
        this._terrainMaterial = mat;

        const terrain = new THREE.Mesh(geo, mat);
        terrain.position.set(0, 0, 0);
        terrain.userData.mapGenerated = true;
        terrain.userData.walkable = true;
        this.scene.add(terrain);

        // Dark circular boundary ring
        const boundaryGeo = new THREE.RingGeometry(HALF - 12, HALF - 8, 64);
        boundaryGeo.rotateX(-Math.PI / 2);
        const boundaryMat = new THREE.MeshStandardMaterial({
            color: COLORS.mapBoundary,
            roughness: 0.95,
            flatShading: true,
            side: THREE.DoubleSide
        });
        const boundary = new THREE.Mesh(boundaryGeo, boundaryMat);
        boundary.position.set(0, 0.02, 0);
        boundary.userData.mapGenerated = true;
        this.scene.add(boundary);

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

        // Cornucopia center area
        if (distFromCenter < 40) {
            return new THREE.Color(0xc8b88a);
        }

        // River (vertical line between NW and NE, SW and SE)
        if (Math.abs(x) < 4 && distFromCenter > 45) {
            return new THREE.Color(COLORS.river);
        }

        // Quadrant colors — matching reference screenshot
        if (x < 0 && z < 0) {
            // NW = Forest — bright green
            return new THREE.Color(COLORS.forestTerrain);
        } else if (x >= 0 && z < 0) {
            // NE = Stone Maze — light gray
            return new THREE.Color(COLORS.mazeTerrain);
        } else if (x < 0 && z >= 0) {
            // SW = Military Ruins — brownish-gray
            return new THREE.Color(COLORS.militaryTerrain);
        } else {
            // SE = Ice/Snow — white/light blue
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
    // CENTRAL CORNUCOPIA (Golden Horn)
    // =========================================================================
    _generateCornucopia() {
        const group = new THREE.Group();

        // Circular spawn platform
        const platformGeo = new THREE.CylinderGeometry(38, 38, 0.3, 48);
        const platformMat = new THREE.MeshStandardMaterial({
            color: 0xd7ccc8,
            roughness: 0.7,
            flatShading: true
        });
        const platform = new THREE.Mesh(platformGeo, platformMat);
        platform.position.set(0, 0.15, 0);
        platform.userData.mapGenerated = true;
        platform.userData.walkable = true;
        group.add(platform);
        this.addColliderBox(new THREE.Vector3(0, 0.15, 0), 76, 0.3, 76, true);

        // Decorative radial sunburst pattern on platform
        const sunburstMat = new THREE.MeshStandardMaterial({
            color: 0xbcaaa4,
            roughness: 0.85,
            flatShading: true,
            side: THREE.DoubleSide
        });
        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2;
            const rayGeo = new THREE.PlaneGeometry(0.8, 30, 1, 1);
            rayGeo.rotateX(-Math.PI / 2);
            const ray = new THREE.Mesh(rayGeo, sunburstMat.clone());
            ray.position.set(0, 0.32, 0);
            ray.rotation.y = angle;
            ray.userData.mapGenerated = true;
            group.add(ray);
        }

        // Outer ring
        const outerRingGeo = new THREE.RingGeometry(30, 34, 48);
        outerRingGeo.rotateX(-Math.PI / 2);
        const outerRingMat = new THREE.MeshStandardMaterial({
            color: 0xa1887f,
            roughness: 0.8,
            flatShading: true,
            side: THREE.DoubleSide
        });
        const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
        outerRing.position.set(0, 0.33, 0);
        outerRing.userData.mapGenerated = true;
        group.add(outerRing);

        // Inner ring
        const innerRingGeo = new THREE.RingGeometry(20, 23, 48);
        innerRingGeo.rotateX(-Math.PI / 2);
        const innerRingMat = new THREE.MeshStandardMaterial({
            color: 0x8d6e63,
            roughness: 0.8,
            flatShading: true,
            side: THREE.DoubleSide
        });
        const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
        innerRing.position.set(0, 0.33, 0);
        innerRing.userData.mapGenerated = true;
        group.add(innerRing);

        // Golden Cornucopia (horn shape)
        const hornMat = new THREE.MeshStandardMaterial({
            color: COLORS.cornucopia,
            metalness: 0.8,
            roughness: 0.15
        });

        // Main horn body — lathe geometry for curved horn shape
        const hornPoints = [];
        for (let i = 0; i <= 20; i++) {
            const t = i / 20;
            const radius = 6 * (1 - t * 0.8);
            const y = t * 14;
            hornPoints.push(new THREE.Vector2(radius, y));
        }
        const hornGeo = new THREE.LatheGeometry(hornPoints, 24);
        const horn = new THREE.Mesh(hornGeo, hornMat);
        horn.position.set(0, 0.3, 0);
        horn.rotation.y = Math.PI * 0.15;
        horn.userData.mapGenerated = true;
        group.add(horn);

        // Horn opening (inner dark area)
        const openingGeo = new THREE.TorusGeometry(4, 0.5, 8, 24);
        const openingMat = new THREE.MeshStandardMaterial({
            color: 0x3e2723,
            roughness: 0.9
        });
        const opening = new THREE.Mesh(openingGeo, openingMat);
        opening.position.set(4, 8, 0);
        opening.rotation.y = Math.PI * 0.15;
        opening.rotation.z = Math.PI / 6;
        opening.userData.mapGenerated = true;
        group.add(opening);

        // Loot items spilling from horn (small colored boxes/spheres)
        const lootColors = [0xff5252, 0x448aff, 0x69f0ae, 0xffab40, 0xe040fb, 0xffd740];
        for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * Math.PI * 2;
            const r = 3 + this._rand() * 4;
            const lootGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
            const lootMat = new THREE.MeshStandardMaterial({
                color: lootColors[i % lootColors.length],
                roughness: 0.6,
                metalness: 0.3,
                flatShading: true
            });
            const loot = new THREE.Mesh(lootGeo, lootMat);
            loot.position.set(
                Math.cos(angle) * r,
                1 + this._rand() * 2,
                Math.sin(angle) * r
            );
            loot.rotation.set(
                this._rand() * Math.PI,
                this._rand() * Math.PI,
                this._rand() * Math.PI
            );
            loot.userData.mapGenerated = true;
            group.add(loot);
        }

        this.scene.add(group);
    }

    // =========================================================================
    // RIVER + BRIDGES
    // =========================================================================
    _generateRiver() {
        const riverMat = new THREE.MeshStandardMaterial({
            color: COLORS.river,
            roughness: 0.3,
            metalness: 0.2,
            transparent: true,
            opacity: 0.75
        });

        // Main river channel (vertical through center)
        const riverGeo = new THREE.PlaneGeometry(8, MAP_SIZE * 0.9, 1, 1);
        riverGeo.rotateX(-Math.PI / 2);
        const river = new THREE.Mesh(riverGeo, riverMat);
        river.position.set(0, 0.05, 0);
        river.userData.mapGenerated = true;
        this.scene.add(river);

        // Horizontal river branch (connecting to east)
        const hRiverGeo = new THREE.PlaneGeometry(MAP_SIZE * 0.4, 4, 1, 1);
        hRiverGeo.rotateX(-Math.PI / 2);
        const hRiver = new THREE.Mesh(hRiverGeo, riverMat.clone());
        hRiver.position.set(0, 0.04, HALF * 0.3);
        hRiver.userData.mapGenerated = true;
        this.scene.add(hRiver);

        // Bridges
        this._addBridge(0, -80);
        this._addBridge(0, 0);
        this._addBridge(0, 80);
        this._addBridge(0, 160);
    }

    _addBridge(x, z) {
        const bridgeMat = new THREE.MeshStandardMaterial({
            color: COLORS.bridge,
            roughness: 0.85,
            flatShading: true
        });

        // Bridge deck
        const deckGeo = new THREE.BoxGeometry(10, 0.5, 5);
        const deck = new THREE.Mesh(deckGeo, bridgeMat);
        deck.position.set(x, 0.6, z);
        deck.userData.mapGenerated = true;
        deck.userData.walkable = true;
        this.scene.add(deck);
        this.addColliderBox(new THREE.Vector3(x, 0.6, z), 10, 0.5, 5, true);

        // Railings
        const railGeo = new THREE.BoxGeometry(0.3, 1.5, 5);
        for (let side of [-1, 1]) {
            const rail = new THREE.Mesh(railGeo, bridgeMat.clone());
            rail.position.set(x + side * 4.8, 1.1, z);
            rail.userData.mapGenerated = true;
            this.scene.add(rail);
        }

        // Bridge supports
        const supportGeo = new THREE.BoxGeometry(0.8, 1.2, 0.8);
        const supportMat = new THREE.MeshStandardMaterial({
            color: 0x6d4c41,
            roughness: 0.9
        });
        for (let i = -1; i <= 1; i++) {
            const support = new THREE.Mesh(supportGeo, supportMat);
            support.position.set(x + i * 4, 0.3, z);
            support.userData.mapGenerated = true;
            this.scene.add(support);
        }
    }

    // =========================================================================
    // FOREST QUADRANT (NW: x < 0, z < 0)
    // =========================================================================
    _generateForestQuadrant() {
        // Dense trees
        const treeCount = 150;
        for (let i = 0; i < treeCount; i++) {
            const tx = -HALF + 20 + this._rand() * (HALF - 60);
            const tz = -HALF + 20 + this._rand() * (HALF - 60);

            // Keep away from river and central area
            if (Math.abs(tx) < 12 || Math.sqrt(tx * tx + tz * tz) < 50) continue;

            this._addForestTree(tx, tz);
        }

        // Forest paths (winding brown trails)
        this._generateForestPaths();

        // Log cabins
        const cabinCount = 8 + Math.floor(this._rand() * 4);
        for (let i = 0; i < cabinCount; i++) {
            const cx = -HALF + 40 + this._rand() * (HALF - 100);
            const cz = -HALF + 40 + this._rand() * (HALF - 100);
            if (Math.abs(cx) < 15 || Math.sqrt(cx * cx + cz * cz) < 45) continue;
            this._addLogCabin(cx, cz);
        }

        // Mushroom clusters
        for (let i = 0; i < 30; i++) {
            const mx = -HALF + 30 + this._rand() * (HALF - 80);
            const mz = -HALF + 30 + this._rand() * (HALF - 80);
            if (Math.abs(mx) < 12 || Math.sqrt(mx * mx + mz * mz) < 45) continue;
            this._addMushroomCluster(mx, mz);
        }

        // Small decorative rocks
        for (let i = 0; i < 50; i++) {
            const rx = -HALF + 20 + this._rand() * (HALF - 60);
            const rz = -HALF + 20 + this._rand() * (HALF - 60);
            if (Math.abs(rx) < 12 || Math.sqrt(rx * rx + rz * rz) < 45) continue;
            this._addForestRock(rx, rz);
        }
    }

    _addForestTree(x, z) {
        const trunkH = 6 + this._rand() * 6;
        const trunkR = 0.7 + this._rand() * 0.7;
        const crownR = 3 + this._rand() * 3;

        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.5, trunkR, trunkH, 6);
        const trunkMat = new THREE.MeshStandardMaterial({
            color: COLORS.forestTrunk,
            roughness: 0.9
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        this.scene.add(trunk);
        this.addColliderBox(new THREE.Vector3(x, trunkH / 2, z), trunkR * 2, trunkH, trunkR * 2, false);

        // Crown (multiple layered dodecahedrons for dense look)
        const crownMat = new THREE.MeshStandardMaterial({
            color: COLORS.forestTree + Math.floor(this._rand() * 0x1a1a1a - 0xa0a0a0),
            roughness: 0.95,
            flatShading: true
        });

        for (let layer = 0; layer < 2 + Math.floor(this._rand() * 2); layer++) {
            const layerR = crownR * (1 - layer * 0.3);
            const layerY = trunkH - 1 + layer * 2.5;
            const crownGeo = new THREE.DodecahedronGeometry(layerR, 0);
            const crown = new THREE.Mesh(crownGeo, crownMat);
            crown.position.set(
                x + (this._rand() - 0.5) * 0.5,
                layerY,
                z + (this._rand() - 0.5) * 0.5
            );
            crown.userData.mapGenerated = true;
            this.scene.add(crown);
        }
    }

    _generateForestPaths() {
        // Create winding paths through forest
        const pathMat = new THREE.MeshStandardMaterial({
            color: COLORS.forestPath,
            roughness: 1.0,
            flatShading: true
        });

        // Path from cornucopia outward to cabins
        const pathSegments = 30;
        let px = -20;
        let pz = -20;
        for (let i = 0; i < pathSegments; i++) {
            const segGeo = new THREE.BoxGeometry(2, 0.05, 3);
            const seg = new THREE.Mesh(segGeo, pathMat);
            seg.position.set(px, 0.03, pz);
            seg.userData.mapGenerated = true;
            seg.userData.walkable = true;
            this.scene.add(seg);
            this._floorTiles.push({ x: px, z: pz });
            px += (this._rand() - 0.5) * 4;
            pz -= 3;
        }
    }

    _addLogCabin(x, z) {
        const cabin = new THREE.Group();
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x5d4037,
            roughness: 0.85,
            flatShading: true
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: 0x3e2723,
            roughness: 0.9,
            flatShading: true
        });

        // Walls
        const w = 5 + this._rand() * 2;
        const d = 4 + this._rand() * 2;
        const h = 3.5;

        // Front wall
        const frontGeo = new THREE.BoxGeometry(w, h, 0.3);
        const front = new THREE.Mesh(frontGeo, wallMat);
        front.position.set(0, h / 2, d / 2);
        front.userData.mapGenerated = true;
        cabin.add(front);

        // Back wall
        const back = new THREE.Mesh(frontGeo, wallMat.clone());
        back.position.set(0, h / 2, -d / 2);
        back.userData.mapGenerated = true;
        cabin.add(back);

        // Side walls
        const sideGeo = new THREE.BoxGeometry(0.3, h, d);
        const left = new THREE.Mesh(sideGeo, wallMat.clone());
        left.position.set(-w / 2, h / 2, 0);
        left.userData.mapGenerated = true;
        cabin.add(left);

        const right = new THREE.Mesh(sideGeo, wallMat.clone());
        right.position.set(w / 2, h / 2, 0);
        right.userData.mapGenerated = true;
        cabin.add(right);

        // Roof (pitched)
        const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.8, 2.5, 4);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, h + 1.25, 0);
        roof.rotation.y = Math.PI / 4;
        roof.userData.mapGenerated = true;
        cabin.add(roof);

        // Door
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.9 });
        const doorGeo = new THREE.BoxGeometry(1.2, 2.2, 0.1);
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, 1.1, d / 2 + 0.16);
        door.userData.mapGenerated = true;
        cabin.add(door);

        // Windows
        const winGeo = new THREE.BoxGeometry(0.8, 0.8, 0.1);
        const winMat = new THREE.MeshStandardMaterial({
            color: 0xfff9c4,
            roughness: 0.3,
            metalness: 0.1,
            transparent: true,
            opacity: 0.7
        });
        for (let wx of [-1.5, 1.5]) {
            const win = new THREE.Mesh(winGeo, winMat.clone());
            win.position.set(wx, h * 0.6, d / 2 + 0.16);
            win.userData.mapGenerated = true;
            cabin.add(win);
        }

        cabin.position.set(x, 0, z);
        cabin.userData.mapGenerated = true;
        this.scene.add(cabin);

        // Collider
        this.addColliderBox(new THREE.Vector3(x, h / 2, z), w + 0.5, h, d + 0.5, false);
        this._floorTiles.push({ x, z });
        this._buildings.push({ x, z, w, d, template: { type: 'log_cabin' } });
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
        const mazeStartX = 10;
        const mazeStartZ = -HALF + 10;
        const mazeSize = HALF - 40;
        const cellSize = 6;
        const wallHeight = 3.5;
        const wallThickness = 0.5;

        const wallMat = new THREE.MeshStandardMaterial({
            color: COLORS.mazeWall,
            roughness: 0.85,
            flatShading: true
        });
        const towerMat = new THREE.MeshStandardMaterial({
            color: COLORS.mazeTower,
            roughness: 0.9,
            flatShading: true
        });

        // Generate maze grid
        const cols = Math.floor(mazeSize / cellSize);
        const rows = Math.floor(mazeSize / cellSize);
        const grid = [];
        for (let r = 0; r < rows; r++) {
            grid[r] = [];
            for (let c = 0; c < cols; c++) {
                grid[r][c] = 1; // 1 = wall, 0 = path
            }
        }

        // Maze generation using recursive backtracker
        const mazeRand = this._rand.bind(this);
        function carveMaze(cx, cz) {
            grid[cz][cx] = 0;
            const dirs = [
                { dx: 0, dz: -1 },
                { dx: 1, dz: 0 },
                { dx: 0, dz: 1 },
                { dx: -1, dz: 0 }
            ].sort(() => mazeRand() - 0.5);

            for (const dir of dirs) {
                const nx = cx + dir.dx * 2;
                const nz = cz + dir.dz * 2;
                if (nx > 0 && nx < cols - 1 && nz > 0 && nz < rows - 1 && grid[nz][nx] === 1) {
                    grid[cz + dir.dz][cx + dir.dx] = 0;
                    carveMaze(nx, nz);
                }
            }
        }
        carveMaze(1, 1);

        // Build maze walls from grid
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] === 1) {
                    const wx = mazeStartX + c * cellSize;
                    const wz = mazeStartZ + r * cellSize;

                    // Wall segment
                    const wallGeo = new THREE.BoxGeometry(cellSize, wallHeight, wallThickness);
                    const wall = new THREE.Mesh(wallGeo, wallMat.clone());
                    wall.position.set(wx, wallHeight / 2, wz);
                    wall.userData.mapGenerated = true;
                    this.scene.add(wall);
                    this.addColliderBox(
                        new THREE.Vector3(wx, wallHeight / 2, wz),
                        cellSize, wallHeight, wallThickness, false
                    );
                } else {
                    this._floorTiles.push({
                        x: mazeStartX + c * cellSize + cellSize / 2,
                        z: mazeStartZ + r * cellSize + cellSize / 2
                    });
                }
            }
        }

        // Corner towers
        const towerPositions = [
            { x: mazeStartX, z: mazeStartZ },
            { x: mazeStartX + mazeSize, z: mazeStartZ },
            { x: mazeStartX, z: mazeStartZ + mazeSize },
            { x: mazeStartX + mazeSize, z: mazeStartZ + mazeSize }
        ];

        for (const tp of towerPositions) {
            const towerGeo = new THREE.BoxGeometry(6, 8, 6);
            const tower = new THREE.Mesh(towerGeo, towerMat);
            tower.position.set(tp.x + cellSize * 2, 4, tp.z + cellSize * 2);
            tower.userData.mapGenerated = true;
            this.scene.add(tower);
            this.addColliderBox(
                new THREE.Vector3(tp.x + cellSize * 2, 4, tp.z + cellSize * 2),
                6, 8, 6, false
            );

            // Tower platform
            const platGeo = new THREE.BoxGeometry(5, 0.3, 5);
            const plat = new THREE.Mesh(platGeo, towerMat.clone());
            plat.position.set(tp.x + cellSize * 2, 8.15, tp.z + cellSize * 2);
            plat.userData.mapGenerated = true;
            plat.userData.walkable = true;
            this.scene.add(plat);
            this.addColliderBox(
                new THREE.Vector3(tp.x + cellSize * 2, 8.15, tp.z + cellSize * 2),
                5, 0.3, 5, true
            );
        }

        // Maze interior walkable floor tiles
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] === 0) {
                    this._floorTiles.push({
                        x: mazeStartX + c * cellSize + cellSize / 2,
                        z: mazeStartZ + r * cellSize + cellSize / 2
                    });
                }
            }
        }
    }

    // =========================================================================
    // MILITARY RUINS QUADRANT (SW: x < 0, z > 0)
    // =========================================================================
    _generateMilitaryQuadrant() {
        const milStartX = -HALF + 20;
        const milStartZ = 10;
        const milSize = HALF - 60;

        // Ruined buildings
        const buildingCount = 15 + Math.floor(this._rand() * 5);
        for (let i = 0; i < buildingCount; i++) {
            const bx = milStartX + this._rand() * milSize;
            const bz = milStartZ + this._rand() * milSize;
            if (Math.abs(bx) < 15 || Math.sqrt(bx * bx + bz * bz) < 45) continue;
            this._addRuinedBuilding(bx, bz);
        }

        // Tanks
        const tankCount = 10 + Math.floor(this._rand() * 4);
        for (let i = 0; i < tankCount; i++) {
            const tx = milStartX + 30 + this._rand() * (milSize - 60);
            const tz = milStartZ + 30 + this._rand() * (milSize - 60);
            if (Math.abs(tx) < 15 || Math.sqrt(tx * tx + tz * tz) < 45) continue;
            this._addMilitaryTank(tx, tz);
        }

        // Barbed wire fences
        this._addMilitaryFences(milStartX, milStartZ, milSize);

        // Sandbag barriers
        for (let i = 0; i < 40; i++) {
            const sx = milStartX + this._rand() * milSize;
            const sz = milStartZ + this._rand() * milSize;
            this._addSandbagBarrier(sx, sz);
        }

        // Military crates
        for (let i = 0; i < 50; i++) {
            const cx = milStartX + this._rand() * milSize;
            const cz = milStartZ + this._rand() * milSize;
            this._addMilitaryCrate(cx, cz);
        }
    }

    _addRuinedBuilding(x, z) {
        const w = 7 + this._rand() * 5;
        const d = 6 + this._rand() * 4;
        const h = 2 + this._rand() * 5;

        const ruinMat = new THREE.MeshStandardMaterial({
            color: this._rand() > 0.5 ? COLORS.militaryRuined : COLORS.militaryBuilding,
            roughness: 0.9,
            flatShading: true
        });

        // Partial walls (ruined = missing sections)
        const wallSegments = 5 + Math.floor(this._rand() * 4);
        for (let i = 0; i < wallSegments; i++) {
            const segW = 1.5 + this._rand() * 2.5;
            const segH = 0.5 + this._rand() * (h - 1);
            const segGeo = new THREE.BoxGeometry(segW, segH, 0.5);
            const seg = new THREE.Mesh(segGeo, ruinMat.clone());

            const angle = (i / wallSegments) * Math.PI * 2;
            const segX = x + Math.cos(angle) * w * 0.4;
            const segZ = z + Math.sin(angle) * d * 0.4;

            seg.position.set(segX, segH / 2, segZ);
            seg.rotation.y = angle;
            seg.userData.mapGenerated = true;
            this.scene.add(seg);
            this.addColliderBox(
                new THREE.Vector3(segX, segH / 2, segZ),
                segW + 0.2, segH, 0.7, false
            );
        }

        // Collapsed roof pieces
        for (let i = 0; i < 4; i++) {
            const roofGeo = new THREE.BoxGeometry(2, 0.4, 2.5);
            const roof = new THREE.Mesh(roofGeo, ruinMat.clone());
            roof.position.set(
                x + (this._rand() - 0.5) * w * 0.6,
                0.4,
                z + (this._rand() - 0.5) * d * 0.6
            );
            roof.rotation.set(
                this._rand() * 0.5,
                this._rand() * Math.PI,
                this._rand() * 0.3
            );
            roof.userData.mapGenerated = true;
            this.scene.add(roof);
        }

        this._floorTiles.push({ x, z });
        this._buildings.push({ x, z, w, d, template: { type: 'ruined_building' } });
    }

    _addMilitaryTank(x, z) {
        const tank = new THREE.Group();
        const hullMat = new THREE.MeshStandardMaterial({
            color: COLORS.militaryTank,
            roughness: 0.7,
            metalness: 0.3
        });

        // Main hull
        const hullGeo = new THREE.BoxGeometry(2.4, 0.8, 4.5);
        const hull = new THREE.Mesh(hullGeo, hullMat);
        hull.position.y = 1;
        tank.add(hull);

        // Front sloped armor
        const frontPlateGeo = new THREE.BoxGeometry(2.4, 0.6, 1.2);
        const frontPlate = new THREE.Mesh(frontPlateGeo, hullMat.clone());
        frontPlate.position.set(0, 1.3, -2.5);
        frontPlate.rotation.x = Math.PI / 8;
        tank.add(frontPlate);

        // Turret
        const turretGeo = new THREE.CylinderGeometry(1.1, 1.3, 0.7, 8);
        const turretMat = new THREE.MeshStandardMaterial({
            color: 0x54624a,
            roughness: 0.6,
            metalness: 0.4
        });
        const turret = new THREE.Mesh(turretGeo, turretMat);
        turret.position.set(0, 1.8, -0.3);
        tank.add(turret);

        // Turret top
        const turretTopGeo = new THREE.CylinderGeometry(1.25, 1.25, 0.15, 8);
        const turretTop = new THREE.Mesh(turretTopGeo, hullMat.clone());
        turretTop.position.set(0, 2.25, -0.3);
        tank.add(turretTop);

        // Gun barrel
        const barrelGeo = new THREE.CylinderGeometry(0.15, 0.18, 4, 6);
        const barrelMat = new THREE.MeshStandardMaterial({
            color: 0x3d4a2f,
            roughness: 0.5,
            metalness: 0.6
        });
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 1.8, -3.2);
        tank.add(barrel);

        // Barrel muzzle brake
        const muzzleGeo = new THREE.CylinderGeometry(0.25, 0.18, 0.4, 6);
        const muzzle = new THREE.Mesh(muzzleGeo, barrelMat.clone());
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.set(0, 1.8, -5.2);
        tank.add(muzzle);

        // Tracks
        for (let side of [-1, 1]) {
            const trackGeo = new THREE.BoxGeometry(0.6, 0.5, 4.8);
            const trackMat = new THREE.MeshStandardMaterial({
                color: COLORS.militaryTread,
                roughness: 1.0
            });
            const track = new THREE.Mesh(trackGeo, trackMat);
            track.position.set(side * 1.5, 0.4, 0);
            tank.add(track);

            // Track wheels
            for (let wi = -2; wi <= 2; wi++) {
                const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 8);
                const wheelMat = new THREE.MeshStandardMaterial({
                    color: 0x4a4a4a,
                    roughness: 0.6
                });
                const wheel = new THREE.Mesh(wheelGeo, wheelMat);
                wheel.rotation.z = Math.PI / 2;
                wheel.position.set(side * 1.5, 0.4, wi * 0.8);
                tank.add(wheel);
            }
        }

        // Exhaust pipes
        for (let ep = 0; ep < 2; ep++) {
            const exhaustGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 6);
            const exhaustMat = new THREE.MeshStandardMaterial({
                color: 0x3d3d3d,
                roughness: 0.8
            });
            const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
            exhaust.rotation.x = Math.PI / 2;
            exhaust.position.set(-0.5 + ep * 0.5, 1.6, 2.3);
            tank.add(exhaust);
        }

        // Radio antenna
        const antennaGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.8, 4);
        const antennaMat = new THREE.MeshStandardMaterial({
            color: 0x3d3d3d,
            roughness: 0.7
        });
        const antenna = new THREE.Mesh(antennaGeo, antennaMat);
        antenna.position.set(-0.6, 2.85, -1.0);
        tank.add(antenna);

        // Antenna tip
        const tipGeo = new THREE.SphereGeometry(0.04, 4, 4);
        const tipMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.set(-0.6, 3.75, -1.0);
        tank.add(tip);

        tank.position.set(x, 0, z);
        tank.rotation.y = this._rand() * Math.PI * 2;
        tank.userData.mapGenerated = true;
        this.scene.add(tank);

        this.addColliderBox(
            new THREE.Vector3(x, 0.8, z),
            4.5, 2.5, 6, false
        );
        this._floorTiles.push({
            x: x + Math.cos(tank.rotation.y) * 4,
            z: z + Math.sin(tank.rotation.y) * 4
        });
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
    }

    _addMilitaryCrate(x, z) {
        const size = 0.5 + this._rand() * 0.5;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x6d4c41,
            roughness: 0.9,
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
    }

    // =========================================================================
    // ICE/SNOW QUADRANT (SE: x > 0, z > 0)
    // =========================================================================
    _generateIceQuadrant() {
        const iceStartX = 10;
        const iceStartZ = 10;
        const iceSize = HALF - 60;

        // Frozen lake surface
        const lakeMat = new THREE.MeshStandardMaterial({
            color: COLORS.iceLake,
            roughness: 0.4,
            metalness: 0.1,
            transparent: true,
            opacity: 0.7
        });

        const lakeGeo = new THREE.CircleGeometry(40, 24);
        lakeGeo.rotateX(-Math.PI / 2);
        const lake = new THREE.Mesh(lakeGeo, lakeMat);
        lake.position.set(iceStartX + iceSize * 0.4, 0.02, iceStartZ + iceSize * 0.4);
        lake.userData.mapGenerated = true;
        this.scene.add(lake);

        // Igloos
        const iglooCount = 8 + Math.floor(this._rand() * 3);
        for (let i = 0; i < iglooCount; i++) {
            const ix = iceStartX + this._rand() * iceSize;
            const iz = iceStartZ + this._rand() * iceSize;
            if (Math.abs(ix) < 15 || Math.sqrt(ix * ix + iz * iz) < 45) continue;
            this._addIgloo(ix, iz);
        }

        // Ice crystals
        for (let i = 0; i < 40; i++) {
            const cx = iceStartX + this._rand() * iceSize;
            const cz = iceStartZ + this._rand() * iceSize;
            if (Math.abs(cx) < 15 || Math.sqrt(cx * cx + cz * cz) < 45) continue;
            this._addIceCrystal(cx, cz);
        }

        // Snow-covered trees
        for (let i = 0; i < 50; i++) {
            const tx = iceStartX + this._rand() * iceSize;
            const tz = iceStartZ + this._rand() * iceSize;
            if (Math.abs(tx) < 15 || Math.sqrt(tx * tx + tz * tz) < 45) continue;
            this._addSnowTree(tx, tz);
        }

        // Radio tower
        this._addRadioTower(
            iceStartX + iceSize * 0.7,
            iceStartZ + iceSize * 0.7
        );
    }

    _addIgloo(x, z) {
        const igloo = new THREE.Group();
        const iglooMat = new THREE.MeshStandardMaterial({
            color: COLORS.iceIgloo,
            roughness: 0.7,
            flatShading: true
        });

        // Dome shape using hemisphere
        const domeGeo = new THREE.SphereGeometry(3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const dome = new THREE.Mesh(domeGeo, iglooMat);
        dome.position.y = 0;
        dome.userData.mapGenerated = true;
        igloo.add(dome);

        // Entrance tunnel
        const tunnelGeo = new THREE.CylinderGeometry(0.8, 0.8, 2, 8);
        tunnelGeo.rotateZ(Math.PI / 2);
        const tunnel = new THREE.Mesh(tunnelGeo, iglooMat.clone());
        tunnel.position.set(2.5, 0.6, 0);
        tunnel.userData.mapGenerated = true;
        igloo.add(tunnel);

        // Snow blocks on top
        for (let i = 0; i < 10; i++) {
            const blockGeo = new THREE.BoxGeometry(0.7, 0.5, 0.7);
            const block = new THREE.Mesh(blockGeo, iglooMat.clone());
            const angle = (i / 10) * Math.PI * 2;
            block.position.set(
                Math.cos(angle) * 3,
                2.2 + this._rand() * 0.6,
                Math.sin(angle) * 3
            );
            block.rotation.y = angle;
            block.userData.mapGenerated = true;
            igloo.add(block);
        }

        igloo.position.set(x, 0, z);
        igloo.userData.mapGenerated = true;
        this.scene.add(igloo);

        this.addColliderBox(
            new THREE.Vector3(x, 1.5, z),
            6, 3, 6, false
        );
        this._floorTiles.push({ x, z });
    }

    _addIceCrystal(x, z) {
        const height = 1 + this._rand() * 3;
        const radius = 0.3 + this._rand() * 0.5;
        const sides = 4 + Math.floor(this._rand() * 4);

        const geo = new THREE.ConeGeometry(radius, height, sides);
        const mat = new THREE.MeshStandardMaterial({
            color: COLORS.iceCrystal + Math.floor(this._rand() * 0x20 - 0x10),
            roughness: 0.3,
            metalness: 0.1,
            flatShading: true,
            transparent: true,
            opacity: 0.85
        });

        const crystal = new THREE.Mesh(geo, mat);
        crystal.position.set(x, height / 2, z);
        crystal.rotation.y = this._rand() * Math.PI;
        crystal.rotation.z = (this._rand() - 0.5) * 0.3;
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
        const trunkH = 3 + this._rand() * 3;
        const trunkR = 0.3 + this._rand() * 0.3;

        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.5, trunkR, trunkH, 6);
        const trunkMat = new THREE.MeshStandardMaterial({
            color: COLORS.forestTrunk,
            roughness: 0.9
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, trunkH / 2, z);
        trunk.userData.mapGenerated = true;
        this.scene.add(trunk);

        // Snow-covered layers
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.8,
            flatShading: true
        });

        for (let l = 0; l < 3; l++) {
            const layerR = (2.5 - l * 0.6) * (0.8 + this._rand() * 0.4);
            const layerGeo = new THREE.ConeGeometry(layerR, 2, 6);
            const snowLayer = new THREE.Mesh(layerGeo, snowMat.clone());
            snowLayer.position.set(x, trunkH - 1 + l * 1.8, z);
            snowLayer.userData.mapGenerated = true;
            this.scene.add(snowLayer);
        }
    }

    _addRadioTower(x, z) {
        const tower = new THREE.Group();
        const poleMat = new THREE.MeshStandardMaterial({
            color: COLORS.iceTower,
            roughness: 0.7
        });

        // Main pole
        const poleGeo = new THREE.CylinderGeometry(0.3, 0.5, 16, 8);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 8;
        pole.userData.mapGenerated = true;
        tower.add(pole);

        // Cross braces
        for (let br = 3; br < 16; br += 4) {
            const braceGeo = new THREE.BoxGeometry(2.5, 0.12, 2.5);
            const brace = new THREE.Mesh(braceGeo, poleMat.clone());
            brace.position.y = br;
            brace.userData.mapGenerated = true;
            tower.add(brace);
        }

        // Dish antenna
        const dishGeo = new THREE.ConeGeometry(2, 3, 8, 1, true);
        const dishMat = new THREE.MeshStandardMaterial({
            color: 0x6b7280,
            roughness: 0.4,
            metalness: 0.5
        });
        const dish = new THREE.Mesh(dishGeo, dishMat);
        dish.position.set(0, 18, -1);
        dish.rotation.x = Math.PI / 6;
        dish.userData.mapGenerated = true;
        tower.add(dish);

        tower.position.set(x, 0, z);
        tower.userData.mapGenerated = true;
        this.scene.add(tower);

        this.addColliderBox(
            new THREE.Vector3(x, 8, z),
            1.5, 16, 1.5, false
        );
    }

    // =========================================================================
    // COVER OBJECTS (scattered across all quadrants)
    // =========================================================================
    _placeCoverObjects() {
        // Barrels
        for (let i = 0; i < 60; i++) {
            const x = -HALF + 20 + this._rand() * (MAP_SIZE - 40);
            const z = -HALF + 20 + this._rand() * (MAP_SIZE - 40);
            if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;
            this._addBarrel(x, z);
        }

        // Crates
        for (let i = 0; i < 80; i++) {
            const x = -HALF + 20 + this._rand() * (MAP_SIZE - 40);
            const z = -HALF + 20 + this._rand() * (MAP_SIZE - 40);
            if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;
            this._addCrate(x, z);
        }
    }

    _addBarrel(x, z) {
        const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.9, 8);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x5d4037,
            roughness: 0.9
        });
        const barrel = new THREE.Mesh(geo, mat);
        barrel.position.set(x, 0.45, z);
        barrel.userData.mapGenerated = true;
        barrel.userData.physicsType = 'STATIC';
        this.scene.add(barrel);
        this.addColliderBox(new THREE.Vector3(x, 0.45, z), 0.8, 0.8, 0.8, false);
    }

    _addCrate(x, z) {
        const size = 0.5 + this._rand() * 0.5;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xa1887f,
            roughness: 0.9,
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

    // =========================================================================
    // SPAWN PADS
    // =========================================================================
    _buildSpawnPads() {
        // Add cornucopia platform as spawn pad
        this.spawnPads.push(new THREE.Vector3(0, 0.34, 0));

        // Add floor tiles as spawn pads
        for (const tile of this._floorTiles) {
            this.spawnPads.push(new THREE.Vector3(tile.x, 0.34, tile.z));
        }
    }

    // =========================================================================
    // API CONTRACT
    // =========================================================================
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

    getColliders() {
        return this.colliders;
    }

    getSpawnPads() {
        return this.spawnPads;
    }

    getSpawnWorld() {
        return { x: 0, z: 0 };
    }

    getFloorTiles() {
        return this._floorTiles;
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
        for (const box of this.colliders) {
            if (!box.walkable && box.enabled !== false) {
                if (x >= box.min.x - 0.5 && x <= box.max.x + 0.5 &&
                    z >= box.min.z - 0.5 && z <= box.max.z + 0.5) {
                    return false;
                }
            }
        }
        return true;
    }

    isInsideCourtyard(pos) {
        const dx = pos.x;
        const dz = pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        return dist < 38;
    }

    getCourtyardExitPosition() {
        return new THREE.Vector3(0, 0.5, -38);
    }

    setCourtyardGateOpen(open) {
        // Stub
    }

    getActiveSafeRadius() {
        return this.halfSize * 0.8;
    }

    activateFogPhase(index) {
        return this.halfSize * 0.8;
    }

    getFloorTiles() {
        return this._floorTiles;
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
        // No LOD prop visibility changes needed
    }

    enableOptimizedCulling() {
        // Already optimized
    }

    setupLOD(isMobile) {
        // LOD handled by distance-based culling in GameLoop
    }

    update(delta, playerPos) {
        // No dynamic updates needed for static map
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
}
