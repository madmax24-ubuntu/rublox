// Stair fall-through test: tower spiral + house stairs (biome_residence)
// Run: node tests/stair-climb.test.js
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

// Climb sim: target = the step the player is currently on (advances as the player climbs)
// Climb sim: progress tracks the step the player is actually on (by bottom height);
// steering always aims one step ahead so the player keeps moving along the staircase.
function simulateClimb(physics, start, steps, opts = {}) {
	const { speed = PLAYER_SPEED, maxFrames = 6000, arriveDist = 0.55, fallTol = 0.35, airLimit = 45 } = opts;
	const player = new FakePlayer();
	player.position.set(start.x, start.y, start.z);
	physics.addEntity(player);
	physics.update(1 / 60);
	let failStep = -1, failReason = "", airFrames = 0, stuckFrames = 0;
	let lastX = player.position.x, lastZ = player.position.z;
	let progress = 0;
	let frames = 0;
	for (let f = 0; f < maxFrames; f++) {
		frames++;
		const bottom = player.position.y - PLAYER_HEIGHT;
		while (progress + 1 < steps.length && bottom >= steps[progress + 1].top - 0.05) progress++;
		const cur = steps[progress];
		const steerStep = steps[Math.min(progress + 1, steps.length - 1)];
		steer(player, steerStep.x, steerStep.z, speed);
		physics.update(1 / 60);
		const b2 = player.position.y - PLAYER_HEIGHT;
		if (player.physics.onGround) { airFrames = 0; stuckFrames = 0; }
		else {
			airFrames++;
			if (Math.hypot(player.position.x - lastX, player.position.z - lastZ) < 0.02) stuckFrames++;
			if (airFrames > airLimit) {
				failStep = f;
				failReason = `airborne ${airFrames} frames (no surface) at frame ${f}, pos=(${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)})`;
				break;
			}
			if (stuckFrames > 60) {
				failStep = f;
				failReason = `stuck ${stuckFrames} frames (airborne, not moving) at frame ${f}, pos=(${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)})`;
				break;
			}
		}
		lastX = player.position.x; lastZ = player.position.z;
		if (b2 < cur.top - fallTol && f > 8) {
			failStep = f;
			failReason = `fell below step top (bottom=${b2.toFixed(2)} < top=${cur.top.toFixed(2)}-${fallTol}) at frame ${f}`;
			break;
		}
		if (
			progress >= steps.length - 1 &&
			player.physics.onGround &&
			Math.hypot(player.position.x - cur.x, player.position.z - cur.z) < arriveDist
		) {
			break;
		}
	}
	physics.removeEntity(player);
	const reached = player.position.y - PLAYER_HEIGHT >= (steps[steps.length - 1].top - fallTol);
	return { ok: failStep < 0 && reached, failStep, failReason, frames, endY: player.position.y, endX: player.position.x, endZ: player.position.z };
}

const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
console.log("Generating map...");
const t0 = Date.now();
await mapGen.startGeneration();
console.log(`Map generated in ${((Date.now() - t0) / 1000).toFixed(1)}s, colliders=${mapGen.colliders.length}`);
const physics = new Physics(scene, mapGen);
let failures = 0;

// ═══════════════ 1. TOWER SPIRAL STAIRCASE ═══════════════
console.log("\n════════ TOWER SPIRAL STAIRCASE ════════");
const tower = mapGen._buildings.find((b) => b.template?.type === "maze_tower");
if (!tower) { console.log("No maze_tower found!"); failures++; }
else {
	const stairs = mapGen.colliders
		.filter((c) => c.isTowerStair)
		.sort((a, b) => (a.max.y - b.max.y) || (a.surfaceOBB.z - b.surfaceOBB.z));
	console.log(`Tower at (${tower.x.toFixed(1)}, ${tower.z.toFixed(1)}), stair colliders: ${stairs.length}`);
	const stepList = stairs.map((c) => ({ x: c.surfaceOBB.x, z: c.surfaceOBB.z, top: c.max.y }));
	const start = { x: stepList[0].x, y: 0.12 + PLAYER_HEIGHT, z: stepList[0].z };
	const res = simulateClimb(physics, start, stepList, { maxFrames: 12000, fallTol: 0.3, airLimit: 60 });
	console.log(`  Climb sim: ${res.ok ? "OK" : "FAIL"} frames=${res.frames} endY=${res.endY.toFixed(2)}${res.failReason ? " | " + res.failReason : ""}`);
	if (!res.ok) failures++;
}

// ═══════════════ 2. HOUSE STAIRS (biome_residence) ═══════════════
console.log("\n════════ HOUSE STAIRS (biome_residence) ════════");
const residences = mapGen._buildings.filter((b) => b.template?.type === "biome_residence");
console.log(`Residences: ${residences.length}`);
for (const b of residences) {
	const tag = `${b.template.biome}@(${b.x},${b.z})`;
	const cols = mapGen.colliders.filter((c) => {
		if (!c.isBiomeResidence || !c.walkable || c.max.y <= 0.3 || c.max.y - c.min.y >= 1.2) return false;
		const cx = (c.min.x + c.max.x) / 2, cz = (c.min.z + c.max.z) / 2;
		return Math.abs(cx - b.x) <= b.w / 2 + 0.3 && Math.abs(cz - b.z) <= b.d / 2 + 0.3;
	});
	const left = cols.filter((c) => (c.min.x + c.max.x) / 2 - b.x < 0).sort((a, b2) => a.max.y - b2.max.y);
	const right = cols.filter((c) => (c.min.x + c.max.x) / 2 - b.x > 0).sort((a, b2) => a.max.y - b2.max.y);
	const leftStairs = left.filter((c) => c.surfaceOBB);
	const rightStairs = right.filter((c) => c.surfaceOBB);
	console.log(`  [${tag}] L steps=${leftStairs.length} R steps=${rightStairs.length}`);
	if (leftStairs.length) {
		const stepList = leftStairs.map((c) => ({ x: (c.min.x + c.max.x) / 2, z: (c.min.z + c.max.z) / 2, top: c.max.y }));
		const s0 = left[0];
		const start = { x: (s0.min.x + s0.max.x) / 2, y: 0.14 + PLAYER_HEIGHT, z: s0.min.z + 0.3 };
		const res = simulateClimb(physics, start, stepList, { maxFrames: 3000, fallTol: 0.3, airLimit: 45 });
		console.log(`  [${tag}] climb L: ${res.ok ? "OK" : "FAIL"} frames=${res.frames} endY=${res.endY.toFixed(2)}${res.failReason ? " | " + res.failReason : ""}`);
		if (!res.ok) failures++;
	}
	if (rightStairs.length) {
		const stepList = rightStairs.map((c) => ({ x: (c.min.x + c.max.x) / 2, z: (c.min.z + c.max.z) / 2, top: c.max.y }));
		const s0 = right[0];
		const start = { x: (s0.min.x + s0.max.x) / 2, y: s0.max.y - 0.15 + PLAYER_HEIGHT, z: s0.min.z + 0.3 };
		const res = simulateClimb(physics, start, stepList, { maxFrames: 3000, fallTol: 0.3, airLimit: 45 });
		console.log(`  [${tag}] climb R: ${res.ok ? "OK" : "FAIL"} frames=${res.frames} endY=${res.endY.toFixed(2)}${res.failReason ? " | " + res.failReason : ""}`);
		if (!res.ok) failures++;
	}
}
console.log(`\nDone. failures=${failures}`);
process.exit(failures ? 1 : 0);
