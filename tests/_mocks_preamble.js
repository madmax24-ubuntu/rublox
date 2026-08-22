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

