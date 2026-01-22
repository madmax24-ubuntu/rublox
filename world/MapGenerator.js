import * as THREE from 'three';

const NoiseClass = typeof SimplexNoise !== 'undefined'
    ? SimplexNoise
    : class {
        noise2D(x, y) {
            const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
            return (s - Math.floor(s)) * 2 - 1;
        }
    };

export class MapGenerator {
    constructor(scene) {
        this.scene = scene;
        this.simplex = new NoiseClass();
        this.size = 600;
        this.segments = 128;
        this.waterLevel = -2;
        this.groundMesh = null;
        this.chestSpots = [];
        this.colliders = [];
        this.spawnPads = [];
        this.cellHeights = null;
        this.heightData = null;
        this.gridSize = this.segments + 1;
        this.halfSize = this.size / 2;
        this.chestBlockers = [];
        this.textures = {};
        this.mazeConfig = {
            gridCount: 121,
            cellSize: 5,
            wallHeight: 10,
            wallThickness: 2.2,
            centerClear: 34
        };
        this.courtyardSize = 60;
        this.courtyardGate = null;
        this.oneWayGates = [];
        this.biomeColors = {
            beach: 0xf2e2b6,
            forest: 0x2e7d32,
            lake: 0x4aa3ff,
            ocean: 0x3b6ea8,
            lava: 0xb23b16,
            snow: 0xf5f7ff,
            mountain: 0x9e9e9e,
            rim: 0x616161
        };

        this.layout = this.buildLayout();
        this.generate();
    }

    buildLayout() {
        const islands = [
            { pos: new THREE.Vector2(0, 0), radius: 70 },
            { pos: new THREE.Vector2(-70, -25), radius: 45 },
            { pos: new THREE.Vector2(75, -15), radius: 42 },
            { pos: new THREE.Vector2(-45, 60), radius: 38 },
            { pos: new THREE.Vector2(55, 65), radius: 36 },
            { pos: new THREE.Vector2(0, 85), radius: 26 }
        ];

        const lagoons = [
            { pos: new THREE.Vector2(-10, -15), radius: 16 },
            { pos: new THREE.Vector2(30, 10), radius: 13 },
            { pos: new THREE.Vector2(-40, 35), radius: 12 },
            { pos: new THREE.Vector2(40, 45), radius: 10 }
        ];

        const volcano = { pos: new THREE.Vector2(75, -15), radius: 12 };
        const snowCap = { pos: new THREE.Vector2(0, 0), radius: 16 };

        return { islands, lagoons, volcano, snowCap };
    }

    randomInRing(minRadius, maxRadius) {
        const angle = Math.random() * Math.PI * 2;
        const maxR = Math.min(maxRadius, this.halfSize - 10);
        const minR = Math.min(minRadius, Math.max(8, maxR - 6));
        const radius = minR + Math.random() * (maxR - minR);
        return new THREE.Vector2(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius
        );
    }

    polarToVec(angleDeg, radius) {
        const angle = (angleDeg * Math.PI) / 180;
        return new THREE.Vector2(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius
        );
    }

    smoothstep(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    sampleHeight(x, z) {
        const low = this.simplex.noise2D(x * 0.003, z * 0.003) * 7;
        const high = this.simplex.noise2D(x * 0.016, z * 0.016) * 1.4;
        return low + high;
    }

    generate() {
        this.createMazeFloor();
        this.createMaze();
        this.createCourtyard();
        this.createOneWayGates();
        this.createMazeTraps();
        this.createRimWall();
        this.createZoneWall();
    }

    getTexture(key, build) {
        if (!this.textures[key]) {
            this.textures[key] = build();
        }
        return this.textures[key];
    }

    createNoiseTexture(colorA, colorB, size = 64, scale = 8) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        for (let y = 0; y < size; y += scale) {
            for (let x = 0; x < size; x += scale) {
                const pick = Math.random() > 0.5 ? colorA : colorB;
                ctx.fillStyle = `#${pick.toString(16).padStart(6, '0')}`;
                ctx.fillRect(x, y, scale, scale);
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(8, 8);
        return texture;
    }

    createMazeFloor() {
        const baseHeight = 0;
        const gridStep = 4;
        const gridCount = Math.floor(this.size / gridStep) + 1;
        this.gridSize = gridCount;
        this.halfSize = this.size / 2;
        this.gridStep = gridStep;
        this.cellHeights = new Float32Array((gridCount - 1) * (gridCount - 1));
        this.cellHeights.fill(baseHeight);

        const stoneTex = this.getTexture('stone', () => this.createNoiseTexture(0x8a8a8a, 0x777777));
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x9a9a9a,
            map: stoneTex,
            roughness: 0.9,
            flatShading: true
        });
        const floor = new THREE.Mesh(
            new THREE.BoxGeometry(this.size, 2, this.size),
            floorMat
        );
        floor.position.set(0, baseHeight - 1, 0);
        floor.userData.isEntity = false;
        this.groundMesh = floor;
        this.scene.add(floor);
    }

    createCourtyard() {
        const yardSize = this.courtyardSize;
        const grassTex = this.getTexture('grass', () => this.createNoiseTexture(0x3f8f3f, 0x2f7a2f));
        const grassMat = new THREE.MeshStandardMaterial({
            color: 0x3ea63e,
            map: grassTex,
            roughness: 0.95,
            flatShading: true
        });
        const grassBase = new THREE.Mesh(
            new THREE.BoxGeometry(yardSize, 0.3, yardSize),
            grassMat
        );
        grassBase.position.set(0, 0.15, 0);
        this.scene.add(grassBase);
        this.addColliderBox(grassBase.position, yardSize, 0.3, yardSize);

        // Courtyard kept minimal: grass base, spawn pads, walls/gate.

        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x9e9e9e,
            map: this.getTexture('stone', () => this.createNoiseTexture(0x8a8a8a, 0x777777)),
            roughness: 0.85,
            flatShading: true
        });
        const wallHeight = 7;
        const wallThickness = 2.2;
        const wallLength = yardSize + 10;
        const gap = 16;

        const buildWall = (x, z, rotY, length) => {
            const wall = new THREE.Mesh(
                new THREE.BoxGeometry(length, wallHeight, wallThickness),
                wallMat
            );
            wall.position.set(x, wallHeight / 2 - 0.2, z);
            wall.rotation.y = rotY;
            this.scene.add(wall);
            this.addColliderBox(wall.position, length, wallHeight, wallThickness, false);
        };

        const segment = (wallLength - gap) / 2;
        const offset = gap / 2 + segment / 2;
        const northZ = -(yardSize / 2 + 5);
        const southZ = yardSize / 2 + 5;
        const westX = -(yardSize / 2 + 5);
        const eastX = yardSize / 2 + 5;

        // One exit (north)
        buildWall(-offset, northZ, 0, segment);
        buildWall(offset, northZ, 0, segment);
        buildWall(0, southZ, 0, wallLength);
        buildWall(westX, 0, Math.PI / 2, wallLength);
        buildWall(eastX, 0, Math.PI / 2, wallLength);

        // Gate that closes after 60s and reopens at night
        const gate = new THREE.Mesh(
            new THREE.BoxGeometry(gap, wallHeight, wallThickness),
            wallMat
        );
        gate.position.set(0, wallHeight / 2 - 0.2, northZ);
        gate.visible = false;
        this.scene.add(gate);
        const gateCollider = this.addColliderBox(gate.position, gap, wallHeight, wallThickness, false, false);
        this.courtyardGate = { mesh: gate, collider: gateCollider, open: true, exitZ: northZ };

        // No extra blockers in corridor; only the main gate closes later.

        const boundHeight = wallHeight + 2;
        const boundThickness = 4;
        const northSegment = (yardSize + 10 - gap) / 2;
        const northOffset = gap / 2 + northSegment / 2;
        this.addColliderBox(new THREE.Vector3(-northOffset, boundHeight / 2 - 0.2, northZ), northSegment, boundHeight, boundThickness, false);
        this.addColliderBox(new THREE.Vector3(northOffset, boundHeight / 2 - 0.2, northZ), northSegment, boundHeight, boundThickness, false);
        this.addColliderBox(new THREE.Vector3(0, boundHeight / 2 - 0.2, southZ), yardSize + 10, boundHeight, boundThickness, false);
        this.addColliderBox(new THREE.Vector3(westX, boundHeight / 2 - 0.2, 0), boundThickness, boundHeight, yardSize + 10, false);
        this.addColliderBox(new THREE.Vector3(eastX, boundHeight / 2 - 0.2, 0), boundThickness, boundHeight, yardSize + 10, false);

        const padMat = new THREE.MeshStandardMaterial({
            color: 0xb0bec5,
            map: this.getTexture('stone', () => this.createNoiseTexture(0x9e9e9e, 0x7f7f7f)),
            flatShading: true
        });
        const padRadius = yardSize * 0.45;
        for (let i = 0; i < 32; i++) {
            const angle = (i / 32) * Math.PI * 2;
            const pad = new THREE.Mesh(
                new THREE.BoxGeometry(2.1, 0.35, 2.1),
                padMat
            );
            pad.position.set(Math.cos(angle) * padRadius, 0.2, Math.sin(angle) * padRadius);
            this.scene.add(pad);
            this.spawnPads.push(pad.position.clone());
            this.addColliderBox(pad.position, 2.1, 0.35, 2.1);
        }
    }

    getBiomeType(x, z, dist) {
        const islands = this.layout.islands || [];
        let nearest = null;
        let nearestDist = Infinity;
        for (const island of islands) {
            const d = island.pos.distanceTo(new THREE.Vector2(x, z));
            if (d < nearestDist) {
                nearestDist = d;
                nearest = island;
            }
        }

        if (!nearest || nearestDist > nearest.radius) {
            return 'ocean';
        }

        const lagoon = this.layout.lagoons?.some(l => l.pos.distanceTo(new THREE.Vector2(x, z)) < l.radius);
        if (lagoon) return 'lake';

        const volcanoDist = this.layout.volcano?.pos.distanceTo(new THREE.Vector2(x, z)) ?? Infinity;
        if (volcanoDist < this.layout.volcano.radius) return 'lava';

        const snowDist = this.layout.snowCap?.pos.distanceTo(new THREE.Vector2(x, z)) ?? Infinity;
        if (snowDist < this.layout.snowCap.radius) return 'snow';

        if (nearestDist > nearest.radius * 0.82) return 'beach';
        if (nearestDist < nearest.radius * 0.35) return 'mountain';
        return 'forest';
    }

    createTerrain() {
        const blockSize = 3;
        const gridCount = Math.floor(this.size / blockSize) + 1;
        const half = this.size / 2;
        const arenaRadius = 22;
        const arenaFade = 50;
        const edgeStart = this.size * 0.38;
        const heightStep = 1;
        const baseLevel = this.waterLevel - 6;

        this.gridSize = gridCount;
        this.halfSize = half;
        this.blockSize = blockSize;
        this.gridStep = blockSize;
        this.heightData = new Float32Array(gridCount * gridCount);
        this.cellHeights = new Float32Array((gridCount - 1) * (gridCount - 1));

        for (let z = 0; z < gridCount; z++) {
            for (let x = 0; x < gridCount; x++) {
                const worldX = -half + x * blockSize;
                const worldZ = -half + z * blockSize;
                const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);
                const biome = this.getBiomeType(worldX, worldZ, dist);

                let h = this.waterLevel - 3;
                let islandHeight = 0;
                for (const island of this.layout.islands) {
                    const d = island.pos.distanceTo(new THREE.Vector2(worldX, worldZ));
                    const t = Math.max(0, 1 - (d / island.radius));
                    const falloff = t * t;
                    islandHeight = Math.max(islandHeight, falloff * 9);
                }

                if (islandHeight > 0) {
                    const noise = this.sampleHeight(worldX, worldZ) * 0.35;
                    h = islandHeight + noise;
                }

                if (dist < arenaRadius) {
                    h = Math.max(h, 0);
                } else {
                    const fade = this.smoothstep(arenaRadius, arenaFade, dist);
                    h *= fade;
                }

                if (biome === 'mountain') {
                    h += 3.5;
                } else if (biome === 'snow') {
                    h += 2;
                } else if (biome === 'lava') {
                    h = Math.min(h, 2.4);
                } else if (biome === 'beach') {
                    h = Math.min(h, 1.2);
                }

                if (biome === 'ocean' || biome === 'lake') {
                    h = this.waterLevel - 1.2;
                }

                if (dist > edgeStart) {
                    h += (dist - edgeStart) * 0.02;
                }

                h = Math.round(h / heightStep) * heightStep;
                this.heightData[z * gridCount + x] = h;
            }
        }

        const smoothPasses = 2;
        for (let pass = 0; pass < smoothPasses; pass++) {
            const next = new Float32Array(this.heightData.length);
            for (let z = 0; z < gridCount; z++) {
                for (let x = 0; x < gridCount; x++) {
                    let sum = 0;
                    let count = 0;
                    for (let dz = -1; dz <= 1; dz++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nx = x + dx;
                            const nz = z + dz;
                            if (nx < 0 || nz < 0 || nx >= gridCount || nz >= gridCount) continue;
                            sum += this.heightData[nz * gridCount + nx];
                            count++;
                        }
                    }
                    next[z * gridCount + x] = sum / count;
                }
            }
            this.heightData = next;
        }

        const geometry = new THREE.BoxGeometry(blockSize, 1, blockSize);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const biomeBuckets = new Map();

        for (let z = 0; z < gridCount - 1; z++) {
            for (let x = 0; x < gridCount - 1; x++) {
                const i00 = z * gridCount + x;
                const i10 = z * gridCount + (x + 1);
                const i01 = (z + 1) * gridCount + x;
                const i11 = (z + 1) * gridCount + (x + 1);
                const avgH = (this.heightData[i00] + this.heightData[i10] + this.heightData[i01] + this.heightData[i11]) / 4;
                const worldX = -half + (x + 0.5) * blockSize;
                const worldZ = -half + (z + 0.5) * blockSize;
                const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);
                const biome = this.getBiomeType(worldX, worldZ, dist);
                const height = Math.max(1, avgH - baseLevel);
                if (!biomeBuckets.has(biome)) biomeBuckets.set(biome, []);
                biomeBuckets.get(biome).push({ x: worldX, z: worldZ, height });
                this.cellHeights[z * (gridCount - 1) + x] = avgH;
            }
        }

        const terrainGroup = new THREE.Group();
        terrainGroup.userData.isEntity = false;

        biomeBuckets.forEach((cells, biome) => {
            const baseColor = this.biomeColors[biome] || this.biomeColors.beach;
            const material = new THREE.MeshStandardMaterial({
                color: baseColor,
                flatShading: true,
                roughness: 0.9,
                metalness: 0.0
            });
            const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.userData.isEntity = false;

            cells.forEach((cell, idx) => {
                position.set(cell.x, baseLevel + cell.height / 2, cell.z);
                scale.set(1, cell.height, 1);
                matrix.compose(position, rotation, scale);
                mesh.setMatrixAt(idx, matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
            terrainGroup.add(mesh);
        });

        this.groundMesh = terrainGroup;
        this.scene.add(terrainGroup);
    }

    createWater() {
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x3b6ea8,
            transparent: true,
            opacity: 0.78,
            roughness: 0.15,
            metalness: 0.2,
            flatShading: true
        });

        const ocean = new THREE.Mesh(
            new THREE.PlaneGeometry(this.size * 1.3, this.size * 1.3),
            waterMat
        );
        ocean.rotation.x = -Math.PI / 2;
        ocean.position.set(0, this.waterLevel, 0);
        this.scene.add(ocean);

        const lavaMat = new THREE.MeshStandardMaterial({
            color: 0xff6d00,
            emissive: 0xff3d00,
            emissiveIntensity: 0.6,
            roughness: 0.3,
            metalness: 0.1,
            flatShading: true
        });
        const lava = new THREE.Mesh(
            new THREE.CircleGeometry(this.layout.volcano.radius, 14),
            lavaMat
        );
        lava.rotation.x = -Math.PI / 2;
        lava.position.set(this.layout.volcano.pos.x, this.waterLevel + 0.2, this.layout.volcano.pos.y);
        this.scene.add(lava);
    }

    createCentralMountain() {
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x9e9e9e,
            roughness: 0.9,
            flatShading: true
        });
        const steps = [
            { size: 36, height: 4 },
            { size: 26, height: 4 },
            { size: 18, height: 3.5 },
            { size: 12, height: 3 }
        ];
        let y = this.getHeightAt(0, 0);

        steps.forEach((step, index) => {
            const block = new THREE.Mesh(
                new THREE.BoxGeometry(step.size, step.height, step.size),
                stoneMat
            );
            y += step.height / 2;
            block.position.set(0, y, 0);
            this.scene.add(block);
            y += step.height / 2;
            this.addColliderBox(block.position, step.size, step.height, step.size);

            if (index === steps.length - 1) {
                const spire = new THREE.Mesh(
                    new THREE.CylinderGeometry(1.5, 4, 10, 8),
                    stoneMat
                );
                spire.position.set(0, y + 5, 0);
                this.scene.add(spire);
                this.addColliderBox(spire.position, 6, 10, 6);
            }
        });
    }

    createCornucopia() {
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x9e9e9e,
            roughness: 0.8,
            flatShading: true
        });
        const goldMat = new THREE.MeshStandardMaterial({
            color: 0xffd54f,
            metalness: 0.7,
            roughness: 0.3,
            flatShading: true
        });
        const baseY = this.getHeightAt(0, 0) + 14.5;

        const base = new THREE.Mesh(
            new THREE.BoxGeometry(26, 1.2, 26),
            stoneMat
        );
        base.position.set(0, baseY + 0.6, 0);
        this.scene.add(base);
        this.addColliderBox(base.position, 26, 1.2, 26);

        const upper = new THREE.Mesh(
            new THREE.BoxGeometry(18, 0.8, 18),
            stoneMat
        );
        upper.position.set(0, baseY + 1.2, 0);
        this.scene.add(upper);
        this.addColliderBox(upper.position, 18, 0.8, 18);

        const horn = new THREE.Mesh(
            new THREE.ConeGeometry(4.5, 9, 16, 1, true),
            goldMat
        );
        horn.rotation.z = -Math.PI / 2.4;
        horn.position.set(-4.5, baseY + 6.5, 0);
        this.scene.add(horn);

        const hornBase = new THREE.Mesh(
            new THREE.CylinderGeometry(3, 4.2, 3, 16),
            goldMat
        );
        hornBase.position.set(1, baseY + 2.6, 0);
        this.scene.add(hornBase);

        const crateMat = new THREE.MeshStandardMaterial({
            color: 0x8b5a2b,
            flatShading: true
        });

        for (let i = 0; i < 14; i++) {
            const angle = (i / 14) * Math.PI * 2;
            const r = 4.5 + Math.random() * 4.5;
            const crate = new THREE.Mesh(
                new THREE.BoxGeometry(1.3, 1.1, 1.3),
                crateMat
            );
            crate.position.set(Math.cos(angle) * r, baseY + 1.1, Math.sin(angle) * r);
            crate.rotation.y = Math.random() * Math.PI;
            this.scene.add(crate);
        }

        const padMat = new THREE.MeshStandardMaterial({
            color: 0xb0bec5,
            flatShading: true
        });
        const padRadius = 19;

        for (let i = 0; i < 32; i++) {
            const angle = (i / 32) * Math.PI * 2;
            const pad = new THREE.Mesh(
                new THREE.BoxGeometry(2.1, 0.35, 2.1),
                padMat
            );
            pad.position.set(Math.cos(angle) * padRadius, baseY + 1.3, Math.sin(angle) * padRadius);
            this.scene.add(pad);
            this.spawnPads.push(pad.position.clone());
            this.addColliderBox(pad.position, 2.1, 0.35, 2.1);
        }

        const rampMat = new THREE.MeshStandardMaterial({
            color: 0x9e9e9e,
            flatShading: true
        });

        for (let i = 0; i < 4; i++) {
            const ramp = new THREE.Mesh(
                new THREE.BoxGeometry(10, 1, 4),
                rampMat
            );
            ramp.position.set(Math.cos(i * Math.PI / 2) * 22, baseY + 0.5, Math.sin(i * Math.PI / 2) * 24);
            ramp.rotation.y = i * Math.PI / 2;
            this.scene.add(ramp);
            this.addColliderBox(ramp.position, 10, 1, 4);
        }
    }

    createMaze() {
        const gridCount = this.mazeConfig.gridCount;
        const cellSize = this.mazeConfig.cellSize;
        const wallHeight = this.mazeConfig.wallHeight;
        const wallThickness = this.mazeConfig.wallThickness;
        const half = (gridCount - 1) * cellSize * 0.5;
        const centerClear = this.mazeConfig.centerClear;
        const gateGap = 16;
        const gateZ = -(this.courtyardSize / 2 + 5);
        const isGate = (x, z) => {
            if (z > gateZ + wallThickness * 2 || z < gateZ - wallThickness * 2) return false;
            return Math.abs(x) <= gateGap * 0.6;
        };

        const cells = Array.from({ length: gridCount }, () =>
            Array.from({ length: gridCount }, () => ({
                visited: false,
                inside: false,
                walls: [true, true, true, true]
            }))
        );

        const dirs = [
            { dx: 0, dz: -1, wall: 0, opp: 2 },
            { dx: 1, dz: 0, wall: 1, opp: 3 },
            { dx: 0, dz: 1, wall: 2, opp: 0 },
            { dx: -1, dz: 0, wall: 3, opp: 1 }
        ];

        const innerRadius = this.courtyardSize / 2 + 10;
        const outerRadius = this.size / 2 - 12;
        for (let z = 0; z < gridCount; z++) {
            for (let x = 0; x < gridCount; x++) {
                const worldX = -half + x * cellSize;
                const worldZ = -half + z * cellSize;
                const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);
                cells[z][x].inside = dist >= innerRadius && dist <= outerRadius;
            }
        }

        const stack = [];
        const startX = Math.floor(gridCount / 2);
        const gateCellZ = Math.round((gateZ + half) / cellSize);
        let startZ = Math.min(gridCount - 2, Math.max(1, gateCellZ - 1));
        const step = gateZ < 0 ? -1 : 1;
        let guard = 0;
        while (startZ > 0 && startZ < gridCount - 1 && !cells[startZ][startX].inside && guard < gridCount) {
            startZ += step;
            guard += 1;
        }
        if (!cells[startZ]?.[startX]?.inside) {
            startZ = Math.min(gridCount - 2, Math.max(1, Math.floor(gridCount / 2)));
        }
        const start = { x: startX, z: startZ, dir: null };
        cells[start.z][start.x].visited = true;
        stack.push(start);

        while (stack.length) {
            const current = stack[stack.length - 1];
            const neighbors = dirs.filter(dir => {
                const nx = current.x + dir.dx;
                const nz = current.z + dir.dz;
                return nx >= 0 && nz >= 0 && nx < gridCount && nz < gridCount &&
                    cells[nz][nx].inside && !cells[nz][nx].visited;
            });

            if (!neighbors.length) {
                stack.pop();
                continue;
            }

            let pick = null;
            if (current.dir) {
                const straight = neighbors.find(n => n.dx === current.dir.dx && n.dz === current.dir.dz);
                if (straight && Math.random() < 0.85) {
                    pick = straight;
                }
            }
            if (!pick) {
                pick = neighbors[Math.floor(Math.random() * neighbors.length)];
            }
            const nx = current.x + pick.dx;
            const nz = current.z + pick.dz;
            cells[current.z][current.x].walls[pick.wall] = false;
            cells[nz][nx].walls[pick.opp] = false;
            cells[nz][nx].visited = true;
            stack.push({ x: nx, z: nz, dir: pick });
        }

        const openGatePath = (x, z, steps) => {
            let cx = x;
            let cz = z;
            for (let i = 0; i < steps; i++) {
                const nextZ = cz + 1;
                if (nextZ >= gridCount) break;
                cells[cz][cx].walls[2] = false;
                cells[nextZ][cx].walls[0] = false;
                cz = nextZ;
            }
            return { x: cx, z: cz };
        };
        const entry = openGatePath(startX, startZ, 24);
        for (let dx = -1; dx <= 1; dx++) {
            const ex = entry.x + dx;
            if (cells[entry.z]?.[ex]?.inside) {
                cells[entry.z][ex].walls[0] = false;
            }
        }

        const carveStraight = (x, z, dir, steps) => {
            let cx = x;
            let cz = z;
            for (let i = 0; i < steps; i++) {
                const nx = cx + dir.dx;
                const nz = cz + dir.dz;
                if (nx < 0 || nz < 0 || nx >= gridCount || nz >= gridCount) break;
                if (!cells[nz][nx].inside) break;
                cells[cz][cx].walls[dir.wall] = false;
                cells[nz][nx].walls[dir.opp] = false;
                cells[nz][nx].visited = true;
                cx = nx;
                cz = nz;
            }
        };

        const leftDir = dirs.find(d => d.dx === -1 && d.dz === 0);
        const rightDir = dirs.find(d => d.dx === 1 && d.dz === 0);
        const downDir = dirs.find(d => d.dx === 0 && d.dz === 1);
        const spineCells = [];
        if (downDir) {
            let sx = entry.x;
            let sz = entry.z;
            const spineLength = 180;
            for (let i = 0; i < spineLength; i++) {
                const nx = sx + downDir.dx;
                const nz = sz + downDir.dz;
                if (nx < 0 || nz < 0 || nx >= gridCount || nz >= gridCount) break;
                if (!cells[nz][nx].inside) break;
                cells[sz][sx].walls[downDir.wall] = false;
                cells[nz][nx].walls[downDir.opp] = false;
                cells[nz][nx].visited = true;
                spineCells.push({ x: nx, z: nz });
                if (i % 10 === 0) {
                    const worldX = -half + nx * cellSize;
                    const worldZ = -half + nz * cellSize;
                    this.chestSpots.push(new THREE.Vector2(worldX, worldZ));
                }
                sx = nx;
                sz = nz;
            }
        }
        if (leftDir && rightDir) {
            carveStraight(entry.x, entry.z, leftDir, 120);
            carveStraight(entry.x, entry.z, rightDir, 120);
            for (let i = 6; i < spineCells.length; i += 6) {
                const cell = spineCells[i];
                const lenL = 40 + Math.floor(Math.random() * 80);
                const lenR = 40 + Math.floor(Math.random() * 80);
                carveStraight(cell.x, cell.z, leftDir, lenL);
                carveStraight(cell.x, cell.z, rightDir, lenR);
            }
        }

        const clearBetween = (ax, az, bx, bz, dir) => {
            if (!cells[az]?.[ax] || !cells[bz]?.[bx]) return;
            cells[az][ax].walls[dir.wall] = false;
            cells[bz][bx].walls[dir.opp] = false;
        };

        const widenCount = 40;
        for (let i = 0; i < widenCount; i++) {
            const cx = Math.floor(Math.random() * gridCount);
            const cz = Math.floor(Math.random() * gridCount);
            if (!cells[cz]?.[cx]?.inside) continue;
            const right = { dx: 1, dz: 0, wall: 1, opp: 3 };
            const down = { dx: 0, dz: 1, wall: 2, opp: 0 };
            if (cells[cz]?.[cx + 1]?.inside) clearBetween(cx, cz, cx + 1, cz, right);
            if (cells[cz + 1]?.[cx]?.inside) clearBetween(cx, cz, cx, cz + 1, down);
        }

        const braidChance = 0.98;
        for (let z = 1; z < gridCount - 1; z++) {
            for (let x = 1; x < gridCount - 1; x++) {
                const cell = cells[z][x];
                if (!cell.inside) continue;
                const wallCount = cell.walls.filter(Boolean).length;
                if (wallCount !== 3) continue;
                if (Math.random() > braidChance) continue;
                const candidates = dirs.filter(dir => {
                    const nx = x + dir.dx;
                    const nz = z + dir.dz;
                    return cells[nz]?.[nx]?.inside && cell.walls[dir.wall];
                });
                if (!candidates.length) continue;
                const dir = candidates[Math.floor(Math.random() * candidates.length)];
                const nx = x + dir.dx;
                const nz = z + dir.dz;
                cell.walls[dir.wall] = false;
                cells[nz][nx].walls[dir.opp] = false;
            }
        }

        const extraCuts = Math.floor(gridCount * gridCount * 0.12);
        for (let i = 0; i < extraCuts; i++) {
            const cx = Math.floor(Math.random() * gridCount);
            const cz = Math.floor(Math.random() * gridCount);
            if (!cells[cz]?.[cx]?.inside) continue;
            const dir = dirs[Math.floor(Math.random() * dirs.length)];
            const nx = cx + dir.dx;
            const nz = cz + dir.dz;
            if (!cells[nz]?.[nx]?.inside) continue;
            cells[cz][cx].walls[dir.wall] = false;
            cells[nz][nx].walls[dir.opp] = false;
        }

        for (let z = 1; z < gridCount - 1; z++) {
            for (let x = 1; x < gridCount - 1; x++) {
                const cell = cells[z][x];
                if (!cell.inside) continue;
                let wallCount = cell.walls.filter(Boolean).length;
                if (wallCount <= 2) continue;
                let safety = 0;
                while (wallCount > 2 && safety < 6) {
                    const candidates = dirs.filter(dir => {
                        const nx = x + dir.dx;
                        const nz = z + dir.dz;
                        return cells[nz]?.[nx]?.inside && cell.walls[dir.wall];
                    });
                    if (!candidates.length) break;
                    const dir = candidates[Math.floor(Math.random() * candidates.length)];
                    const nx = x + dir.dx;
                    const nz = z + dir.dz;
                    cell.walls[dir.wall] = false;
                    cells[nz][nx].walls[dir.opp] = false;
                    wallCount = cell.walls.filter(Boolean).length;
                    safety += 1;
                }
            }
        }

        const walls = [];
        const addWall = (x, z, rotY) => {
            const dist = Math.sqrt(x * x + z * z);
            if (dist < centerClear) return;
            if (isGate(x, z)) return;
            const width = rotY === 0 ? cellSize : wallThickness;
            const depth = rotY === 0 ? wallThickness : cellSize;
            walls.push({ x, z, rotY, width, depth });
        };

        for (let z = 0; z < gridCount; z++) {
            for (let x = 0; x < gridCount; x++) {
                const cell = cells[z][x];
                if (!cell.inside) continue;
                const worldX = -half + x * cellSize;
                const worldZ = -half + z * cellSize;

                if (cell.walls[0]) addWall(worldX, worldZ - cellSize / 2, 0);
                if (cell.walls[3]) addWall(worldX - cellSize / 2, worldZ, Math.PI / 2);
                if (x === gridCount - 1 && cell.walls[1]) addWall(worldX + cellSize / 2, worldZ, Math.PI / 2);
                if (z === gridCount - 1 && cell.walls[2]) addWall(worldX, worldZ + cellSize / 2, 0);
            }
        }

        if (walls.length) {
            const wallGeo = new THREE.BoxGeometry(cellSize, wallHeight, wallThickness);
            const wallMat = new THREE.MeshStandardMaterial({
                color: 0x9a9a9a,
                map: this.getTexture('stone', () => this.createNoiseTexture(0x8a8a8a, 0x777777)),
                roughness: 0.9,
                flatShading: true
            });
            const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
            const ivyGeo = new THREE.BoxGeometry(cellSize * 0.95, wallHeight * 0.6, 0.2);
            const ivyMat = new THREE.MeshStandardMaterial({
                color: 0x3a7a3a,
                roughness: 0.95,
                flatShading: true,
                transparent: true,
                opacity: 0.6
            });
            const ivyItems = [];
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3(1, 1, 1);

            walls.forEach((wall, index) => {
                const y = this.getHeightAt(wall.x, wall.z);
                position.set(wall.x, y + wallHeight / 2, wall.z);
                rotation.setFromEuler(new THREE.Euler(0, wall.rotY, 0));
                matrix.compose(position, rotation, scale);
                wallMesh.setMatrixAt(index, matrix);
                this.addColliderBox(position, wall.width, wallHeight, wall.depth, false);
                if (Math.random() > 0.75) {
                    ivyItems.push({ x: wall.x, y: y + wallHeight * 0.5, z: wall.z, rotY: wall.rotY });
                }
            });
            this.scene.add(wallMesh);

            if (ivyItems.length) {
                const ivyMesh = new THREE.InstancedMesh(ivyGeo, ivyMat, ivyItems.length);
                ivyItems.forEach((item, index) => {
                    const offset = (wallThickness * 0.5) + 0.12;
                    const ox = item.rotY === 0 ? 0 : offset;
                    const oz = item.rotY === 0 ? offset : 0;
                    position.set(item.x + ox, item.y, item.z + oz);
                    rotation.setFromEuler(new THREE.Euler(0, item.rotY, 0));
                    matrix.compose(position, rotation, scale);
                    ivyMesh.setMatrixAt(index, matrix);
                });
                this.scene.add(ivyMesh);
            }
        }

        for (let z = 0; z < gridCount; z++) {
            for (let x = 0; x < gridCount; x++) {
                const cell = cells[z][x];
                if (!cell.inside) continue;
                const wallCount = cell.walls.filter(Boolean).length;
                if (wallCount < 3) continue;
                const worldX = -half + x * cellSize;
                const worldZ = -half + z * cellSize;
                const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);
                if (dist < centerClear + 10) continue;
                this.chestSpots.push(new THREE.Vector2(worldX, worldZ));
            }
        }

        this.mazeCenters = [];
        for (let z = 0; z < gridCount; z++) {
            for (let x = 0; x < gridCount; x++) {
                const worldX = -half + x * cellSize;
                const worldZ = -half + z * cellSize;
                const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);
                if (dist < centerClear + 10) continue;
                if (!cells[z][x].inside) continue;
                this.mazeCenters.push({ x: worldX, z: worldZ });
            }
        }

        const extraChestCount = Math.min(1400, this.mazeCenters.length);
        for (let i = 0; i < extraChestCount; i++) {
            const pick = this.mazeCenters[Math.floor(Math.random() * this.mazeCenters.length)];
            const dist = Math.sqrt(pick.x * pick.x + pick.z * pick.z);
            if (dist < centerClear + 10) continue;
            const jitter = cellSize * 0.35;
            this.chestSpots.push(new THREE.Vector2(
                pick.x + (Math.random() - 0.5) * jitter,
                pick.z + (Math.random() - 0.5) * jitter
            ));
        }
    }

    createOneWayGates() {
        this.oneWayGates = [];
        // One-way gates disabled for now; only the main courtyard gate closes.
    }

    getOneWayGates() {
        return this.oneWayGates || [];
    }

    createParkour() {
        const centers = this.mazeCenters && this.mazeCenters.length
            ? this.mazeCenters
            : (this.layout.islands || []).map(i => ({ x: i.pos.x, z: i.pos.y }));
        if (!centers || centers.length === 0) return;

        const platformGeo = new THREE.BoxGeometry(3, 0.6, 3);
        const ledgeGeo = new THREE.BoxGeometry(2.2, 0.5, 2.2);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x546e7a,
            roughness: 0.8,
            flatShading: true
        });

        const platforms = [];
        const ledges = [];
        const pickCenter = () => centers[Math.floor(Math.random() * centers.length)];

        for (let i = 0; i < 120; i++) {
            const center = pickCenter();
            const y = this.getHeightAt(center.x, center.z);
            const height = 0.8 + (i % 3) * 0.9;
            platforms.push({
                x: center.x + (Math.random() * 4 - 2),
                z: center.z + (Math.random() * 4 - 2),
                y: y + height,
                scale: 0.9 + Math.random() * 0.4
            });
        }

        for (let i = 0; i < 220; i++) {
            const center = pickCenter();
            const y = this.getHeightAt(center.x, center.z);
            const height = 1.4 + (i % 2) * 1.2;
            ledges.push({
                x: center.x + (Math.random() * 5 - 2.5),
                z: center.z + (Math.random() * 5 - 2.5),
                y: y + height,
                scale: 0.8 + Math.random() * 0.5
            });
        }

        const buildInstanced = (list, geo) => {
            if (!list.length) return;
            const mesh = new THREE.InstancedMesh(geo, mat, list.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3();
            const rotation = new THREE.Quaternion();

            list.forEach((item, index) => {
                position.set(item.x, item.y, item.z);
                scale.set(item.scale, item.scale, item.scale);
                matrix.compose(position, rotation, scale);
                mesh.setMatrixAt(index, matrix);
                const size = geo.parameters.width || 2.5;
                const depth = geo.parameters.depth || 2.5;
                const height = geo.parameters.height || 0.6;
                this.addColliderBox(
                    new THREE.Vector3(item.x, item.y, item.z),
                    size * item.scale,
                    height * item.scale,
                    depth * item.scale
                );
            });
            this.scene.add(mesh);
        };

        buildInstanced(platforms, platformGeo);
        buildInstanced(ledges, ledgeGeo);

        const skyGeo = new THREE.BoxGeometry(4.2, 0.7, 4.2);
        const skyMat = new THREE.MeshStandardMaterial({
            color: 0x455a64,
            roughness: 0.7,
            flatShading: true
        });
        const skyPlatforms = [];
        for (let i = 0; i < 12; i++) {
            const center = centers[Math.floor(Math.random() * centers.length)];
            const baseY = this.getHeightAt(center.x, center.z);
            const levels = 8 + Math.floor(Math.random() * 3);
            for (let step = 0; step < levels; step++) {
                skyPlatforms.push({
                    x: center.x + (Math.random() * 6 - 3),
                    z: center.z + (Math.random() * 6 - 3),
                    y: baseY + 6 + step * 4.2,
                    scale: 0.9 + Math.random() * 0.4
                });
            }
        }

        if (skyPlatforms.length) {
            const mesh = new THREE.InstancedMesh(skyGeo, skyMat, skyPlatforms.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            skyPlatforms.forEach((item, index) => {
                position.set(item.x, item.y, item.z);
                scale.set(item.scale, item.scale, item.scale);
                matrix.compose(position, rotation, scale);
                mesh.setMatrixAt(index, matrix);
                this.addColliderBox(
                    new THREE.Vector3(item.x, item.y, item.z),
                    4.2 * item.scale,
                    0.7 * item.scale,
                    4.2 * item.scale
                );
            });
            this.scene.add(mesh);
        }

        const spiralGeo = new THREE.BoxGeometry(3.4, 0.7, 3.4);
        const spiralMat = new THREE.MeshStandardMaterial({
            color: 0x607d8b,
            roughness: 0.75,
            flatShading: true
        });
        const spiralSteps = [];
        const spiralTurns = 3.2;
        const spiralCount = 80;
        const spiralRadius = 24;
        const spiralHeight = 46;

        for (let i = 0; i < spiralCount; i++) {
            const t = i / (spiralCount - 1);
            const angle = t * Math.PI * 2 * spiralTurns;
            const radius = spiralRadius + t * 10;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = this.getHeightAt(x, z) + 4 + t * spiralHeight;
            spiralSteps.push({ x, y, z, scale: 0.9 + Math.sin(t * Math.PI) * 0.2 });
        }

        if (spiralSteps.length) {
            const mesh = new THREE.InstancedMesh(spiralGeo, spiralMat, spiralSteps.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            spiralSteps.forEach((item, index) => {
                position.set(item.x, item.y, item.z);
                scale.set(item.scale, item.scale, item.scale);
                matrix.compose(position, rotation, scale);
                mesh.setMatrixAt(index, matrix);
                this.addColliderBox(
                    new THREE.Vector3(item.x, item.y, item.z),
                    3.4 * item.scale,
                    0.7 * item.scale,
                    3.4 * item.scale
                );
            });
            this.scene.add(mesh);
        }
    }

    createTraps() {
        this.traps = [];
        const trapGeo = new THREE.BoxGeometry(1.6, 0.5, 1.6);
        const spikeGeo = new THREE.ConeGeometry(0.35, 0.8, 6);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x3e3e3e,
            roughness: 0.9,
            flatShading: true,
            transparent: true,
            opacity: 0.35
        });
        const spikeMat = new THREE.MeshStandardMaterial({
            color: 0x9e9e9e,
            roughness: 0.6,
            metalness: 0.2,
            flatShading: true,
            transparent: true,
            opacity: 0.45
        });

        for (let i = 0; i < 40; i++) {
            const center = this.mazeCenters?.[Math.floor(Math.random() * this.mazeCenters.length)];
            if (!center) continue;
            const y = this.getHeightAt(center.x, center.z);
            const base = new THREE.Mesh(trapGeo, baseMat);
            base.position.set(center.x, y + 0.1, center.z);
            this.scene.add(base);

            for (let s = 0; s < 4; s++) {
                const spike = new THREE.Mesh(spikeGeo, spikeMat);
                spike.position.set(
                    center.x + (s % 2 === 0 ? -0.4 : 0.4),
                    y + 0.7,
                    center.z + (s < 2 ? -0.4 : 0.4)
                );
                this.scene.add(spike);
            }

            this.traps.push({
                position: new THREE.Vector3(center.x, y + 0.3, center.z),
                radius: 1.2,
                slow: 0.55,
                damage: 6
            });
        }
    }

    createMazeTraps() {
        this.createTraps();

        const fireMat = new THREE.MeshStandardMaterial({
            color: 0xff6d00,
            emissive: 0xff3d00,
            emissiveIntensity: 0.6,
            roughness: 0.4,
            flatShading: true,
            transparent: true,
            opacity: 0.4
        });
        const fireGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.4, 8);
        for (let i = 0; i < 18; i++) {
            const center = this.mazeCenters?.[Math.floor(Math.random() * this.mazeCenters.length)];
            if (!center) continue;
            const y = this.getHeightAt(center.x, center.z);
            const fire = new THREE.Mesh(fireGeo, fireMat);
            fire.position.set(center.x, y + 0.2, center.z);
            this.scene.add(fire);
            this.traps.push({
                position: new THREE.Vector3(center.x, y + 0.2, center.z),
                radius: 1.4,
                slow: 0.9,
                damage: 10
            });
        }

        const dartMat = new THREE.MeshStandardMaterial({
            color: 0x5c6bc0,
            roughness: 0.8,
            flatShading: true,
            transparent: true,
            opacity: 0.35
        });
        const dartGeo = new THREE.BoxGeometry(1.6, 0.15, 1.6);
        for (let i = 0; i < 20; i++) {
            const center = this.mazeCenters?.[Math.floor(Math.random() * this.mazeCenters.length)];
            if (!center) continue;
            const y = this.getHeightAt(center.x, center.z);
            const plate = new THREE.Mesh(dartGeo, dartMat);
            plate.position.set(center.x, y + 0.1, center.z);
            this.scene.add(plate);
            this.traps.push({
                position: new THREE.Vector3(center.x, y + 0.1, center.z),
                radius: 1.6,
                slow: 0.7,
                damage: 4
            });
        }

        const gooMat = new THREE.MeshStandardMaterial({
            color: 0x2e7d32,
            roughness: 0.95,
            flatShading: true,
            transparent: true,
            opacity: 0.35
        });
        const gooGeo = new THREE.BoxGeometry(2.4, 0.2, 2.4);
        const gooCount = 24;
        for (let i = 0; i < gooCount; i++) {
            const center = this.mazeCenters?.[Math.floor(Math.random() * this.mazeCenters.length)];
            if (!center) continue;
            const y = this.getHeightAt(center.x, center.z);
            const goo = new THREE.Mesh(gooGeo, gooMat);
            goo.position.set(center.x, y + 0.05, center.z);
            this.scene.add(goo);
            this.traps.push({
                position: new THREE.Vector3(center.x, y + 0.05, center.z),
                radius: 1.6,
                slow: 0.35,
                damage: 2
            });
        }
    }

    getTraps() {
        return this.traps || [];
    }

    createForest() {
        const trunkGeo = new THREE.BoxGeometry(0.6, 2.2, 0.6);
        const leavesGeo = new THREE.BoxGeometry(2.2, 2, 2.2);

        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x6d4c41,
            roughness: 0.9,
            flatShading: true
        });
        const leavesMat = new THREE.MeshStandardMaterial({
            color: 0x2e7d32,
            roughness: 0.8,
            flatShading: true
        });
        const jungleLeavesMat = new THREE.MeshStandardMaterial({
            color: 0x1b5e20,
            roughness: 0.8,
            flatShading: true
        });
        const snowLeavesMat = new THREE.MeshStandardMaterial({
            color: 0xcfd8dc,
            roughness: 0.9,
            flatShading: true
        });

        const instances = {
            grass: [],
            jungle: [],
            snow: []
        };

        for (const cluster of this.layout.treeClusters) {
            for (let i = 0; i < cluster.count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * cluster.radius;
                const x = cluster.pos.x + Math.cos(angle) * r;
                const z = cluster.pos.y + Math.sin(angle) * r;
                const biome = this.getBiomeType(x, z, Math.sqrt(x * x + z * z));
                if (biome === 'beach' || biome === 'rocky') continue;
                const scale = 0.85 + Math.random() * 0.5;
                instances[biome === 'jungle' ? 'jungle' : biome === 'snow' ? 'snow' : 'grass'].push({ x, z, scale });
            }

            const chestCount = Math.random() > 0.6 ? 2 : 1;
            for (let i = 0; i < chestCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                const r = cluster.radius * 0.6 + Math.random() * cluster.radius * 0.4;
                this.chestSpots.push(new THREE.Vector2(
                    cluster.pos.x + Math.cos(angle) * r,
                    cluster.pos.y + Math.sin(angle) * r
                ));
            }
        }

        for (let i = 0; i < 60; i++) {
            const pos = this.randomInRing(70, 200);
            const biome = this.getBiomeType(pos.x, pos.y, Math.sqrt(pos.x * pos.x + pos.y * pos.y));
            if (biome === 'beach' || biome === 'rocky') continue;
            const scale = 0.8 + Math.random() * 0.5;
            instances[biome === 'jungle' ? 'jungle' : biome === 'snow' ? 'snow' : 'grass'].push({ x: pos.x, z: pos.y, scale });
        }

        const makeInstances = (list, leavesMaterial) => {
            if (!list.length) return;
            const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
            const crowns = new THREE.InstancedMesh(leavesGeo, leavesMaterial, list.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3();
            const rotation = new THREE.Quaternion();

            list.forEach((item, index) => {
                const y = this.getHeightAt(item.x, item.z);
                position.set(item.x, y + 1.1 * item.scale, item.z);
                scale.set(item.scale, item.scale, item.scale);
                matrix.compose(position, rotation, scale);
                trunks.setMatrixAt(index, matrix);

                const crownY = y + (2.6 * item.scale);
                position.set(item.x, crownY, item.z);
                matrix.compose(position, rotation, scale);
                crowns.setMatrixAt(index, matrix);
            });

            this.scene.add(trunks);
            this.scene.add(crowns);
        };

        makeInstances(instances.grass, leavesMat);
        makeInstances(instances.jungle, jungleLeavesMat);
        makeInstances(instances.snow, snowLeavesMat);
    }

    createRocks() {
        const rockGeo = new THREE.DodecahedronGeometry(1);
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x616161,
            roughness: 0.9,
            flatShading: true
        });

        const rocks = [];

        for (const cluster of this.layout.rockClusters) {
            for (let i = 0; i < cluster.count + 2; i++) {
                const angle = Math.random() * Math.PI * 2;
                const r = 2 + Math.random() * 5;
                const x = cluster.pos.x + Math.cos(angle) * r;
                const z = cluster.pos.y + Math.sin(angle) * r;
                const size = 0.9 + Math.random() * 1.6;
                rocks.push({ x, z, size });
            }

            const chestOffset = new THREE.Vector2(
                cluster.pos.x + (Math.random() > 0.5 ? 2.5 : -2.5),
                cluster.pos.y + (Math.random() > 0.5 ? 2.5 : -2.5)
            );
            this.chestSpots.push(chestOffset);
        }

        for (let i = 0; i < 28; i++) {
            const pos = this.randomInRing(70, 200);
            rocks.push({ x: pos.x, z: pos.y, size: 0.8 + Math.random() * 1.4 });
        }

        if (rocks.length) {
            const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            rocks.forEach((rock, index) => {
                const y = this.getHeightAt(rock.x, rock.z);
                position.set(rock.x, y + rock.size * 0.5, rock.z);
                scale.set(rock.size, rock.size, rock.size);
                matrix.compose(position, rotation, scale);
                rockMesh.setMatrixAt(index, matrix);
            });
            this.scene.add(rockMesh);
        }
    }

    createPits() {
        const pitMat = new THREE.MeshStandardMaterial({
            color: 0x4e342e,
            roughness: 1.0,
            flatShading: true
        });

        for (const pit of this.layout.pits) {
            const rim = new THREE.Mesh(
                new THREE.CylinderGeometry(pit.radius + 1.5, pit.radius + 1.5, 0.6, 12, 1, true),
                pitMat
            );
            rim.position.set(pit.pos.x, this.getHeightAt(pit.pos.x, pit.pos.y) + 0.1, pit.pos.y);
            this.scene.add(rim);

            this.chestSpots.push(new THREE.Vector2(pit.pos.x, pit.pos.y));
        }
    }

    createBiomeDecor() {
        const bigSpots = [];
        const canPlace = (x, z, minDist) => {
            for (const spot of bigSpots) {
                const dx = x - spot.x;
                const dz = z - spot.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < Math.max(minDist, spot.minDist)) return false;
            }
            return true;
        };
        const reserveSpot = (x, z, minDist) => {
            bigSpots.push({ x, z, minDist });
        };
        const addBlocker = (x, z, radius) => {
            this.chestBlockers.push({ x, z, radius });
        };
        const islands = this.layout.islands || [];
        const randomOnIsland = (minRatio, maxRatio) => {
            if (!islands.length) return null;
            const island = islands[Math.floor(Math.random() * islands.length)];
            const angle = Math.random() * Math.PI * 2;
            const radius = island.radius * (minRatio + Math.random() * (maxRatio - minRatio));
            return new THREE.Vector2(
                island.pos.x + Math.cos(angle) * radius,
                island.pos.y + Math.sin(angle) * radius
            );
        };

        const cactusMat = new THREE.MeshStandardMaterial({
            color: 0x5e8d3a,
            roughness: 0.9,
            flatShading: true
        });
        const snowMat = new THREE.MeshStandardMaterial({
            color: 0xe6eef5,
            roughness: 0.7,
            flatShading: true
        });
        const bushMat = new THREE.MeshStandardMaterial({
            color: 0x2e7d32,
            roughness: 0.9,
            flatShading: true
        });
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x757575,
            roughness: 0.9,
            flatShading: true
        });
        const logMat = new THREE.MeshStandardMaterial({
            color: 0x6d4c41,
            roughness: 0.9,
            flatShading: true
        });

        const treeTrunk = new THREE.BoxGeometry(0.6, 2.4, 0.6);
        const treeLeaves = new THREE.BoxGeometry(2.4, 2.2, 2.4);
        const treeTrunkMat = new THREE.MeshStandardMaterial({
            color: 0x6d4c41,
            roughness: 0.9,
            flatShading: true
        });
        const treeLeavesMat = new THREE.MeshStandardMaterial({
            color: 0x2e7d32,
            roughness: 0.8,
            flatShading: true
        });

        const treePositions = [];
        const clusters = [];
        let tries = 0;
        while (clusters.length < 16 && tries < 200) {
            tries++;
            const pos = this.randomInRing(70, 200);
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
            const biome = this.getBiomeType(pos.x, pos.y, dist);
            if (biome !== 'forest') continue;
            clusters.push({ x: pos.x, z: pos.y, radius: 12 + Math.random() * 10 });
        }

        clusters.forEach(cluster => {
            const count = 30 + Math.floor(Math.random() * 40);
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * cluster.radius;
                const x = cluster.x + Math.cos(angle) * r;
                const z = cluster.z + Math.sin(angle) * r;
                treePositions.push({ x, z, scale: 0.9 + Math.random() * 0.5 });
            }
        });

        if (treePositions.length) {
            const trunks = new THREE.InstancedMesh(treeTrunk, treeTrunkMat, treePositions.length);
            const crowns = new THREE.InstancedMesh(treeLeaves, treeLeavesMat, treePositions.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3();
            const rotation = new THREE.Quaternion();

            treePositions.forEach((item, index) => {
                const y = this.getHeightAt(item.x, item.z);
                position.set(item.x, y + 1.2 * item.scale, item.z);
                scale.set(item.scale, item.scale, item.scale);
                matrix.compose(position, rotation, scale);
                trunks.setMatrixAt(index, matrix);

                const crownY = y + (2.8 * item.scale);
                position.set(item.x, crownY, item.z);
                matrix.compose(position, rotation, scale);
                crowns.setMatrixAt(index, matrix);
                this.addColliderBox(
                    new THREE.Vector3(item.x, y + 1.1 * item.scale, item.z),
                    0.7 * item.scale,
                    2.2 * item.scale,
                    0.7 * item.scale,
                    false
                );
                addBlocker(item.x, item.z, 2.2);
            });
            this.scene.add(trunks);
            this.scene.add(crowns);
        }

        const bushGeo = new THREE.BoxGeometry(1.2, 0.8, 1.2);
        const bushMat2 = new THREE.MeshStandardMaterial({
            color: 0x2e7d32,
            roughness: 0.9,
            flatShading: true
        });
        const bushPositions = [];
        for (let i = 0; i < 240; i++) {
            const pos = randomOnIsland(0.82, 0.98) || this.randomInRing(70, 210);
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
            const biome = this.getBiomeType(pos.x, pos.y, dist);
            if (biome !== 'forest' && biome !== 'beach') continue;
            bushPositions.push({ x: pos.x, z: pos.y, scale: 0.6 + Math.random() * 0.7 });
        }
        if (bushPositions.length) {
            const bushes = new THREE.InstancedMesh(bushGeo, bushMat2, bushPositions.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            bushPositions.forEach((item, index) => {
                const y = this.getHeightAt(item.x, item.z);
                position.set(item.x, y + 0.4 * item.scale, item.z);
                scale.set(item.scale, item.scale, item.scale);
                matrix.compose(position, rotation, scale);
                bushes.setMatrixAt(index, matrix);
            });
            this.scene.add(bushes);
        }

        const tallTrunkGeo = new THREE.BoxGeometry(0.8, 6.5, 0.8);
        const tallLeavesGeo = new THREE.BoxGeometry(3.6, 3.6, 3.6);
        const tallTrunkMat = new THREE.MeshStandardMaterial({
            color: 0x5d4037,
            roughness: 0.9,
            flatShading: true
        });
        const tallLeavesMat = new THREE.MeshStandardMaterial({
            color: 0x1b5e20,
            roughness: 0.85,
            flatShading: true
        });
        const tallPositions = [];
        for (let i = 0; i < 140; i++) {
            const pos = randomOnIsland(0.25, 0.6) || this.randomInRing(60, 210);
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
            const biome = this.getBiomeType(pos.x, pos.y, dist);
            if (biome !== 'forest' && biome !== 'mountain') continue;
            if (!canPlace(pos.x, pos.y, 6)) continue;
            const scaleVal = 0.9 + Math.random() * 0.7;
            tallPositions.push({ x: pos.x, z: pos.y, scale: scaleVal });
            reserveSpot(pos.x, pos.y, 6);
        }
        if (tallPositions.length) {
            const trunks = new THREE.InstancedMesh(tallTrunkGeo, tallTrunkMat, tallPositions.length);
            const crowns = new THREE.InstancedMesh(tallLeavesGeo, tallLeavesMat, tallPositions.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3();
            const rotation = new THREE.Quaternion();

            tallPositions.forEach((item, index) => {
                const y = this.getHeightAt(item.x, item.z);
                position.set(item.x, y + 3.25 * item.scale, item.z);
                scale.set(item.scale, item.scale, item.scale);
                matrix.compose(position, rotation, scale);
                trunks.setMatrixAt(index, matrix);

                position.set(item.x, y + 6.2 * item.scale, item.z);
                matrix.compose(position, rotation, scale);
                crowns.setMatrixAt(index, matrix);
                this.addColliderBox(
                    new THREE.Vector3(item.x, y + 3.25 * item.scale, item.z),
                    1.4 * item.scale,
                    6.5 * item.scale,
                    1.4 * item.scale,
                    false
                );
                addBlocker(item.x, item.z, 2.6);
            });
            this.scene.add(trunks);
            this.scene.add(crowns);
        }

        const palms = [];
        const logs = [];
        const snowMounds = [];
        const mountainRocks = [];
        const lavaBasalts = [];

        const palmTrunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3.6, 6);
        const palmLeavesGeo = new THREE.BoxGeometry(2.8, 0.4, 2.8);
        const logGeo = new THREE.CylinderGeometry(0.3, 0.35, 2.4, 8);
        const snowMoundGeo = new THREE.SphereGeometry(1.2, 8, 8);
        const mountainRockGeo = new THREE.BoxGeometry(2.2, 1.2, 2.2);
        const basaltGeo = new THREE.DodecahedronGeometry(1.1);

        for (let i = 0; i < 260; i++) {
            const pos = randomOnIsland(0.75, 0.95) || this.randomInRing(70, 215);
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
            const biome = this.getBiomeType(pos.x, pos.y, dist);
            const y = this.getHeightAt(pos.x, pos.y);
            if (y < this.waterLevel + 0.5) continue;

            if (biome === 'beach') {
                if (Math.random() > 0.7) {
                    palms.push({ x: pos.x, y, z: pos.y, rot: Math.random() * Math.PI });
                    this.addColliderBox(new THREE.Vector3(pos.x, y + 1.8, pos.y), 1.2, 3.6, 1.2, false);
                    addBlocker(pos.x, pos.y, 2.2);
                }
            } else if (biome === 'snow') {
                snowMounds.push({ x: pos.x, y, z: pos.y, scale: 0.8 + Math.random() * 1.2 });
            } else if (biome === 'mountain') {
                mountainRocks.push({ x: pos.x, y, z: pos.y, rot: Math.random() * Math.PI });
                this.addColliderBox(new THREE.Vector3(pos.x, y + 0.6, pos.y), 2.2, 1.2, 2.2, false);
                addBlocker(pos.x, pos.y, 2.4);
            } else if (biome === 'lava') {
                lavaBasalts.push({ x: pos.x, y, z: pos.y, rot: new THREE.Euler(Math.random(), Math.random(), Math.random()) });
                this.addColliderBox(new THREE.Vector3(pos.x, y + 0.5, pos.y), 1.6, 1.2, 1.6, false);
                addBlocker(pos.x, pos.y, 2);
            } else if (biome === 'beach') {
                if (Math.random() > 0.9) {
                    logs.push({ x: pos.x, y, z: pos.y, rot: Math.random() * Math.PI });
                    this.addColliderBox(new THREE.Vector3(pos.x, y + 0.3, pos.y), 2.4, 0.6, 0.8, false);
                    addBlocker(pos.x, pos.y, 2.4);
                }
            }
        }

        if (palms.length) {
            const trunks = new THREE.InstancedMesh(palmTrunkGeo, cactusMat, palms.length);
            const leaves = new THREE.InstancedMesh(palmLeavesGeo, bushMat, palms.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3(1, 1, 1);
            const rotation = new THREE.Quaternion();
            palms.forEach((item, index) => {
                rotation.setFromEuler(new THREE.Euler(0, item.rot, 0));
                position.set(item.x, item.y + 1.8, item.z);
                matrix.compose(position, rotation, scale);
                trunks.setMatrixAt(index, matrix);
                position.set(item.x, item.y + 3.4, item.z);
                matrix.compose(position, rotation, scale);
                leaves.setMatrixAt(index, matrix);
            });
            this.scene.add(trunks);
            this.scene.add(leaves);
        }

        if (logs.length) {
            const instanced = new THREE.InstancedMesh(logGeo, logMat, logs.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3(1, 1, 1);
            logs.forEach((item, index) => {
                rotation.setFromEuler(new THREE.Euler(Math.PI / 2, item.rot, 0));
                position.set(item.x, item.y + 0.3, item.z);
                matrix.compose(position, rotation, scale);
                instanced.setMatrixAt(index, matrix);
            });
            this.scene.add(instanced);
        }

        if (snowMounds.length) {
            const instanced = new THREE.InstancedMesh(snowMoundGeo, snowMat, snowMounds.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            snowMounds.forEach((item, index) => {
                position.set(item.x, item.y + 0.3, item.z);
                scale.set(item.scale, item.scale * 0.4, item.scale);
                matrix.compose(position, rotation, scale);
                instanced.setMatrixAt(index, matrix);
            });
            this.scene.add(instanced);
        }

        if (mountainRocks.length) {
            const instanced = new THREE.InstancedMesh(mountainRockGeo, rockMat, mountainRocks.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3(1, 1, 1);
            mountainRocks.forEach((item, index) => {
                rotation.setFromEuler(new THREE.Euler(0, item.rot, 0));
                position.set(item.x, item.y + 0.6, item.z);
                matrix.compose(position, rotation, scale);
                instanced.setMatrixAt(index, matrix);
            });
            this.scene.add(instanced);
        }

        if (lavaBasalts.length) {
            const instanced = new THREE.InstancedMesh(basaltGeo, rockMat, lavaBasalts.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3(1, 1, 1);
            lavaBasalts.forEach((item, index) => {
                rotation.setFromEuler(item.rot);
                position.set(item.x, item.y + 0.5, item.z);
                matrix.compose(position, rotation, scale);
                instanced.setMatrixAt(index, matrix);
            });
            this.scene.add(instanced);
        }

        const rockPiles = [];
        const rockGeo = new THREE.BoxGeometry(2.8, 2.8, 2.8);
        for (let i = 0; i < 60; i++) {
            const pos = randomOnIsland(0.15, 0.45) || this.randomInRing(70, 220);
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
            const biome = this.getBiomeType(pos.x, pos.y, dist);
            if (biome !== 'mountain' && biome !== 'lava') continue;
            if (!canPlace(pos.x, pos.y, 7)) continue;
            rockPiles.push({
                x: pos.x,
                z: pos.y,
                scale: 0.7 + Math.random() * 0.8
            });
            reserveSpot(pos.x, pos.y, 7);
            addBlocker(pos.x, pos.y, 2.6);
        }

        if (rockPiles.length) {
            const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockPiles.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3();
            const rotation = new THREE.Quaternion();

            rockPiles.forEach((item, index) => {
                const y = this.getHeightAt(item.x, item.z);
                position.set(item.x, y + 1.4 * item.scale, item.z);
                scale.set(item.scale, 0.6 * item.scale, item.scale);
                rotation.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0));
                matrix.compose(position, rotation, scale);
                rocks.setMatrixAt(index, matrix);
                this.addColliderBox(
                    new THREE.Vector3(item.x, y + 1.4 * item.scale, item.z),
                    2.8 * item.scale,
                    1.8 * item.scale,
                    2.8 * item.scale,
                    false
                );
            });
            this.scene.add(rocks);
        }

        const desertSpireGeo = new THREE.ConeGeometry(1.6, 7, 6);
        const desertSpireMat = new THREE.MeshStandardMaterial({
            color: 0xd39b52,
            roughness: 0.85,
            flatShading: true
        });
        const snowPillarGeo = new THREE.BoxGeometry(2.4, 7.5, 2.4);
        const snowPillarMat = new THREE.MeshStandardMaterial({
            color: 0xe6f7ff,
            roughness: 0.4,
            flatShading: true
        });
        const lavaPillarGeo = new THREE.BoxGeometry(2.2, 7, 2.2);
        const lavaPillarMat = new THREE.MeshStandardMaterial({
            color: 0x5d2b1a,
            emissive: 0x8b2b18,
            emissiveIntensity: 0.3,
            roughness: 0.9,
            flatShading: true
        });
        const crystalPillarGeo = new THREE.ConeGeometry(1.4, 8.5, 7);
        const crystalPillarMat = new THREE.MeshStandardMaterial({
            color: 0xb39ddb,
            emissive: 0x7e57c2,
            emissiveIntensity: 0.4,
            roughness: 0.25,
            flatShading: true
        });
        const canyonObeliskGeo = new THREE.BoxGeometry(2.6, 8.5, 2.6);
        const canyonObeliskMat = new THREE.MeshStandardMaterial({
            color: 0xb8693a,
            roughness: 0.85,
            flatShading: true
        });

        const biomeTall = [
            { biome: 'beach', count: 25, geo: desertSpireGeo, mat: desertSpireMat, height: 6.5 },
            { biome: 'snow', count: 25, geo: snowPillarGeo, mat: snowPillarMat, height: 7.5 },
            { biome: 'lava', count: 30, geo: lavaPillarGeo, mat: lavaPillarMat, height: 7 },
            { biome: 'mountain', count: 35, geo: canyonObeliskGeo, mat: canyonObeliskMat, height: 8.5 }
        ];

        biomeTall.forEach(config => {
            const positions = [];
            for (let i = 0; i < config.count; i++) {
                const pos = this.randomInRing(80, 220);
                const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
                const biome = this.getBiomeType(pos.x, pos.y, dist);
                if (biome !== config.biome) continue;
                if (!canPlace(pos.x, pos.y, 7)) continue;
                positions.push({
                    x: pos.x,
                    z: pos.y,
                    scale: 0.8 + Math.random() * 0.8
                });
                reserveSpot(pos.x, pos.y, 7);
            addBlocker(pos.x, pos.y, 2.6);
            }
            if (!positions.length) return;

            const instanced = new THREE.InstancedMesh(config.geo, config.mat, positions.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3();
            const rotation = new THREE.Quaternion();

            positions.forEach((item, index) => {
                const y = this.getHeightAt(item.x, item.z);
                position.set(item.x, y + (config.height * 0.5) * item.scale, item.z);
                scale.set(item.scale, item.scale, item.scale);
                rotation.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0));
                matrix.compose(position, rotation, scale);
                instanced.setMatrixAt(index, matrix);
                this.addColliderBox(
                    new THREE.Vector3(item.x, y + (config.height * 0.5) * item.scale, item.z),
                    2.4 * item.scale,
                    config.height * item.scale,
                    2.4 * item.scale,
                    false
                );
            });
            this.scene.add(instanced);
        });


        for (let i = 0; i < 18; i++) {
            const lagoon = this.layout.lagoons[Math.floor(Math.random() * this.layout.lagoons.length)];
            const angle = Math.random() * Math.PI * 2;
            const radius = lagoon.radius * (0.2 + Math.random() * 0.6);
            const x = lagoon.pos.x + Math.cos(angle) * radius;
            const z = lagoon.pos.y + Math.sin(angle) * radius;
            const pad = new THREE.Mesh(
                new THREE.BoxGeometry(1.2, 0.1, 1.2),
                new THREE.MeshStandardMaterial({ color: 0x2e7d32, flatShading: true })
            );
            pad.position.set(x, this.waterLevel + 0.22, z);
            this.scene.add(pad);
        }

        for (let i = 0; i < 6; i++) {
            const pos = randomOnIsland(0.78, 0.92) || this.randomInRing(90, 200);
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
            const biome = this.getBiomeType(pos.x, pos.y, dist);
            if (biome !== 'beach' && biome !== 'forest' && biome !== 'mountain') continue;
            if (!canPlace(pos.x, pos.y, 10)) continue;
            const y = this.getHeightAt(pos.x, pos.y);
            const hut = new THREE.Group();
            const base = new THREE.Mesh(
                new THREE.BoxGeometry(4, 2.4, 4),
                new THREE.MeshStandardMaterial({ color: 0x8d6e63, flatShading: true })
            );
            base.position.y = 1.2;
            hut.add(base);
            const roof = new THREE.Mesh(
                new THREE.CylinderGeometry(0, 3.2, 2.2, 4),
                new THREE.MeshStandardMaterial({ color: 0x5d4037, flatShading: true })
            );
            roof.position.y = 3.1;
            roof.rotation.y = Math.PI / 4;
            hut.add(roof);
            hut.position.set(pos.x, y, pos.y);
            hut.rotation.y = Math.random() * Math.PI;
            this.scene.add(hut);
            this.addColliderBox(new THREE.Vector3(pos.x, y + 1.2, pos.y), 4, 2.4, 4, false);
            addBlocker(pos.x, pos.y, 3);
            reserveSpot(pos.x, pos.y, 10);
        }

        const flowerGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const flowerMat = new THREE.MeshStandardMaterial({
            color: 0xffd54f,
            flatShading: true
        });
        const flowers = [];
        for (let i = 0; i < 80; i++) {
            const pos = randomOnIsland(0.65, 0.9) || this.randomInRing(80, 210);
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
            const biome = this.getBiomeType(pos.x, pos.y, dist);
            if (biome !== 'beach' && biome !== 'forest') continue;
            flowers.push({ x: pos.x, z: pos.y, scale: 0.6 + Math.random() * 0.6 });
        }

        if (flowers.length) {
            const instanced = new THREE.InstancedMesh(flowerGeo, flowerMat, flowers.length);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const scale = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            flowers.forEach((item, index) => {
                const y = this.getHeightAt(item.x, item.z);
                position.set(item.x, y + 0.3 * item.scale, item.z);
                scale.set(item.scale, item.scale, item.scale);
                matrix.compose(position, rotation, scale);
                instanced.setMatrixAt(index, matrix);
            });
            this.scene.add(instanced);
        }

        const addBiomeChests = (biomeName, count) => {
            const band = (() => {
                if (biomeName === 'beach') return [0.75, 0.92];
                if (biomeName === 'forest') return [0.25, 0.7];
                if (biomeName === 'mountain') return [0.15, 0.45];
                if (biomeName === 'snow') return [0.2, 0.4];
                if (biomeName === 'lava') return [0.1, 0.3];
                return [0.2, 0.6];
            })();
            let placed = 0;
            let safety = 0;
            while (placed < count && safety < count * 12) {
                const pos = randomOnIsland(band[0], band[1]) || this.randomInRing(70, 220);
                const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
                const biome = this.getBiomeType(pos.x, pos.y, dist);
                if (biome !== biomeName) {
                    safety++;
                    continue;
                }
                const y = this.getHeightAt(pos.x, pos.y);
                if (y < this.waterLevel + 0.5) {
                    safety++;
                    continue;
                }
                if (!canPlace(pos.x, pos.y, 4)) {
                    safety++;
                    continue;
                }
                this.chestSpots.push(new THREE.Vector2(pos.x, pos.y));
                reserveSpot(pos.x, pos.y, 4);
                placed++;
            }
        };

        addBiomeChests('beach', 35);
        addBiomeChests('forest', 60);
        addBiomeChests('mountain', 35);
        addBiomeChests('snow', 25);
        addBiomeChests('lava', 20);

        for (let i = 0; i < 30; i++) {
            const lagoon = this.layout.lagoons[Math.floor(Math.random() * this.layout.lagoons.length)];
            const angle = Math.random() * Math.PI * 2;
            const radius = lagoon.radius * (0.7 + Math.random() * 0.3);
            const x = lagoon.pos.x + Math.cos(angle) * radius;
            const z = lagoon.pos.y + Math.sin(angle) * radius;
            const y = this.getHeightAt(x, z);
            if (y > this.waterLevel + 0.4) {
                this.chestSpots.push(new THREE.Vector2(x, z));
            }
        }
    }

    createRimWall() {
        const count = 40;
        const radius = this.size * 0.46;
        const wallGeo = new THREE.BoxGeometry(10, 6, 3);
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x616161,
            roughness: 0.9,
            flatShading: true
        });

        const instanced = new THREE.InstancedMesh(wallGeo, wallMat, count);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3(1, 1, 1);

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = this.getHeightAt(x, z) + 3;
            position.set(x, y, z);
            rotation.setFromEuler(new THREE.Euler(0, -angle, 0));
            matrix.compose(position, rotation, scale);
            instanced.setMatrixAt(i, matrix);
            this.addColliderBox(position, 10, 6, 3, false);
        }
        this.scene.add(instanced);
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

    setCourtyardGateOpen(open) {
        if (!this.courtyardGate) return;
        this.courtyardGate.open = open;
        this.courtyardGate.mesh.visible = !open;
        if (this.courtyardGate.collider) {
            this.courtyardGate.collider.enabled = !open;
        }
    }

    isInsideCourtyard(position) {
        const half = this.courtyardSize / 2;
        return Math.abs(position.x) < half && Math.abs(position.z) < half;
    }

    getCourtyardExitPosition() {
        if (!this.courtyardGate) return new THREE.Vector3(0, 0, 0);
        return new THREE.Vector3(0, 1.2, this.courtyardGate.exitZ - 5);
    }

    isChestClear(x, z, minDist = 3) {
        for (const blocker of this.chestBlockers) {
            const dx = x - blocker.x;
            const dz = z - blocker.z;
            if (dx * dx + dz * dz < (blocker.radius + minDist) ** 2) {
                return false;
            }
        }
        return true;
    }

    getColliders() {
        return this.colliders;
    }

    isLavaAt(x, z, y = 0) {
        const dist = this.layout.volcano.pos.distanceTo(new THREE.Vector2(x, z));
        if (dist > this.layout.volcano.radius * 0.78) return false;
        return y <= this.waterLevel + 1.0;
    }

    getSpawnPads() {
        return this.spawnPads.map(pos => pos.clone());
    }

    createLandmarks() {
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x9e9e9e,
            roughness: 0.85,
            flatShading: true
        });
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x7b5a3a,
            roughness: 0.9,
            flatShading: true
        });

        const edge = this.size * 0.35;
        const spots = [
            new THREE.Vector3(-edge, 0, -edge + 20),
            new THREE.Vector3(edge - 20, 0, edge - 10),
            new THREE.Vector3(-edge + 30, 0, edge - 40),
            new THREE.Vector3(edge - 30, 0, -edge + 50),
            new THREE.Vector3(0, 0, edge - 30),
            new THREE.Vector3(-edge + 10, 0, 0)
        ];

        spots.forEach((spot, idx) => {
            const y = this.getHeightAt(spot.x, spot.z);
            if (idx % 2 === 0) {
                const pillar = new THREE.Mesh(new THREE.BoxGeometry(3, 10, 3), stoneMat);
                pillar.position.set(spot.x, y + 5, spot.z);
                this.scene.add(pillar);
                const cap = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 5), stoneMat);
                cap.position.set(spot.x, y + 10.6, spot.z);
                this.scene.add(cap);
            } else {
                const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), woodMat);
                tower.position.set(spot.x, y + 4, spot.z);
                this.scene.add(tower);
                const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 4.5, 2.5, 6), woodMat);
                roof.position.set(spot.x, y + 9, spot.z);
                this.scene.add(roof);
            }
        });
    }

    createZoneWall() {
        const radius = this.size * 0.5;
        const geo = new THREE.CylinderGeometry(radius, radius, 200, 48, 1, true);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xad1457,
            transparent: true,
            opacity: 0.08,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        const wall = new THREE.Mesh(geo, mat);
        wall.position.y = 100;
        this.scene.add(wall);
    }

    getChestSpots() {
        return this.chestSpots.map(pos => ({ x: pos.x, z: pos.y }));
    }

    getMazeCenters() {
        return this.mazeCenters ? [...this.mazeCenters] : [];
    }

    buildHeightField(geometry) {
        const pos = geometry.attributes.position;
        const gridSize = this.segments + 1;
        this.gridSize = gridSize;
        this.halfSize = this.size / 2;
        this.heightData = new Float32Array(pos.count);

        for (let i = 0; i < pos.count; i++) {
            this.heightData[i] = pos.getZ(i);
        }
    }

    getHeightAt(x, z) {
        if (this.cellHeights) {
            const half = this.halfSize;
            const clampedX = Math.max(-half, Math.min(half, x));
            const clampedZ = Math.max(-half, Math.min(half, z));
            const cellX = Math.min(this.gridSize - 2, Math.max(0, Math.floor((clampedX + half) / this.gridStep)));
            const cellZ = Math.min(this.gridSize - 2, Math.max(0, Math.floor((clampedZ + half) / this.gridStep)));
            const idx = cellZ * (this.gridSize - 1) + cellX;
            return this.cellHeights[idx] ?? 0;
        }

        if (this.heightData) {
            const half = this.halfSize;
            const clampedX = Math.max(-half, Math.min(half, x));
            const clampedZ = Math.max(-half, Math.min(half, z));
            const u = (clampedX + half) / this.size;
            const v = (clampedZ + half) / this.size;

            const gx = u * (this.gridSize - 1);
            const gz = v * (this.gridSize - 1);
            const x0 = Math.floor(gx);
            const z0 = Math.floor(gz);
            const x1 = Math.min(x0 + 1, this.gridSize - 1);
            const z1 = Math.min(z0 + 1, this.gridSize - 1);
            const sx = gx - x0;
            const sz = gz - z0;

            const idx00 = z0 * this.gridSize + x0;
            const idx10 = z0 * this.gridSize + x1;
            const idx01 = z1 * this.gridSize + x0;
            const idx11 = z1 * this.gridSize + x1;

            const h00 = this.heightData[idx00];
            const h10 = this.heightData[idx10];
            const h01 = this.heightData[idx01];
            const h11 = this.heightData[idx11];

            const hx0 = h00 + (h10 - h00) * sx;
            const hx1 = h01 + (h11 - h01) * sx;
            return hx0 + (hx1 - hx0) * sz;
        }

        if (!this.groundMesh) return 0;
        const raycaster = new THREE.Raycaster();
        raycaster.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
        const intersects = raycaster.intersectObject(this.groundMesh);
        if (intersects.length > 0) return intersects[0].point.y;
        return 0;
    }
}







