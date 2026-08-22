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

const origSurf = physics._getSurfaceHeight.bind(physics);
physics._getSurfaceHeight = (position, height) => {
	const r = origSurf(position, height);
	console.log(`  [surfQuery @(${position.x.toFixed(3)},${position.y.toFixed(3)},${position.z.toFixed(3)}) => ${r.toFixed(5)}]`);
	return r;
};
const origResolve = physics.resolveCollisions.bind(physics);
physics.resolveCollisions = (entity) => {
	const pos = entity.position;
	const bottom = pos.y - (entity.physics?.height || 1.7);
	const nearby = physics.getNearbyColliders(pos, 0.4 + 2.0);
	const log = [];
	for (const box of nearby) {
		if (box.enabled === false) continue;
		const min = box.min, max = box.max;
		if (!min || !max) continue;
		if (pos.y < min.y - 0.3) continue;
		if (bottom > max.y + 0.3) continue;
		const tag = box.isTowerStair ? "T" : box.isBiomeResidence ? "R" : box.isBiomeEntrance ? "E" : "o";
		if (box.walkable) {
			if (bottom >= max.y - 0.05) { log.push(`${tag}@${max.y.toFixed(2)}:ontop`); continue; }
			const sh = max.y - bottom;
			const sr = box.isTowerStair || box.isBiomeEntrance ? 0.78 : 0.65;
			const vs = entity.physics.velocity?.y || 0;
			const canStep = (entity.physics.onGround || ((box.isTowerStair || box.isBiomeEntrance) && bottom >= max.y - sr && bottom <= max.y + 0.12)) && vs <= 0.01;
			const onSurf = physics._containsWalkableSurface(box, pos.x, pos.z, 0.4);
			if (canStep && onSurf && sh > 0.02 && sh <= sr) log.push(`${tag}@${max.y.toFixed(2)}:STEP`);
			else if (onSurf) log.push(`${tag}@${max.y.toFixed(2)}:nosurf-or-nostep`);
			else log.push(`${tag}@${max.y.toFixed(2)}:nosurf`);
		} else log.push(`${tag}@${max.y.toFixed(2)}:solid`);
	}
	const r = origResolve(entity);
	if (log.length) console.log(`  [resolve @(${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)} og=${entity.physics.onGround})] ${log.join(" ")}`);
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

const b = mapGen._buildings.find((x) => x.template?.type === "biome_residence" && x.template.biome === "forest" && x.x < 0 && x.z < 0);
const cols = mapGen.colliders.filter((c) => c.isBiomeResidence && c.walkable && c.max.y > 0.3 && c.max.y - c.min.y < 1.2);
const rel = cols.map((c) => ({ c, cx: (c.min.x + c.max.x) / 2 - b.x }));
const left = rel.filter((r) => r.cx < 0).sort((a, b2) => a.c.max.y - b2.c.max.y);
const stepList = left.map((r) => ({ x: (r.c.min.x + r.c.max.x) / 2, z: (r.c.min.z + r.c.max.z) / 2, top: r.c.max.y }));
console.log("stepList:", stepList.map((s, i) => `${i}:(${s.x.toFixed(1)},${s.z.toFixed(1)},top=${s.top.toFixed(2)})`).join(" "));
const s0 = left[0].c;
const player = new FakePlayer();
player.position.set((s0.min.x + s0.max.x) / 2, 0.14 + PLAYER_HEIGHT, s0.min.z + 0.3);
physics.addEntity(player);
physics.update(1 / 60);
for (let f = 0; f < 12; f++) {
	const t = stepList[Math.min(f, stepList.length - 1)];
	steer(player, t.x, t.z);
	physics.update(1 / 60);
	const bottom = player.position.y - PLAYER_HEIGHT;
	console.log(`frame ${f} end: (${player.position.x.toFixed(3)},${player.position.y.toFixed(3)},${player.position.z.toFixed(3)}) og=${player.physics.onGround} bottom=${bottom.toFixed(6)}`);
}
console.log("done");
