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

const PLAYER_HEIGHT = 1.7;
const PLAYER_SPEED = 13.6;

class FakePlayer {
	constructor() {
		this.type = "Player";
		this.position = new THREE.Vector3();
		this.physics = { velocity: new THREE.Vector3(), onGround: false, wasOnGround: false, fallStartY: 0, height: PLAYER_HEIGHT, radius: 0.4, speed: PLAYER_SPEED };
		this.isFrozen = false;
		this.isInvulnerable = true;
		this.takeDamage = () => {};
		this.applyBurn = () => {};
		this.applySlow = () => {};
	}
}

const scene = new THREE.Scene();
const mapGen = new MapGenerator(scene);
await mapGen.startGeneration();
const physics = new Physics(scene, mapGen);

// Instrument _getSurfaceHeight: log the final surfaceY and which box won
const origSurf = physics._getSurfaceHeight.bind(physics);
physics._getSurfaceHeight = (position, height) => {
	const r = origSurf(position, height);
	console.log(`  [surfQuery @(${position.x.toFixed(3)},${position.y.toFixed(3)},${position.z.toFixed(3)}) => ${r.toFixed(5)}]`);
	return r;
};

function steer(entity, tx, tz, speed = PLAYER_SPEED) {
	const dx = tx - entity.position.x;
	const dz = tz - entity.position.z;
	const d = Math.hypot(dx, dz);
	if (d < 1e-6) { entity.physics.velocity.x = 0; entity.physics.velocity.z = 0; return 0; }
	entity.physics.velocity.x = (dx / d) * speed;
	entity.physics.velocity.z = (dz / d) * speed;
	return d;
}

const tower = mapGen._buildings.find((b) => b.template?.type === "maze_tower");
const stairs = mapGen.colliders.filter((c) => c.isTowerStair).sort((a, b) => (a.max.y - b.max.y));
const player = new FakePlayer();
player.position.set(stairs[0].surfaceOBB.x, 0.12 + PLAYER_HEIGHT, stairs[0].surfaceOBB.z);
physics.addEntity(player);
physics.update(1 / 60);
const targets = stairs.map((c) => ({ x: c.surfaceOBB.x, z: c.surfaceOBB.z }));
for (let f = 0; f < 4; f++) {
	const t = targets[Math.min(f, targets.length - 1)];
	steer(player, t.x, t.z);
	physics.update(1 / 60);
	const bottom = player.position.y - PLAYER_HEIGHT;
	console.log(`frame ${f} end: (${player.position.x.toFixed(3)},${player.position.y.toFixed(3)},${player.position.z.toFixed(3)}) og=${player.physics.onGround} bottom=${bottom.toFixed(6)}`);
}
// FP check
console.log("FP: 2.70-1.7 =", (2.70 - 1.7).toFixed(10), " max.y(stair1) =", stairs[1].max.y.toFixed(10), " diff=", ((2.70 - 1.7) - stairs[1].max.y).toExponential(3));
console.log("done");
