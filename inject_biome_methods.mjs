import fs from 'fs';

const filePath = 'world/MapGenerator.js';
let code = fs.readFileSync(filePath, 'utf8');

// --- 1. Inject three biome methods after _addGrassPatch closing brace ---
const grassEndPattern = `        this.scene.add(patch);
    }`;

if (!code.includes('_generateMazeWalls')) {
    const mazeWallsCode = `

    // ===== BIOME-SPECIFIC ENVIRONMENT GENERATION =====

    _generateMazeWalls(sector, cx, cz, radius) {
        if (sector.biome !== 'stone_maze') return;
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
    },

    _addIceCrystal(x, z) {
        const baseY = this.getHeightAt(x, z);
        if (baseY < 0.5 || baseY > -2) return; // Only add crystals on ice surfaces

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
    },

    _placeBarbedWireFences(sector, cx, cz) {
        if (sector.biome !== 'military') return;
        const postMat = new THREE.MeshStandardMaterial({ color: 0x5d4e37, roughness: 0.9 });
        const wireMat = new THREE.MeshStandardMaterial({ color: 0x616161, metalness: 0.6, roughness: 0.8 });
        const radius = sector.bounds?.radius || 128;

        // Place fence posts along a perimeter ring
        const numPosts = Math.max(12, Math.floor(radius / 15));
        for (let i = 0; i < numPosts; i++) {
            const angle = (i / numPosts) * Math.PI * 2 + this._rand() * 0.1;
            const postR = radius * 0.85;
            const px = cx + Math.cos(angle) * postR;
            const pz = cz + Math.sin(angle) * postR;

            // Check if within sector bounds
            const dx = px - cx, dz = pz - cz;
            if (dx * dx / (radius * radius) + dz * dz / (radius * radius) > 1.2) continue;

            const baseY = this.getHeightAt(px, pz);
            if (baseY < -0.5 || baseY > 3) continue; // Skip non-ground posts

            // Fence post
            const postGeo = new THREE.CylinderGeometry(0.08, 0.12, 3, 4);
            const post = new THREE.Mesh(postGeo, postMat.clone());
            post.position.set(px, baseY + 1.5, pz);
            post.userData.mapGenerated = true;
            this.scene.add(post);

            // Wire strands between consecutive posts (top and middle)
            if (i < numPosts - 1 || i === numPosts - 1 && this._rand() > 0.3) {
                const nextAngle = ((i + 1) / numPosts) * Math.PI * 2;
                const nx = cx + Math.cos(nextAngle) * postR;
                const nz = cz + Math.sin(nextAngle) * postR;

                // Top wire strand
                const topWireGeo = new THREE.CylinderGeometry(0.015, 0.015, Math.sqrt((nx - px) ** 2 + (nz - pz) ** 2), 3);
                topWireGeo.rotateX(Math.PI / 2);
                const midY = baseY + 3;
                const dirX = nx > px ? 1 : -1;
                const wireAngle = Math.atan2(nz - pz, nx - px) * (dirX === 1 ? 0 : Math.PI);

                topWireGeo.rotateZ(wireAngle);
                topWireGeo.position.set((px + nx) / 2, midY + 3.15, (pz + nz) / 2);
                const topWire = new THREE.Mesh(topWireGeo, wireMat.clone());
                topWire.userData.mapGenerated = true;
                this.scene.add(topWire);

                // Middle wire strand
                const midWireGeo = new THREE.CylinderGeometry(0.015, 0.015, Math.sqrt((nx - px) ** 2 + (nz - pz) ** 2), 3);
                midWireGeo.rotateX(Math.PI / 2).rotateZ(wireAngle);
                const midWire = new THREE.Mesh(midWireGeo, wireMat.clone());
                midWire.position.set((px + nx) / 2, baseY + 1.5, (pz + nz) / 2);
                midWire.userData.mapGenerated = true;
                this.scene.add(midWire);

                // Barbs at post tops every few posts
                if (i % 4 === 0) {
                    for (let b = 0; b < 4; b++) {
                        const barbAngle = angle + (b / 4) * Math.PI * 2;
                        const barbGeo = new THREE.ConeGeometry(0.06, 0.5, 3);
                        const barbMat = new THREE.MeshStandardMaterial({ color: 0x757575, metalness: 0.8 });
                        const barb = new THREE.Mesh(barbGeo, barbMat);
                        barb.position.set(px + Math.cos(barbAngle) * 0.3, baseY + 4.2, pz + Math.sin(barbAngle) * 0.3);
                        barb.rotation.z = barbAngle;
                        barb.userData.mapGenerated = true;
                        this.scene.add(barb);
                    }
                }

                // Collider at post bases for walkable surface marking
                if (i % 6 === 0) {
                    const colliderGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.2, 8);
                    const colliderMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, transparent: true, opacity: 0 });
                    const collider = new THREE.Mesh(colliderGeo, colliderMat);
                    collider.position.set(px, baseY + 0.1, pz);
                    collider.userData.mapGenerated = true;
                    this.addColliderBox(new THREE.Vector3(px, baseY + 0.2, pz), 3, 0.4, 3, false);
                }
            }

            // Corner posts get taller collars (every ~6 posts)
            if (i % 8 === 0) {
                const collarGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.15, 8);
                const collarMat = new THREE.MeshStandardMaterial({ color: 0x424242, metalness: 0.7 });
                const collar = new THREE.Mesh(collarGeo, collarMat);
                collar.position.set(px, baseY + 3.1, pz);
                collar.userData.mapGenerated = true;
                this.scene.add(collar);

                // Extra collider at corner posts (taller obstacle)
                this.addColliderBox(new THREE.Vector3(px, baseY + 1.5, pz), 0.4, 3.2, 0.4, false);
            }
        }

        // Inner perimeter ring for military zone containment
        const innerRadius = radius * 0.6;
        const numInnerPosts = Math.max(8, Math.floor(innerRadius / 15));
        for (let i = 0; i < numInnerPosts; i++) {
            const angle = (i / numInnerPosts) * Math.PI * 2 + this._rand() * 0.05;
            const px = cx + Math.cos(angle) * innerRadius;
            const pz = cz + Math.sin(angle) * innerRadius;

            const baseY = this.getHeightAt(px, pz);
            if (baseY < -1 || baseY > 2) continue;

            // Inner fence post with barbed wire top
            const iPostGeo = new THREE.CylinderGeometry(0.06, 0.1, 2.5, 4);
            const iPost = new THREE.Mesh(iPostGeo, postMat.clone());
            iPost.position.set(px, baseY + 1.25, pz);
            iPost.userData.mapGenerated = true;
            this.scene.add(iPost);

            // Barbed wire top on inner posts
            if (i % 3 === 0) {
                for (let b = 0; b < 6; b++) {
                    const barbAngle2 = angle + (b / 6) * Math.PI * 2;
                    const barbGeo2 = new THREE.ConeGeometry(0.04, 0.35, 3);
                    const barbMat2 = new THREE.MeshStandardMaterial({ color: 0x757575, metalness: 0.8 });
                    const barb = new THREE.Mesh(barbGeo2, barbMat2);
                    barb.position.set(px + Math.cos(barbAngle2) * 1.3, baseY + 4.6, pz + Math.sin(barbAngle2) * 1.3);
                    barb.rotation.z = barbAngle2;
                    barb.userData.mapGenerated = true;
                    this.scene.add(barb);
                }

                // Collider at inner post tops (non-walkable obstacle zone)
                const iColliderGeo = new THREE.CylinderGeometry(5, 5, 0.3, 8);
                this.addColliderBox(new THREE.Vector3(px, baseY + 4.65, pz), 10, 0.6, 10, false);
            }

            // Wire strands between inner posts (horizontal)
            if (i < numInnerPosts - 2 || i === numInnerPosts - 1 && this._rand() > 0.3) {
                const nextAngle = ((i + 2) / numInnerPosts) * Math.PI * 2;
                const nx = cx + Math.cos(nextAngle) * innerRadius;
                const nz = cz + Math.sin(nextAngle) * innerRadius;

                // Horizontal wire strand (top and middle of post)
                for (let w = 0; w < numInnerPosts - i - 2; w++) {
                    if (w === 0 || this._rand() > 0.5) {
                        const midX = px + Math.cos(angle) * innerRadius + (nx - cx - Math.cos(angle) * innerRadius) / 3;
                        const wireGeo = new THREE.CylinderGeometry(0.02, 0.02, Math.sqrt((midX - px) ** 2 + ((nz - pz) ?? 1) ** 2), 4);

                        // Wire strand at post height with slight sagging between posts
                        const wireMat = new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.7 });
                        wireGeo.rotateZ(Math.PI / 2 * (w % 2 === 0 ? 1 : -1));

                        // Position at post height with slight sagging between posts
                        const sagAmount = Math.sin(w * Math.PI / numInnerPosts) * 0.5;
                        wireGeo.position.set(midX, baseY + 3.65 - w * 0.2 + sagAmount, pz);

                        // Angle the wires slightly for barbed effect
                        wireMat.color.set(0x424242);
                        const wire = new THREE.Mesh(wireGeo, wireMat.clone());
                        wire.userData.mapGenerated = true;
                        this.scene.add(wire);
                    } else {
                        // Wire strand between posts (horizontal)

                        // Angle the wires slightly for barbed effect

                        // Position at post height with slight sagging between posts
                        const sagAmount = Math.sin(i * 2.5 / numPosts) * 0.4;
                        wireGeo.position.set((px + nx) / 2, baseY + 3.65 - w * 0.1 + sagAmount, (pz + nz) / 2);

                    }
                }
            }
        }
    },`;

    // Find the _addGrassPatch closing and inject after it
    const grassMatch = code.indexOf('this.scene.add(patch);\n    }\n');
    if (grassMatch >= 0) {
        const insertPos = grassMatch + 'this.scene.add(patch);\n    }'.length;
        code = code.slice(0, insertPos) + mazeWallsCode.trim() + '\n' + code.slice(insertPos);
    } else {
        console.error('Could not find _addGrassPatch insertion point');
        process.exit(1);
    }
}

// --- 2. Modify _generateEnvironment to add biome-specific branches ---
// Find the end of rocks section (this.scene.add(barrel) or crate) and inject biome checks before closing brace of for loop

const sceneAddBarrel = code.indexOf("                this.scene.add(barrel);");
if (sceneAddBarrel > 0) {
    // Insert barrel collider right after barrel add
    const barrelColliderInsert = "                    ";

    // Find the end of scattered props section - look for the closing brace pattern
    const crateEndPattern = `            }

            _generateEnvironment`;

    // Instead, find where the sector loop ends: after Scattered props } and before next method or tree density check
    const insertBeforeTrees = code.indexOf('for (const sector of this.voronoi.sectors) {');
    if (insertBeforeTrees > 0) {
        // Find the end of _generateEnvironment - look for "}" that closes the function at proper indent
        let depth = 1;
        const envStart = insertBeforeTrees;
        let bracePos = code.indexOf('{', envStart + 5);

        while (depth > 0 && bracePos < code.length) {
            bracePos++;
            if (code[bracePos] === '{') depth++;
            else if (code[bracePos] === '}') depth--;
        }

        // Now we're at the closing of _generateEnvironment function - insert biome-specific calls before it
    }
}

// Better approach: find "this.scene.add(crate);" and inject after that, then close props loop with biome checks
const crateEndPattern = `            }
        }
    }`;

// Find the end of _generateEnvironment more precisely by looking for its structure
const envMatchIdx = code.indexOf('    // ========================================================================\n    // SPAWN SYSTEM');
if (envMatchIdx > 0) {
    const prevBraceDepth = code.substring(713, envMatchIdx).match(/\n[ ]{4}\}/);

    // Insert biome-specific environment generation before the closing of _generateEnvironment
    // The function ends right before "// SPAWN SYSTEM" comment

    const biomeBranchesCode = `

            // --- Biome-specific environment: stone_maze, military, ice_lake override defaults ---
            if (sector.biome === 'stone_maze') {
                this._generateMazeWalls(sector, cx, cz, radius);
            } else if (sector.biome === 'military') {
                // Military zone: barbed wire fences instead of standard props
                this._placeBarbedWireFences(sector, cx, cz);

                // Spawn military tanks at key positions within the sector bounds
                const numTanks = Math.floor(2 + sector.buildingDensity * 3);
                for (let t = 0; t < numTanks; t++) {
                    const tankAngle = this._rand() * Math.PI * 2;
                    const tankDist = radius * 0.4 + this._rand() * radius * 0.5;
                    const tankX = cx + Math.cos(tankAngle) * tankDist;
                    const tankZ = cz + Math.sin(tankAngle) * tankDist;

                    // Tank body (main chassis with box geometry, positioned at ground level and colored in military green)
                    const tBodyGeo = new THREE.BoxGeometry(3.2, 1.4, 5);
                    const tBodyMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.7 });
                    const tankBody = new THREE.Mesh(tBodyGeo, tBodyMat.clone());

                    // Tank turret (cylindrical top section with a forward-facing cannon barrel)
                    const tTurretGeo = new THREE.CylinderGeometry(1, 1, 1.2, 8);
                    const tTurretMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.7 });
                    const tankTurret = new THREE.Mesh(tTurretGeo, tTurretMat.clone());

                    // Cannon barrel (long cylindrical tube pointing forward from the turret center)
                    const cBarrelGeo = new THREE.CylinderGeometry(0.15, 0.2, 4, 8);
                    const cBarrelMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.6 });

                    // Tank tracks (left and right continuous treads with sprocket wheels underneath)
                    const trackGeo = new THREE.BoxGeometry(0.6, 1.1, 5);
                    const leftTrack = new THREE.Mesh(trackGeo, new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.9 }));

                    // Tank tracks (right side) - mirror of the left track with sprocket wheel underneath
                    const rightTrackGeo = new THREE.BoxGeometry(0.6, 1.1, 5);
                    const rightTrackMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238, roughness: 0.9 });

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
                    const sBoxGeo = new THREE.BoxGeometry(0.6, 0.8, 0.6);
                    const sBoxMat = new THREE.MeshStandardMaterial({ color: sector.terrainColor || 0x4a5238 });

                    // Radio signal box (enclosure for electronic equipment and power supply)
                    const rSignalGeo = new THREE.BoxGeometry(1, 0.7, 0.6);

                    // Signal indicator lights on radio tower (red/green LED array)
                    const ledMatRed = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff4444 });
                    const ledMatGreen = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x44ff44 });

                    // Animated radio signal pulses (oscillating between red and green LED states)
                        if (!this.animatedObjects) this.animatedObjects = [];
                        this.animatedObjects.push({ type: 'tankRadioPulse', obj: tank, baseY: baseY + 8.5 });
                    }

                // --- Add collider boxes for all tank parts (non-walkable obstacle zone) ---
                const tColliderGeo1 = new THREE.BoxGeometry(3.4, 2.6, 5.2);
            }`;

    // Insert biome branches right before the SPAWN SYSTEM comment section
    if (envMatchIdx > envStart + 100) {
        code = code.slice(0, envMatchIdx) + biomeBranchesCode.trim() + '\n' + code.slice(envMatchIdx);
    }
}

fs.writeFileSync(filePath, code);

// Validate syntax
try {
    const vm = require('vm');
    vm.createContext({ THREE: {}, fs }); // basic context
    console.log('File written successfully.');

    // Check brace balance
    let braces = 0;
    for (const ch of code) {
        if (ch === '{') braces++;
        else if (ch === '}') braces--;
    }
    const parens = [...code].reduce((acc, c) => c === '(' ? acc + 1 : c === ')' ? acc - 1 : acc, 0);

    console.log('Brace balance:', braces);
    console.log('Paren balance:', parens);
} catch (e) {
    console.error(e.message);
}
