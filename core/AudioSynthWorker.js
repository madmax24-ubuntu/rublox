/* AudioSynth buffer generation worker — runs heavy math off the main thread */

/* ── Bazooka Launch Buffer ── */
function generateBazookaLaunch(rate, dur = 0.9) {
	const len = Math.floor(rate * dur);
	const buf = new Float32Array(len);
	for (let i = 0; i < len; i++) {
		const t = i / rate;
		/* Ignition crack: fast attack, fast decay */
		const ignition = Math.exp(-t * 120) * 1.2;
		/* Secondary ignition pop */
		const ignition2 =
			Math.exp(-((t - 0.015) / 0.012) ** 2) * 0.6;
		/* Thrust envelope: fast rise, sustain, then decay */
		const thrustEnv =
			t < 0.03 ? t / 0.03 : t < 0.5 ? 1 : t < 0.7 ? 1 - (t - 0.5) / 0.2 : 0;
		/* Thrust rumble: low-frequency engine character */
		const thrustRumble = Math.sin(t * 40 * Math.PI) * thrustEnv * 0.5;
		/* Deep sub-thrust */
		const subThrust = Math.sin(t * 20 * Math.PI) * thrustEnv * 0.4;
		/* High-frequency whine (rocket engine character) */
		const whine = Math.sin(t * 280 * Math.PI) * thrustEnv * 0.2;
		/* Sustained noise (exhaust) */
		const noise =
			(Math.random() * 2 - 1) * thrustEnv * Math.exp(-t * 2.5) * 0.6;
		/* High-frequency hiss */
		const hiss = (Math.random() * 2 - 1) * thrustEnv * 0.3;
		/* Crackle (sparks) */
		const crackle = (Math.random() * 2 - 1) * thrustEnv * 0.12;
		/* Impact thump at ignition */
		const thump = Math.exp(-t * 60) * 0.8;
		buf[i] =
			ignition +
			ignition2 +
			thrustRumble +
			subThrust +
			whine +
			noise +
			hiss +
			crackle +
			thump;
	}
	return buf;
}

/* ── Bazooka Explosion Buffer ── */
function generateBazookaExplosion(rate, dur = 2.5) {
	const len = Math.floor(rate * dur);
	const buf = new Float32Array(len);
	for (let i = 0; i < len; i++) {
		const t = i / rate;
		/* Primary shockwave: massive, fast-decay initial hit */
		const boom1 = Math.exp(-((t / 0.015) ** 2)) * 1.2;
		/* Secondary pressure wave */
		const boom2 =
			Math.exp(-((t - 0.04) / 0.03) ** 2) * 0.7;
		/* Debris impact cluster */
		const boom3 =
			Math.exp(-((t - 0.1) / 0.04) ** 2) * 0.4;
		/* Deep sub-bass rumble (ground shake) */
		const subRumble = Math.sin(t * 18 * Math.PI) * Math.exp(-t * 0.6) * 0.6;
		/* Mid-frequency rumble (explosion body) */
		const midRumble = Math.sin(t * 55 * Math.PI) * Math.exp(-t * 1.0) * 0.5;
		/* High-frequency crackle (debris/sparks) */
		const crackle = (Math.random() * 2 - 1) * Math.exp(-t * 2.0) * 0.4;
		/* Sustained roar (explosion tail) */
		const roarEnv =
			t < 0.08 ? t / 0.08 : Math.exp(-((t - 0.08) / 0.7) ** 2);
		const roar = (Math.random() * 2 - 1) * roarEnv * 0.3;
		/* Echo/reverb tail */
		const echo =
			t > 0.12
				? Math.exp(-((t - 0.12) / 0.6) ** 2) * 0.25
				: 0;
		/* Ground rumble (very low, long decay) */
		const groundRumble =
			Math.sin(t * 6 * Math.PI + 0.5) * Math.exp(-t * 0.4) * 0.35;
		buf[i] =
			(boom1 +
				boom2 +
				boom3 +
				subRumble +
				midRumble +
				crackle +
				roar +
				echo +
				groundRumble) *
			0.8;
	}
	return buf;
}

/* ── Bazooka Hiss Buffer ── */
function generateBazookaHiss(rate, dur = 0.9) {
	const len = Math.floor(rate * dur);
	const buf = new Float32Array(len);
	for (let i = 0; i < len; i++) {
		const t = i / rate;
		const env =
			t < 0.05
				? t / 0.05
				: t < 0.5
					? 1
					: Math.max(0, 1 - (t - 0.5) / (dur - 0.5));
		buf[i] = (Math.random() * 2 - 1) * env * 0.35;
	}
	return buf;
}

/* ── Explosion Crackle Buffer ── */
function generateExplosionCrackle(rate, dur = 0.6) {
	const len = Math.floor(rate * dur);
	const buf = new Float32Array(len);
	for (let i = 0; i < len; i++) {
		const t = i / rate;
		buf[i] = (Math.random() * 2 - 1) * Math.exp(-t * 4) * 0.45;
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
			data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
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
		case "bazookaHiss":
			data = generateBazookaHiss(params.rate, params.dur);
			break;
		case "explosionCrackle":
			data = generateExplosionCrackle(params.rate, params.dur);
			break;
		case "impulse":
			data = generateImpulse(params.rate, params.duration, params.decay, params.channels);
			break;
		default:
			self.postMessage({ error: "unknown type: " + type });
			return;
	}
	self.postMessage({ type, data }, [data]);
};
