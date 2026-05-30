import * as THREE from "three";

// Sector definitions for the 8 biomes
export const SECTOR_DEFS = [
    { id: 0, name: "Forest", biome: "forest", terrainColor: 0x2e7d32, buildingDensity: 0.7, lootDensity: 0.8,
      buildingTypes: ["log_cabin", "hunting_lodge", "watchtower"], treeDensity: 0.8, rockDensity: 0.3 },
    { id: 1, name: "Swamp", biome: "swamp", terrainColor: 0x2f6b4f, buildingDensity: 0.4, lootDensity: 0.6,
      buildingTypes: ["stilt_house", "swamp_shack", "observation_deck"], treeDensity: 0.5, rockDensity: 0.4 },
    { id: 2, name: "Desert", biome: "desert", terrainColor: 0xc2b280, buildingDensity: 0.5, lootDensity: 0.7,
      buildingTypes: ["mud_hut", "desert_outpost", "sand_fort"], treeDensity: 0.1, rockDensity: 0.6 },
    { id: 3, name: "Snow", biome: "snow", terrainColor: 0xe8e8e8, buildingDensity: 0.35, lootDensity: 0.65,
      buildingTypes: ["igloo", "snow_shelter", "mountain_cache"], treeDensity: 0.05, rockDensity: 0.5 },
    { id: 4, name: "Industrial", biome: "industrial", terrainColor: 0x666666, buildingDensity: 0.8, lootDensity: 0.9,
      buildingTypes: ["warehouse", "factory", "storage_unit"], treeDensity: 0.05, rockDensity: 0.2 },
    { id: 5, name: "Ruins", biome: "ruins", terrainColor: 0x8b7355, buildingDensity: 0.6, lootDensity: 0.85,
      buildingTypes: ["ruined_house", "ancient_temple", "crumbling_walls"], treeDensity: 0.2, rockDensity: 0.4 },
    { id: 6, name: "Mountain", biome: "mountain", terrainColor: 0x7d7d7d, buildingDensity: 0.45, lootDensity: 0.75,
      buildingTypes: ["mountain_lodge", "cliff_shelter", "supply_drop"], treeDensity: 0.1, rockDensity: 0.7 },
    { id: 7, name: "Plain", biome: "plains", terrainColor: 0x4a7c3f, buildingDensity: 0.75, lootDensity: 0.7,
      buildingTypes: ["farmhouse", "barn", "silo"], treeDensity: 0.3, rockDensity: 0.2 }
];

// Poisson disk sampling for sector seed points
function poissonDiskSample(centerX, centerZ, radius, minDist, rand, maxIter = 30) {
    const points = [];
    const cellSize = minDist / Math.SQRT2;
    const grid = new Map();
    const gridW = Math.ceil(radius * 2 / cellSize);
    const gridH = Math.ceil(radius * 2 / cellSize);

    function gridKey(x, y) {
        return x * 100003 + y;
    }

    function isValid(px, pz) {
        const dx = px - centerX;
        const dz = pz - centerZ;
        if (dx * dx + dz * dz > radius * radius) return false;
        const cx = Math.floor((px - centerX) / cellSize);
        const cy = Math.floor((pz - centerZ) / cellSize);
        for (let dx2 = -2; dx2 <= 2; dx2++) {
            for (let dy2 = -2; dy2 <= 2; dy2++) {
                const key = gridKey(cx + dx2, cy + dy2);
                if (grid.has(key)) {
                    const p = grid.get(key);
                    const ddx = px - p.x;
                    const ddz = pz - p.z;
                    if (ddx * ddx + ddz * ddz < minDist * minDist) return false;
                }
            }
        }
        return true;
    }

    // Initial point at center
    if (isValid(centerX, centerZ)) {
        points.push({ x: centerX, z: centerZ });
        grid.set(gridKey(Math.floor((centerX - centerX) / cellSize), Math.floor((centerZ - centerZ) / cellSize)), points[0]);
    }

    // Golden angle distribution
    const goldenAngle = 2.3983789851923124; // ~137.5 degrees in radians
    const totalPoints = Math.max(16, Math.floor((Math.PI * radius * radius) / (minDist * minDist)) * 2);

    for (let i = 1; i < totalPoints; i++) {
        const angle = i * goldenAngle;
        const r = radius * Math.sqrt(rand()) * 0.95;
        const px = centerX + Math.cos(angle) * r;
        const pz = centerZ + Math.sin(angle) * r;

        if (isValid(px, pz)) {
            points.push({ x: px, z: pz });
            const cx = Math.floor((px - centerX) / cellSize);
            const cy = Math.floor((pz - centerZ) / cellSize);
            grid.set(gridKey(cx, cy), points[points.length - 1]);
        }
    }

    return points;
}

// Simple convex hull (Graham scan)
function convexHull(points) {
    if (points.length < 3) return points;
    const sorted = [...points].sort((a, b) => {
        if (a.x !== b.x) return a.x - b.x;
        return a.z - b.z;
    });

    const lower = [];
    for (const p of sorted) {
        while (lower.length >= 2) {
            const a = lower[lower.length - 2];
            const b = lower[lower.length - 1];
            const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
            if (cross <= 0) { lower.pop(); } else break;
        }
        lower.push(p);
    }

    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2) {
            const a = upper[upper.length - 2];
            const b = upper[upper.length - 1];
            const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
            if (cross <= 0) { upper.pop(); } else break;
        }
        upper.push(p);
    }

    lower.pop();
    upper.pop();
    return [...lower, ...upper];
}

// VoronoiSectors class
export class VoronoiSectors {
    constructor(scene, seed = 42) {
        this.scene = scene;
        this.seed = seed;
        this.sectors = [];
        this.sectorBounds = []; // {sectorId, minX, minZ, maxX, maxZ}
        this._randState = seed;
    }

    _rand() {
        this._randState = (this._randState * 1664525 + 1013904223) >>> 0;
        return this._randState / 0x100000000;
    }

    generate(count = 8) {
        const radius = 250; // Working radius for sector placement
        const minDist = 55; // Minimum distance between sector centers

        // Poisson disk sample seed points
        const seeds = poissonDiskSample(0, 0, radius, minDist, this._rand.bind(this));

        // Assign sectors to seeds
        this.sectors = [];
        for (let i = 0; i < Math.min(count, seeds.length); i++) {
            const def = SECTOR_DEFS[i % SECTOR_DEFS.length];
            const seed = seeds[i];
            const hull = convexHull(seeds); // Simplified: use all seeds for bounding

            // Bounding box for this sector
            const bounds = this._computeSectorBounds(seed, seeds);

            this.sectors.push({
                id: def.id,
                name: def.name,
                biome: def.biome,
                center: { x: seed.x, z: seed.z },
                seedPoint: seed,
                bounds,
                terrainColor: def.terrainColor,
                buildingDensity: def.buildingDensity,
                lootDensity: def.lootDensity,
                buildingTypes: def.buildingTypes,
                treeDensity: def.treeDensity,
                rockDensity: def.rockDensity,
                hull
            });

            this.sectorBounds.push({
                sectorId: def.id,
                minX: bounds.minX,
                minZ: bounds.minZ,
                maxX: bounds.maxX,
                maxZ: bounds.maxZ,
                radius: bounds.radius
            });
        }

        return this.sectors;
    }

    _computeSectorBounds(seed, allSeeds) {
        // Find neighboring seeds to define sector boundary
        const neighbors = allSeeds.filter(s => s !== seed).sort((a, b) => {
            const da = Math.hypot(a.x - seed.x, a.z - seed.z);
            const db = Math.hypot(b.x - seed.x, b.z - seed.z);
            return da - db;
        });

        // Use distance to 2nd nearest neighbor as sector radius estimate
        const radius = Math.hypot(neighbors[1].x - seed.x, neighbors[1].z - seed.z) * 0.8;

        return {
            minX: seed.x - radius,
            minZ: seed.z - radius,
            maxX: seed.x + radius,
            maxZ: seed.z + radius,
            radius
        };
    }

    // Get sector ID for a given world position
    getSectorAt(x, z) {
        let bestId = 0;
        let bestDist = Infinity;
        for (const sector of this.sectors) {
            const dx = x - sector.center.x;
            const dz = z - sector.center.z;
            const dist = dx * dx + dz * dz;
            if (dist < bestDist) {
                bestDist = dist;
                bestId = sector.id;
            }
        }
        return bestId;
    }

    // Get sector definition for a position
    getSectorDefAt(x, z) {
        for (const sector of this.sectors) {
            if (x >= sector.bounds.minX && x <= sector.bounds.maxX &&
                z >= sector.bounds.minZ && z <= sector.bounds.maxZ) {
                return sector;
            }
        }
        // Fallback to nearest
        const sid = this.getSectorAt(x, z);
        return this.sectors.find(s => s.id === sid) || this.sectors[0];
    }

    // Get terrain tile color for a position
    getTerrainColor(x, z) {
        const sector = this.getSectorDefAt(x, z);
        return new THREE.Color(sector.terrainColor);
    }

    // Get building density for a position
    getBuildingDensity(x, z) {
        const sector = this.getSectorDefAt(x, z);
        const dx = x - sector.center.x;
        const dz = z - sector.center.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const maxR = sector.bounds.radius || 50;
        // Higher density near center, tapering at edges
        const falloff = 1 - Math.min(1, dist / maxR);
        return sector.buildingDensity * (0.5 + falloff * 0.5);
    }

    // Draw sector boundaries as line segments
    drawBoundaries(scene) {
        const lines = [];
        const geometry = new THREE.BufferGeometry();
        const positions = [];

        for (const sector of this.sectors) {
            const b = sector.bounds;
            // Draw bounding box
            positions.push(
                b.minX, 0, b.minZ,  b.maxX, 0, b.minZ,
                b.maxX, 0, b.minZ,  b.maxX, 0, b.maxZ,
                b.maxX, 0, b.maxZ,  b.minX, 0, b.maxZ,
                b.minX, 0, b.maxZ,  b.minX, 0, b.minZ
            );
            const color = new THREE.Color(sector.terrainColor);
            const colors = [
                color.r, color.g, color.b,  color.r, color.g, color.b,
                color.r, color.g, color.b,  color.r, color.g, color.b,
                color.r, color.g, color.b,  color.r, color.g, color.b,
                color.r, color.g, color.b,  color.r, color.g, color.b
            ];
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 });
        const boundaryLines = new THREE.LineSegments(geometry, material);
        boundaryLines.userData.mapGenerated = true;
        boundaryLines.visible = true;
        scene.add(boundaryLines);
        lines.push(boundaryLines);

        // Draw sector centers as small markers
        for (const sector of this.sectors) {
            const dotGeo = new THREE.CylinderGeometry(1, 1, 0.3, 8);
            const dotMat = new THREE.MeshBasicMaterial({ color: sector.terrainColor });
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.set(sector.center.x, 0.15, sector.center.z);
            dot.userData.mapGenerated = true;
            scene.add(dot);
            lines.push(dot);
        }

        return lines;
    }

    // Check if point is inside sector bounds
    isInsideSector(x, z, sectorId) {
        const sector = this.sectors.find(s => s.id === sectorId);
        if (!sector) return false;
        const b = sector.bounds;
        return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
    }
}
