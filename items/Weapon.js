import * as THREE from 'three';
import { createPBRMetalTexture, createPolymerTexture2, createWoodTexture2, createBrightSteelTexture, createWeaponMaterial } from './WeaponTextures.js';

// ─── Procedural Texture Generators ─────────────────────────────────
// Creates actual texture images (not just colors) for weapons

function createCanvasTexture(width, height, drawFn) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

// ── Premium Brushed Metal (directional, multi-pass) ──
function createMetalTexture(baseColor = '#7a8590') {
    return createCanvasTexture(512, 512, (ctx, w, h) => {
        // Base + subtle color variation
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 3000; i++) {
            const x = Math.random() * w, y = Math.random() * h;
            ctx.fillStyle = `rgba(${Math.random() > 0.5 ? 40 : 0},${Math.random() > 0.5 ? 40 : 0},${Math.random() > 0.5 ? 40 : 0},${Math.random() * 0.04})`;
            ctx.fillRect(x, y, 2, 2);
        }
        // Fine directional brush strokes
        for (let y = 0; y < h; y += 1.5) {
            const b = 0.92 + Math.random() * 0.16;
            ctx.strokeStyle = `rgba(${Math.floor(128*b)},${Math.floor(128*b)},${Math.floor(128*b)},${0.03+Math.random()*0.06})`;
            ctx.lineWidth = 0.5+Math.random();
            ctx.beginPath();
            ctx.moveTo(0, y+(Math.random()-0.5)*2);
            ctx.lineTo(w, y+(Math.random()-0.5)*3);
            ctx.stroke();
        }
        // Deep scratches
        for (let i = 0; i < 20; i++) {
            const y = Math.random()*h;
            ctx.strokeStyle = `rgba(0,0,0,${0.08+Math.random()*0.15})`;
            ctx.lineWidth = 0.5+Math.random()*1.5;
            ctx.beginPath(); ctx.moveTo(0,y); let cx=0;
            while(cx<w){cx+=30+Math.random()*60; ctx.lineTo(cx,y+(Math.random()-0.5)*8);}
            ctx.stroke();
        }
        // Hot spots (oxidation)
        for (let i = 0; i < 8; i++) {
            const x=Math.random()*w, y=Math.random()*h, r=10+Math.random()*30;
            const grad = ctx.createRadialGradient(x,y,0,x,y,r);
            grad.addColorStop(0,`rgba(80,60,40,${0.03+Math.random()*0.05})`);
            grad.addColorStop(1,'transparent');
            ctx.fillStyle=grad; ctx.fillRect(x-r,y-r,r*2,r*2);
        }
    });
}

// ── Dark Metal (for polymer/coated parts) ──
function createDarkMetalTexture(baseColor = '#1a1f25') {
    return createCanvasTexture(512, 512, (ctx, w, h) => {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 5000; i++) {
            const x=Math.random()*w, y=Math.random()*h, v=Math.random()*20-10;
            ctx.fillStyle=`rgba(${v>0?v:0},${v>0?v:0},${v>0?v:0},0.1)`;
            ctx.fillRect(x,y,1,1);
        }
        for (let y=0;y<h;y+=3){
            ctx.strokeStyle=`rgba(255,255,255,${Math.random()*0.02})`;
            ctx.lineWidth=0.5; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y+Math.random()*2-1); ctx.stroke();
        }
    });
}

// ── Premium Wood (quarter-sawn figure) ──
function createWoodTexture(baseColor = '#5a3a20') {
    return createCanvasTexture(512, 512, (ctx, w, h) => {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 1000; i++) {
            const x=Math.random()*w, y=Math.random()*h;
            ctx.fillStyle=`rgba(${Math.random()>0.5?30:0},${Math.random()>0.5?15:0},0,${Math.random()*0.06})`;
            ctx.fillRect(x,y,3,3);
        }
        // Grain lines with figure patterns
        for (let row=0;row<40;row++) {
            const baseY=(row/40)*h, d=0.08+Math.random()*0.18;
            ctx.strokeStyle=`rgba(0,0,0,${d})`;
            ctx.lineWidth=1+Math.random()*3;
            ctx.beginPath(); ctx.moveTo(0,baseY);
            for(let x=0;x<=w;x+=8){const w=Math.sin(x*0.01+row)*8+Math.sin(x*0.03+row*0.5)*4; ctx.lineTo(x,baseY+w);}
            ctx.stroke();
        }
        // Growth rings
        for (let i=0;i<5;i++) {
            const cx=Math.random()*w, cy=Math.random()*h;
            ctx.strokeStyle=`rgba(60,30,10,${0.06+Math.random()*0.08})`;
            ctx.lineWidth=1;
            ctx.beginPath();
            for(let a=0;a<Math.PI*2;a+=0.1){const r=20+a*8+Math.sin(a*3)*5; ctx.lineTo(cx+Math.cos(a)*r*0.5,cy+r);}
            ctx.stroke();
        }
    });
}

// ── Polymer / Rubber grip texture ──
function createPolymerTexture(baseColor = '#12141a') {
    return createCanvasTexture(512, 512, (ctx, w, h) => {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, w, h);
        for (let i=0;i<20000;i++) {
            const x=Math.random()*w, y=Math.random()*h, v=Math.random()*30-15;
            ctx.fillStyle=`rgba(${v>0?v:0},${v>0?v:0},${v>0?v:0},0.05+Math.random()*0.12)`;
            ctx.fillRect(x,y,1,1);
        }
        // Diamond grip pattern
        ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.lineWidth=1;
        for(let y=0;y<h;y+=12){
            for(let x=(y/12)%2*12;x<w;x+=24){
                ctx.beginPath(); ctx.moveTo(x,y-6); ctx.lineTo(x+6,y); ctx.lineTo(x,y+6); ctx.lineTo(x-6,y); ctx.closePath(); ctx.stroke();
            }
        }
    });
}

// ── Brass / Copper texture ──
function createBrassTexture() {
    return createCanvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle='#b5a040'; ctx.fillRect(0,0,w,h);
        for(let i=0;i<2000;i++){
            const x=Math.random()*w,y=Math.random()*h,v=Math.random()*30-15;
            ctx.fillStyle=`rgba(${v>0?v:0},${v>0?v*0.8:0},${v>0?v*0.3:0},0.1)`;
            ctx.fillRect(x,y,2,2);
        }
    });
}

// ── Neon glow texture (for laser weapons) ──
function createNeonTexture(color = '#6ad3ff', size = 64) {
    return createCanvasTexture(size, size, (ctx, w, h) => {
        const gradient = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w/2);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.5, color + '80');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
    });
}

const WEAPON_BALANCE = {
    fists: { damage: 8, range: 2.4, cooldown: 0.38, ammo: null, durability: null, projectileSpeed: 0 },
    knife: { damage: 24, range: 3.4, cooldown: 0.42, ammo: null, durability: 80, projectileSpeed: 0 },
    bow: { damage: 28, range: 20, cooldown: 1.18, ammo: 48, durability: null, projectileSpeed: 46 },
    laser: { damage: 24, range: 86, cooldown: 0.34, ammo: 30, durability: null, projectileSpeed: 62 },
    shotgun: { damage: 18, range: 11.5, cooldown: 0.98, ammo: 36, durability: null, projectileSpeed: 48, pellets: 9 },
    flamethrower: { damage: 6.8, range: 13.5, cooldown: 0.08, ammo: 260, durability: null, projectileSpeed: 16, flameCount: 4 },
    pistol: { damage: 23, range: 62, cooldown: 0.36, ammo: 90, durability: null, projectileSpeed: 82 },
    rifle: { damage: 29, range: 96, cooldown: 0.3, ammo: 120, durability: null, projectileSpeed: 98 },
    machinegun: { damage: 14, range: 82, cooldown: 0.105, ammo: 180, durability: null, projectileSpeed: 94 }
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WEAPON ANIMATION SYSTEM — recoil, sway, idle bob, muzzle flash, heat
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export class WeaponAnimation {
    constructor() {
        this.time = 0;
        this.recoilKick = 0;
        this.recoilRecovery = 0;
        this.recoilAngle = 0;
        this.muzzleFlash = 0;
        this.bobPhase = 0;
        this.bobAmount = 0;
        this.swayX = 0; this.swayY = 0;
        this.swayTargetX = 0; this.swayTargetY = 0;
        this.reloadProgress = -1;
        this.reloadDuration = 2.0;
        this.heatGlow = 0;
        this.lastShotTime = 0;
    }
    update(delta, isShooting, isMoving, mouseDx, mouseDy) {
        this.time += delta;
        if (isShooting && this.time - this.lastShotTime < 0.12) {
            this.muzzleFlash = 1;
            this.heatGlow = Math.min(1, this.heatGlow + delta * 2.4);
        }
        this.recoilKick = Math.max(0, this.recoilKick - delta * 7.5);
        this.recoilAngle += (this.recoilKick * 0.115 - this.recoilAngle) * Math.min(1, delta * 24);
        if (this.muzzleFlash > 0) this.muzzleFlash = Math.max(0, this.muzzleFlash - delta * 14);
        this.bobPhase += delta * (isMoving ? 8.2 : 1.7);
        this.bobAmount = isMoving ? 0.014 : 0.003;
        this.swayTargetX = THREE.MathUtils.clamp(mouseDx * 0.0018, -0.035, 0.035);
        this.swayTargetY = THREE.MathUtils.clamp(mouseDy * 0.0018, -0.035, 0.035);
        this.swayX += (this.swayTargetX - this.swayX) * Math.min(1, delta * 12);
        this.swayY += (this.swayTargetY - this.swayY) * Math.min(1, delta * 12);
        if (this.reloadProgress >= 0) {
            this.reloadProgress += delta / this.reloadDuration;
            if (this.reloadProgress >= 1) this.reloadProgress = -1;
        }
        if (!isShooting) this.heatGlow *= Math.max(0, 1 - delta*0.3);
    }
    triggerRecoil() { this.recoilKick = 1; this.recoilRecovery = 0; this.muzzleFlash = 1; this.lastShotTime = this.time; this.heatGlow = Math.min(1, this.heatGlow+0.2); }
    triggerReload(dur) { this.reloadProgress = 0; this.reloadDuration = dur || 2.0; }
    applyToMesh(mesh, weaponType) {
        if (!mesh) return;
        if (mesh.userData.basePositionX === undefined) {
            mesh.userData.basePositionX = mesh.position.x;
            mesh.userData.basePositionY = mesh.position.y;
            mesh.userData.basePositionZ = mesh.position.z;
        }
        const bob = Math.sin(this.bobPhase) * this.bobAmount;
        const baseRot = mesh.userData.baseRotation || new THREE.Euler(0,0,0);
        const rx = baseRot.x + this.recoilAngle;
        const ry = baseRot.y + this.swayX;
        const rz = baseRot.z + this.swayY * 0.35;
        mesh.rotation.set(rx, ry, rz);

        mesh.position.y = mesh.userData.basePositionY + bob - this.swayY * 0.018;
        mesh.position.x = mesh.userData.basePositionX + Math.cos(this.bobPhase * 0.5) * this.bobAmount * 0.45 + this.swayX * 0.02;
        mesh.position.z = mesh.userData.basePositionZ + this.recoilKick * 0.045;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PROCEDURAL GUNSHOT AUDIO — layered synthesis for realistic gunshots
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function createGunshotSound(type, audioContext, volume = 0.5, position = null) {
    if (!audioContext) return null;
    const now = audioContext.currentTime;
    const masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(volume, now);
    masterGain.connect(audioContext.destination);
    // Convolution reverb
    const conv = audioContext.createConvolver();
    const rvGain = audioContext.createGain();
    rvGain.gain.value = 0.15;
    const irLen = audioContext.sampleRate * 1.5;
    const impulse = audioContext.createBuffer(2, irLen, audioContext.sampleRate);
    for (let ch=0;ch<2;ch++) { const d=impulse.getChannelData(ch); for(let i=0;i<irLen;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/irLen,2); }
    conv.buffer = impulse;
    masterGain.connect(conv); conv.connect(rvGain); rvGain.connect(audioContext.destination);

    const mkNoise = (dur, gMul, hp, lp, bp) => {
        const buf = audioContext.createBuffer(1, Math.max(1, Math.floor(audioContext.sampleRate*dur)), audioContext.sampleRate);
        const d = buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
        const src = audioContext.createBufferSource(); src.buffer = buf;
        const g = audioContext.createGain();
        const t = now + (dur === 0 ? 0 : 0);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.001, gMul), t+0.003); g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
        src.connect(g);
        if (hp) { const f = audioContext.createBiquadFilter(); f.type='highpass'; f.frequency.value=hp; src.connect(f); f.connect(g); }
        if (lp) { const f = audioContext.createBiquadFilter(); f.type='lowpass'; f.frequency.value=lp; src.connect(f); f.connect(g); }
        if (bp) { const f = audioContext.createBiquadFilter(); f.type='bandpass'; f.frequency.value=bp; src.connect(f); f.connect(g); }
        g.connect(masterGain);
        src.start(t); src.stop(t+dur+0.01);
        return { src, gain: g };
    };
    const mkOsc = (freq, toFreq, dur, gMul, type='sine') => {
        const o = audioContext.createOscillator(); o.type=type; o.frequency.setValueAtTime(freq,now); o.frequency.exponentialRampToValueAtTime(Math.max(25,toFreq),now+dur);
        const g = audioContext.createGain(); g.gain.setValueAtTime(Math.max(0.001,gMul),now); g.gain.exponentialRampToValueAtTime(0.0001,now+dur);
        o.connect(g); g.connect(masterGain); o.start(now); o.stop(now+dur+0.01);
    };

    switch(type) {
        case 'pistol': {
            mkNoise(0.06, 0.6, null, null, 4000);
            mkOsc(220, 60, 0.12, 0.5);
            mkNoise(0.04, 0.4, 2000, null, null);
            break;
        }
        case 'rifle': {
            mkNoise(0.08, 0.7, null, null, 3000);
            mkOsc(180, 40, 0.18, 0.6);
            mkOsc(80, 25, 0.25, 0.35);
            mkNoise(0.15, 0.2, null, 1500, null);
            break;
        }
        case 'machinegun': {
            mkNoise(0.04, 0.55, null, null, 5000);
            mkOsc(300, 100, 0.06, 0.35, 'sawtooth');
            break;
        }
        case 'shotgun': {
            mkNoise(0.2, 0.8, null, 3000, null);
            mkOsc(120, 20, 0.3, 0.7);
            for(let i=1;i<5;i++) mkNoise(0.02, 0.15, 5000+i*1000, null, null);
            break;
        }
        case 'laser': {
            mkOsc(1200, 200, 0.12, 0.5, 'sawtooth');
            mkNoise(0.05, 0.4, null, null, 8000);
            const o = audioContext.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(1800,now+0.03); o.frequency.exponentialRampToValueAtTime(300,now+0.18);
            const g = audioContext.createGain(); g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(0.2,now+0.03); g.gain.exponentialRampToValueAtTime(0.0001,now+0.18);
            o.connect(g); g.connect(masterGain); o.start(now+0.03); o.stop(now+0.19);
            break;
        }
        case 'flamethrower': {
            mkNoise(0.3, 0.4, null, 800, null);
            mkNoise(0.2, 0.2, 3000, null, null);
            break;
        }
        case 'bow': {
            mkNoise(0.15, 0.3, null, 2000, null);
            mkOsc(600, 200, 0.08, 0.3, 'triangle');
            break;
        }
        default: {
            mkNoise(0.08, 0.3, null, 3000, null);
        }
    }
    return { stop: () => {} };
}

const sharedGeom = new Map();
const sharedMat = new Map();

const tmpQ = new THREE.Quaternion();
const tmpF = new THREE.Vector3(1, 0, 0);

// Type aliases for weapon normalisation
const TYPE_ALIASES = {
    'knif': 'knife',
    'bow': 'bow',
    'pistol': 'pistol',
    'rifle': 'rifle',
    'machinegun': 'machinegun',
    'shotgun': 'shotgun',
    'flamethrower': 'flamethrower',
    'laser': 'laser',
    'fists': 'fists'
};

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
            if (child.material?.isMeshStandardMaterial) {
                child.material.metalness = Math.min(0.72, child.material.metalness);
                child.material.roughness = Math.max(0.28, child.material.roughness);
                child.material.emissive.copy(child.material.color).multiplyScalar(0.16);
                child.material.emissiveIntensity = 0.45;
            }
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = false;
            child.renderOrder = 4;
            child.userData.ignoreDamageTint = true;
        }
    });
}

function createKnifeModel() {
    const group = new THREE.Group();
    const bladeMat = getMaterial('knife_blade_pbr', () => createWeaponMaterial(createBrightSteelTexture()));
    const handleMat = getMaterial('knife_handle_pbr', () => createWeaponMaterial(createWoodTexture2('#5a3a24')));
    const guardMat = getMaterial('knife_guard_pbr', () => createWeaponMaterial(createPBRMetalTexture('#909ca8')));
    const pommelMat = getMaterial('knife_pommel_pbr', () => createWeaponMaterial(createPolymerTexture2('#59636e')));

    // Handle scales with rivets
    group.add(createPart(getGeom('knife_h1', () => new THREE.BoxGeometry(0.42, 0.11, 0.11)), handleMat, -0.27, 0, 0));
    group.add(createPart(getGeom('knife_h2', () => new THREE.BoxGeometry(0.16, 0.13, 0.13)), handleMat, -0.42, 0, 0));
    group.add(createPart(getGeom('knife_rivet1', () => new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6)), pommelMat, -0.42, 0.04, 0.04, 0, 0, Math.PI / 2));
    group.add(createPart(getGeom('knife_rivet2', () => new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6)), pommelMat, -0.42, 0.04, -0.04, 0, 0, Math.PI / 2));
    // Guard with wing
    group.add(createPart(getGeom('knife_g', () => new THREE.BoxGeometry(0.08, 0.16, 0.16)), guardMat, -0.03, 0, 0));
    group.add(createPart(getGeom('knife_gw', () => new THREE.BoxGeometry(0.04, 0.06, 0.18)), guardMat, -0.06, 0.03, 0));
    // Blade with spine ridge and fuller
    group.add(createPart(getGeom('knife_b', () => new THREE.BoxGeometry(0.82, 0.055, 0.045)), bladeMat, 0.4, 0.01, 0));
    group.add(createPart(getGeom('knife_bs', () => new THREE.BoxGeometry(0.72, 0.02, 0.045)), guardMat, 0.38, 0.042, 0));
    group.add(createPart(getGeom('knife_f', () => new THREE.BoxGeometry(0.5, 0.005, 0.008)), guardMat, 0.42, 0.005, 0));
    // Pointy tip
    group.add(createPart(getGeom('knife_t', () => new THREE.ConeGeometry(0.038, 0.18, 4)), bladeMat, 0.86, 0.01, 0, 0, 0, -Math.PI / 2));
    // Pommel cap
    group.add(createPart(getGeom('knife_p', () => new THREE.ConeGeometry(0.07, 0.06, 6)), pommelMat, -0.52, 0, 0, 0, 0, Math.PI / 2));
    group.rotation.y = Math.PI;
    return group;
}

function createBowModel() {
    const group = new THREE.Group();
    // Premium recurve bow — hardwood limbs, polymer grip, cam limbs
    const limbMat = getMaterial('bow_limb', () => new THREE.MeshStandardMaterial({ 
        color: 0x5a3a1a, 
        roughness: 0.5, 
        metalness: 0.2, 
        map: createWoodTexture('#5a3a1a')
    }));
    const gripMat = getMaterial('bow_grip', () => new THREE.MeshStandardMaterial({ 
        color: 0x1d1210, 
        roughness: 0.75, 
        metalness: 0.05, 
        map: createPolymerTexture('#1d1210')
    }));
    const stringMat = getMaterial('bow_string', () => new THREE.LineBasicMaterial({ color: 0x707070 }));
    const nockMat = getMaterial('bow_nock', () => new THREE.MeshStandardMaterial({ 
        color: 0xe8e0d0, roughness: 0.4, metalness: 0.1, flatShading: true
    }));

    // T limb segments (modern recurve)
    const segGeom = getGeom('bow_seg', () => new THREE.BoxGeometry(0.14, 0.35, 0.09));
    const segData = [
        [-0.16, 0.88, 0.48, 0.08],
        [-0.08, 0.52, 0.26, 0.05],
        [0.0, 0.18, 0.1, 0.02],
        [0.0, -0.18, -0.1, -0.02],
        [-0.08, -0.52, -0.26, -0.05],
        [-0.16, -0.88, -0.48, -0.08],
    ];
    for (const [x, y, r, twist] of segData) {
        group.add(createPart(segGeom, limbMat, x, y, 0, 0, 0, r));
    }
    // Limb tips (cammes)
    group.add(createPart(getGeom('bow_tip_t', () => new THREE.ConeGeometry(0.06, 0.12, 4)), limbMat, -0.14, 1.0, 0));
    group.add(createPart(getGeom('bow_tip_b', () => new THREE.ConeGeometry(0.06, 0.12, 4)), limbMat, -0.14, -1.0, 0, 0, 0, Math.PI));
    // Ergonomic grip with wrap
    group.add(createPart(getGeom('bow_grip', () => new THREE.BoxGeometry(0.18, 0.64, 0.13)), gripMat, 0.02, 0, 0));
    group.add(createPart(getGeom('bow_grip_w', () => new THREE.BoxGeometry(0.19, 0.3, 0.14)), gripMat, 0.02, 0.05, 0));

    // String (3 segments)
    const string = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-0.18, 1.08, 0),
            new THREE.Vector3(0.16, 0, 0),
            new THREE.Vector3(-0.18, -1.08, 0)
        ]),
        stringMat
    );
    string.frustumCulled = false;
    string.userData.isBowString = true;
    group.add(string);
    // Noched arrow
    const arrow = createArrowProjectileMesh();
    arrow.scale.setScalar(0.45);
    arrow.position.set(0.22, 0.02, 0);
    arrow.userData.isNockedArrow = true;
    group.add(arrow);
    group.scale.setScalar(0.82);
    return group;
}

function createGunModel(style) {
    const group = new THREE.Group();
    // Premium weapon materials — enhanced PBR textures for realism
    let steelMat, darkMat, gripMat, woodMat, brassMat, neonMat, accentMat;
    
    if (style === 'pistol') {
        steelMat = getMaterial('pistol_steel_pbr', () => createWeaponMaterial(createPBRMetalTexture('#b6c2cc')));
        darkMat = getMaterial('pistol_dark_pbr', () => createWeaponMaterial(createPolymerTexture2('#515b66')));
        gripMat = getMaterial('pistol_grip_pbr', () => createWeaponMaterial(createPolymerTexture2('#626d78')));
        woodMat = getMaterial('pistol_wood_pbr', () => createWeaponMaterial(createWoodTexture2('#70482a')));
        brassMat = getMaterial('pistol_brass', () => new THREE.MeshStandardMaterial({
            color: 0xb5a040, metalness: 0.9, roughness: 0.2,
            map: createBrassTexture()
        }));
        neonMat = getMaterial('pistol_neon', () => new THREE.MeshStandardMaterial({
            color: 0x6ad3ff, emissive: 0x6ad3ff, emissiveIntensity: 1.5, roughness: 0.15, metalness: 0.5,
            map: createNeonTexture('#6ad3ff', 64)
        }));
        accentMat = getMaterial('pistol_accent', () => new THREE.MeshStandardMaterial({
            color: 0xc0c8d0, roughness: 0.2, metalness: 0.8,
            map: createMetalTexture('#c0c8d0')
        }));
    } else if (style === 'rifle' || style === 'machinegun') {
        steelMat = getMaterial(`${style}_steel_pbr`, () => createWeaponMaterial(createPBRMetalTexture(style === 'machinegun' ? '#74818d' : '#929faa')));
        darkMat = getMaterial(`${style}_dark_pbr`, () => createWeaponMaterial(createPolymerTexture2('#515b66')));
        gripMat = getMaterial(`${style}_grip_pbr`, () => createWeaponMaterial(createPolymerTexture2('#626d78')));
        woodMat = getMaterial(`${style}_wood_pbr`, () => createWeaponMaterial(createWoodTexture2('#70482a')));
        brassMat = getMaterial(`${style}_brass`, () => new THREE.MeshStandardMaterial({
            color: 0xb5a040, metalness: 0.9, roughness: 0.2,
            map: createBrassTexture()
        }));
        neonMat = null;
        accentMat = getMaterial(`${style}_accent`, () => new THREE.MeshStandardMaterial({
            color: 0xc0c8d0, roughness: 0.2, metalness: 0.8,
            map: createMetalTexture('#c0c8d0')
        }));
    } else {
        steelMat = getMaterial(`${style}_steel_pbr`, () => createWeaponMaterial(createPBRMetalTexture(style === 'laser' ? '#5f91a6' : '#87939d')));
        darkMat = getMaterial(`${style}_dark_pbr`, () => createWeaponMaterial(createPolymerTexture2('#515b66')));
        gripMat = getMaterial(`${style}_grip_pbr`, () => createWeaponMaterial(createPolymerTexture2('#626d78')));
        woodMat = getMaterial(`${style}_wood_pbr`, () => createWeaponMaterial(createWoodTexture2('#70482a')));
        brassMat = getMaterial(`${style}_brass`, () => new THREE.MeshStandardMaterial({
            color: 0xb5a040, metalness: 0.9, roughness: 0.2,
            map: createBrassTexture()
        }));
        neonMat = getMaterial(`${style}_neon`, () => new THREE.MeshStandardMaterial({
            color: style === 'laser' ? 0x44ff88 : 0x6ad3ff,
            emissive: style === 'laser' ? 0x44ff88 : 0x6ad3ff,
            emissiveIntensity: 1.5, roughness: 0.15, metalness: 0.5,
            map: createNeonTexture(style === 'laser' ? '#44ff88' : '#6ad3ff', 64)
        }));
        accentMat = getMaterial(`${style}_accent`, () => new THREE.MeshStandardMaterial({
            color: style === 'shotgun' ? 0xc97a55 : 0xc0c8d0,
            roughness: 0.2, metalness: 0.8,
            map: createMetalTexture(style === 'shotgun' ? '#c97a55' : '#c0c8d0')
        }));
    }

    if (style === 'pistol') {
        // Frame / lower receiver
        group.add(createPart(getGeom('pistol_frame', () => new THREE.BoxGeometry(0.5, 0.15, 0.13)), darkMat, 0.04, -0.04, 0));
        // Slide (upper receiver)
        group.add(createPart(getGeom('pistol_slide', () => new THREE.BoxGeometry(0.42, 0.13, 0.15)), steelMat, 0.06, 0.1, 0));
        // Slide serrations (rear grip area)
        for (let i=0;i<6;i++) group.add(createPart(getGeom(`pistol_serr${i}`,()=>new THREE.BoxGeometry(0.015,0.02,0.16)),accentMat,-0.12+i*0.02,0.14,0));
        // Grip frame with textured polymer panel
        group.add(createPart(getGeom('pistol_grip', () => new THREE.BoxGeometry(0.14, 0.28, 0.12)), darkMat, -0.08, -0.18, 0));
        group.add(createPart(getGeom('pistol_gp', () => new THREE.BoxGeometry(0.12, 0.24, 0.01)), gripMat, -0.08, -0.16, 0.07));
        // Barrel (through barrel)
        group.add(createPart(getGeom('pistol_barrel', () => new THREE.CylinderGeometry(0.04, 0.04, 0.32, 8)), steelMat, 0.36, 0.04, 0, 0, 0, Math.PI / 2));
        // Barrel hood
        group.add(createPart(getGeom('pistol_bhood', () => new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8)), accentMat, 0.52, 0.04, 0, 0, 0, Math.PI / 2));
        // Trigger guard
        group.add(createPart(getGeom('pistol_tguard', () => new THREE.TorusGeometry(0.07, 0.012, 4, 8, Math.PI)), darkMat, 0.04, -0.06, 0, 0, 0, Math.PI));
        // Magazine base (brass)
        group.add(createPart(getGeom('pistol_mag', () => new THREE.BoxGeometry(0.16, 0.05, 0.14)), brassMat, -0.08, -0.33, 0));
        // Slide stop
        group.add(createPart(getGeom('pistol_ss', () => new THREE.BoxGeometry(0.04, 0.03, 0.03)), darkMat, -0.08, 0.06, -0.09));
        // Rear sight
        group.add(createPart(getGeom('pistol_rs', () => new THREE.BoxGeometry(0.06, 0.06, 0.06)), darkMat, -0.18, 0.17, 0));
        group.add(createPart(getGeom('pistol_rs_p', () => new THREE.BoxGeometry(0.02, 0.04, 0.04)), neonMat, -0.18, 0.21, 0));
        // Front sight (glow dot)
        group.add(createPart(getGeom('pistol_fs', () => new THREE.CylinderGeometry(0.025, 0.025, 0.06, 6)), neonMat, 0.32, 0.17, 0));
    } else if (style === 'rifle') {
        group.add(createPart(getGeom('rifle_receiver', () => new THREE.BoxGeometry(0.48, 0.18, 0.14)), darkMat, 0.02, 0.03, 0));
        group.add(createPart(getGeom('rifle_dust_cover', () => new THREE.BoxGeometry(0.34, 0.08, 0.15)), steelMat, 0.06, 0.15, 0));
        group.add(createPart(getGeom('rifle_wood_guard', () => new THREE.BoxGeometry(0.5, 0.17, 0.17)), woodMat, 0.5, 0.04, 0));
        group.add(createPart(getGeom('rifle_long_barrel', () => new THREE.CylinderGeometry(0.035, 0.035, 0.86, 10)), steelMat, 1.02, 0.07, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('rifle_muzzle', () => new THREE.CylinderGeometry(0.055, 0.045, 0.15, 8)), darkMat, 1.48, 0.07, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('rifle_stock', () => new THREE.BoxGeometry(0.58, 0.22, 0.17)), woodMat, -0.48, 0.01, 0, 0, 0, -0.08));
        group.add(createPart(getGeom('rifle_stock_comb', () => new THREE.BoxGeometry(0.38, 0.07, 0.18)), woodMat, -0.38, 0.16, 0));
        group.add(createPart(getGeom('rifle_butt', () => new THREE.BoxGeometry(0.06, 0.24, 0.18)), gripMat, -0.79, -0.01, 0));
        group.add(createPart(getGeom('rifle_curved_mag', () => new THREE.BoxGeometry(0.14, 0.34, 0.1)), darkMat, 0.08, -0.22, 0, 0, 0, 0.16));
        group.add(createPart(getGeom('rifle_mag_lip', () => new THREE.BoxGeometry(0.16, 0.05, 0.11)), brassMat, 0.12, -0.39, 0, 0, 0, 0.16));
        group.add(createPart(getGeom('rifle_grip', () => new THREE.BoxGeometry(0.12, 0.25, 0.12)), gripMat, -0.14, -0.18, 0, 0, 0, -0.18));
        group.add(createPart(getGeom('rifle_front_post', () => new THREE.BoxGeometry(0.035, 0.14, 0.05)), steelMat, 1.28, 0.16, 0));
        group.add(createPart(getGeom('rifle_rear_notch', () => new THREE.BoxGeometry(0.08, 0.1, 0.08)), darkMat, -0.05, 0.22, 0));
    } else if (style === 'machinegun') {
        const oliveMat = getMaterial('machinegun_olive', () => createWeaponMaterial(createPolymerTexture2('#596348')));
        group.add(createPart(getGeom('mg_receiver', () => new THREE.BoxGeometry(0.68, 0.28, 0.24)), darkMat, 0.02, 0.03, 0));
        group.add(createPart(getGeom('mg_top_cover', () => new THREE.BoxGeometry(0.58, 0.09, 0.26)), oliveMat, 0.01, 0.22, 0));
        group.add(createPart(getGeom('mg_heavy_barrel', () => new THREE.CylinderGeometry(0.055, 0.055, 0.96, 10)), steelMat, 0.84, 0.08, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('mg_barrel_jacket', () => new THREE.CylinderGeometry(0.09, 0.09, 0.56, 10)), darkMat, 0.66, 0.08, 0, 0, 0, Math.PI / 2));
        for (let i = 0; i < 6; i++) group.add(createPart(getGeom(`mg_cooling_${i}`, () => new THREE.TorusGeometry(0.095, 0.012, 5, 10)), steelMat, 0.44 + i * 0.09, 0.08, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('mg_flash_hider', () => new THREE.CylinderGeometry(0.08, 0.055, 0.18, 8)), darkMat, 1.38, 0.08, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('mg_box_mag', () => new THREE.BoxGeometry(0.34, 0.38, 0.22)), oliveMat, -0.02, -0.28, 0));
        group.add(createPart(getGeom('mg_feed', () => new THREE.BoxGeometry(0.2, 0.08, 0.25)), brassMat, 0.18, -0.02, 0));
        group.add(createPart(getGeom('mg_stock', () => new THREE.BoxGeometry(0.48, 0.27, 0.2)), oliveMat, -0.55, 0.01, 0));
        group.add(createPart(getGeom('mg_butt', () => new THREE.BoxGeometry(0.08, 0.3, 0.22)), gripMat, -0.82, 0, 0));
        group.add(createPart(getGeom('mg_pistol_grip', () => new THREE.BoxGeometry(0.14, 0.27, 0.14)), gripMat, -0.27, -0.23, 0, 0, 0, -0.15));
        group.add(createPart(getGeom('mg_carry_handle', () => new THREE.TorusGeometry(0.18, 0.025, 5, 10, Math.PI)), steelMat, 0.02, 0.31, 0, 0, 0, Math.PI));
        group.add(createPart(getGeom('mg_bipod_l', () => new THREE.BoxGeometry(0.045, 0.42, 0.045)), steelMat, 0.6, -0.27, 0.15, 0, 0, -0.28));
        group.add(createPart(getGeom('mg_bipod_r', () => new THREE.BoxGeometry(0.045, 0.42, 0.045)), steelMat, 0.6, -0.27, -0.15, 0, 0, 0.28));
    } else if (style === 'shotgun') {
        // Receiver
        group.add(createPart(getGeom('sg_recv', () => new THREE.BoxGeometry(0.42, 0.16, 0.14)), darkMat, -0.06, 0.04, 0));
        // Dual barrels
        group.add(createPart(getGeom('sg_b1', () => new THREE.CylinderGeometry(0.045, 0.045, 0.88, 8)), steelMat, 0.42, 0.08, 0.06, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('sg_b2', () => new THREE.CylinderGeometry(0.045, 0.045, 0.88, 8)), steelMat, 0.42, 0.08, -0.06, 0, 0, Math.PI / 2));
        // Magazine tube
        group.add(createPart(getGeom('sg_magtube', () => new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8)), darkMat, 0.38, -0.04, 0, 0, 0, Math.PI / 2));
        // Pump handguard with grip rings
        group.add(createPart(getGeom('sg_pump', () => new THREE.BoxGeometry(0.28, 0.14, 0.16)), woodMat, 0.14, -0.02, 0));
        for (let i=0;i<4;i++) group.add(createPart(getGeom(`sg_pring${i}`,()=>new THREE.TorusGeometry(0.085,0.015,4,12)),darkMat,0.06+i*0.05,-0.02,0,0,Math.PI/2,0));
        // Stock with comb and buttpad
        group.add(createPart(getGeom('sg_stock', () => new THREE.BoxGeometry(0.48, 0.17, 0.17)), woodMat, -0.46, 0.03, 0));
        group.add(createPart(getGeom('sg_comb', () => new THREE.BoxGeometry(0.35, 0.04, 0.18)), woodMat, -0.38, 0.12, 0));
        group.add(createPart(getGeom('sg_bpad', () => new THREE.BoxGeometry(0.05, 0.18, 0.18)), gripMat, -0.72, 0.03, 0));
        // Front sight
        group.add(createPart(getGeom('sg_fs', () => new THREE.CylinderGeometry(0.015, 0.015, 0.08, 6)), steelMat, 0.84, 0.12, 0.06));
    } else if (style === 'flamethrower') {
        const tankMat = getMaterial('flamethrower_tank_red', () => createWeaponMaterial(createPBRMetalTexture('#8f2c24')));
        group.add(createPart(getGeom('ft_frame', () => new THREE.BoxGeometry(0.56, 0.2, 0.24)), darkMat, 0.08, 0.04, 0));
        group.add(createPart(getGeom('ft_nozzle_pipe', () => new THREE.CylinderGeometry(0.045, 0.045, 0.82, 10)), steelMat, 0.72, 0.08, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('ft_heat_shield', () => new THREE.CylinderGeometry(0.1, 0.1, 0.42, 10)), darkMat, 0.68, 0.08, 0, 0, 0, Math.PI / 2));
        for (let i = 0; i < 4; i++) group.add(createPart(getGeom(`ft_vent_${i}`, () => new THREE.TorusGeometry(0.105, 0.012, 5, 10)), brassMat, 0.53 + i * 0.1, 0.08, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('ft_igniter', () => new THREE.CylinderGeometry(0.085, 0.055, 0.18, 8)), accentMat, 1.16, 0.08, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('ft_pilot', () => new THREE.SphereGeometry(0.055, 8, 5)), neonMat, 1.27, 0.08, 0));
        group.add(createPart(getGeom('ft_grip', () => new THREE.BoxGeometry(0.15, 0.3, 0.14)), gripMat, -0.04, -0.22, 0, 0, 0, -0.12));
        group.add(createPart(getGeom('ft_tank_l', () => new THREE.CylinderGeometry(0.15, 0.15, 0.58, 10)), tankMat, -0.42, -0.08, 0.14, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('ft_tank_r', () => new THREE.CylinderGeometry(0.15, 0.15, 0.58, 10)), tankMat, -0.42, -0.08, -0.14, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('ft_tank_band_l', () => new THREE.TorusGeometry(0.155, 0.022, 6, 12)), brassMat, -0.48, -0.08, 0.14, 0, Math.PI / 2));
        group.add(createPart(getGeom('ft_tank_band_r', () => new THREE.TorusGeometry(0.155, 0.022, 6, 12)), brassMat, -0.48, -0.08, -0.14, 0, Math.PI / 2));
        group.add(createPart(getGeom('ft_valve', () => new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8)), brassMat, -0.36, 0.12, 0));
    } else if (style === 'laser') {
        const shellMat = getMaterial('laser_shell', () => createWeaponMaterial(createPBRMetalTexture('#c8e3ed')));
        group.add(createPart(getGeom('lz_spine', () => new THREE.BoxGeometry(0.8, 0.16, 0.18)), shellMat, 0.08, 0.08, 0));
        group.add(createPart(getGeom('lz_core', () => new THREE.CylinderGeometry(0.055, 0.055, 0.62, 10)), neonMat, 0.28, 0.08, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('lz_emitter', () => new THREE.CylinderGeometry(0.13, 0.09, 0.22, 10)), steelMat, 0.84, 0.08, 0, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('lz_emit_ring', () => new THREE.TorusGeometry(0.13, 0.025, 6, 14)), neonMat, 0.96, 0.08, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('lz_muzzle_orb', () => new THREE.SphereGeometry(0.08, 10, 6)), neonMat, 1.08, 0.08, 0));
        for (const side of [-1, 1]) {
            group.add(createPart(getGeom(`lz_fin_${side}`, () => new THREE.BoxGeometry(0.42, 0.08, 0.12)), shellMat, 0.18, 0.18, side * 0.16, side * 0.2, 0, 0));
            group.add(createPart(getGeom(`lz_coil_${side}`, () => new THREE.TorusGeometry(0.09, 0.018, 6, 12)), neonMat, 0.34, 0.08, side * 0.13, 0, Math.PI / 2));
        }
        group.add(createPart(getGeom('lz_rear_cell', () => new THREE.SphereGeometry(0.19, 10, 6)), neonMat, -0.38, 0.06, 0));
        group.add(createPart(getGeom('lz_cell_cage', () => new THREE.TorusGeometry(0.21, 0.025, 6, 12)), darkMat, -0.38, 0.06, 0, 0, Math.PI / 2));
        group.add(createPart(getGeom('lz_grip', () => new THREE.BoxGeometry(0.15, 0.3, 0.15)), gripMat, -0.12, -0.21, 0, 0, 0, -0.18));
        group.add(createPart(getGeom('lz_trigger_guard', () => new THREE.TorusGeometry(0.08, 0.014, 5, 10, Math.PI)), darkMat, 0.02, -0.08, 0, 0, 0, Math.PI));
    }

    if (style === 'rifle' || style === 'machinegun' || style === 'shotgun') {
        group.add(createPart(getGeom(`${style}_front_sight`, () => new THREE.BoxGeometry(0.035, 0.09, 0.035)), darkMat, 0.48, 0.2, 0));
        group.add(createPart(getGeom(`${style}_rear_sight`, () => new THREE.BoxGeometry(0.05, 0.07, 0.05)), darkMat, -0.06, 0.2, 0));
    }

    group.rotation.y = Math.PI;
    return group;
}

function createArrowProjectileMesh() {
    const group = new THREE.Group();
    // Premium arrow — carbon shaft, broadhead tip, red fletching, nock
    const shaftMat = getMaterial('proj_arrow_shaft', () => new THREE.MeshStandardMaterial({ 
        color: 0x6b4c30, 
        roughness: 0.55, 
        metalness: 0.2, 
        map: createWoodTexture('#6b4c30')
    }));
    const tipMat = getMaterial('proj_arrow_tip', () => new THREE.MeshStandardMaterial({ 
        color: 0xc0c8d0, 
        metalness: 0.7, 
        roughness: 0.25, 
        map: createMetalTexture('#c0c8d0')
    }));
    const fletchMat = getMaterial('proj_arrow_fletch', () => new THREE.MeshStandardMaterial({ 
        color: 0xcc3333, 
        roughness: 0.6, 
        metalness: 0.05, 
        flatShading: true
    }));
    const nockMat = getMaterial('proj_arrow_nock', () => new THREE.MeshStandardMaterial({ 
        color: 0xe0d8c8, roughness: 0.5, metalness: 0.1, flatShading: true
    }));

    // Carbon-fiber look shaft
    group.add(createPart(getGeom('proj_arrow_shaft_g', () => new THREE.CylinderGeometry(0.042, 0.042, 1.9, 6)), shaftMat, 0, 0, 0, 0, 0, Math.PI / 2));
    // Broadhead tip with spines
    group.add(createPart(getGeom('proj_arrow_tip_g', () => new THREE.ConeGeometry(0.085, 0.28, 6)), tipMat, 1.08, 0, 0, 0, 0, -Math.PI / 2));
    for (let i=0;i<3;i++) {
        const a=(i/3)*Math.PI*2;
        group.add(createPart(getGeom(`proj_arrow_ts${i}`,()=>new THREE.BoxGeometry(0.03,0.15,0.015)),tipMat,1.0+Math.cos(a)*0.06,Math.sin(a)*0.06,0,0,0,a));
    }
    // 3 fletching vanes (helical)
    for (let i=0;i<3;i++) {
        const a=(i/3)*Math.PI*2;
        group.add(createPart(getGeom(`proj_arrow_f${i}`,()=>new THREE.BoxGeometry(0.28,0.1,0.025)),fletchMat,-0.85,Math.cos(a)*0.095,Math.sin(a)*0.095,a,0,0.15));
    }
    // Nock
    group.add(createPart(getGeom('proj_arrow_nock_g', () => new THREE.BoxGeometry(0.06, 0.1, 0.1)), nockMat, -1.0, 0, 0));
    group.scale.setScalar(1.05);
    configureMeshForGameplay(group);
    return group;
}

function getRotationOffsets(type) {
    if (type === 'knife') return { pitch: -Math.PI / 2, yaw: 0, roll: 0 };
    if (type === 'bow') return { pitch: 0.04, yaw: Math.PI / 2, roll: -0.04 };
    // Third-person alignment for character forward (+Z in our actor space).
    return { pitch: 0, yaw: Math.PI / 2, roll: 0 };
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
        base.rotation.set(0.1, -Math.PI / 2, Math.PI / 2.08);
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
    return 0.78;
}

const weaponModelTemplates = new Map();

function getWeaponModelTemplate(type) {
    let template = weaponModelTemplates.get(type);
    if (template) return template;
    template = new THREE.Group();
    if (type === 'knife') template.add(createKnifeModel());
    else if (type === 'bow') template.add(createBowModel());
    else if (type === 'pistol') template.add(createGunModel('pistol'));
    else if (type === 'rifle') template.add(createGunModel('rifle'));
    else if (type === 'machinegun') template.add(createGunModel('machinegun'));
    else if (type === 'shotgun') template.add(createGunModel('shotgun'));
    else if (type === 'flamethrower') template.add(createGunModel('flamethrower'));
    else if (type === 'laser') template.add(createGunModel('laser'));
    configureMeshForGameplay(template);
    template.userData.ignoreDamageTint = true;
    template.scale.setScalar(getThirdPersonWorldScale(type));
    weaponModelTemplates.set(type, template);
    return template;
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
        this._attackAnimationToken = 0;
        this._attackAnimationTimer = null;
        this._attackBasePosition = null;
        this._attackBaseRotation = null;

        // ── Animation system ──
        this.anim = new WeaponAnimation();

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
        const group = getWeaponModelTemplate(this.type).clone(true);
        group.userData.ignoreDamageTint = true;
        group.userData.baseRotation = new THREE.Euler(0, 0, 0);
        group.scale.setScalar(getThirdPersonWorldScale(this.type));
        group.visible = false;
        this.mesh = group;
        // DON'T add to scene — weapon will be attached to player socket
        // this.scene?.add(group);
    }

    static prewarm(type) {
        const normalized = normType(type);
        if (normalized !== 'fists') getWeaponModelTemplate(normalized);
    }

    // Attach weapon mesh to a THREE.Object3D socket (e.g., player's weaponSocket)
    attachToSocket(socket) {
        if (!this.mesh || !socket) return;
        // Remove from old parent if exists
        if (this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
        socket.add(this.mesh);
        this.mesh.visible = true;
        // Reset transform to socket-local space
        this.mesh.position.set(0, 0, 0);
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.scale.setScalar(getThirdPersonWorldScale(this.type));
    }

    detachFromSocket() {
        if (!this.mesh) return;
        this.mesh.visible = false;
        // Remove from parent
        if (this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
    }

    // ── Animation update — call this every frame ──
    updateAnimation(delta, isShooting, isMoving, mouseDx, mouseDy) {
        if (!this.anim) return;
        this.anim.update(delta, isShooting, isMoving, mouseDx || 0, mouseDy || 0);
        this.anim.applyToMesh(this.mesh, this.type);
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
        if (!options?.ignoreCooldown && now - this.lastAttackTime < this.cooldown) return false;

        if (this.type === 'knife' && this.durability !== null && this.durability <= 0) return false;
        if (this.maxAmmo !== null && this.ammo <= 0) return false;
        this.lastAttackTime = now;

        this.ensureFiniteTransform();
        this.animateAttack();

        // ── Trigger recoil animation ──
        this.anim?.triggerRecoil();

        if (audioSynth) {
            const ownerType = owner?.constructor?.name || 'entity';
            const srcPos = ownerType === 'Player' ? null : (owner?.position || null);
            const srcKey = ownerType === 'Player' ? 'player' : (owner?.id !== undefined ? `id:${owner.id}` : ownerType);
            if (this.type === 'knife' || this.type === 'fists') audioSynth.playHit?.(srcPos, srcKey);
            else if (this.type === 'bow') audioSynth.playBowShot?.(srcPos, srcKey);
            else if (this.type === 'laser') audioSynth.playLaser?.(srcPos, srcKey);
            else if (this.type === 'shotgun') audioSynth.playShotgun?.(1, srcPos, srcKey);
            else if (this.type === 'flamethrower') audioSynth.playFlamethrower?.(srcPos, srcKey);
            else if (this.type === 'pistol') audioSynth.playPistol?.(srcPos, srcKey);
            else if (this.type === 'machinegun') audioSynth.playMachinegun?.(srcPos, srcKey);
            else if (this.type === 'rifle') audioSynth.playRifle?.(srcPos, srcKey);
        }

        if (this.type === 'fists' || this.type === 'knife') {
            return this.meleeAttack(owner, target);
        }
        return this.rangedAttack(owner, target, directionOverride, options || {});
    }

    meleeAttack(owner, target) {
        // Melee recoil
        this.anim?.triggerRecoil();
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
            const pelletCount = this.getProfile().pellets || 9;
            for (let i = 0; i < pelletCount; i++) {
                const spread = new THREE.Vector3((Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.14);
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
            const m = getMaterial('proj_laser_v2', () => new THREE.MeshBasicMaterial({ color: 0x7ff8ff }));
            mesh = createPart(getGeom('proj_laser_v2', () => new THREE.CylinderGeometry(0.07, 0.07, 0.8, 8)), m, 0, 0, 0, 0, 0, Math.PI / 2);
            knockback = 5;
            gravity = 0;
        } else if (type === 'bow') {
            mesh = createArrowProjectileMesh();
            knockback = 6;
            gravity = 0.02;
        } else if (type === 'pistol' || type === 'rifle' || type === 'machinegun' || type === 'shotgun') {
            const m = getMaterial('proj_bullet_v2', () => new THREE.MeshBasicMaterial({ color: 0xffd54f }));
            mesh = createPart(getGeom('proj_bullet_v2', () => new THREE.CylinderGeometry(0.055, 0.055, 0.7, 8)), m, 0, 0, 0, 0, 0, Math.PI / 2);
            knockback = type === 'rifle' || type === 'machinegun' ? 4 : 3;
        } else if (type === 'flame') {
            const m = getMaterial('proj_flame_v2', () => new THREE.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.88 }));
            mesh = createPart(getGeom('proj_flame_v2', () => new THREE.ConeGeometry(0.28, 0.85, 7)), m, 0, 0, 0, 0, 0, Math.PI / 2);
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
        this.ensureFiniteTransform();
        if (!this._attackAnimationTimer) {
            if (!this._attackBasePosition) this._attackBasePosition = this.mesh.position.clone();
            else this._attackBasePosition.copy(this.mesh.position);
            if (!this._attackBaseRotation) this._attackBaseRotation = this.mesh.rotation.clone();
            else this._attackBaseRotation.copy(this.mesh.rotation);
        } else {
            clearTimeout(this._attackAnimationTimer);
        }
        this.mesh.position.copy(this._attackBasePosition);
        this.mesh.rotation.copy(this._attackBaseRotation);
        const token = ++this._attackAnimationToken;
        const duration = this.type === 'bow' ? 200 : 120;
        if (this.type === 'knife') {
            this.mesh.rotation.x -= 0.6;
            this.mesh.position.z -= 0.1;
        } else if (this.type === 'bow') {
            this.mesh.rotation.z -= 0.2;
        } else if (this.type === 'flamethrower') {
            this.mesh.rotation.x -= 0.12;
        } else {
            this.mesh.rotation.x -= 0.25;
            this.mesh.position.z -= 0.06;
        }
        this._attackAnimationTimer = setTimeout(() => {
            if (!this.mesh || token !== this._attackAnimationToken) return;
            this.mesh.position.copy(this._attackBasePosition);
            this.mesh.rotation.copy(this._attackBaseRotation);
            this._attackAnimationTimer = null;
        }, duration);
    }

    setVisible(visible) {
        if (this.mesh) this.mesh.visible = visible;
    }

    setPosition(position) {
        if (!this.mesh || !position || ![position.x, position.y, position.z].every(Number.isFinite)) return;
        this.mesh.position.copy(position);
    }

    setRotation(rotation) {
        if (!this.mesh || !rotation || ![rotation.x, rotation.y, rotation.z].every(Number.isFinite)) return;
        const o = getRotationOffsets(this.type);
        this.mesh.rotation.set(rotation.x + o.pitch, rotation.y + o.yaw, rotation.z + o.roll);
    }

    ensureFiniteTransform() {
        if (!this.mesh) return;
        if (![this.mesh.position.x, this.mesh.position.y, this.mesh.position.z].every(Number.isFinite)) this.mesh.position.set(0, 0, 0);
        if (![this.mesh.rotation.x, this.mesh.rotation.y, this.mesh.rotation.z].every(Number.isFinite)) this.mesh.rotation.set(0, 0, 0);
        if (![this.mesh.scale.x, this.mesh.scale.y, this.mesh.scale.z].every(Number.isFinite)) this.mesh.scale.setScalar(getThirdPersonWorldScale(this.type));
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
