const fs = require("fs");
const path = "C:/Users/maksk/Desktop/rublox/entities/Zombie.js";
let content = fs.readFileSync(path, "utf8");

// 1. Add geometry + material caches after STALKER_DETAIL_MAT
const geoCache = @"
`n// === Zombie Geometry Cache ===
const ZOMBIE_GEOS = {};
const _getZombieGeo = (type, ...params) => {
    const key = type + "|" + params.join(",");
    if (!ZOMBIE_GEOS[key]) {
        if (type === "box") ZOMBIE_GEOS[key] = new THREE.BoxGeometry(...params);
        else if (type === "cone") ZOMBIE_GEOS[key] = new THREE.ConeGeometry(params[0], params[1], params[2] || 5);
        else if (type === "cyl") ZOMBIE_GEOS[key] = new THREE.CylinderGeometry(params[0], params[1], params[2], params[3] || 8);
        else if (type === "dodeca") ZOMBIE_GEOS[key] = new THREE.DodecahedronGeometry(params[0], params[1] || 0);
        else if (type === "icosa") ZOMBIE_GEOS[key] = new THREE.IcosahedronGeometry(params[0], params[1] || 0);
    }
    return ZOMBIE_GEOS[key];
};

// === Universal Shared Materials (identical across all variants) ===
const GRIME_MAT = new THREE.MeshStandardMaterial({ color: 0x2e3b2e, roughness: 0.95, flatShading: true });
const ARMOR_MAT = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.6, metalness: 0.2, flatShading: true });
const CLAW_MAT = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.5, metalness: 0.4, flatShading: true });
const HORN_MAT = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.2, flatShading: true });
const SPIKES_MAT = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.5, flatShading: true });
const BOOT_MAT = new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.92, flatShading: true });
const MASK_MAT = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, flatShading: true });

// === Variant-Specific Material Cache ===
const ZOMBIE_MATERIALS = {};
const _getZombieMat = (variant, type) => {
    const key = variant + "." + type;
    if (!ZOMBIE_MATERIALS[key]) {
        const cfg = VARIANT_CONFIG[variant];
        if (!cfg) return null;
        if (type === "body") {
            const tex = ZOMBIE_TEXTURES["zombie_" + variant] || _createZombieTexture(variant, cfg.bodyColor);
            ZOMBIE_MATERIALS[key] = new THREE.MeshStandardMaterial({
                color: cfg.bodyColor, map: tex, emissive: cfg.bodyColor, emissiveIntensity: 0.25, roughness: 0.75, flatShading: true
            });
        } else if (type === "head") {
            const tex = ZOMBIE_TEXTURES["zombie_" + variant] || _createZombieTexture(variant, cfg.headColor);
            ZOMBIE_MATERIALS[key] = new THREE.MeshStandardMaterial({
                color: cfg.headColor, map: tex, emissive: cfg.headColor, emissiveIntensity: 0.2, roughness: 0.75, flatShading: true
            });
        } else if (type === "glow") {
            ZOMBIE_MATERIALS[key] = new THREE.MeshStandardMaterial({
                color: cfg.glowColor, emissive: cfg.glowColor,
                emissiveIntensity: cfg.glowIntensity, roughness: 0.2, flatShading: true
            });
        } else if (type === "eye") {
            ZOMBIE_MATERIALS[key] = new THREE.MeshStandardMaterial({
                color: cfg.eyeColor, emissive: cfg.eyeColor, emissiveIntensity: 2.4
            });
        } else if (type === "detail") {
            ZOMBIE_MATERIALS[key] = new THREE.MeshStandardMaterial({
                color: cfg.detailColor, roughness: 0.72, flatShading: true
            });
        }
    }
    return ZOMBIE_MATERIALS[key];
};
"@;

# Insert after STALKER_DETAIL_MAT
$content = $content -replace "(const STALKER_DETAIL_MAT = new THREE\.MeshStandardMaterial\(\{[^}]+\}[^;]*;\s*\n)", "`$1" + $geoCache + "`n";

# 2. Remove _cloneStalkerMat
$content = $content -replace "\/\/ Per-instance material cloner.*?const _cloneStalkerMat = \(source\) => source\.clone\(\);\n", "// Stalker materials shared directly for draw call batching`n";

# 3. Constructor: replace _cloneStalkerMat with direct STALKER_MATERIALS
$content = $content -replace "camo: _cloneStalkerMat\(STALKER_MATERIALS\.camo\)", "camo: STALKER_MATERIALS.camo";
$content = $content -replace "vest: _cloneStalkerMat\(STALKER_MATERIALS\.vest\)", "vest: STALKER_MATERIALS.vest";
$content = $content -replace "gasMask: _cloneStalkerMat\(STALKER_MATERIALS\.gasMask\)", "gasMask: STALKER_MATERIALS.gasMask";
$content = $content -replace "boot: _cloneStalkerMat\(STALKER_MATERIALS\.boot\)", "boot: STALKER_MATERIALS.boot";
$content = $content -replace "helmet: _cloneStalkerMat\(STALKER_MATERIALS\.helmet\)", "helmet: STALKER_MATERIALS.helmet";
$content = $content -replace "backpack: _cloneStalkerMat\(STALKER_MATERIALS\.backpack\)", "backpack: STALKER_MATERIALS.backpack";
$content = $content -replace "lens: STALKER_MATERIALS\.lens\.clone\(\)", "lens: STALKER_MATERIALS.lens";
$content = $content -replace "skin: STALKER_MATERIALS\.skin\.clone\(\)", "skin: STALKER_MATERIALS.skin";
$content = $content -replace "glove: STALKER_MATERIALS\.glove\.clone\(\)", "glove: STALKER_MATERIALS.glove";

# 4. Dispose: remove cloned material disposal for stalker
$content = $content -replace "\/\/ Dispose cloned stalker materials\s*\n\s*if \(this\.variant === 'stalker' && this\._stalkerMats\) \{\s*\n\s*for \(const key in this\._stalkerMats\) this\._stalkerMats\[key\]\.dispose\(\);\s*\n\s*this\._stalkerMats = null;\s*\}", "// Stalker uses shared materials - no disposal needed`n            this._stalkerMats = null;";

# 5. createMesh: replace material creation with cache lookups
# bodyMat
$content = $content -replace "const bodyTex = _createZombieTexture\(this\.variant, cfg\.bodyColor\);\s*\n\s*const bodyMat = new THREE\.MeshStandardMaterial\(\{[^}]+\}\);", "const bodyMat = _getZombieMat(this.variant, 'body');";
# headMat  
$content = $content -replace "const headTex = _createZombieTexture\(this\.variant, cfg\.headColor\);\s*\n\s*const headMat = new THREE\.MeshStandardMaterial\(\{[^}]+\}\);", "const headMat = _getZombieMat(this.variant, 'head');";
# grimeMat
$content = $content -replace "const grimeMat = new THREE\.MeshStandardMaterial\(\{[^}]+\}\);", "const grimeMat = GRIME_MAT;";
# armorMat
$content = $content -replace "const armorMat = new THREE\.MeshStandardMaterial\(\{[^}]+\}\);", "const armorMat = ARMOR_MAT;";
# glowMat
$content = $content -replace "const glowMat = new THREE\.MeshStandardMaterial\(\{[^}]+\}\);", "const glowMat = _getZombieMat(this.variant, 'glow');";
# eyeMat
$content = $content -replace "const eyeMat = new THREE\.MeshStandardMaterial\(\{[^}]+\}\);", "const eyeMat = _getZombieMat(this.variant, 'eye');";
# detailMat
$content = $content -replace "const detailMat = new THREE\.MeshStandardMaterial\(\{[^}]+\}\);", "const detailMat = _getZombieMat(this.variant, 'detail');";
# maskMat
$content = $content -replace "const maskMat = new THREE\.MeshStandardMaterial\(\{[^}]+\}\);", "const maskMat = MASK_MAT;";
# clawMat
$content = $content -replace "const clawMat = new THREE\.MeshStandardMaterial\(\{[^}]+\}\);", "const clawMat = CLAW_MAT;";
# hornMat
$content = $content -replace "const hornMat = new THREE\.MeshStandardMaterial\(\{[^}]+\}\);", "const hornMat = HORN_MAT;";
# spikesMat
$content = $content -replace "const spikesMat = new THREE\.MeshStandardMaterial\(\{[^}]+\}\);", "const spikesMat = SPIKES_MAT;";
# bootMat
$content = $content -replace "const bootMat = new THREE\.MeshStandardMaterial\(\{[^}]+\}\);", "const bootMat = BOOT_MAT;";

fs.writeFileSync(path, content, "utf8");
console.log("Phase 1 done: Added caches, replaced materials");
