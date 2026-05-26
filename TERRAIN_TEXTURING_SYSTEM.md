# Procedural Terrain Texturing System for Three.js

Complete reference for generating high-quality terrain textures WITHOUT external assets.

---

## 1. Core Noise Functions (fBm)

### Simplex Noise Implementation

```javascript
// Fast simplex noise - produces smooth organic patterns
class SimplexNoise {
  constructor(seed = Math.random()) {
    this.grad3 = [
      [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
      [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
      [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
    ];
    this.p = [];
    for (let i = 0; i < 256; i++) this.p[i] = i;
    // Shuffle with seed
    let s = seed | 0;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807 + 0) % 2147483647;
      const j = s % (i + 1);
      [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
    }
    this.perm = new Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = this.p[i & 255];
  }

  dot3(x, y, z) { return x*this.gx + y*this.gy + z*this.gz; }

  noise2D(xin, yin) {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = 0.5 * (Math.sqrt(3) - 2) / 3;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const u = (xin + s) - i;
    const v = (yin + s) - j;

    let i1, j1;
    if (u > v) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }

    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.perm[ii + this.perm[jj]] % 12;
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;

    const x0 = xin - ii;
    const y0 = yin - jj;
    const x1 = xin - ii + i1 - G2;
    const y1 = yin - jj + j1 - G2;
    const x2 = xin - ii + 1 - 2 * G2;
    const y2 = yin - jj + 1 - 2 * G2;

    const ii0 = this.perm[ii + this.perm[jj]] % 12;
    const ii1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;

    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0*x0 - y0*y0;
    if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * this.dot3(x0, y0, this.grad3[ii0][0], this.grad3[ii0][1], this.grad3[ii0][2]); }
    let t1 = 0.5 - x1*x1 - y1*y1;
    if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * this.dot3(x1, y1, this.grad3[ii1][0], this.grad3[ii1][1], this.grad3[ii1][2]); }
    let t2 = 0.5 - x2*x2 - y2*y2;
    if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * this.dot3(x2, y2, this.grad3[ii1][0], this.grad3[ii1][1], this.grad3[ii1][2]); }

    return 70 * (n0 + n1 + n2);
  }

  // Fractal Brownian Motion - layered noise for natural detail
  fbm(x, y, octaves = 6, lacunarity = 2, gain = 0.5) {
    let sum = 0, amplitude = 1, frequency = 1, maxVal = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxVal += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return sum / maxVal; // normalize to [-1, 1]
  }
}
```

### Perlin Noise (alternative)

```javascript
class PerlinNoise {
  constructor(seed = Math.random()) {
    this.p = new Array(512);
    const perm = new Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    let s = seed | 0;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }

  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(a, b, t) { return a + t * (b - a); }

  grad(hash, x, y) {
    const h = hash & 3;
    return ((h < 2 ? x : -x) + (h === 0 || h === 2 ? y : -y));
  }

  noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const A = this.p[X] + Y, B = this.p[X + 1] + Y;
    return this.lerp(
      this.lerp(this.grad(this.p[A], x, y), this.grad(this.p[B], x - 1, y), u),
      this.lerp(this.grad(this.p[A + 1], x, y - 1), this.grad(this.p[B + 1], x - 1, y - 1), u),
      v
    );
  }

  fbm(x, y, octaves = 6) {
    let val = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      val += this.noise2D(x * freq, y * freq) * amp;
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return val / max;
  }
}
```

---

## 2. Procedural Texture Generation with Canvas

### Base Terrain Texture Generator

```javascript
class TerrainTextureGenerator {
  constructor(size = 512) {
    this.size = size;
    this.simplex = new SimplexNoise(42);
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
  }

  // Generate height map using fBm noise
  generateHeightMap(biomeType = 'grass') {
    const imageData = this.ctx.getImageData(0, 0, this.size, this.size);
    const data = imageData.data;

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const nx = x / this.size * 8; // world scale
        const ny = y / this.size * 8;

        let height;
        switch (biomeType) {
          case 'grass': height = this.grassHeight(nx, ny); break;
          case 'sand': height = this.sandHeight(nx, ny); break;
          case 'stone': height = this.stoneHeight(nx, ny); break;
          case 'ice': height = this.iceHeight(nx, ny); break;
          case 'dirt': height = this.dirtHeight(nx, ny); break;
          case 'metal': height = this.metalHeight(nx, ny); break;
          default: height = this.grassHeight(nx, ny);
        }

        const idx = (y * this.size + x) * 4;
        const val = Math.floor((height + 1) * 127.5);
        data[idx] = val;     // R
        data[idx + 1] = val; // G
        data[idx + 2] = val; // B
        data[idx + 3] = 255; // A
      }
    }
    this.ctx.putImageData(imageData, 0, 0);
    return this.canvas;
  }

  // ===== BIOME-SPECIFIC HEIGHT PATTERNS =====

  grassHeight(x, y) {
    const base = this.simplex.fbm(x * 0.5, y * 0.5, 6);
    const detail = this.simplex.fbm(x * 2, y * 2, 4) * 0.3;
    const tufts = this.simplex.fbm(x * 4 + 10, y * 4 + 10, 3) * 0.15;
    return base + detail + tufts;
  }

  sandHeight(x, y) {
    const dunes = Math.sin(y * 3 + this.simplex.fbm(x * 0.3, y * 0.1, 3) * 2) * 0.4;
    const grains = this.simplex.fbm(x * 8, y * 8, 4) * 0.1;
    const base = this.simplex.fbm(x * 0.8, y * 0.8, 5) * 0.3;
    return dunes + grains + base;
  }

  stoneHeight(x, y) {
    const cracks = Math.abs(this.simplex.fbm(x * 2, y * 2, 4));
    const base = this.simplex.fbm(x * 0.7, y * 0.7, 6) * 0.6;
    const crystal = Math.pow(Math.abs(this.simplex.noise2D(x * 3, y * 3)), 3) * 0.5;
    return base - cracks * 0.3 + crystal;
  }

  iceHeight(x, y) {
    const snow = this.simplex.fbm(x * 0.6, y * 0.6, 5);
    const facets = this.simplex.noise2D(x * 1.5 + 50, y * 1.5 + 50);
    const frost = Math.pow(Math.abs(this.simplex.fbm(x * 4, y * 4, 3)), 2) * 0.2;
    return snow + facets * 0.3 + frost;
  }

  dirtHeight(x, y) {
    const ruts = this.simplex.fbm(x * 0.4, y * 0.4, 4) * 0.4;
    const clumps = Math.abs(this.simplex.fbm(x * 3, y * 3, 3)) * 0.25;
    const base = this.simplex.fbm(x * 1.2, y * 1.2, 5) * 0.3;
    return ruts + clumps + base;
  }

  metalHeight(x, y) {
    const panel = Math.floor((this.simplex.fbm(x * 0.3, y * 0.3, 2) + 1) * 4) / 4;
    const rivets = Math.max(
      Math.abs(Math.sin(x * 12)),
      Math.abs(Math.cos(y * 12))
    ) * 0.1;
    const base = this.simplex.fbm(x * 2, y * 2, 3) * 0.05;
    return panel * 0.1 + rivets + base;
  }

  // Generate normal map from height map
  generateNormalMap(heightCanvas) {
    const heightData = this.getContextData(heightCanvas);
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = this.size;
    normalCanvas.height = this.size;
    const ctx = normalCanvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, this.size, this.size);
    const ndata = imageData.data;
    const strength = 2.0; // Normal map intensity

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const l = this.getPixel(heightData, x - 1, y);
        const r = this.getPixel(heightData, x + 1, y);
        const u = this.getPixel(heightData, x, y - 1);
        const d = this.getPixel(heightData, x, y + 1);

        const dx = (l - r) * strength;
        const dy = (u - d) * strength;

        // Normalize
        const len = Math.sqrt(dx * dx + dy * dy + 1);
        const nx = dx / len;
        const ny = dy / len;

        const idx = (y * this.size + x) * 4;
        // Map [-1, 1] to [0, 255]
        ndata[idx] = Math.floor((nx + 1) * 127.5);
        ndata[idx + 1] = Math.floor((ny + 1) * 127.5);
        ndata[idx + 2] = 255; // B component fixed
        ndata[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return normalCanvas;
  }

  getPixel(data, x, y) {
    if (x < 0) x = 0; if (x >= this.size) x = this.size - 1;
    if (y < 0) y = 0; if (y >= this.size) y = this.size - 1;
    return data[(y * this.size + x) * 4];
  }

  getContextData(canvas) {
    const ctx = canvas.getContext('2d');
    return ctx.getImageData(0, 0, this.size, this.size).data;
  }

  // Generate color texture for biome
  generateColorTexture(biomeType) {
    const imageData = this.ctx.getImageData(0, 0, this.size, this.size);
    const data = imageData.data;
    const h = this.generateHeightMap(biomeType);
    const hData = this.getContextData(h);

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const height = hData[(y * this.size + x) * 4] / 255;
        const idx = (y * this.size + x) * 4;

        // Add micro-variation for organic look
        const variation = this.simplex.fbm(x * 0.5, y * 0.5, 3) * 0.1;

        switch (biomeType) {
          case 'grass':
            data[idx] = 120 + height * 40 + variation * 30;  // R
            data[idx + 1] = 160 + height * 60 + variation * 40; // G
            data[idx + 2] = 50 + height * 20;                  // B
            break;
          case 'sand':
            data[idx] = 210 + height * 30 + variation * 20;
            data[idx + 1] = 180 + height * 20 + variation * 15;
            data[idx + 2] = 120 + height * 15;
            break;
          case 'stone':
            data[idx] = 140 + height * 50 + variation * 25;
            data[idx + 1] = 135 + height * 45 + variation * 25;
            data[idx + 2] = 125 + height * 40 + variation * 20;
            break;
          case 'ice':
            data[idx] = 200 + height * 30 + variation * 15;
            data[idx + 1] = 220 + height * 20 + variation * 10;
            data[idx + 2] = 240 + height * 10 + variation * 5;
            break;
          case 'dirt':
            data[idx] = 130 + height * 50 + variation * 30;
            data[idx + 1] = 90 + height * 30 + variation * 20;
            data[idx + 2] = 50 + height * 20 + variation * 10;
            break;
          case 'metal':
            data[idx] = 160 + height * 40 + variation * 20;
            data[idx + 1] = 165 + height * 35 + variation * 20;
            data[idx + 2] = 175 + height * 30 + variation * 15;
            break;
        }
        data[idx + 3] = 255;
      }
    }
    this.ctx.putImageData(imageData, 0, 0);
    return this.canvas;
  }

  // Convert canvas to Three.js texture with proper tiling
  toTexture(canvas, repeatU = 20, repeatV = 20) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatU, repeatV);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4; // Better quality at oblique angles
    return texture;
  }
}
```

---

## 3. Terrain Color Atlas (Single Canvas with Biome Regions)

For a ~440x440 arena, generate ONE atlas texture that covers all biome zones:

```javascript
class TerrainAtlasGenerator {
  constructor(arenaSize = 440, textureSize = 2048) {
    this.arenaSize = arenaSize;
    this.textureSize = textureSize;
    this.simplex = new SimplexNoise(123);
    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = textureSize;
    this.atlasCanvas.height = textureSize;
    this.ctx = this.atlasCanvas.getContext('2d');
    this.biomeColors = {
      forest:  { r: 80,  g: 130, b: 50 },
      sand:    { r: 220, g: 190, b: 120 },
      stone:   { r: 140, g: 135, b: 130 },
      ice:     { r: 210, g: 230, b: 255 },
      snow:    { r: 235, g: 235, b: 245 },
      lava:    { r: 200, g: 50,  b: 30 },
      volcanic:{ r: 80,  g: 40,  b: 35 },
      tundra:  { r: 170, g: 190, b: 200 },
      plains:  { r: 160, g: 170, b: 80  },
      swamp:   { r: 60,  g: 80,  b: 50  },
      rock:    { r: 155, g: 150, b: 140 },
    };
  }

  generateBiomeColor(biome, height, microVariation) {
    const base = this.biomeColors[biome] || this.biomeColors.plains;
    const hFactor = height * 0.5 + 0.5; // Normalize to [0, 1]
    return {
      r: Math.min(255, base.r * (0.7 + hFactor * 0.3) + microVariation * 40),
      g: Math.min(255, base.g * (0.7 + hFactor * 0.3) + microVariation * 30),
      b: Math.min(255, base.b * (0.7 + hFactor * 0.3) + microVariation * 20),
    };
  }

  generate() {
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.textureSize, this.textureSize);

    const resolution = 2; // Sample every 2 pixels for performance
    const imageData = ctx.getImageData(0, 0, this.textureSize, this.textureSize);
    const data = imageData.data;

    for (let ty = 0; ty < this.textureSize; ty += resolution) {
      for (let tx = 0; tx < this.textureSize; tx += resolution) {
        // Map texture coords to world coords (-arenaSize to arenaSize)
        const wx = (tx / this.textureSize - 0.5) * this.arenaSize * 2;
        const wz = (ty / this.textureSize - 0.5) * this.arenaSize * 2;

        // Get biome from climate (use same logic as MapGenerator)
        const temp = this.clamp01(
          this.simplex.fbm(wx / 30, wz / 30, 4) * 0.7 +
          this.simplex.fbm(wx / 15 + 19, wz / 15 - 11, 3) * 0.3
        );
        const moist = this.clamp01(
          this.simplex.fbm(wx / 25 + 51, wz / 25 + 7, 4) * 0.7 +
          this.simplex.fbm(wx / 8 - 33, wz / 8 + 41, 3) * 0.3
        );

        let biome;
        if (temp < 0.16) biome = moist < 0.45 ? 'ice' : 'snow';
        else if (temp < 0.28) biome = moist < 0.35 ? 'tundra' : 'forest';
        else if (temp < 0.42) {
          biome = moist < 0.2 ? 'rock' : moist < 0.55 ? 'forest' : 'swamp';
        } else if (temp < 0.58) {
          biome = moist < 0.22 ? 'plains' : moist < 0.52 ? 'forest' : 'swamp';
        } else if (temp < 0.7) {
          biome = moist < 0.25 ? 'sand' : moist < 0.55 ? 'forest' : 'jungle';
        } else if (temp < 0.82) {
          biome = moist < 0.22 ? 'sand' : moist < 0.5 ? 'stone' : 'stone';
        } else if (temp < 0.92) {
          biome = moist < 0.4 ? 'volcanic' : 'stone';
        } else {
          biome = moist < 0.6 ? 'lava' : 'volcanic';
        }

        // Generate height for this cell
        const height = this.simplex.fbm(wx * 0.1, wz * 0.1, 6);
        const micro = this.simplex.fbm(wx * 0.5, wz * 0.5, 3);

        const color = this.generateBiomeColor(biome, height, micro);

        // Fill the resolution block
        for (let dy = 0; dy < resolution && ty + dy < this.textureSize; dy++) {
          for (let dx = 0; dx < resolution && tx + dx < this.textureSize; dx++) {
            const px = tx + dx;
            const py = ty + dy;
            const idx = (py * this.textureSize + px) * 4;
            data[idx] = color.r;
            data[idx + 1] = color.g;
            data[idx + 2] = color.b;
            data[idx + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return this.atlasCanvas;
  }

  clamp01(v) { return Math.max(0, Math.min(1, v)); }

  toTexture(repeatU = 1, repeatV = 1) {
    const texture = new THREE.CanvasTexture(this.atlasCanvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatU, repeatV);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  toHeightMap() {
    const heightCanvas = document.createElement('canvas');
    heightCanvas.width = this.textureSize;
    heightCanvas.height = this.textureSize;
    const ctx = heightCanvas.getContext('2d');
    const srcData = this.ctx.getImageData(0, 0, this.textureSize, this.textureSize).data;
    const dstImg = ctx.createImageData(this.textureSize, this.textureSize);
    for (let i = 0; i < srcData.length; i += 4) {
      const gray = srcData[i] * 0.299 + srcData[i + 1] * 0.587 + srcData[i + 2] * 0.114;
      dstImg.data[i] = gray;
      dstImg.data[i + 1] = gray;
      dstImg.data[i + 2] = gray;
      dstImg.data[i + 3] = 255;
    }
    ctx.putImageData(dstImg, 0, 0);
    return heightCanvas;
  }

  toNormalMap() {
    const heightCanvas = this.toHeightMap();
    const normalGen = new TerrainTextureGenerator(this.textureSize);
    normalGen.simplex = this.simplex;
    return normalGen.generateNormalMap(heightCanvas);
  }
}
```

---

## 4. Road/Path Textures Between Biomes

```javascript
class RoadTextureGenerator {
  constructor(size = 512) {
    this.size = size;
    this.simplex = new SimplexNoise(99);
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
  }

  // Generate a road connecting two points on the texture
  generateRoad(fromX, fromY, toX, toY, width = 0.15) {
    const imageData = this.ctx.getImageData(0, 0, this.size, this.size);
    const data = imageData.data;

    // Road base
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const nx = x / this.size;
        const ny = y / this.size;

        // Distance from line segment
        const dx = toX - fromX;
        const dy = toY - fromY;
        const len = Math.sqrt(dx * dx + dy * dy);
        const t = Math.max(0, Math.min(1,
          ((nx - fromX) * dx + (ny - fromY) * dy) / (len * len)
        ));
        const closestX = fromX + t * dx;
        const closestY = fromY + t * dy;
        const dist = Math.sqrt((nx - closestX) ** 2 + (ny - closestY) ** 2);

        if (dist < width) {
          const idx = (y * this.size + x) * 4;
          const edgeDist = dist / width;
          const shoulder = Math.max(0, 1 - edgeDist * 3); // Faded edges

          // Road surface with gravel variation
          const gravel = this.simplex.fbm(nx * 20, ny * 20, 3) * 0.1;
          const base = 0.35 + gravel;

          // Edge darkening (gravel shoulders)
          const edgeFactor = 1 - shoulder;
          const r = Math.floor((base - 0.05 + gravel) * 255);
          const g = Math.floor((base - 0.08 + gravel) * 255);
          const b = Math.floor((base - 0.02 + gravel) * 255);

          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
    }
    this.ctx.putImageData(imageData, 0, 0);
    return this.canvas;
  }

  // Generate multiple paths between biome zones
  generatePaths(biomeZones = []) {
    if (biomeZones.length < 2) return this.canvas;

    const size = this.size;
    this.ctx.fillStyle = '#555';
    this.ctx.fillRect(0, 0, size, size);

    // Connect zones with roads
    for (let i = 0; i < biomeZones.length; i++) {
      for (let j = i + 1; j < biomeZones.length; j++) {
        const z1 = biomeZones[i];
        const z2 = biomeZones[j];
        const roadGen = new RoadTextureGenerator(size);

        // Only connect nearby zones
        const dist = Math.sqrt(
          (z1.x - z2.x) ** 2 + (z1.y - z2.y) ** 2
        );
        if (dist < 0.6) {
          this.ctx.drawImage(
            roadGen.generateRoad(
              z1.x / 440, z1.y / 440,
              z2.x / 440, z2.y / 440,
              0.08
            ).getContext('2d').canvas,
            0, 0
          );
        }
      }
    }
    return this.canvas;
  }
}
```

---

## 5. Multi-Layer Blending in ShaderMaterial

### Fragment Shader for Biome Blending

```glsl
// Vertex shader - pass UV and world position
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
    vUv = uv;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

```glsl
// Fragment shader - multi-layer biome blending with noise-based transitions
varying vec2 vUv;
varying vec3 vWorldPos;

uniform sampler2D diffuseMap;      // Base atlas
uniform sampler2D normalMap;       // Normal map from height
uniform sampler2D roughnessMap;    // Roughness variation

// Biome color uniforms
uniform vec3 colorForest;
uniform vec3 colorSand;
uniform vec3 colorStone;
uniform vec3 colorIce;
uniform vec3 colorSnow;
uniform vec3 colorLava;
uniform vec3 colorVolcanic;
uniform vec3 colorTundra;
uniform vec3 colorPlains;
uniform vec3 colorSwamp;

// Noise for blending
uniform float blendScale;

// Simple noise functions for GLSL
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 ip = floor(p);
    vec2 u = fract(p) - 0.5;
    float n = mix(
        mix(hash(ip), hash(ip + vec2(1, 0)), u.x),
        mix(hash(ip + vec2(0, 1)), hash(ip + vec2(1, 1)), u.x),
        u.y
    );
    return n;
}

// Smooth gradient blending between biomes
float fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

vec3 getBiomeColor(vec2 worldPos) {
    // Climate noise determines dominant biome
    float temp = noise(worldPos * 0.03) * 0.7 +
                 noise(worldPos * 0.06 + 19.0) * 0.3;
    float moist = noise(worldPos * 0.04 + 51.0) * 0.7 +
                  noise(worldPos * 0.12 - 33.0) * 0.3;

    // Smooth blend between biome colors
    vec3 color;
    float blend = 0.0;

    if (temp < 0.16) {
        color = mix(colorIce, colorSnow, step(0.45, moist));
    } else if (temp < 0.28) {
        color = mix(colorTundra, colorForest, step(0.35, moist));
    } else if (temp < 0.42) {
        color = mix(colorStone, colorForest, step(0.2, moist) * step(0.55, 1.0 - moist) + 0.3);
        color = mix(color, colorSwamp, step(0.55, moist));
    } else if (temp < 0.58) {
        color = mix(colorPlains, colorForest, step(0.22, moist) * step(0.52, 1.0 - moist) + 0.2);
    } else if (temp < 0.7) {
        color = mix(colorSand, colorForest, step(0.25, moist) * step(0.55, 1.0 - moist) + 0.2);
    } else if (temp < 0.82) {
        color = mix(colorStone, colorStone, step(0.22, moist) * step(0.5, 1.0 - moist) + 0.1);
    } else {
        color = mix(colorLava, colorVolcanic, step(0.4, moist));
    }

    return color;
}

void main() {
    // World-space coordinates for noise
    vec2 worldPos = vWorldPos.xz;

    // Get biome color
    vec3 biomeColor = getBiomeColor(worldPos);

    // Apply atlas texture if provided
    vec4 atlasColor = texture(diffuseMap, vUv);
    biomeColor = mix(biomeColor, atlasColor.rgb, atlasColor.a);

    // Micro-detail noise for surface texture
    float detail = noise(worldPos * blendScale) * 0.1;
    biomeColor += detail;

    // Normal map for surface bump
    vec3 normal = texture(normalMap, vUv).rgb * 2.0 - 1.0;

    // Lighting (simple diffuse)
    vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
    float diff = max(dot(normal, lightDir), 0.0) * 0.6 + 0.4;
    vec3 finalColor = biomeColor * diff;

    gl_FragColor = vec4(finalColor, 1.0);
}
```

### Three.js Setup for Shader Terrain

```javascript
// Create shader material for biome-blended terrain
const terrainMaterial = new THREE.ShaderMaterial({
    uniforms: {
        colorForest: { value: new THREE.Color(0x508232) },
        colorSand:   { value: new THREE.Color(0xdcb878) },
        colorStone:  { value: new THREE.Color(0x8c8782) },
        colorIce:    { value: new THREE.Color(0xd2e6ff) },
        colorSnow:   { value: new THREE.Color(0xebeaf5) },
        colorLava:   { value: new THREE.Color(0xc8321e) },
        colorVolcanic: { value: new THREE.Color(0x502823) },
        colorTundra: { value: new THREE.Color(0xaaaa c8) },
        colorPlains: { value: new THREE.Color(0xa0aa50) },
        colorSwamp:  { value: new THREE.Color(0x3c5032) },
        blendScale:  { value: 8.0 },
        diffuseMap:  { value: atlasTexture },
        normalMap:   { value: normalTexture },
    },
    vertexShader: vertexShaderCode,
    fragmentShader: fragmentShaderCode,
});

const terrainGeometry = new THREE.PlaneGeometry(440, 440, 128, 128);
terrainGeometry.rotateX(-Math.PI / 2);
const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
scene.add(terrainMesh);
```

---

## 6. Complete Integration Example

### Full Terrain System for 440x440 Arena

```javascript
class ArenaTerrainSystem {
  constructor(scene, arenaSize = 440) {
    this.scene = scene;
    this.arenaSize = arenaSize;
    this.textureSize = 2048;
    this.simplex = new SimplexNoise(42);
    this.mapGenerator = new MapGenerator();
    this.mapGenerator.initRng(Math.floor(Math.random() * 999999));

    this.textures = {};
    this.setupTerrain();
  }

  setupTerrain() {
    // 1. Generate biome atlas
    const atlasGen = new TerrainAtlasGenerator(this.arenaSize, this.textureSize);
    const atlasCanvas = atlasGen.generate();

    // 2. Generate height map from atlas
    const heightCanvas = atlasGen.toHeightMap();
    this.heightMap = atlasGen.simplex; // re-use simplex

    // 3. Generate normal map from height
    const normalGen = new TerrainTextureGenerator(this.textureSize);
    normalGen.simplex = atlasGen.simplex;
    const normalCanvas = normalGen.generateNormalMap(heightCanvas);

    // 4. Generate individual biome textures (for detail overlay)
    const biomeTexGen = new TerrainTextureGenerator(512);
    this.biomeTextures = {};
    for (const biome of ['grass', 'sand', 'stone', 'ice', 'dirt']) {
      this.biomeTextures[biome] = {
        color: biomeTexGen.toTexture(biomeTexGen.generateColorTexture(biome)),
        normal: biomeTexGen.toTexture(biomeTexGen.generateNormalMap(
            biomeTexGen.generateHeightMap(biome))),
      };
    }

    // 5. Convert to Three.js textures
    this.textures.diffuse = new THREE.CanvasTexture(atlasCanvas);
    this.textures.diffuse.wrapS = this.textures.diffuse.wrapT = THREE.RepeatWrapping;
    this.textures.diffuse.repeat.set(1, 1);
    this.textures.diffuse.colorSpace = THREE.SRGBColorSpace;

    this.textures.normal = new THREE.CanvasTexture(normalCanvas);
    this.textures.normal.wrapS = this.textures.normal.wrapT = THREE.RepeatWrapping;
    this.textures.normal.repeat.set(1, 1);
    this.textures.normal.colorSpace = THREE.NoColorSpace;

    // 6. Create terrain mesh with PBR material
    const geo = new THREE.PlaneGeometry(
        this.arenaSize, this.arenaSize, 128, 128
    );
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.MeshStandardMaterial({
        map: this.textures.diffuse,
        normalMap: this.textures.normal,
        normalScale: new THREE.Vector2(1.5, 1.5),
        roughness: 0.85,
        metalness: 0.0,
    });

    this.terrain = new THREE.Mesh(geo, this.material);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    console.log('Arena terrain created:', this.arenaSize, 'x', this.arenaSize);
  }

  // Apply biome-specific overlay texture at world position
  applyBiomeOverlay(worldX, worldZ, biome) {
    if (!this.biomeTextures[biome]) return;

    const tex = this.biomeTextures[biome];
    const scale = this.arenaSize / this.textureSize;

    // Create sprite for detail overlay
    const spriteMat = new THREE.MeshBasicMaterial({
        map: tex.color,
        transparent: true,
        opacity: 0.4,
        alphaMap: tex.normal,
        blending: THREE.MultiplyBlending,
        depthWrite: false,
    });
    const spriteGeo = new THREE.PlaneGeometry(16, 16);
    const sprite = new THREE.Mesh(spriteGeo, spriteMat);
    sprite.rotation.x = -Math.PI / 2;
    sprite.position.set(worldX, 0.02, worldZ);
    this.scene.add(sprite);
  }
}
```

---

## Key Performance Tips

1. **Texture size**: Use 2048x2048 for the main atlas. Individual biome textures at 512x512.
2. **Sampling**: Sample every 2-4 pixels during atlas generation (20x faster), then let GPU bilinear interpolation fill gaps.
3. **Anisotropic filtering**: Set `texture.anisotropy = 4` for oblique viewing angles.
4. **Repeat count**: For 440x440 arena with 2048px texture, repeat = 1 (no tiling needed).
5. **Mipmaps**: Three.js auto-generates mipmaps for CanvasTexture, ensuring clean texture at distance.
6. **Normal map strength**: Use `normalScale: new THREE.Vector2(1.5, 1.5)` on MeshStandardMaterial for visible surface detail without geometry changes.
7. **Biome detection**: Reuse the same temp/moist noise logic from MapGenerator.js to keep textures aligned with the map.

---

## MapGenerator Integration (add to existing MapGenerator.js)

Add these methods to MapGenerator to support texture generation:

```javascript
// In MapGenerator class, add:
getBiomeColorHex(biome) {
    const colors = {
        forest: 0x508232, sand: 0xdcb878, stone: 0x8c8782,
        ice: 0xd2e6ff, snow: 0xebeaf5, lava: 0xc8321e,
        volcanic: 0x502823, tundra: 0xabc8, plains: 0xa0aa50,
        swamp: 0x3c5032, taiga: 0x4a7a3e, redwood: 0x3d6a2e,
        badlands: 0xb87a4a, mesa: 0xc49a6a, jungle: 0x4a8a2e,
        savanna: 0xc4b050, mushroom: 0x8a506a
    };
    return colors[biome] || 0x888888;
}

getHeightAt(worldX, worldZ) {
    // Convert world coords to grid coords
    const gridX = Math.floor((worldX + this.arenaSize / 2) / (this.arenaSize / this.gridWidth));
    const gridY = Math.floor((worldZ + this.arenaSize / 2) / (this.arenaSize / this.gridHeight));
    // Sample the height from the texture
    // (implementation depends on texture format)
    return 0;
}
```
