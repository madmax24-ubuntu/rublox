// Stair fall-through diagnostic: tower spiral + house stairs
// Run: node tests/stair-fallthrough.test.js

class MockAudioContext {
	constructor() { this.sampleRate = 48000; this.currentTime = 0; }
	createGain() { const g = { gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }; g.connect = () => g; return g; }
	createBiquadFilter() { const f = { type: "lowpass", frequency: { value: 8000, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, Q: { value: 0.8 } }; f.connect = () => f; return f; }
	createOscillator() { const o = { type: "sine", frequency: { value: 440, setValueAtTime: () => {} } }; o.connect = () => o; o.start = () => {}; o.stop = () => {}; return o; }
	createBufferSource() { const s = { buffer: null, start: () => {}, stop: () => {} }; s.connect = () => s; return s; }
	createPanner() { const p = { panningModel: "equalpower", distanceModel: "inverse", refDistance: 1, maxDistance: 100, rolloffFactor: 1, positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 } }; p.connect = () => p; return p; }
	createConvolver() { const c = { buffer: null }; c.connect = () => c; return c; }
	createDynamicsCompressor() { const c = { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 1 }, attack: { value: 0 }, release: { value: 0 } }; c.connect = () => c; return c; }
	createBuffer(channels, length, rate) { const b = { numberOfChannels: channels, length, sampleRate: rate }; b.getChannelData = (_i) => new Float32Array(length); return b; }
	destination = { connect: () => {} };
}
globalThis.window = globalThis.window || {};
globalThis.window.AudioContext = MockAudioContext;
globalThis.window.webkitAudioContext = MockAudioContext;
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.AudioContext = MockAudioContext;
globalThis.webkitAudioContext = MockAudioContext;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

// --- Canvas 2D mock (Zombie.js stalker textures, MapGenerator textures) ---
const _noOp = () => {};
function makeCtx2D() {
	const grad = { addColorStop: _noOp };
	return {
		fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, font: "",
		textAlign: "left", textBaseline: "alphabetic", lineCap: "butt", lineJoin: "miter",
		shadowColor: "", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
		imageSmoothingEnabled: true,
		save: _noOp, restore: _noOp, translate: _noOp, rotate: _noOp, scale: _noOp,
		transform: _noOp, setTransform: _noOp, beginPath: _noOp, closePath: _noOp,
		moveTo: _noOp, lineTo: _noOp, arc: _noOp, arcTo: _noOp, ellipse: _noOp,
		rect: _noOp, quadraticCurveTo: _noOp, bezierCurveTo: _noOp,
		fill: _noOp, stroke: _noOp, fillRect: _noOp, strokeRect: _noOp, clearRect: _noOp,
		clip: _noOp, drawImage: _noOp, fillText: _noOp, strokeText: _noOp,
		measureText: () => ({ width: 0 }),
		createLinearGradient: () => grad, createRadialGradient: () => grad,
		createPattern: () => ({}),
		getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
		putImageData: _noOp,
	};
}
function makeCanvas() {
	const c = { width: 0, height: 0, toDataURL: () => "", style: {} };
	c.getContext = () => makeCtx2D();
	return c;
}
globalThis.document = {
	createElement: (tag) => (tag === "canvas" ? makeCanvas() : { style: {}, addEventListener: _noOp, removeEventListener: _noOp }),
	createTextNode: (t) => ({ textContent: t }),
	querySelector: () => null,
	querySelectorAll: () => [],
	addEventListener: _noOp,
	removeEventListener: _noOp,
	body: { style: {}, appendChild: _noOp, removeChild: _noOp },
};

import { MapGenerator } from "../world/MapGenerator.js";
import { Physics } from "../world/Physics.js";
import * as THREE from "../node_modules/three/build/three.module.js";

const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.7;
const PLAYER_SPEED = 13.6;

// --- SAT overlap for two rotated rectangles in XZ plane ---
// rect: { x, z, hw, hd, rot } — hw along local X, hd along local Z, rot = rotation.y
function rectOverlap(rA, rB) {
	const axes = [];
	for (const r of [rA, rB]) {
		axes.push([Math.cos(r.rot), -Math.sin(r.rot)]);
		axes.push([Math.sin(r.rot), Math.cos(r.rot)]);
	}
	const dx = rB.x - rA.x;
	const dz = rB.z - rA.z;
	let minOverlap = Infinity;
	for (const [ax, az] of axes) {
		const projA = rA.hw * Math.abs(ax * Math.cos(rA.rot) - az * Math.sin(rA.rot)) +
			rA.hd * Math.abs(ax * Math.sin(rA.rot) + az * Math.cos(rA.rot));
		const projB = rB.hw * Math.abs(ax * Math.cos(rB.rot) - az * Math.sin(rB.rot)) +
			rB.hd * Math.abs(ax * Math.sin(rB.rot) + az * Math.cos(rB.rot));
		const centerDist = dx * ax + dz * az;
		const overlap = projA + projB - Math.abs(centerDist);
		if (overlap < minOverlap) minOverlap = overlap;
		if (overlap <= 0) return 0;
	}
	return minOverlap;
}

// Effective walkable rect as seen by Physics._containsWalkableSurface (radius 0.6 surface query)
function effectiveRect(obb, radius) {
	const clearance = radius * 0.08;
	return {
		x: obb.x, z: obb.z,
		hw: Math.max(0.02, obb.halfWidth - clearance),
		hd: Math.max(0.02, obb.halfDepth - clearance),
		rot: obb.rotation,
	};
}

function aabbOverlap(minA, maxA, minB, maxB, clearA, clearB) {
	const ox = Math.min(maxA.x - clearA, maxB.x - clearB) - Math.max(minA.x + clearA, minB.x + clearB);
	const oz = Math.min(maxA.z - clearA, maxB.z - clearB) - Math.max(minA.z + clearA, minB.z + clearB);
	if (ox <= 0 || oz <= 0) return 0;
	return Math.min(ox, oz);
}

// --- Fake player entity for Physics ---
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

// --- Simulate climbing; returns { ok, failStep, failReason, frames, trace } ---
function simulateClimb(physics, start, steps, opts = {}) {
	const { speed = PLAYER_SPEED, maxFrames = 4000, arriveDist = 0.55, fallTol = 0.35 } = opts;
	const player = new FakePlayer();
	player.position.set(start.x, start.y, start.z);
	physics.addEntity(player);
	physics.update(1 / 60);
	let failStep = -1, failReason = "", airFrames = 0, stuckFrames = 0;
	let lastX = player.position.x, lastZ = player.position.z;
	const trace = [];
	for (let f = 0; f < maxFrames; f++) {
		const step = steps[f < steps.length ? f : steps.length - 1];
		steer(player, step.x, step.z, speed);
		physics.update(1 / 60);
		const bottom = player.position.y - PLAYER_HEIGHT;
		const top = step.top;
		trace.push({ f, x: player.position.x, y: player.position.y, z: player.position.z, onGround: player.physics.onGround });
		if (player.physics.onGround) { airFrames = 0; stuckFrames = 0; }
		else {
			airFrames++;
			if (Math.hypot(player.position.x - lastX, player.position.z - lastZ) < 0.02) stuckFrames++;
		}
		lastX = player.position.x; lastZ = player.position.z;
		// fell below the step we are climbing to
		if (bottom < top - fallTol && f > 5) {
			failStep = f; failReason = `fell below step top (bottom=${bottom.toFixed(2)} < top=${top.toFixed(2)}-${fallTol}) at frame ${f}`;
			break;
		}
		if (airFrames > 30) { failStep = f; failReason = `airborne ${airFrames} frames (no surface) at frame ${f}, pos=(${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)})`; break; }
		if (stuckFrames > 90) { failStep = f; failReason = `stuck ${stuckFrames} frames at frame ${f}, pos=(${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)})`; break; }
		if (f >= steps.length - 1 && player.physics.onGround && Math.hypot(player.position.x - step.x, player.position.z - step.z) < arriveDist) {
			break;
		}
	}
	physics.removeEntity(player);
	const reached = player.position.y - PLAYER_HEIGHT >= (steps[steps.length - 1].top - fallTol);
	return { ok: failStep < 0 && reached, failStep, failReason, frames: trace.length, trace, endY: player.position.y };
}

const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
console.log("Generating map...");
const t0 = Date.now();
await mapGen.startGeneration();
console.log(`Map generated in ${((Date.now() - t0) / 1000).toFixed(1)}s, colliders=${mapGen.colliders.length}`);
const physics = new Physics(scene, mapGen);

// ═══════════════ 1. TOWER SPIRAL STAIRCASE ═══════════════
console.log("\n════════ TOWER SPIRAL STAIRCASE ════════");
const tower = mapGen._buildings.find((b) => b.template?.type === "maze_tower");
if (!tower) { console.log("No maze_tower found!"); }
else {
	const stairs = mapGen.colliders.filter((c) => c.isTowerStair);
	console.log(`Tower at (${tower.x.toFixed(1)}, ${tower.z.toFixed(1)}), stair colliders: ${stairs.length}`);
	const sorted = stairs.sort((a, b) => {
		const aa = Math.atan2(a.surfaceOBB.z - tower.z, a.surfaceOBB.x - tower.x);
		const bb = Math.atan2(b.surfaceOBB.z - tower.z, b.surfaceOBB.x - tower.x);
		return (a.max.y - b.max.y) || (aa - bb);
	});
	// gap analysis (effective rects, surface-query radius 0.6)
	let gaps = 0, tight = 0;
	for (let i = 0; i < sorted.length - 1; i++) {
		const ov = rectOverlap(effectiveRect(sorted[i].surfaceOBB, 0.6), effectiveRect(sorted[i + 1].surfaceOBB, 0.6));
		const ovCol = rectOverlap(effectiveRect(sorted[i].surfaceOBB, PLAYER_RADIUS), effectiveRect(sorted[i + 1].surfaceOBB, PLAYER_RADIUS));
		if (ov <= 0) {
			gaps++;
			console.log(`  GAP  step ${i}→${i + 1}: surface-ov=${ov.toFixed(3)} col-ov=${ovCol.toFixed(3)} @(${sorted[i].surfaceOBB.x.toFixed(1)},${sorted[i].surfaceOBB.z.toFixed(1)}) top=${sorted[i].max.y.toFixed(2)}`);
		} else if (ov < 0.12) {
			tight++;
			console.log(`  TIGHT step ${i}→${i + 1}: surface-ov=${ov.toFixed(3)} col-ov=${ovCol.toFixed(3)} @(${sorted[i].surfaceOBB.x.toFixed(1)},${sorted[i].surfaceOBB.z.toFixed(1)}) top=${sorted[i].max.y.toFixed(2)}`);
		}
	}
	console.log(`  gaps=${gaps} tight(<0.12)=${tight} of ${sorted.length - 1} consecutive pairs`);

	// climb simulation: walk along step centers
	const stepList = sorted.map((c) => ({ x: c.surfaceOBB.x, z: c.surfaceOBB.z, top: c.max.y }));
	const floorTop = 0.12;
	const start = { x: stepList[0].x, y: floorTop + PLAYER_HEIGHT, z: stepList[0].z };
	const res = simulateClimb(physics, start, stepList, { maxFrames: 6000 });
	console.log(`  Climb sim: ${res.ok ? "OK" : "FAIL"} frames=${res.frames} endY=${res.endY.toFixed(2)}${res.failReason ? " | " + res.failReason : ""}`);
	if (!res.ok) {
		const ft = res.trace[res.failStep] || res.trace[res.trace.length - 1];
		console.log(`  fail @ frame ${res.failStep}: (${ft.x.toFixed(2)}, ${ft.y.toFixed(2)}, ${ft.z.toFixed(2)}) onGround=${ft.onGround}`);
	}
}

// ═══════════════ 2. HOUSE STAIRS (biome_residence) ═══════════════
console.log("\n════════ HOUSE STAIRS (biome_residence) ════════");
const residences = mapGen._buildings.filter((b) => b.template?.type === "biome_residence");
console.log(`Residences: ${residences.length}`);
for (const b of residences) {
	const tag = `${b.template.biome}@(${b.x},${b.z})`;
	const cols = mapGen.colliders.filter((c) => c.isBiomeResidence && c.walkable && c.max.y > 0.3 && c.max.y - c.min.y < 1.2);
	// group into staircases by X relative to house center
	const rel = cols.map((c) => ({ c, cx: (c.min.x + c.max.x) / 2 - b.x, cz: (c.min.z + c.max.z) / 2 - b.z }));
	const left = rel.filter((r) => r.cx < 0).sort((a, b2) => a.c.max.y - b2.c.max.y);
	const right = rel.filter((r) => r.cx > 0).sort((a, b2) => a.c.max.y - b2.c.max.y);
	for (const [name, group] of [["L(ground→2f)", left], ["R(2f→roof)", right]]) {
		if (!group.length) continue;
		let gaps = 0, tight = 0;
		for (let i = 0; i < group.length - 1; i++) {
			const A = group[i].c, B = group[i + 1].c;
			const ov = aabbOverlap(A.min, A.max, B.min, B.max, 0.6 * 0.08, 0.6 * 0.08);
			if (ov <= 0) { gaps++; console.log(`  [${tag}] ${name} GAP step ${i}→${i + 1}: top=${A.max.y.toFixed(2)}→${B.max.y.toFixed(2)} @(${((A.min.x + A.max.x) / 2).toFixed(1)},${((A.min.z + A.max.z) / 2).toFixed(1)})`); }
			else if (ov < 0.12) { tight++; console.log(`  [${tag}] ${name} TIGHT step ${i}→${i + 1}: ov=${ov.toFixed(3)} top=${A.max.y.toFixed(2)}→${B.max.y.toFixed(2)}`); }
		}
		console.log(`  [${tag}] ${name}: steps=${group.length} gaps=${gaps} tight=${tight}`);
	}
	// climb sim: ground → 2nd floor (left stair)
	if (left.length) {
		const stepList = left.map((r) => ({ x: (r.c.min.x + r.c.max.x) / 2, z: ((r.c.min.z + r.c.max.z) / 2), top: r.c.max.y }));
		const s0 = left[0].c;
		const start = { x: (s0.min.x + s0.max.x) / 2, y: 0.14 + PLAYER_HEIGHT, z: s0.min.z + 0.3 };
		const res = simulateClimb(physics, start, stepList, { maxFrames: 3000, fallTol: 0.3 });
		console.log(`  [${tag}] climb L: ${res.ok ? "OK" : "FAIL"} frames=${res.frames} endY=${res.endY.toFixed(2)}${res.failReason ? " | " + res.failReason : ""}`);
	}
	// climb sim: 2nd floor → roof (right stair)
	if (right.length) {
		const stepList = right.map((r) => ({ x: (r.c.min.x + r.c.max.x) / 2, z: ((r.c.min.z + r.c.max.z) / 2), top: r.c.max.y }));
		const s0 = right[0].c;
		const floorTop = stepList[0].top - 0.15;
		const start = { x: (s0.min.x + s0.max.x) / 2, y: floorTop + PLAYER_HEIGHT, z: s0.min.z - 0.3 };
		const res = simulateClimb(physics, start, stepList, { maxFrames: 3000, fallTol: 0.3 });
		console.log(`  [${tag}] climb R: ${res.ok ? "OK" : "FAIL"} frames=${res.frames} endY=${res.endY.toFixed(2)}${res.failReason ? " | " + res.failReason : ""}`);
	}
}
console.log("\nDone.");
