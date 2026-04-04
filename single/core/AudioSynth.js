export class AudioSynth {
    constructor() {
        this.isMobileDevice = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        this.audioContext = null;
        this.sounds = {};
        this.musicGain = null;
        this.sfxGain = null;
        this.reverb = null;
        this.reverbGain = null;
        this.ambientNodes = [];
        this.ambientRunning = false;
        this.musicStarted = false;
        this.musicLoopTimer = null;
        this.musicThemeIndex = 0;
        this.musicVolume = this.isMobileDevice ? 0.12 : 0.14;
        this.sfxVolume = this.isMobileDevice ? 0.16 : 0.22;
        this.radiationRainNodes = null;
        this.init();
    }

    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.musicGain = this.audioContext.createGain();
            this.sfxGain = this.audioContext.createGain();
            this.reverb = this.audioContext.createConvolver();
            this.reverbGain = this.audioContext.createGain();

            this.reverb.buffer = this.createImpulse(2.0, 1.6);
            this.reverbGain.gain.value = 0.12;

            this.musicGain.connect(this.audioContext.destination);
            this.sfxGain.connect(this.audioContext.destination);
            this.sfxGain.connect(this.reverb);
            this.reverb.connect(this.reverbGain);
            this.reverbGain.connect(this.audioContext.destination);

            this.musicGain.gain.value = this.musicVolume;
            this.sfxGain.gain.value = this.sfxVolume;
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    setMusicVolume(value = 0.14) {
        this.musicVolume = Math.max(0, Math.min(0.5, value));
        if (this.musicGain) {
            this.musicGain.gain.value = this.musicVolume;
        }
    }

    setSfxVolume(value = 0.22) {
        this.sfxVolume = Math.max(0, Math.min(0.65, value));
        if (this.sfxGain) {
            this.sfxGain.gain.value = this.sfxVolume;
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

    createNoiseBuffer(duration) {
        const ctx = this.audioContext;
        const length = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < data.length; i++) {
            const white = Math.random() * 2 - 1;
            last = (last + 0.02 * white) / 1.02;
            data[i] = Math.max(-0.72, Math.min(0.72, last * 0.82));
        }
        return buffer;
    }

    createPanner(position) {
        const ctx = this.audioContext;
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 3;
        panner.maxDistance = 140;
        panner.rolloffFactor = 1.2;
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

    startAmbient() {
        if (!this.audioContext || this.ambientRunning) return;
        this.ambientRunning = true;
        const ctx = this.audioContext;

        // Wind
        const wind = ctx.createBufferSource();
        wind.buffer = this.createNoiseBuffer(3.5);
        wind.loop = true;
        const windFilter = ctx.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.value = 420;
        windFilter.Q.value = 0.4;
        const windBand = ctx.createBiquadFilter();
        windBand.type = 'bandpass';
        windBand.frequency.value = 180;
        windBand.Q.value = 0.5;
        const windGain = ctx.createGain();
        windGain.gain.value = this.isMobileDevice ? 0.018 : 0.032;
        wind.connect(windFilter);
        windFilter.connect(windBand);
        windBand.connect(windGain);
        windGain.connect(this.sfxGain);
        wind.start();

        // Mechanical rumble
        const rumbleOsc = ctx.createOscillator();
        rumbleOsc.type = 'sine';
        rumbleOsc.frequency.value = 38;
        const rumbleGain = ctx.createGain();
        rumbleGain.gain.value = this.isMobileDevice ? 0.02 : 0.034;
        const rumbleFilter = ctx.createBiquadFilter();
        rumbleFilter.type = 'lowpass';
        rumbleFilter.frequency.value = 120;
        rumbleOsc.connect(rumbleFilter);
        rumbleFilter.connect(rumbleGain);
        rumbleGain.connect(this.sfxGain);
        rumbleOsc.start();

        // Grass rustle
        const rustle = ctx.createBufferSource();
        rustle.buffer = this.createNoiseBuffer(2.5);
        rustle.loop = true;
        const rustleFilter = ctx.createBiquadFilter();
        rustleFilter.type = 'highpass';
        rustleFilter.frequency.value = 1200;
        const rustleGain = ctx.createGain();
        rustleGain.gain.value = this.isMobileDevice ? 0.007 : 0.017;
        rustle.connect(rustleFilter);
        rustleFilter.connect(rustleGain);
        rustleGain.connect(this.sfxGain);
        rustle.start();

        // Birds (sparse)
        const birdTimer = setInterval(() => {
            if (!this.ambientRunning) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 1400 + Math.random() * 300;
            gain.gain.value = this.isMobileDevice ? 0.008 : 0.013;
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start();
            osc.stop(ctx.currentTime + 0.18);
        }, 6200);

        this.ambientNodes.push({ wind, rumbleOsc, rustle, birdTimer });
    }

    stopAmbient() {
        this.ambientRunning = false;
        for (const node of this.ambientNodes) {
            node.wind?.stop?.();
            node.rumbleOsc?.stop?.();
            node.rustle?.stop?.();
            if (node.birdTimer) clearInterval(node.birdTimer);
        }
        this.ambientNodes = [];
    }

    playGrieverMove(position) {
        if (!this.audioContext) return;
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        const click = ctx.createOscillator();
        const clickGain = ctx.createGain();
        click.type = 'square';
        click.frequency.setValueAtTime(120 + Math.random() * 40, now);
        clickGain.gain.setValueAtTime(0.16, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        click.connect(clickGain);
        this.connectSfx(clickGain, position);
        click.start();
        click.stop(now + 0.1);

        const squish = ctx.createOscillator();
        const squishGain = ctx.createGain();
        squish.type = 'sine';
        squish.frequency.setValueAtTime(90, now);
        squish.frequency.exponentialRampToValueAtTime(55, now + 0.18);
        squishGain.gain.setValueAtTime(0.12, now);
        squishGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        squish.connect(squishGain);
        this.connectSfx(squishGain, position);
        squish.start();
        squish.stop(now + 0.2);
    }

    playGrieverRoar(position) {
        if (!this.audioContext) return;
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        const scream = ctx.createOscillator();
        const gain = ctx.createGain();
        scream.type = 'sawtooth';
        scream.frequency.setValueAtTime(800, now);
        scream.frequency.exponentialRampToValueAtTime(220, now + 0.6);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        scream.connect(gain);
        this.connectSfx(gain, position);
        scream.start();
        scream.stop(now + 0.8);
    }

    playGrieverAttack(position) {
        if (!this.audioContext) return;
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        const slash = ctx.createOscillator();
        const gain = ctx.createGain();
        slash.type = 'triangle';
        slash.frequency.setValueAtTime(600, now);
        slash.frequency.exponentialRampToValueAtTime(200, now + 0.2);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        slash.connect(gain);
        this.connectSfx(gain, position);
        slash.start();
        slash.stop(now + 0.25);
    }

    playStoneDoorClose(position) {
        if (!this.audioContext) return;
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const rumble = ctx.createOscillator();
        const gain = ctx.createGain();
        rumble.type = 'sine';
        rumble.frequency.setValueAtTime(60, now);
        rumble.frequency.exponentialRampToValueAtTime(30, now + 1.1);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.02, now + 1.2);
        rumble.connect(gain);
        this.connectSfx(gain, position);
        rumble.start();
        rumble.stop(now + 1.2);

        const thud = ctx.createOscillator();
        const thudGain = ctx.createGain();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(90, now + 1.0);
        thudGain.gain.setValueAtTime(0.0001, now + 1.0);
        thudGain.gain.exponentialRampToValueAtTime(0.3, now + 1.05);
        thudGain.gain.exponentialRampToValueAtTime(0.01, now + 1.3);
        thud.connect(thudGain);
        this.connectSfx(thudGain, position);
        thud.start(now + 1.0);
        thud.stop(now + 1.35);
    }

    playBoxArrival(position) {
        if (!this.audioContext) return;
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        const chain = ctx.createOscillator();
        const chainGain = ctx.createGain();
        chain.type = 'square';
        chain.frequency.setValueAtTime(160, now);
        chain.frequency.exponentialRampToValueAtTime(80, now + 1.2);
        chainGain.gain.setValueAtTime(0.1, now);
        chainGain.gain.exponentialRampToValueAtTime(0.01, now + 1.4);
        chain.connect(chainGain);
        this.connectSfx(chainGain, position);
        chain.start();
        chain.stop(now + 1.4);

        const siren = ctx.createOscillator();
        const sirenGain = ctx.createGain();
        siren.type = 'sawtooth';
        siren.frequency.setValueAtTime(520, now);
        siren.frequency.exponentialRampToValueAtTime(440, now + 0.8);
        sirenGain.gain.setValueAtTime(0.18, now);
        sirenGain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
        siren.connect(sirenGain);
        this.connectSfx(sirenGain, position);
        siren.start();
        siren.stop(now + 1.0);
    }

    playFootstep(volume = 1) {
        if (!this.audioContext) return;

        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const duration = 0.09 + Math.random() * 0.04;
        const gainScale = Math.max(0.1, Math.min(1.2, volume));

        const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.4;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.setValueAtTime(900 + Math.random() * 250, now);
        band.Q.value = 0.6;

        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.setValueAtTime(600, now);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.exponentialRampToValueAtTime(0.08 * gainScale, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        const thump = ctx.createOscillator();
        const thumpGain = ctx.createGain();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(90 + Math.random() * 20, now);
        thumpGain.gain.setValueAtTime(0.0001, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.045 * gainScale, now + 0.02);
        thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        source.connect(band);
        band.connect(low);
        low.connect(gainNode);
        gainNode.connect(this.sfxGain);

        thump.connect(thumpGain);
        thumpGain.connect(this.sfxGain);

        source.start(now);
        source.stop(now + duration);
        thump.start(now);
        thump.stop(now + 0.1);
    }

    playHit() {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.2);

        gainNode.gain.setValueAtTime(0.14, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGain);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.2);
    }

    playStorm(position) {
        if (!this.audioContext) return;
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        const rumble = ctx.createOscillator();
        const gain = ctx.createGain();
        rumble.type = 'sine';
        rumble.frequency.setValueAtTime(70, now);
        rumble.frequency.exponentialRampToValueAtTime(40, now + 1.2);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 1.4);
        rumble.connect(gain);
        this.connectSfx(gain, position);
        rumble.start();
        rumble.stop(now + 1.5);

        const hiss = ctx.createBufferSource();
        hiss.buffer = this.createNoiseBuffer(0.6);
        const hissFilter = ctx.createBiquadFilter();
        hissFilter.type = 'highpass';
        hissFilter.frequency.value = 900;
        const hissGain = ctx.createGain();
        hissGain.gain.setValueAtTime(0.08, now);
        hissGain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
        hiss.connect(hissFilter);
        hissFilter.connect(hissGain);
        this.connectSfx(hissGain, position);
        hiss.start();
        hiss.stop(now + 0.7);
    }

    startRadiationRain(position = null) {
        if (!this.audioContext || this.radiationRainNodes) return;
        const ctx = this.audioContext;
        const noise = ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(2.6);
        noise.loop = true;

        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1400;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 6800;

        const rainGain = ctx.createGain();
        rainGain.gain.value = this.isMobileDevice ? 0.012 : 0.028;

        noise.connect(hp);
        hp.connect(lp);
        lp.connect(rainGain);
        if (position) {
            const panner = this.createPanner(position);
            rainGain.connect(panner);
            panner.connect(this.sfxGain);
            this.radiationRainNodes = { noise, hp, lp, rainGain, panner, tickTimer: null };
        } else {
            rainGain.connect(this.sfxGain);
            this.radiationRainNodes = { noise, hp, lp, rainGain, tickTimer: null };
        }
        noise.start();

        // Removed harsh periodic "click" layer that produced annoying crackle on mobile speakers.
        this.radiationRainNodes.tickTimer = null;
    }

    stopRadiationRain() {
        if (!this.radiationRainNodes) return;
        try {
            this.radiationRainNodes.noise?.stop?.();
        } catch {}
        if (this.radiationRainNodes.tickTimer) {
            clearInterval(this.radiationRainNodes.tickTimer);
        }
        this.radiationRainNodes = null;
    }

    playHurt() {
        if (!this.audioContext) return;

        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900, now);

        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.26);
    }

    playZoneDamage() {
        if (!this.audioContext) return;
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.4);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, now);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.5);
    }

    playZombieMoan(position = null) {
        if (!this.audioContext) return;

        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const sub = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const formant = ctx.createBiquadFilter();
        const noise = ctx.createBufferSource();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(108 + Math.random() * 18, now);
        osc.frequency.exponentialRampToValueAtTime(62, now + 0.95);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(78, now);
        osc2.frequency.exponentialRampToValueAtTime(44, now + 0.95);

        sub.type = 'sine';
        sub.frequency.setValueAtTime(48, now);
        sub.frequency.exponentialRampToValueAtTime(34, now + 0.95);

        noise.buffer = this.createNoiseBuffer(1.0);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(360, now);
        filter.Q.value = 0.55;
        formant.type = 'lowpass';
        formant.frequency.setValueAtTime(680, now);
        formant.Q.value = 0.45;

        gainNode.gain.setValueAtTime(this.isMobileDevice ? 0.11 : 0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.012, now + 1.0);

        osc.connect(filter);
        osc2.connect(filter);
        sub.connect(filter);
        noise.connect(filter);
        filter.connect(formant);
        formant.connect(gainNode);
        if (position) {
            this.connectSfx(gainNode, position);
        } else {
            gainNode.connect(this.sfxGain);
        }

        osc.start(now);
        osc2.start(now);
        sub.start(now);
        noise.start(now);
        osc.stop(now + 1.0);
        osc2.stop(now + 1.0);
        sub.stop(now + 1.0);
        noise.stop(now + 1.0);
    }

    playZombieAttack(position = null) {
        if (!this.audioContext) return;
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const growl = ctx.createOscillator();
        const shriek = ctx.createOscillator();
        const rasp = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const hiFilter = ctx.createBiquadFilter();
        const hiGain = ctx.createGain();

        growl.type = 'sawtooth';
        growl.frequency.setValueAtTime(150, now);
        growl.frequency.exponentialRampToValueAtTime(80, now + 0.38);

        shriek.type = 'triangle';
        shriek.frequency.setValueAtTime(980, now);
        shriek.frequency.exponentialRampToValueAtTime(420, now + 0.26);

        rasp.buffer = this.createNoiseBuffer(0.2);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(520, now);
        filter.Q.value = 0.9;
        hiFilter.type = 'highpass';
        hiFilter.frequency.setValueAtTime(1200, now);

        gain.gain.setValueAtTime(this.isMobileDevice ? 0.12 : 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.012, now + 0.42);
        hiGain.gain.setValueAtTime(this.isMobileDevice ? 0.04 : 0.08, now);
        hiGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        growl.connect(filter);
        rasp.connect(filter);
        filter.connect(gain);
        shriek.connect(hiFilter);
        hiFilter.connect(hiGain);
        if (position) {
            this.connectSfx(gain, position);
            this.connectSfx(hiGain, position);
        } else {
            gain.connect(this.sfxGain);
            hiGain.connect(this.sfxGain);
        }

        growl.start(now);
        shriek.start(now);
        rasp.start(now);
        growl.stop(now + 0.42);
        shriek.stop(now + 0.28);
        rasp.stop(now + 0.42);
    }

    playBowShot() {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.3);

        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGain);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }

    playLaser() {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.4);

        gainNode.gain.setValueAtTime(0.12, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);

        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGain);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.4);
    }

    playShotgun() {
        if (!this.audioContext) return;
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.35);
        gain.gain.setValueAtTime(0.26, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.45);

        const noise = ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.25);
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(900, now);
        noiseFilter.Q.value = 0.7;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.14, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.sfxGain);
        noise.start(now);
        noise.stop(now + 0.3);

        const thump = ctx.createOscillator();
        const thumpGain = ctx.createGain();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(70, now);
        thumpGain.gain.setValueAtTime(0.16, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        thump.connect(thumpGain);
        thumpGain.connect(this.sfxGain);
        thump.start(now);
        thump.stop(now + 0.25);
    }

    playFlamethrower() {
        if (!this.audioContext) return;
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const noise = ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.4);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, now);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        noise.start(now);
        noise.stop(now + 0.45);
    }

    playChestOpen() {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(500, this.audioContext.currentTime + 0.5);

        gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);

        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGain);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.5);
    }

    playChestNearby() {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime);
        oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime + 0.2);

        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGain);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.3);
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
                gainNode.gain.exponentialRampToValueAtTime(0.045, now + time + 0.08);
                gainNode.gain.exponentialRampToValueAtTime(0.008, now + time + duration);

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
