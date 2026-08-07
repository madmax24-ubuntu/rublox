/* AudioSynth buffer generation worker — runs heavy math off the main thread */

/* ── Bazooka Launch Buffer (complete: ignition + thrust + rumble + hiss) ── */
function generateBazookaLaunch(rate, dur = 0.9) {
	const len = Math.floor(rate * dur);
	const buf = new Float32Array(len);
	for (let i = 0; i < len; i++) {
		const t = i / rate;
		const ignition = Math.exp(-t * 120) * 1.2;
		const ignition2 = Math.exp(-(((t - 0.015) / 0.012) ** 2)) * 0.6;
		const thrustEnv = t < 0.03 ? t / 0.03 : t < 0.5 ? 1 : t < 0.7 ? 1 - (t - 0.5) / 0.2 : 0;
		const thrustRumble = Math.sin(t * 40 * Math.PI) * thrustEnv * 0.5;
		const subThrust = Math.sin(t * 20 * Math.PI) * thrustEnv * 0.4;
		const whine = Math.sin(t * 280 * Math.PI) * thrustEnv * 0.2;
		const noise = (Math.random() * 2 - 1) * thrustEnv * Math.exp(-t * 2.5) * 0.6;
		const hiss = (Math.random() * 2 - 1) * thrustEnv * 0.3;
		const crackle = (Math.random() * 2 - 1) * thrustEnv * 0.12;
		const thump = Math.exp(-t * 60) * 0.8;
		const subOsc = Math.sin(t * 85 * Math.PI) * Math.exp(-t * 3) * 0.45;
		const rumbleOsc = (Math.sin(t * 120 * Math.PI) > 0 ? 1 : -1) * thrustEnv * 0.15;
		buf[i] = ignition + ignition2 + thrustRumble + subThrust + whine + noise + hiss + crackle + thump + subOsc + rumbleOsc;
	}
	return buf;
}

/* ── Bazooka Explosion Buffer (complete: booms + rumble + crackle + echo + ground) ── */
function generateBazookaExplosion(rate, dur = 2.5) {
	const len = Math.floor(rate * dur);
	const buf = new Float32Array(len);
	for (let i = 0; i < len; i++) {
		const t = i / rate;
		const boom1 = Math.exp(-((t / 0.015) ** 2)) * 1.2;
		const boom2 = Math.exp(-(((t - 0.04) / 0.03) ** 2)) * 0.7;
		const boom3 = Math.exp(-(((t - 0.1) / 0.04) ** 2)) * 0.4;
		const subRumble = Math.sin(t * 18 * Math.PI) * Math.exp(-t * 0.6) * 0.6;
		const midRumble = Math.sin(t * 55 * Math.PI) * Math.exp(-t * 1.0) * 0.5;
		const crackle = (Math.random() * 2 - 1) * Math.exp(-t * 2.0) * 0.4;
		const roarEnv = t < 0.08 ? t / 0.08 : Math.exp(-(((t - 0.08) / 0.7) ** 2));
		const roar = (Math.random() * 2 - 1) * roarEnv * 0.3;
		const echo = t > 0.12 ? Math.exp(-(((t - 0.12) / 0.6) ** 2)) * 0.25 : 0;
		const groundRumble = Math.sin(t * 6 * Math.PI + 0.5) * Math.exp(-t * 0.4) * 0.35;
		const subThump = Math.sin(t * 45 * Math.PI) * Math.exp(-t * 4) * 0.5;
		const debris = (Math.random() * 2 - 1) * Math.exp(-t * 3) * 0.2;
		buf[i] = (boom1 + boom2 + boom3 + subRumble + midRumble + crackle + roar + echo + groundRumble + subThump + debris) * 0.8;
	}
	return buf;
}

/* ── Impulse Response (for reverb) ── */
function generateImpulse(rate, duration, decay, channels = 2) {
	const len = Math.floor(rate * duration);
	const result = [];
	for (let ch = 0; ch < channels; ch++) {
		const data = new Float32Array(len);
		for (let i = 0; i < len; i++) {
			// Use a helper to avoid Node.js v24 unary minus + ** syntax error
			const base = 1 - i / len;
			data[i] = (Math.random() * 2 - 1) * (base ** decay);
		}
		result.push(data);
	}
	return result;
}

/* ── Worker Message Handler ── */
self.onmessage = function (e) {
	const { type, params } = e.data;
	let data;
	switch (type) {
		case "bazookaLaunch":
			data = generateBazookaLaunch(params.rate, params.dur);
			break;
		case "bazookaExplosion":
			data = generateBazookaExplosion(params.rate, params.dur);
			break;
		case "impulse":
			data = generateImpulse(params.rate, params.duration, params.decay, params.channels);
			break;
		default:
			self.postMessage({ type, error: "unknown type: " + type });
			return;
	}
	self.postMessage({ type, data }, [data]);
};
