import * as THREE from "three";
import { MapGenerator as TileMapGenerator } from "./MapGeneratorNode.js";

// Simple fully-random tile-based map without courtyard/maze concepts.
export class MapGenerator {
    constructor(scene) {
        this.scene = scene;
        this.tileGen = new TileMapGenerator();
        this.tileSize = 4;
        this.wallHeight = 7;
        this.wallThickness = this.tileSize;
        this.waterLevel = -100;
        this.colliders = [];
        this.spawnPads = [];
        this.chestSpots = [];
        this.oneWayGates = [];
        this.traps = [];
        this.textures = {};
        this.playerSpawn = null;
        this.biomeColors = {
            forest: 0x2e7d32,
            jungle: 0x1f7a3a,
            plains: 0x8fdc6e,
            rock: 0x9a9a9a,
            sand: 0xf2d27a,
            snow: 0xffffff,
            lava: 0x9c2f1a
        };

        this.seed = Math.floor((performance.now() + Math.random() * 1000000) % 2147483647);
        this.generate();
    }

    generate() {
        const sizeBase = 101 + Math.floor((this.seed % 10) * 4);
        const width = sizeBase;
        const height = sizeBase;
        const data = this.tileGen.generate(width, height, this.seed);
        this.grid = data.grid;
        this.gridWidth = data.width;
        this.gridHeight = data.height;
        this.size = Math.max(this.gridWidth, this.gridHeight) * this.tileSize;
        this.halfSize = this.size / 2;
        this.playerSpawn = data.playerSpawn;

        this.clearSpawnZone();
        this.buildMeshes();
        this.buildSpawnPads();
        this.buildChests();
    }

    clearSpawnZone() {
        if (!this.playerSpawn) return;
        const radius = 6;
        for (let y = -radius; y <= radius; y++) {
            for (let x = -radius; x <= radius; x++) {
                const gx = this.playerSpawn.x + x;
                const gy = this.playerSpawn.y + y;
                if (!this.grid[gy]?.[gx]) continue;
                const tile = this.grid[gy][gx];
                tile.type = "floor";
                tile.biome = this.tileGen.pickBiome(gx, gy);
                delete tile.prop;
            }
        }
    }

    buildMeshes() {
        this.clearSceneObjects();
        this.colliders = [];
        this.floorTiles = [];

        const floorMats = {};
        Object.entries(this.biomeColors).forEach(([key, color]) => {
            floorMats[key] = new THREE.MeshLambertMaterial({
                color,
                flatShading: true,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });
        });
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x8d8d8d,
            roughness: 0.85,
            flatShading: true
        });

        const floorGeo = new THREE.BoxGeometry(this.tileSize, 0.4, this.tileSize);
        const wallGeo = new THREE.BoxGeometry(this.tileSize, this.wallHeight, this.tileSize);

        const floorsByBiome = new Map();
        const walls = [];
        const trees = [];
        const jungleTrees = [];
        const rocks = [];
        const crates = [];
        const cacti = [];
        const iceSpikes = [];

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const tile = this.grid[y][x];
                const world = this.toWorld(x, y);
                if (tile.type === "wall") {
                    walls.push({ x: world.x, z: world.z });
                    this.addColliderBox(new THREE.Vector3(world.x, this.wallHeight / 2, world.z), this.tileSize, this.wallHeight, this.tileSize, false);
                } else {
                    const biome = tile.biome || "plains";
                    if (!floorsByBiome.has(biome)) floorsByBiome.set(biome, []);
                    floorsByBiome.get(biome).push({ x: world.x, z: world.z });
                    this.floorTiles.push({ x: world.x, z: world.z, gx: x, gy: y, biome });
                    if (tile.prop === "tree") trees.push({ x: world.x, z: world.z });
                    if (tile.prop === "jungleTree") jungleTrees.push({ x: world.x, z: world.z });
                    if (tile.prop === "rock") rocks.push({ x: world.x, z: world.z });
                    if (tile.prop === "crate") crates.push({ x: world.x, z: world.z });
                    if (tile.prop === "cactus") cacti.push({ x: world.x, z: world.z });
                    if (tile.prop === "ice") iceSpikes.push({ x: world.x, z: world.z });
                }
            }
        }

        floorsByBiome.forEach((floors, biome) => {
            const mat = floorMats[biome] || floorMats.plains;
            const inst = new THREE.InstancedMesh(floorGeo, mat, floors.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3(1, 1, 1);
            floors.forEach((f, i) => {
                position.set(f.x, 0.2, f.z);
                matrix.compose(position, rotation, scale);
                inst.setMatrixAt(i, matrix);
            });
            inst.userData.mapGenerated = true;
            this.scene.add(inst);
        });

        if (walls.length) {
            const inst = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3(1, 1, 1);
            walls.forEach((w, i) => {
                position.set(w.x, this.wallHeight / 2, w.z);
                matrix.compose(position, rotation, scale);
                inst.setMatrixAt(i, matrix);
            });
            inst.userData.mapGenerated = true;
            this.scene.add(inst);
            this.wallMesh = inst;
        }

        this.buildProps(trees, jungleTrees, rocks, crates, cacti, iceSpikes);
    }

    buildProps(trees, jungleTrees, rocks, crates, cacti, iceSpikes) {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9, flatShading: true });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9, flatShading: true });
        const jungleLeafMat = new THREE.MeshStandardMaterial({ color: 0x1f7a3a, roughness: 0.9, flatShading: true });
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.9, flatShading: true });
        const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.85, flatShading: true });
        const cactusMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9, flatShading: true });
        const iceMat = new THREE.MeshStandardMaterial({ color: 0xb3e5fc, roughness: 0.3, flatShading: true });

        const treeTrunkGeo = new THREE.BoxGeometry(0.9, 2.6, 0.9);
        const treeLeafGeo = new THREE.BoxGeometry(2.4, 2.2, 2.4);
        const jungleTrunkGeo = new THREE.BoxGeometry(1.1, 4.8, 1.1);
        const jungleLeafGeo = new THREE.BoxGeometry(3.2, 2.8, 3.2);
        const rockGeo = new THREE.BoxGeometry(2.5, 2.2, 2.5);
        const crateGeo = new THREE.BoxGeometry(2, 2, 2);
        const cactusGeo = new THREE.BoxGeometry(1.3, 4.5, 1.3);
        const iceGeo = new THREE.ConeGeometry(1.2, 4.8, 6);

        this.addInstancedTree(treeTrunkGeo, trunkMat, treeLeafGeo, leafMat, trees, 1.3, 3.2);
        this.addInstancedTree(jungleTrunkGeo, trunkMat, jungleLeafGeo, jungleLeafMat, jungleTrees, 2.4, 5.4);
        this.addInstancedProps(rockGeo, rockMat, rocks, 1.1, true);
        this.addInstancedProps(crateGeo, crateMat, crates, 1.0, true);
        this.addInstancedProps(cactusGeo, cactusMat, cacti, 2.2, true);
        this.addInstancedProps(iceGeo, iceMat, iceSpikes, 2.4, true);
    }

    addInstancedTree(trunkGeo, trunkMat, leafGeo, leafMat, list, trunkHeight, leafHeight) {
        if (!list.length) return;
        const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
        const leafInst = new THREE.InstancedMesh(leafGeo, leafMat, list.length);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3(1, 1, 1);
        list.forEach((item, i) => {
            position.set(item.x, trunkHeight / 2, item.z);
            matrix.compose(position, rotation, scale);
            trunkInst.setMatrixAt(i, matrix);
            this.addColliderBox(new THREE.Vector3(item.x, trunkHeight / 2, item.z), trunkGeo.parameters.width, trunkGeo.parameters.height, trunkGeo.parameters.depth, false);

            position.set(item.x, leafHeight, item.z);
            matrix.compose(position, rotation, scale);
            leafInst.setMatrixAt(i, matrix);
        });
        trunkInst.userData.mapGenerated = true;
        leafInst.userData.mapGenerated = true;
        this.scene.add(trunkInst);
        this.scene.add(leafInst);
    }

    addInstancedProps(geo, mat, list, heightOffset, solid) {
        if (!list.length) return;
        const inst = new THREE.InstancedMesh(geo, mat, list.length);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3(1, 1, 1);
        list.forEach((item, i) => {
            position.set(item.x, heightOffset, item.z);
            matrix.compose(position, rotation, scale);
            inst.setMatrixAt(i, matrix);
            if (solid) {
                this.addColliderBox(new THREE.Vector3(item.x, heightOffset, item.z), geo.parameters.width, geo.parameters.height, geo.parameters.depth, false);
            }
        });
        inst.userData.mapGenerated = true;
        this.scene.add(inst);
    }

    buildSpawnPads() {
        this.spawnPads = [];
        if (!this.playerSpawn) return;
        const padMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.8, flatShading: true });
        const padGeo = new THREE.BoxGeometry(2.2, 0.3, 2.2);
        const pads = [];
        const radius = 8;
        const cx = this.playerSpawn.x;
        const cy = this.playerSpawn.y;
        for (let i = 0; i < 32; i++) {
            const angle = (i / 32) * Math.PI * 2;
            let x = cx + Math.round(Math.cos(angle) * radius);
            let y = cy + Math.round(Math.sin(angle) * radius);
            const safe = this.findNearestFloor(x, y, 3);
            if (!safe) continue;
            x = safe.x;
            y = safe.y;
            const world = this.toWorld(x, y);
            pads.push(world);
            this.spawnPads.push(new THREE.Vector3(world.x, 0.4, world.z));
        }

        const inst = new THREE.InstancedMesh(padGeo, padMat, pads.length);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3(1, 1, 1);
        pads.forEach((p, i) => {
            position.set(p.x, 0.25, p.z);
            matrix.compose(position, rotation, scale);
            inst.setMatrixAt(i, matrix);
            this.addColliderBox(new THREE.Vector3(p.x, 0.25, p.z), 2.2, 0.3, 2.2, true);
        });
        inst.userData.mapGenerated = true;
        this.scene.add(inst);
    }

    buildChests() {
        this.chestSpots = [];
        if (!this.playerSpawn) return;
        const spawnRadius = 9;
        const rand = (() => {
            let state = (this.seed ^ 0x9e3779b9) >>> 0;
            return () => {
                state = (state * 1664525 + 1013904223) >>> 0;
                return state / 0x100000000;
            };
        })();

        const inSpawn = (x, y) => {
            const dx = x - this.playerSpawn.x;
            const dy = y - this.playerSpawn.y;
            return Math.sqrt(dx * dx + dy * dy) <= spawnRadius;
        };

        const candidates = [];
        for (let y = 2; y < this.gridHeight - 2; y++) {
            for (let x = 2; x < this.gridWidth - 2; x++) {
                const tile = this.grid[y][x];
                if (!tile || tile.type !== "floor") continue;
                if (tile.prop) continue;
                if (inSpawn(x, y)) continue;
                candidates.push({ x, y });
            }
        }

        if (!candidates.length) return;
        const maxChests = Math.min(520, Math.max(220, Math.floor(candidates.length * 0.2)));
        const used = new Set();

        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        for (const spot of candidates) {
            if (this.chestSpots.length >= maxChests) break;
            const key = `${spot.x},${spot.y}`;
            if (used.has(key)) continue;
            const world = this.toWorld(spot.x, spot.y);
            this.chestSpots.push({ x: world.x, z: world.z });
            used.add(key);
        }
    }

    findNearestFloor(x, y, radius) {
        for (let r = 0; r <= radius; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    const tile = this.grid[ny]?.[nx];
                    if (!tile) continue;
                    if (tile.type === "floor") {
                        return { x: nx, y: ny };
                    }
                }
            }
        }
        return null;
    }

    clearSceneObjects() {
        const toRemove = [];
        this.scene.traverse(obj => {
            if (obj.userData && obj.userData.mapGenerated) {
                toRemove.push(obj);
            }
        });
        toRemove.forEach(obj => this.scene.remove(obj));
    }

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

    addColliderBox(center, width, height, depth, walkable = true, enabled = true) {
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
        const box = { min, max, walkable, enabled };
        this.colliders.push(box);
        return box;
    }

    getHeightAt() {
        return 0.4;
    }

    getColliders() {
        return this.colliders;
    }

    getSpawnPads() {
        return this.spawnPads.map(pos => pos.clone());
    }

    getChestSpots() {
        return this.chestSpots.map(pos => ({ x: pos.x, z: pos.z }));
    }

    getFloorTiles() {
        return (this.floorTiles || []).map(tile => ({ x: tile.x, z: tile.z }));
    }

    getTraps() {
        return [];
    }

    getOneWayGates() {
        return [];
    }

    isInsideCourtyard() {
        return false;
    }

    getCourtyardExitPosition() {
        if (!this.playerSpawn) return new THREE.Vector3(0, 1.2, 0);
        const world = this.toWorld(this.playerSpawn.x, this.playerSpawn.y);
        return new THREE.Vector3(world.x, 1.2, world.z);
    }

    setCourtyardGateOpen() {
        return;
    }

    isChestClear(x, z, radius = 1.2) {
        const y = this.getHeightAt(x, z) + 0.35;
        const min = new THREE.Vector3(x - radius, y - 0.4, z - radius);
        const max = new THREE.Vector3(x + radius, y + 0.4, z + radius);
        for (const box of this.colliders) {
            if (box.enabled === false) continue;
            if (max.x < box.min.x || min.x > box.max.x) continue;
            if (max.z < box.min.z || min.z > box.max.z) continue;
            if (max.y < box.min.y || min.y > box.max.y) continue;
            return false;
        }
        return true;
    }

    isWalkableAt(x, z) {
        const grid = this.worldToGrid(x, z);
        const tile = this.grid?.[grid.y]?.[grid.x];
        return tile && tile.type === "floor";
    }

    isLavaAt() {
        return false;
    }
}
