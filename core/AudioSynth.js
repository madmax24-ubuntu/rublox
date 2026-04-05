const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export class AudioSynth {
    constructor() {
        this.isMobileDevice = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        this.audioContext = null;
        this.musicGain = null;
        this.sfxGain = null;
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
        this.musicVolume = this.isMobileDevice ? 0.11 : 0.14;
        this.sfxVolume = this.isMobileDevice ? 0.16 : 0.22;
        this.sampleBuffers = new Map();
        this.sampleLoadStarted = false;
        this.sampleLoadPromise = null;

        this.sampleCatalog = {
            ambient: [
                'assets/audio/rpg/creak1.ogg',
                'assets/audio/rpg/creak2.ogg',
                'assets/audio/rpg/creak3.ogg',
                'assets/audio/rpg/cloth1.ogg',
                'assets/audio/rpg/cloth2.ogg'
            ],
            rumble: [
                'assets/audio/rpg/doorClose_1.ogg',
                'assets/audio/rpg/doorClose_2.ogg',
                'assets/audio/rpg/metalPot1.ogg',
                'assets/audio/rpg/metalPot3.ogg'
            ],
            footsteps: Array.from({ length: 10 }, (_, i) => `assets/audio/rpg/footstep0${i}.ogg`),
            hit: [
                'assets/audio/rpg/knifeSlice.ogg',
                'assets/audio/rpg/knifeSlice2.ogg',
                'assets/audio/rpg/chop.ogg'
            ],
            hurt: [
                'assets/audio/rpg/cloth3.ogg',
                'assets/audio/rpg/cloth4.ogg',
                'assets/audio/rpg/metalClick.ogg'
            ],
            zoneDamage: [
                'assets/audio/rpg/doorClose_4.ogg',
                'assets/audio/rpg/metalPot2.ogg'
            ],
            zombieMoan: Array.from({ length: 12 }, (_, i) => `assets/audio/zombies/zombie-${i + 1}.wav`),
            zombieAttack: Array.from({ length: 12 }, (_, i) => `assets/audio/zombies/zombie-${i + 13}.wav`),
            bow: [
                'assets/audio/rpg/drawKnife1.ogg',
                'assets/audio/rpg/drawKnife2.ogg',
                'assets/audio/rpg/drawKnife3.ogg'
            ],
            laser: [
                'assets/audio/rpg/metalClick.ogg',
                'assets/audio/rpg/metalLatch.ogg'
            ],
            shotgun: [
                'assets/audio/rpg/doorClose_3.ogg',
                'assets/audio/rpg/metalPot1.ogg',
                'assets/audio/rpg/metalPot3.ogg'
            ],
            pistol: [
                'assets/audio/rpg/chop.ogg',
                'assets/audio/rpg/metalClick.ogg',
                'assets/audio/rpg/drawKnife2.ogg'
            ],
            rifle: [
                'assets/audio/rpg/metalPot1.ogg',
                'assets/audio/rpg/doorClose_2.ogg',
                'assets/audio/rpg/metalPot2.ogg'
            ],
            flamethrower: [
                'assets/audio/rpg/clothBelt.ogg',
                'assets/audio/rpg/clothBelt2.ogg'
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
                'assets/audio/rpg/doorClose_4.ogg',
                'assets/audio/rpg/metalPot2.ogg'
            ],
            rain: [
                'assets/audio/rpg/cloth1.ogg',
                'assets/audio/rpg/cloth2.ogg',
                'assets/audio/rpg/cloth3.ogg'
            ]
        };

        this.init();
    }

    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.musicGain = this.audioContext.createGain();
            this.sfxGain = this.audioContext.createGain();
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
            this.sfxGain.connect(this.sfxLimiter);
            this.sfxLimiter.connect(this.audioContext.destination);
            this.sfxLimiter.connect(this.reverb);
            this.reverb.connect(this.reverbGain);
            this.reverbGain.connect(this.audioContext.destination);

            this.musicGain.gain.value = this.musicVolume;
            this.sfxGain.gain.value = this.sfxVolume;
            this.loadSamples();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
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

    setSfxVolume(value = 0.22) {
        this.sfxVolume = clamp(value, 0, 0.65);
        if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
    }

    createPanner(position) {
        const ctx = this.audioContext;
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 3;
        panner.maxDistance = 140;
        panner.rolloffFactor = 1.15;
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

    connectSfx(node, position) {
        if (!this.audioContext) return node;
        if (position) {
            const panner = this.createPanner(position);
            node.connect(panner);
            panner.connect(this.sfxGain);
        } else {
            node.connect(this.sfxGain);
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

        this.connectSfx(gainNode, options.position || null);
        source.start(now);
        if (!source.loop) {
            const maxDuration = options.maxDuration || buffer.duration;
            source.stop(now + clamp(maxDuration, 0.01, buffer.duration));
        }
        return true;
    }

    fallbackTone(type, fromFreq, toFreq, duration, volume = 0.1, position = null) {
        if (!this.audioContext) return;
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
        this.connectSfx(gain, position);
        osc.start(now);
        osc.stop(now + duration);
    }

    playProceduralShot(kind = 'generic', volume = 0.14, position = null) {
        if (!this.audioContext) return;
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = kind === 'shotgun' ? 1200 : kind === 'flamethrower' ? 2200 : 2600;
        g.gain.value = clamp(volume, 0.01, 0.5);
        f.connect(g);
        this.connectSfx(g, position);

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

    startAmbient() {
        if (!this.audioContext || this.ambientRunning) return;
        this.ambientRunning = true;

        const softAmbience = () => {
            if (!this.ambientRunning) return;
            const played = this.playSample(this.sampleCatalog.ambient, {
                volume: this.isMobileDevice ? 0.025 : 0.04,
                rateMin: 0.75,
                rateMax: 1.15,
                reverbSend: 0.25
            });
            if (!played) {
                this.fallbackTone('sine', 160, 120, 0.32, this.isMobileDevice ? 0.01 : 0.02);
            }
        };

        const lowRumble = () => {
            if (!this.ambientRunning) return;
            const played = this.playSample(this.sampleCatalog.rumble, {
                volume: this.isMobileDevice ? 0.02 : 0.035,
                rateMin: 0.55,
                rateMax: 0.75,
                maxDuration: 0.7,
                reverbSend: 0.3
            });
            if (!played) {
                this.fallbackTone('sine', 68, 44, 0.5, this.isMobileDevice ? 0.015 : 0.022);
            }
        };

        softAmbience();
        lowRumble();
        this.ambientTimers.push(setInterval(softAmbience, this.isMobileDevice ? 2100 : 1600));
        this.ambientTimers.push(setInterval(lowRumble, this.isMobileDevice ? 9500 : 7200));
    }

    stopAmbient() {
        this.ambientRunning = false;
        for (const timer of this.ambientTimers) clearInterval(timer);
        this.ambientTimers = [];
    }

    playGrieverMove(position) {
        if (!this.playSample(this.sampleCatalog.rumble, { volume: 0.13, rateMin: 0.7, rateMax: 1.0, position, reverbSend: 0.2 })) {
            this.fallbackTone('square', 130, 80, 0.12, 0.12, position);
        }
    }

    playGrieverRoar(position) {
        if (!this.playSample(this.sampleCatalog.zombieAttack, { volume: 0.2, rateMin: 0.5, rateMax: 0.8, position, reverbSend: 0.35 })) {
            this.fallbackTone('sawtooth', 880, 210, 0.7, 0.22, position);
        }
    }

    playGrieverAttack(position) {
        if (!this.playSample(this.sampleCatalog.hit, { volume: 0.2, rateMin: 0.6, rateMax: 0.95, position, reverbSend: 0.16 })) {
            this.fallbackTone('triangle', 620, 180, 0.25, 0.22, position);
        }
    }

    playStoneDoorClose(position) {
        if (!this.playSample(this.sampleCatalog.rumble, { volume: 0.22, rateMin: 0.6, rateMax: 0.85, position, reverbSend: 0.45 })) {
            this.fallbackTone('sine', 80, 30, 1.1, 0.2, position);
        }
    }

    playBoxArrival(position) {
        if (!this.playSample(this.sampleCatalog.rumble, { volume: 0.18, rateMin: 0.9, rateMax: 1.2, position, reverbSend: 0.35 })) {
            this.fallbackTone('square', 180, 82, 0.9, 0.14, position);
        }
    }

    playFootstep(volume = 1) {
        const gainScale = clamp(volume, 0.15, 1.2);
        if (!this.playSample(this.sampleCatalog.footsteps, {
            volume: (this.isMobileDevice ? 0.14 : 0.2) * gainScale,
            rateMin: 0.92,
            rateMax: 1.08
        })) {
            this.fallbackTone('triangle', 160, 90, 0.08, 0.05 * gainScale);
        }
    }

    playHit() {
        if (!this.playSample(this.sampleCatalog.hit, { volume: this.isMobileDevice ? 0.12 : 0.18, rateMin: 0.95, rateMax: 1.12, reverbSend: 0.08 })) {
            this.fallbackTone('square', 190, 105, 0.18, 0.14);
        }
    }

    playStorm(position) {
        this.playProceduralShot('storm', this.isMobileDevice ? 0.07 : 0.11, position);
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
            gain.connect(this.sfxGain);

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
            this.playProceduralShot('zone', this.isMobileDevice ? 0.035 : 0.045, position);
        }, this.isMobileDevice ? 1200 : 950);

        const rumbleTimer = setInterval(() => {
            this.playSample(this.sampleCatalog.storm, {
                volume: this.isMobileDevice ? 0.02 : 0.035,
                rateMin: 0.72,
                rateMax: 0.94,
                position,
                reverbSend: 0.35
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
        if (!this.playSample(this.sampleCatalog.hurt, { volume: this.isMobileDevice ? 0.1 : 0.14, rateMin: 0.95, rateMax: 1.1, reverbSend: 0.05 })) {
            this.fallbackTone('sine', 220, 140, 0.25, 0.11);
        }
    }

    playZoneDamage() {
        this.playProceduralShot('zone', this.isMobileDevice ? 0.08 : 0.11, null);
    }

    playZombieMoan(position = null) {
        if (!this.playSample(this.sampleCatalog.zombieMoan, { volume: this.isMobileDevice ? 0.08 : 0.14, rateMin: 0.82, rateMax: 1.12, position, reverbSend: 0.26 })) {
            this.fallbackTone('sawtooth', 112, 62, 0.9, 0.12, position);
        }
    }

    playZombieAttack(position = null) {
        if (!this.playSample(this.sampleCatalog.zombieAttack, { volume: this.isMobileDevice ? 0.09 : 0.16, rateMin: 0.9, rateMax: 1.15, position, reverbSend: 0.24 })) {
            this.fallbackTone('sawtooth', 160, 82, 0.38, 0.14, position);
        }
    }

    playBowShot() {
        this.playProceduralShot('bow', this.isMobileDevice ? 0.1 : 0.14, null);
    }

    playLaser() {
        this.playProceduralShot('laser', this.isMobileDevice ? 0.1 : 0.14, null);
    }

    playShotgun(volume = 1) {
        const scaled = clamp(volume, 0.1, 1.5);
        this.playProceduralShot('shotgun', (this.isMobileDevice ? 0.14 : 0.2) * scaled, null);
    }

    playPistol() {
        const played = this.playSample(this.sampleCatalog.pistol, {
            volume: this.isMobileDevice ? 0.08 : 0.12,
            rateMin: 0.92,
            rateMax: 1.08,
            reverbSend: 0.06
        });
        if (!played) {
            this.playProceduralShot('laser', this.isMobileDevice ? 0.075 : 0.1, null);
        }
    }

    playRifle() {
        const played = this.playSample(this.sampleCatalog.rifle, {
            volume: this.isMobileDevice ? 0.1 : 0.14,
            rateMin: 0.88,
            rateMax: 1.03,
            reverbSend: 0.08
        });
        if (!played) {
            this.playProceduralShot('shotgun', this.isMobileDevice ? 0.1 : 0.14, null);
        }
    }

    playFlamethrower() {
        const played = this.playSample(this.sampleCatalog.flamethrower, {
            volume: this.isMobileDevice ? 0.06 : 0.09,
            rateMin: 0.84,
            rateMax: 0.98,
            reverbSend: 0.05
        });
        if (!played) {
            this.playProceduralShot('flamethrower', this.isMobileDevice ? 0.08 : 0.12, null);
        }
    }

    playChestOpen() {
        if (!this.playSample(this.sampleCatalog.chestOpen, { volume: this.isMobileDevice ? 0.1 : 0.16, rateMin: 0.92, rateMax: 1.08, reverbSend: 0.12 })) {
            this.fallbackTone('sine', 300, 500, 0.5, 0.15);
        }
    }

    playChestNearby() {
        if (!this.playSample(this.sampleCatalog.chestNearby, { volume: this.isMobileDevice ? 0.06 : 0.1, rateMin: 0.95, rateMax: 1.1, reverbSend: 0.08 })) {
            this.fallbackTone('sine', 152, 158, 0.2, 0.06);
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
