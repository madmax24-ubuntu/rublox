import * as THREE from 'three';

/**
 * High-quality procedural texture generators for weapons
 * Creates PBR-compatible textures with normal maps, roughness, and detail
 */

// ─── Helper: Noise Functions ─────────────────────────────────
function hash(x, y) {
    const n = x * 57 + y * 137;
    return (n * (n * n * 153 + 10) + n) & 0x7fffffff;
}

function noise2D(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy) / 0x7fffffff;
    const b = hash(ix + 1, iy) / 0x7fffffff;
    const c = hash(ix, iy + 1) / 0x7fffffff;
    const d = hash(ix + 1, iy + 1) / 0x7fffffff;
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x, y, octaves = 4) {
    let value = 0, amplitude = 0.5, frequency = 1;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * noise2D(x * frequency, y * frequency);
        frequency *= 2;
        amplitude *= 0.5;
    }
    return value;
}

// ─── Helper: Canvas Texture ─────────────────────────────────
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
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    return texture;
}

// ─── High-Quality Metal Texture ──────────────────────────────
// Returns {albedo, normal, roughness} maps
export function createPBRMetalTexture(baseColor = '#8a9aae') {
    const size = 256;
    
    // Parse base color
    const r = parseInt(baseColor.slice(1, 2), 16) * 16 + parseInt(baseColor.slice(2, 3), 16);
    const g = parseInt(baseColor.slice(3, 4), 16) * 16 + parseInt(baseColor.slice(4, 5), 16);
    const b = parseInt(baseColor.slice(5, 6), 16) * 16 + parseInt(baseColor.slice(6, 7), 16);
    
    // Albedo map
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = size;
    albedoCanvas.height = size;
    const albedoCtx = albedoCanvas.getContext('2d');
    
    // Base metal color with subtle variation
    albedoCtx.fillStyle = baseColor;
    albedoCtx.fillRect(0, 0, size, size);
    
    // Add fine grain noise
    const albedoData = albedoCtx.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const n = fbm(x * 0.05, y * 0.05, 4) * 15 - 7;
            albedoData.data[idx] = Math.max(0, Math.min(255, r + n));
            albedoData.data[idx + 1] = Math.max(0, Math.min(255, g + n));
            albedoData.data[idx + 2] = Math.max(0, Math.min(255, b + n));
        }
    }
    albedoCtx.putImageData(albedoData, 0, 0);
    
    // Brushed directional lines
    albedoCtx.globalAlpha = 0.15;
    for (let y = 0; y < size; y += 2) {
        const brightness = 0.8 + Math.random() * 0.4;
        albedoCtx.strokeStyle = `rgba(${Math.floor(r * brightness)},${Math.floor(g * brightness)},${Math.floor(b * brightness)},0.08)`;
        albedoCtx.lineWidth = 0.5 + Math.random();
        albedoCtx.beginPath();
        albedoCtx.moveTo(0, y + (Math.random() - 0.5) * 2);
        albedoCtx.lineTo(size, y + (Math.random() - 0.5) * 3);
        albedoCtx.stroke();
    }
    albedoCtx.globalAlpha = 1;
    
    // Scratches
    albedoCtx.globalAlpha = 0.2;
    for (let i = 0; i < 40; i++) {
        const y = Math.random() * size;
        albedoCtx.strokeStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.2})`;
        albedoCtx.lineWidth = 0.5 + Math.random() * 1.5;
        albedoCtx.beginPath();
        albedoCtx.moveTo(0, y);
        let cx = 0;
        while (cx < size) {
            cx += 20 + Math.random() * 80;
            albedoCtx.lineTo(cx, y + (Math.random() - 0.5) * 10);
        }
        albedoCtx.stroke();
    }
    albedoCtx.globalAlpha = 1;
    
    // Normal map (simulated from height)
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = size;
    normalCanvas.height = size;
    const normalCtx = normalCanvas.getContext('2d');
    const normalData = normalCtx.createImageData(size, size);
    
    // Generate height map first
    const heightData = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const nx = x / size * 20, ny = y / size * 20;
            heightData[y * size + x] = fbm(nx, ny, 5) * 0.3 + noise2D(x * 0.1, y * 0.1) * 0.1;
        }
    }
    
    // Calculate normals from height
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const h = heightData[y * size + x];
            const hX = heightData[y * size + Math.min(x + 1, size - 1)] - heightData[y * size + Math.max(x - 1, 0)];
            const hY = heightData[Math.min(y + 1, size - 1) * size + x] - heightData[Math.max(y - 1, 0) * size + x];
            
            normalData.data[idx] = Math.floor(128 + hX * 200);     // R
            normalData.data[idx + 1] = Math.floor(128 + hY * 200);   // G
            normalData.data[idx + 2] = 255;                           // B
            normalData.data[idx + 3] = 255;                           // A
        }
    }
    normalCtx.putImageData(normalData, 0, 0);
    
    // Roughness map
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const roughCtx = roughCanvas.getContext('2d');
    roughCtx.fillStyle = '#404040';
    roughCtx.fillRect(0, 0, size, size);
    
    const roughData = roughCtx.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const n = fbm(x * 0.02, y * 0.02, 3) * 40 - 20;
            const val = Math.max(0, Math.min(255, 64 + n));
            roughData.data[idx] = val;
            roughData.data[idx + 1] = val;
            roughData.data[idx + 2] = val;
        }
    }
    roughCtx.putImageData(roughData, 0, 0);
    
    return {
        albedo: createCanvasTexture(size, size, (ctx) => { ctx.drawImage(albedoCanvas, 0, 0); }),
        normal: createCanvasTexture(size, size, (ctx) => { ctx.drawImage(normalCanvas, 0, 0); }),
        roughness: createCanvasTexture(size, size, (ctx) => { ctx.drawImage(roughCanvas, 0, 0); }),
        baseRoughness: 0.25,
        baseMetalness: 0.9
    };
}

// ─── Dark Polymer/Rubber Texture ─────────────────────────────
export function createPolymerTexture2(baseColor = '#1a1c22') {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    
    // Fine noise texture
    const data = ctx.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const n = fbm(x * 0.1, y * 0.1, 3) * 20 - 10;
            data.data[idx] = Math.max(0, Math.min(255, data.data[idx] + n));
            data.data[idx + 1] = Math.max(0, Math.min(255, data.data[idx + 1] + n));
            data.data[idx + 2] = Math.max(0, Math.min(255, data.data[idx + 2] + n));
        }
    }
    ctx.putImageData(data, 0, 0);
    
    // Diamond grip pattern
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (let y = 0; y < size; y += 16) {
        for (let x = (y / 16) % 2 * 16; x < size; x += 32) {
            ctx.beginPath();
            ctx.moveTo(x, y - 8);
            ctx.lineTo(x + 8, y);
            ctx.lineTo(x, y + 8);
            ctx.lineTo(x - 8, y);
            ctx.closePath();
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
    
    // Normal map for grip pattern
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = size;
    normalCanvas.height = size;
    const normalCtx = normalCanvas.getContext('2d');
    normalCtx.fillStyle = '#8080ff';
    normalCtx.fillRect(0, 0, size, size);
    
    // Add normal perturbation for diamond pattern
    const normalData = normalCtx.createImageData(size, size);
    for (let y = 0; y < size; y += 16) {
        for (let x = 0; x < size; x += 32) {
            const cx = x + 8, cy = y;
            for (let dy = -8; dy < 8; dy++) {
                for (let dx = -8; dx < 8; dx++) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 8) {
                            const idx = (ny * size + nx) * 4;
                            normalData.data[idx] = 128 + dx * 5;
                            normalData.data[idx + 1] = 128 + dy * 5;
                            normalData.data[idx + 2] = 200;
                        }
                    }
                }
            }
        }
    }
    normalCtx.putImageData(normalData, 0, 0);
    
    return {
        albedo: createCanvasTexture(size, size, (ctx) => { ctx.drawImage(canvas, 0, 0); }),
        normal: createCanvasTexture(size, size, (ctx) => { ctx.drawImage(normalCanvas, 0, 0); }),
        roughness: null,
        baseRoughness: 0.75,
        baseMetalness: 0.05
    };
}

// ─── Wood Texture ────────────────────────────────────────────
export function createWoodTexture2(baseColor = '#5a3a20') {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    
    // Wood grain with figure pattern
    const data = ctx.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const grain = Math.sin(y * 0.05 + fbm(x * 0.01, y * 0.01, 3) * 10) * 0.5 + 0.5;
            const variation = fbm(x * 0.02, y * 0.02, 4) * 30 - 15;
            
            const r = Math.max(0, Math.min(255, parseInt(baseColor.slice(1, 2), 16) * 16 + parseInt(baseColor.slice(2, 3), 16) + grain * 20 + variation));
            const g = Math.max(0, Math.min(255, parseInt(baseColor.slice(3, 4), 16) * 16 + parseInt(baseColor.slice(4, 5), 16) + grain * 10 + variation * 0.5));
            const b = Math.max(0, Math.min(255, parseInt(baseColor.slice(5, 6), 16) * 16 + parseInt(baseColor.slice(6, 7), 16) + grain * 5));
            
            data.data[idx] = r;
            data.data[idx + 1] = g;
            data.data[idx + 2] = b;
        }
    }
    ctx.putImageData(data, 0, 0);
    
    // Dark grain lines
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (let row = 0; row < 60; row++) {
        const baseY = (row / 60) * size;
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for (let x = 0; x <= size; x += 10) {
            const w = Math.sin(x * 0.01 + row * 0.5) * 10 + Math.sin(x * 0.03 + row) * 5;
            ctx.lineTo(x, baseY + w);
        }
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    
    return {
        albedo: createCanvasTexture(size, size, (ctx) => { ctx.drawImage(canvas, 0, 0); }),
        normal: null,
        roughness: null,
        baseRoughness: 0.65,
        baseMetalness: 0.05
    };
}

// ─── Matte Black Finish ──────────────────────────────────────
export function createMatteBlackTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, size, size);
    
    // Very fine noise
    const data = ctx.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const n = fbm(x * 0.08, y * 0.08, 3) * 15 - 7;
            const val = Math.max(0, Math.min(255, 10 + n));
            data.data[idx] = val;
            data.data[idx + 1] = val;
            data.data[idx + 2] = val;
        }
    }
    ctx.putImageData(data, 0, 0);
    
    return {
        albedo: createCanvasTexture(size, size, (ctx) => { ctx.drawImage(canvas, 0, 0); }),
        normal: null,
        roughness: null,
        baseRoughness: 0.85,
        baseMetalness: 0.1
    };
}

// ─── Bright Steel (shiny) ────────────────────────────────────
export function createBrightSteelTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#d0d4dc';
    ctx.fillRect(0, 0, size, size);
    
    // Very fine brushed lines
    for (let y = 0; y < size; y += 1) {
        const brightness = 0.9 + Math.random() * 0.2;
        ctx.strokeStyle = `rgba(${Math.floor(208 * brightness)},${Math.floor(212 * brightness)},${Math.floor(220 * brightness)},0.1)`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y + (Math.random() - 0.5));
        ctx.lineTo(size, y + (Math.random() - 0.5));
        ctx.stroke();
    }
    
    // Polish highlights
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 100; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 20 + Math.random() * 30);
        grad.addColorStop(0, 'rgba(255,255,255,0.3)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(x - 50, y - 50, 100, 100);
    }
    ctx.globalAlpha = 1;
    
    return {
        albedo: createCanvasTexture(size, size, (ctx) => { ctx.drawImage(canvas, 0, 0); }),
        normal: null,
        roughness: null,
        baseRoughness: 0.15,
        baseMetalness: 0.95
    };
}

// ─── Helper: Create Material from Texture Set ────────────────
export function createWeaponMaterial(texSet) {
    const matProps = {
        color: 0xffffff,
        roughness: texSet.baseRoughness ?? 0.5,
        metalness: texSet.baseMetalness ?? 0.5,
        map: texSet.albedo
    };
    
    if (texSet.normal) {
        matProps.normalMap = texSet.normal;
        matProps.normalScale = new THREE.Vector2(0.5, 0.5);
    }
    if (texSet.roughness) {
        matProps.roughnessMap = texSet.roughness;
    }
    
    return new THREE.MeshStandardMaterial(matProps);
}
