export class AudioSynth {
    constructor() {
        this.audioContext = null;
        this.sounds = {};
        this.musicGain = null;
        this.sfxGain = null;
        this.reverb = null;
        this.reverbGain = null;
        this.ambientNodes = [];
        this.ambientRunning = false;
        this.init();
    }

    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.musicGain = this.audioContext.createGain();
            this.sfxGain = this.audioContext.createGain();
            this.reverb = this.audioContext.createConvolver();
            this.reverbGain = this.audioContext.createGain();

            this.reverb.buffer = this.createImpulse(2.4, 2.0);
            this.reverbGain.gain.value = 0.35;

            this.musicGain.connect(this.audioContext.destination);
            this.sfxGain.connect(this.audioContext.destination);
            this.sfxGain.connect(this.reverb);
            this.reverb.connect(this.reverbGain);
            this.reverbGain.connect(this.audioContext.destination);

            this.musicGain.gain.value = 0.3;
            this.sfxGain.gain.value = 0.7;
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

    createNoiseBuffer(duration) {
        const ctx = this.audioContext;
        const length = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < data.length; i++) {
            const white = Math.random() * 2 - 1;
            last = (last + 0.02 * white) / 1.02;
            data[i] = last * 3.5;
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
        windGain.gain.value = 0.05;
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
        rumbleGain.gain.value = 0.05;
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
        rustleGain.gain.value = 0.03;
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
            gain.gain.value = 0.02;
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
        gain.gain.setValueAtTime(0.25, now);
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

    playFootstep() {
        if (!this.audioContext) return;

        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const duration = 0.09 + Math.random() * 0.04;

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
        gainNode.gain.exponentialRampToValueAtTime(0.11, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        const thump = ctx.createOscillator();
        const thumpGain = ctx.createGain();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(90 + Math.random() * 20, now);
        thumpGain.gain.setValueAtTime(0.0001, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
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

        gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGain);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.2);
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

        gainNode.gain.setValueAtTime(0.18, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.26);
    }

    playZombieMoan() {
        if (!this.audioContext) return;

        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160 + Math.random() * 30, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.4);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(700, now);

        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.55);
    }

    playBowShot() {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.3);

        gainNode.gain.setValueAtTime(0.15, this.audioContext.currentTime);
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

        gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);

        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGain);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.4);
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
        if (!this.audioContext) return;

        const playTone = (freq, time, duration) => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.value = freq;

            gainNode.gain.setValueAtTime(0.05, this.audioContext.currentTime + time);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + time + duration);

            oscillator.connect(gainNode);
            gainNode.connect(this.musicGain);

            oscillator.start(this.audioContext.currentTime + time);
            oscillator.stop(this.audioContext.currentTime + time + duration);
        };

        playTone(220, 0, 1.5);
        playTone(280, 1.5, 1.5);
        playTone(180, 3, 1.5);
        playTone(260, 4.5, 1.5);
    }
}
