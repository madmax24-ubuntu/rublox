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
        this.storyPOIs = [];
        this.storyNotes = [];
        this.propMeshes = [];
        this.leafMeshes = [];
        this.smallPropMeshes = [];
        this.biomeColors = {
            forest: 0x2e7d32,
            jungle: 0x1f7a3a,
            plains: 0x8fdc6e,
            rock: 0x9a9a9a,
            sand: 0xf2d27a,
            snow: 0xffffff,
            lava: 0x9c2f1a
        };
        this.heightMap = null;

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
        this.heightMap = this.buildHeightMap();

        this.clearSpawnZone();
        this.buildMeshes();
        this.buildSpawnPads();
        this.buildChests();
        this.buildStoryPOIs();
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
        this.propMeshes = [];
        this.leafMeshes = [];
        this.smallPropMeshes = [];
        this.storyPOIs = [];
        this.storyNotes = [];

        const floorMats = {};
        Object.entries(this.biomeColors).forEach(([key, color]) => {
            floorMats[key] = [];
            for (let v = 0; v < 3; v++) {
                const variantColor = this.getBiomeVariantColor(key, v);
                floorMats[key][v] = new THREE.MeshLambertMaterial({
                    color: variantColor,
                    flatShading: true,
                    polygonOffset: true,
                    polygonOffsetFactor: 1,
                    polygonOffsetUnits: 1
                });
            }
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
        const stumps = [];
        const pillars = [];
        const ruins = [];
        const bushes = [];
        const logs = [];
        const boulders = [];

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const tile = this.grid[y][x];
                const world = this.toWorld(x, y);
                const tileHeight = this.heightMap?.[y]?.[x] ?? 0;
                if (tile.type === "wall") {
                    walls.push({ x: world.x, z: world.z, y: tileHeight });
                    this.addColliderBox(new THREE.Vector3(world.x, tileHeight + this.wallHeight / 2, world.z), this.tileSize, this.wallHeight, this.tileSize, false);
                } else {
                    const biome = tile.biome || "plains";
                    const variant = this.getFloorVariant(biome, x, y);
                    const key = `${biome}:${variant}`;
                    if (!floorsByBiome.has(key)) floorsByBiome.set(key, []);
                    floorsByBiome.get(key).push({ x: world.x, z: world.z, gx: x, gy: y, variant, biome });
                    this.floorTiles.push({ x: world.x, z: world.z, gx: x, gy: y, biome, y: tileHeight });
                    if (tile.prop === "tree") trees.push({ x: world.x, z: world.z, y: tileHeight });
                    if (tile.prop === "jungleTree") jungleTrees.push({ x: world.x, z: world.z, y: tileHeight });
                    if (tile.prop === "rock") rocks.push({ x: world.x, z: world.z, y: tileHeight });
                    if (tile.prop === "crate") crates.push({ x: world.x, z: world.z, y: tileHeight });
                    if (tile.prop === "cactus") cacti.push({ x: world.x, z: world.z, y: tileHeight });
                    if (tile.prop === "ice") iceSpikes.push({ x: world.x, z: world.z, y: tileHeight });
                    if (tile.prop === "stump") stumps.push({ x: world.x, z: world.z, y: tileHeight });
                    if (tile.prop === "pillar") pillars.push({ x: world.x, z: world.z, y: tileHeight });
                    if (tile.prop === "ruin") ruins.push({ x: world.x, z: world.z, y: tileHeight });
                    if (tile.prop === "bush") bushes.push({ x: world.x, z: world.z, y: tileHeight });
                    if (tile.prop === "log") logs.push({ x: world.x, z: world.z, y: tileHeight });
                    if (tile.prop === "boulder") boulders.push({ x: world.x, z: world.z, y: tileHeight });
                }
            }
        }

        floorsByBiome.forEach((floors, key) => {
            const [biome, variantStr] = key.split(':');
            const variant = Number(variantStr) || 0;
            const mat = (floorMats[biome] && floorMats[biome][variant]) || floorMats.plains[0];
            const inst = new THREE.InstancedMesh(floorGeo, mat, floors.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3(1, 1, 1);
            floors.forEach((f, i) => {
                const h = this.heightMap?.[f.gy]?.[f.gx] ?? 0;
                position.set(f.x, h + 0.2, f.z);
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
                position.set(w.x, w.y + this.wallHeight / 2, w.z);
                matrix.compose(position, rotation, scale);
                inst.setMatrixAt(i, matrix);
            });
            inst.userData.mapGenerated = true;
            this.scene.add(inst);
            this.wallMesh = inst;
        }

        this.buildProps(trees, jungleTrees, rocks, crates, cacti, iceSpikes, stumps, pillars, ruins, bushes, logs, boulders);
    }

    buildProps(trees, jungleTrees, rocks, crates, cacti, iceSpikes, stumps, pillars, ruins, bushes, logs, boulders) {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9, flatShading: true });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9, flatShading: true });
        const jungleLeafMat = new THREE.MeshStandardMaterial({ color: 0x1f7a3a, roughness: 0.9, flatShading: true });
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.9, flatShading: true });
        const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.85, flatShading: true });
        const cactusMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9, flatShading: true });
        const iceMat = new THREE.MeshStandardMaterial({ color: 0xb3e5fc, roughness: 0.3, flatShading: true });
        const ruinMat = new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.9, flatShading: true });

        const treeTrunkGeo = new THREE.BoxGeometry(0.9, 2.6, 0.9);
        const treeLeafGeo = new THREE.BoxGeometry(2.4, 2.2, 2.4);
        const jungleTrunkGeo = new THREE.BoxGeometry(1.1, 4.8, 1.1);
        const jungleLeafGeo = new THREE.BoxGeometry(3.2, 2.8, 3.2);
        const rockGeo = new THREE.BoxGeometry(2.5, 2.2, 2.5);
        const crateGeo = new THREE.BoxGeometry(2, 2, 2);
        const cactusGeo = new THREE.BoxGeometry(1.3, 4.5, 1.3);
        const iceGeo = new THREE.ConeGeometry(1.2, 4.8, 6);
        const stumpGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.5, 6);
        const pillarGeo = new THREE.CylinderGeometry(0.7, 0.7, 2.6, 6);
        const ruinGeo = new THREE.BoxGeometry(3.2, 1.6, 0.6);
        const bushGeo = new THREE.BoxGeometry(1.8, 1.0, 1.8);
        const logGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.8, 6);
        const boulderGeo = new THREE.BoxGeometry(2.2, 1.6, 2.2);

        this.addInstancedTreeChunked(treeTrunkGeo, trunkMat, treeLeafGeo, leafMat, trees, 1.3, 3.2, 36);
        this.addInstancedTreeChunked(jungleTrunkGeo, trunkMat, jungleLeafGeo, jungleLeafMat, jungleTrees, 2.4, 5.4, 36);
        this.addInstancedPropsChunked(rockGeo, rockMat, rocks, 1.1, true, 42, true);
        this.addInstancedPropsChunked(crateGeo, crateMat, crates, 1.0, true, 42, true);
        this.addInstancedPropsChunked(cactusGeo, cactusMat, cacti, 2.2, true, 42, true);
        this.addInstancedPropsChunked(iceGeo, iceMat, iceSpikes, 2.4, true, 42, true);
        this.addInstancedPropsChunked(stumpGeo, trunkMat, stumps, 0.3, true, 42, true);
        this.addInstancedPropsChunked(pillarGeo, ruinMat, pillars, 1.3, true, 42, true);
        this.addInstancedPropsChunked(ruinGeo, ruinMat, ruins, 0.8, true, 42, true);
        this.addInstancedPropsChunked(bushGeo, leafMat, bushes, 0.6, true, 42, true);
        this.addInstancedPropsChunked(logGeo, trunkMat, logs, 0.5, true, 42, true);
        this.addInstancedPropsChunked(boulderGeo, rockMat, boulders, 1.1, true, 42, true);
    }

    chunkItems(list, chunkSize) {
        const chunks = new Map();
        for (const item of list) {
            const cx = Math.floor(item.x / chunkSize);
            const cz = Math.floor(item.z / chunkSize);
            const key = `${cx},${cz}`;
            if (!chunks.has(key)) chunks.set(key, []);
            chunks.get(key).push(item);
        }
        return chunks;
    }

    addInstancedTreeChunked(trunkGeo, trunkMat, leafGeo, leafMat, list, trunkHeight, leafHeight, chunkSize) {
        if (!list.length) return;
        const chunks = this.chunkItems(list, chunkSize);
        for (const chunk of chunks.values()) {
            const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, chunk.length);
            const leafInst = new THREE.InstancedMesh(leafGeo, leafMat, chunk.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3(1, 1, 1);
            let cx = 0;
            let cz = 0;
            chunk.forEach((item, i) => {
                cx += item.x;
                cz += item.z;
                const baseY = item.y ?? 0;
                position.set(item.x, baseY + trunkHeight / 2, item.z);
                matrix.compose(position, rotation, scale);
                trunkInst.setMatrixAt(i, matrix);
                this.addColliderBox(new THREE.Vector3(item.x, baseY + trunkHeight / 2, item.z), trunkGeo.parameters.width, trunkGeo.parameters.height, trunkGeo.parameters.depth, false);

                position.set(item.x, baseY + leafHeight, item.z);
                matrix.compose(position, rotation, scale);
                leafInst.setMatrixAt(i, matrix);
            });
            const center = new THREE.Vector3(cx / chunk.length, 0, cz / chunk.length);
            trunkInst.userData.mapGenerated = true;
            trunkInst.userData.center = center;
            leafInst.userData.mapGenerated = true;
            leafInst.userData.center = center;
            this.scene.add(trunkInst);
            this.scene.add(leafInst);
            this.propMeshes.push(trunkInst);
            this.leafMeshes.push(leafInst);
        }
    }

    addInstancedPropsChunked(geo, mat, list, heightOffset, solid, chunkSize, isSmall) {
        if (!list.length) return;
        const size = this.getGeoSize(geo);
        const chunks = this.chunkItems(list, chunkSize);
        for (const chunk of chunks.values()) {
            const inst = new THREE.InstancedMesh(geo, mat, chunk.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3(1, 1, 1);
            let cx = 0;
            let cz = 0;
            chunk.forEach((item, i) => {
                cx += item.x;
                cz += item.z;
                const baseY = item.y ?? 0;
                position.set(item.x, baseY + heightOffset, item.z);
                matrix.compose(position, rotation, scale);
                inst.setMatrixAt(i, matrix);
                if (solid) {
                    this.addColliderBox(new THREE.Vector3(item.x, baseY + heightOffset, item.z), size.width, size.height, size.depth, false);
                }
            });
            inst.userData.mapGenerated = true;
            inst.userData.center = new THREE.Vector3(cx / chunk.length, 0, cz / chunk.length);
            this.scene.add(inst);
            if (isSmall) this.smallPropMeshes.push(inst);
            else this.propMeshes.push(inst);
        }
    }

    getGeoSize(geo) {
        if (geo.parameters?.width) {
            return { width: geo.parameters.width, height: geo.parameters.height, depth: geo.parameters.depth };
        }
        if (geo.parameters?.radiusTop !== undefined && geo.parameters?.height !== undefined) {
            const radius = Math.max(geo.parameters.radiusTop, geo.parameters.radiusBottom);
            return { width: radius * 2, height: geo.parameters.height, depth: radius * 2 };
        }
        if (geo.parameters?.radius !== undefined && geo.parameters?.height !== undefined) {
            const radius = geo.parameters.radius;
            return { width: radius * 2, height: geo.parameters.height, depth: radius * 2 };
        }
        return { width: this.tileSize * 0.8, height: this.tileSize * 0.8, depth: this.tileSize * 0.8 };
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

    buildStoryPOIs() {
        this.storyPOIs = [];
        this.storyNotes = [];
        if (!this.floorTiles || !this.floorTiles.length) return;

        const rand = (() => {
            let state = (this.seed ^ 0x7f4a7c15) >>> 0;
            return () => {
                state = (state * 1664525 + 1013904223) >>> 0;
                return state / 0x100000000;
            };
        })();

        const spawnWorld = this.playerSpawn ? this.toWorld(this.playerSpawn.x, this.playerSpawn.y) : { x: 0, z: 0 };
        const candidates = this.floorTiles.filter(tile => {
            const dx = tile.x - spawnWorld.x;
            const dz = tile.z - spawnWorld.z;
            return Math.hypot(dx, dz) > 30;
        });
        if (!candidates.length) return;

        const pick = () => candidates[Math.floor(rand() * candidates.length)];
        const poiTypes = ['bunker', 'camp', 'observatory'];
        for (const type of poiTypes) {
            const tile = pick();
            if (!tile) continue;
            const pos = new THREE.Vector3(tile.x, 0.4, tile.z);
            this.createPOI(type, pos);
        }
    }

    createPOI(type, position) {
        const group = new THREE.Group();
        group.userData.mapGenerated = true;
        let name = '';
        if (type === 'bunker') {
            name = '\u0411\u0443\u043d\u043a\u0435\u0440';
            const mat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.9, flatShading: true });
            const base = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 4), mat);
            base.position.set(position.x, 1.1, position.z);
            group.add(base);
            const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.2), new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.6, flatShading: true }));
            door.position.set(position.x, 0.9, position.z + 2.1);
            group.add(door);
            this.addColliderBox(new THREE.Vector3(position.x, 1.1, position.z), 6, 2.2, 4, false);
        } else if (type === 'camp') {
            name = '\u041b\u0430\u0433\u0435\u0440\u044c';
            const tentMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9, flatShading: true });
            const tent = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.2, 4), tentMat);
            tent.position.set(position.x, 1.1, position.z);
            tent.rotation.y = Math.PI / 4;
            group.add(tent);
            const fire = new THREE.Mesh(
                new THREE.CylinderGeometry(0.6, 0.8, 0.4, 6),
                new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9, flatShading: true })
            );
            fire.position.set(position.x + 2.6, 0.2, position.z - 1.2);
            group.add(fire);
            this.addColliderBox(new THREE.Vector3(position.x, 1.1, position.z), 3.5, 2.2, 3.5, false);
        } else if (type === 'observatory') {
            name = '\u041e\u0431\u0441\u0435\u0440\u0432\u0430\u0442\u043e\u0440\u0438\u044f';
            const mat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, roughness: 0.85, flatShading: true });
            const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 6, 6), mat);
            tower.position.set(position.x, 3, position.z);
            group.add(tower);
            const dish = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.2, 0.4, 8), mat);
            dish.position.set(position.x, 6.3, position.z);
            dish.rotation.z = Math.PI / 10;
            group.add(dish);
            this.addColliderBox(new THREE.Vector3(position.x, 3, position.z), 4.2, 6, 4.2, false);
        }

        this.scene.add(group);
        this.storyPOIs.push({ name, position: position.clone(), type });

        const noteMat = new THREE.MeshStandardMaterial({
            color: 0xfff59d,
            emissive: 0xfff176,
            emissiveIntensity: 0.6,
            flatShading: true
        });
        const note = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1), noteMat);
        note.position.set(position.x + 1.2, 0.6, position.z + 1.2);
        note.userData.mapGenerated = true;
        this.scene.add(note);
        this.storyNotes.push({
            position: note.position.clone(),
            text: `${name}: \u0417\u0430\u043f\u0438\u0441\u044c #${this.storyNotes.length + 1} \u2014 \u043b\u0430\u0431\u0438\u0440\u0438\u043d\u0442 \u043c\u0435\u043d\u044f\u0435\u0442\u0441\u044f, \u0434\u0435\u0440\u0436\u0438\u0442\u0435\u0441\u044c \u0432\u043c\u0435\u0441\u0442\u0435.`
        });
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

    hashNoise(x, y, scale = 1) {
        const sx = Math.floor(x * scale);
        const sy = Math.floor(y * scale);
        let h = (sx * 374761393 + sy * 668265263 + this.seed * 1442695041) >>> 0;
        h ^= h >>> 13;
        h = Math.imul(h, 1274126177) >>> 0;
        h ^= h >>> 16;
        return h / 0x100000000;
    }

    buildHeightMap() {
        const map = Array.from({ length: this.gridHeight }, () => Array(this.gridWidth).fill(0));
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const tile = this.grid?.[y]?.[x];
                const biome = tile?.biome || this.tileGen.pickBiome(x, y);
                const n1 = this.hashNoise(x / 3, y / 3, 1);
                const n2 = this.hashNoise(x / 8 + 31, y / 8 - 17, 1);
                const n = Math.min(1, Math.max(0, n1 * 0.7 + n2 * 0.3));
                map[y][x] = this.getBiomeHeight(biome, n);
            }
        }
        return map;
    }

    getBiomeHeight(biome, n) {
        let min = 0.0;
        let max = 0.8;
        if (biome === 'forest') { min = 0.2; max = 1.0; }
        else if (biome === 'jungle') { min = 0.4; max = 1.4; }
        else if (biome === 'plains') { min = 0.1; max = 0.9; }
        else if (biome === 'rock') { min = 0.6; max = 1.8; }
        else if (biome === 'sand') { min = 0.0; max = 0.6; }
        else if (biome === 'snow') { min = 0.3; max = 1.1; }
        else if (biome === 'lava') { min = 0.1; max = 0.7; }
        const height = min + (max - min) * n;
        return Math.round(height / 0.2) * 0.2;
    }

    getBiomeColor(biome, gx, gy) {
        const base = new THREE.Color(this.biomeColors[biome] ?? this.biomeColors.plains);
        const n = this.hashNoise(gx / 4, gy / 4, 1);
        const hsl = {};
        base.getHSL(hsl);
        hsl.l = Math.min(1, Math.max(0, hsl.l + (n - 0.5) * 0.12));
        hsl.s = Math.min(1, Math.max(0, hsl.s + (n - 0.5) * 0.08));
        const out = new THREE.Color();
        out.setHSL(hsl.h, hsl.s, hsl.l);
        return out;
    }

    getFloorVariant(biome, gx, gy) {
        const n = this.hashNoise(gx / 6, gy / 6, 1);
        if (n < 0.33) return 0;
        if (n < 0.66) return 1;
        return 2;
    }

    getBiomeVariantColor(biome, variant) {
        const base = new THREE.Color(this.biomeColors[biome] ?? this.biomeColors.plains);
        const hsl = {};
        base.getHSL(hsl);
        if (variant === 0) hsl.l = Math.min(1, hsl.l + 0.06);
        if (variant === 1) hsl.l = Math.max(0, hsl.l - 0.02);
        if (variant === 2) hsl.l = Math.max(0, hsl.l - 0.08);
        const out = new THREE.Color();
        out.setHSL(hsl.h, hsl.s, hsl.l);
        return out;
    }

    getHeightAt(x, z) {
        if (!this.heightMap) return 0.4;
        const grid = this.worldToGrid(x, z);
        const gx = Math.max(0, Math.min(this.gridWidth - 1, grid.x));
        const gy = Math.max(0, Math.min(this.gridHeight - 1, grid.y));
        const base = this.heightMap?.[gy]?.[gx] ?? 0;
        return base + 0.4;
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

    getStoryNotes() {
        return this.storyNotes.map(note => ({ position: note.position.clone(), text: note.text }));
    }

    updatePropVisibility(playerPos) {
        if (!playerPos) return;
        const smallDist = 120;
        const leafDist = 150;
        for (const mesh of this.smallPropMeshes) {
            const center = mesh.userData.center || new THREE.Vector3();
            const dist = center.distanceTo(playerPos);
            mesh.visible = dist < smallDist;
        }
        for (const mesh of this.leafMeshes) {
            const center = mesh.userData.center || new THREE.Vector3();
            const dist = center.distanceTo(playerPos);
            mesh.visible = dist < leafDist;
        }
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
