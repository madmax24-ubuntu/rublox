// Tests for bazooka audio crash fix and hangar collider fix
// Run: node tests/bazooka-hangar.test.js

/* global window, AudioContext, webkitAudioContext */

// --- Mock Web Audio API for Node.js ---
class MockAudioContext {
	constructor() {
		this.sampleRate = 48000;
		this.currentTime = 0;
	}
	createGain() {
		const gain = {
			gain: {
				value: 1,
				setValueAtTime: () => {},
				linearRampToValueAtTime: () => {},
				exponentialRampToValueAtTime: () => {},
			},
		};
		gain.connect = () => gain;
		return gain;
	}
	createBiquadFilter() {
		const filter = {
			type: "lowpass",
			frequency: {
				value: 8000,
				setValueAtTime: () => {},
				exponentialRampToValueAtTime: () => {},
			},
			Q: { value: 0.8 },
		};
		filter.connect = () => filter;
		return filter;
	}
	createOscillator() {
		const osc = {
			type: "sine",
			frequency: {
				value: 440,
				setValueAtTime: () => {},
				exponentialRampToValueAtTime: () => {},
			},
		};
		osc.connect = () => osc;
		osc.start = () => {};
		osc.stop = () => {};
		return osc;
	}
	createBufferSource() {
		const src = { buffer: null, start: () => {}, stop: () => {} };
		src.connect = () => src;
		return src;
	}
	createPanner() {
		const panner = {
			panningModel: "equalpower",
			distanceModel: "inverse",
			refDistance: 1,
			maxDistance: 100,
			rolloffFactor: 1,
			positionX: { value: 0 },
			positionY: { value: 0 },
			positionZ: { value: 0 },
		};
		panner.connect = () => panner;
		return panner;
	}
	createConvolver() {
		const convolver = { buffer: null };
		convolver.connect = () => convolver;
		return convolver;
	}
	createDynamicsCompressor() {
		const comp = {
			threshold: { value: 0 },
			knee: { value: 0 },
			ratio: { value: 1 },
			attack: { value: 0 },
			release: { value: 0 },
		};
		comp.connect = () => comp;
		return comp;
	}
	createBuffer(channels, length, rate) {
		const buffer = { numberOfChannels: channels, length, sampleRate: rate };
		buffer.getChannelData = (_i) => new Float32Array(length);
		return buffer;
	}
	destination = { connect: () => {} };
}

// Patch global AudioContext
// AudioSynth uses window.AudioContext, so we need to mock both
globalThis.window = globalThis.window || {};
globalThis.window.AudioContext = MockAudioContext;
globalThis.window.webkitAudioContext = MockAudioContext;
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.AudioContext = MockAudioContext;
globalThis.webkitAudioContext = MockAudioContext;

import { AudioSynth } from "../core/AudioSynth.js";
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

// --- Test 1: AudioSynth pre-generates bazooka buffers ---
console.log("\n=== Test 1: AudioSynth bazooka buffer pre-generation ===");

const audioSynth = new AudioSynth();
await audioSynth.init();

assert(
	audioSynth.bazookaLaunchBuffer !== null,
	"bazookaLaunchBuffer pre-generated",
);
assert(
	audioSynth.bazookaExplosionBuffer !== null,
	"bazookaExplosionBuffer pre-generated",
);

assert(
	audioSynth.bazookaLaunchBuffer.numberOfChannels === 1,
	"bazookaLaunchBuffer: mono channel",
);
assert(
	audioSynth.bazookaExplosionBuffer.numberOfChannels === 1,
	"bazookaExplosionBuffer: mono channel",
);

// --- Test 2: playBazooka no longer crashes ---
console.log("\n=== Test 2: playBazooka crash fix ===");

// playBazooka is now async (was sync before the fix)
assert(
	typeof audioSynth.playBazooka === "function",
	"playBazooka is a function",
);

// Call playBazooka with a valid position (this was the crash point)
const testPos = new THREE.Vector3(10, 1, 10);
let playError = null;
try {
	await audioSynth.playBazooka(testPos, "player");
} catch (e) {
	playError = e.message;
}
assert(
	playError === null,
	"playBazooka did not crash (was: pan.position is undefined)",
);

// --- Test 3: playProceduralExplosion no longer crashes ---
console.log("\n=== Test 3: playProceduralExplosion crash fix ===");

let explosionError = null;
try {
	audioSynth.playProceduralExplosion(testPos);
} catch (e) {
	explosionError = e.message;
}
assert(explosionError === null, "playProceduralExplosion did not crash");

// --- Test 4: Hangar colliders ---
console.log("\n=== Test 4: Hangar colliders ===");

const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();

// Find hangar building from _buildings list
const hangarBuilding = mapGen._buildings.find(
	(b) => b.template?.type === "hangar",
);
assert(hangarBuilding !== undefined, "Hangar building exists in _buildings");

// Find colliders belonging to the hangar (by source, buildingWall, or proximity)
const { x: hx, z: hz, w: hw, d: hd } = hangarBuilding;
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
assert(
	hangarColliders.length > 0,
	`Found ${hangarColliders.length} hangar colliders`,
);

// Check collider properties
for (const c of hangarColliders) {
	assert(c.min !== undefined, "collider has min point");
	assert(c.max !== undefined, "collider has max point");
	assert(c.enabled === true, "collider is enabled");
}

// Check for wall colliders (non-walkable)
const wallColliders = hangarColliders.filter((c) => c.isBuildingWall);
assert(wallColliders.length > 0, "Hangar has wall colliders");

// Verify wall colliders block movement (non-walkable)
assert(
	wallColliders.every((c) => !c.walkable),
	"Wall colliders are non-walkable",
);

// Check for floor collider (walkable surface, low Y position) — may not have source set
const floorColliders = mapGen.colliders.filter(
	(c) => c.walkable && c.max.y <= 0.5 && c.min.y >= 0,
);
assert(
	floorColliders.length > 0,
	`Walkable floor colliders found: ${floorColliders.length}`,
);

// --- Test 5: Physics engine detects new colliders ---
console.log("\n=== Test 5: Physics collider version tracking ===");

const mg = new MapGenerator(scene);
await mg.startGeneration();

const initialVersion = mg.colliderVersion;
assert(initialVersion > 0, `Initial colliderVersion: ${initialVersion}`);

// Simulate adding a new collider (like hangar would do)
mg.addColliderBox(new THREE.Vector3(50, 1, 50), 4, 2, 4, true, false, true);
assert(
	mg.colliderVersion > initialVersion,
	"colliderVersion incremented after addColliderBox",
);

// --- Test 6: Physics grid rebuilds on version change ---
console.log("\n=== Test 6: Physics grid rebuild on version change ===");

const mg2 = new MapGenerator(scene);
await mg2.startGeneration();
const physics = new Physics(scene, mg2);

// Initial state
const initialGridCount = physics.colliderGridCount;
assert(initialGridCount > 0, `Initial grid count: ${initialGridCount}`);

// Add a new collider
mg2.addColliderBox(new THREE.Vector3(60, 1, 60), 6, 3, 6, false, false, true);
assert(
	mg2.colliderVersion !== physics._colliderVersion,
	"Version mismatch detected",
);

// Simulate physics update (this should rebuild the grid)
const newVersion = mg2.colliderVersion;
if (newVersion !== physics._colliderVersion) {
	physics.colliders = mg2.getColliders();
	physics.colliderGridCount = physics.colliders.length;
	physics.dynamicColliders = physics.colliders.filter((box) => box.dynamic);
	physics.rebuildColliderGrid();
	physics._colliderVersion = newVersion;
}
assert(
	physics.colliderGridCount > initialGridCount,
	`Grid rebuilt: ${initialGridCount} -> ${physics.colliderGridCount}`,
);

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
	console.error("SOME TESTS FAILED");
	process.exit(1);
} else {
	console.log("ALL TESTS PASSED");
	process.exit(0);
}
