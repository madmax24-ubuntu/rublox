import * as THREE from "three";
import { mergeBufferGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MapGenerator as TileMapGenerator } from "./MapGeneratorNode.js";

// ============ NOISE UTILITY ============
class SimplexNoise {
    constructor(seed = Math.random()) {
        this.grad3 = [
            [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
            [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
            [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
        ];
        this.p = [];
        for (let i = 0; i < 256; i++) this.p[i] = i;
        let s = (seed * 2147483647) | 0;
        for (let i = 255; i > 0; i--) {
            s = ((s * 16807) | 0);
            if (s < 0) s += 2147483647;
            const j = s % (i + 1);
            [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
        }
        for (let i = 0; i < 256; i++) this.p[i] = this.p[i] & 255;
        for (let i = 256; i < 512; i++) this.p[i] = this.p[i - 256];
    }

    noise2D(x, y) {
        const F2 = 0.5 * (Math.sqrt(3) - 1);
        const G2 = (3 - Math.sqrt(3)) / 6;
        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        let i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;
        const ii = (i + 256) & 255;
        const jj = (j + 256) & 255;
        const pi = (v) => ((v % 12) + 12) % 12;
        const gi0 = pi(this.p[ii + this.p[jj]]);
        const gi1 = pi(this.p[ii + i1 + this.p[jj + j1]]);
        const gi2 = pi(this.p[ii + 1 + this.p[jj + 1]]);
        const dot = (g, x, y) => g[0] * x + g[1] * y;
        let n0, n1, n2;
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * dot(this.grad3[gi0], x0, y0));
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * dot(this.grad3[gi1], x1, y1));
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * dot(this.grad3[gi2], x2, y2));
        return 70 * (n0 + n1 + n2);
    }

    fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
        let val = 0, amp = 1, freq = 1, max = 0;
        for (let i = 0; i < octaves; i++) {
            val += amp * this.noise2D(x * freq, y * freq);
            max += amp;
            amp *= gain;
            freq *= lacunarity;
        }
        return val / max;
    }
}

// ============ COLOR CONSTANTS ============
const COLOR = {
    arenaGround: 0x5a8a3a,
    arenaPath: 0xc8b898,
    metalDark: 0x6a6a6a,
    metalLight: 0x9a9a9a,
    metalGold: 0xf8d840,
    ruinStone: 0xc8c2c0,
    ruinDarkStone: 0x9a9590,
    ruinFloor: 0xb0aaa5,
    ruinMoss: 0x7a9a5a,
    crystalBlue: 0x4488cc,
    crystalPurple: 0x8844aa,
    crystalFloor: 0x5a5a6a,
    crystalReflect: 0x99bbdd,
    crystalGlow: 0x88ccff,
    lava: 0xff4400,
    obsidian: 0x4a4a5a,
    wasteGround: 0x7a5a3a,
    scorchedRock: 0x5a5a5a,
    smoke: 0x4a4a4a,
    luminousBark: 0x5a4a3a,
    luminousLeaf: 0x22aa44,
    luminousGlow: 0x44ff88,
    luminousMushroom: 0x8844ff,
    luminousFloor: 0x5a8a5a,
    luminousPond: 0x226644,
    bridgeWood: 0x8a7a6a,
    fenceWood: 0x7a6a5a,
    stone: 0xb0b0b0,
    wood: 0x9b6236,
    chestWood: 0x9b6236,
    chestGold: 0xdaa520,
    forcefield: 0x4488ff,
    terrain: 0x5a8a3a,
};

// ============ MATERIAL CACHE ============
const _matCache = new Map();
function getMat(color, opts = {}) {
    const key = color.toString(16) + ':' + JSON.stringify(opts, null, 2);
    if (!_matCache.has(key)) {
        _matCache.set(key, new THREE.MeshStandardMaterial({ color, ...opts }));
    }
    const m = _matCache.get(key);
    if (m.transparent !== opts.transparent || m.opacity !== opts.opacity) {
        _matCache.delete(key);
        const m2 = new THREE.MeshStandardMaterial({ color, ...opts });
        _matCache.set(key, m2);
        return m2;
    }
    return m;
}

// ============ MAP GENERATOR ============
const _yield = () => new Promise(r => setTimeout(r, 50)); // 50ms yield

export class MapGenerator {
    constructor(scene) {
        console.log('[MapGen] constructor starting...');
        this.scene = scene;
        console.log('[MapGen] scene stored');
        this.arenaRadius = 220;
        this.spawnCourtyardRadius = 40;
        this.halfSize = this.arenaRadius;
        this.waterLevel = 0;
        this.colliders = [];
        this.spawnPads = [];
        this.hazards = [];
        this.traps = [];
        this.fogZones = [];
        this.radiationZones = [];
        this.lootData = [];
        this.animatedObjects = [];
        this.waterMeshes = [];
        this.particleSystems = [];
        this.noise = new SimplexNoise(42);
        this.heightMap = null;
        this.currentFogPhase = 0;
        this.zoneTransitionTime = 0;
        this.activeFogRing = null;
        this.onProgress = null;
        this.ready = new Promise(resolve => { this._resolveReady = resolve; });

        // Shared geometries for batching
        this._sharedGeo = new Map();
    }

    reportProgress(ratio, status) {
        this.onProgress?.(ratio, status);
    }

    startGeneration() {
        return this.generate();
    }

    // ---- Shared geometry helper ----
    getSharedGeo(name, createFn) {
        if (!this._sharedGeo.has(name)) {
            this._sharedGeo.set(name, createFn());
        }
        return this._sharedGeo.get(name);
    }

    // ===================== ZONE 0: ARENA FLOOR (Standard Materials) =====================
    buildArenaFloor() {
        console.log('[MapGen] buildArenaFloor() starting');
        const halfSize = this.arenaRadius;

        // Main terrain ground
        const groundMat = new THREE.MeshStandardMaterial({
            color: COLOR.arenaGround,
            roughness: 0.9,
            metalness: 0.05
        });
        const groundGeo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2, 1, 1);
        groundGeo.rotateX(-Math.PI / 2);
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.set(0, 0, 0);
        ground.position.set(0, 0, 0);
        ground.receiveShadow = true;
        ground.userData.isArena = true;
        ground.userData.isFloor = true;
        ground.userData.isGround = true;
        ground.userData.isMapObject = true;
        this.scene.add(ground);

        // Collision box for the arena floor
        this.colliders.push({
            type: 'box',
            position: new THREE.Vector3(0, 0, 0),
            size: new THREE.Vector3(halfSize * 2, 1, halfSize * 2),
            walkable: true
        });

        // Biome zone overlays (slightly elevated to avoid z-fighting)
        const biomeZones = [
            { name: 'citadel', color: COLOR.ruinFloor, x: -80, z: 80, radius: 75, rot: 0 },
            { name: 'crystal', color: COLOR.crystalFloor, x: 80, z: 80, radius: 70, rot: 0 },
            { name: 'wastes',  color: COLOR.wasteGround, x: -80, z: -80, radius: 75, rot: 0 },
            { name: 'forest',  color: COLOR.luminousFloor, x: 80, z: -80, radius: 75, rot: 0 },
        ];

        for (const bz of biomeZones) {
            const biomeMat = new THREE.MeshStandardMaterial({
                color: bz.color,
                roughness: 0.85,
                metalness: 0.05
            });
            const biomeGeo = new THREE.CircleGeometry(bz.radius, 32);
            biomeGeo.rotateX(-Math.PI / 2);
            const biomeMesh = new THREE.Mesh(biomeGeo, biomeMat);
            biomeMesh.position.set(bz.x, 0.01, bz.z);
            biomeMesh.receiveShadow = true;
            biomeMesh.userData.isArena = true;
            biomeMesh.userData.isBiome = true;
            biomeMesh.userData.biomeName = bz.name;
            biomeMesh.userData.isMapObject = true;
            this.scene.add(biomeMesh);
        }

        // Spawn courtyard (flat pad in the center)
        const spawnMat = new THREE.MeshStandardMaterial({
            color: COLOR.metalLight,
            roughness: 0.6,
            metalness: 0.2
        });
        const spawnGeo = new THREE.CircleGeometry(this.spawnCourtyardRadius, 32);
        spawnGeo.rotateX(-Math.PI / 2);
        const spawnPad = new THREE.Mesh(spawnGeo, spawnMat);
        spawnPad.position.set(0, 0.02, 0);
        spawnPad.receiveShadow = true;
        spawnPad.userData.isArena = true;
        spawnPad.userData.isSpawnPad = true;
        spawnPad.userData.isMapObject = true;
        this.scene.add(spawnPad);

        // Gentle terrain hills using InstancedMesh
        this._buildTerrainHills();
    }

    _buildTerrainHills() {
        const hillMat = new THREE.MeshStandardMaterial({
            color: COLOR.terrain,
            roughness: 1.0,
            metalness: 0.0
        });

        // Simple box hills for terrain interest
        const hillData = [];
        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 35 + Math.random() * (this.arenaRadius - 60);
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;
            const h = this.noise.fbm(x * 0.008, z * 0.008, 3) * 4;
            if (Math.abs(h) < 0.5) continue;
            const size = 4 + Math.abs(h) * 2;
            const hillH = Math.abs(h) * 1.2;
            hillData.push({
                x,
                y: hillH * 0.3,
                z,
                sx: size,
                sy: hillH,
                sz: size * 0.8,
                rotY: Math.random() * Math.PI,
                castShadow: h > 0,
                receiveShadow: true
            });
        }

        if (hillData.length > 0) {
            const geo = new THREE.BoxGeometry(1, 1, 0.8);
            const inst = new THREE.InstancedMesh(geo, hillMat, hillData.length);
            const dummy = new THREE.Object3D();
            for (let i = 0; i < hillData.length; i++) {
                const d = hillData[i];
                dummy.position.set(d.x, d.y, d.z);
                dummy.rotation.set(0, d.rotY, 0);
                dummy.scale.set(d.sx, d.sy, d.sz);
                dummy.updateMatrix();
                inst.setMatrixAt(i, dummy.matrix);
            }
            inst.instanceMatrix.needsUpdate = true;
            inst.receiveShadow = true;
            inst.castShadow = true;
            inst.userData.isArena = true;
            inst.userData.isTerrain = true;
            inst.userData.isHill = true;
            inst.userData.isCover = true;
            inst.userData.isMapObject = true;
            this.scene.add(inst);
        }
    }

    // ===================== FORCEFIELD =====================
    buildForcefield() {
        const ffMat = new THREE.MeshBasicMaterial({
            color: COLOR.forcefield,
            transparent: true,
            opacity: 0.15,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const ffGeo = new THREE.CylinderGeometry(this.arenaRadius, this.arenaRadius, 12, 64, 1, true);
        const forcefield = new THREE.Mesh(ffGeo, ffMat);
        forcefield.position.y = 6;
        forcefield.userData.isArena = true;
        forcefield.userData.isForcefield = true;
        forcefield.userData.isMapObject = true;
        this.scene.add(forcefield);
        this.animatedObjects.push({
            type: 'forcefield',
            mesh: forcefield,
            material: ffMat,
            baseOpacity: 0.15
        });

        // Top and bottom rings
        const ringMat = new THREE.MeshBasicMaterial({
            color: COLOR.forcefield,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });

        const topRing = new THREE.Mesh(new THREE.TorusGeometry(this.arenaRadius, 0.3, 8, 64), ringMat);
        topRing.position.y = 12;
        topRing.rotation.x = Math.PI / 2;
        topRing.userData.isMapObject = true;
        this.scene.add(topRing);

        const bottomRing = new THREE.Mesh(new THREE.TorusGeometry(this.arenaRadius, 0.3, 8, 64), ringMat);
        bottomRing.position.y = 0;
        bottomRing.rotation.x = Math.PI / 2;
        bottomRing.userData.isMapObject = true;
        this.scene.add(bottomRing);

        // Vertical support lines
        for (let i = 0; i < 48; i++) {
            const angle = (i / 48) * Math.PI * 2;
            const points = [
                new THREE.Vector3(Math.cos(angle) * this.arenaRadius, 0, Math.sin(angle) * this.arenaRadius),
                new THREE.Vector3(Math.cos(angle) * this.arenaRadius, 12, Math.sin(angle) * this.arenaRadius)
            ];
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
            const lineMat = new THREE.LineBasicMaterial({ color: COLOR.forcefield, transparent: true, opacity: 0.3 });
            const line = new THREE.Line(lineGeo, lineMat);
            line.userData.isMapObject = true;
            this.scene.add(line);
        }
    }

    // ===================== CORNUOPIA =====================
    async buildCornucopia() {
        console.log('[MapGen] buildCornucopia START');
        // Base platform
        const baseGeo = this.getSharedGeo('cornBase', () =>
            new THREE.CylinderGeometry(16, 18, 3, 8));
        const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({
            color: COLOR.metalDark, roughness: 0.6, metalness: 0.3
        }));
        base.position.set(0, 1.5, 0);
        base.castShadow = true;
        base.receiveShadow = true;
        base.userData.isArena = true;
        base.userData.isCornucopia = true;
        base.userData.isMapObject = true;
        this.scene.add(base);
        this.colliders.push({
            type: 'box',
            position: new THREE.Vector3(0, 1.5, 0),
            size: new THREE.Vector3(36, 3, 36),
            walkable: true
        });

        // Hull
        const hullGeo = this.getSharedGeo('cornHull', () =>
            new THREE.BoxGeometry(10, 10, 10));
        const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({
            color: COLOR.metalLight, roughness: 0.5, metalness: 0.4
        }));
        hull.position.set(0, 8, 0);
        hull.rotation.y = Math.PI / 4;
        hull.scale.set(1, 1, 0.6);
        hull.castShadow = true;
        hull.userData.isArena = true;
        hull.userData.isCornucopia = true;
        hull.userData.isMapObject = true;
        this.scene.add(hull);

        // Horns
        const hornMat = new THREE.MeshStandardMaterial({
            color: COLOR.metalGold, roughness: 0.3, metalness: 0.6
        });
        for (let side of [-1, 1]) {
            const hornGeo = this.getSharedGeo('cornHorn', () =>
                new THREE.CylinderGeometry(0.3, 1.2, 12, 10));
            const horn = new THREE.Mesh(hornGeo, hornMat);
            horn.position.set(side * 7, 14, 0);
            horn.rotation.z = side * 0.3;
            horn.castShadow = true;
            horn.userData.isArena = true;
            horn.userData.isCornucopia = true;
            horn.userData.isMapObject = true;
            this.scene.add(horn);
        }

        // Spire
        const spireGeo = this.getSharedGeo('cornSpire', () =>
            new THREE.CylinderGeometry(1.5, 3, 8, 8));
        const spire = new THREE.Mesh(spireGeo, new THREE.MeshStandardMaterial({
            color: COLOR.metalDark, roughness: 0.4, metalness: 0.5
        }));
        spire.position.set(0, 17, 0);
        spire.castShadow = true;
        spire.userData.isArena = true;
        spire.userData.isCornucopia = true;
        spire.userData.isMapObject = true;
        this.scene.add(spire);

        // Spire top
        const spireTopGeo = this.getSharedGeo('cornSpireTop', () =>
            new THREE.SphereGeometry(1.5, 8, 6));
        const spireTop = new THREE.Mesh(spireTopGeo, hornMat);
        spireTop.position.set(0, 22, 0);
        spireTop.castShadow = true;
        this.scene.add(spireTop);

        // Chest at center
        this._buildChest(0, 3.1, 0, 5);

        // Observation platform
        const obsGeo = this.getSharedGeo('cornObs', () =>
            new THREE.CylinderGeometry(4.5, 4.5, 0.3, 8));
        const obs = new THREE.Mesh(obsGeo, new THREE.MeshStandardMaterial({
            color: COLOR.metalDark, roughness: 0.7, metalness: 0.3
        }));
        obs.position.set(0, 5, 14);
        obs.receiveShadow = true;
        obs.userData.isArena = true;
        obs.userData.isCornucopia = true;
        obs.userData.isMapObject = true;
        this.scene.add(obs);

        // Supply crates around cornucopia
        const cratePositions = [
            { x: 5, z: 5 }, { x: -5, z: 5 }, { x: 5, z: -5 }, { x: -5, z: -5 },
            { x: 10, z: 0 }, { x: -10, z: 0 }, { x: 0, z: 10 }, { x: 0, z: -10 },
            { x: 8, z: 8 }, { x: -8, z: 8 }, { x: 8, z: -8 }, { x: -8, z: -8 },
            { x: 12, z: 6 }, { x: -12, z: 6 }
        ];
        for (const cp of cratePositions) {
            const crateGeo = new THREE.BoxGeometry(1.2, 1, 1);
            const crate = new THREE.Mesh(crateGeo, new THREE.MeshStandardMaterial({
                color: COLOR.chestWood, roughness: 0.8, metalness: 0.05
            }));
            crate.position.set(cp.x, 0.5, cp.z);
            crate.castShadow = true;
            crate.receiveShadow = true;
            crate.userData.isArena = true;
            crate.userData.isCornucopia = true;
            crate.userData.isMapObject = true;
            this.scene.add(crate);
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3(cp.x, 0.5, cp.z),
                size: new THREE.Vector3(1.2, 1, 1),
                walkable: false
           });
        }
        await _yield();

        // 11 spawn pads
        this.spawnPads.push({ x: 0, y: 0, z: 0, radius: 3.5 });

        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            this.spawnPads.push({
                x: Math.cos(a) * 8,
                y: 0,
                z: Math.sin(a) * 8,
                radius: 2
            });
        }

        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 5;
            this.spawnPads.push({
                x: Math.cos(a) * 16,
                y: 0,
                z: Math.sin(a) * 16,
                radius: 1.8
            });
        }

        // Spawn pad visual markers
        const padMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.3 });
        for (const pad of this.spawnPads) {
            const ringGeo = new THREE.RingGeometry(pad.radius * 0.8, pad.radius, 24);
            ringGeo.rotateX(-Math.PI / 2);
            const ring = new THREE.Mesh(ringGeo, padMat);
            ring.position.set(pad.x, 0.05, pad.z);
            this.scene.add(ring);
        }
        console.log('[MapGen] buildInnerRing yield1');
        await _yield();
        console.log('[MapGen] buildInnerRing yield2');
        await _yield();
        console.log('[MapGen] buildInnerRing yield3');
    }

    _buildChest(x, y, z, tier) {
        const chestGroup = new THREE.Group();
        chestGroup.position.set(x, y, z);

        const bodyGeo = new THREE.BoxGeometry(0.8, 0.6, 0.5);
        const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({
            color: COLOR.chestWood, roughness: 0.7, metalness: 0.1
        }));
        body.position.y = 0.3;
        body.castShadow = true;
        chestGroup.add(body);

        const lidGeo = new THREE.BoxGeometry(0.8, 0.15, 0.5);
        const lid = new THREE.Mesh(lidGeo, new THREE.MeshStandardMaterial({
            color: COLOR.chestWood, roughness: 0.7, metalness: 0.1
        }));
        lid.position.set(0, 0.67, 0);
        lid.castShadow = true;
        chestGroup.add(lid);

        // Gold trim
        const trimGeo = new THREE.BoxGeometry(0.82, 0.05, 0.52);
        const trim = new THREE.Mesh(trimGeo, new THREE.MeshStandardMaterial({
            color: COLOR.chestGold, roughness: 0.3, metalness: 0.7
        }));
        trim.position.y = 0.6;
        chestGroup.add(trim);

        // Lock
        const lockGeo = new THREE.SphereGeometry(0.08, 6, 4);
        const lock = new THREE.Mesh(lockGeo, new THREE.MeshStandardMaterial({
            color: COLOR.chestGold, roughness: 0.2, metalness: 0.8
        }));
        lock.position.set(0, 0.3, 0.27);
        chestGroup.add(lock);

        this.scene.add(chestGroup);
        this.colliders.push({
            type: 'box',
            position: new THREE.Vector3(x, y + 0.3, z),
            size: new THREE.Vector3(0.8, 0.6, 0.5),
            walkable: false
        });
    }

    // ===================== INNER RING =====================
    async buildInnerRing() {
        // 8 outposts around the ring
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const r = 110;
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;

            if (i % 2 === 0) {
                // Stone outpost
                this._buildStoneOutpost(x, z, angle);
            } else {
                // Wooden barricade
                this._buildWoodenBarricade(x, z, angle);
            }

          // Loot glow
            const glowLight = new THREE.PointLight(0xffcc44, 0.5, 10);
            glowLight.position.set(x, 3, z);
            this.scene.add(glowLight);
        }
        await _yield();

        // Scouting mounds (4 cardinal)
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 + Math.PI / 8;
            const r = 130;
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;

            const moundGeo = new THREE.ConeGeometry(5, 6, 6);
            const mound = new THREE.Mesh(moundGeo, new THREE.MeshStandardMaterial({
                color: COLOR.stone, roughness: 0.9
            }));
            mound.position.set(x, 3, z);
            mound.castShadow = true;
            mound.userData.isArena = true;
            mound.userData.isTerrain = true;
            mound.userData.isMapObject = true;
            this.scene.add(mound);

            const platGeo = new THREE.CylinderGeometry(3, 3, 0.2, 8);
            const plat = new THREE.Mesh(platGeo, new THREE.MeshStandardMaterial({
                color: COLOR.ruinStone, roughness: 0.8
            }));
            plat.position.set(x, 6.1, z);
            plat.receiveShadow = true;
            plat.userData.isArena = true;
            plat.userData.isMapObject = true;
            this.scene.add(plat);
        }
        await _yield();

        // Cover rocks
        for (let i = 0; i < 30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 45 + Math.random() * 160;
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;

            const rockGeo = new THREE.DodecahedronGeometry(0.8 + Math.random() * 1.2, 0);
            const rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({
                color: COLOR.stone, roughness: 0.9, metalness: 0.05
            }));
            rock.position.set(x, 0.5, z);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.scale.y = 0.6 + Math.random() * 0.4;
            rock.castShadow = true;
            rock.receiveShadow = true;
            rock.userData.isArena = true;
            rock.userData.isCover = true;
            rock.userData.isTerrain = true;
            rock.userData.isMapObject = true;
            this.scene.add(rock);
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3(x, 0.5, z),
                size: new THREE.Vector3(1.6, 1.6, 1.6),
                walkable: false
            });
        }
        await _yield();
    }

    _buildStoneOutpost(x, z, angle) {
        const wallMat = new THREE.MeshStandardMaterial({
            color: COLOR.ruinStone, roughness: 0.8, metalness: 0.1
        });
        const darkMat = new THREE.MeshStandardMaterial({
            color: COLOR.ruinDarkStone, roughness: 0.9, metalness: 0.05
        });

        // 4 walls with entrance gap
        for (let w = 0; w < 4; w++) {
            if (w === 1) continue; // Leave entrance gap
            const wallGeo = new THREE.BoxGeometry(4, 3.5, 0.6);
            const wall = new THREE.Mesh(wallGeo, wallMat);
            const a = angle + (w - 1) * Math.PI / 2;
            wall.position.set(
                x + Math.cos(a) * 4,
                1.75,
                z + Math.sin(a) * 4
            );
            wall.rotation.y = a;
            wall.castShadow = true;
            wall.receiveShadow = true;
            wall.userData.isArena = true;
            wall.userData.isMapObject = true;
            this.scene.add(wall);
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3(
                    x + Math.cos(a) * 4, 1.75,
                    z + Math.sin(a) * 4
                ),
                size: new THREE.Vector3(4, 3.5, 0.6),
                walkable: false
            });
        }

        // Corner posts
        for (let c = 0; c < 4; c++) {
            const postGeo = new THREE.BoxGeometry(0.4, 4.5, 0.4);
            const post = new THREE.Mesh(postGeo, darkMat);
            const a = angle + c * Math.PI / 2;
            post.position.set(
                x + Math.cos(a) * 4.2,
                2.25,
                z + Math.sin(a) * 4.2
            );
            post.castShadow = true;
            post.userData.isArena = true;
            post.userData.isMapObject = true;
            this.scene.add(post);
        }

        // Torus roof
        const roofGeo = new THREE.TorusGeometry(3.5, 0.3, 6, 8);
        const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({
            color: COLOR.wood, roughness: 0.9
        }));
        roof.position.set(x, 4.5, z);
        roof.rotation.x = Math.PI / 2;
        roof.castShadow = true;
        roof.userData.isArena = true;
        roof.userData.isMapObject = true;
        this.scene.add(roof);

        // Floor
        const floorGeo = new THREE.CircleGeometry(4, 8);
        floorGeo.rotateX(-Math.PI / 2);
        const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
            color: COLOR.ruinFloor, roughness: 0.9
        }));
        floor.position.set(x, 0.05, z);
        floor.receiveShadow = true;
        floor.userData.isArena = true;
        floor.userData.isMapObject = true;
        this.scene.add(floor);
    }

    _buildWoodenBarricade(x, z) {
        const woodMat = new THREE.MeshStandardMaterial({
            color: COLOR.wood, roughness: 0.85, metalness: 0.0
        });

        // 3 walls
        for (let w = 0; w < 3; w++) {
            const wallGeo = new THREE.BoxGeometry(5, 2, 0.4);
            const wall = new THREE.Mesh(wallGeo, woodMat);
            const a = w * Math.PI * 2 / 3;
            wall.position.set(
                x + Math.cos(a) * 3,
                1,
                z + Math.sin(a) * 3
            );
            wall.rotation.y = a;
            wall.castShadow = true;
            wall.receiveShadow = true;
            wall.userData.isArena = true;
            wall.userData.isCover = true;
            wall.userData.isMapObject = true;
            this.scene.add(wall);
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3(
                    x + Math.cos(a) * 3, 1,
                    z + Math.sin(a) * 3
                ),
                size: new THREE.Vector3(5, 2, 0.4),
                walkable: false
            });
        }

        // Roof beam
        const beamGeo = new THREE.BoxGeometry(6, 0.2, 0.2);
        const beam = new THREE.Mesh(beamGeo, woodMat);
        beam.position.set(x, 2.5, z);
        beam.castShadow = true;
        beam.userData.isArena = true;
        beam.userData.isMapObject = true;
        this.scene.add(beam);
    }

    // ===================== BIOME ZONES =====================
    async buildBiomePaths() {
        const pathMat = new THREE.MeshStandardMaterial({
            color: COLOR.arenaPath,
            roughness: 0.9,
            metalness: 0.0
        });

        // 4 diagonal paths from center to biomes
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);

            // Path tiles
            for (let t = 0; t < 40; t++) {
                const dist = 25 + t * 4.5;
                const tileW = 1.5 + (1 - dist / 220) * 1;
                const tileGeo = new THREE.PlaneGeometry(tileW, 3);
                tileGeo.rotateX(-Math.PI / 2);
                const tile = new THREE.Mesh(tileGeo, pathMat);
                tile.position.set(
                    cosA * dist,
                    0.015,
                    sinA * dist
                );
                tile.rotation.z = angle;
                tile.receiveShadow = true;
                tile.userData.isArena = true;
                tile.userData.isPath = true;
                tile.userData.isMapObject = true;
                this.scene.add(tile);
                if (t % 5 === 0) await _yield();
            }

            // Lantern posts
            for (let l = 0; l < 4; l++) {
                const dist = 30 + l * 12;
                const lx = cosA * dist;
                const lz = sinA * dist;

                const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 3, 6);
                const post = new THREE.Mesh(postGeo, new THREE.MeshStandardMaterial({
                    color: COLOR.metalDark, roughness: 0.6, metalness: 0.3
                }));
                post.position.set(lx, 1.5, lz);
                post.castShadow = true;
                post.userData.isArena = true;
                post.userData.isPath = true;
                post.userData.isMapObject = true;
                this.scene.add(post);

                const headGeo = new THREE.BoxGeometry(0.4, 0.3, 0.4);
                const head = new THREE.Mesh(headGeo, post.material);
                head.position.set(lx, 3.2, lz);
                head.userData.isArena = true;
                head.userData.isMapObject = true;
                this.scene.add(head);

                const glowGeo = new THREE.SphereGeometry(0.2, 6, 4);
                const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
                    color: 0xffcc66, transparent: true, opacity: 0.6
                }));
                glow.position.set(lx, 3.5, lz);
                this.scene.add(glow);
                this.animatedObjects.push({
                    type: 'lantern',
                    mesh: glow,
                    baseOpacity: 0.6
                });

                const lanternLight = new THREE.PointLight(0xffcc66, 0.3, 8);
               lanternLight.position.set(lx, 3.5, lz);
                this.scene.add(lanternLight);
            }
            await _yield();
        }
        await _yield();
    }

    // ===================== RUINED CITADEL (NW) =====================
    async buildRuinedCitadel() {
        const cx = -80, cz = 80;

        // Floor
        const citFloorGeo = new THREE.CircleGeometry(70, 8);
        citFloorGeo.rotateX(-Math.PI / 2);
        const citFloor = new THREE.Mesh(citFloorGeo, new THREE.MeshStandardMaterial({
            color: COLOR.ruinFloor, roughness: 0.85
        }));
        citFloor.position.set(cx, 0.01, cz);
        citFloor.receiveShadow = true;
        citFloor.userData.isArena = true;
        citFloor.userData.isBiome = true;
        citFloor.userData.biomeName = 'citadel';
        citFloor.userData.isMapObject = true;
        this.scene.add(citFloor);

        // 4 main towers
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
            const r = 55;
            const tx = cx + Math.cos(angle) * r;
            const tz = cz + Math.sin(angle) * r;

            const towerMat = new THREE.MeshStandardMaterial({
                color: i % 2 === 0 ? COLOR.ruinStone : COLOR.ruinDarkStone,
                roughness: 0.85,
                metalness: 0.1
            });

            // Tower body
            const towerGeo = new THREE.CylinderGeometry(3, 3.5, 12, 8);
            const tower = new THREE.Mesh(towerGeo, towerMat);
            tower.position.set(tx, 6, tz);
            tower.castShadow = true;
            tower.receiveShadow = true;
            tower.userData.isArena = true;
            tower.userData.isCitadel = true;
            tower.userData.isMapObject = true;
            this.scene.add(tower);

            // Battlements
            for (let b = 0; b < 8; b++) {
                const ba = (b / 8) * Math.PI * 2;
                const bx = tx + Math.cos(ba) * 3.3;
                const bz = tz + Math.sin(ba) * 3.3;
                const battGeo = new THREE.BoxGeometry(1, 1.5, 0.6);
                const batt = new THREE.Mesh(battGeo, towerMat);
                batt.position.set(bx, 12.75, bz);
                batt.rotation.y = -ba;
                batt.castShadow = true;
                batt.userData.isArena = true;
                batt.userData.isCitadel = true;
                batt.userData.isMapObject = true;
                this.scene.add(batt);
            }

            // Door
            const doorGeo = new THREE.BoxGeometry(1.5, 3, 0.5);
            const doorMat = new THREE.MeshStandardMaterial({
                color: COLOR.wood, roughness: 0.9
            });
            const door = new THREE.Mesh(doorGeo, doorMat);
            door.position.set(
                tx + Math.cos(angle) * 3,
                1.5,
                tz + Math.sin(angle) * 3
            );
            door.userData.isArena = true;
            door.userData.isCitadel = true;
            door.userData.isMapObject = true;
            this.scene.add(door);
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3(
                    tx + Math.cos(angle) * 3, 1.5,
                    tz + Math.sin(angle) * 3
                ),
                size: new THREE.Vector3(1.5, 3, 0.5),
                walkable: false
            });

            // Window gap
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3(tx, 4, tz),
                size: new THREE.Vector3(7, 8, 7),
                walkable: true,
                dynamic: true,
               enabled: false
            });
            if ((i % 2) === 0) await _yield();
        }
        await _yield();

        // Connecting walls
        for (let i = 0; i < 4; i++) {
            const a1 = (i / 4) * Math.PI * 2 + Math.PI / 4;
            const a2 = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4;
            const mx = (Math.cos(a1) + Math.cos(a2)) * 55 * 0.5;
            const mz = (Math.sin(a1) + Math.sin(a2)) * 55 * 0.5;
            const wallLen = Math.sqrt((Math.cos(a1) - Math.cos(a2)) ** 2 + (Math.sin(a1) - Math.sin(a2)) ** 2) * 55;
            const wallAngle = Math.atan2(Math.sin(a2) - Math.sin(a1), Math.cos(a2) - Math.cos(a1));

            const wallGeo = new THREE.BoxGeometry(wallLen, 6, 0.8);
            const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({
                color: COLOR.ruinStone, roughness: 0.9
            }));
            wall.position.set(cx + mx, 3, cz + mz);
            wall.rotation.y = wallAngle;
            wall.castShadow = true;
            wall.receiveShadow = true;
            wall.userData.isArena = true;
            wall.userData.isCitadel = true;
            wall.userData.isMapObject = true;
            this.scene.add(wall);
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3(cx + mx, 3, cz + mz),
                size: new THREE.Vector3(wallLen, 6, 0.8),
                walkable: false
           });
        }
        await _yield();

        // Moss patches
        for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 60;
            const mossGeo = new THREE.SphereGeometry(0.8 + Math.random() * 1.5, 6, 4);
            const moss = new THREE.Mesh(mossGeo, new THREE.MeshStandardMaterial({
                color: COLOR.ruinMoss, roughness: 1.0
            }));
            moss.position.set(
                cx + Math.cos(angle) * r,
                0.5,
                cz + Math.sin(angle) * r
            );
            moss.scale.y = 0.4;
            moss.receiveShadow = true;
            moss.userData.isArena = true;
            moss.userData.isCitadel = true;
            moss.userData.isTerrain = true;
            moss.userData.isMapObject = true;
            this.scene.add(moss);
        }
        await _yield();

        // Courtyard cover walls
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const r = 15 + Math.random() * 10;
            const cwGeo = new THREE.BoxGeometry(3, 2, 0.5);
            const cw = new THREE.Mesh(cwGeo, new THREE.MeshStandardMaterial({
                color: COLOR.ruinDarkStone, roughness: 0.9
            }));
            cw.position.set(
                cx + Math.cos(angle) * r,
                1,
                cz + Math.sin(angle) * r
            );
            cw.rotation.y = angle;
            cw.castShadow = true;
            cw.receiveShadow = true;
            cw.userData.isArena = true;
            cw.userData.isCitadel = true;
            cw.userData.isCover = true;
            cw.userData.isMapObject = true;
            this.scene.add(cw);
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3(
                    cx + Math.cos(angle) * r, 1,
                    cz + Math.sin(angle) * r
                ),
                size: new THREE.Vector3(3, 2, 0.5),
                walkable: false
            });
        }

      // Citadel light
        const citLight = new THREE.PointLight(0xffeedd, 1, 40);
        citLight.position.set(cx, 8, cz);
        this.scene.add(citLight);
        await _yield();
    }

    // ===================== CRYSTAL GROTTO (NE) =====================
    async buildCrystalGrotto() {
        const cx = 80, cz = 80;

        // Floor
        const cryFloorGeo = new THREE.CircleGeometry(70, 8);
        cryFloorGeo.rotateX(-Math.PI / 2);
        const cryFloor = new THREE.Mesh(cryFloorGeo, new THREE.MeshStandardMaterial({
            color: COLOR.crystalFloor, roughness: 0.6, metalness: 0.2
        }));
        cryFloor.position.set(cx, 0.01, cz);
        cryFloor.receiveShadow = true;
        cryFloor.userData.isArena = true;
        cryFloor.userData.isBiome = true;
        cryFloor.userData.biomeName = 'crystal';
        cryFloor.userData.isMapObject = true;
        this.scene.add(cryFloor);

        // Crystals
        for (let i = 0; i < 50; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 5 + Math.random() * 60;
            const x = cx + Math.cos(angle) * r;
            const z = cz + Math.sin(angle) * r;
            const h = 2 + Math.random() * 6;

            const sides = Math.random() > 0.5 ? 6 : 5;
            const crystalGeo = new THREE.ConeGeometry(0.5 + Math.random() * 0.5, h, sides);
            const isPurple = Math.random() > 0.6;
            const crystal = new THREE.Mesh(crystalGeo, new THREE.MeshStandardMaterial({
                color: isPurple ? COLOR.crystalPurple : COLOR.crystalBlue,
                roughness: 0.2,
                metalness: 0.4,
                transparent: true,
                opacity: 0.8
            }));
            crystal.position.set(x, h * 0.4, z);
            crystal.rotation.set(
                (Math.random() - 0.5) * 0.2,
                Math.random() * Math.PI,
                (Math.random() - 0.5) * 0.3
            );
            crystal.castShadow = true;
            crystal.userData.isArena = true;
            crystal.userData.isCrystal = true;
            crystal.userData.isMapObject = true;
            this.scene.add(crystal);

            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3(x, h * 0.4, z),
                size: new THREE.Vector3(1.5, h, 1.5),
                walkable: false
            });
            if (i % 10 === 0) await _yield();
        }
        await _yield();

        // Crystal columns
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const r = 30;
            const colGeo = new THREE.CylinderGeometry(0.8, 1.2, 8, 8);
            const col = new THREE.Mesh(colGeo, new THREE.MeshStandardMaterial({
                color: COLOR.crystalBlue, roughness: 0.3, metalness: 0.3,
                transparent: true, opacity: 0.7
            }));
            col.position.set(cx + Math.cos(angle) * r, 4, cz + Math.sin(angle) * r);
            col.castShadow = true;
            col.userData.isArena = true;
            col.userData.isCrystal = true;
            col.userData.isMapObject = true;
            this.scene.add(col);
        }

        // Water pools
        for (let p = 0; p < 2; p++) {
            const angle = (p / 2) * Math.PI + Math.PI / 4;
            const r = 45;
            const px = cx + Math.cos(angle) * r;
            const pz = cz + Math.sin(angle) * r;

            const poolGeo = new THREE.CylinderGeometry(4, 4, 0.15, 24);
            const pool = new THREE.Mesh(poolGeo, new THREE.MeshStandardMaterial({
                color: COLOR.crystalReflect,
                roughness: 0.1,
                metalness: 0.6,
                transparent: true,
                opacity: 0.6
            }));
            pool.position.set(px, 0.1, pz);
            pool.userData.isArena = true;
            pool.userData.isBiome = true;
            pool.userData.isMapObject = true;
            pool.userData.isWater = true;
            this.waterMeshes.push(pool);
            this.scene.add(pool);
        }

        // Cave systems
        for (let c = 0; c < 3; c++) {
            const angle = (c / 3) * Math.PI * 2 + Math.PI / 6;
            const r = 50;
            const cx2 = cx + Math.cos(angle) * r;
            const cz2 = cz + Math.sin(angle) * r;

            // Cave entrance sphere
            const caveGeo = new THREE.SphereGeometry(3, 8, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
            const cave = new THREE.Mesh(caveGeo, new THREE.MeshStandardMaterial({
                color: COLOR.crystalPurple, roughness: 0.8, side: THREE.DoubleSide,
                transparent: true, opacity: 0.3
            }));
            cave.position.set(cx2, 2.5, cz2);
            cave.userData.isArena = true;
            cave.userData.isCrystal = true;
            cave.userData.isMapObject = true;
            this.scene.add(cave);

            // Stalactites
            for (let s = 0; s < 6; s++) {
                const stalGeo = new THREE.ConeGeometry(0.3, 1 + Math.random(), 5);
                const stal = new THREE.Mesh(stalGeo, new THREE.MeshStandardMaterial({
                    color: COLOR.crystalBlue, roughness: 0.5, metalness: 0.2
                }));
                stal.position.set(
                    cx2 + (Math.random() - 0.5) * 4,
                    2 + Math.random(),
                    cz2 + (Math.random() - 0.5) * 4
                );
                stal.rotation.z = (Math.random() - 0.5) * 0.3;
                stal.userData.isArena = true;
                stal.userData.isCrystal = true;
                stal.userData.isMapObject = true;
                this.scene.add(stal);
            }

            // Cave light
            const caveLight = new THREE.PointLight(COLOR.crystalGlow, 0.6, 12);
            caveLight.position.set(cx2, 3, cz2);
            this.scene.add(caveLight);
            if ((c % 2) === 0) await _yield();
        }

        // Crystal glow
        const cryLight = new THREE.PointLight(COLOR.crystalGlow, 1, 50);
        cryLight.position.set(cx, 5, cz);
        this.scene.add(cryLight);
        await _yield();
    }

    // ===================== BURNING WASTES (SW) =====================
    async buildBurningWastes() {
        const cx = -80, cz = -80;

        // Floor
        const wastGeo = new THREE.CircleGeometry(75, 8);
        wastGeo.rotateX(-Math.PI / 2);
        const wastFloor = new THREE.Mesh(wastGeo, new THREE.MeshStandardMaterial({
            color: COLOR.wasteGround, roughness: 1.0
        }));
        wastFloor.position.set(cx, 0.01, cz);
        wastFloor.receiveShadow = true;
        wastFloor.userData.isArena = true;
        wastFloor.userData.isBiome = true;
        wastFloor.userData.biomeName = 'wastes';
        wastFloor.userData.isMapObject = true;
        this.scene.add(wastFloor);

        // Lava pools
        for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 10 + Math.random() * 60;
            const lx = cx + Math.cos(angle) * r;
            const lz = cz + Math.sin(angle) * r;
            const lRadius = 1 + Math.random() * 2;

            const lavaGeo = new THREE.CylinderGeometry(lRadius, lRadius, 0.12, 12);
            const lava = new THREE.Mesh(lavaGeo, new THREE.MeshStandardMaterial({
                color: COLOR.lava,
                emissive: 0xff2200,
                emissiveIntensity: 0.5,
                roughness: 0.3
            }));
            lava.position.set(lx, 0.08, lz);
            lava.userData.isArena = true;
            lava.userData.isLava = true;
            lava.userData.isMapObject = true;
            this.scene.add(lava);
            this.animatedObjects.push({ type: 'lava', mesh: lava, material: lava.material });
        }
        await _yield();

        // Obsidian barriers
        for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 15 + Math.random() * 55;
            const ox = cx + Math.cos(angle) * r;
            const oz = cz + Math.sin(angle) * r;

            const isWall = Math.random() > 0.5;
            const obsGeo = new THREE.BoxGeometry(
                isWall ? 4 : 1.5,
                2 + Math.random() * 2,
                isWall ? 0.6 : 1.5
            );
            const obs = new THREE.Mesh(obsGeo, new THREE.MeshStandardMaterial({
                color: COLOR.obsidian, roughness: 0.7, metalness: 0.2
            }));
            obs.position.set(ox, 1.5, oz);
            obs.rotation.y = Math.random() * Math.PI;
            obs.castShadow = true;
            obs.receiveShadow = true;
            obs.userData.isArena = true;
            obs.userData.isWaste = true;
            obs.userData.isCover = true;
            obs.userData.isMapObject = true;
            this.scene.add(obs);
            this.colliders.push({
                type: 'box',
                position: new THREE.Vector3(ox, 1.5, oz),
                size: new THREE.Vector3(
                    isWall ? 4 : 1.5,
                    2 + Math.random() * 2,
                    isWall ? 0.6 : 1.5
                ),
                walkable: false
            });
        }
        await _yield();

        // Rocks
        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 10 + Math.random() * 60;
            const rockGeo = new THREE.DodecahedronGeometry(0.6 + Math.random() * 1, 0);
            const rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({
                color: COLOR.scorchedRock, roughness: 1.0
            }));
            rock.position.set(
                cx + Math.cos(angle) * r,
                0.5,
                cz + Math.sin(angle) * r
            );
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.scale.y = 0.6 + Math.random() * 0.4;
            rock.castShadow = true;
            rock.receiveShadow = true;
            rock.userData.isArena = true;
            rock.userData.isTerrain = true;
            rock.userData.isMapObject = true;
            this.scene.add(rock);
        }
        await _yield();

        // Smoke clouds
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 20 + Math.random() * 40;
            const smokeGeo = new THREE.SphereGeometry(2 + Math.random() * 2, 6, 4);
            const smoke = new THREE.Mesh(smokeGeo, new THREE.MeshStandardMaterial({
                color: COLOR.smoke,
                transparent: true,
                opacity: 0.2,
                depthWrite: false
            }));
            smoke.position.set(
                cx + Math.cos(angle) * r,
                8 + Math.random() * 5,
                cz + Math.sin(angle) * r
            );
            smoke.userData.isArena = true;
            smoke.userData.isWaste = true;
            smoke.userData.isMapObject = true;
            this.scene.add(smoke);
            this.animatedObjects.push({
                type: 'smoke',
                mesh: smoke,
                baseOpacity: 0.2
            });
        }
        await _yield();

        // Ruined bunkers
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const r = 40;
            const bx = cx + Math.cos(angle) * r;
            const bz = cz + Math.sin(angle) * r;

            // 3 walls
            for (let w = 0; w < 3; w++) {
                if (w === 1) continue;
                const bWallGeo = new THREE.BoxGeometry(4, 3, 0.5);
                const bWall = new THREE.Mesh(bWallGeo, new THREE.MeshStandardMaterial({
                    color: COLOR.obsidian, roughness: 0.9
                }));
                const wa = (w - 1) * Math.PI / 2;
                bWall.position.set(
                    bx + Math.cos(wa) * 3,
                    1.5,
                    bz + Math.sin(wa) * 3
                );
                bWall.rotation.y = wa;
                bWall.castShadow = true;
                bWall.userData.isArena = true;
                bWall.userData.isWaste = true;
                bWall.userData.isMapObject = true;
                this.scene.add(bWall);
                this.colliders.push({
                    type: 'box',
                    position: new THREE.Vector3(bx + Math.cos(wa) * 3, 1.5, bz + Math.sin(wa) * 3),
                    size: new THREE.Vector3(4, 3, 0.5),
                    walkable: false
                });
            }
        }

        // Volcanic craters
        for (let i = 0; i < 5; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 20 + Math.random() * 40;
            const craterGeo = new THREE.TorusGeometry(2, 0.5, 6, 12);
            craterGeo.rotateX(-Math.PI / 2);
            const crater = new THREE.Mesh(craterGeo, new THREE.MeshStandardMaterial({
                color: COLOR.scorchedRock, roughness: 1.0
            }));
            crater.position.set(cx + Math.cos(angle) * r, 0.1, cz + Math.sin(angle) * r);
            crater.userData.isArena = true;
            crater.userData.isWaste = true;
            crater.userData.isMapObject = true;
            this.scene.add(crater);
        }

        // Wastes light
        const wastLight = new THREE.PointLight(0xff6633, 0.8, 50);
        wastLight.position.set(cx, 5, cz);
        this.scene.add(wastLight);
        await _yield();
    }

    // ===================== LUMINOUS FOREST (SE) =====================
    async buildLuminousForest() {
        const cx = 80, cz = -80;

        // Floor
        const foreGeo = new THREE.CircleGeometry(75, 8);
        foreGeo.rotateX(-Math.PI / 2);
        const foreFloor = new THREE.Mesh(foreGeo, new THREE.MeshStandardMaterial({
            color: COLOR.luminousFloor, roughness: 0.9
        }));
        foreFloor.position.set(cx, 0.01, cz);
        foreFloor.receiveShadow = true;
        foreFloor.userData.isArena = true;
        foreFloor.userData.isBiome = true;
        foreFloor.userData.biomeName = 'forest';
        foreFloor.userData.isMapObject = true;
        this.scene.add(foreFloor);

        // Trees
        for (let i = 0; i < 50; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 8 + Math.random() * 60;
            const tx = cx + Math.cos(angle) * r;
            const tz = cz + Math.sin(angle) * r;

            const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 4, 6);
            const trunk = new THREE.Mesh(trunkGeo, new THREE.MeshStandardMaterial({
                color: COLOR.luminousBark, roughness: 0.9
            }));
            trunk.position.set(tx, 2, tz);
            trunk.castShadow = true;
            trunk.userData.isArena = true;
            trunk.userData.isForest = true;
            trunk.userData.isMapObject = true;
            this.scene.add(trunk);

            // Canopy
            const canopyGeo = new THREE.SphereGeometry(2 + Math.random(), 6, 4);
            const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({
                color: COLOR.luminousLeaf, roughness: 0.8
            }));
            canopy.position.set(tx, 5 + Math.random(), tz);
            canopy.castShadow = true;
            canopy.userData.isArena = true;
            canopy.userData.isForest = true;
            canopy.userData.isCover = true;
            canopy.userData.isMapObject = true;
            this.scene.add(canopy);

            // Glow particles in canopy
            if (Math.random() > 0.5) {
                const glowGeo = new THREE.SphereGeometry(0.3, 4, 3);
                const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
                    color: COLOR.luminousGlow,
                    transparent: true,
                    opacity: 0.4
                }));
                glow.position.set(tx, 5.5 + Math.random(), tz);
                this.scene.add(glow);
                this.animatedObjects.push({
                    type: 'glow',
                    mesh: glow,
                    baseOpacity: 0.4
                });
            }
        }
        await _yield();

        // Mushrooms
        for (let i = 0; i < 30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 10 + Math.random() * 55;
            const mx = cx + Math.cos(angle) * r;
            const mz = cz + Math.sin(angle) * r;

            const stemGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.8, 6);
            const stem = new THREE.Mesh(stemGeo, new THREE.MeshStandardMaterial({
                color: 0xddddbb, roughness: 0.8
            }));
            stem.position.set(mx, 0.4, mz);
            stem.userData.isArena = true;
            stem.userData.isForest = true;
            stem.userData.isMapObject = true;
            this.scene.add(stem);

            const capGeo = new THREE.SphereGeometry(0.5, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
            const cap = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({
                color: COLOR.luminousMushroom, roughness: 0.5,
                emissive: 0x4400aa, emissiveIntensity: 0.15
            }));
            cap.position.set(mx, 0.85, mz);
            cap.userData.isArena = true;
            cap.userData.isForest = true;
            cap.userData.isMapObject = true;
            this.scene.add(cap);
        }
        await _yield();

        // Bushes
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 10 + Math.random() * 55;
            const bushGeo = new THREE.SphereGeometry(0.6 + Math.random() * 0.5, 5, 3);
            const bush = new THREE.Mesh(bushGeo, new THREE.MeshStandardMaterial({
                color: COLOR.luminousLeaf, roughness: 0.9
            }));
            bush.position.set(
                cx + Math.cos(angle) * r,
                0.5,
                cz + Math.sin(angle) * r
            );
            bush.scale.y = 0.7;
            bush.castShadow = true;
            bush.receiveShadow = true;
            bush.userData.isArena = true;
            bush.userData.isForest = true;
            bush.userData.isCover = true;
            bush.userData.isMapObject = true;
            this.scene.add(bush);
        }

        // Ponds
        for (let p = 0; p < 2; p++) {
            const angle = (p / 2) * Math.PI + Math.PI / 3;
            const r = 35;
            const px = cx + Math.cos(angle) * r;
            const pz = cz + Math.sin(angle) * r;

            const pondGeo = new THREE.CylinderGeometry(3, 3, 0.12, 20);
            const pond = new THREE.Mesh(pondGeo, new THREE.MeshStandardMaterial({
                color: COLOR.luminousPond,
                roughness: 0.1,
                metalness: 0.5,
                transparent: true,
                opacity: 0.7
            }));
            pond.position.set(px, 0.08, pz);
            pond.userData.isArena = true;
            pond.userData.isBiome = true;
            pond.userData.isMapObject = true;
            pond.userData.isWater = true;
            this.waterMeshes.push(pond);
            this.scene.add(pond);
        }

        // Forest light
        const foreLight = new THREE.PointLight(0x44ff88, 0.6, 50);
        foreLight.position.set(cx, 5, cz);
        this.scene.add(foreLight);
        await _yield();
    }

    // ===================== BRIDGES =====================
    async buildBridges() {
        const bridgeMat = new THREE.MeshStandardMaterial({
            color: COLOR.bridgeWood, roughness: 0.85
        });
        const railMat = new THREE.MeshStandardMaterial({
            color: COLOR.metalDark, roughness: 0.6, metalness: 0.3
        });

        for (let d = 0; d < 4; d++) {
            const angle = (d / 4) * Math.PI * 2;
            const dirX = Math.cos(angle);
            const dirZ = Math.sin(angle);

            for (let s = 0; s < 4; s++) {
                const dist = 25 + s * 8;
                const bx = dirX * dist;
                const bz = dirZ * dist;

                // Deck planks
                const deckGeo = new THREE.BoxGeometry(3, 0.15, 6);
                const deck = new THREE.Mesh(deckGeo, bridgeMat);
                deck.position.set(bx, 2, bz);
                deck.castShadow = true;
                deck.receiveShadow = true;
                deck.userData.isArena = true;
                deck.userData.isBridge = true;
                deck.userData.isMapObject = true;
                this.scene.add(deck);

                // Side rails
                for (let r = -1; r <= 1; r += 2) {
                    const railGeo = new THREE.CylinderGeometry(0.06, 0.06, 6, 4);
                    const rail = new THREE.Mesh(railGeo, railMat);
                    rail.position.set(bx + dirZ * r * 1.4, 3, bz - dirX * r * 1.4);
                    rail.rotation.y = Math.PI / 2;
                    rail.rotation.z = -dirX * 0.3;
                    rail.rotation.x = dirZ * 0.3;
                    rail.castShadow = true;
                    rail.userData.isArena = true;
                    rail.userData.isBridge = true;
                    rail.userData.isMapObject = true;
                    this.scene.add(rail);
              }
            }
            await new Promise(r => setTimeout(r, 50));
        }
        await new Promise(r => setTimeout(r, 200));
    }

    // ===================== OUTER OUTPOSTS =====================
    async buildOuterOutposts() {
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const r = 185;
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;

            if (i % 2 === 0) {
                // Stone shelter
                const mat = new THREE.MeshStandardMaterial({
                    color: COLOR.stone, roughness: 0.9
                });
                for (let w = 0; w < 3; w++) {
                    const wa = (w / 3) * Math.PI * 2;
                    const wg = new THREE.BoxGeometry(4, 2.5, 0.5);
                    const wall = new THREE.Mesh(wg, mat);
                    wall.position.set(x + Math.cos(wa) * 2.5, 1.25, z + Math.sin(wa) * 2.5);
                    wall.rotation.y = wa;
                    wall.castShadow = true;
                    wall.userData.isArena = true;
                    wall.userData.isOutpost = true;
                    wall.userData.isMapObject = true;
                    this.scene.add(wall);
                    this.colliders.push({
                        type: 'box',
                        position: new THREE.Vector3(x + Math.cos(wa) * 2.5, 1.25, z + Math.sin(wa) * 2.5),
                        size: new THREE.Vector3(4, 2.5, 0.5),
                        walkable: false
                    });
                }

                // Roof
                const roofGeo = new THREE.ConeGeometry(3, 1.5, 4);
                const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({
                    color: COLOR.wood, roughness: 0.9
                }));
                roof.position.set(x, 3, z);
                roof.rotation.y = Math.PI / 4;
                roof.castShadow = true;
                roof.userData.isArena = true;
                roof.userData.isOutpost = true;
                roof.userData.isMapObject = true;
                this.scene.add(roof);
            } else {
                // Wooden watch post
                for (let p = 0; p < 4; p++) {
                    const pa = (p / 4) * Math.PI * 2;
                    const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 5, 6);
                    const post = new THREE.Mesh(postGeo, new THREE.MeshStandardMaterial({
                        color: COLOR.wood, roughness: 0.9
                    }));
                    post.position.set(
                        x + Math.cos(pa) * 2,
                        2.5,
                        z + Math.sin(pa) * 2
                    );
                    post.castShadow = true;
                    post.userData.isArena = true;
                    post.userData.isOutpost = true;
                    post.userData.isMapObject = true;
                    this.scene.add(post);
                }

                // Platform
                const platGeo = new THREE.CylinderGeometry(2.5, 2.5, 0.2, 8);
                const plat = new THREE.Mesh(platGeo, new THREE.MeshStandardMaterial({
                    color: COLOR.wood, roughness: 0.9
                }));
                plat.position.set(x, 4.5, z);
                plat.receiveShadow = true;
                plat.userData.isArena = true;
                plat.userData.isOutpost = true;
                plat.userData.isMapObject = true;
                this.scene.add(plat);

                // Cone roof
                const roofGeo = new THREE.ConeGeometry(2.8, 2, 8);
                const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({
                    color: COLOR.wood, roughness: 0.95
                }));
                roof.position.set(x, 6.5, z);
                roof.castShadow = true;
                roof.userData.isArena = true;
                roof.userData.isOutpost = true;
                roof.userData.isMapObject = true;
                this.scene.add(roof);
          }
        }
        await _yield();
    }

    // ===================== HAZARD ZONES =====================
    async buildHazardZones() {
        // Lava patches
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 60 + Math.random() * 140;
            const hx = Math.cos(angle) * r;
            const hz = Math.sin(angle) * r;

            const hazardGeo = new THREE.CylinderGeometry(3, 3, 0.2, 12);
            const hazard = new THREE.Mesh(hazardGeo, new THREE.MeshStandardMaterial({
                color: COLOR.lava,
                emissive: 0xff2200,
                emissiveIntensity: 0.8
            }));
            hazard.position.set(hx, 0.1, hz);
            hazard.userData.isHazard = true;
            hazard.userData.isLava = true;
            hazard.userData.isMapObject = true;
            this.scene.add(hazard);

            this.hazards.push({
                type: 'lava',
                position: new THREE.Vector3(hx, 0.1, hz),
                radius: 3,
                damage: 10
            });
        }

        // Shock zones
        for (let i = 0; i < 3; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 80 + Math.random() * 100;
            const sx = Math.cos(angle) * r;
            const sz = Math.sin(angle) * r;

            const shockGeo = new THREE.CylinderGeometry(4, 4, 8, 16, 1, true);
            const shock = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({
                color: 0xff4444,
                transparent: true,
                opacity: 0.15,
                side: THREE.DoubleSide,
                depthWrite: false
            }));
            shock.position.set(sx, 4, sz);
            shock.userData.isHazard = true;
            shock.userData.isShock = true;
            shock.userData.isMapObject = true;
            this.scene.add(shock);

            this.hazards.push({
                type: 'shock',
                position: new THREE.Vector3(sx, 4, sz),
                radius: 4,
                damage: 15
         });
        }
        await _yield();
    }

    // ===================== LOOT CLUSTERS =====================
    async buildLootClusters() {
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 160;
            const lx = Math.cos(angle) * r;
            const lz = Math.sin(angle) * r;

            // Cover rocks
            const rockMat = new THREE.MeshStandardMaterial({ color: COLOR.stone, roughness: 0.9 });
            for (let j = 0; j < 3; j++) {
                const rockGeo = new THREE.DodecahedronGeometry(0.8 + Math.random() * 0.5, 0);
                const rock = new THREE.Mesh(rockGeo, rockMat);
                rock.position.set(lx + (j - 1) * 1.5, 0.5, lz);
                rock.castShadow = true;
                rock.receiveShadow = true;
                rock.userData.isArena = true;
                rock.userData.isCover = true;
                rock.userData.isMapObject = true;
                this.scene.add(rock);
            }

            // Loot marker (octahedron)
            const markerGeo = new THREE.OctahedronGeometry(0.5, 0);
            const marker = new THREE.Mesh(markerGeo, new THREE.MeshStandardMaterial({
                color: 0xffdd44,
                emissive: 0xffcc00,
                emissiveIntensity: 0.3
            }));
            marker.position.set(lx, 2, lz);
            this.scene.add(marker);
            this.animatedObjects.push({
                type: 'lootMarker',
                mesh: marker,
                baseY: 2
            });

            // Loot glow light
            const lootLight = new THREE.PointLight(0xffdd44, 0.4, 8);
            lootLight.position.set(lx, 2, lz);
            this.scene.add(lootLight);
        }
        await _yield();
    }

    // ===================== FIRE PITS =====================
    async buildFirePits() {
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 1.0 });
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.8 });

        for (let i = 0; i < 16; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 20 + Math.random() * 160;
            const fx = Math.cos(angle) * r;
            const fz = Math.sin(angle) * r;

            // Stone ring
            for (let s = 0; s < 6; s++) {
                const sa = (s / 6) * Math.PI * 2;
                const stoneGeo = new THREE.DodecahedronGeometry(0.3, 0);
                const stone = new THREE.Mesh(stoneGeo, stoneMat);
                stone.position.set(fx + Math.cos(sa) * 0.8, 0.3, fz + Math.sin(sa) * 0.8);
                stone.castShadow = true;
                stone.userData.isArena = true;
                stone.userData.isFire = true;
                stone.userData.isMapObject = true;
                this.scene.add(stone);
            }

            // Flame
            const flameGeo = new THREE.ConeGeometry(0.4, 1.2, 6);
            const flame = new THREE.Mesh(flameGeo, flameMat);
            flame.position.set(fx, 0.8, fz);
            this.scene.add(flame);

            // Fire light
            const fireLight = new THREE.PointLight(0xff6622, 0.6, 12);
            fireLight.position.set(fx, 2, fz);
            this.scene.add(fireLight);

            this.animatedObjects.push({
                type: 'fire',
                mesh: flame,
                light: fireLight,
                baseOpacity: 0.8,
                baseLightIntensity: 0.6
          });
        }
        await _yield();
    }

    // ===================== PARTICLES =====================
    async buildParticleSystems() {
        // Spark particles around Cornucopia
        this._createSparkParticles(0, 0, 0, 100, 0xf8d840);

        // Ash particles in Burning Wastes
        this._createAshParticles(-80, -80, 60);

        // Glow particles in Luminous Forest
        this._createGlowParticles(80, -80, 40);
    }

    _createSparkParticles(cx, cy, cz, count, color) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 10 + Math.random() * 20;
            positions[i * 3] = cx + Math.cos(angle) * r;
            positions[i * 3 + 1] = cy + Math.random() * 5;
            positions[i * 3 + 2] = cz + Math.sin(angle) * r;
            velocities.push({
                x: (Math.random() - 0.5) * 0.5,
                y: 0.5 + Math.random() * 0.5,
                z: (Math.random() - 0.5) * 0.5
            });
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: color,
            size: 0.2,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geo, mat);
        points.userData.isParticle = true;
        points.userData.velocities = velocities;
        points.userData.type = 'spark';
        this.scene.add(points);
        this.particleSystems.push(points);
    }

    _createAshParticles(cx, cz, count) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 60;
            positions[i * 3] = cx + Math.cos(angle) * r;
            positions[i * 3 + 1] = 3 + Math.random() * 8;
            positions[i * 3 + 2] = cz + Math.sin(angle) * r;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0x888888,
            size: 0.15,
            transparent: true,
            opacity: 0.3,
            depthWrite: false
        });

        const points = new THREE.Points(geo, mat);
        points.userData.isParticle = true;
        points.userData.type = 'ash';
        this.scene.add(points);
        this.particleSystems.push(points);
    }

    _createGlowParticles(cx, cz, count) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 50;
            positions[i * 3] = cx + Math.cos(angle) * r;
            positions[i * 3 + 1] = 2 + Math.random() * 5;
            positions[i * 3 + 2] = cz + Math.sin(angle) * r;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0x44ff88,
            size: 0.25,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const points = new THREE.Points(geo, mat);
        points.userData.isParticle = true;
        points.userData.type = 'glow';
        this.scene.add(points);
        this.particleSystems.push(points);
    }

    // ===================== TRAPS =====================
    async buildTraps() {
        console.log('[MapGen] buildTraps() STARTING');
        // Spike traps
        for (let i = 0; i < 20; i++) {
            console.log('[MapGen] trap iteration', i);
            const angle = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 150;
            const tx = Math.cos(angle) * r;
            const tz = Math.sin(angle) * r;

            const spikeCount = 3 + Math.floor(Math.random() * 3);
            const spikes = [];
            for (let s = 0; s < spikeCount; s++) {
                const sa = (s / spikeCount) * Math.PI * 2;
                const spikeGeo = new THREE.ConeGeometry(0.1, 0.6, 4);
                const spike = new THREE.Mesh(spikeGeo, new THREE.MeshStandardMaterial({
                    color: 0x666666, roughness: 0.5, metalness: 0.5
                }));
                spike.position.set(tx + Math.cos(sa) * 0.6, 0.3, tz + Math.sin(sa) * 0.6);
                spike.rotation.z = Math.PI / 2;
                spike.userData.isTrap = true;
                spike.userData.isMapObject = true;
                this.scene.add(spike);
                spikes.push(spike);
            }

            const plateGeo = new THREE.CylinderGeometry(1, 1, 0.05, 8);
            const plate = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({
                color: 0x555555, roughness: 0.7, metalness: 0.4
            }));
            plate.position.set(tx, 0.05, tz);
            plate.userData.isTrap = true;
            plate.userData.isTrapPlate = true;
            plate.userData.isMapObject = true;
            this.scene.add(plate);

            this.traps.push({
                type: 'spike',
                position: new THREE.Vector3(tx, 0.05, tz),
                radius: 1,
                damage: 15,
                cooldown: 3,
                triggered: false,
                triggerTime: 0,
                spikes
            });
            console.log('[MapGen] spike trap ' + i + ' done');
            await new Promise(r => setTimeout(r, 100));
        }

        // Bear traps
        console.log('[MapGen] bear traps starting');
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 40 + Math.random() * 140;
            const tx = Math.cos(angle) * r;
            const tz = Math.sin(angle) * r;

            const jawMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, metalness: 0.5 });
            for (let j = 0; j < 2; j++) {
                const jawGeo = new THREE.BoxGeometry(0.8, 0.15, 0.2);
                const jaw = new THREE.Mesh(jawGeo, jawMat);
                jaw.position.set(tx, 0.1, tz);
                jaw.rotation.y = (j * Math.PI / 3) - Math.PI / 6;
                jaw.userData.isTrap = true;
                jaw.userData.isMapObject = true;
                this.scene.add(jaw);
            }

            this.traps.push({
                type: 'bear',
                position: new THREE.Vector3(tx, 0.1, tz),
                radius: 1.5,
                damage: 12,
                cooldown: 5,
                triggered: false,
                triggerTime: 0
            });
            console.log('[MapGen] bear trap ' + i + ' done');
            await new Promise(r => setTimeout(r, 100));
        }
        console.log('[MapGen] traps yield done');
    }

    // ===================== FOG ZONES =====================
    async buildFogZones() {
        const phases = [
            { name: 'Внешняя', innerRadius: 180, outerRadius: 220, damage: 0.2 },
            { name: 'Средняя', innerRadius: 130, outerRadius: 180, damage: 0.5 },
            { name: 'Внутренняя', innerRadius: 80, outerRadius: 130, damage: 1.0 },
            { name: 'Центральная', innerRadius: 40, outerRadius: 80, damage: 2.0 }
        ];

        for (let i = 0; i < phases.length; i++) {
            const p = phases[i];

            // Ring boundary
            const ringGeo = new THREE.RingGeometry(p.outerRadius - 0.2, p.outerRadius + 0.2, 64);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x4488ff,
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.y = 0.05;
            this.scene.add(ring);

            // Wall
            const wallGeo = new THREE.CylinderGeometry(p.outerRadius, p.outerRadius, 12, 64, 1, true);
            const wallMat = new THREE.MeshBasicMaterial({
                color: 0x4488ff,
                transparent: true,
                opacity: 0.08,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const wall = new THREE.Mesh(wallGeo, wallMat);
            wall.position.y = 6;
            this.scene.add(wall);

            // Light
            const light = new THREE.PointLight(0x4488ff, 0.3, p.outerRadius);
            this.scene.add(light);

            this.fogZones.push({
                name: p.name,
                outerRadius: p.outerRadius,
                innerRadius: p.innerRadius,
                damage: p.damage,
                active: false,
                phase: i,
                mesh: wall,
                _wallMat: wallMat,
                _ringMat: ringMat,
                light
            });
            await _yield();
        }
    }

    // ===================== RADIATION ZONES =====================
    async buildRadiationZones() {
        const zones = [
            { type: 'high', cx: -80, cz: -80, radius: 50, damage: 0.3, color: 0xff4444 },
            { type: 'medium', cx: -80, cz: 80, radius: 35, damage: 0.15, color: 0xff8844 },
            { type: 'low', cx: 80, cz: -80, radius: 30, damage: 0.1, color: 0xffaa44 }
        ];

        for (const z of zones) {
            // Gas cloud (semi-transparent sphere)
            const gasGeo = new THREE.SphereGeometry(z.radius, 16, 12);
            const gasMat = new THREE.MeshBasicMaterial({
                color: z.color,
                transparent: true,
                opacity: 0.08,
                depthWrite: false
            });
            const gas = new THREE.Mesh(gasGeo, gasMat);
            gas.position.set(z.cx, z.radius * 0.3, z.cz);
            this.scene.add(gas);

            // Ground glow
            const groundGeo = new THREE.CircleGeometry(z.radius, 32);
            groundGeo.rotateX(-Math.PI / 2);
            const groundMat = new THREE.MeshBasicMaterial({
                color: z.color,
                transparent: true,
                opacity: 0.1,
                depthWrite: false
            });
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.position.set(z.cx, 0.02, z.cz);
            this.scene.add(ground);

            // Light
            const light = new THREE.PointLight(z.color, 0.3, z.radius);
            light.position.set(z.cx, 5, z.cz);
            this.scene.add(light);

            this.radiationZones.push({
                type: z.type,
                position: new THREE.Vector3(z.cx, 0, z.cz),
                radius: z.radius,
                damage: z.damage,
                visual: gas,
                _gasMat: gasMat,
                _groundGlow: ground,
                light
           });
        }
        await _yield();
    }

    // ===================== LOOT DATA =====================
    async buildLootData() {
        // Cornucopia chest (tier 5)
        this.lootData.push({
            type: 'chest',
            position: new THREE.Vector3(0, 3.1, 0),
            radius: 2,
            tier: 5,
            items: []
        });

        // Outpost clusters
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const r = 110;
            this.lootData.push({
                type: 'outpost',
                position: new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r),
                radius: 5,
                tier: 3 + (i % 2),
                items: []
            });
        }

        // Biome loot zones
        this.lootData.push(
            { type: 'biome', position: new THREE.Vector3(-80, 0, 80), radius: 60, tier: 3, items: [] },
            { type: 'biome', position: new THREE.Vector3(80, 0, 80), radius: 55, tier: 2, items: [] },
            { type: 'biome', position: new THREE.Vector3(-80, 0, -80), radius: 60, tier: 4, items: [] },
            { type: 'biome', position: new THREE.Vector3(80, 0, -80), radius: 60, tier: 2, items: [] }
        );

        // Random clusters
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 150;
            this.lootData.push({
                type: 'cluster',
                position: new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r),
                radius: 3,
                tier: 1 + Math.floor(Math.random() * 3),
                items: []
            });
        }
        await _yield();
    }

    // ===================== ANIMATIONS =====================
    setupAnimations() {
        this.scene.traverse(obj => {
            if (obj.isMesh || obj.isGroup || obj.isInstancedMesh) {
                obj.userData.mapGenerated = true;
                obj.frustumCulled = false;
            }
        });
    }

    // ===================== HEIGHT MAP =====================
    worldToGrid(x, z) {
        return {
            x: Math.round(x / this.tileSize + this.gridWidth / 2),
            y: Math.round(z / this.tileSize + this.gridHeight / 2)
        };
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
            if (!box?.min || !box?.max) continue;
            if (x < box.min.x || x > box.max.x) continue;
            if (z < box.min.z || z > box.max.z) continue;
            if (box.max.y > top) top = box.max.y;
        }
        return top;
    }

    generateHeightMap() {
        const size = 512, res = 128, step = size / res;
        this.heightMap = Array.from({ length: res + 1 }, () => new Float32Array(res + 1));
        for (let i = 0; i <= res; i++)
            for (let j = 0; j <= res; j++) {
                const x = (i - res / 2) * step, z = (j - res / 2) * step;
                this.heightMap[i][j] = this.noise.fbm(x * 0.01, z * 0.01, 4, 2.0, 0.5) * 15;
            }
    }

      // ===================== GENERATION ORCHESTRATOR =====================
    async generate() {
        try {
            console.log('[MapGen] generate() starting');
            this.generateHeightMap();
            this.reportProgress(0.05, 'Создание ландшафта...');

        this.buildArenaFloor();
        console.log('[MapGen] arena floor done');
        this.reportProgress(0.12, 'Ландшафт готов');

        this.buildForcefield();
        console.log('[MapGen] forcefield done');
        this.reportProgress(0.18, 'Арена построена');

        console.log('[MapGen] yielding 100ms before cornucopia...');
        await new Promise(r => setTimeout(r, 100));

        await this.buildCornucopia();
        console.log('[MapGen] cornucopia done');
        this.reportProgress(0.25, 'Корнукопия');

        console.log('[MapGen] yielding 500ms before inner ring...');
        await new Promise(r => setTimeout(r, 100));

        await this.buildInnerRing();
        console.log('[MapGen] inner ring done');
        this.reportProgress(0.32, 'Внутреннее кольцо');

        await this.buildBiomePaths();
        console.log('[MapGen] biome paths done');
        this.reportProgress(0.38, 'Пути биомов');
        await new Promise(r => setTimeout(r, 100));

        console.log('[MapGen] yielding 500ms before citadel...');
        await new Promise(r => setTimeout(r, 100));

        console.log('[MapGen] starting citadel...');
        await this.buildRuinedCitadel();
        console.log('[MapGen] citadel done');
        this.reportProgress(0.45, 'Руины Цитадели');

        await this.buildCrystalGrotto();
        console.log('[MapGen] crystal grotto done');
        this.reportProgress(0.52, 'Хрустальная гротовка');
        await new Promise(r => setTimeout(r, 100));

        console.log('[MapGen] yielding 500ms before wastes...');
        await new Promise(r => setTimeout(r, 100));

        await this.buildBurningWastes();
        console.log('[MapGen] wastes done');
        this.reportProgress(0.58, 'Пылающие пустоши');

        console.log('[MapGen] yielding 500ms before forest...');
        await new Promise(r => setTimeout(r, 100));

        await this.buildLuminousForest();
        console.log('[MapGen] forest done');
        this.reportProgress(0.65, 'Светящийся лес');

        console.log('[MapGen] yielding 500ms before bridges...');
        await new Promise(r => setTimeout(r, 100));

        this.reportProgress(0.68, 'Мосты и форпосты...');
        await this.buildBridges();
        console.log('[MapGen] bridges done');
        console.log('[MapGen] about to yield before outposts...');
        const t1 = Date.now();
        await new Promise(r => setTimeout(r, 100));
        console.log('[MapGen] yield before outposts took', Date.now() - t1, 'ms');

        console.log('[MapGen] calling buildOuterOutposts...');
        const t2 = Date.now();
        await this.buildOuterOutposts();
        console.log('[MapGen] buildOuterOutposts took', Date.now() - t2, 'ms');
        console.log('[MapGen] outer outposts done');
        await this.buildHazardZones();
        console.log('[MapGen] hazard zones done');
        await new Promise(r => setTimeout(r, 100));

        await this.buildLootClusters();
        console.log('[MapGen] loot clusters done');
        await this.buildFirePits();
        console.log('[MapGen] fire pits done');
        this.reportProgress(0.75, 'Объекты размещены');
        await new Promise(r => setTimeout(r, 100));

        await this.buildParticleSystems();
        console.log('[MapGen] particle systems done');
        this.reportProgress(0.82, 'Частицы');
        console.log('[MapGen] about to yield 500ms before traps...');
        await new Promise(r => setTimeout(r, 100));
        console.log('[MapGen] yield done, calling buildTraps()...');
        await this.buildTraps();
        console.log('[MapGen] traps done');
        await new Promise(r => setTimeout(r, 100));
        await this.buildFogZones();
        console.log('[MapGen] fog zones done');
        console.log('[MapGen] yielding 3s before radiation...');
        await new Promise(r => setTimeout(r, 500));
        console.log('[MapGen] resuming after 3s yield');
        await this.buildRadiationZones();
        console.log('[MapGen] radiation zones done');
        console.log('[MapGen] yielding 1s before loot data...');
        await new Promise(r => setTimeout(r, 200));
        console.log('[MapGen] resuming after loot yield');
        await this.buildLootData();
        console.log('[MapGen] loot data done');
        this.reportProgress(0.90, 'Лут и ловушки');
        await new Promise(r => setTimeout(r, 200));

      // Resolve immediately - no deferred setup needed
        console.log('[MapGen] resolving immediately...');
        this.reportProgress(0.95, 'Мир готов');
        this._resolveReady();
        console.log('[MapGen] ready resolved!');
    } catch (e) {
        console.error('[MapGen] ERROR in generate:', e.message, e.stack);
        this._resolveReady();
    }
}

    // ===================== ANIMATION UPDATES =====================
    updateZoneAnimations(deltaTime) {
        for (const obj of this.animatedObjects) {
            switch (obj.type) {
                case 'forcefield':
                    if (obj.material && obj.material.opacity !== undefined) {
                        const pulse = 0.12 + Math.sin(deltaTime * 2) * 0.04;
                        obj.material.opacity = Math.max(0.08, pulse);
                    }
                    break;
                case 'lantern':
                    if (obj.mesh) {
                        const flicker = 0.4 + Math.sin(deltaTime * 5 + Math.random()) * 0.2;
                        obj.mesh.material.opacity = Math.max(0.2, flicker);
                    }
                    break;
                case 'fire':
                    if (obj.mesh) {
                        const s = 0.8 + Math.sin(deltaTime * 8) * 0.2;
                        obj.mesh.scale.set(s, 1 + Math.sin(deltaTime * 6) * 0.3, s);
                    }
                    if (obj.light) {
                        obj.light.intensity = (obj.baseLightIntensity || 0.6) * (0.8 + Math.sin(deltaTime * 7) * 0.2);
                    }
                    break;
                case 'lava':
                    if (obj.mesh && obj.mesh.material.emissiveIntensity !== undefined) {
                        obj.mesh.material.emissiveIntensity = 0.4 + Math.sin(deltaTime * 3) * 0.2;
                    }
                    break;
                case 'glow':
                    if (obj.mesh && obj.mesh.material.opacity !== undefined) {
                        const pulse = 0.3 + Math.sin(deltaTime * 2 + Math.random()) * 0.15;
                        obj.mesh.material.opacity = Math.max(0.2, pulse);
                    }
                    break;
                case 'lootMarker':
                    if (obj.mesh) {
                        obj.mesh.position.y = obj.baseY + Math.sin(deltaTime * 3) * 0.3;
                        obj.mesh.rotation.y = deltaTime * 2;
                    }
                    break;
            }
        }

        // Update particles
        for (const ps of this.particleSystems) {
            const pos = ps.geometry.getAttribute('position');
            if (!pos || !ps.userData.velocities) continue;
            const vels = ps.userData.velocities;
            for (let i = 0; i < pos.count; i++) {
                pos.array[i * 3 + 1] += vels[i]?.y * deltaTime * 0.5 || 0;
                pos.array[i * 3] += (vels[i]?.x || 0) * deltaTime;
                pos.array[i * 3 + 2] += (vels[i]?.z || 0) * deltaTime;

                // Reset if too high
                if (pos.array[i * 3 + 1] > 15) {
                    pos.array[i * 3 + 1] = 0;
                    const cx = ps.userData.cx || 0, cz = ps.userData.cz || 0;
                    const angle = Math.random() * Math.PI * 2;
                    const r = Math.random() * 30;
                    pos.array[i * 3] = cx + Math.cos(angle) * r;
                    pos.array[i * 3 + 2] = cz + Math.sin(angle) * r;
                }
            }
            pos.needsUpdate = true;
        }

        // Update fog zones based on active phase
        for (const fz of this.fogZones) {
            if (fz.active && fz._wallMat) {
                fz._wallMat.opacity = 0.06 + Math.sin(deltaTime * 1.5) * 0.02;
            }
        }

        // Update radiation zones
        for (const rz of this.radiationZones) {
            if (rz._gasMat) {
                rz._gasMat.opacity = 0.06 + Math.sin(deltaTime * 1.2) * 0.02;
            }
        }
    }

    // ===================== QUERY METHODS =====================
    getSpawnPads() {
        return this.spawnPads;
    }

    getColliders() {
        return this.colliders;
    }

    getHazards() {
        return this.hazards;
    }

    getTraps() {
        return this.traps;
    }

    getFogZones() {
        return this.fogZones;
    }

    getRadiationZones() {
        return this.radiationZones;
    }

    getLootData() {
        return this.lootData;
    }

    getAnimatedObjects() {
        return this.animatedObjects;
    }

    isLavaAt(x, z, y) {
        for (const h of this.hazards) {
            if (h.type !== 'lava') continue;
            const dx = x - h.position.x;
            const dz = z - h.position.z;
            if (dx * dx + dz * dz < h.radius * h.radius && y < 0.5) return true;
        }
        return false;
    }

    isWaterAt(x, z) {
        for (const wm of this.waterMeshes) {
            if (!wm.position) continue;
            const dx = x - wm.position.x;
            const dz = z - wm.position.z;
            const r = wm.geometry?.parameters?.radius ?? 4;
            if (dx * dx + dz * dz < r * r) return true;
        }
        return false;
    }

    getSlowFactorAt(x, z) {
        if (this.isWaterAt(x, z)) return 0.68;
        for (const h of this.hazards) {
            if (h.type === 'shock') {
                const dx = x - h.position.x;
                const dz = z - h.position.z;
                if (dx * dx + dz * dz < h.radius * h.radius) return 0.8;
            }
        }
        return 1;
    }

    activateFogPhase(phaseIndex) {
        for (let i = 0; i <= phaseIndex; i++) {
            if (this.fogZones[i]) {
                this.fogZones[i].active = true;
            }
        }
        return this.fogZones[phaseIndex]?.innerRadius ?? 0;
    }

    getActiveSafeRadius() {
        let minR = Infinity;
        for (const fz of this.fogZones) {
            if (fz.active && fz.innerRadius < minR) {
                minR = fz.innerRadius;
            }
        }
        return minR === Infinity ? this.arenaRadius : minR;
    }

    isPositionSafe(x, z) {
        const safeRadius = this.getActiveSafeRadius();
        return Math.sqrt(x * x + z * z) <= safeRadius;
    }

    getFogDamageAt(x, z) {
        const dist = Math.sqrt(x * x + z * z);
        for (const fz of this.fogZones) {
            if (!fz.active) continue;
            if (dist > fz.innerRadius && dist < fz.outerRadius) {
                return fz.damage;
            }
        }
        return 0;
    }

    getRadiationDamageAt(x, z) {
        let total = 0;
        for (const rz of this.radiationZones) {
            const dx = x - rz.position.x;
            const dz = z - rz.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < rz.radius) {
                const factor = 1 - dist / rz.radius;
                total += rz.damage * factor;
            }
        }
        return total;
    }

    getClosestRadiationZone(x, z) {
        let closest = null;
        let closestDist = Infinity;
        for (const rz of this.radiationZones) {
            const dx = x - rz.position.x;
            const dz = z - rz.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < closestDist) {
                closestDist = dist;
                closest = { zone: rz, distance: dist };
            }
        }
        return closestDist < 100 ? closest : null;
    }

    getTimeUntilNextPhase(currentPhase) {
        const phases = [60, 120, 180, Infinity];
        return phases[Math.min(currentPhase, 3)] ?? Infinity;
    }

    activateTrapsNearEntity(entity) {
        const radius = entity.physics?.radius || 0.6;
        const pos = entity.position;
        for (const trap of this.traps) {
            if (trap.triggered) continue;
            const dx = pos.x - trap.position.x;
            const dz = pos.z - trap.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < trap.radius + radius) {
                trap.triggered = true;
                trap.triggerTime = performance.now();
                // Apply damage
                if (typeof entity.takeDamage === 'function') {
                    entity.takeDamage(trap.damage);
                }
            }
        }
    }

    // Cleanup for scene transitions
    dispose() {
        this.scene.traverse(obj => {
            if (obj.isMesh) {
                obj.geometry?.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => m.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            }
        });
        this._sharedGeo.clear();
        this.colliders.length = 0;
        this.spawnPads.length = 0;
        this.hazards.length = 0;
        this.traps.length = 0;
        this.fogZones.length = 0;
        this.radiationZones.length = 0;
        this.lootData.length = 0;
        this.animatedObjects.length = 0;
        this.waterMeshes.length = 0;
        this.particleSystems.length = 0;
    }
}
