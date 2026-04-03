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
        this.houseSpots = [];
        this.hangarSpots = [];
        this.oneWayGates = [];
        this.traps = [];
        this.textures = {};
        this.playerSpawn = null;
        this.storyPOIs = [];
        this.storyNotes = [];
        this.propMeshes = [];
        this.leafMeshes = [];
        this.smallPropMeshes = [];
        this.biomeColors = {};
        this.heightMap = null;
        this.railLayout = [];
        this.trainRoutes = [];
        this.trainCars = [];
        this.dynamicColliders = false;
        this.surfaceTheme = "plains";
        this.lavaPatches = [];
        this.waterPatches = [];
        this.fogZones = [];
        this.spawnCourtyardRadius = 54;
        this.houseVariants = [
            { width: 9.2, depth: 7.8, height: 4.4, doorWidth: 2.4, wallColor: 0xc9b08d, roofColor: 0x5f4638, style: "classic" },
            { width: 8.8, depth: 7.2, height: 4.2, doorWidth: 2.2, wallColor: 0xd1bfa3, roofColor: 0x6a4e3a, style: "cozy" },
            { width: 10.2, depth: 8.6, height: 4.9, doorWidth: 2.8, wallColor: 0xd6c1a5, roofColor: 0x6d4c41, style: "farm" },
            { width: 11.0, depth: 9.0, height: 5.0, doorWidth: 3.0, wallColor: 0xcfb190, roofColor: 0x5a4335, style: "village" },
            { width: 12.6, depth: 9.8, height: 5.4, doorWidth: 3.2, wallColor: 0xbfa07e, roofColor: 0x614735, style: "longhouse" },
            { width: 10.8, depth: 10.8, height: 5.2, doorWidth: 2.6, wallColor: 0xd8c3a6, roofColor: 0x6a4b36, style: "outpost" }
        ];
        this.hangarVariants = [
            { width: 62.0, depth: 38.0, height: 18.0, doorWidth: 18.0, wallColor: 0x7a8a95, roofColor: 0x3f4b53, style: "megaA" },
            { width: 58.0, depth: 36.0, height: 17.0, doorWidth: 17.0, wallColor: 0x8b949d, roofColor: 0x505a63, style: "megaB" },
            { width: 66.0, depth: 40.0, height: 18.8, doorWidth: 19.0, wallColor: 0x748089, roofColor: 0x39454d, style: "megaC" }
        ];
        this.storySnippets = [
            "Если это читаешь, значит поезд снова прошёл мимо. Не стой у рельс долго.",
            "Мы спрятали часть припасов под лестницей. Если останешься жив, забери.",
            "Ночью слышно, как кто-то ходит по крыше ангара. Не выходи без света.",
            "В тумане ориентируйся по прожекторам. Иначе кругами до рассвета.",
            "Тут были трое. Вернулся один. Он молчал и смотрел в сторону болота.",
            "Зомби тянутся к шуму. Тихо лутаешься - живёшь дольше.",
            "В больших домах всегда есть запасной выход. Ищи его до боя, не во время.",
            "Лава справа от старой насыпи. Обходи по бетонной кромке.",
            "Если зона давит, не дерись в поле. Уходи через постройки.",
            "В ангаре №2 много лута, но внутри обычно слишком много заражённых."
        ];

        this.seed = Math.floor((performance.now() + Math.random() * 1000000) % 2147483647);
        this.biomeColors = this.generateBiomePalette();
        this.generate();
    }

    generateBiomePalette() {
        const base = {
            forest: 0x2e7d32,
            jungle: 0x1f7a3a,
            plains: 0x8fdc6e,
            savanna: 0xb9c85a,
            swamp: 0x2f6b4f,
            taiga: 0x3e7f6b,
            rock: 0x9a9a9a,
            mesa: 0xb86a3b,
            sand: 0xf2d27a,
            snow: 0xffffff,
            ice: 0xcfe9ff,
            lava: 0x9c2f1a,
            tundra: 0xd8e6ef,
            redwood: 0x1e5f3a,
            badlands: 0xc56a3a,
            volcanic: 0x3b3b3b,
            mushroom: 0x7b4a9a
        };
        const seed = (this.seed || 1) >>> 0;
        let state = seed ^ 0x9e3779b9;
        const rand = () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        };
        const palette = {};
        Object.entries(base).forEach(([key, color]) => {
            const c = new THREE.Color(color);
            const hsl = {};
            c.getHSL(hsl);
            hsl.h = (hsl.h + (rand() - 0.5) * 0.08 + 1) % 1;
            hsl.s = Math.min(1, Math.max(0.35, hsl.s + (rand() - 0.5) * 0.15));
            hsl.l = Math.min(0.85, Math.max(0.2, hsl.l + (rand() - 0.5) * 0.12));
            const out = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
            palette[key] = out.getHex();
        });
        return palette;
    }

    generate() {
        const sizeBase = (129 + Math.floor((this.seed % 10) * 6)) * 2;
        const width = sizeBase;
        const height = sizeBase;
        const data = this.tileGen.generate(width, height, this.seed);
        this.grid = data.grid;
        this.gridWidth = data.width;
        this.gridHeight = data.height;
        this.size = Math.max(this.gridWidth, this.gridHeight) * this.tileSize;
        this.halfSize = this.size / 2;
        this.playerSpawn = data.playerSpawn;
        this.surfaceTheme = this.pickSurfaceTheme();
        this.decorateBiomeTiles();
        this.initRailLayout();
        this.clearRailCorridors();
        this.heightMap = this.buildHeightMap();

        this.clearSpawnZone();
        this.buildMeshes();
        this.buildSpawnPads();
        this.buildStoryPOIs();
        this.buildChests();
        this.buildRailSystem();
    }

    pickSurfaceTheme() {
        const themes = ['plains', 'forest', 'sand', 'snow', 'swamp', 'mesa'];
        const index = Math.abs(this.seed || 1) % themes.length;
        return themes[index];
    }

    decorateBiomeTiles() {
        if (!this.grid?.length) return;
        const randFor = (x, y) => {
            const v = Math.sin((x + 13.1) * 12.9898 + (y - 7.7) * 78.233 + this.seed * 0.0001) * 43758.5453;
            return v - Math.floor(v);
        };
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const tile = this.grid[y]?.[x];
                if (!tile) continue;
                tile.biome = tile.biome || this.tileGen.pickBiome(x, y);
                if (tile.type !== "floor") {
                    delete tile.prop;
                    continue;
                }
                const style = this.getBiomeVisualTheme(tile.biome);
                const roll = randFor(x, y);
                if (style === "grass") {
                    if (roll < 0.12) tile.prop = "tree";
                    else delete tile.prop;
                } else if (style === "swamp") {
                    if (roll < 0.1) tile.prop = "tree";
                    else if (roll < 0.15) tile.prop = "jungleTree";
                    else delete tile.prop;
                } else if (style === "sand") {
                    if (roll < 0.13) tile.prop = "cactus";
                    else if (roll < 0.17) tile.prop = "boulder";
                    else delete tile.prop;
                } else if (style === "snow") {
                    if (roll < 0.14) tile.prop = "ice";
                    else if (roll < 0.18) tile.prop = "boulder";
                    else delete tile.prop;
                } else if (style === "mesa" || style === "ash") {
                    if (roll < 0.16) tile.prop = "boulder";
                    else delete tile.prop;
                } else if (style === "jungle") {
                    if (roll < 0.1) tile.prop = "jungleTree";
                    else if (roll < 0.14) tile.prop = "tree";
                    else delete tile.prop;
                } else {
                    delete tile.prop;
                }
            }
        }
    }

    clearSpawnZone() {
        if (!this.playerSpawn) return;
        const radius = 14;
        for (let y = -radius; y <= radius; y++) {
            for (let x = -radius; x <= radius; x++) {
                const gx = this.playerSpawn.x + x;
                const gy = this.playerSpawn.y + y;
                if (!this.grid[gy]?.[gx]) continue;
                const tile = this.grid[gy][gx];
                tile.type = "floor";
                tile.biome = tile.biome || this.tileGen.pickBiome(gx, gy);
                delete tile.prop;
            }
        }
    }

    getSpawnWorld() {
        if (!this.playerSpawn) return { x: 0, z: 0 };
        return this.toWorld(this.playerSpawn.x, this.playerSpawn.y);
    }

    isInSpawnCourtyardWorld(x, z, extra = 0) {
        const spawnWorld = this.getSpawnWorld();
        return Math.hypot(x - spawnWorld.x, z - spawnWorld.z) <= this.spawnCourtyardRadius + extra;
    }

    initRailLayout() {
        const offset = this.size * 0.08;
        this.railLayout = [
            { axis: 'x', offset: -offset, halfWidth: 10.5 },
            { axis: 'x', offset: offset, halfWidth: 10.5 }
        ];
    }

    isNearRailCorridor(x, z, padding = 0) {
        if (!this.railLayout?.length) return false;
        return this.railLayout.some(route => {
            const distance = route.axis === 'x'
                ? Math.abs(z - route.offset)
                : Math.abs(x - route.offset);
            return distance <= route.halfWidth + padding;
        });
    }

    clearRailCorridors() {
        if (!this.railLayout?.length || !this.grid) return;
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const world = this.toWorld(x, y);
                if (!this.isNearRailCorridor(world.x, world.z, 2.5)) continue;
                const tile = this.grid[y]?.[x];
                if (!tile) continue;
                tile.type = "floor";
                tile.biome = tile.biome || this.tileGen.pickBiome(x, y);
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
        this.houseSpots = [];
        this.hangarSpots = [];
        this.trainRoutes = [];
        this.trainCars = [];
        this.dynamicColliders = false;
        this.lavaPatches = [];
        this.waterPatches = [];
        this.fogZones = [];
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
        const cacti = [];
        const iceSpikes = [];
        const boulders = [];
        const spawnWorld = this.getSpawnWorld();
        const addFloorTile = (tile, world, tileHeight, gx, gy) => {
            const biome = this.getBiomeVisualTheme(tile.biome || this.surfaceTheme);
            const variant = this.getFloorVariant(biome, gx, gy);
            const key = `${biome}:${variant}`;
            if (!floorsByBiome.has(key)) floorsByBiome.set(key, []);
            floorsByBiome.get(key).push({ x: world.x, z: world.z, gx, gy, variant, biome });
            this.floorTiles.push({ x: world.x, z: world.z, gx, gy, biome, y: tileHeight });
            if (Math.hypot(world.x - spawnWorld.x, world.z - spawnWorld.z) <= this.spawnCourtyardRadius) {
                return;
            }
            if (this.isNearRailCorridor(world.x, world.z, 2.8)) {
                return;
            }
            if (tile.prop === "tree") trees.push({ x: world.x, z: world.z, y: tileHeight });
            if (tile.prop === "jungleTree") jungleTrees.push({ x: world.x, z: world.z, y: tileHeight });
            if (tile.prop === "rock") rocks.push({ x: world.x, z: world.z, y: tileHeight });
            if (tile.prop === "cactus") cacti.push({ x: world.x, z: world.z, y: tileHeight });
            if (tile.prop === "ice") iceSpikes.push({ x: world.x, z: world.z, y: tileHeight });
            if (tile.prop === "boulder") boulders.push({ x: world.x, z: world.z, y: tileHeight });
        };

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const tile = this.grid[y][x];
                const world = this.toWorld(x, y);
                const tileHeight = this.heightMap?.[y]?.[x] ?? 0;
                if (tile.type === "wall") {
                    const distSpawn = Math.hypot(world.x - spawnWorld.x, world.z - spawnWorld.z);
                    const isBoundary = x === 0 || y === 0 || x === this.gridWidth - 1 || y === this.gridHeight - 1;
                    const keepNoise = Math.abs(Math.sin((x + 11.3) * 0.41 + (y - 7.7) * 0.37 + this.seed * 0.0017));
                    const keepWall = isBoundary || distSpawn < this.spawnCourtyardRadius + 14 || keepNoise > 0.82;
                    if (keepWall) {
                        walls.push({ x: world.x, z: world.z, y: tileHeight });
                        this.addColliderBox(new THREE.Vector3(world.x, tileHeight + this.wallHeight / 2, world.z), this.tileSize, this.wallHeight, this.tileSize, false);
                    } else {
                        tile.type = 'floor';
                        tile.biome = tile.biome || this.tileGen.pickBiome(x, y);
                        addFloorTile(tile, world, tileHeight, x, y);
                    }
                } else {
                    addFloorTile(tile, world, tileHeight, x, y);
                }
            }
        }

        floorsByBiome.forEach((floors, key) => {
            const [biomeKey, variantRaw] = key.split(":");
            const variant = Number(variantRaw) || 0;
            const floorMat = new THREE.MeshLambertMaterial({
                color: this.getBiomeVariantColor(biomeKey, variant),
                flatShading: true
            });
            const inst = new THREE.InstancedMesh(floorGeo, floorMat, floors.length);
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

        this.buildMassiveStructures();
        const filteredTrees = this.filterPropsOutsideStructures(trees, 2.5, 5.5);
        const filteredJungleTrees = this.filterPropsOutsideStructures(jungleTrees, 2.5, 5.5);
        const filteredRocks = this.filterPropsOutsideStructures(rocks, 1.8, 4.2);
        const filteredCacti = this.filterPropsOutsideStructures(cacti, 2.0, 4.8);
        const filteredIceSpikes = this.filterPropsOutsideStructures(iceSpikes, 3.2, 12.0);
        const filteredBoulders = this.filterPropsOutsideStructures(boulders, 2.2, 5.0);
        this.buildProps(filteredTrees, filteredJungleTrees, filteredRocks, filteredCacti, filteredIceSpikes, filteredBoulders);
        this.buildThemeGroundFeatures();
    }

    buildProps(trees, jungleTrees, rocks, cacti, iceSpikes, boulders) {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9, flatShading: true });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9, flatShading: true });
        const jungleLeafMat = new THREE.MeshStandardMaterial({ color: 0x1f7a3a, roughness: 0.9, flatShading: true });
        const cactusMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9, flatShading: true });
        const iceMat = new THREE.MeshStandardMaterial({ color: 0xb3e5fc, roughness: 0.3, flatShading: true });

        const treeTrunkGeo = new THREE.BoxGeometry(2.1, 30.0, 2.1);
        const treeLeafGeo = new THREE.BoxGeometry(8.4, 7.2, 8.4);
        const jungleTrunkGeo = new THREE.BoxGeometry(2.4, 34.0, 2.4);
        const jungleLeafGeo = new THREE.BoxGeometry(11.2, 8.6, 11.2);
        const cactusGeo = new THREE.BoxGeometry(2.3, 28.0, 2.3);
        const iceGeo = new THREE.ConeGeometry(3.1, 30.0, 8);

        const thin = (list, keepRatio = 1, salt = 0) => {
            if (keepRatio >= 0.999) return list;
            return list.filter((item, index) => {
                const hash = Math.abs(Math.sin((item.x + 17.3) * 0.013 + (item.z - 9.1) * 0.017 + salt + index * 0.11));
                return hash < keepRatio;
            });
        };

        this.addInstancedTreeChunked(treeTrunkGeo, trunkMat, treeLeafGeo, leafMat, thin(trees, 0.2, 0.4), 15.0, 35.5, 72);
        this.addInstancedTreeChunked(jungleTrunkGeo, trunkMat, jungleLeafGeo, jungleLeafMat, thin(jungleTrees, 0.18, 0.8), 17.0, 40.8, 80);
        this.addInstancedPropsChunked(cactusGeo, cactusMat, thin(cacti, 0.18, 1.8), 14.0, true, 80, false);
        this.addInstancedPropsChunked(iceGeo, iceMat, thin(iceSpikes, 0.18, 2.1), 15.0, true, 80, false);

    }

    filterPropsOutsideStructures(list, houseMargin = 2, hangarMargin = 5) {
        if (!list?.length) return [];
        const houses = this.houseSpots || [];
        const hangars = this.hangarSpots || [];
        return list.filter((item) => {
            for (const h of houses) {
                const halfW = (h.width || 9) * 0.5 + houseMargin;
                const halfD = (h.depth || 8) * 0.5 + houseMargin;
                if (Math.abs(item.x - h.x) <= halfW && Math.abs(item.z - h.z) <= halfD) return false;
            }
            for (const h of hangars) {
                const halfW = (h.width || 26) * 0.5 + hangarMargin;
                const halfD = (h.depth || 18) * 0.5 + hangarMargin;
                if (Math.abs(item.x - h.x) <= halfW && Math.abs(item.z - h.z) <= halfD) return false;
            }
            return true;
        });
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
            const leafLowerInst = new THREE.InstancedMesh(leafGeo, leafMat, chunk.length);
            const leafMidInst = new THREE.InstancedMesh(leafGeo, leafMat, chunk.length);
            const leafTopInst = new THREE.InstancedMesh(leafGeo, leafMat, chunk.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3(1, 1, 1);
            const scaleMid = new THREE.Vector3(0.78, 0.72, 0.78);
            const scaleTop = new THREE.Vector3(0.52, 0.56, 0.52);
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

                position.set(item.x, baseY + trunkHeight + leafGeo.parameters.height * 0.35, item.z);
                matrix.compose(position, rotation, scale);
                leafLowerInst.setMatrixAt(i, matrix);
                position.set(item.x, baseY + trunkHeight + leafGeo.parameters.height * 0.78, item.z);
                matrix.compose(position, rotation, scaleMid);
                leafMidInst.setMatrixAt(i, matrix);
                position.set(item.x, baseY + trunkHeight + leafGeo.parameters.height * 1.16, item.z);
                matrix.compose(position, rotation, scaleTop);
                leafTopInst.setMatrixAt(i, matrix);
            });
            const center = new THREE.Vector3(cx / chunk.length, 0, cz / chunk.length);
            trunkInst.userData.mapGenerated = true;
            trunkInst.userData.center = center;
            leafLowerInst.userData.mapGenerated = true;
            leafLowerInst.userData.center = center;
            leafMidInst.userData.mapGenerated = true;
            leafMidInst.userData.center = center;
            leafTopInst.userData.mapGenerated = true;
            leafTopInst.userData.center = center;
            this.scene.add(trunkInst);
            this.scene.add(leafLowerInst);
            this.scene.add(leafMidInst);
            this.scene.add(leafTopInst);
            this.propMeshes.push(trunkInst);
            this.leafMeshes.push(leafLowerInst, leafMidInst, leafTopInst);
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
        const radius = 11;
        const cx = this.playerSpawn.x;
        const cy = this.playerSpawn.y;
        for (let i = 0; i < 64; i++) {
            const angle = (i / 64) * Math.PI * 2;
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
        this.buildCornucopia();
    }

    buildCornucopia() {
        if (!this.playerSpawn) return;
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        const spawnWorld = this.getSpawnWorld();
        const baseY = this.getHeightAt(spawnWorld.x, spawnWorld.z);
        const group = new THREE.Group();
        group.userData.mapGenerated = true;

        const goldMat = new THREE.MeshStandardMaterial({
            color: 0xd2a03a,
            emissive: 0x6a4510,
            emissiveIntensity: 0.18,
            metalness: 0.36,
            roughness: 0.52,
            flatShading: true
        });
        const bronzeMat = new THREE.MeshStandardMaterial({
            color: 0x7d4f1f,
            roughness: 0.72,
            flatShading: true
        });
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0xb1a89c,
            roughness: 0.88,
            flatShading: true
        });
        const cacheMat = new THREE.MeshStandardMaterial({
            color: 0x9b6d44,
            roughness: 0.84,
            flatShading: true
        });
        const bandMat = new THREE.MeshStandardMaterial({
            color: 0x3d2b1f,
            roughness: 0.72,
            metalness: 0.1,
            flatShading: true
        });
        const accentMat = new THREE.MeshStandardMaterial({
            color: 0xc7b696,
            roughness: 0.85,
            flatShading: true
        });
        const lootMatA = new THREE.MeshStandardMaterial({
            color: 0xb5452c,
            roughness: 0.72,
            flatShading: true
        });
        const lootMatB = new THREE.MeshStandardMaterial({
            color: 0x2a5eb7,
            roughness: 0.72,
            flatShading: true
        });
        const lootMatC = new THREE.MeshStandardMaterial({
            color: 0x7f8d1f,
            roughness: 0.72,
            flatShading: true
        });

        const podium = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 7.1, 1.1, 12), stoneMat);
        podium.position.set(spawnWorld.x, baseY + 0.55, spawnWorld.z);
        podium.userData.mapGenerated = true;
        group.add(podium);
        this.addColliderBox(podium.position.clone(), 12.4, 1.1, 12.4, true);

        const plazaRing = new THREE.Mesh(new THREE.RingGeometry(8.6, 15.2, isMobile ? 16 : 24), accentMat);
        plazaRing.rotation.x = -Math.PI / 2;
        plazaRing.position.set(spawnWorld.x, baseY + 0.08, spawnWorld.z);
        plazaRing.userData.mapGenerated = true;
        group.add(plazaRing);

        const plazaCore = new THREE.Mesh(new THREE.CircleGeometry(8.1, isMobile ? 12 : 18), stoneMat);
        plazaCore.rotation.x = -Math.PI / 2;
        plazaCore.position.set(spawnWorld.x, baseY + 0.09, spawnWorld.z);
        plazaCore.userData.mapGenerated = true;
        group.add(plazaCore);

        for (let i = 0; i < (isMobile ? 4 : 8); i++) {
            const count = isMobile ? 4 : 8;
            const angle = (i / count) * Math.PI * 2 + Math.PI / count;
            const spoke = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.14, 1.1), accentMat);
            spoke.position.set(
                spawnWorld.x + Math.cos(angle) * 10.6,
                baseY + 0.11,
                spawnWorld.z + Math.sin(angle) * 10.6
            );
            spoke.rotation.y = -angle;
            spoke.userData.mapGenerated = true;
            group.add(spoke);
        }

        const hornRoot = new THREE.Group();
        hornRoot.position.set(spawnWorld.x - 0.25, baseY + 1.34, spawnWorld.z + 0.3);
        hornRoot.rotation.y = -0.22;
        group.add(hornRoot);

        const bodySegments = isMobile ? [
            { x: -4.1, y: 0.86, z: 0, sx: 3.35, sy: 2.7, sz: 2.8, rz: -0.24 },
            { x: -1.85, y: 1.5, z: 0, sx: 2.62, sy: 2.0, sz: 2.15, rz: -0.08 },
            { x: 0.55, y: 2.55, z: 0, sx: 1.72, sy: 1.28, sz: 1.42, rz: 0.16 },
            { x: 2.35, y: 3.72, z: 0, sx: 1.02, sy: 0.82, sz: 0.95, rz: 0.36 }
        ] : [
            { x: -4.45, y: 0.78, z: 0, sx: 3.55, sy: 2.95, sz: 3.05, rz: -0.26 },
            { x: -2.25, y: 1.32, z: 0, sx: 3.0, sy: 2.32, sz: 2.5, rz: -0.16 },
            { x: -0.1, y: 1.96, z: 0, sx: 2.34, sy: 1.84, sz: 1.98, rz: -0.02 },
            { x: 1.95, y: 2.84, z: 0, sx: 1.82, sy: 1.42, sz: 1.48, rz: 0.16 },
            { x: 3.42, y: 3.9, z: 0, sx: 1.18, sy: 0.94, sz: 1.0, rz: 0.38 }
        ];

        for (const seg of bodySegments) {
            const piece = new THREE.Mesh(new THREE.CylinderGeometry(seg.sy, seg.sx, 2.05, 10, 1, true), goldMat);
            piece.rotation.z = Math.PI / 2 + seg.rz;
            piece.scale.z = seg.sz / seg.sx;
            piece.position.set(seg.x, seg.y, seg.z);
            piece.userData.mapGenerated = true;
            hornRoot.add(piece);
        }

        for (let i = 0; i < bodySegments.length - 1; i++) {
            const a = bodySegments[i];
            const b = bodySegments[i + 1];
            const mid = new THREE.Mesh(
                new THREE.CylinderGeometry(
                    Math.min(a.sy, b.sy) * 0.9,
                    Math.max(a.sy, b.sy) * 1.02,
                    Math.max(1.55, Math.hypot(b.x - a.x, b.y - a.y) + 0.45),
                    10,
                    1,
                    true
                ),
                goldMat
            );
            mid.position.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, 0);
            mid.rotation.z = Math.PI / 2 + Math.atan2(b.y - a.y, b.x - a.x);
            mid.scale.z = ((a.sz || 1) + (b.sz || 1)) * 0.28;
            mid.userData.mapGenerated = true;
            hornRoot.add(mid);
        }

        const mouthOuter = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.36, 10, 26), goldMat);
        mouthOuter.rotation.y = Math.PI / 2;
        mouthOuter.position.set(-5.95, 0.66, 0);
        mouthOuter.userData.mapGenerated = true;
        hornRoot.add(mouthOuter);

        const mouthInner = new THREE.Mesh(new THREE.TorusGeometry(1.96, 0.2, 8, 20), bronzeMat);
        mouthInner.rotation.y = Math.PI / 2;
        mouthInner.position.set(-5.88, 0.68, 0);
        mouthInner.userData.mapGenerated = true;
        hornRoot.add(mouthInner);

        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.45, 8), bronzeMat);
        tail.rotation.z = -Math.PI / 2 + 0.72;
        tail.position.set(4.05, 4.28, 0);
        tail.userData.mapGenerated = true;
        hornRoot.add(tail);

        const supportA = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 1.2), bronzeMat);
        supportA.position.set(-1.3, 0.25, -0.95);
        supportA.rotation.z = -0.15;
        supportA.userData.mapGenerated = true;
        hornRoot.add(supportA);
        const supportB = supportA.clone();
        supportB.position.set(0.55, 1.05, 0.92);
        supportB.rotation.z = 0.12;
        hornRoot.add(supportB);

        const cacheOffsets = isMobile ? [
            [-3.2, 0.62, -3.0, 1.2, 0.9, 1.15],
            [3.15, 0.62, -2.9, 1.25, 0.9, 1.1],
            [-3.35, 0.62, 2.8, 1.05, 0.82, 1.25],
            [3.45, 0.62, 2.95, 1.15, 0.92, 1.15],
            [0.0, 0.62, -4.25, 1.35, 0.9, 1.1],
            [0.75, 0.62, 3.9, 1.2, 0.84, 1.2]
        ] : [
            [-3.6, 0.62, -3.2, 1.2, 0.9, 1.15],
            [3.4, 0.62, -3.05, 1.25, 0.9, 1.1],
            [-3.65, 0.62, 2.95, 1.05, 0.82, 1.25],
            [3.75, 0.62, 3.15, 1.15, 0.92, 1.15],
            [0.0, 0.62, -4.55, 1.35, 0.9, 1.1],
            [0.95, 0.62, 4.25, 1.2, 0.84, 1.2],
            [-1.35, 0.62, 3.45, 0.9, 0.72, 0.9],
            [4.85, 0.62, 0.3, 1.22, 0.86, 1.18],
            [-4.95, 0.62, 0.5, 1.18, 0.86, 1.18]
        ];
        for (const [ox, oy, oz, sx, sy, sz] of cacheOffsets) {
            const crate = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), cacheMat);
            crate.position.set(spawnWorld.x + ox, baseY + oy, spawnWorld.z + oz);
            crate.rotation.y = ((ox + oz) * 0.22) % Math.PI;
            crate.userData.mapGenerated = true;
            group.add(crate);

            const band = new THREE.Mesh(new THREE.BoxGeometry(sx * 1.02, sy * 0.16, sz * 0.2), bandMat);
            band.position.set(crate.position.x, crate.position.y, crate.position.z);
            band.rotation.y = crate.rotation.y;
            band.userData.mapGenerated = true;
            group.add(band);

            this.addColliderBox(crate.position.clone(), sx, sy, sz, false);
        }

        const spillOffsets = isMobile ? [
            [-2.2, 0.44, -0.8, 0.42, 0.22, 0.72, 0.4],
            [1.7, 0.44, -1.0, 0.22, 0.18, 0.8, 0.5],
            [2.05, 0.44, 0.92, 0.68, 0.18, 0.2, 0.15],
            [-1.15, 0.44, 1.55, 0.2, 0.18, 0.78, 0.32]
        ] : [
            [-2.8, 0.44, -1.1, 0.42, 0.22, 0.72, 0.4],
            [-2.1, 0.44, -0.35, 0.72, 0.18, 0.18, -0.2],
            [1.9, 0.44, -1.2, 0.22, 0.18, 0.8, 0.5],
            [2.5, 0.44, 1.05, 0.68, 0.18, 0.2, 0.15],
            [0.35, 0.44, 2.15, 0.48, 0.16, 0.6, -0.45],
            [-1.45, 0.44, 1.85, 0.2, 0.18, 0.78, 0.32]
        ];
        const lootMats = [lootMatA, lootMatB, lootMatC];
        spillOffsets.forEach(([ox, oy, oz, sx, sy, sz, rot], index) => {
            const loot = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), lootMats[index % lootMats.length]);
            loot.position.set(spawnWorld.x + ox, baseY + oy, spawnWorld.z + oz);
            loot.rotation.set(0.12, rot, -0.08);
            loot.userData.mapGenerated = true;
            group.add(loot);
        });

        this.addColliderBox(new THREE.Vector3(spawnWorld.x - 0.9, baseY + 3.0, spawnWorld.z), 9.8, 6.2, 5.6, false);

        this.scene.add(group);
    }

    buildChests() {
        this.chestSpots = [];
        if (!this.houseSpots?.length && !this.hangarSpots?.length) return;
        const rand = (() => {
            let state = (this.seed ^ 0x9e3779b9) >>> 0;
            return () => {
                state = (state * 1664525 + 1013904223) >>> 0;
                return state / 0x100000000;
            };
        })();

        const used = new Set();
        for (const house of this.houseSpots) {
            let placed = 0;
            const targetCount = 1 + Math.floor(rand() * 2);
            const points = [
                { x: house.x, z: house.z },
                { x: house.x - (house.width || 8) * 0.18, z: house.z - (house.depth || 7) * 0.18 },
                { x: house.x + (house.width || 8) * 0.18, z: house.z + (house.depth || 7) * 0.18 },
                { x: house.x - (house.width || 8) * 0.24, z: house.z + (house.depth || 7) * 0.2 },
                { x: house.x + (house.width || 8) * 0.24, z: house.z - (house.depth || 7) * 0.2 }
            ];
            for (let i = points.length - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                [points[i], points[j]] = [points[j], points[i]];
            }
            for (const p of points) {
                if (placed >= targetCount) break;
                const x = p.x;
                const z = p.z;
                const key = `${Math.round(x)}:${Math.round(z)}`;
                if (used.has(key)) continue;
                if (!this.isPointInsideStructure(x, z, house, 'house', 0.1)) continue;
                if (!this.isChestClear(x, z, 0.8, true)) continue;
                this.chestSpots.push({ x, z, grade: 'house' });
                used.add(key);
                placed += 1;
            }
            if (placed === 0) {
                const fallback = { x: house.x, z: house.z };
                const key = `${Math.round(fallback.x)}:${Math.round(fallback.z)}`;
                if (
                    this.isPointInsideStructure(fallback.x, fallback.z, house, 'house', 0.2)
                    && this.isChestClear(fallback.x, fallback.z, 0.8, true)
                ) {
                    if (!used.has(key)) {
                        this.chestSpots.push({ x: fallback.x, z: fallback.z, grade: 'house' });
                        used.add(key);
                    }
                }
            }
        }
        for (const hangar of this.hangarSpots) {
            let placed = 0;
            const targetCount = 18 + Math.floor(rand() * 7);
            const w = hangar.width || 60;
            const d = hangar.depth || 36;
            const points = [];
            const gx = [-0.34, -0.18, 0, 0.18, 0.34];
            const gz = [-0.28, -0.14, 0, 0.14, 0.28];
            for (const nx of gx) {
                for (const nz of gz) {
                    points.push({ x: hangar.x + w * nx, z: hangar.z + d * nz });
                }
            }
            points.push(
                { x: hangar.x - w * 0.42, z: hangar.z - d * 0.3 },
                { x: hangar.x + w * 0.42, z: hangar.z - d * 0.3 },
                { x: hangar.x - w * 0.42, z: hangar.z + d * 0.3 },
                { x: hangar.x + w * 0.42, z: hangar.z + d * 0.3 }
            );
            for (let i = points.length - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                [points[i], points[j]] = [points[j], points[i]];
            }
            for (const p of points) {
                if (placed >= targetCount) break;
                const x = p.x;
                const z = p.z;
                const key = `${Math.round(x)}:${Math.round(z)}`;
                if (used.has(key)) continue;
                if (!this.isPointInsideStructure(x, z, hangar, 'hangar', 0.4)) continue;
                if (!this.isChestClear(x, z, 0.95, true)) continue;
                this.chestSpots.push({ x, z, grade: 'hangar' });
                used.add(key);
                placed += 1;
            }
            if (placed === 0) {
                const fallback = { x: hangar.x, z: hangar.z };
                const key = `${Math.round(fallback.x)}:${Math.round(fallback.z)}`;
                if (
                    this.isPointInsideStructure(fallback.x, fallback.z, hangar, 'hangar', 0.4)
                    && this.isChestClear(fallback.x, fallback.z, 1.1, true)
                ) {
                    if (!used.has(key)) {
                        this.chestSpots.push({ x: fallback.x, z: fallback.z, grade: 'hangar' });
                        used.add(key);
                    }
                }
            }
        }
    }

    buildStoryPOIs() {
        this.storyPOIs = [];
        this.storyNotes = [];
        const structures = [
            ...(this.houseSpots || []).map((s) => ({ ...s, type: 'house', name: 'Дом' })),
            ...(this.hangarSpots || []).map((s) => ({ ...s, type: 'hangar', name: 'Ангар' }))
        ];
        if (!structures.length) return;
        const maxNotes = Math.min(24, structures.length);
        for (let i = 0; i < maxNotes; i++) {
            const s = structures[i % structures.length];
            const noteMat = new THREE.MeshStandardMaterial({
                color: 0xfff59d,
                emissive: 0xfff176,
                emissiveIntensity: 0.6,
                flatShading: true
            });
            const note = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1), noteMat);
            note.position.set(
                s.x + (Math.random() - 0.5) * Math.max(1.4, (s.width || 8) * 0.3),
                this.getHeightAt(s.x, s.z) + 0.8,
                s.z + (Math.random() - 0.5) * Math.max(1.4, (s.depth || 8) * 0.3)
            );
            note.userData.mapGenerated = true;
            this.scene.add(note);
            const story = this.storySnippets[this.storyNotes.length % this.storySnippets.length];
            this.storyNotes.push({
                position: note.position.clone(),
                text: `${s.name}: ${story}`
            });
            this.storyPOIs.push({
                name: s.name,
                position: new THREE.Vector3(s.x, this.getHeightAt(s.x, s.z), s.z),
                type: s.type
            });
        }
    }

    createPOI(type, position) {
        if (type === 'bunker' || type === 'camp' || type === 'observatory' || type === 'watchtower' || type === 'shed' || type === 'warehouse') {
            type = 'house';
        }
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
        } else if (type === 'warehouse') {
            name = '\u0421\u043a\u043b\u0430\u0434';
            this.addOpenBuildingShell(group, position, {
                width: 10.4,
                depth: 7.2,
                height: 4.6,
                wallColor: 0x7f8c8d,
                roofColor: 0x4f5c63,
                doorWidth: 3.2
            });
        } else if (type === 'house') {
            name = '\u0414\u043e\u043c';
            const variant = this.houseVariants[Math.floor(Math.random() * this.houseVariants.length)];
            this.addOpenBuildingShell(group, position, variant);
            this.houseSpots.push({ x: position.x, z: position.z, width: variant.width, depth: variant.depth, height: variant.height, style: variant.style });
        } else if (type === 'watchtower') {
            name = 'Вышка';
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.86, flatShading: true });
            const deckMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9, flatShading: true });
            const legs = [
                [-1.2, 2.2, -1.2], [1.2, 2.2, -1.2],
                [-1.2, 2.2, 1.2], [1.2, 2.2, 1.2]
            ];
            for (const [lx, ly, lz] of legs) {
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.4, 0.35), frameMat);
                leg.position.set(position.x + lx, ly, position.z + lz);
                group.add(leg);
            }
            const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 3.4), deckMat);
            deck.position.set(position.x, 4.55, position.z);
            group.add(deck);
            const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.6, 4), frameMat);
            roof.position.set(position.x, 5.9, position.z);
            roof.rotation.y = Math.PI / 4;
            group.add(roof);
            this.addColliderBox(new THREE.Vector3(position.x, 2.8, position.z), 3.6, 5.8, 3.6, false);
        } else if (type === 'shed') {
            name = 'Навес';
            const wallMat = new THREE.MeshStandardMaterial({ color: 0xbca48a, roughness: 0.9, flatShading: true });
            const roofMat = new THREE.MeshStandardMaterial({ color: 0x546e7a, roughness: 0.82, flatShading: true });
            const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 3.4), wallMat);
            base.position.set(position.x, 1.1, position.z);
            group.add(base);
            const roof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.3, 4), roofMat);
            roof.position.set(position.x, 2.4, position.z);
            roof.rotation.z = 0.08;
            group.add(roof);
            this.addColliderBox(new THREE.Vector3(position.x, 1.1, position.z), 4.2, 2.2, 3.4, false);
        } else if (type === 'hangar') {
            name = 'Ангар';
            const variant = this.hangarVariants[Math.floor(Math.random() * this.hangarVariants.length)];
            this.addOpenBuildingShell(group, position, variant);
            this.hangarSpots.push({ x: position.x, z: position.z, width: variant.width, depth: variant.depth, height: variant.height, style: variant.style });
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
        const story = this.storySnippets[this.storyNotes.length % this.storySnippets.length];
        this.storyNotes.push({
            position: note.position.clone(),
            text: `${name}: ${story}`
        });
    }

    addOpenBuildingShell(group, position, options = {}) {
        const width = options.width ?? 8;
        const depth = options.depth ?? 6;
        const height = options.height ?? 4;
        const isMassiveHangar = width >= 32 || depth >= 24 || height >= 10;
        const doorWidth = Math.max(1.6, Math.min(width - 2, options.doorWidth ?? 2.2));
        const wallThickness = isMassiveHangar ? 0.75 : 0.5;
        const wallMat = new THREE.MeshStandardMaterial({
            color: options.wallColor ?? 0xbca48a,
            roughness: 0.9,
            flatShading: true
        });
        const roofMat = new THREE.MeshStandardMaterial({
            color: options.roofColor ?? 0x5d4037,
            roughness: 0.82,
            flatShading: true
        });
        const baseY = this.getHeightAt(position.x, position.z);
        const wallY = baseY + height / 2;

        const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.3, depth + 0.3), roofMat);
        roof.position.set(position.x, baseY + height + 0.2, position.z);
        roof.userData.mapGenerated = true;
        group.add(roof);
        if (isMassiveHangar) {
            const roofRidge = new THREE.Mesh(
                new THREE.BoxGeometry(width * 0.72, 1.2, depth * 0.18),
                roofMat
            );
            roofRidge.position.set(position.x, baseY + height + 0.9, position.z);
            roofRidge.userData.mapGenerated = true;
            group.add(roofRidge);

            const beaconMat = new THREE.MeshStandardMaterial({
                color: 0xffd180,
                emissive: 0xffa726,
                emissiveIntensity: 0.9,
                roughness: 0.35,
                flatShading: true
            });
            for (const sx of [-1, 1]) {
                const tower = new THREE.Mesh(
                    new THREE.BoxGeometry(1.2, height + 3.8, 1.2),
                    wallMat
                );
                tower.position.set(position.x + sx * (width * 0.44), baseY + (height + 3.8) * 0.5, position.z + depth * 0.48);
                tower.userData.mapGenerated = true;
                group.add(tower);
                this.addColliderBox(tower.position.clone(), 1.2, height + 3.8, 1.2, false);

                const beacon = new THREE.Mesh(
                    new THREE.BoxGeometry(0.75, 0.75, 0.75),
                    beaconMat
                );
                beacon.position.set(tower.position.x, baseY + height + 4.4, tower.position.z);
                beacon.userData.mapGenerated = true;
                group.add(beacon);
            }
        }

        const colliderSink = 1.2;
        const colliderWallY = wallY - colliderSink * 0.5;
        const colliderWallH = height + colliderSink;

        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, height, depth), wallMat);
        leftWall.position.set(position.x - width / 2 + wallThickness / 2, wallY, position.z);
        leftWall.userData.mapGenerated = true;
        group.add(leftWall);
        this.addColliderBox(new THREE.Vector3(leftWall.position.x, colliderWallY, leftWall.position.z), wallThickness + 0.25, colliderWallH, depth + 0.2, false);

        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, height, depth), wallMat);
        rightWall.position.set(position.x + width / 2 - wallThickness / 2, wallY, position.z);
        rightWall.userData.mapGenerated = true;
        group.add(rightWall);
        this.addColliderBox(new THREE.Vector3(rightWall.position.x, colliderWallY, rightWall.position.z), wallThickness + 0.25, colliderWallH, depth + 0.2, false);

        if (isMassiveHangar) {
            const backDoorWidth = Math.max(4.8, Math.min(width - 4, doorWidth * 0.82));
            const backSegmentWidth = Math.max(1.2, (width - backDoorWidth) / 2);
            const backLeft = new THREE.Mesh(new THREE.BoxGeometry(backSegmentWidth, height, wallThickness), wallMat);
            backLeft.position.set(position.x - backDoorWidth / 2 - backSegmentWidth / 2, wallY, position.z - depth / 2 + wallThickness / 2);
            backLeft.userData.mapGenerated = true;
            group.add(backLeft);
            this.addColliderBox(new THREE.Vector3(backLeft.position.x, colliderWallY, backLeft.position.z), backSegmentWidth + 0.12, colliderWallH, wallThickness + 0.25, false);

            const backRight = new THREE.Mesh(new THREE.BoxGeometry(backSegmentWidth, height, wallThickness), wallMat);
            backRight.position.set(position.x + backDoorWidth / 2 + backSegmentWidth / 2, wallY, position.z - depth / 2 + wallThickness / 2);
            backRight.userData.mapGenerated = true;
            group.add(backRight);
            this.addColliderBox(new THREE.Vector3(backRight.position.x, colliderWallY, backRight.position.z), backSegmentWidth + 0.12, colliderWallH, wallThickness + 0.25, false);
        } else {
            const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallThickness), wallMat);
            backWall.position.set(position.x, wallY, position.z - depth / 2 + wallThickness / 2);
            backWall.userData.mapGenerated = true;
            group.add(backWall);
            this.addColliderBox(new THREE.Vector3(backWall.position.x, colliderWallY, backWall.position.z), width + 0.2, colliderWallH, wallThickness + 0.25, false);
        }

        const frontSegmentWidth = (width - doorWidth) / 2;
        const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(frontSegmentWidth, height, wallThickness), wallMat);
        frontLeft.position.set(position.x - doorWidth / 2 - frontSegmentWidth / 2, wallY, position.z + depth / 2 - wallThickness / 2);
        frontLeft.userData.mapGenerated = true;
        group.add(frontLeft);
        this.addColliderBox(new THREE.Vector3(frontLeft.position.x, colliderWallY, frontLeft.position.z), frontSegmentWidth + 0.12, colliderWallH, wallThickness + 0.25, false);

        const frontRight = new THREE.Mesh(new THREE.BoxGeometry(frontSegmentWidth, height, wallThickness), wallMat);
        frontRight.position.set(position.x + doorWidth / 2 + frontSegmentWidth / 2, wallY, position.z + depth / 2 - wallThickness / 2);
        frontRight.userData.mapGenerated = true;
        group.add(frontRight);
        this.addColliderBox(new THREE.Vector3(frontRight.position.x, colliderWallY, frontRight.position.z), frontSegmentWidth + 0.12, colliderWallH, wallThickness + 0.25, false);

        if (isMassiveHangar) {
            const lintelHeight = Math.max(2.8, height * 0.28);
            const lintel = new THREE.Mesh(
                new THREE.BoxGeometry(doorWidth, lintelHeight, wallThickness),
                wallMat
            );
            lintel.position.set(position.x, baseY + height - lintelHeight * 0.5, position.z + depth / 2 - wallThickness / 2);
            lintel.userData.mapGenerated = true;
            group.add(lintel);
            this.addColliderBox(
                new THREE.Vector3(lintel.position.x, lintel.position.y - 0.2, lintel.position.z),
                doorWidth,
                lintelHeight + 0.6,
                wallThickness + 0.25,
                false
            );
            // Keep hangars open inside for clear combat and looting flow.
        }
    }

    buildMassiveStructures() {
        if (!this.floorTiles?.length) return;
        const rand = (() => {
            let state = (this.seed ^ 0x6d2b79f5) >>> 0;
            return () => {
                state = (state * 1664525 + 1013904223) >>> 0;
                return state / 0x100000000;
            };
        })();

        const spawnWorld = this.getSpawnWorld();
        const candidates = this.floorTiles.filter(tile => {
            const dx = tile.x - spawnWorld.x;
            const dz = tile.z - spawnWorld.z;
            return Math.hypot(dx, dz) > this.spawnCourtyardRadius + 20;
        });
        if (!candidates.length) return;
        const nearSpawnCandidates = candidates
            .filter(tile => {
                const dx = tile.x - spawnWorld.x;
                const dz = tile.z - spawnWorld.z;
                const d = Math.hypot(dx, dz);
                return d >= this.spawnCourtyardRadius + 24 && d <= 170;
            })
            .sort((a, b) => {
                const da = Math.hypot(a.x - spawnWorld.x, a.z - spawnWorld.z);
                const db = Math.hypot(b.x - spawnWorld.x, b.z - spawnWorld.z);
                return da - db;
            });

        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        const placed = [];
        const canPlace = (x, z, minDist) => !placed.some(p => Math.hypot(p.x - x, p.z - z) < minDist);

        const placeStructure = (type, count, sourceCandidates = candidates) => {
            let created = 0;
            for (const tile of sourceCandidates) {
                if (created >= count) break;
                if (this.isNearRailCorridor(tile.x, tile.z, type === 'hangar' ? 16 : 14)) continue;
                if (!this.isChestClear(tile.x, tile.z, type === 'hangar' ? 12 : 7)) continue;
                if (!canPlace(tile.x, tile.z, type === 'hangar' ? 104 : 40)) continue;

                const group = new THREE.Group();
                group.userData.mapGenerated = true;
                if (type === 'house') {
                    const variant = this.houseVariants[Math.floor(rand() * this.houseVariants.length)];
                    this.addOpenBuildingShell(group, new THREE.Vector3(tile.x, 0, tile.z), variant);
                    this.houseSpots.push({ x: tile.x, z: tile.z, width: variant.width, depth: variant.depth, height: variant.height, style: variant.style });
                } else {
                    const variant = this.hangarVariants[Math.floor(rand() * this.hangarVariants.length)];
                    this.addOpenBuildingShell(group, new THREE.Vector3(tile.x, 0, tile.z), variant);
                    this.hangarSpots.push({ x: tile.x, z: tile.z, width: variant.width, depth: variant.depth, height: variant.height, style: variant.style });
                }
                this.scene.add(group);
                placed.push({ x: tile.x, z: tile.z });
                created += 1;
            }
            return created;
        };

        const guaranteedNearHangars = placeStructure('hangar', 2, nearSpawnCandidates);
        placeStructure('house', 96);
        placeStructure('hangar', 6 - guaranteedNearHangars);
        this.buildTreeHouses(candidates, rand, placed);

        const rockMat = new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.92, flatShading: true });
        let rockPlaced = 0;
        for (const tile of candidates) {
            if (rockPlaced >= 12) break;
            if (this.isNearRailCorridor(tile.x, tile.z, 12)) continue;
            if (!this.isChestClear(tile.x, tile.z, 6.6)) continue;
            if (!canPlace(tile.x, tile.z, 22)) continue;
            if (rand() > 0.28) continue;
            const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(5.6 + rand() * 2.2, 0), rockMat);
            const scale = 1 + rand() * 0.45;
            mesh.scale.set(scale, 0.82 + rand() * 0.28, scale * (0.82 + rand() * 0.2));
            const y = this.getHeightAt(tile.x, tile.z) + 4.5;
            mesh.position.set(tile.x, y, tile.z);
            mesh.rotation.y = rand() * Math.PI * 2;
            mesh.rotation.x = (rand() - 0.5) * 0.25;
            mesh.rotation.z = (rand() - 0.5) * 0.25;
            mesh.userData.mapGenerated = true;
            this.scene.add(mesh);
            const size = 11.5 * scale;
            this.addColliderBox(new THREE.Vector3(tile.x, y, tile.z), size, 8.4 * scale, size, false);
            placed.push({ x: tile.x, z: tile.z });
            rockPlaced += 1;
        }
    }

    buildThemeGroundFeatures() {
        if (!this.floorTiles?.length) return;
        const rand = (() => {
            let state = (this.seed ^ 0x13572468) >>> 0;
            return () => {
                state = (state * 1664525 + 1013904223) >>> 0;
                return state / 0x100000000;
            };
        })();
        const candidates = [...this.floorTiles].sort(() => rand() - 0.5);
        const placed = [];
        const canPlace = (x, z, minDist) => !placed.some(p => Math.hypot(p.x - x, p.z - z) < minDist);
        const markPlaced = (x, z) => placed.push({ x, z });

        const addPatch = (x, z, width, depth, material, yOffset = 0.58) => {
            if (this.isPatchOverlappingStructure(x, z, width, depth, 1.6)) {
                return null;
            }
            material.polygonOffset = true;
            material.polygonOffsetFactor = -2;
            material.polygonOffsetUnits = -2;
            const patch = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, depth), material);
            patch.position.set(x, this.getHeightAt(x, z) + yOffset, z);
            patch.renderOrder = 20;
            patch.userData.mapGenerated = true;
            this.scene.add(patch);
            return patch;
        };

        const grassMat = new THREE.MeshStandardMaterial({ color: 0x4fa34a, roughness: 1, flatShading: true });
        const lakeMat = new THREE.MeshStandardMaterial({ color: 0x4aa3d8, roughness: 0.2, metalness: 0.05, flatShading: true });
        const iceLakeMat = new THREE.MeshStandardMaterial({ color: 0xaedfff, roughness: 0.25, metalness: 0.08, flatShading: true });
        const lavaMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xaa2200, emissiveIntensity: 0.6, roughness: 0.35, flatShading: true });

        const tallGrassPoints = [];
        const patchBudget = 34;
        let patchUsed = 0;

        for (const tile of candidates) {
            if (patchUsed >= patchBudget) break;
            if (this.isNearRailCorridor(tile.x, tile.z, 16)) continue;
            if (this.houseSpots.some(h => Math.abs(h.x - tile.x) < ((h.width || 9) * 0.56) && Math.abs(h.z - tile.z) < ((h.depth || 8) * 0.56))) continue;
            if (this.hangarSpots.some(h => Math.abs(h.x - tile.x) < ((h.width || 58) * 0.58) && Math.abs(h.z - tile.z) < ((h.depth || 36) * 0.58))) continue;
            if (this.isInSpawnCourtyardWorld(tile.x, tile.z, 8)) continue;
            if (!canPlace(tile.x, tile.z, 18)) continue;

            const style = tile.biome || this.surfaceTheme;
            if (style === "swamp") {
                const wx = tile.x + (rand() - 0.5) * 8;
                const wz = tile.z + (rand() - 0.5) * 8;
                const w = 9 + rand() * 10;
                const d = 9 + rand() * 10;
                const patch = addPatch(wx, wz, w, d, lakeMat, 0.8);
                if (!patch) continue;
                this.waterPatches.push({ x: wx, z: wz, width: w, depth: d });
                this.fogZones.push({ x: wx, z: wz, radius: Math.max(w, d) * 0.72, density: 0.024 + rand() * 0.016 });
                markPlaced(tile.x, tile.z);
                patchUsed += 1;
                continue;
            }
            if (style === "ash") {
                const w = 8 + rand() * 8;
                const d = 8 + rand() * 8;
                const patch = addPatch(tile.x, tile.z, w, d, lavaMat, 0.8);
                if (!patch) continue;
                this.lavaPatches.push({ x: tile.x, z: tile.z, width: w, depth: d });
                markPlaced(tile.x, tile.z);
                patchUsed += 1;
                continue;
            }
            if (style === "snow") {
                const w = 9 + rand() * 10;
                const d = 9 + rand() * 10;
                const patch = addPatch(tile.x, tile.z, w, d, iceLakeMat, 0.8);
                if (!patch) continue;
                this.waterPatches.push({ x: tile.x, z: tile.z, width: w, depth: d });
                markPlaced(tile.x, tile.z);
                patchUsed += 1;
                continue;
            }
            if (style === "sand") {
                const width = 12 + rand() * 12;
                const depth = 12 + rand() * 12;
                const patch = addPatch(tile.x, tile.z, width, depth, new THREE.MeshStandardMaterial({ color: 0xe0bf72, roughness: 1, flatShading: true }), 0.76);
                if (!patch) continue;
                markPlaced(tile.x, tile.z);
                patchUsed += 1;
                continue;
            }

            const width = 10 + rand() * 14;
            const depth = 10 + rand() * 14;
            const patch = addPatch(tile.x, tile.z, width, depth, grassMat, 0.76);
            if (!patch) continue;
            markPlaced(tile.x, tile.z);
            patchUsed += 1;
            const grassCount = 18 + Math.floor(rand() * 24);
            for (let i = 0; i < grassCount; i++) {
                tallGrassPoints.push({
                    x: tile.x + (rand() - 0.5) * width * 0.8,
                    z: tile.z + (rand() - 0.5) * depth * 0.8,
                    h: 3.2 + rand() * 4.8
                });
            }
        }

        if (this.fogZones.length === 0) {
            const swampTile = candidates.find(t => (t.biome || this.surfaceTheme) === "swamp");
            if (swampTile) {
                const w = 12;
                const d = 12;
                addPatch(swampTile.x, swampTile.z, w, d, lakeMat, 0.8);
                this.waterPatches.push({ x: swampTile.x, z: swampTile.z, width: w, depth: d });
                this.fogZones.push({ x: swampTile.x, z: swampTile.z, radius: 8, density: 0.03 });
            }
        }
        if (this.lavaPatches.length === 0) {
            const lavaTile = candidates.find(t => (t.biome || this.surfaceTheme) === "ash");
            if (lavaTile) {
                const w = 10;
                const d = 10;
                addPatch(lavaTile.x, lavaTile.z, w, d, lavaMat, 0.8);
                this.lavaPatches.push({ x: lavaTile.x, z: lavaTile.z, width: w, depth: d });
            }
        }
        this.buildTallGrass(tallGrassPoints);
    }

    buildRailSystem() {
        this.trainRoutes = [];
        this.trainCars = [];
        this.dynamicColliders = false;

        const railMat = new THREE.MeshStandardMaterial({
            color: 0x9e9e9e,
            roughness: 0.65,
            metalness: 0.25,
            flatShading: true
        });
        railMat.polygonOffset = true;
        railMat.polygonOffsetFactor = -1;
        railMat.polygonOffsetUnits = -1;
        const sleeperMat = new THREE.MeshStandardMaterial({
            color: 0x5d4037,
            roughness: 0.9,
            flatShading: true
        });
        sleeperMat.polygonOffset = true;
        sleeperMat.polygonOffsetFactor = -1;
        sleeperMat.polygonOffsetUnits = -1;
        const ballastMat = new THREE.MeshStandardMaterial({
            color: 0x666666,
            roughness: 0.92,
            flatShading: true
        });
        ballastMat.polygonOffset = true;
        ballastMat.polygonOffsetFactor = -1;
        ballastMat.polygonOffsetUnits = -1;
        const routeDefs = this.railLayout.length ? this.railLayout : [
            { axis: 'x', offset: -this.size * 0.34, halfWidth: 9.5 },
            { axis: 'x', offset: this.size * 0.34, halfWidth: 9.5 }
        ];
        const trackHalf = this.size * 0.44;
        const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        for (const def of routeDefs) {
            const group = new THREE.Group();
            group.userData.mapGenerated = true;

            const route = {
                axis: def.axis,
                offset: def.offset,
                min: -trackHalf,
                max: trackHalf
            };

            const railLength = (route.max - route.min);
            const sleeperCount = Math.max(24, Math.floor(railLength / 3.4));
            const visualSegments = Math.max(18, Math.floor(railLength / 20));
            const visualSegmentLength = railLength / visualSegments;
            const ballastHeight = isMobile ? 0.22 : 0.2;
            const railHeight = isMobile ? 0.17 : 0.16;
            const sleeperHeight = isMobile ? 0.14 : 0.13;
            const ballastWidth = 7.8;
            const railOffset = 1.85;
            for (let s = 0; s < visualSegments; s++) {
                const t = (s + 0.5) / visualSegments;
                const center = route.min + t * railLength;
                const surfaceY = route.axis === 'x'
                    ? this.getHeightAt(center, route.offset)
                    : this.getHeightAt(route.offset, center);
                const ballastCenterY = surfaceY + ballastHeight * 0.5 + 0.03;
                const sleeperCenterY = ballastCenterY + ballastHeight * 0.5 + sleeperHeight * 0.5 + 0.01;
                const railCenterY = sleeperCenterY + sleeperHeight * 0.5 + railHeight * 0.5 + 0.02;
                const ballastGeo = route.axis === 'x'
                    ? new THREE.BoxGeometry(visualSegmentLength * 1.02, ballastHeight, ballastWidth)
                    : new THREE.BoxGeometry(ballastWidth, ballastHeight, visualSegmentLength * 1.02);
                const railGeo = route.axis === 'x'
                    ? new THREE.BoxGeometry(visualSegmentLength * 1.02, railHeight, 0.32)
                    : new THREE.BoxGeometry(0.32, railHeight, visualSegmentLength * 1.02);

                const ballast = new THREE.Mesh(ballastGeo, ballastMat);
                const railLeft = new THREE.Mesh(railGeo, railMat);
                const railRight = new THREE.Mesh(railGeo, railMat);
                ballast.userData.mapGenerated = true;
                railLeft.userData.mapGenerated = true;
                railRight.userData.mapGenerated = true;

                if (route.axis === 'x') {
                    ballast.position.set(center, ballastCenterY, route.offset);
                    railLeft.position.set(center, railCenterY, route.offset - railOffset);
                    railRight.position.set(center, railCenterY, route.offset + railOffset);
                } else {
                    ballast.position.set(route.offset, ballastCenterY, center);
                    railLeft.position.set(route.offset - railOffset, railCenterY, center);
                    railRight.position.set(route.offset + railOffset, railCenterY, center);
                }
                group.add(ballast, railLeft, railRight);
            }

            for (let i = 0; i < sleeperCount; i++) {
                const t = i / Math.max(1, sleeperCount - 1);
                const p = route.min + t * (route.max - route.min);
                const surfaceY = route.axis === 'x'
                    ? this.getHeightAt(p, route.offset)
                    : this.getHeightAt(route.offset, p);
                const ballastCenterY = surfaceY + ballastHeight * 0.5 + 0.03;
                const sleeperCenterY = ballastCenterY + ballastHeight * 0.5 + sleeperHeight * 0.5 + 0.01;
                const sleeperGeo = route.axis === 'x'
                    ? new THREE.BoxGeometry(0.58, sleeperHeight, 4.8)
                    : new THREE.BoxGeometry(4.8, sleeperHeight, 0.58);
                const sleeper = new THREE.Mesh(sleeperGeo, sleeperMat);
                sleeper.userData.mapGenerated = true;
                if (route.axis === 'x') {
                    sleeper.position.set(p, sleeperCenterY, route.offset);
                } else {
                    sleeper.position.set(route.offset, sleeperCenterY, p);
                }
                group.add(sleeper);
            }
            this.scene.add(group);

            this.trainRoutes.push(route);
            this.spawnTrain(route, 0.2, 1);
            this.spawnTrain(route, 0.68, -1);
        }

        this.dynamicColliders = this.trainCars.length > 0;
    }

    spawnTrain(route, startT, direction) {
        const train = new THREE.Group();
        train.userData.mapGenerated = true;

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.58, metalness: 0.2, flatShading: true });
        const accentMat = new THREE.MeshStandardMaterial({ color: 0xffa726, roughness: 0.55, flatShading: true });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.7, flatShading: true });

        const carLength = 14.2;
        const carWidth = 4.8;
        const carHeight = 1.6;

        const base = new THREE.Mesh(new THREE.BoxGeometry(carLength, carHeight, carWidth), bodyMat);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(carLength * 0.92, 0.45, carWidth * 0.88), roofMat);
        roof.position.y = carHeight / 2 + 0.22;
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(carLength * 0.92, 0.36, 0.2), accentMat);
        stripe.position.set(0, 0, carWidth / 2 + 0.11);
        const stripe2 = stripe.clone();
        stripe2.position.z = -carWidth / 2 - 0.11;

        base.userData.mapGenerated = true;
        roof.userData.mapGenerated = true;
        stripe.userData.mapGenerated = true;
        stripe2.userData.mapGenerated = true;
        train.add(base, roof, stripe, stripe2);
        this.scene.add(train);

        const startPos = route.min + startT * (route.max - route.min);
        if (route.axis === 'x') {
            train.position.set(startPos, this.getHeightAt(startPos, route.offset) + carHeight / 2 + 0.05, route.offset);
        } else {
            train.position.set(route.offset, this.getHeightAt(route.offset, startPos) + carHeight / 2 + 0.05, startPos);
            train.rotation.y = Math.PI / 2;
        }

        const bodyCollider = this.addColliderBox(
            train.position.clone(),
            route.axis === 'x' ? carLength : carWidth,
            carHeight,
            route.axis === 'x' ? carWidth : carLength,
            false,
            true,
            true
        );
        const topCollider = this.addColliderBox(
            new THREE.Vector3(train.position.x, train.position.y + carHeight / 2 + 0.08, train.position.z),
            route.axis === 'x' ? carLength * 0.95 : carWidth * 0.95,
            0.18,
            route.axis === 'x' ? carWidth * 0.95 : carLength * 0.95,
            true,
            true,
            true
        );

        this.trainCars.push({
            route,
            mesh: train,
            t: startT,
            speed: 0.0084 + Math.random() * 0.0013,
            direction,
            carLength,
            carWidth,
            carHeight,
            bodyCollider,
            topCollider,
            deltaX: 0,
            deltaZ: 0,
            prevX: train.position.x,
            prevZ: train.position.z
        });
    }

    update(delta) {
        if (!this.trainCars.length) return;
        for (const train of this.trainCars) {
            const prevX = train.mesh.position.x;
            const prevZ = train.mesh.position.z;
            train.t += train.direction * train.speed * delta;
            if (train.t <= 0) {
                train.t = 0;
                train.direction = 1;
            } else if (train.t >= 1) {
                train.t = 1;
                train.direction = -1;
            }

            const pathPos = train.route.min + train.t * (train.route.max - train.route.min);
            let centerX;
            let centerZ;
            if (train.route.axis === 'x') {
                centerX = pathPos;
                centerZ = train.route.offset;
                train.mesh.position.set(centerX, this.getHeightAt(centerX, centerZ) + train.carHeight / 2 + 0.05, centerZ);
                train.mesh.rotation.y = train.direction > 0 ? 0 : Math.PI;
            } else {
                centerX = train.route.offset;
                centerZ = pathPos;
                train.mesh.position.set(centerX, this.getHeightAt(centerX, centerZ) + train.carHeight / 2 + 0.05, centerZ);
                train.mesh.rotation.y = train.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
            }

            const bodyW = train.route.axis === 'x' ? train.carLength : train.carWidth;
            const bodyD = train.route.axis === 'x' ? train.carWidth : train.carLength;
            this.setColliderBoxCenter(train.bodyCollider, centerX, train.mesh.position.y, centerZ, bodyW, train.carHeight, bodyD);
            this.setColliderBoxCenter(train.topCollider, centerX, train.mesh.position.y + train.carHeight / 2 + 0.08, centerZ, bodyW * 0.95, 0.18, bodyD * 0.95);
            train.deltaX = train.mesh.position.x - prevX;
            train.deltaZ = train.mesh.position.z - prevZ;
            train.prevX = train.mesh.position.x;
            train.prevZ = train.mesh.position.z;
        }
    }

    setColliderBoxCenter(collider, x, y, z, width, height, depth) {
        if (!collider) return;
        collider.min.set(x - width / 2, y - height / 2, z - depth / 2);
        collider.max.set(x + width / 2, y + height / 2, z + depth / 2);
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

    addColliderBox(center, width, height, depth, walkable = true, enabled = true, dynamic = false) {
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
        const box = { min, max, walkable, enabled, dynamic };
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
        return Array.from({ length: this.gridHeight }, () => Array(this.gridWidth).fill(0));
    }

    getBiomeHeight(biome, n) {
        let min = 0.0;
        let max = 0.8;
        if (biome === 'forest') { min = 0.2; max = 1.0; }
        else if (biome === 'jungle') { min = 0.4; max = 1.4; }
        else if (biome === 'plains') { min = 0.1; max = 0.9; }
        else if (biome === 'savanna') { min = 0.1; max = 0.8; }
        else if (biome === 'swamp') { min = 0.2; max = 1.0; }
        else if (biome === 'taiga') { min = 0.25; max = 1.0; }
        else if (biome === 'rock') { min = 0.6; max = 1.8; }
        else if (biome === 'mesa') { min = 0.4; max = 1.3; }
        else if (biome === 'sand') { min = 0.0; max = 0.6; }
        else if (biome === 'snow') { min = 0.3; max = 1.1; }
        else if (biome === 'ice') { min = 0.2; max = 0.9; }
        else if (biome === 'lava') { min = 0.1; max = 0.7; }
        else if (biome === 'tundra') { min = 0.2; max = 0.85; }
        else if (biome === 'redwood') { min = 0.35; max = 1.2; }
        else if (biome === 'badlands') { min = 0.35; max = 1.25; }
        else if (biome === 'volcanic') { min = 0.4; max = 1.4; }
        else if (biome === 'mushroom') { min = 0.25; max = 0.95; }
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
        const n = this.hashNoise(gx / 7, gy / 7, 1);
        return Math.floor(n * 3) % 3;
    }

    getBiomeVariantColor(biome, variant) {
        const palettes = {
            grass: [0x5ea85e, 0x4f9752, 0x6db864],
            jungle: [0x3f9a4a, 0x2f8b3f, 0x4ead57],
            swamp: [0x3e7a55, 0x356e4c, 0x4b8a62],
            ash: [0x6b5a52, 0x5c4b45, 0x7c6a61],
            snow: [0xd8edf8, 0xc9e1ee, 0xe6f5ff],
            sand: [0xe1c77d, 0xd5b96d, 0xefd48c],
            mesa: [0xb58a73, 0xa87a62, 0xc5977f]
        };
        const arr = palettes[biome] || palettes.grass;
        return arr[Math.max(0, Math.min(arr.length - 1, variant))];
    }

    getBiomeVisualTheme(biome) {
        const b = (biome || "").toLowerCase();
        if (["jungle", "redwood"].includes(b)) return "jungle";
        if (["swamp", "mushroom"].includes(b)) return "swamp";
        if (["lava", "volcanic", "badlands"].includes(b)) return "ash";
        if (["snow", "ice", "tundra", "taiga"].includes(b)) return "snow";
        if (["sand", "savanna"].includes(b)) return "sand";
        if (["rock", "mesa"].includes(b)) return "mesa";
        return "grass";
    }

    getHeightAt(x, z) {
        if (!this.heightMap) return 0.4;
        const grid = this.worldToGrid(x, z);
        const gx = Math.max(0, Math.min(this.gridWidth - 1, grid.x));
        const gy = Math.max(0, Math.min(this.gridHeight - 1, grid.y));
        const base = this.heightMap?.[gy]?.[gx] ?? 0;
        return base + 0.4;
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

    getColliders() {
        return this.colliders;
    }

    getSpawnPads() {
        return this.spawnPads.map(pos => pos.clone());
    }

    getChestSpots() {
        return this.chestSpots.map(pos => ({ x: pos.x, z: pos.z, grade: pos.grade || 'house' }));
    }

    getHouseSpots() {
        return this.houseSpots.map(pos => ({ x: pos.x, z: pos.z, width: pos.width, depth: pos.depth, height: pos.height }));
    }

    getHangarSpots() {
        return this.hangarSpots.map(pos => ({ x: pos.x, z: pos.z, width: pos.width, depth: pos.depth, height: pos.height }));
    }

    getStructureAtPoint(x, z, margin = 0.2) {
        for (const house of this.houseSpots || []) {
            if (this.isPointInsideStructure(x, z, house, 'house', margin)) {
                return { structure: house, type: 'house' };
            }
        }
        for (const hangar of this.hangarSpots || []) {
            if (this.isPointInsideStructure(x, z, hangar, 'hangar', margin)) {
                return { structure: hangar, type: 'hangar' };
            }
        }
        return null;
    }

    getStructureEntryPoint(structure, type = 'house', fromPosition = null) {
        if (!structure) return null;
        const w = structure.width || (type === 'hangar' ? 58 : 9);
        const d = structure.depth || (type === 'hangar' ? 36 : 8);
        const candidates = [];

        // Main front door
        candidates.push({ x: structure.x, z: structure.z + d * 0.58 });
        // Massive hangars have a second rear opening
        if (type === 'hangar') {
            candidates.push({ x: structure.x, z: structure.z - d * 0.58 });
        }
        // Side fallback points near corners
        candidates.push({ x: structure.x - w * 0.54, z: structure.z + d * 0.2 });
        candidates.push({ x: structure.x + w * 0.54, z: structure.z + d * 0.2 });

        let best = null;
        let bestScore = Infinity;
        for (const p of candidates) {
            let point = p;
            if (!this.isWalkableAt(point.x, point.z) || !this.isChestClear(point.x, point.z, 0.9, true)) {
                const fallback = this.findClearPointAround(point.x, point.z, 0.9, 0.3, 4.5);
                if (!fallback) continue;
                point = fallback;
            }
            const score = fromPosition
                ? Math.hypot(point.x - fromPosition.x, point.z - fromPosition.z)
                : 0;
            if (score < bestScore) {
                bestScore = score;
                best = point;
            }
        }
        return best ? { x: best.x, z: best.z } : null;
    }

    getRailLayout() {
        return (this.railLayout || []).map(route => ({
            axis: route.axis,
            offset: route.offset,
            halfWidth: route.halfWidth
        }));
    }

    getTrainCarsSnapshot() {
        return (this.trainCars || []).map(car => ({
            x: car.mesh?.position?.x ?? 0,
            y: car.mesh?.position?.y ?? 0,
            z: car.mesh?.position?.z ?? 0,
            axis: car.route?.axis || 'x',
            direction: car.direction || 1,
            speed: car.speed || 0,
            length: car.carLength || 0,
            width: car.carWidth || 0,
            dx: car.deltaX || 0,
            dz: car.deltaZ || 0,
            topY: (car.mesh?.position?.y ?? 0) + (car.carHeight || 0) * 0.5 + 0.08
        }));
    }

    getTrainSupportAt(position, entityHeight = 1.8) {
        if (!this.trainCars?.length) return null;
        const feetY = position.y - entityHeight;
        for (const car of this.trainCars) {
            const axisX = car.route.axis === 'x';
            const centerX = car.mesh.position.x;
            const centerZ = car.mesh.position.z;
            const halfL = (car.carLength || 14.2) * 0.48;
            const halfW = (car.carWidth || 4.8) * 0.48;
            const along = axisX ? Math.abs(position.x - centerX) : Math.abs(position.z - centerZ);
            const across = axisX ? Math.abs(position.z - centerZ) : Math.abs(position.x - centerX);
            const topY = car.mesh.position.y + car.carHeight * 0.5 + 0.08;
            if (along > halfL || across > halfW) continue;
            if (Math.abs(feetY - topY) > 0.45) continue;
            return {
                dx: car.deltaX || 0,
                dz: car.deltaZ || 0,
                topY
            };
        }
        return null;
    }

    getFloorTiles() {
        return (this.floorTiles || []).map(tile => ({ x: tile.x, z: tile.z, biome: tile.biome, y: tile.y }));
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

    getFogZones() {
        return (this.fogZones || []).map(z => ({ ...z }));
    }

    updatePropVisibility(playerPos) {
        if (!playerPos) return;
        const smallDistSq = 120 * 120;
        const leafDistSq = 150 * 150;
        for (const mesh of this.smallPropMeshes) {
            const center = mesh.userData.center || new THREE.Vector3();
            const dx = center.x - playerPos.x;
            const dz = center.z - playerPos.z;
            mesh.visible = (dx * dx + dz * dz) < smallDistSq;
        }
        for (const mesh of this.leafMeshes) {
            const center = mesh.userData.center || new THREE.Vector3();
            const dx = center.x - playerPos.x;
            const dz = center.z - playerPos.z;
            mesh.visible = (dx * dx + dz * dz) < leafDistSq;
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

    isChestClear(x, z, radius = 1.2, ignoreWalkable = false) {
        const y = this.getSurfaceHeightAt(x, z) + 0.35;
        const min = new THREE.Vector3(x - radius, y - 0.4, z - radius);
        const max = new THREE.Vector3(x + radius, y + 0.4, z + radius);
        for (const box of this.colliders) {
            if (box.enabled === false) continue;
            if (ignoreWalkable && box.walkable) continue;
            if (max.x < box.min.x || min.x > box.max.x) continue;
            if (max.z < box.min.z || min.z > box.max.z) continue;
            if (max.y < box.min.y || min.y > box.max.y) continue;
            return false;
        }
        return true;
    }

    isPointInsideStructure(x, z, structure, type = 'house', margin = 0) {
        if (!structure) return false;
        const width = structure.width || (type === 'hangar' ? 24 : 8);
        const depth = structure.depth || (type === 'hangar' ? 18 : 8);
        const halfW = width * 0.5 - margin;
        const halfD = depth * 0.5 - margin;
        return Math.abs(x - structure.x) <= halfW && Math.abs(z - structure.z) <= halfD;
    }

    isPatchOverlappingStructure(x, z, width, depth, margin = 0) {
        const halfW = width * 0.5 + margin;
        const halfD = depth * 0.5 + margin;
        const overlap = (s, type = 'house') => {
            const sw = (s.width || (type === 'hangar' ? 24 : 8)) * 0.5 + margin;
            const sd = (s.depth || (type === 'hangar' ? 18 : 8)) * 0.5 + margin;
            return Math.abs(x - s.x) <= (halfW + sw) && Math.abs(z - s.z) <= (halfD + sd);
        };
        for (const h of this.houseSpots || []) {
            if (overlap(h, 'house')) return true;
        }
        for (const h of this.hangarSpots || []) {
            if (overlap(h, 'hangar')) return true;
        }
        return false;
    }

    isWalkableAt(x, z) {
        const grid = this.worldToGrid(x, z);
        const tile = this.grid?.[grid.y]?.[grid.x];
        return tile && tile.type === "floor";
    }

    isUnderStructureRoof(position, structure, type = 'house') {
        if (!position || !structure) return false;
        const halfW = Math.max(2, (structure.width || (type === 'hangar' ? 24 : 10)) * 0.44);
        const halfD = Math.max(2, (structure.depth || (type === 'hangar' ? 18 : 8)) * 0.44);
        if (Math.abs(position.x - structure.x) > halfW) return false;
        if (Math.abs(position.z - structure.z) > halfD) return false;
        const roofBaseY = this.getHeightAt(structure.x, structure.z) + (structure.height || (type === 'hangar' ? 16 : 5));
        return position.y <= roofBaseY + 1.2;
    }

    isShelteredFromRain(position) {
        if (!position) return false;
        for (const house of this.houseSpots || []) {
            if (this.isUnderStructureRoof(position, house, 'house')) return true;
        }
        for (const hangar of this.hangarSpots || []) {
            if (this.isUnderStructureRoof(position, hangar, 'hangar')) return true;
        }
        return false;
    }

    isLavaAt(x, z) {
        return this.lavaPatches.some(patch =>
            Math.abs(x - patch.x) <= patch.width / 2 &&
            Math.abs(z - patch.z) <= patch.depth / 2
        );
    }

    findClearPointAround(cx, cz, colliderRadius = 0.8, startRadius = 0.6, maxRadius = 6.5) {
        for (let r = startRadius; r <= maxRadius; r += 0.7) {
            const steps = 8 + Math.floor(r * 8);
            for (let i = 0; i < steps; i++) {
                const a = (i / steps) * Math.PI * 2;
                const x = cx + Math.cos(a) * r;
                const z = cz + Math.sin(a) * r;
                if (!this.isWalkableAt(x, z)) continue;
                if (!this.isChestClear(x, z, colliderRadius)) continue;
                return { x, z };
            }
        }
        if (this.isWalkableAt(cx, cz) && this.isChestClear(cx, cz, colliderRadius)) return { x: cx, z: cz };
        return null;
    }

    findStructureGuardPoint(structure, type = 'house') {
        if (!structure) return null;
        const width = structure.width || (type === 'hangar' ? 20 : 8);
        const depth = structure.depth || (type === 'hangar' ? 16 : 8);
        const guardRadius = Math.max(1.0, type === 'hangar' ? 1.1 : 0.8);
        const base = Math.max(width, depth) * 0.5 + (type === 'hangar' ? 5.5 : 3.4);
        for (let ring = 0; ring < 5; ring++) {
            const r = base + ring * 1.8;
            const steps = 12 + ring * 6;
            for (let i = 0; i < steps; i++) {
                const a = (i / steps) * Math.PI * 2;
                const x = structure.x + Math.cos(a) * r;
                const z = structure.z + Math.sin(a) * r;
                if (!this.isWalkableAt(x, z)) continue;
                if (!this.isChestClear(x, z, guardRadius)) continue;
                return { x, z };
            }
        }
        return this.findClearPointAround(structure.x, structure.z, guardRadius, base, base + 8);
    }

    findStructureInteriorPoint(structure, type = 'house', padding = 1.2, attempts = 28) {
        if (!structure) return null;
        const width = structure.width || (type === 'hangar' ? 20 : 8);
        const depth = structure.depth || (type === 'hangar' ? 16 : 8);
        const halfW = Math.max(1.2, width * 0.5 - padding);
        const halfD = Math.max(1.2, depth * 0.5 - padding);
        const radius = type === 'hangar' ? 1.0 : 0.85;
        for (let i = 0; i < attempts; i++) {
            const x = structure.x + (Math.random() * 2 - 1) * halfW;
            const z = structure.z + (Math.random() * 2 - 1) * halfD;
            if (!this.isWalkableAt(x, z)) continue;
            if (!this.isChestClear(x, z, radius, true)) continue;
            return { x, z };
        }
        const cx = structure.x;
        const cz = structure.z;
        if (this.isWalkableAt(cx, cz) && this.isChestClear(cx, cz, radius, true)) {
            return { x: cx, z: cz };
        }
        return null;
    }

    buildTreeHouses(candidates, rand, placed) {
        const count = 6;
        let created = 0;
        const canPlace = (x, z, minDist) => !placed.some(p => Math.hypot(p.x - x, p.z - z) < minDist);
        for (const tile of candidates) {
            if (created >= count) break;
            if (this.isNearRailCorridor(tile.x, tile.z, 12)) continue;
            if (!canPlace(tile.x, tile.z, 34)) continue;
            if (!this.isChestClear(tile.x, tile.z, 5)) continue;

            const group = new THREE.Group();
            group.userData.mapGenerated = true;
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.9, flatShading: true });
            const woodMat = new THREE.MeshStandardMaterial({ color: 0x9b7a5a, roughness: 0.86, flatShading: true });
            const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d3a, roughness: 0.9, flatShading: true });
            const x = tile.x;
            const z = tile.z;
            const baseY = this.getHeightAt(x, z);

            const trunk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 13.0, 2.4), trunkMat);
            trunk.position.set(x, baseY + 6.5, z);
            trunk.userData.mapGenerated = true;
            group.add(trunk);
            this.addColliderBox(new THREE.Vector3(x, baseY + 6.5, z), 2.4, 13.0, 2.4, false);

            const platform = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.45, 8.4), woodMat);
            platform.position.set(x, baseY + 8.6, z);
            platform.userData.mapGenerated = true;
            group.add(platform);
            this.addColliderBox(platform.position.clone(), 8.4, 0.45, 8.4, true);

            const hut = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.2, 4.8), woodMat);
            hut.position.set(x, baseY + 10.4, z);
            hut.userData.mapGenerated = true;
            group.add(hut);

            const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 2.8, 4), new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.85, flatShading: true }));
            roof.position.set(x, baseY + 12.8, z);
            roof.rotation.y = Math.PI / 4;
            roof.userData.mapGenerated = true;
            group.add(roof);

            const ladderZ = z - 3.0;
            const ladderStart = new THREE.Vector3(x + 9.6, baseY + 0.4, ladderZ);
            const ladderEnd = new THREE.Vector3(x + 1.4, baseY + 8.5, ladderZ);
            const rampSteps = 20;
            for (let s = 0; s < rampSteps; s++) {
                const t = s / Math.max(1, rampSteps - 1);
                const stepPos = ladderStart.clone().lerp(ladderEnd, t);
                const slab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.36, 2.0), woodMat);
                slab.position.copy(stepPos);
                slab.userData.mapGenerated = true;
                group.add(slab);
                this.addColliderBox(slab.position.clone(), 1.5, 0.36, 2.0, true);
            }

            const rungCount = 10;
            for (let s = 0; s < rungCount; s++) {
                const t = s / Math.max(1, rungCount - 1);
                const stepPos = ladderStart.clone().lerp(ladderEnd, t);
                const rung = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.22), trunkMat);
                rung.position.copy(stepPos);
                rung.position.z += 1.02;
                rung.userData.mapGenerated = true;
                group.add(rung);
            }

            const topLanding = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 2.2), woodMat);
            topLanding.position.set(x + 1.1, baseY + 8.72, ladderZ);
            topLanding.userData.mapGenerated = true;
            group.add(topLanding);
            this.addColliderBox(topLanding.position.clone(), 3.2, 0.2, 2.2, true);

            const canopy = new THREE.Mesh(new THREE.BoxGeometry(11.5, 4.8, 11.5), leafMat);
            canopy.position.set(x, baseY + 14.4, z);
            canopy.userData.mapGenerated = true;
            group.add(canopy);

            this.scene.add(group);
            this.houseSpots.push({ x, z, width: 7.8, depth: 7.8, height: 5.8, style: "treehouse" });
            placed.push({ x, z });
            created += 1;
        }
    }

    buildTallGrass(points) {
        if (!points?.length) return;
        const geo = new THREE.BoxGeometry(0.45, 1, 0.45);
        const mat = new THREE.MeshStandardMaterial({ color: 0x4fa34a, roughness: 0.95, flatShading: true });
        const inst = new THREE.InstancedMesh(geo, mat, points.length);
        const matrix = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const rot = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        let cx = 0;
        let cz = 0;
        points.forEach((p, i) => {
            cx += p.x;
            cz += p.z;
            const h = Math.max(2.6, p.h);
            pos.set(p.x, this.getHeightAt(p.x, p.z) + h / 2, p.z);
            scale.set(1, h, 1);
            matrix.compose(pos, rot, scale);
            inst.setMatrixAt(i, matrix);
        });
        inst.userData.mapGenerated = true;
        inst.userData.center = new THREE.Vector3(cx / points.length, 0, cz / points.length);
        this.scene.add(inst);
        this.smallPropMeshes.push(inst);
    }
}
