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
        const s = (x + y) * F2, g = (i, j) => [i - Math.floor(x + s) + Math.floor((i + j) * G2), j - Math.floor(x + s) + Math.floor((i + j) * G2)];
        const i = Math.floor(x + s), j = Math.floor(y + s);
        const x0 = x - i, y0 = y - j;
        const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
        const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
        const ii = (i + 256) & 255, jj = (j + 256) & 255;
        const pi = v => ((v % 12) + 12) % 12;
        const gi = (n) => pi(this.p[ii + this.p[jj + n]]);
        const dot = (g, x, y) => g[0] * x + g[1] * y;
        let t0 = 0.5 - x0 * x0 - y0 * y0, t1 = 0.5 - x1 * x1 - y1 * y1, t2 = 0.5 - x2 * x2 - y2 * y2;
        const n0 = t0 > 0 ? t0 * t0 * dot(this.grad3[gi(0)], x0, y0) : 0;
        const n1 = t1 > 0 ? t1 * t1 * dot(this.grad3[gi(1)], x1, y1) : 0;
        const n2 = t2 > 0 ? t2 * t2 * dot(this.grad3[gi(2)], x2, y2) : 0;
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
    grass: 0x5a8a3a, dirt: 0x7a6a4a, stone: 0x9a9a9a, stoneDark: 0x6a6a6a,
    wood: 0x8b6236, woodDark: 0x5a3a1a, metal: 0x7a7a7a, metalDark: 0x4a4a4a,
    gold: 0xdaa520, rust: 0xb5651d, red: 0xcc2222, blue: 0x3388cc,
    cyan: 0x44cccc, purple: 0x8844aa, green: 0x22aa44, orange: 0xff8800,
    lava: 0xff3300, obsidian: 0x2a2a3a, bone: 0xd4c4a0, white: 0xe0e0e0,
    black: 0x1a1a1a, sand: 0xd4c480, snow: 0xe8e8f0
};

// ============ MATERIAL CACHE ============
const _mat = new Map();
function mat(color, opts = {}) {
    const k = color.toString(16) + ':' + JSON.stringify(opts, null, 2);
    if (!_mat.has(k)) {
        _mat.set(k, new THREE.MeshStandardMaterial({ color, ...opts }));
    }
    return _mat.get(k);
}

// ============ HELPERS ============
function box(w, h, d, color, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat(color, opts));
    m.castShadow = true; m.receiveShadow = true;
    return m;
}
function cyl(rt, rb, h, seg, color, opts = {}) {
    const geo = new THREE.CylinderGeometry(rt, rb, h, seg);
    const m = new THREE.Mesh(geo, mat(color, opts));
    m.castShadow = true; m.receiveShadow = true;
    return m;
}
function sphere(r, wSeg, hSeg, color, opts = {}) {
    const geo = new THREE.SphereGeometry(r, wSeg, hSeg);
    const m = new THREE.Mesh(geo, mat(color, opts));
    m.castShadow = true; m.receiveShadow = true;
    return m;
}

function addCollider(gen, type, pos, size, walkable = false) {
    gen.colliders.push({ type, position: new THREE.Vector3(...pos), size: new THREE.Vector3(...size), walkable });
}

// ============ LOW-POLY MODEL GENERATORS ============

// --- Building: stone outpost with roof, door, interior ---
function stoneOutpost(x, z, angle, scene, gen) {
    const g = new THREE.Group();
    const wallM = mat(C.stone, { roughness: 0.85, metalness: 0.1 });
    const darkM = mat(C.stoneDark, { roughness: 0.9 });
    const roofM = mat(C.rust, { roughness: 0.95 });

    // 4 walls with door gap
    const wallLen = 6, wallH = 3.8, wallThick = 0.7;
    for (let i = 0; i < 4; i++) {
        const a = angle + (i - 1) * Math.PI / 2;
        const isDoor = i === 1; // door side
        const wallLen2 = isDoor ? wallLen * 0.55 : wallLen;

        if (!isDoor) {
            const w = box(wallLen2, wallH, wallThick, C.stone, { roughness: 0.85, metalness: 0.1 });
            w.position.set(0, wallH / 2, isDoor ? wallLen * 0.225 : 0);
            w.userData.isMapObject = true;
            g.add(w);
            addCollider(gen, 'box', [0, wallH / 2, isDoor ? wallLen * 0.225 : 0], [wallLen2, wallH, wallThick]);
        }

        // Corner pillars
        if (!isDoor) {
            const p1 = cyl(0.22, 0.25, wallH + 0.6, 6, C.stoneDark, { roughness: 0.9 });
            p1.position.set(wallLen2 / 2, (wallH + 0.6) / 2, wallThick / 2);
            p1.userData.isMapObject = true; g.add(p1);
            addCollider(gen, 'box', [wallLen2 / 2, (wallH + 0.6) / 2, wallThick / 2], [0.44, wallH + 0.6, 0.44]);

            const p2 = p1.clone();
            p2.position.set(-wallLen2 / 2, (wallH + 0.6) / 2, wallThick / 2);
            p2.userData.isMapObject = true; g.add(p2);
        }
    }

    // Door frame
    const doorFrame = cyl(0.15, 0.15, wallH, 6, C.stoneDark, { roughness: 0.85 });
    doorFrame.position.set(0, wallH / 2, wallLen * 0.225);
    doorFrame.rotation.z = Math.PI / 2;
    doorFrame.userData.isMapObject = true; g.add(doorFrame);

    // Wooden door
    const door = box(2.2, 3, 0.15, C.wood, { roughness: 0.8 });
    door.position.set(0, 1.5, wallLen * 0.225);
    door.userData.isMapObject = true; door.userData.isDoor = true;
    g.add(door);

    // Roof (pyramid)
    const roofGeo = new THREE.ConeGeometry(5, 3, 4);
    const roof = new THREE.Mesh(roofGeo, mat(C.rust, { roughness: 0.9 }));
    roof.position.set(0, wallH + 1.5, 0);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true; roof.receiveShadow = true;
    roof.userData.isMapObject = true; g.add(roof);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(wallLen, wallLen, 4, 4);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, mat(C.dirt, { roughness: 0.95 }));
    floor.position.set(0, 0.02, 0);
    floor.receiveShadow = true; floor.userData.isMapObject = true; g.add(floor);

    // Interior loot crate
    const crate = box(0.9, 0.8, 0.9, C.gold, { roughness: 0.4, metalness: 0.5 });
    crate.position.set(0, 0.4, -1.5);
    crate.userData.isMapObject = true; crate.userData.isLoot = true;
    g.add(crate);

    // Light inside
    const light = new THREE.PointLight(0xffcc66, 1.5, 12);
    light.position.set(0, 3.2, 0);
    light.userData.isMapObject = true;
    g.add(light);

    // Rotate and position
    g.position.set(x, 0, z);
    scene.add(g);
}

// --- Building: wooden barricade ---
function woodenBarricade(x, z, angle, scene, gen) {
    const g = new THREE.Group();
    const woodM = mat(C.wood, { roughness: 0.85 });
    const plankH = 0.25, plankThick = 0.12;

    // 3 walls of planks
    for (let w = 0; w < 3; w++) {
        const a = angle + w * Math.PI * 2 / 3;
        const nx = Math.cos(a), nz = Math.sin(a);
        for (let p = 0; p < 4; p++) {
            const plank = box(3.5, plankH, plankThick, C.wood, { roughness: 0.85 });
            plank.position.set(nx * (p - 1.5) * 0.1, 0.5 + p * plankH, nz * (p - 1.5) * 0.1);
            plank.rotation.y = a;
            plank.userData.isMapObject = true; g.add(plank);
            addCollider(gen, 'box', [plank.position.x, plank.position.y, plank.position.z], [3.5, plankH, plankThick]);
        }
    }

    // Support posts
    for (let w = 0; w < 3; w++) {
        const a = angle + w * Math.PI * 2 / 3;
        const post = cyl(0.18, 0.2, 3.5, 6, C.woodDark, { roughness: 0.9 });
        post.position.set(Math.cos(a) * 1.8, 1.75, Math.sin(a) * 1.8);
        post.userData.isMapObject = true; g.add(post);
    }

    g.position.set(x, 0, z);
    scene.add(g);
}

// --- Building: ruined citadel ---
function ruinedCitadel(cx, cz, scene, gen) {
    const g = new THREE.Group();
    const stoneM = mat(C.stone, { roughness: 0.8, metalness: 0.15 });
    const mossM = mat(C.green, { roughness: 0.95 });
    const floorM = mat(C.red, { roughness: 0.9, metalness: 0.05 });

    // Main floor platform
    const floor = box(24, 0.4, 24, C.stoneDark, { roughness: 0.9 });
    floor.position.set(0, 0.2, 0);
    floor.userData.isMapObject = true; floor.userData.isFloor = true;
    g.add(floor);

    // Inner red floor
    const innerFloor = box(20, 0.1, 20, C.red, { roughness: 0.95, transparent: true, opacity: 0.6 });
    innerFloor.position.set(0, 0.45, 0);
    innerFloor.receiveShadow = true; innerFloor.userData.isMapObject = true; g.add(innerFloor);

    // Broken walls (partial)
    const wallPositions = [
        { x: 0, z: 10, ry: 0, h: 5 }, { x: 0, z: -10, ry: 0, h: 3.5 },
        { x: 10, z: 0, ry: Math.PI / 2, h: 4.5 }, { x: -10, z: 0, ry: Math.PI / 2, h: 6 },
    ];
    for (const wp of wallPositions) {
        const w = box(8, wp.h, 0.8, C.stone, { roughness: 0.8, metalness: 0.15 });
        w.position.set(wp.x, wp.h / 2 + 0.4, wp.z);
        w.rotation.y = wp.ry;
        w.userData.isMapObject = true; g.add(w);
        addCollider(gen, 'box', [wp.x, wp.h / 2 + 0.4, wp.z], [8, wp.h, 0.8]);
    }

    // Columns (some broken)
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = 12;
        const h = i % 2 === 0 ? 7 : 3.5; // alternating height
        const col = cyl(0.4, 0.5, h, 8, C.stone, { roughness: 0.7, metalness: 0.2 });
        col.position.set(Math.cos(a) * r, h / 2 + 0.4, Math.sin(a) * r);
        col.userData.isMapObject = true; g.add(col);
        if (h > 4) {
            addCollider(gen, 'cylinder', [Math.cos(a) * r, h / 2 + 0.4, Math.sin(a) * r], [0.6, h]);
        }
    }

    // Archway entrance
    const archPillar1 = cyl(0.5, 0.6, 6, 8, C.stone, { roughness: 0.7 });
    archPillar1.position.set(-2, 3.2, 12);
    archPillar1.userData.isMapObject = true; g.add(archPillar1);

    const archPillar2 = cyl(0.5, 0.6, 6, 8, C.stone, { roughness: 0.7 });
    archPillar2.position.set(2, 3.2, 12);
    archPillar2.userData.isMapObject = true; g.add(archPillar2);

    const archTop = box(5, 1.2, 1.2, C.stone, { roughness: 0.7 });
    archTop.position.set(0, 6.6, 12);
    archTop.userData.isMapObject = true; g.add(archTop);

    // Moss patches
    for (let i = 0; i < 15; i++) {
        const mx = (Math.random() - 0.5) * 18;
        const mz = (Math.random() - 0.5) * 18;
        const moss = box(1.5 + Math.random() * 2, 0.1, 1.5 + Math.random(), C.green, { roughness: 0.95 });
        moss.position.set(mx, 0.45, mz);
        moss.rotation.y = Math.random() * Math.PI;
        moss.userData.isMapObject = true; g.add(moss);
    }

    // Central altar
    const altar = cyl(1.5, 2, 1.5, 8, C.stoneDark, { roughness: 0.6, metalness: 0.3 });
    altar.position.set(0, 1.15, 0);
    altar.userData.isMapObject = true; g.add(altar);
    addCollider(gen, 'cylinder', [0, 1.15, 0], [2, 1.5]);

    // Glow on altar
    const glow = new THREE.PointLight(0xcc2244, 2, 15);
    glow.position.set(0, 2.5, 0);
    glow.userData.isMapObject = true;
    g.add(glow);

    g.position.set(cx, 0, cz);
    scene.add(g);
}

// --- Building: crystal grotto (cave with crystals) ---
function crystalGrotto(cx, cz, scene, gen) {
    const g = new THREE.Group();
    const caveMat = mat(C.stoneDark, { roughness: 0.9, metalness: 0.1 });
    const crystalM = mat(C.cyan, { roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.7 });

    // Cave floor
    const caveFloor = new THREE.Mesh(
        new THREE.CircleGeometry(12, 16),
        mat(C.stone, { roughness: 0.85 })
    );
    caveFloor.rotation.x = -Math.PI / 2;
    caveFloor.position.y = 0.3;
    caveFloor.receiveShadow = true; caveFloor.userData.isMapObject = true; g.add(caveFloor);

    // Cave walls (broken circle)
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        if (i === 0) continue; // entrance gap
        const h = 4 + Math.random() * 4;
        const wall = box(2.5, h, 1.5, C.stoneDark, { roughness: 0.85 });
        wall.position.set(Math.cos(a) * 11, h / 2, Math.sin(a) * 11);
        wall.rotation.y = -a;
        wall.userData.isMapObject = true; g.add(wall);
        if (i % 3 === 0) addCollider(gen, 'box', [wall.position.x, wall.position.y, wall.position.z], [2.5, h, 1.5]);
    }

    // Crystal formations
    for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 8;
        const ch = 1 + Math.random() * 3;
        const crystal = new THREE.Mesh(
            new THREE.ConeGeometry(0.3 + Math.random() * 0.4, ch, 5),
            mat(C.cyan + (Math.random() > 0.5 ? 0x111111 : 0), {
                roughness: 0.2, metalness: 0.5, transparent: true, opacity: 0.75
            })
        );
        crystal.position.set(Math.cos(a) * r, ch / 2 + 0.3, Math.sin(a) * r);
        crystal.rotation.y = Math.random();
        crystal.userData.isMapObject = true; g.add(crystal);
    }

    // Stalactites from ceiling
    for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 6;
        const sl = 1 + Math.random() * 2;
        const stal = new THREE.Mesh(
            new THREE.ConeGeometry(0.2, sl, 5),
            mat(C.cyan, { roughness: 0.25, metalness: 0.5, transparent: true, opacity: 0.6 })
        );
        stal.position.set(Math.cos(a) * r, 5 + sl / 2, Math.sin(a) * r);
        stal.rotation.z = Math.PI; // point down
        stal.userData.isMapObject = true; g.add(stal);
    }

    // Cave glow lights
    const glowLight = new THREE.PointLight(0x44cccc, 2, 18);
    glowLight.position.set(0, 3, 0);
    glowLight.userData.isMapObject = true; g.add(glowLight);

    g.position.set(cx, 0, cz);
    scene.add(g);
}

// --- Building: burning wastes structures ---
function wasteStructure(x, z, type, scene, gen) {
    const g = new THREE.Group();

    if (type === 'bunker') {
        // Reinforced bunker
        const body = box(5, 3, 4, C.obsidian, { roughness: 0.5, metalness: 0.4 });
        body.position.set(0, 1.5, 0);
        body.userData.isMapObject = true; g.add(body);
        addCollider(gen, 'box', [0, 1.5, 0], [5, 3, 4]);

        // Roof plates
        const roof1 = box(5.2, 0.3, 4.2, C.stoneDark, { roughness: 0.6 });
        roof1.position.set(0, 3.15, 0);
        roof1.userData.isMapObject = true; g.add(roof1);

        // Vent
        const vent = cyl(0.4, 0.4, 1.5, 8, C.stoneDark, { roughness: 0.5 });
        vent.position.set(0, 3.9, 0);
        vent.userData.isMapObject = true; g.add(vent);

        // Door
        const door = box(1.2, 2.2, 0.2, C.metal, { roughness: 0.6, metalness: 0.5 });
        door.position.set(0, 1.1, 2.1);
        door.userData.isMapObject = true; door.userData.isDoor = true;
        g.add(door);
    } else if (type === 'watchtower') {
        // Watchtower
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            const post = cyl(0.2, 0.25, 7, 6, C.woodDark, { roughness: 0.85 });
            post.position.set(Math.cos(a) * 2, 3.5, Math.sin(a) * 2);
            post.userData.isMapObject = true; g.add(post);
        }

        // Platform
        const plat = box(4, 0.3, 4, C.wood, { roughness: 0.8 });
        plat.position.set(0, 7, 0);
        plat.userData.isMapObject = true; g.add(plat);

        // Railing
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            const rail = box(0.1, 1.2, 3.6, C.wood, { roughness: 0.85 });
            rail.position.set(Math.cos(a) * 2.2, 7.6, Math.sin(a) * 2.2);
            rail.rotation.y = a;
            rail.userData.isMapObject = true; g.add(rail);
        }

        // Roof
        const twRoof = new THREE.Mesh(
            new THREE.ConeGeometry(3.5, 2, 4),
            mat(C.woodDark, { roughness: 0.9 })
        );
        twRoof.position.set(0, 8.6, 0);
        twRoof.rotation.y = Math.PI / 4;
        twRoof.userData.isMapObject = true; g.add(twRoof);

        // Light on top
        const twLight = new THREE.PointLight(0xffaa44, 3, 20);
        twLight.position.set(0, 9.5, 0);
        twLight.userData.isMapObject = true; g.add(twLight);
    }

    g.position.set(x, 0, z);
    scene.add(g);
}

// --- Props: barrel ---
function barrel(x, y, z, scene) {
    const g = new THREE.Group();
    const body = cyl(0.35, 0.35, 0.9, 8, C.woodDark, { roughness: 0.85 });
    body.position.y = 0.45; body.userData.isMapObject = true; g.add(body);

    // Metal bands
    for (let i = 0; i < 2; i++) {
        const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.36, 0.03, 6, 8),
            mat(C.metal, { roughness: 0.5, metalness: 0.6 })
        );
        band.position.y = 0.25 + i * 0.45;
        band.rotation.x = Math.PI / 2;
        band.userData.isMapObject = true; g.add(band);
    }

    g.position.set(x, y, z);
    scene.add(g);
}

// --- Props: crate ---
function crate(x, y, z, scene, size = 1) {
    const g = box(0.9 * size, 0.9 * size, 0.9 * size, C.wood, { roughness: 0.8 });
    g.position.set(x, y + 0.45 * size, z);
    g.userData.isMapObject = true; g.userData.isLoot = true;
    scene.add(g);
    addCollider(null, 'box', [g.position.x, g.position.y, g.position.z], [0.9 * size, 0.9 * size, 0.9 * size]);
}

// --- Props: fence post ---
function fencePost(x, y, z, scene) {
    const post = cyl(0.08, 0.1, 1.2, 5, C.woodDark, { roughness: 0.9 });
    post.position.set(x, y + 0.6, z);
    post.userData.isMapObject = true; scene.add(post);
}

// --- Props: campfire ---
function campfire(x, y, z, scene) {
    const g = new THREE.Group();
    // Fire logs
    for (let i = 0; i < 4; i++) {
        const log = cyl(0.06, 0.06, 0.6, 5, C.woodDark, { roughness: 0.95 });
        log.position.set(Math.cos(i * Math.PI / 2) * 0.15, 0.1, Math.sin(i * Math.PI / 2) * 0.15);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = i * Math.PI / 2;
        log.userData.isMapObject = true; g.add(log);
    }
    // Fire light
    const fireLight = new THREE.PointLight(0xff6600, 3, 12);
    fireLight.position.y = 0.5;
    fireLight.userData.isMapObject = true; g.add(fireLight);
    g.position.set(x, y, z);
    scene.add(g);
}

// --- Props: road marker ---
function roadMarker(x, y, z, scene) {
    const g = new THREE.Group();
    const pole = cyl(0.05, 0.06, 2, 6, C.metal, { roughness: 0.5, metalness: 0.6 });
    pole.position.y = 1; pole.userData.isMapObject = true; g.add(pole);
    const sign = box(0.8, 0.6, 0.1, C.white, { roughness: 0.7 });
    sign.position.set(0, 2, 0);
    sign.userData.isMapObject = true; g.add(sign);
    g.position.set(x, y, z);
    scene.add(g);
}

// --- Tree: proper low-poly tree ---
function tree(x, y, z, scene, type = 'normal') {
    const g = new THREE.Group();
    const trunkH = 2 + Math.random() * 2;
    const trunkR = 0.2 + Math.random() * 0.15;

    // Trunk
    const trunk = cyl(trunkR * 0.6, trunkR, trunkH, 6, C.woodDark, { roughness: 0.95 });
    trunk.position.y = trunkH / 2;
    trunk.userData.isMapObject = true; trunk.userData.isTree = true; g.add(trunk);

    // Canopy layers
    const canopyColors = type === 'ruined' ? C.stoneDark : type === 'crystal' ? C.cyan : C.grass;
    for (let i = 0; i < 3; i++) {
        const cr = 1.2 + (3 - i) * 0.5;
        const ch = 1.5 + (3 - i) * 0.3;
        const canopy = new THREE.Mesh(
            new THREE.ConeGeometry(cr, ch, 6),
            mat(canopyColors, { roughness: 0.9, metalness: type === 'crystal' ? 0.4 : 0 })
        );
        canopy.position.y = trunkH + 1 + i * 1;
        canopy.rotation.y = i * Math.PI / 6;
        canopy.userData.isMapObject = true; canopy.userData.isTree = true; g.add(canopy);
    }

    g.position.set(x, y, z);
    scene.add(g);
}

// --- Cornucopia: proper horn of plenty ---
function cornucopia(scene, gen) {
    const g = new THREE.Group();
    const metalMat = mat(C.gold, { roughness: 0.3, metalness: 0.8 });
    const darkMat = mat(C.metalDark, { roughness: 0.5, metalness: 0.5 });

    // Base platform (octagonal)
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(12, 14, 2, 8),
        mat(C.metal, { roughness: 0.6, metalness: 0.4 })
    );
    base.position.y = 1; base.receiveShadow = true; base.userData.isMapObject = true; base.userData.isCornucopia = true;
    g.add(base);
    addCollider(gen, 'cylinder', [0, 1, 0], [14, 2]);

    // Main body - two crossed horns
    for (let side of [-1, 1]) {
        const horn = new THREE.Mesh(
            new THREE.CylinderGeometry(0.6, 2.5, 14, 10),
            metalMat
        );
        horn.position.set(side * 6, 10, 0);
        horn.rotation.z = side * 0.4;
        horn.userData.isMapObject = true; horn.userData.isCornucopia = true;
        g.add(horn);
    }

    // Central structure
    const central = new THREE.Mesh(
        new THREE.CylinderGeometry(4, 6, 8, 8),
        mat(C.metal, { roughness: 0.4, metalness: 0.6 })
    );
    central.position.y = 6; central.userData.isMapObject = true; central.userData.isCornucopia = true;
    g.add(central);

    // Spire
    const spire = new THREE.Mesh(
        new THREE.ConeGeometry(2.5, 10, 8),
        metalMat
    );
    spire.position.y = 15; spire.userData.isMapObject = true; spire.userData.isCornucopia = true;
    g.add(spire);

    // Spire orb
    const orb = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 8, 6),
        mat(C.cyan, { roughness: 0.1, metalness: 0.7, emissive: C.cyan, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 })
    );
    orb.position.y = 21; orb.userData.isMapObject = true; g.add(orb);

    // Glow
    const cornLight = new THREE.PointLight(0xffcc44, 5, 40);
    cornLight.position.y = 18; cornLight.userData.isMapObject = true; g.add(cornLight);
    gen.animatedObjects.push({ type: 'glow', light: cornLight, baseIntensity: 5, pulse: true });

    // Chains around base
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const chain = cyl(0.06, 0.06, 4, 5, metalMat, { roughness: 0.3 });
        chain.position.set(Math.cos(a) * 12, 2, Math.sin(a) * 12);
        chain.userData.isMapObject = true; g.add(chain);
    }

    // Corner pillars
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const pillar = cyl(0.4, 0.5, 6, 8, darkMat, { roughness: 0.5, metalness: 0.5 });
        pillar.position.set(Math.cos(a) * 13, 3, Math.sin(a) * 13);
        pillar.userData.isMapObject = true; g.add(pillar);

        // Pillar top
        const pTop = sphere(0.6, 8, 6, C.gold, { roughness: 0.3, metalness: 0.8 });
        pTop.position.set(Math.cos(a) * 13, 6.6, Math.sin(a) * 13);
        pTop.userData.isMapObject = true; g.add(pTop);

        // Pillar lights
        const pLight = new THREE.PointLight(0xffaa44, 1, 15);
        pLight.position.set(Math.cos(a) * 13, 7.2, Math.sin(a) * 13);
        pLight.userData.isMapObject = true; g.add(pLight);
    }

    // Supply crates around base
    const cratePositions = [
        [6, 2.2, 6], [-6, 2.2, 6], [6, 2.2, -6], [-6, 2.2, -6],
        [10, 2.2, 0], [-10, 2.2, 0], [0, 2.2, 10], [0, 2.2, -10],
    ];
    for (const cp of cratePositions) {
        const c = box(1, 1, 1, C.gold, { roughness: 0.4, metalness: 0.5 });
        c.position.set(...cp);
        c.userData.isMapObject = true; c.userData.isLoot = true; c.userData.isCornucopia = true;
        g.add(c);
        addCollider(gen, 'box', cp, [1, 1, 1]);
    }

    // Spawn pads
    gen.spawnPads.push({ x: 0, y: 0.5, z: 0, radius: 4 });
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        gen.spawnPads.push({ x: Math.cos(a) * 10, y: 0.5, z: Math.sin(a) * 10, radius: 2.5 });
    }
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 5;
        gen.spawnPads.push({ x: Math.cos(a) * 20, y: 0.5, z: Math.sin(a) * 20, radius: 2 });
    }

    // Spawn pad visual rings
    for (const pad of gen.spawnPads) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(pad.radius * 0.7, pad.radius, 32),
            mat(0x4488ff, { transparent: true, opacity: 0.25, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(pad.x, 0.55, pad.z);
        ring.userData.isMapObject = true;
        g.add(ring);
    }

    scene.add(g);
}

// --- Lava pools ---
function lavaPool(x, z, radius, scene, gen) {
    const g = new THREE.Group();
    const lavaMat = mat(C.lava, { roughness: 0.1, metalness: 0.8, emissive: 0xff3300, emissiveIntensity: 0.6 });

    // Lava surface
    const lava = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 16),
        lavaMat
    );
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = 0.2;
    lava.receiveShadow = true; lava.userData.isMapObject = true; lava.userData.isLava = true;
    g.add(lava);

    // Obsidian ring
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.8, 6, 16),
        mat(C.obsidian, { roughness: 0.6, metalness: 0.5 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    ring.userData.isMapObject = true; g.add(ring);
    addCollider(gen, 'box', [x, 0.3, z], [radius * 2.2, 0.6, radius * 2.2]);

    // Lava glow
    const lLight = new THREE.PointLight(0xff4400, 4, 20);
    lLight.position.y = 1; lLight.userData.isMapObject = true; g.add(lLight);

    g.position.set(x, 0, z);
    scene.add(g);
    gen.waterMeshes.push({ type: 'lava', mesh: lava, material: lavaMat });
}

// --- Forest pond ---
function forestPond(x, z, radius, scene) {
    const g = new THREE.Group();
    const waterMat = mat(C.green, { transparent: true, opacity: 0.6, roughness: 0.1 });

    const water = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 16),
        waterMat
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.15;
    water.userData.isMapObject = true; water.userData.isWater = true; g.add(water);

    // Stone rim
    const rim = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.5, 6, 16),
        mat(C.stone, { roughness: 0.85 })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.1;
    rim.userData.isMapObject = true; g.add(rim);

    g.position.set(x, 0, z);
    scene.add(g);
}

// --- Biome path ---
function biomePath(x1, z1, x2, z2, scene) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);

    const path = box(3, 0.08, len, C.dirt, { roughness: 0.95 });
    path.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
    path.rotation.y = angle;
    path.receiveShadow = true; path.userData.isMapObject = true; path.userData.isPath = true;
    scene.add(path);
}

// --- Bridge ---
function bridge(x, z, length, rotation, scene) {
    const g = new THREE.Group();

    // Deck planks
    for (let i = 0; i < Math.floor(length / 1.5); i++) {
        const plank = box(3.5, 0.15, 1.4, C.wood, { roughness: 0.85 });
        plank.position.set(0, 1.5, -length / 2 + i * 1.5 + 0.75);
        plank.userData.isMapObject = true; g.add(plank);
    }

    // Ropes
    for (let side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
            const rope = cyl(0.05, 0.05, 1.8, 5, C.woodDark, { roughness: 0.9 });
            rope.position.set(side * 1.7, 2.5, -length / 2 + i * (length / 4));
            rope.userData.isMapObject = true; g.add(rope);
        }
        // Top rope
        const topRope = cyl(0.06, 0.06, length, 5, C.woodDark, { roughness: 0.9 });
        topRope.position.set(side * 1.7, 3.4, 0);
        topRope.rotation.x = Math.PI / 2;
        topRope.userData.isMapObject = true; g.add(topRope);
    }

    // Support chains
    for (let i = 0; i < 3; i++) {
        const chain = cyl(0.08, 0.08, 2.5, 5, C.metal, { roughness: 0.5, metalness: 0.6 });
        chain.position.set(0, 0.5, -length / 2 + i * (length / 2) + length / 4);
        chain.userData.isMapObject = true; g.add(chain);
    }

    g.position.set(x, 0, z);
    g.rotation.y = rotation;
    scene.add(g);
}

// --- Smoke cloud ---
function smokeCloud(x, y, z, scene, gen) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
        const cloud = sphere(1.5 + Math.random(), 8, 6, C.stoneDark, {
            transparent: true, opacity: 0.35, roughness: 1
        });
        cloud.position.set(
            (Math.random() - 0.5) * 3,
            Math.random() * 2,
            (Math.random() - 0.5) * 3
        );
        cloud.userData.isMapObject = true;
        g.add(cloud);
    }
    g.position.set(x, y, z);
    scene.add(g);
    gen.animatedObjects.push({ type: 'smoke', group: g });
}

// --- Radiant cloud ---
function radCloud(x, y, z, radius, damage, scene) {
    const g = new THREE.Group();
    const cloud = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 12, 8),
        mat(0x88cc44, { transparent: true, opacity: 0.2, emissive: 0x88cc44, emissiveIntensity: 0.3 })
    );
    cloud.position.y = y; cloud.userData.isMapObject = true; g.add(cloud);

    const glow = new THREE.PointLight(0x88cc44, 2, radius);
    glow.position.y = y; glow.userData.isMapObject = true; g.add(glow);

    g.position.set(x, 0, z);
    scene.add(g);
    gen.radiationZones.push({ position: new THREE.Vector3(x, 0, z), radius, damage });
}

// --- Trap: spike ---
function spikeTrap(x, z, scene) {
    const g = new THREE.Group();
    // Base plate
    const plate = box(1.2, 0.08, 1.2, C.metal, { roughness: 0.6, metalness: 0.5 });
    plate.position.y = 0.04; plate.userData.isMapObject = true; g.add(plate);

    // Spikes
    for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(
            new THREE.ConeGeometry(0.1, 0.6, 4),
            mat(C.metal, { roughness: 0.4, metalness: 0.7 })
        );
        spike.position.set(
            (Math.random() - 0.5) * 0.8,
            0.35,
            (Math.random() - 0.5) * 0.8
        );
        spike.userData.isMapObject = true; g.add(spike);
    }

    g.position.set(x, 0, z);
    scene.add(g);
    gen.traps.push({ type: 'spike', position: new THREE.Vector3(x, 0, z), radius: 1.5, damage: 12 });
    addCollider(null, 'box', [x, 0, z], [1.2, 0.6, 1.2]);
}

// --- Trap: bear trap ---
function bearTrap(x, z, scene) {
    const g = new THREE.Group();
    // Two jaws
    for (let i = 0; i < 2; i++) {
        const jaw = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.15, 0.12),
            mat(C.metal, { roughness: 0.5, metalness: 0.7 })
        );
        jaw.position.set((i - 0.5) * 0.8, 0.08, 0);
        jaw.rotation.z = (i - 0.5) * 0.3;
        jaw.userData.isMapObject = true; g.add(jaw);
    }

    g.position.set(x, 0, z);
    scene.add(g);
    gen.traps.push({ type: 'bearTrap', position: new THREE.Vector3(x, 0, z), radius: 1, damage: 8 });
}

// ============ MAP GENERATOR CLASS ============
const _yield = () => new Promise(r => setTimeout(r, 50));

export class MapGenerator {
    constructor(scene) {
        this.scene = scene;
        this.arenaRadius = 220;
        this.spawnCourtyardRadius = 40;
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

    // ===================== HEIGHT MAP =====================
    generateHeightMap() {
        const size = 512, res = 128, step = size / res;
        this.heightMap = Array.from({ length: res + 1 }, () => new Float32Array(res + 1));
        for (let i = 0; i <= res; i++)
            for (let j = 0; j <= res; j++) {
                const x = (i - res / 2) * step, z = (j - res / 2) * step;
                this.heightMap[i][j] = this.noise.fbm(x * 0.01, z * 0.01, 4, 2.0, 0.5) * 15;
            }
    }

    getHeightAt(x, z) {
        const h1 = this.noise?.fbm?.(x * 0.01, z * 0.01, 2) ?? 0;
        return Math.max(0, h1 * 3);
    }

    getSurfaceHeightAt(x, z) { return this.getHeightAt(x, z); }

    // ===================== GENERATION ORCHESTRATOR =====================
    async generate() {
        try {
            this.generateHeightMap();
            this.reportProgress(0.05, 'Создание ландшафта...');

            await this._buildArena();
            this.reportProgress(0.10, 'Ландшафт готов');

            await _yield();
            await this._buildForcefield();
            this.reportProgress(0.15, 'Арена построена');

            await _yield();
            await this._buildCornucopia();
            this.reportProgress(0.22, 'Корнукопия');

            await _yield();
            await this._buildInnerRing();
            this.reportProgress(0.30, 'Внутреннее кольцо');

            await this._buildBiomePaths();
            this.reportProgress(0.35, 'Пути биомов');

            await this._buildRuinedCitadel();
            this.reportProgress(0.42, 'Руины Цитадели');

            await this._buildCrystalGrotto();
            this.reportProgress(0.50, 'Хрустальная гротовка');

            await this._buildBurningWastes();
            this.reportProgress(0.58, 'Пылающие пустоши');

            await this._buildLuminousForest();
            this.reportProgress(0.66, 'Светящийся лес');

            this.reportProgress(0.70, 'Мосты и форпосты...');
            await this._buildBridges();
            await this._buildOuterOutposts();
            await this._buildHazardZones();
            this.reportProgress(0.76, 'Объекты размечены');

            await this._buildLootClusters();
            await this._buildFirePits();
            this.reportProgress(0.80, 'Эффекты');

            await this._buildDecorations();
            this.reportProgress(0.86, 'Декорации');

            await this._buildBiomeTrees();
            this.reportProgress(0.92, 'Зоны обозначены');

            await this._buildTraps();
            this.reportProgress(0.94, 'Ловушки');

            await this._buildFogZones();
            await this._buildRadiationZones();
            await this._buildLootData();
            this.reportProgress(0.98, 'Мир готов');

            this._resolveReady();
        } catch (e) { this._resolveReady(); }
    }

    // ===================== ARENA FLOOR =====================
    async _buildArena() {
        const halfSize = this.arenaRadius;

        // Main terrain
        const groundMat = mat(C.grass, { roughness: 0.9, metalness: 0.05 });
        const groundGeo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2, 120, 120);
        groundGeo.rotateX(-Math.PI / 2);

        const pos = groundGeo.attributes.position;
        for (let i = 0; i <= pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            pos.setY(i, this.getHeightAt(x, z));
        }
        groundGeo.computeVertexNormals();

        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.receiveShadow = true;
        ground.userData.isArena = true; ground.userData.isFloor = true; ground.userData.isGround = true;
        ground.userData.isMapObject = true;
        this.scene.add(ground);

        this.colliders.push({
            type: 'box', position: new THREE.Vector3(0, 0, 0),
            size: new THREE.Vector3(halfSize * 2, 1, halfSize * 2), walkable: true
        });

        // Biome overlays
        const biomeZones = [
            { name: 'citadel',  color: C.red,     x: -80, z:  80, radius: 70 },
            { name: 'crystal',  color: C.blue,    x:  80, z:  80, radius: 70 },
            { name: 'wastes',   color: 0xcc4400,  x: -80, z: -80, radius: 75 },
            { name: 'forest',   color: C.green,   x:  80, z: -80, radius: 75 },
        ];

        for (const bz of biomeZones) {
            const biomeGeo = new THREE.CircleGeometry(bz.radius, 48, 24);
            biomeGeo.rotateX(-Math.PI / 2);
            const bp = biomeGeo.attributes.position;
            for (let i = 0; i <= bp.count; i++) {
                const px = bp.getX(i), pz = bp.getZ(i);
                const dist = Math.sqrt(px * px + pz * pz);
                if (dist <= bz.radius - 0.5) {
                    const h = this.noise.fbm(px * 0.03, pz * 0.03, 3, 2, 0.5) * 2.5;
                    const blend = dist / (bz.radius - 1);
                    bp.setY(i, h + Math.pow(1 - blend, 2) * 0.15);
                }
            }
            biomeGeo.computeVertexNormals();

            const biomeMesh = new THREE.Mesh(biomeGeo, mat(bz.color, { roughness: 0.85, transparent: true, opacity: 0.35 }));
            biomeMesh.position.set(bz.x, 0.02, bz.z);
            biomeMesh.receiveShadow = true;
            biomeMesh.userData.isArena = true; biomeMesh.userData.isBiome = true;
            biomeMesh.userData.biomeName = bz.name;
            biomeMesh.userData.isMapObject = true;
            this.scene.add(biomeMesh);
        }

        // Zone dividers
        await this._buildDividers();

        // Spawn courtyard
        const spawnGeo = new THREE.CircleGeometry(this.spawnCourtyardRadius, 32);
        spawnGeo.rotateX(-Math.PI / 2);
        const spawnPad = new THREE.Mesh(spawnGeo, mat(C.metalLight || 0x9a9a9a, { roughness: 0.6, metalness: 0.2 }));
        spawnPad.position.y = 0.02;
        spawnPad.receiveShadow = true;
        spawnPad.userData.isArena = true; spawnPad.userData.isSpawnPad = true;
        spawnPad.userData.isMapObject = true;
        this.scene.add(spawnPad);

        // Terrain hills
        await this._buildTerrainHills();
    }

    async _buildDividers() {
        const dividerMat = mat(0x3a3a2a, { roughness: 0.95 });
        const gateMat = mat(0x6a5a3a, { roughness: 0.8 });

        // Gate positions
        const gatePositions = [
            { x: 0, z: -25 }, { x: 0, z: 25 },
            { x: -25, z: 0 }, { x: 25, z: 0 }
        ];

        function isGate(z, x, gates) {
            for (const gp of gates) {
                if (gp.axis === 'z' && Math.abs(z - gp.z) < 5) return true;
                if (gp.axis === 'x' && Math.abs(x - gp.x) < 5) return true;
            }
            return false;
        }

        // Vertical divider (x=0)
        for (let z = -200; z <= 200; z += 4) {
            if (Math.abs(z) < 25 && Math.abs(z) < 30) {
                const inGate = gatePositions.some(gp => gp.axis === 'z' && Math.abs(z - gp.z) < 5);
                if (!inGate) {
                    const w = box(1.2, 0.5, 4, 0x3a3a2a, { roughness: 0.95 });
                    w.position.set(0, 0.25, z);
                    w.userData.isMapObject = true;
                    this.scene.add(w);
                    this.colliders.push({ type: 'box', position: new THREE.Vector3(0, 0.25, z), size: new THREE.Vector3(1.2, 0.5, 4), walkable: false });
                }
            }
        }

        // Horizontal divider (z=0)
        for (let x = -200; x <= 200; x += 4) {
            const inGate = gatePositions.some(gp => gp.axis === 'x' && Math.abs(x - gp.x) < 5);
            if (!inGate) {
                const w = box(4, 0.5, 1.2, 0x3a3a2a, { roughness: 0.95 });
                w.position.set(x, 0.25, 0);
                w.userData.isMapObject = true;
                this.scene.add(w);
                this.colliders.push({ type: 'box', position: new THREE.Vector3(x, 0.25, 0), size: new THREE.Vector3(4, 0.5, 1.2), walkable: false });
            }
        }

        // Gate structures
        for (const gp of gatePositions) {
            const gatePostGeo = new THREE.CylinderGeometry(0.12, 0.15, 3.5, 6);
            const posts = [];

            if (gp.axis === 'z') {
                for (let dx of [-2, 2]) {
                    const p = new THREE.Mesh(gatePostGeo, gateMat);
                    p.position.set(gp.x + dx, 1.75, gp.z);
                    p.castShadow = true; posts.push(p);
                }
                const beam = box(4.5, 0.2, 0.5, C.wood, { roughness: 0.8 });
                beam.position.set(gp.x, 3.5, gp.z);
                beam.castShadow = true; beam.userData.isMapObject = true; this.scene.add(beam);
            } else {
                for (let dz of [-2, 2]) {
                    const p = new THREE.Mesh(gatePostGeo, gateMat);
                    p.position.set(gp.x, 1.75, gp.z + dz);
                    p.castShadow = true; posts.push(p);
                }
                const beam = box(0.5, 0.2, 4.5, C.wood, { roughness: 0.8 });
                beam.position.set(gp.x, 3.5, gp.z);
                beam.castShadow = true; beam.userData.isMapObject = true; this.scene.add(beam);
            }

            posts.forEach(p => { p.userData.isMapObject = true; p.userData.isGatePost = true; this.scene.add(p); });

            const lightColor = gp.x < -10 ? 0xcc8844 : gp.x > 10 ? 0x44aacc : gp.z < -10 ? 0xcc4444 : 0x44cc44;
            const gateLight = this._createPointLight(lightColor, 0.5, 8);
            gateLight.position.set(gp.x, 4, gp.z);
            this.scene.add(gateLight);
            this.animatedObjects.push({ type: 'glow', light: gateLight, baseIntensity: 0.5 });
        }
    }

    async _buildTerrainHills() {
        const hillMat = mat(C.grass, { roughness: 1.0 });
        const hillData = [];

        for (let i = 0; i < 50; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 40 + Math.random() * (this.arenaRadius - 65);
            const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
            const h = this.noise.fbm(x * 0.008, z * 0.008, 3) * 4;
            if (Math.abs(h) < 0.3) continue;

            hillData.push({ x, y: Math.abs(h) * 0.4, z, scale: Math.max(0.6, Math.abs(h) * 0.6), rotY: Math.random() * Math.PI });
        }

        if (hillData.length > 0) {
            const geo = new THREE.IcosahedronGeometry(1, 2);
            const inst = new THREE.InstancedMesh(geo, hillMat, hillData.length);
            const dummy = new THREE.Object3D();
            for (let i = 0; i < hillData.length; i++) {
                const d = hillData[i];
                dummy.position.set(d.x, d.y, d.z);
                dummy.rotation.set(0, d.rotY, 0);
                dummy.scale.set(d.scale * 1.3, d.scale * 0.6, d.scale * 1.3);
                dummy.updateMatrix();
                inst.setMatrixAt(i, dummy.matrix);
            }
            inst.instanceMatrix.needsUpdate = true;
            inst.receiveShadow = true; inst.castShadow = true;
            inst.userData.isTerrain = true; inst.userData.isMapObject = true;
            this.scene.add(inst);
        }
    }

    // ===================== FORCEFIELD =====================
    async _buildForcefield() {
        const ffMat = mat(C.blue, { transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide });
        const ffGeo = new THREE.CylinderGeometry(this.arenaRadius, this.arenaRadius, 12, 64, 1, true);
        const forcefield = new THREE.Mesh(ffGeo, ffMat);
        forcefield.position.y = 6;
        forcefield.userData.isArena = true; forcefield.userData.isForcefield = true;
        forcefield.userData.isMapObject = true;
        this.scene.add(forcefield);

        this.animatedObjects.push({ type: 'forcefield', mesh: forcefield, material: ffMat, baseOpacity: 0.15 });

        const ringMat = mat(C.blue, { transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const topRing = new THREE.Mesh(new THREE.TorusGeometry(this.arenaRadius, 0.3, 8, 64), ringMat);
        topRing.position.y = 12; topRing.rotation.x = Math.PI / 2;
        topRing.userData.isMapObject = true; this.scene.add(topRing);

        const bottomRing = new THREE.Mesh(new THREE.TorusGeometry(this.arenaRadius, 0.3, 8, 64), ringMat);
        bottomRing.position.y = 0; bottomRing.rotation.x = Math.PI / 2;
        bottomRing.userData.isMapObject = true; this.scene.add(bottomRing);

        for (let i = 0; i < 48; i++) {
            const a = (i / 48) * Math.PI * 2;
            const pts = [
                new THREE.Vector3(Math.cos(a) * this.arenaRadius, 0, Math.sin(a) * this.arenaRadius),
                new THREE.Vector3(Math.cos(a) * this.arenaRadius, 12, Math.sin(a) * this.arenaRadius)
            ];
            const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineBasicMaterial({ color: C.blue, transparent: true, opacity: 0.3 })
            );
            line.userData.isMapObject = true;
            this.scene.add(line);
        }
    }

    // ===================== CORNUCOPIA =====================
    async _buildCornucopia() {
        cornucopia(this.scene, this);
        await _yield();
    }

    // ===================== INNER RING =====================
    async _buildInnerRing() {
        // 8 outposts
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2, r = 110;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;

            if (i % 2 === 0) {
                stoneOutpost(x, z, a, this.scene, this);
            } else {
                woodenBarricade(x, z, a, this.scene, this);
            }

            const glowLight = this._createPointLight(0xffcc44, 0.5, 10);
            glowLight.position.set(x, 3, z);
            this.scene.add(glowLight);
            await _yield();
        }

        // Scouting mounds
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
            const r = 130;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;

            const moundGeo = new THREE.ConeGeometry(5, 6, 6);
            const mound = new THREE.Mesh(moundGeo, mat(C.stone, { roughness: 0.9 }));
            mound.position.set(x, 3, z); mound.castShadow = true;
            mound.userData.isMapObject = true; mound.userData.isTerrain = true;
            this.scene.add(mound);

            const platGeo = new THREE.CylinderGeometry(3, 3, 0.2, 8);
            const plat = new THREE.Mesh(platGeo, mat(C.stone, { roughness: 0.8 }));
            plat.position.set(x, 6.1, z); plat.receiveShadow = true;
            plat.userData.isMapObject = true; this.scene.add(plat);
            await _yield();
        }

        // Cover rocks
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 45 + Math.random() * 160;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;

            const rockGeo = new THREE.DodecahedronGeometry(0.8 + Math.random() * 1.2, 0);
            const rock = new THREE.Mesh(rockGeo, mat(C.stone, { roughness: 0.9, metalness: 0.05 }));
            rock.position.set(x, 0.5, z);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.scale.y = 0.6 + Math.random() * 0.4;
            rock.castShadow = true; rock.receiveShadow = true;
            rock.userData.isMapObject = true; rock.userData.isCover = true;
            this.scene.add(rock);
            this.colliders.push({ type: 'box', position: new THREE.Vector3(x, 0.5, z), size: new THREE.Vector3(1.6, 1.6, 1.6), walkable: false });
        }
    }

    // ===================== BIOME PATHS =====================
    async _buildBiomePaths() {
        // Connect biome zones with paths
        const paths = [
            [-80, 80, 80, 80], // citadel to crystal
            [-80, 80, -80, -80], // citadel to wastes
            [-80, -80, 80, -80], // wastes to forest
            [80, 80, 80, -80], // crystal to forest
        ];
        for (const [x1, z1, x2, z2] of paths) {
            biomePath(x1, z1, x2, z2, this.scene);
            await _yield();
        }
    }

    // ===================== RUINED CITADEL =====================
    async _buildRuinedCitadel() {
        ruinedCitadel(-80, 80, this.scene, this);
        await _yield();
    }

    // ===================== CRYSTAL GROTTO =====================
    async _buildCrystalGrotto() {
        crystalGrotto(80, 80, this.scene, this);
        await _yield();
    }

    // ===================== BURNING WASTES =====================
    async _buildBurningWastes() {
        // Lava pools
        for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 40;
            const x = -80 + Math.cos(a) * r, z = -80 + Math.sin(a) * r;
            lavaPool(x, z, 2 + Math.random() * 3, this.scene, this);
            await _yield();
        }

        // Bunkers
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            const r = 60;
            const x = -80 + Math.cos(a) * r, z = -80 + Math.sin(a) * r;
            wasteStructure(x, z, 'bunker', this.scene, this);
            await _yield();
        }

        // Watchtowers
        for (let i = 0; i < 2; i++) {
            const a = (i / 2) * Math.PI * 2 + Math.PI / 6;
            const r = 70;
            const x = -80 + Math.cos(a) * r, z = -80 + Math.sin(a) * r;
            wasteStructure(x, z, 'watchtower', this.scene, this);
            await _yield();
        }

        // Obsidian walls
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 20 + Math.random() * 50;
            const x = -80 + Math.cos(a) * r, z = -80 + Math.sin(a) * r;
            const h = 2 + Math.random() * 4;
            const wall = box(2 + Math.random() * 3, h, 0.8, C.obsidian, { roughness: 0.5, metalness: 0.5 });
            wall.position.set(x, h / 2, z);
            wall.rotation.y = Math.random() * Math.PI;
            wall.userData.isMapObject = true; this.scene.add(wall);
        }

        // Smoke clouds
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 40;
            const x = -80 + Math.cos(a) * r, z = -80 + Math.sin(a) * r;
            smokeCloud(x, 6, z, this.scene, this);
        }
    }

    // ===================== LUMINOUS FOREST =====================
    async _buildLuminousForest() {
        // Forest ponds
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 20 + Math.random() * 40;
            const x = 80 + Math.cos(a) * r, z = -80 + Math.sin(a) * r;
            forestPond(x, z, 2 + Math.random() * 3, this.scene);
            await _yield();
        }

        // Glowing mushrooms
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 15 + Math.random() * 50;
            const x = 80 + Math.cos(a) * r, z = -80 + Math.sin(a) * r;
            const mh = 0.3 + Math.random() * 0.5;
            const stem = cyl(0.04, 0.05, mh, 5, C.white, { roughness: 0.8 });
            stem.position.set(x, mh / 2, z);
            stem.userData.isMapObject = true; this.scene.add(stem);

            const cap = new THREE.Mesh(
                new THREE.SphereGeometry(0.2 + Math.random() * 0.3, 6, 4),
                mat(C.cyan, { roughness: 0.3, emissive: C.cyan, emissiveIntensity: 0.4, transparent: true, opacity: 0.7 })
            );
            cap.position.set(x, mh + 0.2, z);
            cap.userData.isMapObject = true; this.scene.add(cap);
        }
    }

    // ===================== BRIDGES =====================
    async _buildBridges() {
        // Bridges across zone dividers
        const bridges = [
            { x: 0, z: -25, len: 6, rot: 0 },
            { x: 0, z: 25, len: 6, rot: 0 },
            { x: -25, z: 0, len: 6, rot: Math.PI / 2 },
            { x: 25, z: 0, len: 6, rot: Math.PI / 2 },
        ];
        for (const b of bridges) {
            bridge(b.x, b.z, b.len, b.rot, this.scene);
        }
    }

    // ===================== OUTER OUTPOSTS =====================
    async _buildOuterOutposts() {
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const r = 150 + Math.random() * 20;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            wasteStructure(x, z, i % 2 === 0 ? 'bunker' : 'watchtower', this.scene, this);
            await _yield();
        }
    }

    // ===================== HAZARDS =====================
    async _buildHazardZones() {
        // Explosive barrel zones
        for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 40 + Math.random() * 120;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;

            // Cluster of explosive barrels
            for (let j = 0; j < 3; j++) {
                const bx = x + (Math.random() - 0.5) * 2;
                const bz = z + (Math.random() - 0.5) * 2;
                barrel(bx, 0, bz, this.scene);
                this.hazards.push({ type: 'explosiveBarrel', position: new THREE.Vector3(bx, 0.5, bz), radius: 5, damage: 40 });
            }
            await _yield();
        }
    }

    // ===================== LOOT CLUSTERS =====================
    async _buildLootClusters() {
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 150;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            crate(x, 0, z, this.scene, 0.8 + Math.random() * 0.4);
            await _yield();
        }
    }

    // ===================== FIRE PITS =====================
    async _buildFirePits() {
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 40 + Math.random() * 120;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            campfire(x, 0, z, this.scene);
        }
    }

    // ===================== PARTICLE SYSTEMS =====================
    async _buildParticleSystems() {
        // No-op: particles handled by Environment
    }

    // ===================== DECORATIONS =====================
    async _buildDecorations() {
        // Barrels scattered
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 150;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            barrel(x, 0, z, this.scene);
        }

        // Crates
        for (let i = 0; i < 25; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 20 + Math.random() * 140;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            crate(x, 0, z, this.scene, 0.6 + Math.random() * 0.6);
        }

        // Fence posts along paths
        for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 50 + Math.random() * 100;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            fencePost(x, 0, z, this.scene);
        }

        // Road markers
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const r = 60 + Math.random() * 80;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            roadMarker(x, 0, z, this.scene);
        }
    }

    // ===================== BIOME TREES =====================
    async _buildBiomeTrees() {
        // Citadel: ruined trees
        for (let i = 0; i < 25; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 10 + Math.random() * 50;
            const x = -80 + Math.cos(a) * r, z = 80 + Math.sin(a) * r;
            tree(x, 0, z, this.scene, 'ruined');
        }

        // Crystal: crystal trees
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 10 + Math.random() * 50;
            const x = 80 + Math.cos(a) * r, z = 80 + Math.sin(a) * r;
            tree(x, 0, z, this.scene, 'crystal');
        }

        // Forest: normal trees
        for (let i = 0; i < 60; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 15 + Math.random() * 55;
            const x = 80 + Math.cos(a) * r, z = -80 + Math.sin(a) * r;
            tree(x, 0, z, this.scene, 'normal');
        }

        // Wastes: burnt trees
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 15 + Math.random() * 45;
            const x = -80 + Math.cos(a) * r, z = -80 + Math.sin(a) * r;
            const g = new THREE.Group();
            const trunk = cyl(0.15, 0.2, 3, 5, C.obsidian, { roughness: 0.9 });
            trunk.position.y = 1.5; trunk.userData.isMapObject = true; g.add(trunk);
            const stump = new THREE.Mesh(
                new THREE.ConeGeometry(0.8, 1.5, 5),
                mat(C.obsidian, { roughness: 0.8 })
            );
            stump.position.y = 3.5; stump.userData.isMapObject = true; g.add(stump);
            g.position.set(x, 0, z);
            this.scene.add(g);
        }
    }

    // ===================== TRAPS =====================
    async _buildTraps() {
        // Spike traps
        for (let i = 0; i < 15; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 130;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            spikeTrap(x, z, this.scene);
            await _yield();
        }

        // Bear traps
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 130;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            bearTrap(x, z, this.scene);
            await _yield();
        }
    }

    // ===================== FOG ZONES =====================
    async _buildFogZones() {
        const phases = [
            { radius: 160, damage: 0.3, color: 0x888888 },
            { radius: 120, damage: 0.6, color: 0x666666 },
            { radius: 80, damage: 1.0, color: 0x444444 },
            { radius: 40, damage: 2.0, color: 0x222222 }
        ];
        for (let i = 1; i < phases.length; i++) {
            this.fogZones.push({
                position: new THREE.Vector3(0, 0, 0),
                radius: phases[i].radius,
                damage: phases[i].damage,
                color: phases[i].color
            });
        }
    }

    // ===================== RADIATION ZONES =====================
    async _buildRadiationZones() {
        const radPositions = [
            [-80, 80], [80, 80], [-80, -80], [80, -80]
        ];
        for (const [rx, rz] of radPositions) {
            radCloud(rx, 8, rz, 12, 0.5, this.scene); // high
            radCloud(rx + 30, 6, rz + 20, 10, 0.3, this.scene); // medium
            radCloud(rx - 20, 4, rz - 15, 8, 0.1, this.scene); // low
            await _yield();
        }
    }

    // ===================== LOOT DATA =====================
    async _buildLootData() {
        this.lootData = [];
        const lootTypes = ['weapon', 'ammo', 'health', 'armor', 'scope', 'magazine'];
        for (let i = 0; i < 80; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 20 + Math.random() * 150;
            this.lootData.push({
                x: Math.cos(a) * r,
                z: Math.sin(a) * r,
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

    updatePropVisibility(playerPos) {
        this._cullPointLights(playerPos);
    }

    // ===================== GAMEPLAY INTERFACES =====================
    getFloorTiles() {
        const tiles = [];
        const r = this.spawnCourtyardRadius - 10;
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2, dist = Math.random() * r;
            tiles.push({ x: Math.cos(angle) * dist, z: Math.sin(angle) * dist });
        }
        return tiles;
    }

    getHouseSpots() { return []; }
    getHangarSpots() { return []; }
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
        const zoneRadius = this.spawnCourtyardRadius || 220;
        const shrinkAmount = [0, 40, 70, 100][phase] || 0;
        this.zoneTargetRadius = Math.max(30, zoneRadius - shrinkAmount);
        return this.zoneTargetRadius;
    }

    getActiveSafeRadius() { return this.zoneTargetRadius || this.spawnCourtyardRadius || 220; }

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
        return dist < (this.arenaRadius || 220);
    }

    raycastGroundY(x, z) { return 0; }

    update(delta, playerPos) {
        if (playerPos) { this.updatePropVisibility(playerPos); }
        this.updateZoneAnimations(delta);
    }

    setNightEmissive(isNight) {
        this.scene.traverse(obj => {
            if (obj.isMesh && obj.userData.isFloor && obj.material) {
                const mat2 = Array.isArray(obj.material) ? obj.material[0] : obj.material;
                if (mat2 && mat2.emissiveIntensity !== undefined) {
                    mat2.emissiveIntensity = isNight ? 0.3 : 0;
                    if (isNight && !mat2.emissive) mat2.emissive = new THREE.Color(0x111122);
                }
            }
        });
    }

    getTerrainMaterialAt(x, z) {
        const dist = Math.sqrt(x * x + z * z);
        if (dist < 40) return 'spawn';
        if (x < -40 && z < -40) return 'waste';
        if (x > 40 && z > 40) return 'crystal';
        if (x < -40 && z > 40) return 'forest';
        return 'arena';
    }

    setWetTerrain(wet) {}
    setRainPuddles(active, center) {}
    getOneWayGates() { return []; }
}
