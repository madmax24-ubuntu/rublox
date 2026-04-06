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
            weapon: 2.35,
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
        this.radiationRainNodes = null;
        this.musicStarted = false;
        this.musicLoopTimer = null;
        this.musicThemeIndex = 0;
        this.rainNoiseBuffer = null;
        this.musicVolume = this.isMobileDevice ? 0.08 : 0.11;
        this.sfxVolume = this.isMobileDevice ? 0.45 : 0.48;
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
            bow: [],
            laser: [
                
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
                
            ],
            timer: [
                'assets/audio/rpg/metalClick.ogg',
                'assets/audio/rpg/metalClick.ogg',
                'assets/audio/rpg/bookClose.ogg'
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
            storm: [
                'assets/audio/rpg/doorClose_4.ogg'
            ],
            rain: [
                'assets/audio/rpg/cloth1.ogg',
                'assets/audio/rpg/cloth2.ogg',
                'assets/audio/rpg/clothBelt.ogg'
            ]
        };

        this.init();
    }

    init() {
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
            this.loadSamples();
            this.bindUnlockHandlers();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    bindUnlockHandlers() {
        if (this._unlockHandlersBound || typeof window === 'undefined') return;
        this._unlockHandlersBound = true;
        const unlockOnce = () => {
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
        if (!this.audioContext || this.sampleLoadStarted) return this.sampleLoadPromise;
        this.sampleLoadStarted = true;

        const allPaths = new Set();
        for (const list of Object.values(this.sampleCatalog)) {
            for (const p of list) allPaths.add(p);
        }

        this.sampleLoadPromise = Promise.all([...allPaths].map(async (path) => {
            try {
                const response = await fetch(path);
                if (!response.ok) return;
                const arrayBuffer = await response.arrayBuffer();
                const decoded = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
                this.sampleBuffers.set(path, decoded);
            } catch {
                // Silent fallback to synth if file cannot be loaded.
            }
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
            panner.positionX.value = position.x;
            panner.positionY.value = position.y;
            panner.positionZ.value = position.z;
        }
        return panner;
    }

    updateListener(position, forward) {
        if (!this.audioContext) return;
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

    playSample(pathList, options = {}) {
        if (!this.audioContext) return false;
        if (this.audioContext.state !== 'running') {
            this.unlock();
            return false;
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
        source.playbackRate.value = options.rate
            || clamp((options.rateMin || 1) + Math.random() * ((options.rateMax || 1) - (options.rateMin || 1)), 0.5, 2.25);

        const gainNode = ctx.createGain();
        gainNode.gain.value = clamp(options.volume ?? 0.2, 0, 2);

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

    fallbackTone(type, fromFreq, toFreq, duration, volume = 0.1, position = null, category = 'sfx') {
        if (!this.audioContext) return;
        if (this.audioContext.state !== 'running') {
            this.unlock();
            return;
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

    playNoiseBurst({ duration = 0.14, volume = 0.12, highpass = 300, lowpass = 2800, position = null, category = 'weapon' } = {}) {
        if (!this.audioContext) return;
        if (this.audioContext.state !== 'running') {
            this.unlock();
            return;
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

    playProceduralShot(kind = 'generic', volume = 0.14, position = null, category = 'weapon') {
        if (!this.audioContext) return;
        if (this.audioContext.state !== 'running') {
            this.unlock();
            return;
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

        const softAmbience = () => {
            if (!this.ambientRunning) return;
            const played = this.playSample(this.sampleCatalog.ambient, {
                volume: this.isMobileDevice ? 0.008 : 0.015,
                rateMin: 0.76,
                rateMax: 0.96,
                reverbSend: 0.12,
                maxDuration: 0.32,
                category: 'ambient'
            });
            if (!played) {
                this.fallbackTone('sine', 140, 102, 0.28, this.isMobileDevice ? 0.006 : 0.01, null, 'ambient');
            }
        };

        const lowRumble = () => {
            if (!this.ambientRunning) return;
            this.playWind();
        };

        softAmbience();
        lowRumble();
        this.ambientTimers.push(setInterval(softAmbience, this.isMobileDevice ? 4200 : 3200));
        this.ambientTimers.push(setInterval(lowRumble, this.isMobileDevice ? 12000 : 9000));
    }

    stopAmbient() {
        this.ambientRunning = false;
        for (const timer of this.ambientTimers) clearInterval(timer);
        this.ambientTimers = [];
    }

    playGrieverMove(position) {
        if (!this.playSample(this.sampleCatalog.rumble, { volume: 0.13, rateMin: 0.7, rateMax: 1.0, position, reverbSend: 0.2, category: 'ambient' })) {
            this.fallbackTone('square', 130, 80, 0.12, 0.12, position, 'ambient');
        }
    }

    playGrieverRoar(position) {
        if (!this.playSample(this.sampleCatalog.zombieAttack, { volume: 0.2, rateMin: 0.5, rateMax: 0.8, position, reverbSend: 0.35, category: 'zombie' })) {
            this.fallbackTone('sawtooth', 880, 210, 0.7, 0.22, position, 'zombie');
        }
    }

    playGrieverAttack(position) {
        if (!this.playSample(this.sampleCatalog.hit, { volume: 0.2, rateMin: 0.6, rateMax: 0.95, position, reverbSend: 0.16, category: 'weapon' })) {
            this.fallbackTone('triangle', 620, 180, 0.25, 0.22, position, 'weapon');
        }
    }

    playStoneDoorClose(position) {
        if (!this.playSample(this.sampleCatalog.rumble, { volume: 0.22, rateMin: 0.6, rateMax: 0.85, position, reverbSend: 0.45, category: 'ambient' })) {
            this.fallbackTone('sine', 80, 30, 1.1, 0.2, position, 'ambient');
        }
    }

    playBoxArrival(position) {
        if (!this.playSample(this.sampleCatalog.rumble, { volume: 0.18, rateMin: 0.9, rateMax: 1.2, position, reverbSend: 0.35, category: 'ambient' })) {
            this.fallbackTone('square', 180, 82, 0.9, 0.14, position, 'ambient');
        }
    }

    playFootstep(volume = 1) {
        const gainScale = clamp(volume, 0.15, 1.2);
        if (!this.playSample(this.sampleCatalog.footsteps, {
            volume: (this.isMobileDevice ? 0.14 : 0.2) * gainScale,
            rateMin: 0.92,
            rateMax: 1.08,
            category: 'sfx'
        })) {
            this.fallbackTone('triangle', 160, 90, 0.08, 0.05 * gainScale, null, 'sfx');
        }
    }

    playHit(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`hit:${emitterKey}`, 0.055)) return;
        if (!this.playSample(this.sampleCatalog.hit, { volume: this.isMobileDevice ? 0.26 : 0.34, rateMin: 0.95, rateMax: 1.12, reverbSend: 0.06, position, category: 'weapon', maxDuration: 0.2 })) {
            this.fallbackTone('square', 190, 105, 0.18, 0.17, position, 'weapon');
        }
    }

    playStorm(position) {
        this.playProceduralShot('storm', this.isMobileDevice ? 0.07 : 0.11, position, 'weather');
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
            this.playProceduralShot('zone', this.isMobileDevice ? 0.035 : 0.045, position, 'weather');
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
        if (!this.playSample(this.sampleCatalog.hurt, { volume: this.isMobileDevice ? 0.1 : 0.14, rateMin: 0.95, rateMax: 1.1, reverbSend: 0.05, category: 'sfx' })) {
            this.fallbackTone('sine', 220, 140, 0.25, 0.11, null, 'sfx');
        }
    }

    playZoneDamage() {
        this.playProceduralShot('zone', this.isMobileDevice ? 0.08 : 0.11, null, 'weather');
    }

    playZombieMoan(position = null) {
        if (!this.playSample(this.sampleCatalog.zombieMoan, { volume: this.isMobileDevice ? 0.2 : 0.32, rateMin: 0.88, rateMax: 1.08, position, reverbSend: 0.18, category: 'zombie', maxDuration: 0.75 })) {
            this.fallbackTone('sawtooth', 112, 62, 0.9, 0.18, position, 'zombie');
        }
    }

    playZombieAttack(position = null) {
        if (!this.playSample(this.sampleCatalog.zombieAttack, { volume: this.isMobileDevice ? 0.24 : 0.36, rateMin: 0.95, rateMax: 1.1, position, reverbSend: 0.12, category: 'zombie', maxDuration: 0.42 })) {
            this.fallbackTone('sawtooth', 160, 82, 0.38, 0.22, position, 'zombie');
        }
    }

    playBowShot(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`bow:${emitterKey}`, this.weaponSfxCooldown.bow)) return;
        this.fallbackTone('triangle', 980, 210, 0.11, this.isMobileDevice ? 0.28 : 0.36, position, 'weapon');
        this.fallbackTone('sine', 520, 170, 0.16, this.isMobileDevice ? 0.18 : 0.24, position, 'weapon');
    }

    playLaser(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`laser:${emitterKey}`, this.weaponSfxCooldown.laser)) return;
        // Short laser one-shot, no loop tails.
        this.playProceduralShot('laser', this.isMobileDevice ? 0.32 : 0.45, position, 'weapon');
        this.fallbackTone('square', 2100, 560, 0.08, this.isMobileDevice ? 0.34 : 0.46, position, 'weapon');
        this.fallbackTone('sine', 1200, 320, 0.12, this.isMobileDevice ? 0.2 : 0.28, position, 'weapon');
        this.playNoiseBurst({
            duration: 0.06,
            volume: this.isMobileDevice ? 0.07 : 0.1,
            highpass: 1200,
            lowpass: 4200,
            position,
            category: 'weapon'
        });
    }

    playShotgun(volume = 1, position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`shotgun:${emitterKey}`, this.weaponSfxCooldown.shotgun)) return;
        const scaled = clamp(volume, 0.1, 1.5);
        const played = this.playSample(this.sampleCatalog.shotgun, {
            volume: (this.isMobileDevice ? 0.88 : 1.2) * scaled,
            rateMin: 0.92,
            rateMax: 1.04,
            reverbSend: 0.08,
            maxDuration: 0.34,
            position,
            category: 'weapon'
        });
        this.playProceduralShot('shotgun', played ? (this.isMobileDevice ? 0.08 : 0.11) : (this.isMobileDevice ? 0.12 : 0.18), position, 'weapon');
    }

    playPistol(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`pistol:${emitterKey}`, this.weaponSfxCooldown.pistol)) return;
        const played = this.playSample(this.sampleCatalog.pistol, {
            volume: this.isMobileDevice ? 1.35 : 1.7,
            rateMin: 0.96,
            rateMax: 1.03,
            reverbSend: 0.03,
            maxDuration: 0.18,
            position,
            category: 'weapon'
        });
        this.playProceduralShot('generic', played ? (this.isMobileDevice ? 0.2 : 0.26) : (this.isMobileDevice ? 0.26 : 0.38), position, 'weapon');
        if (!played) {
            this.fallbackTone('square', 420, 120, 0.1, this.isMobileDevice ? 0.34 : 0.46, position, 'weapon');
        }
    }

    playRifle(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`rifle:${emitterKey}`, this.weaponSfxCooldown.rifle)) return;
        const played = this.playSample(this.sampleCatalog.rifle, {
            volume: this.isMobileDevice ? 0.84 : 1.05,
            rateMin: 0.88,
            rateMax: 0.98,
            reverbSend: 0.06,
            maxDuration: 0.26,
            position,
            category: 'weapon'
        });
        this.playProceduralShot('generic', played ? (this.isMobileDevice ? 0.1 : 0.14) : (this.isMobileDevice ? 0.22 : 0.3), position, 'weapon');
        if (!played) {
            this.fallbackTone('triangle', 240, 90, 0.13, this.isMobileDevice ? 0.2 : 0.28, position, 'weapon');
        }
    }

    playMachinegun(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`machinegun:${emitterKey}`, this.weaponSfxCooldown.machinegun)) return;
        const playedPrimary = this.playSample(this.sampleCatalog.machinegun, {
            volume: this.isMobileDevice ? 0.62 : 0.84,
            rateMin: 1.15,
            rateMax: 1.35,
            reverbSend: 0.05,
            maxDuration: 0.18,
            position,
            category: 'weapon'
        });
        const played = playedPrimary || this.playSample(this.sampleCatalog.rifle, {
            volume: this.isMobileDevice ? 0.42 : 0.58,
            rateMin: 1.08,
            rateMax: 1.28,
            reverbSend: 0.04,
            maxDuration: 0.18,
            position,
            category: 'weapon'
        });
        this.playProceduralShot('generic', played ? (this.isMobileDevice ? 0.12 : 0.16) : (this.isMobileDevice ? 0.34 : 0.48), position, 'weapon');
    }

    playFlamethrower(position = null, emitterKey = 'global') {
        if (!this.canPlayWeaponSfx(`flamethrower:${emitterKey}`, this.weaponSfxCooldown.flamethrower)) return;
        const played = this.playSample(this.sampleCatalog.flamethrower, {
            volume: this.isMobileDevice ? 0.32 : 0.46,
            rateMin: 0.45,
            rateMax: 0.62,
            reverbSend: 0.08,
            maxDuration: 0.2,
            position,
            category: 'weapon'
        });
        this.playProceduralShot('flamethrower', played ? (this.isMobileDevice ? 0.3 : 0.42) : (this.isMobileDevice ? 0.38 : 0.56), position, 'weapon');
        this.playNoiseBurst({
            duration: 0.12,
            volume: this.isMobileDevice ? 0.11 : 0.16,
            highpass: 500,
            lowpass: 2400,
            position,
            category: 'weapon'
        });
        if (!played) {
            this.fallbackTone('sawtooth', 320, 110, 0.16, this.isMobileDevice ? 0.16 : 0.22, position, 'weapon');
            this.fallbackTone('triangle', 210, 70, 0.2, this.isMobileDevice ? 0.16 : 0.24, position, 'weapon');
        }
    }

    playTimerTick(volume = 1) {
        this.playSample(this.sampleCatalog.timer, {
            volume: (this.isMobileDevice ? 0.045 : 0.06) * clamp(volume, 0.4, 1.4),
            rateMin: 0.92,
            rateMax: 1.08,
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

    playChestOpen() {
        if (!this.playSample(this.sampleCatalog.chestOpen, { volume: this.isMobileDevice ? 0.1 : 0.16, rateMin: 0.92, rateMax: 1.08, reverbSend: 0.12, category: 'ui' })) {
            this.fallbackTone('sine', 300, 500, 0.5, 0.15, null, 'ui');
        }
    }

    playChestNearby() {
        if (!this.playSample(this.sampleCatalog.chestNearby, { volume: this.isMobileDevice ? 0.06 : 0.1, rateMin: 0.95, rateMax: 1.1, reverbSend: 0.08, category: 'ui' })) {
            this.fallbackTone('sine', 152, 158, 0.2, 0.06, null, 'ui');
        }
    }

    playMusic() {
        if (!this.audioContext || this.musicStarted) return;
        this.musicStarted = true;

        const themes = [
            {
                duration: 7.2,
                notes: [
                    [196, 0.0, 1.6, 'sine'],
                    [247, 1.5, 1.3, 'triangle'],
                    [174, 3.0, 1.5, 'sine'],
                    [220, 4.7, 1.6, 'triangle']
                ]
            },
            {
                duration: 7.8,
                notes: [
                    [220, 0.0, 1.2, 'triangle'],
                    [262, 1.2, 1.4, 'sine'],
                    [294, 2.9, 1.0, 'triangle'],
                    [196, 4.3, 1.8, 'sine'],
                    [165, 5.9, 1.2, 'triangle']
                ]
            },
            {
                duration: 7.5,
                notes: [
                    [165, 0.0, 1.6, 'sine'],
                    [196, 1.7, 1.1, 'triangle'],
                    [147, 3.1, 1.5, 'sine'],
                    [220, 4.8, 1.4, 'triangle']
                ]
            }
        ];

        const playTheme = (index) => {
            if (!this.audioContext || !this.musicGain) return;
            const theme = themes[index % themes.length];
            const now = this.audioContext.currentTime;
            for (const [freq, time, duration, type] of theme.notes) {
                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();
                const filter = this.audioContext.createBiquadFilter();

                oscillator.type = type;
                oscillator.frequency.value = freq;
                filter.type = 'lowpass';
                filter.frequency.value = 1200;

                gainNode.gain.setValueAtTime(0.0001, now + time);
                gainNode.gain.exponentialRampToValueAtTime(0.034, now + time + 0.08);
                gainNode.gain.exponentialRampToValueAtTime(0.007, now + time + duration);

                oscillator.connect(filter);
                filter.connect(gainNode);
                gainNode.connect(this.musicGain);

                oscillator.start(now + time);
                oscillator.stop(now + time + duration + 0.05);
            }

            clearTimeout(this.musicLoopTimer);
            this.musicLoopTimer = setTimeout(() => {
                this.musicThemeIndex = (index + 1) % themes.length;
                playTheme(this.musicThemeIndex);
            }, theme.duration * 1000);
        };

        playTheme(this.musicThemeIndex);
    }
}




