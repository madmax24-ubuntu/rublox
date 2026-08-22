// Instrumented trace: tower spiral climb around the failure point
// Run: node tests/tower-trace.test.js
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
	if (c.isTowerStair) return `S${i}`;
	if (c.isTowerStructure) return `T${i}`;
	if (c.isTerrain) return `TERR${i}`;
	return `${c.walkable ? "W" : "N"}${i}`;
};

const ilogs = [];
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
	for (const e of containsLog) if (e.r) ilogs.push(`    surf: ${nameOf(e.box)} top=${e.box.max.y.toFixed(2)} (r=${e.radius})`);
	ilogs.push(`  surfQuery -> ${y === -Infinity ? "none(0)" : y.toFixed(4)}`);
	return y === -Infinity ? 0 : y;
};
const origResolve = physics.resolveCollisions.bind(physics);
physics.resolveCollisions = (entity) => {
	containsLog.length = 0;
	const yBefore = entity.position.y;
	origResolve(entity);
	for (const e of containsLog) if (e.r) ilogs.push(`    resolve: ${nameOf(e.box)} top=${e.box.max.y.toFixed(2)} (r=${e.radius})`);
	if (Math.abs(entity.position.y - yBefore) > 0.001) ilogs.push(`  resolve: SNAP y ${yBefore.toFixed(3)} -> ${entity.position.y.toFixed(3)}`);
};

const tower = mapGen._buildings.find((b) => b.template?.type === "maze_tower");
const stairs = mapGen.colliders
	.filter((c) => c.isTowerStair)
	.sort((a, b) => (a.max.y - b.max.y) || (a.surfaceOBB.z - b.surfaceOBB.z));
const stepList = stairs.map((c) => ({ x: c.surfaceOBB.x, z: c.surfaceOBB.z, top: c.max.y }));
const start = { x: stepList[0].x, y: 0.12 + PLAYER_HEIGHT, z: stepList[0].z };

const player = new FakePlayer();
player.position.set(start.x, start.y, start.z);
physics.addEntity(player);

const maxFrames = 520;
let progress = 0;
const framesLog = [];
for (let f = 0; f < maxFrames; f++) {
	const bottom = player.position.y - PLAYER_HEIGHT;
	while (progress + 1 < stepList.length && bottom >= stepList[progress + 1].top - 0.05) progress++;
	const cur = stepList[progress];
	const steerStep = stepList[Math.min(progress + 1, stepList.length - 1)];
	steer(player, steerStep.x, steerStep.z);
	ilogs.push(`frame${f}: prog=${progress} target=step${Math.min(progress + 1, stepList.length - 1)} pos=(${player.position.x.toFixed(2)},${player.position.y.toFixed(2)},${player.position.z.toFixed(2)}) bottom=${bottom.toFixed(3)}`);
	physics.update(1 / 60);
	const b2 = player.position.y - PLAYER_HEIGHT;
	framesLog.push({ f, x: player.position.x, y: player.position.y, z: player.position.z, bottom: b2, onGround: player.physics.onGround, vy: player.physics.velocity.y, prog: progress });
	if (b2 < cur.top - 0.3 && f > 8) {
		ilogs.push(`  FAIL: fell below step top (bottom=${b2.toFixed(2)} < top=${cur.top.toFixed(2)}-0.3) at frame ${f}`);
		break;
	}
}

// Print compact per-frame summary (every 10th) + full detail of last 25 frames
const detailFrom = Math.max(0, framesLog.length - 25);
console.log("── compact (every 10 frames) ──");
for (let i = 0; i < framesLog.length; i += 10) {
	const e = framesLog[i];
	console.log(`f=${e.f} prog=${e.prog} (${e.x.toFixed(1)},${e.y.toFixed(1)},${e.z.toFixed(1)}) bot=${e.bottom.toFixed(2)} g=${e.onGround} vy=${e.vy.toFixed(2)}`);
}
console.log("── detail (last frames) ──");
for (let i = detailFrom; i < framesLog.length; i++) {
	const e = framesLog[i];
	console.log(`f=${e.f} prog=${e.prog} (${e.x.toFixed(2)},${e.y.toFixed(2)},${e.z.toFixed(2)}) bot=${e.bottom.toFixed(3)} g=${e.onGround} vy=${e.vy.toFixed(3)}`);
}
// full instrumented log for the last 25 frames
const full = ilogs;
let keep = [];
let started = false;
for (const line of full) {
	const m = line.match(/^frame(\d+):/);
	if (m) started = +m[1] >= detailFrom;
	if (started) keep.push(line);
}
console.log("── instrumented (last frames) ──");
console.log(keep.join("\n"));
process.exit(0);
