// Roblox-style tile textures
const TILE_SIZE = 4;

// Центральный спавн
const SPAWN_PLATFORM_RADIUS = 32;
const SPAWN_PLATFORM_COUNT = 50;
const SPAWN_PLATFORM_SIZE = 5;

// Дороги
const ROAD_WIDTH = 6;
const ROAD_NORTH_OFFSET = 16;
const ROAD_SOUTH_OFFSET = 32;
const ROAD_WEST_OFFSET = 16;
const ROAD_EAST_OFFSET = 32;

// Материалы
const TILE_COLORS = {
    spawnPlatform: 0xC2B280,      // Бежевый камень
    roadDirt: 0x8B7355,           // Земля (север, запад)
    roadStone: 0x757575,          // Серый камень (юг, восток)
    fountain: 0x4DA6FF,           // Синяя кристальная вода
    fountainColumn: 0xFFD700,     // Золотой столб
    fountainBase: 0xB8A888        // Бежевая база
};

// Треугольные узоры
const TRIANGLE_COLOR = 0xFF4500; // Огненно-красный
const TRIANGLE_COUNT = 36;

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
        if (Math.abs(y - 0.34) < 0.1 && x >= 0 && x <= this.spawnPads.length * 256) {
            this.spawnPads.push({ x: Math.floor(Math.random() * 16), z: Math.floor(Math.random() * 16)});
        }
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
        mesh.frustumCulled = false;
        return mesh;
    }

    // Создать треугольный узор
    createTriangle(x, y, z) {
        const geometry = new THREE.ConeGeometry(0.3, 0.6, 3);
        const material = new THREE.MeshStandardMaterial({
            color: TRIANGLE_COLOR,
            emissive: 0x8B0000,
            emissiveIntensity: 0.3,
            roughness: 0.6,
            metalness: 0.3,
            flatShading: true
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x + TILE_SIZE / 2 - 0.15, 0.3, y + TILE_SIZE / 2 - 0.15);
        mesh.rotation.x = Math.PI / 2;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        return mesh;
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

    // Создать фонтан
    createFountain() {
        const fountain = new THREE.Group();

        // База
        const baseGeometry = new THREE.CylinderGeometry(4, 4, 0.3, 12);
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: TILE_COLORS.fountainBase,
            roughness: 0.8,
            flatShading: true
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = 0.15;
        fountain.add(base);

        // Столб
        const columnGeometry = new THREE.CylinderGeometry(0.8, 0.8, 8, 12);
        const columnMaterial = new THREE.MeshStandardMaterial({
            color: TILE_COLORS.fountainColumn,
            emissive: 0xFFD700,
            emissiveIntensity: 0.2,
            roughness: 0.6,
            metalness: 0.4,
            flatShading: true
        });
        const column = new THREE.Mesh(columnGeometry, columnMaterial);
        column.position.y = 4.15;
        fountain.add(column);

        // Водная чаша
        const basinGeometry = new THREE.CylinderGeometry(3.5, 3.5, 0.5, 16);
        const basinMaterial = new THREE.MeshStandardMaterial({
            color: 0x4DA6FF,
            emissive: 0x4DA6FF,
            emissiveIntensity: 0.3,
            roughness: 0.3,
            metalness: 0.5,
            flatShading: true
        });
        const basin = new THREE.Mesh(basinGeometry, basinMaterial);
        basin.position.y = 8.3;
        fountain.add(basin);

        // Анимация воды
        fountain.userData.animateWater = true;
        fountain.userData.waterTime = 0;

        fountain.position.set(0, 0, 0);
        fountain.userData.isFountain = true;

        this.scene.add(fountain);
        return fountain;
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
            color: TILE_COLORS.spawnPlatform, roughness: 0.7, flatShading: true });

        // Raised circular mosaic platform (y=2 top surface)
        const baseGeo = new THREE.CylinderGeometry(45, 48, 2, 32);
        const baseMesh = new THREE.Mesh(baseGeo, mat.clone());
        baseMesh.position.set(0, 1, 0);
        baseMesh.userData.mapGenerated = true;
        this.scene.add(baseMesh);

        // Decorative mosaic rings on platform surface
        for (let r = 8; r <= 40; r += 6) {
            const ringGeo = new THREE.TorusGeometry(r, 0.3, 8, 48);
            const isGold = r % 12 === 0;
            const ringMat = new THREE.MeshStandardMaterial({
                color: isGold ? 0xFFD700 : TILE_COLORS.spawnPlatform,
                roughness: isGold ? 0.6 : 0.75, flatShading: true });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.rotation.x = Math.PI / 2;
            ringMesh.position.set(0, 2.18, 0);
            ringMesh.userData.mapGenerated = true;
            this.scene.add(ringMesh);
        }

        // Sunburst decorative lines from center (every 30 degrees)
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const lineGeo = new THREE.BoxGeometry(0.4, 0.15, 38);
            const lineMat = new THREE.MeshStandardMaterial({
                color: 0xFFA500, roughness: 0.7, flatShading: true });
            const lineMesh = new THREE.Mesh(lineGeo, lineMat);
            lineMesh.position.set(0, 2.18, 0);
            lineMesh.rotation.y = angle;
            lineMesh.userData.mapGenerated = true;
            this.scene.add(lineMesh);
        }

        // Golden fountain sitting on the platform
        const fountain = this.createFountain();
        if (fountain) {
            fountain.position.set(0, 2.5, 0);
            fountain.userData.mapGenerated = true;
            this.scene.add(fountain);
            this.spawnPads.push({ x: 0, z: 0 });
        }

        // 50 spawn platforms arranged around the circle on top of raised base (y=2.18)
        for (let i = 0; i < SPAWN_PLATFORM_COUNT; i++) {
            const angleStep = Math.PI * 2 / SPAWN_PLATFORM_COUNT;
            const x = Math.cos(i * angleStep) * SPAWN_PLATFORM_RADIUS;
            const z = -Math.sin(i * angleStep) * SPAWN_PLATFORM_RADIUS;

            // Circular pad at platform level
            const padGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.3, 8);
            const padMat = new THREE.MeshStandardMaterial({
                color: TILE_COLORS.spawnPlatform, roughness: 0.75, flatShading: true });
            const padMesh = new THREE.Mesh(padGeo, padMat);
            padMesh.position.set(x, 2.18, z);
            padMesh.userData.isSpawnPlatform = true;
            this.scene.add(padMesh);

            // Tiny golden ring around each spawn pad
            const padRingGeo = new THREE.TorusGeometry(1.3, 0.05, 8, 24);
            const padRingMat = new THREE.MeshStandardMaterial({
                color: 0xFFD700, roughness: 0.5, metalness: 0.3, flatShading: true });
            const padRing = new THREE.Mesh(padRingGeo, padRingMat);
            padRing.rotation.x = Math.PI / 2;
            padRing.position.set(x, 2.18, z);
            padRing.userData.isSpawnPlatform = true;
            this.scene.add(padRing);

            // Register for game loop
            this.spawnPads.push({ x, z });
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
                if (child.material) child.material.dispose();
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
