/* AudioSynth buffer generation worker — runs heavy math off the main thread */

/* ── Bazooka Launch Buffer (complete: ignition + thrust + rumble + hiss) ── */
function generateBazookaLaunch(rate, dur = 0.72) {
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
		buf[i] = Math.tanh((ignition + ignition2 + thrustRumble + subThrust + whine + noise + hiss + crackle + thump + subOsc + rumbleOsc) * 0.72);
	}
	return buf;
}

/* ── Bazooka Explosion Buffer (massive: booms + rumble + crackle + echo + ground) ── */
function generateBazookaExplosion(rate, dur = 2.4) {
	const len = Math.floor(rate * dur);
	const buf = new Float32Array(len);
	for (let i = 0; i < len; i++) {
		const t = i / rate;
		// Initial shockwave (extremely sharp, very loud)
		const boom1 = Math.exp(-((t / 0.01) ** 2)) * 2.0;
		// Secondary boom (pressure wave reflection)
		const boom2 = Math.exp(-(((t - 0.03) / 0.025) ** 2)) * 1.2;
		// Third boom (debris impact cluster)
		const boom3 = Math.exp(-(((t - 0.08) / 0.04) ** 2)) * 0.8;
		// Fourth boom (deep cavity collapse)
		const boom4 = Math.exp(-(((t - 0.15) / 0.06) ** 2)) * 0.5;
		// Deep sub-bass rumble (sustained, very low frequency — felt in chest)
		const subRumble = Math.sin(t * 12 * Math.PI) * Math.exp(-t * 0.4) * 1.0;
		const subRumble2 = Math.sin(t * 8 * Math.PI) * Math.exp(-t * 0.3) * 0.8;
		// Mid-frequency rumble (explosion body)
		const midRumble = Math.sin(t * 55 * Math.PI) * Math.exp(-t * 0.8) * 0.8;
		const midRumble2 = Math.sin(t * 80 * Math.PI) * Math.exp(-t * 1.0) * 0.5;
		// High-frequency crackle (debris and sparks)
		const crackle = (Math.random() * 2 - 1) * Math.exp(-t * 1.5) * 0.6;
		// Sustained roar (explosion tail)
		const roarEnv = t < 0.05 ? t / 0.05 : Math.exp(-(((t - 0.05) / 0.8) ** 2));
		const roar = (Math.random() * 2 - 1) * roarEnv * 0.5;
		// Echo/reverb tail (delayed reflection)
		const echo = t > 0.1 ? Math.exp(-(((t - 0.1) / 0.8) ** 2)) * 0.4 : 0;
		// Ground rumble (very low, long decay)
		const groundRumble = Math.sin(t * 4 * Math.PI + 0.5) * Math.exp(-t * 0.3) * 0.6;
		const groundRumble2 = Math.sin(t * 6 * Math.PI + 1.2) * Math.exp(-t * 0.25) * 0.5;
		// Sub-thump (deep impact)
		const subThump = Math.sin(t * 45 * Math.PI) * Math.exp(-t * 3) * 0.8;
		// Debris scattering
		const debris = (Math.random() * 2 - 1) * Math.exp(-t * 2.5) * 0.4;
		// Metal shrapnel
		const shrapnel = (Math.random() * 2 - 1) * Math.exp(-t * 4) * 0.25;
		buf[i] = Math.tanh((boom1 + boom2 + boom3 + boom4 + subRumble + subRumble2 + midRumble + midRumble2 + crackle + roar + echo + groundRumble + groundRumble2 + subThump + debris + shrapnel) * 0.48);
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
			self.postMessage({ type, data });
			break;
		case "bazookaExplosion":
			data = generateBazookaExplosion(params.rate, params.dur);
			self.postMessage({ type, data });
			break;
		case "impulse":
			data = generateImpulse(params.rate, params.duration, params.decay, params.channels);
			self.postMessage({ type, data });
			break;
		default:
			self.postMessage({ type, error: "unknown type: " + type });
			return;
	}
};
