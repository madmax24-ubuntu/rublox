import * as THREE from "../node_modules/three/build/three.module.js";

// Sector definitions for the quadrant-based survival map
export const SECTOR_DEFS = [
    { id: 0, name: "Forest", biome: "forest", terrainColor: 0x2e7d32, buildingDensity: 0.85, lootDensity: 0.8,
      treeDensity: 0.9, rockDensity: 0.3 },
    { id: 1, name: "Stone Maze", biome: "stone_maze", terrainColor: 0x7a7a6e, buildingDensity: 0.35, lootDensity: 0.45,
      treeDensity: 0, rockDensity: 0 },
    { id: 2, name: "Military Ruins", biome: "military", terrainColor: 0x4a5238, buildingDensity: 0.7, lootDensity: 0.85,
      treeDensity: 0.1, rockDensity: 0 },
    { id: 3, name: "Ice Lake", biome: "ice_lake", terrainColor: 0xb0d4e3, buildingDensity: 0.25, lootDensity: 0.5,
      treeDensity: 0.08, rockDensity: 0 },
];

// VoronoiSectors class — maintains sector data for the map generator
export class VoronoiSectors {
    constructor(scene, seed = 42) {
        this.scene = scene;
        this.seed = seed;
        this.sectors = [];
        this._randState = seed;
        this.size = 512;
        this.halfSize = 256;
    }

    _rand() {
        this._randState = (this._randState * 1664525 + 1013904223) >>> 0;
        return this._randState / 0x100000000;
    }

    /**
     * Generate 4 quadrant sectors + central hub
     */
    generate(count = 16) {
        const sectorSize = this.size / 2; // 256 each
        const hubRadius = 50;

        this.sectors = [];

        // NW = Forest
        const forestDef = SECTOR_DEFS.find(d => d.biome === 'forest');
        this.sectors.push({
            id: forestDef?.id ?? 0,
            name: forestDef?.name ?? 'Forest',
            biome: 'forest',
            quadrant: 'NW',
            center: { x: -sectorSize / 2, z: -sectorSize / 2 },
            bounds: { minX: -this.halfSize, minZ: -this.halfSize, maxX: 0, maxZ: 0, radius: sectorSize / 2 },
            terrainColor: forestDef?.terrainColor ?? 0x2e7d32,
            buildingDensity: (forestDef?.buildingDensity ?? 0.85) * 1.1,
            lootDensity: forestDef?.lootDensity ?? 0.8,
            buildingTypes: ['log_cabin', 'watchtower'],
            treeDensity: Math.min(0.95, (forestDef?.treeDensity ?? 0.9) + 0.2),
            rockDensity: forestDef?.rockDensity ?? 0.3,
            hubRadius
        });

        // NE = Stone Maze
        const mazeDef = SECTOR_DEFS.find(d => d.biome === 'stone_maze');
        this.sectors.push({
            id: mazeDef?.id ?? 1,
            name: mazeDef?.name ?? 'Stone Maze',
            biome: 'stone_maze',
            quadrant: 'NE',
            center: { x: sectorSize / 2, z: -sectorSize / 2 },
            bounds: { minX: 0, minZ: -this.halfSize, maxX: this.halfSize, maxZ: 0, radius: sectorSize / 2 },
            terrainColor: mazeDef?.terrainColor ?? 0x7a7a6e,
            buildingDensity: mazeDef?.buildingDensity ?? 0.35,
            lootDensity: mazeDef?.lootDensity ?? 0.45,
            buildingTypes: ['maze_wall', 'maze_tower'],
            treeDensity: 0,
            rockDensity: mazeDef?.rockDensity ?? 0,
            hubRadius
        });

        // SW = Military Ruins
        const milDef = SECTOR_DEFS.find(d => d.biome === 'military');
        this.sectors.push({
            id: milDef?.id ?? 2,
            name: milDef?.name ?? 'Military Ruins',
            biome: 'military',
            quadrant: 'SW',
            center: { x: -sectorSize / 2, z: sectorSize / 2 },
            bounds: { minX: -this.halfSize, minZ: 0, maxX: 0, maxZ: this.halfSize, radius: sectorSize / 2 },
            terrainColor: milDef?.terrainColor ?? 0x4a5238,
            buildingDensity: (milDef?.buildingDensity ?? 0.7) * 1.2,
            lootDensity: milDef?.lootDensity ?? 0.85,
            buildingTypes: ['ruined_building', 'tank'],
            treeDensity: 0.05,
            rockDensity: 0.3,
            hubRadius
        });

        // SE = Ice Lake
        const iceDef = SECTOR_DEFS.find(d => d.biome === 'ice_lake');
        this.sectors.push({
            id: iceDef?.id ?? 3,
            name: iceDef?.name ?? 'Ice Lake',
            biome: 'ice_lake',
            quadrant: 'SE',
            center: { x: sectorSize / 2, z: sectorSize / 2 },
            bounds: { minX: 0, minZ: 0, maxX: this.halfSize, maxZ: this.halfSize, radius: sectorSize / 2 },
            terrainColor: iceDef?.terrainColor ?? 0xb0d4e3,
            buildingDensity: (iceDef?.buildingDensity ?? 0.25) * 1.3,
            lootDensity: iceDef?.lootDensity ?? 0.5,
            buildingTypes: ['igloo'],
            treeDensity: 0.15,
            rockDensity: iceDef?.rockDensity ?? 0,
            hubRadius
        });

        // Central Hub
        this.sectors.push({
            id: -999,
            name: 'Central Hub',
            biome: 'hub',
            quadrant: 'center',
            center: { x: 0, z: 0 },
            bounds: { minX: -hubRadius, minZ: -hubRadius, maxX: hubRadius, maxZ: hubRadius, radius: hubRadius },
            terrainColor: 0xffd700,
            buildingDensity: 1.0,
            lootDensity: 1.0,
            buildingTypes: ['cornucopia', 'spawn_platform'],
            treeDensity: 0,
            rockDensity: 0,
            hubRadius
        });

        return this.sectors;
    }

    /**
     * Draw sector boundaries as colored lines
     */
    drawBoundaries(scene) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];

        for (const sector of this.sectors) {
            const b = sector.bounds;
            const color = new THREE.Color(sector.terrainColor);

            // Only draw boundary lines for non-hub sectors
            if (sector.biome === 'hub') continue;

            positions.push(
                b.minX, 0.1, b.minZ,  b.maxX, 0.1, b.minZ,
                b.maxX, 0.1, b.minZ,  b.maxX, 0.1, b.maxZ,
                b.maxX, 0.1, b.maxZ,  b.minX, 0.1, b.maxZ,
                b.minX, 0.1, b.maxZ,  b.minX, 0.1, b.minZ
            );
            for (let i = 0; i < 8; i++) {
                colors.push(color.r, color.g, color.b);
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3 });
        const boundaryLines = new THREE.LineSegments(geometry, material);
        boundaryLines.userData.mapGenerated = true;
        boundaryLines.visible = false; // Hidden by default, shown in debug mode
        scene.add(boundaryLines);
    }

    /**
     * Get sector ID for a world position
     */
    getSectorAt(x, z) {
        // Check hub first
        const distFromCenter = Math.sqrt(x * x + z * z);
        if (distFromCenter < 40) return -999;

        // Determine quadrant
        if (x < 0 && z < 0) return 0; // Forest
        if (x >= 0 && z < 0) return 1; // Maze
        if (x < 0 && z >= 0) return 2; // Military
        return 3; // Ice
    }

    /**
     * Get sector definition for a position
     */
    getSectorDefAt(x, z) {
        const sid = this.getSectorAt(x, z);
        return this.sectors.find(s => s.id === sid) || this.sectors[0];
    }
}
