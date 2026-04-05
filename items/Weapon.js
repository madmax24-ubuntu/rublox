import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const WEAPON_BALANCE = {
    fists: { damage: 8, range: 2.4, cooldown: 0.38, ammo: null, durability: null, projectileSpeed: 0 },
    knife: { damage: 22, range: 3.35, cooldown: 0.42, ammo: null, durability: 80, projectileSpeed: 0 },
    bow: { damage: 20, range: 20, cooldown: 1.18, ammo: 48, durability: null, projectileSpeed: 46 },
    laser: { damage: 23, range: 86, cooldown: 0.34, ammo: 30, durability: null, projectileSpeed: 62 },
    shotgun: { damage: 13, range: 14, cooldown: 0.98, ammo: 36, durability: null, projectileSpeed: 48, pellets: 7 },
    flamethrower: { damage: 3.8, range: 13.5, cooldown: 0.12, ammo: 260, durability: null, projectileSpeed: 16, flameCount: 4 },
    pistol: { damage: 20, range: 62, cooldown: 0.36, ammo: 90, durability: null, projectileSpeed: 82 },
    rifle: { damage: 27, range: 96, cooldown: 0.28, ammo: 120, durability: null, projectileSpeed: 98 }
};

// --- РћРџРўРРњРР—РђР¦РРЇ ---
// РљСЌС€РёСЂСѓРµРј РіРµРѕРјРµС‚СЂРёРё Рё РјР°С‚РµСЂРёР°Р»С‹, С‡С‚РѕР±С‹ РЅРµ СЃРѕР·РґР°РІР°С‚СЊ РёС… РґР»СЏ РєР°Р¶РґРѕРіРѕ РЅРѕРІРѕРіРѕ РѕСЂСѓР¶РёСЏ.
// Р­С‚Рѕ Р·РЅР°С‡РёС‚РµР»СЊРЅРѕ СЃРЅРёР¶Р°РµС‚ РЅР°РіСЂСѓР·РєСѓ РЅР° CPU Рё GPU, СѓРјРµРЅСЊС€Р°СЏ С„СЂРёР·С‹ РїСЂРё СЃРѕР·РґР°РЅРёРё РѕР±СЉРµРєС‚РѕРІ.
const weaponResources = {
    geometries: {},
    materials: {}
};

const weaponAssetCache = {
    loading: new Map(),
    templates: new Map()
};

const WEAPON_ASSET_CONFIG = {
    knife: {
        obj: 'assets/models/weapons/obj/Accessories/Bayonet_2.obj',
        mtl: 'assets/models/weapons/obj/Accessories/Bayonet_2.mtl',
        scale: 0.95,
        rotation: new THREE.Euler(-Math.PI / 2, -Math.PI / 2, 0),
        position: new THREE.Vector3(0, -0.05, 0)
    },
    pistol: {
        obj: 'assets/models/weapons/obj/Pistol_4.obj',
        mtl: 'assets/models/weapons/obj/Pistol_4.mtl',
        scale: 0.65,
        rotation: new THREE.Euler(0, -Math.PI / 2, 0),
        position: new THREE.Vector3(0.04, 0.0, 0)
    },
    rifle: {
        obj: 'assets/models/weapons/obj/AssaultRifle_3.obj',
        mtl: 'assets/models/weapons/obj/AssaultRifle_3.mtl',
        scale: 0.62,
        rotation: new THREE.Euler(0, -Math.PI / 2, 0),
        position: new THREE.Vector3(0.08, 0.0, 0)
    },
    shotgun: {
        obj: 'assets/models/weapons/obj/Shotgun_2.obj',
        mtl: 'assets/models/weapons/obj/Shotgun_2.mtl',
        scale: 0.62,
        rotation: new THREE.Euler(0, -Math.PI / 2, 0),
        position: new THREE.Vector3(0.07, 0.0, 0)
    },
    laser: {
        obj: 'assets/models/weapons/obj/SubmachineGun_4.obj',
        mtl: 'assets/models/weapons/obj/SubmachineGun_4.mtl',
        scale: 0.66,
        rotation: new THREE.Euler(0, -Math.PI / 2, 0),
        position: new THREE.Vector3(0.06, 0.0, 0)
    },
    flamethrower: {
        obj: 'assets/models/weapons/obj/Bullpup_2.obj',
        mtl: 'assets/models/weapons/obj/Bullpup_2.mtl',
        scale: 0.62,
        rotation: new THREE.Euler(0, -Math.PI / 2, 0),
        position: new THREE.Vector3(0.06, 0.0, 0)
    }
};

const sharedLoadingManager = new THREE.LoadingManager();
const _tmpAssetBox = new THREE.Box3();
const _tmpAssetCenter = new THREE.Vector3();
const _tmpAssetSize = new THREE.Vector3();

function getTargetAssetLength(type) {
    if (type === 'knife') return 0.9;
    if (type === 'pistol') return 1.0;
    if (type === 'shotgun') return 1.35;
    if (type === 'rifle') return 1.45;
    if (type === 'laser') return 1.3;
    if (type === 'flamethrower') return 1.4;
    return 1.2;
}

function getDefaultAssetColor(type) {
    if (type === 'knife') return 0xb7b7b7;
    if (type === 'laser') return 0x3f4c5a;
    if (type === 'flamethrower') return 0x4b4b4b;
    if (type === 'shotgun') return 0x5a4c3b;
    if (type === 'pistol') return 0x565656;
    if (type === 'rifle') return 0x4f5f4f;
    return 0x6a6a6a;
}

function sanitizeAssetMaterial(type, mat) {
    if (!mat) return null;
    if (mat.isMeshStandardMaterial || mat.isMeshPhongMaterial || mat.isMeshLambertMaterial || mat.isMeshBasicMaterial) {
        const hasMap = !!mat.map;
        const color = new THREE.Color(hasMap ? 0xffffff : getDefaultAssetColor(type));
        const next = new THREE.MeshStandardMaterial({
            color,
            map: mat.map || null,
            normalMap: mat.normalMap || null,
            roughnessMap: mat.roughnessMap || null,
            metalnessMap: mat.metalnessMap || null,
            aoMap: mat.aoMap || null,
            emissiveMap: mat.emissiveMap || null,
            emissive: 0x000000,
            roughness: hasMap ? 0.62 : 0.45,
            metalness: hasMap ? 0.18 : 0.28,
            flatShading: true
        });
        if (next.map) next.map.colorSpace = THREE.SRGBColorSpace;
        next.needsUpdate = true;
        return next;
    }
    return new THREE.MeshStandardMaterial({
        color: getDefaultAssetColor(type),
        roughness: 0.45,
        metalness: 0.24,
        flatShading: true
    });
}

function normalizeAssetObject(type, obj) {
    _tmpAssetBox.setFromObject(obj);
    if (_tmpAssetBox.isEmpty()) return;

    _tmpAssetBox.getCenter(_tmpAssetCenter);
    _tmpAssetBox.getSize(_tmpAssetSize);
    const maxDim = Math.max(_tmpAssetSize.x, _tmpAssetSize.y, _tmpAssetSize.z, 0.0001);
    const desired = getTargetAssetLength(type);
    const s = desired / maxDim;
    obj.scale.multiplyScalar(s);

    _tmpAssetBox.setFromObject(obj);
    _tmpAssetBox.getCenter(_tmpAssetCenter);
    obj.position.sub(_tmpAssetCenter);
}

function cloneAssetTemplate(type) {
    const template = weaponAssetCache.templates.get(type);
    if (!template) return null;
    const clone = template.clone(true);
    clone.userData.fromAssetTemplate = true;
    clone.traverse(child => {
        if (child.isMesh) {
            child.frustumCulled = false;
            child.castShadow = false;
            child.receiveShadow = false;
            child.userData.fromAssetTemplate = true;
        }
    });
    return clone;
}

function loadWeaponAssetTemplate(type) {
    const cfg = WEAPON_ASSET_CONFIG[type];
    if (!cfg) return Promise.resolve(null);
    if (weaponAssetCache.templates.has(type)) {
        return Promise.resolve(weaponAssetCache.templates.get(type));
    }
    if (weaponAssetCache.loading.has(type)) {
        return weaponAssetCache.loading.get(type);
    }

    const promise = new Promise((resolve) => {
        const mtlLoader = new MTLLoader(sharedLoadingManager);
        const objLoader = new OBJLoader(sharedLoadingManager);
        const lastSlash = Math.max(cfg.mtl.lastIndexOf('/'), cfg.obj.lastIndexOf('/'));
        const resourcePath = lastSlash >= 0 ? cfg.mtl.slice(0, cfg.mtl.lastIndexOf('/') + 1) : '';
        mtlLoader.setResourcePath(resourcePath);

        mtlLoader.load(
            cfg.mtl,
            (materials) => {
                materials.preload();
                objLoader.setMaterials(materials);
                objLoader.load(
                    cfg.obj,
                    (obj) => {
                        const root = new THREE.Group();
                        obj.rotation.copy(cfg.rotation);
                        obj.scale.setScalar(cfg.scale);
                        obj.position.copy(cfg.position);
                        obj.traverse(child => {
                            if (child.isMesh) {
                                child.frustumCulled = false;
                                child.castShadow = false;
                                child.receiveShadow = false;
                                if (child.material) {
                                    if (Array.isArray(child.material)) {
                                        child.material = child.material.map((mat) => sanitizeAssetMaterial(type, mat));
                                    } else {
                                        child.material = sanitizeAssetMaterial(type, child.material);
                                    }
                                }
                            }
                        });
                        normalizeAssetObject(type, obj);
                        root.add(obj);
                        weaponAssetCache.templates.set(type, root);
                        resolve(root);
                    },
                    undefined,
                    () => resolve(null)
                );
            },
            undefined,
            () => resolve(null)
        );
    }).finally(() => {
        weaponAssetCache.loading.delete(type);
    });

    weaponAssetCache.loading.set(type, promise);
    return promise;
}

// РҐРµР»РїРµСЂ РґР»СЏ РїРѕР»СѓС‡РµРЅРёСЏ РёР»Рё СЃРѕР·РґР°РЅРёСЏ РєСЌС€РёСЂРѕРІР°РЅРЅРѕРіРѕ РјР°С‚РµСЂРёР°Р»Р°
function getCachedMaterial(name, creator) {
    if (!weaponResources.materials[name]) {
        weaponResources.materials[name] = creator();
    }
    return weaponResources.materials[name];
}
// --- РљРћРќР•Р¦ РћРџРўРРњРР—РђР¦РР ---

export class Weapon {
    constructor(type, scene, options = {}) {
        this.type = type; // 'knife', 'bow', 'laser', 'shotgun', 'flamethrower', 'pistol', 'rifle'
        this.scene = scene;
        // Asset models remain opt-in because some devices render imported materials incorrectly (black meshes).
        this.useAssetModel = options.useAssetModel === true;
        this.damage = this.getDamage();
        this.range = this.getRange();
        this.cooldown = this.getCooldown();
        this.lastAttackTime = 0;
        this.maxAmmo = this.getMaxAmmo();
        this.ammo = this.maxAmmo;
        this.maxDurability = this.getMaxDurability();
        this.durability = this.maxDurability;
        this.laserColor = this.type === 'laser'
            ? new THREE.Color().setHSL(Math.random(), 0.85, 0.55)
            : null;
        this.mesh = null;
        this.assetSwapPromise = null;
        this._meshChangeListeners = new Set();
        this.createMesh();
        if (this.useAssetModel) {
            this.assetSwapPromise = this.trySwapToAssetModel();
        }
    }

    getProfile() {
        return WEAPON_BALANCE[this.type] || { damage: 12, range: 2, cooldown: 0.5, ammo: null, durability: null, projectileSpeed: 30 };
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

    _createKnifeMesh(group) {
        // --- РћРџРўРРњРР—РђР¦РРЇ ---
        // Р’РјРµСЃС‚Рѕ СЃРѕР·РґР°РЅРёСЏ 5 РѕС‚РґРµР»СЊРЅС‹С… РјРµС€РµР№, РјС‹ РѕР±СЉРµРґРёРЅСЏРµРј РіРµРѕРјРµС‚СЂРёРё СЃ РѕРґРёРЅР°РєРѕРІС‹Рј РјР°С‚РµСЂРёР°Р»РѕРј.
        // Р­С‚Рѕ СЃРѕРєСЂР°С‰Р°РµС‚ РєРѕР»РёС‡РµСЃС‚РІРѕ РІС‹Р·РѕРІРѕРІ РѕС‚СЂРёСЃРѕРІРєРё (draw calls) СЃ 5 РґРѕ 3 РґР»СЏ РєР°Р¶РґРѕРіРѕ РЅРѕР¶Р°.
        // РњРѕРґРµР»СЊ С‚Р°РєР¶Рµ РєСЌС€РёСЂСѓРµС‚СЃСЏ Рё РєР»РѕРЅРёСЂСѓРµС‚СЃСЏ, С‡С‚Рѕ РїРѕС‡С‚Рё РјРѕРјРµРЅС‚Р°Р»СЊРЅРѕ.
        const key = 'knife_model';
        if (weaponResources.geometries[key]) {
            const cachedModel = weaponResources.geometries[key].clone();
            group.add(cachedModel);
            return;
        }

        const bladeMat = getCachedMaterial('knife_blade', () => new THREE.MeshStandardMaterial({ color: 0xd6d6d6, metalness: 0.85, roughness: 0.2, flatShading: true }));
        const handleMat = getCachedMaterial('knife_handle', () => new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.85, flatShading: true }));
        const guardMat = getCachedMaterial('knife_guard', () => new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.5, metalness: 0.3, flatShading: true }));

        // РћР±СЉРµРґРёРЅСЏРµРј РІСЃРµ С‡Р°СЃС‚Рё Р»РµР·РІРёСЏ РІ РѕРґРЅСѓ РіРµРѕРјРµС‚СЂРёСЋ
        const bladeGeom1 = new THREE.BoxGeometry(0.08, 0.5, 0.02);
        bladeGeom1.translate(0, 0.18, 0);
        const bladeGeom2 = new THREE.ConeGeometry(0.05, 0.18, 6);
        bladeGeom2.translate(0, 0.5, 0);
        const mergedBladeGeom = BufferGeometryUtils.mergeBufferGeometries([bladeGeom1, bladeGeom2]);
        const blade = new THREE.Mesh(mergedBladeGeom, bladeMat);

        // Р СѓРєРѕСЏС‚СЊ (СѓР¶Рµ РѕРґРёРЅ РјРµС€, РЅРѕ РґР»СЏ РєРѕРЅСЃРёСЃС‚РµРЅС‚РЅРѕСЃС‚Рё РјРѕР¶РЅРѕ Рё РµРµ РІ РіСЂСѓРїРїСѓ)
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.06), handleMat);
        handle.position.y = -0.18;

        // РћР±СЉРµРґРёРЅСЏРµРј РІСЃРµ С‡Р°СЃС‚Рё РіР°СЂРґС‹ РІ РѕРґРЅСѓ РіРµРѕРјРµС‚СЂРёСЋ
        const guardGeom1 = new THREE.BoxGeometry(0.16, 0.04, 0.06);
        guardGeom1.translate(0, -0.02, 0);
        const guardGeom2 = new THREE.BoxGeometry(0.12, 0.05, 0.06);
        guardGeom2.translate(0, -0.32, 0);
        const mergedGuardGeom = BufferGeometryUtils.mergeBufferGeometries([guardGeom1, guardGeom2]);
        const guard = new THREE.Mesh(mergedGuardGeom, guardMat);

        const model = new THREE.Group();
        model.add(blade, handle, guard);

        // РљСЌС€РёСЂСѓРµРј РІСЃСЋ РјРѕРґРµР»СЊ РґР»СЏ Р±СѓРґСѓС‰РµРіРѕ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ
        weaponResources.geometries[key] = model;
        group.add(model.clone());
    }

    _createBowMesh(group) {
        const key = 'bow_model';
        if (weaponResources.geometries[key]) {
            const cachedModel = weaponResources.geometries[key].clone();
            group.add(cachedModel);
            return;
        }

        const limbMat = getCachedMaterial('bow_limb', () => new THREE.MeshStandardMaterial({
            color: 0x7a4a20,
            roughness: 0.6,
            flatShading: true
        }));
        const gripMat = getCachedMaterial('bow_grip', () => new THREE.MeshStandardMaterial({
            color: 0x2d1b12,
            roughness: 0.75,
            flatShading: true
        }));
        const tipMat = getCachedMaterial('bow_tip', () => new THREE.MeshStandardMaterial({
            color: 0x8d8d8d,
            metalness: 0.45,
            roughness: 0.45,
            flatShading: true
        }));

        const limbSegmentsData = [
            { x: -0.16, y: 0.82, w: 0.12, h: 0.28, r: 0.48 },
            { x: -0.02, y: 0.5, w: 0.12, h: 0.27, r: 0.28 },
            { x: 0.06, y: 0.18, w: 0.11, h: 0.24, r: 0.12 },
            { x: 0.06, y: -0.18, w: 0.11, h: 0.24, r: -0.12 },
            { x: -0.02, y: -0.5, w: 0.12, h: 0.27, r: -0.28 },
            { x: -0.16, y: -0.82, w: 0.12, h: 0.28, r: -0.48 }
        ];

        const limbGeometries = [];
        for (const seg of limbSegmentsData) {
            const limbGeom = new THREE.BoxGeometry(seg.w, seg.h, 0.09);
            limbGeom.translate(seg.x, seg.y, 0);
            limbGeom.rotateZ(seg.r);
            limbGeometries.push(limbGeom);
        }
        const mergedLimbGeom = BufferGeometryUtils.mergeBufferGeometries(limbGeometries);
        const limbs = new THREE.Mesh(mergedLimbGeom, limbMat);

        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.11), gripMat);
        grip.position.set(0.01, 0, 0);

        const rest = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.06), gripMat);
        rest.position.set(0.12, 0.05, 0);

        const tipTopGeom = new THREE.BoxGeometry(0.06, 0.12, 0.07);
        tipTopGeom.translate(-0.21, 1.0, 0);
        const tipBottomGeom = new THREE.BoxGeometry(0.06, 0.12, 0.07);
        tipBottomGeom.translate(-0.21, -1.0, 0);
        const mergedTipGeom = BufferGeometryUtils.mergeBufferGeometries([tipTopGeom, tipBottomGeom]);
        const tips = new THREE.Mesh(mergedTipGeom, tipMat);

        const stringMat = new THREE.LineBasicMaterial({ color: 0x111111 });
        const string = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-0.21, 1.0, 0),
                new THREE.Vector3(0.14, 0, 0),
                new THREE.Vector3(-0.21, -1.0, 0)
            ]),
            stringMat
        );

        const model = new THREE.Group();
        model.add(limbs, grip, rest, tips, string);
        model.scale.setScalar(0.82);

        weaponResources.geometries[key] = model;
        group.add(model.clone());
    }

    _createLaserMesh(group) {
        const key = 'laser_model';
        if (weaponResources.geometries[key]) {
            const cachedModel = weaponResources.geometries[key].clone();
            group.add(cachedModel);
            return;
        }

        const bodyMat = getCachedMaterial('laser_body', () => new THREE.MeshStandardMaterial({
            color: 0x2b2b2b,
            metalness: 0.7,
            roughness: 0.35,
            flatShading: true
        }));
        const accentMat = getCachedMaterial('laser_accent', () => new THREE.MeshStandardMaterial({
            color: this.laserColor,
            emissive: this.laserColor,
            emissiveIntensity: 0.65,
            roughness: 0.2,
            flatShading: true
        }));
        const laserGripMat = getCachedMaterial('laser_grip', () => new THREE.MeshStandardMaterial({
            color: 0x1c1c1c,
            metalness: 0.4,
            roughness: 0.6,
            flatShading: true
        }));

        const bodyGeom = new THREE.BoxGeometry(0.62, 0.2, 0.2);
        bodyGeom.translate(0, 0.03, 0);
        const stockGeom = new THREE.BoxGeometry(0.22, 0.16, 0.16);
        stockGeom.translate(-0.33, 0.02, 0);
        const mergedBodyGeom = BufferGeometryUtils.mergeBufferGeometries([bodyGeom, stockGeom]);
        const bodyMesh = new THREE.Mesh(mergedBodyGeom, bodyMat);

        const barrelGeom = new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8);
        barrelGeom.rotateZ(Math.PI / 2);
        barrelGeom.translate(0.38, 0.05, 0);
        const barrelMesh = new THREE.Mesh(barrelGeom, bodyMat);

        const muzzleGeom = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 8);
        muzzleGeom.rotateZ(Math.PI / 2);
        muzzleGeom.translate(0.63, 0.05, 0);
        const coreGeom = new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8);
        coreGeom.rotateZ(Math.PI / 2);
        coreGeom.translate(0.18, 0.06, 0);
        const cellGeom = new THREE.BoxGeometry(0.12, 0.18, 0.12);
        cellGeom.translate(-0.02, -0.05, 0);
        const mergedAccentGeom = BufferGeometryUtils.mergeBufferGeometries([muzzleGeom, coreGeom, cellGeom]);
        const accentMesh = new THREE.Mesh(mergedAccentGeom, accentMat);

        const laserGripGeom = new THREE.BoxGeometry(0.14, 0.26, 0.12);
        laserGripGeom.translate(-0.1, -0.18, 0);
        const railGeom = new THREE.BoxGeometry(0.42, 0.05, 0.12);
        railGeom.translate(0.02, 0.16, 0);
        const mergedGripRailGeom = BufferGeometryUtils.mergeBufferGeometries([laserGripGeom, railGeom]);
        const gripRailMesh = new THREE.Mesh(mergedGripRailGeom, laserGripMat);

        const model = new THREE.Group();
        model.add(bodyMesh, barrelMesh, accentMesh, gripRailMesh);
        model.rotation.y = -Math.PI / 2;

        weaponResources.geometries[key] = model;
        group.add(model.clone());
    }

    _createPistolMesh(group) {
        const key = 'pistol_model';
        if (weaponResources.geometries[key]) {
            const cachedModel = weaponResources.geometries[key].clone();
            group.add(cachedModel);
            return;
        }

        const gunMat = getCachedMaterial('pistol_gun', () => new THREE.MeshStandardMaterial({ color: 0x3b3b3b, roughness: 0.45, flatShading: true }));
        const gripMat = getCachedMaterial('pistol_grip', () => new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, flatShading: true }));

        const bodyGeom = new THREE.BoxGeometry(0.46, 0.18, 0.16);
        bodyGeom.translate(0.05, 0.06, 0);
        const barrelGeom = new THREE.BoxGeometry(0.28, 0.08, 0.08);
        barrelGeom.translate(0.36, 0.06, 0);
        const slideGeom = new THREE.BoxGeometry(0.38, 0.08, 0.18);
        slideGeom.translate(0.08, 0.16, 0);
        const mergedGunGeom = BufferGeometryUtils.mergeBufferGeometries([bodyGeom, barrelGeom, slideGeom]);
        const gunMesh = new THREE.Mesh(mergedGunGeom, gunMat);

        const gripGeom = new THREE.BoxGeometry(0.16, 0.26, 0.12);
        gripGeom.translate(-0.08, -0.14, 0);
        const gripMesh = new THREE.Mesh(gripGeom, gripMat);

        const model = new THREE.Group();
        model.add(gunMesh, gripMesh);
        model.rotation.y = -Math.PI / 2;

        weaponResources.geometries[key] = model;
        group.add(model.clone());
    }

    _createRifleMesh(group) {
        const key = 'rifle_model';
        if (weaponResources.geometries[key]) {
            const cachedModel = weaponResources.geometries[key].clone();
            group.add(cachedModel);
            return;
        }

        const gunMat = getCachedMaterial('rifle_gun', () => new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.45, flatShading: true }));
        const stockMat = getCachedMaterial('rifle_stock', () => new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.7, flatShading: true }));

        const bodyGeom = new THREE.BoxGeometry(0.9, 0.16, 0.14);
        bodyGeom.translate(0.1, 0.06, 0);
        const barrelGeom = new THREE.BoxGeometry(1.0, 0.08, 0.08);
        barrelGeom.translate(0.65, 0.06, 0);
        const magGeom = new THREE.BoxGeometry(0.12, 0.24, 0.1);
        magGeom.translate(0.12, -0.1, 0);
        const sightGeom = new THREE.BoxGeometry(0.18, 0.06, 0.1);
        sightGeom.translate(0.05, 0.18, 0);
        const mergedGunGeom = BufferGeometryUtils.mergeBufferGeometries([bodyGeom, barrelGeom, magGeom, sightGeom]);
        const gunMesh = new THREE.Mesh(mergedGunGeom, gunMat);

        const stockGeom = new THREE.BoxGeometry(0.4, 0.2, 0.14);
        stockGeom.translate(-0.35, 0.04, 0);
        const gripGeom = new THREE.BoxGeometry(0.14, 0.2, 0.12);
        gripGeom.translate(-0.02, -0.14, 0);
        const mergedStockGripGeom = BufferGeometryUtils.mergeBufferGeometries([stockGeom, gripGeom]);
        const stockGripMesh = new THREE.Mesh(mergedStockGripGeom, stockMat);

        const model = new THREE.Group();
        model.add(gunMesh, stockGripMesh);
        model.rotation.y = -Math.PI / 2;

        weaponResources.geometries[key] = model;
        group.add(model.clone());
    }

    _createShotgunMesh(group) {
        const key = 'shotgun_model';
        if (weaponResources.geometries[key]) {
            const cachedModel = weaponResources.geometries[key].clone();
            group.add(cachedModel);
            return;
        }

        const gunMat = getCachedMaterial('shotgun_gun', () => new THREE.MeshStandardMaterial({ color: 0x4b4b4b, roughness: 0.5, flatShading: true }));
        const woodMat = getCachedMaterial('shotgun_wood', () => new THREE.MeshStandardMaterial({ color: 0x6b3f1c, roughness: 0.7, flatShading: true }));

        const barrel1Geom = new THREE.BoxGeometry(0.8, 0.08, 0.08);
        barrel1Geom.translate(0.35, 0.05, 0);
        const barrel2Geom = new THREE.BoxGeometry(0.8, 0.08, 0.08);
        barrel2Geom.translate(0.35, -0.05, 0);
        const bodyGeom = new THREE.BoxGeometry(0.35, 0.16, 0.12);
        bodyGeom.translate(-0.1, 0, 0);
        const mergedGunGeom = BufferGeometryUtils.mergeBufferGeometries([barrel1Geom, barrel2Geom, bodyGeom]);
        const gunMesh = new THREE.Mesh(mergedGunGeom, gunMat);

        const stockGeom = new THREE.BoxGeometry(0.42, 0.16, 0.14);
        stockGeom.translate(-0.4, 0, 0);
        const shotgunGripGeom = new THREE.BoxGeometry(0.12, 0.18, 0.1);
        shotgunGripGeom.translate(-0.18, -0.18, 0);
        const pumpGeom = new THREE.BoxGeometry(0.26, 0.12, 0.12);
        pumpGeom.translate(0.2, -0.05, 0);
        const mergedWoodGeom = BufferGeometryUtils.mergeBufferGeometries([stockGeom, shotgunGripGeom, pumpGeom]);
        const woodMesh = new THREE.Mesh(mergedWoodGeom, woodMat);

        const model = new THREE.Group();
        model.add(gunMesh, woodMesh);
        model.rotation.y = -Math.PI / 2;

        weaponResources.geometries[key] = model;
        group.add(model.clone());
    }

    _createFlamethrowerMesh(group) {
        const key = 'flamethrower_model';
        if (weaponResources.geometries[key]) {
            const cachedModel = weaponResources.geometries[key].clone();
            group.add(cachedModel);
            return;
        }

        const metalMat = getCachedMaterial('flamethrower_metal', () => new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, flatShading: true }));
        const tankMat = getCachedMaterial('flamethrower_tank', () => new THREE.MeshStandardMaterial({ color: 0x8e9aa2, roughness: 0.4, flatShading: true }));

        const bodyGeom = new THREE.BoxGeometry(0.6, 0.22, 0.22);
        bodyGeom.translate(0, 0, 0);
        const nozzleGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8);
        nozzleGeom.rotateZ(Math.PI / 2);
        nozzleGeom.translate(0.45, 0.02, 0);
        const flameGripGeom = new THREE.BoxGeometry(0.12, 0.2, 0.12);
        flameGripGeom.translate(-0.05, -0.2, 0);
        const mergedMetalGeom = BufferGeometryUtils.mergeBufferGeometries([bodyGeom, nozzleGeom, flameGripGeom]);
        const metalMesh = new THREE.Mesh(mergedMetalGeom, metalMat);

        const tankGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.4, 8);
        tankGeom.translate(-0.35, -0.12, 0);
        const tankMesh = new THREE.Mesh(tankGeom, tankMat);

        const model = new THREE.Group();
        model.add(metalMesh, tankMesh);
        model.rotation.y = -Math.PI / 2;

        weaponResources.geometries[key] = model;
        group.add(model.clone());
    }

    createMesh() {
        const group = new THREE.Group();

        switch(this.type) {
            case 'fists':
                this.mesh = null;
                return;
            case 'knife':
                this._createKnifeMesh(group);
                break;

            case 'bow': {
                this._createBowMesh(group);
                break;
            }

            case 'laser':
                this._createLaserMesh(group);
                break;
            case 'pistol': {
                this._createPistolMesh(group);
                break;
            }
            case 'rifle': {
                this._createRifleMesh(group);
                break;
            }
            case 'shotgun': {
                this._createShotgunMesh(group);
                break;
            }
            case 'flamethrower': {
                this._createFlamethrowerMesh(group);
                break;
            }
        }

        this.mesh = group;
        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }

    trySwapToAssetModel() {
        const cfg = WEAPON_ASSET_CONFIG[this.type];
        if (!cfg || !this.scene || !this.mesh) return Promise.resolve(false);

        return loadWeaponAssetTemplate(this.type).then((template) => {
            if (!template || !this.mesh || !this.scene) return;

            const clone = cloneAssetTemplate(this.type);
            if (!clone) return;

            if (this.type === 'laser' && this.laserColor) {
                this.applyLaserTint(clone);
            }
            if (this.type === 'flamethrower') {
                const tankMat = getCachedMaterial('flame_asset_tank', () => new THREE.MeshStandardMaterial({
                    color: 0x8e9aa2,
                    roughness: 0.4,
                    metalness: 0.35,
                    flatShading: true
                }));
                const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.35, 8), tankMat);
                tank.position.set(-0.18, -0.18, 0);
                clone.add(tank);
            }

            const old = this.mesh;
            clone.visible = old.visible;
            clone.position.copy(old.position);
            clone.rotation.copy(old.rotation);

            this.scene.remove(old);
            this.mesh = clone;
            this.scene.add(this.mesh);
            this.notifyMeshChanged();
            return true;
        }).catch(() => {
            // Keep fallback procedural model.
            return false;
        });
    }

    onMeshChanged(callback) {
        if (typeof callback !== 'function') return () => {};
        this._meshChangeListeners.add(callback);
        return () => this._meshChangeListeners.delete(callback);
    }

    notifyMeshChanged() {
        if (!this._meshChangeListeners.size) return;
        for (const cb of [...this._meshChangeListeners]) {
            try {
                cb(this.mesh);
            } catch {
                // Ignore listener errors.
            }
        }
    }

    applyLaserTint(root) {
        root.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            if (Array.isArray(child.material)) {
                child.material = child.material.map((mat) => {
                    const clone = mat.clone();
                    const hsl = clone.color.getHSL({ h: 0, s: 0, l: 0 });
                    if (hsl.l > 0.08) {
                        clone.color.copy(this.laserColor);
                        clone.emissive = this.laserColor.clone();
                        clone.emissiveIntensity = 0.35;
                        clone.needsUpdate = true;
                    }
                    return clone;
                });
            } else {
                const mat = child.material.clone();
                const hsl = mat.color.getHSL({ h: 0, s: 0, l: 0 });
                if (hsl.l > 0.08) {
                    mat.color.copy(this.laserColor);
                    mat.emissive = this.laserColor.clone();
                    mat.emissiveIntensity = 0.35;
                    mat.needsUpdate = true;
                }
                child.material = mat;
            }
        });
    }

    attack(owner, target, audioSynth, directionOverride = null, options = null) {
        const currentTime = performance.now() / 1000;
        if (currentTime - this.lastAttackTime < this.cooldown) {
            return false;
        }

        if (this.type === 'knife' && this.durability !== null && this.durability <= 0) {
            return false;
        }
        if ((this.type === 'bow' || this.type === 'laser' || this.type === 'shotgun' || this.type === 'flamethrower' || this.type === 'pistol' || this.type === 'rifle') && this.ammo !== null && this.ammo <= 0) {
            return false;
        }

        this.lastAttackTime = currentTime;
        this.animateAttack();

        if (audioSynth) {
            if (this.type === 'knife') {
                audioSynth.playHit();
            } else if (this.type === 'bow') {
                audioSynth.playBowShot();
            } else if (this.type === 'laser') {
                audioSynth.playLaser();
            } else if (this.type === 'shotgun') {
                audioSynth.playShotgun?.();
            } else if (this.type === 'flamethrower') {
                audioSynth.playFlamethrower?.();
            } else if (this.type === 'pistol') {
                audioSynth.playShotgun?.(0.65);
            } else if (this.type === 'rifle') {
                audioSynth.playShotgun?.(0.75);
            }
        }

        if (this.type === 'fists') {
            if (audioSynth) audioSynth.playHit();
            return this.meleeAttack(owner, target);
        } else if (this.type === 'knife') {
            return this.meleeAttack(owner, target);
        }
        return this.rangedAttack(owner, target, directionOverride, options || {});
    }

    meleeAttack(owner, target) {
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
        if (!direction && target && target.position) {
            direction = new THREE.Vector3()
                .subVectors(target.position, owner.position)
                .normalize();
        }

        if (!direction) return false;
        if (this.ammo !== null) {
            this.ammo = Math.max(0, this.ammo - 1);
        }

        if (this.type === 'shotgun') {
            const pellets = [];
            const pelletCount = this.getProfile().pellets || 8;
            for (let i = 0; i < pelletCount; i++) {
                const spread = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.2,
                    (Math.random() - 0.5) * 0.14,
                    (Math.random() - 0.5) * 0.2
                );
                const dir = direction.clone().add(spread).normalize();
                const pellet = this.createProjectile(owner.position.clone(), dir);
                pellet.lifetime = Math.max(0.2, this.getProfile().range / Math.max(1, pellet.speed));
                pellet.damage = this.damage;
                pellets.push(pellet);
            }
            return { hit: false, projectiles: pellets };
        }
        if (this.type === 'flamethrower') {
            const flames = [];
            const flameCount = this.getProfile().flameCount || 3;
            for (let i = 0; i < flameCount; i++) {
                const spread = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.1,
                    (Math.random() - 0.5) * 0.05,
                    (Math.random() - 0.5) * 0.1
                );
                const dir = direction.clone().add(spread).normalize();
                flames.push(this.createProjectile(owner.position.clone(), dir, 'flame'));
            }
            return { hit: false, projectiles: flames };
        }
        const projectile = this.createProjectile(owner.position.clone(), direction);
        if (this.type === 'bow') {
            const chargeRatio = Math.max(0.35, Math.min(1, options.chargeRatio ?? 1));
            projectile.damage = Math.round(this.damage * (0.4 + chargeRatio * 0.85));
            projectile.speed = 30 + chargeRatio * 52;
            projectile.velocity.copy(direction).multiplyScalar(projectile.speed);
            projectile.gravity = Math.max(0.008, 0.028 - chargeRatio * 0.017);
            projectile.knockback = 3.4 + chargeRatio * 2.8;
        }
        return { hit: false, projectile };
    }

    createProjectile(startPos, direction, overrideType = null) {
        let mesh;
        let knockback = 4;
        let gravity = 0;
        const type = overrideType || this.type;

        if (type === 'laser') {
            const geometry = new THREE.SphereGeometry(0.1, 8, 8);
            const material = new THREE.MeshStandardMaterial({
                color: this.laserColor || 0x00ffff,
                emissive: this.laserColor || 0x00ffff,
                emissiveIntensity: 0.6,
                roughness: 0.2,
                flatShading: true
            });
            mesh = new THREE.Mesh(geometry, material);
            knockback = 3;
        } else if (type === 'bow') {
            const group = new THREE.Group();
            const shaftMat = new THREE.MeshStandardMaterial({
                color: 0x9a6230,
                roughness: 0.55,
                flatShading: true
            });
            const tipMat = new THREE.MeshStandardMaterial({
                color: 0xc4c7cc,
                metalness: 0.78,
                roughness: 0.18,
                flatShading: true
            });
            const fletchMat = new THREE.MeshStandardMaterial({
                color: 0xf0f4ff,
                emissive: 0x8aa4ff,
                emissiveIntensity: 0.12,
                roughness: 0.62,
                flatShading: true
            });

            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 1.95, 6), shaftMat);
            shaft.rotation.z = Math.PI / 2;
            group.add(shaft);

            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.3, 6), tipMat);
            tip.position.x = 1.1;
            tip.rotation.z = -Math.PI / 2;
            group.add(tip);

            const collar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.11), tipMat);
            collar.position.x = 0.92;
            group.add(collar);

            const fletch1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.03), fletchMat);
            fletch1.position.x = -0.9;
            fletch1.position.y = 0.1;
            group.add(fletch1);
            const fletch2 = fletch1.clone();
            fletch2.position.y = -0.1;
            group.add(fletch2);
            const fletch3 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.12), fletchMat);
            fletch3.position.x = -0.9;
            group.add(fletch3);

            const glow = new THREE.Mesh(
                new THREE.SphereGeometry(0.065, 6, 6),
                new THREE.MeshBasicMaterial({
                    color: 0xf3f7ff,
                    transparent: true,
                    opacity: 0.72
                })
            );
            glow.position.x = -0.9;
            group.add(glow);
            group.scale.setScalar(1.1);
            group.traverse(child => {
                child.frustumCulled = false;
                if (child.isMesh) {
                    child.renderOrder = 6;
                }
            });

            mesh = group;
            knockback = 6;
            gravity = 0.02;
        } else if (type === 'pistol' || type === 'rifle') {
            const bulletMat = new THREE.MeshStandardMaterial({
                color: 0xffd54f,
                emissive: 0xffc107,
                emissiveIntensity: 0.35,
                roughness: 0.3,
                flatShading: true
            });
            const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), bulletMat);
            bullet.rotation.z = Math.PI / 2;
            mesh = bullet;
            knockback = type === 'rifle' ? 4 : 3;
        } else if (type === 'flame') {
            const flameMat = new THREE.MeshStandardMaterial({
                color: 0xff6d00,
                emissive: 0xff8f00,
                emissiveIntensity: 0.7,
                transparent: true,
                opacity: 0.8,
                roughness: 0.4
            });
            const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 6), flameMat);
            flame.rotation.z = Math.PI / 2;
            mesh = flame;
            knockback = 2;
            gravity = 0;
        } else {
            const geometry = new THREE.ConeGeometry(0.1, 0.3, 8);
            const material = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8, flatShading: true });
            mesh = new THREE.Mesh(geometry, material);
        }

        mesh.position.copy(startPos);
        if (type === 'bow') {
            const forward = new THREE.Vector3(1, 0, 0);
            const quat = new THREE.Quaternion().setFromUnitVectors(forward, direction.clone().normalize());
            mesh.quaternion.copy(quat);
        } else {
            mesh.lookAt(startPos.clone().add(direction));
        }

        const projectileSpeed = type === 'flame'
            ? (WEAPON_BALANCE.flamethrower.projectileSpeed || 16)
            : (WEAPON_BALANCE[type]?.projectileSpeed || this.getProfile().projectileSpeed || 30);

        const maxDistance = type === 'flame'
            ? (WEAPON_BALANCE.flamethrower.range || 13.5)
            : (WEAPON_BALANCE[type]?.range || this.getProfile().range || 60);

        return {
            mesh,
            direction: direction.clone(),
            velocity: direction.clone().multiplyScalar(projectileSpeed),
            speed: projectileSpeed,
            damage: this.damage,
            owner: null,
            knockback,
            gravity,
            lifetime: type === 'flame' ? 0.6 : 5,
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
        const animate = () => {
        if (this.type === 'knife') {
            this.mesh.rotation.x = originalRotation.x - 0.6;
            this.mesh.position.z = originalPosition.z - 0.1;
            setTimeout(() => {
                this.mesh.rotation.copy(originalRotation);
                this.mesh.position.copy(originalPosition);
            }, 120);
        } else if (this.type === 'bow') {
            this.mesh.rotation.z = originalRotation.z - 0.2;
            setTimeout(() => {
                this.mesh.rotation.copy(originalRotation);
            }, 200);
        } else if (this.type === 'laser' || this.type === 'shotgun' || this.type === 'pistol' || this.type === 'rifle') {
            this.mesh.rotation.x = originalRotation.x - 0.25;
            this.mesh.position.z = originalPosition.z - 0.06;
            setTimeout(() => {
                this.mesh.rotation.copy(originalRotation);
                this.mesh.position.copy(originalPosition);
            }, 120);
        } else if (this.type === 'flamethrower') {
            this.mesh.rotation.x = originalRotation.x - 0.12;
            setTimeout(() => {
                this.mesh.rotation.copy(originalRotation);
            }, 120);
        }
    };

        animate();
    }

    setVisible(visible) {
        if (this.mesh) {
            this.mesh.visible = visible;
        }
    }

    setPosition(position) {
        if (this.mesh) {
            this.mesh.position.copy(position);
        }
    }

    setRotation(rotation) {
        if (this.mesh) {
            let yawOffset = 0;
            let pitchOffset = 0;
            let rollOffset = 0;
            if (
                this.type === 'laser'
                || this.type === 'shotgun'
                || this.type === 'flamethrower'
                || this.type === 'pistol'
                || this.type === 'rifle'
            ) {
                yawOffset = Math.PI / 2;
            } else if (this.type === 'bow' || this.type === 'knife') {
                pitchOffset = -Math.PI / 2;
            }
            this.mesh.rotation.set(rotation.x + pitchOffset, rotation.y + yawOffset, rotation.z + rollOffset);
        }
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.traverse(child => {
                if (child.userData?.fromAssetTemplate) return;
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat?.dispose?.());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
    }

    createWoodTexture(primary, secondary, dark) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = primary;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = secondary;
        for (let y = 0; y < canvas.height; y += 10) {
            ctx.fillRect(0, y, canvas.width, 6);
        }
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        for (let x = 0; x < canvas.width; x += 12) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        return new THREE.CanvasTexture(canvas);
    }

    createBowTexture(primary, secondary, dark) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = primary;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = secondary;
        for (let y = 0; y < canvas.height; y += 8) {
            ctx.fillRect(0, y, canvas.width, 4);
        }
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2;
        for (let x = 0; x < canvas.width; x += 12) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + 6, canvas.height);
            ctx.stroke();
        }
        return new THREE.CanvasTexture(canvas);
    }
}

