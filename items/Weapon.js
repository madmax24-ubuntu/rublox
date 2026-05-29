import * as THREE from 'three';

const WEAPON_BALANCE = {
    fists: { damage: 8, range: 2.4, cooldown: 0.38, ammo: null, durability: null, projectileSpeed: 0 },
    knife: { damage: 22, range: 3.4, cooldown: 0.42, ammo: null, durability: 80, projectileSpeed: 0 },
    bow: { damage: 20, range: 20, cooldown: 1.18, ammo: 48, durability: null, projectileSpeed: 46 },
    laser: { damage: 23, range: 86, cooldown: 0.34, ammo: 30, durability: null, projectileSpeed: 62 },
    shotgun: { damage: 13, range: 14, cooldown: 0.98, ammo: 36, durability: null, projectileSpeed: 48, pellets: 7 },
    flamethrower: { damage: 3.8, range: 13.5, cooldown: 0.12, ammo: 260, durability: null, projectileSpeed: 16, flameCount: 4 },
    pistol: { damage: 20, range: 62, cooldown: 0.36, ammo: 90, durability: null, projectileSpeed: 82 },
    rifle: { damage: 27, range: 96, cooldown: 0.28, ammo: 120, durability: null, projectileSpeed: 98 },
    machinegun: { damage: 16, range: 86, cooldown: 0.12, ammo: 180, durability: null, projectileSpeed: 94 },
    sniper: { damage: 48, range: 150, cooldown: 1.2, ammo: 30, durability: null, projectileSpeed: 110 },
    smg: { damage: 12, range: 50, cooldown: 0.06, ammo: 150, durability: null, projectileSpeed: 88 },
    crossbow: { damage: 38, range: 42, cooldown: 1.5, ammo: 20, durability: null, projectileSpeed: 52 }
};

const WEAPON_TACTICAL = {
    sniper: { soundCategory: 'sniper', fireSound: 'rifle', reloadSound: 'timer', muzzleIntensity: 0.6 },
    smg: { soundCategory: 'smg', fireSound: 'machinegun', reloadSound: 'timer', muzzleIntensity: 0.25 },
    crossbow: { soundCategory: 'bow', fireSound: 'bowShot', reloadSound: 'timer', muzzleIntensity: 0.05 }
};

const TYPE_ALIASES = {
    lasergun: 'laser',
    machinegun: 'machinegun',
    mg: 'machinegun',
    axe: 'knife',
    spr: 'rifle'
};

const sharedGeom = new Map();
const sharedMat = new Map();

const tmpQ = new THREE.Quaternion();
const tmpF = new THREE.Vector3(1, 0, 0);

function normType(rawType) {
    const t = (rawType || 'fists').toLowerCase();
    return TYPE_ALIASES[t] || t;
}

function getProfile(type) {
    return WEAPON_BALANCE[type] || WEAPON_BALANCE.fists;
}

function getMaterial(key, createFn) {
    if (!sharedMat.has(key)) {
        sharedMat.set(key, createFn());
    }
    return sharedMat.get(key);
}

function getGeom(key, createFn) {
    if (!sharedGeom.has(key)) {
        sharedGeom.set(key, createFn());
    }
    return sharedGeom.get(key);
}

function createPart(geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    return mesh;
}

function configureMeshForGameplay(mesh) {
    mesh.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = false;
            child.renderOrder = 0;
            if (child.material) {
                child.material.depthTest = true;
                child.material.depthWrite = true;
                child.material.transparent = false;
                child.material.opacity = 1;
            }
            child.userData.ignoreDamageTint = true;
        }
    });
}

function createKnifeModel() {
    const group = new THREE.Group();
    const bladeMat = getMaterial('knife_blade', () => new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 0.78, roughness: 0.28, flatShading: true }));
    const handleMat = getMaterial('knife_handle', () => new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.8, metalness: 0.05, flatShading: true }));
    const guardMat = getMaterial('knife_guard', () => new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.45, metalness: 0.45, flatShading: true }));

    group.add(createPart(getGeom('knife_h', () => new THREE.BoxGeometry(0.36, 0.1, 0.1)), handleMat, -0.24, -0.01, 0));
    group.add(createPart(getGeom('knife_h2', () => new THREE.BoxGeometry(0.14, 0.12, 0.12)), handleMat, -0.39, -0.01, 0));
    group.add(createPart(getGeom('knife_g', () => new THREE.BoxGeometry(0.09, 0.14, 0.14)), guardMat, -0.03, 0, 0));
    group.add(createPart(getGeom('knife_b', () => new THREE.BoxGeometry(0.76, 0.06, 0.04)), bladeMat, 0.38, 0.01, 0));
    group.add(createPart(getGeom('knife_bs', () => new THREE.BoxGeometry(0.64, 0.02, 0.03)), guardMat, 0.29, 0.045, 0));
    group.add(createPart(getGeom('knife_t', () => new THREE.ConeGeometry(0.038, 0.16, 6)), bladeMat, 0.82, 0.01, 0, 0, 0, -Math.PI / 2));
    // Parts along +X (barrel forward). No extra rotation needed.
    return group;
}

function createBowModel() {
    const group = new THREE.Group();
    const limbMat = getMaterial('bow_limb', () => new THREE.MeshStandardMaterial({ color: 0x7a4a20, roughness: 0.62, flatShading: true }));
    const gripMat = getMaterial('bow_grip', () => new THREE.MeshStandardMaterial({ color: 0x2d1b12, roughness: 0.78, flatShading: true }));
    const stringMat = getMaterial('bow_string', () => new THREE.LineBasicMaterial({ color: 0x161616 }));

    const segGeom = getGeom('bow_seg', () => new THREE.BoxGeometry(0.12, 0.32, 0.08));
    const segData = [
        [-0.18, 0.82, 0.45],
        [-0.06, 0.5, 0.24],
        [0.02, 0.16, 0.08],
        [0.02, -0.16, -0.08],
        [-0.06, -0.5, -0.24],
        [-0.18, -0.82, -0.45]
    ];
    for (const [x, y, r] of segData) {
        group.add(createPart(segGeom, limbMat, x, y, 0, 0, 0, r));
    }
    group.add(createPart(getGeom('bow_grip', () => new THREE.BoxGeometry(0.16, 0.58, 0.11)), gripMat, 0.02, 0, 0));

    const string = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-0.24, 0.98, 0),
            new THREE.Vector3(0.14, 0, 0),
            new THREE.Vector3(-0.24, -0.98, 0)
        ]),
        stringMat
    );
    string.frustumCulled = false;
    group.add(string);
    group.scale.setScalar(0.84);
    return group;
}

function createGunModel(style) {
    const group = new THREE.Group();
    const metal = getMaterial(`${style}_metal`, () => new THREE.MeshStandardMaterial({ color: 0x444b56, roughness: 0.44, metalness: 0.48, flatShading: true }));
    const dark = getMaterial(`${style}_dark`, () => new THREE.MeshStandardMaterial({ color: 0x1d2128, roughness: 0.58, metalness: 0.22, flatShading: true }));
    const wood = getMaterial(`${style}_wood`, () => new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.76, metalness: 0.05, flatShading: true }));
    const neon = getMaterial(`${style}_neon`, () => new THREE.MeshStandardMaterial({ color: 0x6ad3ff, emissive: 0x6ad3ff, emissiveIntensity: 0.35, roughness: 0.22, metalness: 0.36, flatShading: true }));

    if (style === 'pistol') {
        group.add(createPart(getGeom('pistol_body', () => new THREE.BoxGeometry(0.48, 0.16, 0.14)), metal, 0.06, 0.06, 0));
        group.add(createPart(getGeom('pistol_slide', () => new THREE.BoxGeometry(0.36, 0.06, 0.16)), dark, 0.06, 0.18, 0));
        group.add(createPart(getGeom('pistol_grip', () => new THREE.BoxGeometry(0.14, 0.26, 0.12)), dark, -0.08, -0.14, 0));
        group.add(createPart(getGeom('pistol_barrel', () => new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8)), metal, 0.36, 0.06, 0, 0, 0, Math.PI / 2));
    } else if (style === 'rifle' || style === 'machinegun') {
        const length = style === 'machinegun' ? 1.4 : 1.16;
        group.add(createPart(getGeom(`${style}_body`, () => new THREE.BoxGeometry(length, 0.14, 0.14)), metal, 0.26, 0.06, 0));
        group.add(createPart(getGeom(`${style}_barrel`, () => new THREE.CylinderGeometry(0.032, 0.032, 0.78, 8)), dark, 0.84, 0.06, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom(`${style}_stock`, () => new THREE.BoxGeometry(0.34, 0.2, 0.15)), wood, -0.34, 0.04, 0));
        group.add(createPart(getGeom(`${style}_mag`, () => new THREE.BoxGeometry(0.13, 0.24, 0.1)), dark, 0.12, -0.11, 0));
        group.add(createPart(getGeom(`${style}_grip`, () => new THREE.BoxGeometry(0.12, 0.2, 0.11)), dark, -0.04, -0.13, 0));
        if (style === 'machinegun') {
            group.add(createPart(getGeom('machinegun_drum', () => new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12)), dark, 0.04, -0.2, 0, Math.PI / 2, 0, 0));
        }
    } else if (style === 'shotgun') {
        group.add(createPart(getGeom('shotgun_body', () => new THREE.BoxGeometry(0.38, 0.16, 0.13)), dark, -0.08, 0.03, 0));
        group.add(createPart(getGeom('shotgun_b1', () => new THREE.BoxGeometry(0.82, 0.08, 0.06)), metal, 0.34, 0.08, 0.05));
        group.add(createPart(getGeom('shotgun_b2', () => new THREE.BoxGeometry(0.82, 0.08, 0.06)), metal, 0.34, 0.08, -0.05));
        group.add(createPart(getGeom('shotgun_stock', () => new THREE.BoxGeometry(0.42, 0.16, 0.16)), wood, -0.42, 0.02, 0));
        group.add(createPart(getGeom('shotgun_pump', () => new THREE.BoxGeometry(0.24, 0.11, 0.14)), wood, 0.22, -0.02, 0));
    } else if (style === 'flamethrower') {
        group.add(createPart(getGeom('flame_body', () => new THREE.BoxGeometry(0.68, 0.2, 0.2)), metal, 0.08, 0.04, 0));
        group.add(createPart(getGeom('flame_nozzle', () => new THREE.CylinderGeometry(0.055, 0.055, 0.5, 8)), dark, 0.52, 0.06, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('flame_grip', () => new THREE.BoxGeometry(0.13, 0.22, 0.12)), dark, -0.06, -0.18, 0));
        group.add(createPart(getGeom('flame_tank', () => new THREE.CylinderGeometry(0.12, 0.12, 0.42, 8)), metal, -0.26, -0.12, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('flame_vent', () => new THREE.BoxGeometry(0.18, 0.06, 0.1)), neon, 0.18, 0.16, 0));
    } else if (style === 'laser') {
        group.add(createPart(getGeom('laser_body', () => new THREE.BoxGeometry(0.72, 0.2, 0.2)), dark, 0.1, 0.04, 0));
        group.add(createPart(getGeom('laser_barrel', () => new THREE.CylinderGeometry(0.06, 0.08, 0.52, 8)), metal, 0.5, 0.06, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('laser_core', () => new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8)), neon, 0.18, 0.06, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('laser_grip', () => new THREE.BoxGeometry(0.12, 0.22, 0.12)), dark, -0.06, -0.17, 0));
        group.add(createPart(getGeom('laser_cell', () => new THREE.BoxGeometry(0.12, 0.18, 0.12)), neon, -0.04, -0.04, 0));
    } else if (style === 'sniper') {
        group.add(createPart(getGeom('sniper_body', () => new THREE.BoxGeometry(1.32, 0.12, 0.13)), metal, 0.2, 0.06, 0));
        group.add(createPart(getGeom('sniper_barrel', () => new THREE.CylinderGeometry(0.028, 0.028, 0.88, 8)), dark, 0.78, 0.06, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('sniper_stock', () => new THREE.BoxGeometry(0.48, 0.18, 0.14)), wood, -0.42, 0.04, 0));
        group.add(createPart(getGeom('sniper_mag', () => new THREE.BoxGeometry(0.11, 0.22, 0.09)), dark, 0.08, -0.1, 0));
        group.add(createPart(getGeom('sniper_grip', () => new THREE.BoxGeometry(0.11, 0.18, 0.1)), dark, -0.06, -0.12, 0));
        group.add(createPart(getGeom('sniper_scope', () => new THREE.CylinderGeometry(0.055, 0.055, 0.48, 8)), dark, 0.22, 0.16, 0));
        group.add(createPart(getGeom('sniper_scope_ring', () => new THREE.TorusGeometry(0.065, 0.012, 8, 12)), metal, 0.22, 0.14, 0, Math.PI / 2));
        const redDot = getMaterial('sniper_red_dot', () => new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8 }));
        group.add(createPart(getGeom('sniper_red_dot_g', () => new THREE.SphereGeometry(0.018, 6, 6)), redDot, 0.44, 0.16, 0));
    } else if (style === 'smg') {
        group.add(createPart(getGeom('smg_body', () => new THREE.BoxGeometry(0.78, 0.13, 0.13)), metal, 0.14, 0.06, 0));
        group.add(createPart(getGeom('smg_barrel', () => new THREE.CylinderGeometry(0.03, 0.03, 0.52, 8)), dark, 0.62, 0.06, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('smg_stock', () => new THREE.BoxGeometry(0.24, 0.14, 0.12)), dark, -0.26, 0.04, 0));
        group.add(createPart(getGeom('smg_mag', () => new THREE.BoxGeometry(0.11, 0.26, 0.09)), dark, 0.02, -0.12, 0));
        group.add(createPart(getGeom('smg_grip', () => new THREE.BoxGeometry(0.1, 0.16, 0.1)), dark, -0.04, -0.1, 0));
        const blueGlow = getMaterial('smg_glow', () => new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x4488ff, emissiveIntensity: 0.3 }));
        group.add(createPart(getGeom('smg_glow', () => new THREE.BoxGeometry(0.06, 0.06, 0.06)), blueGlow, 0.14, 0.13, 0));
    }

    // Parts along +X (barrel forward). No extra rotation needed.
    return group;
}

function createCrossbowModel() {
    const group = new THREE.Group();
    const woodMat = getMaterial('crossbow_wood', () => new THREE.MeshStandardMaterial({ color: 0x6b4a20, roughness: 0.7, flatShading: true }));
    const metalMat = getMaterial('crossbow_metal', () => new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.45, metalness: 0.5, flatShading: true }));
    const stringMat = getMaterial('crossbow_string', () => new THREE.LineBasicMaterial({ color: 0x222222 }));

    // Stock
    group.add(createPart(getGeom('crossbow_stock', () => new THREE.BoxGeometry(0.62, 0.1, 0.09)), woodMat, -0.08, -0.02, 0));
    // Upper limb frame
    group.add(createPart(getGeom('crossbow_frame', () => new THREE.BoxGeometry(0.78, 0.07, 0.06)), woodMat, 0.22, 0.12, 0));
    // Lower limb frame
    group.add(createPart(getGeom('crossbow_frame_l', () => new THREE.BoxGeometry(0.78, 0.07, 0.06)), woodMat, 0.22, -0.12, 0));
    // Barrel groove
    group.add(createPart(getGeom('crossbow_barrel', () => new THREE.BoxGeometry(0.58, 0.06, 0.08)), metalMat, 0.22, 0, 0));
    // Trigger
    group.add(createPart(getGeom('crossbow_trigger', () => new THREE.BoxGeometry(0.06, 0.14, 0.06)), metalMat, -0.02, -0.08, 0));
    // Grip
    group.add(createPart(getGeom('crossbow_grip', () => new THREE.BoxGeometry(0.08, 0.18, 0.08)), woodMat, -0.14, -0.1, 0));

    // String (center to front)
    const string = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0.62, 0.12, 0),
            new THREE.Vector3(0.0, 0, 0),
            new THREE.Vector3(0.62, -0.12, 0)
        ]),
        stringMat
    );
    string.frustumCulled = false;
    group.add(string);

    // Sighting rail
    group.add(createPart(getGeom('crossbow_rail', () => new THREE.BoxGeometry(0.42, 0.02, 0.03)), metalMat, 0.22, 0.16, 0));
    group.scale.setScalar(0.88);
    return group;
}

function createArrowProjectileMesh() {
    const group = new THREE.Group();
    const shaftMat = getMaterial('proj_arrow_shaft', () => new THREE.MeshStandardMaterial({ color: 0x6f4b2d, roughness: 0.74, flatShading: true }));
    const tipMat = getMaterial('proj_arrow_tip', () => new THREE.MeshStandardMaterial({ color: 0xbfc8d1, metalness: 0.4, roughness: 0.4, flatShading: true }));
    const fletchMat = getMaterial('proj_arrow_fletch', () => new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.62, flatShading: true }));

    group.add(createPart(getGeom('proj_arrow_shaft_g', () => new THREE.CylinderGeometry(0.04, 0.04, 1.85, 6)), shaftMat, 0, 0, 0, 0, 0, Math.PI / 2));
    group.add(createPart(getGeom('proj_arrow_tip_g', () => new THREE.ConeGeometry(0.08, 0.24, 6)), tipMat, 1.04, 0, 0, 0, 0, -Math.PI / 2));
    group.add(createPart(getGeom('proj_arrow_f1', () => new THREE.BoxGeometry(0.26, 0.1, 0.03)), fletchMat, -0.82, 0.09, 0));
    group.add(createPart(getGeom('proj_arrow_f2', () => new THREE.BoxGeometry(0.26, 0.1, 0.03)), fletchMat, -0.82, -0.09, 0));
    group.add(createPart(getGeom('proj_arrow_f3', () => new THREE.BoxGeometry(0.26, 0.03, 0.1)), fletchMat, -0.82, 0, 0));
    group.scale.setScalar(1.08);
    configureMeshForGameplay(group);
    return group;
}

function getRotationOffsets(type) {
    // Offsets are already baked into the view pose rotations above. Zero here.
    return { pitch: 0, yaw: 0, roll: 0 };
}

function getViewPoseForType(rawType) {
    const type = normType(rawType);
    const base = {
        scale: 0.82,
        position: new THREE.Vector3(0.2, -0.4, -0.78),
        rotation: new THREE.Euler(0.04, -Math.PI / 2, 0.04)
    };

    if (type === 'knife') {
        base.position.set(0.25, -0.34, -0.8);
        base.rotation.set(0.08, -Math.PI / 2, 0.08);
        base.scale = 0.98;
    } else if (type === 'bow') {
        base.position.set(0.24, -0.3, -0.98);
        base.rotation.set(0.1, -Math.PI / 2.05, Math.PI / 2);
        base.scale = 0.78;
    } else if (type === 'shotgun') {
        base.position.set(0.22, -0.42, -0.9);
        base.rotation.set(0.05, -Math.PI / 2, -0.04);
        base.scale = 0.7;
    } else if (type === 'flamethrower') {
        base.position.set(0.22, -0.44, -0.92);
        base.rotation.set(0.04, -Math.PI / 2, -0.05);
        base.scale = 0.68;
    } else if (type === 'laser') {
        base.position.set(0.22, -0.44, -0.92);
        base.rotation.set(0.04, -Math.PI / 2, -0.05);
        base.scale = 0.68;
    } else if (type === 'pistol') {
        base.position.set(0.2, -0.42, -0.82);
        base.rotation.set(0.05, -Math.PI / 2, -0.02);
        base.scale = 0.76;
    } else if (type === 'rifle') {
        base.position.set(0.22, -0.44, -0.95);
        base.rotation.set(0.05, -Math.PI / 2, -0.05);
        base.scale = 0.66;
    } else if (type === 'machinegun') {
        base.position.set(0.22, -0.45, -0.98);
        base.rotation.set(0.05, -Math.PI / 2, -0.05);
        base.scale = 0.67;
    } else if (type === 'sniper') {
        base.position.set(0.22, -0.46, -1.05);
        base.rotation.set(0.05, -Math.PI / 2, -0.06);
        base.scale = 0.64;
    } else if (type === 'smg') {
        base.position.set(0.22, -0.43, -0.9);
        base.rotation.set(0.05, -Math.PI / 2, -0.04);
        base.scale = 0.68;
    } else if (type === 'crossbow') {
        base.position.set(0.24, -0.38, -0.96);
        base.rotation.set(0.08, -Math.PI / 2, Math.PI / 2.1);
        base.scale = 0.74;
    }

    return base;
}

function getThirdPersonGripForType(rawType) {
    const type = normType(rawType);
    const base = { forward: 0.21, right: 0.12, up: -0.31 };
    if (type === 'knife') return { forward: 0.18, right: 0.1, up: -0.26 };
    if (type === 'pistol') return { forward: 0.21, right: 0.12, up: -0.3 };
    if (type === 'bow') return { forward: 0.26, right: 0.16, up: -0.36 };
    if (type === 'shotgun') return { forward: 0.24, right: 0.12, up: -0.34 };
    if (type === 'rifle' || type === 'machinegun') return { forward: 0.25, right: 0.12, up: -0.35 };
    if (type === 'flamethrower' || type === 'laser') return { forward: 0.24, right: 0.12, up: -0.35 };
    if (type === 'sniper') return { forward: 0.26, right: 0.12, up: -0.36 };
    if (type === 'smg') return { forward: 0.23, right: 0.12, up: -0.33 };
    if (type === 'crossbow') return { forward: 0.26, right: 0.16, up: -0.36 };
    return base;
}

function getThirdPersonWorldScale(rawType) {
    const type = normType(rawType);
    if (type === 'knife') return 0.84;
    if (type === 'bow') return 0.7;
    if (type === 'pistol') return 0.78;
    if (type === 'shotgun') return 0.74;
    if (type === 'rifle') return 0.7;
    if (type === 'machinegun') return 0.72;
    if (type === 'flamethrower') return 0.7;
    if (type === 'laser') return 0.72;
    if (type === 'sniper') return 0.68;
    if (type === 'smg') return 0.7;
    if (type === 'crossbow') return 0.76;
    return 0.78;
}

export class Weapon {
    constructor(type, scene) {
        this.type = normType(type);
        this.scene = scene;

        this.damage = this.getDamage();
        this.range = this.getRange();
        this.cooldown = this.getCooldown();
        this.lastAttackTime = 0;
        this.maxAmmo = this.getMaxAmmo();
        this.ammo = this.maxAmmo;
        this.maxDurability = this.getMaxDurability();
        this.durability = this.maxDurability;

        this.mesh = null;
        this.assetSwapPromise = null;
        this.assetModelApplied = false;
        this._meshChangeListeners = new Set();

        this.createMesh();
    }

    getProfile() {
        return getProfile(this.type);
    }

    getDamage() {
        return this.getProfile().damage;
    }

    getRange() {
        return this.getProfile().range;
    }

    getCooldown() {
        return this.getProfile().cooldown;
    }

    getMaxAmmo() {
        return this.getProfile().ammo ?? null;
    }

    getMaxDurability() {
        return this.getProfile().durability ?? null;
    }

    resetCharges() {
        if (this.maxAmmo !== null) this.ammo = this.maxAmmo;
        if (this.maxDurability !== null) this.durability = this.maxDurability;
    }

    createMesh() {
        if (this.type === 'fists') {
            this.mesh = null;
            return;
        }
        const group = new THREE.Group();

        if (this.type === 'knife') group.add(createKnifeModel());
        else if (this.type === 'bow') group.add(createBowModel());
        else if (this.type === 'pistol') group.add(createGunModel('pistol'));
        else if (this.type === 'rifle') group.add(createGunModel('rifle'));
        else if (this.type === 'machinegun') group.add(createGunModel('machinegun'));
        else if (this.type === 'shotgun') group.add(createGunModel('shotgun'));
        else if (this.type === 'flamethrower') group.add(createGunModel('flamethrower'));
        else if (this.type === 'laser') group.add(createGunModel('laser'));
        else if (this.type === 'sniper') group.add(createGunModel('sniper'));
        else if (this.type === 'smg') group.add(createGunModel('smg'));
        else if (this.type === 'crossbow') group.add(createCrossbowModel());

        configureMeshForGameplay(group);
        group.userData.ignoreDamageTint = true;
        group.scale.setScalar(getThirdPersonWorldScale(this.type));
        group.visible = false;
        this.mesh = group;
        this.scene?.add(group);
    }

    onMeshChanged(callback) {
        if (typeof callback !== 'function') return () => {};
        this._meshChangeListeners.add(callback);
        return () => this._meshChangeListeners.delete(callback);
    }

    notifyMeshChanged() {
        for (const cb of this._meshChangeListeners) {
            try { cb(this.mesh); } catch {}
        }
    }

    attack(owner, target, audioSynth, directionOverride = null, options = null) {
        const now = performance.now() / 1000;
        if (now - this.lastAttackTime < this.cooldown) return false;
        this.lastAttackTime = now;

        if (this.type === 'knife' && this.durability !== null && this.durability <= 0) return false;
        if (this.maxAmmo !== null && this.ammo <= 0) return false;

        this.animateAttack();
        if (audioSynth) {
            const srcPos = owner?.position || null;
            const srcKey = owner?.id !== undefined ? `id:${owner.id}` : (owner?.constructor?.name || 'entity');
            if (this.type === 'knife' || this.type === 'fists') audioSynth.playHit?.(srcPos, srcKey);
            else if (this.type === 'bow') audioSynth.playBowShot?.(srcPos, srcKey);
            else if (this.type === 'laser') audioSynth.playLaser?.(srcPos, srcKey);
            else if (this.type === 'shotgun') audioSynth.playShotgun?.(1, srcPos, srcKey);
            else if (this.type === 'flamethrower') audioSynth.playFlamethrower?.(srcPos, srcKey);
            else if (this.type === 'pistol') audioSynth.playPistol?.(srcPos, srcKey);
            else if (this.type === 'machinegun') audioSynth.playMachinegun?.(srcPos, srcKey);
            else if (this.type === 'rifle') audioSynth.playRifle?.(srcPos, srcKey);
            else if (this.type === 'sniper') audioSynth.playRifle?.(srcPos, srcKey);
            else if (this.type === 'smg') audioSynth.playMachinegun?.(srcPos, srcKey);
            else if (this.type === 'crossbow') audioSynth.playBowShot?.(srcPos, srcKey);
        }

        if (this.type === 'fists' || this.type === 'knife') {
            return this.meleeAttack(owner, target);
        }
        return this.rangedAttack(owner, target, directionOverride, options || {});
    }

    meleeAttack(owner, target) {
        if (!target) return false;
        const distance = owner.position.distanceTo(target.position);
        const targetRadius = target.physics?.radius || 0.4;
        if (distance > this.range + targetRadius * 0.85) return false;

        const headHeight = target.physics?.height || 1.7;
        const hitHeight = target.position.y + headHeight * 0.9;
        const isHeadshot = Math.abs(owner.position.y - hitHeight) < 0.3;
        const finalDamage = isHeadshot ? this.damage * 2 : this.damage;
        const knockback = this.type === 'knife' ? 5 : 4;

        if (this.type === 'knife' && this.durability !== null) {
            this.durability = Math.max(0, this.durability - 1);
        }
        return { hit: true, damage: finalDamage, isHeadshot, knockback };
    }

    rangedAttack(owner, target, directionOverride = null, options = {}) {
        let direction = directionOverride;
        if (!direction && target?.position) {
            direction = new THREE.Vector3().subVectors(target.position, owner.position).normalize();
        }
        if (!direction) return false;
        if (this.ammo !== null) this.ammo = Math.max(0, this.ammo - 1);

        if (this.type === 'shotgun') {
            const pellets = [];
            const pelletCount = this.getProfile().pellets || 7;
            for (let i = 0; i < pelletCount; i++) {
                const spread = new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.2);
                const dir = direction.clone().add(spread).normalize();
                const pellet = this.createProjectile(owner.position.clone(), dir, 'shotgun');
                pellet.lifetime = Math.max(0.2, this.getProfile().range / Math.max(1, pellet.speed));
                pellet.damage = this.damage;
                pellets.push(pellet);
            }
            return { hit: false, projectiles: pellets };
        }

        if (this.type === 'flamethrower') {
            const flames = [];
            const count = this.getProfile().flameCount || 4;
            for (let i = 0; i < count; i++) {
                const spread = new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.1);
                flames.push(this.createProjectile(owner.position.clone(), direction.clone().add(spread).normalize(), 'flame'));
            }
            return { hit: false, projectiles: flames };
        }

        const projectileType = this.type === 'machinegun' ? 'rifle' : this.type;
        const projectile = this.createProjectile(owner.position.clone(), direction, projectileType);
        if (this.type === 'bow') {
            const chargeRatio = Math.max(0.35, Math.min(1, options.chargeRatio ?? 1));
            projectile.damage = Math.round(this.damage * (0.4 + chargeRatio * 0.85));
            projectile.speed = 30 + chargeRatio * 52;
            projectile.velocity.copy(direction).multiplyScalar(projectile.speed);
            projectile.gravity = Math.max(0.008, 0.028 - chargeRatio * 0.017);
            projectile.knockback = 3.4 + chargeRatio * 2.8;
            projectile.maxDistance = 20;
        }
        return { hit: false, projectile };
    }

    createProjectile(startPos, direction, overrideType = null) {
        const type = normType(overrideType || this.type);
        let mesh = null;
        let knockback = 4;
        let gravity = 0.003;

        if (type === 'laser') {
            const m = getMaterial('proj_laser', () => new THREE.MeshStandardMaterial({ color: 0x53f5ff, emissive: 0x53f5ff, emissiveIntensity: 0.48, roughness: 0.18, metalness: 0.4, flatShading: true }));
            mesh = createPart(getGeom('proj_laser', () => new THREE.CylinderGeometry(0.05, 0.05, 0.34, 8)), m, 0, 0, 0, 0, 0, Math.PI / 2);
            knockback = 5;
            gravity = 0;
        } else if (type === 'bow') {
            mesh = createArrowProjectileMesh();
            knockback = 6;
            gravity = 0.02;
       } else if (type === 'pistol' || type === 'rifle' || type === 'machinegun' || type === 'shotgun' || type === 'sniper') {
            const m = getMaterial('proj_bullet', () => new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffc107, emissiveIntensity: 0.35, roughness: 0.28, metalness: 0.35, flatShading: true }));
            mesh = createPart(getGeom('proj_bullet', () => new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8)), m, 0, 0, 0, 0, 0, Math.PI / 2);
            knockback = type === 'sniper' ? 7 : (type === 'rifle' || type === 'machinegun' ? 4 : 3);
        } else if (type === 'smg') {
            const m = getMaterial('proj_smg', () => new THREE.MeshStandardMaterial({ color: 0xffaa22, emissive: 0xff8800, emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.3, flatShading: true }));
            mesh = createPart(getGeom('proj_smg', () => new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8)), m, 0, 0, 0, 0, 0, Math.PI / 2);
            knockback = 3;
        } else if (type === 'crossbow') {
            mesh = createArrowProjectileMesh();
            knockback = 7;
            gravity = 0.025;
        } else if (type === 'flame') {
            const m = getMaterial('proj_flame', () => new THREE.MeshStandardMaterial({ color: 0xff6d00, emissive: 0xff8f00, emissiveIntensity: 0.68, roughness: 0.45, transparent: true, opacity: 0.82, flatShading: true }));
            mesh = createPart(getGeom('proj_flame', () => new THREE.ConeGeometry(0.2, 0.6, 6)), m, 0, 0, 0, 0, 0, Math.PI / 2);
            knockback = 2;
            gravity = 0;
        } else {
            const m = getMaterial('proj_generic', () => new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8, flatShading: true }));
            mesh = createPart(getGeom('proj_generic', () => new THREE.ConeGeometry(0.1, 0.3, 8)), m);
        }

        mesh.position.copy(startPos);
        tmpQ.setFromUnitVectors(tmpF, direction.clone().normalize());
        mesh.quaternion.copy(tmpQ);

        const profile = getProfile(type);
        const projectileSpeed = type === 'flame'
            ? (WEAPON_BALANCE.flamethrower.projectileSpeed || 16)
            : (profile.projectileSpeed || this.getProfile().projectileSpeed || 30);
        const maxDistance = type === 'flame'
            ? (WEAPON_BALANCE.flamethrower.range || 13.5)
            : (profile.range || this.getProfile().range || 60);

        return {
            mesh,
            direction: direction.clone(),
            velocity: direction.clone().multiplyScalar(projectileSpeed),
            speed: projectileSpeed,
            damage: this.damage,
            owner: null,
            knockback,
            gravity,
            lifetime: type === 'flame' ? 0.6 : (type === 'bow' ? 1.6 : 2.8),
            travelled: 0,
            maxDistance,
            align: type === 'bow' ? 'arrow' : null,
            type
        };
    }

    animateAttack() {
        if (!this.mesh) return;
        const originalRotation = this.mesh.rotation.clone();
        const originalPosition = this.mesh.position.clone();

        if (this.type === 'knife') {
            this.mesh.rotation.x = originalRotation.x - 0.6;
            this.mesh.position.z = originalPosition.z - 0.1;
            setTimeout(() => {
                if (!this.mesh) return;
                this.mesh.rotation.copy(originalRotation);
                this.mesh.position.copy(originalPosition);
            }, 120);
        } else if (this.type === 'bow') {
            this.mesh.rotation.z = originalRotation.z - 0.2;
            setTimeout(() => {
                if (!this.mesh) return;
                this.mesh.rotation.copy(originalRotation);
            }, 200);
        } else if (this.type === 'laser' || this.type === 'shotgun' || this.type === 'pistol' || this.type === 'rifle' || this.type === 'machinegun') {
            this.mesh.rotation.x = originalRotation.x - 0.25;
            this.mesh.position.z = originalPosition.z - 0.06;
            setTimeout(() => {
                if (!this.mesh) return;
                this.mesh.rotation.copy(originalRotation);
                this.mesh.position.copy(originalPosition);
            }, 120);
        } else if (this.type === 'sniper') {
            this.mesh.rotation.x = originalRotation.x - 0.35;
            this.mesh.position.z = originalPosition.z - 0.12;
            setTimeout(() => {
                if (!this.mesh) return;
                this.mesh.rotation.copy(originalRotation);
                this.mesh.position.copy(originalPosition);
            }, 180);
        } else if (this.type === 'smg') {
            this.mesh.rotation.x = originalRotation.x - 0.18;
            this.mesh.position.z = originalPosition.z - 0.04;
            setTimeout(() => {
                if (!this.mesh) return;
                this.mesh.rotation.copy(originalRotation);
                this.mesh.position.copy(originalPosition);
            }, 80);
        } else if (this.type === 'crossbow') {
            this.mesh.rotation.z = originalRotation.z - 0.15;
            setTimeout(() => {
                if (!this.mesh) return;
                this.mesh.rotation.copy(originalRotation);
            }, 220);
        } else if (this.type === 'flamethrower') {
            this.mesh.rotation.x = originalRotation.x - 0.12;
            setTimeout(() => {
                if (!this.mesh) return;
                this.mesh.rotation.copy(originalRotation);
            }, 120);
        }
    }

    setVisible(visible) {
        if (this.mesh) this.mesh.visible = visible;
    }

    setPosition(position) {
        if (this.mesh) this.mesh.position.copy(position);
    }

    setRotation(rotation) {
        if (!this.mesh) return;
        const o = getRotationOffsets(this.type);
        this.mesh.rotation.set(rotation.x + o.pitch, rotation.y + o.yaw, rotation.z + o.roll);
    }

    setScale(scale = 1) {
        if (this.mesh) this.mesh.scale.setScalar(scale);
    }

    static getViewPose(type) {
        return getViewPoseForType(type);
    }

    static getThirdPersonGrip(type) {
        return getThirdPersonGripForType(type);
    }

    dispose() {
        if (!this.mesh) return;
        if (this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        } else {
            this.scene?.remove(this.mesh);
        }
        this.mesh = null;
        this._meshChangeListeners.clear();
    }
}
