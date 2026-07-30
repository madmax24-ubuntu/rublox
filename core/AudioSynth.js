const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export class AudioSynth {
    constructor() {
        this.isMobileDevice = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        this.audioContext = null;
        this.musicGain = null;
        this.masterSfxGain = null;
        this.sfxGain = null;
        this.categoryGains = {
            weapon: null,
            ambient: null,
            ui: null,
            zombie: null,
            weather: null,
            sfx: null
        };
        this.categoryBaseVolumes = {
            weapon: 0.9,
            ambient: 0.22,
            ui: 0.62,
            zombie: 0.46,
            weather: 0.18,
            sfx: 0.52
        };
        this.reverb = null;
        this.reverbGain = null;
        this.sfxLimiter = null;
        this.ambientRunning = false;
        this.ambientTimers = [];
        this.ambientNodes = null;
        this.currentBiomeAmbient = null;
        this.radiationRainNodes = null;
        this.weatherLoopNodes = null;
        this.weatherTransitionTimer = null;
        this.currentWeatherState = 'clear';
        this.footstepWeatherFactor = 1;
        this.listenerPosition = { x: 0, y: 0, z: 0 };
        this.musicStarted = false;
        this.musicLoopTimer = null;
        this.musicThemeIndex = 0;
        this.musicSource = null;
        this.rainNoiseBuffer = null;
        this.survivalMusicBuffer = null;
        this.musicVolume = this.isMobileDevice ? 0.24 : 0.15;
        this.sfxVolume = this.isMobileDevice ? 0.58 : 0.48;
        this.sampleBuffers = new Map();
        this.sampleLoadStarted = false;
        this.sampleLoadPromise = null;
        this._initPromise = null;
        this._unlockHandlersBound = false;
        this._unlockInProgress = null;
        this.lastWeaponSfxTime = Object.create(null);
        this.lastNpcWeaponSfxTime = 0;
        this.lastZombieSfxTime = { attack: 0, moan: 0 };
        this.lastZombieEmitterSfx = new Map();
        this.activeSampleVoices = new Map();
        this.activeCategoryVoices = new Map();
        this.categoryVoiceLimits = this.isMobileDevice
            ? { weapon: 5, ambient: 1, ui: 2, zombie: 3, weather: 1, sfx: 3 }
            : { weapon: 7, ambient: 2, ui: 3, zombie: 4, weather: 1, sfx: 4 };
        this.weaponSfxCooldown = {
            bow: 0.09,
            laser: 0.12,
            shotgun: 0.16,
            pistol: 0.095,
            rifle: 0.08,
            machinegun: 0.055,
            flamethrower: 0.09
        };

        this.sampleCatalog = {
            ambient: [],
            rumble: [
                'assets/audio/rpg/doorClose_2.ogg',
                'assets/audio/rpg/doorClose_3.ogg',
                'assets/audio/rpg/doorClose_4.ogg'
            ],
            footsteps: Array.from({ length: 10 }, (_, i) => `assets/audio/rpg/footstep0${i}.ogg`),
            hit: [
                'assets/audio/rpg/knifeSlice.ogg',
                'assets/audio/rpg/knifeSlice2.ogg',
                'assets/audio/rpg/chop.ogg'
            ],
            hurt: [
                'assets/audio/rpg/cloth3.ogg',
                'assets/audio/rpg/cloth4.ogg'
            ],
            playerHurt: [
                'assets/audio/rpg/clothBelt.ogg',
                'assets/audio/rpg/clothBelt2.ogg',
                'assets/audio/rpg/cloth4.ogg'
            ],
            npcHurt: [
                'assets/audio/rpg/chop.ogg',
                'assets/audio/rpg/cloth3.ogg',
                'assets/audio/rpg/cloth4.ogg'
            ],
            zoneDamage: [
                'assets/audio/rpg/cloth3.ogg',
                'assets/audio/rpg/cloth4.ogg'
            ],
            zombieMoan: Array.from({ length: 12 }, (_, i) => `assets/audio/zombies/zombie-${i + 1}.wav`),
            zombieAttack: Array.from({ length: 12 }, (_, i) => `assets/audio/zombies/zombie-${i + 13}.wav`),
            bow: [
                'assets/audio/weapons/bow_shot.wav'
            ],
            laser: [
                'assets/audio/weapons/laser_shot.wav'
            ],
            machinegun: [
                'assets/audio/weapons/machinegun_ppsh_a.wav',
                'assets/audio/weapons/machinegun_ppsh_b.wav'
            ],
            shotgun: [
                'assets/audio/weapons/shotgun_model12_a.wav'
            ],
            pistol: [
                'assets/audio/weapons/pistol_1911_a.wav'
            ],
            rifle: [
                'assets/audio/weapons/rifle_ar15_a.wav',
                'assets/audio/weapons/rifle_ar15_b.wav'
            ],
            flamethrower: [
                'assets/audio/weapons/flamethrower_fire.ogg'
            ],
            reload: [
                'assets/audio/rpg/metalLatch.ogg',
                'assets/audio/rpg/drawKnife3.ogg'
            ],
            pickup: [
                'assets/audio/rpg/handleCoins2.ogg'
            ],
            death: [
                'assets/audio/zombies/zombie-24.wav'
            ],
            explosion: [
                'assets/audio/weapons/shotgun_shotty.wav'
            ],
            ui: [
                'assets/audio/rpg/metalClick.ogg',
                'assets/audio/rpg/bookClose.ogg'
            ],
            timer: [
                'assets/audio/rpg/cloth2.ogg'
            ],
            wind: [
                'assets/audio/rpg/cloth1.ogg',
                'assets/audio/rpg/cloth2.ogg'
            ],
            chestOpen: [
                'assets/audio/rpg/bookOpen.ogg',
                'assets/audio/rpg/metalLatch.ogg',
                'assets/audio/rpg/handleCoins.ogg'
            ],
            chestNearby: [
                'assets/audio/rpg/metalClick.ogg',
                'assets/audio/rpg/handleCoins2.ogg'
            ],
            metal: [
                'assets/audio/rpg/metalPot1.ogg',
                'assets/audio/rpg/metalPot2.ogg',
                'assets/audio/rpg/metalPot3.ogg'
            ],
            storm: [],
            rain: [
                'assets/audio/weather_rain.ogg'
            ],
            music: []
        };

        this._lazyInitCalled = false;
    }

    _ensureLazyInit() {
        if (!this._initPromise) {
            this._lazyInitCalled = true;
            this._initPromise = this.init().catch(() => false);
        }
        return this._initPromise;
    }

    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.musicGain = this.audioContext.createGain();
            this.masterSfxGain = this.audioContext.createGain();
            this.sfxGain = this.masterSfxGain;
            this.categoryGains.weapon = this.audioContext.createGain();
            this.categoryGains.ambient = this.audioContext.createGain();
            this.categoryGains.ui = this.audioContext.createGain();
            this.categoryGains.zombie = this.audioContext.createGain();
            this.categoryGains.weather = this.audioContext.createGain();
            this.categoryGains.sfx = this.audioContext.createGain();
            this.reverb = this.audioContext.createConvolver();
            this.reverbGain = this.audioContext.createGain();
            this.sfxLimiter = this.audioContext.createDynamicsCompressor();

            this.reverb.buffer = this.createImpulse(1.6, 1.8);
            this.reverbGain.gain.value = 0.055;
            this.sfxLimiter.threshold.value = -6;
            this.sfxLimiter.knee.value = 3;
            this.sfxLimiter.ratio.value = 4;
            this.sfxLimiter.attack.value = 0.0015;
            this.sfxLimiter.release.value = 0.08;

            this.musicGain.connect(this.audioContext.destination);
            Object.keys(this.categoryGains).forEach((key) => {
                const gainNode = this.categoryGains[key];
                if (!gainNode) return;
                gainNode.gain.value = this.categoryBaseVolumes[key] ?? 1;
                gainNode.connect(this.masterSfxGain);
            });
            this.masterSfxGain.connect(this.sfxLimiter);
            this.sfxLimiter.connect(this.audioContext.destination);
            this.reverb.connect(this.reverbGain);
            this.reverbGain.connect(this.audioContext.destination);

            this.musicGain.gain.value = this.musicVolume;
            this.masterSfxGain.gain.value = this.getAudibleVolume(this.sfxVolume);
            this.loadSamples().catch(() => {});
            this.bindUnlockHandlers();
            return true;
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    bindUnlockHandlers() {
        if (this._unlockHandlersBound || typeof window === 'undefined') return;
        this._unlockHandlersBound = true;
        const unlockOnce = () => {
            this._ensureLazyInit();
            this.unlock().finally(() => {
                window.removeEventListener('pointerdown', unlockOnce);
                window.removeEventListener('touchstart', unlockOnce);
                window.removeEventListener('mousedown', unlockOnce);
                window.removeEventListener('keydown', unlockOnce);
            });
        };
        window.addEventListener('pointerdown', unlockOnce, { passive: true });
        window.addEventListener('touchstart', unlockOnce, { passive: true });
        window.addEventListener('mousedown', unlockOnce, { passive: true });
        window.addEventListener('keydown', unlockOnce, { passive: true });
    }
    async unlock() {
        await this._ensureLazyInit();
        if (!this.audioContext) return false;
        if (this.audioContext.state === 'running') return true;
        if (this._unlockInProgress) return this._unlockInProgress;
        this._unlockInProgress = this.audioContext.resume()
            .then(() => this.audioContext.state === 'running')
            .catch(() => false)
            .finally(() => {
                this._unlockInProgress = null;
            });
        return this._unlockInProgress;
    }
    createImpulse(duration, decay) {
        const ctx = this.audioContext;
        const rate = ctx.sampleRate;
        const length = Math.floor(rate * duration);
        const impulse = ctx.createBuffer(2, length, rate);
        for (let ch = 0; ch < 2; ch++) {
            const data = impulse.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }
        return impulse;
    }

    createRainNoiseBuffer(duration = 2.4) {
        if (!this.audioContext) return null;
        if (this.rainNoiseBuffer) return this.rainNoiseBuffer;
        const rate = this.audioContext.sampleRate;
        const length = Math.max(1, Math.floor(rate * duration));
        const buffer = this.audioContext.createBuffer(1, length, rate);
        const data = buffer.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            // Soft filtered noise to avoid crackling and create rain-like texture.
            previous = previous * 0.985 + white * 0.015;
            const hiss = (Math.random() * 2 - 1) * 0.08;
            data[i] = clamp(previous * 0.95 + hiss, -1, 1);
        }
        this.rainNoiseBuffer = buffer;
        return buffer;
    }

    async loadSamples() {
        if (this.sampleLoadStarted) return this.sampleLoadPromise;
        this.sampleLoadStarted = true;
        const paths = [...new Set(Object.values(this.sampleCatalog).flat())];
        this.sampleLoadPromise = Promise.all(paths.map(async path => {
            try {
                const response = await fetch(path, { cache: 'force-cache' });
                if (!response.ok) return;
                const buffer = await this.audioContext.decodeAudioData(await response.arrayBuffer());
                this.sampleBuffers.set(path, buffer);
            } catch (_) {}
        }));
        return this.sampleLoadPromise;
    }

    setMusicVolume(value = 0.14) {
        this.musicVolume = clamp(value * 1.18, 0, 0.5);
        if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
    }

    setSfxVolume(value = 0.48) {
        this.sfxVolume = clamp(value, 0, 1);
        if (this.masterSfxGain) this.masterSfxGain.gain.value = this.getAudibleVolume(this.sfxVolume);
    }

    getAudibleVolume(value) {
        const normalized = clamp(Number(value) || 0, 0, 1);
        return normalized === 0 ? 0 : 0.34 + Math.sqrt(normalized) * 0.66;
    }

    setCategoryVolume(category, value = 1) {
        const key = String(category || '').toLowerCase();
        if (!this.categoryGains[key]) return;
        this.categoryBaseVolumes[key] = clamp(value, 0, 2.5);
        this.categoryGains[key].gain.value = this.categoryBaseVolumes[key];
    }

    getCategoryGain(category) {
        const key = String(category || '').toLowerCase();
        return this.categoryGains[key] || this.categoryGains.sfx || this.masterSfxGain;
    }

    createPanner(position) {
        const ctx = this.audioContext;
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 2.5;
        panner.maxDistance = 80;
        panner.rolloffFactor = 1.45;
        if (position) {
            panner.positionX.value = Number.isFinite(position.x) ? position.x : 0;
            panner.positionY.value = Number.isFinite(position.y) ? position.y : 0;
            panner.positionZ.value = Number.isFinite(position.z) ? position.z : 0;
        }
        return panner;
    }

    updateListener(position, forward) {
        if (!this.audioContext) return;
        // SAFETY: Guard against NaN/Infinity from camera position
        if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) return;
        if (!Number.isFinite(forward.x) || !Number.isFinite(forward.y) || !Number.isFinite(forward.z)) return;
        this.listenerPosition.x = position.x;
        this.listenerPosition.y = position.y;
        this.listenerPosition.z = position.z;

        const listener = this.audioContext.listener;
        if (listener.positionX) {
            listener.positionX.value = position.x;
            listener.positionY.value = position.y;
            listener.positionZ.value = position.z;
            listener.forwardX.value = forward.x;
            listener.forwardY.value = forward.y;
            listener.forwardZ.value = forward.z;
            listener.upX.value = 0;
            listener.upY.value = 1;
            listener.upZ.value = 0;
        } else if (listener.setPosition) {
            listener.setPosition(position.x, position.y, position.z);
            listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
        }
    }

    connectSfx(node, position, category = 'sfx') {
        if (!this.audioContext) return node;
        const targetGain = this.getCategoryGain(category);
        if (position) {
            const panner = this.createPanner(position);
            node.connect(panner);
            panner.connect(targetGain);
        } else {
            node.connect(targetGain);
        }
        return node;
    }

    pickSample(pathList) {
        if (!pathList || !pathList.length) return null;
        const path = pathList[(Math.random() * pathList.length) | 0];
        return this.sampleBuffers.get(path) ? path : null;
    }

    async playSample(pathList, options = {}) {
        this._ensureLazyInit();
        if (!this.audioContext) return false;
        if (options.position) {
            const dx = options.position.x - this.listenerPosition.x;
            const dy = options.position.y - this.listenerPosition.y;
            const dz = options.position.z - this.listenerPosition.z;
            if (dx * dx + dy * dy + dz * dz > 6400) return true;
        }
        if (this.audioContext.state !== 'running') {
            await this.unlock();
            if (this.audioContext.state !== 'running') return false;
        }
        const path = this.pickSample(pathList);
        if (!path) return false;
        const buffer = this.sampleBuffers.get(path);
        if (!buffer) return false;

        const ctx = this.audioContext;
        const now = ctx.currentTime + (options.delay || 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = !!options.loop;
        const rate = Number.isFinite(options.rate) ? options.rate : (Number.isFinite(options.rateMin) ? options.rateMin : 1) + Math.random() * ((Number.isFinite(options.rateMax) ? options.rateMax : 1) - (Number.isFinite(options.rateMin) ? options.rateMin : 1));
        source.playbackRate.value = clamp(rate, 0.5, 2.25);

        const gainNode = ctx.createGain();
        gainNode.gain.value = clamp(Number.isFinite(options.volume) ? options.volume : 0.2, 0, 2);

        const category = String(options.category || 'sfx').toLowerCase();
        const priority = Number.isFinite(options.priority) ? options.priority : (category === 'ui' ? 3 : category === 'weapon' ? 2 : 1);
        if (!this.reserveCategoryVoice(category, source, gainNode, priority)) {
            source.disconnect();
            gainNode.disconnect();
            return true;
        }

        source.connect(gainNode);
        if (options.reverbSend > 0) {
            const send = ctx.createGain();
            send.gain.value = clamp(options.reverbSend, 0, 1);
            gainNode.connect(send);
            if (options.position) {
                const panner = this.createPanner(options.position);
                send.connect(panner);
                panner.connect(this.reverb);
            } else {
                send.connect(this.reverb);
            }
        }

        this.connectSfx(gainNode, options.position || null, category);
        const voiceKey = options.voiceKey ? String(options.voiceKey) : null;
        if (voiceKey) {
            const previous = this.activeSampleVoices.get(voiceKey);
            if (previous) {
                const fadeAt = ctx.currentTime;
                try {
                    previous.gain.gain.cancelScheduledValues(fadeAt);
                    previous.gain.gain.setValueAtTime(Math.max(0.0001, previous.gain.gain.value), fadeAt);
                    previous.gain.gain.exponentialRampToValueAtTime(0.0001, fadeAt + 0.018);
                    previous.source.stop(fadeAt + 0.02);
                } catch (_) {}
            }
            this.activeSampleVoices.set(voiceKey, { source, gain: gainNode });
            source.addEventListener('ended', () => {
                if (this.activeSampleVoices.get(voiceKey)?.source === source) this.activeSampleVoices.delete(voiceKey);
            }, { once: true });
        }
        const offset = clamp(Number.isFinite(options.offset) ? options.offset : 0, 0, Math.max(0, buffer.duration - 0.01));
        source.start(now, offset);
        if (!source.loop) {
            const availableDuration = Math.max(0.01, buffer.duration - offset);
            const maxDuration = options.maxDuration || availableDuration;
            const end = now + clamp(maxDuration, 0.01, availableDuration);
            const fade = Math.min(0.04, Math.max(0.008, (end - now) * 0.18));
            gainNode.gain.setValueAtTime(gainNode.gain.value, Math.max(now, end - fade));
            gainNode.gain.exponentialRampToValueAtTime(0.0001, end);
            source.stop(end + 0.005);
        }
        return true;
    }

    async fallbackTone(type, fromFreq, toFreq, duration, volume = 0.1, position = null, category = 'sfx') {
        this._ensureLazyInit();
        if (!this.audioContext) return;
        if (this.audioContext.state !== 'running') {
            await this.unlock();
            if (this.audioContext.state !== 'running') return;
        }
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(fromFreq, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), now + duration);
        gain.gain.setValueAtTime(clamp(volume, 0.001, 0.8), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        this.connectSfx(gain, position, category);
        osc.start(now);
        osc.stop(now + duration);
    }

    async playNoiseBurst({ duration = 0.14, volume = 0.12, highpass = 300, lowpass = 2800, position = null, category = 'weapon' } = {}) {
        this._ensureLazyInit();
        if (!this.audioContext) return;
        if (this.audioContext.state !== 'running') {
            await this.unlock();
            if (this.audioContext.state !== 'running') return;
        }
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const noise = ctx.createBufferSource();
        noise.buffer = this.createRainNoiseBuffer(0.5);
        noise.loop = false;

        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = highpass;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = lowpass;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(clamp(volume, 0.01, 0.65), now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.03, duration));

        noise.connect(hp);
        hp.connect(lp);
        lp.connect(gain);
        this.connectSfx(gain, position, category);

        noise.start(now);
        noise.stop(now + Math.max(0.03, duration) + 0.03);
    }

    async playProceduralShot(kind = 'generic', volume = 0.14, position = null, category = 'weapon') {
        this._ensureLazyInit();
        if (!this.audioContext) return;
        if (this.audioContext.state !== 'running') {
            await this.unlock();
            if (this.audioContext.state !== 'running') return;
        }
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = kind === 'shotgun' ? 1200 : kind === 'flamethrower' ? 2200 : 2600;
        g.gain.value = clamp(volume, 0.01, 0.5);
        f.connect(g);
        this.connectSfx(g, position, category);

        const mk = (type, a, b, d, gainMul = 1) => {
            const o = ctx.createOscillator();
            const og = ctx.createGain();
            o.type = type;
            o.frequency.setValueAtTime(a, now);
            o.frequency.exponentialRampToValueAtTime(Math.max(25, b), now + d);
            og.gain.setValueAtTime(0.0001, now);
            og.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * gainMul), now + 0.01);
            og.gain.exponentialRampToValueAtTime(0.0001, now + d);
            o.connect(og);
            og.connect(f);
            o.start(now);
            o.stop(now + d);
        };

        if (kind === 'bow') {
            mk('triangle', 760, 180, 0.18, 0.45);
            mk('sine', 320, 120, 0.14, 0.22);
        } else if (kind === 'laser') {
            mk('sawtooth', 1200, 280, 0.16, 0.34);
            mk('square', 680, 300, 0.11, 0.18);
        } else if (kind === 'shotgun') {
            mk('square', 180, 60, 0.28, 0.52);
            mk('triangle', 280, 70, 0.24, 0.3);
        } else if (kind === 'flamethrower') {
            mk('sawtooth', 420, 130, 0.22, 0.28);
            mk('triangle', 220, 90, 0.26, 0.24);
        } else if (kind === 'zone') {
            mk('triangle', 170, 85, 0.26, 0.2);
        } else if (kind === 'storm') {
            mk('sine', 95, 38, 0.52, 0.24);
        } else {
            mk('triangle', 500, 120, 0.2, 0.2);
        }
    }

    canPlayWeaponSfx(type, minInterval = 0) {
        const now = performance.now() / 1000;
        const key = String(type || 'generic');
        const interval = Math.max(0, Number.isFinite(minInterval) ? minInterval : 0);
        const last = this.lastWeaponSfxTime[key] || 0;
        if (now - last < interval) return false;
        if (key.includes(':id:')) {
            const npcInterval = this.isMobileDevice ? 0.22 : 0.17;
            if (now - this.lastNpcWeaponSfxTime < npcInterval) return false;
            this.lastNpcWeaponSfxTime = now;
        }
        this.lastWeaponSfxTime[key] = now;
        return true;
    }

    reserveCategoryVoice(category, source, gain, priority) {
        const limit = this.categoryVoiceLimits[category] || 6;
        const voices = this.activeCategoryVoices.get(category) || [];
        while (voices.length >= limit) {
            let candidate = 0;
            for (let i = 1; i < voices.length; i++) {
                if (voices[i].priority < voices[candidate].priority) candidate = i;
            }
            if (voices[candidate].priority > priority) return false;
            const [voice] = voices.splice(candidate, 1);
            try { voice.source.stop(); } catch (_) {}
            try { voice.source.disconnect(); } catch (_) {}
            try { voice.gain.disconnect(); } catch (_) {}
        }
        const voice = { source, gain, priority };
        voices.push(voice);
        this.activeCategoryVoices.set(category, voices);
        source.addEventListener('ended', () => {
            const active = this.activeCategoryVoices.get(category);
            if (!active) return;
            const index = active.indexOf(voice);
            if (index >= 0) active.splice(index, 1);
        }, { once: true });
        return true;
    }

    getEmitterSfxScale(emitterKey) {
        return String(emitterKey || '').startsWith('id:') ? (this.isMobileDevice ? 0.032 : 0.045) : 1;
    }

    getEmitterSfxPriority(emitterKey) {
        return String(emitterKey || '').startsWith('id:') ? 0 : 3;
    }

    startAmbient() {
        if (!this.audioContext || this.ambientRunning) return;
        this.ambientRunning = true;
        this.setBiomeAmbience('center');
    }

    setBiomeAmbience(biome) {
        if (!this.audioContext || !this.ambientRunning || this.currentBiomeAmbient === biome) return;
        const profiles = {
            center: { type: 'lowpass', frequency: 540, gain: 0.003, rate: 0.74 },
            forest: { type: 'lowpass', frequency: 920, gain: 0.007, rate: 0.88 },
            maze: { type: 'lowpass', frequency: 610, gain: 0.005, rate: 0.76 },
            military: { type: 'lowpass', frequency: 720, gain: 0.005, rate: 0.8 },
            ice: { type: 'lowpass', frequency: 1100, gain: 0.006, rate: 0.84 }
        };
        const profile = profiles[biome] || profiles.center;
        const now = this.audioContext.currentTime;
        if (this.ambientNodes) {
            this.ambientNodes.gain.gain.cancelScheduledValues(now);
            this.ambientNodes.gain.gain.linearRampToValueAtTime(0, now + 0.35);
            const old = this.ambientNodes;
            setTimeout(() => {
                try { old.source.stop(); } catch (_) {}
                old.source.disconnect();
                old.filter.disconnect();
                old.gain.disconnect();
            }, 450);
        }
        if (profile.gain <= 0) {
            this.ambientNodes = null;
            this.currentBiomeAmbient = biome;
            return;
        }
        const source = this.audioContext.createBufferSource();
        const filter = this.audioContext.createBiquadFilter();
        const gain = this.audioContext.createGain();
        source.buffer = this.createRainNoiseBuffer(4);
        source.loop = true;
        source.playbackRate.value = profile.rate;
        filter.type = profile.type;
        filter.frequency.value = profile.frequency;
        filter.Q.value = 0.12;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(profile.gain * (this.isMobileDevice ? 0.8 : 1), now + 0.8);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.getCategoryGain('ambient'));
        source.start();
        this.ambientNodes = { source, filter, gain };
        this.currentBiomeAmbient = biome;
    }

    stopAmbient() {
        this.ambientRunning = false;
        for (const timer of this.ambientTimers) clearInterval(timer);
        this.ambientTimers = [];
        if (this.ambientNodes) {
            try { this.ambientNodes.source.stop(); } catch (_) {}
            this.ambientNodes.source.disconnect();
            this.ambientNodes.filter.disconnect();
            this.ambientNodes.gain.disconnect();
            this.ambientNodes = null;
        }
        this.currentBiomeAmbient = null;
        this.stopWeatherLoop();
    }

    playGrieverMove(position) {
        return false;
    }

    playGrieverRoar(position) {
        this.playSample(this.sampleCatalog.zombieAttack, { volume: 0.2, rateMin: 0.5, rateMax: 0.8, position, reverbSend: 0.35, category: 'zombie' });
    }

    playGrieverAttack(position) {
        this.playSample(this.sampleCatalog.hit, { volume: 0.2, rateMin: 0.6, rateMax: 0.95, position, reverbSend: 0.16, category: 'weapon' });
    }

    playStoneDoorClose(position) {
        return false;
    }

    playBoxArrival(position) {
        return false;
    }

    playFootstep(volume = 1) {
        const gainScale = clamp(volume, 0.15, 1.2) * (this.footstepWeatherFactor || 1);
        this.playSample(this.sampleCatalog.footsteps, {
            volume: (this.isMobileDevice ? 0.14 : 0.2) * gainScale,
            rateMin: 0.92,
            rateMax: 1.08,
            category: 'sfx',
            voiceKey: 'footstep:player',
            maxDuration: 0.24
        });
    }

    playHit(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`hit:${emitterKey}`, 0.055)) return;
        this.playSample(this.sampleCatalog.hit, { volume: (this.isMobileDevice ? 0.26 : 0.34) * this.getEmitterSfxScale(emitterKey), rateMin: 0.95, rateMax: 1.12, reverbSend: 0.06, position, category: 'weapon', maxDuration: 0.2 });
    }

    playStorm(position) {
        this.playSample(this.sampleCatalog.storm, { volume: this.isMobileDevice ? 0.07 : 0.11, rateMin: 0.8, rateMax: 1.2, position, category: 'weather', maxDuration: 0.8 });
    }

    startRadiationRain(position = null) {
        if (!this.audioContext || this.radiationRainNodes) return;
        const ctx = this.audioContext;
        const rainPath = this.pickSample(this.sampleCatalog.rain);
        const buffer = rainPath ? this.sampleBuffers.get(rainPath) : null;
        const source = ctx.createBufferSource();
        source.buffer = buffer || this.createRainNoiseBuffer();
        if (!source.buffer) return;
        source.loop = true;
        source.playbackRate.value = buffer ? 0.96 : 0.82;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 180;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = buffer ? 4300 : 2400;
        const gain = ctx.createGain();
        gain.gain.value = this.isMobileDevice ? 0.026 : 0.034;
        source.connect(hp);
        hp.connect(lp);
        lp.connect(gain);
        gain.connect(this.getCategoryGain('weather'));
        source.start();

        const radiationTimer = setInterval(() => {
            const clicks = 1 + ((Math.random() * 3) | 0);
            for (let i = 0; i < clicks; i++) {
                setTimeout(() => {
                    if (!this.radiationRainNodes) return;
                    this.playNoiseBurst({
                        duration: 0.018 + Math.random() * 0.014,
                        volume: this.isMobileDevice ? 0.012 : 0.018,
                        highpass: 1900,
                        lowpass: 7200,
                        category: 'weather'
                    });
                }, i * (70 + Math.random() * 90));
            }
        }, 850);

        this.radiationRainNodes = { source, hp, lp, gain, radiationTimer };
    }

    stopRadiationRain() {
        if (!this.radiationRainNodes) return;
        try { this.radiationRainNodes.source?.stop?.(); } catch {}
        try { this.radiationRainNodes.source?.disconnect?.(); } catch {}
        try { this.radiationRainNodes.hp?.disconnect?.(); } catch {}
        try { this.radiationRainNodes.lp?.disconnect?.(); } catch {}
        try { this.radiationRainNodes.gain?.disconnect?.(); } catch {}
        if (this.radiationRainNodes.radiationTimer) clearInterval(this.radiationRainNodes.radiationTimer);
        this.radiationRainNodes = null;
    }

    playHurt(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`hurt:${emitterKey}`, emitterKey === 'global' ? 0.08 : 0.2)) return;
        const scale = this.getEmitterSfxScale(emitterKey);
        this.playSample(this.sampleCatalog.hurt, {
            volume: (this.isMobileDevice ? 0.14 : 0.2) * scale,
            rateMin: 0.82,
            rateMax: 1.08,
            position,
            category: 'sfx',
            priority: this.getEmitterSfxPriority(emitterKey),
            voiceKey: `hurt:${emitterKey}`,
            maxDuration: 0.28
        });
    }

    playPlayerHurt() {
        if (!this.canPlayWeaponSfx('hurt:player', 0.1)) return;
        this.playSample(this.sampleCatalog.playerHurt, {
            volume: this.isMobileDevice ? 0.34 : 0.42,
            rateMin: 0.9,
            rateMax: 1.04,
            category: 'sfx',
            priority: 3,
            voiceKey: 'hurt:player',
            maxDuration: 0.3
        });
    }

    playNpcHurt(position = null, emitterKey = 'npc') {
        if (!this.canPlayWeaponSfx(`hurt:${emitterKey}`, 0.16)) return;
        this.playSample(this.sampleCatalog.npcHurt, {
            volume: this.isMobileDevice ? 0.14 : 0.2,
            rateMin: 0.88,
            rateMax: 1.12,
            position,
            category: 'sfx',
            priority: 1,
            voiceKey: `hurt:${emitterKey}`,
            maxDuration: 0.26
        });
    }

    playZombieAttack(position = null, opts = null) {
        const variant = opts?.variant || 'normal';
        const emitterKey = `id:${opts?.emitterKey ?? 'zombie'}`;
        if (!this.canPlayZombieSfx('attack', emitterKey, 0.4)) return;
        const profiles = {
            runner: [0, 1.1, 1.28],
            normal: [2, 0.92, 1.08],
            heavy: [4, 0.7, 0.86],
            crawler: [6, 1.28, 1.5],
            toxic: [8, 0.76, 0.94]
        };
        const [offset, rateMin, rateMax] = profiles[variant] || profiles.normal;
        const rates = [rateMin, rateMax];
        this.playSample(this.sampleCatalog.zombieAttack.slice(offset, offset + 2), { volume: this.isMobileDevice ? 0.16 : 0.24, rateMin: rates[0], rateMax: rates[1], position, reverbSend: 0.08, category: 'zombie', priority: 0, maxDuration: variant === 'heavy' ? 0.65 : 0.42, voiceKey: `zombie:attack:${emitterKey}` });
    }

    playZombieAbility(position = null, opts = null) {
        const variant = opts?.variant || 'normal';
        const emitterKey = `id:${opts?.emitterKey ?? 'zombie'}`;
        if (!this.canPlayZombieSfx('ability', emitterKey, 0.7)) return;
        const profiles = {
            runner: [0, 1.45, 1.75, 0.32],
            crawler: [6, 1.55, 1.9, 0.46],
            toxic: [8, 0.72, 0.88, 0.58],
            acidImpact: [8, 1.15, 1.4, 0.3],
            heavy: [4, 0.55, 0.72, 0.72]
        };
        const [offset, rateMin, rateMax, duration] = profiles[variant] || profiles.heavy;
        this.playSample(this.sampleCatalog.zombieAttack.slice(offset, offset + 2), {
            volume: this.isMobileDevice ? 0.2 : 0.3,
            rateMin,
            rateMax,
            position,
            reverbSend: variant === 'toxic' || variant === 'acidImpact' ? 0.18 : 0.08,
            category: 'zombie',
            priority: 1,
            maxDuration: duration,
            voiceKey: `zombie:ability:${emitterKey}`
        });
    }

    playRemoteFootstep(position, emitterKey = 'npc', volume = 1) {
        if (!this.canPlayWeaponSfx(`step:${emitterKey}`, 0.38)) return;
        this.playSample(this.sampleCatalog.footsteps, {
            volume: (this.isMobileDevice ? 0.1 : 0.14) * clamp(volume, 0.2, 1),
            rateMin: 0.9,
            rateMax: 1.1,
            position,
            category: 'sfx',
            priority: 0,
            voiceKey: `footstep:${emitterKey}`,
            maxDuration: 0.22
        });
    }

    playZoneDamage() {
        this.playSample(this.sampleCatalog.zoneDamage, { volume: this.isMobileDevice ? 0.08 : 0.11, rateMin: 0.6, rateMax: 1.4, category: 'weather', maxDuration: 0.3 });
    }

    playZombieMoan(position = null, opts = null) {
        const variant = opts?.variant || 'normal';
        const emitterKey = `id:${opts?.emitterKey ?? 'zombie'}`;
        if (!this.canPlayZombieSfx('moan', emitterKey, 3.5)) return;
        const profiles = {
            runner: [0, 1.12, 1.3],
            normal: [2, 0.9, 1.06],
            heavy: [4, 0.66, 0.82],
            crawler: [6, 1.3, 1.52],
            toxic: [8, 0.72, 0.9]
        };
        const [offset, rateMin, rateMax] = profiles[variant] || profiles.normal;
        const rates = [rateMin, rateMax];
        this.playSample(this.sampleCatalog.zombieMoan.slice(offset, offset + 2), { volume: this.isMobileDevice ? 0.13 : 0.2, rateMin: rates[0], rateMax: rates[1], position, reverbSend: 0.1, category: 'zombie', priority: 0, maxDuration: variant === 'heavy' ? 1.1 : 0.75, voiceKey: `zombie:moan:${emitterKey}` });
    }

    canPlayZombieSfx(kind, emitterKey, emitterInterval) {
        const now = performance.now() * 0.001;
        const globalInterval = kind === 'attack'
            ? (this.isMobileDevice ? 0.16 : 0.11)
            : (this.isMobileDevice ? 0.55 : 0.4);
        if (now - (this.lastZombieSfxTime[kind] || 0) < globalInterval) return false;
        const key = `${kind}:${emitterKey}`;
        if (now - (this.lastZombieEmitterSfx.get(key) || 0) < emitterInterval) return false;
        this.lastZombieSfxTime[kind] = now;
        this.lastZombieEmitterSfx.set(key, now);
        return true;
    }

    fallbackZombieMoan(type, freq, dur, vol, pos, cat) {
        this._ensureLazyInit();
        if (!this.audioContext) return;
        const now = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const panner = this.createPanner(pos);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + dur);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(this.categoryGains.zombie);
        osc.start(now);
        osc.stop(now + dur + 0.05);
    }

    fallbackZombieAttack(type, freq, dur, vol, pos, cat) {
        this._ensureLazyInit();
        if (!this.audioContext) return;
        const now = this.audioContext.currentTime;
        const osc = this.audioContext.createOscillator();
        const osc2 = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const panner = this.createPanner(pos);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.4, now + dur * 0.5);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + dur);
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(freq * 1.5, now);
        osc2.frequency.exponentialRampToValueAtTime(freq * 0.3, now + dur);
        gain.gain.setValueAtTime(vol * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(panner);
        panner.connect(this.categoryGains.zombie);
        osc.start(now);
        osc.stop(now + dur + 0.05);
        osc2.start(now);
        osc2.stop(now + dur + 0.05);
    }

    playReload() {
        this.playSample(this.sampleCatalog.reload, { volume: this.isMobileDevice ? 0.15 : 0.22, rateMin: 0.9, rateMax: 1.15, category: 'sfx' });
    }

    playPickup() {
        this.playSample(this.sampleCatalog.pickup, { volume: this.isMobileDevice ? 0.2 : 0.28, rateMin: 1.0, rateMax: 1.1, category: 'sfx' });
    }

    playDeath(position = null) {
        this.playSample(this.sampleCatalog.death, { volume: this.isMobileDevice ? 0.3 : 0.42, rateMin: 0.7, rateMax: 0.95, position, category: 'sfx', maxDuration: 0.6 });
    }

    playExplosion(position = null) {
        this.playSample(this.sampleCatalog.explosion, { volume: this.isMobileDevice ? 0.4 : 0.55, rateMin: 0.8, rateMax: 1.0, position, category: 'sfx', maxDuration: 0.8 });
    }

    playUISound() {
        this.playSample(this.sampleCatalog.ui, { volume: this.isMobileDevice ? 0.1 : 0.15, rateMin: 1.0, rateMax: 1.0, category: 'ui' });
    }

    playBowShot(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`bow:${emitterKey}`, this.weaponSfxCooldown.bow)) return;
        this.playSample(this.sampleCatalog.bow, { volume: (this.isMobileDevice ? 0.72 : 0.82) * this.getEmitterSfxScale(emitterKey), rateMin: 0.99, rateMax: 1.01, position, category: 'weapon', priority: this.getEmitterSfxPriority(emitterKey), maxDuration: 0.38 })
            .then(played => { if (!played) this.playProceduralShot('bow', 0.2 * this.getEmitterSfxScale(emitterKey), position); });
    }

    playLaser(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`laser:${emitterKey}`, this.weaponSfxCooldown.laser)) return;
        const scale = this.getEmitterSfxScale(emitterKey);
        this.playSample(this.sampleCatalog.laser, { volume: (this.isMobileDevice ? 0.72 : 0.82) * scale, rateMin: 0.99, rateMax: 1.01, position, category: 'weapon', priority: this.getEmitterSfxPriority(emitterKey), maxDuration: 0.3 })
            .then(played => { if (!played) this.playProceduralShot('laser', 0.2 * scale, position); });
    }

    playShotgun(volume = 1, position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`shotgun:${emitterKey}`, this.weaponSfxCooldown.shotgun)) return;
        const scaled = clamp(volume, 0.1, 1.5);
        const scale = this.getEmitterSfxScale(emitterKey);
        this.playSample(this.sampleCatalog.shotgun, {
            volume: (this.isMobileDevice ? 0.88 : 1.2) * scaled * scale,
            rateMin: 0.98,
            rateMax: 1.02,
            reverbSend: 0.015,
            maxDuration: 0.56,
            position,
            category: 'weapon',
            priority: this.getEmitterSfxPriority(emitterKey)
        }).then(played => { if (!played) this.playProceduralShot('shotgun', 0.32 * scaled * scale, position); });
    }

    playPistol(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`pistol:${emitterKey}`, this.weaponSfxCooldown.pistol)) return;
        const scale = this.getEmitterSfxScale(emitterKey);
        this.playSample(this.sampleCatalog.pistol, {
            volume: (this.isMobileDevice ? 1.2 : 1.35) * scale,
            rateMin: 0.98,
            rateMax: 1.03,
            reverbSend: 0.01,
            maxDuration: 0.35,
            position,
            category: 'weapon',
            priority: this.getEmitterSfxPriority(emitterKey)
        }).then(played => { if (!played) this.playNoiseBurst({ duration: 0.11, volume: 0.24 * scale, highpass: 180, lowpass: 3600, position, category: 'weapon' }); });
    }

    playRifle(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`rifle:${emitterKey}`, this.weaponSfxCooldown.rifle)) return;
        const scale = this.getEmitterSfxScale(emitterKey);
        this.playSample(this.sampleCatalog.rifle, {
            volume: (this.isMobileDevice ? 1.05 : 1.2) * scale,
            rateMin: 0.98,
            rateMax: 1.02,
            reverbSend: 0.015,
            maxDuration: 0.29,
            position,
            category: 'weapon',
            priority: this.getEmitterSfxPriority(emitterKey)
        }).then(played => { if (!played) this.playNoiseBurst({ duration: 0.13, volume: 0.28 * scale, highpass: 120, lowpass: 3200, position, category: 'weapon' }); });
    }

    playMachinegun(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`machinegun:${emitterKey}`, this.weaponSfxCooldown.machinegun)) return;
        const scale = this.getEmitterSfxScale(emitterKey);
        return this.playSample(this.sampleCatalog.machinegun, {
            volume: (this.isMobileDevice ? 0.95 : 1.08) * scale,
            rateMin: 0.99,
            rateMax: 1.04,
            reverbSend: 0.005,
            maxDuration: 0.125,
            position,
            category: 'weapon',
            priority: this.getEmitterSfxPriority(emitterKey)
        }).then(played => played || this.playSample(this.sampleCatalog.rifle, {
            volume: (this.isMobileDevice ? 0.86 : 0.98) * scale,
            rateMin: 1.08,
            rateMax: 1.18,
            reverbSend: 0.005,
            maxDuration: 0.125,
            position,
            category: 'weapon',
            priority: this.getEmitterSfxPriority(emitterKey)
        })).then(played => {
            if (!played) this.playNoiseBurst({ duration: 0.09, volume: 0.22 * scale, highpass: 150, lowpass: 3500, position, category: 'weapon' });
            return played;
        });
    }

    playFlamethrower(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`flamethrower:${emitterKey}`, this.weaponSfxCooldown.flamethrower)) return;
        const scale = this.getEmitterSfxScale(emitterKey);
        this.playSample(this.sampleCatalog.flamethrower, {
            volume: (this.isMobileDevice ? 0.64 : 0.78) * scale,
            rateMin: 0.96,
            rateMax: 1.04,
            reverbSend: 0.025,
            maxDuration: 0.16,
            position,
            category: 'weapon',
            voiceKey: `flamethrower:${emitterKey}`,
            priority: this.getEmitterSfxPriority(emitterKey)
        }).then(played => { if (!played) this.playProceduralShot('flamethrower', 0.22 * scale, position); });
    }

    playTimerTick(volume = 1) {
        this.playSample(this.sampleCatalog.timer, {
            volume: (this.isMobileDevice ? 0.036 : 0.06) * clamp(volume, 0.4, 1.4),
            rateMin: 0.98,
            rateMax: 1.02,
            category: 'ui'
        });
    }

    playWind() {
        return false;
    }

    setWeatherState(nextState = 'clear') {
        const state = String(nextState || 'clear').toLowerCase();
        if (state === this.currentWeatherState) return;
        this.currentWeatherState = state;
        this.applyMusicWeatherProfile(state);
        if (this.weatherTransitionTimer) clearTimeout(this.weatherTransitionTimer);
        this.weatherTransitionTimer = null;
        this.stopWeatherLoop();
        this.footstepWeatherFactor = state === 'rain' ? 0.62 : state === 'snow' ? 0.82 : 1;
        if (state === 'clear') return;
        this.weatherTransitionTimer = setTimeout(() => {
            this.weatherTransitionTimer = null;
            if (this.currentWeatherState !== state) return;
            if (state === 'rain') {
                this.startWeatherLoop({
                    continuous: true,
                    category: 'weather',
                    volume: this.isMobileDevice ? 0.022 : 0.03,
                    sampleList: this.sampleCatalog.rain
                });
            } else if (state === 'snow') {
                this.startWeatherLoop({
                    intervalMs: this.isMobileDevice ? 4200 : 3400,
                    category: 'weather',
                    volume: this.isMobileDevice ? 0.01 : 0.014,
                    rateMin: 0.7,
                    rateMax: 0.95,
                    sampleList: this.sampleCatalog.wind,
                    fallback: () => this.playSample(this.sampleCatalog.wind, { volume: this.isMobileDevice ? 0.01 : 0.014, rateMin: 0.6, rateMax: 0.9, category: 'weather', maxDuration: 0.4 })
                });
            }
        }, 1100);
    }

    startWeatherLoop(options = {}) {
        this._ensureLazyInit();
        if (!this.audioContext) return;
        const {
            continuous = false,
            intervalMs = 1800,
            category = 'weather',
            volume = 0.04,
            rateMin = 0.9,
            rateMax = 1.1,
            sampleList = this.sampleCatalog.rain,
            fallback = null
        } = options;

        if (continuous) {
            const start = () => {
                if (this.currentWeatherState !== 'rain') return;
                const path = this.pickSample(sampleList);
                if (!path) {
                    this.weatherLoopNodes = { timer: setTimeout(start, 400) };
                    return;
                }
                const source = this.audioContext.createBufferSource();
                const gain = this.audioContext.createGain();
                source.buffer = this.sampleBuffers.get(path);
                source.loop = true;
                source.playbackRate.value = 1;
                gain.gain.setValueAtTime(0.0001, this.audioContext.currentTime);
                gain.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 1.8);
                source.connect(gain);
                this.connectSfx(gain, null, category);
                source.start();
                this.weatherLoopNodes = { source, gain };
            };
            start();
            return;
        }

        const tick = () => {
            const played = this.playSample(sampleList, {
                volume,
                rateMin,
                rateMax,
                reverbSend: 0.12,
                category
            });
            if (!played && typeof fallback === 'function') fallback();
        };

        tick();
        this.weatherLoopNodes = {
            timer: setInterval(tick, Math.max(900, intervalMs))
        };
    }

    stopWeatherLoop() {
        if (!this.weatherLoopNodes) return;
        const nodes = this.weatherLoopNodes;
        if (nodes.timer) clearInterval(nodes.timer);
        if (nodes.gain && this.audioContext) {
            const now = this.audioContext.currentTime;
            nodes.gain.gain.cancelScheduledValues(now);
            nodes.gain.gain.setValueAtTime(Math.max(0.0001, nodes.gain.gain.value), now);
            nodes.gain.gain.linearRampToValueAtTime(0.0001, now + 1.2);
            setTimeout(() => {
                try { nodes.source?.stop?.(); } catch (_) {}
                try { nodes.source?.disconnect?.(); } catch (_) {}
                try { nodes.gain?.disconnect?.(); } catch (_) {}
            }, 1250);
        } else {
            try { nodes.source?.stop?.(); } catch (_) {}
            try { nodes.source?.disconnect?.(); } catch (_) {}
            try { nodes.gain?.disconnect?.(); } catch (_) {}
        }
        this.weatherLoopNodes = null;
    }

    playChestOpen(position = null) {
        this.playSample(this.sampleCatalog.chestOpen, { volume: this.isMobileDevice ? 0.1 : 0.16, rateMin: 0.92, rateMax: 1.08, position, reverbSend: 0.12, category: 'sfx' });
    }

    playChestNearby() {
        return false;
    }

    playGlassStep(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`glass:${emitterKey}`, 0.085)) return;
        this.playSample(this.sampleCatalog.metal, {
            volume: this.isMobileDevice ? 0.07 : 0.1,
            rateMin: 1.05,
            rateMax: 1.22,
            position,
            reverbSend: 0.05,
            category: 'sfx',
            maxDuration: 0.12
        });
    }

    createSurvivalMusicBuffer() {
        if (!this.audioContext) return null;
        if (this.survivalMusicBuffer) return this.survivalMusicBuffer;
        const rate = this.audioContext.sampleRate;
        const duration = 24;
        const buffer = this.audioContext.createBuffer(2, rate * duration, rate);
        for (let channel = 0; channel < 2; channel++) {
            const data = buffer.getChannelData(channel);
            let noiseState = 7919 + channel * 104729;
            let air = 0;
            let drift = 0;
            for (let i = 0; i < data.length; i++) {
                const t = i / rate;
                noiseState = (noiseState * 1664525 + 1013904223) >>> 0;
                const white = noiseState / 2147483647.5 - 1;
                air = air * 0.982 + white * 0.018;
                drift = drift * 0.9993 + white * 0.0007;
                const fade = Math.min(1, t * 0.8, (duration - t) * 0.8);
                const breeze = (air - drift) * (0.034 + 0.009 * Math.sin(t * 0.11 + channel * 0.3));
                data[i] = breeze * fade;
            }
        }
        this.survivalMusicBuffer = buffer;
        return this.survivalMusicBuffer;
    }

    playMusic() {
        this._ensureLazyInit();
        if (!this.audioContext || this.musicStarted) return;
        this.musicStarted = true;

        const playMusicTheme = (index) => {
            if (!this.audioContext || !this.musicGain) return;
            const theme = this.sampleCatalog.music[index % this.sampleCatalog.music.length];
            const buffer = theme ? this.sampleBuffers.get(theme) : this.createSurvivalMusicBuffer();
            if (!buffer) return;

            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            source.connect(this.musicGain);
            source.start();
            this.musicSource = source;
            this.applyMusicWeatherProfile(this.currentWeatherState);

            clearTimeout(this.musicLoopTimer);
            if (this.sampleCatalog.music.length > 1) {
                this.musicLoopTimer = setTimeout(() => {
                    source.stop();
                    this.musicThemeIndex = (index + 1) % this.sampleCatalog.music.length;
                    playMusicTheme(this.musicThemeIndex);
                }, 180000);
            }
        };

        playMusicTheme(this.musicThemeIndex);
    }

    applyMusicWeatherProfile(state = 'clear') {
        if (!this.audioContext || !this.musicGain) return;
        const profile = state === 'rain'
            ? { gain: 0.72, rate: 0.92 }
            : state === 'snow'
                ? { gain: 0.82, rate: 0.96 }
                : { gain: 1, rate: 1 };
        const now = this.audioContext.currentTime;
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
        this.musicGain.gain.linearRampToValueAtTime(this.musicVolume * profile.gain, now + 2.5);
        if (this.musicSource?.playbackRate) {
            this.musicSource.playbackRate.cancelScheduledValues(now);
            this.musicSource.playbackRate.setValueAtTime(this.musicSource.playbackRate.value, now);
            this.musicSource.playbackRate.linearRampToValueAtTime(profile.rate, now + 2.5);
        }
    }
}




