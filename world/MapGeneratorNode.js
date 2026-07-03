// Roblox-style tile textures — quadrant-based map
const TILE_SIZE = 4;

// Central spawn platform — compact to leave room for biomes
const SPAWN_PLATFORM_RADIUS = 25;
const SPAWN_PLATFORM_COUNT = 50;
const SPAWN_PLATFORM_SIZE = 5;

// Materials
const TILE_COLORS = {
    spawnPad: 0xC2B280,
    cornucopia: 0xFFD700,
    cornucopiaInner: 0xDAA549,
    river: 0x29B6F6,
    bridge: 0x8D6E63,
    spawnPlatform: 0xC2B280,
    fountainBase: 0xC2B280,
    fountainColumn: 0xFFD700,
    roadDirt: 0x8D6E63,
    roadStone: 0x9E9E9E,
};

const TRIANGLE_COLOR = 0xFFD700;
const TRIANGLE_COUNT = 50;
const ROAD_NORTH_OFFSET = 45;
const ROAD_SOUTH_OFFSET = -45;
const ROAD_WEST_OFFSET = -45;
const ROAD_EAST_OFFSET = 45;

export class MapGeneratorNode {
    constructor(scene) {
        this.scene = scene;
        this.tiles = new Map(); // key: "x,y" -> tileMesh
        this.spawnPads = []; // Public array for main.js to access spawn pads
    }

    getSpawnPads() {
        return [...this.spawnPads];
    }

    _addSpawnPad(x, y) {
        // Spawn pads are now managed by MapGenerator.js — this method is a no-op stub
        // to prevent legacy code from corrupting the spawn pad list.
    }

    // Загрузка текстуры тайла
    loadTexture(type) {
        // Для Roblox-style используем процедурные материалы
        return null; // Пока без текстур, используем цвета
    }

    // Загрузка модели тайла
    loadModel(type, position) {
        // Пока без моделей, используем примитивы
        return null;
    }

    // Создать бежевый каменный тайл
    createStoneTile(color) {
        const geometry = new THREE.BoxGeometry(TILE_SIZE, 0.2, TILE_SIZE);
        const material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.8,
            flatShading: true
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = 0.1;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = true;
        return mesh;
    }

    // Создать огненный символ на платформе - яркий и чёткий
    createTriangle(x, y, z) {
        const group = new THREE.Group();

        // Внешний огненный конус
        const outerGeo = new THREE.ConeGeometry(0.5, 1.0, 3);
        const outerMat = new THREE.MeshStandardMaterial({
            color: 0xFF4400,
            emissive: 0xFF2200,
            emissiveIntensity: 6.0,
            roughness: 0.1,
            metalness: 0.8,
            flatShading: true
        });
        const outer = new THREE.Mesh(outerGeo, outerMat);
        group.add(outer);

        // Внутреннее белое ядро
        const innerGeo = new THREE.ConeGeometry(0.25, 0.7, 3);
        const innerMat = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            emissive: 0xFFAA00,
            emissiveIntensity: 10.0,
            roughness: 0.0,
            transparent: true,
            opacity: 0.9,
            flatShading: true
        });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        inner.position.y = 0.1;
        group.add(inner);

        group.position.set(x + TILE_SIZE / 2 - 0.15, 0.3, y + TILE_SIZE / 2 - 0.15);
        group.rotation.x = Math.PI / 2;
        group.userData.isFirePattern = true;
        return group;
    }

    // Создать спавн-платформу
    createSpawnPlatform(x, y) {
        const platform = new THREE.Group();
        const size = SPAWN_PLATFORM_SIZE;

        // Основание
        const baseGeometry = new THREE.BoxGeometry(size, 0.1, size);
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: TILE_COLORS.spawnPlatform,
            roughness: 0.8,
            flatShading: true
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = 0.05;
        platform.add(base);

        // Круглая платформа сверху
        const ringGeometry = new THREE.TorusGeometry(size / 2 - 0.3, 0.08, 8, 24);
        const ringMaterial = new THREE.MeshStandardMaterial({
            color: TILE_COLORS.spawnPlatform,
            roughness: 0.8,
            flatShading: true
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.35;
        platform.add(ring);

        // Центральный круг
        const centerGeometry = new THREE.CircleGeometry(size / 2 - 0.5, 12);
        const centerMaterial = new THREE.MeshStandardMaterial({
            color: 0xD2B48C, // Светло-бежевый
            roughness: 0.8,
            flatShading: true
        });
        const center = new THREE.Mesh(centerGeometry, centerMaterial);
        center.rotation.x = Math.PI / 2;
        center.position.y = 0.35;
        platform.add(center);

        // Позиция
        platform.position.set(x, 0, y);
        platform.userData.isSpawnPlatform = true;

        this.scene.add(platform);
        return platform;
    }

    // Центральный фонтан с анимацией воды
    createFountain() {
        const fountain = new THREE.Group();

        // Каменная база
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 0.8,
            flatShading: true
        });

        // Нижний бассейн (широкий)
        const basinGeo = new THREE.CylinderGeometry(6, 7, 1.5, 16);
        const basin = new THREE.Mesh(basinGeo, stoneMat.clone());
        basin.position.y = 0.75;
        fountain.add(basin);

        // Вода в бассейне
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x4488FF,
            emissive: 0x2244AA,
            emissiveIntensity: 0.3,
            roughness: 0.1,
            transparent: true,
            opacity: 0.7,
            flatShading: true
        });
        const waterGeo = new THREE.CylinderGeometry(5.8, 5.8, 0.3, 16);
        const water = new THREE.Mesh(waterGeo, waterMat.clone());
        water.position.y = 1.2;
        water.userData.isWater = true;
        fountain.add(water);

        // Центральная колонна
        const columnGeo = new THREE.CylinderGeometry(1.5, 2, 4, 12);
        const column = new THREE.Mesh(columnGeo, stoneMat.clone());
        column.position.y = 3;
        fountain.add(column);

        // Верхняя чаша
        const upperBasinGeo = new THREE.CylinderGeometry(3, 2.5, 0.8, 12);
        const upperBasin = new THREE.Mesh(upperBasinGeo, stoneMat.clone());
        upperBasin.position.y = 5.4;
        fountain.add(upperBasin);

        // Вода в верхней чаше
        const upperWaterGeo = new THREE.CylinderGeometry(2.8, 2.8, 0.2, 12);
        const upperWater = new THREE.Mesh(upperWaterGeo, waterMat.clone());
        upperWater.position.y = 5.6;
        upperWater.userData.isWater = true;
        fountain.add(upperWater);

        // Декоративные элементы - 4 маленьких колонны по углам
        const smallPositions = [
            { x: 4, z: 4 }, { x: -4, z: 4 },
            { x: 4, z: -4 }, { x: -4, z: -4 }
        ];

        for (const pos of smallPositions) {
            const smallColumnGeo = new THREE.CylinderGeometry(0.5, 0.6, 2, 8);
            const smallColumn = new THREE.Mesh(smallColumnGeo, stoneMat.clone());
            smallColumn.position.set(pos.x, 1, pos.z);
            fountain.add(smallColumn);
        }

        // Анимированные капли воды (будут обновляться в game loop)
        const dropCount = 20;
        const drops = [];
        for (let i = 0; i < dropCount; i++) {
            const angle = (i / dropCount) * Math.PI * 2;
            const radius = 2.5 + Math.random() * 0.5;
            const dropGeo = new THREE.SphereGeometry(0.15, 6, 6);
            const drop = new THREE.Mesh(dropGeo, waterMat.clone());
            drop.position.set(
                Math.cos(angle) * radius,
                5.5,
                Math.sin(angle) * radius
            );
            drop.userData.isWaterDrop = true;
            drop.userData.dropAngle = angle;
            drop.userData.dropSpeed = 0.5 + Math.random() * 0.3;
            drops.push(drop);
            fountain.add(drop);
        }

        // Верхний фонтан (маленький шар сверху)
        const topGeo = new THREE.SphereGeometry(0.8, 12, 12);
        const topSphere = new THREE.Mesh(topGeo, stoneMat.clone());
        topSphere.position.y = 6.5;
        fountain.add(topSphere);

        fountain.userData.isFountain = true;
        fountain.userData.drops = drops;
        return fountain;
    }

    // Обновить анимацию фонтана
    updateFountainAnimation(delta) {
        const fountain = Array.from(this.scene.children).find(
            c => c.userData && c.userData.isFountain
        );
        if (!fountain) return;

        // Анимация капель воды
        for (const drop of fountain.userData.drops) {
            drop.position.y -= drop.userData.dropSpeed * delta;
            if (drop.position.y < 1.5) {
                drop.position.y = 5.5;
            }
        }

        // Пульсация воды
        const waterMeshes = fountain.children.filter(c => c.userData.isWater);
        for (const water of waterMeshes) {
            water.material.emissiveIntensity = 0.3 + Math.sin(Date.now() * 0.002) * 0.1;
        }
    }

    // Создать дорожку
    createRoad(x1, y1, x2, y2, roadType) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const steps = Math.max(dx, dy);
        const sx = (x2 - x1) / steps;
        const sy = (y2 - y1) / steps;

        const isDirt = roadType === 'n' || roadType === 'w';

        for (let i = 0; i <= steps; i++) {
            const x = x1 + sx * i;
            const y = y1 + sy * i;

            // Округляем до тайлов
            const tx = Math.floor(x + 0.5);
            const ty = Math.floor(y + 0.5);
            const key = `${tx},${ty}`;

            if (!this.tiles.has(key)) {
                const color = isDirt ? TILE_COLORS.roadDirt : TILE_COLORS.roadStone;
                const mesh = this.createStoneTile(color);
                mesh.position.set(tx, 0, ty);
                this.tiles.set(key, mesh);
            }
        }
    }

    getSpawnPads() {
        return [...this.spawnPads];
    }

    createSpawnPlatforms() {
        const radius = SPAWN_PLATFORM_RADIUS;
        for (let i = 0; i < SPAWN_PLATFORM_COUNT; i++) {
            const angleStep = Math.PI * 2 / SPAWN_PLATFORM_COUNT;
            const x = Math.cos(i * angleStep) * radius;
            const y = Math.sin(i * angleStep) * radius;
            this.createSpawnPlatform(x, -y); // negate Y for Roblox coordinate system
        }
    }

    // Заполнить дорожки
    createRoads() {
        // Север (n)
        this.createRoad(0, -ROAD_NORTH_OFFSET, 0, -ROAD_NORTH_OFFSET - 16, 'n');
        // Юг (s)
        this.createRoad(0, ROAD_SOUTH_OFFSET, 0, ROAD_SOUTH_OFFSET + 16, 's');
        // Запад (w)
        this.createRoad(-ROAD_WEST_OFFSET, 0, -ROAD_WEST_OFFSET - 16, 0, 'w');
        // Восток (e)
        this.createRoad(ROAD_EAST_OFFSET, 0, ROAD_EAST_OFFSET + 16, 0, 'e');
    }

    // Заполнить треугольные узоры на платформе
    createTriangles() {
        const centerX = 0;
        const centerY = 0;
        const platformRadius = 32;
        const angleStep = (2 * Math.PI) / TRIANGLE_COUNT;

        for (let i = 0; i < TRIANGLE_COUNT; i++) {
            const angle = i * angleStep;
            const x = Math.cos(angle) * (platformRadius - 2);
            const y = Math.sin(angle) * (platformRadius - 2);
            this.createTriangle(x, y, 0);
        }
    }

    // Инициализация центра — raised mosaic hub with fountain and 50 spawn pads
    init() {
        const mat = new THREE.MeshStandardMaterial({
            color: TILE_COLORS.spawnPlatform, roughness: 0.7, flatShading: true,
            polygonOffset: true,
            polygonOffsetFactor: -5,
            polygonOffsetUnits: -10
        });

        // Raised square mosaic platform (y=2 top surface) — compact
        const baseGeo = new THREE.BoxGeometry(50, 2, 50);
        const baseMesh = new THREE.Mesh(baseGeo, mat.clone());
        baseMesh.position.set(0, 1, 0);
        baseMesh.userData.mapGenerated = true;
        this.scene.add(baseMesh);

        // Fountain sitting on the platform surface (y=2)
        const fountain = this.createFountain();
        if (fountain) {
            fountain.position.set(0, 2, 0);
            fountain.userData.mapGenerated = true;
            this.scene.add(fountain);
        }

        // Spawn platforms — 50 pads on central platform, each entity gets its own separate pad
        const edgeRadius = 18;
        const platformSurfaceY = 2;
        const SPAWN_PLATFORM_COUNT = 50;
        for (let i = 0; i < SPAWN_PLATFORM_COUNT; i++) {
            const angleStep = Math.PI * 2 / SPAWN_PLATFORM_COUNT;
            const x = Math.cos(i * angleStep) * edgeRadius;
            const z = -Math.sin(i * angleStep) * edgeRadius;

            const padGeo = new THREE.CylinderGeometry(0.9, 1.0, 0.3, 8);
            const padMat = new THREE.MeshStandardMaterial({
                color: 0x3a3a3a, roughness: 0.9, flatShading: true
            });
            const padMesh = new THREE.Mesh(padGeo, padMat);
            padMesh.position.set(x, platformSurfaceY + 0.15, z);
            padMesh.userData.isSpawnPlatform = true;
            this.scene.add(padMesh);

            const padRingGeo = new THREE.TorusGeometry(1.0, 0.16, 8, 32);
            const padRingMat = new THREE.MeshStandardMaterial({
                color: 0xFF6600, emissive: 0xFF3300, emissiveIntensity: 8.0,
                roughness: 0.2, metalness: 0.6, flatShading: true
            });
            const padRing = new THREE.Mesh(padRingGeo, padRingMat);
            padRing.rotation.x = Math.PI / 2;
            padRing.position.set(x, platformSurfaceY + 0.3, z);
            padRing.userData.isSpawnPlatform = true;
            this.scene.add(padRing);

            const innerRingGeo = new THREE.TorusGeometry(1.0, 0.12, 8, 32);
            const innerRingMat = new THREE.MeshStandardMaterial({
                color: 0xFFFFFF, emissive: 0xFFAA00, emissiveIntensity: 12.0,
                roughness: 0.1, transparent: true, opacity: 0.8, flatShading: true
            });
            const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
            innerRing.rotation.x = Math.PI / 2;
            innerRing.position.set(x, platformSurfaceY + 0.3, z);
            innerRing.userData.isSpawnPlatform = true;
            this.scene.add(innerRing);

            this.spawnPads.push({ x, y: platformSurfaceY, z });
        }
    }

    dispose() {
        for (const [, mesh] of this.tiles) {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        this.tiles.clear();

        const fountain = Array.from(this.scene.children).find(
            c => c.userData && c.userData.isFountain
        );
        if (fountain) {
            fountain.traverse((child) => {
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

        this.scene.traverse((child) => {
            if (child.userData.isSpawnPlatform && !this.tiles.has(`${Math.round(child.position.x)},${Math.round(child.position.z)}`)) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            }
        });
    }

}
