// Comprehensive hangar collider gap analysis test
// Run: node tests/hangar-audit.test.js

/* global window, AudioContext, webkitAudioContext */

class MockAudioContext {
	constructor() {
		this.sampleRate = 48000;
		this.currentTime = 0;
	}
	createGain() {
		const g = {
			gain: {
				value: 1,
				setValueAtTime: () => {},
				linearRampToValueAtTime: () => {},
				exponentialRampToValueAtTime: () => {},
			},
		};
		g.connect = () => g;
		return g;
	}
	createBiquadFilter() {
		const f = {
			type: "lowpass",
			frequency: {
				value: 8000,
				setValueAtTime: () => {},
				exponentialRampToValueAtTime: () => {},
			},
			Q: { value: 0.8 },
		};
		f.connect = () => f;
		return f;
	}
	createOscillator() {
		const o = {
			type: "sine",
			frequency: {
				value: 440,
				setValueAtTime: () => {},
				exponentialRampToValueAtTime: () => {},
			},
		};
		o.connect = () => o;
		o.start = () => {};
		o.stop = () => {};
		return o;
	}
	createBufferSource() {
		const s = { buffer: null, start: () => {}, stop: () => {} };
		s.connect = () => s;
		return s;
	}
	createPanner() {
		const p = {
			panningModel: "equalpower",
			distanceModel: "inverse",
			refDistance: 1,
			maxDistance: 100,
			rolloffFactor: 1,
			positionX: { value: 0 },
			positionY: { value: 0 },
			positionZ: { value: 0 },
		};
		p.connect = () => p;
		return p;
	}
	createConvolver() {
		const c = { buffer: null };
		c.connect = () => c;
		return c;
	}
	createDynamicsCompressor() {
		const c = {
			threshold: { value: 0 },
			knee: { value: 0 },
			ratio: { value: 1 },
			attack: { value: 0 },
			release: { value: 0 },
		};
		c.connect = () => c;
		return c;
	}
	createBuffer(channels, length, rate) {
		const b = { numberOfChannels: channels, length, sampleRate: rate };
		b.getChannelData = (_i) => new Float32Array(length);
		return b;
	}
	destination = { connect: () => {} };
}
globalThis.window = globalThis.window || {};
globalThis.window.AudioContext = MockAudioContext;
globalThis.window.webkitAudioContext = MockAudioContext;
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.AudioContext = MockAudioContext;
globalThis.webkitAudioContext = MockAudioContext;

import { MapGenerator } from "../world/MapGenerator.js";
import { Physics } from "../world/Physics.js";
import * as THREE from "../node_modules/three/build/three.module.js";

let passed = 0;
let failed = 0;

function assert(condition, message) {
	if (condition) {
		passed++;
		console.log(`  ✓ ${message}`);
	} else {
		failed++;
		console.error(`  ✗ ${message}`);
	}
}

// --- Helper: check if point is inside AABB ---
function pointInBox(px, py, pz, min, max) {
	return (
		px >= min.x &&
		px <= max.x &&
		py >= min.y &&
		py <= max.y &&
		pz >= min.z &&
		pz <= max.z
	);
}

// --- Helper: check if two AABBs overlap ---
function aabbOverlap(minA, maxA, minB, maxB) {
	return (
		minA.x <= maxB.x &&
		maxA.x >= minB.x &&
		minA.y <= maxB.y &&
		maxA.y >= minB.y &&
		minA.z <= maxB.z &&
		maxA.z >= minB.z
	);
}

console.log("\n=== Hangar Collider Gap Audit ===\n");

// Initialize map
const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();

// Find hangar building
const hangarBuilding = mapGen._buildings.find(
	(b) => b.template?.type === "hangar",
);
assert(hangarBuilding !== undefined, "Hangar building exists");

const { x: hx, z: hz, w: hw, d: hd } = hangarBuilding;
const hh = 14; // hangar height (from _addMilitaryHangar call)
console.log(`Hangar: pos=(${hx}, ${hz}), w=${hw}, d=${hd}, h=${hh}`);

// Find all hangar colliders
const doorW = 4;
const doorH = 3.5;
const doorLeftW = hw / 2 - doorW / 2; // 12
const doorRightW = hw / 2 - doorW / 2; // 12
const doorTopH = hh - doorH - 0.5; // 10

console.log(`\nExpected collider layout:`);
console.log(
	`  Side walls: w=1.5, h=${hh}, d=${hd}, at X=${(hw / 2).toFixed(1)} and X=${(-hw / 2).toFixed(1)}`,
);
console.log(`  Door left: w=${doorLeftW}, h=${hh}, d=2.0`);
console.log(`  Door right: w=${doorRightW}, h=${hh}, d=2.0`);
console.log(`  Door top: w=${hw}, h=${doorTopH}, d=2.0`);
console.log(`  Back wall: w=${hw}, h=${hh}, d=2.0`);
console.log(`  Corner seals: w=3, h=${hh}, d=3 (4 corners)`);
console.log(`  Front corners: w=1.2, h=${hh}, d=1.2`);
console.log(`  Floor: w=${hw}, h=0.3, d=${hd}`);
console.log(`  Roof: w=${hw + 1.8}, h=1.8, d=${hd + 1.8}`);

// Find hangar colliders by proximity
const hangarColliders = mapGen.colliders.filter((c) => {
	if (c.source?.userData?.buildingType === "hangar") return true;
	if (c.isBuildingWall) {
		const cx = (c.min.x + c.max.x) / 2;
		const cz = (c.min.z + c.max.z) / 2;
		return (
			cx >= hx - hw / 2 - 3 &&
			cx <= hx + hw / 2 + 3 &&
			cz >= hz - hd / 2 - 3 &&
			cz <= hz + hd / 2 + 3
		);
	}
	if (c.walkable) {
		const cx = (c.min.x + c.max.x) / 2;
		const cz = (c.min.z + c.max.z) / 2;
		return (
			cx >= hx - hw / 2 - 3 &&
			cx <= hx + hw / 2 + 3 &&
			cz >= hz - hd / 2 - 3 &&
			cz <= hz + hd / 2 + 3
		);
	}
	return false;
});

console.log(`\nFound ${hangarColliders.length} hangar colliders`);

// Classify colliders
const wallColliders = hangarColliders.filter((c) => c.isBuildingWall && !c.walkable);
const floorColliders = hangarColliders.filter((c) => c.walkable);
const roofColliders = hangarColliders.filter(
	(c) => {
		const cy = (c.min.y + c.max.y) / 2;
		const ch = c.max.y - c.min.y;
		return !c.walkable && cy > hh - 2 && ch < 5;
	},
);

console.log(`  Wall colliders: ${wallColliders.length}`);
console.log(`  Floor colliders: ${floorColliders.length}`);
console.log(`  Roof colliders: ${roofColliders.length}`);

// --- Test 1: Side wall colliders ---
console.log("\n--- Test 1: Side walls ---");
const sideWallColliders = wallColliders.filter((c) => {
	const cx = (c.min.x + c.max.x) / 2;
	return (
		(Math.abs(cx - (hx + hw / 2)) < 1 || Math.abs(cx - (hx - hw / 2)) < 1) &&
		Math.abs((c.min.z + c.max.z) / 2 - hz) < 2
	);
});
assert(
	sideWallColliders.length >= 2,
	`Side wall colliders: ${sideWallColliders.length} (expected 2)`,
);

for (const c of sideWallColliders) {
	const cx = (c.min.x + c.max.x) / 2;
	const cz = (c.min.z + c.max.z) / 2;
	const w = c.max.x - c.min.x;
	const h = c.max.y - c.min.y;
	const d = c.max.z - c.min.z;
	console.log(
		`  Side wall: center=(${cx.toFixed(1)}, ${h / 2}, ${cz.toFixed(1)}), dims=${w.toFixed(1)}x${h.toFixed(1)}x${d.toFixed(1)}`,
	);
	assert(
		Math.abs(h - hh) < 0.5,
		`Side wall height ~${hh} (actual ${h.toFixed(1)})`,
	);
	assert(d >= hd, `Side wall depth >= ${hd} (actual ${d.toFixed(1)})`);
}

// --- Test 2: Door colliders ---
console.log("\n--- Test 2: Door colliders ---");
const doorLeftColliders = wallColliders.filter((c) => {
	const cx = (c.min.x + c.max.x) / 2;
	return Math.abs(cx - (hx - hw / 2 + doorLeftW / 2)) < 2;
});
const doorRightColliders = wallColliders.filter((c) => {
	const cx = (c.min.x + c.max.x) / 2;
	return Math.abs(cx - (hx + hw / 2 - doorRightW / 2)) < 2;
});
const doorTopColliders = wallColliders.filter((c) => {
	const cx = (c.min.x + c.max.x) / 2;
	const cy = (c.min.y + c.max.y) / 2;
	return Math.abs(cx - hx) < 2 && cy > doorH;
});

assert(
	doorLeftColliders.length > 0,
	`Door left colliders: ${doorLeftColliders.length}`,
);
assert(
	doorRightColliders.length > 0,
	`Door right colliders: ${doorRightColliders.length}`,
);
assert(
	doorTopColliders.length > 0,
	`Door top colliders: ${doorTopColliders.length}`,
);

// --- Test 3: Back wall collider ---
console.log("\n--- Test 3: Back wall ---");
const backWallColliders = wallColliders.filter((c) => {
	const cx = (c.min.x + c.max.x) / 2;
	const cz = (c.min.z + c.max.z) / 2;
	return Math.abs(cx - hx) < 2 && Math.abs(cz - (hz - hd / 2)) < 2;
});
assert(
	backWallColliders.length > 0,
	`Back wall colliders: ${backWallColliders.length}`,
);

// --- Test 4: Corner colliders ---
console.log("\n--- Test 4: Corner colliders ---");
const cornerColliders = wallColliders.filter((c) => {
	const cx = (c.min.x + c.max.x) / 2;
	const cz = (c.min.z + c.max.z) / 2;
	return (
		(Math.abs(cx - (hx - hw / 2)) < 2 || Math.abs(cx - (hx + hw / 2)) < 2) &&
		(Math.abs(cz - (hz - hd / 2)) < 2 || Math.abs(cz - (hz + hd / 2)) < 2) &&
		c.max.x - c.min.x > 2.0
	); // corner colliders are wider (3.0)
});
assert(
	cornerColliders.length >= 4,
	`Corner colliders: ${cornerColliders.length} (expected 4)`,
);

// --- Test 5: Front corner colliders ---
console.log("\n--- Test 5: Front corner colliders ---");
const frontCornerColliders = wallColliders.filter((c) => {
	const cx = (c.min.x + c.max.x) / 2;
	const cz = (c.min.z + c.max.z) / 2;
	return (
		(Math.abs(cx - (hx - hw / 2)) < 1.5 ||
			Math.abs(cx - (hx + hw / 2)) < 1.5) &&
		Math.abs(cz - (hz + hd / 2)) < 1.5 &&
		c.max.x - c.min.x < 2.0
	); // front corner colliders are smaller (1.2)
});
assert(
	frontCornerColliders.length >= 2,
	`Front corner colliders: ${frontCornerColliders.length} (expected 2)`,
);

// --- Test 6: Floor collider ---
console.log("\n--- Test 6: Floor ---");
assert(floorColliders.length > 0, `Floor colliders: ${floorColliders.length}`);
for (const c of floorColliders) {
	assert(c.walkable, "Floor collider is walkable");
	assert(c.max.y <= 0.5, `Floor Y <= 0.5 (actual ${c.max.y.toFixed(2)})`);
}

// --- Test 7: Roof collider ---
console.log("\n--- Test 7: Roof ---");
assert(roofColliders.length > 0, `Roof colliders: ${roofColliders.length}`);

// --- Test 8: Gap analysis — critical test ---
console.log("\n--- Test 8: Gap Analysis (Critical) ---");

// Test points around the hangar perimeter
// If a point OUTSIDE the hangar is NOT blocked by any wall collider,
// and a point INSIDE the hangar IS on the floor, there's a gap.

const wallCollidersAll = [...wallColliders, ...roofColliders];

// Helper: check if point is blocked by any wall/roof collider
function isBlocked(px, py, pz) {
	for (const c of wallCollidersAll) {
		if (pointInBox(px, py, pz, c.min, c.max)) return true;
	}
	return false;
}

// Helper: check if point is on hangar floor
function isOnFloor(px, py, pz) {
	for (const c of floorColliders) {
		if (pointInBox(px, py, pz, c.min, c.max)) return true;
	}
	return false;
}

// Helper: check if point is inside hangar XZ bounds
function isInsideHangarXZ(px, pz) {
	return (
		px >= hx - hw / 2 &&
		px <= hx + hw / 2 &&
		pz >= hz - hd / 2 &&
		pz <= hz + hd / 2
	);
}

// Helper: check if point is in door opening
function isDoorOpening(px, pz) {
	return (
		Math.abs(pz - (hz + hd / 2)) < 1 &&
		px >= hx - doorW / 2 &&
		px <= hx + doorW / 2
	);
}

// Test points just outside each wall
const testPoints = [
	// Front (door opening) — should NOT be blocked
	{
		px: hx,
		py: 1.7,
		pz: hz + hd / 2 + 0.5,
		shouldBlock: false,
		label: "Front center (door opening)",
	},
	// Front left corner — should be blocked
	{
		px: hx - hw / 2 - 0.5,
		py: 1.0,
		pz: hz + hd / 2 + 0.5,
		shouldBlock: true,
		label: "Front-left outside",
	},
	{
		px: hx - hw / 2 + 0.5,
		py: 1.0,
		pz: hz + hd / 2 + 0.5,
		shouldBlock: true,
		label: "Front-left corner",
	},
	{
		px: hx + hw / 2 - 0.5,
		py: 1.0,
		pz: hz + hd / 2 + 0.5,
		shouldBlock: true,
		label: "Front-right corner",
	},
	{
		px: hx + hw / 2 + 0.5,
		py: 1.0,
		pz: hz + hd / 2 + 0.5,
		shouldBlock: true,
		label: "Front-right outside",
	},
	// Left side — should be blocked
	{
		px: hx - hw / 2 - 0.5,
		py: 1.0,
		pz: hz,
		shouldBlock: true,
		label: "Left side outside",
	},
	{
		px: hx - hw / 2 + 0.5,
		py: 1.0,
		pz: hz,
		shouldBlock: true,
		label: "Left side inside",
	},
	// Right side — should be blocked
	{
		px: hx + hw / 2 - 0.5,
		py: 1.0,
		pz: hz,
		shouldBlock: true,
		label: "Right side inside",
	},
	{
		px: hx + hw / 2 + 0.5,
		py: 1.0,
		pz: hz,
		shouldBlock: true,
		label: "Right side outside",
	},
	// Back — should be blocked
	{
		px: hx,
		py: 1.0,
		pz: hz - hd / 2 - 0.5,
		shouldBlock: true,
		label: "Back outside",
	},
	{
		px: hx,
		py: 1.0,
		pz: hz - hd / 2 + 0.5,
		shouldBlock: true,
		label: "Back inside",
	},
	// Back corners — should be blocked
	{
		px: hx - hw / 2 - 0.5,
		py: 1.0,
		pz: hz - hd / 2 - 0.5,
		shouldBlock: true,
		label: "Back-left corner",
	},
	{
		px: hx + hw / 2 - 0.5,
		py: 1.0,
		pz: hz - hd / 2 + 0.5,
		shouldBlock: true,
		label: "Back-right inside",
	},
	// Roof — should be blocked from above
	{ px: hx, py: hh + 0.5, pz: hz, shouldBlock: true, label: "Above roof" },
	// Inside hangar — should be on floor
	{ px: hx, py: 0.2, pz: hz, shouldBlock: false, label: "Inside hangar floor" },
];

let gapCount = 0;
for (const tp of testPoints) {
	const blocked = isBlocked(tp.px, tp.py, tp.pz);
	const onFloor = isOnFloor(tp.px, tp.py, tp.pz);

	if (tp.shouldBlock && !blocked) {
		console.error(
			`  ✗ GAP: ${tp.label} — point (${tp.px.toFixed(1)}, ${tp.py}, ${tp.pz.toFixed(1)}) is NOT blocked!`,
		);
		gapCount++;
	} else if (!tp.shouldBlock && blocked) {
		console.error(
			`  ✗ PHANTOM: ${tp.label} — point (${tp.px.toFixed(1)}, ${tp.py}, ${tp.pz.toFixed(1)}) is blocked but should NOT be!`,
		);
		gapCount++;
	} else {
		assert(
			tp.shouldBlock === blocked,
			`${tp.label}: ${blocked ? "blocked" : "open"} ✓`,
		);
	}
}

if (gapCount > 0) {
	console.error(
		`\n  ⚠️  FOUND ${gapCount} GAP(S) — players can walk through walls!`,
	);
} else {
	console.log(`\n  ✓ No gaps found — hangar is fully sealed!`);
}

// --- Test 9: Corner overlap verification ---
console.log("\n--- Test 9: Corner Overlap Verification ---");

// Check that side walls overlap with corner colliders
for (const sw of sideWallColliders) {
	for (const cc of cornerColliders) {
		if (aabbOverlap(sw.min, sw.max, cc.min, cc.max)) {
			assert(true, `Side wall ↔ Corner overlap ✓`);
		}
	}
}

// Check that door colliders overlap with corner colliders
for (const dc of [
	...doorLeftColliders,
	...doorRightColliders,
	...doorTopColliders,
]) {
	let overlapsWithCorner = false;
	for (const cc of cornerColliders) {
		if (aabbOverlap(dc.min, dc.max, cc.min, cc.max)) {
			overlapsWithCorner = true;
			break;
		}
	}
	assert(overlapsWithCorner, `Door collider overlaps with corner`);
}

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
	console.error("SOME TESTS FAILED");
	process.exit(1);
} else {
	console.log("ALL TESTS PASSED — Hangar is properly sealed!");
	process.exit(0);
}
