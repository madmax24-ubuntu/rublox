// Instrumented trace: House L climb, first frames
// Run: node tests/stair-trace3.test.js
import "./_mocks_preamble.js";
import { MapGenerator } from "../world/MapGenerator.js";
import { Physics } from "../world/Physics.js";
import * as THREE from "../node_modules/three/build/three.module.js";

const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.7;
const PLAYER_SPEED = 13.6;

class FakePlayer {
	constructor() {
		this.type = "Player";
		this.position = new THREE.Vector3();
		this.physics = {
			velocity: new THREE.Vector3(),
			onGround: false,
			wasOnGround: false,
			fallStartY: 0,
			height: PLAYER_HEIGHT,
			radius: PLAYER_RADIUS,
			speed: PLAYER_SPEED,
		};
		this.isFrozen = false;
		this.isInvulnerable = true;
		this.takeDamage = () => {};
		this.applyBurn = () => {};
		this.applySlow = () => {};
	}
}

function steer(entity, tx, tz, speed = PLAYER_SPEED) {
	const dx = tx - entity.position.x;
	const dz = tz - entity.position.z;
	const d = Math.hypot(dx, dz);
	if (d < 1e-6) { entity.physics.velocity.x = 0; entity.physics.velocity.z = 0; return 0; }
	entity.physics.velocity.x = (dx / d) * speed;
	entity.physics.velocity.z = (dz / d) * speed;
	return d;
}

const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
const physics = new Physics(scene, mapGen);

const idOf = new Map();
mapGen.colliders.forEach((c, i) => idOf.set(c, i));
const nameOf = (c) => {
	const i = idOf.get(c);
	if (c.isTowerStair) return `T${i}`;
	if (c.isBiomeResidence) return `R${i}`;
	if (c.isTerrain) return `TERR${i}`;
	return `${c.walkable ? "W" : "N"}${i}`;
};

const log = [];
const origContains = physics._containsWalkableSurface.bind(physics);
const containsLog = [];
physics._containsWalkableSurface = (box, x, z, radius) => {
	const r = origContains(box, x, z, radius);
	containsLog.push({ box, radius, r });
	return r;
};
const origSurface = physics._getSurfaceHeight.bind(physics);
physics._getSurfaceHeight = (position, height) => {
	containsLog.length = 0;
	const y = origSurface(position, height);
	for (const e of containsLog) {
		if (e.r) log.push(`    surf: ${nameOf(e.box)} top=${e.box.max.y.toFixed(2)} contains(r=${e.radius})`);
	}
	log.push(`  surfQuery -> ${y === -Infinity ? "none(0)" : y.toFixed(4)}`);
	return y === -Infinity ? 0 : y;
};
const origResolve = physics.resolveCollisions.bind(physics);
physics.resolveCollisions = (entity) => {
	containsLog.length = 0;
	origResolve(entity);
	for (const e of containsLog) {
		if (e.r) log.push(`    resolve: ${nameOf(e.box)} top=${e.box.max.y.toFixed(2)} contains(r=${e.radius})`);
	}
};

const b = mapGen._buildings.find((b2) => b2.template?.type === "biome_residence" && b2.template.biome === "forest" && b2.x < 0 && b2.z < 0);
const cols = mapGen.colliders.filter((c) => {
	if (!c.isBiomeResidence || !c.walkable || c.max.y <= 0.3 || c.max.y - c.min.y >= 1.2) return false;
	const cx = (c.min.x + c.max.x) / 2, cz = (c.min.z + c.max.z) / 2;
	return Math.abs(cx - b.x) <= b.w / 2 + 0.3 && Math.abs(cz - b.z) <= b.d / 2 + 0.3;
});
const left = cols.filter((c) => (c.min.x + c.max.x) / 2 - b.x < 0).sort((a, b2) => a.max.y - b2.max.y);
const stepList = left.filter((c) => c.surfaceOBB).map((c) => ({ x: (c.min.x + c.max.x) / 2, z: (c.min.z + c.max.z) / 2, top: c.max.y }));
const s0 = left[0];
const start = { x: (s0.min.x + s0.max.x) / 2, y: 0.14 + PLAYER_HEIGHT, z: s0.min.z + 0.3 };

const player = new FakePlayer();
player.position.set(start.x, start.y, start.z);
physics.addEntity(player);

console.log(`House ${b.template.biome}@(${b.x},${b.z}), L-stairs=${stepList.length}, start=(${start.x.toFixed(2)}, ${start.y.toFixed(2)}, ${start.z.toFixed(2)})`);

let progress = 0;
physics.update(1 / 60);
log.push(`frame0: pos=(${player.position.x.toFixed(3)}, ${player.position.y.toFixed(3)}, ${player.position.z.toFixed(3)}) bottom=${(player.position.y - 1.7).toFixed(3)} onGround=${player.physics.onGround} vy=${player.physics.velocity.y.toFixed(3)}`);

for (let f = 1; f <= 20; f++) {
	const bottom = player.position.y - PLAYER_HEIGHT;
	while (progress + 1 < stepList.length && bottom >= stepList[progress + 1].top - 0.05) progress++;
	const target = stepList[progress];
	steer(player, target.x, target.z);
	log.push(`frame${f}: target=step${progress}(${target.x.toFixed(2)},${target.z.toFixed(2)},top=${target.top.toFixed(2)}) vel=(${player.physics.velocity.x.toFixed(2)},${player.physics.velocity.z.toFixed(2)})`);
	physics.update(1 / 60);
	const b2 = player.position.y - 1.7;
	log.push(`  after: pos=(${player.position.x.toFixed(3)}, ${player.position.y.toFixed(3)}, ${player.position.z.toFixed(3)}) bottom=${b2.toFixed(3)} onGround=${player.physics.onGround} vy=${player.physics.velocity.y.toFixed(3)}`);
}
console.log(log.join("\n"));
process.exit(0);
