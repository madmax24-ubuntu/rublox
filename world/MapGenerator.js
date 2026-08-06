import * as THREE from "three";
import { MapGeneratorNode } from "./MapGeneratorNode.js?v=1783108959290";
import { AABBGrid } from "./AABBGrid.js";
import { InstancedMeshSystem } from "./InstancedMeshSystem.js";
import { MeshPool } from "./MeshPool.js";

// ============================================================================
// QUADRANT-BASED MAP GENERATOR — Structured hierarchy with logical biome connections
// ============================================================================
// Hierarchy:
//   1. Central Cornucopia (spawn platform + fountain)
//   2. River divider (connects to bridges)
//   3. Four biomes with clear boundaries and connecting paths
//   4. Biome-specific objects strictly within their zones
//   5. Spawn pads only on walkable surfaces (platforms, bridges, clearings)
// ============================================================================

const MAP_SIZE = 256;
const TILE_SIZE = 4;
const GRID_W = MAP_SIZE / TILE_SIZE;
const GRID_H = MAP_SIZE / TILE_SIZE;
const HALF = MAP_SIZE / 2;

// Safety constants for building placement to prevent overlap with central cornucopia zone
const CORNUCOPIA_RADIUS = 30;
const BUILDING_BUFFER = 5;
const MIN_BUILDING_DISTANCE = CORNUCOPIA_RADIUS + BUILDING_BUFFER;
const COLORS = {
	forestTerrain: 0x4caf50,
	forestPath: 0x8d6e63,
	forestTree: 0x2e7d32,
	forestTrunk: 0x5d4037,
	forestMushroom: 0xff5252,
	forestMushroomSpot: 0xfff9c4,
	mazeTerrain: 0x9e9e9e,
	mazeWall: 0x757575,
	mazeTower: 0x616161,
	militaryTerrain: 0x737373,
	militaryGround: 0x607d8b,
	militaryBuilding: 0x455a64,
	militaryRuined: 0x78909c,
	militaryTank: 0x4a5238,
	militaryTread: 0x37474f,
	iceTerrain: 0xe0f7fa,
	iceLake: 0x4dd0e1,
	iceCrystal: 0x80deea,
	iceIgloo: 0xffffff,
	iceTower: 0x4a5238,
	cornucopia: 0xffd700,
	cornucopiaInner: 0xdaa549,
	spawnPad: 0xd7ccc8,
	river: 0x29b6f6,
	bridge: 0x8d6e63,
	mapBoundary: 0x37474f,
	textLabel: 0xffffff,
};

export class MapGenerator {
	constructor(scene) {
		this.scene = scene;
		this.seed = 42;
		this.tileSize = TILE_SIZE;
		this.gridWidth = GRID_W;
		this.gridHeight = GRID_H;
		this.size = MAP_SIZE;
		this.halfSize = HALF;

		this.colliders = [];
		this.spawnPads = [];
		this.colliderGrid = new Map();
		this.colliderGridCellSize = 16;
		this.heightMap = null;
		this._terrainMaterial = null;
		this._tmpMatrix = new THREE.Matrix4();
		this._tmpPos = new THREE.Vector3();
		this._randState = this.seed;
		this._sharedGeos = new Map();
		this._sharedMats = new Map();
		this._resolveReady = null;
		this.ready = new Promise((resolve) => {
			this._resolveReady = resolve;
		});
		this._generatePromise = null;
		this.onProgress = null;
		this._buildings = [];
		this._chestSpots = [];
		this._biomeGates = [];
		this._biomeGateColliders = [];
		this._interactivePOIs = [];
		this._traps = [];
		this._floorTiles = [];
		this._navigationTiles = [];
		this._elevatedRoutes = [];
		this._spawnTiles = [];
		this._meshes = [];
		this._cullDistance = Infinity;
		this._cullDistanceMobile = Infinity;
		this._lastAddedMapObject = null;
		this.pool = new MeshPool();
		const _origAdd = this.scene.add.bind(this.scene);
		this.scene.add = (obj) => {
			// Only track map-generated MESHES and GROUPS for culling (not InstancedMesh — created after generation)
			if (
				(obj.isMesh || obj.isGroup) &&
				!obj.isInstancedMesh &&
				obj.userData?.mapGenerated
			) {
				obj.userData._mapCulled = true;
				this._meshes.push(obj);
				this._lastAddedMapObject = obj;
			}
			return _origAdd(obj);
		};
	}

	startGeneration() {
		if (!this._generatePromise) {
			this._generatePromise = this._generate();
		}
		return this._generatePromise;
	}

	_generate() {
		this._reset();
		this._logProgress(0);
		this._logProgress(0.15);

		// Phase 1: Terrain base
		this._generateTerrain();

		// Phase 2: Central cornucopia + spawn courtyard
		this._generateCornucopia();

		// Phase 4: Forest quadrant (NW)
		this._generateForestQuadrant();

		// Phase 5: Stone maze quadrant (NE)
		this._generateMazeQuadrant();

		// Phase 6: Military ruins quadrant (SW)
		this._generateMilitaryQuadrant();

		// Phase 7: Ice quadrant (SE)
		this._generateIceQuadrant();
		this._generateBiomeResidences();
		this._clearBiomeEntranceCorridors();

		this._clearCentralBiomeIntrusions();

		// Phase 8: Cover objects
		this._placeCoverObjects();
		this._placeBiomeDecor();
		this._pruneOutsidePlayableBounds();
		this._ensureBiomeLootDensity(24);
		this._reduceBiomeLootDensity(0.4);
		this._clearCentralBiomeIntrusions();

		this._placeBiomeBoundaries();
		for (const child of [...this.scene.children]) {
			if (
				!(child.isLine || child.isLineSegments) ||
				child.userData?.gameplayBoundary
			)
				continue;
			const color = child.material?.color?.getHex?.();
			if (
				color === 0x00ffff ||
				color === 0x00ff00 ||
				color === 0x29b6f6 ||
				color === 0x4bb3ff
			) {
				this.scene.remove(child);
				child.geometry?.dispose?.();
				child.material?.dispose?.();
			}
		}
		this._removeStripeArtifacts();
		this._removeDetachedColliderSources();
		this._removeUnsupportedWalkableColliders();
		this._removeGroundCollisionArtifacts();

		// Phase 9.8: Map perimeter walls (glass/blue like reference)
		this._generatePerimeterWalls();

		// Phase 9.5: Build collider grid for spatial queries
		this._rebuildColliderGrid();
		this._buildNavigationTiles();

		// Phase 10: Spawn pads (filtered, no duplicates)
		this._buildSpawnPads();

		// Phase 11: InstancedMesh optimization — convert repeated meshes to InstancedMesh
		const totalBefore = this._meshes.length;
		const instResult = this._optimizeInstancing(2);
		console.log(
			`[MapGenerator] InstancedMesh: ${instResult.replaced} meshes merged into ${instResult.instancedMeshes.length} InstancedMesh (total before: ${totalBefore}, after: ${this._meshes.length})`,
		);

		// Phase 12: Finalize
		this._logProgress(0.95);
		this.aabbGrid = new AABBGrid(2.0);
		this.aabbGrid.buildFromColliders(this.colliders);
		this._logProgress(1.0);
		// Cache animated object references for per-frame updates
		this._cacheAnimatedObjects();
		this._freezeStaticTransforms();
		this._resolveReady?.();
	}

	_freezeStaticTransforms() {
		this.scene.traverse((object) => {
			if (
				(!object.userData?.mapGenerated && !object.userData?.easterEgg) ||
				object.matrixAutoUpdate === false
			)
				return;
			const data = object.userData;
			if (
				data.dynamic ||
				data.isPOI ||
				data.isFountain ||
				data.isTorch ||
				data.isGlow ||
				data.isSnowParticles ||
				data.isWindTurbine ||
				data.isCrystal ||
				data.isFirefly ||
				data.isChest ||
				data.easterEgg ||
				data.biomeGate ||
				(data.isCornucopia && !data.isSpawnPlatform)
			)
				return;
			object.updateMatrix();
			object.matrixAutoUpdate = false;
		});
	}

	_clearCentralBiomeIntrusions(radius = 82) {
		const preserved = (obj) =>
			obj.userData?.isCornucopia ||
			obj.userData?.isTerrain ||
			obj.userData?.biomeBoundary ||
			obj.userData?.isBiomeEntrance ||
			obj.userData?.isSnowParticles ||
			obj.userData?.gameplayBoundary ||
			obj.userData?.isBarbedWire ||
			obj.userData?.isTowerStructure ||
			obj.userData?.buildingType;
		const intrudes = (box) => {
			const x = box.min.x > 0 ? box.min.x : box.max.x < 0 ? box.max.x : 0;
			const z = box.min.z > 0 ? box.min.z : box.max.z < 0 ? box.max.z : 0;
			return x * x + z * z < radius * radius;
		};
		const removed = new Set();
		const removedBounds = [];
		const box = new THREE.Box3();
		const localMatrix = new THREE.Matrix4();
		const worldMatrix = new THREE.Matrix4();
		for (const child of [...this.scene.children]) {
			if (!child.userData?.mapGenerated || preserved(child)) continue;
			if (child.isInstancedMesh) {
				child.geometry.computeBoundingBox();
				let write = 0;
				child.updateMatrixWorld(true);
				for (let read = 0; read < child.count; read++) {
					child.getMatrixAt(read, localMatrix);
					worldMatrix.multiplyMatrices(child.matrixWorld, localMatrix);
					box.copy(child.geometry.boundingBox).applyMatrix4(worldMatrix);
					if (intrudes(box)) continue;
					if (write !== read) child.setMatrixAt(write, localMatrix);
					write++;
				}
				child.count = write;
				child.instanceMatrix.needsUpdate = true;
				child.computeBoundingSphere();
				if (!write) {
					child.parent?.remove(child);
					removed.add(child);
				}
				continue;
			}
			box.setFromObject(child);
			if (!box.isEmpty() && intrudes(box)) {
				removedBounds.push(box.clone());
				child.parent?.remove(child);
				removed.add(child);
			}
		}
		this._meshes = this._meshes.filter(
			(mesh) => !removed.has(mesh) && mesh.parent,
		);
		this.colliders = this.colliders.filter((collider) => {
			if (
				collider.isTerrain ||
				collider.isCornucopia ||
				collider.isBiomeEntrance ||
				collider.biomeBoundary ||
				collider.gameplayBoundary ||
				collider.isTowerStructure
			)
				return true;
			if (intrudes(collider)) return false;
			const x = (collider.min.x + collider.max.x) * 0.5;
			const y = (collider.min.y + collider.max.y) * 0.5;
			const z = (collider.min.z + collider.max.z) * 0.5;
			return !removedBounds.some(
				(bounds) =>
					x >= bounds.min.x - 0.2 &&
					x <= bounds.max.x + 0.2 &&
					y >= bounds.min.y - 0.2 &&
					y <= bounds.max.y + 0.2 &&
					z >= bounds.min.z - 0.2 &&
					z <= bounds.max.z + 0.2,
			);
		});
		const outside = (point) => Math.hypot(point.x, point.z) >= radius;
		this._buildings = this._buildings.filter(outside);
		this._chestSpots = this._chestSpots.filter(outside);
		this._interactivePOIs = this._interactivePOIs.filter((poi) =>
			outside(poi.position || poi),
		);
		this._traps = this._traps.filter((trap) => outside(trap.position));
	}

	_removeStripeArtifacts() {
		const remove = [];
		const removedBounds = [];
		const bounds = new THREE.Box3();
		const size = new THREE.Vector3();
		this.scene.traverse((child) => {
			if (
				!child.isMesh ||
				child.isInstancedMesh ||
				!child.userData?.mapGenerated ||
				child.userData?.gameplayBoundary
			)
				return;
			bounds.setFromObject(child);
			bounds.getSize(size);
			const shortSide = Math.min(size.x, size.z);
			const longSide = Math.max(size.x, size.z);
			if (size.y <= 0.3 && shortSide <= 1.8 && longSide >= 8) {
				remove.push(child);
				removedBounds.push(bounds.clone());
			}
		});
		for (const mesh of remove) {
			mesh.parent?.remove(mesh);
		}
		this._meshes = this._meshes.filter(
			(mesh) => !remove.includes(mesh) && mesh.parent,
		);
		this.colliders = this.colliders.filter((collider) => {
			if (
				collider.enabled === false ||
				collider.walkable ||
				collider.gameplayBoundary ||
				collider.isBiomeEntrance
			)
				return true;
			const cx = (collider.min.x + collider.max.x) * 0.5;
			const cy = (collider.min.y + collider.max.y) * 0.5;
			const cz = (collider.min.z + collider.max.z) * 0.5;
			return !removedBounds.some(
				(box) =>
					cx >= box.min.x - 0.2 &&
					cx <= box.max.x + 0.2 &&
					cy >= box.min.y - 0.2 &&
					cy <= box.max.y + 0.2 &&
					cz >= box.min.z - 0.2 &&
					cz <= box.max.z + 0.2,
			);
		});
	}

	_isAttachedToScene(object) {
		let current = object;
		while (current) {
			if (current === this.scene) return true;
			current = current.parent;
		}
		return false;
	}

	_removeDetachedColliderSources() {
		this.colliders = this.colliders.filter(
			(collider) =>
				!collider.source || this._isAttachedToScene(collider.source),
		);
	}

	_removeUnsupportedWalkableColliders() {
		const bounds = [];
		const box = new THREE.Box3();
		const localMatrix = new THREE.Matrix4();
		const worldMatrix = new THREE.Matrix4();
		this.scene.traverse((object) => {
			if (
				!object.isMesh ||
				!object.userData?.mapGenerated ||
				object.visible === false
			)
				return;
			if (object.userData.isTerrain || object.userData.isCornucopia) return;
			if (object.isInstancedMesh) {
				object.geometry.computeBoundingBox();
				object.updateMatrixWorld(true);
				for (let i = 0; i < object.count; i++) {
					object.getMatrixAt(i, localMatrix);
					worldMatrix.multiplyMatrices(object.matrixWorld, localMatrix);
					bounds.push({
						box: object.geometry.boundingBox.clone().applyMatrix4(worldMatrix),
						walkable: object.userData.walkable === true,
					});
				}
				return;
			}
			box.setFromObject(object);
			if (!box.isEmpty())
				bounds.push({
					box: box.clone(),
					walkable: object.userData.walkable === true,
				});
		});
		this.colliders = this.colliders.filter((collider) => {
			if (
				collider.isTerrain ||
				collider.isCornucopia ||
				collider.isBiomeEntrance ||
				collider.isTowerStair ||
				collider.biomeBoundary ||
				collider.gameplayBoundary ||
				collider.isTowerStructure
			)
				return true;
			const width = Math.max(0.01, collider.max.x - collider.min.x);
			const depth = Math.max(0.01, collider.max.z - collider.min.z);
			const requiredOverlap = width * depth * (collider.walkable ? 0.45 : 0.28);
			const supported = bounds.some((candidate) => {
				if (candidate.walkable !== collider.walkable) return false;
				const candidateBox = candidate.box;
				if (
					collider.walkable &&
					Math.abs(candidateBox.max.y - collider.max.y) > 0.22
				)
					return false;
				if (
					!collider.walkable &&
					(candidateBox.max.y < collider.min.y - 0.12 ||
						candidateBox.min.y > collider.max.y + 0.12)
				)
					return false;
				const overlapX = Math.max(
					0,
					Math.min(candidateBox.max.x, collider.max.x) -
						Math.max(candidateBox.min.x, collider.min.x),
				);
				const overlapZ = Math.max(
					0,
					Math.min(candidateBox.max.z, collider.max.z) -
						Math.max(candidateBox.min.z, collider.min.z),
				);
				return overlapX * overlapZ >= requiredOverlap;
			});
			if (collider.walkable || collider.max.y <= 2.5) return supported;
			return true;
		});
	}

	_removeGroundCollisionArtifacts() {
		this.colliders = this.colliders.filter((collider) => {
			if (collider.enabled === false || collider.isTerrain) return true;
			if (
				collider.gameplayBoundary ||
				collider.biomeBoundary ||
				collider.isBiomeEntrance ||
				collider.isCornucopia ||
				collider.isTowerStructure ||
				collider.isTowerStair ||
				collider.isBiomeResidence ||
				collider.isTrap
			)
				return true;
			const width = collider.max.x - collider.min.x;
			const height = collider.max.y - collider.min.y;
			const depth = collider.max.z - collider.min.z;
			if (
				collider.walkable &&
				collider.min.y >= -0.2 &&
				collider.max.y <= 0.4 &&
				height <= 0.4
			)
				return false;
			if (collider.walkable) return true;
			return !(
				collider.min.y >= -0.2 &&
				collider.max.y <= 0.4 &&
				height <= 0.4 &&
				width > 0 &&
				depth > 0
			);
		});
	}

	_pruneOutsidePlayableBounds() {
		const limit = HALF - 2;
		const removed = new Set();
		for (const child of [...this.scene.children]) {
			if (
				!child.userData?.mapGenerated ||
				child.userData?.isCornucopia ||
				child.userData?.isTerrain
			)
				continue;
			if (
				Math.abs(child.position.x) <= limit &&
				Math.abs(child.position.z) <= limit
			)
				continue;
			removed.add(child);
			this.scene.remove(child);
		}
		this._meshes = this._meshes.filter(
			(mesh) => !removed.has(mesh) && mesh.parent,
		);
		this.colliders = this.colliders.filter((collider) => {
			if (
				collider.isCornucopia ||
				collider.isBiomeEntrance ||
				collider.biomeBoundary
			)
				return true;
			const x = (collider.min.x + collider.max.x) * 0.5;
			const z = (collider.min.z + collider.max.z) * 0.5;
			return Math.abs(x) <= limit && Math.abs(z) <= limit;
		});
		const inside = (point) =>
			Math.abs(point.x) <= limit && Math.abs(point.z) <= limit;
		this._buildings = this._buildings.filter(inside);
		this._chestSpots = this._chestSpots.filter(inside);
		this._interactivePOIs = this._interactivePOIs.filter((poi) =>
			inside(poi.position || poi),
		);
		this._traps = this._traps.filter((trap) => inside(trap.position));
	}

	_ensureBiomeLootDensity(minimum) {
		const limit = HALF - 6;
		const definitions = [
			{ key: "forest", sx: -1, sz: -1 },
			{ key: "maze", sx: 1, sz: -1 },
			{ key: "military", sx: -1, sz: 1 },
			{ key: "ice", sx: 1, sz: 1 },
		];
		const biomeOf = (x, z) =>
			x < 0 ? (z < 0 ? "forest" : "military") : z < 0 ? "maze" : "ice";
		const blocked = (x, z) =>
			this.colliders.some(
				(collider) =>
					!collider.walkable &&
					collider.enabled !== false &&
					x >= collider.min.x - 0.7 &&
					x <= collider.max.x + 0.7 &&
					z >= collider.min.z - 0.7 &&
					z <= collider.max.z + 0.7,
			);
		for (const biome of definitions) {
			let count = this._chestSpots.filter(
				(spot) => biomeOf(spot.x, spot.z) === biome.key,
			).length;
			for (const collider of this.colliders) {
				if (count >= minimum) break;
				if (
					collider.walkable ||
					collider.enabled === false ||
					collider.biomeBoundary ||
					collider.isCornucopia
				)
					continue;
				const cx = (collider.min.x + collider.max.x) * 0.5;
				const cz = (collider.min.z + collider.max.z) * 0.5;
				if (biomeOf(cx, cz) !== biome.key) continue;
				const width = collider.max.x - collider.min.x;
				const depth = collider.max.z - collider.min.z;
				if (width > 32 || depth > 32) continue;
				const candidates = [
					[collider.max.x + 1.8, cz],
					[collider.min.x - 1.8, cz],
					[cx, collider.max.z + 1.8],
					[cx, collider.min.z - 1.8],
				];
				for (const [x, z] of candidates) {
					if (count >= minimum) break;
					if (
						Math.abs(x) > limit ||
						Math.abs(z) > limit ||
						Math.hypot(x, z) < 84
					)
						continue;
					if (
						Math.sign(x) !== biome.sx ||
						Math.sign(z) !== biome.sz ||
						blocked(x, z)
					)
						continue;
					if (
						this._chestSpots.some(
							(spot) => Math.hypot(spot.x - x, spot.z - z) < 5,
						)
					)
						continue;
					this._registerChestSpot(x, z, biome.key);
					count++;
				}
			}
		}
	}

	_reduceBiomeLootDensity(ratio) {
		const biomeOf = (x, z) =>
			x < 0 ? (z < 0 ? "forest" : "military") : z < 0 ? "maze" : "ice";
		const groups = new Map();
		for (const spot of this._chestSpots) {
			const key = biomeOf(spot.x, spot.z);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(spot);
		}
		const retained = [];
		for (const spots of groups.values()) {
			const keep = Math.max(1, Math.round(spots.length * ratio));
			const protectedSpots = spots.filter(
				(spot) =>
					spot.grade === "tower" || String(spot.grade).startsWith("residence_"),
			);
			retained.push(...protectedSpots);
			const available = spots.filter(
				(spot) =>
					spot.grade !== "tower" &&
					!String(spot.grade).startsWith("residence_"),
			);
			const remaining = Math.max(0, keep - protectedSpots.length);
			for (let i = 0; i < remaining; i++) {
				retained.push(
					available[
						Math.min(
							available.length - 1,
							Math.floor(((i + 0.5) * available.length) / remaining),
						)
					],
				);
			}
		}
		this._chestSpots = retained;
	}

	_reset() {
		this.colliders = [];
		this.spawnPads = [];
		this.heightMap = null;
		this._terrainMaterial = null;
		this._floorTiles = [];
		this._navigationTiles = [];
		this._elevatedRoutes = [];
		this._spawnTiles = [];
		this._buildings = [];
		this._chestSpots = [];
		this._biomeGates = [];
		this._biomeGateColliders = [];
		this._interactivePOIs = [];
		this._traps = [];

		const toRemove = [];
		for (const child of this.scene.children) {
			if (child.userData?.mapGenerated) toRemove.push(child);
		}
		for (const obj of toRemove) {
			this.scene.remove(obj);
			obj.traverse((child) => {
				if (child.geometry) child.geometry.dispose();
				if (child.material) {
					if (Array.isArray(child.material)) {
						child.material.forEach((m) => m.dispose());
					} else {
						child.material.dispose();
					}
				}
			});
		}
	}

	getSpawnPads() {
		return this.spawnPads;
	}

	_logProgress(pct) {
		if (this.onProgress) this.onProgress(pct);
	}

	_rand() {
		this._randState = (this._randState * 1664525 + 1013904223) >>> 0;
		return this._randState / 0x100000000;
	}

	lerp(a, b, t) {
		return a + (b - a) * t;
	}

	_getSharedGeo(key, factory) {
		let geo = this._sharedGeos.get(key);
		if (!geo) {
			geo = factory();
			this._sharedGeos.set(key, geo);
		}
		return geo;
	}

	_getSharedMat(key, factory) {
		let mat = this._sharedMats.get(key);
		if (!mat) {
			mat = factory();
			this._sharedMats.set(key, mat);
		}
		return mat;
	}

	// =========================================================================
	// TERRAIN — 4 separate quadrant planes with distinct colors
	// =========================================================================
	_generateTerrain() {
		// 4 плоскости для каждого квадранта (центр каждого квадранта)
		const quadrants = [
			{ x: -HALF / 2, z: -HALF / 2, color: COLORS.forestTerrain },
			{ x: HALF / 2, z: -HALF / 2, color: COLORS.mazeTerrain },
			{ x: -HALF / 2, z: HALF / 2, color: COLORS.militaryTerrain },
			{ x: HALF / 2, z: HALF / 2, color: COLORS.iceTerrain },
		];

		for (const q of quadrants) {
			const geo = this.pool.getGeoPlane(HALF, HALF);
			const mat = this.pool.getMatTerrain(q.color, 0.9, false);
			const plane = new THREE.Mesh(geo, mat);
			plane.rotation.x = -Math.PI / 2;
			plane.position.set(q.x, 0.02, q.z); // Raise above platform base (y=0) so terrain is visible
			plane.userData.mapGenerated = true;
			plane.userData.walkable = true;
			plane.userData.isTerrain = true; // Never cull terrain
			this.scene.add(plane);
		}

		// Terrain collider top at y=0.14 matches terrain mesh top (0.02 + 0.12 = 0.14)
		// This prevents physics from detecting building floors (y=0.15) as the highest surface
		const terrainCollider = this.addColliderBox(
			new THREE.Vector3(0, 0.07, 0),
			HALF * 2,
			0.14,
			HALF * 2,
			true,
		);
		terrainCollider.isTerrain = true;

		// Height map (flat = 0)
		this.heightMap = [];
		for (let gy = 0; gy < GRID_H; gy++) {
			this.heightMap[gy] = [];
			for (let gx = 0; gx < GRID_W; gx++) {
				this.heightMap[gy][gx] = 0;
			}
		}
	}

	_getTerrainColor(x, z) {
		const distFromCenter = Math.sqrt(x * x + z * z);

		// Cornucopia center area — compact
		if (distFromCenter < 28) {
			return new THREE.Color(0xc8b88a);
		}

		// River (vertical line between NW and NE, SW and SE) — thin
		if (Math.abs(x) < 2 && distFromCenter > 30) {
			return new THREE.Color(COLORS.river);
		}

		// Чёткое разделение по квадрантам без смешивания
		if (x < 0 && z < 0) {
			return new THREE.Color(COLORS.forestTerrain);
		} else if (x >= 0 && z < 0) {
			return new THREE.Color(COLORS.mazeTerrain);
		} else if (x < 0 && z >= 0) {
			return new THREE.Color(COLORS.militaryTerrain);
		} else {
			return new THREE.Color(COLORS.iceTerrain);
		}
	}

	getHeightAt(x, z) {
		return 0;
	}

	getSurfaceHeightAt(x, z) {
		return 0;
	}

	// =========================================================================
	// LARGE DETAILED GOLDEN FOUNTAIN + SPAWN TILE GRID
	// =========================================================================
	_generateCornucopia() {
		const courtyard = new THREE.Mesh(
			this.pool.getGeoCylinder(75, 75, 0.12),
			this.pool.getMatStd(0x8f8778, 0.96, 0, true, false, 1, 0, 0),
		);
		courtyard.position.set(0, -0.02, 0);
		courtyard.userData.mapGenerated = true;
		courtyard.userData.isCornucopia = true;
		courtyard.userData.walkable = true;
		courtyard.frustumCulled = false;
		this.scene.add(courtyard);

		// Use the high-detail MapGeneratorNode implementation for the central hub to reach 99% fidelity
		const existingRoots = new Set(this.scene.children);
		const node = new MapGeneratorNode(this.scene);
		node.init();

		for (const root of this.scene.children) {
			if (existingRoots.has(root)) continue;
			root.traverse((child) => {
				child.userData.mapGenerated = true;
				child.userData.isCornucopia = true;
			});
		}

		// Sync spawn pads from the high-detail node to our main generator's tracking system.
		const nodePads = node.getSpawnPads();
		if (nodePads && nodePads.length > 0) {
			for (const pad of nodePads) {
				const padTopY = pad.y ?? 2.405;
				this.spawnPads.push(new THREE.Vector3(pad.x, padTopY, pad.z));
				// Collider max.y must match visible pad top (2 + 0.34 = 2.34), not 2.405
				const colliderY = padTopY - 0.065; // 2.405 - 0.065 = 2.34
				const padCollider = this.addColliderBox(
					new THREE.Vector3(pad.x, colliderY - 0.17, pad.z),
					2.02,
					0.34,
					2.02,
					true,
				);
				padCollider.isSpawnPlatform = true;
				padCollider.isCornucopia = true;
				// Snap to tile grid for consistency with the rest of the map generation logic
				this._spawnTiles.push({
					x: Math.round(pad.x / TILE_SIZE) * TILE_SIZE,
					z: Math.round(pad.z / TILE_SIZE) * TILE_SIZE,
				});
			}
			console.log(
				`[MapGenSync] Synced ${this.spawnPads.length} pads from node, first=(${this.spawnPads[0].x.toFixed(1)}, ${this.spawnPads[0].z.toFixed(1)}) second=(${this.spawnPads[1].x.toFixed(1)}, ${this.spawnPads[1].z.toFixed(1)})`,
			);
		}

		// First spawn pad is at the edge of the platform — main player spawns there
		// No center pad needed; all pads are on the edge

		// Add collision for the high-detail structure to match its geometry perfectly.
		// Base platform: BoxGeometry(50,2,50) at y=1 → top surface at y=2
		// Collider: center.y=1, height=2 → min.y=0, max.y=2 ✅
		const baseRadius = 55;
		const platformSurfaceY = 2.19;
		const platformCollider = this.addColliderBox(
			new THREE.Vector3(0, platformSurfaceY * 0.5, 0),
			baseRadius * 2,
			platformSurfaceY,
			baseRadius * 2,
			true,
		);
		platformCollider.isCornucopia = true;
		platformCollider.surfaceCircle = { x: 0, z: 0, radius: baseRadius - 0.8 };

		// Fountain collision — solid basin ring + column (fountain positioned at y=2 in scene)
		const fountainScale = 3.2;
		for (let i = 0; i < 32; i++) {
			const angle = (i / 32) * Math.PI * 2;
			const r = 6.5 * fountainScale;
			const wall = this.addColliderBox(
				new THREE.Vector3(
					Math.cos(angle) * r,
					2 + 0.75 * fountainScale,
					Math.sin(angle) * r,
				),
				4.8,
				1.5 * fountainScale,
				2.4,
				false,
			);
			wall.isCornucopia = true;
		}
		const basinFloor = this.addColliderBox(
			new THREE.Vector3(0, 2.08, 0),
			13 * fountainScale,
			0.16,
			13 * fountainScale,
			false,
		);
		basinFloor.isCornucopia = true;
		basinFloor.enabled = false;
		const columnCol = this.addColliderBox(
			new THREE.Vector3(0, 2 + 3 * fountainScale, 0),
			4.2 * fountainScale,
			4 * fountainScale,
			4.2 * fountainScale,
			false,
		);
		columnCol.isCornucopia = true;
		const upperCol = this.addColliderBox(
			new THREE.Vector3(0, 2 + 5.4 * fountainScale, 0),
			6.2 * fountainScale,
			0.8 * fountainScale,
			6.2 * fountainScale,
			false,
		);
		upperCol.isCornucopia = true;
	}

	// =========================================================================
	// BIOME BOUNDARIES — Clear visual separators between quadrants (no walls)
	// =========================================================================
	_placeBiomeBoundaries() {
		const wallH = 30;
		const wallT = 2.4;
		const wallMat = this.pool.getMatStd(
			0x58636b,
			0.9,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const gateMat = this.pool.getMatStd(
			0xb74b18,
			0.45,
			0.15,
			false,
			true,
			0.16,
			0x7a2108,
			0.12,
		);
		const addWall = (x, z, w, d, rotation = 0) => {
			const mesh = new THREE.Mesh(this.pool.getGeoBox(w, wallH, d), wallMat);
			mesh.position.set(x, wallH / 2, z);
			mesh.rotation.y = rotation;
			mesh.userData.mapGenerated = true;
			mesh.userData.biomeBoundary = true;
			mesh.frustumCulled = false;
			this.scene.add(mesh);
			const c = Math.abs(Math.cos(rotation));
			const s = Math.abs(Math.sin(rotation));
			this.addColliderBox(
				new THREE.Vector3(x, wallH / 2, z),
				w * c + d * s,
				wallH,
				w * s + d * c,
				false,
				true,
			);
		};
		const addGate = (x, z, w, d, rotation = 0) => {
			const gate = new THREE.Mesh(
				this.pool.getGeoBox(w, 16, d),
				gateMat.clone(),
			);
			gate.position.set(x, 8, z);
			gate.rotation.y = rotation;
			gate.userData.mapGenerated = true;
			gate.userData.biomeGate = true;
			gate.frustumCulled = false;
			this.scene.add(gate);
			const c = Math.abs(Math.cos(rotation));
			const s = Math.abs(Math.sin(rotation));
			const collider = this.addColliderBox(
				new THREE.Vector3(x, 8, z),
				w * c + d * s,
				16,
				w * s + d * c,
				false,
				false,
			);
			collider.enabled = false;
			collider.isBiomeGate = true;
			this._biomeGates.push(gate);
			this._biomeGateColliders.push(collider);
		};
		const ringRadius = 64;
		const ringSegments = 40;
		const segmentLength = (Math.PI * 2 * ringRadius) / ringSegments + 0.8;
		const gateIndices = new Set([4, 5, 6, 14, 15, 16, 24, 25, 26, 34, 35, 36]);
		for (let i = 0; i < ringSegments; i++) {
			const angle = (i / ringSegments) * Math.PI * 2;
			const x = Math.cos(angle) * ringRadius;
			const z = Math.sin(angle) * ringRadius;
			const rotation = Math.PI / 2 - angle;
			if (gateIndices.has(i)) {
				addGate(x, z, segmentLength, wallT, rotation);
			} else {
				addWall(x, z, segmentLength, wallT, rotation);
			}
		}
		const dividerStart = ringRadius - 10;
		const dividerEnd = HALF + wallT;
		const gateGap = 14;
		const gateMid = (dividerStart + dividerEnd) * 0.5;
		for (const sign of [-1, 1]) {
			const halfGap = gateGap * 0.5;
			const seg1End = gateMid - halfGap;
			const seg2Start = gateMid + halfGap;
			const len1 = seg1End - dividerStart;
			const len2 = dividerEnd - seg2Start;
			if (len1 > 1) {
				const c1 = dividerStart + len1 * 0.5;
				addWall(0, sign * c1, wallT, len1);
				addWall(sign * c1, 0, len1, wallT);
			}
			if (len2 > 1) {
				const c2 = seg2Start + len2 * 0.5;
				addWall(0, sign * c2, wallT, len2);
				addWall(sign * c2, 0, len2, wallT);
			}
			addGate(0, sign * gateMid, wallT, gateGap);
			addGate(sign * gateMid, 0, gateGap, wallT);
		}
		const stairAngles = [
			Math.PI * 0.25,
			Math.PI * 0.75,
			Math.PI * 1.25,
			Math.PI * 1.75,
		];
		const stairMat = this.pool.getMatStd(
			0x4c5054,
			0.92,
			0.02,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const stairFireMat = this.pool.getMatStd(
			0x7a2118,
			0.52,
			0.05,
			true,
			false,
			1,
			0xff3b12,
			0.85,
		);
		const stepCount = 12;
		const stepDepth = 2.5;
		const stepWidth = 11.5;
		const treadHeight = 0.22;
		for (let entrance = 0; entrance < stairAngles.length; entrance++) {
			const angle = stairAngles[entrance];
			for (let step = 0; step < stepCount; step++) {
				const radius = 52.8 + step * 1.65;
				const stepTopY = 2.19 + (0.14 - 2.19) * (step / (stepCount - 1));
				const tread = new THREE.Mesh(
					this.pool.getGeoBox(stepWidth, treadHeight, stepDepth),
					stairMat,
				);
				tread.position.set(
					Math.cos(angle) * radius,
					stepTopY - treadHeight * 0.5,
					Math.sin(angle) * radius,
				);
				tread.rotation.y = Math.PI * 0.5 - angle;
				tread.userData.mapGenerated = true;
				tread.userData.walkable = true;
				tread.userData.isBiomeEntrance = true;
				tread.frustumCulled = false;
				this.scene.add(tread);
				const c = Math.abs(Math.cos(tread.rotation.y));
				const s = Math.abs(Math.sin(tread.rotation.y));
				const collider = this.addColliderBox(
					tread.position.clone(),
					stepWidth * c + stepDepth * s,
					treadHeight,
					stepWidth * s + stepDepth * c,
					true,
					false,
				);
				collider.isBiomeEntrance = true;
				collider.surfaceOBB = {
					x: tread.position.x,
					z: tread.position.z,
					halfWidth: stepWidth * 0.5,
					halfDepth: stepDepth * 0.5,
					rotation: tread.rotation.y,
				};
				for (const offset of [-3.8, 3.8]) {
					const ember = new THREE.Mesh(
						this.pool.getGeoBox(2.1, 0.035, stepDepth * 0.72),
						stairFireMat,
					);
					const tangentX = Math.cos(tread.rotation.y);
					const tangentZ = -Math.sin(tread.rotation.y);
					ember.position.set(
						tread.position.x + tangentX * offset,
						stepTopY + 0.018,
						tread.position.z + tangentZ * offset,
					);
					ember.rotation.y = tread.rotation.y;
					ember.userData.mapGenerated = true;
					ember.userData.decorativeOnly = true;
					ember.frustumCulled = false;
					this.scene.add(ember);
				}
			}
		}
		this.setBiomeGatesOpen(false);
	}

	_addBridge(x, z) {
		const bridgeMat = this.pool.getMatStd(
			COLORS.bridge,
			0.8,
			0,
			true,
			false,
			1,
			0,
			0,
		);

		// Bridge deck
		const deckGeo = this.pool.getGeoBox(12, 0.5, 8);
		const deck = new THREE.Mesh(deckGeo, bridgeMat);
		deck.position.set(x, 1, z);
		deck.userData.mapGenerated = true;
		deck.userData.walkable = true;
		this.scene.add(deck);
		// Collider aligned with visible deck (y=1) — top at y=1.25, center at y=1.125
		this.addColliderBox(new THREE.Vector3(x, 1.125, z), 12, 0.5, 8, true);

		// Bridge rails
		const railGeo = this.pool.getGeoBox(0.3, 1.5, 8);
		for (const side of [-1, 1]) {
			const rail = new THREE.Mesh(railGeo, bridgeMat);
			rail.position.set(x + side * 5.5, 1.5, z);
			rail.userData.mapGenerated = true;
			this.scene.add(rail);
		}

		// Bridge supports
		const supportGeo = this.pool.getGeoBox(1, 2, 1);
		const supportMat = this.pool.getMatStd(
			0x6d4c41,
			0.8,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		for (let i = -2; i <= 2; i++) {
			const support = new THREE.Mesh(supportGeo, supportMat);
			support.position.set(x + i * 3, 0.5, z);
			support.userData.mapGenerated = true;
			this.scene.add(support);
		}
	}

	// =========================================================================
	// FOREST QUADRANT (NW: x < 0, z < 0)
	// =========================================================================
	_generateForestQuadrant() {
		const startX = -124;
		const startZ = -124;
		const size = 120;

		// Центральная поляна — светлая зона с травой
		const clearingCX = startX + size * 0.5;
		const clearingCZ = startZ + size * 0.5;
		const clearingRadius = 16;

		// Clearing ground patch
		const clearingGeo = new THREE.CircleGeometry(clearingRadius, 32);
		const clearingMat = this.pool.getMatStd(
			0x66bb6a,
			0.9,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const clearingMesh = new THREE.Mesh(clearingGeo, clearingMat);
		clearingMesh.rotation.x = -Math.PI / 2;
		clearingMesh.position.set(clearingCX, 0.06, clearingCZ);
		clearingMesh.userData.mapGenerated = true;
		clearingMesh.userData.walkable = true;
		this.scene.add(clearingMesh);

		// Grid-based tree placement with wider corridors
		const gridStep = 12;
		const corridorWidth = 8; // Wider corridors for player movement
		const treeTypes = ["pine", "oak", "birch", "spruce"];
		let forestLootSpots = 0;

		for (let gx = startX + 8; gx < startX + size - 8; gx += gridStep) {
			for (let gz = startZ + 8; gz < startZ + size - 8; gz += gridStep) {
				// Skip if in clearing
				if (
					this._distToClearing(gx, gz, clearingCX, clearingCZ, clearingRadius)
				)
					continue;

				// Add jitter for natural look
				const jitterX = (this._rand() - 0.5) * 6;
				const jitterZ = (this._rand() - 0.5) * 6;
				const tx = gx + jitterX;
				const tz = gz + jitterZ;

				const relX = tx - clearingCX;
				const relZ = tz - clearingCZ;
				if (this._isForestPathClearance(tx, tz)) continue;

				// Skip if too close to river
				const distToRiverX = Math.abs(tx - clearingCX);
				const distToRiverZ = Math.abs(tz - clearingCZ);
				if (distToRiverX < 8 && distToRiverZ < 8) continue;

				// Pick tree type based on position
				const treeType = treeTypes[Math.floor(this._rand() * treeTypes.length)];
				this._addForestTree(tx, tz, treeType);
				if (forestLootSpots < 24 && this._rand() < 0.28) {
					this._registerChestSpot(tx + 2.2, tz + 1.4, "forest");
					forestLootSpots++;
				}
			}
		}

		// Fallen logs for atmosphere
		for (let i = 0; i < 5; i++) {
			const lx = startX + 10 + this._rand() * (size - 20);
			const lz = startZ + 10 + this._rand() * (size - 20);
			if (
				!this._distToClearing(
					lx,
					lz,
					clearingCX,
					clearingCZ,
					clearingRadius + 5,
				)
			) {
				this._addFallenLog(lx, lz);
			}
		}

		this._addForestRiver(
			startX + 8,
			clearingCZ + 38,
			startX + size - 8,
			clearingCZ + 38,
		);
		this._addForestRiver(
			clearingCX + 52,
			startZ + 8,
			clearingCX + 52,
			startZ + size - 8,
		);

		// Dense undergrowth — bushes and flowers (after buildings to avoid spawning inside)
		for (let i = 0; i < 30; i++) {
			const bx = startX + 5 + this._rand() * (size - 10);
			const bz = startZ + 5 + this._rand() * (size - 10);
			if (
				!this._distToClearing(
					bx,
					bz,
					clearingCX,
					clearingCZ,
					clearingRadius + 5,
				)
			) {
				if (!this.getStructureAtPoint(bx, bz, 8)) {
					this._addForestBush(bx, bz);
				}
			}
		}

		// Rocks and moss on clearing
		// Edge trees — dense forest near biome borders
		this._addEdgeTrees(startX, startZ, size);

		// POI items scattered in forest
		this._addForestPOI(startX, startZ, size, clearingCX, clearingCZ);

		// Winding forest paths from clearing to edges
		this._generateForestPaths();
	}

	_distToClearing(x, z, cx, cz, radius) {
		return Math.sqrt((x - cx) ** 2 + (z - cz) ** 2) < radius + 5;
	}

	_addForestRiver(x1, z1, x2, z2) {
		const dx = x2 - x1;
		const dz = z2 - z1;
		const length = Math.hypot(dx, dz);
		const angle = Math.atan2(dx, dz);
		const riverMat = this.pool.getMatStd(
			0x2389a6,
			0.24,
			0.18,
			false,
			true,
			0.82,
			0,
			0,
		);
		const river = new THREE.Mesh(
			this.pool.getGeoBox(7.5, 0.06, length),
			riverMat,
		);
		river.position.set((x1 + x2) * 0.5, 0.035, (z1 + z2) * 0.5);
		river.rotation.y = angle;
		river.userData.mapGenerated = true;
		river.userData.isRiver = true;
		this.scene.add(river);
	}

	_generateBiomeResidences() {
		const residences = [
			[-98, -82, "forest"],
			[-82, -108, "forest"],
			[98, -82, "maze"],
			[82, -108, "maze"],
			[-98, 82, "military"],
			[-82, 108, "military"],
			[98, 82, "ice"],
			[82, 108, "ice"],
		];
		for (const [x, z, biome] of residences) {
			this._clearResidenceFootprint(x, z, 20, 17);
			this._addBiomeResidence(x, z, biome);
		}
	}

	_clearBiomeEntranceCorridors() {
		const axes = [
			[-1, -1],
			[1, -1],
			[-1, 1],
			[1, 1],
		];
		const corridorHit = (x, z, padding = 0) =>
			axes.some(([sx, sz]) => {
				const radial = (x * sx + z * sz) / Math.SQRT2;
				const lateral = Math.abs((x * sz - z * sx) / Math.SQRT2);
				return (
					radial >= 48 - padding &&
					radial <= 82 + padding &&
					lateral <= 7 + padding
				);
			});
		for (const child of [...this.scene.children]) {
			if (
				!child.userData?.mapGenerated ||
				child.userData?.isTerrain ||
				child.userData?.persistentGround
			)
				continue;
			if (
				child.userData?.isBiomeEntrance ||
				child.userData?.biomeBoundary ||
				child.userData?.isCornucopia ||
				child.userData?.isTowerStructure
			)
				continue;
			const bounds = new THREE.Box3().setFromObject(child);
			if (bounds.isEmpty()) continue;
			const center = bounds.getCenter(new THREE.Vector3());
			const size = bounds.getSize(new THREE.Vector3());
			const padding = Math.min(8, Math.hypot(size.x, size.z) * 0.5);
			if (corridorHit(center.x, center.z, padding)) this.scene.remove(child);
		}
		this.colliders = this.colliders.filter((collider) => {
			if (
				!collider?.min ||
				!collider?.max ||
				collider.isBiomeEntrance ||
				collider.biomeBoundary ||
				collider.isCornucopia ||
				collider.isTowerStructure
			)
				return true;
			const x = (collider.min.x + collider.max.x) * 0.5;
			const z = (collider.min.z + collider.max.z) * 0.5;
			const padding = Math.min(
				8,
				Math.hypot(
					collider.max.x - collider.min.x,
					collider.max.z - collider.min.z,
				) * 0.5,
			);
			return !corridorHit(x, z, padding);
		});
		this._chestSpots = this._chestSpots.filter(
			(spot) => !corridorHit(spot.x, spot.z, 1.5),
		);
		this._traps = this._traps.filter(
			(trap) =>
				!corridorHit(trap.position.x, trap.position.z, trap.radius || 1),
		);
	}

	_clearResidenceFootprint(x, z, width, depth) {
		const padding = 1.5;
		const minX = x - width * 0.5 - padding;
		const maxX = x + width * 0.5 + padding;
		const minZ = z - depth * 0.5 - padding;
		const maxZ = z + depth * 0.5 + padding;
		const area = new THREE.Box3(
			new THREE.Vector3(minX, -1, minZ),
			new THREE.Vector3(maxX, 24, maxZ),
		);
		for (const child of [...this.scene.children]) {
			if (!child.userData?.mapGenerated) continue;
			if (
				child.userData?.isTerrain ||
				child.userData?.persistentGround ||
				child.userData?.biomeBoundary ||
				child.userData?.isCornucopia
			)
				continue;
			const bounds = new THREE.Box3().setFromObject(child);
			if (bounds.isEmpty()) continue;
			const size = bounds.getSize(new THREE.Vector3());
			if (size.x > 36 || size.z > 36 || !bounds.intersectsBox(area)) continue;
			this.scene.remove(child);
		}
		this.colliders = this.colliders.filter((collider) => {
			if (
				!collider?.min ||
				!collider?.max ||
				collider.biomeBoundary ||
				collider.isCornucopia
			)
				return true;
			if (collider.walkable && collider.max.y <= 0.6) return true;
			return (
				collider.max.x < minX ||
				collider.min.x > maxX ||
				collider.max.z < minZ ||
				collider.min.z > maxZ
			);
		});
		this._buildings = this._buildings.filter(
			(building) =>
				Math.abs(building.x - x) > width || Math.abs(building.z - z) > depth,
		);
		this._chestSpots = this._chestSpots.filter(
			(spot) =>
				spot.x < minX || spot.x > maxX || spot.z < minZ || spot.z > maxZ,
		);
		this._traps = this._traps.filter(
			(trap) =>
				trap.position.x < minX ||
				trap.position.x > maxX ||
				trap.position.z < minZ ||
				trap.position.z > maxZ,
		);
	}

	_addBiomeResidence(x, z, biome) {
		const styles = {
			forest: {
				wall: 0x5a3826,
				trim: 0x2d1a12,
				roof: 0x29472c,
				floor: 0x745038,
				window: 0xffca72,
			},
			maze: {
				wall: 0x686762,
				trim: 0x393b3d,
				roof: 0x4c4b48,
				floor: 0x77736b,
				window: 0xffb65c,
			},
			military: {
				wall: 0x58614a,
				trim: 0x30372a,
				roof: 0x41493a,
				floor: 0x66695d,
				window: 0xf0b85a,
			},
			ice: {
				wall: 0xb9d9e9,
				trim: 0x638ca8,
				roof: 0x8bc5df,
				floor: 0xdcecf4,
				window: 0x78d7ff,
			},
		};
		const style = styles[biome];
		const group = new THREE.Group();
		group.position.set(x, 0, z);
		group.userData.mapGenerated = true;
		group.userData.isBiomeResidence = true;
		const wallMat = this.pool.getMatStd(
			style.wall,
			0.78,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const trimMat = this.pool.getMatStd(
			style.trim,
			0.82,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const roofMat = this.pool.getMatStd(
			style.roof,
			0.74,
			0.04,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const floorMat = this.pool.getMatStd(
			style.floor,
			0.86,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const windowMat = this.pool.getMatStd(
			style.window,
			0.25,
			0.08,
			false,
			true,
			0.85,
			style.window,
			0.7,
			true,
		);
		const w = 18;
		const d = 14;
		const wallH = 8.4;
		const wallT = 0.5;
		const descriptors = [];
		const addBox = (
			bw,
			bh,
			bd,
			bx,
			by,
			bz,
			material,
			wall = false,
			walkable = false,
			collidable = true,
			navigationPassage = false,
		) => {
			const mesh = new THREE.Mesh(this.pool.getGeoBox(bw, bh, bd), material);
			mesh.position.set(bx, by, bz);
			mesh.userData.mapGenerated = true;
			mesh.userData.isWall = wall;
			mesh.userData.walkable = walkable;
			mesh.frustumCulled = false;
			group.add(mesh);
			if (collidable)
				descriptors.push({
					bw,
					bh,
					bd,
					bx,
					by,
					bz,
					wall,
					walkable,
					navigationPassage,
				});
			return mesh;
		};

		addBox(w, 0.3, d, 0, -0.01, 0, floorMat, false, true);
		addBox(12, 0.3, d, 2.5, 4.15, 0, floorMat, false, true);
		addBox(3.2, 0.3, 3.4, -4.9, 4.15, -1.4, floorMat, false, true);
		addBox(13.1, 0.3, d, -2.45, 8.35, 0, roofMat, false, true);
		addBox(0.3, 0.3, d, 8.85, 8.35, 0, roofMat, false, true);
		addBox(4.6, 0.3, 3.6, 6.4, 8.35, -5.2, roofMat, false, true);
		addBox(4.6, 0.3, 2.4, 6.4, 8.35, 5.8, roofMat, false, true);

		addBox(w, wallH, wallT, 0, wallH * 0.5, -d * 0.5, wallMat, true);
		addBox(wallT, wallH, d, -w * 0.5, wallH * 0.5, 0, wallMat, true);
		addBox(wallT, wallH, d, w * 0.5, wallH * 0.5, 0, wallMat, true);
		addBox(7.5, wallH, wallT, -5.25, wallH * 0.5, d * 0.5, wallMat, true);
		addBox(7.5, wallH, wallT, 5.25, wallH * 0.5, d * 0.5, wallMat, true);
		addBox(3, 5.2, wallT, 0, 5.8, d * 0.5, wallMat, true, false, true, true);

		const stairCount = 12;
		for (let i = 0; i < stairCount; i++) {
			const top = 0.45 + i * 0.36;
			addBox(
				3.2,
				0.36,
				0.82,
				-6.4,
				top - 0.18,
				5.2 - i * 0.66,
				trimMat,
				false,
				true,
			);
			const upperTop = 4.45 + i * 0.36;
			addBox(
				3.2,
				0.36,
				0.82,
				6.4,
				upperTop - 0.18,
				-5.2 + i * 0.66,
				trimMat,
				false,
				true,
			);
		}

		for (const side of [-1, 1]) {
			addBox(
				w,
				0.8,
				0.35,
				0,
				8.8,
				side * (d * 0.5 - 0.18),
				trimMat,
				true,
				false,
				true,
				true,
			);
			addBox(
				0.35,
				0.8,
				d,
				side * (w * 0.5 - 0.18),
				8.8,
				0,
				trimMat,
				true,
				false,
				true,
				true,
			);
		}

		for (const wx of [-5.5, 0, 5.5]) {
			addBox(
				2.1,
				1.45,
				0.08,
				wx,
				5.8,
				-d * 0.5 - 0.27,
				windowMat,
				false,
				false,
				false,
			);
		}
		for (const wz of [-4, 1.5]) {
			addBox(
				0.08,
				1.45,
				2.1,
				-w * 0.5 - 0.27,
				2.4,
				wz,
				windowMat,
				false,
				false,
				false,
			);
			addBox(
				0.08,
				1.45,
				2.1,
				w * 0.5 + 0.27,
				6.0,
				wz,
				windowMat,
				false,
				false,
				false,
			);
		}

		if (biome === "forest") {
			addBox(1.4, 2.4, 1.4, 5.8, 9.55, -3.8, trimMat, true, false, true, true);
		} else if (biome === "maze") {
			for (const cx of [-7.5, -2.5, 2.5, 7.5])
				addBox(1.2, 1.2, 1.2, cx, 9.4, -6.3, trimMat, true, false, true, true);
		} else if (biome === "military") {
			addBox(5.5, 1.2, 3.2, 3.5, 9.05, -3.5, trimMat, true, false, true, true);
		} else {
			for (const sx of [-5, 0, 5])
				addBox(1.1, 2.4, 1.1, sx, 9.55, -4.8, roofMat, true, false, true, true);
		}

		this.scene.add(group);
		for (const part of descriptors) {
			const collider = this.addColliderBox(
				new THREE.Vector3(x + part.bx, part.by, z + part.bz),
				part.bw,
				part.bh,
				part.bd,
				part.walkable,
			);
			collider.isBiomeResidence = true;
			collider.navigationPassage = part.navigationPassage;
		}
		const route = [
			new THREE.Vector3(x, 0.2, z + d * 0.5 + 2),
			new THREE.Vector3(x, 0.2, z + 3.8),
			new THREE.Vector3(x - 6.4, 0.4, z + 5.2),
			new THREE.Vector3(x - 6.4, 4.35, z - 1.4),
			new THREE.Vector3(x + 6.4, 4.45, z - 5.2),
			new THREE.Vector3(x + 6.4, 8.45, z + 2.06),
			new THREE.Vector3(x + 6.4, 8.55, z + 3.35),
			new THREE.Vector3(x + 2.8, 8.55, z + 3.35),
		];
		this._elevatedRoutes.push(route);
		this._buildings.push({
			x,
			z,
			w,
			d,
			route,
			template: { type: "biome_residence", biome },
		});
		this._registerChestSpot(x + 3.8, z - 3.8, `residence_${biome}`);
	}

	_addTwoStoryCabin(x, z) {
		const cabin = new THREE.Group();
		const wallMat = this.pool.getMatStd(
			0x5d4037,
			0.75,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const roofMat = this.pool.getMatStd(
			0x3e2723,
			0.85,
			0,
			true,
			false,
			1,
			0,
			0,
			false,
		);
		const woodMat = this.pool.getMatStd(
			0x795548,
			0.8,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);

		// Размеры хижины — более крупные и заметные
		const w = 14;
		const d = 12;
		const storyH = 5; // Высота этажа

		// Первый этаж - пол
		const floor1Geo = this.pool.getGeoBox(w, 0.3, d);
		const floor1 = new THREE.Mesh(floor1Geo, woodMat);
		floor1.position.set(0, 0.15, 0);
		floor1.userData.mapGenerated = true;
		floor1.userData.walkable = true;
		cabin.add(floor1);

		// Floor collider aligned with terrain surface (y=0.14) to prevent floating when walking near house
		this.addColliderBox(new THREE.Vector3(x, 0.07, z), w, 0.14, d, true);

		// Стены первого этажа
		const wallThick = 1.2;
		for (const side of [-1, 1]) {
			const sideGeo = this.pool.getGeoBox(wallThick, storyH, d);
			const sideWall = new THREE.Mesh(sideGeo, wallMat);
			sideWall.position.set((side * w) / 2, storyH / 2 + 0.3, 0);
			sideWall.userData.mapGenerated = true;
			sideWall.userData.isWall = true;
			cabin.add(sideWall);
		}

		// Передняя стена с дверью
		const doorW = 2.5;
		const doorH = 3.2;
		const frontWallLeft = this.pool.getGeoBox(
			w / 2 - doorW / 2 - 0.5,
			storyH,
			wallThick,
		);
		const frontWallRight = this.pool.getGeoBox(
			w / 2 - doorW / 2 - 0.5,
			storyH,
			wallThick,
		);
		const frontWallTop = this.pool.getGeoBox(
			w,
			storyH - doorH - 0.5,
			wallThick,
		);

		const fwl = new THREE.Mesh(frontWallLeft, wallMat);
		fwl.position.set(-w / 4 + doorW / 2 + 0.25, storyH / 2 + 0.3, d / 2);
		fwl.userData.mapGenerated = true;
		fwl.userData.isWall = true;
		cabin.add(fwl);

		const fwr = new THREE.Mesh(frontWallRight, wallMat);
		fwr.position.set(w / 4 - doorW / 2 - 0.25, storyH / 2 + 0.3, d / 2);
		fwr.userData.mapGenerated = true;
		fwr.userData.isWall = true;
		cabin.add(fwr);

		const fwt = new THREE.Mesh(frontWallTop, wallMat);
		fwt.position.set(0, doorH + (storyH - doorH - 0.5) / 2 + 0.3, d / 2);
		fwt.userData.mapGenerated = true;
		fwt.userData.isWall = true;
		cabin.add(fwt);

		// Задняя стена
		const backGeo = this.pool.getGeoBox(w, storyH, wallThick);
		const backWall = new THREE.Mesh(backGeo, wallMat);
		backWall.position.set(0, storyH / 2 + 0.3, -d / 2);
		backWall.userData.mapGenerated = true;
		backWall.userData.isWall = true;
		cabin.add(backWall);

		// Дверь
		const doorMat = this.pool.getMatStd(
			0x4e342e,
			0.9,
			0,
			false,
			false,
			1,
			0,
			0,
			false,
		);
		const doorGeo = this.pool.getGeoBox(doorW, doorH, 0.1);
		const door = new THREE.Mesh(doorGeo, doorMat);
		door.position.set(0, doorH / 2 + 0.3, d / 2 + 0.05);
		door.userData.mapGenerated = true;
		cabin.add(door);

		// Окна первого этажа
		const winMat = this.pool.getMatStd(
			0xfff9c4,
			0.3,
			0.1,
			false,
			false,
			1,
			0xfff9c4,
			0.1,
		);
		for (const side of [-1, 1]) {
			const winGeo = this.pool.getGeoBox(0.1, 1.2, 1.2);
			const win = new THREE.Mesh(winGeo, winMat);
			win.position.set((side * w) / 2 + 0.05, 2 + 0.3, 0);
			win.userData.mapGenerated = true;
			cabin.add(win);
		}

		// Лестница ВНУТРИ дома (справа от входа)
		const stairW = 2;
		const stairD = 7.5;
		const stairCount = 10;
		const stairRise = (storyH + 0.15) / stairCount;
		const stairStepD = stairD / stairCount;
		const stairX = w / 2 - stairW / 2 - 0.4;
		const stairStartZ = d / 2 - 1.1;
		for (let i = 0; i < stairCount; i++) {
			const stepH = (i + 1) * stairRise;
			const stepZ = stairStartZ - (i + 0.5) * stairStepD;
			const stepGeo = this.pool.getGeoBox(stairW, stepH, stairStepD);
			const step = new THREE.Mesh(stepGeo, woodMat);
			step.position.set(stairX, 0.3 + stepH / 2, stepZ);
			step.userData.mapGenerated = true;
			step.userData.walkable = true;
			cabin.add(step);
			this.addColliderBox(
				new THREE.Vector3(x + stairX, 0.3 + stepH / 2, z + stepZ),
				stairW,
				stepH,
				stairStepD,
				true,
			);
		}

		// Второй этаж - пол с проёмом для лестницы
		const floor2LeftW = w - stairW - 0.8;
		const floor2FrontD = Math.max(0.6, d / 2 - stairStartZ);
		const stairEndZ = stairStartZ - stairD;
		const floor2BackD = Math.max(0.6, stairEndZ + d / 2);
		const floor2YL = storyH + 0.15;

		const floor2LeftGeo = this.pool.getGeoBox(floor2LeftW, 0.3, d);
		const floor2Left = new THREE.Mesh(floor2LeftGeo, woodMat);
		floor2Left.position.set(-w / 2 + floor2LeftW / 2, floor2YL, 0);
		floor2Left.userData.mapGenerated = true;
		floor2Left.userData.walkable = true;
		cabin.add(floor2Left);

		const floor2RightGeo = this.pool.getGeoBox(stairW, 0.3, floor2FrontD);
		const floor2RightF = new THREE.Mesh(floor2RightGeo, woodMat);
		floor2RightF.position.set(stairX, floor2YL, d / 2 - floor2FrontD / 2);
		floor2RightF.userData.mapGenerated = true;
		floor2RightF.userData.walkable = true;
		cabin.add(floor2RightF);

		const floor2RightBGeo = this.pool.getGeoBox(stairW, 0.3, floor2BackD);
		const floor2RightB = new THREE.Mesh(floor2RightBGeo, woodMat);
		floor2RightB.position.set(stairX, floor2YL, -d / 2 + floor2BackD / 2);
		floor2RightB.userData.mapGenerated = true;
		floor2RightB.userData.walkable = true;
		cabin.add(floor2RightB);

		this.addColliderBox(
			new THREE.Vector3(x - w / 2 + floor2LeftW / 2, floor2YL, z),
			floor2LeftW,
			0.3,
			d,
			true,
		);
		this.addColliderBox(
			new THREE.Vector3(x + stairX, floor2YL, z + d / 2 - floor2FrontD / 2),
			stairW,
			0.3,
			floor2FrontD,
			true,
		);
		this.addColliderBox(
			new THREE.Vector3(x + stairX, floor2YL, z - d / 2 + floor2BackD / 2),
			stairW,
			0.3,
			floor2BackD,
			true,
		);

		// Стены второго этажа
		for (const side of [-1, 1]) {
			const sideGeo = this.pool.getGeoBox(wallThick, storyH, d);
			const sideWall = new THREE.Mesh(sideGeo, wallMat);
			sideWall.position.set((side * w) / 2, storyH + storyH / 2 + 0.3, 0);
			sideWall.userData.mapGenerated = true;
			sideWall.userData.isWall = true;
			cabin.add(sideWall);
		}

		// Передняя стена второго этажа
		const front2Geo = this.pool.getGeoBox(w, storyH, wallThick);
		const front2 = new THREE.Mesh(front2Geo, wallMat);
		front2.position.set(0, storyH + storyH / 2 + 0.3, d / 2);
		front2.userData.mapGenerated = true;
		front2.userData.isWall = true;
		cabin.add(front2);

		// Задняя стена второго этажа
		const back2 = new THREE.Mesh(front2Geo, wallMat);
		back2.position.set(0, storyH + storyH / 2 + 0.3, -d / 2);
		back2.userData.mapGenerated = true;
		back2.userData.isWall = true;
		cabin.add(back2);

		// Окна второго этажа
		for (const side of [-1, 1]) {
			const winGeo = this.pool.getGeoBox(0.1, 1.2, 1.2);
			const win = new THREE.Mesh(winGeo, winMat);
			win.position.set((side * w) / 2 + 0.05, storyH + 2 + 0.3, 0);
			win.userData.mapGenerated = true;
			cabin.add(win);
		}

		// Крыша
		const roofGeo = this.pool.getGeoCone(Math.max(w, d) * 0.75, 3, 4);
		const roof = new THREE.Mesh(roofGeo, roofMat);
		roof.position.set(0, storyH * 2 + 1.8, 0);
		roof.rotation.y = Math.PI / 4;
		roof.userData.mapGenerated = true;
		cabin.add(roof);

		// Сундук внутри (первый этаж, левый угол)
		const chestMat = this.pool.getMatStd(
			0x8b4513,
			0.7,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const chestGeo = this.pool.getGeoBox(1.2, 0.8, 0.8);
		const chest = new THREE.Mesh(chestGeo, chestMat);
		chest.position.set(-w / 2 + 2, 0.7, -d / 2 + 1.5);
		chest.userData.mapGenerated = true;
		cabin.add(chest);

		this.addColliderBox(
			new THREE.Vector3(x - w / 2 + 2, 0.7, z - d / 2 + 1.5),
			1.2,
			0.8,
			0.8,
			false,
		);

		// Сундук на втором этаже (правый угол, у стены)
		const chest2 = new THREE.Mesh(chestGeo, chestMat);
		chest2.position.set(-w / 2 + 2, storyH + 0.7, -d / 2 + 1.5);
		chest2.userData.mapGenerated = true;
		cabin.add(chest2);

		this.addColliderBox(
			new THREE.Vector3(x - w / 2 + 2, storyH + 0.7, z - d / 2 + 1.5),
			1.2,
			0.8,
			0.8,
			false,
		);

		cabin.position.set(x, 0, z);
		cabin.userData.mapGenerated = true;
		this.scene.add(cabin);

		// Wall colliders aligned with visual walls (centered at storyH/2 + 0.3, not storyH + 0.3)
		this.addColliderBox(
			new THREE.Vector3(x - w / 2, storyH / 2 + 0.3, z),
			wallThick,
			storyH,
			d,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(x + w / 2, storyH / 2 + 0.3, z),
			wallThick,
			storyH,
			d,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(x, storyH / 2 + 0.3, z - d / 2),
			w,
			storyH,
			wallThick,
			false,
		);
		const frontSegmentW = w / 2 - doorW / 2 - 0.5;
		this.addColliderBox(
			new THREE.Vector3(
				x - w / 4 + doorW / 2 + 0.25,
				storyH / 2 + 0.3,
				z + d / 2,
			),
			frontSegmentW,
			storyH,
			wallThick,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(
				x + w / 4 - doorW / 2 - 0.25,
				storyH / 2 + 0.3,
				z + d / 2,
			),
			frontSegmentW,
			storyH,
			wallThick,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(x, doorH + (storyH - doorH) / 2 + 0.3, z + d / 2),
			w,
			storyH - doorH,
			wallThick,
			false,
		);
		// Front wall full segment - aligned with visual wall center
		this.addColliderBox(
			new THREE.Vector3(x, storyH / 2 + 0.3, z + d / 2),
			w,
			storyH,
			wallThick,
			false,
		);
		this._buildings.push({ x, z, w, d, template: { type: "log_cabin" } });
		this._registerChestSpot(x - 3.5, z - 3.5, "house");
		this._registerChestSpot(x + 3.5, z - 3.5, "house");
		this._registerChestSpot(x - 3.5, z + 1.5, "house");
		this._registerChestSpot(x + 3.5, z + 1.5, "house");

		// Spawn pads managed by MapGeneratorNode.js — one per quadrant
	}

	/** Small 1-story wooden hut (6x8) — matches reference forest houses */
	_addSmallHut(x, z) {
		const hut = new THREE.Group();
		const wallMat = this.pool.getMatStd(
			0x8d6e63,
			0.8,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const roofMat = this.pool.getMatStd(
			0x5d4037,
			0.85,
			0,
			true,
			false,
			1,
			0,
			0,
			false,
		);
		const w = 10;
		const d = 12;
		const h = 5;

		// Floor
		const floorGeo = this.pool.getGeoBox(w, 0.3, d);
		const floor = new THREE.Mesh(floorGeo, wallMat);
		floor.position.set(0, 0.15, 0);
		floor.userData.mapGenerated = true;
		floor.userData.walkable = true;
		hut.add(floor);

		// Walls
		const wt = 0.3;
		for (const side of [-1, 1]) {
			const sw = new THREE.Mesh(this.pool.getGeoBox(wt, h, d), wallMat);
			sw.position.set((side * w) / 2, h / 2 + 0.3, 0);
			sw.userData.mapGenerated = true;
			sw.userData.isWall = true;
			hut.add(sw);
		}

		// Front wall with door
		const dw = 2.5,
			dh = 2.8;
		const fwL = new THREE.Mesh(
			this.pool.getGeoBox(w / 2 - dw / 2 - 0.3, h, wt),
			wallMat,
		);
		fwL.position.set(-w / 4 + dw / 2 + 0.15, h / 2 + 0.3, d / 2);
		fwL.userData.mapGenerated = true;
		fwL.userData.isWall = true;
		hut.add(fwL);

		const fwR = new THREE.Mesh(
			this.pool.getGeoBox(w / 2 - dw / 2 - 0.3, h, wt),
			wallMat,
		);
		fwR.position.set(w / 4 - dw / 2 - 0.15, h / 2 + 0.3, d / 2);
		fwR.userData.mapGenerated = true;
		fwR.userData.isWall = true;
		hut.add(fwR);

		const fwT = new THREE.Mesh(
			this.pool.getGeoBox(w, h - dh - 0.3, wt),
			wallMat,
		);
		fwT.position.set(0, dh + (h - dh - 0.3) / 2 + 0.3, d / 2);
		fwT.userData.mapGenerated = true;
		fwT.userData.isWall = true;
		hut.add(fwT);

		// Back wall
		const bw = new THREE.Mesh(this.pool.getGeoBox(w, h, wt), wallMat);
		bw.position.set(0, h / 2 + 0.3, -d / 2);
		bw.userData.mapGenerated = true;
		bw.userData.isWall = true;
		hut.add(bw);

		// Door
		const doorMat = this.pool.getMatStd(
			0x4e342e,
			0.9,
			0,
			false,
			false,
			1,
			0,
			0,
			false,
		);
		const door = new THREE.Mesh(this.pool.getGeoBox(dw, dh, 0.1), doorMat);
		door.position.set(0, dh / 2 + 0.3, d / 2 + 0.05);
		door.userData.mapGenerated = true;
		hut.add(door);

		// Window on back wall
		const winMat = this.pool.getMatStd(
			0xfff9c4,
			0.3,
			0.1,
			false,
			false,
			1,
			0xfff9c4,
			0.1,
		);
		const win = new THREE.Mesh(this.pool.getGeoBox(0.1, 1.2, 1.2), winMat);
		win.position.set(0, 2 + 0.3, -d / 2 - 0.05);
		win.userData.mapGenerated = true;
		hut.add(win);

		const roofGeo = this.pool.getGeoBox(w * 0.62, 0.45, d + 1.2);
		for (const side of [-1, 1]) {
			const roof = new THREE.Mesh(roofGeo, roofMat);
			roof.position.set(side * w * 0.23, h + 1.35, 0);
			roof.rotation.z = side * -0.52;
			roof.userData.mapGenerated = true;
			hut.add(roof);
		}

		// Chest inside
		const chestMat = this.pool.getMatStd(
			0x8b4513,
			0.7,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const chest = new THREE.Mesh(this.pool.getGeoBox(1.2, 0.8, 0.8), chestMat);
		chest.position.set(0, 0.7, -d / 4);
		chest.userData.mapGenerated = true;
		hut.add(chest);

		hut.position.set(x, 0, z);
		hut.userData.mapGenerated = true;
		this.scene.add(hut);

		// Floor collider
		this.addColliderBox(new THREE.Vector3(x, 0.15, z), w, 0.3, d, false);
		// Wall colliders — match visual walls exactly
		const frontSegmentW = w / 2 - dw / 2 - 0.3;
		this.addColliderBox(
			new THREE.Vector3(x - w / 2, h / 2 + 0.3, z),
			wt,
			h,
			d,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(x + w / 2, h / 2 + 0.3, z),
			wt,
			h,
			d,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(x, h / 2 + 0.3, z - d / 2),
			w,
			h,
			wt,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(x - w / 4 + dw / 2 + 0.15, h / 2 + 0.3, z + d / 2),
			frontSegmentW,
			h,
			wt,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(x + w / 4 - dw / 2 - 0.15, h / 2 + 0.3, z + d / 2),
			frontSegmentW,
			h,
			wt,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(x, dh + (h - dh - 0.3) / 2 + 0.3, z + d / 2),
			w,
			h - dh - 0.3,
			wt,
			false,
		);
	}

	_addForestBush(x, z) {
		const bush = new THREE.Group();
		bush.userData.mapGenerated = true;
		bush.userData.instancable = true;
		const bushMat = this.pool.getMat(0x388e3c, false);

		const count = 3 + Math.floor(this._rand() * 3);
		for (let i = 0; i < count; i++) {
			const size = 0.5 + this._rand() * 1.2;
			const geo = this.pool.getGeoDodecahedron(size);
			const mesh = new THREE.Mesh(geo, bushMat);
			mesh.userData.mapGenerated = true;
			mesh.userData.instancable = true;
			mesh.position.set(
				(this._rand() - 0.5) * 2,
				size * 0.6,
				(this._rand() - 0.5) * 2,
			);
			bush.add(mesh);
		}

		bush.position.set(x, 0, z);
		this.scene.add(bush);
		this.addColliderBox(new THREE.Vector3(x, 0.8, z), 3, 1.6, 3, false);
	}

	_addForestClearing(x, z) {
		// Clearing ground
		const clearingGeo = this.pool.getGeoDodecahedron(6);
		const clearingMat = this.pool.getMatStd(
			0x66bb6a,
			1.0,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const clearing = new THREE.Mesh(clearingGeo, clearingMat);
		clearing.rotation.x = -Math.PI / 2;
		clearing.position.set(x, 0.02, z);
		clearing.userData.mapGenerated = true;
		clearing.userData.walkable = true;
		this.scene.add(clearing);
		this.addColliderBox(new THREE.Vector3(x, 0.02, z), 12, 0.04, 12, false);
	}

	// Small flowers in forest
	_addForestFlowers(x, z) {
		const flowerMat = this.pool.getMatStd(
			0xffeb3b,
			0.8,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		for (let i = 0; i < 5; i++) {
			const flowerGeo = this.pool.getGeoSphere(0.15);
			const flower = new THREE.Mesh(flowerGeo, flowerMat);
			flower.position.set(
				x + (this._rand() - 0.5) * 3,
				0.3,
				z + (this._rand() - 0.5) * 3,
			);
			flower.userData.mapGenerated = true;
			this.scene.add(flower);
		}
	}

	_addForestTree(x, z, type = "pine") {
		if (Math.sqrt(x * x + z * z) < 75) return;
		if (this.getStructureAtPoint(x, z, 6)) return;
		const trunkMat = this.pool.getMatStd(
			COLORS.forestTrunk,
			0.8,
			0,
			false,
			false,
			1,
			0,
			0,
		);

		if (type === "pine") {
			this._addPineTree(x, z);
		} else if (type === "oak") {
			this._addOakTree(x, z);
		} else if (type === "birch") {
			this._addBirchTree(x, z);
		} else if (type === "spruce") {
			this._addSpruceTree(x, z);
		}
	}

	_addPineTree(x, z) {
		const trunkH = 14 + this._rand() * 10;
		const trunkR = 0.6 + this._rand() * 0.4;

		const trunkGeo = this.pool.getGeoCylinder(trunkR * 0.4, trunkR, trunkH);
		const trunkMat = this.pool.getMat(0x8b4513, false);
		const trunk = new THREE.Mesh(trunkGeo, trunkMat);
		trunk.position.set(x, trunkH / 2, z);
		trunk.userData.mapGenerated = true;
		this.scene.add(trunk);
		this.addColliderBox(
			new THREE.Vector3(x, trunkH / 2, z),
			trunkR * 2,
			trunkH,
			trunkR * 2,
			false,
		);

		const crownColors = [0x1b5e20, 0x2e7d32, 0x388e3c];
		const crownColor =
			crownColors[Math.floor(this._rand() * crownColors.length)];

		// Tall cone layers
		for (let layer = 0; layer < 5; layer++) {
			const layerR = 4 - layer * 0.7;
			const layerY = trunkH - 3 + layer * 3;
			const crownGeo = this.pool.getGeoCone(layerR, 4);
			const crownMat = this.pool.getMat(crownColor, false);
			const crown = new THREE.Mesh(crownGeo, crownMat);
			crown.position.set(x, layerY, z);
			crown.userData.mapGenerated = true;
			this.scene.add(crown);
		}
	}

	_addOakTree(x, z) {
		const trunkH = 8 + this._rand() * 6;
		const trunkR = 1.0 + this._rand() * 0.6;

		const trunkGeo = this.pool.getGeoCylinder(trunkR * 0.5, trunkR, trunkH);
		const trunkMat = this.pool.getMat(0x8b4513, false);
		const trunk = new THREE.Mesh(trunkGeo, trunkMat);
		trunk.position.set(x, trunkH / 2, z);
		trunk.userData.mapGenerated = true;
		this.scene.add(trunk);
		this.addColliderBox(
			new THREE.Vector3(x, trunkH / 2, z),
			trunkR * 2,
			trunkH,
			trunkR * 2,
			false,
		);

		const crownColors = [0x33691e, 0x4caf50, 0x66bb6a];
		const crownColor =
			crownColors[Math.floor(this._rand() * crownColors.length)];

		// Broad, rounded crown — multiple overlapping spheres
		const crownCount = 4 + Math.floor(this._rand() * 3);
		for (let i = 0; i < crownCount; i++) {
			const r = 2 + this._rand() * 2;
			const crownGeo = this.pool.getGeoDodecahedron(r);
			const crownMat = this.pool.getMat(crownColor, false);
			const crown = new THREE.Mesh(crownGeo, crownMat);
			crown.position.set(
				x + (this._rand() - 0.5) * 3,
				trunkH + (this._rand() - 0.5) * 2,
				z + (this._rand() - 0.5) * 3,
			);
			crown.userData.mapGenerated = true;
			this.scene.add(crown);
		}
	}

	_addBirchTree(x, z) {
		const trunkH = 16 + this._rand() * 8;
		const trunkR = 0.4 + this._rand() * 0.3;

		const trunkGeo = this.pool.getGeoCylinder(trunkR * 0.4, trunkR, trunkH);
		const birchMat = this.pool.getMat(0xf5f5f5, false);
		const trunk = new THREE.Mesh(trunkGeo, birchMat);
		trunk.position.set(x, trunkH / 2, z);
		trunk.userData.mapGenerated = true;
		this.scene.add(trunk);
		this.addColliderBox(
			new THREE.Vector3(x, trunkH / 2, z),
			trunkR * 2,
			trunkH,
			trunkR * 2,
			false,
		);

		// Small green clusters at top
		const crownColors = [0x7cb342, 0x8bc34a, 0x9ccc65];
		const crownColor =
			crownColors[Math.floor(this._rand() * crownColors.length)];

		const crownCount = 3 + Math.floor(this._rand() * 2);
		for (let i = 0; i < crownCount; i++) {
			const r = 1.5 + this._rand() * 1.5;
			const crownGeo = this.pool.getGeoDodecahedron(r);
			const crownMat = this.pool.getMat(crownColor, false);
			const crown = new THREE.Mesh(crownGeo, crownMat);
			crown.position.set(
				x + (this._rand() - 0.5) * 2,
				trunkH - 1 + (this._rand() - 0.5) * 3,
				z + (this._rand() - 0.5) * 2,
			);
			crown.userData.mapGenerated = true;
			this.scene.add(crown);
		}
	}

	_addSpruceTree(x, z) {
		const trunkH = 10 + this._rand() * 8;
		const trunkR = 0.5 + this._rand() * 0.4;

		const trunkGeo = this.pool.getGeoCylinder(trunkR * 0.4, trunkR, trunkH);
		const trunkMat = this.pool.getMat(0x8b4513, false);
		const trunk = new THREE.Mesh(trunkGeo, trunkMat);
		trunk.position.set(x, trunkH / 2, z);
		trunk.userData.mapGenerated = true;
		this.scene.add(trunk);
		this.addColliderBox(
			new THREE.Vector3(x, trunkH / 2, z),
			trunkR * 2,
			trunkH,
			trunkR * 2,
			false,
		);

		// Spruce: wide, layered cone shape
		const crownColors = [0x004d40, 0x00695c, 0x00897b];
		const crownColor =
			crownColors[Math.floor(this._rand() * crownColors.length)];

		for (let layer = 0; layer < 6; layer++) {
			const layerR = 5 - layer * 0.7;
			const layerY = trunkH - 5 + layer * 2.5;
			const crownGeo = this.pool.getGeoCone(layerR, 3);
			const crownMat = this.pool.getMat(crownColor, false);
			const crown = new THREE.Mesh(crownGeo, crownMat);
			crown.position.set(x, layerY, z);
			crown.userData.mapGenerated = true;
			this.scene.add(crown);
		}
	}

	_addFallenLog(x, z) {
		if (this.getStructureAtPoint(x, z, 6)) return;
		const length = 4 + this._rand() * 4;
		const radius = 0.4 + this._rand() * 0.3;
		const geo = this.pool.getGeoCylinder(radius * 0.8, radius, length);
		const mat = this.pool.getMat(0x5d4037, false);
		const log = new THREE.Mesh(geo, mat);
		log.position.set(x, radius, z);
		log.rotation.z = Math.PI / 2;
		log.rotation.y = this._rand() * Math.PI;
		log.userData.mapGenerated = true;
		this.scene.add(log);
		this.addColliderBox(
			new THREE.Vector3(x, radius, z),
			length,
			radius * 1.4,
			radius * 1.4,
			false,
		);
	}

	_generateForestPaths() {
		const pathMat = this.pool.getMatStd(
			COLORS.forestPath,
			1.0,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const c = -64;
		const routes = [
			[
				[-123, -64],
				[-101, -65],
				[-82, -66],
				[c, c],
			],
			[
				[c, c],
				[-55, -55],
				[-48, -48],
				[-42, -42],
			],
			[
				[c, c],
				[-73, -82],
				[-91, -101],
				[-112, -122],
			],
			[
				[c, c],
				[-51, -78],
				[-38, -96],
				[-22, -116],
			],
			[
				[c, c],
				[-80, -51],
				[-99, -37],
				[-120, -22],
			],
		];
		for (const route of routes) {
			for (let p = 0; p < route.length - 1; p++) {
				const [x1, z1] = route[p];
				const [x2, z2] = route[p + 1];
				const dx = x2 - x1;
				const dz = z2 - z1;
				const distance = Math.hypot(dx, dz);
				const count = Math.ceil(distance / 7);
				const angle = Math.atan2(dx, dz);
				for (let i = 0; i <= count; i++) {
					const t = i / count;
					const seg = new THREE.Mesh(
						this.pool.getGeoBox(8.5, 0.04, 8.5),
						pathMat,
					);
					seg.position.set(x1 + dx * t, 0.055, z1 + dz * t);
					seg.rotation.y = angle;
					seg.userData.mapGenerated = true;
					seg.userData.persistentGround = true;
					seg.frustumCulled = false;
					seg.renderOrder = 1;
					this.scene.add(seg);
				}
			}
		}
	}

	_isForestPathClearance(x, z) {
		const segments = [
			[-123, -64, -101, -65],
			[-101, -65, -82, -66],
			[-82, -66, -64, -64],
			[-64, -64, -55, -55],
			[-55, -55, -48, -48],
			[-48, -48, -42, -42],
			[-64, -64, -73, -82],
			[-73, -82, -91, -101],
			[-91, -101, -112, -122],
			[-64, -64, -51, -78],
			[-51, -78, -38, -96],
			[-38, -96, -22, -116],
			[-64, -64, -80, -51],
			[-80, -51, -99, -37],
			[-99, -37, -120, -22],
		];
		return segments.some(([x1, z1, x2, z2]) => {
			const dx = x2 - x1;
			const dz = z2 - z1;
			const t = Math.max(
				0,
				Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)),
			);
			return Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t)) < 7;
		});
	}

	_addEdgeTrees(startX, startZ, size) {
		const treeTypes = ["pine", "oak", "spruce"];
		const add = (x, z) =>
			this._addForestTree(
				x + (this._rand() - 0.5) * 3,
				z + (this._rand() - 0.5) * 3,
				treeTypes[Math.floor(this._rand() * treeTypes.length)],
			);
		for (let i = 10; i < size - 10; i += 14) {
			add(startX + 5, startZ + i);
			add(startX + size - 5, startZ + i);
			add(startX + i, startZ + 5);
			add(startX + i, startZ + size - 5);
		}
	}

	_addClearingRocks(cx, cz, radius) {
		const rockMat = this.pool.getMatStd(
			0x757575,
			0.95,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const mossMat = this.pool.getMatStd(0x4caf50, 1.0, 0, true, false, 1, 0, 0);

		// Scattered rocks around clearing edge
		for (let i = 0; i < 12; i++) {
			const angle = (i / 12) * Math.PI * 2 + (this._rand() - 0.5) * 0.3;
			const dist = radius * 0.6 + this._rand() * (radius * 0.4);
			const rx = cx + Math.cos(angle) * dist;
			const rz = cz + Math.sin(angle) * dist;
			const size = 0.3 + this._rand() * 0.8;
			const geo = this.pool.getGeoDodecahedron(size);
			const rock = new THREE.Mesh(
				geo,
				Math.random() > 0.3
					? this.pool.getMat(0x757575, false)
					: this.pool.getMat(0x4caf50, false),
			);
			rock.position.set(rx, size * 0.3, rz);
			rock.rotation.set(
				this._rand() * Math.PI,
				this._rand() * Math.PI,
				this._rand() * Math.PI,
			);
			rock.userData.mapGenerated = true;
			rock.userData.instancable = true;
			this.scene.add(rock);
			this.addColliderBox(
				new THREE.Vector3(rx, size * 0.3, rz),
				size * 1.15,
				size * 0.7,
				size * 1.15,
				false,
			);
		}

		// Moss patches on clearing ground — flat patches, not floating spheres
		for (let i = 0; i < 8; i++) {
			const mx = cx + (this._rand() - 0.5) * radius * 1.2;
			const mz = cz + (this._rand() - 0.5) * radius * 1.2;
			const mossGeo = new THREE.CircleGeometry(0.5 + this._rand() * 0.8, 8);
			const moss = new THREE.Mesh(mossGeo, this.pool.getMat(0x4caf50, false));
			moss.rotation.x = -Math.PI / 2;
			moss.position.set(mx, 0.04, mz);
			moss.userData.mapGenerated = true;
			moss.userData.instancable = true;
			this.scene.add(moss);
		}
	}

	_addCampfire(cx, cz) {
		const campfire = new THREE.Group();

		// Stone ring
		const stoneMat = this.pool.getMatStd(
			0x616161,
			0.9,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		for (let i = 0; i < 4; i++) {
			const angle = (i / 8) * Math.PI * 2;
			const stoneGeo = this.pool.getGeoDodecahedron(0.3);
			const stone = new THREE.Mesh(stoneGeo, stoneMat);
			stone.position.set(Math.cos(angle) * 0.8, 0.2, Math.sin(angle) * 0.8);
			stone.rotation.set(this._rand(), this._rand(), this._rand());
			stone.userData.mapGenerated = true;
			campfire.add(stone);
		}

		// Logs
		const logMat = this.pool.getMatStd(0x5d4037, 1.0, 0, true, false, 1, 0, 0);
		for (let i = 0; i < 3; i++) {
			const logGeo = this.pool.getGeoCylinder(0.1, 0.12, 1.2);
			const log = new THREE.Mesh(logGeo, logMat);
			log.position.set(0, 0.3, 0);
			log.rotation.z = Math.PI / 2 + (i - 1) * 0.3;
			log.rotation.y = (i * Math.PI) / 3;
			log.userData.mapGenerated = true;
			campfire.add(log);
		}

		// Fire glow (emissive sphere)
		const fireMat = this.pool.getMatStd(
			0xff6600,
			0.9,
			0,
			true,
			true,
			0.8,
			0xff4400,
			5.0,
		);
		const fireGeo = this.pool.getGeoSphere(0.4);
		const fire = new THREE.Mesh(fireGeo, fireMat);
		fire.position.set(0, 0.6, 0);
		fire.userData.isCampfire = true;
		fire.userData.mapGenerated = true;
		campfire.add(fire);

		campfire.position.set(cx, 0, cz);
		campfire.userData.mapGenerated = true;
		this.scene.add(campfire);

		// Barrels near campfire
		this._addBarrel(cx + 3, cz + 2);
		this._addBarrel(cx - 2, cz + 3);
	}

	_addBarrel(x, z) {
		const barrel = new THREE.Group();
		const barrelMat = this.pool.getMatStd(
			0x8d6e63,
			0.9,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const bandMat = this.pool.getMatStd(
			0x424242,
			0.8,
			0.5,
			true,
			false,
			1,
			0,
			0,
		);

		// Barrel body
		const bodyGeo = this.pool.getGeoCylinder(0.5, 0.6, 1.2);
		const body = new THREE.Mesh(bodyGeo, barrelMat);
		body.position.y = 0.6;
		body.userData.mapGenerated = true;
		barrel.add(body);

		// Metal bands
		for (const y of [0.3, 0.9]) {
			const bandGeo = new THREE.TorusGeometry(0.55, 0.04, 6, 12);
			const band = new THREE.Mesh(bandGeo, bandMat);
			band.position.y = y;
			band.rotation.x = Math.PI / 2;
			band.userData.mapGenerated = true;
			barrel.add(band);
		}

		barrel.position.set(x, 0, z);
		barrel.userData.mapGenerated = true;
		barrel.userData.isBarrel = true;
		this.scene.add(barrel);
		this.addColliderBox(new THREE.Vector3(x, 0.6, z), 1.3, 1.2, 1.3, false);
	}

	_addFireflies(startX, startZ, size, cx, cz) {
		const fireflyMat = this.pool.getMatStd(
			0xffee58,
			0.9,
			0,
			true,
			true,
			0.9,
			0xffcc00,
			10.0,
		);

		for (let i = 0; i < 10; i++) {
			const angle = this._rand() * Math.PI * 2;
			const dist = 20 + this._rand() * (size * 0.35);
			const fx = cx + Math.cos(angle) * dist;
			const fz = cz + Math.sin(angle) * dist;
			const fy = 1 + this._rand() * 3;

			const geo = this.pool.getGeoSphere(0.1);
			const firefly = new THREE.Mesh(geo, fireflyMat);
			firefly.position.set(fx, fy, fz);
			firefly.userData.isFirefly = true;
			firefly.userData.baseY = fy;
			firefly.userData.angle = angle;
			firefly.userData.speed = 0.3 + this._rand() * 0.5;
			firefly.userData.radius = dist;
			firefly.userData.center = { x: cx, z: cz };
			firefly.userData.blinkRate = 0.5 + this._rand() * 2;
			firefly.userData.blinkPhase = this._rand() * Math.PI * 2;
			firefly.userData.mapGenerated = true;
			this.scene.add(firefly);
		}
	}

	_addForestPOI(startX, startZ, size, cx, cz) {
		const poiPositions = [
			{ x: cx - 40, z: cz - 30, type: "weapon" },
			{ x: cx + 35, z: cz - 25, type: "medkit" },
			{ x: cx - 25, z: cz + 35, type: "ammo" },
			{ x: cx + 40, z: cz + 30, type: "weapon" },
			{ x: cx - 50, z: cz + 10, type: "medkit" },
			{ x: cx + 20, z: cz - 45, type: "ammo" },
			{ x: cx - 15, z: cz - 50, type: "weapon" },
			{ x: cx + 45, z: cz + 10, type: "medkit" },
		];

		for (const poi of poiPositions) {
			if (this._distToClearing(poi.x, poi.z, cx, cz, 35)) continue;
			if (this.getStructureAtPoint(poi.x, poi.z, 4)) continue;

			if (poi.type === "weapon") {
				this._addWeaponDrop(poi.x, poi.z);
			} else if (poi.type === "medkit") {
				this._addMedkitDrop(poi.x, poi.z);
			} else {
				this._addAmmoDrop(poi.x, poi.z);
			}
		}
	}

	_addWeaponDrop(x, z) {
		const drop = new THREE.Group();
		const mat = this.pool.getMatStd(
			0xff6600,
			0.5,
			0,
			true,
			false,
			1,
			0xff4400,
			2.0,
		);

		// Glowing crate
		const boxGeo = this.pool.getGeoBox(1.2, 0.8, 0.8);
		const box = new THREE.Mesh(boxGeo, mat);
		box.position.y = 0.4;
		box.userData.mapGenerated = true;
		drop.add(box);

		drop.position.set(x, 0, z);
		drop.userData.isPOI = true;
		drop.userData.poiType = "weapon";
		drop.userData.baseY = 0;
		drop.userData.phase = this._rand() * Math.PI * 2;
		drop.userData.mapGenerated = true;
		this.scene.add(drop);
		this._interactivePOIs.push(drop);
	}

	_addMedkitDrop(x, z) {
		const drop = new THREE.Group();
		const mat = this.pool.getMatStd(
			0xffffff,
			0.5,
			0,
			true,
			false,
			1,
			0xff0000,
			2.0,
		);

		const boxGeo = this.pool.getGeoBox(1.0, 0.6, 0.7);
		const box = new THREE.Mesh(boxGeo, mat);
		box.position.y = 0.3;
		box.userData.mapGenerated = true;
		drop.add(box);

		// Red cross
		const crossMat = this.pool.getMatStd(
			0xff0000,
			0.9,
			0,
			false,
			false,
			1,
			0xff0000,
			3.0,
		);
		const hGeo = this.pool.getGeoBox(0.6, 0.05, 0.15);
		const h = new THREE.Mesh(hGeo, crossMat);
		h.position.set(0, 0.63, 0);
		h.userData.mapGenerated = true;
		drop.add(h);
		const vGeo = this.pool.getGeoBox(0.15, 0.05, 0.5);
		const v = new THREE.Mesh(vGeo, crossMat);
		v.position.set(0, 0.63, 0);
		v.userData.mapGenerated = true;
		drop.add(v);

		drop.position.set(x, 0, z);
		drop.userData.isPOI = true;
		drop.userData.poiType = "medkit";
		drop.userData.baseY = 0;
		drop.userData.phase = this._rand() * Math.PI * 2;
		drop.userData.mapGenerated = true;
		this.scene.add(drop);
		this._interactivePOIs.push(drop);
	}

	_addAmmoDrop(x, z) {
		const drop = new THREE.Group();
		const mat = this.pool.getMatStd(
			0x4caf50,
			0.5,
			0,
			true,
			false,
			1,
			0x2e7d32,
			2.0,
		);

		const boxGeo = this.pool.getGeoBox(0.8, 0.5, 0.6);
		const box = new THREE.Mesh(boxGeo, mat);
		box.position.y = 0.25;
		box.userData.mapGenerated = true;
		drop.add(box);

		drop.position.set(x, 0, z);
		drop.userData.isPOI = true;
		drop.userData.poiType = "ammo";
		drop.userData.baseY = 0;
		drop.userData.phase = this._rand() * Math.PI * 2;
		drop.userData.mapGenerated = true;
		this.scene.add(drop);
		this._interactivePOIs.push(drop);
	}

	getNearestInteractivePOI(position, radius = 3.2) {
		let nearest = null;
		let bestSq = radius * radius;
		for (const poi of this._interactivePOIs) {
			if (!poi?.parent || !poi.visible || poi.userData.used) continue;
			const dx = poi.position.x - position.x;
			const dy = poi.position.y - position.y;
			const dz = poi.position.z - position.z;
			const distSq = dx * dx + dy * dy + dz * dz;
			if (distSq >= bestSq) continue;
			nearest = poi;
			bestSq = distSq;
		}
		return nearest;
	}

	consumeInteractivePOI(poi) {
		if (!poi || poi.userData.used) return false;
		poi.userData.used = true;
		poi.visible = false;
		return true;
	}

	_addLogCabin(x, z) {
		const cabin = new THREE.Group();
		const wallMat = this.pool.getMatStd(
			0x5d4037,
			0.75,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const roofMat = this.pool.getMatStd(
			0x3e2723,
			0.85,
			0,
			true,
			false,
			1,
			0,
			0,
			false,
		);

		// Large cabin
		const w = 14 + this._rand() * 6;
		const d = 10 + this._rand() * 4;
		const h = 8;

		// Walls
		const wallThick = 0.3;
		for (const side of [-1, 1]) {
			const sideGeo = this.pool.getGeoBox(wallThick, h, d);
			const sideWall = new THREE.Mesh(sideGeo, wallMat);
			sideWall.position.set((side * w) / 2, h / 2, 0);
			sideWall.userData.mapGenerated = true;
			sideWall.userData.isWall = true;
			cabin.add(sideWall);
		}

		const doorW = 2.5;
		const doorH = 2.8;
		const frontLeftW = w / 2 - doorW / 2 - 0.5;
		const frontRightW = w / 2 - doorW / 2 - 0.5;
		const frontTopH = h - doorH - 0.5;
		const doorMat = this.pool.getMatStd(
			0x4e342e,
			0.9,
			0,
			false,
			false,
			1,
			0,
			0,
			false,
		);
		if (frontLeftW > 0) {
			const fl = new THREE.Mesh(
				this.pool.getGeoBox(frontLeftW, h, wallThick),
				wallMat,
			);
			fl.position.set(-frontLeftW / 2 - 0.5, h / 2, d / 2);
			fl.userData.mapGenerated = true;
			fl.userData.isWall = true;
			cabin.add(fl);
		}
		if (frontRightW > 0) {
			const fr = new THREE.Mesh(
				this.pool.getGeoBox(frontRightW, h, wallThick),
				wallMat,
			);
			fr.position.set(frontRightW / 2 + 0.5, h / 2, d / 2);
			fr.userData.mapGenerated = true;
			fr.userData.isWall = true;
			cabin.add(fr);
		}
		if (frontTopH > 0) {
			const ft = new THREE.Mesh(
				this.pool.getGeoBox(w, frontTopH, wallThick),
				wallMat,
			);
			ft.position.set(0, doorH + frontTopH / 2, d / 2);
			ft.userData.mapGenerated = true;
			ft.userData.isWall = true;
			cabin.add(ft);
		}
		const door = new THREE.Mesh(
			this.pool.getGeoBox(doorW, doorH, 0.1),
			doorMat,
		);
		door.position.set(0, doorH / 2, d / 2 + 0.05);
		door.userData.mapGenerated = true;
		door.userData.isWall = false;
		cabin.add(door);

		const backGeo = this.pool.getGeoBox(w, h, wallThick);
		const back = new THREE.Mesh(backGeo, wallMat);
		back.position.set(0, h / 2, -d / 2);
		back.userData.mapGenerated = true;
		back.userData.isWall = true;
		cabin.add(back);

		// Roof (pitched)
		const roofGeo = this.pool.getGeoCone(Math.max(w, d) * 0.7, 3, 4);
		const roof = new THREE.Mesh(roofGeo, roofMat);
		roof.position.set(0, h + 1.5, 0);
		roof.rotation.y = Math.PI / 4;
		roof.userData.mapGenerated = true;
		cabin.add(roof);

		// Windows
		const winMat = this.pool.getMatStd(
			0xfff9c4,
			0.3,
			0.1,
			false,
			true,
			0.7,
			0,
			0,
		);
		for (const wx of [-2, 2]) {
			const winGeo = this.pool.getGeoBox(0.8, 1, 0.1);
			const win = new THREE.Mesh(winGeo, winMat);
			win.position.set(wx, h * 0.6, d / 2 + 0.1);
			win.userData.mapGenerated = true;
			cabin.add(win);
		}

		cabin.position.set(x, 0, z);
		cabin.userData.mapGenerated = true;
		this.scene.add(cabin);

		const frontSegmentW = (w - doorW) / 2;
		this.addColliderBox(
			new THREE.Vector3(x - w / 2, h / 2, z),
			wallThick,
			h,
			d,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(x + w / 2, h / 2, z),
			wallThick,
			h,
			d,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(x, h / 2, z - d / 2),
			w,
			h,
			wallThick,
			false,
		);
		if (frontSegmentW > 0) {
			this.addColliderBox(
				new THREE.Vector3(x - (doorW + frontSegmentW) / 2, h / 2, z + d / 2),
				frontSegmentW,
				h,
				wallThick,
				false,
			);
			this.addColliderBox(
				new THREE.Vector3(x + (doorW + frontSegmentW) / 2, h / 2, z + d / 2),
				frontSegmentW,
				h,
				wallThick,
				false,
			);
		}
		this.addColliderBox(
			new THREE.Vector3(x, doorH + (h - doorH - 0.5) / 2, z + d / 2),
			w,
			h - doorH - 0.5,
			wallThick,
			false,
		);
		this._buildings.push({ x, z, w, d, template: { type: "log_cabin" } });
	}

	_addForestRock(x, z) {
		const size = 0.5 + this._rand() * 1.5;
		const geo = this.pool.getGeoDodecahedron(size);
		const mat = this.pool.getMatStd(0x787878, 0.95, 0, true, false, 1, 0, 0);
		const rock = new THREE.Mesh(geo, mat);
		rock.position.set(x, size * 0.4, z);
		rock.rotation.set(
			this._rand() * Math.PI,
			this._rand() * Math.PI,
			this._rand() * Math.PI,
		);
		rock.userData.mapGenerated = true;
		rock.userData.instancable = true;
		this.scene.add(rock);
		this.addColliderBox(
			new THREE.Vector3(x, size * 0.4, z),
			size * 1.5,
			size * 0.8,
			size * 1.5,
			false,
		);
	}

	// =========================================================================
	// STONE MAZE QUADRANT (NE: x > 0, z < 0)
	// =========================================================================
	_generateMazeQuadrant() {
		// СВ квадрант: x в [10, 245], z в [-250, -10]
		const startX = 2;
		const startZ = -HALF + 2;
		const width = HALF - 4;
		const depth = HALF - 4;

		const wallHeight = 18; // Высокие стены замка

		const wallMat = this.pool.getMatStd(
			0x666666,
			0.85,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const darkMat = this.pool.getMatStd(
			COLORS.mazeTower,
			0.9,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);

		const margin = 3;
		const mazeCols = 11;
		const mazeRows = 11;
		const cellWidth = (width - margin * 2) / mazeCols;
		const cellDepth = (depth - margin * 2) / mazeRows;
		const cells = Array.from({ length: mazeRows }, () =>
			Array.from({ length: mazeCols }, () => ({
				visited: false,
				n: true,
				e: true,
				s: true,
				w: true,
			})),
		);
		const stack = [[0, 0]];
		cells[0][0].visited = true;
		const directions = [
			[-1, 0, "n", "s"],
			[0, 1, "e", "w"],
			[1, 0, "s", "n"],
			[0, -1, "w", "e"],
		];
		while (stack.length) {
			const [r, c] = stack[stack.length - 1];
			const candidates = [];
			for (const [dr, dc, side, opposite] of directions) {
				const nr = r + dr;
				const nc = c + dc;
				if (
					nr >= 0 &&
					nr < mazeRows &&
					nc >= 0 &&
					nc < mazeCols &&
					!cells[nr][nc].visited
				) {
					candidates.push([nr, nc, side, opposite]);
				}
			}
			if (!candidates.length) {
				stack.pop();
				continue;
			}
			const [nr, nc, side, opposite] =
				candidates[Math.floor(this._rand() * candidates.length)];
			cells[r][c][side] = false;
			cells[nr][nc][opposite] = false;
			cells[nr][nc].visited = true;
			stack.push([nr, nc]);
		}
		const clearingCX = startX + width * 0.5;
		const clearingCZ = startZ + depth * 0.5;
		const clearingRadius = 11.5;
		const entranceX = Math.cos(-Math.PI / 4) * 72;
		const entranceZ = Math.sin(-Math.PI / 4) * 72;
		const corridorStart = new THREE.Vector2(
			Math.cos(-Math.PI / 4) * 62,
			Math.sin(-Math.PI / 4) * 62,
		);
		const corridorEnd = new THREE.Vector2(
			Math.cos(-Math.PI / 4) * 106,
			Math.sin(-Math.PI / 4) * 106,
		);
		const corridorDelta = corridorEnd.clone().sub(corridorStart);
		const corridorLengthSq = corridorDelta.lengthSq();
		let hiddenMazeLoot = 0;
		for (let r = 0; r < mazeRows && hiddenMazeLoot < 28; r++) {
			for (let c = 0; c < mazeCols && hiddenMazeLoot < 28; c++) {
				const cell = cells[r][c];
				const adjacentWalls =
					Number(cell.n) + Number(cell.e) + Number(cell.s) + Number(cell.w);
				if (adjacentWalls !== 3) continue;
				this._registerChestSpot(
					startX + margin + (c + 0.5) * cellWidth,
					startZ + margin + (r + 0.5) * cellDepth,
					"maze",
				);
				hiddenMazeLoot++;
			}
		}

		const wallThickness = 1.35;
		const segments = [];
		const segmentKeys = new Set();
		const addSegment = (x, z, width, depth) => {
			if (Math.hypot(x, z) < 67) return;
			const point = new THREE.Vector2(x, z);
			const t = THREE.MathUtils.clamp(
				point.clone().sub(corridorStart).dot(corridorDelta) / corridorLengthSq,
				0,
				1,
			);
			const closest = corridorStart.clone().addScaledVector(corridorDelta, t);
			const normalExtent = (width + depth) * 0.36;
			if (point.distanceTo(closest) < 10 + normalExtent) return;
			if (Math.hypot(x - clearingCX, z - clearingCZ) < clearingRadius) return;
			const key = `${Math.round(x * 10)},${Math.round(z * 10)},${width > depth ? "h" : "v"}`;
			if (segmentKeys.has(key)) return;
			segmentKeys.add(key);
			segments.push({ x, z, width, depth });
		};
		for (let r = 0; r < mazeRows; r++) {
			for (let c = 0; c < mazeCols; c++) {
				const cell = cells[r][c];
				const cx = startX + margin + (c + 0.5) * cellWidth;
				const cz = startZ + margin + (r + 0.5) * cellDepth;
				if (r === 0 && cell.n)
					addSegment(
						cx,
						cz - cellDepth / 2,
						cellWidth + wallThickness,
						wallThickness,
					);
				if (c === 0 && cell.w)
					addSegment(
						cx - cellWidth / 2,
						cz,
						wallThickness,
						cellDepth + wallThickness,
					);
				if (cell.e)
					addSegment(
						cx + cellWidth / 2,
						cz,
						wallThickness,
						cellDepth + wallThickness,
					);
				if (cell.s)
					addSegment(
						cx,
						cz + cellDepth / 2,
						cellWidth + wallThickness,
						wallThickness,
					);
			}
		}
		const wallGeometry = this.pool.getGeoBox(1, 1, 1);
		const mazeWalls = new THREE.InstancedMesh(
			wallGeometry,
			wallMat,
			segments.length,
		);
		const matrix = new THREE.Matrix4();
		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			matrix.compose(
				new THREE.Vector3(segment.x, wallHeight / 2, segment.z),
				new THREE.Quaternion(),
				new THREE.Vector3(segment.width, wallHeight, segment.depth),
			);
			mazeWalls.setMatrixAt(i, matrix);
			this.addColliderBox(
				new THREE.Vector3(segment.x, wallHeight / 2, segment.z),
				segment.width,
				wallHeight,
				segment.depth,
				false,
			);
		}
		mazeWalls.instanceMatrix.needsUpdate = true;
		mazeWalls.computeBoundingSphere();
		mazeWalls.frustumCulled = false;
		mazeWalls.userData.mapGenerated = true;
		mazeWalls.userData.isMazeWalls = true;
		mazeWalls.userData.isWall = true;
		this.scene.add(mazeWalls);

		// Central tall tower with spiral staircase
		const towerCX = clearingCX;
		const towerCZ = clearingCZ;
		const towerHeight = 30;
		const towerRadius = 8;

		const towerWallSegments = 24;
		const towerDoorIndex =
			Math.round(
				(((Math.atan2(-towerCZ, -towerCX) + Math.PI * 2) % (Math.PI * 2)) /
					(Math.PI * 2)) *
					towerWallSegments,
			) % towerWallSegments;
		const towerDoorHeight = 3.4;
		const totalSteps = 120;
		const angleStep = 0.17;
		const exitAngle = (totalSteps - 1) * angleStep;
		const normalizedExitAngle =
			((exitAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
		const towerRoofExitHeight = 4.2;
		for (let i = 0; i < towerWallSegments; i++) {
			const angle = (i / towerWallSegments) * Math.PI * 2;
			const segmentLength =
				(2 * Math.PI * towerRadius) / towerWallSegments + 0.35;
			const sx = towerCX + Math.cos(angle) * towerRadius;
			const sz = towerCZ + Math.sin(angle) * towerRadius;
			const isDoor = i === towerDoorIndex;
			const exitDistance = Math.abs(
				Math.atan2(
					Math.sin(angle - normalizedExitAngle),
					Math.cos(angle - normalizedExitAngle),
				),
			);
			const isRoofExit = exitDistance < 1.3;
			const lowerGap = isDoor ? towerDoorHeight : 0;
			const upperGap = isRoofExit ? towerRoofExitHeight : 0;
			const segmentHeight = towerHeight - lowerGap - upperGap;
			const segmentY = lowerGap + segmentHeight / 2;
			const segment = new THREE.Mesh(
				this.pool.getGeoBox(0.8, segmentHeight, segmentLength),
				wallMat,
			);
			segment.position.set(sx, segmentY, sz);
			segment.rotation.y = -angle;
			segment.userData.mapGenerated = true;
			segment.userData.isWall = true;
			segment.userData.isPOI = true;
			segment.userData.isTowerStructure = true;
			segment.frustumCulled = false;
			this.scene.add(segment);
			// Account for rotation in collider — tower walls are rotated
			const cosA = Math.abs(Math.cos(angle));
			const sinA = Math.abs(Math.sin(angle));
			const wallCollider = this.addColliderBox(
				new THREE.Vector3(sx, segmentY, sz),
				0.8 * cosA + segmentLength * sinA,
				segmentHeight,
				0.8 * sinA + segmentLength * cosA,
				false,
			);
			wallCollider.isTowerStructure = true;
		}

		// Tower floor (visual + collider aligned with terrain surface to prevent floating collision)
		const floorGeo = this.pool.getGeoCylinder(towerRadius, towerRadius, 0.12);
		const floorMesh = new THREE.Mesh(floorGeo, darkMat);
		floorMesh.position.set(towerCX, 0.06, towerCZ);
		floorMesh.userData.mapGenerated = true;
		floorMesh.userData.walkable = true;
		floorMesh.userData.isTowerStructure = true;
		this.scene.add(floorMesh);
		// Collider top surface at y=0.18 (same as terrain surface) — center at y=0.06, height=0.12
		// This prevents the "invisible floating collider" that caused players to fall through when standing still near the tower
		const towerFloorCollider = this.addColliderBox(
			new THREE.Vector3(towerCX, 0.06, towerCZ),
			towerRadius * 2 - 1,
			0.12,
			towerRadius * 2 - 1,
			true,
		);
		towerFloorCollider.isTowerStructure = true;
		towerFloorCollider.surfaceCircle = {
			x: towerCX,
			z: towerCZ,
			radius: towerRadius - 0.5,
		};

		// Spiral staircase
		const stepH = towerHeight / totalSteps;
		const spiralR = towerRadius - 2;
		const stepWidth = 3.5;
		const stepDepth = 1.9;
		const stepGeo = this.pool.getGeoBox(stepWidth, stepH, stepDepth);
		const towerSteps = new THREE.InstancedMesh(stepGeo, darkMat, totalSteps);
		const stepMatrix = new THREE.Matrix4();
		const stepQuaternion = new THREE.Quaternion();
		const stepScale = new THREE.Vector3(1, 1, 1);
		const upAxis = new THREE.Vector3(0, 1, 0);

		for (let i = 0; i < totalSteps; i++) {
			const angle = i * angleStep;
			const stepY = i * stepH + stepH * 0.5 + 0.5;

			const sx = towerCX + Math.cos(angle) * spiralR;
			const sz = towerCZ + Math.sin(angle) * spiralR;
			const rotation = -angle + Math.PI / 2;
			stepQuaternion.setFromAxisAngle(upAxis, rotation);
			stepMatrix.compose(
				new THREE.Vector3(sx, stepY, sz),
				stepQuaternion,
				stepScale,
			);
			towerSteps.setMatrixAt(i, stepMatrix);
			// Shrink collider to stay inside tower walls (radius 8) — axis-aligned boxes at spiralR=6
			// would protrude outside through wall gaps and cause invisible floating for players outside
			const colliderCos = Math.abs(Math.cos(rotation));
			const colliderSin = Math.abs(Math.sin(rotation));
			const stairCollider = this.addColliderBox(
				new THREE.Vector3(sx, stepY, sz),
				stepWidth * colliderCos + stepDepth * colliderSin,
				stepH,
				stepWidth * colliderSin + stepDepth * colliderCos,
				true,
			);
			stairCollider.isTowerStair = true;
			stairCollider.isTowerStructure = true;
			stairCollider.towerInterior = {
				x: towerCX,
				z: towerCZ,
				radius: towerRadius - 0.55,
			};
			stairCollider.surfaceOBB = {
				x: sx,
				z: sz,
				halfWidth: stepWidth * 0.5 - 0.08,
				halfDepth: stepDepth * 0.5 - 0.08,
				rotation,
			};
		}
		towerSteps.instanceMatrix.needsUpdate = true;
		towerSteps.computeBoundingSphere();
		towerSteps.frustumCulled = false;
		towerSteps.userData.mapGenerated = true;
		towerSteps.userData.walkable = true;
		towerSteps.userData.isTowerStairs = true;
		towerSteps.userData.isTowerStructure = true;
		this.scene.add(towerSteps);

		const topY = towerHeight;
		const roofCellSize = 2;
		const roofRadius = 7.25;
		const roofCells = [];
		const radialX = Math.cos(exitAngle);
		const radialZ = Math.sin(exitAngle);
		const tangentX = -radialZ;
		const tangentZ = radialX;
		for (let dx = -6; dx <= 6; dx += roofCellSize) {
			for (let dz = -6; dz <= 6; dz += roofCellSize) {
				if (Math.hypot(dx, dz) > roofRadius - 0.4) continue;
				const u = tangentX * dx + tangentZ * dz;
				const v = radialX * dx + radialZ * dz;
				if (u > -7 && u < 3.6 && v > -0.5) continue;
				roofCells.push({
					x: towerCX + dx,
					z: towerCZ + dz,
				});
			}
		}
		const roofTiles = new THREE.InstancedMesh(
			this.pool.getGeoBox(roofCellSize, 0.5, roofCellSize),
			darkMat,
			roofCells.length,
		);
		const roofMatrix = new THREE.Matrix4();
		for (let i = 0; i < roofCells.length; i++) {
			const cell = roofCells[i];
			roofMatrix.makeTranslation(cell.x, topY + 0.25, cell.z);
			roofTiles.setMatrixAt(i, roofMatrix);
			const collider = this.addColliderBox(
				new THREE.Vector3(cell.x, topY + 0.25, cell.z),
				roofCellSize,
				0.5,
				roofCellSize,
				true,
			);
			collider.isTowerStructure = true;
		}
		roofTiles.instanceMatrix.needsUpdate = true;
		roofTiles.computeBoundingSphere();
		roofTiles.frustumCulled = false;
		roofTiles.userData.mapGenerated = true;
		roofTiles.userData.walkable = true;
		roofTiles.userData.isTowerStructure = true;
		this.scene.add(roofTiles);
		const towerRoute = [];
		const doorAngle = (towerDoorIndex / towerWallSegments) * Math.PI * 2;
		towerRoute.push(
			new THREE.Vector3(
				towerCX + Math.cos(doorAngle) * (towerRadius + 2.2),
				0.2,
				towerCZ + Math.sin(doorAngle) * (towerRadius + 2.2),
			),
		);
		towerRoute.push(
			new THREE.Vector3(
				towerCX + Math.cos(doorAngle) * (towerRadius - 2.4),
				0.4,
				towerCZ + Math.sin(doorAngle) * (towerRadius - 2.4),
			),
		);
		for (let i = 0; i < totalSteps; i += 10) {
			const angle = i * angleStep;
			towerRoute.push(
				new THREE.Vector3(
					towerCX + Math.cos(angle) * spiralR,
					i * stepH + 0.5,
					towerCZ + Math.sin(angle) * spiralR,
				),
			);
		}
		towerRoute.push(
			new THREE.Vector3(
				towerCX + Math.cos(exitAngle) * spiralR,
				topY + 0.5,
				towerCZ + Math.sin(exitAngle) * spiralR,
			),
		);
		towerRoute.push(
			new THREE.Vector3(
				towerCX + radialX * 4.8 + tangentX * 5,
				topY + 0.6,
				towerCZ + radialZ * 4.8 + tangentZ * 5,
			),
		);
		towerRoute.push(new THREE.Vector3(towerCX, topY + 0.6, towerCZ));
		this._elevatedRoutes.push(towerRoute);
		this._buildings.push({
			x: towerCX,
			z: towerCZ,
			w: towerRadius * 2,
			d: towerRadius * 2,
			route: towerRoute,
			template: { type: "maze_tower", biome: "maze" },
		});

		// Tower interior — torches and chests
		this._addTowerInterior(towerCX, towerCZ, towerHeight, towerRadius);

		// Corner towers
		const corners = [
			{
				x: startX + margin + cellWidth * 0.5,
				z: startZ + margin + cellDepth * 0.5,
			},
			{
				x: startX + margin + (mazeCols - 0.5) * cellWidth,
				z: startZ + margin + cellDepth * 0.5,
			},
			{
				x: startX + margin + (mazeCols - 0.5) * cellWidth,
				z: startZ + margin + (mazeRows - 0.5) * cellDepth,
			},
		];

		for (const tp of corners) {
			const tGeo = this.pool.getGeoCylinder(6, 7, wallHeight + 4);
			const tower = new THREE.Mesh(tGeo, wallMat);
			tower.position.set(tp.x, (wallHeight + 4) / 2, tp.z);
			tower.userData.mapGenerated = true;
			this.scene.add(tower);

			this.addColliderBox(
				new THREE.Vector3(tp.x, (wallHeight + 4) / 2, tp.z),
				14,
				wallHeight + 4,
				14,
				false,
			);

			const platGeo = this.pool.getGeoCylinder(6.5, 6.5, 0.8);
			const plat = new THREE.Mesh(platGeo, darkMat);
			plat.position.set(tp.x, wallHeight + 4.4, tp.z);
			plat.userData.mapGenerated = true;
			plat.userData.walkable = true;
			this.scene.add(plat);

			this.addColliderBox(
				new THREE.Vector3(tp.x, wallHeight + 4.4, tp.z),
				13,
				0.8,
				13,
				true,
			);

			// Torches on corner towers
			this._addCornerTowerTorch(tp.x, tp.z, wallHeight + 4.5);
		}

		// Battlements along outer perimeter walls (castle crenellations)

		// Castle gate at entrance from center (south-west side)
		this._addCastleGate(entranceX, entranceZ, wallHeight);
		this._addMazeToCenterPath(entranceX, entranceZ);
		this._addMazeMoss(segments, wallHeight);
	}

	_addMazeLootChests(cx, cz, radius) {
		const chestTypes = [
			{ color: 0xff6600, emissive: 0xff4400, name: "weapon" },
			{ color: 0xff6600, emissive: 0xff4400, name: "weapon" },
			{ color: 0xff0000, emissive: 0xff0000, name: "medkit" },
			{ color: 0x4caf50, emissive: 0x2e7d32, name: "ammo" },
			{ color: 0xff6600, emissive: 0xff4400, name: "weapon" },
			{ color: 0xff0000, emissive: 0xff0000, name: "medkit" },
			{ color: 0x4caf50, emissive: 0x2e7d32, name: "ammo" },
			{ color: 0xff6600, emissive: 0xff4400, name: "weapon" },
		];

		for (let i = 0; i < 4; i++) {
			const angle = (i / 8) * Math.PI * 2;
			const dist = radius * 0.6;
			const chestX = cx + Math.cos(angle) * dist;
			const chestZ = cz + Math.sin(angle) * dist;
			const type = chestTypes[i];

			const chest = new THREE.Group();
			const mat = this.pool.getMatStd(
				type.color,
				0.5,
				0,
				true,
				false,
				1,
				type.emissive,
				3.0,
			);

			// Box body
			const boxGeo = this.pool.getGeoBox(1.2, 0.8, 0.8);
			const box = new THREE.Mesh(boxGeo, mat);
			box.position.y = 0.4;
			box.userData.mapGenerated = true;
			chest.add(box);

			// Lid (half sphere on top)
			const lidGeo = this.pool.getGeoSphere(0.65);
			const lid = new THREE.Mesh(lidGeo, mat);
			lid.position.y = 0.8;
			lid.userData.mapGenerated = true;
			chest.add(lid);

			// Metal bands
			const bandMat = this.pool.getMatStd(
				0x424242,
				0.6,
				0.8,
				true,
				false,
				1,
				0,
				0,
			);
			for (const by of [0.2, 0.6]) {
				const bandGeo = new THREE.TorusGeometry(0.6, 0.04, 6, 12);
				const band = new THREE.Mesh(bandGeo, bandMat);
				band.position.y = by;
				band.rotation.x = Math.PI / 2;
				band.userData.mapGenerated = true;
				chest.add(band);
			}

			// Lock
			const lockGeo = this.pool.getGeoBox(0.2, 0.25, 0.1);
			const lock = new THREE.Mesh(lockGeo, bandMat);
			lock.position.set(0, 0.55, 0.45);
			lock.userData.mapGenerated = true;
			chest.add(lock);

			// Glow light
			const glowMat = this.pool.getMatStd(
				type.color,
				0.9,
				0,
				true,
				true,
				0.6,
				type.emissive,
				8.0,
			);
			const glowGeo = this.pool.getGeoSphere(0.9);
			const glow = new THREE.Mesh(glowGeo, glowMat);
			glow.position.y = 0.6;
			glow.userData.isGlow = true;
			glow.userData.mapGenerated = true;
			glow.userData.baseIntensity = 8.0;
			chest.add(glow);

			chest.position.set(chestX, 0, chestZ);
			chest.userData.isPOI = true;
			chest.userData.poiType = type.name;
			chest.userData.mapGenerated = true;
			this.scene.add(chest);

			this.addColliderBox(
				new THREE.Vector3(chestX, 0.4, chestZ),
				1.2,
				0.8,
				0.8,
				false,
			);
		}
	}

	_addTowerInterior(towerCX, towerCZ, towerHeight, towerRadius) {
		const torchMat = this.pool.getMatStd(
			0x5d4037,
			0.8,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const fireMat = this.pool.getMatStd(
			0xff6600,
			0.9,
			0,
			true,
			true,
			0.9,
			0xff4400,
			10.0,
		);

		// Torches at multiple heights around tower interior
		const torchCount = 6;
		for (let i = 0; i < torchCount; i++) {
			const angle = (i / torchCount) * Math.PI * 2;
			const height = 4 + (i * (towerHeight - 8)) / torchCount;
			const tx = towerCX + Math.cos(angle) * (towerRadius - 1.5);
			const tz = towerCZ + Math.sin(angle) * (towerRadius - 1.5);

			const torch = new THREE.Group();

			// Stick
			const stickGeo = this.pool.getGeoCylinder(0.06, 0.08, 0.6);
			const stick = new THREE.Mesh(stickGeo, torchMat);
			stick.rotation.x = Math.PI / 6;
			stick.position.set(0, 0.3, 0);
			stick.userData.mapGenerated = true;
			torch.add(stick);

			// Flame
			const flameGeo = this.pool.getGeoSphere(0.15);
			const flame = new THREE.Mesh(flameGeo, fireMat);
			flame.position.set(0.15, 0.6, 0);
			flame.userData.isTorch = true;
			flame.userData.blinkRate = 2 + Math.random();
			torch.add(flame);

			torch.position.set(tx, height, tz);
			torch.userData.mapGenerated = true;
			this.scene.add(torch);
		}

		this._chestSpots = this._chestSpots.filter(
			(spot) =>
				Math.hypot(spot.x - towerCX, spot.z - towerCZ) >= towerRadius - 0.5,
		);
		for (let i = 0; i < 3; i++) {
			const angle = (i / 3) * Math.PI * 2;
			const dist = 2.65;
			const chestX = towerCX + Math.cos(angle) * dist;
			const chestZ = towerCZ + Math.sin(angle) * dist;
			this._chestSpots.push({ x: chestX, z: chestZ, grade: "tower" });
		}
	}

	_addCornerTowerTorch(x, z, baseY) {
		const torchMat = this.pool.getMatStd(
			0x5d4037,
			0.8,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const fireMat = this.pool.getMatStd(
			0xff6600,
			0.9,
			0,
			true,
			true,
			0.9,
			0xff4400,
			10.0,
		);

		for (let i = 0; i < 4; i++) {
			const angle = (i / 4) * Math.PI * 2;
			const torch = new THREE.Group();

			const stickGeo = this.pool.getGeoCylinder(0.06, 0.08, 0.6);
			const stick = new THREE.Mesh(stickGeo, torchMat);
			stick.rotation.x = Math.PI / 6;
			stick.position.set(0, 0.3, 0);
			stick.userData.mapGenerated = true;
			torch.add(stick);

			const flameGeo = this.pool.getGeoSphere(0.15);
			const flame = new THREE.Mesh(flameGeo, fireMat);
			flame.position.set(0.15, 0.6, 0);
			flame.userData.isTorch = true;
			flame.userData.blinkRate = 2 + Math.random();
			torch.add(flame);

			torch.position.set(
				x + Math.cos(angle) * 2.5,
				baseY + 1.5,
				z + Math.sin(angle) * 2.5,
			);
			torch.userData.mapGenerated = true;
			this.scene.add(torch);
		}
	}

	/** Castle gate — arched entrance with portcullis */
	_addCastleGate(x, z, wallHeight) {
		const gateGroup = new THREE.Group();
		const mat = this.pool.getMatStd(0x5a5a5a, 0.85, 0, true, false, 1, 0, 0);

		// Gate arch (semi-cylinder on top of opening)
		const archGeo = this.pool.getGeoCylinder(5, 5, 6, 8, 1, false, 0, Math.PI);
		const arch = new THREE.Mesh(archGeo, mat);
		arch.rotation.y = Math.PI / 2;
		arch.position.set(0, wallHeight + 2.5, 0);
		arch.userData.mapGenerated = true;
		arch.userData.isWall = true;
		gateGroup.add(arch);

		// Gate pillars
		for (const side of [-1, 1]) {
			const pillarGeo = this.pool.getGeoBox(3, wallHeight + 6, 3);
			const pillar = new THREE.Mesh(pillarGeo, mat);
			pillar.position.set(side * 5, (wallHeight + 6) / 2, 0);
			pillar.userData.mapGenerated = true;
			pillar.userData.isWall = true;
			gateGroup.add(pillar);
		}

		const barMat = this.pool.getMatStd(0x333333, 0.8, 0, false, false, 1, 0, 0);
		for (let i = -3; i <= 3; i++) {
			const barGeo = this.pool.getGeoBox(0.25, 5, 0.25);
			const bar = new THREE.Mesh(barGeo, barMat);
			bar.position.set(i * 1.2, wallHeight + 1.5, 0);
			bar.userData.mapGenerated = true;
			bar.userData.isWall = true;
			gateGroup.add(bar);
		}

		// Gate roof
		const roofGeo = this.pool.getGeoCone(7, 4, 4);
		const roofMat = this.pool.getMatStd(
			0x3e2723,
			0.85,
			0,
			true,
			false,
			1,
			0,
			0,
			false,
		);
		const roof = new THREE.Mesh(roofGeo, roofMat);
		roof.position.set(0, wallHeight + 6.5, 0);
		roof.rotation.y = Math.PI / 4;
		roof.userData.mapGenerated = true;
		gateGroup.add(roof);

		gateGroup.position.set(x, 0, z);
		const gateRotation = Math.atan2(x, z);
		gateGroup.rotation.y = gateRotation;
		gateGroup.userData.mapGenerated = true;
		this.scene.add(gateGroup);
		const sideX = Math.cos(gateRotation) * 5;
		const sideZ = -Math.sin(gateRotation) * 5;
		const left = this.addColliderBox(
			new THREE.Vector3(x - sideX, (wallHeight + 6) / 2, z - sideZ),
			3,
			wallHeight + 6,
			3,
			false,
		);
		const right = this.addColliderBox(
			new THREE.Vector3(x + sideX, (wallHeight + 6) / 2, z + sideZ),
			3,
			wallHeight + 6,
			3,
			false,
		);
		left.isBiomeEntrance = true;
		right.isBiomeEntrance = true;
	}

	_addMazeMoss(segments, wallHeight) {
		const mossMat = this.pool.getMatStd(0x4caf50, 1.0, 0, true, false, 1, 0, 0);
		const vineMat = this.pool.getMatStd(0x2e7d32, 0.9, 0, true, false, 1, 0, 0);

		const count = Math.min(34, segments.length);
		for (let i = 0; i < count; i++) {
			const segment = segments[(i * 17) % segments.length];
			const horizontal = segment.width > segment.depth;
			const patchW = 1.2 + this._rand() * 2.8;
			const patchH = 1.5 + this._rand() * 4.5;
			const side = i % 2 ? 1 : -1;
			const moss = new THREE.Mesh(
				this.pool.getGeoBox(
					horizontal ? patchW : 0.08,
					patchH,
					horizontal ? 0.08 : patchW,
				),
				mossMat,
			);
			const y =
				patchH * 0.5 + this._rand() * Math.max(0, wallHeight - patchH - 0.2);
			moss.position.set(
				segment.x +
					(horizontal
						? (this._rand() - 0.5) * Math.max(0, segment.width - patchW)
						: side * (segment.width * 0.5 + 0.055)),
				y,
				segment.z +
					(horizontal
						? side * (segment.depth * 0.5 + 0.055)
						: (this._rand() - 0.5) * Math.max(0, segment.depth - patchW)),
			);
			moss.userData.mapGenerated = true;
			this.scene.add(moss);
		}

		for (let i = 0; i < Math.min(12, segments.length); i++) {
			const segment = segments[(i * 29 + 5) % segments.length];
			const horizontal = segment.width > segment.depth;
			const side = i % 2 ? 1 : -1;
			const vineH = 2 + this._rand() * 3;
			const vineGeo = this.pool.getGeoCylinder(0.05, 0.08, vineH, 4);
			const vine = new THREE.Mesh(vineGeo, vineMat);
			vine.position.set(
				segment.x +
					(horizontal
						? (this._rand() - 0.5) * Math.max(0, segment.width - 0.3)
						: side * (segment.width * 0.5 + 0.06)),
				wallHeight - vineH * 0.5,
				segment.z +
					(horizontal
						? side * (segment.depth * 0.5 + 0.06)
						: (this._rand() - 0.5) * Math.max(0, segment.depth - 0.3)),
			);
			vine.userData.mapGenerated = true;
			this.scene.add(vine);
		}
	}

	_addMazeTraps(cells, startX, startZ, margin, cellWidth, cellDepth) {
		const plateMat = this.pool.getMatStd(
			0x4a342e,
			0.72,
			0.15,
			true,
			false,
			1,
			0x5a160d,
			0.18,
		);
		let placed = 0;
		for (let r = 0; r < cells.length && placed < 12; r++) {
			for (let c = 0; c < cells[r].length && placed < 12; c++) {
				if ((r * 7 + c * 11) % 9 !== 0) continue;
				const x = startX + margin + (c + 0.5) * cellWidth;
				const z = startZ + margin + (r + 0.5) * cellDepth;
				if (Math.hypot(x, z) < 84) continue;
				const plate = new THREE.Mesh(
					this.pool.getGeoBox(2.6, 0.08, 2.6),
					plateMat,
				);
				plate.position.set(x, 0.06, z);
				plate.userData.mapGenerated = true;
				plate.userData.isTrap = true;
				this.scene.add(plate);
				// Add collision box for trap — prevents entities from walking/jumping over
				this.addColliderBox(
					new THREE.Vector3(x, 0.06, z),
					2.6,
					0.08,
					2.6,
					false,
				);
				this._traps.push({
					type: "pressure",
					position: new THREE.Vector3(x, 0, z),
					radius: 1.55,
					slow: 0.45,
					damage: 15,
					visual: plate,
					active: true,
					period: 5.2,
					activeFor: 2.1,
					phase: Math.abs(x * 0.17 + z * 0.11) % 5.2,
					baseY: plate.position.y,
				});
				placed++;
			}
		}
	}

	_addMazeCrystals(startX, startZ, size, cx, cz) {
		const crystalMat = this.pool.getMatStd(
			0x7c4dff,
			0.2,
			0.8,
			true,
			false,
			1,
			0x6515ff,
			3.0,
		);

		for (let i = 0; i < 5; i++) {
			const angle = this._rand() * Math.PI * 2;
			const dist = 10 + this._rand() * (size * 0.3);
			const cx2 = cx + Math.cos(angle) * dist;
			const cz2 = cz + Math.sin(angle) * dist;
			const size2 = 0.3 + this._rand() * 0.7;

			const geo = this.pool.getGeoDodecahedron(size2);
			const crystal = new THREE.Mesh(geo, this.pool.getMat(0x7c4dff, false));
			crystal.position.set(cx2, size2, cz2);
			crystal.rotation.set(this._rand() * Math.PI, this._rand() * Math.PI, 0);
			crystal.userData.isCrystal = true;
			crystal.userData.blinkRate = 1 + this._rand() * 2;
			crystal.userData.mapGenerated = true;
			this.scene.add(crystal);
		}
	}

	_addMazePOI(startX, startZ, size, cx, cz) {
		const poiPositions = [
			{ x: cx - 30, z: cz - 20, type: "weapon" },
			{ x: cx + 25, z: cz - 15, type: "medkit" },
			{ x: cx - 20, z: cz + 25, type: "ammo" },
			{ x: cx + 30, z: cz + 20, type: "weapon" },
			{ x: cx - 35, z: cz + 5, type: "medkit" },
			{ x: cx + 15, z: cz - 35, type: "ammo" },
		];

		for (const poi of poiPositions) {
			if (poi.type === "weapon") {
				this._addWeaponDrop(poi.x, poi.z);
			} else if (poi.type === "medkit") {
				this._addMedkitDrop(poi.x, poi.z);
			} else {
				this._addAmmoDrop(poi.x, poi.z);
			}
		}
	}

	_addMazeToCenterPath(entranceX, entranceZ) {
		const gateAngle = -Math.PI / 4;
		const start = new THREE.Vector3(
			Math.cos(gateAngle) * 66,
			0,
			Math.sin(gateAngle) * 66,
		);
		const end = new THREE.Vector3(entranceX, 0, entranceZ);
		const dx = end.x - start.x;
		const dz = end.z - start.z;
		const length = Math.hypot(dx, dz);
		const angle = Math.atan2(dx, dz);
		const midpoint = start.clone().add(end).multiplyScalar(0.5);
		const floorMat = this.pool.getMatStd(
			0x8a8174,
			0.96,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const floor = new THREE.Mesh(
			this.pool.getGeoBox(12, 0.18, length + 1.5),
			floorMat,
		);
		floor.position.set(midpoint.x, 0.09, midpoint.z);
		floor.rotation.y = angle;
		floor.userData.mapGenerated = true;
		floor.userData.walkable = true;
		floor.userData.isBiomeEntrance = true;
		this.scene.add(floor);
		const floorCollider = this.addColliderBox(
			new THREE.Vector3(midpoint.x, 0.09, midpoint.z),
			12 * Math.abs(Math.cos(angle)) + length * Math.abs(Math.sin(angle)),
			0.18,
			12 * Math.abs(Math.sin(angle)) + length * Math.abs(Math.cos(angle)),
			true,
		);
		floorCollider.isBiomeEntrance = true;
		floorCollider.surfaceOBB = {
			x: midpoint.x,
			z: midpoint.z,
			halfWidth: 6,
			halfDepth: (length + 1.5) * 0.5,
			rotation: angle,
		};
	}

	// =========================================================================
	// MILITARY RUINS QUADRANT (SW: x < 0, z > 0)
	// =========================================================================
	_generateMilitaryQuadrant() {
		const startX = -124;
		const startZ = 4;
		const size = 120;
		const cx = startX + size / 2;
		const cz = startZ + size / 2;

		// Колючая проволока по периметру с входом
		this._addBarbedWireFence(startX, startZ, size);

		// Ежи (анти танковые)
		for (let i = 0; i < 8; i++) {
			const hx = startX + 10 + this._rand() * (size - 20);
			const hz = startZ + 10 + this._rand() * (size - 20);
			this._addCzechHedgehog(hx, hz, 2.5 + this._rand() * 1.5);
		}

		// Полуразрушенные танки
		for (let i = 0; i < 2; i++) {
			const tx = startX + 15 + this._rand() * (size - 30);
			const tz = startZ + 15 + this._rand() * (size - 30);
			this._addDestroyedTank(tx, tz);
		}
		[
			[startX + 18, startZ + 36],
			[startX + 64, startZ + 26],
		].forEach(([x, z]) => this._addMilitaryTank(x, z));

		// Easter egg: Stalker corpse placed inside the hangar (see _addMilitaryHangar)

		// Окопы - больше и заметнее
		this._addTrench(startX + 20, startZ + 20, size * 0.4);
		this._addTrench(startX + size * 0.5, startZ + size * 0.5, size * 0.35);
		this._addTrench(startX + size * 0.7, startZ + 15, size * 0.2);

		// Укрытия из мешков
		for (let i = 0; i < 4; i++) {
			const sx = startX + 15 + this._rand() * (size - 30);
			const sz = startZ + 15 + this._rand() * (size - 30);
			this._addSandbagBunker(sx, sz);
		}

		this._addReferenceMilitaryRuin(startX + 24, startZ + 26, 22, 20);
		this._addReferenceMilitaryRuin(startX + 94, startZ + 24, 22, 20);
		this._addReferenceMilitaryRuin(startX + 26, startZ + 94, 24, 18);
		this._addMilitaryHangar(cx + 16, cz + 18, 28, 34, 14);

		// Дорога между домами (асфальт)
		const roadMat = this.pool.getMatStd(
			0x333333,
			0.95,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		const roadGeo = this.pool.getGeoBox(size - 30, 0.1, 12);
		const road = new THREE.Mesh(roadGeo, roadMat);
		road.position.set(cx, 0.05, cz);
		road.userData.mapGenerated = true;
		this.scene.add(road);

		// Бетонные баррикады вдоль дороги
		for (let b = 0; b < 4; b++) {
			const barrierGeo = this.pool.getGeoBox(5, 3.5, 2.5);
			const barrierMat = this.pool.getMatStd(
				0x666655,
				0.9,
				0,
				false,
				false,
				1,
				0,
				0,
			);
			const barrier = new THREE.Mesh(barrierGeo, barrierMat);
			barrier.position.set(startX + 24 + b * 24, 1.75, cz);
			barrier.rotation.y = this._rand() * 0.3;
			barrier.userData.mapGenerated = true;
			this.scene.add(barrier);
			this.addColliderBox(
				new THREE.Vector3(barrier.position.x, 1.75, barrier.position.z),
				5,
				3.5,
				2.5,
				false,
			);
		}

		for (let crater = 0; crater < 2; crater++) {
			const craterX = startX + 10 + this._rand() * (size - 20);
			const craterZ = startZ + 10 + this._rand() * (size - 20);
			const craterSize = 4 + this._rand() * 4;
			const craterGeo = new THREE.CircleGeometry(craterSize, 16);
			const craterMat = this.pool.getMatStd(
				0x222222,
				1,
				0,
				false,
				false,
				1,
				0,
				0,
			);
			const craterMesh = new THREE.Mesh(craterGeo, craterMat);
			craterMesh.rotation.x = -Math.PI / 2;
			craterMesh.position.set(craterX, 0.025, craterZ);
			craterMesh.userData.mapGenerated = true;
			this.scene.add(craterMesh);
		}

		// Металлические бочки
		for (let barrel = 0; barrel < 3; barrel++) {
			const barrelX = startX + 10 + this._rand() * (size - 20);
			const barrelZ = startZ + 10 + this._rand() * (size - 20);
			const barrelGeo = this.pool.getGeoCylinder(0.8, 0.8, 2.5);
			const barrelMat = this.pool.getMatStd(
				this._rand() > 0.5 ? 0x8b4513 : 0x444444,
				0.7,
				0,
				false,
				false,
				1,
				0,
				0,
			);
			const barrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
			barrelMesh.position.set(barrelX, 1.25, barrelZ);
			barrelMesh.rotation.z = this._rand() * 0.5;
			barrelMesh.userData.mapGenerated = true;
			this.scene.add(barrelMesh);
			this.addColliderBox(
				new THREE.Vector3(barrelX, 1.25, barrelZ),
				1.6,
				2.5,
				1.6,
				false,
			);
		}

		// Edge trees — dense military perimeter
	}

	_addMilitaryHangar(x, z, w, d, h) {
		const group = new THREE.Group();
		const floorMat = this.pool.getMatStd(
			0x34383d,
			0.94,
			0.05,
			true,
			false,
			1,
			0,
			0,
		);
		const wallMat = this.pool.getMatStd(
			0x59636c,
			0.72,
			0.28,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const floor = new THREE.Mesh(this.pool.getGeoBox(w, 0.3, d), floorMat);
		floor.position.y = 0.15;
		floor.userData.mapGenerated = true;
		floor.userData.walkable = true;
		group.add(floor);
		const doorW = 4;
		const doorH = 3.5;
		const doorLeftW = w / 2 - doorW / 2;
		const doorRightW = w / 2 - doorW / 2;
		for (const side of [-1, 1]) {
			const wall = new THREE.Mesh(this.pool.getGeoBox(0.9, h, d), wallMat);
			wall.position.set((side * w) / 2, h / 2, 0);
			wall.userData.mapGenerated = true;
			wall.userData.isWall = true;
			group.add(wall);
			// Full depth collider — matches visual wall and eliminates corner gaps
			this.addColliderBox(
				new THREE.Vector3(x + (side * w) / 2, h / 2, z),
				0.9,
				h,
				d,
				false,
			);
		}
		const doorMat = this.pool.getMatStd(
			0x4e342e,
			0.9,
			0,
			false,
			false,
			1,
			0,
			0,
			false,
		);
		const doorTopH = h - doorH - 0.5;
		if (doorLeftW > 0) {
			const dl = new THREE.Mesh(
				this.pool.getGeoBox(doorLeftW, h, 0.9),
				wallMat,
			);
			dl.position.set(-w / 2 + doorLeftW / 2, h / 2, d / 2);
			dl.userData.mapGenerated = true;
			dl.userData.isWall = true;
			group.add(dl);
			this.addColliderBox(
				new THREE.Vector3(x - w / 2 + doorLeftW / 2, h / 2, z + d / 2),
				doorLeftW,
				h,
				0.9,
				false,
			);
		}
		if (doorRightW > 0) {
			const dr = new THREE.Mesh(
				this.pool.getGeoBox(doorRightW, h, 0.9),
				wallMat,
			);
			dr.position.set(w / 2 - doorRightW / 2, h / 2, d / 2);
			dr.userData.mapGenerated = true;
			dr.userData.isWall = true;
			group.add(dr);
			this.addColliderBox(
				new THREE.Vector3(x + w / 2 - doorRightW / 2, h / 2, z + d / 2),
				doorRightW,
				h,
				0.9,
				false,
			);
		}
		if (doorTopH > 0) {
			const dt = new THREE.Mesh(this.pool.getGeoBox(w, doorTopH, 0.9), wallMat);
			dt.position.set(0, doorH + doorTopH / 2, d / 2);
			dt.userData.mapGenerated = true;
			dt.userData.isWall = true;
			group.add(dt);
			this.addColliderBox(
				new THREE.Vector3(x, doorH + doorTopH / 2, z + d / 2),
				w,
				doorTopH,
				0.9,
				false,
			);
		}
		const door = new THREE.Mesh(
			this.pool.getGeoBox(doorW, doorH, 0.1),
			doorMat,
		);
		door.position.set(0, doorH / 2, d / 2 + 0.05);
		door.userData.mapGenerated = true;
		group.add(door);
		// No door collider — entrance is walkable (door is visual only)
		const backWall = new THREE.Mesh(this.pool.getGeoBox(w, h, 0.9), wallMat);
		backWall.position.set(0, h / 2, -d / 2);
		backWall.userData.mapGenerated = true;
		backWall.userData.isWall = true;
		group.add(backWall);
		this.addColliderBox(
			new THREE.Vector3(x, h / 2, z - d / 2),
			w,
			h,
			0.9,
			false,
		);
		const roof = new THREE.Mesh(
			this.pool.getGeoBox(w + 1.8, 0.8, d + 1.8),
			wallMat,
		);
		roof.position.y = h;
		roof.userData.mapGenerated = true;
		group.add(roof);
		this.addColliderBox(
			new THREE.Vector3(x, h, z),
			w + 1.8,
			0.8,
			d + 1.8,
			false,
		);
		for (const end of [-1, 1]) {
			for (const side of [-1, 1]) {
				const post = new THREE.Mesh(this.pool.getGeoBox(1.2, h, 1.2), wallMat);
				post.position.set(side * (w / 2 - 0.6), h / 2, end * (d / 2 - 0.6));
				post.userData.mapGenerated = true;
				group.add(post);
				this.addColliderBox(
					new THREE.Vector3(
						x + side * (w / 2 - 0.6),
						h / 2,
						z + end * (d / 2 - 0.6),
					),
					1.2,
					h,
					1.2,
					false,
				);
			}
		}
		group.position.set(x, 0, z);
		group.userData.mapGenerated = true;
		group.userData.buildingType = "hangar";
		this.scene.add(group);
		this._buildings.push({ x, z, w, d, template: { type: "hangar" } });
		for (const [ox, oz] of [
			[-12, -18],
			[12, -18],
			[-12, 0],
			[12, 0],
			[-12, 18],
			[12, 18],
		]) {
			this._registerChestSpot(x + ox, z + oz, "hangar", 3);
		}
		// Easter egg: Stalker corpse on the floor, just inside the door
		this._addStalkerCorpse(0, d / 2 - 2, 0.3, group);
		// Disable frustum culling on the group when it contains easterEgg children
		// Three.js skips ALL children if parent Group.frustumCulled=true and bounding box misses frustum
		let hasEasterEgg = false;
		group.traverse((obj) => {
			if (obj.userData && obj.userData.easterEgg) {
				hasEasterEgg = true;
			}
		});
		if (hasEasterEgg) {
			group.frustumCulled = false;
		}
	}

	_addReferenceMilitaryRuin(x, z, w, d) {
		const group = new THREE.Group();
		const floorMat = this.pool.getMatStd(
			0x34383d,
			0.95,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const wallMat = this.pool.getMatStd(
			0x4f5963,
			0.9,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const floor = new THREE.Mesh(this.pool.getGeoBox(w, 0.35, d), floorMat);
		floor.position.y = 0.18;
		floor.userData.mapGenerated = true;
		group.add(floor);
		const segments = [
			[-w * 0.28, 4, -d / 2, w * 0.44, 8, 0.7],
			[w * 0.3, 2.8, -d / 2, w * 0.32, 5.6, 0.7],
			[-w / 2, 3.5, -d * 0.2, 0.7, 7, d * 0.58],
			[-w / 2, 2.5, d * 0.38, 0.7, 5, d * 0.24],
			[w / 2, 3.2, d * 0.18, 0.7, 6.4, d * 0.55],
			[-w * 0.3, 3, d / 2, w * 0.3, 6, 0.7],
			[w * 0.3, 4, d / 2, w * 0.34, 8, 0.7],
		];
		for (const [lx, ly, lz, sw, sh, sd] of segments) {
			const wall = new THREE.Mesh(this.pool.getGeoBox(sw, sh, sd), wallMat);
			wall.position.set(lx, ly, lz);
			wall.userData.mapGenerated = true;
			wall.userData.isWall = true;
			group.add(wall);
			this.addColliderBox(
				new THREE.Vector3(x + lx, ly, z + lz),
				sw,
				sh,
				sd,
				false,
			);
		}
		const upperFloorMat = this.pool.getMatStd(
			0x434b52,
			0.94,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		for (const side of [-1, 1]) {
			const slabW = w * 0.42;
			const slab = new THREE.Mesh(
				this.pool.getGeoBox(slabW, 0.35, d * 0.78),
				upperFloorMat,
			);
			slab.position.set(side * w * 0.27, 6, 0);
			slab.userData.mapGenerated = true;
			slab.userData.walkable = true;
			group.add(slab);
			this.addColliderBox(
				new THREE.Vector3(x + side * w * 0.27, 6, z),
				slabW,
				0.35,
				d * 0.78,
				false,
			);
		}
		group.position.set(x, 0, z);
		group.userData.mapGenerated = true;
		this.scene.add(group);
		this._buildings.push({ x, z, w, d, template: { type: "military_ruin" } });
		this._registerChestSpot(x - w * 0.28, z, "military");
		this._registerChestSpot(x + w * 0.26, z - d * 0.24, "military");
		this._registerChestSpot(x + w * 0.22, z + d * 0.24, "military");
	}

	_addMilitaryEdgeTrees(startX, startZ, size) {
		const treeTypes = ["pine", "spruce"];
		const positions = [];
		const edgeWidth = 18;

		for (let side = 0; side < 4; side++) {
			for (let i = 10; i < size - 10; i += 6) {
				for (let ox = 0; ox < edgeWidth; ox += 3) {
					let tx, tz;
					if (side === 0) {
						tx = startX + ox + (this._rand() - 0.5) * 2;
						tz = startZ + i + (this._rand() - 0.5) * 2;
					} else if (side === 1) {
						tx = startX + size - ox - (this._rand() - 0.5) * 2;
						tz = startZ + i + (this._rand() - 0.5) * 2;
					} else if (side === 2) {
						tx = startX + i + (this._rand() - 0.5) * 2;
						tz = startZ + ox + (this._rand() - 0.5) * 2;
					} else {
						tx = startX + i + (this._rand() - 0.5) * 2;
						tz = startZ + size - ox - (this._rand() - 0.5) * 2;
					}
					const key = `${tx.toFixed(0)},${tz.toFixed(0)}`;
					if (!positions.includes(key)) {
						positions.push(key);
						const type = treeTypes[Math.floor(this._rand() * treeTypes.length)];
						this._addForestTree(tx, tz, type);
					}
				}
			}
		}
	}

	_addMilitaryPOI(startX, startZ, size, cx, cz) {
		const poiPositions = [
			{ x: cx - 30, z: cz - 20, type: "weapon" },
			{ x: cx + 25, z: cz + 15, type: "ammo" },
			{ x: cx - 15, z: cz + 30, type: "medkit" },
			{ x: cx + 35, z: cz - 10, type: "weapon" },
		];

		for (const poi of poiPositions) {
			if (poi.type === "weapon") {
				this._addWeaponDrop(poi.x, poi.z);
			} else if (poi.type === "medkit") {
				this._addMedkitDrop(poi.x, poi.z);
			} else {
				this._addAmmoDrop(poi.x, poi.z);
			}
		}
	}

	_addMilitaryToCenterPath(cx, cz) {
		const pathMat = this.pool.getMatStd(0x555555, 1.0, 0, true, false, 1, 0, 0);

		// Path from military quadrant to center (toward origin)
		const startX2 = cx;
		const startZ2 = cz;
		const endX = 0;
		const endZ = 0;

		let px = startX2;
		let pz = startZ2;
		for (let i = 0; i < 10; i++) {
			const t = i / 19;
			const segGeo = this.pool.getGeoBox(3, 0.05, 4);
			const seg = new THREE.Mesh(segGeo, pathMat);
			seg.position.set(px + (endX - px) * t, 0.03, pz + (endZ - pz) * t);
			seg.userData.mapGenerated = true;
			seg.userData.walkable = true;
			this.scene.add(seg);
			this.addColliderBox(
				new THREE.Vector3(seg.position.x, 0.03, seg.position.z),
				3,
				0.05,
				4,
				false,
			);
			px += (endX - px) * 0.12 + (this._rand() - 0.5) * 2;
			pz += (endZ - pz) * 0.12 + (this._rand() - 0.5) * 2;
		}
	}

	_addBarbedWireFence(startX, startZ, size) {
		const postMat = this.pool.getMatStd(
			0x4a5238,
			0.9,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		const wireMat = this.pool.getMatStd(
			0xb0b5ba,
			0.38,
			0.72,
			false,
			false,
			1,
			0,
			0,
		);
		const postH = 2.5;
		const postSpacing = 8;
		const endX = startX + size;
		const endZ = startZ + size;
		const gate = 18;
		const runs = [
			[
				new THREE.Vector3(startX, 0, startZ),
				new THREE.Vector3(endX - gate, 0, startZ),
			],
			[new THREE.Vector3(startX, 0, endZ), new THREE.Vector3(endX, 0, endZ)],
			[
				new THREE.Vector3(startX, 0, startZ),
				new THREE.Vector3(startX, 0, endZ),
			],
			[
				new THREE.Vector3(endX, 0, startZ + gate),
				new THREE.Vector3(endX, 0, endZ),
			],
		];
		const postPositions = [];
		const wireSegments = [];
		for (const [from, to] of runs) {
			const length = from.distanceTo(to);
			const steps = Math.max(1, Math.ceil(length / postSpacing));
			const points = [];
			for (let i = 0; i <= steps; i++) {
				const point = from.clone().lerp(to, i / steps);
				points.push(point);
				postPositions.push(point);
			}
			for (let i = 0; i < points.length - 1; i++) {
				for (const height of [0.72, 1.42, 2.12]) {
					wireSegments.push([
						new THREE.Vector3(points[i].x, height, points[i].z),
						new THREE.Vector3(points[i + 1].x, height, points[i + 1].z),
					]);
				}
				wireSegments.push([
					new THREE.Vector3(points[i].x, 0.68, points[i].z),
					new THREE.Vector3(points[i + 1].x, 2.18, points[i + 1].z),
				]);
				wireSegments.push([
					new THREE.Vector3(points[i].x, 2.18, points[i].z),
					new THREE.Vector3(points[i + 1].x, 0.68, points[i + 1].z),
				]);
			}
		}
		const uniquePosts = [
			...new Map(
				postPositions.map((p) => [`${p.x.toFixed(2)}:${p.z.toFixed(2)}`, p]),
			).values(),
		];
		const postMesh = new THREE.InstancedMesh(
			this.pool.getGeoBox(0.22, postH, 0.22),
			postMat,
			uniquePosts.length,
		);
		const matrix = new THREE.Matrix4();
		const quaternion = new THREE.Quaternion();
		const scale = new THREE.Vector3(1, 1, 1);
		for (let i = 0; i < uniquePosts.length; i++) {
			const p = uniquePosts[i];
			matrix.compose(
				new THREE.Vector3(p.x, postH / 2, p.z),
				quaternion.identity(),
				scale,
			);
			postMesh.setMatrixAt(i, matrix);
		}
		postMesh.instanceMatrix.needsUpdate = true;
		postMesh.userData.mapGenerated = true;
		postMesh.userData.isBarbedWire = true;
		this.scene.add(postMesh);

		const wireMesh = new THREE.InstancedMesh(
			this.pool.getGeoCylinder(0.055, 0.055, 1, 5),
			wireMat,
			wireSegments.length,
		);
		const up = new THREE.Vector3(0, 1, 0);
		const direction = new THREE.Vector3();
		const midpoint = new THREE.Vector3();
		for (let i = 0; i < wireSegments.length; i++) {
			const [from, to] = wireSegments[i];
			direction.subVectors(to, from);
			const length = direction.length();
			quaternion.setFromUnitVectors(up, direction.normalize());
			midpoint.addVectors(from, to).multiplyScalar(0.5);
			matrix.compose(midpoint, quaternion, scale.set(1, length, 1));
			wireMesh.setMatrixAt(i, matrix);
		}
		wireMesh.instanceMatrix.needsUpdate = true;
		wireMesh.userData.mapGenerated = true;
		wireMesh.userData.isBarbedWire = true;
		this.scene.add(wireMesh);

		const northLength = size - gate;
		this.addColliderBox(
			new THREE.Vector3(startX + northLength / 2, postH / 2, startZ),
			northLength,
			postH,
			0.35,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(startX + size / 2, postH / 2, endZ),
			size,
			postH,
			0.35,
			false,
		);
		this.addColliderBox(
			new THREE.Vector3(startX, postH / 2, startZ + size / 2),
			0.35,
			postH,
			size,
			false,
		);
		const eastLength = size - gate;
		this.addColliderBox(
			new THREE.Vector3(endX, postH / 2, startZ + gate + eastLength / 2),
			0.35,
			postH,
			eastLength,
			false,
		);
	}

	_addCzechHedgehog(x, z) {
		const mat = this.pool.getMatStd(0x4a5238, 0.6, 0.4, false, false, 1, 0, 0);

		const hedgehog = new THREE.Group();
		const beamLen = 2;
		const beamR = 0.15;

		// 3 скрещенные балки
		for (let i = 0; i < 3; i++) {
			const angle = (i / 3) * Math.PI;
			const beamGeo = this.pool.getGeoCylinder(beamR, beamR, beamLen);
			const beam = new THREE.Mesh(beamGeo, mat);
			beam.position.set(
				(Math.cos(angle) * beamLen) / 2,
				beamLen / 2,
				(Math.sin(angle) * beamLen) / 2,
			);
			beam.rotation.z = Math.PI / 2;
			beam.rotation.y = angle;
			beam.userData.mapGenerated = true;
			hedgehog.add(beam);
		}

		hedgehog.position.set(x, 0, z);
		hedgehog.userData.mapGenerated = true;
		this.scene.add(hedgehog);

		this.addColliderBox(
			new THREE.Vector3(x, beamLen / 2, z),
			beamLen,
			beamLen,
			beamLen,
			false,
		);
	}

	_addDestroyedTank(x, z) {
		const tank = new THREE.Group();
		const hullMat = this.pool.getMatStd(
			0x54624a,
			0.7,
			0.3,
			false,
			false,
			1,
			0,
			0,
		);

		// Корпус (разрушенный)
		const hullGeo = this.pool.getGeoBox(6.5, 2.6, 9);
		const hull = new THREE.Mesh(hullGeo, hullMat);
		hull.userData.mapGenerated = true;
		hull.position.y = 1.8;
		hull.rotation.z = (this._rand() - 0.5) * 0.1;
		tank.add(hull);

		// Башня (сломана)
		const turretGeo = this.pool.getGeoBox(3.8, 1.9, 4.2);
		const turretMat = this.pool.getMatStd(
			0x4a5a3a,
			0.6,
			0.4,
			false,
			false,
			1,
			0,
			0,
		);
		const turret = new THREE.Mesh(turretGeo, turretMat);
		turret.userData.mapGenerated = true;
		turret.position.set(0, 4, -0.6);
		turret.rotation.z = (this._rand() - 0.5) * 0.3;
		turret.rotation.y = this._rand() * 0.5;
		tank.add(turret);

		// Дуло (поломанное)
		const barrelGeo = this.pool.getGeoCylinder(0.3, 0.42, 6.5);
		const barrel = new THREE.Mesh(barrelGeo, turretMat);
		barrel.userData.mapGenerated = true;
		barrel.rotation.x = Math.PI / 2 + (this._rand() - 0.5) * 0.3;
		barrel.position.set(0, 4, -4.7);
		tank.add(barrel);

		// Гусеницы (одна может быть сломана)
		for (const side of [-1, 1]) {
			const trackGeo = this.pool.getGeoBox(1.25, 1.25, 9.8);
			const trackMat = this.pool.getMatStd(
				0x3d3d3d,
				0.9,
				0,
				false,
				false,
				1,
				0,
				0,
			);
			const track = new THREE.Mesh(trackGeo, trackMat);
			track.userData.mapGenerated = true;
			track.position.set(side * 3.35, 0.63, 0);
			if (side === -1 && this._rand() > 0.5) {
				track.rotation.z = 0.2;
				track.position.y = 0.2;
			}
			tank.add(track);
		}

		// Огненный шар/дым на танке
		const fireGeo = this.pool.getGeoSphere(0.8);
		const fireMat = this.pool.getMatStd(
			0xff6600,
			0.9,
			0,
			false,
			true,
			0.7,
			0xff4400,
			0.5,
		);
		const fire = new THREE.Mesh(fireGeo, fireMat);
		fire.position.set(0, 5.2, 0);
		fire.userData.mapGenerated = true;
		tank.add(fire);

		tank.position.set(x, 0, z);
		tank.rotation.y = this._rand() * Math.PI * 2;
		tank.userData.mapGenerated = true;
		this.scene.add(tank);

		this.addColliderBox(new THREE.Vector3(x, 2.8, z), 8, 5.6, 10.5, false);
	}

	_addTrench(x, z, length) {
		const trenchMat = this.pool.getMatStd(
			0x3d3528,
			0.95,
			0,
			true,
			false,
			1,
			0,
			0,
		);

		// Дно окопа
		const bottomGeo = this.pool.getGeoBox(3, 0.1, length);
		const bottom = new THREE.Mesh(bottomGeo, trenchMat);
		bottom.position.set(x, 0.15, z);
		bottom.userData.mapGenerated = true;
		this.scene.add(bottom);

		// Стенки окопа + коллайдеры
		for (const side of [-1, 1]) {
			const wallGeo = this.pool.getGeoBox(0.3, 1, length);
			const wall = new THREE.Mesh(wallGeo, trenchMat);
			wall.position.set(x + side * 1.5, 0.5, z);
			wall.userData.mapGenerated = true;
			wall.userData.isWall = true;
			this.scene.add(wall);
			this.addColliderBox(
				new THREE.Vector3(x + side * 1.5, 0.5, z),
				0.3,
				1,
				length,
				false,
			);
		}

		// Повернутый окоп (перпендикулярно)
		const bottom2Geo = this.pool.getGeoBox(length, 0.1, 3);
		const bottom2 = new THREE.Mesh(bottom2Geo, trenchMat);
		bottom2.position.set(x + length / 2, 0.15, z + length / 2);
		bottom2.userData.mapGenerated = true;
		this.scene.add(bottom2);

		for (const side of [-1, 1]) {
			const wallGeo = this.pool.getGeoBox(length, 1, 0.3);
			const wall = new THREE.Mesh(wallGeo, trenchMat);
			wall.position.set(x + length / 2, 0.5, z + length / 2 + side * 1.5);
			wall.userData.mapGenerated = true;
			wall.userData.isWall = true;
			this.scene.add(wall);
			this.addColliderBox(
				new THREE.Vector3(x + length / 2, 0.5, z + length / 2 + side * 1.5),
				length,
				1,
				0.3,
				false,
			);
		}
	}

	_addSandbagBunker(x, z) {
		const mat = this.pool.getMatStd(0x9e8e6e, 0.95, 0, true, false, 1, 0, 0);

		const bunker = new THREE.Group();
		const bagW = 0.6;
		const bagH = 0.35;
		const bagD = 0.4;

		// U-образное укрытие
		for (let i = 0; i < 4; i++) {
			for (let j = 0; j < 2; j++) {
				const bagGeo = this.pool.getGeoBox(bagW, bagH, bagD);
				const bag = new THREE.Mesh(bagGeo, mat);
				bag.position.set(i * bagW, j * bagH + bagH / 2, 0);
				bag.userData.mapGenerated = true;
				bunker.add(bag);
			}
		}

		// Боковые стенки
		for (let j = 0; j < 2; j++) {
			for (let k = 0; k < 3; k++) {
				const bagGeo = this.pool.getGeoBox(bagW, bagH, bagD);
				const bag = new THREE.Mesh(bagGeo, mat);
				bag.position.set(0, j * bagH + bagH / 2, k * bagD);
				bag.userData.mapGenerated = true;
				bunker.add(bag);

				const bag2 = new THREE.Mesh(bagGeo, mat);
				bag2.position.set(3 * bagW, j * bagH + bagH / 2, k * bagD);
				bag2.userData.mapGenerated = true;
				bunker.add(bag2);
			}
		}

		bunker.position.set(x, 0, z);
		bunker.userData.mapGenerated = true;
		this.scene.add(bunker);
		this._registerChestSpot(x + bagW * 1.5, z + bagD * 1.5, "military");

		this.addColliderBox(
			new THREE.Vector3(x, 0.5, z),
			4 * bagW,
			1.2,
			3 * bagD,
			false,
		);
	}

	_addThreeStoryApartment(x, z, w = 20, d = 16) {
		const building = new THREE.Group();
		// Soviet-style concrete panel colors - warm gray
		const wallMat = this.pool.getMatStd(
			0x9e9e96,
			0.85,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const concreteMat = this.pool.getMatStd(
			0xb0b0a8,
			0.9,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const doorMat = this.pool.getMatStd(
			0x4a3525,
			0.8,
			0,
			false,
			false,
			1,
			0,
			0,
			false,
		);

		const width = w;
		const depth = d;
		const floorH = 5;

		// Пол первого этажа
		const floor1Geo = this.pool.getGeoBox(width, 0.3, depth);
		const floor1 = new THREE.Mesh(floor1Geo, concreteMat);
		floor1.position.set(0, 0.15, 0);
		floor1.userData.mapGenerated = true;
		floor1.userData.walkable = true;
		building.add(floor1);
		this.addColliderBox(
			new THREE.Vector3(x, 0.15, z),
			width,
			0.3,
			depth,
			false,
		);

		// Стены первого этажа (с разрушениями)
		const wallThick = 0.5;
		// Левая стена
		const leftWallGeo = this.pool.getGeoBox(wallThick, floorH, depth);
		const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
		leftWall.position.set(-width / 2, floorH / 2 + 0.3, 0);
		leftWall.userData.mapGenerated = true;
		leftWall.userData.isWall = true;
		building.add(leftWall);
		this.addColliderBox(
			new THREE.Vector3(x - width / 2, floorH / 2 + 0.3, z),
			wallThick,
			floorH,
			depth,
			false,
		);

		// Правая стена (с дырой)
		const rightWallBack = this.pool.getGeoBox(wallThick, floorH, depth * 0.4);
		const rightWallFront = this.pool.getGeoBox(wallThick, floorH, depth * 0.3);
		const rwBack = new THREE.Mesh(rightWallBack, wallMat);
		rwBack.position.set(width / 2, floorH / 2 + 0.3, -depth * 0.3);
		rwBack.userData.mapGenerated = true;
		rwBack.userData.isWall = true;
		building.add(rwBack);
		this.addColliderBox(
			new THREE.Vector3(x + width / 2, floorH / 2 + 0.3, z - depth * 0.3),
			wallThick,
			floorH,
			depth * 0.4,
			false,
		);

		const rwFront = new THREE.Mesh(rightWallFront, wallMat);
		rwFront.position.set(width / 2, floorH / 2 + 0.3, depth * 0.35);
		rwFront.userData.mapGenerated = true;
		rwFront.userData.isWall = true;
		building.add(rwFront);
		this.addColliderBox(
			new THREE.Vector3(x + width / 2, floorH / 2 + 0.3, z + depth * 0.35),
			wallThick,
			floorH,
			depth * 0.3,
			false,
		);

		// Задняя стена
		const backWallGeo = this.pool.getGeoBox(width, floorH, wallThick);
		const backWall = new THREE.Mesh(backWallGeo, wallMat);
		backWall.position.set(0, floorH / 2 + 0.3, -depth / 2);
		backWall.userData.mapGenerated = true;
		backWall.userData.isWall = true;
		building.add(backWall);
		this.addColliderBox(
			new THREE.Vector3(x, floorH / 2 + 0.3, z - depth / 2),
			width,
			floorH,
			wallThick,
			false,
		);

		// Передняя стена с дверью
		const doorW = 2;
		const doorH = 2.8;
		const frontLeftW = width / 2 - doorW / 2 - 2;
		const frontRightW = width / 2 - doorW / 2 - 2;

		const frontLeftGeo = this.pool.getGeoBox(frontLeftW, floorH, wallThick);
		const frontLeft = new THREE.Mesh(frontLeftGeo, wallMat);
		frontLeft.position.set(
			-width / 2 + frontLeftW / 2,
			floorH / 2 + 0.3,
			depth / 2,
		);
		frontLeft.userData.mapGenerated = true;
		frontLeft.userData.isWall = true;
		building.add(frontLeft);
		this.addColliderBox(
			new THREE.Vector3(
				x - width / 2 + frontLeftW / 2,
				floorH / 2 + 0.3,
				z + depth / 2,
			),
			frontLeftW,
			floorH,
			wallThick,
			false,
		);

		const frontRightGeo = this.pool.getGeoBox(frontRightW, floorH, wallThick);
		const frontRight = new THREE.Mesh(frontRightGeo, wallMat);
		frontRight.position.set(
			width / 2 - frontRightW / 2,
			floorH / 2 + 0.3,
			depth / 2,
		);
		frontRight.userData.mapGenerated = true;
		frontRight.userData.isWall = true;
		building.add(frontRight);
		this.addColliderBox(
			new THREE.Vector3(
				x + width / 2 - frontRightW / 2,
				floorH / 2 + 0.3,
				z + depth / 2,
			),
			frontRightW,
			floorH,
			wallThick,
			false,
		);

		const frontTopGeo = this.pool.getGeoBox(
			width,
			floorH - doorH - 0.5,
			wallThick,
		);
		const frontTop = new THREE.Mesh(frontTopGeo, wallMat);
		frontTop.position.set(
			0,
			doorH + (floorH - doorH - 0.5) / 2 + 0.3,
			depth / 2,
		);
		frontTop.userData.mapGenerated = true;
		frontTop.userData.isWall = true;
		building.add(frontTop);
		this.addColliderBox(
			new THREE.Vector3(
				x,
				doorH + (floorH - doorH - 0.5) / 2 + 0.3,
				z + depth / 2,
			),
			width,
			floorH - doorH - 0.5,
			wallThick,
			false,
		);

		// Дверь
		const doorGeo = this.pool.getGeoBox(doorW, doorH, 0.1);
		const door = new THREE.Mesh(doorGeo, doorMat);
		door.position.set(0, doorH / 2 + 0.3, depth / 2 + 0.05);
		door.userData.mapGenerated = true;
		building.add(door);

		// Окна первого этажа
		const winMat = this.pool.getMatStd(
			0x333333,
			0.5,
			0.2,
			false,
			false,
			1,
			0,
			0,
		);
		for (let i = 0; i < 3; i++) {
			const winGeo = this.pool.getGeoBox(0.1, 1.5, 1.5);
			const win = new THREE.Mesh(winGeo, winMat);
			win.position.set(
				-width / 2 + 0.05,
				2 + 0.3,
				-depth / 4 + (i * depth) / 4,
			);
			win.userData.mapGenerated = true;
			building.add(win);
		}

		// Пол второго этажа (с провалами)
		const floor2LeftGeo = this.pool.getGeoBox(width / 2, 0.3, depth);
		const floor2Left = new THREE.Mesh(floor2LeftGeo, concreteMat);
		floor2Left.position.set(-width / 4, floorH + 0.15, 0);
		floor2Left.userData.mapGenerated = true;
		floor2Left.userData.walkable = true;
		building.add(floor2Left);
		this.addColliderBox(
			new THREE.Vector3(x - width / 4, floorH + 0.15, z),
			width / 2,
			0.3,
			depth,
			false,
		);

		const floor2RightGeo = this.pool.getGeoBox(width / 2 - 2, 0.3, depth);
		const floor2Right = new THREE.Mesh(floor2RightGeo, concreteMat);
		floor2Right.position.set(width / 4 + 1, floorH + 0.15, 0);
		floor2Right.userData.mapGenerated = true;
		floor2Right.userData.walkable = true;
		building.add(floor2Right);
		this.addColliderBox(
			new THREE.Vector3(x + width / 4 + 1, floorH + 0.15, z),
			width / 2 - 2,
			0.3,
			depth,
			false,
		);

		// Стены второго этажа
		const leftWall2Geo = this.pool.getGeoBox(wallThick, floorH, depth);
		const leftWall2 = new THREE.Mesh(leftWall2Geo, wallMat);
		leftWall2.position.set(-width / 2, floorH + floorH / 2 + 0.3, 0);
		leftWall2.userData.mapGenerated = true;
		leftWall2.userData.isWall = true;
		building.add(leftWall2);
		this.addColliderBox(
			new THREE.Vector3(x - width / 2, floorH + floorH / 2 + 0.3, z),
			wallThick,
			floorH,
			depth,
			false,
		);

		// Правая стена 2 этажа (разрушена)
		const rightWall2Geo = this.pool.getGeoBox(wallThick, floorH, depth * 0.6);
		const rightWall2 = new THREE.Mesh(rightWall2Geo, wallMat);
		rightWall2.position.set(width / 2, floorH + floorH / 2 + 0.3, -depth * 0.2);
		rightWall2.userData.mapGenerated = true;
		rightWall2.userData.isWall = true;
		building.add(rightWall2);
		this.addColliderBox(
			new THREE.Vector3(
				x + width / 2,
				floorH + floorH / 2 + 0.3,
				z - depth * 0.2,
			),
			wallThick,
			floorH,
			depth * 0.6,
			false,
		);

		// Задняя стена 2 этажа
		const backWall2Geo = this.pool.getGeoBox(width, floorH, wallThick);
		const backWall2 = new THREE.Mesh(backWall2Geo, wallMat);
		backWall2.position.set(0, floorH + floorH / 2 + 0.3, -depth / 2);
		backWall2.userData.mapGenerated = true;
		backWall2.userData.isWall = true;
		building.add(backWall2);
		this.addColliderBox(
			new THREE.Vector3(x, floorH + floorH / 2 + 0.3, z - depth / 2),
			width,
			floorH,
			wallThick,
			false,
		);

		// Передняя стена 2 этажа с проемом
		const front2LeftGeo = this.pool.getGeoBox(width / 3, floorH, wallThick);
		const front2Left = new THREE.Mesh(front2LeftGeo, wallMat);
		front2Left.position.set(-width / 3, floorH + floorH / 2 + 0.3, depth / 2);
		front2Left.userData.mapGenerated = true;
		front2Left.userData.isWall = true;
		building.add(front2Left);
		this.addColliderBox(
			new THREE.Vector3(
				x - width / 3,
				floorH + floorH / 2 + 0.3,
				z + depth / 2,
			),
			width / 3,
			floorH,
			wallThick,
			false,
		);

		const front2RightGeo = this.pool.getGeoBox(width / 3, floorH, wallThick);
		const front2Right = new THREE.Mesh(front2RightGeo, wallMat);
		front2Right.position.set(width / 3, floorH + floorH / 2 + 0.3, depth / 2);
		front2Right.userData.mapGenerated = true;
		front2Right.userData.isWall = true;
		building.add(front2Right);
		this.addColliderBox(
			new THREE.Vector3(
				x + width / 3,
				floorH + floorH / 2 + 0.3,
				z + depth / 2,
			),
			width / 3,
			floorH,
			wallThick,
			false,
		);

		// Окна 2 этажа
		for (let i = 0; i < 2; i++) {
			const winGeo = this.pool.getGeoBox(0.1, 1.5, 1.5);
			const win = new THREE.Mesh(winGeo, winMat);
			win.position.set(
				-width / 2 + 0.05,
				floorH + 2 + 0.3,
				-depth / 4 + (i * depth) / 3,
			);
			win.userData.mapGenerated = true;
			building.add(win);
		}

		// Пол третьего этажа
		const floor3Geo = this.pool.getGeoBox(width - 2, 0.3, depth);
		const floor3 = new THREE.Mesh(floor3Geo, concreteMat);
		floor3.position.set(1, floorH * 2 + 0.15, 0);
		floor3.userData.mapGenerated = true;
		floor3.userData.walkable = true;
		building.add(floor3);
		this.addColliderBox(
			new THREE.Vector3(x + 1, floorH * 2 + 0.15, z),
			width - 2,
			0.3,
			depth,
			false,
		);

		// Стены третьего этажа (сильно разрушены)
		const leftWall3Geo = this.pool.getGeoBox(wallThick, floorH, depth * 0.7);
		const leftWall3 = new THREE.Mesh(leftWall3Geo, wallMat);
		leftWall3.position.set(
			-width / 2,
			floorH * 2 + floorH / 2 + 0.3,
			-depth * 0.15,
		);
		leftWall3.userData.mapGenerated = true;
		leftWall3.userData.isWall = true;
		building.add(leftWall3);
		this.addColliderBox(
			new THREE.Vector3(
				x - width / 2,
				floorH * 2 + floorH / 2 + 0.3,
				z - depth * 0.15,
			),
			wallThick,
			floorH,
			depth * 0.7,
			false,
		);

		const rightWall3Geo = this.pool.getGeoBox(wallThick, floorH, depth * 0.5);
		const rightWall3 = new THREE.Mesh(rightWall3Geo, wallMat);
		rightWall3.position.set(
			width / 2,
			floorH * 2 + floorH / 2 + 0.3,
			-depth * 0.25,
		);
		rightWall3.userData.mapGenerated = true;
		rightWall3.userData.isWall = true;
		building.add(rightWall3);
		this.addColliderBox(
			new THREE.Vector3(
				x + width / 2,
				floorH * 2 + floorH / 2 + 0.3,
				z - depth * 0.25,
			),
			wallThick,
			floorH,
			depth * 0.5,
			false,
		);

		// Задняя стена 3 этажа
		const backWall3Geo = this.pool.getGeoBox(width, floorH, wallThick);
		const backWall3 = new THREE.Mesh(backWall3Geo, wallMat);
		backWall3.position.set(0, floorH * 2 + floorH / 2 + 0.3, -depth / 2);
		backWall3.userData.mapGenerated = true;
		backWall3.userData.isWall = true;
		building.add(backWall3);
		this.addColliderBox(
			new THREE.Vector3(x, floorH * 2 + floorH / 2 + 0.3, z - depth / 2),
			width,
			floorH,
			wallThick,
			false,
		);

		// Крыша (разрушенная) с деталями
		const roofGeo = this.pool.getGeoBox(width - 1, 0.3, depth - 1);
		const roof = new THREE.Mesh(roofGeo, concreteMat);
		roof.position.set(0, floorH * 3 + 0.3, 0);
		roof.userData.mapGenerated = true;
		building.add(roof);

		// Дымоходы на крыше
		for (let ch = 0; ch < 4; ch++) {
			const chimneyH = 2 + this._rand() * 2;
			const chimneyGeo = this.pool.getGeoBox(1.5, chimneyH, 1.5);
			const chimneyMat = this.pool.getMatStd(
				0x666655,
				0.9,
				0,
				false,
				false,
				1,
				0,
				0,
			);
			const chimney = new THREE.Mesh(chimneyGeo, chimneyMat);
			chimney.position.set(
				-width / 4 + ch * (width / 6),
				floorH * 3 + 0.3 + chimneyH / 2,
				-depth / 4 + this._rand() * 5,
			);
			chimney.userData.mapGenerated = true;
			building.add(chimney);
		}

		// Вентиляции на крыше
		for (let v = 0; v < 3; v++) {
			const ventGeo = this.pool.getGeoBox(2, 1.5, 2);
			const ventMat = this.pool.getMatStd(
				0x777766,
				0.8,
				0,
				false,
				false,
				1,
				0,
				0,
			);
			const vent = new THREE.Mesh(ventGeo, ventMat);
			vent.position.set(
				width / 4 + this._rand() * 5,
				floorH * 3 + 0.3 + 0.75,
				depth / 4 + this._rand() * 5,
			);
			vent.userData.mapGenerated = true;
			building.add(vent);
		}

		// Балконы на фасадах
		const balconyMat = this.pool.getMatStd(
			0x888877,
			0.85,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		for (let floor = 0; floor < 3; floor++) {
			for (let b = 0; b < 4; b++) {
				const balconyGeo = this.pool.getGeoBox(3, 0.2, 1.5);
				const balcony = new THREE.Mesh(balconyGeo, balconyMat);
				balcony.position.set(
					-width / 3 + b * (width / 5),
					floor * floorH + 2.5 + 0.3,
					depth / 2 + 0.75,
				);
				balcony.userData.mapGenerated = true;
				building.add(balcony);
				// Перила балкона
				const railGeo = this.pool.getGeoBox(3, 1, 0.1);
				const rail = new THREE.Mesh(railGeo, balconyMat);
				rail.position.set(
					-width / 3 + b * (width / 5),
					floor * floorH + 2.5 + 0.3 + 0.5,
					depth / 2 + 1.4,
				);
				rail.userData.mapGenerated = true;
				building.add(rail);
			}
		}

		// Окна на всех этажах и стенах
		for (let floor = 0; floor < 3; floor++) {
			for (let i = 0; i < 6; i++) {
				// Передняя стена
				const winF = this.pool.getGeoBox(1.5, 2, 0.1);
				const winMeshF = new THREE.Mesh(winF, winMat);
				winMeshF.position.set(
					-width / 3 + i * (width / 6),
					floor * floorH + 2.5 + 0.3,
					depth / 2 + 0.05,
				);
				winMeshF.userData.mapGenerated = true;
				building.add(winMeshF);
				// Задняя стена
				const winB = new THREE.Mesh(winF, winMat);
				winB.position.set(
					-width / 3 + i * (width / 6),
					floor * floorH + 2.5 + 0.3,
					-depth / 2 - 0.05,
				);
				winB.userData.mapGenerated = true;
				building.add(winB);
			}
		}

		// Квартиры (внутри дома) - перегородки
		// 1 этаж: 2 квартиры
		const partition1Geo = this.pool.getGeoBox(
			wallThick,
			floorH - 0.5,
			depth - 1,
		);
		const partition1 = new THREE.Mesh(partition1Geo, wallMat);
		partition1.position.set(0, floorH / 2 + 0.3, 0);
		partition1.userData.mapGenerated = true;
		building.add(partition1);
		this.addColliderBox(
			new THREE.Vector3(x, floorH / 2 + 0.3, z),
			wallThick,
			floorH - 0.5,
			depth - 1,
			false,
		);

		// 2 этаж: перегородки
		const partition2Geo = this.pool.getGeoBox(
			wallThick,
			floorH - 0.5,
			depth - 2,
		);
		const partition2 = new THREE.Mesh(partition2Geo, wallMat);
		partition2.position.set(-width / 4, floorH + floorH / 2 + 0.3, 0);
		partition2.userData.mapGenerated = true;
		building.add(partition2);
		this.addColliderBox(
			new THREE.Vector3(x - width / 4, floorH + floorH / 2 + 0.3, z),
			wallThick,
			floorH - 0.5,
			depth - 2,
			false,
		);

		// 3 этаж: перегородки
		const partition3Geo = this.pool.getGeoBox(
			wallThick,
			floorH - 0.5,
			depth * 0.6,
		);
		const partition3 = new THREE.Mesh(partition3Geo, wallMat);
		partition3.position.set(2, floorH * 2 + floorH / 2 + 0.3, -depth * 0.2);
		partition3.userData.mapGenerated = true;
		building.add(partition3);
		this.addColliderBox(
			new THREE.Vector3(x + 2, floorH * 2 + floorH / 2 + 0.3, z - depth * 0.2),
			wallThick,
			floorH - 0.5,
			depth * 0.6,
			false,
		);

		// Сундуки (лут) в квартирах
		const chestMat = this.pool.getMatStd(
			0x8b4513,
			0.7,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const chestGeo = this.pool.getGeoBox(1, 0.7, 0.7);

		// 1 этаж, квартира 1
		const chest1 = new THREE.Mesh(chestGeo, chestMat);
		chest1.position.set(-width / 4, 0.7, -depth / 4);
		chest1.userData.mapGenerated = true;
		building.add(chest1);
		this.addColliderBox(
			new THREE.Vector3(x - width / 4, 0.7, z - depth / 4),
			1,
			0.7,
			0.7,
			false,
		);

		// 1 этаж, квартира 2
		const chest2 = new THREE.Mesh(chestGeo, chestMat);
		chest2.position.set(width / 4, 0.7, depth / 4);
		chest2.userData.mapGenerated = true;
		building.add(chest2);
		this.addColliderBox(
			new THREE.Vector3(x + width / 4, 0.7, z + depth / 4),
			1,
			0.7,
			0.7,
			false,
		);

		// 2 этаж
		const chest3 = new THREE.Mesh(chestGeo, chestMat);
		chest3.position.set(-width / 3, floorH + 0.7, -depth / 3);
		chest3.userData.mapGenerated = true;
		building.add(chest3);
		this.addColliderBox(
			new THREE.Vector3(x - width / 3, floorH + 0.7, z - depth / 3),
			1,
			0.7,
			0.7,
			false,
		);

		// 3 этаж
		const chest4 = new THREE.Mesh(chestGeo, chestMat);
		chest4.position.set(3, floorH * 2 + 0.7, -depth / 3);
		chest4.userData.mapGenerated = true;
		building.add(chest4);
		this.addColliderBox(
			new THREE.Vector3(x + 3, floorH * 2 + 0.7, z - depth / 3),
			1,
			0.7,
			0.7,
			false,
		);

		building.position.set(x, 0, z);
		building.userData.mapGenerated = true;
		this.scene.add(building);
	}

	_addRuinedBuilding(x, z) {
		// Medium ruined building
		const w = 12 + this._rand() * 8;
		const d = 10 + this._rand() * 6;
		const h = 8 + this._rand() * 6;

		const buildingMat = this.pool.getMatStd(
			COLORS.militaryBuilding,
			0.75,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const wallMat = this.pool.getMatStd(
			COLORS.militaryRuined,
			0.85,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);

		// Solid floor
		const floorGeo = this.pool.getGeoBox(w, 1, d);
		const floor = new THREE.Mesh(floorGeo, buildingMat);
		floor.position.set(x, 0.5, z);
		floor.userData.mapGenerated = true;
		this.scene.add(floor);

		// Walls
		const wallThick = 0.5;
		for (const side of [-1, 1]) {
			const sideGeo = this.pool.getGeoBox(wallThick, h, d);
			const sideWall = new THREE.Mesh(sideGeo, wallMat);
			sideWall.position.set(x + (side * w) / 2, h / 2, z);
			sideWall.userData.mapGenerated = true;
			this.scene.add(sideWall);
			this.addColliderBox(
				new THREE.Vector3(x + (side * w) / 2, h / 2, z),
				wallThick,
				h,
				d,
				false,
			);
		}

		const doorW = 2;
		const doorH = 2.8;
		const frontLeftW = w / 2 - doorW / 2 - 0.5;
		const frontRightW = w / 2 - doorW / 2 - 0.5;
		const frontTopH = h - doorH - 0.5;
		const doorMat = this.pool.getMatStd(
			0x4e342e,
			0.9,
			0,
			false,
			false,
			1,
			0,
			0,
			false,
		);
		if (frontLeftW > 0) {
			const fl = new THREE.Mesh(
				this.pool.getGeoBox(frontLeftW, h, wallThick),
				wallMat,
			);
			fl.position.set(x - frontLeftW / 2 - 0.5, h / 2, z + d / 2);
			fl.userData.mapGenerated = true;
			this.scene.add(fl);
			this.addColliderBox(
				new THREE.Vector3(x - frontLeftW / 2 - 0.5, h / 2, z + d / 2),
				frontLeftW,
				h,
				wallThick,
				false,
			);
		}
		if (frontRightW > 0) {
			const fr = new THREE.Mesh(
				this.pool.getGeoBox(frontRightW, h, wallThick),
				wallMat,
			);
			fr.position.set(x + frontRightW / 2 + 0.5, h / 2, z + d / 2);
			fr.userData.mapGenerated = true;
			this.scene.add(fr);
			this.addColliderBox(
				new THREE.Vector3(x + frontRightW / 2 + 0.5, h / 2, z + d / 2),
				frontRightW,
				h,
				wallThick,
				false,
			);
		}
		if (frontTopH > 0) {
			const ft = new THREE.Mesh(
				this.pool.getGeoBox(w, frontTopH, wallThick),
				wallMat,
			);
			ft.position.set(x, doorH + frontTopH / 2, z + d / 2);
			ft.userData.mapGenerated = true;
			this.scene.add(ft);
			this.addColliderBox(
				new THREE.Vector3(x, doorH + frontTopH / 2, z + d / 2),
				w,
				frontTopH,
				wallThick,
				false,
			);
		}
		const door = new THREE.Mesh(
			this.pool.getGeoBox(doorW, doorH, 0.1),
			doorMat,
		);
		door.position.set(x, doorH / 2, z + d / 2 + 0.05);
		door.userData.mapGenerated = true;
		this.scene.add(door);

		const back = new THREE.Mesh(frontGeo, wallMat);
		back.position.set(x, h / 2, z - d / 2);
		back.userData.mapGenerated = true;
		this.scene.add(back);
		this.addColliderBox(
			new THREE.Vector3(x, h / 2, z - d / 2),
			w,
			h,
			wallThick,
			false,
		);

		// Partial roof (ruined)
		const roofGeo = this.pool.getGeoBox(w - 1, 0.3, d - 1);
		const roof = new THREE.Mesh(roofGeo, buildingMat);
		roof.position.set(x, h, z);
		roof.userData.mapGenerated = true;
		this.scene.add(roof);

		this._buildings.push({
			x,
			z,
			w,
			d,
			template: { type: "military_building" },
		});
	}

	_addMilitaryTank(x, z) {
		const tank = new THREE.Group();
		const hullMat = this.pool.getMatStd(
			COLORS.militaryTank,
			0.6,
			0.4,
			false,
			false,
			1,
			0,
			0,
		);

		// Medium hull
		const hullGeo = this.pool.getGeoBox(7, 2.8, 10);
		const hull = new THREE.Mesh(hullGeo, hullMat);
		hull.userData.mapGenerated = true;
		hull.position.y = 2.2;
		tank.add(hull);

		// Turret
		const turretGeo = this.pool.getGeoCylinder(2.1, 2.7, 2.2);
		const turretMat = this.pool.getMatStd(
			0x54624a,
			0.5,
			0.5,
			false,
			false,
			1,
			0,
			0,
		);
		const turret = new THREE.Mesh(turretGeo, turretMat);
		turret.userData.mapGenerated = true;
		turret.position.set(0, 5, 0);
		tank.add(turret);

		// Barrel
		const barrelGeo = this.pool.getGeoCylinder(0.34, 0.48, 8);
		const barrelMat = this.pool.getMatStd(
			0x3d4a2f,
			0.4,
			0.7,
			false,
			false,
			1,
			0,
			0,
		);
		const barrel = new THREE.Mesh(barrelGeo, barrelMat);
		barrel.userData.mapGenerated = true;
		barrel.rotation.x = Math.PI / 2;
		barrel.position.set(0, 5, -5.2);
		tank.add(barrel);

		// Tracks
		for (const side of [-1, 1]) {
			const trackGeo = this.pool.getGeoBox(1.4, 1.5, 10.8);
			const trackMat = this.pool.getMatStd(
				COLORS.militaryTread,
				0.9,
				0,
				false,
				false,
				1,
				0,
				0,
			);
			const track = new THREE.Mesh(trackGeo, trackMat);
			track.userData.mapGenerated = true;
			track.position.set(side * 3.2, 0.75, 0);
			tank.add(track);
		}

		tank.position.set(x, 0, z);
		tank.rotation.y = this._rand() * Math.PI * 2;
		tank.userData.mapGenerated = true;
		this.scene.add(tank);

		this.addColliderBox(new THREE.Vector3(x, 3, z), 8, 6, 12, false);
	}

	_addStalkerCorpse(x, z, floorY = 0, parent) {
		// Easter egg: Stalker NPC corpse (bot-style model) visible in military area
		const corpse = new THREE.Group();

		// Stalker materials
		const uniformMat = this.pool.getMatStd(
			0x3a4a32,
			0.85,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		const vestMat = this.pool.getMatStd(
			0x4a3f32,
			0.8,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		const bootMat = this.pool.getMatStd(
			0x1a1a1a,
			0.9,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		const skinMat = this.pool.getMatStd(
			0x9e8b6e,
			0.75,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		const gasMaskMat = this.pool.getMatStd(
			0x1a1a1a,
			0.7,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		const filterMat = this.pool.getMatStd(
			0x2d2d2d,
			0.6,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		const eyeMat = this.pool.getMatStd(0x111111, 0.3, 0, false, false, 1, 0, 0);

		// === BODY (bot-style, lying on back) ===
		const torsoGeo = this.pool.getGeoBox(0.9, 0.55, 0.5);
		const torso = new THREE.Mesh(torsoGeo, uniformMat);
		torso.position.set(0, 0.3, 0);
		corpse.add(torso);

		const lowerTorsoGeo = this.pool.getGeoBox(0.85, 0.45, 0.5);
		const lowerTorso = new THREE.Mesh(lowerTorsoGeo, uniformMat);
		lowerTorso.position.set(0, 0.05, 0);
		corpse.add(lowerTorso);

		// Tactical vest
		const vestGeo = this.pool.getGeoBox(0.95, 0.5, 0.12);
		const vest = new THREE.Mesh(vestGeo, vestMat);
		vest.position.set(0, 0.3, 0.3);
		corpse.add(vest);

		// Vest pockets
		for (const s of [-1, 1]) {
			const pGeo = this.pool.getGeoBox(0.1, 0.12, 0.1);
			const p = new THREE.Mesh(pGeo, vestMat);
			p.position.set(s * 0.25, 0.3, 0.36);
			corpse.add(p);
		}

		// Belt with pouches
		const beltGeo = this.pool.getGeoBox(0.9, 0.1, 0.6);
		const belt = new THREE.Mesh(beltGeo, vestMat);
		belt.position.set(0, 0.12, 0);
		corpse.add(belt);
		for (const s of [-1, 1]) {
			const ppGeo = this.pool.getGeoBox(0.08, 0.35, 0.08);
			const pp = new THREE.Mesh(ppGeo, vestMat);
			pp.position.set(s * 0.35, 0.05, -0.3);
			corpse.add(pp);
		}

		// === HEAD with GAS MASK ===
		const headGeo = this.pool.getGeoBox(0.65, 0.65, 0.65);
		const head = new THREE.Mesh(headGeo, skinMat);
		head.position.set(0, 0.85, -0.4);
		head.rotation.x = 0.1;
		corpse.add(head);

		// Gas mask
		const maskGeo = this.pool.getGeoBox(0.45, 0.35, 0.2);
		const mask = new THREE.Mesh(maskGeo, gasMaskMat);
		mask.position.set(0, 0.85, -0.65);
		mask.rotation.x = 0.1;
		corpse.add(mask);

		// Gas mask filter (prominent)
		const filterGeo = this.pool.getGeoCylinder(0.15, 0.15, 0.12, 8);
		const filter = new THREE.Mesh(filterGeo, filterMat);
		filter.position.set(0, 0.85, -0.75);
		filter.rotation.x = 0.1;
		corpse.add(filter);

		// Gas mask tube
		const tubeGeo = this.pool.getGeoCylinder(0.03, 0.03, 0.2, 6);
		const tube = new THREE.Mesh(tubeGeo, gasMaskMat);
		tube.position.set(0, 0.75, -0.6);
		tube.rotation.x = 0.1;
		corpse.add(tube);

		// Eyes
		for (const s of [-1, 1]) {
			const eGeo = this.pool.getGeoBox(0.1, 0.1, 0.05);
			const e = new THREE.Mesh(eGeo, eyeMat);
			e.position.set(s * 0.16, 0.92, -0.38);
			corpse.add(e);
		}

		// === BACKPACK ===
		const packGeo = this.pool.getGeoBox(0.55, 0.4, 0.3);
		const pack = new THREE.Mesh(packGeo, vestMat);
		pack.position.set(0, 0.3, 0.4);
		corpse.add(pack);
		for (const s of [-1, 1]) {
			const strGeo = this.pool.getGeoBox(0.08, 0.4, 0.35);
			const str = new THREE.Mesh(strGeo, vestMat);
			str.position.set(s * 0.28, 0.3, 0.35);
			corpse.add(str);
		}

		// === LEGS (bent at knees) ===
		for (const s of [-1, 1]) {
			const ulGeo = this.pool.getGeoBox(0.3, 0.45, 0.3);
			const ul = new THREE.Mesh(ulGeo, uniformMat);
			ul.position.set(s * 0.22, 0.05, 0.35);
			ul.rotation.x = -0.8;
			corpse.add(ul);

			const llGeo = this.pool.getGeoBox(0.28, 0.45, 0.28);
			const ll = new THREE.Mesh(llGeo, uniformMat);
			ll.position.set(s * 0.22, 0.05, 0.75);
			ll.rotation.x = -0.3;
			corpse.add(ll);

			const bootGeo = this.pool.getGeoBox(0.32, 0.16, 0.42);
			const boot = new THREE.Mesh(bootGeo, bootMat);
			boot.position.set(s * 0.22, 0.02, 1.0);
			corpse.add(boot);
		}

		// === ARMS ===
		for (const s of [-1, 1]) {
			const uaGeo = this.pool.getGeoBox(0.26, 0.45, 0.26);
			const ua = new THREE.Mesh(uaGeo, uniformMat);
			ua.position.set(s * 0.62, 0.3, -0.1);
			ua.rotation.x = -0.2;
			ua.rotation.z = s * 0.3;
			corpse.add(ua);

			const faGeo = this.pool.getGeoBox(0.24, 0.4, 0.24);
			const fa = new THREE.Mesh(faGeo, bootMat);
			fa.position.set(s * 0.62, 0.1, -0.4);
			fa.rotation.x = -0.4;
			fa.rotation.z = s * 0.2;
			corpse.add(fa);

			const handGeo = this.pool.getGeoBox(0.2, 0.15, 0.2);
			const hand = new THREE.Mesh(handGeo, bootMat);
			hand.position.set(s * 0.62, 0.05, -0.6);
			corpse.add(hand);
		}

		corpse.userData.isStalkerCorpse = true;
		corpse.userData.easterEgg = true;
		corpse.userData.easterEggWeapon = "bazooka";
		corpse.userData.easterEggCollected = false;

		// Blood pool on the floor
		const bloodMat = new THREE.MeshStandardMaterial({
			color: 0x8b0000,
			emissive: 0x4a0000,
			emissiveIntensity: 0.8,
			transparent: true,
			opacity: 0.7,
			roughness: 0.3,
		});
		const bloodPool = new THREE.Mesh(
			this.pool.getGeoCylinder(0.8, 0.8, 0.02, 16),
			bloodMat,
		);
		bloodPool.position.set(0, 0.01, 0);
		corpse.add(bloodPool);
		bloodPool.frustumCulled = false;

		// Blood splatter on nearby floor
		const splatMat = new THREE.MeshStandardMaterial({
			color: 0x6b0000,
			emissive: 0x3a0000,
			emissiveIntensity: 0.6,
			transparent: true,
			opacity: 0.5,
			roughness: 0.4,
		});
		for (let i = 0; i < 4; i++) {
			const angle = (i / 4) * Math.PI * 2;
			const dist = 0.9 + Math.random() * 0.6;
			const splat = new THREE.Mesh(
				this.pool.getGeoCylinder(
					0.15 + Math.random() * 0.2,
					0.15 + Math.random() * 0.2,
					0.01,
					8,
				),
				splatMat,
			);
			const r = splat.geometry.parameters.radiusTop;
			splat.position.set(Math.cos(angle) * dist, 0.01, Math.sin(angle) * dist);
			corpse.add(splat);
			splat.frustumCulled = false;
		}

		// Disable frustum culling on Group itself AND all children
		// Three.js skips children if Group.frustumCulled=true and bounding box misses frustum
		corpse.frustumCulled = false;
		corpse.traverse((child) => {
			if (child.isMesh) {
				child.frustumCulled = false;
				child.userData.easterEgg = true;
			}
		});

		corpse.position.set(x, floorY, z);
		corpse.userData.mapGenerated = true;
		(parent || this.scene).add(corpse);
		this.addColliderBox(new THREE.Vector3(x, floorY, z), 1.5, 0.6, 2.0, false);
	}

	_addMilitaryFences(startX, startZ, size) {
		const fenceMat = this.pool.getMatStd(
			0x4a5238,
			0.9,
			0,
			false,
			false,
			1,
			0,
			0,
		);

		// Perimeter fence posts
		const postGeo = this.pool.getGeoBox(0.15, 2.5, 0.15);
		for (let i = 0; i < 24; i++) {
			const angle = (i / 24) * Math.PI * 2;
			const r = size * 0.45;
			const px = startX + r * Math.cos(angle);
			const pz = startZ + r * Math.sin(angle);

			const post = new THREE.Mesh(postGeo, fenceMat);
			post.position.set(px, 1.25, pz);
			post.userData.mapGenerated = true;
			this.scene.add(post);
		}

		// Barbed wire between posts
		const wireMat = new THREE.LineBasicMaterial({ color: 0x666666 });
		for (let i = 0; i < 24; i++) {
			const angle1 = (i / 24) * Math.PI * 2;
			const angle2 = ((i + 1) / 24) * Math.PI * 2;
			const r = size * 0.45;

			const x1 = startX + r * Math.cos(angle1);
			const z1 = startZ + r * Math.sin(angle1);
			const x2 = startX + r * Math.cos(angle2);
			const z2 = startZ + r * Math.sin(angle2);

			const wireGeo = new THREE.BufferGeometry();
			wireGeo.setAttribute(
				"position",
				new THREE.Float32BufferAttribute([x1, 2.3, z1, x2, 2.3, z2], 3),
			);

			const wireLine = new THREE.Line(wireGeo, wireMat);
			wireLine.userData.mapGenerated = true;
			this.scene.add(wireLine);
		}
	}

	_addSandbagBarrier(x, z) {
		const mat = this.pool.getMatStd(0x9e9e9e, 0.95, 0, true, false, 1, 0, 0);

		// L-shape sandbag wall
		for (let i = 0; i < 3; i++) {
			const bagGeo = this.pool.getGeoBox(0.5, 0.3, 0.35);
			const bag = new THREE.Mesh(bagGeo, mat);
			bag.position.set(x + i * 0.55, 0.15, z);
			bag.userData.mapGenerated = true;
			this.scene.add(bag);
			this.addColliderBox(
				new THREE.Vector3(x + i * 0.55, 0.15, z),
				0.5,
				0.3,
				0.35,
				false,
			);
		}
		for (let i = 0; i < 2; i++) {
			const bagGeo = this.pool.getGeoBox(0.5, 0.3, 0.35);
			const bag = new THREE.Mesh(bagGeo, mat);
			bag.position.set(x, 0.15, z + (i + 1) * 0.55);
			bag.userData.mapGenerated = true;
			this.scene.add(bag);
			this.addColliderBox(
				new THREE.Vector3(x, 0.15, z + (i + 1) * 0.55),
				0.5,
				0.3,
				0.35,
				false,
			);
		}

		// Visual only — no spawn tile
	}

	_addMilitaryCrate(x, z) {
		// Massive military crate — grand scale
		const size = 2.5 + this._rand() * 1.5;
		const geo = this.pool.getGeoBox(size, size, size);
		const mat = this.pool.getMatStd(0x6d4c41, 0.8, 0, true, false, 1, 0, 0);
		const crate = new THREE.Mesh(geo, mat);
		crate.position.set(x, size / 2, z);
		crate.rotation.y = this._rand() * Math.PI;
		crate.userData.mapGenerated = true;
		this.scene.add(crate);
		this.addColliderBox(
			new THREE.Vector3(x, size / 2, z),
			size,
			size,
			size,
			false,
		);

		// Visual only — no spawn tile
	}

	// =========================================================================
	// ICE/SNOW QUADRANT (SE: x > 0, z > 0)
	// =========================================================================
	_generateIceQuadrant() {
		const min = 6;
		const max = HALF - 6;
		const span = max - min;
		const center = (min + max) * 0.5;
		this._generateSteppedIceLake(center, center);

		// Снежные дюны — больше
		for (let drift = 0; drift < 6; drift++) {
			const driftW = 8 + this._rand() * 12;
			const driftH = 2 + this._rand() * 4;
			const driftD = 6 + this._rand() * 10;
			const driftGeo = this.pool.getGeoSphere(driftW);
			const driftMat = this.pool.getMatStd(
				0xeef4ff,
				0.9,
				0,
				true,
				false,
				1,
				0,
				0,
			);
			const driftMesh = new THREE.Mesh(driftGeo, driftMat);
			driftMesh.position.set(
				min + this._rand() * span,
				driftH * 0.5,
				min + this._rand() * span,
			);
			driftMesh.scale.set(1, driftH / driftW, driftD / driftW);
			driftMesh.userData.mapGenerated = true;
			this.scene.add(driftMesh);
			this.addColliderBox(
				new THREE.Vector3(
					driftMesh.position.x,
					driftH / 2,
					driftMesh.position.z,
				),
				driftW * 2,
				driftH,
				driftD * 2,
				false,
			);
		}

		// Иглу — детализированные, ближе к краям как в референсе
		const iglooPositions = [
			{ x: 104, z: 38 },
			{ x: 102, z: 104 },
			{ x: 66, z: 112 },
			{ x: 34, z: 102 },
		];
		for (const pos of iglooPositions) {
			this._addDetailedIgloo(pos.x, pos.z);
		}

		// Зимний костёр у озера
		this._addIceCampfire(88, 52);

		this._addSnowShelters(min, min, span);
		// Крупные ледяные кристаллы по краям
		const crystalPositions = [
			{ x: 112, z: 24 },
			{ x: 112, z: 112 },
			{ x: 24, z: 112 },
			{ x: 24, z: 28 },
		];
		for (const cp of crystalPositions) {
			this._addIceCrystal(cp.x, cp.z);
			// Несколько мелких рядом
			for (let j = 0; j < 3; j++) {
				this._addIceCrystal(
					cp.x + (this._rand() - 0.5) * 12,
					cp.z + (this._rand() - 0.5) * 12,
				);
			}
		}

		// Снежные деревья — сгруппированные как в референсе
		for (let i = 0; i < 24; i++) {
			const tx = min + this._rand() * span;
			const tz = min + this._rand() * span;
			// Не ставим деревья прямо в озеро
			const distToLake = Math.sqrt((tx - center) ** 2 + (tz - center) ** 2);
			if (distToLake < 30) continue;
			this._addSnowTree(tx, tz);
		}

		// Ледяные стены (остатки стен)
		for (let wall = 0; wall < 6; wall++) {
			const wallW = 3 + this._rand() * 6;
			const wallH = 2 + this._rand() * 3;
			const wallGeo = this.pool.getGeoBox(wallW, wallH, 0.5);
			const wallMat = this.pool.getMatStd(
				0xb7d3e8,
				0.72,
				0.05,
				true,
				false,
				1,
				0,
				0,
			);
			const wallMesh = new THREE.Mesh(wallGeo, wallMat);
			wallMesh.position.set(
				min + this._rand() * span,
				wallH / 2,
				min + this._rand() * span,
			);
			wallMesh.rotation.y = this._rand() * Math.PI;
			wallMesh.userData.mapGenerated = true;
			wallMesh.userData.isWall = true;
			this.scene.add(wallMesh);
			const c = Math.abs(Math.cos(wallMesh.rotation.y));
			const s = Math.abs(Math.sin(wallMesh.rotation.y));
			this.addColliderBox(
				wallMesh.position.clone(),
				wallW * c + 0.5 * s,
				wallH,
				wallW * s + 0.5 * c,
				false,
			);
		}

		// Радиовышка (как в референсе — справа от озера)
		this._addRadioTower(96, 56);

		// Edge trees — dense ice perimeter
		this._addIceEdgeTrees(min, min, span);

		// Falling snow particles
		this._addSnowParticles();
	}

	// =========================================================================
	// STEPPED ICE LAKE — квадратные ступенчатые платформы льда как в референсе
	// =========================================================================
	_generateSteppedIceLake(cx, cz) {
		const lakeMat = this.pool.getMatStd(
			0x65b9dd,
			0.42,
			0.08,
			true,
			false,
			1,
			0,
			0,
		);
		const icePlatMat = this.pool.getMatStd(
			0xb8e5f4,
			0.58,
			0.04,
			true,
			false,
			1,
			0,
			0,
		);
		const shallowMat = this.pool.getMatStd(
			0x8bd2eb,
			0.5,
			0.05,
			true,
			false,
			1,
			0,
			0,
		);

		// Центральное озеро — глубокая часть (самая синяя)
		const deepSize = 34;
		const deepGeo = this.pool.getGeoBox(deepSize, 0.3, deepSize);
		const deep = new THREE.Mesh(deepGeo, lakeMat);
		deep.position.set(cx, 0.15, cz);
		deep.userData.mapGenerated = true;
		this.scene.add(deep);
		this.addColliderBox(
			new THREE.Vector3(cx, 0.15, cz),
			deepSize,
			0.3,
			deepSize,
			false,
		);

		// Мелкие зоны вокруг — квадратные плитки
		const tileSize = 10;
		const steps = [
			// Первый уровень ступеней (ближние к центру)
			{ dx: -20, dz: -20, w: tileSize, d: tileSize },
			{ dx: 0, dz: -25, w: tileSize * 2, d: tileSize },
			{ dx: 20, dz: -20, w: tileSize, d: tileSize },
			{ dx: 25, dz: 0, w: tileSize, d: tileSize * 2 },
			{ dx: 20, dz: 20, w: tileSize, d: tileSize },
			{ dx: 0, dz: 25, w: tileSize * 2, d: tileSize },
			{ dx: -20, dz: 20, w: tileSize, d: tileSize },
			{ dx: -25, dz: 0, w: tileSize, d: tileSize * 2 },
		];

		for (const s of steps) {
			const geo = this.pool.getGeoBox(s.w, 0.2, s.d);
			const mesh = new THREE.Mesh(geo, shallowMat);
			mesh.position.set(cx + s.dx, 0.1, cz + s.dz);
			mesh.userData.mapGenerated = true;
			this.scene.add(mesh);
			this.addColliderBox(
				new THREE.Vector3(cx + s.dx, 0.1, cz + s.dz),
				s.w,
				0.2,
				s.d,
				false,
			);
		}

		// Внешние квадратные плитки льда (разной высоты) — как в референсе
		const outerTiles = [
			{ dx: -40, dz: -40, w: 14, d: 14, y: 0.08 },
			{ dx: 0, dz: -43, w: 20, d: 10, y: 0.08 },
			{ dx: 40, dz: -40, w: 14, d: 14, y: 0.08 },
			{ dx: 43, dz: 0, w: 10, d: 20, y: 0.08 },
			{ dx: 40, dz: 40, w: 14, d: 14, y: 0.08 },
			{ dx: 0, dz: 43, w: 20, d: 10, y: 0.08 },
			{ dx: -40, dz: 40, w: 14, d: 14, y: 0.08 },
			{ dx: -43, dz: 0, w: 10, d: 20, y: 0.08 },
			// Угловые дополнительные
			{ dx: -20, dz: -40, w: 9, d: 9, y: 0.06 },
			{ dx: 20, dz: -40, w: 9, d: 9, y: 0.06 },
			{ dx: 40, dz: -20, w: 9, d: 9, y: 0.06 },
			{ dx: 40, dz: 20, w: 9, d: 9, y: 0.06 },
			{ dx: 20, dz: 40, w: 9, d: 9, y: 0.06 },
			{ dx: -20, dz: 40, w: 9, d: 9, y: 0.06 },
			{ dx: -40, dz: 20, w: 9, d: 9, y: 0.06 },
			{ dx: -40, dz: -20, w: 9, d: 9, y: 0.06 },
		];

		for (const t of outerTiles) {
			const geo = this.pool.getGeoBox(t.w, 0.15, t.d);
			const mesh = new THREE.Mesh(geo, icePlatMat);
			mesh.position.set(cx + t.dx, t.y, cz + t.dz);
			mesh.userData.mapGenerated = true;
			mesh.userData.walkable = true;
			this.scene.add(mesh);
			this.addColliderBox(
				new THREE.Vector3(cx + t.dx, t.y, cz + t.dz),
				t.w,
				0.15,
				t.d,
				true,
			);
		}

		// Снежные купола на льду (большие глыбы льда по краям)
		const snowMat = this.pool.getMatStd(
			0xffffff,
			0.85,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		for (let i = 0; i < 12; i++) {
			const angle = (i / 12) * Math.PI * 2 + this._rand() * 0.3;
			const r = 35 + this._rand() * 7;
			const bx = cx + Math.cos(angle) * r;
			const bz = cz + Math.sin(angle) * r;
			const size = 3 + this._rand() * 4;
			const geo = this.pool.getGeoSphere(size);
			const mesh = new THREE.Mesh(geo, snowMat);
			mesh.position.set(bx, 0, bz);
			mesh.userData.mapGenerated = true;
			this.scene.add(mesh);
		}
	}

	_addIceEdgeTrees(startX, startZ, size) {
		const add = (x, z) =>
			this._addSnowTree(
				x + (this._rand() - 0.5) * 3,
				z + (this._rand() - 0.5) * 3,
			);
		for (let i = 18; i < size - 18; i += 34) {
			add(startX + 8, startZ + i);
			add(startX + size - 8, startZ + i);
			add(startX + i, startZ + 8);
			add(startX + i, startZ + size - 8);
		}
	}

	_addIceSnowPiles(startX, startZ, size) {
		const snowMat = this.pool.getMatStd(0xffffff, 0.9, 0, true, false, 1, 0, 0);

		for (let i = 0; i < 6; i++) {
			const x = startX + this._rand() * size;
			const z = startZ + this._rand() * size;
			const pileGeo = this.pool.getGeoSphere(
				0.5 + this._rand() * 1.5,
				6,
				4,
				0,
				Math.PI * 2,
				0,
				Math.PI / 2,
			);
			const pile = new THREE.Mesh(pileGeo, snowMat);
			pile.position.set(x, 0, z);
			pile.scale.y = 0.3;
			pile.userData.mapGenerated = true;
			this.scene.add(pile);
		}
	}

	_addIcePillars(cx, cz) {
		const pillarMat = this.pool.getMatStd(
			0xaaddff,
			0.2,
			0.3,
			true,
			true,
			0.7,
			0,
			0,
		);

		// Pillars around lake
		for (let i = 0; i < 12; i++) {
			const angle = (i / 12) * Math.PI * 2;
			const dist = 35 + this._rand() * 15;
			const px = cx + Math.cos(angle) * dist;
			const pz = cz + Math.sin(angle) * dist;
			const height = 3 + this._rand() * 5;
			const radius = 0.5 + this._rand() * 0.8;

			const geo = this.pool.getGeoCylinder(radius * 0.5, radius, height);
			const pillar = new THREE.Mesh(geo, pillarMat);
			pillar.position.set(px, height / 2, pz);
			pillar.rotation.z = (this._rand() - 0.5) * 0.2;
			pillar.userData.isIcePillar = true;
			pillar.userData.mapGenerated = true;
			this.scene.add(pillar);

			if (height > 4) {
				this.addColliderBox(
					new THREE.Vector3(px, height / 2, pz),
					radius * 2,
					height,
					radius * 2,
					false,
				);
			}
		}
	}

	_addIceCracks(cx, cz) {
		const crackMat = this.pool.getMatStd(
			0x666666,
			0.5,
			0,
			true,
			false,
			1,
			0,
			0,
		);

		// Cracks as thin flat boxes on lake surface
		for (let i = 0; i < 10; i++) {
			const angle = this._rand() * Math.PI * 2;
			const dist = 5 + this._rand() * 25;
			const cx2 = cx + Math.cos(angle) * dist;
			const cz2 = cz + Math.sin(angle) * dist;
			const length = 2 + this._rand() * 4;
			const width = 0.05 + this._rand() * 0.1;

			const crackGeo = this.pool.getGeoPlane(length, width);
			const crack = new THREE.Mesh(crackGeo, crackMat);
			crack.rotation.x = -Math.PI / 2;
			crack.position.set(cx2, 0.03, cz2);
			crack.rotation.y = this._rand() * Math.PI;
			crack.userData.mapGenerated = true;
			this.scene.add(crack);
		}
	}

	_addIceCampfire(cx, cz) {
		const campfire = new THREE.Group();
		const stoneMat = this.pool.getMatStd(
			0x616161,
			0.9,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const fireMat = this.pool.getMatStd(
			0xff6600,
			0.9,
			0,
			true,
			true,
			0.8,
			0xff4400,
			8.0,
		);

		// Stone ring
		for (let i = 0; i < 8; i++) {
			const angle = (i / 8) * Math.PI * 2;
			const stoneGeo = this.pool.getGeoDodecahedron(0.3);
			const stone = new THREE.Mesh(stoneGeo, stoneMat);
			stone.position.set(Math.cos(angle) * 0.8, 0.2, Math.sin(angle) * 0.8);
			stone.rotation.set(this._rand(), this._rand(), this._rand());
			stone.userData.mapGenerated = true;
			campfire.add(stone);
		}

		// Fire glow
		const fireGeo = this.pool.getGeoSphere(0.4);
		const fire = new THREE.Mesh(fireGeo, fireMat);
		fire.position.set(0, 0.6, 0);
		fire.userData.isCampfire = true;
		campfire.add(fire);

		// Ice blocks around (snow shelter base)
		const iceBlockMat = this.pool.getMatStd(
			0xccddff,
			0.4,
			0,
			true,
			true,
			0.6,
			0,
			0,
		);
		for (let i = 0; i < 6; i++) {
			const angle = (i / 6) * Math.PI * 2;
			const blockGeo = this.pool.getGeoBox(1.5, 0.8, 0.5);
			const block = new THREE.Mesh(blockGeo, iceBlockMat);
			block.position.set(Math.cos(angle) * 2, 0.4, Math.sin(angle) * 2);
			block.rotation.y = angle;
			block.userData.mapGenerated = true;
			campfire.add(block);
		}

		campfire.position.set(cx, 0, cz);
		campfire.userData.mapGenerated = true;
		this.scene.add(campfire);
		this.addColliderBox(new THREE.Vector3(cx, 0.4, cz), 3.5, 0.8, 3.5, false);
	}

	_addSnowmen(startX, startZ, size) {
		const snowMat = this.pool.getMatStd(0xffffff, 0.9, 0, true, false, 1, 0, 0);
		const coalMat = this.pool.getMatStd(
			0x222222,
			0.8,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		const carrotMat = this.pool.getMatStd(
			0xff6600,
			0.7,
			0,
			false,
			false,
			1,
			0,
			0,
		);

		for (let i = 0; i < 5; i++) {
			const snowman = new THREE.Group();
			const sx = startX + 20 + this._rand() * (size - 40);
			const sz = startZ + 20 + this._rand() * (size - 40);

			// Body (3 spheres)
			const bodyGeo = this.pool.getGeoSphere(1.2);
			const body = new THREE.Mesh(bodyGeo, snowMat);
			body.position.y = 1.2;
			body.userData.mapGenerated = true;
			snowman.add(body);

			const midGeo = this.pool.getGeoSphere(0.9);
			const mid = new THREE.Mesh(midGeo, snowMat);
			mid.position.y = 2.7;
			mid.userData.mapGenerated = true;
			snowman.add(mid);

			const headGeo = this.pool.getGeoSphere(0.6);
			const head = new THREE.Mesh(headGeo, snowMat);
			head.position.y = 3.8;
			head.userData.mapGenerated = true;
			snowman.add(head);

			// Eyes (coal)
			for (const side of [-0.2, 0.2]) {
				const eyeGeo = this.pool.getGeoSphere(0.08);
				const eye = new THREE.Mesh(eyeGeo, coalMat);
				eye.position.set(side, 3.9, 0.5);
				eye.userData.mapGenerated = true;
				snowman.add(eye);
			}

			// Carrot nose
			const noseGeo = this.pool.getGeoCone(0.08, 0.3);
			const nose = new THREE.Mesh(noseGeo, carrotMat);
			nose.position.set(0, 3.8, 0.6);
			nose.rotation.x = Math.PI / 2;
			nose.userData.mapGenerated = true;
			snowman.add(nose);

			// Arms (sticks)
			const armMat = this.pool.getMatStd(
				0x5d4037,
				0.9,
				0,
				false,
				false,
				1,
				0,
				0,
			);
			for (const side of [-1, 1]) {
				const armGeo = this.pool.getGeoCylinder(0.05, 0.05, 1.2);
				const arm = new THREE.Mesh(armGeo, armMat);
				arm.position.set(side * 1.1, 2.7, 0);
				arm.rotation.z = (side * Math.PI) / 4;
				arm.userData.mapGenerated = true;
				snowman.add(arm);
			}

			snowman.position.set(sx, 0, sz);
			snowman.userData.isSnowman = true;
			snowman.userData.mapGenerated = true;
			this.scene.add(snowman);
		}
	}

	_addSleighs(startX, startZ, size) {
		const woodMat = this.pool.getMatStd(
			0x6d4c41,
			0.8,
			0,
			true,
			false,
			1,
			0,
			0,
			false,
		);
		const metalMat = this.pool.getMatStd(
			0x757575,
			0.6,
			0.5,
			true,
			false,
			1,
			0,
			0,
		);

		for (let i = 0; i < 3; i++) {
			const sleigh = new THREE.Group();
			const sx = startX + 30 + this._rand() * (size - 60);
			const sz = startZ + 30 + this._rand() * (size - 60);

			// Body
			const bodyGeo = this.pool.getGeoBox(1.5, 0.8, 2.5);
			const body = new THREE.Mesh(bodyGeo, woodMat);
			body.position.y = 0.8;
			body.userData.mapGenerated = true;
			sleigh.add(body);

			// Seat
			const seatGeo = this.pool.getGeoBox(1.2, 0.2, 1.5);
			const seat = new THREE.Mesh(seatGeo, woodMat);
			seat.position.set(0, 1.2, -0.2);
			seat.userData.mapGenerated = true;
			sleigh.add(seat);

			// Runners (metal)
			for (const side of [-0.8, 0.8]) {
				const runnerGeo = this.pool.getGeoBox(0.1, 0.1, 3);
				const runner = new THREE.Mesh(runnerGeo, metalMat);
				runner.position.set(side, 0.1, 0);
				runner.userData.mapGenerated = true;
				sleigh.add(runner);
			}

			// Decorative front curve
			const frontGeo = this.pool.getGeoCylinder(0.1, 0.1, 1.5);
			const front = new THREE.Mesh(frontGeo, metalMat);
			front.position.set(0, 0.5, 1.5);
			front.rotation.x = Math.PI / 2;
			front.userData.mapGenerated = true;
			sleigh.add(front);

			sleigh.position.set(sx, 0, sz);
			sleigh.rotation.y = this._rand() * Math.PI;
			sleigh.userData.isSleigh = true;
			sleigh.userData.mapGenerated = true;
			this.scene.add(sleigh);
			this.addColliderBox(
				new THREE.Vector3(sx, 0.75, sz),
				2.2,
				1.5,
				3.5,
				false,
			);
		}
	}

	_addSnowShelters(startX, startZ, size) {
		const snowMat = this.pool.getMatStd(0xf0f0f0, 0.9, 0, true, false, 1, 0, 0);
		const canvasMat = this.pool.getMatStd(
			0x8d6e63,
			0.95,
			0,
			true,
			false,
			1,
			0,
			0,
		);

		for (let i = 0; i < 4; i++) {
			const shelter = new THREE.Group();
			const sx = startX + 20 + this._rand() * (size - 40);
			const sz = startZ + 20 + this._rand() * (size - 40);

			// Snow block walls (3 sides)
			for (let w = 0; w < 3; w++) {
				const wallGeo = this.pool.getGeoBox(3, 1.5, 0.5);
				const wall = new THREE.Mesh(wallGeo, snowMat);
				if (w < 2) {
					wall.position.set((w - 1) * 3, 0.75, -1);
				} else {
					wall.position.set(0, 0.75, 0);
				}
				wall.userData.mapGenerated = true;
				shelter.add(wall);
			}

			// Canvas roof (angled)
			const roofGeo = this.pool.getGeoBox(3.5, 0.15, 3.5);
			const roof = new THREE.Mesh(roofGeo, canvasMat);
			roof.position.set(0, 1.6, 0);
			roof.rotation.z = Math.PI / 8;
			roof.userData.mapGenerated = true;
			shelter.add(roof);

			shelter.position.set(sx, 0, sz);
			shelter.userData.isSnowShelter = true;
			shelter.userData.mapGenerated = true;
			this.scene.add(shelter);
			this.addColliderBox(
				new THREE.Vector3(sx - 3, 0.75, sz - 1),
				3,
				1.5,
				0.5,
				false,
			);
			this.addColliderBox(
				new THREE.Vector3(sx, 0.75, sz - 1),
				3,
				1.5,
				0.5,
				false,
			);
			this.addColliderBox(new THREE.Vector3(sx, 0.75, sz), 3, 1.5, 0.5, false);
			this._registerChestSpot(sx, sz + 0.5, "ice");
		}
	}

	_addSnowBarrack(x, z) {
		const group = new THREE.Group();
		const wallMat = this.pool.getMatStd(
			0xe8f2ff,
			0.82,
			0,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const roofMat = this.pool.getMatStd(
			0x8fb7d7,
			0.65,
			0.05,
			true,
			false,
			1,
			0,
			0,
			false,
		);
		const floorMat = this.pool.getMatStd(
			0xb6cedf,
			0.9,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const w = 14;
		const d = 20;
		const h = 7.5;
		const wt = 0.55;
		const doorW = 3;
		const floor = new THREE.Mesh(this.pool.getGeoBox(w, 0.35, d), floorMat);
		floor.position.y = 0.18;
		floor.userData.mapGenerated = true;
		floor.userData.walkable = true;
		group.add(floor);
		for (const side of [-1, 1]) {
			const wall = new THREE.Mesh(this.pool.getGeoBox(wt, h, d), wallMat);
			wall.position.set((side * w) / 2, h / 2, 0);
			wall.userData.mapGenerated = true;
			group.add(wall);
			this.addColliderBox(
				new THREE.Vector3(x + (side * w) / 2, h / 2, z),
				wt,
				h,
				d,
				false,
			);
		}
		const back = new THREE.Mesh(this.pool.getGeoBox(w, h, wt), wallMat);
		back.position.set(0, h / 2, -d / 2);
		back.userData.mapGenerated = true;
		group.add(back);
		this.addColliderBox(
			new THREE.Vector3(x, h / 2, z - d / 2),
			w,
			h,
			wt,
			false,
		);
		const frontW = (w - doorW) / 2;
		const doorMat = this.pool.getMatStd(
			0x4e342e,
			0.9,
			0,
			false,
			false,
			1,
			0,
			0,
			false,
		);
		for (const side of [-1, 1]) {
			const front = new THREE.Mesh(this.pool.getGeoBox(frontW, h, wt), wallMat);
			front.position.set((side * (doorW + frontW)) / 2, h / 2, d / 2);
			front.userData.mapGenerated = true;
			group.add(front);
			this.addColliderBox(
				new THREE.Vector3(x + (side * (doorW + frontW)) / 2, h / 2, z + d / 2),
				frontW,
				h,
				wt,
				false,
			);
		}
		const doorH = 2.8;
		const doorGeo = this.pool.getGeoBox(doorW, doorH, 0.1);
		const door = new THREE.Mesh(doorGeo, doorMat);
		door.position.set(0, doorH / 2, d / 2 + 0.05);
		door.userData.mapGenerated = true;
		group.add(door);
		const upperY = h * 0.54;
		const upperSlabW = (w - 4) / 2;
		for (const side of [-1, 1]) {
			const slab = new THREE.Mesh(
				this.pool.getGeoBox(upperSlabW, 0.3, d - 1.2),
				floorMat,
			);
			slab.position.set(side * (2 + upperSlabW / 2), upperY, 0);
			slab.userData.mapGenerated = true;
			slab.userData.walkable = true;
			group.add(slab);
			this.addColliderBox(
				new THREE.Vector3(x + slab.position.x, upperY, z),
				upperSlabW,
				0.3,
				d - 1.2,
				false,
			);
		}
		const roofGeo = this.pool.getGeoBox(w * 0.58, 0.55, d + 1.5);
		for (const side of [-1, 1]) {
			const roof = new THREE.Mesh(roofGeo, roofMat);
			roof.position.set(side * w * 0.22, h + 1.7, 0);
			roof.rotation.z = side * -0.48;
			roof.userData.mapGenerated = true;
			group.add(roof);
		}
		group.position.set(x, 0, z);
		group.userData.mapGenerated = true;
		this.scene.add(group);
		this.addColliderBox(new THREE.Vector3(x, 0.18, z), w, 0.35, d, false);
		this._buildings.push({ x, z, w, d, template: { type: "snow_barrack" } });
		for (const ox of [-5, 0, 5]) {
			this._registerChestSpot(x + ox, z - 8, "ice");
			this._registerChestSpot(x + ox, z + 2, "ice");
		}
	}

	_addWindTurbine(x, z) {
		const group = new THREE.Group();

		// Мачта
		const towerGeo = this.pool.getGeoCylinder(0.2, 0.4, 15);
		const towerMat = this.pool.getMatStd(
			0xcccccc,
			0.6,
			0.5,
			true,
			false,
			1,
			0,
			0,
		);
		const tower = new THREE.Mesh(towerGeo, towerMat);
		tower.userData.mapGenerated = true;
		tower.position.y = 7.5;
		group.add(tower);

		// Носовой обтекатель
		const hubGeo = this.pool.getGeoSphere(0.5);
		const hub = new THREE.Mesh(hubGeo, towerMat);
		hub.userData.mapGenerated = true;
		hub.position.y = 15;
		group.add(hub);

		// Лопасти
		const bladeMat = this.pool.getMatStd(
			0xffffff,
			0.4,
			0,
			true,
			false,
			1,
			0,
			0,
		);

		for (let i = 0; i < 3; i++) {
			const angle = (i / 3) * Math.PI * 2;
			const bladeGeo = this.pool.getGeoBox(0.3, 5, 0.1);
			const blade = new THREE.Mesh(bladeGeo, bladeMat);
			blade.position.set(Math.cos(angle) * 2.5, 15 + Math.sin(angle) * 2.5, 0);
			blade.rotation.z = angle;
			blade.userData.isBlade = true;
			blade.userData.mapGenerated = true;
			group.add(blade);
		}

		group.position.set(x, 0, z);
		group.userData.isWindTurbine = true;
		group.userData.mapGenerated = true;
		this.scene.add(group);
		this.addColliderBox(new THREE.Vector3(x, 7.5, z), 1.5, 15, 1.5, false);
	}

	updateWindTurbines(delta) {
		const turbines = this._cachedTurbines;
		if (!turbines?.length) return;
		const px = this._lastPlayerPos?.x,
			pz = this._lastPlayerPos?.z;
		const cullDistSq = px ? 10000 : Infinity;
		for (const turbine of turbines) {
			if (px) {
				const dx = turbine.position.x - px,
					dz = turbine.position.z - pz;
				if (dx * dx + dz * dz > cullDistSq) continue;
			}
			for (const child of turbine.children) {
				if (child.userData?.isBlade) child.rotation.z += delta * 3;
			}
		}
	}

	_addIcePOI(startX, startZ, size) {
		const q = size / 4;
		const poiPositions = [
			{ x: startX + q, z: startZ + q, type: "weapon" },
			{ x: startX + q * 3, z: startZ + q * 1.4, type: "medkit" },
			{ x: startX + q * 1.4, z: startZ + q * 3, type: "ammo" },
			{ x: startX + q * 3, z: startZ + q * 3, type: "weapon" },
			{ x: startX + q * 0.8, z: startZ + q * 2.6, type: "medkit" },
			{ x: startX + q * 2.6, z: startZ + q * 0.8, type: "ammo" },
			{ x: startX + q * 2.1, z: startZ + q * 1.2, type: "weapon" },
			{ x: startX + q * 1.2, z: startZ + q * 2.1, type: "medkit" },
		];

		for (const poi of poiPositions) {
			if (poi.type === "weapon") {
				this._addWeaponDrop(poi.x, poi.z);
			} else if (poi.type === "medkit") {
				this._addMedkitDrop(poi.x, poi.z);
			} else {
				this._addAmmoDrop(poi.x, poi.z);
			}
		}
	}

	_addSnowParticles() {
		const snowCount = 320;
		const snowMin = 82;
		const snowRange = HALF - snowMin - 8;
		const positions = new Float32Array(snowCount * 3);
		const snowMat = new THREE.PointsMaterial({
			color: 0xffffff,
			size: 0.3,
			transparent: true,
			opacity: 0.8,
			sizeAttenuation: true,
		});

		for (let i = 0; i < snowCount; i++) {
			const x = snowMin + Math.random() * snowRange;
			const y = 5 + Math.random() * 20;
			const z = snowMin + Math.random() * snowRange;
			positions[i * 3] = x;
			positions[i * 3 + 1] = y;
			positions[i * 3 + 2] = z;
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		const snowParticles = new THREE.Points(geo, snowMat);
		snowParticles.userData.isSnowParticles = true;
		snowParticles.userData.mapGenerated = true;
		snowParticles.userData.snowMin = snowMin;
		snowParticles.userData.snowRange = snowRange;
		this.scene.add(snowParticles);
	}

	updateSnowParticles(delta) {
		const particles = this._cachedSnow;
		if (!particles) return;
		const px = this._lastPlayerPos?.x,
			pz = this._lastPlayerPos?.z;
		const insideIce =
			Number.isFinite(px) && Number.isFinite(pz) && px > 64 && pz > 64;
		particles.visible = insideIce;
		if (!insideIce) return;
		const snowMin = particles.userData.snowMin ?? 82;
		const snowRange = particles.userData.snowRange ?? HALF - snowMin - 8;
		const pos = particles.geometry.attributes.position;
		const t = performance.now() * 0.001;
		for (let i = 0; i < pos.count; i++) {
			let y = pos.getY(i) - delta * 2;
			if (y < 0) {
				y = 20 + Math.random() * 10;
				pos.setX(i, snowMin + Math.random() * snowRange);
				pos.setZ(i, snowMin + Math.random() * snowRange);
			}
			pos.setY(i, y);
			pos.setX(i, pos.getX(i) + Math.sin(t + i) * delta * 0.5);
		}
		pos.needsUpdate = true;
	}

	_addIceToCenterPath(cx, cz) {
		const pathMat = this.pool.getMatStd(0xeef4ff, 0.8, 0, true, false, 1, 0, 0);

		const startX2 = cx;
		const startZ2 = cz;
		const endX = 0;
		const endZ = 0;

		let px = startX2;
		let pz = startZ2;
		for (let i = 0; i < 10; i++) {
			const t = i / 19;
			const segGeo = this.pool.getGeoBox(3, 0.05, 4);
			const seg = new THREE.Mesh(segGeo, pathMat);
			seg.position.set(px + (endX - px) * t, 0.03, pz + (endZ - pz) * t);
			seg.userData.mapGenerated = true;
			seg.userData.walkable = true;
			this.scene.add(seg);
			this.addColliderBox(
				new THREE.Vector3(seg.position.x, 0.03, seg.position.z),
				3,
				0.05,
				4,
				false,
			);
			px += (endX - px) * 0.12 + (this._rand() - 0.5) * 2;
			pz += (endZ - pz) * 0.12 + (this._rand() - 0.5) * 2;
		}
	}

	_addDetailedIgloo(x, z) {
		const igloo = new THREE.Group();
		const iglooMat = this.pool.getMatStd(
			COLORS.iceIgloo,
			0.6,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const snowMat = this.pool.getMatStd(0xffffff, 0.8, 0, true, false, 1, 0, 0);

		// Dome with snow cap
		const domeGeo = this.pool.getGeoSphere(10);
		const dome = new THREE.Mesh(domeGeo, iglooMat);
		dome.position.y = 0;
		dome.userData.mapGenerated = true;
		igloo.add(dome);

		// Snow cap on top
		const capGeo = this.pool.getGeoSphere(9.5);
		const cap = new THREE.Mesh(capGeo, snowMat);
		cap.position.y = 0.8;
		cap.userData.mapGenerated = true;
		igloo.add(cap);

		// Interior floor
		const intFloorGeo = this.pool.getGeoDodecahedron(9);
		const intFloorMat = this.pool.getMatStd(
			0xe0e0e0,
			0.7,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		const intFloor = new THREE.Mesh(intFloorGeo, intFloorMat);
		intFloor.rotation.x = -Math.PI / 2;
		intFloor.position.y = 0.2;
		intFloor.userData.mapGenerated = true;
		intFloor.userData.walkable = true;
		igloo.add(intFloor);

		// Entrance tunnel
		const tunnelGeo = this.pool.getGeoCylinder(2.5, 2.5, 6);
		const tunnel = new THREE.Mesh(tunnelGeo, iglooMat);
		tunnel.rotation.z = Math.PI / 2;
		tunnel.position.set(8.5, 1.5, 0);
		tunnel.userData.mapGenerated = true;
		igloo.add(tunnel);

		// Interior torch (warm glow inside)
		const torchMat = this.pool.getMatStd(
			0x5d4037,
			0.8,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const fireMat = this.pool.getMatStd(
			0xff6600,
			0.9,
			0,
			true,
			true,
			0.9,
			0xff4400,
			10.0,
		);
		const torch = new THREE.Group();
		const stickGeo = this.pool.getGeoCylinder(0.08, 0.1, 0.8);
		const stick = new THREE.Mesh(stickGeo, torchMat);
		stick.rotation.x = Math.PI / 6;
		stick.position.set(-5, 5, 3);
		stick.userData.mapGenerated = true;
		torch.add(stick);
		const flameGeo = this.pool.getGeoSphere(0.2);
		const flame = new THREE.Mesh(flameGeo, fireMat);
		flame.position.set(-5, 5.5, 3);
		flame.userData.isTorch = true;
		flame.userData.blinkRate = 2.5;
		torch.add(flame);
		torch.userData.mapGenerated = true;
		igloo.add(torch);

		// Interior bench (log bench)
		const benchMat = this.pool.getMatStd(
			0x6d4c41,
			0.9,
			0,
			true,
			false,
			1,
			0,
			0,
		);
		const benchGeo = this.pool.getGeoBox(3, 0.4, 0.8);
		const bench = new THREE.Mesh(benchGeo, benchMat);
		bench.position.set(-3, 0.5, -3);
		bench.userData.mapGenerated = true;
		igloo.add(bench);

		// Chest inside
		const chestMat = this.pool.getMatStd(
			0x8b4513,
			0.7,
			0,
			true,
			false,
			1,
			0xffaa00,
			2.0,
		);
		const chestGeo = this.pool.getGeoBox(1.2, 0.9, 0.9);
		const chest = new THREE.Mesh(chestGeo, chestMat);
		chest.position.set(5, 0.45, -3);
		chest.userData.isTowerChest = true;
		chest.userData.mapGenerated = true;
		igloo.add(chest);

		igloo.position.set(x, 0, z);
		igloo.userData.mapGenerated = true;
		this.scene.add(igloo);

		this.addColliderBox(new THREE.Vector3(x, 5, z), 20, 10, 20, false);
	}

	_addIceCrystal(x, z) {
		// Large ice crystal — bigger
		const height = 8 + this._rand() * 10;
		const radius = 2 + this._rand() * 2;
		const sides = 6 + Math.floor(this._rand() * 3);

		const geo = this.pool.getGeoCone(radius, height);
		const mat = this.pool.getMatStd(
			COLORS.iceCrystal + Math.floor(this._rand() * 0x20 - 0x10),
			0.55,
			0.08,
			true,
			false,
			1,
			0,
			0,
		);

		const crystal = new THREE.Mesh(geo, mat);
		crystal.position.set(x, height / 2, z);
		crystal.rotation.y = this._rand() * Math.PI;
		crystal.rotation.z = (this._rand() - 0.5) * 0.2;
		crystal.userData.mapGenerated = true;
		this.scene.add(crystal);

		if (height > 2) {
			this.addColliderBox(
				new THREE.Vector3(x, height * 0.3, z),
				radius * 1.4,
				height * 0.5,
				radius * 1.4,
				false,
			);
		}
	}

	_addSnowTree(x, z) {
		if (Math.sqrt(x * x + z * z) < 75) return;
		// Large snow tree — bigger
		const trunkH = 11 + this._rand() * 6;
		const trunkR = 0.5 + this._rand() * 0.3;

		// Trunk
		const trunkGeo = this.pool.getGeoCylinder(trunkR * 0.5, trunkR, trunkH);
		const trunkMat = this.pool.getMatStd(
			COLORS.forestTrunk,
			0.8,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		const trunk = new THREE.Mesh(trunkGeo, trunkMat);
		trunk.position.set(x, trunkH / 2, z);
		trunk.userData.mapGenerated = true;
		this.scene.add(trunk);
		this.addColliderBox(
			new THREE.Vector3(x, trunkH / 2, z),
			trunkR * 2,
			trunkH,
			trunkR * 2,
			false,
		);

		// Snow layers
		const snowMat = this.pool.getMatStd(0xffffff, 0.7, 0, true, false, 1, 0, 0);

		for (let l = 0; l < 5; l++) {
			const layerR = (4.8 - l * 0.75) * (0.9 + this._rand() * 0.2);
			const layerGeo = this.pool.getGeoCone(layerR, 4.5);
			const snowLayer = new THREE.Mesh(layerGeo, snowMat);
			snowLayer.position.set(x, trunkH - 3 + l * 2.7, z);
			snowLayer.userData.mapGenerated = true;
			this.scene.add(snowLayer);
		}
	}

	_addRadioTower(x, z) {
		// Large radio tower — bigger
		const tower = new THREE.Group();
		const poleMat = this.pool.getMatStd(
			COLORS.iceTower,
			0.6,
			0,
			false,
			false,
			1,
			0,
			0,
		);

		// Main pole
		const poleGeo = this.pool.getGeoCylinder(0.8, 1.2, 40);
		const pole = new THREE.Mesh(poleGeo, poleMat);
		pole.position.y = 20;
		pole.userData.mapGenerated = true;
		tower.add(pole);

		// Cross braces
		for (let br = 10; br < 40; br += 8) {
			const braceGeo = this.pool.getGeoBox(8, 0.3, 8);
			const brace = new THREE.Mesh(braceGeo, poleMat);
			brace.position.y = br;
			brace.userData.mapGenerated = true;
			tower.add(brace);
		}

		// Dish antenna
		const dishGeo = this.pool.getGeoCone(5, 7);
		const dishMat = this.pool.getMatStd(
			0x6b7280,
			0.3,
			0.6,
			false,
			false,
			1,
			0,
			0,
		);
		const dish = new THREE.Mesh(dishGeo, dishMat);
		dish.position.set(0, 42, -1.5);
		dish.rotation.x = Math.PI / 6;
		dish.userData.mapGenerated = true;
		tower.add(dish);

		tower.position.set(x, 0, z);
		tower.userData.mapGenerated = true;
		this.scene.add(tower);

		this.addColliderBox(new THREE.Vector3(x, 20, z), 3, 40, 3, false);
	}

	// =========================================================================
	// COVER OBJECTS — Biome-specific placement
	// =========================================================================
	_placeBiomeDecor() {
		for (const [x, z] of [
			[-116, -42],
			[-98, -110],
			[-50, -98],
			[-112, -78],
			[-42, -48],
		])
			this._addFallenLog(x, z);
		for (const [x, z] of [
			[-112, 48],
			[-92, 108],
			[-42, 48],
			[-40, 110],
		])
			this._addGuardPost(x, z);
		for (const [x, z] of [
			[44, 46],
			[72, 40],
			[104, 50],
			[46, 100],
			[100, 98],
			[76, 110],
		])
			this._addIceChunk(x, z);
		for (const [x, z] of [
			[-112, -50],
			[-86, -96],
			[-50, -112],
			[-42, -66],
		]) {
			this._addBarrel(x, z);
			this._registerChestSpot(x + 2.4, z - 1.8, "forest");
		}
		for (const [x, z] of [
			[-106, 62],
			[-82, 102],
			[-48, 76],
			[-40, 114],
		]) {
			this._addMilitaryCrate(x, z);
			this._registerChestSpot(x + 1.8, z + 1.5, "military");
		}
		for (const [x, z] of [
			[50, 56],
			[90, 48],
			[112, 80],
			[60, 110],
		]) {
			this._addIceChunk(x, z);
			this._registerChestSpot(x - 2.2, z + 1.6, "ice");
		}
		this._addBiomeSurvivalFeatures();
	}

	_addBiomeSurvivalFeatures() {
		const definitions = [
			["snare", -1, -1],
			["spikes", 1, -1],
			["mine", -1, 1],
			["ice", 1, 1],
		];
		const blocked = (x, z) =>
			this.colliders.some(
				(collider) =>
					collider.enabled !== false &&
					!collider.walkable &&
					x >= collider.min.x - 2.2 &&
					x <= collider.max.x + 2.2 &&
					z >= collider.min.z - 2.2 &&
					z <= collider.max.z + 2.2,
			);
		for (const [type, sx, sz] of definitions) {
			let placed = 0;
			const targetCount = type === "mine" ? 24 : 18;
			for (let attempt = 0; attempt < 800 && placed < targetCount; attempt++) {
				const x = sx * (38 + Math.random() * (HALF - 44));
				const z = sz * (38 + Math.random() * (HALF - 44));
				if (Math.hypot(x, z) < 84 || blocked(x, z)) continue;
				if (
					this._traps.some(
						(trap) => Math.hypot(x - trap.position.x, z - trap.position.z) < 7,
					)
				)
					continue;
				this._addSurvivalTrap(type, x, z);
				placed++;
			}
		}
		this._addThemeArch(
			56,
			-48,
			Math.PI / 2,
			this.pool.getMatStd(0x5f6368, 0.9, 0, true, false, 1, 0, 0),
		);
		this._addThemeArch(
			100,
			-112,
			0,
			this.pool.getMatStd(0x51555a, 0.9, 0, true, false, 1, 0, 0),
		);
		this._addGuardPost(-58, 60);
		this._addGuardPost(-102, 92);
		this._addIceCampfire(66, 92);
		this._addIceCampfire(108, 110);
	}

	_addSurvivalTrap(type, x, z) {
		const group = new THREE.Group();
		let radius = 1.6;
		let slow = 0.5;
		let damage = 8;
		if (type === "snare") {
			const mat = this.pool.getMatStd(
				0x704522,
				0.84,
				0.08,
				true,
				false,
				1,
				0x3a1605,
				0.18,
			);
			const ring = new THREE.Mesh(
				new THREE.TorusGeometry(0.82, 0.075, 6, 16),
				mat,
			);
			ring.rotation.x = Math.PI / 2;
			ring.position.y = 0.055;
			group.add(ring);
			radius = 1.35;
			slow = 0.24;
			damage = 2;
		} else if (type === "spikes") {
			const baseMat = this.pool.getMatStd(
				0x3d342f,
				0.94,
				0,
				true,
				false,
				1,
				0,
				0,
			);
			const spikeMat = this.pool.getMatStd(
				0x777b80,
				0.5,
				0.5,
				true,
				false,
				1,
				0,
				0,
			);
			const base = new THREE.Mesh(this.pool.getGeoBox(2.8, 0.1, 2.8), baseMat);
			base.position.y = -0.03;
			group.add(base);
			for (const [sx, sz] of [
				[-0.9, -0.9],
				[0.9, -0.9],
				[0, 0],
				[-0.9, 0.9],
				[0.9, 0.9],
			]) {
				const spike = new THREE.Mesh(this.pool.getGeoCone(0.14, 0.9), spikeMat);
				spike.position.set(sx * 0.78, 0.38, sz * 0.78);
				group.add(spike);
			}
			radius = 1.8;
			slow = 0.48;
			damage = 18;
		} else if (type === "mine") {
			const bodyMat = this.pool.getMatStd(
				0x263238,
				0.62,
				0.55,
				true,
				false,
				1,
				0,
				0,
			);
			const glowMat = this.pool.getMatStd(
				0xc52020,
				0.3,
				0.2,
				true,
				false,
				1,
				0xff2200,
				2.4,
			);
			const body = new THREE.Mesh(
				this.pool.getGeoCylinder(0.5, 0.62, 0.16),
				bodyMat,
			);
			body.position.y = 0.08;
			group.add(body);
			const light = new THREE.Mesh(this.pool.getGeoSphere(0.12), glowMat);
			light.position.y = 0.18;
			group.add(light);
			radius = 1.2;
			slow = 0.7;
			damage = 30;
		} else {
			const iceMat = this.pool.getMatStd(
				0x73c9e8,
				0.18,
				0.2,
				true,
				true,
				0.78,
				0x16495d,
				0.16,
			);
			const patch = new THREE.Mesh(
				this.pool.getGeoCylinder(1.7, 2.1, 0.05, 9),
				iceMat,
			);
			patch.position.y = 0.035;
			patch.scale.z = 0.72;
			group.add(patch);
			radius = 2.2;
			slow = 0.3;
			damage = 1;
		}
		group.position.set(x, 0.01, z);
		group.userData.mapGenerated = true;
		group.userData.isTrap = true;
		group.userData.trapType = type;
		group.userData.baseY = 0.01;
		group.traverse((child) => {
			if (child.isMesh) child.userData.mapGenerated = true;
		});
		this.scene.add(group);
		const timing =
			type === "snare"
				? [6.2, 3.1]
				: type === "spikes"
					? [4.8, 1.8]
					: type === "mine"
						? [6.8, 2.4]
						: [5.6, 2.8];
		this._traps.push({
			type,
			position: new THREE.Vector3(x, 0.01, z),
			radius,
			slow,
			damage,
			visual: group,
			active: true,
			period: timing[0],
			activeFor: timing[1],
			phase: Math.abs(x * 0.13 + z * 0.19) % timing[0],
		});
	}

	_addThemeArch(x, z, rotation, material) {
		const group = new THREE.Group();
		for (const side of [-1, 1]) {
			const pillar = new THREE.Mesh(this.pool.getGeoBox(2, 7, 2), material);
			pillar.position.set(side * 4, 3.5, 0);
			pillar.userData.mapGenerated = true;
			group.add(pillar);
		}
		const beam = new THREE.Mesh(this.pool.getGeoBox(10, 2, 2), material);
		beam.position.y = 7;
		beam.userData.mapGenerated = true;
		group.add(beam);
		group.position.set(x, 0, z);
		group.rotation.y = rotation;
		group.userData.mapGenerated = true;
		this.scene.add(group);
		const c = Math.abs(Math.cos(rotation));
		const s = Math.abs(Math.sin(rotation));
		for (const side of [-1, 1]) {
			const lx = side * 4;
			this.addColliderBox(
				new THREE.Vector3(x + lx * c, 3.5, z - lx * s),
				2,
				7,
				2,
				false,
			);
		}
	}

	_addGuardPost(x, z) {
		const group = new THREE.Group();
		const postMat = this.pool.getMatStd(
			0x4c553d,
			0.82,
			0.2,
			true,
			false,
			1,
			0,
			0,
		);
		const roofMat = this.pool.getMatStd(
			0x343b34,
			0.72,
			0.35,
			true,
			false,
			1,
			0,
			0,
			false,
		);
		for (const px of [-2.5, 2.5]) {
			for (const pz of [-2.5, 2.5]) {
				const post = new THREE.Mesh(this.pool.getGeoBox(0.7, 6, 0.7), postMat);
				post.position.set(px, 3, pz);
				post.userData.mapGenerated = true;
				group.add(post);
				this.addColliderBox(
					new THREE.Vector3(x + px, 3, z + pz),
					0.7,
					6,
					0.7,
					false,
				);
			}
		}
		const roof = new THREE.Mesh(this.pool.getGeoBox(7, 0.6, 7), roofMat);
		roof.position.y = 6.3;
		roof.userData.mapGenerated = true;
		group.add(roof);
		group.position.set(x, 0, z);
		group.userData.mapGenerated = true;
		this.scene.add(group);
	}

	_placeCoverObjects() {
		// Forest cover: wooden barrels + mushroom clusters (NW quadrant only)
		for (let i = 0; i < 20; i++) {
			const x = -HALF + 15 + this._rand() * (HALF - 40);
			const z = -HALF + 15 + this._rand() * (HALF - 40);
			if (x > -5 || z > -5 || Math.sqrt(x * x + z * z) < 84) continue;
			this._addBarrel(x, z);
		}
		// Military cover: ammo crates + sandbag stacks (SW quadrant only)
		for (let i = 0; i < 8; i++) {
			const x = -HALF + 15 + this._rand() * (HALF - 40);
			const z = 5 + this._rand() * (HALF - 25);
			if (x > -5 || z < 5 || Math.sqrt(x * x + z * z) < 84) continue;
			this._addMilitaryCrate(x, z);
		}
		for (let i = 0; i < 6; i++) {
			const x = -HALF + 15 + this._rand() * (HALF - 40);
			const z = 5 + this._rand() * (HALF - 25);
			if (x > -5 || z < 5 || Math.sqrt(x * x + z * z) < 84) continue;
			this._addSandbagBarrier(x, z);
		}

		// Ice cover: large opaque boulders (SE quadrant only)
		for (let i = 0; i < 8; i++) {
			const x = 5 + this._rand() * (HALF - 25);
			const z = 5 + this._rand() * (HALF - 25);
			if (x < 5 || z < 5 || Math.sqrt(x * x + z * z) < 84) continue;
			this._addIceChunk(x, z);
		}
	}

	// =========================================================================
	// PERIMETER WALLS — Glass blue border walls like in reference image
	// =========================================================================
	_generatePerimeterWalls() {
		const wallH = 30;
		const wallT = 1.5;
		const half = this.halfSize;
		const wallMat = this.pool.getMatStd(
			0x62584c,
			0.94,
			0.02,
			true,
			false,
			1,
			0,
			0,
			true,
		);
		const patternMat = this.pool.getMatStd(
			0x8f3f2e,
			0.72,
			0.04,
			true,
			false,
			1,
			0x4b1008,
			0.45,
			true,
		);
		const walls = [
			{
				x: 0,
				y: wallH / 2,
				z: -half,
				w: half * 2 + wallT * 2,
				h: wallH,
				d: wallT,
				horizontal: true,
				face: 1,
			},
			{
				x: 0,
				y: wallH / 2,
				z: half,
				w: half * 2 + wallT * 2,
				h: wallH,
				d: wallT,
				horizontal: true,
				face: -1,
			},
			{
				x: -half,
				y: wallH / 2,
				z: 0,
				w: wallT,
				h: wallH,
				d: half * 2,
				horizontal: false,
				face: 1,
			},
			{
				x: half,
				y: wallH / 2,
				z: 0,
				w: wallT,
				h: wallH,
				d: half * 2,
				horizontal: false,
				face: -1,
			},
		];
		for (const w of walls) {
			const mesh = new THREE.Mesh(this.pool.getGeoBox(w.w, w.h, w.d), wallMat);
			mesh.position.set(w.x, w.y, w.z);
			mesh.userData.mapGenerated = true;
			mesh.userData.gameplayBoundary = true;
			mesh.frustumCulled = false;
			this.scene.add(mesh);
			const collider = this.addColliderBox(
				new THREE.Vector3(w.x, w.y, w.z),
				w.w,
				w.h,
				w.d,
				false,
			);
			collider.gameplayBoundary = true;
			const positions = [];
			for (let offset = -half + 7; offset <= half - 7; offset += 12) {
				positions.push({ offset, y: 8 });
				if ((Math.round((offset + half) / 12) & 1) === 0)
					positions.push({ offset, y: 20 });
			}
			const patternGeo = w.horizontal
				? this.pool.getGeoBox(4.2, 4.2, 0.08)
				: this.pool.getGeoBox(0.08, 4.2, 4.2);
			const patterns = new THREE.InstancedMesh(
				patternGeo,
				patternMat,
				positions.length,
			);
			const matrix = new THREE.Matrix4();
			const rotation = new THREE.Quaternion();
			const scale = new THREE.Vector3(1, 1, 1);
			rotation.setFromAxisAngle(
				w.horizontal ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0),
				Math.PI / 4,
			);
			positions.forEach((entry, index) => {
				const position = w.horizontal
					? new THREE.Vector3(
							entry.offset,
							entry.y,
							w.z + w.face * (wallT * 0.5 + 0.05),
						)
					: new THREE.Vector3(
							w.x + w.face * (wallT * 0.5 + 0.05),
							entry.y,
							entry.offset,
						);
				matrix.compose(position, rotation, scale);
				patterns.setMatrixAt(index, matrix);
			});
			patterns.instanceMatrix.needsUpdate = true;
			patterns.userData.mapGenerated = true;
			patterns.userData.gameplayBoundary = true;
			patterns.frustumCulled = false;
			this.scene.add(patterns);
		}
	}

	_addIceChunk(x, z) {
		const size = 3.2 + this._rand() * 3.4;
		const height = size * (0.72 + this._rand() * 0.45);
		const geo = this.pool.getGeoDodecahedron(1);
		const mat = this.pool.getMatStd(0x9bc9df, 0.62, 0.08, true, false, 1, 0, 0);
		const chunk = new THREE.Mesh(geo, mat);
		chunk.position.set(x, height * 0.48, z);
		chunk.scale.set(size, height, size * (0.82 + this._rand() * 0.32));
		chunk.rotation.set(
			(this._rand() - 0.5) * 0.16,
			this._rand() * Math.PI,
			(this._rand() - 0.5) * 0.16,
		);
		chunk.userData.mapGenerated = true;
		chunk.userData.isCover = true;
		this.scene.add(chunk);
		this.addColliderBox(
			new THREE.Vector3(x, height * 0.48, z),
			size * 1.55,
			height * 0.92,
			size * 1.55,
			false,
		);
	}

	_addBarrel(x, z) {
		// Massive barrel — grand scale
		const geo = this.pool.getGeoCylinder(1.2, 1.2, 2.5);
		const mat = this.pool.getMatStd(0x5d4037, 0.8, 0, false, false, 1, 0, 0);
		const barrel = new THREE.Mesh(geo, mat);
		barrel.position.set(x, 1.25, z);
		barrel.userData.mapGenerated = true;
		barrel.userData.physicsType = "STATIC";
		this.scene.add(barrel);
		this.addColliderBox(new THREE.Vector3(x, 1.25, z), 2.5, 2.5, 2.5, false);
	}

	_addCrate(x, z) {
		// Grand crate — massive scale
		const size = 2 + this._rand() * 1.5;
		const geo = this.pool.getGeoBox(size, size, size);
		const mat = this.pool.getMatStd(0xa1887f, 0.8, 0, true, false, 1, 0, 0);
		const crate = new THREE.Mesh(geo, mat);
		crate.position.set(x, size / 2, z);
		crate.rotation.y = this._rand() * Math.PI;
		crate.userData.mapGenerated = true;
		crate.userData.physicsType = "STATIC";
		this.scene.add(crate);
		this.addColliderBox(
			new THREE.Vector3(x, size / 2, z),
			size,
			size,
			size,
			false,
		);
	}

	_addMushroomCluster(x, z) {
		const cluster = new THREE.Group();
		const stemMat = this.pool.getMatStd(
			0xfff9c4,
			0.8,
			0,
			false,
			false,
			1,
			0,
			0,
		);
		const capMat = this.pool.getMatStd(
			COLORS.forestMushroom,
			0.6,
			0,
			true,
			false,
			1,
			0,
			0,
		);

		const count = 3 + Math.floor(this._rand() * 4);
		for (let i = 0; i < count; i++) {
			const angle = (i / count) * Math.PI * 2;
			const r = 0.3 + this._rand() * 0.5;
			const mx = Math.cos(angle) * r;
			const mz = Math.sin(angle) * r;
			const stemH = 0.3 + this._rand() * 0.4;

			const stemGeo = this.pool.getGeoCylinder(0.08, 0.1, stemH);
			const stem = new THREE.Mesh(stemGeo, stemMat);
			stem.position.set(mx, stemH / 2, mz);
			stem.userData.mapGenerated = true;
			cluster.add(stem);

			const capGeo = this.pool.getGeoSphere(0.25 + this._rand() * 0.15, 6, 6);
			capGeo.scale(1, 0.6, 1);
			const cap = new THREE.Mesh(capGeo, capMat);
			cap.position.set(mx, stemH + 0.15, mz);
			cap.userData.mapGenerated = true;
			cluster.add(cap);

			// White spots on cap
			for (let s = 0; s < 3; s++) {
				const spotGeo = this.pool.getGeoSphere(0.05);
				const spotMat = this.pool.getMatStd(
					COLORS.forestMushroomSpot,
					0.7,
					0,
					false,
					false,
					1,
					0,
					0,
				);
				const spot = new THREE.Mesh(spotGeo, spotMat);
				spot.position.set(
					mx + (this._rand() - 0.5) * 0.3,
					stemH + 0.25,
					mz + (this._rand() - 0.5) * 0.3,
				);
				spot.userData.mapGenerated = true;
				cluster.add(spot);
			}
		}

		cluster.position.set(x, 0, z);
		cluster.userData.mapGenerated = true;
		this.scene.add(cluster);
	}

	// =========================================================================
	// SPAWN PADS — Filter out pads inside buildings/walls (protect cornucopia center)
	// =========================================================================
	_buildSpawnPads() {
		const valid = [];
		const seen = new Set();
		console.log(
			`[MapGenerator] Before filter: ${this.spawnPads.length} pads, first: (${this.spawnPads[0]?.x.toFixed(1)}, ${this.spawnPads[0]?.z.toFixed(1)})`,
		);
		for (const pad of this.spawnPads) {
			const key = `${pad.x.toFixed(4)},${pad.z.toFixed(4)}`;
			if (seen.has(key)) continue;
			seen.add(key);

			// Filter: must be on a walkable surface
			const queryRadius = 3;
			const tempColliders = this.getNearbyCollidersForSpawn(pad, queryRadius);
			let onWalkable = false;
			let insideNonWalkable = false;
			for (const col of tempColliders) {
				if (
					pad.x >= col.min.x &&
					pad.x <= col.max.x &&
					pad.z >= col.min.z &&
					pad.z <= col.max.z
				) {
					const padBottom = pad.y - 1.8;
					const padTop = pad.y + 0.5;
					if (padTop > col.min.y && padBottom < col.max.y) {
						if (col.walkable) {
							onWalkable = true;
						} else {
							insideNonWalkable = true;
						}
					}
				}
			}
			const dist = Math.sqrt(pad.x * pad.x + pad.z * pad.z);
			if (!onWalkable && dist <= 50) {
				// Cornucopia platform edge pads are always valid
				valid.push(pad);
				continue;
			}
			if (onWalkable && !insideNonWalkable) {
				valid.push(pad);
			}
		}
		this.spawnPads = valid;
		console.log(
			`[MapGenerator] After filter: ${this.spawnPads.length} pads, first: (${this.spawnPads[0]?.x.toFixed(1)}, ${this.spawnPads[0]?.z.toFixed(1)}) second: (${this.spawnPads[1]?.x.toFixed(1)}, ${this.spawnPads[1]?.z.toFixed(1)})`,
		);
	}

	// =========================================================================
	// API CONTRACT
	// =========================================================================
	getNearbyCollidersForSpawn(position, radius) {
		const results = [];
		const seen = new Set();
		const cellSize = this.colliderGridCellSize;
		const minCx = Math.floor((position.x - radius) / cellSize);
		const maxCx = Math.floor((position.x + radius) / cellSize);
		const minCz = Math.floor((position.z - radius) / cellSize);
		const maxCz = Math.floor((position.z + radius) / cellSize);
		for (let cx = minCx; cx <= maxCx; cx++) {
			for (let cz = minCz; cz <= maxCz; cz++) {
				const key = (cx << 16) | (cz & 0xffff);
				const bucket = this.colliderGrid?.get(key);
				if (!bucket) continue;
				for (const box of bucket) {
					if (seen.has(box)) continue;
					seen.add(box);
					results.push(box);
				}
			}
		}
		return results;
	}

	addColliderBox(
		center,
		width,
		height,
		depth,
		walkable = false,
		biomeBoundary = false,
	) {
		const box = {
			min: new THREE.Vector3(
				center.x - width / 2,
				center.y - height / 2,
				center.z - depth / 2,
			),
			max: new THREE.Vector3(
				center.x + width / 2,
				center.y + height / 2,
				center.z + depth / 2,
			),
			walkable,
			enabled: true,
			dynamic: false,
			physicsType: "STATIC",
			biomeBoundary,
		};
		const source = this._lastAddedMapObject;
		if (source && this._isAttachedToScene(source)) {
			const sourceBounds = new THREE.Box3().setFromObject(source);
			sourceBounds.expandByScalar(0.25);
			if (!sourceBounds.isEmpty() && sourceBounds.containsPoint(center))
				box.source = source;
		}
		this.colliders.push(box);
		return box;
	}

	finalizeColliders() {
		this._rebuildColliderGrid();
	}

	_rebuildColliderGrid() {
		this.colliderGrid.clear();
		const cellSize = this.colliderGridCellSize;
		for (const box of this.colliders) {
			if (!box || !box.min || !box.max) continue;
			const minX = Math.floor(box.min.x / cellSize);
			const maxX = Math.floor(box.max.x / cellSize);
			const minZ = Math.floor(box.min.z / cellSize);
			const maxZ = Math.floor(box.max.z / cellSize);
			for (let x = minX; x <= maxX; x++) {
				for (let z = minZ; z <= maxZ; z++) {
					// CRITICAL: must use same bitwise key format as Physics.getNearbyColliders
					const key = (x << 16) | (z & 0xffff);
					let bucket = this.colliderGrid.get(key);
					if (!bucket) {
						bucket = [];
						this.colliderGrid.set(key, bucket);
					}
					bucket.push(box);
				}
			}
		}
	}

	_buildNavigationTiles() {
		this._navigationTiles.length = 0;
		const step = 5;
		const limit = this.halfSize - 8;
		for (let x = -limit; x <= limit; x += step) {
			for (let z = -limit; z <= limit; z += step) {
				if (Math.hypot(x, z) < 38 || !this.isWalkableAt(x, z)) continue;
				this._navigationTiles.push({ x, y: this.getSurfaceHeightAt(x, z), z });
			}
		}
	}

	getColliders() {
		return this.colliders;
	}

	// Get ground-level surface Y (walkable colliders with max.y <= 0.6)
	// NOT platform heights — used for chest/item placement on actual ground
	getGroundY(x, z) {
		const cellSize = this.colliderGridCellSize;
		const minX = Math.floor((x - 0.5) / cellSize);
		const maxX = Math.floor((x + 0.5) / cellSize);
		const minZ = Math.floor((z - 0.5) / cellSize);
		const maxZ = Math.floor((z + 0.5) / cellSize);
		let bestY = null;
		for (let cx = minX; cx <= maxX; cx++) {
			for (let cz = minZ; cz <= maxZ; cz++) {
				const key = (cx << 16) | (cz & 0xffff);
				const bucket = this.colliderGrid?.get(key);
				if (!bucket) continue;
				for (const col of bucket) {
					if (!col.walkable) continue;
					if (col.max.y > 0.6) continue; // Ground only, not platforms
					if (col.surfaceCircle) {
						const dx = x - col.surfaceCircle.x;
						const dz = z - col.surfaceCircle.z;
						if (
							dx * dx + dz * dz >
							col.surfaceCircle.radius * col.surfaceCircle.radius
						)
							continue;
					}
					if (col.surfaceOBB) {
						const dx = x - col.surfaceOBB.x;
						const dz = z - col.surfaceOBB.z;
						const cos = Math.cos(col.surfaceOBB.rotation);
						const sin = Math.sin(col.surfaceOBB.rotation);
						const localX = dx * cos - dz * sin;
						const localZ = dx * sin + dz * cos;
						if (
							Math.abs(localX) > col.surfaceOBB.halfWidth ||
							Math.abs(localZ) > col.surfaceOBB.halfDepth
						)
							continue;
					}
					if (
						x >= col.min.x &&
						x <= col.max.x &&
						z >= col.min.z &&
						z <= col.max.z
					) {
						if (bestY === null || col.max.y < bestY) {
							bestY = col.max.y;
						}
					}
				}
			}
		}
		return bestY;
	}

	getSpawnPads() {
		return this.spawnPads;
	}

	setSpawnPadCollidersEnabled(enabled) {
		for (const collider of this.colliders) {
			if (collider?.isSpawnPlatform) collider.enabled = enabled;
		}
	}

	getSpawnWorld() {
		return { x: 0, z: 0 };
	}

	// Raycast to find ground Y at given X,Z — returns surface height or fallback
	raycastGroundY(x, z, fallbackY = 0) {
		// For spawn pads near the center, platform surface is at y=2
		const distFromCenter = Math.sqrt(x * x + z * z);
		if (distFromCenter <= 30) {
			// Center platform always at y=2
			return 2.0;
		}

		// Find the highest walkable surface at this position
		const maxSearchY = fallbackY + 3;
		let closestY = fallbackY;
		let found = false;
		for (const col of this.colliders) {
			if (!col.walkable) continue;
			if (col.max.y > maxSearchY) continue;
			// Skip colliders that are below the fallback height (e.g., underground floors)
			if (col.max.y < fallbackY - 0.5) continue;
			if (col.surfaceCircle) {
				const dx = x - col.surfaceCircle.x;
				const dz = z - col.surfaceCircle.z;
				if (
					dx * dx + dz * dz >
					col.surfaceCircle.radius * col.surfaceCircle.radius
				)
					continue;
			}
			if (col.surfaceOBB) {
				const dx = x - col.surfaceOBB.x;
				const dz = z - col.surfaceOBB.z;
				const cos = Math.cos(col.surfaceOBB.rotation);
				const sin = Math.sin(col.surfaceOBB.rotation);
				const localX = dx * cos - dz * sin;
				const localZ = dx * sin + dz * cos;
				if (
					Math.abs(localX) > col.surfaceOBB.halfWidth ||
					Math.abs(localZ) > col.surfaceOBB.halfDepth
				)
					continue;
			}
			if (
				x >= col.min.x &&
				x <= col.max.x &&
				z >= col.min.z &&
				z <= col.max.z
			) {
				if (col.max.y > closestY && col.max.y <= maxSearchY) {
					// Prefer surfaces close to fallbackY (ground level), not highest surface
					const diff = Math.abs(col.max.y - fallbackY);
					if (!found || diff < Math.abs(closestY - fallbackY)) {
						closestY = col.max.y;
						found = true;
					}
				}
			}
		}
		return found ? closestY : fallbackY;
	}

	getTraps() {
		return this._traps;
	}

	getOneWayGates() {
		return [];
	}

	getStoryNotes() {
		return [];
	}

	getFogZones() {
		return [];
	}

	getHouseSpots() {
		const spots = [];
		for (const b of this._buildings) {
			if (
				b.template?.type === "log_cabin" ||
				b.template?.type === "military_ruin" ||
				b.template?.type === "biome_residence"
			) {
				spots.push({
					x: b.x,
					z: b.z + b.d / 2 + 2,
					type: "house",
				});
			}
		}
		return spots;
	}

	_registerChestSpot(x, z, grade = "house") {
		if (!Number.isFinite(x) || !Number.isFinite(z)) return;
		if (this._chestSpots.some((s) => Math.hypot(s.x - x, s.z - z) < 2.5))
			return;
		this._chestSpots.push({ x, z, grade });
	}

	getChestSpots() {
		return this._chestSpots;
	}

	getHangarSpots() {
		return this._buildings
			.filter((b) => b.template?.type === "military_building")
			.map((b) => ({ x: b.x, z: b.z, width: b.w, depth: b.d, type: "hangar" }));
	}

	getExplosiveBarrelSpots() {
		const spots = [];
		for (let i = 0; i < 15; i++) {
			spots.push({
				x: -this.halfSize + 30 + this._rand() * (this.size - 60),
				z: -this.halfSize + 30 + this._rand() * (this.size - 60),
			});
		}
		return spots;
	}

	getStructureAtPoint(x, z, margin = 2) {
		for (const bp of this._buildings) {
			const dx = x - bp.x;
			const dz = z - bp.z;
			if (
				Math.abs(dx) < bp.w / 2 + margin &&
				Math.abs(dz) < bp.d / 2 + margin
			) {
				return bp;
			}
		}
		return null;
	}

	getStructureApproachRoute(x, z, from = null) {
		const structure = this.getStructureAtPoint(x, z, 0.2);
		if (!structure) return null;
		if (from && this.getStructureAtPoint(from.x, from.z, 0.2) === structure)
			return null;
		const target = new THREE.Vector3(
			x,
			Number.isFinite(this.getSurfaceHeightAt?.(x, z))
				? this.getSurfaceHeightAt(x, z)
				: 0.2,
			z,
		);
		if (structure.route?.length >= 2) {
			return [structure.route[0].clone(), structure.route[1].clone(), target];
		}
		const entranceZ = structure.z + structure.d * 0.5;
		return [
			new THREE.Vector3(structure.x, 0.2, entranceZ + 2.2),
			new THREE.Vector3(structure.x, 0.2, entranceZ - 1.8),
			target,
		];
	}

	isWalkableAt(x, z) {
		const radius = 0.5;
		const minX = Math.floor((x - radius) / this.colliderGridCellSize);
		const maxX = Math.floor((x + radius) / this.colliderGridCellSize);
		const minZ = Math.floor((z - radius) / this.colliderGridCellSize);
		const maxZ = Math.floor((z + radius) / this.colliderGridCellSize);
		for (let cx = minX; cx <= maxX; cx++) {
			for (let cz = minZ; cz <= maxZ; cz++) {
				const bucket = this.colliderGrid.get(`${cx},${cz}`);
				if (!bucket) continue;
				for (const box of bucket) {
					if (
						!box.walkable &&
						!box.navigationPassage &&
						box.enabled !== false
					) {
						if (
							x >= box.min.x - 0.5 &&
							x <= box.max.x + 0.5 &&
							z >= box.min.z - 0.5 &&
							z <= box.max.z + 0.5
						) {
							return false;
						}
					}
				}
			}
		}
		return true;
	}

	isInsideCourtyard(pos) {
		const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
		return dist < 38;
	}

	getCourtyardExitPosition() {
		// Exit position just outside courtyard on platform
		return new THREE.Vector3(0, 0.5, -35);
	}

	getCornucopiaCenter() {
		// Center of the central hub where cornucopia sits
		return new THREE.Vector3(0, 0, 0);
	}

	setCourtyardGateOpen(open) {
		this.setBiomeGatesOpen(open);
	}

	setBiomeGatesOpen(open) {
		const isOpen = !!open;
		for (const gate of this._biomeGates) {
			gate.visible = true;
			gate.material.transparent = true;
			gate.material.opacity = isOpen ? 0.14 : 0.96;
			gate.material.depthWrite = !isOpen;
			gate.material.emissiveIntensity = isOpen ? 0.1 : 0.45;
			gate.material.needsUpdate = true;
		}
		for (const collider of this._biomeGateColliders) {
			collider.enabled = !isOpen;
		}
		this.biomeGatesOpen = isOpen;
	}

	getActiveSafeRadius() {
		return this.halfSize * 0.8;
	}

	activateFogPhase(index) {
		const phases = [
			this.halfSize * 0.3,
			this.halfSize * 0.5,
			this.halfSize * 0.7,
			this.halfSize * 0.9,
		];
		return phases[index] || phases[phases.length - 1];
	}

	getFloorTiles() {
		return this._spawnTiles;
	}

	getNavigationTiles() {
		return this._navigationTiles;
	}

	getElevatedRoutes() {
		return this._elevatedRoutes;
	}

	isShelteredFromRain(pos) {
		if (!pos) return false;
		const structure = this.getStructureAtPoint(pos.x, pos.z, 3);
		return !!structure;
	}

	getClosestRadiationZone(x, z) {
		return null;
	}

	getRadiationDamageAt(x, z) {
		return 0;
	}

	getFogDamageAt(x, z) {
		return 0;
	}

	activateTrapsNearEntity(entity) {
		// No traps in this map
	}

	updatePropVisibility(pos) {}

	enableOptimizedCulling() {
		this._cullDistance = Infinity;
	}

	setupLOD(isMobile) {
		this.isMobile = isMobile;
		if (isMobile) {
			this._cullDistance = this._cullDistanceMobile;
		}
		// Enable frustum culling only on objects that have valid bounding boxes.
		// Objects with frustumCulled explicitly set to false are left untouched.
		this.scene.traverse((obj) => {
			if (obj.isMesh) {
				if (obj.frustumCulled === false) return;
				try {
					obj.geometry.computeBoundingBox?.();
					obj.geometry.computeBoundingSphere?.();
				} catch (_) {}
				const bb = obj.geometry.boundingBox;
				const bs = obj.geometry.boundingSphere;
				if (bb || bs) {
					obj.frustumCulled = true;
				}
			}
		});
	}

	update(delta, playerPos) {
		// Culling handled by updatePropVisibility() called from main.js — no duplicate work here
	}

	updateAllAnimations(delta, playerPos) {
		// Store player position for distance checks
		if (playerPos) this._lastPlayerPos = playerPos;
		// Throttle animation updates to every 0.5s (2x/sec) — subtle visual changes don't need high frequency
		this._animSkipTimer = (this._animSkipTimer || 0) - delta;
		if (this._animSkipTimer > 0) return;
		this._animSkipTimer = 0.5;
		// Batch all animation updates with distance culling
		this.updateFountainAnimation(delta);
		this.updateFireflyAnimation(delta);
		this.updateCrystalAnimation(delta);
		this.updateTorchAnimation(delta);
		this.updateGlowAnimation(delta);
		this.updateSnowParticles(delta);
		this.updateWindTurbines(delta);
		this.updateTrapAnimations();
		this.updateInteractivePOIs();
	}

	updateTrapAnimations() {
		const now = performance.now() * 0.001;
		for (const trap of this._traps) {
			if (!trap.visual || !trap.period) continue;
			if (trap.type === "mine") {
				const cooling = (trap.rearmAt || 0) > now;
				trap.active = !cooling;
				trap.visual.visible = !cooling;
				if (!cooling) {
					const pulse = 1 + Math.sin(now * 15 + trap.phase) * 0.1;
					trap.visual.scale.set(pulse, 1, pulse);
				}
				continue;
			}
			const phaseTime = (now + trap.phase) % trap.period;
			const active = phaseTime < trap.activeFor;
			const warning = !active && phaseTime > trap.period - 0.8;
			const pulse = 1 + Math.sin(now * 12 + trap.phase) * 0.08;
			trap.active = active;
			if (trap.type === "pressure") {
				trap.visual.position.y = active
					? trap.baseY
					: warning
						? trap.baseY + 0.035
						: trap.baseY - 0.07;
				trap.visual.scale.set(active ? pulse : 0.92, 1, active ? pulse : 0.92);
			} else if (trap.type === "snare") {
				const scale = active ? pulse : warning ? 0.95 : 0.76;
				trap.visual.scale.set(scale, active ? 1 : 0.7, scale);
				trap.visual.rotation.y += active ? 0.2 : 0.035;
			} else if (trap.type === "spikes") {
				trap.visual.position.y = active ? 0 : warning ? -0.3 : -0.85;
			} else if (trap.type === "ice") {
				const scale = active ? pulse : warning ? 0.9 : 0.72;
				trap.visual.scale.set(scale, active ? 1 : 0.55, scale);
				trap.visual.rotation.y += active ? 0.05 : 0.01;
			}
		}
	}

	updateInteractivePOIs() {
		const time = performance.now() * 0.002;
		for (const poi of this._interactivePOIs) {
			if (!poi?.visible || poi.userData.used) continue;
			poi.position.y =
				poi.userData.baseY + 0.08 + Math.sin(time + poi.userData.phase) * 0.08;
			poi.rotation.y = (time + poi.userData.phase) * 0.25;
		}
	}

	updateZoneAnimations(delta) {
		// No zone animations on map itself
	}

	updateParticles(delta) {
		// No particles
	}

	setWetTerrain(active) {
		// No wet terrain
	}

	setRainPuddles(active, center) {
		// No puddles
	}

	// =========================================================================
	// VISUAL ELEMENTS — Labels, Compass, Legend
	// =========================================================================

	_cacheAnimatedObjects() {
		// Cache references to animated objects — avoid filtering scene.children every frame
		this._cachedFireflies = this.scene.children.filter(
			(c) => c.userData?.isFirefly,
		);
		this._cachedCrystals = this.scene.children.filter(
			(c) => c.userData?.isCrystal,
		);
		this._cachedTorches = this.scene.children.filter(
			(c) => c.userData?.isTorch,
		);
		this._cachedGlows = this.scene.children.filter((c) => c.userData?.isGlow);
		this._cachedTurbines = this.scene.children.filter(
			(c) => c.userData?.isWindTurbine,
		);
		this._cachedSnow = this.scene.children.find(
			(c) => c.userData?.isSnowParticles,
		);
	}

	updateFireflyAnimation(delta) {
		const fireflies = this._cachedFireflies;
		if (!fireflies?.length) return;
		const px = this._lastPlayerPos?.x,
			pz = this._lastPlayerPos?.z;
		const cullDistSq = px ? 10000 : Infinity; // 100m
		const t = performance.now() * 0.001;
		for (const ff of fireflies) {
			if (px) {
				const dx = ff.position.x - px,
					dz = ff.position.z - pz;
				if (dx * dx + dz * dz > cullDistSq) continue;
			}
			ff.userData.angle += ff.userData.speed * delta;
			ff.position.x =
				ff.userData.center.x + Math.cos(ff.userData.angle) * ff.userData.radius;
			ff.position.z =
				ff.userData.center.z + Math.sin(ff.userData.angle) * ff.userData.radius;
			ff.position.y =
				ff.userData.baseY + Math.sin(t * 2 + ff.userData.blinkPhase) * 0.5;
			const blink = Math.sin(t * ff.userData.blinkRate * Math.PI * 2);
			ff.material.opacity = blink > 0 ? 0.9 : 0.1;
		}
	}

	updateCrystalAnimation(delta) {
		const crystals = this._cachedCrystals;
		if (!crystals?.length) return;
		const px = this._lastPlayerPos?.x,
			pz = this._lastPlayerPos?.z;
		const cullDistSq = px ? 10000 : Infinity;
		const t = performance.now() * 0.001;
		for (const cr of crystals) {
			if (px) {
				const dx = cr.position.x - px,
					dz = cr.position.z - pz;
				if (dx * dx + dz * dz > cullDistSq) continue;
			}
			const blink = Math.sin(t * cr.userData.blinkRate * Math.PI * 2);
			cr.material.emissiveIntensity = 2.0 + blink * 2.0;
			cr.rotation.y += delta * 0.5;
		}
	}

	updateTorchAnimation(delta) {
		const torches = this._cachedTorches;
		if (!torches?.length) return;
		const px = this._lastPlayerPos?.x,
			pz = this._lastPlayerPos?.z;
		const cullDistSq = px ? 10000 : Infinity;
		const t2 = performance.now() * 0.001;
		for (const tc of torches) {
			if (px) {
				const dx = tc.position.x - px,
					dz = tc.position.z - pz;
				if (dx * dx + dz * dz > cullDistSq) continue;
			}
			const flicker =
				Math.sin(t2 * tc.userData.blinkRate * Math.PI * 2) * 0.5 + 0.5;
			tc.scale.set(
				0.8 + flicker * 0.4,
				0.8 + flicker * 0.4,
				0.8 + flicker * 0.4,
			);
			tc.material.emissiveIntensity = 5.0 + flicker * 8.0;
		}
	}

	updateGlowAnimation(delta) {
		const glows = this._cachedGlows;
		if (!glows?.length) return;
		const px = this._lastPlayerPos?.x,
			pz = this._lastPlayerPos?.z;
		const cullDistSq = px ? 10000 : Infinity;
		const t = performance.now() * 0.001;
		for (const g of glows) {
			if (px) {
				const dx = g.position.x - px,
					dz = g.position.z - pz;
				if (dx * dx + dz * dz > cullDistSq) continue;
			}
			const pulse = Math.sin(t * 2) * 0.3 + 0.7;
			g.material.opacity = 0.3 + pulse * 0.4;
			g.scale.setScalar(0.8 + pulse * 0.3);
		}
	}

	updateFountainAnimation(delta) {
		// Cache fountain reference instead of searching every frame
		if (!this._cachedFountain) {
			for (const child of this.scene.children) {
				if (child.userData && child.userData.isFountain) {
					this._cachedFountain = child;
					break;
				}
			}
		}
		const fountain = this._cachedFountain;
		if (!fountain) return;

		// Distance check — skip if player > 200m away
		if (this._lastPlayerPos) {
			const dx = this._lastPlayerPos.x - fountain.position.x;
			const dz = this._lastPlayerPos.z - fountain.position.z;
			if (dx * dx + dz * dz > 40000) return; // 200m²
		}

		const time = performance.now() * 0.001;

		// Струи воды — пульсация прозрачности и масштаба
		const streams = fountain.userData.streams;
		if (streams) {
			for (const stream of streams) {
				const pulse =
					0.5 + Math.sin(time * 3 + stream.userData.streamAngle) * 0.2;
				stream.material.opacity = 0.5 + pulse * 0.3;
				stream.material.emissiveIntensity = 0.2 + pulse * 0.15;
				stream.scale.x =
					1 + Math.sin(time * 4 + stream.userData.streamAngle) * 0.15;
				stream.scale.z = stream.scale.x;
			}
		}

		// Каdrops падают вдоль струй от верхней чаши к бассейну
		const drops = fountain.userData.drops;
		if (drops) {
			for (const drop of drops) {
				const speed = drop.userData.dropSpeed || 5;
				drop.position.y -= speed * delta;
				const progress =
					1 -
					(drop.position.y - (drop.userData.dropEndY || 1.2)) /
						((drop.userData.dropStartY || 5.4) -
							(drop.userData.dropEndY || 1.2));
				const scale = 0.4 + Math.max(0, Math.min(1, progress)) * 0.8;
				drop.scale.setScalar(scale);
				if (drop.position.y < (drop.userData.dropEndY || 1.2)) {
					drop.position.y = drop.userData.dropStartY || 5.4;
					drop.scale.setScalar(0.4);
				}
			}
		}

		// Брызги у поверхности бассейна
		const splashes = fountain.userData.splashes;
		if (splashes) {
			for (const splash of splashes) {
				const phase = splash.userData.splashPhase;
				splash.position.y = 1.35 + Math.sin(time * 5 + phase) * 0.15;
				splash.scale.setScalar(0.5 + Math.sin(time * 7 + phase) * 0.3);
			}
		}

		// Пульсация воды в бассейнах
		for (const child of fountain.children) {
			if (child.userData?.isWater) {
				child.material.emissiveIntensity = 0.3 + Math.sin(time * 2) * 0.1;
				child.scale.y = 1 + Math.sin(time * 3) * 0.05;
			}
		}
	}

	/**
	 * Post-process map meshes and convert compatible groups to InstancedMesh.
	 */
	_optimizeInstancing(minCount = 50) {
		this.instancedMeshSystem = new InstancedMeshSystem(this.pool);
		const result = this.instancedMeshSystem.optimize(this.scene, minCount);
		this._meshes = this._meshes.filter((mesh) => mesh?.parent);
		for (const im of result.instancedMeshes) {
			this._meshes.push(im);
		}
		return result;
	}
}
