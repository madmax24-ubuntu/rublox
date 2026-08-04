import * as THREE from "three";

export class EntityManager {
	constructor(scene) {
		this.scene = scene;
		this.entities = [];
		this.projectiles = [];
		this.effects = [];
		this.spatialCellSize = 24;
		this.spatialIndex = new Map();
		this._tmpVecA = new THREE.Vector3();
		this._tmpVecB = new THREE.Vector3();
		this._tmpVecC = new THREE.Vector3();
		this._tmpVecD = new THREE.Vector3();
		this._tmpVecE = new THREE.Vector3();
		this._tmpVecF = new THREE.Vector3();
		this._tmpSegDir = new THREE.Vector3();
		this._tmpProbePos = new THREE.Vector3();
		this._nearbyQueryStamp = 1;
		this.aliveSurvivorsCache = [];
		this.aliveSurvivorCount = 0;
		this._lastRebuildCount = 0;
		this._impactGeoCache = new Map();
		this._tmpVecG = new THREE.Vector3();
	}

	addEntity(entity) {
		this.entities.push(entity);
	}

	removeEntity(entity) {
		const index = this.entities.indexOf(entity);
		if (index > -1) {
			this.entities.splice(index, 1);
			entity.dispose();
		}
	}

	addProjectile(projectile) {
		if (!projectile?.mesh) return;
		projectile.mesh.visible = true;
		projectile.mesh.frustumCulled = false;
		this.projectiles.push(projectile);
		this.scene.add(projectile.mesh);
	}

	isSurvivorEntity(entity) {
		const type = entity?.constructor?.name;
		return type === "Player" || type === "Bot";
	}

	update(delta, physics, _audioSynth) {
		this.physicsRef = physics || this.physicsRef;
		const rebuildInterval = this.scene.userData.mobileMode ? 12 : 10;
		this._spatialFrameCounter =
			((this._spatialFrameCounter || 0) + 1) % rebuildInterval;
		const shouldRebuild =
			this.entities.length !== this._lastRebuildCount ||
			this._spatialFrameCounter === 0;
		if (shouldRebuild) {
			this._lastRebuildCount = this.entities.length;
			this.rebuildSpatialIndex();
		}
		// Update projectiles
		for (let i = this.projectiles.length - 1; i >= 0; i--) {
			const proj = this.projectiles[i];
			const prevPos = this._tmpVecD.copy(proj.mesh.position);

			let stepDistance = 0;
			if (proj.velocity) {
				if (proj.gravity) {
					proj.velocity.y -= proj.gravity * delta;
				}
				const stepX = proj.velocity.x * delta;
				const stepY = proj.velocity.y * delta;
				const stepZ = proj.velocity.z * delta;
				stepDistance = Math.sqrt(stepX * stepX + stepY * stepY + stepZ * stepZ);
				proj.mesh.position.x += stepX;
				proj.mesh.position.y += stepY;
				proj.mesh.position.z += stepZ;
				proj.direction.copy(proj.velocity).normalize();
			} else {
				const speedStep = proj.speed * delta;
				const stepX = proj.direction.x * speedStep;
				const stepY = proj.direction.y * speedStep;
				const stepZ = proj.direction.z * speedStep;
				stepDistance = Math.sqrt(stepX * stepX + stepY * stepY + stepZ * stepZ);
				proj.mesh.position.x += stepX;
				proj.mesh.position.y += stepY;
				proj.mesh.position.z += stepZ;
			}
			proj.travelled = (proj.travelled || 0) + stepDistance;
			if (proj.type === "flame" && proj.mesh.material) {
				const flicker = 0.85 + Math.random() * 0.3;
				proj.mesh.scale.setScalar(flicker);
			}
			if (proj.align === "arrow") {
				const forward =
					proj._forward || (proj._forward = new THREE.Vector3(1, 0, 0));
				const quat = proj._quat || (proj._quat = new THREE.Quaternion());
				quat.setFromUnitVectors(
					forward,
					this._tmpVecE.copy(proj.direction).normalize(),
				);
				proj.mesh.quaternion.copy(quat);
			} else {
				this._tmpVecF.copy(proj.mesh.position).add(proj.direction);
				proj.mesh.lookAt(this._tmpVecF);
			}

			if (physics) {
				const hitWall = this.checkProjectileWallHit(proj, prevPos, physics);
				if (hitWall) {
					if (proj.type === "bazooka") {
						proj._mapGenerator = this.mapGenerator;
						proj._audioSynth = this.audioSynth;
						this.spawnBazookaExplosion(this._tmpVecF.copy(hitWall), proj);
					} else {
						this.spawnImpactEffect(hitWall, proj.type, false);
					}
					this.removeProjectile(i);
					continue;
				}
			}

			const hitEntity = this.checkProjectileHit(
				proj,
				prevPos,
				proj.mesh.position,
			);
			if (hitEntity) {
				// Handle bazooka explosion
				if (proj.type === "bazooka") {
					const hitPos = this._tmpVecF.copy(proj.mesh.position);
					proj._mapGenerator = this.mapGenerator;
					proj._audioSynth = this.audioSynth;
					this.spawnBazookaExplosion(hitPos, proj);
					this.removeProjectile(i);
					continue;
				}
				const damage = this.computeProjectileDamage(proj);
				const isHeadshot = this.isProjectileHeadshot(proj, hitEntity);
				hitEntity.takeDamage(
					damage,
					isHeadshot,
					proj.owner,
					proj.knockback || 0,
					proj.type,
				);
				if (proj.owner && typeof proj.owner.onHit === "function") {
					proj.owner.onHit({
						position: proj.mesh.position.clone(),
						type: proj.type,
						damage,
						headshot: isHeadshot,
					});
				}
				this.spawnImpactEffect(
					this._tmpVecF.copy(proj.mesh.position),
					proj.type,
					true,
					isHeadshot,
				);
				this.removeProjectile(i);
				continue;
			}

			if (proj.travelled >= (proj.maxDistance ?? Infinity)) {
				if (proj.type === "bow") {
					this.spawnImpactEffect(
						this._tmpVecF.copy(proj.mesh.position),
						proj.type,
						false,
					);
				}
				this.removeProjectile(i);
				continue;
			}

			if (
				proj.type === "bow" &&
				proj.velocity &&
				proj.velocity.lengthSq() < 9
			) {
				this.removeProjectile(i);
				continue;
			}

			proj.lifetime -= delta;
			if (proj.lifetime <= 0) {
				this.removeProjectile(i);
			}
		}

		this.updateEffects(delta);
		return this.aliveSurvivorCount;
	}

	computeProjectileDamage(projectile) {
		const base = Math.max(0, projectile?.damage || 0);
		if (base <= 0) return 0;
		const maxDist = Math.max(0.001, projectile?.maxDistance || 1);
		const t = Math.max(0, Math.min(1, (projectile?.travelled || 0) / maxDist));
		const type = projectile?.type;
		let mult = 1;

		if (type === "shotgun") {
			if (t <= 0.25) mult = 1.0;
			else if (t <= 0.65) mult = 1.0 - (t - 0.25) * 1.15;
			else mult = 0.36;
		} else if (type === "flame") {
			mult = 0.92 - t * 0.46;
		} else if (type === "bow") {
			mult = 1.0 - Math.max(0, t - 0.45) * 0.5;
		} else if (type === "pistol") {
			mult = 1.0 - Math.max(0, t - 0.35) * 0.42;
		} else if (type === "rifle") {
			mult = 1.0 - Math.max(0, t - 0.6) * 0.22;
		} else if (type === "laser") {
			mult = 1.0 - Math.max(0, t - 0.65) * 0.16;
		}

		mult = Math.max(0.22, Math.min(1.15, mult));
		return Math.max(1, Math.round(base * mult));
	}

	isProjectileHeadshot(projectile, entity) {
		if (!projectile?.mesh?.position || !entity?.position) return false;
		const h = entity.physics?.height || 1.8;
		const headY = entity.position.y + h * 0.82;
		return projectile.mesh.position.y >= headY;
	}

	rebuildSpatialIndex() {
		// OPTIMIZED: Use Map.clear() and batch lookups to reduce allocations
		this.spatialIndex.clear();
		this.aliveSurvivorsCache.length = 0;
		this.aliveSurvivorCount = 0;
		const cellSize = this.spatialCellSize;
		for (const entity of this.entities) {
			if (!entity?.isAlive || !entity.position) continue;
			if (this.isSurvivorEntity(entity)) {
				this.aliveSurvivorsCache.push(entity);
				this.aliveSurvivorCount++;
			}
			const cx = Math.floor(entity.position.x / cellSize);
			const cz = Math.floor(entity.position.z / cellSize);
			// OPTIMIZED: Use numeric key with bit shifting to avoid string concatenation
			const key = (cx << 16) | (cz & 0xffff);
			let bucket = this.spatialIndex.get(key);
			if (!bucket) {
				bucket = [];
				this.spatialIndex.set(key, bucket);
			}
			bucket.push(entity);
		}
	}

	checkProjectileWallHit(projectile, prevPos, physics) {
		if (!physics.getNearbyColliders) return false;
		const pos = projectile.mesh.position;
		const travel = this._tmpSegDir.subVectors(pos, prevPos);
		const length = travel.length();
		if (length <= 0.001) return false;
		const dir = travel.normalize();
		const probe = this._tmpProbePos
			.copy(prevPos)
			.addScaledVector(dir, length * 0.5);
		const nearby = physics.getNearbyColliders(
			probe,
			Math.max(2.5, length * 0.6 + 0.8),
		);
		for (const box of nearby) {
			if (box.enabled === false) continue;
			if (box.walkable) continue;
			if (this.segmentIntersectsBox(prevPos, pos, box)) {
				return this._tmpVecF.copy(pos);
			}
		}
		return false;
	}

	hasLineOfSight(from, to, ignoreWalkable = true) {
		const physics = this.physicsRef;
		if (!physics?.getNearbyColliders) return true;
		const p0 = this._tmpVecA.copy(from);
		const p1 = this._tmpVecB.copy(to);
		const travel = this._tmpVecC.subVectors(p1, p0);
		const length = travel.length();
		if (length <= 0.001) return true;
		const probe = this._tmpVecE.copy(p0).addScaledVector(travel, 0.5);
		const nearby = physics.getNearbyColliders(
			probe,
			Math.max(2.5, length * 0.5 + 1.0),
		);
		for (const box of nearby) {
			if (box.enabled === false) continue;
			if (ignoreWalkable && box.walkable) continue;
			if (this.segmentIntersectsBox(p0, p1, box)) {
				return false;
			}
		}
		return true;
	}

	segmentIntersectsBox(p0, p1, box) {
		let tmin = 0;
		let tmax = 1;
		const dx = p1.x - p0.x;
		const dy = p1.y - p0.y;
		const dz = p1.z - p0.z;

		const checkAxis = (start, delta, min, max) => {
			if (Math.abs(delta) < 1e-6) {
				return start >= min && start <= max;
			}
			const inv = 1 / delta;
			let t1 = (min - start) * inv;
			let t2 = (max - start) * inv;
			if (t1 > t2) [t1, t2] = [t2, t1];
			tmin = Math.max(tmin, t1);
			tmax = Math.min(tmax, t2);
			return tmin <= tmax;
		};

		if (!checkAxis(p0.x, dx, box.min.x, box.max.x)) return false;
		if (!checkAxis(p0.y, dy, box.min.y, box.max.y)) return false;
		if (!checkAxis(p0.z, dz, box.min.z, box.max.z)) return false;
		return true;
	}

	checkProjectileHit(projectile, prevPos = null, currentPos = null) {
		const p0 = prevPos || projectile.mesh.position;
		const p1 = currentPos || projectile.mesh.position;
		const seg = this._tmpVecA.subVectors(p1, p0);
		const segLenSq = seg.lengthSq();
		const segLen = Math.sqrt(segLenSq);
		const mid = this._tmpVecB.copy(p0).addScaledVector(seg, 0.5);
		const queryRadius = Math.max(2.2, segLen * 0.5 + 2.0);
		const candidates = this.getNearbyEntities(mid, queryRadius);
		for (const entity of candidates) {
			if (!entity.isAlive || entity === projectile.owner) continue;

			const basePos = entity.position;
			const h = entity.physics?.height || 1.8;
			const r = entity.physics?.radius || 0.45;
			const bodyBonus =
				entity.constructor?.name === "Bot"
					? 0.62
					: entity.constructor?.name === "Zombie"
						? 0.74
						: 0.45;
			const hitRadius = r + bodyBonus;

			const hit =
				this.distancePointToSegmentFast(
					basePos.x,
					basePos.y + h * 0.2,
					basePos.z,
					p0,
					p1,
					seg,
					segLenSq,
				) <= hitRadius ||
				this.distancePointToSegmentFast(
					basePos.x,
					basePos.y + h * 0.55,
					basePos.z,
					p0,
					p1,
					seg,
					segLenSq,
				) <= hitRadius ||
				this.distancePointToSegmentFast(
					basePos.x,
					basePos.y + h * 0.9,
					basePos.z,
					p0,
					p1,
					seg,
					segLenSq,
				) <= hitRadius ||
				this.distancePointToSegmentFast(
					basePos.x,
					basePos.y + h * 0.35,
					basePos.z,
					p0,
					p1,
					seg,
					segLenSq,
				) <= hitRadius ||
				this.distancePointToSegmentFast(
					basePos.x,
					basePos.y + h * 0.72,
					basePos.z,
					p0,
					p1,
					seg,
					segLenSq,
				) <= hitRadius;
			if (hit) {
				return entity;
			}
		}
		return null;
	}

	distancePointToSegmentFast(px, py, pz, a, b, ab, abLenSq) {
		if (abLenSq < 1e-6) {
			const dx0 = px - a.x;
			const dy0 = py - a.y;
			const dz0 = pz - a.z;
			return Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0);
		}
		const apx = px - a.x;
		const apy = py - a.y;
		const apz = pz - a.z;
		let t = (apx * ab.x + apy * ab.y + apz * ab.z) / abLenSq;
		if (t < 0) t = 0;
		else if (t > 1) t = 1;
		const cx = a.x + ab.x * t;
		const cy = a.y + ab.y * t;
		const cz = a.z + ab.z * t;
		const dx = px - cx;
		const dy = py - cy;
		const dz = pz - cz;
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}

	distancePointToSegment(point, a, b) {
		const ab = new THREE.Vector3().subVectors(b, a);
		const ap = new THREE.Vector3().subVectors(point, a);
		const abLenSq = ab.lengthSq();
		if (abLenSq < 1e-6) return point.distanceTo(a);
		const t = Math.max(0, Math.min(1, ap.dot(ab) / abLenSq));
		const closest = a.clone().add(ab.multiplyScalar(t));
		return point.distanceTo(closest);
	}

	removeProjectile(index) {
		const proj = this.projectiles[index];
		this.scene.remove(proj.mesh);
		// Projectile geometries/materials are shared and cached by Weapon runtime.
		// Disposing them per-shot causes heavy GC churn and can invalidate
		// materials still in use by other active projectiles.
		if (proj?.mesh?.traverse) {
			proj.mesh.traverse((child) => {
				if (child.isMesh) {
					child.visible = false;
				}
			});
		}
		this.projectiles.splice(index, 1);
	}

	spawnImpactEffect(
		position,
		type = "generic",
		isHit = false,
		isHeadshot = false,
	) {
		const group = new THREE.Group();
		const color =
			type === "laser"
				? 0xfff176
				: type === "flame"
					? 0xff8a65
					: type === "bow"
						? 0xbca27f
						: 0xcfd8dc;
		const geoKey = `sphere_${type === "laser" ? "18" : "12"}`;
		let geo = this._impactGeoCache.get(geoKey);
		if (!geo) {
			geo = new THREE.SphereGeometry(type === "laser" ? 0.18 : 0.12, 8, 8);
			this._impactGeoCache.set(geoKey, geo);
		}
		// Create material per effect (opacity is animated independently per effect)
		// Materials are disposed when effect expires to prevent GPU memory leaks
		const mat = new THREE.MeshStandardMaterial({
			color,
			emissive: isHit ? color : 0x000000,
			emissiveIntensity: isHit ? 0.6 : 0.0,
			roughness: 0.5,
			transparent: true,
			opacity: 0.9,
		});
		const puff = new THREE.Mesh(geo, mat);
		group.add(puff);
		if (isHeadshot) {
			let crownGeo = this._impactGeoCache.get("crown");
			if (!crownGeo) {
				crownGeo = new THREE.SphereGeometry(0.08, 6, 6);
				this._impactGeoCache.set("crown", crownGeo);
			}
			// Crown material is shared (no per-instance opacity animation on it)
			let crownMat = this._impactGeoCache.get("crownMat");
			if (!crownMat) {
				crownMat = new THREE.MeshBasicMaterial({
					color: 0xffeb3b,
					transparent: true,
					opacity: 0.9,
				});
				this._impactGeoCache.set("crownMat", crownMat);
			}
			const crown = new THREE.Mesh(crownGeo, crownMat);
			crown.position.y = 0.18;
			group.add(crown);
		}
		group.position.copy(position);
		group.userData.effect = true;
		group.userData.life = type === "flame" ? 0.3 : isHeadshot ? 0.55 : 0.45;
		this.scene.add(group);
		this.effects.push(group);
	}

	updateEffects(delta) {
		for (let i = this.effects.length - 1; i >= 0; i--) {
			const fx = this.effects[i];
			fx.userData.life -= delta;
			fx.scale.addScalar(delta * 1.8);
			fx.traverse((child) => {
				if (child.material) {
					child.material.opacity = Math.max(0, fx.userData.life * 2);
				}
			});
			if (fx.userData.life <= 0) {
				this.scene.remove(fx);
				// Dispose non-cached materials to prevent GPU memory leaks
				fx.traverse((child) => {
					if (child.isMesh && child.material) {
						// Only dispose materials not in our geometry cache
						// Crown material is shared and cached — don't dispose it
						if (child.material !== this._impactGeoCache.get("crownMat")) {
							child.material.dispose();
						}
					}
				});
				fx.clear();
				this.effects.splice(i, 1);
			}
		}
	}

	spawnBazookaExplosion(position, projectile) {
		const radius = 6;
		const damage = Math.round((projectile?.damage || 100) * 0.8);
		const knockback = projectile?.knockback || 12;

		// Visual explosion effect - multiple expanding spheres
		const explosionGroup = new THREE.Group();
		const explosionGeo = new THREE.SphereGeometry(0.3, 16, 16);
		const explosionMat = new THREE.MeshBasicMaterial({
			color: 0xff6600,
			transparent: true,
			opacity: 0.9,
		});
		const fireGeo = new THREE.SphereGeometry(0.5, 12, 12);
		const fireMat = new THREE.MeshBasicMaterial({
			color: 0xffaa00,
			transparent: true,
			opacity: 0.7,
		});
		const smokeGeo = new THREE.SphereGeometry(0.4, 8, 8);
		const smokeMat = new THREE.MeshBasicMaterial({
			color: 0x444444,
			transparent: true,
			opacity: 0.5,
		});

		const puff1 = new THREE.Mesh(explosionGeo, explosionMat);
		puff1.scale.setScalar(0.5);
		explosionGroup.add(puff1);

		const puff2 = new THREE.Mesh(fireGeo, fireMat);
		puff2.scale.setScalar(0.8);
		explosionGroup.add(puff2);

		const puff3 = new THREE.Mesh(smokeGeo, smokeMat);
		puff3.scale.setScalar(1);
		explosionGroup.add(puff3);

		explosionGroup.position.copy(position);
		explosionGroup.userData = { life: 1.2, scaleRate: 2.5 };
		this.scene.add(explosionGroup);
		this.effects.push(explosionGroup);

		// Damage nearby entities
		const targets = this.getNearbyEntities(position, radius);
		for (const ent of targets) {
			if (!ent?.isAlive) continue;
			const dx = ent.position.x - position.x;
			const dy = (ent.position.y || 0) - position.y;
			const dz = ent.position.z - position.z;
			const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
			if (dist > radius) continue;
			const t = 1 - dist / radius;
			const dmg = Math.round(damage * (0.3 + t * 0.7));
			ent.takeDamage(
				dmg,
				false,
				projectile?.owner || null,
				knockback * t,
				"bazooka",
			);
			if (ent.physics?.velocity) {
				ent.physics.velocity.x += (dx / dist) * knockback * t;
				ent.physics.velocity.z += (dz / dist) * knockback * t;
				ent.physics.velocity.y += 2.4 * t;
			}
		}

		// Create crater zone
		const mapGen = this.mapGenerator;
		if (mapGen?.addCraterSlowZone) {
			mapGen.addCraterSlowZone(position.x, position.z, 3.5, 0.4, 40);
		}

		// Play explosion sound
		const audioSynth = this.audioSynth;
		if (audioSynth?.playExplosion) {
			audioSynth.playExplosion(position);
		}
	}

	getNearestEnemy(position, maxDistance = Infinity) {
		let nearest = null;
		let minDistanceSq = maxDistance * maxDistance;

		for (const entity of this.entities) {
			if (!entity.isAlive) continue;

			const dx = entity.position.x - position.x;
			const dy = entity.position.y - position.y;
			const dz = entity.position.z - position.z;
			const distanceSq = dx * dx + dy * dy + dz * dz;
			const distance = Math.sqrt(distanceSq);
			const radius = entity.physics?.radius || 0.4;
			const effective = Math.max(0, distance - radius * 0.6);
			const effectiveSq = effective * effective;
			if (effectiveSq < minDistanceSq && distance > 0.1) {
				minDistanceSq = effectiveSq;
				nearest = entity;
			}
		}

		return nearest;
	}

	getAliveCount() {
		return this.aliveSurvivorCount;
	}

	getAliveSurvivors() {
		return this.aliveSurvivorsCache;
	}

	getEntityById(id) {
		return this.entities.find((e) => e.id === id);
	}

	getEntities() {
		return this.entities;
	}

	getAllEntities() {
		return this.entities;
	}

	getNearbyEntities(position, radius, onlyType = null) {
		const out = this._nearbyOut || (this._nearbyOut = []);
		out.length = 0;
		const r2 = radius * radius;
		const cellSize = this.spatialCellSize;
		const minCx = Math.floor((position.x - radius) / cellSize);
		const maxCx = Math.floor((position.x + radius) / cellSize);
		const minCz = Math.floor((position.z - radius) / cellSize);
		const maxCz = Math.floor((position.z + radius) / cellSize);
		let stamp = this._nearbyQueryStamp++;
		if (stamp >= 0x3fffffff) {
			this._nearbyQueryStamp = 1;
			stamp = 1;
		}

		for (let cx = minCx; cx <= maxCx; cx++) {
			for (let cz = minCz; cz <= maxCz; cz++) {
				// OPTIMIZED: Use numeric key with bit shifting
				const key = (cx << 16) | (cz & 0xffff);
				const bucket = this.spatialIndex.get(key);
				if (!bucket) continue;
				for (const entity of bucket) {
					if (!entity?.isAlive) continue;
					if (onlyType && entity.constructor?.name !== onlyType) continue;
					if (entity._nearbyStamp === stamp) continue;
					const dx = entity.position.x - position.x;
					const dz = entity.position.z - position.z;
					if (dx * dx + dz * dz <= r2) {
						out.push(entity);
						entity._nearbyStamp = stamp;
					}
				}
			}
		}
		return out;
	}
}
