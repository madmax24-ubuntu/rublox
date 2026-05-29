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
        this.poiZones = [];
        this.propMeshes = [];
        this.leafMeshes = [];
        this.smallPropMeshes = [];
        this.snowDrift = null;
        this.biomeColors = {};
        this.heightMap = null;
        this.dynamicColliders = false;
        this.surfaceTheme = "plains";
        this.lavaPatches = [];
        this.waterPatches = [];
        this.slowZones = [];
        this.explosiveBarrelSpots = [];
        this.verticalCoverSpots = [];
        this.fogZones = [];
        this.cornucopiaGroup = null;
        this.cornucopiaDestroyed = false;
        this.useStaticBiomeLayer = false;
        this.biomeLayerMesh = null;
        this.biomeLayerTexture = null;
        this._wetMaterialState = new WeakMap();
        this._nightEmissiveState = new WeakMap();
        this.spawnCourtyardRadius = 40;
        this.biomeSectors = this.getBiomeSectorsByMapSize(256);
        this._tmpMatrix = new THREE.Matrix4();
        this._tmpPos = new THREE.Vector3();
        this._tmpQuat = new THREE.Quaternion();
        this._tmpScale = new THREE.Vector3(1, 1, 1);
        this._zeroCenter = new THREE.Vector3(0, 0, 0);
        this._groundRaycaster = new THREE.Raycaster();
        this._groundRayDir = new THREE.Vector3(0, -1, 0);
        this.mapObjectsCollection = null;
        this.mapObjects = [];
        this.spawnBounds = [];
        this.climbables = [];
        this.rainPuddles = [];
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

        // Детерминированный seed для воспроизводимой карты
        this.seed = 42;
        this.biomeColors = this.generateBiomePalette();
        this._generatePromise = this.generate();
    }

    startGeneration() {
        // Generation already started in constructor
        return this._generatePromise;
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
            mushroom: 0x7b4a9a,
            wasteland: 0x9b8d7c,
            industrial: 0x7b8790
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
            const hsl = { h: 0.5, s: 0.5, l: 0.5 };
            c.getHSL(hsl);
            hsl.h = (hsl.h + (rand() - 0.5) * 0.08 + 1) % 1;
            hsl.s = Math.min(1, Math.max(0.35, hsl.s + (rand() - 0.5) * 0.15));
            hsl.l = Math.min(0.85, Math.max(0.2, hsl.l + (rand() - 0.5) * 0.12));
            const out = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
            palette[key] = out.getHex();
        });
        return palette;
    }

    async generate() {
        const sizeBase = 151;
        this.biomeSectors = this.getBiomeSectorsByMapSize(sizeBase);
        const width = sizeBase;
        const height = sizeBase;
        const data = this.tileGen.generate(width, height, this.seed);
        this.grid = data.grid;
        this.gridWidth = data.width;
        this.gridHeight = data.height;
        this.size = Math.max(this.gridWidth, this.gridHeight) * this.tileSize;
        this.halfSize = this.size / 2;
        this.playerSpawn = data.playerSpawn;
        this.decorateBiomeTiles();
        this.heightMap = this.buildHeightMap();

        this.clearSpawnZone();
        this.buildMeshes();
        // this.generateDioramaMap(); // Stub — not needed for old map
        this.buildExplosiveBarrelSpots();
        this.buildSpawnPads();
        this.buildStoryPOIs();
        this.buildChests();

        // Resolve the promise when generation is complete
        await null; // Yield to allow async operations
    }

    // Декорация леса
    decorateForest(center, arenaRadius, data) {
        const { trees, houses, river } = data;

        // Деревья
        const trunkGeo = new THREE.BoxGeometry(2.1, 20, 2.1);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9, flatShading: true });
        const leafGeo = new THREE.BoxGeometry(8.4, 7.2, 8.4);
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.96, flatShading: true });

        trees.forEach(t => {
            const y = this.getHeightAt(t.x, t.z);
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.set(t.x, y + 10, t.z);
            this.addToMapObjects(trunk);

            const leaf = new THREE.Mesh(leafGeo, leafMat);
            leaf.position.set(t.x, y + 18, t.z);
            this.addToMapObjects(leaf);
        });

        // Река
        river.forEach(seg => {
            const y = this.getHeightAt(seg.x1, seg.z1);
            const waterGeo = new THREE.PlaneGeometry(12, 8);
            const waterMat = new THREE.MeshStandardMaterial({
                color: 0x4fc3ff,
                transparent: true,
                opacity: 0.8,
                roughness: 0.2
            });
            const water = new THREE.Mesh(waterGeo, waterMat);
            water.rotation.x = -Math.PI / 2;
            water.position.set((seg.x1 + seg.x2) / 2, y + 0.2, (seg.z1 + seg.z2) / 2);
            this.addToMapObjects(water);
        });

        // Домики
        houses.forEach(h => {
            const group = new THREE.Group();
            const wallMat = new THREE.MeshStandardMaterial({ color: 0xc9b08d, roughness: 0.9, flatShading: true });
            const roofMat = new THREE.MeshStandardMaterial({ color: 0x5f4638, roughness: 0.82, flatShading: true });
            this.addOpenBuildingShell(group, new THREE.Vector3(h.x, 0, h.z), {
                width: h.width,
                depth: h.depth,
                height: h.height,
                wallColor: 0xc9b08d,
                roofColor: 0x5f4638,
                doorWidth: 2.4
            });
            this.addToMapObjects(group);
        });
    }

    // Декорация лабиринта
    decorateFortress(center, arenaRadius, data) {
        const { walls, decorations } = data;
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x8f8575, roughness: 0.9, flatShading: true });

        walls.forEach(w => {
            const y = this.getHeightAt(w.x, w.z);
            const wall = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), wallMat);
            wall.position.set(w.x, y + w.h / 2, w.z);
            this.addToMapObjects(wall);
        });

        // Декор в лабиринте
        decorations.forEach(d => {
            const x = d.x;
            const z = d.z;
            const y = this.getHeightAt(x, z);
            const crate = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
            crate.position.set(x, y + 0.75, z);
            this.addToMapObjects(crate);
        });
    }

    // Декорация арктики
    decorateArctic(center, arenaRadius, data) {
        const { snow, igloos, crystals } = data;

        // Сугробы
        const snowGeo = new THREE.ConeGeometry(4, 6, 8);
        const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
        snow.forEach(s => {
            const y = this.getHeightAt(s.x, s.z);
            const snowMound = new THREE.Mesh(snowGeo, snowMat);
            snowMound.position.set(s.x, y + 3, s.z);
            this.addToMapObjects(snowMound);
        });

        // Иглу
        const iglooGeo = new THREE.CylinderGeometry(3, 4, 3, 8);
        const iglooMat = new THREE.MeshStandardMaterial({ color: 0xbce6ff, roughness: 0.3, flatShading: true });
        igloos.forEach(i => {
            const y = this.getHeightAt(i.x, i.z);
            const igloo = new THREE.Mesh(iglooGeo, iglooMat);
            igloo.position.set(i.x, y + 1.5, i.z);
            this.addToMapObjects(igloo);
        });

        // Кристаллы
        const crystalGeo = new THREE.IcosahedronGeometry(2, 0);
        const crystalMat = new THREE.MeshStandardMaterial({ color: 0x9bf, roughness: 0.4, metalness: 0.3, flatShading: true });
        crystals.forEach(c => {
            const y = this.getHeightAt(c.x, c.z);
            const crystal = new THREE.Mesh(crystalGeo, crystalMat);
            crystal.position.set(c.x, y + 2, c.z);
            this.addToMapObjects(crystal);
        });
    }

    // Декорация руин
    decorateWar(center, arenaRadius, data) {
        const { ruins, tanks, barriers } = data;

        // Руины
        const ruinMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.9, flatShading: true });
        ruins.forEach(r => {
            const group = new THREE.Group();
            const wall = new THREE.Mesh(new THREE.BoxGeometry(r.width, r.height, r.depth), ruinMat);
            wall.position.set(0, r.height / 2, 0);
            group.add(wall);
            // Разрушения
            const rubble = new THREE.Mesh(new THREE.BoxGeometry(r.width * 0.6, r.height * 0.4, r.depth * 0.6), new THREE.MeshStandardMaterial({ color: 0x3a3a3a }));
            rubble.position.set(0, r.height * 0.2, 0);
            group.add(rubble);
            this.addToMapObjects(group);
        });

        // Танки
        const tankGeo = new THREE.BoxGeometry(10, 4, 3);
        const tankMat = new THREE.MeshStandardMaterial({ color: 0x4a6b4a, roughness: 0.8, flatShading: true });
        tanks.forEach(t => {
            const y = this.getHeightAt(t.x, t.z);
            const tank = new THREE.Mesh(tankGeo, tankMat);
            tank.position.set(t.x, y + 2, t.z);
            this.addToMapObjects(tank);
        });

        // Баррикады
        const sandbagGeo = new THREE.BoxGeometry(2, 1, 1);
        const sandbagMat = new THREE.MeshStandardMaterial({ color: 0xb39a74, roughness: 0.95, flatShading: true });
        barriers.forEach(b => {
            const y = this.getHeightAt(b.x, b.z);
            const barrier = new THREE.Mesh(sandbagGeo, sandbagMat);
            barrier.position.set(b.x, y + 0.5, b.z);
            this.addToMapObjects(barrier);
        });
    }

    ensureSafetyPlazaGround() {
        const y = (this.getHeightAt?.(0, 0) ?? 0.4) + 0.02;
        const geo = new THREE.CylinderGeometry(42, 42, 0.16, 48);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xc9c9c9,
            roughness: 0.82,
            metalness: 0.03,
            flatShading: true
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, y, 0);
        mesh.userData.mapGenerated = true;
        mesh.userData.walkableSurface = true;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.addColliderBox(new THREE.Vector3(0, y, 0), 84, 0.2, 84, true, true, false, 'BOX');
    }

    pickSurfaceTheme() {
        const themes = ['plains', 'forest', 'sand', 'snow', 'swamp', 'mesa'];
        const index = Math.abs(this.seed || 1) % themes.length;
        return themes[index];
    }

    getBiomeSectorsByMapSize(sizeBase = 256) {
        return [
            { id: "scorched_ruins", name: "Выжженные руины" },
            { id: "swampy_village", name: "Болотная деревня" },
            { id: "frozen_outpost", name: "Ледяной форпост" },
            { id: "dark_forest", name: "Тёмный лес" }
        ];
    }

    decorateBiomeTiles() {
        if (!this.grid?.length) return;
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const tile = this.grid[y]?.[x];
                if (!tile) continue;
                const world = this.toWorld(x, y);
                tile.biome = this.getQuadrantBiomeId(world.x, world.z);
                delete tile.prop;
            }
        }
    }

    clearSpawnZone() {
        if (!this.grid?.length) return;
        const radius = 40;
        for (let gy = 0; gy < this.gridHeight; gy++) {
            for (let gx = 0; gx < this.gridWidth; gx++) {
                const world = this.toWorld(gx, gy);
                if (Math.hypot(world.x, world.z) > radius) continue;
                const tile = this.grid[gy]?.[gx];
                if (!tile) continue;
                tile.type = "floor";
                tile.biome = "plaza_stone";
                delete tile.prop;
            }
        }
    }

    getSpawnWorld() {
        if (!this.playerSpawn) return { x: 0, z: 0 };
        return this.toWorld(this.playerSpawn.x, this.playerSpawn.y);
    }

    isInSpawnCourtyardWorld(x, z, extra = 0) {
        return Math.hypot(x, z) <= 40 + extra;
    }

    // Квадранты карты (500x500):
    // Север (Z>0): Лес с рекой и домиками
    // Восток (X>0, Z<0): Лабиринт из каменных стен
    // Юг (Z<0): Арктика со снегом и кристаллами
    // Запад (X<0): Руины с танками
    getQuadrantBiomeId(x, z) {
        if (Math.hypot(x, z) <= 40) return "plaza_stone";
        if (z > 0) return "forest";           // Север - ЛЕС
        if (x > 0) return "fortress";         // Восток - ЛАБИРИНТ
        if (z < 0) return "arctic";           // Юг - АРКТИКА
        return "warzone";                     // Запад - РУИНЫ
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
        this.poiZones = [];
        this.houseSpots = [];
        this.hangarSpots = [];
        this.dynamicColliders = false;
        this.lavaPatches = [];
        this.waterPatches = [];
        this.slowZones = [];
        this.explosiveBarrelSpots = [];
        this.verticalCoverSpots = [];
        this.fogZones = [];
        this.mapObjects = [];
        this.spawnBounds = [];
        this.climbables = [];
        this.rainPuddles = [];
        this.mapObjectsCollection = new THREE.Group();
        this.mapObjectsCollection.name = "MapObjects";
        this.mapObjectsCollection.userData.mapGenerated = true;
        this.mapObjectsCollection.userData.enabled = true;
        this.mapObjectsCollection.visible = true;
        this.scene.add(this.mapObjectsCollection);
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
            const biome = tile.biome || this.getQuadrantBiomeId(world.x, world.z);
            const key = `${biome}:0`;
            if (!floorsByBiome.has(key)) floorsByBiome.set(key, []);
            floorsByBiome.get(key).push({ x: world.x, z: world.z, gx, gy, variant: 0, biome });
            this.floorTiles.push({ x: world.x, z: world.z, gx, gy, biome, y: tileHeight });
            if (Math.hypot(world.x - spawnWorld.x, world.z - spawnWorld.z) <= this.spawnCourtyardRadius) {
                return;
            }
        };

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const tile = this.grid[y][x];
                const world = this.toWorld(x, y);
                const tileHeight = this.heightMap?.[y]?.[x] ?? 0;
                if (tile.type === "wall") {
                    const isBoundary = x === 0 || y === 0 || x === this.gridWidth - 1 || y === this.gridHeight - 1;
                    // Keep only outer border walls; inner stone blocks are converted to usable floor.
                    const keepWall = isBoundary;
                    if (keepWall) {
                        walls.push({ x: world.x, z: world.z, y: tileHeight });
                        this.addColliderBox(new THREE.Vector3(world.x, tileHeight + this.wallHeight / 2, world.z), this.tileSize, this.wallHeight, this.tileSize, false);
                    } else {
                        tile.type = 'floor';
                        const world = this.toWorld(x, y);
                tile.biome = this.getQuadrantBiomeId(world.x, world.z);
                        addFloorTile(tile, world, tileHeight, x, y);
                    }
                } else {
                    addFloorTile(tile, world, tileHeight, x, y);
                }
            }
        }

        if (this.useStaticBiomeLayer) {
            this.buildStaticBiomeLayer();
        } else {
            floorsByBiome.forEach((floors, key) => {
                const [biomeKey] = key.split(":");
                let color = 0xbfbfbf;
                if (biomeKey === "scorched_ruins") color = 0xedc9af;
                else if (biomeKey === "swampy_village") color = 0x2d5a27;
                else if (biomeKey === "frozen_outpost") color = 0xffffff;
                else if (biomeKey === "dark_forest") color = 0x0b3d0b;
                else if (biomeKey === "plaza_stone") color = 0xc9c9c9;
                const floorMat = new THREE.MeshBasicMaterial({
                    color
                });
                floorMat.polygonOffset = true;
                floorMat.polygonOffsetFactor = -1;
                floorMat.polygonOffsetUnits = -1;
                const inst = new THREE.InstancedMesh(floorGeo, floorMat, floors.length);
                const matrix = new THREE.Matrix4();
                const position = new THREE.Vector3();
                const rotation = new THREE.Quaternion();
                const scale = new THREE.Vector3(1, 1, 1);
                floors.forEach((f, i) => {
                    const h = this.heightMap?.[f.gy]?.[f.gx] ?? 0;
                    position.set(f.x, h + 0.205, f.z);
                    matrix.compose(position, rotation, scale);
                    inst.setMatrixAt(i, matrix);
                });
                inst.userData.mapGenerated = true;
                inst.userData.walkableSurface = true;
                inst.frustumCulled = false;
                this.scene.add(inst);
            });
        }

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
            inst.userData.walkableSurface = false;
            inst.frustumCulled = false;
            this.scene.add(inst);
            this.wallMesh = inst;
        }

        this.buildQuadrantGroundPlanes();
        this.buildQuadrantBiomeWorld();
        const debugLandmark = new THREE.Mesh(
            new THREE.BoxGeometry(12, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: true, transparent: false, opacity: 1 })
        );
        debugLandmark.position.set(0, 6, 0);
        debugLandmark.userData.mapGenerated = true;
        debugLandmark.userData.biomeId = 'debug_landmark';
        debugLandmark.frustumCulled = false;
        this.addToMapObjects(debugLandmark);
        this.applyStaticPhysicsToGenerated();
    }

    addToMapObjects(obj) {
        if (!obj) return;
        obj.userData = obj.userData || {};
        obj.userData.mapGenerated = true;
        obj.userData.physicsType = 'STATIC';
        obj.userData.useCollisionBounds = true;
        if (!obj.userData.collisionBounds) obj.userData.collisionBounds = 'BOX';
        obj.frustumCulled = false;
        obj.renderOrder = 1;
        obj.traverse?.((child) => {
            child.frustumCulled = false;
            child.renderOrder = 1;
            if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (let i = 0; i < mats.length; i++) {
                    const m = mats[i];
                    if (!m) continue;
                    m.transparent = false;
                    m.opacity = 1;
                }
            }
        });
        if (this.mapObjectsCollection) this.mapObjectsCollection.add(obj);
        else this.scene.add(obj);
        this.mapObjects.push(obj);
    }

    applyStaticPhysicsToGenerated() {
        this.scene.traverse((obj) => {
            if (!obj?.userData?.mapGenerated) return;
            obj.userData.physicsType = 'STATIC';
            obj.userData.useCollisionBounds = true;
            obj.frustumCulled = false;
            if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (let i = 0; i < mats.length; i++) {
                    const m = mats[i];
                    if (!m) continue;
                    m.transparent = false;
                    m.opacity = 1;
                }
            }
            if (!obj.userData.collisionBounds) {
                obj.userData.collisionBounds = obj.userData.rockLike ? 'CONVEX_HULL' : (obj.userData.architecture ? 'MESH' : 'BOX');
            }
            obj.updateMatrixWorld(true);
        });
    }

    buildQuadrantGroundPlanes() {
        const radius = Math.min(300, this.halfSize - 4);
        const half = radius * 0.5;
        const planeGeo = new THREE.PlaneGeometry(radius, radius);
        const quadrants = [
            { x: half, z: half, color: 0xff2a2a },
            { x: -half, z: half, color: 0x2aff2a },
            { x: -half, z: -half, color: 0x2a6dff },
            { x: half, z: -half, color: 0xffffff }
        ];
        for (let i = 0; i < quadrants.length; i++) {
            const q = quadrants[i];
            const mesh = new THREE.Mesh(
                planeGeo,
                new THREE.MeshBasicMaterial({ color: q.color, depthTest: true, transparent: false, opacity: 1, side: THREE.DoubleSide })
            );
            mesh.rotation.x = -Math.PI * 0.5;
            mesh.position.set(q.x, 0.012, q.z);
            mesh.frustumCulled = false;
            mesh.renderOrder = 1;
            mesh.userData.mapGenerated = true;
            mesh.userData.walkableSurface = true;
            this.addToMapObjects(mesh);
        }
    }

    buildQuadrantBiomeWorld() {
        const rand = (() => {
            let state = (this.seed ^ 0x51f1aa17) >>> 0;
            return () => {
                state = (state * 1664525 + 1013904223) >>> 0;
                return state / 0x100000000;
            };
        })();
        const isFree = (x, z, d = 6) => !this.spawnBounds.some((b) => Math.hypot(b.x - x, b.z - z) < d);
        const keep = (x, z, w, d) => this.registerSpawnBounds(x, z, w, d, 0.35);
        const inPlaza = (x, z, pad = 0) => Math.hypot(x, z) <= (40 + pad);
        const sample = (minR, maxR, quad) => {
            for (let i = 0; i < 200; i++) {
                const a0 = quad === 1 ? 0 : quad === 2 ? Math.PI * 0.5 : quad === 3 ? Math.PI : Math.PI * 1.5;
                const a = a0 + rand() * Math.PI * 0.5;
                const r = minR + rand() * (maxR - minR);
                const x = Math.cos(a) * r;
                const z = Math.sin(a) * r;
                if (!this.isInsideTerrainBounds(x, z, 5)) continue;
                if (inPlaza(x, z, 4)) continue;
                return { x, z };
            }
            return null;
        };
        const placeBox = (x, z, w, h, d, mat, ry = 0, walkable = false, boundsType = 'BOX', biomeId = null) => {
            const y = this.raycastGroundY(x, z, this.getSurfaceHeightAt(x, z), true);
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            m.position.set(x, y + h * 0.5, z);
            m.rotation.y = ry;
            m.userData.mapGenerated = true;
            m.userData.architecture = true;
            if (biomeId) m.userData.biomeId = biomeId;
            this.addToMapObjects(m);
            this.addColliderBox(m.position.clone(), w, h, d, walkable, true, false, boundsType);
            return m;
        };
        const mats = {
            stone: new THREE.MeshStandardMaterial({ color: 0x8f8575, roughness: 0.9, flatShading: true }),
            pillar: new THREE.MeshStandardMaterial({ color: 0xa39a8c, roughness: 0.86, flatShading: true }),
            rust: new THREE.MeshStandardMaterial({ color: 0x6a4f42, roughness: 0.88, flatShading: true }),
            wood: new THREE.MeshStandardMaterial({ color: 0x7d5b3a, roughness: 0.9, flatShading: true }),
            mud: new THREE.MeshStandardMaterial({ color: 0x5f4c3b, roughness: 0.96, flatShading: true }),
            snow: new THREE.MeshStandardMaterial({ color: 0xd7e4ef, roughness: 0.8, flatShading: true }),
            ice: new THREE.MeshStandardMaterial({ color: 0xbce6ff, roughness: 0.25, metalness: 0.05, flatShading: true }),
            bark: new THREE.MeshStandardMaterial({ color: 0x4e3a2c, roughness: 0.95, flatShading: true }),
            leaf: new THREE.MeshStandardMaterial({ color: 0x284728, roughness: 0.96, flatShading: true })
        };
        const densityMul = 1.4;
        const n = (base) => Math.max(1, Math.floor(base * densityMul));
        const biomeSpawnCounts = {
            desert: 0,
            swamp: 0,
            tundra: 0,
            forest: 0
        };

        for (let i = 0; i < n(5); i++) {
            const p = sample(68, 168, 1);
            if (!p) continue;
            const rot = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5][i % 4];
            const len = 6 + ((rand() * 5) | 0);
            for (let s = 0; s < len; s++) {
                const x = p.x + Math.cos(rot) * s * 13;
                const z = p.z + Math.sin(rot) * s * 13;
                if (!isFree(x, z, 7) || !keep(x, z, 8, 14)) continue;
                placeBox(x, z, 2.2, 9.5, 14, mats.stone, rot, false, 'MESH', 'scorched_ruins');
                biomeSpawnCounts.desert++;
            }
        }
        for (let i = 0; i < n(38); i++) {
            const p = sample(80, 286, 1);
            if (!p || !isFree(p.x, p.z, 6)) continue;
            if (rand() < 0.6) {
                if (!keep(p.x, p.z, 2.2, 2.2)) continue;
                const h = 7 + rand() * 5;
                placeBox(p.x, p.z, 2.2, h, 2.2, mats.pillar, 0, false, 'MESH', 'scorched_ruins');
                biomeSpawnCounts.desert++;
            } else {
                if (!keep(p.x, p.z, 4.2, 4.2)) continue;
                const y = this.raycastGroundY(p.x, p.z, this.getSurfaceHeightAt(p.x, p.z), true);
                const o = new THREE.Mesh(new THREE.ConeGeometry(2.1, 8 + rand() * 3, 6), mats.rust);
                o.position.set(p.x, y + 4.2, p.z);
                o.rotation.y = (Math.PI * 0.25) * Math.round(rand() * 3);
                o.userData.mapGenerated = true;
                o.userData.architecture = true;
                o.userData.biomeId = 'scorched_ruins';
                this.addToMapObjects(o);
                this.addColliderBox(new THREE.Vector3(p.x, y + 4.2, p.z), 4.2, 8.8, 4.2, false, true, false, 'CONVEX_HULL');
                biomeSpawnCounts.desert++;
            }
        }

        for (let i = 0; i < n(5); i++) {
            const p = sample(72, 176, 2);
            if (!p) continue;
            const rot = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5][(i + 1) % 4];
            const len = 5 + ((rand() * 5) | 0);
            for (let s = 0; s < len; s++) {
                const x = p.x + Math.cos(rot) * s * 12;
                const z = p.z + Math.sin(rot) * s * 12;
                if (!isFree(x, z, 6) || !keep(x, z, 6.2, 1.1)) continue;
                placeBox(x, z, 6.2, 2.2, 0.45, mats.wood, rot, false, 'MESH', 'swampy_village');
                biomeSpawnCounts.swamp++;
            }
        }
        for (let i = 0; i < n(16); i++) {
            const p = sample(92, 260, 2);
            if (!p || !isFree(p.x, p.z, 14)) continue;
            const w = 9 + rand() * 3;
            const d = 8 + rand() * 3;
            const h = 5 + rand() * 1.8;
            if (!keep(p.x, p.z, w, d)) continue;
            const g = new THREE.Group();
            g.userData.mapGenerated = true;
            g.userData.architecture = true;
            g.userData.biomeId = 'swampy_village';
            this.addOpenBuildingShell(g, new THREE.Vector3(p.x, 0, p.z), { width: w, depth: d, height: h, doorWidth: 2.6, wallColor: 0x9e7d5d, roofColor: 0x5c4332 });
            this.addToMapObjects(g);
            this.houseSpots.push({ x: p.x, z: p.z, width: w, depth: d, height: h, style: "swamp_village" });
            placeBox(p.x, p.z, w * 0.9, 0.25, d * 0.9, mats.mud, 0, true, 'MESH', 'swampy_village');
            biomeSpawnCounts.swamp++;
        }

        for (let i = 0; i < n(12); i++) {
            const p = sample(96, 282, 3);
            if (!p || !isFree(p.x, p.z, 12)) continue;
            if (rand() < 0.65) {
                if (!keep(p.x, p.z, 10, 10)) continue;
                const y = this.raycastGroundY(p.x, p.z, this.getSurfaceHeightAt(p.x, p.z), true);
                const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(4 + rand() * 4, 0), mats.ice);
                rock.position.set(p.x, y + 3.8, p.z);
                rock.userData.mapGenerated = true;
                rock.userData.rockLike = true;
                rock.userData.biomeId = 'frozen_outpost';
                this.addToMapObjects(rock);
                this.addColliderBox(new THREE.Vector3(p.x, y + 3.8, p.z), 9, 7, 9, false, true, false, 'CONVEX_HULL');
                biomeSpawnCounts.tundra++;
            } else if (rand() < 0.85) {
                const w = 10 + rand() * 3;
                const d = 9 + rand() * 2;
                const h = 5 + rand() * 1.2;
                if (!keep(p.x, p.z, w, d)) continue;
                const g = new THREE.Group();
                g.userData.mapGenerated = true;
                g.userData.architecture = true;
                g.userData.biomeId = 'frozen_outpost';
                this.addOpenBuildingShell(g, new THREE.Vector3(p.x, 0, p.z), { width: w, depth: d, height: h, doorWidth: 2.4, wallColor: 0xc8d5df, roofColor: 0x7f8f9b });
                this.addToMapObjects(g);
                this.houseSpots.push({ x: p.x, z: p.z, width: w, depth: d, height: h, style: "snow_hut" });
                biomeSpawnCounts.tundra++;
            } else {
                if (!keep(p.x, p.z, 4, 4)) continue;
                placeBox(p.x, p.z, 1.2, 10.5, 1.2, mats.snow, 0, false, 'MESH', 'frozen_outpost');
                placeBox(p.x, p.z, 4.8, 0.4, 4.8, mats.snow, 0, true, 'MESH', 'frozen_outpost');
                biomeSpawnCounts.tundra += 2;
            }
        }

        for (let i = 0; i < n(54); i++) {
            const p = sample(86, 292, 4);
            if (!p || !isFree(p.x, p.z, 7)) continue;
            if (rand() < 0.7) {
                if (!keep(p.x, p.z, 2.6, 2.6)) continue;
                const h = 20 + rand() * 10;
                placeBox(p.x, p.z, 2.6, h, 2.6, mats.bark, 0, false, 'MESH', 'dark_forest');
                const y = this.raycastGroundY(p.x, p.z, this.getSurfaceHeightAt(p.x, p.z), true);
                const crown = new THREE.Mesh(new THREE.BoxGeometry(7 + rand() * 2.5, 6 + rand() * 2.5, 7 + rand() * 2.5), mats.leaf);
                crown.position.set(p.x, y + h + 1.5, p.z);
                crown.userData.mapGenerated = true;
                crown.userData.biomeId = 'dark_forest';
                this.addToMapObjects(crown);
                biomeSpawnCounts.forest += 2;
            } else {
                if (!keep(p.x, p.z, 6, 2.2)) continue;
                placeBox(p.x, p.z, 6, 1.2, 2.2, mats.bark, rand() * Math.PI * 2, false, 'MESH', 'dark_forest');
                biomeSpawnCounts.forest++;
            }
        }

        for (let i = 0; i < n(2); i++) {
            const p = sample(228, 286, 1);
            if (!p || !isFree(p.x, p.z, 46)) continue;
            const w = 54 + rand() * 10;
            const d = 32 + rand() * 8;
            const h = 16 + rand() * 3;
            if (!keep(p.x, p.z, w, d)) continue;
            const g = new THREE.Group();
            g.userData.mapGenerated = true;
            g.userData.architecture = true;
            g.userData.biomeId = 'scorched_ruins';
            this.addOpenBuildingShell(g, new THREE.Vector3(p.x, 0, p.z), { width: w, depth: d, height: h, doorWidth: 16, wallColor: 0x788690, roofColor: 0x3b4850 });
            this.addToMapObjects(g);
            this.hangarSpots.push({ x: p.x, z: p.z, width: w, depth: d, height: h, style: "scorched_hangar" });
            biomeSpawnCounts.desert++;
        }
        this.validateQuadrantBiomeIsolation();
        console.log("Biome Spawned:", "Desert", "Count:", biomeSpawnCounts.desert);
        console.log("Biome Spawned:", "Swamp", "Count:", biomeSpawnCounts.swamp);
        console.log("Biome Spawned:", "Tundra", "Count:", biomeSpawnCounts.tundra);
        console.log("Biome Spawned:", "Forest", "Count:", biomeSpawnCounts.forest);
    }

    validateQuadrantBiomeIsolation() {
        if (!this.mapObjectsCollection) return;
        const wrong = [];
        for (const obj of this.mapObjectsCollection.children) {
            const biomeId = obj?.userData?.biomeId;
            if (!biomeId) continue;
            const p = obj.position || this._zeroCenter;
            const expected = this.getQuadrantBiomeId(p.x || 0, p.z || 0);
            if (expected !== biomeId) wrong.push(obj);
        }
        for (const obj of wrong) {
            this.mapObjectsCollection.remove(obj);
            if (obj.geometry && !obj.isInstancedMesh) obj.geometry.dispose?.();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach((m) => m?.dispose?.());
                else obj.material.dispose?.();
            }
        }
    }

    generatePlazaRealm() {
        const center = this.getSpawnWorld();
        const listA = ["Bench_SciFi", "Lamp_Post", "Terminal"];
        const benchMat = new THREE.MeshStandardMaterial({ color: 0xb9c3cf, roughness: 0.44, metalness: 0.4, flatShading: true });
        const lampMat = new THREE.MeshStandardMaterial({ color: 0x303742, roughness: 0.55, metalness: 0.62, flatShading: true });
        const neonMat = new THREE.MeshStandardMaterial({ color: 0x67d3ff, emissive: 0x2fb8ff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.2, flatShading: true });
        const marbleMat = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.8, flatShading: true });
        const ringGeo = new THREE.RingGeometry(10, 72, 96);
        const ring = new THREE.Mesh(ringGeo, marbleMat);
        ring.rotation.x = -Math.PI * 0.5;
        ring.position.set(center.x, this.getSurfaceHeightAt(center.x, center.z) + 0.03, center.z);
        ring.userData.mapGenerated = true;
        this.addToMapObjects(ring);
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const x = center.x + Math.cos(a) * 52;
            const z = center.z + Math.sin(a) * 52;
            const y = this.getSurfaceHeightAt(x, z);
            const type = listA[i % listA.length];
            this.spawnBiomeObject(type, 'plaza', x, y, z, benchMat, lampMat, neonMat);
        }
    }

    generateUrbanRealm() {
        const listB = ["Brick_Wall_L", "Ruined_House_A", "Metal_Fence", "Barrel"];
        const brickMat = new THREE.MeshStandardMaterial({ color: 0x7b5e58, roughness: 0.9, flatShading: true });
        const fenceMat = new THREE.MeshStandardMaterial({ color: 0x59636f, roughness: 0.6, metalness: 0.52, flatShading: true });
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x5f646c, roughness: 0.58, metalness: 0.55, flatShading: true });
        const step = 18;
        for (let x = -190; x <= 190; x += step) {
            for (let z = -190; z <= 190; z += step) {
                const d = Math.hypot(x, z);
                if (d < 84 || d > 198) continue;
                if (!this.isInsideTerrainBounds(x, z, 4)) continue;
                if (Math.random() < 0.28) continue;
                const y = this.getSurfaceHeightAt(x, z);
                const type = listB[Math.floor(Math.random() * listB.length)];
                this.spawnBiomeObject(type, 'urban', x, y, z, brickMat, fenceMat, barrelMat);
            }
        }
    }

    generateWildRealm() {
        const listC = ["Dead_Oak", "Mossy_Rock", "Tall_Grass_Cluster", "Log"];
        const barkMat = new THREE.MeshStandardMaterial({ color: 0x5b4332, roughness: 0.92, flatShading: true });
        const mossMat = new THREE.MeshStandardMaterial({ color: 0x526149, roughness: 0.95, flatShading: true });
        const grassMat = new THREE.MeshStandardMaterial({ color: 0x5f8c4a, roughness: 0.98, flatShading: true });
        const clusters = 86;
        for (let i = 0; i < clusters; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 205 + Math.random() * 92;
            const cx = Math.cos(a) * r;
            const cz = Math.sin(a) * r;
            const perCluster = 3 + Math.floor(Math.random() * 6);
            for (let j = 0; j < perCluster; j++) {
                const x = cx + (Math.random() - 0.5) * 14;
                const z = cz + (Math.random() - 0.5) * 14;
                const d = Math.hypot(x, z);
                if (d < 202 || d > 299) continue;
                if (!this.isInsideTerrainBounds(x, z, 4)) continue;
                const y = this.getSurfaceHeightAt(x, z);
                const type = listC[Math.floor(Math.random() * listC.length)];
                this.spawnBiomeObject(type, 'wild', x, y, z, barkMat, mossMat, grassMat);
            }
        }
    }

    buildBiomeBorderStructures() {
        const makeRingWalls = (radius, count, height, thickness, color) => {
            const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.86, flatShading: true });
            for (let i = 0; i < count; i++) {
                const a = (i / count) * Math.PI * 2;
                const x = Math.cos(a) * radius;
                const z = Math.sin(a) * radius;
                const y = this.getSurfaceHeightAt(x, z);
                const seg = new THREE.Mesh(new THREE.BoxGeometry(6.2, height, thickness), mat);
                seg.position.set(x, y + height * 0.5, z);
                seg.rotation.y = -a;
                seg.userData.mapGenerated = true;
                seg.userData.architecture = true;
                seg.geometry.computeVertexNormals();
                this.addToMapObjects(seg);
                this.addColliderBox(seg.position.clone(), 6.2, height, thickness, false, true, false, 'MESH');
            }
        };
        makeRingWalls(80, 96, 6.5, 1.6, 0x6a7079);
        makeRingWalls(200, 128, 8.5, 2.1, 0x4f5a4f);
    }

    spawnBiomeObject(type, realm, x, y, z, matA, matB, matC) {
        const matByRealm = realm === 'plaza' ? 'stone' : (realm === 'urban' ? 'urban' : 'wild');
        const terrainMat = this.getTerrainMaterialAt(x, z);
        if (terrainMat !== matByRealm) {
            if (type === "Dead_Oak" || type === "Mossy_Rock" || type === "Tall_Grass_Cluster" || type === "Log") {
                if (terrainMat === 'stone') {
                    console.error(`[BIOME_ISOLATION] List C object '${type}' spawned in Zone A at (${x.toFixed(1)},${z.toFixed(1)}). Deleting.`);
                }
            }
            return null;
        }
        let mesh = null;
        if (type === "Bench_SciFi") {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 1.2), matA);
            mesh.position.set(x, y + 0.26, z);
            this.addColliderBox(mesh.position.clone(), 3.4, 0.5, 1.2, false, true, false, 'MESH');
        } else if (type === "Lamp_Post") {
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 5.6, 8), matB);
            mesh.position.set(x, y + 2.8, z);
            const glow = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.75), matC);
            glow.position.set(x, y + 5.8, z);
            glow.userData.mapGenerated = true;
            glow.userData.architecture = true;
            this.addToMapObjects(glow);
            this.addColliderBox(mesh.position.clone(), 0.6, 5.6, 0.6, false, true, false, 'MESH');
        } else if (type === "Terminal") {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.8), matB);
            mesh.position.set(x, y + 0.9, z);
            this.addColliderBox(mesh.position.clone(), 1.2, 1.8, 0.8, false, true, false, 'MESH');
        } else if (type === "Brick_Wall_L") {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(8.0, 4.5, 1.0), matA);
            mesh.position.set(x, y + 2.25, z);
            mesh.rotation.y = Math.random() > 0.5 ? 0 : Math.PI * 0.5;
            this.addColliderBox(mesh.position.clone(), 8.0, 4.5, 1.0, false, true, false, 'MESH');
        } else if (type === "Ruined_House_A") {
            const g = new THREE.Group();
            g.userData.mapGenerated = true;
            g.userData.architecture = true;
            const w = 10 + Math.random() * 5;
            const d = 8 + Math.random() * 4;
            const h = 5.4 + Math.random() * 1.8;
            this.addOpenBuildingShell(g, new THREE.Vector3(x, y, z), { width: w, depth: d, height: h, wallColor: 0x8a827b, roofColor: 0x4d4a47, doorWidth: 2.6 });
            this.houseSpots.push({ x, z, width: w, depth: d, height: h, style: "urban_ruin" });
            this.addToMapObjects(g);
            return g;
        } else if (type === "Metal_Fence") {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.4, 0.35), matB);
            mesh.position.set(x, y + 1.2, z);
            mesh.rotation.y = Math.random() * Math.PI * 2;
            this.addColliderBox(mesh.position.clone(), 7.2, 2.4, 0.35, false, true, false, 'MESH');
        } else if (type === "Barrel") {
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.2, 10), matC);
            mesh.position.set(x, y + 0.6, z);
            this.addColliderBox(mesh.position.clone(), 1.2, 1.2, 1.2, false);
        } else if (type === "Dead_Oak") {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 18 + Math.random() * 7, 2.2), matA);
            mesh.position.set(x, y + mesh.geometry.parameters.height * 0.5, z);
            this.addColliderBox(mesh.position.clone(), 2.2, mesh.geometry.parameters.height, 2.2, false);
        } else if (type === "Mossy_Rock") {
            mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6 + Math.random() * 4.4, 0), matB);
            mesh.position.set(x, y + 2.2, z);
            mesh.rotation.set(Math.random() * 0.3, Math.random() * Math.PI * 2, Math.random() * 0.3);
            this.addColliderBox(mesh.position.clone(), 6.8, 4.8, 6.8, false, true, false, 'CONVEX_HULL');
        } else if (type === "Tall_Grass_Cluster") {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.0 + Math.random() * 1.2, 3.0), matC);
            mesh.position.set(x, y + mesh.geometry.parameters.height * 0.5, z);
            this.addColliderBox(mesh.position.clone(), 3.0, mesh.geometry.parameters.height, 3.0, true);
        } else if (type === "Log") {
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.58, 4.6 + Math.random() * 2.8, 8), matA);
            mesh.position.set(x, y + 0.6, z);
            mesh.rotation.z = Math.PI * 0.5;
            mesh.rotation.y = Math.random() * Math.PI * 2;
            this.addColliderBox(mesh.position.clone(), 5.0, 1.2, 1.2, false);
        }
        if (!mesh) return null;
        mesh.userData.mapGenerated = true;
        mesh.userData.architecture = type.includes('Wall') || type.includes('House') || type.includes('Fence') || type.includes('Terminal') || type.includes('Lamp') || type.includes('Bench');
        if (mesh.geometry) mesh.geometry.computeVertexNormals();
        this.addToMapObjects(mesh);
        return mesh;
    }

    isInsideTerrainBounds(x, z, margin = 2) {
        const limit = this.halfSize - margin;
        return Math.abs(x) <= limit && Math.abs(z) <= limit;
    }

    buildStructuredEnvironment() {
        if (!this.floorTiles?.length) return;
        const center = new THREE.Vector3(0, 0, 0);
        const arenaRadius = Math.min(300, this.halfSize - 6);
        const plazaRadius = 60;
        let state = (this.seed ^ 0x7f4a7c31) >>> 0;
        const rand = () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        };
        const orientationSet = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
        const objectMinGap = 6;
        const chainCount = 40 + Math.floor(rand() * 11);
        const chains = [];
        const wallEntries = [];
        const rockEntries = [];
        const occupied = [];

        const isPlaza = (x, z, extra = 0) => Math.hypot(x - center.x, z - center.z) <= (plazaRadius + extra);
        const isValidDim = (v) => Number.isFinite(v) && v >= 2;
        const isFarEnough = (x, z) => {
            for (let i = 0; i < occupied.length; i++) {
                const o = occupied[i];
                if (Math.hypot(x - o.x, z - o.z) < objectMinGap) return false;
            }
            return true;
        };
        const sampleGroundY = (x, z) => {
            if (!this.isInsideTerrainBounds(x, z, 1.2)) return null;
            const y = this.raycastGroundY?.(x, z, this.getHeightAt(x, z));
            return Number.isFinite(y) ? y : null;
        };
        const slopeDegAt = (x, z) => {
            const step = 2;
            const h0 = this.getHeightAt(x, z);
            const hx1 = this.getHeightAt(x + step, z);
            const hx2 = this.getHeightAt(x - step, z);
            const hz1 = this.getHeightAt(x, z + step);
            const hz2 = this.getHeightAt(x, z - step);
            if (![h0, hx1, hx2, hz1, hz2].every(Number.isFinite)) return 0;
            const dx = (hx1 - hx2) / (step * 2);
            const dz = (hz1 - hz2) / (step * 2);
            return Math.atan(Math.sqrt(dx * dx + dz * dz)) * 57.295779513;
        };
        const acceptPos = (x, z) => {
            const d = Math.hypot(x, z);
            if (!Number.isFinite(d) || d > arenaRadius || isPlaza(x, z, 2.5)) return null;
            if (!isFarEnough(x, z)) return null;
            const y = sampleGroundY(x, z);
            if (y === null) return null;
            if (slopeDegAt(x, z) > 30) return null;
            occupied.push({ x, z });
            return y + 0.01;
        };
        const pickStart = () => {
            let attempts = 0;
            while (attempts++ < 200) {
                const t = this.floorTiles[(rand() * this.floorTiles.length) | 0];
                if (!t) continue;
                const d = Math.hypot(t.x, t.z);
                if (d <= plazaRadius + 12 || d >= arenaRadius - 6) continue;
                return { x: t.x, z: t.z };
            }
            return { x: (rand() - 0.5) * arenaRadius * 0.7, z: (rand() - 0.5) * arenaRadius * 0.7 };
        };

        for (let c = 0; c < chainCount; c++) {
            const start = pickStart();
            const orientation = orientationSet[(rand() * orientationSet.length) | 0];
            const length = 5 + ((rand() * 6) | 0);
            const step = 7 + rand() * 4;
            chains.push({ start, orientation, length, step });
        }

        for (let c = 0; c < chains.length; c++) {
            const chain = chains[c];
            for (let i = 0; i < chain.length; i++) {
                const jx = (rand() - 0.5) * 1.2;
                const jz = (rand() - 0.5) * 1.2;
                const px = chain.start.x + Math.cos(chain.orientation) * chain.step * i + jx;
                const pz = chain.start.z + Math.sin(chain.orientation) * chain.step * i + jz;
                const y = acceptPos(px, pz);
                if (y === null) continue;
                const dist = Math.hypot(px, pz);
                if (dist < arenaRadius * 0.58) {
                    if (!this.registerSpawnBounds(px, pz, 20, 20, 0.35)) continue;
                    wallEntries.push({ x: px, y: y + 5, z: pz, w: 2, h: 10, d: 20, ry: chain.orientation });
                } else {
                    const s = 8 + rand() * 12;
                    if (!this.registerSpawnBounds(px, pz, s, s, 0.35)) continue;
                    rockEntries.push({ x: px, y: y + s * 0.5, z: pz, sx: s, sy: s * (0.75 + rand() * 0.35), sz: s * (0.8 + rand() * 0.3), rx: rand() * Math.PI * 2, ry: rand() * Math.PI * 2, rz: rand() * Math.PI * 2, colliderW: s, colliderH: s, colliderD: s });
                }
            }
        }

        const makeBoxInstanced = (entries, mat) => {
            if (!entries.length) return;
            const geo = new THREE.BoxGeometry(1, 1, 1);
            const inst = new THREE.InstancedMesh(geo, mat, entries.length);
            const m = new THREE.Matrix4();
            const p = new THREE.Vector3();
            const q = new THREE.Quaternion();
            const s = new THREE.Vector3();
                        let write = 0;
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                if (!e || !isValidDim(e.w) || !isValidDim(e.h) || !isValidDim(e.d)) continue;
                if (!this.isInsideTerrainBounds(e.x, e.z, 1)) continue;
                p.set(e.x, e.y, e.z);
                q.setFromEuler(new THREE.Euler(0, Number.isFinite(e.ry) ? e.ry : 0, 0, "XYZ"));
                s.set(e.w, e.h, e.d);
                m.compose(p, q, s);
                inst.setMatrixAt(write, m);
                this.addColliderBox(new THREE.Vector3(e.x, e.y, e.z), e.w, e.h, e.d, false);
                write++;
            }
            if (!write) return;
            inst.count = write;
            inst.userData.collisionType = "box_solid";
            inst.userData.hasCollision = true;
            this.addToMapObjects(inst);
        };
        const makeGeomInstanced = (entries, geometry, mat) => {
            if (!entries.length) return;
            const inst = new THREE.InstancedMesh(geometry, mat, entries.length);
            const m = new THREE.Matrix4();
            const p = new THREE.Vector3();
            const q = new THREE.Quaternion();
            const euler = new THREE.Euler();
            const s = new THREE.Vector3();
            let write = 0;
            for (let i = 0; i < entries.length; i++) {
                const it = entries[i];
                if (!it || !isValidDim(it.colliderW) || !isValidDim(it.colliderH) || !isValidDim(it.colliderD)) continue;
                if (!this.isInsideTerrainBounds(it.x, it.z, 1)) continue;
                p.set(it.x, it.y, it.z);
                euler.set(it.rx || 0, it.ry || 0, it.rz || 0, 'XYZ');
                q.setFromEuler(euler);
                s.set(it.sx || 1, it.sy || 1, it.sz || 1);
                m.compose(p, q, s);
                inst.setMatrixAt(write, m);
                this.addColliderBox(new THREE.Vector3(it.x, it.y, it.z), it.colliderW, it.colliderH, it.colliderD, false, true, false, 'CONVEX_HULL');
                write++;
            }
            if (!write) return;
            inst.count = write;
            inst.userData.collisionType = "box_solid";
            inst.userData.hasCollision = true;
            this.addToMapObjects(inst);
        };

        makeBoxInstanced(wallEntries, new THREE.MeshStandardMaterial({ color: 0x7a8088, roughness: 0.9, flatShading: true }));
        makeGeomInstanced(rockEntries, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x6d5b4c, roughness: 0.96, flatShading: true }));
        this.validateMapObjectsCollection();
    }

    validateMapObjectsCollection() {
        if (!this.mapObjectsCollection) return;
        const toRemove = [];
        for (const obj of this.mapObjectsCollection.children) {
            if (!obj) continue;
            if (!obj.userData?.mapGenerated) obj.userData = { ...(obj.userData || {}), mapGenerated: true };
            const p = obj.position || this._zeroCenter;
            if (!this.isInsideTerrainBounds(p.x || 0, p.z || 0, 0.5)) {
                toRemove.push(obj);
            }
        }
        for (const obj of toRemove) {
            this.mapObjectsCollection.remove(obj);
            if (obj.geometry && !obj.isInstancedMesh) obj.geometry.dispose?.();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach((m) => m?.dispose?.());
                else obj.material.dispose?.();
            }
        }
    }

    getSectorForWorld(x, z) {
        if (!this.biomeSectors?.length || !this.playerSpawn) return null;
        const center = this.getSpawnWorld();
        const angle = Math.atan2(z - center.z, x - center.x);
        const normalized = (angle + Math.PI) / (Math.PI * 2);
        const index = Math.max(0, Math.min(this.biomeSectors.length - 1, Math.floor(normalized * this.biomeSectors.length)));
        return this.biomeSectors[index]?.id || null;
    }

    buildBiomeSectorSetpieces() {
        if (!this.floorTiles?.length) return;
        const rand = (() => {
            let state = (this.seed ^ 0x4f1bbcdc) >>> 0;
            return () => {
                state = (state * 1664525 + 1013904223) >>> 0;
                return state / 0x100000000;
            };
        })();
        const bySector = new Map();
        for (const tile of this.floorTiles) {
            const sector = this.getSectorForWorld(tile.x, tile.z);
            if (!sector) continue;
            if (!bySector.has(sector)) bySector.set(sector, []);
            bySector.get(sector).push(tile);
        }

        const placed = [];
        const decorSpacingScale = 0.55;
        const canPlace = (x, z, minDist = 8) => !placed.some(p => Math.hypot(p.x - x, p.z - z) < (minDist * decorSpacingScale));
        const mark = (x, z) => placed.push({ x, z });

        const stableYOffset = (x, z) => {
            const n = Math.sin((x + 19.3) * 0.031 + (z - 11.7) * 0.027 + (this.seed || 1) * 0.00037);
            return 0.02 + (n * 0.5 + 0.5) * 0.05;
        };
        const createBox = (x, z, w, h, d, mat, walkable = false, yBias = 0) => {
            const y = this.raycastGroundY(x, z, this.getSurfaceHeightAt(x, z), true);
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            mesh.position.set(x, y + h * 0.5 + yBias + stableYOffset(x, z), z);
            mesh.userData.mapGenerated = true;
            this.scene.add(mesh);
            this.addColliderBox(mesh.position.clone(), w, h, d, walkable);
            return mesh;
        };
        const createInstancedBoxes = (entries, mat, walkable = false) => {
            if (!entries?.length) return;
            const unit = new THREE.BoxGeometry(1, 1, 1);
            const inst = new THREE.InstancedMesh(unit, mat, entries.length);
            const matrix = new THREE.Matrix4();
            const pos = new THREE.Vector3();
            const quat = new THREE.Quaternion();
            const scale = new THREE.Vector3();
                        let write = 0;
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                if (
                    !e
                    || !Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.z)
                    || !Number.isFinite(e.w) || !Number.isFinite(e.h) || !Number.isFinite(e.d)
                    || e.w <= 0 || e.h <= 0 || e.d <= 0
                ) continue;
                pos.set(e.x, e.y, e.z);
                quat.setFromEuler(new THREE.Euler(0, Number.isFinite(e.ry) ? e.ry : 0, 0, "XYZ"));
                scale.set(e.w, e.h, e.d);
                matrix.compose(pos, quat, scale);
                inst.setMatrixAt(write, matrix);
                this.addColliderBox(new THREE.Vector3(e.x, e.y, e.z), e.w, e.h, e.d, walkable);
                write++;
            }
            if (!write) return;
            inst.count = write;
            inst.userData.mapGenerated = true;
            this.scene.add(inst);
        };

        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x868b92, roughness: 0.88, flatShading: true });
        const rustyMat = new THREE.MeshStandardMaterial({ color: 0x6f7a82, roughness: 0.72, metalness: 0.18, flatShading: true });
        const sandbagMat = new THREE.MeshStandardMaterial({ color: 0xb39a74, roughness: 0.95, flatShading: true });
        const boneMat = new THREE.MeshStandardMaterial({ color: 0xc9c2ae, roughness: 0.8, flatShading: true });
        const shelfMat = new THREE.MeshStandardMaterial({ color: 0x5f4b3d, roughness: 0.85, flatShading: true });
        const densityMul = 1.9;

        const placeWhisperingForest = () => {
            const tiles = bySector.get('tropical_jungle') || [];
            const maxCount = Math.min(Math.floor(48 * densityMul), Math.floor(tiles.length / 48));
            for (let i = 0; i < maxCount; i++) {
                const t = tiles[Math.floor(rand() * tiles.length)];
                if (!t) continue;
                if (this.isInSpawnCourtyardWorld(t.x, t.z, 16)) continue;
                if (!canPlace(t.x, t.z, 7)) continue;
                createBox(t.x, t.z, 3.8, 2.1 + rand() * 0.8, 3.8, new THREE.MeshStandardMaterial({ color: 0x3f7e43, roughness: 0.95, flatShading: true }), false, 0.08);
                mark(t.x, t.z);
            }
        };

        const placeStoneLabyrinth = () => {
            const tiles = bySector.get('desert_canyon') || [];
            if (!tiles.length) return;
            const rows = Math.floor(18 * densityMul);
            const cols = Math.floor(12 * densityMul);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if ((r + c) % 3 === 0) continue;
                    const idx = ((r * cols + c) * 17 + (this.seed % 97)) % tiles.length;
                    const t = tiles[idx];
                    if (!t) continue;
                    if (!canPlace(t.x, t.z, 6.5)) continue;
                    if (this.isInSpawnCourtyardWorld(t.x, t.z, 18)) continue;
                    const len = 8 + rand() * 6;
                    const vertical = rand() > 0.5;
                    createBox(t.x, t.z, vertical ? 2.2 : len, 8.8, vertical ? len : 2.2, stoneMat, false, 0.18);
                    mark(t.x, t.z);
                }
            }
        };

        const placeIndustrial = () => {
            const tiles = bySector.get('industrial_ruins') || [];
            const maxCount = Math.min(Math.floor(34 * densityMul), Math.floor(tiles.length / 66));
            const boxes = [];
            for (let i = 0; i < maxCount; i++) {
                const t = tiles[Math.floor(rand() * tiles.length)];
                if (!t) continue;
                if (!canPlace(t.x, t.z, 9.5)) continue;
                const w = 5 + rand() * 3.5;
                const d = 2.8 + rand() * 1.4;
                const h = 2 + rand() * 1.8;
                const y = this.getSurfaceHeightAt(t.x, t.z) + h * 0.5 + 0.08 + stableYOffset(t.x, t.z);
                const ry = rand() > 0.5 ? 0 : Math.PI / 2;
                boxes.push({ x: t.x, y, z: t.z, w, h, d, ry });
                mark(t.x, t.z);
            }
            createInstancedBoxes(boxes, rustyMat, true);
        };

        const placeBlockpost = () => {
            const tiles = bySector.get('urban_decay') || [];
            const maxCount = Math.min(Math.floor(36 * densityMul), Math.floor(tiles.length / 86));
            const bags = [];
            for (let i = 0; i < maxCount; i++) {
                const t = tiles[Math.floor(rand() * tiles.length)];
                if (!t) continue;
                if (!canPlace(t.x, t.z, 9)) continue;
                const w = 5 + rand() * 2;
                const h = 1.35;
                const d = 2.2;
                const y = this.getSurfaceHeightAt(t.x, t.z) + h * 0.5 + 0.06 + stableYOffset(t.x, t.z);
                const ry = rand() * Math.PI * 2;
                bags.push({ x: t.x, y, z: t.z, w, h, d, ry });
                this.traps.push({
                    position: new THREE.Vector3(t.x, this.getHeightAt(t.x, t.z) + 0.12, t.z),
                    radius: 3.1,
                    damage: 3.2,
                    slow: 0.6
                });
                mark(t.x, t.z);
            }
            createInstancedBoxes(bags, sandbagMat, false);
        };

        const placeSkeletalCanyon = () => {
            const tiles = bySector.get('frozen_tundra') || [];
            const maxCount = Math.min(Math.floor(28 * densityMul), Math.floor(tiles.length / 86));
            for (let i = 0; i < maxCount; i++) {
                const t = tiles[Math.floor(rand() * tiles.length)];
                if (!t) continue;
                if (!canPlace(t.x, t.z, 11)) continue;
                const y = this.getSurfaceHeightAt(t.x, t.z) + stableYOffset(t.x, t.z);
                const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.62, 7 + rand() * 5, 8), boneMat);
                bone.position.set(t.x, y + 2.4, t.z);
                bone.rotation.z = Math.PI / 2 + (rand() - 0.5) * 0.3;
                bone.rotation.y = rand() * Math.PI * 2;
                bone.userData.mapGenerated = true;
                this.scene.add(bone);
                this.addColliderBox(new THREE.Vector3(t.x, y + 2.4, t.z), 7.8, 1.3, 1.3, false);
                mark(t.x, t.z);
            }
        };

        const placeAgroComplex = () => {
            const tiles = bySector.get('toxic_swamp') || [];
            const maxCount = Math.min(Math.floor(26 * densityMul), Math.floor(tiles.length / 78));
            for (let i = 0; i < maxCount; i++) {
                const t = tiles[Math.floor(rand() * tiles.length)];
                if (!t) continue;
                if (!canPlace(t.x, t.z, 10)) continue;
                const rack = createBox(t.x, t.z, 4.8, 2.6, 1.2, shelfMat, false, 0.08);
                rack.rotation.y = rand() > 0.5 ? 0 : Math.PI / 2;
                this.slowZones.push({ x: t.x, z: t.z, width: 4.6, depth: 3.4, factor: 0.74, type: 'glass' });
                mark(t.x, t.z);
            }
        };

        const placePineForest = () => {
            const tiles = bySector.get('pine_forest') || [];
            const maxCount = Math.min(Math.floor(42 * densityMul), Math.floor(tiles.length / 70));
            for (let i = 0; i < maxCount; i++) {
                const t = tiles[Math.floor(rand() * tiles.length)];
                if (!t) continue;
                if (this.isInSpawnCourtyardWorld(t.x, t.z, 14)) continue;
                if (!canPlace(t.x, t.z, 8.5)) continue;
                createBox(t.x, t.z, 2.6, 5.4 + rand() * 2.3, 2.6, stoneMat, false, 0.06);
                mark(t.x, t.z);
            }
        };

        placeWhisperingForest();
        placeStoneLabyrinth();
        placeIndustrial();
        placeBlockpost();
        placeSkeletalCanyon();
        placeAgroComplex();
        placePineForest();
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
        }

        const inst = new THREE.InstancedMesh(padGeo, padMat, pads.length);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3(1, 1, 1);
        pads.forEach((p, i) => {
            const floorTop = this.raycastGroundY(p.x, p.z, this.getHeightAt(p.x, p.z));
            const padCenterY = floorTop + 0.19;
            position.set(p.x, padCenterY, p.z);
            matrix.compose(position, rotation, scale);
            inst.setMatrixAt(i, matrix);
            this.addColliderBox(new THREE.Vector3(p.x, padCenterY, p.z), 2.2, 0.3, 2.2, true);
            this.spawnPads.push(new THREE.Vector3(p.x, floorTop + 0.34, p.z));
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
        this.cornucopiaDestroyed = false;

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
            const piece = new THREE.Mesh(new THREE.CylinderGeometry(seg.sy, seg.sx, 2.05, 10, 1, false), goldMat);
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
                    false
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
        this.cornucopiaGroup = group;
    }

    getCornucopiaCenter() {
        const spawnWorld = this.getSpawnWorld();
        return new THREE.Vector3(
            spawnWorld.x,
            this.getHeightAt(spawnWorld.x, spawnWorld.z) + 0.8,
            spawnWorld.z
        );
    }

    detonateCornucopia() {
        if (this.cornucopiaDestroyed) return;
        this.cornucopiaDestroyed = true;
        if (!this.cornucopiaGroup) return;
        const center = this.getCornucopiaCenter();
        const debrisMat = new THREE.MeshStandardMaterial({
            color: 0xc48a2f,
            roughness: 0.62,
            metalness: 0.28,
            flatShading: true
        });
        for (let i = 0; i < 14; i++) {
            const chunk = new THREE.Mesh(
                new THREE.BoxGeometry(0.65 + Math.random() * 0.9, 0.4 + Math.random() * 0.55, 0.5 + Math.random() * 0.8),
                debrisMat
            );
            chunk.position.copy(center).add(new THREE.Vector3(
                (Math.random() - 0.5) * 5.2,
                1.1 + Math.random() * 1.8,
                (Math.random() - 0.5) * 5.2
            ));
            chunk.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            chunk.userData.mapGenerated = true;
            this.scene.add(chunk);
        }
        this.cornucopiaGroup.visible = false;
        this.cornucopiaGroup = null;
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
            const targetCount = 10 + Math.floor(rand() * 5);
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
        const arenaRadius = Math.min(300, this.halfSize - 6);
        const ruinsMin = arenaRadius * 0.28;
        const ruinsMax = arenaRadius * 0.68;
        const highlandsMin = arenaRadius * 0.68;
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
        const farOuterCandidates = candidates
            .filter(tile => {
                const dx = tile.x - spawnWorld.x;
                const dz = tile.z - spawnWorld.z;
                const d = Math.hypot(dx, dz);
                return d >= this.size * 0.34;
            })
            .sort((a, b) => {
                const da = Math.hypot(a.x - spawnWorld.x, a.z - spawnWorld.z);
                const db = Math.hypot(b.x - spawnWorld.x, b.z - spawnWorld.z);
                return db - da;
            });

        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        const placed = [];
        const canPlace = (x, z, minDist) => !placed.some(p => Math.hypot(p.x - x, p.z - z) < minDist);
        const byTheme = (themes) => candidates.filter(t => themes.includes(this.getBiomeVisualTheme(t.biome || this.surfaceTheme)));
        const forestCandidates = byTheme(['grass', 'swamp']);
        const iceCandidates = byTheme(['snow']);
        const industrialCandidates = byTheme(['mesa', 'ash']);
        const mixedCandidates = candidates.filter(t => !iceCandidates.includes(t));

        const placeStructure = (type, count, sourceCandidates = candidates) => {
            let created = 0;
            for (const tile of sourceCandidates) {
                if (created >= count) break;
                const dist = Math.hypot(tile.x - spawnWorld.x, tile.z - spawnWorld.z);
                if (type === 'house' && dist >= highlandsMin) continue;
                if (!this.isChestClear(tile.x, tile.z, type === 'hangar' ? 12 : 7)) continue;
                if (!canPlace(tile.x, tile.z, type === 'hangar' ? 104 : 40)) continue;

                const group = new THREE.Group();
                group.userData.mapGenerated = true;
                if (type === 'house') {
                    const variant = this.houseVariants[Math.floor(rand() * this.houseVariants.length)];
                    if (!this.registerSpawnBounds(tile.x, tile.z, variant.width, variant.depth, 1.6)) continue;
                    this.addOpenBuildingShell(group, new THREE.Vector3(tile.x, 0, tile.z), variant);
                    this.houseSpots.push({
                        x: tile.x,
                        z: tile.z,
                        width: variant.width,
                        depth: variant.depth,
                        height: variant.height,
                        style: variant.style,
                        biome: this.getBiomeVisualTheme(tile.biome || this.surfaceTheme)
                    });
                } else {
                    const variant = this.hangarVariants[Math.floor(rand() * this.hangarVariants.length)];
                    if (!this.registerSpawnBounds(tile.x, tile.z, variant.width, variant.depth, 2.2)) continue;
                    this.addOpenBuildingShell(group, new THREE.Vector3(tile.x, 0, tile.z), variant);
                    this.hangarSpots.push({
                        x: tile.x,
                        z: tile.z,
                        width: variant.width,
                        depth: variant.depth,
                        height: variant.height,
                        style: variant.style,
                        biome: this.getBiomeVisualTheme(tile.biome || this.surfaceTheme)
                    });
                }
                this.scene.add(group);
                placed.push({ x: tile.x, z: tile.z });
                created += 1;
            }
            return created;
        };

        // Place hangars first and keep them on outer map edges (high risk/high reward POI).
        const guaranteedNearHangars = placeStructure('hangar', 0, nearSpawnCandidates);
        const edgeHangars = placeStructure('hangar', 4, farOuterCandidates.length ? farOuterCandidates : candidates);
        const hangarsNeeded = Math.max(0, 8 - guaranteedNearHangars - edgeHangars);
        const lateHangars = placeStructure('hangar', hangarsNeeded, industrialCandidates.length ? industrialCandidates : (farOuterCandidates.length ? farOuterCandidates : candidates));
        const iceHouses = placeStructure('house', 18, iceCandidates);
        const forestHouses = placeStructure('house', 44, forestCandidates);
        const mixedHouses = placeStructure('house', 58, mixedCandidates);
        this.buildTreeHouses(forestCandidates.length ? forestCandidates : candidates, rand, placed);

        this.poiZones = [
            { type: 'houses_forest', weight: 0.9, count: forestHouses },
            { type: 'houses_ice', weight: 0.7, count: iceHouses },
            { type: 'houses_mixed', weight: 0.8, count: mixedHouses },
            { type: 'hangars', weight: 1.0, count: guaranteedNearHangars + edgeHangars + lateHangars }
        ];

        const rockMat = new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.92, flatShading: true });
        let rockPlaced = 0;
        const boulderSource = industrialCandidates.length ? industrialCandidates : candidates;
        for (const tile of boulderSource) {
            if (rockPlaced >= 5) break;
            const dist = Math.hypot(tile.x - spawnWorld.x, tile.z - spawnWorld.z);
            if (dist < highlandsMin || (dist >= ruinsMin && dist <= ruinsMax)) continue;
            if (!this.isChestClear(tile.x, tile.z, 6.6)) continue;
            if (!canPlace(tile.x, tile.z, 28)) continue;
            if (rand() > 0.16) continue;
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
            if (!this.registerSpawnBounds(tile.x, tile.z, size, size, 1.2)) {
                this.scene.remove(mesh);
                continue;
            }
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
            if (this.isPatchOverlappingStructure(x, z, width, depth, 4.2)) {
                return null;
            }
            const patchHeight = 0.12;
            const lift = Math.max(-0.015, Math.min(0.05, (yOffset - 0.55) * 0.08));
            const patch = new THREE.Mesh(new THREE.BoxGeometry(width, patchHeight, depth), material);
            patch.position.set(x, this.getHeightAt(x, z) + patchHeight * 0.5 + lift, z);
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
            if (this.getStructureAtPoint(tile.x, tile.z, 1.2)) continue;
            if (this.houseSpots.some(h => Math.abs(h.x - tile.x) < ((h.width || 9) * 0.78) && Math.abs(h.z - tile.z) < ((h.depth || 8) * 0.78))) continue;
            if (this.hangarSpots.some(h => Math.abs(h.x - tile.x) < ((h.width || 58) * 0.8) && Math.abs(h.z - tile.z) < ((h.depth || 36) * 0.8))) continue;
            if (this.isInSpawnCourtyardWorld(tile.x, tile.z, 8)) continue;
            if (!canPlace(tile.x, tile.z, 18)) continue;

            const style = tile.biome || this.surfaceTheme;
            if (style === "swamp") {
                const wx = tile.x + (rand() - 0.5) * 8;
                const wz = tile.z + (rand() - 0.5) * 8;
                const w = 9 + rand() * 10;
                const d = 9 + rand() * 10;
                if (this.getTerrainHeightVariation(wx, wz, w, d) > 0.5) continue;
                const patch = addPatch(wx, wz, w, d, lakeMat, 0.92);
                if (!patch) continue;
                if (!this.registerSpawnBounds(wx, wz, w, d, 0.15)) {
                    this.scene.remove(patch);
                    continue;
                }
                this.waterPatches.push({ x: wx, z: wz, width: w, depth: d });
                this.slowZones.push({ x: wx, z: wz, width: w * 0.96, depth: d * 0.96, factor: 0.6, type: 'swamp' });
                this.fogZones.push({ x: wx, z: wz, radius: Math.max(w, d) * 0.72, density: 0.024 + rand() * 0.016 });
                markPlaced(tile.x, tile.z);
                patchUsed += 1;
                continue;
            }
            if (style === "ash") {
                const w = 8 + rand() * 8;
                const d = 8 + rand() * 8;
                const patch = addPatch(tile.x, tile.z, w, d, lavaMat, 0.92);
                if (!patch) continue;
                this.lavaPatches.push({ x: tile.x, z: tile.z, width: w, depth: d });
                markPlaced(tile.x, tile.z);
                patchUsed += 1;
                continue;
            }
            if (style === "snow") {
                const w = 9 + rand() * 10;
                const d = 9 + rand() * 10;
                const patch = addPatch(tile.x, tile.z, w, d, iceLakeMat, 0.92);
                if (!patch) continue;
                this.waterPatches.push({ x: tile.x, z: tile.z, width: w, depth: d });
                this.slowZones.push({ x: tile.x, z: tile.z, width: w * 0.94, depth: d * 0.94, factor: 0.62, type: 'ice' });
                markPlaced(tile.x, tile.z);
                patchUsed += 1;
                continue;
            }
            if (style === "sand") {
                const width = 12 + rand() * 12;
                const depth = 12 + rand() * 12;
                const patch = addPatch(tile.x, tile.z, width, depth, new THREE.MeshStandardMaterial({ color: 0xe0bf72, roughness: 1, flatShading: true }), 0.9);
                if (!patch) continue;
                markPlaced(tile.x, tile.z);
                patchUsed += 1;
                continue;
            }

            const width = 10 + rand() * 14;
            const depth = 10 + rand() * 14;
            const patch = addPatch(tile.x, tile.z, width, depth, grassMat, 0.9);
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
                addPatch(swampTile.x, swampTile.z, w, d, lakeMat, 0.92);
                this.waterPatches.push({ x: swampTile.x, z: swampTile.z, width: w, depth: d });
                this.slowZones.push({ x: swampTile.x, z: swampTile.z, width: w * 0.96, depth: d * 0.96, factor: 0.6, type: 'swamp' });
                this.fogZones.push({ x: swampTile.x, z: swampTile.z, radius: 8, density: 0.03 });
            }
        }
        if (this.lavaPatches.length === 0) {
            const lavaTile = candidates.find(t => (t.biome || this.surfaceTheme) === "ash");
            if (lavaTile) {
                const w = 10;
                const d = 10;
                addPatch(lavaTile.x, lavaTile.z, w, d, lavaMat, 0.92);
                this.lavaPatches.push({ x: lavaTile.x, z: lavaTile.z, width: w, depth: d });
            }
        }
        this.buildTallGrass(tallGrassPoints);
    }

    buildVerticalCoverObjects() {
        if (!this.floorTiles?.length) return;
        const rand = (() => {
            let state = (this.seed ^ 0x5f7a1b29) >>> 0;
            return () => {
                state = (state * 1664525 + 1013904223) >>> 0;
                return state / 0x100000000;
            };
        })();
        const candidates = [...this.floorTiles].sort(() => rand() - 0.5);
        const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8d9398, roughness: 0.86, flatShading: true });
        const containerMat = new THREE.MeshStandardMaterial({ color: 0x607d8b, roughness: 0.65, metalness: 0.2, flatShading: true });
        const accentMat = new THREE.MeshStandardMaterial({ color: 0x30424d, roughness: 0.55, flatShading: true });
        const placed = [];
        const canPlace = (x, z, minDist) => !placed.some(p => Math.hypot(p.x - x, p.z - z) < minDist);

        const createCover = (x, z, type = 'container') => {
            const y = this.getHeightAt(x, z);
            if (type === 'container') {
                const w = 6 + rand() * 2.5;
                const h = 2 + rand() * 1.2;
                const d = 3.2 + rand() * 1.6;
                const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), containerMat);
                body.position.set(x, y + h * 0.5, z);
                body.rotation.y = rand() > 0.5 ? 0 : Math.PI / 2;
                body.userData.mapGenerated = true;
                this.scene.add(body);
                this.addColliderBox(body.position.clone(), w, h, d, true);
                const rib = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.18, d * 0.8), accentMat);
                rib.position.set(x, y + h - 0.2, z);
                rib.rotation.y = body.rotation.y;
                rib.userData.mapGenerated = true;
                this.scene.add(rib);
                this.verticalCoverSpots.push({ x, z, topY: y + h, type: 'container' });
            } else {
                const size = 2.4 + rand() * 2.8;
                const h = 1.2 + rand() * 2.2;
                const block = new THREE.Mesh(new THREE.BoxGeometry(size, h, size), concreteMat);
                block.position.set(x, y + h * 0.5, z);
                block.rotation.y = rand() * Math.PI * 2;
                block.userData.mapGenerated = true;
                this.scene.add(block);
                this.addColliderBox(block.position.clone(), size, h, size, true);
                this.verticalCoverSpots.push({ x, z, topY: y + h, type: 'concrete' });
            }
            placed.push({ x, z });
        };

        const target = Math.max(42, Math.floor(this.floorTiles.length / 500));
        let done = 0;
        for (const tile of candidates) {
            if (done >= target) break;
            if (this.isInSpawnCourtyardWorld(tile.x, tile.z, 14)) continue;
            if (!this.isChestClear(tile.x, tile.z, 2.2)) continue;
            if (this.getStructureAtPoint(tile.x, tile.z, 2.6)) continue;
            if (!canPlace(tile.x, tile.z, 10 + rand() * 6)) continue;
            createCover(tile.x, tile.z, rand() < 0.56 ? 'container' : 'block');
            done += 1;
        }
    }

    assignSectorBiomes() {
        if (!this.grid?.length) return;
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const tile = this.grid[y]?.[x];
                if (!tile || tile.type !== "floor") continue;
                const world = this.toWorld(x, y);
                tile.biome = this.getQuadrantBiomeId(world.x, world.z);
            }
        }
    }

    buildExplosiveBarrelSpots() {
        this.explosiveBarrelSpots = [];
        const rand = (() => {
            let state = (this.seed ^ 0x97c4a51d) >>> 0;
            return () => {
                state = (state * 1664525 + 1013904223) >>> 0;
                return state / 0x100000000;
            };
        })();
        const spots = [];
        for (const hangar of this.hangarSpots || []) {
            const w = hangar.width || 58;
            const d = hangar.depth || 36;
            for (let i = 0; i < 7; i++) {
                const x = hangar.x + (rand() * 2 - 1) * (w * 0.32);
                const z = hangar.z + (rand() * 2 - 1) * (d * 0.32);
                if (!this.isWalkableAt(x, z)) continue;
                spots.push({ x, z });
            }
        }
        for (const house of this.houseSpots || []) {
            const w = house.width || 9;
            const d = house.depth || 8;
            for (let i = 0; i < 2; i++) {
                const x = house.x + (rand() * 2 - 1) * (w * 0.22);
                const z = house.z + (rand() * 2 - 1) * (d * 0.22);
                if (!this.isWalkableAt(x, z)) continue;
                spots.push({ x, z });
            }
        }
        for (const s of spots) {
            if (this.isInSpawnCourtyardWorld(s.x, s.z, 12)) continue;
            if (!this.isChestClear(s.x, s.z, 0.9, true)) continue;
            const y = this.getHeightAt(s.x, s.z);
            this.explosiveBarrelSpots.push({ x: s.x, y: y + 0.1, z: s.z });
            this.addColliderBox(new THREE.Vector3(s.x, y + 0.82, s.z), 1.1, 1.6, 1.1, false);
        }
    }

    update(delta) {
        if (this.slowZones?.length) {
            for (let i = this.slowZones.length - 1; i >= 0; i--) {
                const zone = this.slowZones[i];
                if (!zone || !zone.ttl) continue;
                zone.ttl -= delta;
                if (zone.ttl <= 0) {
                    this.slowZones.splice(i, 1);
                }
            }
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

    buildStaticBiomeLayer() {
        const gw = this.gridWidth | 0;
        const gh = this.gridHeight | 0;
        if (gw < 2 || gh < 2 || !this.grid?.length) return;
        const vx = gw;
        const vz = gh;
        const verts = new Float32Array(vx * vz * 3);
        let vi = 0;
        for (let z = 0; z < vz; z++) {
            for (let x = 0; x < vx; x++) {
                const world = this.toWorld(x, z);
                const wx = Number.isFinite(world?.x) ? world.x : 0;
                const wz = Number.isFinite(world?.z) ? world.z : 0;
                const baseH = this.heightMap?.[z]?.[x] ?? 0;
                const h = (Number.isFinite(baseH) ? baseH : 0) + 0.405;
                verts[vi++] = wx;
                verts[vi++] = h;
                verts[vi++] = wz;
            }
        }

        const center = this.getSpawnWorld();
        const indicesStone = [];
        const indicesUrban = [];
        const indicesWild = [];
        const pushTri = (arr, a, b, c) => { arr.push(a, b, c); };
        for (let z = 0; z < vz - 1; z++) {
            for (let x = 0; x < vx - 1; x++) {
                const a = z * vx + x;
                const b = a + 1;
                const c = a + vx;
                const d = c + 1;
                const w0 = this.toWorld(x, z);
                const w1 = this.toWorld(x + 1, z);
                const w2 = this.toWorld(x, z + 1);
                const dx = ((w0.x + w1.x + w2.x) / 3) - center.x;
                const dz = ((w0.z + w1.z + w2.z) / 3) - center.z;
                const realm = this.getTerrainRealmByDistance(dx, dz);
                const target = realm === 0 ? indicesStone : realm === 1 ? indicesUrban : indicesWild;
                pushTri(target, a, c, b);
                pushTri(target, b, c, d);
            }
        }
        const makeMesh = (indices, color, roughness = 0.9, metalness = 0.02) => {
            if (!indices.length) return null;
            const geom = new THREE.BufferGeometry();
            geom.setAttribute("position", new THREE.BufferAttribute(verts.slice(0), 3));
            const idx = (vx * vz > 65535) ? new Uint32Array(indices) : new Uint16Array(indices);
            geom.setIndex(new THREE.BufferAttribute(idx, 1));
            geom.computeVertexNormals();
            const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = -2;
            mat.polygonOffsetUnits = -3;
            const mesh = new THREE.Mesh(geom, mat);
            mesh.userData.mapGenerated = true;
            mesh.userData.walkableSurface = true;
            mesh.frustumCulled = false;
            this.scene.add(mesh);
            return mesh;
        };
        const stone = makeMesh(indicesStone, 0xc7c9cc, 0.9, 0.01);
        const urban = makeMesh(indicesUrban, 0x4d535a, 0.84, 0.06);
        const wild = makeMesh(indicesWild, 0x4f5d43, 0.96, 0.0);
        this.biomeLayerMesh = new THREE.Group();
        this.biomeLayerMesh.userData.mapGenerated = true;
        if (stone) this.biomeLayerMesh.add(stone);
        if (urban) this.biomeLayerMesh.add(urban);
        if (wild) this.biomeLayerMesh.add(wild);
        this.scene.add(this.biomeLayerMesh);
        this.biomeLayerTexture = null;
    }

    clearSceneObjects() {
        const toRemove = [];
        this.scene.traverse(obj => {
            if (obj.userData && obj.userData.mapGenerated) {
                toRemove.push(obj);
            }
        });
        for (const obj of toRemove) {
            this.scene.remove(obj);
            if (!obj.isInstancedMesh && obj.geometry) {
                obj.geometry.dispose?.();
            }
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    for (const mat of obj.material) mat?.dispose?.();
                } else {
                    obj.material.dispose?.();
                }
            }
        }
        this.cornucopiaGroup = null;
        this.cornucopiaDestroyed = false;
        this.biomeLayerMesh = null;
        if (this.biomeLayerTexture) {
            this.biomeLayerTexture.dispose?.();
            this.biomeLayerTexture = null;
        }
        this._wetMaterialState = new WeakMap();
        this._nightEmissiveState = new WeakMap();
        this.spawnBounds = [];

    }

    setWetTerrain(active = false) {
        const apply = (mat) => {
            if (!mat || typeof mat !== 'object') return;
            const prev = this._wetMaterialState.get(mat);
            if (active) {
                if (!prev) {
                    this._wetMaterialState.set(mat, {
                        roughness: Number.isFinite(mat.roughness) ? mat.roughness : undefined,
                        metalness: Number.isFinite(mat.metalness) ? mat.metalness : undefined,
                        specularIntensity: Number.isFinite(mat.specularIntensity) ? mat.specularIntensity : undefined,
                        envMapIntensity: Number.isFinite(mat.envMapIntensity) ? mat.envMapIntensity : undefined
                    });
                }
                if (Number.isFinite(mat.roughness)) mat.roughness = Math.min(mat.roughness, 0.33);
                if (Number.isFinite(mat.metalness)) mat.metalness = Math.max(mat.metalness, 0.24);
                if (Number.isFinite(mat.specularIntensity)) mat.specularIntensity = Math.max(mat.specularIntensity, 0.75);
                mat.envMapIntensity = 1.0;
                mat.needsUpdate = true;
            } else if (prev) {
                if (prev.roughness !== undefined) mat.roughness = prev.roughness;
                if (prev.metalness !== undefined) mat.metalness = prev.metalness;
                if (prev.specularIntensity !== undefined && Number.isFinite(mat.specularIntensity)) mat.specularIntensity = prev.specularIntensity;
                if (prev.envMapIntensity !== undefined) mat.envMapIntensity = prev.envMapIntensity;
                mat.needsUpdate = true;
            }
        };
        this.scene.traverse((obj) => {
            if (!obj?.userData?.mapGenerated || !obj.material) return;
            if (Array.isArray(obj.material)) obj.material.forEach(apply);
            else apply(obj.material);
        });
    }

    setNightEmissive(active = false) {
        const apply = (mat) => {
            if (!mat || typeof mat !== 'object' || !mat.emissive || !Number.isFinite(mat.emissiveIntensity)) return;
            const prev = this._nightEmissiveState.get(mat);
            if (active) {
                if (!prev) {
                    this._nightEmissiveState.set(mat, { emissiveIntensity: mat.emissiveIntensity });
                }
                mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 0.8);
                mat.needsUpdate = true;
            } else if (prev) {
                mat.emissiveIntensity = prev.emissiveIntensity;
                mat.needsUpdate = true;
            }
        };
        this.scene.traverse((obj) => {
            if (!obj?.userData?.mapGenerated || !obj.material) return;
            if (Array.isArray(obj.material)) obj.material.forEach(apply);
            else apply(obj.material);
        });
    }

    setRainPuddles(active = false, center = null) {
        if (!active) {
            for (const p of this.rainPuddles || []) this.scene.remove(p);
            this.rainPuddles = [];
            return;
        }
        if (this.rainPuddles?.length) return;
        const puddleMat = new THREE.MeshStandardMaterial({
            color: 0x5f88b3,
            roughness: 0.2,
            metalness: 0.05,
            transparent: true,
            opacity: 0.5
        });
        puddleMat.polygonOffset = true;
        puddleMat.polygonOffsetFactor = -2;
        puddleMat.polygonOffsetUnits = -2;
        const spawned = [];
        const c = center || this.getSpawnWorld();
        for (let i = 0; i < 44; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 205 + Math.random() * 90;
            const x = c.x + Math.cos(a) * r;
            const z = c.z + Math.sin(a) * r;
            if (!this.isInsideTerrainBounds(x, z, 1.5)) continue;
            if (this.getTerrainMaterialAt(x, z) !== 'wild') continue;
            if (!this.isWalkableAt(x, z)) continue;
            const sx = 1.2 + Math.random() * 2.8;
            const sz = 0.9 + Math.random() * 2.4;
            const y = this.getSurfaceHeightAt(x, z) + 0.06;
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), puddleMat.clone());
            mesh.rotation.x = -Math.PI * 0.5;
            mesh.rotation.z = (Math.random() - 0.5) * 0.5;
            mesh.position.set(x, y, z);
            mesh.userData.mapGenerated = true;
            this.scene.add(mesh);
            spawned.push(mesh);
        }
        this.rainPuddles = spawned;
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

    hashNoise(x, y, scale = 1) {
        const sx = Math.floor(x * scale);
        const sy = Math.floor(y * scale);
        let h = (sx * 374761393 + sy * 668265263 + this.seed * 1442695041) >>> 0;
        h ^= h >>> 13;
        h = Math.imul(h, 1274126177) >>> 0;
        h ^= h >>> 16;
        return h / 0x100000000;
    }

    random2(ix, iy, salt = 0) {
        let h = Math.imul((ix | 0) ^ (this.seed | 0) ^ salt, 374761393);
        h = Math.imul(h ^ (iy | 0), 668265263);
        h = (h ^ (h >>> 13)) >>> 0;
        h = Math.imul(h, 1274126177) >>> 0;
        return (h ^ (h >>> 16)) / 0x100000000;
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
        const n00 = this.random2(x0, y0, salt);
        const n10 = this.random2(x1, y0, salt);
        const n01 = this.random2(x0, y1, salt);
        const n11 = this.random2(x1, y1, salt);
        const nx0 = this.lerp(n00, n10, tx);
        const nx1 = this.lerp(n01, n11, tx);
        return this.lerp(nx0, nx1, ty);
    }

    perlin2D(x, y, salt = 0) {
        let total = 0;
        let amp = 1;
        let freq = 1;
        let norm = 0;
        for (let i = 0; i < 4; i++) {
            const n = this.valueNoise2D(x * freq, y * freq, salt + i * 7331) * 2 - 1;
            total += n * amp;
            norm += amp;
            amp *= 0.5;
            freq *= 2;
        }
        return norm > 0 ? total / norm : 0;
    }

    buildHeightMap() {
        const map = Array.from({ length: this.gridHeight }, () => Array(this.gridWidth).fill(0));
        const scaleA = 0.02;
        const scaleB = 0.055;
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const tile = this.grid?.[y]?.[x];
                if (!tile || tile.type !== 'floor') {
                    map[y][x] = 0;
                    continue;
                }
                const world = this.toWorld(x, y);
                const nA = this.perlin2D(x * scaleA, y * scaleA, 0x1771);
                const nB = this.perlin2D(x * scaleB, y * scaleB, 0x3a91);
                const n = Math.max(-1, Math.min(1, nA * 0.68 + nB * 0.32));
                const dist = Math.hypot(world.x, world.z);
                const biome = this.getQuadrantBiomeId(world.x, world.z);
                let height = 0;
                if (dist <= 40 || biome === "plaza_stone") {
                    height = 0;
                } else if (biome === "scorched_ruins") {
                    height = Math.max(0, 0.25 + n * 0.45);
                } else if (biome === "swampy_village") {
                    height = Math.max(0, 0.1 + n * 0.28);
                } else if (biome === "frozen_outpost") {
                    height = Math.max(0, 0.45 + Math.abs(n) * 0.95);
                } else {
                    height = Math.max(0, 0.35 + Math.abs(n) * 0.7 + Math.max(0, (dist - 230) / 220) * 0.2);
                }
                map[y][x] = Math.round(height / 0.2) * 0.2;
            }
        }
        return map;
    }

    smoothstep(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.0001, edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    getTerrainZoneMixByDistance(dx, dz) {
        const d = Math.hypot(dx, dz);
        if (d < 80) return { a: 1, b: 0, c: 0 };
        if (d < 200) return { a: 0, b: 1, c: 0 };
        return { a: 0, b: 0, c: 1 };
    }

    getTerrainRealmByDistance(dx, dz) {
        const biome = this.getQuadrantBiomeId(dx, dz);
        if (biome === "plaza_stone" || biome === "scorched_ruins") return 0;
        if (biome === "swampy_village") return 1;
        return 2;
    }

    getTerrainMaterialAt(x, z) {
        const biome = this.getQuadrantBiomeId(x, z);
        if (biome === "plaza_stone" || biome === "scorched_ruins") return "stone";
        if (biome === "swampy_village") return "urban";
        return "wild";
    }

    getTerrainMaterialIndexAt(x, z) {
        const mat = this.getTerrainMaterialAt(x, z);
        if (mat === 'stone') return 0;
        if (mat === 'urban') return 1;
        return 2;
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
        // Lower-frequency clustering reduces shimmering/checker flicker on mobile screens.
        const n1 = this.hashNoise(gx / 18, gy / 18, 1);
        const n2 = this.hashNoise((gx + 73) / 42, (gy - 41) / 42, 2);
        const n = Math.max(0, Math.min(1, n1 * 0.72 + n2 * 0.28));
        if (n < 0.34) return 0;
        if (n < 0.68) return 1;
        return 2;
    }

    getBiomeVariantColor(biome, variant) {
        const palettes = {
            plaza: [0xd0d4d9, 0xc4c8cd, 0xd9dde2],
            scorched: [0x8b4513, 0x7a3c10, 0x9a5120],
            grass: [0x002200, 0x0a2b0a, 0x123312],
            darkforest: [0x002200, 0x0a2b0a, 0x123312],
            jungle: [0x2f4f4f, 0x274545, 0x355a5a],
            swamp: [0x2f4f4f, 0x274545, 0x355a5a],
            ash: [0x8b4513, 0x7a3c10, 0x9a5120],
            frozen: [0xffffff, 0xeff4ff, 0xf7fbff],
            snow: [0xffffff, 0xeff4ff, 0xf7fbff],
            sand: [0x8b4513, 0x7a3c10, 0x9a5120],
            mesa: [0x8b4513, 0x7a3c10, 0x9a5120]
        };
        const arr = palettes[biome] || palettes.grass;
        return arr[Math.max(0, Math.min(arr.length - 1, variant))];
    }

    getBiomeVisualTheme(biome) {
        const b = (biome || "").toLowerCase();
        if (b === "plaza_stone") return "plaza";
        if (b === "scorched_ruins") return "scorched";
        if (b === "swampy_village") return "swamp";
        if (b === "frozen_outpost") return "frozen";
        if (b === "dark_forest") return "darkforest";
        if (b === "tropical_jungle") return "jungle";
        if (b === "industrial_ruins") return "industrial";
        if (b === "stone_maze") return "industrial";
        if (b === "toxic_swamp") return "swamp";
        if (b === "frozen_tundra") return "snow";
        if (b === "desert_canyon") return "sand";
        if (b === "urban_decay") return "ash";
        if (b === "pine_forest") return "grass";
        if (["jungle", "redwood"].includes(b)) return "jungle";
        if (["swamp", "mushroom"].includes(b)) return "swamp";
        if (["industrial", "wasteland"].includes(b)) return "industrial";
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

    raycastGroundY(x, z, fallbackY = null, walkableOnly = true) {
        const fallback = (fallbackY ?? this.getSurfaceHeightAt(x, z)) + 0.01;
        const rc = this._groundRaycaster;
        if (!rc || !this.scene) return fallback;
        rc.set(new THREE.Vector3(x, 1000, z), this._groundRayDir);
        const targets = [];
        for (const child of this.scene.children || []) {
            if (!child?.visible) continue;
            if (child.userData?.mapGenerated !== true) continue;
            targets.push(child);
        }
        if (!targets.length) return fallback;
        const hits = rc.intersectObjects(targets, true);
        const isWalkableHit = (obj) => {
            let node = obj;
            while (node) {
                if (node.userData?.walkableSurface === true) return true;
                node = node.parent;
            }
            return false;
        };
        for (let i = 0; i < hits.length; i++) {
            const hit = hits[i];
            if (!hit?.point) continue;
            if (hit.face?.normal && hit.face.normal.y < 0.2) continue;
            if (walkableOnly && !isWalkableHit(hit.object)) continue;
            return hit.point.y + 0.01;
        }
        return fallback;
    }

    getColliders() {
        return this.colliders;
    }

    getClimbableAt(x, y, z) {
        if (!this.climbables?.length) return null;
        for (const c of this.climbables) {
            if (!c) continue;
            if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
            if (y < c.minY || y > c.maxY) continue;
            return c;
        }
        return null;
    }

    getSpawnPads() {
        return this.spawnPads || [];
    }

    getChestSpots() {
        return this.chestSpots || [];
    }

    getHouseSpots() {
        return this.houseSpots || [];
    }

    getHangarSpots() {
        return this.hangarSpots || [];
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

    getFloorTiles() {
        return this.floorTiles || [];
    }

    getTraps() {
        return [];
    }

    getOneWayGates() {
        return [];
    }

    getStoryNotes() {
        return this.storyNotes || [];
    }

    getFogZones() {
        return this.fogZones || [];
    }

    updatePropVisibility(playerPos) {
        if (!playerPos) return;
        const smallDistSq = 120 * 120;
        const leafDistSq = 150 * 150;
        for (const mesh of this.smallPropMeshes) {
            const center = mesh.userData.center || this._zeroCenter;
            const dx = center.x - playerPos.x;
            const dz = center.z - playerPos.z;
            mesh.visible = (dx * dx + dz * dz) < smallDistSq;
        }
        for (const mesh of this.leafMeshes) {
            const center = mesh.userData.center || this._zeroCenter;
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
        for (const cover of this.verticalCoverSpots || []) {
            if (cover.type !== 'container') continue;
            if (Math.abs(position.x - cover.x) > 3.6) continue;
            if (Math.abs(position.z - cover.z) > 2.8) continue;
            if (position.y <= (cover.topY || 0) + 1.25) return true;
        }
        return false;
    }

    intersectsSpawnBounds(minX, minZ, maxX, maxZ) {
        for (const b of this.spawnBounds || []) {
            if (maxX < b.minX || minX > b.maxX) continue;
            if (maxZ < b.minZ || minZ > b.maxZ) continue;
            return true;
        }
        return false;
    }

    registerSpawnBounds(x, z, width, depth, margin = 0.2) {
        const halfW = width * 0.5 + margin;
        const halfD = depth * 0.5 + margin;
        const minX = x - halfW;
        const maxX = x + halfW;
        const minZ = z - halfD;
        const maxZ = z + halfD;
        if (this.intersectsSpawnBounds(minX, minZ, maxX, maxZ)) return false;
        this.spawnBounds.push({ minX, maxX, minZ, maxZ });
        return true;
    }

    getTerrainHeightVariation(x, z, width, depth) {
        const hw = width * 0.5;
        const hd = depth * 0.5;
        const samplePoints = [
            [x, z],
            [x - hw, z - hd],
            [x + hw, z - hd],
            [x - hw, z + hd],
            [x + hw, z + hd],
            [x - hw * 0.5, z],
            [x + hw * 0.5, z],
            [x, z - hd * 0.5],
            [x, z + hd * 0.5]
        ];
        let minH = Infinity;
        let maxH = -Infinity;
        for (let i = 0; i < samplePoints.length; i++) {
            const p = samplePoints[i];
            const h = this.getHeightAt(p[0], p[1]);
            if (!Number.isFinite(h)) continue;
            if (h < minH) minH = h;
            if (h > maxH) maxH = h;
        }
        if (!Number.isFinite(minH) || !Number.isFinite(maxH)) return 0;
        return maxH - minH;
    }

    isLavaAt(x, z) {
        return this.lavaPatches.some(patch =>
            Math.abs(x - patch.x) <= patch.width / 2 &&
            Math.abs(z - patch.z) <= patch.depth / 2
        );
    }

    isWaterAt(x, z) {
        return this.waterPatches.some(patch =>
            Math.abs(x - patch.x) <= patch.width / 2 &&
            Math.abs(z - patch.z) <= patch.depth / 2
        );
    }

    getSlowZones() {
        return this.slowZones || [];
    }

    getExplosiveBarrelSpots() {
        return this.explosiveBarrelSpots || [];
    }

    getSlowFactorAt(x, z) {
        if (!this.slowZones?.length) return 1;
        let factor = 1;
        for (const zone of this.slowZones) {
            if (Math.abs(x - zone.x) <= (zone.width || 0) / 2 &&
                Math.abs(z - zone.z) <= (zone.depth || 0) / 2) {
                factor = Math.min(factor, zone.factor || 0.6);
            }
        }
        return factor;
    }

    getSlowZoneTypeAt(x, z) {
        if (!this.slowZones?.length) return null;
        for (const zone of this.slowZones) {
            if (Math.abs(x - zone.x) <= (zone.width || 0) / 2 &&
                Math.abs(z - zone.z) <= (zone.depth || 0) / 2) {
                return zone.type || null;
            }
        }
        return null;
    }

    addCraterSlowZone(x, z, radius = 5, factor = 0.62, lifeSeconds = 35) {
        const width = Math.max(3, radius * 2);
        const depth = Math.max(3, radius * 2);
        this.slowZones.push({ x, z, width, depth, factor, type: 'crater', ttl: lifeSeconds });

        const craterMat = new THREE.MeshStandardMaterial({
            color: 0x4d3a33,
            roughness: 0.95,
            flatShading: true
        });
        const crater = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.72, 0.22, 14), craterMat);
        crater.position.set(x, this.getHeightAt(x, z) + 0.05, z);
        crater.userData.mapGenerated = true;
        crater.userData.craterLife = lifeSeconds;
        this.scene.add(crater);
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
            if (!canPlace(tile.x, tile.z, 34)) continue;
            if (!this.isChestClear(tile.x, tile.z, 5)) continue;
            if (!this.registerSpawnBounds(tile.x, tile.z, 10.5, 10.5, 1.2)) continue;

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

            const hutWidth = 4.8;
            const hutDepth = 4.8;
            const hutHeight = 3.2;
            const hutWall = 0.24;
            const hutWallY = baseY + 10.4;
            const doorWidth = 1.65;
            const frontSeg = (hutWidth - doorWidth) * 0.5;

            const hutLeft = new THREE.Mesh(new THREE.BoxGeometry(hutWall, hutHeight, hutDepth), woodMat);
            hutLeft.position.set(x - hutWidth * 0.5 + hutWall * 0.5, hutWallY, z);
            hutLeft.userData.mapGenerated = true;
            group.add(hutLeft);
            this.addColliderBox(hutLeft.position.clone(), hutWall + 0.08, hutHeight, hutDepth, false);

            const hutRight = new THREE.Mesh(new THREE.BoxGeometry(hutWall, hutHeight, hutDepth), woodMat);
            hutRight.position.set(x + hutWidth * 0.5 - hutWall * 0.5, hutWallY, z);
            hutRight.userData.mapGenerated = true;
            group.add(hutRight);
            this.addColliderBox(hutRight.position.clone(), hutWall + 0.08, hutHeight, hutDepth, false);

            const hutBack = new THREE.Mesh(new THREE.BoxGeometry(hutWidth, hutHeight, hutWall), woodMat);
            hutBack.position.set(x, hutWallY, z - hutDepth * 0.5 + hutWall * 0.5);
            hutBack.userData.mapGenerated = true;
            group.add(hutBack);
            this.addColliderBox(hutBack.position.clone(), hutWidth + 0.08, hutHeight, hutWall + 0.08, false);

            const hutFrontL = new THREE.Mesh(new THREE.BoxGeometry(frontSeg, hutHeight, hutWall), woodMat);
            hutFrontL.position.set(x - doorWidth * 0.5 - frontSeg * 0.5, hutWallY, z + hutDepth * 0.5 - hutWall * 0.5);
            hutFrontL.userData.mapGenerated = true;
            group.add(hutFrontL);
            this.addColliderBox(hutFrontL.position.clone(), frontSeg + 0.06, hutHeight, hutWall + 0.08, false);

            const hutFrontR = new THREE.Mesh(new THREE.BoxGeometry(frontSeg, hutHeight, hutWall), woodMat);
            hutFrontR.position.set(x + doorWidth * 0.5 + frontSeg * 0.5, hutWallY, z + hutDepth * 0.5 - hutWall * 0.5);
            hutFrontR.userData.mapGenerated = true;
            group.add(hutFrontR);
            this.addColliderBox(hutFrontR.position.clone(), frontSeg + 0.06, hutHeight, hutWall + 0.08, false);

            const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 2.8, 4), new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.85, flatShading: true }));
            roof.position.set(x, baseY + 12.8, z);
            roof.rotation.y = Math.PI / 4;
            roof.userData.mapGenerated = true;
            group.add(roof);

            // Walkable staircase to tree-house (no jump needed).
            const ladderX = x;
            const doorZ = z + hutDepth * 0.5 - hutWall * 0.5;
            const stairEndZ = doorZ + 0.32;
            const stairStartZ = stairEndZ + 7.8;
            const stairStartY = baseY + 0.04;
            const stairEndY = baseY + 8.68;
            const stairSegments = 72;
            const stairWidth = 2.6;
            const stairThickness = 0.22;
            const dz = (stairEndZ - stairStartZ) / stairSegments;
            for (let s = 0; s < stairSegments; s++) {
                const t = (s + 1) / stairSegments;
                const stepTopY = stairStartY + (stairEndY - stairStartY) * t;
                const stepZ = stairStartZ + dz * (s + 0.5);
                const stepLen = Math.max(0.24, Math.abs(dz) + 0.08);
                const step = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, stairThickness, stepLen), woodMat);
                step.position.set(ladderX, stepTopY - stairThickness * 0.5, stepZ);
                step.userData.mapGenerated = true;
                group.add(step);
                this.addColliderBox(step.position.clone(), stairWidth, stairThickness, stepLen, true);
            }
            this.climbables.push({
                minX: ladderX - stairWidth * 0.55,
                maxX: ladderX + stairWidth * 0.55,
                minZ: Math.min(stairStartZ, stairEndZ) - 0.6,
                maxZ: Math.max(stairStartZ, stairEndZ) + 0.6,
                minY: baseY,
                maxY: baseY + 9.4,
                topY: baseY + 8.95,
                topX: ladderX,
                topZ: stairEndZ + 0.2
            });

            const topLanding = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.26, 2.9), woodMat);
            topLanding.position.set(x, baseY + 8.78, doorZ + 0.46);
            topLanding.userData.mapGenerated = true;
            group.add(topLanding);
            this.addColliderBox(topLanding.position.clone(), 3.6, 0.26, 2.9, true);

            const canopy = new THREE.Mesh(new THREE.BoxGeometry(11.5, 4.8, 11.5), leafMat);
            canopy.position.set(x, baseY + 14.4, z);
            canopy.userData.mapGenerated = true;
            group.add(canopy);

            this.scene.add(group);
            this.houseSpots.push({ x, z, width: 4.6, depth: 4.6, height: 5.8, style: "treehouse" });
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

// ==================== ГЕНЕРАЦИЯ КВАДРАНТОВ ====================

// Север (Z>0): Лес с рекой и 2 домиками
generateForestQuadrant() {
    const trees = [];
    const houses = [];
    const river = [];

    // Деревья (45 шт)
    for (let i = 0; i < 45; i++) {
        const x = (Math.random() - 0.5) * 400;
        const z = 200 + Math.random() * 50;
        const h = 15 + Math.random() * 15;
        trees.push({ x, z, h });
    }

    // Река (2 сегмента)
    river.push({ x1: -100, z1: 250, x2: 100, z2: 250 });
    river.push({ x1: 100, z1: 250, x2: 100, z2: 150 });

    // Домики (2 шт)
    houses.push({ x: -150, z: 220, width: 12, depth: 10, height: 5 });
    houses.push({ x: 150, z: 220, width: 10, depth: 8, height: 4.5 });

    return { trees, houses, river };
}

// Восток (X>0, Z<0): Лабиринт 12x12
generateFortressQuadrant() {
    const walls = [];
    const gridSize = 12;
    const wallSize = 8;

    // Генерация лабиринта (стены на границах и через каждые 3 клетки)
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            if (row % 3 === 0 || col % 3 === 0) {
                walls.push({
                    x: col * wallSize,
                    z: row * wallSize,
                    w: wallSize,
                    h: 25,
                    d: wallSize
                });
            }
        }
    }

    // Добавляем декор в лабиринт
    const decorations = [];
    for (let i = 0; i < 8; i++) {
        const x = 200 + Math.random() * 100;
        const z = -200 - Math.random() * 100;
        decorations.push({ x, z, type: 'crate' });
    }

    return { walls, decorations };
}

// Юг (Z<0): Арктика со снегом, 6 иглу, 8 кристаллов
generateArcticQuadrant() {
    const snow = [];
    const igloos = [];
    const crystals = [];

    // Сугробы (12 шт)
    for (let i = 0; i < 12; i++) {
        const x = (Math.random() - 0.5) * 400;
        const z = -200 - Math.random() * 50;
        snow.push({ x, z });
    }

    // Иглу (6 шт)
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const r = 100 + Math.random() * 50;
        igloos.push({
            x: Math.cos(angle) * r,
            z: Math.sin(angle) * r - 200
        });
    }

    // Кристаллы (8 шт)
    for (let i = 0; i < 8; i++) {
        const x = (Math.random() - 0.5) * 300;
        const z = -200 - Math.random() * 50;
        crystals.push({ x, z });
    }

    return { snow, igloos, crystals };
}

// Запад (X<0): Руины с 6 танками, 6 баррикад
generateWarQuadrant() {
    const ruins = [];
    const tanks = [];
    const barriers = [];

    // Руины (6 шт)
    for (let i = 0; i < 6; i++) {
        const x = -200 - Math.random() * 50;
        const z = (Math.random() - 0.5) * 400;
        ruins.push({ x, z, width: 20, depth: 15, height: 10 });
    }

    // Танки (6 шт)
    for (let i = 0; i < 6; i++) {
        const x = -200 - Math.random() * 50;
        const z = (Math.random() - 0.5) * 400;
        tanks.push({ x, z });
    }

    // Баррикады (12 шт)
    for (let i = 0; i < 12; i++) {
        const x = -200 - Math.random() * 50;
        const z = (Math.random() - 0.5) * 400;
        barriers.push({ x, z });
    }

    return { ruins, tanks, barriers };
}

// ==================== ПРИМЕНЕНИЕ ГЕНЕРАЦИИ КВАДРАНТОВ ====================

// Вызвать генерацию квадрантов после buildMeshes()
applyQuadrantDecorations() {
    if (!this.floorTiles?.length) return;

    const center = new THREE.Vector3(0, 0, 0);
    const arenaRadius = Math.min(300, this.halfSize - 6);

    // Север: Лес
    if (this.gridHeight > 0) {
        const forestData = this.generateForestQuadrant();
        this.decorateForest(center, arenaRadius, forestData);
    }

    // Восток: Лабиринт
    if (this.gridHeight > 0) {
        const fortressData = this.generateFortressQuadrant();
        this.decorateFortress(center, arenaRadius, fortressData);
    }

    // Юг: Арктика
    if (this.gridHeight > 0) {
        const arcticData = this.generateArcticQuadrant();
        this.decorateArctic(center, arenaRadius, arcticData);
    }

    // Запад: Руины
    if (this.gridHeight > 0) {
        const warData = this.generateWarQuadrant();
        this.decorateWar(center, arenaRadius, warData);
    }
}

// Декорация леса
decorateForest(center, arenaRadius, data) {
    const { trees, houses, river } = data;

    // Деревья
    const trunkGeo = new THREE.BoxGeometry(2.1, 20, 2.1);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9, flatShading: true });
    const leafGeo = new THREE.BoxGeometry(8.4, 7.2, 8.4);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.96, flatShading: true });

    trees.forEach(t => {
        const y = this.getHeightAt(t.x, t.z);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(t.x, y + 10, t.z);
        this.addToMapObjects(trunk);

        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(t.x, y + 18, t.z);
        this.addToMapObjects(leaf);
    });

    // Река
    river.forEach(seg => {
        const y = this.getHeightAt(seg.x1, seg.z1);
        const waterGeo = new THREE.PlaneGeometry(12, 8);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x4fc3ff,
            transparent: true,
            opacity: 0.8,
            roughness: 0.2
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.set((seg.x1 + seg.x2) / 2, y + 0.2, (seg.z1 + seg.z2) / 2);
        this.addToMapObjects(water);
    });

    // Домики
    houses.forEach(h => {
        const group = new THREE.Group();
        const wallMat = new THREE.MeshStandardMaterial({ color: 0xc9b08d, roughness: 0.9, flatShading: true });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x5f4638, roughness: 0.82, flatShading: true });
        this.addOpenBuildingShell(group, new THREE.Vector3(h.x, 0, h.z), {
            width: h.width,
            depth: h.depth,
            height: h.height,
            wallColor: 0xc9b08d,
            roofColor: 0x5f4638,
            doorWidth: 2.4
        });
        this.addToMapObjects(group);
    });
}

// Декорация лабиринта
decorateFortress(center, arenaRadius, data) {
    const { walls, decorations } = data;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8f8575, roughness: 0.9, flatShading: true });

    walls.forEach(w => {
        const y = this.getHeightAt(w.x, w.z);
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), wallMat);
        wall.position.set(w.x, y + w.h / 2, w.z);
        this.addToMapObjects(wall);
    });

    // Декор в лабиринте
    decorations.forEach(d => {
        const x = d.x;
        const z = d.z;
        const y = this.getHeightAt(x, z);
        const crate = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
        crate.position.set(x, y + 0.75, z);
        this.addToMapObjects(crate);
    });
}

// Декорация арктики
decorateArctic(center, arenaRadius, data) {
    const { snow, igloos, crystals } = data;

    // Сугробы
    const snowGeo = new THREE.ConeGeometry(4, 6, 8);
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true });
    snow.forEach(s => {
        const y = this.getHeightAt(s.x, s.z);
        const snowMound = new THREE.Mesh(snowGeo, snowMat);
        snowMound.position.set(s.x, y + 3, s.z);
        this.addToMapObjects(snowMound);
    });

    // Иглу
    const iglooGeo = new THREE.CylinderGeometry(3, 4, 3, 8);
    const iglooMat = new THREE.MeshStandardMaterial({ color: 0xbce6ff, roughness: 0.3, flatShading: true });
    igloos.forEach(i => {
        const y = this.getHeightAt(i.x, i.z);
        const igloo = new THREE.Mesh(iglooGeo, iglooMat);
        igloo.position.set(i.x, y + 1.5, i.z);
        this.addToMapObjects(igloo);
    });

    // Кристаллы
    const crystalGeo = new THREE.IcosahedronGeometry(2, 0);
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x9bf, roughness: 0.4, metalness: 0.3, flatShading: true });
    crystals.forEach(c => {
        const y = this.getHeightAt(c.x, c.z);
        const crystal = new THREE.Mesh(crystalGeo, crystalMat);
        crystal.position.set(c.x, y + 2, c.z);
        this.addToMapObjects(crystal);
    });
}

// Декорация руин
decorateWar(center, arenaRadius, data) {
    const { ruins, tanks, barriers } = data;

    // Руины
    const ruinMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.9, flatShading: true });
    ruins.forEach(r => {
        const group = new THREE.Group();
        const wall = new THREE.Mesh(new THREE.BoxGeometry(r.width, r.height, r.depth), ruinMat);
        wall.position.set(0, r.height / 2, 0);
        group.add(wall);
        // Разрушения
        const rubble = new THREE.Mesh(new THREE.BoxGeometry(r.width * 0.6, r.height * 0.4, r.depth * 0.6), new THREE.MeshStandardMaterial({ color: 0x3a3a3a }));
        rubble.position.set(0, r.height * 0.2, 0);
        group.add(rubble);
        this.addToMapObjects(group);
    });

    // Танки
    const tankGeo = new THREE.BoxGeometry(10, 4, 3);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x4a6b4a, roughness: 0.8, flatShading: true });
    tanks.forEach(t => {
        const y = this.getHeightAt(t.x, t.z);
        const tank = new THREE.Mesh(tankGeo, tankMat);
        tank.position.set(t.x, y + 2, t.z);
        this.addToMapObjects(tank);
    });

    // Баррикады
    const sandbagGeo = new THREE.BoxGeometry(2, 1, 1);
    const sandbagMat = new THREE.MeshStandardMaterial({ color: 0xb39a74, roughness: 0.95, flatShading: true });
    barriers.forEach(b => {
        const y = this.getHeightAt(b.x, b.z);
        const barrier = new THREE.Mesh(sandbagGeo, sandbagMat);
        barrier.position.set(b.x, y + 0.5, b.z);
        this.addToMapObjects(barrier);
    });
}
}

