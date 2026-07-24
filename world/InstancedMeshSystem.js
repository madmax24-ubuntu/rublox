import * as THREE from "three";
import { MeshPool } from "./MeshPool.js";

export class InstancedMeshSystem {
    constructor(pool) {
        this.pool = pool || new MeshPool();
        this._tmpMatrix = new THREE.Matrix4();
        this._tmpVec = new THREE.Vector3();
        this._lastCullPos = new THREE.Vector3(0, 0, 0);
        this._grouped = new Map();
        this._instancedMeshes = [];
    }

    optimize(scene, minCount = 2) {
        this._grouped.clear();
        this._instancedMeshes = [];

        const candidates = [];
        const skipReasons = { noMapGen: 0, culled: 0, aniInt: 0, noGeoKey: 0, noMatKey: 0 };

        for (const child of scene.children) {
            if (!child.userData?.mapGenerated && !child.userData?.instancable) continue;
            this._collectMeshes(child, candidates, skipReasons, true);
        }
        console.log(`[InstancedMesh] Collected ${candidates.length} candidate meshes`);
        console.log(`[InstancedMesh] Skipped: noMapGen=${skipReasons.noMapGen}, culled=${skipReasons.culled}, aniInt=${skipReasons.aniInt}, noGeoKey=${skipReasons.noGeoKey}, matKey=${skipReasons.noMatKey}`);

        let skipped = 0;
        for (const mesh of candidates) {
            const geoKey = this.pool.geoKey(mesh.geometry) || `uuid:${mesh.geometry.uuid}`;
            if (!geoKey) { skipped++; continue; }
            const matKey = this.pool.matKey(mesh.material) || (Array.isArray(mesh.material) ? null : `uuid:${mesh.material.uuid}`);
            if (!matKey) { skipped++; continue; }

            const semanticKey = mesh.userData?.isCornucopia ? 'cornucopia' : mesh.userData?.isWall ? 'wall' : (mesh.userData?.walkable ? 'walkable' : 'visual');
            const groupKey = `${geoKey}__${matKey}__${semanticKey}`;
            if (!this._grouped.has(groupKey)) {
                this._grouped.set(groupKey, { geoKey, matKey, entries: [] });
            }
            this._grouped.get(groupKey).entries.push(mesh);
        }

        let replaced = 0;
        const instancedMeshes = [];
        let skippedTooFew = 0;

        for (const [key, group] of this._grouped) {
            if (group.entries.length < minCount) { skippedTooFew++; continue; }

            const { geoKey, matKey, entries } = group;
            let geo = entries[0].geometry.clone();
            let mat = this._cloneMaterial(entries[0].material);

            // Check if ANY entry has isTerrain — skip instancing for terrain groups
            let hasTerrain = false;
            for (const e of entries) {
                if (e.userData?.isTerrain) { hasTerrain = true; break; }
            }
            if (hasTerrain) { skippedTooFew++; continue; }

            const instanced = new THREE.InstancedMesh(geo, mat, entries.length);
            instanced.userData.mapGenerated = true;
            instanced.userData.instanced = true;
            instanced.frustumCulled = false;
            if (entries[0].userData?.walkable) instanced.userData.walkable = true;
            if (entries[0].userData?.isWall) instanced.userData.isWall = true;
            if (entries[0].userData?.isCornucopia) instanced.userData.isCornucopia = true;

            const positions = new Float32Array(entries.length * 3);
            const matrices = new Float32Array(entries.length * 16);

            for (let i = 0; i < entries.length; i++) {
                const m = entries[i];
                m.updateWorldMatrix(true, false);
                this._tmpMatrix.copy(m.matrixWorld);
                instanced.setMatrixAt(i, this._tmpMatrix);
                this._tmpMatrix.toArray(matrices, i * 16);
                positions[i * 3] = this._tmpMatrix.elements[12];
                positions[i * 3 + 1] = this._tmpMatrix.elements[13];
                positions[i * 3 + 2] = this._tmpMatrix.elements[14];
            }
            instanced.instanceMatrix.needsUpdate = true;

            for (const m of entries) {
                const parent = m.parent;
                if (parent) {
                    parent.remove(m);
                }
                replaced++;
            }

            scene.add(instanced);
            instancedMeshes.push(instanced);

            const grid = this._buildGrid(entries, positions);
            this._instancedMeshes.push({
                mesh: instanced,
                positions,
                matrices,
                count: entries.length,
                grid,
            });
        }

        console.log(`[InstancedMesh] Groups: ${this._grouped.size}, Replaced: ${replaced}, Skipped(<${minCount}): ${skippedTooFew}`);
        this._grouped.clear();
        return { replaced, instancedMeshes };
    }

    _buildGrid(entries, positions) {
        const cellSize = 64;
        const grid = new Map();

        for (let i = 0; i < entries.length; i++) {
            const px = positions[i * 3];
            const pz = positions[i * 3 + 2];
            const cx = Math.floor(px / cellSize);
            const cz = Math.floor(pz / cellSize);
            const key = `${cx},${cz}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(i);
        }
        return grid;
    }

    updateCulling(playerPos, cullDist) {
        const distSq = this._lastCullPos.distanceToSquared(playerPos);
        if (distSq < 4) return;
        this._lastCullPos.copy(playerPos);

        const cellSize = 64;
        const cullDistSq = cullDist * cullDist;
        const pCellX = Math.floor(playerPos.x / cellSize);
        const pCellZ = Math.floor(playerPos.z / cellSize);
        const radius = Math.ceil(cullDist / cellSize) + 1;

        for (const entry of this._instancedMeshes) {
            const { mesh, positions, matrices, count, grid } = entry;
            const maxCount = count || positions.length / 3;
            const visibleIndices = entry._visBuf || (entry._visBuf = new Uint32Array(Math.max(4096, maxCount * 2)));
            const seen = entry._seen || (entry._seen = new Set());
            let visCount = 0;
            seen.clear();

            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const key = `${pCellX + dx},${pCellZ + dz}`;
                    const cell = grid.get(key);
                    if (!cell) continue;
                    for (const i of cell) {
                        const px = positions[i * 3];
                        const pz = positions[i * 3 + 2];
                        const ddx = px - playerPos.x;
                        const ddz = pz - playerPos.z;
                        if (ddx * ddx + ddz * ddz <= cullDistSq && !seen.has(i)) {
                            seen.add(i);
                            if (visCount < visibleIndices.length) visibleIndices[visCount++] = i;
                        }
                    }
                }
            }

            let target = 0;
            for (let v = 0; v < visCount; v++) {
                const i = visibleIndices[v];
                this._tmpMatrix.fromArray(matrices, i * 16);
                mesh.setMatrixAt(target, this._tmpMatrix);
                target++;
            }

            if (target === 0) {
                mesh.visible = false;
            } else {
                if (!mesh.visible) mesh.visible = true;
                mesh.count = target;
            }
            mesh.instanceMatrix.needsUpdate = true;
        }
    }

    _collectMeshes(obj, out, skipReasons, parentMapGen) {
        if (obj.userData?.persistentGround) return;
        if (!obj.isMesh) {
            const hasMapGen = obj.userData?.mapGenerated || obj.userData?.instancable || parentMapGen;
            if (obj.children?.length) {
                for (const child of obj.children) {
                    this._collectMeshes(child, out, skipReasons, hasMapGen);
                }
            }
            return;
        }
        if (!parentMapGen && !obj.userData?.mapGenerated && !obj.userData?.instancable) { skipReasons.noMapGen++; return; }
        if (obj.userData.isFirefly || obj.userData.isCrystal || obj.userData.isTorch ||
            obj.userData.isGlow || obj.userData.isFountain || obj.userData.isWindTurbine ||
            obj.userData.isSnowParticles || obj.userData.isPOI ||
            obj.userData.isFirstPersonArm || obj.userData.isViewWeapon ||
            obj.userData.isTerrain || obj.userData.biomeGate || obj.userData.biomeBoundary ||
            obj.userData.gameplayBoundary || obj.userData.isTowerStructure ||
            obj.userData.dynamic || obj.userData.isChest ||
            (obj.userData.isCornucopia && !obj.userData.isSpawnPlatform)) { skipReasons.aniInt++; return; }
        const geoKey = this.pool.geoKey(obj.geometry) || `uuid:${obj.geometry.uuid}`;
        if (!geoKey) { skipReasons.noGeoKey++; return; }
        const matKey = this.pool.matKey(obj.material) || (Array.isArray(obj.material) ? null : `uuid:${obj.material.uuid}`);
        if (!matKey) { skipReasons.noMatKey++; return; }
        out.push(obj);
    }

    _cloneMaterial(mat) {
        const clone = mat.clone();
        clone.uuid = THREE.MathUtils.generateUUID();
        return clone;
    }

    dispose() {
        this._grouped.clear();
        this._instancedMeshes = [];
    }
}
