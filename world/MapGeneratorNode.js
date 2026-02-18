// Procedural map generator for a Roblox-like grid-based game.
// Node.js / ES6 module, no external dependencies.

export class MapGenerator {
    constructor() {
        this.seed = 1;
        this.rng = null;
        this.biomes = [
            { name: 'forest', max: 0.2 },
            { name: 'jungle', max: 0.3 },
            { name: 'plains', max: 0.45 },
            { name: 'rock', max: 0.6 },
            { name: 'sand', max: 0.75 },
            { name: 'snow', max: 0.88 },
            { name: 'lava', max: 1.0 }
        ];
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

    pickBiome(x, y) {
        if (this.biomeGrid && this.biomeCellSize) {
            const cx = Math.floor(x / this.biomeCellSize);
            const cy = Math.floor(y / this.biomeCellSize);
            const row = this.biomeGrid[cy];
            if (row && row[cx]) return row[cx];
        }
        const n1 = this.biomeNoise(Math.floor(x / 8), Math.floor(y / 8));
        const n2 = this.biomeNoise(Math.floor(x / 3) + 31, Math.floor(y / 3) - 17);
        const n = Math.min(1, Math.max(0, n1 * 0.7 + n2 * 0.3));
        for (const biome of this.biomes) {
            if (n <= biome.max) return biome.name;
        }
        return 'plains';
    }

    // Generate a map with caves/glades using cellular automata.
    generate(width, height, seed = 1) {
        this.initRng(seed);
        const w = Math.max(16, Math.floor(width));
        const h = Math.max(16, Math.floor(height));
        const biomeCellSize = 24;
        this.biomeGrid = this.buildBiomeGrid(w, h, biomeCellSize);
        this.biomeCellSize = biomeCellSize;

        // 0 = floor, 1 = wall
        let grid = Array.from({ length: h }, () => Array(w).fill(1));

        // Initial noise carve (keep borders as walls).
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const biome = this.pickBiome(x, y);
                const base = biome === 'forest' ? 0.5
                    : biome === 'jungle' ? 0.48
                    : biome === 'rock' ? 0.55
                    : biome === 'snow' ? 0.52
                        : biome === 'sand' ? 0.38
                            : biome === 'lava' ? 0.62
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
                        if (biome === 'forest') {
                            if (roll < 0.22) tile.prop = 'tree';
                            else if (roll < 0.32) tile.prop = 'bush';
                            else if (roll < 0.38) tile.prop = 'stump';
                            else if (roll < 0.42) tile.prop = 'log';
                        } else if (biome === 'jungle') {
                            if (roll < 0.24) tile.prop = 'jungleTree';
                            else if (roll < 0.34) tile.prop = 'bush';
                            else if (roll < 0.39) tile.prop = 'ruin';
                        } else if (biome === 'rock') {
                            if (roll < 0.22) tile.prop = 'rock';
                            else if (roll < 0.3) tile.prop = 'pillar';
                            else if (roll < 0.36) tile.prop = 'boulder';
                            else if (roll < 0.4) tile.prop = 'ruin';
                        } else if (biome === 'snow') {
                            if (roll < 0.18) tile.prop = 'ice';
                            else if (roll < 0.25) tile.prop = 'rock';
                            else if (roll < 0.3) tile.prop = 'boulder';
                        } else if (biome === 'sand') {
                            if (roll < 0.16) tile.prop = 'cactus';
                            else if (roll < 0.24) tile.prop = 'rock';
                            else if (roll < 0.28) tile.prop = 'boulder';
                        } else if (biome === 'plains') {
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

    buildBiomeGrid(w, h, cellSize) {
        const cols = Math.ceil(w / cellSize);
        const rows = Math.ceil(h / cellSize);
        const grid = [];
        for (let y = 0; y < rows; y++) {
            const row = [];
            for (let x = 0; x < cols; x++) {
                const n = this.biomeNoise(x * 7, y * 7);
                for (const biome of this.biomes) {
                    if (n <= biome.max) {
                        row.push(biome.name);
                        break;
                    }
                }
            }
            grid.push(row);
        }
        this.ensureBiomeVarietyGrid(grid);
        return grid;
    }

    ensureBiomeVarietyGrid(grid) {
        const wanted = ['jungle', 'sand', 'snow', 'rock'];
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
