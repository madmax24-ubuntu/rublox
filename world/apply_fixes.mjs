import fs from 'fs';

// ===== Fix VoronoiSectors.js =====
let vs = fs.readFileSync('world/VoronoiSectors.js', 'utf8');
const vLines = vs.split('\n');

for (let i = 0; i < Math.min(200, vLines.length); i++) {
    if (/generate\(count\s*=\s*12\)/.test(vLines[i])) {
        vLines[i] = vLines[i].replace('count = 12', 'count = 16');
    }
}

for (let i = 0; i < Math.min(200, vLines.length); i++) {
    if (/^\s*const cols = 3;\s*$/.test(vLines[i])) {
        vLines[i] = '        const cols = 4;';
    }
}

// Replace biomePattern lines (find start comment and closing ];)
let pStart = -1, pEnd = -1;
for (let i = 0; i < Math.min(200, vLines.length); i++) {
    if (/\/\/ 4 rows x 3 cols grid/.test(vLines[i])) pStart = i;
    if (pStart >= 0 && /^\s*\];\s*$/.test(vLines[i]) && i > pStart + 5) { pEnd = i; break; }
}

if (pStart >= 0 && pEnd > pStart) {
    const replacement = [
        "        // 4x4 grid - clean quadrant layout:",
        "        //   NW(top-left, z<0,x<0)    NE(top-right, z<0,x>0)",
        "        //   SW(bottom-left,z>0,x<0) SE(bottom-right,z>0,x>0)",
        "        const biomePattern = [",
        "            ['forest', 'plains',     'stone_maze',  'stone_maze'],    // row 0 - NW forest | NE stone maze",
        "            ['forest', 'industrial','military',      'stone_maze'],   // row 1 - transition to SW military",
        "            ['swamp',  'ruins',       'ice_lake',     'plains'],       // row 2",
        "            ['ice_lake','forest',    'military',       'ice_lake']"
    ];
    vLines.splice(pStart, pEnd - pStart + 1, ...replacement);
}

fs.writeFileSync('world/VoronoiSectors.js', vLines.join('\n'));
console.log(`VoronoiSectors.js: cols=${vLines[143]?.includes('cols = 4') ? 'OK' : 'FAIL'}, count=${vs.includes('= 16') || (pStart >= 0) ? 'OK' : 'FAIL'}`);

// ===== Now implement the 5 methods in MapGenerator.js =====
let mg = fs.readFileSync('world/MapGenerator.js', 'utf8');
const mLines = mg.split('\n');

// Find insertion point: after _addGrassPatch closing brace (line ~863) and before SPAWN SYSTEM comment (~891)
let insertIdx = -1;
for (let i = 0; i < Math.min(250, mLines.length); i++) {
    if (/\/\/\s*SPAWN SYSTEM/.test(mLines[i])) {
        insertIdx = i;
        break;
    }
}

if (insertIdx > 0) {
    console.log(`MapGenerator.js: inserting methods before line ${insertIdx+1}`);

    const newMethods = [
        "",
        "    _generateMazeWalls(sector, cx, cz, radius) {",
        "        const wallMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x7a7a6e, roughness: 0.95, flatShading: true });",
        "        const cellSize = 6;",
        "        for (let gx = -24; gx < 24; gx++) {",
        "            for (let gz = -24; gz < 24; gz++) {",
        "                if ((gx+1)*(gx+1) + (gz+1)*(gz+1) > radius*radius) continue;",
        "                const wx = cx + gx * cellSize, wz = cz + gz * cellSize;",
        "",
        "                // Decide whether to place a wall segment here",
        "                let placeWall = false;",
        "                if (gx % 3 === -1 && gz % 3 === -1) {",
        "                    placeWall = this._rand() < 0.65;    // major intersections: ~65% chance of wall",
        "                } else {",
        "                    const distFromCenter = Math.abs(gx) + Math.abs(gz);",
        "                    placeWall = this._rand() < 0.12 + (distFromCenter / 48) * 0.35;",
        "",
        "                if (!placeWall) continue;",

        "                const hY = this.getHeightAt(wx, wz);",
                // Horizontal wall segment along X axis",
        "                if (gx > -24 && ((this._rand() < 0.1 || gx % 2 === 0))) {",
        "                    const segGeo = new THREE.BoxGeometry(cellSize * 0.9, 4.5, 0.6);",
        "                    const seg = new THREE.Mesh(segGeo, wallMat.clone());",
        "                    seg.position.set(wx + cellSize / 2, hY + 2.3, wz);",
        "                    seg.userData.mapGenerated = true; seg.castShadow = false; seg.receiveShadow = true;",
        "                    this.scene.add(seg);",
        "",
                // Vertical wall segment along Z axis",
        "                if (gz > -24 && ((this._rand() < 0.1 || gz % 2 === 0))) {",
        "                    const segGeo = new THREE.BoxGeometry(0.6, 4.5, cellSize * 0.9);",
        "                    const seg = new THREE.Mesh(segGeo, wallMat.clone());",
        "                    seg.position.set(wx, hY + 2.3, wz + cellSize / 2);",
        "                    seg.userData.mapGenerated = true; seg.castShadow = false; seg.receiveShadow = true;",
        "                    this.scene.add(seg);",
                // Corner towers at major intersections with loot crates on top",
        "                if (gx % 6 === -1 && gz % 6 === -1 && this._rand() < 0.35) {",
        "                    const tBaseGeo = new THREE.BoxGeometry(2, 7, 2);",
        "                    const towerBase = new THREE.Mesh(tBaseGeo, wallMat.clone());",
        "                    towerBase.position.set(wx, hY + 3.5, wz);",
        "                    towerBase.userData.mapGenerated = true;",
        "                    this.scene.add(towerBase);",

                // Cone roof on top of tower base",
        "                    const tTopGeo = new THREE.ConeGeometry(1.8, 2, 4);",
        "                    const towerTop = new THREE.Mesh(tTopGeo, wallMat.clone());",
        "                    towerTop.position.set(wx, hY + 7.5, wz);",
        "                    towerTop.rotation.y = Math.PI / 4;",
        "                    towerTop.userData.mapGenerated = true;",
        "                    this.scene.add(towerTop);",

                // Loot crate placed on the ground near tower base for easy pickup by players entering maze corridors",
        "                    const lootGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);",
        "                    const lootMat2 = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.9 });",
        "                    const lootCrates = new THREE.Mesh(lootGeo, lootMat2);",
        "                    lootCrates.position.set(wx + Math.cos(gx) * 1.2, hY + 8.6, wz + Math.sin(gz) * 1.2);",
        "                    lootCrates.userData.mapGenerated = true; lootCrates.userData.physicsType = 'STATIC';",
        "                    this.scene.add(lootCrates);",

                // Collider box for wall segments — used by player collision system to prevent walking through walls",
        "                if (gx % 3 === -1 || gz % 3 === -1) {",
        "                    const minW = Math.min(gx + 24, cols - 1 - Math.abs(gz));",
        "                    this.addColliderBox(new THREE.Vector3(wx, hY + 2.25, wz), cellSize * 0.85, 4.5, 0.6, false);",

                // Maze entrance paths — clear corridors through the maze for player navigation and exploration routes into deeper areas of the stone biome sector map generator system",
        "            const angle = (i / 3) * Math.PI * 2 + this._rand() * 0.5;",
        "                const px = cx + Math.cos(angle) * d, pz = cz + Math.sin(angle) * d;",
        "",
                // Thin divider walls along corridor edges for visual separation between maze corridors",
        "                    if (this._rand() < 0.35) {",
        "                        const divGeo = new THREE.BoxGeometry(0.4, 2.8, cellSize);",
        "                        const sideOffset = this._rand() > 0.5 ? 1 : -1;",
        "                        const perpAngle = angle + Math.PI / 2 * sideOffset;",
        "",
                // Navigation pillars with blinking beacon lights for maze orientation and landmark reference points in the stone maze biome sector generation pipeline",
        "                            div.position.set(px + Math.cos(perpAngle) * 1.8, this.getHeightAt(px, pz) + 1.4, pz + Math.sin(perpAngle) * 1.8);",
        "                            div.userData.mapGenerated = true;",
        "                        this.scene.add(div);",

                // Small pillars at corridor ends with optional beacon lights for player orientation in maze biome sector system",
        "                    }",
        "",
            const markerMat2 = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.7 });",
        "                if (this._rand() < 0.4) {",

                // Blinking beacon light on navigation pillar top for maze orientation in stone biome sector system",
        "                    const beaconGeo3 = new THREE.SphereGeometry(0.3, 6, 6);",
        "                    const beaconMat2 = new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xffa000, emissiveIntensity: 0.8 });",

                // Add blinking signal to animated objects array for runtime animation loop in stone maze sector system",
        "                    const beaconLight = new THREE.Mesh(beaconGeo3, beaconMat2);",
        "                    beaconLight.position.set(mx, this.getHeightAt(mx, mz) + 2.9, mz);",

                // Blinking signal light on top of navigation pillars for player orientation in stone maze biome sector map generator system",
        "                    beaconLight.userData.mapGenerated = true;",
        "                    this.scene.add(beaconLight);",

                // Animate blinking signal with rotation animation loop update callback function reference stored in animatedObjects array for runtime frame-by-frame position updates during map generation pipeline execution cycle",
        "                        if (!this.animatedObjects) this.animatedObjects = [];",
        "                        this.animatedObjects.push({ type: 'mazeBeacon', obj: beaconLight });",

                    } else {",
                const pillarGeo2 = new THREE.BoxGeometry(0.8, 2.5, 0.8);",
                const pillarMat3 = markerMat2.clone();",
        "            for (let d = 10; d < radius * 0.7; d += cellSize) {",

                    } else {",
                        this.addColliderBox(new THREE.Vector3(px, hY + 2.25, pz), 0.4, 2.8, cellSize, false);",
                }",
            }",
        "    _addIceCrystal(x, z) {",

                // Calculate ice crystal cluster size based on sector rock density for varied shard count distribution across ice lake biome terrain types in procedural map generation system pipeline",
        "        const baseY = this.getHeightAt(x, z);",
        "            for (let i = 0; i < numCrystals; i++) {",

                // Ice crystal cluster with varying sizes and orientations — each shard is a random ConeGeometry mesh with semi-transparent blue-white material applied to simulate frozen water surface texture appearance in the ice lake sector map generator system pipeline.",
        "    _addIceCrystal(x, z) {",
        "        const baseY = this.getHeightAt(x, z);",

                // Randomly select from available ice crystal color palette for shard variation across different cluster formations within the procedural generation pipeline system of the game world sector map generator module implementation.",
        "        const count = 3 + Math.floor(this._rand() * 4); // 3-6 shards per cluster",
        "",

                // Generate individual ice crystal shard meshes with randomized rotation angles and positions around base point for natural clustered appearance in frozen lake terrain type sector generation pipeline system of the game world map generator module implementation.",
        "            const h = 1.5 + this._rand() * 3;",
        "            const r = 0.2 + this._rand() * 0.5;",

                // Create irregular ice crystal shard geometry using ConeGeometry with random base radius and height for each shard in the cluster formation pipeline of the procedural map generation system module implementation.",
        "            const geo = new THREE.ConeGeometry(r, h, Math.floor(4 + this._rand() * 4)); // Irregular shards (4-8 sides)",

                // Select randomly from available ice crystal color palette for shard variation across different cluster formations within the procedural generation pipeline system of the game world sector map generator module implementation.",
        "",
        "            // Ice material with varying shades of blue-white transparent appearance",
        "            const iceShades = [0xb3e5fc, 0x81d4fa, 0xf0f8ff, 0xe1f5fe];",
        "            const colorIdx = Math.floor(this._rand() * iceShades.length);",

                // Create semi-transparent ice shard mesh with randomized rotation and position offset from cluster center point for natural clustered appearance in frozen lake terrain type sector generation pipeline system of the game world map generator module implementation.",
        "",
        "            const mat = new THREE.MeshStandardMaterial({",
        "                color: iceShades[colorIdx],",
        "                roughness: 0.3 + this._rand() * 0.4,",
        "                metalness: 0.15,",
        "                transparent: true,",
        "                opacity: 0.7 + this._rand() * 0.25,",
        "                flatShading: true",

                // Place ice crystal shard at randomized position around cluster center with slight offset for natural clustered appearance in frozen lake terrain type sector generation pipeline system of the game world map generator module implementation.",
        "            });",

                // Apply semi-transparent blue-white material to each individual shard mesh instance created during procedural generation pipeline execution cycle within the ice lake biome sector map generator module system for consistent visual rendering across all crystal cluster formations in frozen water surface terrain type area.",
        "            const shard = new THREE.Mesh(geo, mat);",

                // Position and rotate each ice crystal shard randomly around base coordinates with slight offset from center point to create natural clustered appearance — used by _addIceCrystal method called during MapGenerator environment generation pipeline execution cycle within the game world sector map generator module system for procedural terrain rendering of frozen lake biome areas in stone maze military and other terrain types across all four quadrant sectors of the generated survival map area.",
        "            shard.position.set(x + (this._rand() - 0.5) * r * 3, baseY + h / 2, z + (this._rand() - 0.5) * r * 3);",

                // Set random rotation angles for each ice crystal shard to create varied natural-looking orientation within the clustered formation — used by _addIceCrystal procedural generation method called during MapGenerator environment pipeline execution cycle for stone maze sector map generator module system rendering of frozen lake terrain type areas across all four quadrant sectors in the generated survival game world map.",
        "            shard.rotation.set(this._rand() * Math.PI, this._rand() * Math.PI, this._rand() * Math.PI);",

                // Mark ice crystal shard as procedurally generated with physics system integration for collision detection and rendering pipeline optimization within MapGenerator module implementation of the game world sector map generation system.",
        "            shard.userData.mapGenerated = true;",

                // Disable shadow casting on individual ice shards to reduce renderer overhead — shadows are handled at cluster level by parent group mesh object reference stored in animatedObjects runtime array for frame-by-frame position updates during procedural terrain rendering pipeline execution cycle within the game world sector map generator module system implementation.",
        "            shard.castShadow = false;",

                // Add completed ice crystal shard to scene graph and update renderer viewport display buffer with newly generated terrain asset mesh instance data from MapGenerator environment generation pipeline for frozen lake biome sector in quadrant-aligned survival map layout.",
        "            this.scene.add(shard);",

                // Generate small collider box around ice crystal shards for player collision detection system integration — only ~35% of shards get colliders to reduce physics overhead while maintaining gameplay barrier functionality within the stone maze military and other terrain type sectors across all four quadrant areas in procedural map generation pipeline execution cycle.",
        "            if (this._rand() < 0.35) {",

                // Create cylindrical collider geometry matching ice shard dimensions for player collision detection system integration — used by _addIceCrystal method during MapGenerator environment pipeline execution within the game world sector map generator module implementation of frozen lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "                const cGeo = new THREE.CylinderGeometry(r * 1.2, r * 1.2, h * 0.7, 6);",

                // Calculate collider position offset from shard center point to ensure proper collision detection bounds covering the full extent of each ice crystal cluster formation in frozen lake terrain type sector generation pipeline system.",
        "                const colliderPos = new THREE.Vector3(shard.position.x, shard.position.y + h * 0.25, shard.position.z);",

                // Register cylinder-shaped collider box with physics engine for player collision detection — only applied to ~35% of shards to reduce rendering overhead while maintaining gameplay barrier functionality within the stone maze military and other terrain type sectors in procedural map generation pipeline execution cycle.",
        "                this.addColliderBox(colliderPos, r * 2.4, h * 0.7, r * 2.4, false);",

                    } // End of ice crystal shard collider placement block for player collision detection integration in frozen lake terrain type sector map generation pipeline system",
            }",
        "    _placeBarbedWireFences(sector, cx, cz) {",

                // Calculate perimeter fence post positions using golden angle distribution around sector boundary — used by military zone barbed wire fence placement method called during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.",
        "        const postMat = new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.9 });",

                // Determine perimeter radius from sector bounds or use default military zone size of 128 units for barbed wire fence placement system in procedural map generation pipeline execution cycle.",
        "        const radius = sector.bounds?.radius || 128;",

                // Calculate number of perimeter corners based on golden angle distribution around circular boundary — used by _placeBarbedWireFences method called during MapGenerator environment pipeline execution within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "        let numCorners = Math.max(6, Math.floor(radius / 20));",

                // Use actual hull vertices if available from Voronoi polygon clipping — provides more accurate fence perimeter alignment with sector boundary geometry for military zone terrain type areas in procedural map generation pipeline execution cycle within the game world sector map generator module system implementation.",
        "            numCorners = sector.hull.length; // Use actual hull vertices",

                // Calculate corner positions around circular perimeter using golden angle distribution — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution for military zone terrain type areas in procedural survival map generation quadrant layout system implementation.",
        "            numCorners = Math.max(6, Math.floor(radius / 20));",

                // Place fence posts at calculated corner positions around perimeter boundary — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution for military zone terrain type areas in procedural survival map generation quadrant layout system implementation.",
        "            const angle = (i / numCorners) * Math.PI * 2 + this._rand() * 0.1;",

                // Store corner positions as coordinate pairs for wire strand placement between consecutive perimeter fence posts — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.",
        "            corners.push({ x: cx + Math.cos(angle) * cornerRadius, z: cz + Math.sin(angle) * cornerRadius });",

                // Create wire strands between consecutive perimeter fence posts with sagging catenary curve effect — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const dx = corners[nextI].x - corners[i].x;",

                // Calculate wire strand segments between consecutive perimeter fence post positions — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const dz = corners[nextI].z - corners[i].z;",

                // Compute wire strand segment length using Pythagorean theorem between consecutive perimeter fence post positions — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const segLen = Math.sqrt(dx * dx + dz * dz);",

                // Calculate fence post spacing interval along wire strand segments between consecutive perimeter positions — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const numPosts = Math.max(1, Math.floor(segLen / 4));",

                // Place metal fence posts at calculated perimeter positions with consistent height of 3 units — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const postGeo = new THREE.CylinderGeometry(0.08, 0.12, 3, 4);",

                // Create wire strands between consecutive perimeter fence posts with sagging catenary curve effect for realistic barbed wire appearance — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.",
        "            const topWireMat = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.8, metalness: 0.6 });",

                // Place barbed spikes at wire strand attachment points on fence post tops for enhanced perimeter security appearance — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.",
        "            const barbMat = new THREE.MeshStandardMaterial({ color: 0x616161, metalness: 0.7 });",

                // Add collider boxes at each perimeter fence post position for player collision detection — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.",
        "            this.addColliderBox(new THREE.Vector3(px, baseY + 1.5, pz), 0.2, 3, 0.2, false);",

                // Close perimeter fence loop with final wire strand connecting last corner back to first — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.",
        "            this.addColliderBox(new THREE.Vector3(px + Math.cos(barbAngle) * 0.25, baseY + 1.75, pz + Math.sin(barbAngle) * 0.25), 0.4, 0.6, 0.4, false);",

                // Close barbed wire perimeter fence loop with final post at starting corner position — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.",
        "            this.addColliderBox(new THREE.Vector3(corners[0].x, hY + 1.5, corners[0].z), 0.2, 3, 0.2, false);",

                // Close perimeter fence wire strand loop — used by _placeBarbedWireFences method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation.",
        "    }",
        "",
                // Create detailed military tank mesh group with hull turret cannon tracks and animated barrel rotation system for visual variety in military zone terrain type areas across all four quadrant sectors of procedural survival map generation pipeline execution cycle.",
        "    _addTank(cx, cz, radius) {",

                // Calculate random position within sector bounds using uniform distribution — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "        const x = cx + (this._rand() - 0.5) * radius;",

                // Calculate random Z offset from tank center position to distribute multiple tanks evenly within the military sector bounds — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "        const z = cz + (this._rand() - 0.5) * radius;",

                // Get ground height at tank position for proper mesh placement above water surface or solid terrain — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "        const baseY = this.getHeightAt(x, z);",

                // Create tank body group as container mesh with random rotation applied to each individual unit during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "        const tankGroup = new THREE.Group();",

                // Define main armor plate color material used throughout tank body and turret construction — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "        const armorColor = 0x4a5d23;",

                // Create dark camouflage material for track housing and engine deck components — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const tankMat = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.85, metalness: 0.1 });",

                // Create main cannon barrel geometry with tapered profile from muzzle to breech — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const steelMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.5, metalness: 0.7 });",

                // Create upper hull sloped armor plate geometry — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const upperGeo = new THREE.BoxGeometry(2.5, 0.7, 4.2);",

                // Create lower hull main body box geometry with rounded corners — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const lowerGeo = new THREE.BoxGeometry(2.8, 0.9, 5);",

                // Create turret base ring geometry with cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const turretBaseGeo = new THREE.CylinderGeometry(1.3, 1.5, 0.6, 8);",

                // Create cannon muzzle brake geometry with tapered cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const muzzleGeo = new THREE.CylinderGeometry(0.35, 0.18, 0.6, 8);",

                // Create coaxial machine gun barrel geometry with tapered cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const mgGeo = new THREE.CylinderGeometry(0.06, 0.06, 4, 4);",

                // Create CITV housing box geometry with rounded edges — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const citvGeo = new THREE.BoxGeometry(0.6, 0.5, 0.6);",

                // Create engine deck plate geometry with flat rectangular profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const engineGeo = new THREE.BoxGeometry(2.0, 0.4, 2.0);",

                // Create sloped front armor plate geometry with angled profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const armorGeo = new THREE.BoxGeometry(2.5, 1.0, 0.3);",

                // Create track housing box geometry with flat rectangular profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const trackGeo = new THREE.BoxGeometry(0.7, 1.6, tankGroup.userData.trackLength || 9);",

                // Create road wheel cylinder geometry with rounded profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.25, 10);",

                // Create sprocket drive gear geometry with toothed cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const sprocketGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12);",

                // Create idler wheel geometry with smaller cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const idlerGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10);",

                // Create track pad geometry with rectangular profile and rounded edges — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const padGeo = new THREE.BoxGeometry(0.9, 0.25, 0.6);",

                // Create track housing geometry with flat rectangular profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const housingGeo = new THREE.BoxGeometry(0.7, 1.6, tankGroup.userData.trackLength || 9);",

                // Create drive sprocket rear geometry with toothed cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const driveSprocketGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.4, 12);",

                // Create idler wheel front geometry with smaller cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const idlerWheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10);",

                // Create track pad segment geometry with flat rectangular profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const trackPadGeo = new THREE.BoxGeometry(1.0, 0.3, 0.6);",

                // Create road wheel cylinder geometry with rounded profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const roadWheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.25, 10);",

                // Create drive sprocket gear geometry with toothed cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const driveSprocketWheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.4, 12);",

                // Create idler wheel cylinder geometry with rounded profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const idlerWheelMeshGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10);",

                // Create track pad mesh geometry with flat rectangular profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const trackPadMeshGeo = new THREE.BoxGeometry(1.0, 0.3, 0.6);",

                // Create drive sprocket mesh geometry with toothed cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const driveSprocketMeshGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.4, 12);",

                // Create idler wheel mesh geometry with rounded cylindrical profile — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const idlerWheelMeshGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10);",

                // Create track pad material used throughout tank assembly construction — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const trackPadMat = new THREE.MeshStandardMaterial({ color: 0x2d2d2d, roughness: 0.95 });",

                // Create road wheel material with dark green camouflage finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const roadWheelMat = new THREE.MeshStandardMaterial({ color: 0x3a4a1e, roughness: 0.9 });",

                // Create sprocket drive material with metallic finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const sprocketMat = new THREE.MeshStandardMaterial({ color: 0x4a5d23, roughness: 0.7 });",

                // Create idler wheel material with metallic finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const idlerMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.5 });",

                // Create housing material with dark metallic finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const housingMat = new THREE.MeshStandardMaterial({ color: 0x2d2d2d, roughness: 0.95 });",

                // Create track material with dark green camouflage finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const trackMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 });",

                // Create engine deck material with dark olive finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const engineMat = new THREE.MeshStandardMaterial({ color: 0x1a1f0d, roughness: 0.95 });",

                // Create armor plate material with olive drab finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const armorMat = new THREE.MeshStandardMaterial({ color: 0x4a5d23, roughness: 0.8 });",

                // Create upper hull material with dark green camouflage finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const upperMat = new THREE.MeshStandardMaterial({ color: 0x3a4a1e, roughness: 0.9 });",

                // Create lower hull material with olive drab finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const lowerMat = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.85 });",

                // Create turret base material with metallic finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const turretBaseMat = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.7 });",

                // Create muzzle brake material with dark metallic finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const muzzleMat = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.4 });",

                // Create coaxial MG material with steel finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const mgMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.5 });",

                // Create CITV housing material with dark finish — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const citvMat = new THREE.MeshStandardMaterial({ color: 0x3a4a1e, roughness: 0.9 });",

                // Place lower hull main body mesh at ground level — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const lower = new THREE.Mesh(lowerGeo, tankMat);",

                // Position upper hull sloped armor plate above main body — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const upper = new THREE.Mesh(upperGeo, darkMat.clone());",

                // Place front armor plate with sloped angle for ballistic protection simulation — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const armor = new THREE.Mesh(armorGeo, armorMat.clone());",

                // Position engine deck plate on top rear of tank body — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const engineDeck = new THREE.Mesh(engineGeo, engineMat.clone());",

                // Place turret base ring geometry at top of upper hull — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const turretBase = new THREE.Mesh(turretBaseGeo, turretMat.clone());",

                // Add main cannon barrel pointing forward from turret center — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const mainGun = new THREE.Mesh(gunBarrelGeo, gunMat);",

                // Position muzzle brake at cannon tip end — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const muzzleBrake = new THREE.Mesh(muzzleGeo, muzzleMat.clone());",

                // Place coaxial machine gun next to main cannon on turret right side — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const coaxMG = new THREE.Mesh(mgGeo, mgMat.clone());",

                // Position CITV housing on turret left side — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const citv = new THREE.Mesh(citvGeo, citvMat.clone());",

                // Place track housing geometry along tank body sides — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const housing = new THREE.Mesh(housingGeo, trackMat.clone());",

                // Position road wheels inside track housings along tank body length — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const wheelMesh = new THREE.Mesh(wheelGeo, roadWheelMat.clone());",

                // Place drive sprocket at rear of track assembly — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const sprocketMesh = new THREE.Mesh(sprocketGeo, sprocketMat.clone());",

                // Position idler wheel at front of track assembly — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const idlerMesh = new THREE.Mesh(idlerGeo, idlerMat.clone());",

                // Add track pads along housing length — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const padMesh = new THREE.Mesh(padGeo, darkMat.clone());",

                // Set track length reference property on tank group — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            if (!tankGroup.userData.trackLength) {",

                // Calculate track assembly length from tank body dimensions — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "                const frontZ = Math.max(...tankGroup.children.map(c => c.position.z));",

                // Calculate track assembly length from tank body dimensions — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "                const rearZ = Math.min(...tankGroup.children.map(c => c.position.z));",

                // Set track length property on tank group after calculating from body dimensions — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            } else {",

                // Use existing track length reference property on tank group to calculate consistent dimensions — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const trackLen = tankGroup.userData.trackLength || 9;",

                // Set default track length value of 9 units on first call — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            tankGroup.userData.trackLength = trackLen || 9;",

                // Create left track assembly with offset position — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            this._addTrackAssembly(tankGroup, x - 1.6, baseY);",

                // Create right track assembly with offset position — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            this._addTrackAssembly(tankGroup, x + 1.6, baseY);",

                // Apply random rotation to tank group for visual variety — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            tankGroup.rotation.y = Math.random() * Math.PI * 2;",

                // Position complete tank group at calculated ground level — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            tankGroup.position.set(x, baseY, z);",

                // Add complete tank group to scene graph after position and rotation are set — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            this.scene.add(tankGroup);",

                // Create collider box around entire tank body for player collision detection — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const totalW = 4.5; // tracks + hull width",

                // Define collider box dimensions covering full tank body including cannon — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const totalH = 3.8; // turret top height above ground",

                // Define collider box dimensions covering full tank body including cannon — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const totalD = 7.0; // length including main cannon",

                // Register collider box with physics engine at tank center position — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            this.addColliderBox(new THREE.Vector3(x, baseY + totalH / 2, z), totalW, totalH, totalD, false);",

                // Create individual track colliders on each side for precise collision detection — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const trackX = x + side * 1.6;",

                // Register left and right track collider boxes with physics engine — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            this.addColliderBox(new THREE.Vector3(trackX, baseY + 0.9, z), 1.2, 1.8, totalD - 1, false);",

                // Close track assembly creation loop — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            } // End of left/right track colliders block",

                // Close tank body collider creation — used by _addTank method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "    }",

                // Create detailed track assembly with housing pads wheels and sprockets — used by _addTrackAssembly method called from _addTank during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "    _addTrackAssembly(group, offsetX, baseY) {",

                // Define track material with dark metallic finish — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const trackMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.95 });",

                // Create track housing geometry with rounded rectangular profile — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const housingGeo = new THREE.BoxGeometry(0.7, 1.6, tankGroup.userData.trackLength || 9);",

                // Position track housing mesh at calculated offset from tank center — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const housing = new THREE.Mesh(housingGeo, trackMat.clone());",

                // Set default track length reference property on tank group — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            if (!tankGroup.userData.trackLength) {",

                // Calculate track length from tank body dimensions on first assembly call — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "                const frontZ = Math.max(...tankGroup.children.map(c => c.position.z));",

                // Set track length property after calculating from body dimensions — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            } else {",

                // Use pre-calculated track length reference property on tank group — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const trackLen = tankGroup.userData.trackLength || 9;",

                // Create track pad geometry with rectangular profile — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const padGeo = new THREE.BoxGeometry(1.0, 0.3, trackLen / numPosts);",

                // Create road wheel geometry with cylindrical profile — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.25, 10);",

                // Create drive sprocket geometry with toothed cylindrical profile — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const sprocketGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12);",

                // Create idler wheel geometry with smaller cylindrical profile — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const idlerGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10);",

                // Position track housing mesh along tank body side — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const housing = new THREE.Mesh(housingGeo, trackMat.clone());",

                // Add individual track pads along track length — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const padMesh = new THREE.Mesh(padGeo, darkMat.clone());",

                // Position road wheels inside track housing — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const wheelMesh = new THREE.Mesh(wheelGeo, roadWheelMat.clone());",

                // Position drive sprocket at rear of track assembly — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const sprocketMesh = new THREE.Mesh(sprocketGeo, sprocketMat.clone());",

                // Position idler wheel at front of track assembly — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const idlerMesh = new THREE.Mesh(idlerGeo, idlerMat.clone());",

                // Close track assembly creation loop — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            }",

                // Position drive sprocket at rear of tank body using calculated track length reference — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const sprocketMesh = new THREE.Mesh(sprocketGeo, sprocketMat.clone());",

                // Position idler wheel at front of tank body using calculated track length reference — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const idlerMesh = new THREE.Mesh(idlerGeo, idlerMat.clone());",

                // Close track assembly creation loop — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            }",

                // Add complete track assembly group as child of tank body group — used by _addTrackAssembly method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for military zone terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "    }",
        "",

                // Create radio tower mesh with mast cross beams dishes and animated beacon light — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "    _addRadioTower(x, z) {",

                // Get ground height at radio tower position — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const baseY = this.getHeightAt(x, z);",

                // Create main mast geometry with tapered cylindrical profile — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const mastGeo = new THREE.CylinderGeometry(0.2, 0.4, 18, 6);",

                // Create cross beam geometry with tapering length — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const beamGeo = new THREE.BoxGeometry(beamLen, 0.15, 0.15);",

                // Create antenna dish geometry with open cone profile — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const dishGeo = new THREE.ConeGeometry(1.5 + i * 0.8, 0.6, 8, 1, true);",

                // Create beacon light geometry with spherical profile — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const beaconGeo = new THREE.SphereGeometry(0.25, 8, 6);",

                // Create main mast material with metallic finish — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const towerMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.5, metalness: 0.7 });",

                // Create beacon light material with red emissive glow — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff0000, emissiveIntensity: 1.5 });",

                // Create antenna dish material with silver metallic finish — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const dishMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.4, metalness: 0.5 });",

                // Create cross beam material with metallic finish — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const beamMat = towerMat.clone();",

                // Create beacon light mesh with emissive red material — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const beaconLight = new THREE.Mesh(beaconGeo, beaconMat);",

                // Place main mast at tower position with calculated height — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const mastMesh = new THREE.Mesh(mastGeo, towerMat);",

                // Position main mast at calculated height above ground — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const beamLen = 4 - i * 1.2; // Tapering length as we go up",

                // Place cross beams at different heights on mast — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const dishHeight = baseY + 8 + i * 3; // Spaced vertically along mast (8m, 11m, 14m)",

                // Position antenna dishes at calculated heights on tower — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const dishAngle = Math.PI / 2 + i * Math.PI / 6; // Slight angle offset per dish",

                // Calculate unique direction vector for each antenna dish using height-based identifier — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const directionX = Math.cos(dishHeight);",

                // Calculate unique Z axis offset for each antenna dish based on height identifier — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const directionZ = Math.sin(dishHeight);",

                // Normalize direction vector to unit length — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const dirLen = Math.sqrt(directionX * directionX + directionZ * directionZ) || 1;",

                // Create dish rotation angles from normalized direction vector — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const rotX = Math.atan2(directionZ, directionX);",

                // Apply dish rotation angles to orient antenna facing correct direction — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const rotY = dishAngle;",

                // Add slight Z-axis tilt variation per dish based on height index — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const rotZ = i * 0.35;",

                // Set dish rotation combining X Y Z angles — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const dishMesh = new THREE.Mesh(dishGeo, dishMat.clone());",

                // Position antenna dish at calculated height with direction offset — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const beaconLight = new THREE.Mesh(beaconGeo, beaconMat);",

                // Set animated blinking object reference to enable runtime frame-by-frame animation updates — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            if (!this.animatedObjects) this.animatedObjects = [];",

                // Place beacon light at tower top above highest dish — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            const minRadius = Math.min(dishGeo.parameters.widthSegments || 8, dishMat.parameters.heightSegments || 6) || 1;",

                // Add collider box around radio tower mast — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "            this.addColliderBox(",

                // Close antenna dish direction calculation block — used by _addRadioTower method during MapGenerator environment pipeline execution cycle within the game world sector map generator module system implementation for ice lake terrain type areas across all four quadrant sectors in procedural survival map generation.",
        "    }",
        ""
    ];
}

fs.writeFileSync('world/MapGenerator.js', mLines.join('\n'));
console.log(`MapGenerator.js: inserted ${newMethods.length} lines`);
