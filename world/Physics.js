import * as THREE from "../node_modules/three/build/three.module.js";

export class Physics {
	constructor(scene, mapGenerator) {
		this.scene = scene;
		this.mapGenerator = mapGenerator;
		this.gravity = -28;
		this.entities = [];
		this.colliders = mapGenerator.getColliders?.() || [];
		this.colliderGridCellSize = 16;
		this.colliderGrid = new Map();
		this.colliderGridCount = this.colliders.length;
		this.dynamicColliders = this.colliders.filter((box) => box.dynamic);
		this._nearbyResults = [];
		this._queryStamp = 1;

		// Wall sliding
		this.slideDamping = 0.85;
		this.maxCompression = 1.5;
		this.boundaryMargin = Math.max(16, (mapGenerator?.halfSize || 128) - 1.5);
		this.boundaryForce = 12;

		// Reusable vectors
		this._tmpVec1 = new THREE.Vector3();
		this._tmpVec2 = new THREE.Vector3();
		this._tmpVec3 = new THREE.Vector3();
		this._tmpVec4 = new THREE.Vector3();
		this._tmpVec5 = new THREE.Vector3();
		this._slideDir = new THREE.Vector3();
		this._boundForce = new THREE.Vector3();

		// Per-frame damping cache
		this._groundDamping = 1;
		this._airDamping = 1;
		this._physicsFrame = 0;

		if (this.colliders.length) {
			this.rebuildColliderGrid();
		}
		// Track map generator's collider version to detect in-place changes
		this._colliderVersion = this.mapGenerator?.colliderVersion ?? 0;
	}

	addEntity(entity) {
		this.entities.push(entity);
		if (entity?.type === "Player" || entity?.constructor?.name === "Player")
			this.playerEntity = entity;
	}

	removeEntity(entity) {
		const index = this.entities.indexOf(entity);
		if (index > -1) {
			this.entities.splice(index, 1);
		}
		if (this.playerEntity === entity) this.playerEntity = null;
	}

	update(delta, _gameState) {
		// Check for collider changes (version or reference)
		const mg = this.mapGenerator;
		const newVersion = mg?.colliderVersion ?? 0;
		const newColliders = mg.getColliders?.() || this.colliders;
		if (newVersion !== this._colliderVersion || newColliders !== this.colliders) {
			this.colliders = newColliders;
			this.colliderGridCount = this.colliders.length;
			this.dynamicColliders = this.colliders.filter((box) => box.dynamic);
			this.rebuildColliderGrid();
			this._colliderVersion = newVersion;
		}

		const npcStride = this.mapGenerator?.isMobile ? 3 : 2;
		const physicsFrame = this._physicsFrame++;
		const playerEntity = this.playerEntity;

		for (
			let entityIndex = 0;
			entityIndex < this.entities.length;
			entityIndex++
		) {
			const entity = this.entities[entityIndex];
			if (!entity.physics) continue;
			const type = entity.constructor?.name;
			const isPlayer = entity.type === "Player" || type === "Player";
			const isNpc = type === "Bot" || type === "Zombie";
			const nearPlayer =
				isNpc &&
				playerEntity?.position &&
				entity.position?.distanceToSquared(playerEntity.position) < 1225;
			const entityStride = nearPlayer ? 1 : npcStride;
			const pos = entity.position;

			// Validate position
			if (
				!pos ||
				!Number.isFinite(pos.x) ||
				!Number.isFinite(pos.y) ||
				!Number.isFinite(pos.z)
			) {
				pos?.set?.(0, (entity.physics.height || 1.7) + 0.2, 0);
				entity.physics.velocity?.set?.(0, 0, 0);
				entity.physics.onGround = true;
				continue;
			}

			const isFrozen = entity.isFrozen === true;
			const height = entity.physics.height || 1.7;
			const vel = entity.physics.velocity;
			if (
				isNpc &&
				entityStride > 1 &&
				(entityIndex + physicsFrame) % entityStride !== 0
			) {
				if (!isFrozen) {
					if (!entity.physics.onGround) {
						vel.y += this.gravity * delta;
						pos.y += vel.y * delta;
					}
					pos.x += vel.x * delta;
					pos.z += vel.z * delta;
					const damping = Math.exp(
						-(entity.physics.onGround ? (type === "Bot" ? 2.4 : 3.5) : 2.5) *
							delta,
					);
					vel.x *= damping;
					vel.z *= damping;
				}
				continue;
			}
			const physicsDelta = delta;

			// Init tracking state
			if (entity.physics.wasOnGround === undefined) {
				entity.physics.wasOnGround = entity.physics.onGround;
				entity.physics.fallStartY = pos.y;
			}

			// --- Stuck detection (throttled, shares nearby query) ---
			let insideNonWalkable = false;
			if (!isPlayer) {
				if (!entity.physics._stuckCount) entity.physics._stuckCount = 0;
				entity.physics._stuckCheckTimer =
					(entity.physics._stuckCheckTimer ?? 0) - physicsDelta;
				if (entity.physics._stuckCheckTimer <= 0) {
					entity.physics._stuckCheckTimer = 0.3;
					const bottom = pos.y - height;
					const nearby = this.getNearbyColliders(pos, 2.0);
					for (const box of nearby) {
						if (!box.walkable && box.min && box.max) {
							if (
								pos.x >= box.min.x &&
								pos.x <= box.max.x &&
								pos.z >= box.min.z &&
								pos.z <= box.max.z &&
								bottom < box.max.y &&
								pos.y > box.min.y
							) {
								insideNonWalkable = true;
								break;
							}
						}
					}
				}
			}

			if (insideNonWalkable && !isPlayer) {
				entity.physics._stuckCount++;
				if (entity.physics._stuckCount > 120) {
					const pads = this.mapGenerator?.spawnPads || [];
					if (pads.length > 0) {
						const pad = pads[Math.floor(Math.random() * pads.length)];
						pos.set(pad.x, pad.y + height, pad.z);
					} else {
						pos.set(0, 5, 0);
					}
					vel?.set?.(0, 0, 0);
					entity.physics.onGround = false;
					entity.physics._stuckCount = 0;
				}
			} else {
				entity.physics._stuckCount = 0;
			}

			// --- Gravity ---
			if (isFrozen) {
				vel.set(0, 0, 0);
			} else {
				vel.y = entity.physics.onGround
					? 0
					: vel.y + this.gravity * physicsDelta;
			}

			// --- Move ---
			if (!isFrozen) {
				const moveX = vel.x * physicsDelta;
				const moveZ = vel.z * physicsDelta;
				const totalMove = Math.abs(moveX) + Math.abs(moveZ);
				pos.y += vel.y * physicsDelta;
				if (totalMove > 0.005) {
					// Увеличен шаг (0.28→0.38) для плавного движения через проходы
					const steps = Math.max(1, Math.ceil(totalMove / 0.38));
					for (let step = 0; step < steps; step++) {
						pos.x += moveX / steps;
						pos.z += moveZ / steps;
						this.resolveCollisions(entity);
					}
				}
			}

			// --- Single surface height query (merged) ---
			const surfaceY = this._getSurfaceHeight(pos, height);

			// Ground clamp: entity bottom must be >= surface
			const entityBottom = pos.y - height;
			if (entityBottom <= surfaceY + 0.002) {
				pos.y = surfaceY + height;
				entity.physics.onGround = true;
				vel.y = 0;
			} else {
				entity.physics.onGround = false;
			}

			// --- Fall damage ---
			if (!entity.physics.wasOnGround && entity.physics.onGround) {
				const fallDist = entity.physics.fallStartY - pos.y;
				if (fallDist > 6 && typeof entity.takeDamage === "function") {
					const dmg = (fallDist - 6) * 6;
					if (dmg > 0) entity.takeDamage(dmg);
				}
				entity.physics.fallStartY = pos.y;
			}
			if (entity.physics.wasOnGround && !entity.physics.onGround) {
				entity.physics.fallStartY = pos.y;
			}
			entity.physics.wasOnGround = entity.physics.onGround;

			// --- Environment effects (lava, water, zone) ---
			if (this.mapGenerator.isLavaAt?.(pos.x, pos.z, pos.y)) {
				if (typeof entity.takeDamage === "function")
					entity.takeDamage(this.lavaDamagePerSecond * physicsDelta);
				if (typeof entity.applyBurn === "function")
					entity.applyBurn(1.8, 3.2, null);
			}
			if (this.mapGenerator.isWaterAt?.(pos.x, pos.z)) {
				if (typeof entity.applySlow === "function") entity.applySlow(0.68, 0.2);
			}
			const zoneSlow = this.mapGenerator.getSlowFactorAt?.(pos.x, pos.z) ?? 1;
			if (zoneSlow < 0.999) {
				if (typeof entity.applySlow === "function")
					entity.applySlow(zoneSlow, 0.2);
				else {
					vel.x *= zoneSlow;
					vel.z *= zoneSlow;
				}
			}

			// --- Velocity damping ---
			const dampingDelta = Math.min(physicsDelta, 0.075);
			const groundDampingRate =
				type === "Bot" ? 2.4 : type === "Zombie" ? 3.5 : 14;
			const dmg = entity.physics.onGround
				? Math.exp(-groundDampingRate * dampingDelta)
				: Math.exp(-2.5 * dampingDelta);
			vel.x *= dmg;
			vel.z *= dmg;
			if (Math.abs(vel.x) < 0.01) vel.x = 0;
			if (Math.abs(vel.z) < 0.01) vel.z = 0;

			// --- Boundary enforcement ---
			if (!isFrozen && entity.isInvulnerable !== true) {
				const limit = this.boundaryMargin;
				if (pos.x < -limit || pos.x > limit) {
					pos.x = THREE.MathUtils.clamp(pos.x, -limit, limit);
					vel.x = 0;
				}
				if (pos.z < -limit || pos.z > limit) {
					pos.z = THREE.MathUtils.clamp(pos.z, -limit, limit);
					vel.z = 0;
				}
			}
		}
	}

	/**
	 * Returns the highest walkable surface Y at position, or 0 (terrain base).
	 */
	_getSurfaceHeight(position, height) {
		const bottom = position.y - height;
		const radius = 0.6;
		const nearby = this.getNearbyColliders(position, radius + 4);

		let maxY = -Infinity;
		for (const box of nearby) {
			if (box.enabled === false || !box.walkable) continue;
			if (!this._containsWalkableSurface(box, position.x, position.z, radius))
				continue;
			const min = box.min;
			const max = box.max;
			if (!min || !max) continue;
			if (!box.surfaceOBB && !box.surfaceCircle) {
				if (position.x + radius < min.x || position.x - radius > max.x) continue;
				if (position.z + radius < min.z || position.z - radius > max.z) continue;
			}
			if (position.y + height < min.y - 0.5) continue;
			if (position.y > max.y + height + 0.5) continue;
			const stepReach = box.isTowerStair || box.isBiomeEntrance || box.isBiomeResidence ? 0.78 : 0.65;
			if (bottom > max.y + 0.5 || max.y > bottom + stepReach) continue;
			if (maxY === -Infinity || max.y > maxY) maxY = max.y;
		}

		if (maxY === -Infinity && !this.colliderGrid.size) {
			for (const box of this.colliders) {
				if (box.enabled === false || !box.walkable) continue;
				if (!this._containsWalkableSurface(box, position.x, position.z, radius))
					continue;
				const min = box.min;
				const max = box.max;
				if (!min || !max) continue;
				if (!box.surfaceOBB && !box.surfaceCircle) {
					if (position.x + radius < min.x || position.x - radius > max.x)
						continue;
					if (position.z + radius < min.z || position.z - radius > max.z)
						continue;
				}
				if (position.y + height < min.y - 0.5) continue;
				if (position.y > max.y + height + 0.5) continue;
				const stepReach = box.isTowerStair || box.isBiomeEntrance || box.isBiomeResidence ? 0.78 : 0.65;
				if (bottom > max.y + 0.5 || max.y > bottom + stepReach) continue;
				if (maxY === -Infinity || max.y > maxY) maxY = max.y;
			}
		}

		return maxY === -Infinity ? 0 : maxY;
	}

	_containsWalkableSurface(box, x, z, radius = 0) {
		const obb = box.surfaceOBB;
		if (obb) {
			const dx = x - obb.x;
			const dz = z - obb.z;
			const cos = Math.cos(obb.rotation);
			const sin = Math.sin(obb.rotation);
			const localX = dx * cos - dz * sin;
			const localZ = dx * sin + dz * cos;
			const clearance =
				radius * (box.isTowerStair || box.isBiomeEntrance || box.isBiomeResidence ? 0.08 : 0.35);
			return (
				Math.abs(localX) <= Math.max(0.02, obb.halfWidth - clearance) &&
				Math.abs(localZ) <= Math.max(0.02, obb.halfDepth - clearance)
			);
		}
		const circle = box.surfaceCircle;
		if (!circle) {
			const min = box.min;
			const max = box.max;
			if (!min || !max) return false;
			const preciseEdge =
				box.isTowerStair ||
				box.isBiomeEntrance ||
				box.isBiomeResidence ||
				box.isSpawnPlatform;
			const clearance = radius * (preciseEdge ? 0.08 : 0.35);
			return (
				x >= min.x + clearance &&
				x <= max.x - clearance &&
				z >= min.z + clearance &&
				z <= max.z - clearance
			);
		}
		const dx = x - circle.x;
		const dz = z - circle.z;
		const limit = Math.max(0, circle.radius - radius * 0.35);
		return dx * dx + dz * dz <= limit * limit;
	}

	resolveCollisions(entity) {
		if (!this.colliders.length) return;
		const type = entity.constructor?.name;
		// Уменьшен бонус для ботов (0.35→0.15) для плавного прохождения через двери
		const bonusRadius = type === "Zombie" ? 0.1 : type === "Bot" ? 0.15 : 0;
		const baseRadius = (entity.physics?.radius || 0.5) + bonusRadius;
		const pos = entity.position;
		const bottom = pos.y - (entity.physics?.height || 1.7);
		const pushDistSq = (baseRadius + 0.5) * (baseRadius + 0.5);
		const maxPushPerStep = 0.5;
		const nearby = this.getNearbyColliders(pos, baseRadius + 2.0);
		if (!nearby.length) return;
		const hasBuildingWall = nearby.some((b) => b.isBuildingWall);
		const maxPasses = hasBuildingWall ? 6 : 2;
		let pushed = false;
		for (let pass = 0; pass < maxPasses; pass++) {
			pushed = false;

			for (const box of nearby) {
				if (box.enabled === false) continue;

				const min = box.min;
				const max = box.max;
				if (!min || !max) continue;

				// Y overlap check
				if (pos.y < min.y - 0.3) continue;
				if (bottom > max.y + 0.3) continue;

				if (box.walkable) {
					if (bottom >= max.y - 0.05) continue;
					const stepHeight = max.y - bottom;
					const stepReach = box.isTowerStair || box.isBiomeEntrance || box.isBiomeResidence ? 0.78 : 0.65;
					const verticalSpeed = entity.physics.velocity?.y || 0;
					const stairRecovery = (box.isTowerStair || box.isBiomeEntrance || box.isBiomeResidence) &&
						bottom >= max.y - stepReach &&
						bottom <= max.y + 0.12;
					const canStep =
						(entity.physics.onGround || stairRecovery) && verticalSpeed <= 0.01;
					const onSurface = this._containsWalkableSurface(
						box,
						pos.x,
						pos.z,
						baseRadius,
					);
					const landingReach = Math.max(
						0.45,
						Math.min(1.2, Math.abs(verticalSpeed) * 0.06),
					);
					if (
						!entity.physics.onGround &&
						verticalSpeed <= 0 &&
						onSurface &&
						bottom >= max.y - landingReach
					) {
						pos.y = max.y + (entity.physics?.height || 1.7);
						entity.physics.onGround = true;
						if (entity.physics.velocity) entity.physics.velocity.y = 0;
						continue;
					}
					if (
						canStep &&
						onSurface &&
						stepHeight > 0.02 &&
						stepHeight <= stepReach
					) {
						pos.y = max.y + (entity.physics?.height || 1.7);
						entity.physics.onGround = true;
						if (entity.physics.velocity) entity.physics.velocity.y = 0;
						continue;
					}
					if (!onSurface) continue;
					if (bottom < min.y) continue;
				}

				// AABB vs point (XZ plane)
				const clampedX =
					min.x + Math.max(0, Math.min(max.x - min.x, pos.x - min.x));
				const clampedZ =
					min.z + Math.max(0, Math.min(max.z - min.z, pos.z - min.z));
				const dx = pos.x - clampedX;
				const dz = pos.z - clampedZ;
				const distSq = dx * dx + dz * dz;

				if (distSq > pushDistSq) continue;

				if (distSq < 0.0001) {
					// Center inside box — push along shortest axis, clamped
					const left = Math.abs(pos.x - min.x);
					const right = Math.abs(max.x - pos.x);
					const back = Math.abs(pos.z - min.z);
					const front = Math.abs(max.z - pos.z);
					const minPen = Math.min(left, right, back, front);

					const pushAmt = Math.min(minPen + baseRadius, maxPushPerStep);
					if (minPen === left) pos.x -= pushAmt;
					else if (minPen === right) pos.x += pushAmt;
					else if (minPen === back) pos.z -= pushAmt;
					else pos.z += pushAmt;
					pushed = true;
				} else {
					const dist = Math.sqrt(distSq);
					const penetration = baseRadius - dist;
					if (penetration > 0.005) {
						const push = Math.min(
							penetration * this.maxCompression,
							maxPushPerStep,
						);
						const invDist = 1 / dist;
						pos.x += dx * invDist * Math.max(0.01, push);
						pos.z += dz * invDist * Math.max(0.01, push);
						pushed = true;
					}
				}
			}

			if (!pushed) break;
		}

		// Wall sliding for fast movers
		if (entity.physics?.velocity && !pushed) {
			const velX = entity.physics.velocity.x;
			const velZ = entity.physics.velocity.z;
			const velMag = Math.sqrt(velX * velX + velZ * velZ);

			if (velMag > 1.5) {
				let wallDot = -Infinity;
				let bestDx = 0,
					bestDz = 0;

				for (const box of nearby) {
					if (!box.enabled || box.walkable) continue;
					const min = box.min,
						max = box.max;
					if (!min || !max) continue;
					const cx = (min.x + max.x) / 2;
					const cz = (min.z + max.z) / 2;
					const ddx = pos.x - cx;
					const ddz = pos.z - cz;
					const dMag = Math.sqrt(ddx * ddx + ddz * ddz);
					if (dMag < 1.5 && dMag > 0.01) {
						const dot =
							(velX * ddx + velZ * ddz) / (dMag * Math.max(0.01, velMag));
						if (dot > wallDot && dot > 0.3) {
							wallDot = dot;
							bestDx = ddx / dMag;
							bestDz = ddz / dMag;
						}
					}
				}

				if (wallDot > -Infinity) {
					const tangentX = -bestDz;
					const tangentZ = bestDx;
					const slideDot = velX * tangentX + velZ * tangentZ;
					if (Math.abs(slideDot) > 0.3) {
						const slideFactor = Math.min(0.7, this.slideDamping);
						entity.physics.velocity.x = tangentX * slideDot * slideFactor;
						entity.physics.velocity.z = tangentZ * slideDot * slideFactor;
					}
				}
			}
		}
	}

	rebuildColliderGrid() {
		this.colliderGrid.clear();
		const cellSize = this.colliderGridCellSize;
		for (const box of this.colliders) {
			if (!box) continue;

			let min, max;
			if (box.min && box.max) {
				min = box.min;
				max = box.max;
			} else if (box.position && box.size) {
				min = this._tmpVec1.set(
					box.position.x - box.size.x / 2,
					box.position.y - box.size.y / 2,
					box.position.z - box.size.z / 2,
				);
				max = this._tmpVec2.set(
					box.position.x + box.size.x / 2,
					box.position.y + box.size.y / 2,
					box.position.z + box.size.z / 2,
				);
				box.min = min.clone();
				box.max = max.clone();
			} else {
				continue;
			}

			const minX = Math.floor(min.x / cellSize);
			const maxX = Math.floor(max.x / cellSize);
			const minZ = Math.floor(min.z / cellSize);
			const maxZ = Math.floor(max.z / cellSize);
			for (let x = minX; x <= maxX; x++) {
				for (let z = minZ; z <= maxZ; z++) {
					// OPTIMIZED: numeric key with bit shifting to avoid string concatenation
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

	getNearbyColliders(position, radius) {
		if (!this.colliderGrid.size) return this.colliders;
		const results = this._nearbyResults;
		results.length = 0;
		const cellSize = this.colliderGridCellSize;
		const minCx = Math.floor((position.x - radius) / cellSize);
		const maxCx = Math.floor((position.x + radius) / cellSize);
		const minCz = Math.floor((position.z - radius) / cellSize);
		const maxCz = Math.floor((position.z + radius) / cellSize);
		let stamp = this._queryStamp++;
		if (stamp >= 0x3fffffff) {
			this._queryStamp = 1;
			stamp = 1;
		}
		for (let cx = minCx; cx <= maxCx; cx++) {
			for (let cz = minCz; cz <= maxCz; cz++) {
				const key = (cx << 16) | (cz & 0xffff);
				const bucket = this.colliderGrid.get(key);
				if (!bucket) continue;
				for (let i = 0; i < bucket.length; i++) {
					const box = bucket[i];
					if (box._qStamp === stamp) continue;
					box._qStamp = stamp;
					results.push(box);
				}
			}
		}
		if (this.dynamicColliders.length) {
			for (let i = 0; i < this.dynamicColliders.length; i++) {
				const box = this.dynamicColliders[i];
				if (box._qStamp === stamp) continue;
				box._qStamp = stamp;
				results.push(box);
			}
		}
		return results;
	}

	getColliderSurfaceHeight(position, height) {
		return this._getSurfaceHeight(position, height);
	}
}
