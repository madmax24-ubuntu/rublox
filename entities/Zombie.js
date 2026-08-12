import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

let zombieLodGeometry = null;
const ACID_GEOMETRY = new THREE.SphereGeometry(0.22, 8, 6);
const ACID_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xb8ff24 });
const getZombieLodGeometry = () => {
    if (zombieLodGeometry) return zombieLodGeometry;
    const parts = [
        [0.9, 1.1, 0.62, 0, 0.9, 0],
        [0.68, 0.68, 0.68, 0, 1.72, 0],
        [0.22, 0.8, 0.22, -0.54, 0.98, 0.08],
        [0.22, 0.8, 0.22, 0.54, 0.98, 0.08],
        [0.24, 0.72, 0.24, -0.21, 0.3, 0],
        [0.24, 0.72, 0.24, 0.21, 0.3, 0]
    ].map(([w, h, d, x, y, z]) => {
        const geometry = new THREE.BoxGeometry(w, h, d);
        geometry.translate(x, y, z);
        return geometry;
    });
    zombieLodGeometry = BufferGeometryUtils.mergeGeometries(parts);
    for (const part of parts) part.dispose();
    return zombieLodGeometry;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const ZOMBIE_TEXTURES = {};
const _createZombieTexture = (variant, baseColorHex) => {
    const key = `zombie_${variant}`;
    if (ZOMBIE_TEXTURES[key]) return ZOMBIE_TEXTURES[key];
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const baseColor = new THREE.Color(baseColorHex);
    const r = Math.floor(baseColor.r * 255);
    const g = Math.floor(baseColor.g * 255);
    const b = Math.floor(baseColor.b * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, size, size);
    const addNoise = (intensity = 30) => {
        for (let i = 0; i < 3000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const v = (Math.random() - 0.5) * intensity;
            ctx.fillStyle = `rgba(${clamp(r + v, 0, 255)},${clamp(g + v, 0, 255)},${clamp(b + v, 0, 255)},0.6)`;
            ctx.fillRect(x, y, 1 + Math.random() * 2, 1);
        }
    };
    const addStain = (x, y, radius, darkness = 40) => {
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, `rgba(${clamp(r - darkness, 0, 255)},${clamp(g - darkness, 0, 255)},${clamp(b - darkness, 0, 255)},0.5)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
    };
    const addScratch = () => {
        ctx.strokeStyle = `rgba(${clamp(r - 50, 0, 255)},${clamp(g - 50, 0, 255)},${clamp(b - 50, 0, 255)},0.7)`;
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        ctx.moveTo(Math.random() * size, Math.random() * size);
        ctx.lineTo(Math.random() * size, Math.random() * size);
        ctx.stroke();
    };
    addNoise();
    for (let i = 0; i < 8; i++) addStain(Math.random() * size, Math.random() * size, 15 + Math.random() * 30);
    for (let i = 0; i < 6; i++) addScratch();
    if (variant === 'runner') {
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = `rgba(80,40,30,0.4)`;
            ctx.fillRect(Math.random() * size, Math.random() * size, 8 + Math.random() * 15, 2 + Math.random() * 3);
        }
    } else if (variant === 'heavy') {
        for (let i = 0; i < 12; i++) {
            ctx.fillStyle = `rgba(100,80,60,0.35)`;
            ctx.fillRect(Math.random() * size, Math.random() * size, 3 + Math.random() * 5, 3 + Math.random() * 5);
        }
    } else if (variant === 'crawler') {
        for (let i = 0; i < 15; i++) {
            ctx.fillStyle = `rgba(60,120,140,0.3)`;
            ctx.beginPath();
            ctx.arc(Math.random() * size, Math.random() * size, 3 + Math.random() * 8, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (variant === 'toxic') {
        for (let i = 0; i < 10; i++) {
            ctx.fillStyle = `rgba(100,200,50,0.25)`;
            ctx.beginPath();
            ctx.arc(Math.random() * size, Math.random() * size, 5 + Math.random() * 12, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    ZOMBIE_TEXTURES[key] = texture;
    return texture;
};

const STALKER_TEXTURES = {
    camo: null, vest: null, gasMask: null, boots: null, helmet: null, backpack: null, blood: null
};
const _createStalkerTexture = (type) => {
    if (STALKER_TEXTURES[type]) return STALKER_TEXTURES[type];
    const size = type === 'camo' ? 512 : 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (type === 'camo') {
        ctx.fillStyle = '#3b4a3a';
        ctx.fillRect(0, 0, size, size);
        const colors = ['#2d4a1e','#3a5a2a','#1a3510','#4a7a3a','#3d5d2d'];
        for (let i = 0; i < 200; i++) {
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.beginPath();
            const ps = 10 + Math.random() * 20;
            ctx.ellipse(Math.random()*size, Math.random()*size, ps, ps*(0.4+Math.random()*0.6), Math.random()*Math.PI, 0, Math.PI*2);
            ctx.fill();
        }
        const mudColors = ['#5a3a1a','#3a2a0a','#4a2a0a'];
        for (let i = 0; i < 25; i++) {
            ctx.fillStyle = mudColors[Math.floor(Math.random() * mudColors.length)];
            ctx.globalAlpha = 0.3 + Math.random() * 0.3;
            ctx.beginPath();
            ctx.ellipse(Math.random()*size, Math.random()*size, 5+Math.random()*15, 5+Math.random()*12, Math.random()*Math.PI, 0, Math.PI*2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        const d = ctx.getImageData(0, 0, size, size);
        for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random()-0.5)*25; d.data[i]+=n; d.data[i+1]+=n; d.data[i+2]+=n; }
        ctx.putImageData(d, 0, 0);
    } else if (type === 'vest') {
        ctx.fillStyle = '#222a20';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = '#353530'; ctx.lineWidth = 2.5;
        for (let y = 8; y < size; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke(); }
        for (let x = 8; x < size; x += 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke(); }
        ctx.strokeStyle = '#1a1d18'; ctx.lineWidth = 1;
        for (let y = 4; y < size; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke(); }
        ctx.fillStyle = '#3a3d35';
        ctx.fillRect(size*0.1, size*0.1, size*0.3, size*0.3);
        ctx.fillRect(size*0.6, size*0.1, size*0.3, size*0.3);
        ctx.fillRect(size*0.1, size*0.5, size*0.3, size*0.3);
        ctx.fillRect(size*0.6, size*0.5, size*0.3, size*0.3);
        ctx.strokeStyle = '#4a4d42'; ctx.lineWidth = 1.5;
        ctx.strokeRect(size*0.1, size*0.1, size*0.3, size*0.3);
        ctx.strokeRect(size*0.6, size*0.1, size*0.3, size*0.3);
        ctx.fillStyle = '#5a5a5a'; ctx.fillRect(size*0.42, size*0.45, size*0.16, size*0.1);
        ctx.strokeStyle = 'rgba(90,90,80,0.4)'; ctx.lineWidth = 1;
        for (let i = 0; i < 20; i++) { ctx.beginPath(); ctx.moveTo(Math.random()*size, Math.random()*size); ctx.lineTo(Math.random()*size, Math.random()*size); ctx.stroke(); }
        const d = ctx.getImageData(0, 0, size, size);
        for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random()-0.5)*14; d.data[i]+=n; d.data[i+1]+=n; d.data[i+2]+=n; }
        ctx.putImageData(d, 0, 0);
    } else if (type === 'gasMask') {
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 60; i++) { const s = 45+Math.random()*35; ctx.fillStyle=`rgb(${s},${s},${s})`; ctx.beginPath(); ctx.arc(Math.random()*size, Math.random()*size, 1+Math.random()*3, 0, Math.PI*2); ctx.fill(); }
        ctx.fillStyle = '#151515';
        ctx.beginPath(); ctx.arc(size*0.3, size*0.4, 14, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(size*0.7, size*0.4, 14, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath(); ctx.arc(size*0.3, size*0.4, 10, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(size*0.7, size*0.4, 10, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#282822';
        ctx.beginPath(); ctx.ellipse(size*0.5, size*0.65, 14, 7, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#252525'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) { const a = Math.random()*Math.PI*2; ctx.beginPath(); ctx.arc(size*0.5, size*0.5, 20+Math.random()*20, a, a+0.8); ctx.stroke(); }
        const d = ctx.getImageData(0, 0, size, size);
        for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random()-0.5)*12; d.data[i]+=n; d.data[i+1]+=n; d.data[i+2]+=n; }
        ctx.putImageData(d, 0, 0);
    } else if (type === 'boots') {
        ctx.fillStyle = '#2a1a0a';
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = `rgba(${30+Math.floor(Math.random()*20)},${15+Math.floor(Math.random()*15)},${10+Math.floor(Math.random()*10)},0.3)`;
            ctx.beginPath();
            ctx.ellipse(Math.random()*size, Math.random()*size, 3+Math.random()*8, 3+Math.random()*8, Math.random()*Math.PI, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.strokeStyle = '#1a0a02'; ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(Math.random()*size, Math.random()*size); ctx.lineTo(Math.random()*size, Math.random()*size); ctx.stroke(); }
        ctx.fillStyle = '#0a0a0a';
        for (let y = 0; y < size; y += 6) for (let x = 0; x < size; x += 8) if (Math.random() > 0.3) ctx.fillRect(x, y, 4, 3);
        ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(size*0.45, 0); for(let y=0;y<size*0.4;y+=8) ctx.lineTo(size*(0.45+(Math.random()-0.5)*0.1), y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(size*0.55, 0); for(let y=0;y<size*0.4;y+=8) ctx.lineTo(size*(0.55+(Math.random()-0.5)*0.1), y); ctx.stroke();
        const d = ctx.getImageData(0, 0, size, size);
        for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random()-0.5)*28; d.data[i]+=n; d.data[i+1]+=n; d.data[i+2]+=n; }
        ctx.putImageData(d, 0, 0);
    } else if (type === 'helmet') {
        ctx.fillStyle = '#3a5a2a';
        ctx.fillRect(0, 0, size, size);
        const colors = ['#2a4a1a','#4a7a3a','#1a3a10','#5a8a4a', '#3d6d2d'];
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.beginPath();
            const ps = 6+Math.random()*14;
            ctx.ellipse(Math.random()*size, Math.random()*size, ps, ps*0.7, Math.random()*Math.PI, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.strokeStyle = 'rgba(90,90,80,0.45)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.moveTo(Math.random()*size, Math.random()*size); ctx.lineTo(Math.random()*size, Math.random()*size); ctx.stroke(); }
        const d = ctx.getImageData(0, 0, size, size);
        for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random()-0.5)*18; d.data[i]+=n; d.data[i+1]+=n; d.data[i+2]+=n; }
        ctx.putImageData(d, 0, 0);
    } else if (type === 'backpack') {
        ctx.fillStyle = '#2a3a1a';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = '#1a2a0a'; ctx.lineWidth = 2;
        ctx.strokeRect(size*0.1, size*0.1, size*0.8, size*0.8);
        ctx.fillStyle = '#0a1508'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(size*0.5, size*0.1); ctx.lineTo(size*0.5, size*0.9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(size*0.1, size*0.5); ctx.lineTo(size*0.9, size*0.5); ctx.stroke();
        ctx.fillStyle = '#3a4a2a';
        ctx.fillRect(size*0.15, size*0.15, size*0.3, size*0.3);
        ctx.fillRect(size*0.55, size*0.15, size*0.3, size*0.3);
        ctx.fillRect(size*0.15, size*0.55, size*0.3, size*0.25);
        ctx.fillRect(size*0.55, size*0.55, size*0.3, size*0.25);
        ctx.strokeStyle = '#4a5a3a'; ctx.lineWidth = 1;
        ctx.strokeRect(size*0.15, size*0.15, size*0.3, size*0.3);
        ctx.strokeRect(size*0.55, size*0.15, size*0.3, size*0.3);
        const d = ctx.getImageData(0, 0, size, size);
        for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random()-0.5)*20; d.data[i]+=n; d.data[i+1]+=n; d.data[i+2]+=n; }
        ctx.putImageData(d, 0, 0);
        } else if (type === 'blood') {
            ctx.fillStyle = '#3a0000';
            ctx.fillRect(0, 0, size, size);
            for (let i = 0; i < 200; i++) {
                const shade = Math.floor(Math.random() * 60 + 20);
                ctx.fillStyle = `rgb(${shade + 100}, ${shade}, ${shade})`;
                ctx.beginPath();
                ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 6, 0, Math.PI * 2);
                ctx.fill();
            }
            const d = ctx.getImageData(0, 0, size, size);
            for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * 20; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
            ctx.putImageData(d, 0, 0);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    STALKER_TEXTURES[type] = texture;
    return texture;
};

const _morphStalkerGeo = (box, sx, sy, sz, morphs) => {
    const pos = box.attributes.position;
    const hw = box.parameters.width / 2, hh = box.parameters.height / 2, hd = box.parameters.depth / 2;
    const eps = 0.001;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (morphs.top && Math.abs(y - hh) < eps) morphs.top(i, x, y, z, pos);
        if (morphs.bottom && Math.abs(y + hh) < eps) morphs.bottom(i, x, y, z, pos);
        if (morphs.front && Math.abs(z - hd) < eps) morphs.front(i, x, y, z, pos);
        if (morphs.back && Math.abs(z + hd) < eps) morphs.back(i, x, y, z, pos);
        if (morphs.right && Math.abs(x - hw) < eps) morphs.right(i, x, y, z, pos);
        if (morphs.left && Math.abs(x + hw) < eps) morphs.left(i, x, y, z, pos);
    }
    box.computeVertexNormals();
};

const _createStalkerGeometry = (part) => {
    let w, h, d, sx, sy, sz, morphs;
    switch (part) {
        case 'helmet':
            w = 0.82; h = 0.37; d = 0.82; sx = 3; sy = 3; sz = 3;
            morphs = {
                top: (i,x,y,z,pos) => { const dx=x, dz=z, r=Math.sqrt(dx*dx+dz*dz), maxR=0.42, rise=0.16*Math.max(0,1-r/maxR); pos.setY(i, y+rise); },
                front: (i,x,y,z,pos) => { pos.setZ(i, z+0.03); },
                back: (i,x,y,z,pos) => { pos.setZ(i, z+0.01); }
            };
            break;
        case 'head':
            w = 0.72; h = 0.72; d = 0.72; sx = 2; sy = 2; sz = 2;
            morphs = {
                front: (i,x,y,z,pos) => { const crv=0.06*Math.max(0,1-Math.abs(y)/0.36); pos.setZ(i, z+crv); },
                left: (i,x,y,z,pos) => { pos.setX(i, x+0.015); },
                right: (i,x,y,z,pos) => { pos.setX(i, x-0.015); }
            };
            break;
        case 'vest':
            w = 0.82; h = 0.9; d = 0.11; sx = 4; sy = 4; sz = 2;
            morphs = {
                front: (i,x,y,z,pos) => { const crv=0.025*Math.min(1,Math.abs(y)/0.45); pos.setZ(i, z+crv); }
            };
            break;
        case 'torso':
            w = 0.78; h = 0.95; d = 0.52; sx = 3; sy = 3; sz = 2;
            morphs = {
                top: (i,x,y,z,pos) => { const s=0.88; pos.setX(i, x*s); },
                front: (i,x,y,z,pos) => { pos.setZ(i, z+0.015); }
            };
            break;
        case 'backpack':
            w = 0.48; h = 0.64; d = 0.22; sx = 2; sy = 2; sz = 1;
            morphs = {
                top: (i,x,y,z,pos) => { const r=Math.sqrt(x*x+z*z), mx=0.25, rise=0.025*Math.max(0,1-r/mx); pos.setY(i, y+rise); }
            };
            break;
        case 'arm':
            w = 0.2; h = 0.68; d = 0.2; sx = 2; sy = 4; sz = 2;
            morphs = {
                top: (i,x,y,z,pos) => { const yN=(y+0.34)/0.68, s=0.25+0.75*(1-yN); const cw=w*s/2; pos.setX(i, x*s); pos.setZ(i, z*s); },
                front: (i,x,y,z,pos) => { const yN=(y+0.34)/0.68, crv=0.018*Math.sin(yN*Math.PI); pos.setZ(i, z+crv); }
            };
            break;
        case 'leg':
            w = 0.2; h = 0.68; d = 0.2; sx = 2; sy = 4; sz = 2;
            morphs = {
                top: (i,x,y,z,pos) => { const yN=(y+0.34)/0.68, baseS=1.0, tipS=1.25, s=tipS+(baseS-tipS)*yN; pos.setX(i, x*s/1.15); },
                front: (i,x,y,z,pos) => { const yN=(y+0.34)/0.68, crv=0.025*Math.sin(yN*Math.PI); pos.setZ(i, z+crv); }
            };
            break;
        case 'knee':
            w = 0.22; h = 0.18; d = 0.16; sx = 1; sy = 1; sz = 1;
            morphs = {
                front: (i,x,y,z,pos) => { pos.setZ(i, z+0.04); }
            };
            break;
        case 'boot':
            w = 0.24; h = 0.16; d = 0.32; sx = 2; sy = 1; sz = 2;
            morphs = {
                front: (i,x,y,z,pos) => { pos.setZ(i, z+0.05); },
                top: (i,x,y,z,pos) => { pos.setY(i, y+0.008); }
            };
            break;
        case 'pouch':
            w = 0.2; h = 0.26; d = 0.14; sx = 2; sy = 2; sz = 1;
            morphs = {
                front: (i,x,y,z,pos) => { pos.setZ(i, z+0.025); }
            };
            break;
        default:
            return new THREE.BoxGeometry(w||0.2, h||0.2, d||0.2);
    }
    const box = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
    _morphStalkerGeo(box, sx, sy, sz, morphs);
    return box;
};

const STALKER_GEOMETRIES_CACHE = {};
const _getStalkerGeo = (part) => {
    if (!STALKER_GEOMETRIES_CACHE[part]) STALKER_GEOMETRIES_CACHE[part] = _createStalkerGeometry(part);
    return STALKER_GEOMETRIES_CACHE[part];
};

const STALKER_MATERIALS_CACHE = {};
const STALKER_MATERIALS = {
    get camo() { return (STALKER_MATERIALS_CACHE.camo ??= new THREE.MeshStandardMaterial({ map: STALKER_TEXTURES.camo || _createStalkerTexture('camo'), roughness: 0.7, metalness: 0, flatShading: true })); },
    get vest() { return (STALKER_MATERIALS_CACHE.vest ??= new THREE.MeshStandardMaterial({ map: STALKER_TEXTURES.vest || _createStalkerTexture('vest'), roughness: 0.5, metalness: 0.1, flatShading: true })); },
    get gasMask() { return (STALKER_MATERIALS_CACHE.gasMask ??= new THREE.MeshStandardMaterial({ map: STALKER_TEXTURES.gasMask || _createStalkerTexture('gasMask'), roughness: 0.6, metalness: 0.2, flatShading: true })); },
    get boot() { return (STALKER_MATERIALS_CACHE.boot ??= new THREE.MeshStandardMaterial({ map: STALKER_TEXTURES.boots || _createStalkerTexture('boots'), roughness: 0.85, metalness: 0, flatShading: true })); },
    get helmet() { return (STALKER_MATERIALS_CACHE.helmet ??= new THREE.MeshStandardMaterial({ map: STALKER_TEXTURES.helmet || _createStalkerTexture('helmet'), roughness: 0.7, metalness: 0, flatShading: true })); },
    get backpack() { return (STALKER_MATERIALS_CACHE.backpack ??= new THREE.MeshStandardMaterial({ map: STALKER_TEXTURES.backpack || _createStalkerTexture('backpack'), roughness: 0.7, metalness: 0, flatShading: true })); },
    lens: new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.2, metalness: 0.8 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb89a7a, roughness: 0.6, flatShading: true }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7, flatShading: true })
};

const STALKER_DETAIL_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.6, flatShading: true });

const _setWorldTransform = (obj, orig) => {
    obj.matrix.copy(orig.matrixWorld);
    obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
    obj.updateMatrix();
    return obj;
};
const _clonePreserveWorld = (orig) => {
    const mesh = new THREE.Mesh(orig.geometry.clone(), orig.material.clone());
    mesh.scale.set(1, 1, 1);
    _setWorldTransform(mesh, orig);
    return mesh;
};
const _setWorldTransformGroup = (group, origGroup) => {
    group.position.copy(origGroup.matrixWorld.decompose().position);
    group.quaternion.copy(origGroup.matrixWorld.decompose().quaternion);
    group.scale.set(1, 1, 1);
    group.updateMatrixWorld();
};

const VARIANT_CONFIG = {
    runner: {
        health: 42, speed: 5.7, damage: 6.4, knockbackMultiplier: 1.2,
        scale: 1.2, radius: 0.48, bodyColor: 0xc34b2f, headColor: 0xc8c2a7, detailColor: 0xf0a13b,
        eyeColor: 0xff4411, glowColor: 0x44ff22, glowIntensity: 1.8,
        attackCooldown: 0.46, patrolSpeed: 0.82, alertRadius: 94,
        moanInterval: [1.2, 2.4], attackInterval: [0.3, 0.8],
        hasHorns: false, hasMask: true, hasSpikes: false, hasBackpack: false,
        hasArmorPlates: false, armAngle: -0.8, clawLength: 0.25,
        walkSpeed: 5.6, idleBreathe: 0.02,
        behavior: 'rush'
    },
    normal: {
        health: 72, speed: 4.0, damage: 7.8, knockbackMultiplier: 0.8,
        scale: 1.35, radius: 0.54, bodyColor: 0x6f3434, headColor: 0xb9b49b, detailColor: 0xd7c7a2,
        eyeColor: 0xff6600, glowColor: 0x8bff4f, glowIntensity: 1.35,
        attackCooldown: 0.64, patrolSpeed: 0.78, alertRadius: 82,
        moanInterval: [1.8, 3.6], attackInterval: [0.5, 1.2],
        hasHorns: true, hasMask: false, hasSpikes: false, hasBackpack: false,
        hasArmorPlates: true, armAngle: -0.85, clawLength: 0.3,
        walkSpeed: 4.2, idleBreathe: 0.015,
        behavior: 'patrol'
    },
    heavy: {
        health: 180, speed: 2.55, damage: 10.2, knockbackMultiplier: 0,
        scale: 1.56, radius: 0.6, bodyColor: 0x3f4a50, headColor: 0x9c7a70, detailColor: 0xb23b2f,
        eyeColor: 0xff2200, glowColor: 0x3dff1f, glowIntensity: 2.2,
        attackCooldown: 0.94, patrolSpeed: 0.76, alertRadius: 70,
        moanInterval: [2.5, 4.5], attackInterval: [0.8, 1.8],
        hasHorns: true, hasMask: false, hasSpikes: true, hasBackpack: true,
        hasArmorPlates: true, armAngle: -0.95, clawLength: 0.35,
        walkSpeed: 2.8, idleBreathe: 0.01,
        behavior: 'tank'
    },
    crawler: {
        health: 58, speed: 4.9, damage: 7.0, knockbackMultiplier: 1.05,
        scale: 1.15, radius: 0.74, bodyColor: 0x405e72, headColor: 0xa8bbc0, detailColor: 0x5dd9ef,
        eyeColor: 0xb7f4ff, glowColor: 0x38b9d6, glowIntensity: 1.15,
        attackCooldown: 0.5, patrolSpeed: 0.92, alertRadius: 90,
        moanInterval: [1.5, 3.0], attackInterval: [0.4, 0.9],
        hasHorns: false, hasMask: false, hasSpikes: true, hasBackpack: false,
        hasArmorPlates: false, armAngle: -1.25, clawLength: 0.38,
        walkSpeed: 6.3, idleBreathe: 0.025,
        behavior: 'crawl'
    },
    toxic: {
        health: 105, speed: 3.45, damage: 8.8, knockbackMultiplier: 0.55,
        scale: 1.42, radius: 0.57, bodyColor: 0xb5a52f, headColor: 0xc4bd82, detailColor: 0x24352e,
        eyeColor: 0xe8ff3d, glowColor: 0xa6ff19, glowIntensity: 2.7,
        attackCooldown: 0.72, patrolSpeed: 0.78, alertRadius: 102,
        moanInterval: [2.0, 4.0], attackInterval: [0.6, 1.3],
        hasHorns: false, hasMask: true, hasSpikes: false, hasBackpack: true,
        hasArmorPlates: false, armAngle: -0.72, clawLength: 0.28,
        walkSpeed: 3.9, idleBreathe: 0.035,
        behavior: 'toxic'
    },
    stalker: {
        health: 150, speed: 3.2, damage: 9.5, knockbackMultiplier: 0.6,
        scale: 1.3, radius: 0.5, bodyColor: 0x3b4a3a, headColor: 0x3a5a2a, detailColor: 0x1a1d20,
        eyeColor: 0x0a0c0e, glowColor: 0x4a6a3a, glowIntensity: 0.0,
        attackCooldown: 0.8, patrolSpeed: 0.7, alertRadius: 85,
        moanInterval: [3.0, 5.0], attackInterval: [0.6, 1.4],
        hasHorns: false, hasMask: true, hasSpikes: false, hasBackpack: true,
        hasArmorPlates: true, armAngle: -0.5, clawLength: 0.0,
        walkSpeed: 3.5, idleBreathe: 0.02,
        behavior: 'patrol'
    }
};

export class Zombie {
    constructor(scene, id, spawnPosition, forcedVariant = null) {
        this.scene = scene;
        this.id = id;
        this.isAlive = true;
        this.position = spawnPosition.clone();
        this.rotation = new THREE.Euler(0, 0, 0);
        this.physics = {
            velocity: new THREE.Vector3(0, 0, 0),
            onGround: false,
            height: 1.9,
            radius: 0.52,
            speed: 4.8
        };

        const variants = ['normal', 'runner', 'crawler', 'toxic', 'heavy', 'stalker'];
        this.variant = VARIANT_CONFIG[forcedVariant] ? forcedVariant : variants[Math.floor(Math.random() * variants.length)];
        const cfg = VARIANT_CONFIG[this.variant];
        this.maxHealth = cfg.health;
        this.health = cfg.health;
        this.physics.speed = cfg.speed;
        this.physics.radius = cfg.radius;
        this.knockbackMultiplier = cfg.knockbackMultiplier;
        this.damage = cfg.damage;
        this.attackCooldown = 0;
        this.patrolTarget = null;
        this.soundTimer = 2 + Math.random() * 3;
        this.alertTimer = 0;
        this.alertTarget = null;
        this.alertPosition = null;
        this._alertPositionVec = new THREE.Vector3();
        this.stats = { damage: 0, kills: 0, loot: 0 };
        this.burnTimer = 0;
        this.burnTickTimer = 0;
        this.burnDamagePerSecond = 0;
        this.burnAttacker = null;
        this.hitStaggerTimer = 0;
        this._deathAudioSynth = null;
        this._lodCameraForward = new THREE.Vector3();
        this._lodToEntity = new THREE.Vector3();
        this._dirVec = new THREE.Vector3();
        this._corpseGroup = null;
        this._isCorpsified = false;
        this._canPool = true;
        this._animTime = performance.now() * 0.001;
        this._moanPhase = Math.random() * Math.PI * 2;
        this._roamAngle = Math.random() * Math.PI * 2;
        this._roamTimer = 3 + Math.random() * 5;
        this.abilityCooldown = 1.2 + Math.random() * 2.4;
        this.abilityAnimationTimer = 0;
        this.acidProjectile = null;
        this._abilityDirection = new THREE.Vector3();
        this._projectileStart = new THREE.Vector3();
        this._projectileToTarget = new THREE.Vector3();

        this.mesh = this.createMesh();
        this._lodDetailed = true;
        this.mesh.traverse(child => {
            if (!child.material?.emissive) return;
            child.material.userData.baseEmissive = child.material.emissive.getHex();
            child.material.userData.baseEmissiveIntensity = child.material.emissiveIntensity;
        });
        this.mesh.scale.setScalar(cfg.scale);
        this.scene.add(this.mesh);
    }

    createMesh() {
        const group = new THREE.Group();
        const cfg = VARIANT_CONFIG[this.variant];

        const bodyTex = _createZombieTexture(this.variant, cfg.bodyColor);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: cfg.bodyColor, map: bodyTex, emissive: cfg.bodyColor, emissiveIntensity: 0.25, roughness: 0.75, flatShading: true
        });
        const headTex = _createZombieTexture(this.variant, cfg.headColor);
        const headMat = new THREE.MeshStandardMaterial({
            color: cfg.headColor, map: headTex, emissive: cfg.headColor, emissiveIntensity: 0.2, roughness: 0.75, flatShading: true
        });
        const grimeMat = new THREE.MeshStandardMaterial({
            color: 0x2e3b2e, roughness: 0.95, flatShading: true
        });
        const armorMat = new THREE.MeshStandardMaterial({
            color: 0x263238, roughness: 0.6, metalness: 0.2, flatShading: true
        });
        const glowMat = new THREE.MeshStandardMaterial({
            color: cfg.glowColor, emissive: cfg.glowColor,
            emissiveIntensity: cfg.glowIntensity, roughness: 0.2, flatShading: true
        });
        const eyeMat = new THREE.MeshStandardMaterial({
            color: cfg.eyeColor, emissive: cfg.eyeColor, emissiveIntensity: 2.4
        });
        const detailMat = new THREE.MeshStandardMaterial({
            color: cfg.detailColor, roughness: 0.72, flatShading: true
        });

        if (this.variant === 'runner') {
            const leanBody = new THREE.BoxGeometry(0.85, 1.0, 0.55);
            const body = new THREE.Mesh(leanBody, bodyMat);
            body.position.set(0.05, 0.85, 0.1);
            body.rotation.x = -0.15;
            group.add(body);

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), headMat);
            head.position.set(0.1, 1.6, 0.25);
            head.rotation.x = -0.2;
            group.add(head);

            const maskMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, flatShading: true });
            const mask = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.25), maskMat);
            mask.position.set(0.12, 1.55, 0.5);
            group.add(mask);

            const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
            const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMat);
            eyeL.position.set(0.05, 1.62, 0.55);
            eyeR.position.set(0.18, 1.62, 0.55);
            group.add(eyeL);
            group.add(eyeR);

            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), grimeMat);
            jaw.position.set(0.1, 1.45, 0.52);
            group.add(jaw);

            const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
            const leftArm = new THREE.Mesh(armGeo, bodyMat);
            const rightArm = new THREE.Mesh(armGeo, bodyMat);
            leftArm.position.set(-0.48, 0.9, 0.2);
            rightArm.position.set(0.58, 0.9, 0.2);
            leftArm.rotation.x = cfg.armAngle;
            rightArm.rotation.x = cfg.armAngle;
            group.add(leftArm);
            group.add(rightArm);

            const clawGeo = new THREE.ConeGeometry(0.07, cfg.clawLength, 5);
            const clawMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.5, metalness: 0.4, flatShading: true });
            const leftClaw = new THREE.Mesh(clawGeo, clawMat);
            const rightClaw = new THREE.Mesh(clawGeo, clawMat);
            leftClaw.position.set(-0.48, 0.6, 0.45);
            rightClaw.position.set(0.58, 0.6, 0.45);
            leftClaw.rotation.x = Math.PI / 2;
            rightClaw.rotation.x = Math.PI / 2;
            group.add(leftClaw);
            group.add(rightClaw);

            const legGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
            const leftLeg = new THREE.Mesh(legGeo, bodyMat);
            const rightLeg = new THREE.Mesh(legGeo, bodyMat);
            leftLeg.position.set(-0.18, 0.25, 0);
            rightLeg.position.set(0.18, 0.25, 0);
            group.add(leftLeg);
            group.add(rightLeg);

            const spine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), glowMat);
            spine.position.set(0, 0.9, -0.25);
            group.add(spine);

        } else if (this.variant === 'heavy') {
            const thickBody = new THREE.BoxGeometry(1.1, 1.3, 0.8);
            const body = new THREE.Mesh(thickBody, bodyMat);
            body.position.y = 1.0;
            group.add(body);

            const armorPlate = new THREE.Mesh(
                new THREE.BoxGeometry(1.15, 0.2, 0.85),
                armorMat
            );
            armorPlate.position.set(0, 1.55, 0);
            group.add(armorPlate);

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), headMat);
            head.position.y = 1.85;
            group.add(head);

            const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), eyeMat);
            const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), eyeMat);
            eyeL.position.set(-0.18, 1.9, 0.4);
            eyeR.position.set(0.18, 1.9, 0.4);
            group.add(eyeL);
            group.add(eyeR);

            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), grimeMat);
            jaw.position.set(0, 1.65, 0.4);
            group.add(jaw);

            const hornMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.2, flatShading: true });
            const hornGeo = new THREE.ConeGeometry(0.1, 0.35, 6);
            const leftHorn = new THREE.Mesh(hornGeo, hornMat);
            const rightHorn = new THREE.Mesh(hornGeo, hornMat);
            leftHorn.position.set(-0.3, 2.25, 0);
            rightHorn.position.set(0.3, 2.25, 0);
            leftHorn.rotation.z = Math.PI / 2;
            rightHorn.rotation.z = -Math.PI / 2;
            group.add(leftHorn);
            group.add(rightHorn);

            const armGeo = new THREE.BoxGeometry(0.25, 0.8, 0.25);
            const leftArm = new THREE.Mesh(armGeo, bodyMat);
            const rightArm = new THREE.Mesh(armGeo, bodyMat);
            leftArm.position.set(-0.65, 1.0, 0.15);
            rightArm.position.set(0.65, 1.0, 0.15);
            leftArm.rotation.x = cfg.armAngle;
            rightArm.rotation.x = cfg.armAngle;
            group.add(leftArm);
            group.add(rightArm);

            const clawGeo = new THREE.ConeGeometry(0.09, cfg.clawLength, 5);
            const clawMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.5, metalness: 0.4, flatShading: true });
            const leftClaw = new THREE.Mesh(clawGeo, clawMat);
            const rightClaw = new THREE.Mesh(clawGeo, clawMat);
            leftClaw.position.set(-0.65, 0.65, 0.4);
            rightClaw.position.set(0.65, 0.65, 0.4);
            leftClaw.rotation.x = Math.PI / 2;
            rightClaw.rotation.x = Math.PI / 2;
            group.add(leftClaw);
            group.add(rightClaw);

            const legGeo = new THREE.BoxGeometry(0.25, 0.75, 0.25);
            const leftLeg = new THREE.Mesh(legGeo, bodyMat);
            const rightLeg = new THREE.Mesh(legGeo, bodyMat);
            leftLeg.position.set(-0.25, 0.3, 0);
            rightLeg.position.set(0.25, 0.3, 0);
            group.add(leftLeg);
            group.add(rightLeg);

            const backpack = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.75, 0.3),
                armorMat
            );
            backpack.position.set(0, 1.1, -0.45);
            group.add(backpack);

            const spine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), glowMat);
            spine.position.set(0, 1.1, -0.35);
            group.add(spine);

            const spikesGeo = new THREE.ConeGeometry(0.07, 0.22, 5);
            const spikesMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.5, flatShading: true });
            for (let i = 0; i < 6; i++) {
                const spike = new THREE.Mesh(spikesGeo, spikesMat);
                spike.position.set(-0.35 + i * 0.15, 1.4, -0.5);
                spike.rotation.x = -Math.PI / 2;
                group.add(spike);
            }

        } else if (this.variant === 'crawler') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.55, 1.15), bodyMat);
            body.position.set(0, 0.58, 0.12);
            body.rotation.x = -0.08;
            group.add(body);

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.66), headMat);
            head.position.set(0, 0.68, 0.82);
            head.rotation.x = -0.28;
            group.add(head);

            for (const x of [-0.16, 0.16]) {
                const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.04), eyeMat);
                eye.position.set(x, 0.76, 1.16);
                group.add(eye);
            }

            const limbGeo = new THREE.BoxGeometry(0.17, 0.62, 0.17);
            const limbs = [
                [-0.47, 0.36, 0.48, -1.25],
                [0.47, 0.36, 0.48, -1.25],
                [-0.42, 0.32, -0.32, -0.9],
                [0.42, 0.32, -0.32, -0.9]
            ];
            for (const [x, y, z, rot] of limbs) {
                const limb = new THREE.Mesh(limbGeo, bodyMat);
                limb.position.set(x, y, z);
                limb.rotation.x = rot;
                group.add(limb);
            }

            const ridgeGeo = new THREE.ConeGeometry(0.08, 0.3, 5);
            for (let i = 0; i < 5; i++) {
                const ridge = new THREE.Mesh(ridgeGeo, glowMat);
                ridge.position.set(0, 0.9, -0.3 + i * 0.22);
                ridge.rotation.x = -Math.PI / 2;
                group.add(ridge);
            }
        } else if (this.variant === 'toxic') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.2, 0.68), bodyMat);
            body.position.set(0, 0.95, 0);
            body.rotation.z = 0.08;
            group.add(body);

            const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.46, 0), headMat);
            head.position.set(0.12, 1.82, 0.08);
            group.add(head);

            for (const x of [-0.13, 0.17]) {
                const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), eyeMat);
                eye.position.set(x, 1.87, 0.48);
                group.add(eye);
            }

            const armGeo = new THREE.BoxGeometry(0.22, 0.76, 0.22);
            const leftArm = new THREE.Mesh(armGeo, bodyMat);
            const rightArm = new THREE.Mesh(armGeo, bodyMat);
            leftArm.position.set(-0.58, 1.02, 0.12);
            rightArm.position.set(0.6, 0.94, 0.18);
            leftArm.rotation.x = -0.68;
            rightArm.rotation.x = -0.92;
            group.add(leftArm, rightArm);

            const legGeo = new THREE.BoxGeometry(0.23, 0.72, 0.23);
            const leftLeg = new THREE.Mesh(legGeo, grimeMat);
            const rightLeg = new THREE.Mesh(legGeo, grimeMat);
            leftLeg.position.set(-0.23, 0.28, 0);
            rightLeg.position.set(0.23, 0.28, 0);
            group.add(leftLeg, rightLeg);

            for (const [x, y, z, s] of [[-0.42, 1.28, -0.34, 0.3], [0.38, 1.02, -0.4, 0.38], [0.06, 1.5, -0.38, 0.24]]) {
                const sac = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), glowMat);
                sac.position.set(x, y, z);
                group.add(sac);
            }
        } else if (this.variant === 'normal') {
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.6), bodyMat);
            body.position.y = 0.9;
            group.add(body);

            const rib = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.08), grimeMat);
            rib.position.set(0, 0.95, 0.34);
            group.add(rib);

            const shoulderPlate = new THREE.Mesh(
                new THREE.BoxGeometry(1.05, 0.18, 0.6),
                armorMat
            );
            shoulderPlate.position.set(0, 1.5, 0);
            group.add(shoulderPlate);

            const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), headMat);
            head.position.y = 1.7;
            group.add(head);

            const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
            const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
            eyeL.position.set(-0.14, 1.75, 0.35);
            eyeR.position.set(0.14, 1.75, 0.35);
            group.add(eyeL);
            group.add(eyeR);

            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), grimeMat);
            jaw.position.set(0, 1.56, 0.36);
            group.add(jaw);

            const hornMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.2, flatShading: true });
            const hornGeo = new THREE.ConeGeometry(0.09, 0.28, 6);
            const leftHorn = new THREE.Mesh(hornGeo, hornMat);
            const rightHorn = new THREE.Mesh(hornGeo, hornMat);
            leftHorn.position.set(-0.24, 2.05, 0);
            rightHorn.position.set(0.24, 2.05, 0);
            leftHorn.rotation.z = Math.PI / 2;
            rightHorn.rotation.z = -Math.PI / 2;
            group.add(leftHorn);
            group.add(rightHorn);

            const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
            const leftArm = new THREE.Mesh(armGeo, bodyMat);
            const rightArm = new THREE.Mesh(armGeo, bodyMat);
            leftArm.position.set(-0.52, 1.0, 0.12);
            rightArm.position.set(0.52, 1.0, 0.12);
            leftArm.rotation.x = cfg.armAngle;
            rightArm.rotation.x = cfg.armAngle;
            group.add(leftArm);
            group.add(rightArm);

            const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
            const leftLeg = new THREE.Mesh(legGeo, bodyMat);
            const rightLeg = new THREE.Mesh(legGeo, bodyMat);
            leftLeg.position.set(-0.2, 0.25, 0);
            rightLeg.position.set(0.2, 0.25, 0);
            group.add(leftLeg);
            group.add(rightLeg);

            const clawGeo = new THREE.ConeGeometry(0.08, cfg.clawLength, 6);
            const clawMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.5, metalness: 0.4, flatShading: true });
            const leftClaw = new THREE.Mesh(clawGeo, clawMat);
            const rightClaw = new THREE.Mesh(clawGeo, clawMat);
            leftClaw.position.set(-0.52, 0.7, 0.34);
            rightClaw.position.set(0.52, 0.7, 0.34);
            leftClaw.rotation.x = Math.PI / 2;
            rightClaw.rotation.x = Math.PI / 2;
            group.add(leftClaw);
            group.add(rightClaw);

            const spine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), glowMat);
            spine.position.set(0, 1.1, -0.3);
            group.add(spine);
        } else if (this.variant === 'stalker') {
            const torso = new THREE.Mesh(_getStalkerGeo('torso'), STALKER_MATERIALS.camo);
            torso.position.y = 0.92;
            group.add(torso);

            const vest = new THREE.Mesh(_getStalkerGeo('vest'), STALKER_MATERIALS.vest);
            vest.position.set(0, 0.92, 0.32);
            group.add(vest);

            const backpack = new THREE.Mesh(_getStalkerGeo('backpack'), STALKER_MATERIALS.backpack);
            backpack.position.set(0, 0.98, -0.35);
            group.add(backpack);

            const strap1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.82, 0.1), STALKER_MATERIALS.vest);
            strap1.position.set(-0.22, 0.92, 0.28);
            strap1.rotation.z = 0.18;
            group.add(strap1);
            const strap2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.82, 0.1), STALKER_MATERIALS.vest);
            strap2.position.set(0.22, 0.92, 0.28);
            strap2.rotation.z = -0.18;
            group.add(strap2);

            const pouchPositions = [[-0.32, 0.88, 0.42], [-0.08, 1.08, 0.42], [0.12, 0.72, 0.42], [0.32, 0.92, 0.42]];
            for (let i = 0; i < 4; i++) {
                const pouch = new THREE.Mesh(_getStalkerGeo('pouch'), STALKER_MATERIALS.vest);
                pouch.position.set(pouchPositions[i][0], pouchPositions[i][1], pouchPositions[i][2]);
                group.add(pouch);
            }

            const headGroup = new THREE.Group();
            headGroup.position.set(0, 1.68, 0);
            group.add(headGroup);

            const headMesh = new THREE.Mesh(_getStalkerGeo('head'), STALKER_MATERIALS.gasMask);
            headGroup.add(headMesh);

            const lensGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12);
            const leftLens = new THREE.Mesh(lensGeo, STALKER_MATERIALS.lens);
            leftLens.rotation.x = Math.PI / 2;
            leftLens.position.set(-0.16, 0.1, 0.36);
            const rightLens = new THREE.Mesh(lensGeo, STALKER_MATERIALS.lens);
            rightLens.rotation.x = Math.PI / 2;
            rightLens.position.set(0.16, 0.1, 0.36);
            headGroup.add(leftLens, rightLens);

            const filterMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 10), STALKER_MATERIALS.gasMask);
            filterMesh.rotation.x = Math.PI / 2;
            filterMesh.position.set(0.38, -0.1, 0.36);
            headGroup.add(filterMesh);

            const helmet = new THREE.Mesh(_getStalkerGeo('helmet'), STALKER_MATERIALS.helmet);
            helmet.position.set(0, 0.5, 0);
            headGroup.add(helmet);

            const leftArm = new THREE.Mesh(_getStalkerGeo('arm'), STALKER_MATERIALS.camo);
            const rightArm = new THREE.Mesh(_getStalkerGeo('arm'), STALKER_MATERIALS.camo);
            leftArm.position.set(-0.54, 0.98, 0.1);
            rightArm.position.set(0.54, 0.98, 0.1);
            leftArm.rotation.x = cfg.armAngle;
            rightArm.rotation.x = cfg.armAngle;
            group.add(leftArm);
            group.add(rightArm);

            const leftGlove = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.18), STALKER_MATERIALS.glove);
            const rightGlove = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.18), STALKER_MATERIALS.glove);
            leftGlove.position.set(-0.54, 0.62, 0.1);
            rightGlove.position.set(0.54, 0.62, 0.1);
            group.add(leftGlove, rightGlove);

            const leftLeg = new THREE.Mesh(_getStalkerGeo('leg'), STALKER_MATERIALS.camo);
            const rightLeg = new THREE.Mesh(_getStalkerGeo('leg'), STALKER_MATERIALS.camo);
            leftLeg.position.set(-0.2, 0.25, 0);
            rightLeg.position.set(0.2, 0.25, 0);
            group.add(leftLeg);
            group.add(rightLeg);

            const leftBoot = new THREE.Mesh(_getStalkerGeo('boot'), STALKER_MATERIALS.boot);
            const rightBoot = new THREE.Mesh(_getStalkerGeo('boot'), STALKER_MATERIALS.boot);
            leftBoot.position.set(-0.2, 0.06, 0.06);
            rightBoot.position.set(0.2, 0.06, 0.06);
            group.add(leftBoot, rightBoot);

            const leftKnee = new THREE.Mesh(_getStalkerGeo('knee'), STALKER_MATERIALS.vest);
            const rightKnee = new THREE.Mesh(_getStalkerGeo('knee'), STALKER_MATERIALS.vest);
            leftKnee.position.set(-0.18, 0.42, 0.08);
            rightKnee.position.set(0.18, 0.42, 0.08);
            group.add(leftKnee, rightKnee);
        }

        if (this.variant !== 'crawler' && this.variant !== 'stalker') {
            const chestWidth = this.variant === 'heavy' ? 0.82 : 0.58;
            const chestY = this.variant === 'heavy' ? 1.02 : 0.92;
            const chestZ = this.variant === 'heavy' ? 0.43 : 0.34;
            const chest = new THREE.Mesh(new THREE.BoxGeometry(chestWidth, 0.48, 0.08), detailMat);
            chest.position.set(0, chestY, chestZ);
            group.add(chest);
            const bootMat = new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.92, flatShading: true });
            for (const x of [-0.22, 0.22]) {
                const boot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.38), bootMat);
                boot.position.set(x, 0.08, 0.08);
                group.add(boot);
            }
        } else {
            const ribs = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.78), STALKER_DETAIL_MAT);
            ribs.position.set(0, 0.65, 0.18);
            group.add(ribs);
        }
        if (this.variant === 'toxic') {
            const respirator = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.22), detailMat);
            respirator.position.set(0.12, 1.72, 0.42);
            group.add(respirator);
            for (const x of [-0.22, 0.22]) {
                const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8), glowMat);
                filter.rotation.z = Math.PI / 2;
                filter.position.set(x + 0.12, 1.68, 0.43);
                group.add(filter);
            }
        }
        if (this.variant === 'normal' && this.variant !== 'stalker') {
            for (const x of [-0.23, 0, 0.23]) {
                const rib = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), detailMat);
                rib.position.set(x, 1.02, 0.38);
                group.add(rib);
            }
        }
        group.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = true;
            child.userData.zombieVariant = this.variant;
        });
        group.userData.isEntity = true;
        group.userData.isZombie = true;
        group.userData.variant = this.variant;
        if (this.variant !== 'stalker' && this.variant !== 'crawler') {
            group.userData.limbs = group.children.filter(c =>
                c.geometry?.type === 'BoxGeometry' &&
                (c.position.x < -0.3 || c.position.x > 0.3 || c.position.y < 0.5)
            );
            if (group.children.length >= 4) {
                const arms = group.children.filter(c => c.position.y > 0.5 && c.position.y < 1.3 && Math.abs(c.position.x) > 0.3);
                const legs = group.children.filter(c => c.position.y < 0.5 && Math.abs(c.position.x) < 0.3);
                group.userData.limbs = {
                    leftArm: arms[0] || null,
                    rightArm: arms[1] || null,
                    leftLeg: legs[0] || null,
                    rightLeg: legs[1] || null
                };
            }
        }
        if (this.variant === 'crawler') {
            group.userData.limbs = {
                leftArm: group.children[4],
                rightArm: group.children[5],
                leftLeg: group.children[6],
                rightLeg: group.children[7]
            };
        }
        if (this.variant === 'stalker') {
            group.userData.limbs = { leftArm: group.children[10], rightArm: group.children[11], leftLeg: group.children[14], rightLeg: group.children[15] };
        }
        group.userData.detailChildren = [...group.children];
        const lodProxy = new THREE.Mesh(getZombieLodGeometry(), bodyMat);
        lodProxy.visible = false;
        lodProxy.userData.isLodProxy = true;
        group.add(lodProxy);
        group.userData.lodProxy = lodProxy;
        return group;
    }

    _applyStalkerCorpse() {
        const mainGroup = new THREE.Group();
        mainGroup.position.set(this.position.x, this.position.y, this.position.z);
        mainGroup.rotation.y = Math.random() * Math.PI * 0.3 - 0.15;
        mainGroup.frustumCulled = false;
        this._corpseGroup = mainGroup;
        this._isCorpsified = true;
        mainGroup.userData.isStalkerCorpse = true;
        this.mesh.position.set(0, 0, 0);
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.updateMatrixWorld(true);

        // Semi-upright sitting pose: tilted back ~30° (reference match)
        const bodyGroup = new THREE.Group();
        bodyGroup.position.set(0, 0, 0);
        bodyGroup.rotation.x = -0.52;
        mainGroup.add(bodyGroup);

        // Torso
        const torso = new THREE.Mesh(_getStalkerGeo('torso'), STALKER_MATERIALS.camo);
        torso.position.set(0, 0.95, -0.3);
        bodyGroup.add(torso);

        // Vest
        const vest = new THREE.Mesh(_getStalkerGeo('vest'), STALKER_MATERIALS.vest);
        vest.position.set(0, 0.95, 0.06);
        bodyGroup.add(vest);

        // MOLLE pouches
        for (let i = 0; i < 4; i++) {
            const pouch = new THREE.Mesh(_getStalkerGeo('pouch'), STALKER_MATERIALS.vest);
            pouch.position.set(-0.32 + i * 0.17, 0.85, 0.17);
            bodyGroup.add(pouch);
        }

        // Head at top of torso, tilted back naturally
        const headGroup = new THREE.Group();
        headGroup.position.set(0, 1.75, -0.3);
        headGroup.rotation.x = 0.3;
        bodyGroup.add(headGroup);

        const headMesh = new THREE.Mesh(_getStalkerGeo('head'), STALKER_MATERIALS.gasMask);
        headGroup.add(headMesh);

        const lensGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12);
        const leftLens = new THREE.Mesh(lensGeo, STALKER_MATERIALS.lens);
        leftLens.rotation.x = Math.PI / 2; leftLens.position.set(-0.16, 0.08, 0.36);
        headGroup.add(leftLens);
        const rightLens = new THREE.Mesh(lensGeo, STALKER_MATERIALS.lens);
        rightLens.rotation.x = Math.PI / 2; rightLens.position.set(0.16, 0.08, 0.36);
        headGroup.add(rightLens);

        const filterMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 10), STALKER_MATERIALS.gasMask);
        filterMesh.rotation.x = Math.PI / 2; filterMesh.position.set(0.38, -0.08, 0.36);
        headGroup.add(filterMesh);

        const helmet = new THREE.Mesh(_getStalkerGeo('helmet'), STALKER_MATERIALS.helmet);
        helmet.position.set(0, 0.5, 0);
        headGroup.add(helmet);

        // Arms: right bent behind body supporting weight, left extended forward on ground
        const upperR = new THREE.Mesh(_getStalkerGeo('arm'), STALKER_MATERIALS.camo);
        upperR.position.set(0.54, 0.9, -0.4); upperR.rotation.x = -1.0;
        bodyGroup.add(upperR);
        const forearmR = new THREE.Mesh(_getStalkerGeo('arm'), STALKER_MATERIALS.camo);
        forearmR.position.set(0.58, 0.35, -0.6); forearmR.rotation.x = 0.6;
        bodyGroup.add(forearmR);
        const handR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.18), STALKER_MATERIALS.glove);
        handR.position.set(0.6, 0.02, -0.8);
        bodyGroup.add(handR);

        const upperL = new THREE.Mesh(_getStalkerGeo('arm'), STALKER_MATERIALS.camo);
        upperL.position.set(-0.54, 0.9, -0.4); upperL.rotation.x = 1.2;
        bodyGroup.add(upperL);
        const forearmL = new THREE.Mesh(_getStalkerGeo('arm'), STALKER_MATERIALS.camo);
        forearmL.position.set(-0.45, 0.35, -0.55); forearmL.rotation.x = 0.7;
        bodyGroup.add(forearmL);
        const handL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.18), STALKER_MATERIALS.glove);
        handL.position.set(-0.35, 0.02, -1.0);
        bodyGroup.add(handL);

        // Hips - direct child of bodyGroup for natural leg pivot
        const hips = new THREE.Mesh(_getStalkerGeo('torso'), STALKER_MATERIALS.camo);
        hips.position.set(0, 0.45, -0.3);
        bodyGroup.add(hips);

        // Legs: bent at knees, feet flat on ground
        // Left leg hierarchy: hip -> thigh -> knee -> shin -> ankle -> boot
        const thighL = new THREE.Group();
        thighL.position.set(-0.18, 0.45, -0.3);
        thighL.rotation.x = 0.8;
        const thighMeshL = new THREE.Mesh(_getStalkerGeo('leg'), STALKER_MATERIALS.camo);
        thighMeshL.position.set(0, 0, 0); thighL.add(thighMeshL);
        const kneePadL = new THREE.Mesh(_getStalkerGeo('knee'), STALKER_MATERIALS.vest);
        kneePadL.position.set(0, -0.16, 0.06); thighL.add(kneePadL);
        const shinL = new THREE.Group();
        shinL.position.set(0, 0.28, 0.28);
        shinL.rotation.x = -0.9;
        const shinMeshL = new THREE.Mesh(_getStalkerGeo('leg'), STALKER_MATERIALS.camo);
        shinL.add(shinMeshL);
        const bootL = new THREE.Mesh(_getStalkerGeo('boot'), STALKER_MATERIALS.boot);
        bootL.position.set(0, 0.2, 0.12); bootL.rotation.x = 0.4;
        shinL.add(bootL);
        thighL.add(shinL);
        bodyGroup.add(thighL);

        // Right leg
        const thighR = new THREE.Group();
        thighR.position.set(0.18, 0.45, -0.3);
        thighR.rotation.x = 0.8;
        const thighMeshR = new THREE.Mesh(_getStalkerGeo('leg'), STALKER_MATERIALS.camo);
        thighMeshR.position.set(0, 0, 0); thighR.add(thighMeshR);
        const kneePadR = new THREE.Mesh(_getStalkerGeo('knee'), STALKER_MATERIALS.vest);
        kneePadR.position.set(0, -0.16, 0.06); thighR.add(kneePadR);
        const shinR = new THREE.Group();
        shinR.position.set(0, 0.28, 0.28);
        shinR.rotation.x = -0.9;
        const shinMeshR = new THREE.Mesh(_getStalkerGeo('leg'), STALKER_MATERIALS.camo);
        shinR.add(shinMeshR);
        const bootR = new THREE.Mesh(_getStalkerGeo('boot'), STALKER_MATERIALS.boot);
        bootR.position.set(0, 0.2, 0.12); bootR.rotation.x = 0.4;
        shinR.add(bootR);
        thighR.add(shinR);
        bodyGroup.add(thighR);

        // AK-47 closer to camera in foreground
        const gunSteel = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.35, metalness: 0.75 });
        const gunWood = new THREE.MeshStandardMaterial({ color: 0x7a4a20, roughness: 0.65, flatShading: true });
        const magSteel = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.3, metalness: 0.8 });

        const akGroup = new THREE.Group();
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.7), gunSteel);
        akGroup.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.5, 8), gunSteel);
        barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, 0.55);
        akGroup.add(barrel);
        const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), gunSteel);
        muzzleBrake.position.set(0, 0, 0.82);
        akGroup.add(muzzleBrake);
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.32), gunWood);
        handguard.position.set(0, -0.02, 0.4);
        akGroup.add(handguard);
        const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.5), magSteel);
        magBody.rotation.x = -0.35; magBody.position.set(0, 0.08, 0.2);
        akGroup.add(magBody);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), gunWood);
        grip.rotation.x = -0.4; grip.position.set(0, 0.04, -0.32);
        akGroup.add(grip);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.55), gunWood);
        stock.rotation.x = 0.15; stock.position.set(0, 0.1, -0.55);
        akGroup.add(stock);
        const buttpad = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.08), gunSteel);
        buttpad.rotation.x = 0.15; buttpad.position.set(0, 0.08, -0.82);
        akGroup.add(buttpad);
        akGroup.position.set(0.65, 0.01, 0.6);
        akGroup.rotation.y = -0.2;
        akGroup.rotation.x = Math.PI / 2;
        mainGroup.add(akGroup);

        // Backpack on ground left - lying flat at an angle
        const bpGroup = new THREE.Group();
        const bpBody = new THREE.Mesh(_getStalkerGeo('backpack'), STALKER_MATERIALS.backpack);
        bpGroup.add(bpBody);
        const bpS1 = new THREE.Mesh(_getStalkerGeo('strap'), STALKER_MATERIALS.vest);
        bpS1.position.set(0, 0.25, 0); bpGroup.add(bpS1);
        const bpS2 = new THREE.Mesh(_getStalkerGeo('strap'), STALKER_MATERIALS.vest);
        bpS2.position.set(0.22, 0, 0); bpGroup.add(bpS2);
        bpGroup.position.set(-0.9, 0.08, 0.5);
        bpGroup.rotation.y = 1.0;
        bpGroup.rotation.x = -0.4;
        bpGroup.rotation.z = 0.2;
        mainGroup.add(bpGroup);

        // Ammo boxes right side
        const ammoGroup = new THREE.Group();
        for (let i = 0; i < 3; i++) {
            const box = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.18), magSteel);
            box.position.set(0.6 + i * 0.18, 0.01, 0.4 + i * 0.12);
            box.rotation.y = 0.3 + i * 0.4;
            box.rotation.x = -0.05;
            ammoGroup.add(box);
        }
        mainGroup.add(ammoGroup);

        // Blood pool under body
        const bloodGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.005, 16);
        const bloodMat = new THREE.MeshStandardMaterial({ color: 0x3a0808, roughness: 0.5, metalness: 0 });
        bloodMat.transparent = true;
        bloodMat.opacity = 0.75;
        const blood = new THREE.Mesh(bloodGeo, bloodMat);
        blood.position.set(0, 0.005, 0);
        mainGroup.add(blood);

        mainGroup.traverse(c => { if (c.isMesh) { c.frustumCulled = false; c.castShadow = true; c.receiveShadow = true; } });
        this.scene.add(mainGroup);
    }

    _cloneGroup(group) {
        const cloned = new THREE.Group();
        cloned.position.copy(group.position);
        cloned.rotation.copy(group.rotation);
        cloned.scale.copy(group.scale);
        cloned.quaternion.copy(group.quaternion);
        cloned.userData = {...group.userData};
        group.children.forEach(child => {
            const c = this._cloneTree(child);
            cloned.add(c);
        });
        return cloned;
    }

    _cloneTree(obj) {
        if (obj.isGroup) {
            const cloned = new THREE.Group();
            cloned.position.copy(obj.position);
            cloned.rotation.copy(obj.rotation);
            cloned.scale.copy(obj.scale);
            cloned.quaternion.copy(obj.quaternion);
            cloned.userData = {...obj.userData};
            obj.children.forEach(child => {
                cloned.add(this._cloneTree(child));
            });
            return cloned;
        }
        const mesh = obj.clone();
        if (mesh.isMesh) {
            mesh.material = obj.material;
        }
        return mesh;
    }

    update(delta, entityManager, audioSynth) {
        this.updateAcidProjectile(delta, audioSynth);
        if (!this.isAlive) {
            if (this._corpseGroup) {
                this._corpseGroup.position.copy(this.position);
            } else {
                this.mesh.position.copy(this.position);
            }
            this._corpseTimer -= delta;
            if (this._corpseTimer <= 0) {
                this.dispose();
            }
            return;
        }

        if (![this.position.x, this.position.y, this.position.z].every(Number.isFinite)) {
            this.position.set(0, this.physics.height + 0.2, 0);
        }
        if (![this.physics.velocity.x, this.physics.velocity.y, this.physics.velocity.z].every(Number.isFinite)) {
            this.physics.velocity.set(0, 0, 0);
        }

        this.attackCooldown = Math.max(0, this.attackCooldown - delta);
        this.abilityCooldown = Math.max(0, this.abilityCooldown - delta);
        this.abilityAnimationTimer = Math.max(0, this.abilityAnimationTimer - delta);
        this.soundTimer -= delta;
        this.alertTimer = Math.max(0, this.alertTimer - delta);
        this.updateBurning(delta);
        if (audioSynth) {
            this._deathAudioSynth = audioSynth;
        }
        this._animTime += delta;

        const sharedAlert = this.scene?.userData?.zombieAlert;
        const aggression = clamp(this.scene?.userData?.zombieAggression || 1, 1, 2.6);
        if (sharedAlert && (performance.now() * 0.001 - sharedAlert.time) < 3.8) {
            const alertDist = this.position.distanceTo(sharedAlert.position);
            if (alertDist < 34 * aggression) {
                this.alertTarget = sharedAlert.target || this.alertTarget;
                this.alertPosition = this._alertPositionVec.copy(sharedAlert.position);
                this.alertTimer = Math.max(this.alertTimer, 2.6);
            }
        }

        const cfg = VARIANT_CONFIG[this.variant];
        let target = this.findNearestTarget(entityManager, cfg.alertRadius * aggression);
        if (!target && this.alertTarget?.isAlive && this.alertTimer > 0 && this.isFinitePosition(this.alertTarget.position)) {
            target = this.alertTarget;
        }

        if (target) {
            const dist = this.position.distanceTo(target.position);
            this.broadcastAlert(target);
            this.alertTarget = target;
            this.alertPosition = this._alertPositionVec.copy(target.position);
            this.alertTimer = 2.8;

            let usedAbility = false;
            if (this.variant === 'toxic' && dist >= 5 && dist <= 18 && this.abilityCooldown <= 0) {
                this.spitAcid(target, audioSynth);
                usedAbility = true;
            } else if (this.variant === 'crawler' && dist >= 4 && dist <= 12 && this.physics.onGround && this.abilityCooldown <= 0) {
                this.leapAt(target, audioSynth);
                usedAbility = true;
            } else if (this.variant === 'runner' && dist >= 4 && dist <= 14 && this.abilityCooldown <= 0) {
                this.dashAt(target, audioSynth);
                usedAbility = true;
            } else if (this.variant === 'stalker' && dist >= 6 && dist <= 25 && this.abilityCooldown <= 0) {
                this.shootAt(target, audioSynth);
                usedAbility = true;
            }

            if (!usedAbility && dist < 2.6 && this.attackCooldown <= 0) {
                const targetType = target?.constructor?.name;
                const damage = targetType === 'Bot' ? this.damage * 0.42 : this.damage;
                const knockback = this.variant === 'heavy' ? 11 : 3.2;
                const source = this.variant === 'stalker' ? 'stalker' : (this.variant === 'heavy' ? 'heavySmash' : 'zombie');
                const didHit = target.takeDamage(damage, false, this, knockback, source);
                if (this.variant === 'normal') target.applySlow?.(0.68, 1.5);
                if (this.variant === 'stalker') target.applyRadiation?.(10, 3.5, this);
                this.attackCooldown = cfg.attackCooldown;
                this.abilityAnimationTimer = this.variant === 'heavy' ? 0.55 : 0.28;
                if (audioSynth) {
                    audioSynth.playZombieAttack?.(this.position, { variant: this.variant, emitterKey: this.id });
                    if (didHit && this.variant !== 'stalker') audioSynth.playGeigerCounter?.();
                    if (this.variant === 'heavy') {
                        audioSynth.playZombieAbility?.(this.position, { variant: 'heavy', emitterKey: this.id });
                    }
                }
            } else if (!usedAbility) {
                const rush = (dist < 8 ? 1.32 : dist < 18 ? 1.18 : 1.04) * Math.min(1.55, 0.88 + aggression * 0.17);
                if (this.variant === 'runner') {
                    const zigzag = Math.sin(this._animTime * 3) * 0.3;
                    this._dirVec.subVectors(target.position, this.position).normalize();
                    this._dirVec.x += zigzag;
                    this._dirVec.normalize();
                    this.physics.velocity.x = this._dirVec.x * this.physics.speed * rush;
                    this.physics.velocity.z = this._dirVec.z * this.physics.speed * rush;
                    this.rotation.y = Math.atan2(this._dirVec.x, this._dirVec.z);
                } else if (this.variant === 'crawler') {
                    this._dirVec.subVectors(target.position, this.position).normalize();
                    const flank = Math.sin(this._animTime * 4.2 + this.id) * 0.48;
                    const x = this._dirVec.x - this._dirVec.z * flank;
                    const z = this._dirVec.z + this._dirVec.x * flank;
                    const length = Math.hypot(x, z) || 1;
                    this.physics.velocity.x = x / length * this.physics.speed * rush;
                    this.physics.velocity.z = z / length * this.physics.speed * rush;
                    this.rotation.y = Math.atan2(x, z);
                } else if (this.variant === 'toxic') {
                    this._dirVec.subVectors(target.position, this.position).normalize();
                    const sway = Math.sin(this._animTime * 2.1 + this.id * 0.7) * 0.22;
                    this.physics.velocity.x = (this._dirVec.x - this._dirVec.z * sway) * this.physics.speed * rush;
                    this.physics.velocity.z = (this._dirVec.z + this._dirVec.x * sway) * this.physics.speed * rush;
                    this.rotation.y = Math.atan2(this.physics.velocity.x, this.physics.velocity.z);
                } else {
                    this.moveTowards(target.position, this.physics.speed * rush);
                }
            }

            if (audioSynth && this.soundTimer <= 0) {
                const moanInterval = cfg.moanInterval;
                audioSynth.playZombieMoan?.(this.position, { variant: this.variant, emitterKey: this.id });
                this.soundTimer = moanInterval[0] + Math.random() * (moanInterval[1] - moanInterval[0]);
            }
        } else {
            if (this.followElevatedRoute()) {
                this.soundTimer = Math.max(this.soundTimer, 0.4);
            } else if (this.alertPosition && this.alertTimer > 0) {
                this.moveTowards(this.alertPosition, this.physics.speed * 1.08);
                if (this.position.distanceTo(this.alertPosition) < 3.5) {
                    this.alertPosition = null;
                }
            } else {
                this._roamTimer -= delta;
                if (this._roamTimer <= 0) {
                    this._roamAngle = Math.random() * Math.PI * 2;
                    this._roamTimer = 3 + Math.random() * 5;
                }
                const roamSpeed = this.physics.speed * cfg.patrolSpeed;
                this.physics.velocity.x = Math.cos(this._roamAngle) * roamSpeed;
                this.physics.velocity.z = Math.sin(this._roamAngle) * roamSpeed;
                this.rotation.y = this._roamAngle;

                if (audioSynth && this.soundTimer <= 0) {
                    const moanInterval = cfg.moanInterval;
                    audioSynth.playZombieMoan?.(this.position, { variant: this.variant, emitterKey: this.id });
                    this.soundTimer = moanInterval[0] + Math.random() * (moanInterval[1] - moanInterval[0]);
                }
            }
        }

        this.mesh.position.copy(this.position);
        this.mesh.position.y = this.position.y - this.physics.height;
        this.mesh.rotation.y = this.rotation.y;
        if (this._lodDetailed !== false) this.animateLimbs(delta);
    }

    dashAt(target, audioSynth) {
        this._abilityDirection.subVectors(target.position, this.position).setY(0).normalize();
        this.physics.velocity.x = this._abilityDirection.x * this.physics.speed * 2.15;
        this.physics.velocity.z = this._abilityDirection.z * this.physics.speed * 2.15;
        this.rotation.y = Math.atan2(this._abilityDirection.x, this._abilityDirection.z);
        this.abilityCooldown = 3.2 + Math.random();
        this.abilityAnimationTimer = 0.42;
        audioSynth?.playZombieAbility?.(this.position, { variant: 'runner', emitterKey: this.id });
    }

    leapAt(target, audioSynth) {
        this._abilityDirection.subVectors(target.position, this.position).setY(0).normalize();
        this.physics.velocity.x = this._abilityDirection.x * this.physics.speed * 1.45;
        this.physics.velocity.z = this._abilityDirection.z * this.physics.speed * 1.45;
        this.physics.velocity.y = 7.4;
        this.physics.onGround = false;
        this.rotation.y = Math.atan2(this._abilityDirection.x, this._abilityDirection.z);
        this.abilityCooldown = 4.2 + Math.random() * 1.4;
        this.abilityAnimationTimer = 0.75;
        audioSynth?.playZombieAbility?.(this.position, { variant: 'crawler', emitterKey: this.id });
    }

    spitAcid(target, audioSynth) {
        this.clearAcidProjectile();
        const origin = this.position.clone();
        origin.y -= 0.25;
        const aim = target.position.clone();
        aim.y -= 0.45;
        const direction = aim.sub(origin).normalize();
        const mesh = new THREE.Mesh(ACID_GEOMETRY, ACID_MATERIAL);
        mesh.position.copy(origin);
        mesh.frustumCulled = false;
        mesh.renderOrder = 3;
        this.scene.add(mesh);
        const velocity = direction.multiplyScalar(14);
        velocity.y += 1.5;
        this.acidProjectile = {
            mesh,
            target,
            velocity,
            life: 1.8
        };
        this.physics.velocity.x *= 0.25;
        this.physics.velocity.z *= 0.25;
        this.abilityCooldown = 5.2 + Math.random() * 1.8;
        this.attackCooldown = 0.9;
        this.abilityAnimationTimer = 0.65;
        audioSynth?.playZombieAbility?.(this.position, { variant: 'toxic', emitterKey: this.id });
    }

    shootAt(target, audioSynth) {
        this.clearAcidProjectile();
        const origin = this.position.clone();
        origin.y += 0.6;
        const aim = target.position.clone();
        aim.y += 0.5;
        const direction = aim.sub(origin).normalize();
        const bulletMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xff8800, emissiveIntensity: 1.5 });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), bulletMat);
        mesh.position.copy(origin);
        mesh.frustumCulled = false;
        mesh.renderOrder = 3;
        this.scene.add(mesh);
        const velocity = direction.multiplyScalar(28);
        this.acidProjectile = {
            mesh,
            target,
            velocity,
            life: 2.2
        };
        this.abilityCooldown = 3.8 + Math.random() * 1.5;
        this.attackCooldown = 0.5;
        this.abilityAnimationTimer = 0.45;
        audioSynth?.playZombieAbility?.(this.position, { variant: 'stalker', emitterKey: this.id });
    }

    updateAcidProjectile(delta, audioSynth) {
        const projectile = this.acidProjectile;
        if (!projectile) return;
        projectile.life -= delta;
        projectile.velocity.y -= 4.2 * delta;
        this._projectileStart.copy(projectile.mesh.position);
        projectile.mesh.position.addScaledVector(projectile.velocity, delta);
        const pulse = 1 + Math.sin(this._animTime * 20) * 0.18;
        projectile.mesh.scale.setScalar(pulse);
        const target = projectile.target;
        let hitTarget = false;
        if (target?.isAlive) {
            this._abilityDirection.subVectors(projectile.mesh.position, this._projectileStart);
            this._projectileToTarget.subVectors(target.position, this._projectileStart);
            const lengthSq = this._abilityDirection.lengthSq();
            const t = lengthSq > 0
                ? clamp(this._projectileToTarget.dot(this._abilityDirection) / lengthSq, 0, 1)
                : 0;
            this._projectileToTarget.copy(this._projectileStart).addScaledVector(this._abilityDirection, t);
            hitTarget = this._projectileToTarget.distanceToSquared(target.position) < 1.5;
        }
        if (hitTarget) {
            target.takeDamage(this.damage * 0.78, false, this, 1.4, 'acid');
            target.applySlow?.(0.55, 2.2);
            if (this.variant === 'stalker') target.applyRadiation?.(10, 3.5, this);
            audioSynth?.playZombieAbility?.(projectile.mesh.position, { variant: 'acidImpact', emitterKey: this.id });
            this.clearAcidProjectile();
            return;
        }
        if (projectile.life <= 0) this.clearAcidProjectile();
    }

    clearAcidProjectile() {
        if (!this.acidProjectile) return;
        this.scene.remove(this.acidProjectile.mesh);
        this.acidProjectile = null;
    }

    updateRenderLod(delta) {
        this._lodTimer = (this._lodTimer ?? ((this.id % 10) * 0.03)) - delta;
        if (this._lodTimer > 0) return this._lodDetailed !== false;
        this._lodTimer = 0.3;
        const camera = this.scene?.userData?.camera;
        if (!camera) return true;
        camera.getWorldDirection(this._lodCameraForward);
        this._lodToEntity.set(
            this.position.x - camera.position.x,
            this.position.y + 0.9 - camera.position.y,
            this.position.z - camera.position.z
        );
        const distanceSq = this._lodToEntity.lengthSq();
        const distance = Math.sqrt(distanceSq);
        const verticalFov = THREE.MathUtils.degToRad(camera.fov || 60);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * (camera.aspect || 1));
        const visibleAngle = Math.max(verticalFov, horizontalFov) * 0.5 + 0.22;
        const inView = distance > 0.001 && this._lodToEntity.dot(this._lodCameraForward) / distance >= Math.cos(visibleAngle);
        const detailDistance = this.scene?.userData?.mobileMode ? 24 : 34;
        const lodDistance = this._lodDetailed ? detailDistance + 6 : detailDistance;
        const detailed = distanceSq <= 144 || (inView && distanceSq <= lodDistance * lodDistance);
        if (this._lodDetailed === detailed) return detailed;
        this._lodDetailed = detailed;
        for (const child of this.mesh.userData.detailChildren || []) child.visible = detailed;
        if (this.mesh.userData.lodProxy) {
            this.mesh.userData.lodProxy.visible = !detailed && (!this.mesh.userData.useBatchedLod || this.burnTimer > 0);
        }
        return detailed;
    }

    findNearestTarget(entityManager, maxDistance) {
        const nearby = entityManager?.getNearbyEntities
            ? entityManager.getNearbyEntities(this.position, maxDistance)
            : entityManager.getEntities();
        const maxDistSq = maxDistance * maxDistance;
        let nearest = null;
        let bestScore = Infinity;
        for (const entity of nearby) {
            if (!entity.isAlive || entity === this) continue;
            if (entity.constructor?.name === 'Zombie') continue;
            if (!this.isFinitePosition(entity.position)) continue;
            const distSq = this.position.distanceToSquared(entity.position);
            if (distSq > maxDistSq) continue;
            const dist = Math.sqrt(distSq);
            let score = dist;
            if (entity.constructor?.name === 'Player') score -= 7;
            if (entity.constructor?.name === 'Bot') score += 2.5;
            if (score < bestScore) {
                bestScore = score;
                nearest = entity;
            }
        }
        return nearest;
    }

    broadcastAlert(target) {
        if (!target || !this.scene?.userData || !this.isFinitePosition(target.position)) return;
        const alert = this.scene.userData.zombieAlert || {
            position: new THREE.Vector3(),
            target: null,
            time: 0
        };
        alert.position.copy(target.position);
        alert.target = target;
        alert.time = performance.now() * 0.001;
        this.scene.userData.zombieAlert = alert;
    }

    moveTowards(target, speed) {
        if (!this.isFinitePosition(target) || !Number.isFinite(speed)) {
            this.physics.velocity.x = 0;
            this.physics.velocity.z = 0;
            return;
        }
        const dx = target.x - this.position.x;
        const dz = target.z - this.position.z;
        const invLength = 1 / Math.max(0.0001, Math.hypot(dx, dz));
        const dirX = dx * invLength;
        const dirZ = dz * invLength;
        this.physics.velocity.x = dirX * speed;
        this.physics.velocity.z = dirZ * speed;
        this.rotation.y = Math.atan2(dirX, dirZ);
    }

    followElevatedRoute() {
        const now = performance.now();
        let routeState = this._elevatedRoute;
        if (!routeState) {
            if ((Number(this.id) || 0) % 13 !== 0 || now < (this._nextElevatedRouteAt || 0)) return false;
            const routes = this.mapRef?.getElevatedRoutes?.() || [];
            let route = null;
            let bestDistance = 52;
            for (const candidate of routes) {
                const start = candidate?.[0];
                if (!start) continue;
                const distance = Math.hypot(start.x - this.position.x, start.z - this.position.z);
                if (distance >= bestDistance) continue;
                bestDistance = distance;
                route = candidate;
            }
            this._nextElevatedRouteAt = now + 12000 + ((Number(this.id) || 0) % 9) * 600;
            if (!route) return false;
            routeState = this._elevatedRoute = { points: route, index: 0, startedAt: now };
        }
        if (now - routeState.startedAt > 26000) {
            this._elevatedRoute = null;
            return false;
        }
        const target = routeState.points[routeState.index];
        if (!target) {
            this._elevatedRoute = null;
            return false;
        }
        const horizontalDistance = Math.hypot(target.x - this.position.x, target.z - this.position.z);
        if (horizontalDistance < 1.8 && Math.abs(target.y - this.position.y) < 3.2) {
            routeState.index++;
            if (routeState.index >= routeState.points.length) {
                this._elevatedRoute = null;
                this._roamTimer = 2.5;
                return true;
            }
        }
        this.patrolTarget = routeState.points[routeState.index];
        this.moveTowards(this.patrolTarget, this.physics.speed * 0.92);
        return true;
    }

    isFinitePosition(position) {
        return !!position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
    }

    animateLimbs(delta) {
        const limbs = this.mesh?.userData?.limbs;
        if (!limbs || !limbs.leftArm) return;
        const speed = Math.sqrt(
            this.physics.velocity.x * this.physics.velocity.x +
            this.physics.velocity.z * this.physics.velocity.z
        );
        const speedNorm = Math.min(1, speed / this.physics.speed);
        const t = this._animTime;
        const cfg = VARIANT_CONFIG[this.variant];

        if (this.variant === 'crawler') {
            const swing = Math.sin(t * 12) * 0.5 * speedNorm;
            limbs.leftArm.rotation.z = -0.45 + swing;
            limbs.rightArm.rotation.z = 0.45 - swing;
            limbs.leftLeg.rotation.z = -0.35 - swing;
            limbs.rightLeg.rotation.z = 0.35 + swing;
            this.mesh.rotation.x = 0.04 + Math.sin(t * 8) * 0.025 * speedNorm;
            if (this.abilityAnimationTimer > 0) {
                const leap = Math.sin((1 - this.abilityAnimationTimer / 0.75) * Math.PI);
                limbs.leftArm.rotation.z -= leap * 0.85;
                limbs.rightArm.rotation.z += leap * 0.85;
                this.mesh.rotation.x = -leap * 0.2;
            }
        } else if (this.variant === 'toxic') {
            const swing = Math.sin(t * 5.5) * 0.5 * speedNorm;
            limbs.leftLeg.rotation.x = -swing;
            limbs.rightLeg.rotation.x = swing;
            limbs.leftArm.rotation.x = -0.55 + Math.sin(t * 4.2) * 0.28;
            limbs.rightArm.rotation.x = -0.75 + Math.sin(t * 4.2 + 1.1) * 0.28;
            this.mesh.rotation.z = Math.sin(t * 2.1) * 0.045;
            if (this.abilityAnimationTimer > 0) {
                const spit = Math.sin((1 - this.abilityAnimationTimer / 0.65) * Math.PI);
                limbs.leftArm.rotation.x = -1.25 * spit;
                limbs.rightArm.rotation.x = -1.25 * spit;
                this.mesh.rotation.x = -0.12 * spit;
            }
        } else if (this.variant === 'runner') {
            const swing = Math.sin(t * 10) * 0.7 * speedNorm;
            limbs.leftLeg.rotation.x = -swing;
            limbs.rightLeg.rotation.x = swing;
            limbs.leftArm.rotation.x = Math.sin(t * 8 + 0.8) * 0.5 * speedNorm;
            limbs.rightArm.rotation.x = Math.sin(t * 8) * 0.5 * speedNorm;
            limbs.leftArm.rotation.z = -0.2;
            limbs.rightArm.rotation.z = 0.2;
            if (this.abilityAnimationTimer > 0) {
                limbs.leftArm.rotation.x = -1.05;
                limbs.rightArm.rotation.x = -1.05;
                this.mesh.rotation.x = -0.18;
            }
        } else if (this.variant === 'heavy') {
            const swing = Math.sin(t * 5) * 0.4 * speedNorm;
            limbs.leftLeg.rotation.x = -swing;
            limbs.rightLeg.rotation.x = swing;
            limbs.leftArm.rotation.x = Math.sin(t * 4 + 0.3) * 0.3 * speedNorm;
            limbs.rightArm.rotation.x = Math.sin(t * 4) * 0.3 * speedNorm;
            limbs.leftArm.rotation.z = -0.1;
            limbs.rightArm.rotation.z = 0.1;
            if (this.abilityAnimationTimer > 0) {
                const smash = Math.sin((1 - this.abilityAnimationTimer / 0.55) * Math.PI);
                limbs.leftArm.rotation.x = -2.1 * smash;
                limbs.rightArm.rotation.x = -2.1 * smash;
                this.mesh.rotation.x = 0.12 * smash;
            }
        } else {
            const swing = Math.sin(t * 7) * 0.55 * speedNorm;
            limbs.leftLeg.rotation.x = -swing;
            limbs.rightLeg.rotation.x = swing;
            limbs.leftArm.rotation.x = Math.sin(t * 6 + 0.5) * 0.4 * speedNorm;
            limbs.rightArm.rotation.x = Math.sin(t * 6) * 0.4 * speedNorm;
            limbs.leftArm.rotation.z = -0.15;
            limbs.rightArm.rotation.z = 0.15;
        }

        if (speedNorm < 0.05) {
            limbs.leftLeg.rotation.x *= 0.85;
            limbs.rightLeg.rotation.x *= 0.85;
            limbs.leftArm.rotation.x *= 0.85;
            limbs.rightArm.rotation.x *= 0.85;
        }

        if (this.hitStaggerTimer > 0) {
            this.hitStaggerTimer -= delta;
            const stagger = Math.sin(this.hitStaggerTimer * 25) * 0.15 * this.hitStaggerTimer;
            limbs.leftArm.rotation.x += stagger;
            limbs.rightArm.rotation.x -= stagger;
        }
    }

    applyHitReaction() {
        this.hitStaggerTimer = 0.25;
    }

    takeDamage(damage, isHeadshot = false, attacker = null, knockbackStrength = 0, source = null) {
        const finalDamage = isHeadshot ? damage * 2 : damage;
        if (attacker?.stats) {
            attacker.stats.damage += finalDamage;
        }
        this.health -= finalDamage;
        if (source === 'flame' && this.isAlive) {
            this.applyBurn(2.8, 5.5, attacker);
        }
        if (this.isAlive && knockbackStrength > 0) {
            this.applyHitReaction();
        }
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
            this.physics.velocity.set(0, 0, 0);
            this.mesh.position.copy(this.position);
            this.mesh.position.y = this.position.y - (this.physics.height - 0.2) - 0.8;
            if (this.variant === 'stalker') {
                this._canPool = false;
                this.mesh.visible = false;
                this._applyStalkerCorpse();
            } else {
                this.mesh.rotation.set(-Math.PI / 2, this.rotation.y, 0);
            }
            this._corpseTimer = this.scene?.userData?.mobileMode ? 1.2 : 2.2;
            this._corpseExpiresAt = performance.now() + this._corpseTimer * 1000;
            if (attacker?.stats) {
                attacker.stats.kills += 1;
            }
            this.clearBurning();
            if (this._deathAudioSynth) {
                this._deathAudioSynth.playDeath(this.position);
                this._deathAudioSynth = null;
            }
        }

        if (attacker && this.isAlive) {
            const strengthBase = knockbackStrength > 0 ? knockbackStrength : 2.5;
            const strength = strengthBase * (this.knockbackMultiplier ?? 1);
            const dir = new THREE.Vector3().subVectors(this.position, attacker.position).normalize();
            this.physics.velocity.x += dir.x * strength;
            this.physics.velocity.z += dir.z * strength;
            this.physics.velocity.y += 1.5 * (this.knockbackMultiplier ?? 1);
            this.alertTarget = attacker;
            this.alertPosition = this._alertPositionVec.copy(attacker.position);
            this.alertTimer = Math.max(this.alertTimer, 3.2);
            this.broadcastAlert(attacker);
        }
        return !this.isAlive;
    }

    applyBurn(duration = 2.6, damagePerSecond = 5, attacker = null) {
        this.burnTimer = Math.max(this.burnTimer, duration);
        this.burnTickTimer = Math.max(this.burnTickTimer, 0.08);
        this.burnDamagePerSecond = Math.max(this.burnDamagePerSecond, damagePerSecond);
        if (attacker) this.burnAttacker = attacker;
    }

    clearBurning() {
        this.burnTimer = 0;
        this.burnTickTimer = 0;
        this.burnDamagePerSecond = 0;
        this.burnAttacker = null;
        this.setBurnVisual(0);
    }

    updateBurning(delta) {
        if (this.burnTimer <= 0 || !this.isAlive) return;
        this.burnTimer = Math.max(0, this.burnTimer - delta);
        this.burnTickTimer -= delta;
        const pulse = 0.26 + Math.sin(performance.now() * 0.03 + this.id) * 0.12;
        this.setBurnVisual(Math.max(0.12, pulse));

        while (this.burnTickTimer <= 0 && this.isAlive) {
            const tickDamage = this.burnDamagePerSecond * 0.25;
            this.takeDamage(tickDamage, false, this.burnAttacker, 0, 'burn');
            this.burnTickTimer += 0.25;
        }

        if (this.burnTimer <= 0) {
            this.clearBurning();
        }
    }

    setBurnVisual(intensity) {
        this.mesh.traverse(child => {
            if (!child.material || !child.material.emissive) return;
            if (intensity > 0) {
                child.material.emissive.setHex(0xff6d00);
                child.material.emissiveIntensity = intensity;
            } else {
                child.material.emissive.setHex(child.material.userData.baseEmissive ?? 0x000000);
                child.material.emissiveIntensity = child.material.userData.baseEmissiveIntensity ?? 0;
            }
        });
    }

    dispose() {
        this.clearAcidProjectile();
        if (this._isCorpsified && this._corpseGroup) {
            if (this._corpseGroup.parent) {
                this._corpseGroup.parent.remove(this._corpseGroup);
            }
            const _disposeObj = o => {
                if (o.isMesh) {
                    o.geometry?.dispose();
                    const mat = o.material;
                    if (mat) {
                        if (Array.isArray(mat)) {
                            for (let i = 0; i < mat.length; i++) mat[i]?.dispose?.();
                        } else {
                            mat.dispose?.();
                        }
                    }
                }
                for (const ch of o.children) _disposeObj(ch);
            };
            _disposeObj(this._corpseGroup);
            this._corpseGroup = null;
            this._isCorpsified = false;
        } else {
            // Restore running mesh rotation & limbs for non-stalker variants
            this.mesh.rotation.set(0, 0, 0);
            if (this.mesh.userData.limbs) {
                const limbs = this.mesh.userData.limbs;
                if (limbs.leftArm) limbs.leftArm.rotation.set(0, 0, 0);
                if (limbs.rightArm) limbs.rightArm.rotation.set(0, 0, 0);
                if (limbs.leftLeg) limbs.leftLeg.rotation.set(0, 0, 0);
                if (limbs.rightLeg) limbs.rightLeg.rotation.set(0, 0, 0);
            }
            const headGroup = this.mesh.children.find(c => c.isGroup && c.position.y > 1.5);
            if (headGroup) headGroup.rotation.set(0, 0, 0);
        }
        this.mesh.visible = false;
        this._corpseTimer = 0;
    }
}
