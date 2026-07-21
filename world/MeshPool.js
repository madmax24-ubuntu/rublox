import * as THREE from 'three';

/**
 * MeshPool — предзарегистрированные геометрии и материалы.
 *
 * Ключевая идея: вместо создания нового Geometry/Material для каждого объекта,
 * выбираем ближайший из фиксированного набора. Это позволяет InstancedMesh
 * группировать объекты с одинаковыми геометриями/материалами.
 *
 * Ключи геометрий совпадают с InstancedMesh._getGeoKey для совместимости.
 */
export class MeshPool {
    constructor() {
        this.geos = new Map();
        this.mats = new Map();
        this._initGeos();
        this._initMats();
    }

    static addPolygonOffset(mat, factor = 1, units = 1) {
        if (mat.transparent) return;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = factor;
        mat.polygonOffsetUnits = units;
    }

    // ─── Геометрии — ключи совпадают с InstancedMesh._getGeoKey ──

    _initGeos() {
        // Цилиндры: 4 радиуса × 7 высот = 112 геометрий (4 radial seg for perf)
        // Ключ: Cylinder_bot_top_h_radial_heightSeg (совпадает с _getGeoKey)
        const trunkR = [0.3, 0.5, 0.8, 1.2];
        const trunkH = [4, 6, 8, 10, 12, 14, 16];
        for (const top of trunkR) {
            for (const bot of trunkR) {
                for (const h of trunkH) {
                    const key = `Cylinder_${bot}_${top}_${h}_4_1`;
                    this.geos.set(key, new THREE.CylinderGeometry(bot, top, h, 4));
                }
            }
        }

        // Конусы: 4 радиуса × 4 высот = 16 геометрий (5 radial seg for perf)
        const coneR = [1.5, 2.5, 3.5, 4.5];
        const coneH = [2, 3, 4, 5];
        for (const r of coneR) {
            for (const h of coneH) {
                this.geos.set(`Cone_${r}_${h}_5_1`, new THREE.ConeGeometry(r, h, 5));
            }
        }

        // Сферы: 4 радиуса = 4 геометрии (3x3 seg for perf)
        for (const r of [0.15, 0.3, 0.5, 0.8]) {
            this.geos.set(`Sphere_${r}_3_3`, new THREE.SphereGeometry(r, 3, 3));
        }

        // Додакаэдры: 13 радиусов = 13 геометрий
        for (const r of [0.3, 0.5, 0.8, 1.2, 2, 3, 5, 6, 8, 10, 15, 20, 30]) {
            this.geos.set(`Dodeca_${r}_0`, new THREE.DodecahedronGeometry(r, 0));
        }

        // Боксы: 5×4×5 = 100 геометрий
        const bw = [0.3, 0.5, 1, 2, 3];
        const bh = [0.2, 0.3, 0.5, 1];
        const bd = [0.3, 0.5, 1, 2, 3];
        for (const w of bw) for (const h of bh) for (const d of bd) {
            this.geos.set(`Box_${w}_${h}_${d}_0_0_0`, new THREE.BoxGeometry(w, h, d));
        }

        // Плоскости: 9×9 = 81 геометрия (от 2×2 до 512×512)
        const pw = [2, 4, 8, 16, 32, 64, 128, 256, 512];
        const ph = [2, 4, 8, 16, 32, 64, 128, 256, 512];
        for (const w of pw) for (const h of ph) {
            this.geos.set(`Plane_${w}_${h}_1_1`, new THREE.PlaneGeometry(w, h));
        }

        // Октаэдры: 4 радиуса = 4 геометрии (для кристаллов)
        for (const r of [0.3, 0.5, 0.8, 1.2]) {
            this.geos.set(`Octa_${r}_0`, new THREE.OctahedronGeometry(r, 0));
        }

        // Тор: 3 варианта (для банд на фонтанах)
        const torusR = [0.55, 0.6];
        for (const r of torusR) {
            this.geos.set(`Torus_${r}_0.04_6_12`, new THREE.TorusGeometry(r, 0.04, 6, 12));
        }
    }

    // ─── Материалы ──────────────────────────────────────────────

    _initMats() {
        // Стволы: коричневый с разными оттенками
        for (const c of [0x5d4037, 0x6d4c41, 0x8B4513, 0xA0522D]) {
            this.mats.set(`Std_${c}_0.9_0_F`, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
        }

        // Крона сосны: тёмно-зелёный
        for (const c of [0x1b5e20, 0x2e7d32, 0x388e3c]) {
            this.mats.set(`Std_${c}_0.9_0_F`, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
        }

        // Крона дуба: зелёный
        for (const c of [0x33691e, 0x4caf50, 0x66bb6a]) {
            this.mats.set(`Std_${c}_0.9_0_F`, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
        }

        // Крона ели: тёмно-зелёный/бирюзовый
        for (const c of [0x004d40, 0x00695c, 0x00897b]) {
            this.mats.set(`Std_${c}_0.9_0_F`, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
        }

        // Крона берёзы: светло-зелёный
        for (const c of [0x7cb342, 0x8bc34a, 0x9ccc65]) {
            this.mats.set(`Std_${c}_0.9_0_F`, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
        }

        // Берёзовый ствол: белый
        this.mats.set(`Std_f5f5f5_0.6_0_N`, new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 }));

        // Камни: серый
        for (const c of [0x757575, 0x9e9e9e, 0xbdbdbd]) {
            this.mats.set(`Std_${c}_0.8_0_F`, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true }));
        }

        // Мхи: зелёный
        for (const c of [0x33691e, 0x4caf50]) {
            this.mats.set(`Std_${c}_0.9_0_F`, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
        }

        // Пол/река и т.д.
        this.mats.set(`Std_888888_0.9_0_F`, new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9, flatShading: true }));
        this.mats.set(`Std_4488cc_0.5_0.3_N`, new THREE.MeshStandardMaterial({ color: 0x4488cc, roughness: 0.5, metalness: 0.3 }));

        // Кристаллы
        this.mats.set(`Std_7c4dff_0.2_0.8_F`, new THREE.MeshStandardMaterial({ color: 0x7c4dff, roughness: 0.2, metalness: 0.8, flatShading: true }));

        // Светлячки
        this.mats.set(`Std_feee58_0.9_0_F`, new THREE.MeshStandardMaterial({ color: 0xffee58, emissive: 0xffcc00, emissiveIntensity: 10, transparent: true, opacity: 0.9, flatShading: true }));

        // Факелы
        this.mats.set(`Std_ff6d00_0.9_0_F`, new THREE.MeshStandardMaterial({ color: 0xff6d00, emissive: 0xff4500, emissiveIntensity: 5, transparent: true, opacity: 0.8, flatShading: true }));

        // Деревянные стены/пол
        this.mats.set(`Std_8B6914_0.9_0_F`, new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9, flatShading: true }));

        // Каменные стены
        this.mats.set(`Std_757575_0.9_0_F`, new THREE.MeshStandardMaterial({ color: 0x757575, roughness: 0.9, flatShading: true }));

        // Тёмные стены
        this.mats.set(`Std_3e2723_0.9_0_F`, new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9, flatShading: true }));

        // Стекло (окна)
        this.mats.set(`Std_aaddff_0.1_0.5_N`, new THREE.MeshStandardMaterial({ color: 0xaaddff, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.3 }));

        // Трава (пол леса)
        this.mats.set(`Std_66bb6a_1.0_0_N`, new THREE.MeshStandardMaterial({ color: 0x66bb6a, roughness: 1.0 }));

        // Песок (тропы)
        this.mats.set(`Std_d4a76a_1.0_0_F`, new THREE.MeshStandardMaterial({ color: 0xd4a76a, roughness: 1.0, flatShading: true }));

        // Сталь (решётки)
        this.mats.set(`Std_aaaaaa_0.3_0.9_N`, new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.9 }));
    }

    // ─── Snap — выбрать ближайший предзарегистрированный размер ──

    _snap(value, steps) {
        let best = steps[0];
        let bestDist = Math.abs(value - best);
        for (let i = 1; i < steps.length; i++) {
            const d = Math.abs(value - steps[i]);
            if (d < bestDist) { best = steps[i]; bestDist = d; }
        }
        return best;
    }

    // ─── API — получить ближайшую геометрию ────────────────────

    getGeoCylinder(bottomR, topR, height) {
        const br = this._size(bottomR), tr = this._size(topR), h = this._size(height);
        const key = `Cylinder_${br}_${tr}_${h}_8_1`;
        if (!this.geos.has(key)) this.geos.set(key, new THREE.CylinderGeometry(br, tr, h, 8));
        return this.geos.get(key);
    }

    getGeoCone(radius, height) {
        const r = this._size(radius), h = this._size(height);
        const key = `Cone_${r}_${h}_8_1`;
        if (!this.geos.has(key)) this.geos.set(key, new THREE.ConeGeometry(r, h, 8));
        return this.geos.get(key);
    }

    getGeoSphere(radius) {
        const r = this._size(radius);
        const key = `Sphere_${r}_8_6`;
        if (!this.geos.has(key)) this.geos.set(key, new THREE.SphereGeometry(r, 8, 6));
        return this.geos.get(key);
    }

    getGeoDodecahedron(radius) {
        const r = this._size(radius);
        const key = `Dodeca_${r}_0`;
        if (!this.geos.has(key)) this.geos.set(key, new THREE.DodecahedronGeometry(r, 0));
        return this.geos.get(key);
    }

    getGeoBox(w, h, d) {
        const ww = this._size(w), hh = this._size(h), dd = this._size(d);
        const key = `Box_${ww}_${hh}_${dd}_1_1_1`;
        if (!this.geos.has(key)) this.geos.set(key, new THREE.BoxGeometry(ww, hh, dd));
        return this.geos.get(key);
    }

    getGeoPlane(w, h) {
        const ww = this._size(w), hh = this._size(h);
        const key = `Plane_${ww}_${hh}_1_1`;
        if (!this.geos.has(key)) this.geos.set(key, new THREE.PlaneGeometry(ww, hh));
        return this.geos.get(key);
    }

    getGeoOctahedron(radius) {
        const r = this._size(radius);
        const key = `Octa_${r}_0`;
        if (!this.geos.has(key)) this.geos.set(key, new THREE.OctahedronGeometry(r, 0));
        return this.geos.get(key);
    }

    getGeoTorus(radius, tube) {
        const rr = this._snap(radius, [0.55, 0.6]);
        return this.geos.get(`Torus_${rr}_${tube}_6_12`);
    }

    // ─── API — получить ближайший материал ─────────────────────

    getMat(color, flatShading) {
        const hex = color.toString(16).padStart(6, '0');
        const key = `Std_${hex}_${flatShading ? 0.9 : 0.5}_0_${flatShading ? 'F' : 'N'}`;
        if (!this.mats.has(key)) this.mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: flatShading ? 0.9 : 0.5, flatShading }));
        return this.mats.get(key);
    }

    _size(value) {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0.01;
    }

    // ─── API — ключи для InstancedMesh ──────────────────────────

    /** Генерирует ключ геометрии в формате InstancedMesh._getGeoKey */
    geoKey(geo) {
        if (!geo || !geo.type) return null;
        const p = geo.parameters || {};
        switch (geo.type) {
            case 'BoxGeometry':
                return `Box_${p.width||0}_${p.height||0}_${p.depth||0}_${p.widthSegments||0}_${p.heightSegments||0}_${p.depthSegments||0}`;
            case 'SphereGeometry':
                return `Sphere_${p.radius||0}_${p.widthSegments||0}_${p.heightSegments||0}`;
            case 'CylinderGeometry':
                return `Cylinder_${p.radiusTop||0}_${p.radiusBottom||0}_${p.height||0}_${p.radialSegments||0}_${p.heightSegments||0}`;
            case 'ConeGeometry':
                return `Cone_${p.radius||0}_${p.height||0}_${p.radialSegments||0}_${p.heightSegments||0}`;
            case 'DodecahedronGeometry':
                return `Dodeca_${p.radius||0}_${p.detail||0}`;
            case 'PlaneGeometry':
                return `Plane_${p.width||0}_${p.height||0}_${p.widthSegments||0}_${p.heightSegments||0}`;
            case 'OctahedronGeometry':
                return `Octa_${p.radius||0}_${p.detail||0}`;
            case 'TorusGeometry':
                return `Torus_${p.radius||0}_${p.tube||0}_${p.radialSegments||0}_${p.tubularSegments||0}`;
            case 'BufferGeometry': {
                // Fingerprint based on buffer lengths — fast approximation
                const pos = geo.getAttribute('position');
                const nor = geo.getAttribute('normal');
                const idx = geo.getIndex();
                if (!pos) return null;
                const pLen = pos.array ? pos.array.length : 0;
                const nLen = nor ? nor.array.length : 0;
                const iLen = idx ? idx.array.length : 0;
                return `Buf_${pLen}_${nLen}_${iLen}`;
            }
            default:
                return null;
        }
    }

    /** Генерирует ключ материала в формате InstancedMesh._getMatKey */
    matKey(mat) {
        if (!mat || !mat.type) return null;
        const r = Math.round(mat.roughness * 10) / 10;
        const m = Math.round(mat.metalness * 10) / 10;
        const colorHex = this._quantizeColor(mat.color.getHex());
        if (mat.type === 'MeshStandardMaterial') {
            const eHex = this._quantizeColor(mat.emissive.getHex());
            return `Std_${colorHex}_${r}_${m}_${mat.transparent}_${mat.opacity}_${mat.flatShading}_${eHex}_${mat.emissiveIntensity}`;
        }
        if (mat.type === 'MeshBasicMaterial') {
            return `Bas_${colorHex}_${mat.transparent}_${mat.opacity}_${mat.side}`;
        }
        return null;
    }

    _quantizeColor(hex) {
        const q = value => Math.min(255, Math.round(value / 16) * 16);
        return q((hex >> 16) & 255) << 16 | q((hex >> 8) & 255) << 8 | q(hex & 255);
    }

    stats() {
        return { geometries: this.geos.size, materials: this.mats.size };
    }

    getMatStd(color, roughness = 0.9, metalness = 0, flatShading = false, transparent = false, opacity = 1, emissive = 0, emissiveIntensity = 0, wall = false) {
        const cHex = this._quantizeColor(color);
        const r = Math.round(roughness * 10) / 10;
        const m = Math.round(metalness * 10) / 10;
        const eHex = this._quantizeColor(emissive);
        const key = `Std_${cHex}_${r}_${m}_${transparent}_${opacity}_${flatShading ? 'F' : 'N'}_${eHex}_${emissiveIntensity}_${wall ? 'W' : 'N'}`;
        if (!this.mats.has(key)) {
            const opts = {
                color: cHex, roughness: r, metalness: m,
                flatShading: flatShading, transparent: transparent, opacity: opacity,
                emissive: eHex, emissiveIntensity
            };
            if (!transparent) {
                opts.side = THREE.DoubleSide;
            }
            const mat = new THREE.MeshStandardMaterial(opts);
            if (!transparent) {
                mat.polygonOffset = true;
                mat.polygonOffsetFactor = 8;
                mat.polygonOffsetUnits = 4;
            }
            this.mats.set(key, mat);
        }
        return this.mats.get(key);
    }

    /** Материал для террейна — с polygonOffset чтобы избежать z-fighting */
    getMatTerrain(color, roughness = 0.9, flatShading = false) {
        const cHex = this._quantizeColor(color);
        const r = Math.round(roughness * 10) / 10;
        const key = `Std_${cHex}_${r}_0_${flatShading ? 'F' : 'N'}_terrain`;
        if (!this.mats.has(key)) {
            this.mats.set(key, new THREE.MeshStandardMaterial({
                color: cHex, roughness: r, metalness: 0,
                flatShading: flatShading,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -1
            }));
        }
        return this.mats.get(key);
    }

    getMatBas(color, transparent = false, opacity = 1, side = THREE.FrontSide) {
        const cHex = this._quantizeColor(color);
        const key = `Bas_${cHex}_${transparent}_${opacity}_${side === THREE.FrontSide ? 'F' : 'B'}_${side === THREE.BackSide ? 'B' : 'D'}_${side === THREE.DoubleSide ? 'D' : ''}`;
        if (!this.mats.has(key)) {
            this.mats.set(key, new THREE.MeshBasicMaterial({
                color: cHex, transparent, opacity, side
            }));
        }
        return this.mats.get(key);
    }
}
