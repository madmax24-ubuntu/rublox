import * as THREE from "three";
import { MapGenerator as TileMapGenerator } from "./MapGeneratorNode.js";

// ============ NOISE ============
class SimplexNoise {
    constructor(seed = Math.random()) {
        this.grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
        this.p = [];
        for (let i = 0; i < 256; i++) this.p[i] = i;
        let s = (seed * 2147483647) | 0;
        for (let i = 255; i > 0; i--) {
            s = ((s * 16807) | 0); if (s < 0) s += 2147483647;
            const j = s % (i + 1);
            [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
        }
        for (let i = 256; i < 512; i++) this.p[i] = this.p[i - 256];
    }
    noise2D(x, y) {
        const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
        const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s);
        const t = (i + j) * G2, X0 = i - t, Y0 = j - t;
        const x0 = x - X0, y0 = y - Y0;
        const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
        const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
        const ii = (i + 256) & 255, jj = (j + 256) & 255;
        const pi = v => ((v % 12) + 12) % 12;
        const dot = (g, x, y) => g[0] * x + g[1] * y;
        let t0 = 0.5 - x0 * x0 - y0 * y0, t1 = 0.5 - x1 * x1 - y1 * y1, t2 = 0.5 - x2 * x2 - y2 * y2;
        const n0 = t0 > 0 ? t0 * t0 * dot(this.grad3[pi(this.p[ii + this.p[jj]])], x0, y0) : 0;
        const n1 = t1 > 0 ? t1 * t1 * dot(this.grad3[pi(this.p[ii + i1 + this.p[jj + j1]])], x1, y1) : 0;
        const n2 = t2 > 0 ? t2 * t2 * dot(this.grad3[pi(this.p[ii + 1 + this.p[jj + 1]])], x2, y2) : 0;
        return 70 * (n0 + n1 + n2);
    }
    fbm(x, y, octaves = 4, lac = 2, gain = 0.5) {
        let v = 0, a = 1, f = 1, m = 0;
        for (let i = 0; i < octaves; i++) { v += a * this.noise2D(x * f, y * f); m += a; a *= gain; f *= lac; }
        return v / m;
    }
}

// ============ COLORS ============
const C = {
    sand: 0xe8d4a0, sandDark: 0xc8b880, water: 0x2288bb, waterDeep: 0x115577,
    grass: 0x2d8a3a, grassDark: 0x1a6a2a, jungle: 0x1a7a2a, jungleDark: 0x0a5a1a,
    palmTrunk: 0x7a5a30, palmLeaf: 0x2a9a3a,
    stone: 0x8a8a7a, stoneDark: 0x5a5a4a, obsidian: 0x2a2a3a,
    wood: 0x8b6236, woodDark: 0x5a3a1a, woodLight: 0xb09070,
    thatch: 0xc8a850, thatchDark: 0x987830,
    lava: 0xff3300, lavaGlow: 0xff6600,
    crystal: 0x44cccc, crystalGlow: 0x66eeff,
    metal: 0x7a7a7a, metalDark: 0x4a4a4a, rust: 0xb5651d, gold: 0xdaa520,
    white: 0xe8e8e0, black: 0x1a1a1a,
    red: 0xcc2222, blue: 0x3388cc, green: 0x22aa44, orange: 0xff8800,
};

// ============ MATERIAL CACHE ============
const _mat = new Map();
function mat(color, opts = {}) {
    const k = color.toString(16) + ':' + JSON.stringify(opts, null, 2);
    if (!_mat.has(k)) _mat.set(k, new THREE.MeshStandardMaterial({ color, ...opts }));
    return _mat.get(k);
}

// ============ HELPERS ============
function box(w, h, d, color, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
    m.castShadow = true; m.receiveShadow = true; return m;
}
function cyl(rt, rb, h, seg, color, opts = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, opts));
    m.castShadow = true; m.receiveShadow = true; return m;
}
function addCollider(gen, type, pos, size, walkable = false) {
    if (gen?.colliders) gen.colliders.push({ type, position: new THREE.Vector3(...pos), size: new THREE.Vector3(...size), walkable });
}

// ===================== TROPICAL ISLAND MAP =====================
// Theme: Survival Island — Apex Legends / Island BR style
// Structure: Beach -> Village -> Camp (spawn) -> Jungle -> Volcano -> Lighthouse -> Caves -> Bunker -> River

const RADIUS = 220;

// --- Terrain: circular island with raised center ---
async function buildIslandTerrain(scene, gen) {
    const halfSize = RADIUS;

    // Main ground — circular island with elevation
    const groundMat = mat(C.grass, { roughness: 0.9, metalness: 0.05 });
    const groundGeo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2, 120, 120);
    groundGeo.rotateX(-Math.PI / 2);
    const pos = groundGeo.attributes.position;

    for (let i = 0; i <= pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const dist = Math.sqrt(x * x + z * z) / halfSize;

        // Island shape: raise edges to form island, lower beyond radius
        if (dist < 0.85) {
            // Center: raised terrain (mountain/volcano at center)
            const h = gen.noise.fbm(x * 0.005, z * 0.005, 4, 2, 0.5) * 12 + 3 * (1 - dist);
            pos.setY(i, Math.max(h, 0.5));
        } else if (dist < 1) {
            // Edge: slope down to water
            const slope = 1 - (dist - 0.85) / 0.15;
            pos.setY(i, 3 * slope * slope);
        } else {
            // Beyond island — flat at water level (no gap)
            pos.setY(i, 0);
        }
    }
    groundGeo.computeVertexNormals();

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    ground.userData.isArena = true; ground.userData.isFloor = true; ground.userData.isGround = true;
    ground.userData.isMapObject = true;
    scene.add(ground);

    gen.colliders.push({
        type: 'box', position: new THREE.Vector3(0, 0, 0),
        size: new THREE.Vector3(halfSize * 2, 1, halfSize * 2), walkable: true
    });

    // Beach ring (sand around edges)
    const beachMat = mat(C.sand, { roughness: 0.85 });
    const beachGeo = new THREE.RingGeometry(halfSize * 0.75, halfSize * 0.98, 48);
    beachGeo.rotateX(-Math.PI / 2);
    const beach = new THREE.Mesh(beachGeo, beachMat);
    beach.position.y = 0.55; beach.receiveShadow = true;
    beach.userData.isArena = true; beach.userData.isBeach = true;
    beach.userData.isMapObject = true;
    scene.add(beach);

    // Water ring (ocean around island)
    const waterMat = mat(C.water, { transparent: true, opacity: 0.7, roughness: 0.1 });
    const waterGeo = new THREE.CircleGeometry(halfSize * 1.1, 48);
    waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -0.5; water.userData.isMapObject = true; water.userData.isWater = true;
    scene.add(water);

    // Forcefield over ocean (invisible boundary)
    const ffMat = mat(C.blue, { transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
    const ffGeo = new THREE.CylinderGeometry(halfSize * 0.75, halfSize * 0.75, 15, 64, 1, true);
    const ff = new THREE.Mesh(ffGeo, ffMat);
    ff.position.y = 7.5; ff.userData.isArena = true; ff.userData.isForcefield = true;
    ff.userData.isMapObject = true; scene.add(ff);
    gen.animatedObjects.push({ type: 'forcefield', mesh: ff, material: ffMat, baseOpacity: 0.08 });

    // Top ring
    const rimMat = mat(C.blue, { transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const topRing = new THREE.Mesh(new THREE.TorusGeometry(halfSize * 0.75, 0.3, 8, 64), rimMat);
    topRing.position.y = 15; topRing.rotation.x = Math.PI / 2;
    topRing.userData.isMapObject = true; scene.add(topRing);
}

// --- Beach Zone (West) ---
async function buildBeach(scene, gen) {
    // Beach camp (light loot)
    for (let i = 0; i < 8; i++) {
        const a = (i / 7) * Math.PI * 0.8 - Math.PI * 0.4 - Math.PI; // arc on west side
        const r = RADIUS * 0.7 + Math.random() * RADIUS * 0.15;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;

        // Simple tent
        const tent = new THREE.Group();
        // Poles
        const p1 = cyl(0.06, 0.06, 2, 5, C.woodDark, { roughness: 0.9 });
        p1.position.set(-0.8, 1, 0); p1.userData.isMapObject = true; tent.add(p1);
        const p2 = p1.clone(); p2.position.set(0.8, 1, 0); tent.add(p2);
        // Canvas
        const canvas = new THREE.Mesh(
            new THREE.ConeGeometry(1.5, 2, 4),
            mat(C.white, { roughness: 0.8 })
        );
        canvas.position.y = 1.8; canvas.rotation.y = Math.PI / 4;
        canvas.userData.isMapObject = true; tent.add(canvas);

        tent.position.set(x, 0.5, z);
        scene.add(tent);
        addCollider(gen, 'box', [x, 1, z], [3, 2, 3]);
    }

    // Beached boats (decoration + cover)
    for (let i = 0; i < 4; i++) {
        const a = (i / 3) * Math.PI * 0.6 - Math.PI * 0.3 - Math.PI;
        const r = RADIUS * 0.8 + Math.random() * 10;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;

        const boat = new THREE.Group();
        // Hull
        const hull = new THREE.Mesh(
            new THREE.CylinderGeometry(0.6, 0.3, 4, 6),
            mat(C.wood, { roughness: 0.85 })
        );
        hull.rotation.z = Math.PI / 2; hull.rotation.y = a;
        hull.position.y = 0.5; hull.userData.isMapObject = true; hull.userData.isCover = true;
        boat.add(hull);
        addCollider(gen, 'box', [x, 0.5, z], [4, 1, 1.2]);
        boat.position.set(x, 0.5, z);
        scene.add(boat);
    }

    // Beach loot crates
    for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 0.6 - Math.PI * 0.3 - Math.PI;
        const r = RADIUS * 0.72 + Math.random() * RADIUS * 0.15;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const c = box(0.8, 0.8, 0.8, C.gold, { roughness: 0.4, metalness: 0.5 });
        c.position.set(x, 0.4, z);
        c.userData.isMapObject = true; c.userData.isLoot = true; c.userData.isBeach = true;
        scene.add(c);
    }

    // Driftwood / rocks for cover
    for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 0.6 - Math.PI * 0.3 - Math.PI;
        const r = RADIUS * 0.6 + Math.random() * RADIUS * 0.25;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;

        if (Math.random() > 0.5) {
            // Rock
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.8 + Math.random() * 1.2, 0),
                mat(C.stone, { roughness: 0.85 })
            );
            rock.position.set(x, 0.5, z);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.scale.y = 0.6 + Math.random() * 0.4;
            rock.castShadow = true; rock.receiveShadow = true;
            rock.userData.isMapObject = true; rock.userData.isCover = true;
            scene.add(rock);
        } else {
            // Driftwood
            const wood = cyl(0.1, 0.15, 2 + Math.random() * 2, 5, C.woodDark, { roughness: 0.95 });
            wood.position.set(x, 0.3, z);
            wood.rotation.z = Math.PI / 2;
            wood.rotation.y = Math.random();
            wood.userData.isMapObject = true; wood.userData.isCover = true;
            scene.add(wood);
        }
    }
}

// --- Village (South) ---
async function buildVillage(scene, gen) {
    // 6 huts on stilts (native village)
    for (let i = 0; i < 6; i++) {
        const a = Math.PI * 0.6 + (i / 5) * Math.PI * 0.5; // arc on south
        const r = RADIUS * 0.45 + Math.random() * 30;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;

        const hut = new THREE.Group();
        // Stilts (4 wooden posts)
        for (let s = 0; s < 4; s++) {
            const sa = (s / 4) * Math.PI * 2;
            const stilt = cyl(0.1, 0.12, 2.5, 5, C.woodDark, { roughness: 0.9 });
            stilt.position.set(Math.cos(sa) * 1.5, 1.25, Math.sin(sa) * 1.5);
            stilt.userData.isMapObject = true; hut.add(stilt);
        }
        // Floor platform
        const floor = box(3.5, 0.2, 3.5, C.wood, { roughness: 0.85 });
        floor.position.y = 2.6; floor.userData.isMapObject = true; hut.add(floor);
        // Walls (3 sides, open front)
        for (let w = 0; w < 3; w++) {
            const wa = (w / 3) * Math.PI * 2 + Math.PI / 3;
            if (w === 1) continue; // door gap
            const wall = box(2.5, 2.2, 0.15, C.thatch, { roughness: 0.9 });
            wall.position.set(Math.cos(wa) * 1.7, 3.8, Math.sin(wa) * 1.7);
            wall.rotation.y = wa;
            wall.userData.isMapObject = true; hut.add(wall);
        }
        // Thatched roof
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(3, 1.8, 6),
            mat(C.thatch, { roughness: 0.95 })
        );
        roof.position.y = 5.8; roof.rotation.y = Math.PI / 6;
        roof.userData.isMapObject = true; hut.add(roof);

        // Totem pole at entrance
        const totem = cyl(0.15, 0.18, 3, 6, C.woodDark, { roughness: 0.8 });
        totem.position.set(Math.cos(a) * 2.5, 1.5, Math.sin(a) * 2.5);
        totem.userData.isMapObject = true; hut.add(totem);

        // Loot inside
        const lootCrate = box(0.6, 0.6, 0.6, C.gold, { roughness: 0.4, metalness: 0.5 });
        lootCrate.position.set(Math.cos(a) * 0.5, 3, Math.sin(a) * 0.5);
        lootCrate.userData.isMapObject = true; lootCrate.userData.isLoot = true; lootCrate.userData.isVillage = true;
        hut.add(lootCrate);

        // Interior light
        const light = new THREE.PointLight(0xffaa44, 1.5, 10);
        light.position.y = 4; light.userData.isMapObject = true; hut.add(light);

        hut.position.set(x, 0.3, z);
        scene.add(hut);
        addCollider(gen, 'box', [x, 1.5, z], [3.5, 3, 3.5]);
    }

    // Village fire pit (central)
    const vFIRE = new THREE.Group();
    for (let i = 0; i < 6; i++) {
        const log = cyl(0.08, 0.08, 0.8, 5, C.woodDark, { roughness: 0.95 });
        log.position.set(Math.cos(i * Math.PI / 3) * 0.4, 0.15, Math.sin(i * Math.PI / 3) * 0.4);
        log.rotation.z = Math.PI / 2; log.rotation.y = i * Math.PI / 3;
        log.userData.isMapObject = true; vFIRE.add(log);
    }
    const vLight = new THREE.PointLight(0xff6600, 3, 15);
    vLight.position.y = 0.6; vLight.userData.isMapObject = true; vFIRE.add(vLight);
    vFIRE.position.set(0, 0.3, RADIUS * 0.4);
    scene.add(vFIRE);
}

// --- Spawn Camp (Center) ---
async function buildSpawnCamp(scene, gen) {
    // Camp ground (flat pad)
    const campFloor = new THREE.Mesh(
        new THREE.CircleGeometry(30, 32),
        mat(C.sand, { roughness: 0.85 })
    );
    campFloor.rotation.x = -Math.PI / 2;
    campFloor.position.y = 0.35; campFloor.receiveShadow = true;
    campFloor.userData.isArena = true; campFloor.userData.isSpawnPad = true;
    campFloor.userData.isMapObject = true;
    scene.add(campFloor);

    // Central supply crate
    const mainCrate = box(2, 1.5, 2, C.gold, { roughness: 0.4, metalness: 0.5 });
    mainCrate.position.set(0, 1.05, 0);
    mainCrate.userData.isMapObject = true; mainCrate.userData.isLoot = true; mainCrate.userData.isCamp = true;
    scene.add(mainCrate);
    addCollider(gen, 'box', [0, 1.05, 0], [2, 1.5, 2]);

    // Supply crates around camp
    const cratePositions = [
        [6, 6], [-6, 6], [6, -6], [-6, -6],
        [10, 0], [-10, 0], [0, 10], [0, -10],
        [14, 14], [-14, 14], [14, -14], [-14, -14],
    ];
    for (const [cx, cz] of cratePositions) {
        const c = box(1, 1, 1, C.gold, { roughness: 0.4, metalness: 0.5 });
        c.position.set(cx, 0.5, cz);
        c.userData.isMapObject = true; c.userData.isLoot = true; c.userData.isCamp = true;
        scene.add(c);
        addCollider(gen, 'box', [cx, 0.5, cz], [1, 1, 1]);
    }

    // Camp tents (medic/safe zone)
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const r = 18;
        const tx = Math.cos(a) * r, tz = Math.sin(a) * r;

        const tent = new THREE.Group();
        const pole1 = cyl(0.06, 0.06, 2.5, 5, C.woodDark, { roughness: 0.9 });
        pole1.position.set(-1, 1.25, 0); pole1.userData.isMapObject = true; tent.add(pole1);
        const pole2 = pole1.clone(); pole2.position.set(1, 1.25, 0); tent.add(pole2);
        const tCanvas = new THREE.Mesh(
            new THREE.ConeGeometry(2, 2.5, 4),
            mat(C.white, { roughness: 0.8 })
        );
        tCanvas.position.y = 1.5; tCanvas.rotation.y = Math.PI / 4;
        tCanvas.userData.isMapObject = true; tent.add(tCanvas);

        tent.position.set(tx, 0.35, tz);
        scene.add(tent);
        addCollider(gen, 'box', [tx, 1.5, tz], [4, 2.5, 4]);
    }

    // Spawn pads
    gen.spawnPads.push({ x: 0, y: 0.35, z: 0, radius: 5 });
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        gen.spawnPads.push({ x: Math.cos(a) * 12, y: 0.35, z: Math.sin(a) * 12, radius: 3 });
    }
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 5;
        gen.spawnPads.push({ x: Math.cos(a) * 22, y: 0.35, z: Math.sin(a) * 22, radius: 2.5 });
    }

    // Campfire lights
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const r = 18;
        const cLight = new THREE.PointLight(0xffaa44, 2, 12);
        cLight.position.set(Math.cos(a) * r, 3, Math.sin(a) * r);
        cLight.userData.isMapObject = true; scene.add(cLight);
    }

    // Spawn visual rings
    for (const pad of gen.spawnPads) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(pad.radius * 0.6, pad.radius, 32),
            mat(0x4488ff, { transparent: true, opacity: 0.2, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(pad.x, 0.36, pad.z);
        ring.userData.isMapObject = true;
        scene.add(ring);
    }

    // Supply drop beacon (glowing pole)
    const beacon = cyl(0.1, 0.1, 6, 6, C.metal, { roughness: 0.4, metalness: 0.6 });
    beacon.position.set(0, 3, 0); beacon.userData.isMapObject = true; scene.add(beacon);
    const beaconLight = new THREE.PointLight(0xffcc44, 4, 30);
    beaconLight.position.set(0, 6.5, 0); beaconLight.userData.isMapObject = true; scene.add(beaconLight);
    gen.animatedObjects.push({ type: 'glow', light: beaconLight, baseIntensity: 4, pulse: true });
}

// --- Jungle (East) ---
async function buildJungle(scene, gen) {
    const jungleCenter = new THREE.Vector3(RADIUS * 0.5, 0, 0);

    // Dense palm trees
    for (let i = 0; i < 80; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * 80;
        const x = jungleCenter.x + Math.cos(a) * r;
        const z = jungleCenter.z + Math.sin(a) * r;

        const trunkH = 6 + Math.random() * 4;
        const trunkR = 0.25 + Math.random() * 0.15;

        // Trunk (curved)
        const trunk = cyl(trunkR * 0.6, trunkR, trunkH, 6, C.palmTrunk, { roughness: 0.95 });
        trunk.position.set(x, trunkH / 2, z);
        trunk.rotation.z = (Math.random() - 0.5) * 0.2;
        trunk.userData.isMapObject = true; trunk.userData.isTree = true; scene.add(trunk);

        // Palm leaves (flat cones)
        for (let l = 0; l < 6; l++) {
            const leaf = new THREE.Mesh(
                new THREE.ConeGeometry(0.8, 3, 3),
                mat(C.palmLeaf, { roughness: 0.9 })
            );
            leaf.position.set(x, trunkH + 0.5, z);
            leaf.rotation.z = (l / 6) * Math.PI * 2;
            leaf.rotation.y = (l / 6) * Math.PI * 2;
            leaf.userData.isMapObject = true; leaf.userData.isTree = true; scene.add(leaf);
        }

        // Canopy (green ball at top)
        const canopy = new THREE.Mesh(
            new THREE.SphereGeometry(2.5, 6, 4),
            mat(C.jungle, { roughness: 0.9 })
        );
        canopy.position.set(x, trunkH + 1, z);
        canopy.userData.isMapObject = true; canopy.userData.isTree = true; scene.add(canopy);
    }

    // Dense underbrush (low foliage)
    for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 10 + Math.random() * 70;
        const x = jungleCenter.x + Math.cos(a) * r;
        const z = jungleCenter.z + Math.sin(a) * r;

        const bush = new THREE.Mesh(
            new THREE.SphereGeometry(0.8 + Math.random() * 0.6, 5, 3),
            mat(C.jungleDark, { roughness: 0.95 })
        );
        bush.position.set(x, 0.5, z);
        bush.scale.y = 0.6;
        bush.castShadow = true; bush.receiveShadow = true;
        bush.userData.isMapObject = true; bush.userData.isCover = true;
        scene.add(bush);
    }

    // Jungle trap zones
    for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * 60;
        const x = jungleCenter.x + Math.cos(a) * r;
        const z = jungleCenter.z + Math.sin(a) * r;

        // Spike trap
        const trap = new THREE.Group();
        const plate = box(1.2, 0.08, 1.2, C.metal, { roughness: 0.6, metalness: 0.5 });
        plate.position.y = 0.04; plate.userData.isMapObject = true; trap.add(plate);
        for (let s = 0; s < 5; s++) {
            const spike = new THREE.Mesh(
                new THREE.ConeGeometry(0.1, 0.6, 4),
                mat(C.metal, { roughness: 0.4, metalness: 0.7 })
            );
            spike.position.set((Math.random() - 0.5) * 0.8, 0.35, (Math.random() - 0.5) * 0.8);
            spike.userData.isMapObject = true; trap.add(spike);
        }
        trap.position.set(x, 0.3, z);
        scene.add(trap);
        gen.traps.push({ type: 'spike', position: new THREE.Vector3(x, 0.3, z), radius: 1.5, damage: 12 });
    }

    // Jungle loot
    for (let i = 0; i < 15; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 15 + Math.random() * 60;
        const x = jungleCenter.x + Math.cos(a) * r;
        const z = jungleCenter.z + Math.sin(a) * r;
        const c = box(0.7, 0.7, 0.7, C.gold, { roughness: 0.4, metalness: 0.5 });
        c.position.set(x, 0.35, z);
        c.userData.isMapObject = true; c.userData.isLoot = true; c.userData.isJungle = true;
        scene.add(c);
    }
}

// --- Volcano (North) ---
async function buildVolcano(scene, gen) {
    const vCenter = new THREE.Vector3(0, 0, -RADIUS * 0.6);

    // Volcano cone (raised terrain with crater)
    const volcanoGeo = new THREE.ConeGeometry(60, 40, 32);
    const volcano = new THREE.Mesh(volcanoGeo, mat(C.obsidian, { roughness: 0.5, metalness: 0.4 }));
    volcano.position.set(vCenter.x, 20, vCenter.z);
    volcano.castShadow = true; volcano.receiveShadow = true;
    volcano.userData.isMapObject = true; volcano.userData.isVolcano = true;
    scene.add(volcano);
    addCollider(gen, 'cylinder', [vCenter.x, 20, vCenter.z], [60, 40]);

    // Crater (depression with lava)
    const craterFloor = new THREE.Mesh(
        new THREE.CircleGeometry(15, 24),
        mat(C.lava, { roughness: 0.1, metalness: 0.8, emissive: 0xff3300, emissiveIntensity: 0.6 })
    );
    craterFloor.rotation.x = -Math.PI / 2;
    craterFloor.position.set(vCenter.x, 38.5, vCenter.z);
    craterFloor.receiveShadow = true;
    craterFloor.userData.isMapObject = true; craterFloor.userData.isLava = true;
    scene.add(craterFloor);

    // Lava glow
    const lavaLight = new THREE.PointLight(0xff4400, 8, 40);
    lavaLight.position.set(vCenter.x, 40, vCenter.z);
    lavaLight.userData.isMapObject = true; scene.add(lavaLight);
    gen.animatedObjects.push({ type: 'glow', light: lavaLight, baseIntensity: 8, pulse: true });

    // Lava flows (narrow channels from crater)
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const flowLen = 30 + Math.random() * 20;
        const flowGeo = new THREE.PlaneGeometry(3, flowLen, 1, 1);
        flowGeo.rotateX(-Math.PI / 2);
        const flow = new THREE.Mesh(flowGeo, mat(C.lava, {
            roughness: 0.1, metalness: 0.8, emissive: 0xff3300, emissiveIntensity: 0.4
        }));
        flow.position.set(
            vCenter.x + Math.cos(a) * (flowLen / 2),
            36,
            vCenter.z + Math.sin(a) * (flowLen / 2)
        );
        flow.rotation.z = -a;
        flow.userData.isMapObject = true; flow.userData.isLava = true;
        scene.add(flow);
    }

    // Obsidian formations
    for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 25 + Math.random() * 30;
        const x = vCenter.x + Math.cos(a) * r;
        const z = vCenter.z + Math.sin(a) * r;
        const h = 3 + Math.random() * 8;

        const formation = new THREE.Mesh(
            new THREE.ConeGeometry(0.8 + Math.random() * 0.5, h, 5),
            mat(C.obsidian, { roughness: 0.4, metalness: 0.5 })
        );
        formation.position.set(x, h / 2 + 5, z);
        formation.rotation.y = Math.random();
        formation.castShadow = true; formation.receiveShadow = true;
        formation.userData.isMapObject = true; formation.userData.isCover = true;
        scene.add(formation);
    }

    // High-tier loot crates near crater
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const r = 18;
        const x = vCenter.x + Math.cos(a) * r;
        const z = vCenter.z + Math.sin(a) * r;
        const c = box(1.2, 1.2, 1.2, C.gold, { roughness: 0.3, metalness: 0.7 });
        c.position.set(x, 0.6, z);
        c.userData.isMapObject = true; c.userData.isLoot = true; c.userData.isVolcano = true;
        scene.add(c);
    }

    // Smoke/steam clouds around volcano
    for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 20;
        const x = vCenter.x + Math.cos(a) * r;
        const z = vCenter.z + Math.sin(a) * r;

        const cloud = new THREE.Group();
        for (let j = 0; j < 4; j++) {
            const p = new THREE.Mesh(
                new THREE.SphereGeometry(1.5 + Math.random(), 8, 6),
                mat(0x888888, { transparent: true, opacity: 0.25, roughness: 1 })
            );
            p.position.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3);
            p.userData.isMapObject = true; cloud.add(p);
        }
        cloud.position.set(x, 35 + Math.random() * 10, z);
        scene.add(cloud);
        gen.animatedObjects.push({ type: 'smoke', group: cloud });
    }
}

// --- Lighthouse (South-East promontory) ---
async function buildLighthouse(scene, gen) {
    const lCenter = new THREE.Vector3(RADIUS * 0.45, 0, -RADIUS * 0.5);

    // Hill for lighthouse
    const hill = new THREE.Mesh(
        new THREE.SphereGeometry(20, 16, 8),
        mat(C.stone, { roughness: 0.85 })
    );
    hill.position.set(lCenter.x, -2, lCenter.z);
    hill.scale.y = 0.5; hill.receiveShadow = true;
    hill.userData.isMapObject = true; hill.userData.isTerrain = true;
    scene.add(hill);
    addCollider(gen, 'sphere', [lCenter.x, 0, lCenter.z], 20);

    // Lighthouse tower
    const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 3, 20, 8),
        mat(C.white, { roughness: 0.6, metalness: 0.2 })
    );
    tower.position.set(lCenter.x, 10, lCenter.z);
    tower.userData.isMapObject = true; tower.userData.isLighthouse = true;
    scene.add(tower);

    // Tower stripes
    for (let i = 0; i < 3; i++) {
        const stripe = new THREE.Mesh(
            new THREE.CylinderGeometry(2.5 - i * 0.3, 2.7 - i * 0.3, 1.5, 8),
            mat(C.red, { roughness: 0.6 })
        );
        stripe.position.set(lCenter.x, 6 + i * 6, lCenter.z);
        stripe.userData.isMapObject = true; scene.add(stripe);
    }

    // Lighthouse top
    const top = new THREE.Mesh(
        new THREE.ConeGeometry(2, 3, 8),
        mat(C.metal, { roughness: 0.4, metalness: 0.6 })
    );
    top.position.set(lCenter.x, 21.5, lCenter.z);
    top.userData.isMapObject = true; scene.add(top);

    // Light beam
    const beaconLight = new THREE.PointLight(0xffcc44, 6, 50);
    beaconLight.position.set(lCenter.x, 23, lCenter.z);
    beaconLight.userData.isMapObject = true; scene.add(beaconLight);
    gen.animatedObjects.push({ type: 'glow', light: beaconLight, baseIntensity: 6, pulse: true });

    // Keeper's cabin
    const cabin = box(4, 3, 3, C.wood, { roughness: 0.85 });
    cabin.position.set(lCenter.x + 5, 1.5, lCenter.z);
    cabin.userData.isMapObject = true; scene.add(cabin);
    addCollider(gen, 'box', [lCenter.x + 5, 1.5, lCenter.z], [4, 3, 3]);

    // Loot inside
    const lootCrate = box(1, 1, 1, C.gold, { roughness: 0.4, metalness: 0.5 });
    lootCrate.position.set(lCenter.x + 5, 0.5, lCenter.z + 1);
    lootCrate.userData.isMapObject = true; lootCrate.userData.isLoot = true; lootCrate.userData.isLighthouse = true;
    scene.add(lootCrate);
}

// --- Caves (South-West) ---
async function buildCaves(scene, gen) {
    const cCenter = new THREE.Vector3(-RADIUS * 0.5, 0, -RADIUS * 0.45);

    // Cave entrance (hollowed hill)
    const caveHill = new THREE.Mesh(
        new THREE.SphereGeometry(18, 16, 8),
        mat(C.stoneDark, { roughness: 0.9 })
    );
    caveHill.position.set(cCenter.x, -3, cCenter.z);
    caveHill.scale.y = 0.5; caveHill.receiveShadow = true;
    caveHill.userData.isMapObject = true; caveHill.userData.isTerrain = true;
    scene.add(caveHill);

    // Cave opening (dark tunnel)
    const cave = new THREE.Mesh(
        new THREE.CylinderGeometry(4, 5, 20, 8),
        mat(C.black, { roughness: 1 })
    );
    cave.rotation.z = Math.PI / 2;
    cave.position.set(cCenter.x, 4, cCenter.z);
    cave.userData.isMapObject = true; cave.userData.isCave = true;
    scene.add(cave);

    // Crystal formations inside
    for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 10;
        const x = cCenter.x + Math.cos(a) * r * 0.3;
        const z = cCenter.z + Math.sin(a) * r * 0.3;
        const h = 1 + Math.random() * 3;

        const crystal = new THREE.Mesh(
            new THREE.ConeGeometry(0.4 + Math.random() * 0.3, h, 5),
            mat(C.crystal, { roughness: 0.2, metalness: 0.5, transparent: true, opacity: 0.7 })
        );
        crystal.position.set(x, h / 2 + 3, z);
        crystal.rotation.y = Math.random();
        crystal.userData.isMapObject = true; scene.add(crystal);
    }

    // Crystal glow
    const caveLight = new THREE.PointLight(C.crystalGlow, 3, 25);
    caveLight.position.set(cCenter.x, 5, cCenter.z);
    caveLight.userData.isMapObject = true; scene.add(caveLight);

    // Stalactites from ceiling
    for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 8;
        const x = cCenter.x + Math.cos(a) * r * 0.3;
        const z = cCenter.z + Math.sin(a) * r * 0.3;
        const sl = 1 + Math.random() * 2;

        const stal = new THREE.Mesh(
            new THREE.ConeGeometry(0.2, sl, 5),
            mat(C.crystal, { roughness: 0.25, metalness: 0.5, transparent: true, opacity: 0.6 })
        );
        stal.position.set(x, 8 + sl / 2, z);
        stal.rotation.z = Math.PI;
        stal.userData.isMapObject = true; scene.add(stal);
    }

    // Cave loot
    for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 5 + Math.random() * 10;
        const x = cCenter.x + Math.cos(a) * r * 0.2;
        const z = cCenter.z + Math.sin(a) * r * 0.2;
        const c = box(0.8, 0.8, 0.8, C.gold, { roughness: 0.4, metalness: 0.5 });
        c.position.set(x, 0.4, z);
        c.userData.isMapObject = true; c.userData.isLoot = true; c.userData.isCave = true;
        scene.add(c);
    }
}

// --- Military Bunker (West) ---
async function buildBunker(scene, gen) {
    const bCenter = new THREE.Vector3(-RADIUS * 0.55, 0, 0);

    // Bunker body (reinforced structure)
    const bunker = box(8, 4, 12, C.metalDark, { roughness: 0.5, metalness: 0.6 });
    bunker.position.set(bCenter.x, 2, bCenter.z);
    bunker.userData.isMapObject = true; bunker.userData.isBunker = true;
    scene.add(bunker);
    addCollider(gen, 'box', [bCenter.x, 2, bCenter.z], [8, 4, 12]);

    // Reinforced roof plates
    const roof = box(8.5, 0.5, 12.5, C.stoneDark, { roughness: 0.6 });
    roof.position.set(bCenter.x, 4.25, bCenter.z);
    roof.userData.isMapObject = true; scene.add(roof);

    // Ventilation
    const vent = cyl(0.5, 0.5, 2, 8, C.metalDark, { roughness: 0.5 });
    vent.position.set(bCenter.x, 5.5, bCenter.z);
    vent.userData.isMapObject = true; scene.add(vent);

    // Door
    const door = box(1.8, 3, 0.3, C.metal, { roughness: 0.5, metalness: 0.6 });
    door.position.set(bCenter.x, 1.5, bCenter.z + 6.1);
    door.userData.isMapObject = true; door.userData.isDoor = true;
    scene.add(door);

    // Radar dish on top
    const radar = cyl(0.1, 0.1, 6, 6, C.metal, { roughness: 0.4, metalness: 0.6 });
    radar.position.set(bCenter.x, 7, bCenter.z);
    radar.userData.isMapObject = true; scene.add(radar);
    const radarDish = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 3, 8),
        mat(C.metal, { roughness: 0.4, metalness: 0.6 })
    );
    radarDish.position.set(bCenter.x, 10, bCenter.z);
    radarDish.rotation.x = Math.PI / 3;
    radarDish.userData.isMapObject = true; scene.add(radarDish);

    // High-tier loot
    for (let i = 0; i < 6; i++) {
        const c = box(1.2, 1.2, 1.2, C.gold, { roughness: 0.3, metalness: 0.7 });
        const a = (i / 6) * Math.PI * 2;
        const r = 6;
        c.position.set(bCenter.x + Math.cos(a) * r, 0.6, bCenter.z + Math.sin(a) * r);
        c.userData.isMapObject = true; c.userData.isLoot = true; c.userData.isBunker = true;
        scene.add(c);
    }

    // Bunker light
    const bLight = new THREE.PointLight(0x4488ff, 2, 15);
    bLight.position.set(bCenter.x, 3, bCenter.z);
    bLight.userData.isMapObject = true; scene.add(bLight);
}

// --- River & Bridges ---
async function buildRiver(scene, gen) {
    // River flowing from north (volcano) to south (village)
    const riverMat = mat(C.water, { transparent: true, opacity: 0.6, roughness: 0.1 });

    // Main river channel
    const riverGeo = new THREE.PlaneGeometry(8, RADIUS * 1.6, 1, 1);
    riverGeo.rotateX(-Math.PI / 2);
    const river = new THREE.Mesh(riverGeo, riverMat);
    river.position.set(0, 0.4, 0);
    river.receiveShadow = true;
    river.userData.isMapObject = true; river.userData.isWater = true; river.userData.isRiver = true;
    scene.add(river);

    // Bridges across river
    const bridgePositions = [
        { x: 0, z: -RADIUS * 0.3 },
        { x: 0, z: 0 },
        { x: 0, z: RADIUS * 0.3 },
    ];

    for (const bp of bridgePositions) {
        const bridge = new THREE.Group();

        // Deck planks
        for (let i = 0; i < 8; i++) {
            const plank = box(5, 0.2, 1.5, C.wood, { roughness: 0.85 });
            plank.position.set(0, 1.5, -6 + i * 1.7);
            plank.userData.isMapObject = true; bridge.add(plank);
        }

        // Support pillars
        const pillar = cyl(0.2, 0.25, 3, 6, C.stone, { roughness: 0.8 });
        pillar.position.set(0, 0, -6); pillar.userData.isMapObject = true; bridge.add(pillar);
        const pillar2 = pillar.clone(); pillar2.position.set(0, 0, 6); bridge.add(pillar2);

        // Ropes
        for (let side of [-1, 1]) {
            const rope = cyl(0.05, 0.05, 14, 5, C.woodDark, { roughness: 0.9 });
            rope.position.set(side * 2.5, 2.8, 0);
            rope.userData.isMapObject = true; bridge.add(rope);
        }

        bridge.position.set(bp.x, 0.4, bp.z);
        scene.add(bridge);
        addCollider(gen, 'box', [bp.x, 1.5, bp.z], [5.5, 3, 14]);
    }
}

// --- Outer Outposts (scattered) ---
async function buildOutposts(scene, gen) {
    const outpostPositions = [
        { x: RADIUS * 0.3, z: RADIUS * 0.3 },   // NE
        { x: -RADIUS * 0.3, z: RADIUS * 0.3 },  // NW
        { x: RADIUS * 0.3, z: -RADIUS * 0.3 },  // SE
        { x: -RADIUS * 0.3, z: -RADIUS * 0.3 }, // SW
    ];

    for (const op of outpostPositions) {
        const outpost = new THREE.Group();

        // 4 walls with door gap
        const wallH = 3, wallThick = 0.6;
        for (let w = 0; w < 4; w++) {
            if (w === 0) continue; // door gap
            const wall = box(4, wallH, wallThick, C.stone, { roughness: 0.85 });
            const a = w * Math.PI / 2;
            wall.position.set(Math.cos(a) * 2, wallH / 2, Math.sin(a) * 2);
            wall.rotation.y = a;
            wall.userData.isMapObject = true; outpost.add(wall);
        }

        // Corner pillars
        for (let c = 0; c < 4; c++) {
            const a = c * Math.PI / 2;
            const pillar = cyl(0.2, 0.25, wallH + 0.5, 6, C.stoneDark, { roughness: 0.9 });
            pillar.position.set(Math.cos(a) * 2.3, (wallH + 0.5) / 2, Math.sin(a) * 2.3);
            pillar.userData.isMapObject = true; outpost.add(pillar);
        }

        // Pyramidal roof
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(3.5, 2.5, 4),
            mat(C.rust, { roughness: 0.9 })
        );
        roof.position.y = wallH + 1.25; roof.rotation.y = Math.PI / 4;
        roof.userData.isMapObject = true; outpost.add(roof);

        // Loot crate inside
        const loot = box(0.7, 0.7, 0.7, C.gold, { roughness: 0.4, metalness: 0.5 });
        loot.position.set(0, 0.35, -1);
        loot.userData.isMapObject = true; loot.userData.isLoot = true; loot.userData.isOutpost = true;
        outpost.add(loot);

        // Light inside
        const light = new THREE.PointLight(0xffcc44, 1.5, 10);
        light.position.y = 2.5; light.userData.isMapObject = true; outpost.add(light);

        outpost.position.set(op.x, 0.3, op.z);
        scene.add(outpost);
        addCollider(gen, 'box', [op.x, 1.5, op.z], [5, 3, 5]);
    }
}

// --- Trees scattered ---
function buildTrees(scene, gen) {
    const treePositions = [];

    // Palm trees on beach
    for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = RADIUS * 0.6 + Math.random() * RADIUS * 0.2;
        treePositions.push({
            x: Math.cos(a) * r, z: Math.sin(a) * r,
            type: 'palm'
        });
    }

    // Forest trees (non-jungle)
    for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 100;
        treePositions.push({
            x: Math.cos(a) * r, z: Math.sin(a) * r,
            type: 'forest'
        });
    }

    for (const tp of treePositions) {
        const g = new THREE.Group();

        if (tp.type === 'palm') {
            const h = 5 + Math.random() * 3;
            const trunk = cyl(0.15, 0.2, h, 6, C.palmTrunk, { roughness: 0.95 });
            trunk.position.y = h / 2; trunk.userData.isMapObject = true; trunk.userData.isTree = true; g.add(trunk);
            for (let l = 0; l < 6; l++) {
                const leaf = new THREE.Mesh(
                    new THREE.ConeGeometry(0.6, 2.5, 3),
                    mat(C.palmLeaf, { roughness: 0.9 })
                );
                leaf.position.set(0, h + 0.3, 0);
                leaf.rotation.z = (l / 6) * Math.PI * 2;
                leaf.rotation.y = (l / 6) * Math.PI * 2;
                leaf.userData.isMapObject = true; leaf.userData.isTree = true; g.add(leaf);
            }
        } else {
            // Forest tree (standard)
            const h = 4 + Math.random() * 3;
            const trunk = cyl(0.15, 0.2, h * 0.6, 6, C.woodDark, { roughness: 0.95 });
            trunk.position.y = h * 0.3; trunk.userData.isMapObject = true; trunk.userData.isTree = true; g.add(trunk);
            const canopy = new THREE.Mesh(
                new THREE.ConeGeometry(2, 3, 6),
                mat(C.grass, { roughness: 0.9 })
            );
            canopy.position.y = h * 0.7; canopy.userData.isMapObject = true; canopy.userData.isTree = true; g.add(canopy);
        }

        g.position.set(tp.x, 0.3, tp.z);
        scene.add(g);
    }
}

// --- Decorations ---
function buildDecorations(scene, gen) {
    // Barrels
    for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * 140;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const barrel = cyl(0.35, 0.35, 0.9, 8, C.woodDark, { roughness: 0.85 });
        barrel.position.set(x, 0.45, z);
        barrel.userData.isMapObject = true; scene.add(barrel);
    }

    // Crates scattered
    for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * 130;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const c = box(0.8, 0.8, 0.8, C.gold, { roughness: 0.4, metalness: 0.5 });
        c.position.set(x, 0.4, z);
        c.userData.isMapObject = true; c.userData.isLoot = true; scene.add(c);
    }

    // Fence posts along paths
    for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 100;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const post = cyl(0.08, 0.1, 1.2, 5, C.woodDark, { roughness: 0.9 });
        post.position.set(x, 0.6, z);
        post.userData.isMapObject = true; scene.add(post);
    }

    // Campfires scattered
    for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 100;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const fire = new THREE.Group();
        for (let j = 0; j < 4; j++) {
            const log = cyl(0.06, 0.06, 0.6, 5, C.woodDark, { roughness: 0.95 });
            log.position.set(Math.cos(j * Math.PI / 2) * 0.15, 0.1, Math.sin(j * Math.PI / 2) * 0.15);
            log.rotation.z = Math.PI / 2; log.rotation.y = j * Math.PI / 2;
            log.userData.isMapObject = true; fire.add(log);
        }
        const fLight = new THREE.PointLight(0xff6600, 2, 10);
        fLight.position.y = 0.5; fLight.userData.isMapObject = true; fire.add(fLight);
        fire.position.set(x, 0.3, z);
        scene.add(fire);
    }

    // Road markers
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = 50 + Math.random() * 80;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const marker = new THREE.Group();
        const pole = cyl(0.05, 0.06, 2, 5, C.metal, { roughness: 0.5, metalness: 0.6 });
        pole.position.y = 1; pole.userData.isMapObject = true; marker.add(pole);
        const sign = box(0.6, 0.4, 0.08, C.white, { roughness: 0.7 });
        sign.position.set(0, 2, 0); sign.userData.isMapObject = true; marker.add(sign);
        marker.position.set(x, 0.3, z);
        scene.add(marker);
    }
}

// --- Radiation zones ---
function buildRadiation(scene, gen) {
    const radPositions = [
        [RADIUS * 0.4, RADIUS * 0.3],   // near volcano
        [-RADIUS * 0.4, -RADIUS * 0.3], // near caves
        [0, -RADIUS * 0.5],              // near lighthouse
    ];
    for (const [rx, rz] of radPositions) {
        const cloud = new THREE.Mesh(
            new THREE.SphereGeometry(10, 12, 8),
            mat(0x88cc44, { transparent: true, opacity: 0.15, emissive: 0x88cc44, emissiveIntensity: 0.3 })
        );
        cloud.position.set(rx, 8, rz);
        cloud.userData.isMapObject = true; scene.add(cloud);

        const glow = new THREE.PointLight(0x88cc44, 1.5, 15);
        glow.position.set(rx, 8, rz);
        glow.userData.isMapObject = true; scene.add(glow);

        gen.radiationZones.push({ position: new THREE.Vector3(rx, 0, rz), radius: 10, damage: 0.5 });
    }
}

// --- Traps ---
function buildTraps(scene, gen) {
    // Bear traps
    for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 130;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const trap = new THREE.Group();
        for (let j = 0; j < 2; j++) {
            const jaw = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 0.15, 0.12),
                mat(C.metal, { roughness: 0.5, metalness: 0.7 })
            );
            jaw.position.set((j - 0.5) * 0.8, 0.08, 0);
            jaw.rotation.z = (j - 0.5) * 0.3;
            jaw.userData.isMapObject = true; trap.add(jaw);
        }
        trap.position.set(x, 0.3, z);
        scene.add(trap);
        gen.traps.push({ type: 'bearTrap', position: new THREE.Vector3(x, 0.3, z), radius: 1, damage: 8 });
    }
}

// --- Fog zones ---
function buildFogZones(gen) {
    gen.fogZones = [
        { position: new THREE.Vector3(0, 0, 0), radius: 160, damage: 0.3 },
        { position: new THREE.Vector3(0, 0, 0), radius: 120, damage: 0.6 },
        { position: new THREE.Vector3(0, 0, 0), radius: 80, damage: 1.0 },
        { position: new THREE.Vector3(0, 0, 0), radius: 40, damage: 2.0 },
    ];
}

// ===================== MAP GENERATOR CLASS =====================
const _yield = () => new Promise(r => setTimeout(r, 50));

export class MapGenerator {
    constructor(scene) {
        this.scene = scene;
        this.arenaRadius = RADIUS;
        this.spawnCourtyardRadius = 30;
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
        this._allPointLights = [];
        this._maxVisiblePointLights = 10;
        this._maxLightDistance = 120;
        this.noise = new SimplexNoise(42);
        this.heightMap = null;
        this.currentFogPhase = 0;
        this.zoneTransitionTime = 0;
        this.activeFogRing = null;
        this.onProgress = null;
        this.ready = new Promise(resolve => { this._resolveReady = resolve; });
    }

    reportProgress(ratio, status) { this.onProgress?.(ratio, status); }

    _createPointLight(color, intensity, distance) {
        const light = new THREE.PointLight(color, intensity, distance);
        this._allPointLights.push(light);
        return light;
    }

    _cullPointLights(playerPos) {
        if (!playerPos || this._allPointLights.length === 0) return;
        const sorted = this._allPointLights.slice().sort((a, b) => {
            const da = a.position.distanceToSquared(playerPos);
            const db = b.position.distanceToSquared(playerPos);
            return da - db;
        });
        for (let i = 0; i < sorted.length; i++) sorted[i].visible = i < this._maxVisiblePointLights;
        for (const light of this._allPointLights) {
            if (light.visible && light.position.distanceToSquared(playerPos) > this._maxLightDistance ** 2) {
                light.visible = false;
            }
        }
    }

    startGeneration() { return this.generate(); }

    getHeightAt(x, z) {
        const dist = Math.sqrt(x * x + z * z) / RADIUS;
        if (dist < 0.85) return this.noise.fbm(x * 0.005, z * 0.005, 4, 2, 0.5) * 12 + 3 * (1 - dist);
        return 0;
    }

    getSurfaceHeightAt(x, z) { return this.getHeightAt(x, z); }

    // ===================== GENERATION ORCHESTRATOR =====================
    async generate() {
        try {
            this.reportProgress(0.05, 'Создание острова...');
            await _yield();

            await buildIslandTerrain(this.scene, this);
            this.reportProgress(0.10, 'Остров создан');

            await _yield();
            await buildSpawnCamp(this.scene, this);
            this.reportProgress(0.15, 'Лагерь спавна');

            await _yield();
            await buildBeach(this.scene, this);
            this.reportProgress(0.20, 'Пляж');

            await _yield();
            await buildVillage(this.scene, this);
            this.reportProgress(0.25, 'Деревня');

            await _yield();
            await buildRiver(this.scene, this);
            this.reportProgress(0.30, 'Река и мосты');

            await _yield();
            await buildJungle(this.scene, this);
            this.reportProgress(0.35, 'Джунгли');

            await _yield();
            await buildVolcano(this.scene, this);
            this.reportProgress(0.45, 'Вулкан');

            await _yield();
            await buildLighthouse(this.scene, this);
            this.reportProgress(0.50, 'Маяк');

            await _yield();
            await buildCaves(this.scene, this);
            this.reportProgress(0.55, 'Пещеры');

            await _yield();
            await buildBunker(this.scene, this);
            this.reportProgress(0.60, 'Бункер');

            await _yield();
            await buildOutposts(this.scene, this);
            this.reportProgress(0.65, 'Аванпосты');

            await _yield();
            buildTrees(this.scene, this);
            this.reportProgress(0.70, 'Деревья');

            await _yield();
            buildDecorations(this.scene, this);
            this.reportProgress(0.75, 'Декорации');

            await _yield();
            buildTraps(this.scene, this);
            this.reportProgress(0.80, 'Ловушки');

            await _yield();
            buildRadiation(this.scene, this);
            this.reportProgress(0.85, 'Радиация');

            await _yield();
            buildFogZones(this);
            this.reportProgress(0.90, 'Зоны обозначены');

            await this._buildLootData();
            this.reportProgress(0.95, 'Мир готов');

            this._resolveReady();
        } catch (e) { this._resolveReady(); }
    }

    async _buildLootData() {
        this.lootData = [];
        const lootTypes = ['weapon', 'ammo', 'health', 'armor', 'scope', 'magazine'];
        for (let i = 0; i < 80; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 20 + Math.random() * 150;
            this.lootData.push({
                x: Math.cos(a) * r, z: Math.sin(a) * r,
                type: lootTypes[Math.floor(Math.random() * lootTypes.length)],
                tier: Math.random() > 0.6 ? 2 : 1
            });
        }
    }

    // ===================== ANIMATION UPDATES =====================
    updateZoneAnimations(deltaTime) {
        for (const obj of this.animatedObjects) {
            if (obj.type === 'glow' && obj.light) {
                if (obj.pulse) {
                    obj.light.intensity = obj.baseIntensity * (0.8 + Math.sin(performance.now() * 0.003) * 0.2);
                } else if (obj.baseIntensity) {
                    obj.light.intensity = obj.baseIntensity * (0.85 + Math.sin(performance.now() * 0.005) * 0.15);
                }
            }
            if (obj.type === 'forcefield' && obj.material) {
                obj.material.opacity = obj.baseOpacity * (0.7 + Math.sin(performance.now() * 0.002) * 0.3);
            }
        }
    }

    updatePropVisibility(playerPos) { this._cullPointLights(playerPos); }

    update(delta, playerPos) {
        if (playerPos) this.updatePropVisibility(playerPos);
        this.updateZoneAnimations(delta);
    }

    // ===================== GAMEPLAY INTERFACES =====================
    getFloorTiles() {
        const tiles = [];
        // Spread tiles across the ENTIRE map, not just the courtyard
        const POIs = [
            // Volcano sector (south)
            { x: 0, z: -132, r: 50 },
            // Lighthouse sector (southeast)
            { x: 99, z: -110, r: 40 },
            // Caves sector (northwest)
            { x: -110, z: -99, r: 40 },
            // Bunker sector (west)
            { x: -121, z: 0, r: 30 },
            // Random spread across entire map
            { x: 160, z: 100, r: 35 },
            { x: -160, z: 80, r: 35 },
            { x: 80, z: 170, r: 35 },
            { x: -80, z: -170, r: 35 },
            // Outer ring for maximum spread
            { x: 0, z: 180, r: 25 },
            { x: 180, z: 0, r: 25 },
            { x: 0, z: -180, r: 25 },
            { x: -180, z: 0, r: 25 },
        ];
        for (const poi of POIs) {
            for (let i = 0; i < 6; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * poi.r;
                tiles.push({ x: poi.x + Math.cos(angle) * dist, z: poi.z + Math.sin(angle) * dist });
            }
        }
        return tiles;
    }

    getHouseSpots() {
        // Return POI locations as spawn/chest spots (volcano, lighthouse, caves, bunker)
        return [
            { x: 0, z: -132, type: 'volcano' },
            { x: 99, z: -110, type: 'lighthouse' },
            { x: -110, z: -99, type: 'caves' },
            { x: -121, z: 0, type: 'bunker' },
            { x: 160, z: 100, type: 'ruins' },
            { x: -160, z: 80, type: 'ruins' },
            { x: 80, z: 170, type: 'camp' },
            { x: -80, z: -170, type: 'ruins' },
        ];
    }

    getHangarSpots() {
        return this.getHouseSpots().map(s => ({ ...s, type: s.type === 'bunker' ? 'hangar' : s.type }));
    }
    getStoryNotes() { return []; }
    getExplosiveBarrelSpots() { return this.hazards || []; }
    getTraps() { return this.traps || []; }
    getFogZones() { return this.fogZones || []; }
    getSpawnPads() { return this.spawnPads || []; }

    getCourtyardExitPosition() { return new THREE.Vector3(60, 0, 0); }

    isInsideCourtyard(pos) {
        const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
        return dist < this.spawnCourtyardRadius;
    }

    setCourtyardGateOpen(open) { this.courtyardGateOpen = open; }

    activateFogPhase(phase) {
        this.currentFogPhase = phase;
        const zoneRadius = this.spawnCourtyardRadius || RADIUS;
        const shrinkAmount = [0, 40, 70, 100][phase] || 0;
        this.zoneTargetRadius = Math.max(30, zoneRadius - shrinkAmount);
        return this.zoneTargetRadius;
    }

    getActiveSafeRadius() { return this.zoneTargetRadius || this.spawnCourtyardRadius || RADIUS; }

    getClosestRadiationZone(x, z) {
        let closest = null, closestDist = Infinity;
        for (const rz of this.radiationZones) {
            const dx = x - rz.position.x, dz = z - rz.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < closestDist) { closestDist = dist; closest = { zone: rz, distance: dist }; }
        }
        return closestDist < 100 ? closest : null;
    }

    getRadiationDamageAt(x, z) {
        for (const rz of this.radiationZones) {
            const dx = x - rz.position.x, dz = z - rz.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < rz.radius) { const intensity = 1 - dist / rz.radius; return rz.damage * intensity; }
        }
        return 0;
    }

    getStructureAtPoint(x, z, radius) { return null; }
    findStructureInteriorPoint(point, type) { return null; }
    getStructureEntryPoint(point, type, playerPos) { return null; }
    findStructureGuardPoint(point, type) { return null; }

    isWalkableAt(x, z) {
        const dist = Math.sqrt(x * x + z * z);
        return dist < (RADIUS || 220);
    }

    raycastGroundY(x, z) { return this.getHeightAt(x, z); }

    setNightEmissive(isNight) {
        this.scene.traverse(obj => {
            if (obj.isMesh && obj.userData.isFloor && obj.material) {
                const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
                if (m && m.emissiveIntensity !== undefined) {
                    m.emissiveIntensity = isNight ? 0.3 : 0;
                    if (isNight && !m.emissive) m.emissive = new THREE.Color(0x111122);
                }
            }
        });
    }

    getTerrainMaterialAt(x, z) {
        const dist = Math.sqrt(x * x + z * z) / RADIUS;
        if (dist < 0.15) return 'camp';
        if (x < -40 && z < -40) return 'jungle';
        if (x > 40 && z > 40) return 'volcano';
        if (x < -40 && z > 40) return 'caves';
        if (x > 40 && z < -40) return 'beach';
        return 'village';
    }

    setWetTerrain(wet) {}
    setRainPuddles(active, center) {}
    getOneWayGates() { return []; }
}
