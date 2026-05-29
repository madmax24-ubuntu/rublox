import * as THREE from 'three';

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.7, metalness: opts.metal ?? 0, transparent: opts.transparent ?? false, opacity: opts.opacity ?? 1, emissive: opts.emissive ?? 0, emissiveIntensity: opts.emissiveIntensity ?? 0 });

const BOX = (w = 1, h = 1, d = 1) => new THREE.BoxGeometry(w, h, d);
const CYL = (rtop = 1, rbot = 1, seg = 8) => new THREE.CylinderGeometry(rtop, rbot, 1, seg);
const CONE = (r = 1, seg = 8) => new THREE.ConeGeometry(r, 1, seg);
const SPH = (r = 1, seg = 8) => new THREE.SphereGeometry(r, seg, seg);
const PLANE = (w = 1, h = 1) => new THREE.PlaneGeometry(w, h);
const TORUS = (r = 1, rad = 0.1, seg = 8) => new THREE.TorusGeometry(r, rad, seg, 8);

const apply = (geo, y = 0) => { const g = geo.clone(); g.translate(0, y, 0); return g; };

const addBox = (g, w, h, d, x, y, z, material) => { const m = new THREE.Mesh(BOX(w, h, d), material); m.position.set(x, y, z); g.add(m); return m; };
const addCyl = (g, rtop, rbot, h, x, y, z, material, seg = 8) => { const m = new THREE.Mesh(CYL(rtop, rbot, seg), material); m.position.set(x, y, z); m.scale.y = h; g.add(m); return m; };
const addCone = (g, r, h, x, y, z, material, seg = 8) => { const m = new THREE.Mesh(CONE(r, seg), material); m.position.set(x, y, z); m.scale.y = h; g.add(m); return m; };
const addSph = (g, r, x, y, z, material) => { const m = new THREE.Mesh(SPH(r), material); m.position.set(x, y, z); m.scale.y = 0.7; g.add(m); return m; };
const addPlane = (g, w, h, x, y, z, material) => { const m = new THREE.Mesh(PLANE(w, h), material); m.position.set(x, y, z); g.add(m); return m; };

function buildMap(scene) {
    const zones = {
        terrain: new THREE.Group(),
        arena_wall: new THREE.Group(),
        cornucopia: new THREE.Group(),
        mountains: new THREE.Group(),
        forest: new THREE.Group(),
        swamp: new THREE.Group(),
        farm: new THREE.Group(),
        landmarks: new THREE.Group(),
        details: new THREE.Group(),
    };
    for (const z of Object.values(zones)) scene.add(z);

    const colors = {
        grass: 0x5B8C3E, wall: 0xCC4444, gold: 0xFFD700, concrete: 0x888888, metal: 0x666666,
        darkStone: 0x4A4A4A, wood: 0x8B6914, trunk: 0x6B4226, leaves: 0x2D8C2D,
        swampWater: 0x2F4F2F, rust: 0x8B4513, barn: 0xCC3333, barnRoof: 0xFFFFFF,
        silo: 0xC0C0C0, temple: 0xD4C4A0, labGlass: 0x4488AA, labGlow: 0x00FF88,
        lighthouse: 0xEEEEEE, lighthouseLight: 0xFFFF00, bus: 0xFFDD00,
        warning: 0xFFFF00, emissive: 0x444444, hanging: 0x333333, charred: 0x2A2A2A,
        hay: 0xDAA520, barbedWire: 0x555555, door: 0x4A3728, platform: 0x777777,
        screen: 0x22AAFF, radar: 0x999999, marker: 0xFFFF00,
    };

    const mats = {};
    for (const [k, v] of Object.entries(colors)) mats[k] = mat(v);
    mats.grass = mat(colors.grass, { roughness: 1 });
    mats.swampWater = mat(colors.swampWater, { transparent: true, opacity: 0.4 });
    mats.labGlass = mat(colors.labGlass, { transparent: true, opacity: 0.6, roughness: 0.1, metal: 0.3 });
    mats.gold = mat(colors.gold, { roughness: 0.2, metal: 0.9 });
    mats.lighthouseLight = mat(colors.lighthouseLight, { emissive: colors.lighthouseLight, emissiveIntensity: 2 });
    mats.screen = mat(colors.screen, { emissive: colors.screen, emissiveIntensity: 0.8 });
    mats.screen2 = mat(colors.emissive, { emissive: colors.emissive, emissiveIntensity: 0.5 });

    // ===== TERRAIN =====
    const terrainGeo = new THREE.CircleGeometry(200, 32);
    const terrain = new THREE.Mesh(terrainGeo, mats.grass);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = 0;
    zones.terrain.add(terrain);

    // ===== ARENA WALL =====
    const wallGroup = zones.arena_wall;
    const wallMat = mat(colors.wall, { transparent: true, opacity: 0.35 });
    const wallGeo = CYL(200, 200, 15, 48);
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = 7.5;
    wallGroup.add(wall);

    // ===== CORNUCOPIA =====
    const corn = zones.cornucopia;
    const cornGeo = new THREE.CircleGeometry(15, 24);
    const cornPlane = new THREE.Mesh(cornGeo, mat(0x6B9B4E, { roughness: 1 }));
    cornPlane.rotation.x = -Math.PI / 2;
    cornPlane.position.y = 0.01;
    corn.add(cornPlane);

    // Golden horn
    const hornGroup = new THREE.Group();
    const hornBase = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.3, 6, 8), mats.gold);
    hornBase.position.y = 3;
    hornGroup.add(hornBase);
    const hornTop = new THREE.Mesh(new THREE.ConeGeometry(0.3, 4, 8), mats.gold);
    hornTop.position.y = 8;
    hornGroup.add(hornTop);
    const hornBend = new THREE.Mesh(new THREE.TorusGeometry(2, 0.4, 8, 8, Math.PI * 1.5), mats.gold);
    hornBend.position.set(1, 4, 0);
    hornBend.rotation.z = Math.PI / 2;
    hornGroup.add(hornBend);
    hornGroup.position.y = 0;
    corn.add(hornGroup);

    // 24 spawn platforms
    for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2;
        const px = Math.cos(angle) * 12;
        const pz = Math.sin(angle) * 12;
        const pad = new THREE.Mesh(BOX(1.5, 0.3, 1.5), mats.platform);
        pad.position.set(px, 0.15, pz);
        corn.add(pad);
    }

    // Scattered boxes and rocks at the edge of cornucopia (14-18m)
    for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 14 + Math.random() * 4;
        if (Math.random() < 0.5) {
            const box = new THREE.Mesh(BOX(0.8, 1, 0.8), mats.concrete);
            box.position.set(Math.cos(angle) * r, 0.5, Math.sin(angle) * r);
            box.rotation.set(Math.random() * 0.3, Math.random(), Math.random() * 0.3);
            corn.add(box);
        } else {
            const rock = new THREE.Mesh(SPH(0.8), mat(0x6B6B6B, { roughness: 0.9 }));
            rock.position.set(Math.cos(angle) * r, 0.4, Math.sin(angle) * r);
            rock.scale.set(1 + Math.random(), 0.6, 1 + Math.random());
            corn.add(rock);
        }
    }

    // Warning signs around cornucopia
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const r = 13;
        const pole = new THREE.Mesh(CYL(0.05, 0.05, 1.5, 6), mats.barbedWire);
        pole.position.set(Math.cos(angle) * r, 0.75, Math.sin(angle) * r);
        corn.add(pole);
        const sign = new THREE.Mesh(BOX(0.6, 0.4, 0.05), mats.warning);
        sign.position.set(Math.cos(angle) * r, 1.3, Math.sin(angle) * r);
        sign.rotation.y = angle + Math.PI / 2;
        corn.add(sign);
    }

    // ===== MOUNTAINS (North: z negative) =====
    const mtn = zones.mountains;
    const stoneMats = [mats.concrete.clone(), mat(0x6B6B6B, { roughness: 0.9 }), mat(0x4A4A4A, { roughness: 0.95 })];
    for (let i = 0; i < 60; i++) {
        const angle = -Math.PI * 0.75 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 30 + Math.random() * 140;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const h = 2 + Math.random() * 10;
        const w = 1.5 + Math.random() * 3;
        const d = 1.5 + Math.random() * 3;
        const rockMat = stoneMats[Math.floor(Math.random() * stoneMats.length)];
        const rock = new THREE.Mesh(BOX(w, h, d), rockMat);
        rock.position.set(x, h / 2, z);
        rock.rotation.set(Math.random() * 0.2, Math.random() * Math.PI, Math.random() * 0.2);
        mtn.add(rock);
    }

    // Cliffs and crags
    for (let i = 0; i < 20; i++) {
        const angle = -Math.PI * 0.7 + (Math.random() - 0.5) * Math.PI * 0.4;
        const r = 60 + Math.random() * 120;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const h = 4 + Math.random() * 8;
        const cliff = new THREE.Mesh(BOX(2 + Math.random() * 4, h, 2 + Math.random() * 2), mat(0x5A5A5A, { roughness: 0.9 }));
        cliff.position.set(x, h / 2, z);
        cliff.rotation.z = (Math.random() - 0.5) * 0.15;
        mtn.add(cliff);
    }

    // Caves (holes inside mountain mass)
    for (let i = 0; i < 8; i++) {
        const angle = -Math.PI * 0.75 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 50 + Math.random() * 100;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const caveHole = new THREE.Mesh(BOX(2, 3, 0.2), mat(0x1A1A1A, { roughness: 1 }));
        caveHole.position.set(x, 2.5, z);
        caveHole.rotation.y = angle + Math.PI / 2;
        mtn.add(caveHole);
    }

    // Cave tunnels (small boxes behind the entrance)
    for (let i = 0; i < 6; i++) {
        const angle = -Math.PI * 0.75 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 55 + Math.random() * 90;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const tunnel = new THREE.Mesh(BOX(2, 2.5, 6), mat(0x1F1F1F, { roughness: 1 }));
        tunnel.position.set(x + Math.cos(angle) * 3, 2.2, z + Math.sin(angle) * 3);
        tunnel.rotation.y = angle + Math.PI / 2;
        mtn.add(tunnel);
    }

    // Mountain arches
    for (let i = 0; i < 5; i++) {
        const angle = -Math.PI * 0.75 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 60 + Math.random() * 100;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const pillar1 = new THREE.Mesh(BOX(0.6, 4, 0.6), mat(0x6B6B6B, { roughness: 0.9 }));
        pillar1.position.set(x - 1.5, 2, z);
        mtn.add(pillar1);
        const pillar2 = new THREE.Mesh(BOX(0.6, 4, 0.6), mat(0x6B6B6B, { roughness: 0.9 }));
        pillar2.position.set(x + 1.5, 2, z);
        mtn.add(pillar2);
        const arch = new THREE.Mesh(BOX(3.6, 0.5, 0.6), mat(0x6B6B6B, { roughness: 0.9 }));
        arch.position.set(x, 4.2, z);
        arch.rotation.y = angle;
        mtn.add(arch);
    }

    // ===== FOREST (East: x positive) =====
    const forest = zones.forest;

    // Trees (70 trees)
    for (let i = 0; i < 70; i++) {
        const angle = Math.PI * 0.2 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 30 + Math.random() * 140;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const treeGroup = new THREE.Group();
        const trunkH = 6 + Math.random() * 4;
        const trunk = new THREE.Mesh(CYL(0.3, 0.35, trunkH, 8), mats.trunk);
        trunk.position.y = trunkH / 2;
        treeGroup.add(trunk);
        const canopyH = 3 + Math.random() * 2;
        const canopy = new THREE.Mesh(CONE(1.5 + Math.random(), canopyH, 8), mats.leaves);
        canopy.position.y = trunkH + canopyH / 2 - 0.5;
        treeGroup.add(canopy);
        treeGroup.position.set(x, 0, z);
        forest.add(treeGroup);
    }

    // Watchtower
    const towerGroup = new THREE.Group();
    for (let i = 0; i < 4; i++) {
        const pillar = new THREE.Mesh(CYL(0.2, 0.2, 15, 8), mats.wood);
        const px = (i < 2 ? -1 : 1) * 2;
        const pz = (i % 2 === 0 ? -1 : 1) * 2;
        pillar.position.set(px, 7.5, pz);
        towerGroup.add(pillar);
    }
    const towerPlatform = new THREE.Mesh(BOX(5, 0.3, 5), mats.wood);
    towerPlatform.position.y = 15;
    towerGroup.add(towerPlatform);
    // Railing
    for (let i = 0; i < 4; i++) {
        const rail = new THREE.Mesh(CYL(0.05, 0.05, 1.2, 6), mats.wood);
        const rx = (i < 2 ? -2.2 : 2.2);
        const rz = (i % 2 === 0 ? -2.2 : 2.2);
        rail.position.set(rx, 15.7, rz);
        towerGroup.add(rail);
    }
    towerGroup.position.set(100, 0, 80);
    forest.add(towerGroup);

    // Fallen logs
    for (let i = 0; i < 15; i++) {
        const angle = Math.PI * 0.2 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 40 + Math.random() * 120;
        const log = new THREE.Mesh(CYL(0.2, 0.25, 3 + Math.random() * 3, 8), mats.trunk);
        log.position.set(Math.cos(angle) * r, 0.3, Math.sin(angle) * r);
        log.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
        forest.add(log);
    }

    // Tree stumps
    for (let i = 0; i < 20; i++) {
        const angle = Math.PI * 0.2 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 30 + Math.random() * 130;
        const stump = new THREE.Mesh(CYL(0.4, 0.5, 0.5, 8), mats.trunk);
        stump.position.set(Math.cos(angle) * r, 0.25, Math.sin(angle) * r);
        forest.add(stump);
    }

    // Undergrowth bushes
    for (let i = 0; i < 50; i++) {
        const angle = Math.PI * 0.2 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 30 + Math.random() * 130;
        const bush = new THREE.Mesh(SPH(0.6 + Math.random() * 0.5), mats.leaves);
        bush.position.set(Math.cos(angle) * r, 0.4, Math.sin(angle) * r);
        bush.scale.y = 0.6;
        forest.add(bush);
    }

    // ===== SWAMP (South: z positive) =====
    const swamp = zones.swamp;

    // Swamp water
    const swampGeo = new THREE.CircleGeometry(130, 24);
    const swampWater = new THREE.Mesh(swampGeo, mats.swampWater);
    swampWater.rotation.x = -Math.PI / 2;
    swampWater.position.set(0, 0.1, 80);
    swamp.add(swampWater);

    // Swamp mounds (green half-spheres)
    for (let i = 0; i < 30; i++) {
        const angle = Math.PI * 0.25 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 20 + Math.random() * 100;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const r2 = 1 + Math.random() * 1.5;
        const mound = new THREE.Mesh(SPH(r2), mat(0x3A6B2A, { roughness: 1 }));
        mound.position.set(x, r2 * 0.5 - 0.2, z);
        mound.scale.y = 0.6;
        swamp.add(mound);
    }

    // Ruined concrete walls
    for (let i = 0; i < 15; i++) {
        const angle = Math.PI * 0.2 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 30 + Math.random() * 100;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const wallSeg = new THREE.Mesh(BOX(2 + Math.random() * 3, 1 + Math.random() * 2, 0.4), mats.concrete);
        wallSeg.position.set(x, 0.5 + Math.random(), z);
        wallSeg.rotation.set((Math.random() - 0.5) * 0.3, Math.random(), (Math.random() - 0.5) * 0.3);
        swamp.add(wallSeg);
    }

    // Car rust hulls
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI * 0.25 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 40 + Math.random() * 80;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const carBody = new THREE.Mesh(BOX(4, 1.5, 2), mat(colors.rust, { roughness: 0.9, metal: 0.4 }));
        carBody.position.set(x, 0.75, z);
        carBody.rotation.y = Math.random() * Math.PI;
        swamp.add(carBody);
        const carTop = new THREE.Mesh(BOX(2.5, 1, 1.8), mat(colors.rust, { roughness: 0.9, metal: 0.4 }));
        carTop.position.set(x - 0.5, 1.8, z);
        carTop.rotation.y = Math.random() * Math.PI;
        swamp.add(carTop);
    }

    // Broken boards
    for (let i = 0; i < 10; i++) {
        const angle = Math.PI * 0.25 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 50 + Math.random() * 60;
        const board = new THREE.Mesh(BOX(1.5, 0.05, 0.3), mat(0x7B5B3A, { roughness: 1 }));
        board.position.set(Math.cos(angle) * r, 0.15, Math.sin(angle) * r);
        board.rotation.y = Math.random() * Math.PI;
        board.rotation.z = (Math.random() - 0.5) * 0.3;
        swamp.add(board);
    }

    // Broken bridge
    const bridgeGroup = new THREE.Group();
    for (let i = 0; i < 4; i++) {
        const plank = new THREE.Mesh(BOX(3, 0.1, 0.6), mat(0x6B4B2A, { roughness: 1 }));
        plank.position.set(i * 0.8 - 1.5, 0.3, 0);
        plank.rotation.z = (Math.random() - 0.5) * 0.2;
        bridgeGroup.add(plank);
    }
    bridgeGroup.position.set(60, 0.1, 120);
    swamp.add(bridgeGroup);

    // ===== FARM (West: x negative) =====
    const farm = zones.farm;

    // Wheat field (many thin rectangles)
    for (let i = 0; i < 2000; i++) {
        const angle = Math.PI * 0.75 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 20 + Math.random() * 120;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        if (x > -20) continue; // Keep in western sector
        const stalk = new THREE.Mesh(BOX(0.15, 1.2, 0.15), mat(0xC8B030, { roughness: 1 }));
        stalk.position.set(x, 0.6, z);
        stalk.rotation.z = (Math.random() - 0.5) * 0.2;
        farm.add(stalk);
    }

    // Barn
    const barnGroup = new THREE.Group();
    // Main body
    const barnBody = new THREE.Mesh(BOX(12, 6, 8), mats.barn);
    barnBody.position.set(0, 3, 0);
    barnGroup.add(barnBody);
    // Roof (triangular prism)
    const roofGeo = new THREE.BoxGeometry(8.5, 0.2, 13);
    const roof = new THREE.Mesh(roofGeo, mats.barnRoof);
    roof.position.set(0, 6.1, 0);
    roof.rotation.z = Math.atan2(6, 6) * 0.5;
    // Simplified: just a triangular prism shape
    const roofTri = new THREE.Mesh(new THREE.BoxGeometry(7, 0.15, 9), mats.barnRoof);
    roofTri.position.set(0, 8, 0);
    roofTri.rotation.z = 0;
    barnGroup.add(roofTri);
    // Door
    const barnDoor = new THREE.Mesh(BOX(1.5, 3, 0.1), mats.door);
    barnDoor.position.set(0, 1.5, 4.05);
    barnGroup.add(barnDoor);
    // Hay platform inside
    const hayPlatform = new THREE.Mesh(BOX(6, 0.2, 5), mats.hay);
    hayPlatform.position.set(0, 3.5, 0);
    barnGroup.add(hayPlatform);
    barnGroup.position.set(-100, 0, 50);
    farm.add(barnGroup);

    // Silo
    const siloGroup = new THREE.Group();
    const silo = new THREE.Mesh(CYL(2, 2, 12, 12), mats.silo);
    silo.position.y = 6;
    siloGroup.add(silo);
    const siloRoof = new THREE.Mesh(CONE(2.2, 2, 12), mats.silo);
    siloRoof.position.y = 13;
    siloGroup.add(siloRoof);
    siloGroup.position.set(-80, 0, 30);
    farm.add(siloGroup);

    // Hay stacks
    for (let i = 0; i < 12; i++) {
        const angle = Math.PI * 0.75 + (Math.random() - 0.5) * Math.PI * 0.4;
        const r = 30 + Math.random() * 80;
        const hayStack = new THREE.Mesh(CYL(0.8, 0.8, 2, 8), mats.hay);
        hayStack.position.set(Math.cos(angle) * r, 1, Math.sin(angle) * r);
        farm.add(hayStack);
    }

    // Fence posts
    for (let i = 0; i < 40; i++) {
        const fencePost = new THREE.Mesh(CYL(0.08, 0.08, 1.5, 6), mats.wood);
        fencePost.position.set(-60 + i * 1.5, 0.75, -40 + Math.floor(i / 8) * 15);
        farm.add(fencePost);
    }

    // Underground bunker entrance
    const bunkerGroup = new THREE.Group();
    // Hill
    const hill = new THREE.Mesh(SPH(8, 8, 8), mat(0x4A7B3A, { roughness: 1 }));
    hill.position.y = 2;
    hill.scale.y = 0.5;
    bunkerGroup.add(hill);
    // Door opening
    const bunkerDoor = new THREE.Mesh(BOX(1.5, 2.8, 0.3), mat(0x2A2A2A, { roughness: 1 }));
    bunkerDoor.position.set(0, 1.5, 6);
    bunkerGroup.add(bunkerDoor);
    // Stairs down
    for (let i = 0; i < 8; i++) {
        const step = new THREE.Mesh(BOX(1.5, 0.2, 0.4), mats.concrete);
        step.position.set(0, 1.5 - i * 0.2, 7.5 + i * 0.4);
        bunkerGroup.add(step);
    }
    bunkerGroup.position.set(-140, 0, -30);
    farm.add(bunkerGroup);

    // ===== LANDMARKS =====
    const landmarks = zones.landmarks;

    // 1. Power Station (NE: x>0, z<0)
    const powerGroup = new THREE.Group();
    const powerBase = new THREE.Mesh(BOX(10, 8, 10), mat(colors.metal, { roughness: 0.6, metal: 0.4 }));
    powerBase.position.y = 4;
    powerGroup.add(powerBase);
    for (let i = 0; i < 2; i++) {
        const pipe = new THREE.Mesh(CYL(0.5, 0.5, 15, 8), mat(0x555555, { roughness: 0.5, metal: 0.5 }));
        pipe.position.set(i === 0 ? -3 : 3, 11, 0);
        powerGroup.add(pipe);
        const pipeCap = new THREE.Mesh(CYL(0.7, 0.5, 1, 8), mat(0x666666, { roughness: 0.5, metal: 0.5 }));
        pipeCap.position.set(i === 0 ? -3 : 3, 19, 0);
        powerGroup.add(pipeCap);
    }
    // Sparking wires
    for (let i = 0; i < 3; i++) {
        const wire = new THREE.Mesh(CYL(0.03, 0.03, 5, 6), mat(0xFFFF00, { emissive: 0xFFFF00, emissiveIntensity: 1 }));
        wire.position.set(-4 + i * 2, 6, 5.1);
        wire.rotation.z = Math.PI / 2;
        powerGroup.add(wire);
    }
    // Screen on wall
    const powerScreen = new THREE.Mesh(PLANE(3, 2), mats.screen2);
    powerScreen.position.set(0, 5, 5.05);
    powerGroup.add(powerScreen);
    powerGroup.position.set(80, 0, -60);
    landmarks.add(powerGroup);

    // 2. Medical Dome (SE)
    const medGroup = new THREE.Group();
    const medDome = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xFFFFFF, { roughness: 0.4, metal: 0.1 }));
    medDome.position.y = 0;
    medGroup.add(medDome);
    const medPlatform = new THREE.Mesh(CYL(7, 7, 0.3, 12), mats.concrete);
    medPlatform.position.y = -0.15;
    medGroup.add(medPlatform);
    // Red cross
    const crossH = new THREE.Mesh(BOX(2, 0.3, 0.3), mat(0xFF0000, { roughness: 0.5 }));
    crossH.position.set(0, 7, 0);
    medGroup.add(crossH);
    const crossV = new THREE.Mesh(BOX(0.3, 0.3, 2), mat(0xFF0000, { roughness: 0.5 }));
    crossV.position.set(0, 7, 0);
    medGroup.add(crossV);
    medGroup.position.set(60, 0, 80);
    landmarks.add(medGroup);

    // 3. Ammo Warehouse (NW)
    const ammoGroup = new THREE.Group();
    const ammoBody = new THREE.Mesh(BOX(8, 5, 8), mat(0x5A5A5A, { roughness: 0.8 }));
    ammoBody.position.y = 2.5;
    ammoGroup.add(ammoBody);
    const ammoDoor = new THREE.Mesh(BOX(1.5, 3, 0.1), mats.door);
    ammoDoor.position.set(0, 1.5, 4.05);
    ammoGroup.add(ammoDoor);
    // Barbed wire
    for (let i = 0; i < 8; i++) {
        const wire = new THREE.Mesh(CYL(0.03, 0.03, 8, 6), mat(0x444444, { roughness: 0.9 }));
        wire.position.set(0, 5.1, -4 + i);
        wire.rotation.x = Math.PI / 2;
        ammoGroup.add(wire);
    }
    ammoGroup.position.set(-80, 0, -70);
    landmarks.add(ammoGroup);

    // 4. Laboratory (SW)
    const labGroup = new THREE.Group();
    const labBody = new THREE.Mesh(BOX(10, 6, 6), mats.labGlass);
    labBody.position.y = 3;
    labGroup.add(labBody);
    // Green glowing inserts
    for (let i = 0; i < 4; i++) {
        const insert = new THREE.Mesh(BOX(0.3, 4, 0.1), mats.labGlow);
        insert.position.set(-3 + i * 2, 3, 3.05);
        labGroup.add(insert);
    }
    const labBase = new THREE.Mesh(BOX(10.5, 0.3, 6.5), mats.concrete);
    labBase.position.y = 0.15;
    labGroup.add(labBase);
    labGroup.position.set(-70, 0, 70);
    landmarks.add(labGroup);

    // 5. Temple (South, near center)
    const templeGroup = new THREE.Group();
    for (let i = 0; i < 4; i++) {
        const pillar = new THREE.Mesh(CYL(0.4, 0.5, 6, 8), mat(colors.temple, { roughness: 0.6 }));
        const px = (i < 2 ? -2 : 2);
        const pz = (i % 2 === 0 ? -2 : 2);
        pillar.position.set(px, 3, pz);
        templeGroup.add(pillar);
    }
    // Pediment
    const pediment = new THREE.Mesh(BOX(5, 0.4, 5), mat(colors.temple, { roughness: 0.6 }));
    pediment.position.y = 6.2;
    templeGroup.add(pediment);
    // Roof triangle
    const roofTriT = new THREE.Mesh(BOX(5.5, 0.3, 5.5), mat(colors.temple, { roughness: 0.6 }));
    roofTriT.position.y = 7;
    roofTriT.rotation.z = 0;
    templeGroup.add(roofTriT);
    // Glowing screen inside
    const templeScreen = new THREE.Mesh(BOX(3, 2, 0.1), mats.screen);
    templeScreen.position.set(0, 3, 0);
    templeGroup.add(templeScreen);
    templeGroup.position.set(0, 0, 80);
    landmarks.add(templeGroup);

    // 6. Sewer (North)
    const sewerGroup = new THREE.Group();
    // Manhole
    const manhole = new THREE.Mesh(CYL(0.8, 0.8, 0.1, 12), mat(0x333333, { roughness: 0.8, metal: 0.5 }));
    manhole.position.y = 0.05;
    sewerGroup.add(manhole);
    // Stairs going down
    for (let i = 0; i < 6; i++) {
        const stair = new THREE.Mesh(BOX(1.2, 0.15, 0.4), mats.concrete);
        stair.position.set(0, 0.2 - i * 0.25, 1 + i * 0.3);
        sewerGroup.add(stair);
    }
    // Tunnel
    const tunnel = new THREE.Mesh(BOX(1.5, 2, 8), mat(0x2A2A2A, { roughness: 1 }));
    tunnel.position.set(0, -0.5, 6);
    sewerGroup.add(tunnel);
    sewerGroup.position.set(0, 0, -80);
    landmarks.add(sewerGroup);

    // 7. Water Tower (East)
    const waterGroup = new THREE.Group();
    for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(CYL(0.15, 0.15, 18, 8), mat(colors.metal, { roughness: 0.5, metal: 0.6 }));
        const lx = (i < 2 ? -1.5 : 1.5);
        const lz = (i % 2 === 0 ? -1.5 : 1.5);
        leg.position.set(lx, 9, lz);
        waterGroup.add(leg);
    }
    // Cross beams
    for (let i = 0; i < 3; i++) {
        const beam = new THREE.Mesh(CYL(0.08, 0.08, 3, 6), mat(0x555555, { roughness: 0.5, metal: 0.5 }));
        beam.position.set(0, 3 + i * 5, 0);
        beam.rotation.z = Math.PI / 2;
        waterGroup.add(beam);
    }
    const tank = new THREE.Mesh(CYL(3, 3, 4, 12), mat(0x777777, { roughness: 0.6, metal: 0.3 }));
    tank.position.y = 17;
    waterGroup.add(tank);
    waterGroup.position.set(100, 0, 0);
    landmarks.add(waterGroup);

    // 8. Mine (SE)
    const mineGroup = new THREE.Group();
    // A-frame
    for (let side = -1; side <= 1; side += 2) {
        const beam1 = new THREE.Mesh(CYL(0.2, 0.2, 8, 8), mats.wood);
        beam1.position.set(side * 2, 3.5, 0);
        beam1.rotation.z = side * -0.3;
        mineGroup.add(beam1);
        const beam2 = new THREE.Mesh(CYL(0.2, 0.2, 8, 8), mats.wood);
        beam2.position.set(side * 2, 3.5, 0);
        beam2.rotation.z = side * 0.3;
        mineGroup.add(beam2);
    }
    // Top cross
    const mineCross = new THREE.Mesh(BOX(5, 0.3, 0.3), mats.wood);
    mineCross.position.y = 8;
    mineGroup.add(mineCross);
    // Pit
    const pit = new THREE.Mesh(BOX(4, 0.1, 4), mat(0x111111, { roughness: 1 }));
    pit.position.y = -0.3;
    mineGroup.add(pit);
    mineGroup.position.set(70, 0, 100);
    landmarks.add(mineGroup);

    // 9. Lighthouse (NE)
    const lightGroup = new THREE.Group();
    const lighthouse = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.5, 22, 12), mat(colors.lighthouse, { roughness: 0.5 }));
    lighthouse.position.y = 11;
    lightGroup.add(lighthouse);
    // Light at top
    const lightTop = new THREE.Mesh(CYL(3, 3, 1, 12), mat(0xFFFFFF, { emissive: 0xFFFF00, emissiveIntensity: 0.3 }));
    lightTop.position.y = 22.5;
    lightGroup.add(lightTop);
    const lightBulb = new THREE.Mesh(SPH(0.5, 8, 8), mats.lighthouseLight);
    lightBulb.position.y = 23;
    lightGroup.add(lightBulb);
    // Observation deck
    const deck = new THREE.Mesh(CYL(2, 2, 0.2, 12), mat(colors.metal, { roughness: 0.5, metal: 0.6 }));
    deck.position.y = 18;
    lightGroup.add(deck);
    lightGroup.position.set(140, 0, -100);
    landmarks.add(lightGroup);

    // 10. Radar Station (West)
    const radarGroup = new THREE.Group();
    const radarBase = new THREE.Mesh(BOX(4, 3, 4), mat(0x7A7A7A, { roughness: 0.7 }));
    radarBase.position.y = 1.5;
    radarGroup.add(radarBase);
    // Mast
    const mast = new THREE.Mesh(CYL(0.2, 0.2, 8, 8), mat(colors.metal, { roughness: 0.5, metal: 0.6 }));
    mast.position.y = 7;
    radarGroup.add(mast);
    // Dish (tilted)
    const dish = new THREE.Mesh(CYL(3, 3, 0.3, 12), mat(colors.radar, { roughness: 0.4, metal: 0.6 }));
    dish.position.set(0, 11, 0);
    dish.rotation.x = Math.PI / 4;
    radarGroup.add(dish);
    radarGroup.position.set(-120, 0, -40);
    landmarks.add(radarGroup);

    // 11. Prison Bus (South)
    const busGroup = new THREE.Group();
    const busBody = new THREE.Mesh(BOX(8, 2.5, 3), mat(colors.bus, { roughness: 0.7 }));
    busBody.position.y = 1.75;
    busBody.rotation.y = Math.PI / 6;
    busGroup.add(busBody);
    // Wheels
    for (let i = 0; i < 4; i++) {
        const wheel = new THREE.Mesh(CYL(0.5, 0.5, 0.3, 8), mat(0x222222, { roughness: 0.9 }));
        const wx = (i < 2 ? -2.5 : 2.5);
        const wz = (i % 2 === 0 ? -1.7 : 1.7);
        wheel.position.set(wx, 0.5, wz);
        wheel.rotation.x = Math.PI / 2;
        busGroup.add(wheel);
    }
    // Damage dents
    const dent = new THREE.Mesh(BOX(1, 1, 0.5), mat(colors.bus, { roughness: 0.7 }));
    dent.position.set(-3, 2, 0);
    dent.rotation.z = 0.5;
    busGroup.add(dent);
    busGroup.position.set(0, 0, 130);
    landmarks.add(busGroup);

    // 12. Observation Platform (NW)
    const obsGroup = new THREE.Group();
    for (let i = 0; i < 4; i++) {
        const pole = new THREE.Mesh(CYL(0.15, 0.15, 10, 8), mat(colors.metal, { roughness: 0.5, metal: 0.6 }));
        const px = (i < 2 ? -2 : 2);
        const pz = (i % 2 === 0 ? -2 : 2);
        pole.position.set(px, 5, pz);
        obsGroup.add(pole);
    }
    const obsPlatform = new THREE.Mesh(BOX(5, 0.3, 5), mat(colors.metal, { roughness: 0.5, metal: 0.6 }));
    obsPlatform.position.y = 10;
    obsGroup.add(obsPlatform);
    // Flagpole
    const flagpole = new THREE.Mesh(CYL(0.05, 0.05, 4, 6), mat(colors.metal, { roughness: 0.3, metal: 0.8 }));
    flagpole.position.set(0, 12, 0);
    obsGroup.add(flagpole);
    obsGroup.position.set(-100, 0, -100);
    landmarks.add(obsGroup);

    // ===== DETAILS (Scattered across the entire map) =====
    const details = zones.details;

    // Rocks and boulders (40)
    for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * 160;
        const rock = new THREE.Mesh(SPH(0.5 + Math.random() * 1), mat(0x6B6B6B, { roughness: 0.9 }));
        rock.position.set(Math.cos(angle) * r, 0.3, Math.sin(angle) * r);
        rock.scale.set(1 + Math.random(), 0.5 + Math.random() * 0.8, 1 + Math.random());
        details.add(rock);
    }

    // Crates (40)
    for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 15 + Math.random() * 170;
        const crate = new THREE.Mesh(BOX(0.8, 0.8, 0.8), mats.wood);
        crate.position.set(Math.cos(angle) * r, 0.4, Math.sin(angle) * r);
        crate.rotation.y = Math.random() * Math.PI;
        details.add(crate);
    }

    // Barrels (30)
    for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 15 + Math.random() * 170;
        const barrel = new THREE.Mesh(CYL(0.4, 0.4, 1, 8), mat(0x5A3A1A, { roughness: 0.8 }));
        barrel.position.set(Math.cos(angle) * r, 0.5, Math.sin(angle) * r);
        details.add(barrel);
    }

    // Concrete blocks (20)
    for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * 160;
        const block = new THREE.Mesh(BOX(1, 0.8, 0.5), mat(0x777777, { roughness: 0.8 }));
        block.position.set(Math.cos(angle) * r, 0.4, Math.sin(angle) * r);
        block.rotation.y = Math.random() * Math.PI;
        details.add(block);
    }

    // Burnt cars on the boundary (10)
    for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = 150 + Math.random() * 40;
        const carGroup = new THREE.Group();
        const charred = new THREE.Mesh(BOX(4, 1.2, 2), mat(colors.charred, { roughness: 0.9 }));
        charred.position.y = 0.6;
        carGroup.add(charred);
        const charTop = new THREE.Mesh(BOX(2.5, 0.8, 1.8), mat(colors.charred, { roughness: 0.9 }));
        charTop.position.set(-0.3, 1.5, 0);
        carGroup.add(charTop);
        // Broken windows
        const glass = new THREE.Mesh(BOX(0.05, 0.6, 1.5), mat(0x333344, { roughness: 0.1 }));
        glass.position.set(-1.5, 1.3, 0);
        carGroup.add(glass);
        carGroup.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
        carGroup.rotation.y = Math.random() * Math.PI;
        details.add(carGroup);
    }

    // Gallows with dummies (3)
    for (let i = 0; i < 3; i++) {
        const gallowsGroup = new THREE.Group();
        const gAngle = Math.PI * 0.2 + (Math.random() - 0.5) * Math.PI * 0.3;
        const gR = 40 + Math.random() * 60;
        const gx = Math.cos(gAngle) * gR;
        const gz = Math.sin(gAngle) * gR;
        // Two vertical poles
        const pole1 = new THREE.Mesh(CYL(0.1, 0.1, 4, 6), mats.hanging);
        pole1.position.set(-0.8, 2, 0);
        gallowsGroup.add(pole1);
        const pole2 = new THREE.Mesh(CYL(0.1, 0.1, 4, 6), mats.hanging);
        pole2.position.set(0.8, 2, 0);
        gallowsGroup.add(pole2);
        // Cross beam
        const crossBeam = new THREE.Mesh(BOX(2.2, 0.15, 0.15), mats.hanging);
        crossBeam.position.y = 3.8;
        gallowsGroup.add(crossBeam);
        // Dummy (simple stick figure)
        const dummyHead = new THREE.Mesh(SPH(0.25, 6, 6), mat(0xDDCCBB, { roughness: 0.8 }));
        dummyHead.position.set(0, 3, 0);
        gallowsGroup.add(dummyHead);
        const dummyBody = new THREE.Mesh(BOX(0.4, 0.8, 0.3), mat(0x888888, { roughness: 0.8 }));
        dummyBody.position.set(0, 2.4, 0);
        gallowsGroup.add(dummyBody);
        gallowsGroup.position.set(gx, 0, gz);
        details.add(gallowsGroup);
    }

    // Debris piles (brush, small wood) in forest
    for (let i = 0; i < 30; i++) {
        const angle = Math.PI * 0.2 + (Math.random() - 0.5) * Math.PI * 0.5;
        const r = 30 + Math.random() * 130;
        const pile = new THREE.Mesh(BOX(0.5 + Math.random(), 0.15, 0.5 + Math.random()), mats.trunk);
        pile.position.set(Math.cos(angle) * r, 0.1, Math.sin(angle) * r);
        pile.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3);
        details.add(pile);
    }

    // Warning markers near cornucopia
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const marker = new THREE.Mesh(CONE(0.3, 0.8, 6), mat(colors.marker, { emissive: colors.marker, emissiveIntensity: 0.3 }));
        marker.position.set(Math.cos(angle) * 16, 0.4, Math.sin(angle) * 16);
        details.add(marker);
    }

    scene.add(zones.terrain);
    scene.add(zones.arena_wall);
    scene.add(zones.cornucopia);
    scene.add(zones.mountains);
    scene.add(zones.forest);
    scene.add(zones.swamp);
    scene.add(zones.farm);
    scene.add(zones.landmarks);
    scene.add(zones.details);

    return { zones, mats };
}

export { buildMap };
