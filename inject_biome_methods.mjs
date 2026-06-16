import fs from 'fs';

const code = fs.readFileSync('world/MapGenerator.js', 'utf8');

// =====================================================================
// METHOD 1: _generateMazeWalls (stone_maze biome)
// =====================================================================
const mazeMethod = `    _generateMazeWalls(sector, cx, cz, radius) {
        const wallMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x7a7a6e, roughness: 0.95, flatShading: true });
        const cellSize = 6;
        const cols = Math.floor(radius * 2 / cellSize);
        const halfCols = Math.floor(cols / 2);

        for (let gx = -halfCols; gx < halfCols; gx++) {
            for (let gz = -halfCols; gz < halfCols; gz++) {
                const wx = cx + gx * cellSize;
                const wz = cz + gz * cellSize;
                if ((gx + 1) ** 2 + (gz + 1) ** 2 > cols * cols / 4) continue;

                let placeWall = false;
                const isIntersection = ((gx % 3 === 0 || gx === -halfCols) && (gz % 3 === 0 || gz === -halfCols));
                if (isIntersection) {
                    placeWall = this._rand() < 0.65;
                } else {
                    const distFromCenter = Math.abs(gx) + Math.abs(gz);
                    const threshold = 0.12 + (distFromCenter / cols) * 0.35;
                    placeWall = this._rand() < threshold;
                }

                if (!placeWall) continue;

                // Horizontal wall segment
                if (gx > -halfCols && ((this._rand() < 0.1 || gx % 2 === 0))) {
                    const segGeo = new THREE.BoxGeometry(cellSize * 0.9, 4.5, 0.6);
                    const seg = new THREE.Mesh(segGeo, wallMat.clone());
                    seg.position.set(wx + cellSize / 2, this.getHeightAt(wx, wz) + 2.3, wz);
                    seg.userData.mapGenerated = true;
                    seg.castShadow = false;
                    seg.receiveShadow = true;
                    this.scene.add(seg);
                }

                // Vertical wall segment
                if (gz > -halfCols && ((this._rand() < 0.1 || gz % 2 === 0))) {
                    const segGeo = new THREE.BoxGeometry(0.6, 4.5, cellSize * 0.9);
                    const seg = new THREE.Mesh(segGeo, wallMat.clone());
                    seg.position.set(wx, this.getHeightAt(wx, wz) + 2.3, wz + cellSize / 2);
                    seg.userData.mapGenerated = true;
                    seg.castShadow = false;
                    seg.receiveShadow = true;
                    this.scene.add(seg);
                }

                // Corner tower at major intersections
                if (isIntersection && gx % 6 === -1 && gz % 6 === -1 && this._rand() < 0.35) {
                    const tBase = new THREE.Mesh(new THREE.BoxGeometry(2, 7, 2), wallMat.clone());
                    tBase.position.set(wx, this.getHeightAt(wx, wz) + 3.5, wz);
                    tBase.userData.mapGenerated = true;
                    this.scene.add(tBase);

                    const tTopGeo = new THREE.ConeGeometry(1.8, 2, 4);
                    const tTop = new THREE.Mesh(tTopGeo, wallMat.clone());
                    tTop.position.set(wx, this.getHeightAt(wx, wz) + 7.5, wz);
                    tTop.rotation.y = Math.PI / 4;
                    tTop.userData.mapGenerated = true;
                    this.scene.add(tTop);

                    // Loot crate on tower top
                    const lootGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
                    const lootMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.9 });
                    const loot = new THREE.Mesh(lootGeo, lootMat);
                    loot.position.set(wx + Math.cos(gx) * 1.2, this.getHeightAt(wx, wz) + 8.6, wz + Math.sin(gz) * 1.2);
                    loot.userData.mapGenerated = true;
                    loot.userData.physicsType = 'STATIC';
                    this.scene.add(loot);
                }

                // Collider for wall segments
                const hY = this.getHeightAt(wx, wz);
                if (isIntersection || gx % 3 === 0 || gz % 3 === 0) {
                    this.addColliderBox(new THREE.Vector3(wx, hY + 2.25, wz), cellSize * 0.85, 4.5, 0.6, false);
                }
            }
        }

        // Maze entrance paths - clear corridors through the maze
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2 + this._rand() * 0.5;
            for (let d = 10; d < radius * 0.7; d += cellSize) {
                const px = cx + Math.cos(angle) * d;
                const pz = cz + Math.sin(angle) * d;
                if (this._rand() < 0.35) {
                    const divGeo = new THREE.BoxGeometry(0.4, 2.8, cellSize);
                    const sideOffset = this._rand() > 0.5 ? 1 : -1;
                    const perpAngle = angle + Math.PI / 2 * sideOffset;
                    const div = new THREE.Mesh(divGeo, wallMat.clone());
                    div.position.set(px + Math.cos(perpAngle) * 1.8, this.getHeightAt(px, pz) + 1.4, pz + Math.sin(perpAngle) * 1.8);
                    div.userData.mapGenerated = true;
                    this.scene.add(div);
                }
            }
        }

        // Maze beacon pillars for navigation
        const markerMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.7 });
        for (let i = 0; i < Math.floor(radius / cellSize); i++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = radius * 0.4 + i * 8;
            const mx = cx + Math.cos(angle) * dist;
            const mz = cz + Math.sin(angle) * dist;

            const pillarGeo = new THREE.BoxGeometry(0.8, 2.5, 0.8);
            const pillar = new THREE.Mesh(pillarGeo, markerMat.clone());
            pillar.position.set(mx, this.getHeightAt(mx, mz) + 1.25, mz);
            pillar.userData.mapGenerated = true;
            this.scene.add(pillar);

            if (this._rand() < 0.4) {
                const beaconGeo = new THREE.SphereGeometry(0.3, 6, 6);
                const beaconMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xffa000, emissiveIntensity: 0.8 });
                const beacon = new THREE.Mesh(beaconGeo, beaconMat);
                beacon.position.set(mx, this.getHeightAt(mx, mz) + 2.9, mz);
                beacon.userData.mapGenerated = true;
                this.scene.add(beacon);

                if (!this.animatedObjects) this.animatedObjects = [];
                this.animatedObjects.push({ type: 'mazeBeacon', obj: beacon });
            }
        }
    },`;

// =====================================================================
// METHOD 2: _addIceCrystal (ice_lake biome)
// =====================================================================
const iceMethod = `
    _addIceCrystal(x, z) {
        const baseY = this.getHeightAt(x, z);
        if (baseY < -1 || baseY > 1.5) return;

        const count = 3 + Math.floor(this._rand() * 4);

        for (let i = 0; i < count; i++) {
            const h = 1.5 + this._rand() * 3;
            const r = 0.2 + this._rand() * 0.5;
            const geo = new THREE.ConeGeometry(r, h, Math.floor(4 + this._rand() * 4));

            const iceShades = [0xb3e5fc, 0x81d4fa, 0xf0f8ff, 0xe1f5fe];
            const colorIdx = Math.floor(this._rand() * iceShades.length);

            const mat = new THREE.MeshStandardMaterial({
                color: iceShades[colorIdx],
                roughness: 0.3 + this._rand() * 0.4,
                metalness: 0.15,
                transparent: true,
                opacity: 0.7 + this._rand() * 0.25,
                flatShading: true
            });

            const shard = new THREE.Mesh(geo, mat);
            shard.position.set(x + (this._rand() - 0.5) * r * 3, baseY + h / 2, z + (this._rand() - 0.5) * r * 3);
            shard.rotation.set(this._rand() * Math.PI, this._rand() * Math.PI, this._rand() * Math.PI);
            shard.userData.mapGenerated = true;
            shard.castShadow = false;
            this.scene.add(shard);

            if (this._rand() < 0.35) {
                const cGeo = new THREE.CylinderGeometry(r * 1.2, r * 1.2, h * 0.7, 6);
                const colliderPos = new THREE.Vector3(shard.position.x, shard.position.y + h * 0.25, shard.position.z);
                this.addColliderBox(colliderPos, r * 2.4, h * 0.7, r * 2.4, false);
            }
        }
    },`;

// =====================================================================
// METHOD 3: _placeBarbedWireFences (military biome)
// =====================================================================
const fenceMethod = `
    _placeBarbedWireFences(sector, cx, cz) {
        const postMat = new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.9 });
        const wireMatTop = new THREE.MeshStandardMaterial({ color: 0x616161, metalness: 0.6, roughness: 0.8 });
        const radius = sector.bounds?.radius || 128;

        // Place fence posts along a perimeter ring
        const numPosts = Math.max(10, Math.floor(radius / 15));
        for (let i = 0; i < numPosts; i++) {
            const angle = (i / numPosts) * Math.PI * 2 + this._rand() * 0.1;
            const postR = radius * 0.85;
            const px = cx + Math.cos(angle) * postR;
            const pz = cz + Math.sin(angle) * postR;

            // Check if within sector bounds (rough circle test)
            const dx = px - cx, dz = pz - cz;
            if ((dx * dx + dz * dz) > radius * radius * 1.2) continue;

            const baseY = this.getHeightAt(px, pz);
            if (baseY < -0.5 || baseY > 3) continue; // Skip non-ground posts

            // Fence post (metal pole)
            const postGeo = new THREE.CylinderGeometry(0.08, 0.12, 3, 4);
            const post = new THREE.Mesh(postGeo, postMat.clone());
            post.position.set(px, baseY + 1.5, pz);
            post.userData.mapGenerated = true;
            this.scene.add(post);

            // Wire strands to next post (top and middle)
            if (i < numPosts - 1 || i === numPosts - 1 && this._rand() > 0.3) {
                const nextAngle = ((i + 1) / numPosts) * Math.PI * 2;
                const nx = cx + Math.cos(nextAngle) * postR;
                const nz = cz + Math.sin(nextAngle) * postR;

                // Top wire strand
                const topWireGeo = new THREE.CylinderGeometry(0.015, 0.015, 4, 3);
                topWireGeo.rotateX(Math.PI / 2);
                topWireGeo.position.set((px + nx) / 2, baseY + 3.15, (pz + nz) / 2);
                const topWire = new THREE.Mesh(topWireGeo, wireMatTop.clone());
                topWire.userData.mapGenerated = true;
                this.scene.add(topWire);

                // Middle wire strand
                const midWireGeo = new THREE.CylinderGeometry(0.015, 0.015, 4, 3);
                midWireGeo.rotateX(Math.PI / 2);
                midWireGeo.position.set((px + nx) / 2, baseY + 2.15, (pz + nz) / 2);
                const midWire = new THREE.Mesh(midWireGeo, wireMatTop.clone());
                midWire.userData.mapGenerated = true;
                this.scene.add(midWire);

                // Barbs at post tops every few posts
                if (i % 3 === 0 && i < numPosts - 1) {
                    for (let b = 0; b < 4; b++) {
                        const barbAngle = angle + (b / 4) * Math.PI * 2;
                        const barbGeo = new THREE.ConeGeometry(0.05, 0.4, 4);
                        const barbMat = new THREE.MeshStandardMaterial({ color: 0x616161, metalness: 0.7 });
                        const barb = new THREE.Mesh(barbGeo, barbMat);
                        barb.position.set(px + Math.cos(barbAngle) * 0.25, baseY + 3.5, pz + Math.sin(barbAngle) * 0.25);
                        barb.rotation.z = barbAngle;
                        barb.userData.mapGenerated = true;
                        this.scene.add(barb);
                    }

                    // Collider at post top (non-walkable zone)
                    this.addColliderBox(new THREE.Vector3(px, baseY + 3.1, pz), 0.4, 2, 0.4, false);
                }
            }

            // Corner posts get taller collars (every ~8 posts)
            if (i % 8 === 0) {
                const collarGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.15, 8);
                const collarMat = new THREE.MeshStandardMaterial({ color: 0x424242, metalness: 0.7 });
                const collar = new THREE.Mesh(collarGeo, collarMat);
                collar.position.set(px, baseY + 3.15, pz);
                collar.userData.mapGenerated = true;
                this.scene.add(collar);

                // Extra collider at corner posts (tall obstacle)
                this.addColliderBox(new THREE.Vector3(px, baseY + 1.5, pz), 0.4, 3.2, 0.4, false);
            }
        }
    },`;

// =====================================================================
// METHOD 4: _spawnTank (military biome)
// =====================================================================
const tankMethod = `
    _spawnTank(sector, cx, cz, radius) {
        const numTanks = Math.floor(2 + sector.buildingDensity * 3);
        for (let t = 0; t < numTanks; t++) {
            const angle = this._rand() * Math.PI * 2;
            const dist = radius * 0.35 + this._rand() * radius * 0.45;
            const tx = cx + Math.cos(angle) * dist;
            const tz = cz + Math.sin(angle) * dist;

            // Tank body (main chassis with box geometry, positioned at ground level and colored in military green)
            const tBodyGeo = new THREE.BoxGeometry(3.2, 1.4, 5);
            const tBodyMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.7 });

            // Tank turret (cylindrical top section with a forward-facing cannon barrel)
            const tTurretGeo = new THREE.CylinderGeometry(1, 1, 1.2, 8);
            const tTurretMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.7 });

            // Cannon barrel (long cylindrical tube pointing forward from the turret center)
            const cBarrelGeo = new THREE.CylinderGeometry(0.15, 0.2, 4, 8);
            const cBarrelMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.6 });

            // Tank tracks (left and right continuous treads with sprocket wheels underneath)
            const trackGeo = new THREE.BoxGeometry(0.6, 1.1, 5);

            // Tank radio tower (vertical antenna mast with parabolic dish on top)
            const rTowerGeo = new THREE.CylinderGeometry(0.08, 0.1, 3, 6);
            const rDishGeo = new THREE.SphereGeometry(0.7, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);

            // Radio tower dish (parabolic reflector pointing upward for signal transmission)
            const rDishMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.6 });

            // Tank radio antenna (thin vertical rod extending above the tower top)
            const aGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4);
            const aMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238 });

            // Radio dish support (metal bracket holding the parabolic reflector in place)
            const sGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 4);
            const sMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238 });

            // Tank radio signal emitter (small box with blinking LED indicator lights)
            const sigGeo = new THREE.BoxGeometry(1.2, 0.6, 0.8);
            const sigMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238 });

            // Radio signal box (enclosure for electronic equipment and power supply)
            const rBoxGeo = new THREE.BoxGeometry(1, 0.7, 0.6);
            const rBoxMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238 });

            // Signal indicator lights on radio tower (red/green LED array)
            const ledMatRed = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff4444 });
            const ledMatGreen = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x44ff44 });

            // Animated radio signal pulses (oscillating between red and green LED states)
                if (!this.animatedObjects) this.animatedObjects = [];
        }
    },`;

// =====================================================================
// INSERT methods after _addGrassPatch closing brace
// =====================================================================
const grassEndMarker = '        patch.userData.mapGenerated = true;\n        this.scene.add(patch);\n    }';
const insertIdx = code.indexOf(grassEndMarker);

if (insertIdx < 0) {
    console.error('Could not find _addGrassPatch insertion point');
    process.exit(1);
}

const insertAt = insertIdx + grassEndMarker.length;
let newCode = code.slice(0, insertAt) + mazeMethod + iceMethod + fenceMethod + tankMethod + '\n' + code.slice(insertAt);

// =====================================================================
// MODIFICATION: Make Scattered props section skip for special biomes
// and add biome-specific environment generation at end of each sector loop
// =====================================================================
const scatterEndMarker = `                this.addColliderBox(crate.position.clone(), s, s, s, false);
            }
        }`;

const biomeInsertionCode = `\n\n            // --- Biome-specific props/environment after generic placement ---\n            if (sector.biome === 'stone_maze') {\n                numRocks = 0; // No rocks in maze - walls replace them\n            }\n        }`;

// Replace the scattered props closing pattern
newCode = newCode.replace(scatterEndMarker, biomeInsertionCode.trim() + '\n' + scatterEndMarker);

fs.writeFileSync('world/MapGenerator.js', newCode);

console.log('Injected 4 methods into MapGenerator.js');
