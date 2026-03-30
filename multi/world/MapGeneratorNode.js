// Procedural map generator for a Roblox-like grid-based game.
// Node.js / ES6 module, no external dependencies.

export class MapGenerator {
    constructor() {
        this.seed = 1;
        this.rng = null;
        this.biomeNames = [
            'forest',
            'jungle',
            'plains',
            'savanna',
            'swamp',
            'taiga',
            'rock',
            'mesa',
            'sand',
            'snow',
            'ice',
            'lava',
            'tundra',
            'redwood',
            'badlands',
            'volcanic',
            'mushroom'
        ];
        const step = 1 / this.biomeNames.length;
        this.biomes = this.biomeNames.map((name, idx) => ({
            name,
            max: Math.min(1, (idx + 1) * step)
        }));
    }

    // Linear Congruential Generator (LCG) for repeatable randomness.
    initRng(seed) {
        this.seed = (seed >>> 0) || 1;
        let state = this.seed;
        this.rng = () => {
            // LCG parameters (Numerical Recipes)
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        };
        this.shuffleBiomes();
        this.tempScale = 28 + this.rand() * 24;
        this.moistScale = 28 + this.rand() * 24;
        this.detailScale = 9 + this.rand() * 7;
        this.microScale = 5 + this.rand() * 4;
        this.microBiomeChance = 0.18 + this.rand() * 0.12;
    }

    rand() {
        return this.rng ? this.rng() : Math.random();
    }

    // Deterministic hash for biome noise.
    biomeNoise(x, y) {
        let h = (x * 374761393 + y * 668265263 + this.seed * 1442695041) >>> 0;
        h ^= h >>> 13;
        h = Math.imul(h, 1274126177) >>> 0;
        h ^= h >>> 16;
        return h / 0x100000000;
    }

    clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }

    getClimate(x, y) {
        const t1 = this.biomeNoise(x / this.tempScale, y / this.tempScale);
        const t2 = this.biomeNoise(x / this.detailScale + 19.2, y / this.detailScale - 11.3);
        const m1 = this.biomeNoise(x / this.moistScale + 51.4, y / this.moistScale + 7.7);
        const m2 = this.biomeNoise(x / this.microScale - 33.1, y / this.microScale + 41.8);
        const temp = this.clamp01(t1 * 0.72 + t2 * 0.28);
        const moist = this.clamp01(m1 * 0.7 + m2 * 0.3);
        return { temp, moist };
    }

    pickBiomeFromClimate(temp, moist) {
        if (moist > 0.88 && temp > 0.35 && temp < 0.75) return 'mushroom';
        if (temp < 0.16) return moist < 0.45 ? 'ice' : 'snow';
        if (temp < 0.28) return moist < 0.35 ? 'tundra' : 'taiga';
        if (temp < 0.42) {
            if (moist < 0.2) return 'rock';
            if (moist < 0.55) return 'forest';
            return 'swamp';
        }
        if (temp < 0.58) {
            if (moist < 0.22) return 'plains';
            if (moist < 0.52) return 'forest';
            return 'jungle';
        }
        if (temp < 0.7) {
            if (moist < 0.25) return 'savanna';
            if (moist < 0.55) return 'redwood';
            return 'jungle';
        }
        if (temp < 0.82) {
            if (moist < 0.22) return 'sand';
            if (moist < 0.5) return 'mesa';
            return 'badlands';
        }
        if (temp < 0.92) {
            if (moist < 0.4) return 'volcanic';
            return 'mesa';
        }
        return moist < 0.6 ? 'lava' : 'volcanic';
    }

    pickBiome(x, y) {
        const climate = this.getClimate(x, y);
        let biome = this.pickBiomeFromClimate(climate.temp, climate.moist);
        if (this.biomeGrid && this.biomeCellSize && this.rand() < this.microBiomeChance) {
            const cx = Math.floor(x / this.biomeCellSize);
            const cy = Math.floor(y / this.biomeCellSize);
            const row = this.biomeGrid[cy];
            if (row && row[cx]) biome = row[cx];
        }
        return biome;
    }

    shuffleBiomes() {
        // Shuffle biome thresholds per seed to keep variety while staying deterministic.
        const names = [...this.biomeNames];
        for (let i = names.length - 1; i > 0; i--) {
            const j = Math.floor(this.rand() * (i + 1));
            [names[i], names[j]] = [names[j], names[i]];
        }
        const step = 1 / names.length;
        this.biomes = names.map((name, idx) => ({
            name,
            max: Math.min(1, (idx + 1) * step)
        }));
    }

    // Generate a map with caves/glades using cellular automata.
    generate(width, height, seed = 1) {
        this.initRng(seed);
        const w = Math.max(16, Math.floor(width));
        const h = Math.max(16, Math.floor(height));
        const biomeCellSize = 12 + Math.floor(this.rand() * 14);
        this.biomeGrid = this.buildBiomeGrid(w, h, biomeCellSize);
        this.biomeCellSize = biomeCellSize;

        // 0 = floor, 1 = wall
        let grid = Array.from({ length: h }, () => Array(w).fill(1));

        // Initial noise carve (keep borders as walls).
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const biome = this.pickBiome(x, y);
                const base = biome === 'forest' ? 0.46
                    : biome === 'jungle' ? 0.45
                    : biome === 'plains' ? 0.4
                    : biome === 'savanna' ? 0.38
                    : biome === 'swamp' ? 0.47
                    : biome === 'taiga' ? 0.44
                    : biome === 'rock' ? 0.52
                    : biome === 'mesa' ? 0.45
                    : biome === 'snow' ? 0.45
                    : biome === 'ice' ? 0.44
                    : biome === 'sand' ? 0.34
                    : biome === 'lava' ? 0.56
                    : biome === 'tundra' ? 0.42
                    : biome === 'redwood' ? 0.46
                    : biome === 'badlands' ? 0.48
                    : biome === 'volcanic' ? 0.55
                    : biome === 'mushroom' ? 0.43
                        : 0.42;
                const noise = this.biomeNoise(x * 2, y * 2) - 0.5;
                const threshold = Math.min(0.68, Math.max(0.28, base + noise * 0.25));
                grid[y][x] = this.rand() < threshold ? 1 : 0;
            }
        }

        // Cellular automata smoothing.
        const iterations = 4 + Math.floor(this.rand() * 3);
        for (let i = 0; i < iterations; i++) {
            grid = this.smoothGrid(grid, w, h);
        }

        // Carve a few glades for variety.
        const gladeCount = 4 + Math.floor(this.rand() * 4);
        for (let g = 0; g < gladeCount; g++) {
            const cx = 8 + Math.floor(this.rand() * (w - 16));
            const cy = 8 + Math.floor(this.rand() * (h - 16));
            const radius = 4 + Math.floor(this.rand() * 6);
            this.clearRadius(grid, w, h, cx, cy, radius);
        }

        // Ensure a safe spawn area in the center.
        const spawn = { x: Math.floor(w / 2), y: Math.floor(h / 2) };
        const spawnRadius = 6;
        this.clearRadius(grid, w, h, spawn.x, spawn.y, spawnRadius);
        this.carveMainCorridors(grid, w, h, spawn);

        // Convert to tile objects and place props.
        const tiles = [];
        const enemySpawns = [];
        const floorTiles = [];
        for (let y = 0; y < h; y++) {
            const row = [];
            for (let x = 0; x < w; x++) {
                const isWall = grid[y][x] === 1;
                const biome = !isWall ? this.pickBiome(x, y) : null;
                const tile = {
                    x,
                    y,
                    type: isWall ? 'wall' : 'floor',
                    rot: 0,
                    biome
                };

                if (!isWall) {
                    floorTiles.push(tile);
                    const dx = x - spawn.x;
                    const dy = y - spawn.y;
                    const inSpawn = Math.sqrt(dx * dx + dy * dy) <= spawnRadius;
                    if (!inSpawn) {
                        const roll = this.rand();
                        const baseBiome = this.getBaseBiome(biome);
                        if (baseBiome === 'forest') {
                            if (roll < 0.22) tile.prop = 'tree';
                            else if (roll < 0.32) tile.prop = 'bush';
                            else if (roll < 0.38) tile.prop = 'stump';
                            else if (roll < 0.42) tile.prop = 'log';
                        } else if (baseBiome === 'jungle') {
                            if (roll < 0.24) tile.prop = 'jungleTree';
                            else if (roll < 0.34) tile.prop = 'bush';
                            else if (roll < 0.39) tile.prop = 'ruin';
                        } else if (baseBiome === 'rock') {
                            if (roll < 0.22) tile.prop = 'rock';
                            else if (roll < 0.3) tile.prop = 'pillar';
                            else if (roll < 0.36) tile.prop = 'boulder';
                            else if (roll < 0.4) tile.prop = 'ruin';
                        } else if (baseBiome === 'snow') {
                            if (roll < 0.18) tile.prop = 'ice';
                            else if (roll < 0.25) tile.prop = 'rock';
                            else if (roll < 0.3) tile.prop = 'boulder';
                        } else if (baseBiome === 'sand') {
                            if (roll < 0.16) tile.prop = 'cactus';
                            else if (roll < 0.24) tile.prop = 'rock';
                            else if (roll < 0.28) tile.prop = 'boulder';
                        } else if (baseBiome === 'plains') {
                            if (roll < 0.14) tile.prop = 'tree';
                            else if (roll < 0.22) tile.prop = 'bush';
                            else if (roll < 0.28) tile.prop = 'rock';
                        }

                        if (!tile.prop) {
                            if (roll < 0.05) tile.prop = 'crate';
                            else if (roll < 0.08) tile.prop = 'pillar';
                            else if (roll < 0.1) tile.prop = 'ruin';
                        }

                        if (!tile.prop && roll < 0.105) {
                            tile.prop = 'enemySpawn';
                            enemySpawns.push({ x, y });
                        }
                    }
                }

                row.push(tile);
            }
            tiles.push(row);
        }

        return {
            width: w,
            height: h,
            seed: this.seed,
            playerSpawn: spawn,
            enemySpawns,
            grid: tiles
        };
    }

    // Count wall neighbors around a cell.
    countWalls(grid, w, h, x, y) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
                    count++;
                } else if (grid[ny][nx] === 1) {
                    count++;
                }
            }
        }
        return count;
    }

    smoothGrid(grid, w, h) {
        const next = Array.from({ length: h }, () => Array(w).fill(1));
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const walls = this.countWalls(grid, w, h, x, y);
                if (walls > 4) next[y][x] = 1;
                else if (walls < 4) next[y][x] = 0;
                else next[y][x] = grid[y][x];
            }
        }
        return next;
    }

    clearRadius(grid, w, h, cx, cy, r) {
        for (let y = -r; y <= r; y++) {
            for (let x = -r; x <= r; x++) {
                const nx = cx + x;
                const ny = cy + y;
                if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
                grid[ny][nx] = 0;
            }
        }
    }

    carveMainCorridors(grid, w, h, spawn) {
        const dirs = [
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 }
        ];
        const baseLen = Math.floor(Math.min(w, h) * (0.28 + this.rand() * 0.12));
        const thickness = 2 + Math.floor(this.rand() * 2);
        for (const d of dirs) {
            const len = baseLen + Math.floor(this.rand() * 8);
            this.carveLine(grid, w, h, spawn.x, spawn.y, d.dx, d.dy, len, thickness);
        }
    }

    carveLine(grid, w, h, x0, y0, dx, dy, len, thickness) {
        for (let i = 0; i < len; i++) {
            const cx = x0 + dx * i;
            const cy = y0 + dy * i;
            for (let oy = -thickness; oy <= thickness; oy++) {
                for (let ox = -thickness; ox <= thickness; ox++) {
                    const nx = cx + ox;
                    const ny = cy + oy;
                    if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
                    grid[ny][nx] = 0;
                }
            }
        }
    }

    getBaseBiome(biome) {
        if (!biome) return 'plains';
        if (biome === 'savanna' || biome === 'plains') return 'plains';
        if (biome === 'swamp' || biome === 'jungle') return 'jungle';
        if (biome === 'taiga' || biome === 'forest') return 'forest';
        if (biome === 'redwood') return 'forest';
        if (biome === 'mesa' || biome === 'rock' || biome === 'badlands') return 'rock';
        if (biome === 'ice' || biome === 'snow' || biome === 'tundra') return 'snow';
        if (biome === 'sand') return 'sand';
        if (biome === 'lava' || biome === 'volcanic') return 'lava';
        if (biome === 'mushroom') return 'forest';
        return 'plains';
    }

    buildBiomeGrid(w, h, cellSize) {
        const cols = Math.ceil(w / cellSize);
        const rows = Math.ceil(h / cellSize);
        const grid = [];
        for (let y = 0; y < rows; y++) {
            const row = [];
            for (let x = 0; x < cols; x++) {
                const worldX = x * cellSize;
                const worldY = y * cellSize;
                const climate = this.getClimate(worldX, worldY);
                row.push(this.pickBiomeFromClimate(climate.temp, climate.moist));
            }
            grid.push(row);
        }
        this.ensureBiomeVarietyGrid(grid);
        return grid;
    }

    ensureBiomeVarietyGrid(grid) {
        const wanted = ['jungle', 'sand', 'snow', 'rock', 'tundra', 'volcanic'];
        const counts = {};
        for (const row of grid) {
            for (const biome of row) {
                counts[biome] = (counts[biome] || 0) + 1;
            }
        }
        const missing = wanted.filter(b => !counts[b]);
        if (!missing.length) return;
        for (const biome of missing) {
            const y = Math.floor(this.rand() * grid.length);
            const x = Math.floor(this.rand() * grid[0].length);
            grid[y][x] = biome;
        }
    }
}
