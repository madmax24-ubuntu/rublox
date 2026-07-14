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
            weapon: 2.85,
            ambient: 0.62,
            ui: 0.8,
            zombie: 1.35,
            weather: 0.78,
            sfx: 0.85
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
        this.currentWeatherState = 'clear';
        this.footstepWeatherFactor = 1;
        this.musicStarted = false;
        this.musicLoopTimer = null;
        this.musicThemeIndex = 0;
        this.rainNoiseBuffer = null;
        this.musicVolume = this.isMobileDevice ? 0.2 : 0.11;
        this.sfxVolume = this.isMobileDevice ? 0.7 : 0.48;
        this.sampleBuffers = new Map();
        this.sampleLoadStarted = false;
        this.sampleLoadPromise = null;
        this._unlockHandlersBound = false;
        this._unlockInProgress = null;
        this.lastWeaponSfxTime = Object.create(null);
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
                'assets/audio/weapons/smg_sks.wav'
            ],
            shotgun: [
                'assets/audio/weapons/shotgun_shotty.wav'
            ],
            pistol: [
                'assets/audio/weapons/pistol_cz.wav'
            ],
            rifle: [
                'assets/audio/weapons/rifle_mosin.wav'
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
            storm: [
                'assets/audio/rpg/doorClose_4.ogg'
            ],
            rain: [
                'assets/audio/weather_rain.ogg'
            ],
            music: []
        };

        this._lazyInitCalled = false;
    }

    _ensureLazyInit() {
        if (this._lazyInitCalled) return;
        this._lazyInitCalled = true;
        this.init().catch(() => {});
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
            this.reverbGain.gain.value = 0.1;
            this.sfxLimiter.threshold.value = -22;
            this.sfxLimiter.knee.value = 18;
            this.sfxLimiter.ratio.value = 5.5;
            this.sfxLimiter.attack.value = 0.008;
            this.sfxLimiter.release.value = 0.22;

            this.musicGain.connect(this.audioContext.destination);
            Object.keys(this.categoryGains).forEach((key) => {
                const gainNode = this.categoryGains[key];
                if (!gainNode) return;
                gainNode.gain.value = this.categoryBaseVolumes[key] ?? 1;
                gainNode.connect(this.masterSfxGain);
            });
            this.masterSfxGain.connect(this.sfxLimiter);
            this.sfxLimiter.connect(this.audioContext.destination);
            this.sfxLimiter.connect(this.reverb);
            this.reverb.connect(this.reverbGain);
            this.reverbGain.connect(this.audioContext.destination);

            this.musicGain.gain.value = this.musicVolume;
            this.masterSfxGain.gain.value = this.sfxVolume;
            await this.loadSamples();
            this.bindUnlockHandlers();
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
        this._ensureLazyInit();
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
        this.musicVolume = clamp(value, 0, 0.5);
        if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
    }

    setSfxVolume(value = 0.48) {
        this.sfxVolume = clamp(value, 0, 1);
        if (this.masterSfxGain) this.masterSfxGain.gain.value = this.sfxVolume;
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
        panner.refDistance = 3;
        panner.maxDistance = 220;
        panner.rolloffFactor = 0.85;
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
        if (this.audioContext.state !== 'running') {
            await this.unlock();
            if (this.audioContext.state !== 'running') return false;
        }
        const path = this.pickSample(pathList);
        if (!path) return false;

        let buffer = this.sampleBuffers.get(path);
        if (!buffer && this.sampleLoadPromise) {
            await Promise.race([this.sampleLoadPromise, new Promise(r => setTimeout(r, 2000))]);
            buffer = this.sampleBuffers.get(path);
            if (!buffer) return false;
        }

        const ctx = this.audioContext;
        const now = ctx.currentTime + (options.delay || 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = !!options.loop;
        const rate = Number.isFinite(options.rate) ? options.rate : (Number.isFinite(options.rateMin) ? options.rateMin : 1) + Math.random() * ((Number.isFinite(options.rateMax) ? options.rateMax : 1) - (Number.isFinite(options.rateMin) ? options.rateMin : 1));
        source.playbackRate.value = clamp(rate, 0.5, 2.25);

        const gainNode = ctx.createGain();
        gainNode.gain.value = clamp(Number.isFinite(options.volume) ? options.volume : 0.2, 0, 2);

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

        this.connectSfx(gainNode, options.position || null, options.category || 'sfx');
        source.start(now);
        if (!source.loop) {
            const maxDuration = options.maxDuration || buffer.duration;
            source.stop(now + clamp(maxDuration, 0.01, buffer.duration));
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
        this.lastWeaponSfxTime[key] = now;
        return true;
    }

    startAmbient() {
        if (!this.audioContext || this.ambientRunning) return;
        this.ambientRunning = true;
        this.setBiomeAmbience('center');
    }

    setBiomeAmbience(biome) {
        if (!this.audioContext || !this.ambientRunning || this.currentBiomeAmbient === biome) return;
        const profiles = {
            center: { type: 'lowpass', frequency: 420, gain: 0, rate: 0.72 },
            forest: { type: 'bandpass', frequency: 1750, gain: 0.016, rate: 0.9 },
            maze: { type: 'lowpass', frequency: 620, gain: 0.011, rate: 0.78 },
            military: { type: 'bandpass', frequency: 520, gain: 0.012, rate: 0.8 },
            ice: { type: 'highpass', frequency: 980, gain: 0.013, rate: 0.84 }
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
        filter.Q.value = biome === 'forest' ? 0.7 : 0.35;
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
        this.playSample(this.sampleCatalog.rumble, { volume: 0.13, rateMin: 0.7, rateMax: 1.0, position, reverbSend: 0.2, category: 'ambient' });
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
            category: 'sfx'
        });
    }

    playHit(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`hit:${emitterKey}`, 0.055)) return;
        this.playSample(this.sampleCatalog.hit, { volume: this.isMobileDevice ? 0.26 : 0.34, rateMin: 0.95, rateMax: 1.12, reverbSend: 0.06, position, category: 'weapon', maxDuration: 0.2 });
    }

    playStorm(position) {
        this.playSample(this.sampleCatalog.storm, { volume: this.isMobileDevice ? 0.07 : 0.11, rateMin: 0.8, rateMax: 1.2, position, category: 'weather', maxDuration: 0.8 });
    }

    startRadiationRain(position = null) {
        if (!this.audioContext || this.radiationRainNodes) return;
        const ctx = this.audioContext;
        const noiseBuffer = this.createRainNoiseBuffer();
        if (!noiseBuffer) return;

        const makeLayer = (highpass, lowpass, gainValue, rate = 1) => {
            const source = ctx.createBufferSource();
            source.buffer = noiseBuffer;
            source.loop = true;
            source.playbackRate.value = rate;

            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = highpass;

            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = lowpass;

            const gain = ctx.createGain();
            gain.gain.value = gainValue;

            source.connect(hp);
            hp.connect(lp);
            lp.connect(gain);
            gain.connect(this.getCategoryGain('weather'));

            const send = ctx.createGain();
            send.gain.value = this.isMobileDevice ? 0.12 : 0.2;
            gain.connect(send);
            send.connect(this.reverb);

            source.start();
            return { source, hp, lp, gain, send };
        };

        const layerSoft = makeLayer(320, 2900, this.isMobileDevice ? 0.1 : 0.13, 0.94);
        const layerDrops = makeLayer(820, 6400, this.isMobileDevice ? 0.08 : 0.1, 1.06);

        const tickTimer = setInterval(() => {
            this.playSample(this.sampleCatalog.rain, { volume: this.isMobileDevice ? 0.035 : 0.045, rateMin: 0.7, rateMax: 1.3, category: 'weather', maxDuration: 0.2 });
        }, this.isMobileDevice ? 1200 : 950);

        const rumbleTimer = setInterval(() => {
            this.playSample(this.sampleCatalog.storm, {
                volume: this.isMobileDevice ? 0.02 : 0.035,
                rateMin: 0.72,
                rateMax: 0.94,
                position,
                reverbSend: 0.35,
                category: 'weather'
            });
        }, this.isMobileDevice ? 7800 : 6200);

        this.radiationRainNodes = { layerSoft, layerDrops, tickTimer, rumbleTimer };
    }

    stopRadiationRain() {
        if (!this.radiationRainNodes) return;
        const stopLayer = (layer) => {
            if (!layer) return;
            try { layer.source?.stop?.(); } catch {}
            try { layer.source?.disconnect?.(); } catch {}
            try { layer.hp?.disconnect?.(); } catch {}
            try { layer.lp?.disconnect?.(); } catch {}
            try { layer.gain?.disconnect?.(); } catch {}
            try { layer.send?.disconnect?.(); } catch {}
        };
        stopLayer(this.radiationRainNodes.layerSoft);
        stopLayer(this.radiationRainNodes.layerDrops);
        if (this.radiationRainNodes.tickTimer) clearInterval(this.radiationRainNodes.tickTimer);
        if (this.radiationRainNodes.rumbleTimer) clearInterval(this.radiationRainNodes.rumbleTimer);
        this.radiationRainNodes = null;
    }

    playHurt() {
        this.playSample(this.sampleCatalog.hurt, {
            volume: this.isMobileDevice ? 0.14 : 0.2,
            rateMin: 0.82,
            rateMax: 1.08,
            category: 'sfx'
        });
    }

    playZombieAttack(position = null, opts = null) {
        const variant = opts?.variant || 'normal';
        const offset = variant === 'runner' ? 0 : variant === 'heavy' ? 8 : 4;
        const rates = variant === 'runner' ? [1.1, 1.28] : variant === 'heavy' ? [0.7, 0.86] : [0.92, 1.08];
        this.playSample(this.sampleCatalog.zombieAttack.slice(offset, offset + 4), { volume: this.isMobileDevice ? 0.24 : 0.36, rateMin: rates[0], rateMax: rates[1], position, reverbSend: 0.12, category: 'zombie', maxDuration: variant === 'heavy' ? 0.65 : 0.42 });
    }

    playZoneDamage() {
        this.playSample(this.sampleCatalog.zoneDamage, { volume: this.isMobileDevice ? 0.08 : 0.11, rateMin: 0.6, rateMax: 1.4, category: 'weather', maxDuration: 0.3 });
    }

    playZombieMoan(position = null, opts = null) {
        const variant = opts?.variant || 'normal';
        const offset = variant === 'runner' ? 0 : variant === 'heavy' ? 8 : 4;
        const rates = variant === 'runner' ? [1.12, 1.3] : variant === 'heavy' ? [0.66, 0.82] : [0.9, 1.06];
        this.playSample(this.sampleCatalog.zombieMoan.slice(offset, offset + 4), { volume: this.isMobileDevice ? 0.2 : 0.32, rateMin: rates[0], rateMax: rates[1], position, reverbSend: 0.18, category: 'zombie', maxDuration: variant === 'heavy' ? 1.1 : 0.75 });
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
        this.playSample(this.sampleCatalog.bow, { volume: this.isMobileDevice ? 0.36 : 0.48, rateMin: 0.9, rateMax: 1.1, position, category: 'weapon', maxDuration: 0.3 });
    }

    playLaser(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`laser:${emitterKey}`, this.weaponSfxCooldown.laser)) return;
        this.playSample(this.sampleCatalog.laser, { volume: this.isMobileDevice ? 0.44 : 0.58, rateMin: 0.85, rateMax: 1.15, position, category: 'weapon', maxDuration: 0.3 });
    }

    playShotgun(volume = 1, position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`shotgun:${emitterKey}`, this.weaponSfxCooldown.shotgun)) return;
        const scaled = clamp(volume, 0.1, 1.5);
        this.playSample(this.sampleCatalog.shotgun, {
            volume: (this.isMobileDevice ? 0.88 : 1.2) * scaled,
            rateMin: 0.92,
            rateMax: 1.04,
            reverbSend: 0.08,
            maxDuration: 0.34,
            position,
            category: 'weapon'
        });
    }

    playPistol(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`pistol:${emitterKey}`, this.weaponSfxCooldown.pistol)) return;
        this.playSample(this.sampleCatalog.pistol, {
            volume: this.isMobileDevice ? 2.6 : 3.05,
            rateMin: 0.98,
            rateMax: 1.03,
            reverbSend: 0.01,
            maxDuration: 0.12,
            position,
            category: 'weapon'
        });
    }

    playRifle(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`rifle:${emitterKey}`, this.weaponSfxCooldown.rifle)) return;
        this.playSample(this.sampleCatalog.rifle, {
            volume: this.isMobileDevice ? 2.1 : 2.65,
            rateMin: 0.95,
            rateMax: 1.02,
            reverbSend: 0.015,
            maxDuration: 0.15,
            position,
            category: 'weapon'
        });
    }

    playMachinegun(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`machinegun:${emitterKey}`, this.weaponSfxCooldown.machinegun)) return;
        const playedPrimary = this.playSample(this.sampleCatalog.machinegun, {
            volume: this.isMobileDevice ? 2.0 : 2.45,
            rateMin: 1.02,
            rateMax: 1.15,
            reverbSend: 0.005,
            maxDuration: 0.09,
            position,
            category: 'weapon'
        });
        const played = playedPrimary || this.playSample(this.sampleCatalog.rifle, {
            volume: this.isMobileDevice ? 1.65 : 2.0,
            rateMin: 1.08,
            rateMax: 1.18,
            reverbSend: 0.005,
            maxDuration: 0.09,
            position,
            category: 'weapon'
        });
        return played;
    }

    playFlamethrower(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`flamethrower:${emitterKey}`, this.weaponSfxCooldown.flamethrower)) return;
        this.playSample(this.sampleCatalog.flamethrower, {
            volume: this.isMobileDevice ? 0.52 : 0.7,
            rateMin: 0.45,
            rateMax: 0.62,
            reverbSend: 0.08,
            maxDuration: 0.2,
            position,
            category: 'weapon'
        });
    }

    playTimerTick(volume = 1) {
        this.playSample(this.sampleCatalog.timer, {
            volume: (this.isMobileDevice ? 0.018 : 0.024) * clamp(volume, 0.4, 1.4),
            rateMin: 0.98,
            rateMax: 1.02,
            category: 'ui'
        });
    }

    playWind() {
        this.playSample(this.sampleCatalog.wind, {
            volume: this.isMobileDevice ? 0.02 : 0.03,
            rateMin: 0.78,
            rateMax: 0.95,
            reverbSend: 0.18,
            category: 'ambient'
        });
    }

    setWeatherState(nextState = 'clear') {
        const state = String(nextState || 'clear').toLowerCase();
        if (state === this.currentWeatherState) return;
        this.currentWeatherState = state;
        this.stopWeatherLoop();
        this.footstepWeatherFactor = state === 'rain' ? 0.62 : state === 'snow' ? 0.82 : 1;
        if (state === 'rain') {
            this.startWeatherLoop({
                continuous: true,
                category: 'weather',
                volume: this.isMobileDevice ? 0.06 : 0.09,
                sampleList: this.sampleCatalog.rain
            });
        } else if (state === 'snow') {
            this.startWeatherLoop({
                intervalMs: this.isMobileDevice ? 3400 : 2600,
                category: 'weather',
                volume: this.isMobileDevice ? 0.02 : 0.03,
                rateMin: 0.7,
                rateMax: 0.95,
                sampleList: this.sampleCatalog.wind,
                fallback: () => this.playSample(this.sampleCatalog.wind, { volume: this.isMobileDevice ? 0.02 : 0.03, rateMin: 0.6, rateMax: 0.9, category: 'weather', maxDuration: 0.4 })
            });
        }
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
                gain.gain.value = volume;
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
        if (this.weatherLoopNodes.timer) clearInterval(this.weatherLoopNodes.timer);
        try { this.weatherLoopNodes.source?.stop?.(); } catch (_) {}
        try { this.weatherLoopNodes.source?.disconnect?.(); } catch (_) {}
        try { this.weatherLoopNodes.gain?.disconnect?.(); } catch (_) {}
        this.weatherLoopNodes = null;
    }

    playChestOpen() {
        this.playSample(this.sampleCatalog.chestOpen, { volume: this.isMobileDevice ? 0.1 : 0.16, rateMin: 0.92, rateMax: 1.08, reverbSend: 0.12, category: 'ui' });
    }

    playChestNearby() {
        this.playSample(this.sampleCatalog.chestNearby, { volume: this.isMobileDevice ? 0.06 : 0.1, rateMin: 0.95, rateMax: 1.1, reverbSend: 0.08, category: 'ui' });
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

    playMusic() {
        this._ensureLazyInit();
        if (!this.audioContext || this.musicStarted) return;
        this.musicStarted = true;

        const playMusicTheme = (index) => {
            if (!this.audioContext || !this.musicGain) return;
            const theme = this.sampleCatalog.music[index % this.sampleCatalog.music.length];
            if (!theme) return;
            const buffer = this.sampleBuffers.get(theme);
            if (!buffer) return;

            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            source.connect(this.musicGain);
            source.start();

            clearTimeout(this.musicLoopTimer);
            this.musicLoopTimer = setTimeout(() => {
                source.stop();
                this.musicThemeIndex = (index + 1) % this.sampleCatalog.music.length;
                playMusicTheme(this.musicThemeIndex);
            }, 180000);
        };

        playMusicTheme(this.musicThemeIndex);
    }
}




