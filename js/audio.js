// Audio system - generates realistic pool sound effects using Web Audio API

export class Audio {
    constructor() {
        this.enabled = true;
        this.context = null;
        this.masterGain = null;
        this.initialized = false;

        // Precomputed noise buffer for performance
        this.noiseBuffer = null;

        // Loaded sound buffers
        this.ballHitBuffer = null;
    }

    // Initialize audio context (must be called after user interaction)
    init() {
        if (this.initialized) return;

        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.context.createGain();
            this.masterGain.connect(this.context.destination);
            this.masterGain.gain.value = 0.6;
            this.initialized = true;

            // Pre-generate noise buffer
            this.noiseBuffer = this.createNoiseBuffer(0.5);

            // Load sound effects
            this.loadSound('assets/sounds/ballhit.mp3', 'ballHitBuffer');
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
            this.enabled = false;
        }
    }

    // Load a sound file into a buffer
    async loadSound(url, bufferName) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this[bufferName] = await this.context.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.warn(`Failed to load sound ${url}:`, e);
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    resume() {
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    }

    // Create a bandpass filter
    createBandpass(frequency, Q) {
        const filter = this.context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = frequency;
        filter.Q.value = Q;
        return filter;
    }

    // Create a highpass filter
    createHighpass(frequency) {
        const filter = this.context.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = frequency;
        return filter;
    }

    // Create a lowpass filter
    createLowpass(frequency) {
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = frequency;
        return filter;
    }

    // Ball-to-ball collision - plays loaded sound sample
    playBallCollision(intensity = 0.5) {
        if (!this.enabled || !this.initialized) return;
        if (!this.ballHitBuffer) return;
        this.resume();

        const clampedIntensity = Math.min(1, Math.max(0.1, intensity));
        const volume = 0.25 + clampedIntensity * 0.75;

        const source = this.context.createBufferSource();
        source.buffer = this.ballHitBuffer;

        const gainNode = this.context.createGain();
        gainNode.gain.value = volume;

        source.connect(gainNode);
        gainNode.connect(this.masterGain);

        source.start();
    }

    // Realistic rail collision - softer thump with rubber cushion character
    playRailCollision(intensity = 0.5) {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const now = this.context.currentTime;
        const clampedIntensity = Math.min(1, Math.max(0.1, intensity));
        const volume = 0.12 + clampedIntensity * 0.18;
        const pitchVar = 0.95 + Math.random() * 0.1;

        // Layer 1: Soft rubber impact (muffled thud)
        const thudNoise = this.createNoiseSource();
        const thudFilter = this.createLowpass(600 * pitchVar);
        const thudFilter2 = this.createBandpass(200, 1);
        const thudGain = this.context.createGain();

        thudGain.gain.setValueAtTime(volume * 0.7, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        thudNoise.connect(thudFilter);
        thudFilter.connect(thudFilter2);
        thudFilter2.connect(thudGain);
        thudGain.connect(this.masterGain);

        thudNoise.start(now);
        thudNoise.stop(now + 0.1);

        // Layer 2: Subtle high-end for ball contact
        const contactNoise = this.createNoiseSource();
        const contactFilter = this.createBandpass(1200, 3);
        const contactGain = this.context.createGain();

        contactGain.gain.setValueAtTime(volume * 0.25, now);
        contactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

        contactNoise.connect(contactFilter);
        contactFilter.connect(contactGain);
        contactGain.connect(this.masterGain);

        contactNoise.start(now);
        contactNoise.stop(now + 0.03);

        // Layer 3: Table resonance for harder hits
        if (clampedIntensity > 0.5) {
            const osc = this.context.createOscillator();
            const oscGain = this.context.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(80 + clampedIntensity * 40, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.12);

            oscGain.gain.setValueAtTime(volume * 0.15 * clampedIntensity, now);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            osc.connect(oscGain);
            oscGain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + 0.15);
        }
    }

    // Pocket sound - ball dropping into pocket
    playPocket() {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const now = this.context.currentTime;

        // Layer 1: Initial soft thud as ball hits pocket
        const thudOsc = this.context.createOscillator();
        const thudGain = this.context.createGain();

        thudOsc.type = 'sine';
        thudOsc.frequency.setValueAtTime(180, now);
        thudOsc.frequency.exponentialRampToValueAtTime(80, now + 0.1);

        thudGain.gain.setValueAtTime(0.35, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        thudOsc.connect(thudGain);
        thudGain.connect(this.masterGain);

        thudOsc.start(now);
        thudOsc.stop(now + 0.15);

        // Layer 2: Muffled impact texture
        const impactNoise = this.createNoiseSource();
        const impactFilter = this.createLowpass(500);
        const impactGain = this.context.createGain();

        impactGain.gain.setValueAtTime(0.2, now);
        impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        impactNoise.connect(impactFilter);
        impactFilter.connect(impactGain);
        impactGain.connect(this.masterGain);

        impactNoise.start(now);
        impactNoise.stop(now + 0.1);

        // Layer 3: Secondary thud as ball lands in pocket tray
        const landOsc = this.context.createOscillator();
        const landGain = this.context.createGain();

        landOsc.type = 'sine';
        landOsc.frequency.setValueAtTime(120, now + 0.15);
        landOsc.frequency.exponentialRampToValueAtTime(60, now + 0.3);

        landGain.gain.setValueAtTime(0, now);
        landGain.gain.linearRampToValueAtTime(0.25, now + 0.16);
        landGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        landOsc.connect(landGain);
        landGain.connect(this.masterGain);

        landOsc.start(now + 0.15);
        landOsc.stop(now + 0.4);
    }

    // Realistic cue strike - leather tip hitting ball
    playCueStrike(power = 0.5) {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const now = this.context.currentTime;
        const clampedPower = Math.min(1, Math.max(0.1, power));
        const volume = 0.2 + clampedPower * 0.2;

        // Layer 1: Sharp attack (tip contact)
        const attackNoise = this.createNoiseSource();
        const attackFilter = this.createBandpass(2500 + clampedPower * 1000, 3);
        const attackGain = this.context.createGain();

        attackGain.gain.setValueAtTime(volume * 0.9, now);
        attackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

        attackNoise.connect(attackFilter);
        attackFilter.connect(attackGain);
        attackGain.connect(this.masterGain);

        attackNoise.start(now);
        attackNoise.stop(now + 0.025);

        // Layer 2: Cue stick "thock"
        const thockNoise = this.createNoiseSource();
        const thockFilter = this.createBandpass(1000, 2);
        const thockGain = this.context.createGain();

        thockGain.gain.setValueAtTime(volume * 0.6, now + 0.003);
        thockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        thockNoise.connect(thockFilter);
        thockFilter.connect(thockGain);
        thockGain.connect(this.masterGain);

        thockNoise.start(now);
        thockNoise.stop(now + 0.07);

        // Layer 3: Low body for power shots
        if (clampedPower > 0.3) {
            const bodyNoise = this.createNoiseSource();
            const bodyFilter = this.createLowpass(500);
            const bodyGain = this.context.createGain();

            bodyGain.gain.setValueAtTime(volume * 0.4 * clampedPower, now);
            bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

            bodyNoise.connect(bodyFilter);
            bodyFilter.connect(bodyGain);
            bodyGain.connect(this.masterGain);

            bodyNoise.start(now);
            bodyNoise.stop(now + 0.1);
        }
    }

    // Scratch/foul sound - distinct but not jarring
    playScratch() {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const now = this.context.currentTime;

        // Two-tone "uh-oh" style sound
        const osc1 = this.context.createOscillator();
        const osc2 = this.context.createOscillator();
        const gain1 = this.context.createGain();
        const gain2 = this.context.createGain();

        osc1.type = 'sine';
        osc1.frequency.value = 350;
        gain1.gain.setValueAtTime(0.2, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc2.type = 'sine';
        osc2.frequency.value = 280;
        gain2.gain.setValueAtTime(0, now + 0.12);
        gain2.gain.linearRampToValueAtTime(0.2, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc1.connect(gain1);
        osc2.connect(gain2);
        gain1.connect(this.masterGain);
        gain2.connect(this.masterGain);

        osc1.start(now);
        osc1.stop(now + 0.2);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.4);
    }

    // Win sound - pleasant success jingle
    playWin() {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const now = this.context.currentTime;
        const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6

        notes.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            const startTime = now + i * 0.12;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.25, startTime + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(startTime);
            osc.stop(startTime + 0.3);
        });
    }

    // Create reusable noise buffer (more efficient)
    createNoiseBuffer(duration) {
        const bufferSize = Math.floor(this.context.sampleRate * duration);
        const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        return buffer;
    }

    // Create noise source from pre-generated buffer
    createNoiseSource() {
        const noise = this.context.createBufferSource();
        noise.buffer = this.noiseBuffer;
        return noise;
    }

    // Legacy method for compatibility
    createNoise(duration) {
        const bufferSize = Math.floor(this.context.sampleRate * duration);
        const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.context.createBufferSource();
        noise.buffer = buffer;
        return noise;
    }

    // Handle collision events from physics
    handleCollisionEvents(events) {
        for (const event of events) {
            switch (event.type) {
                case 'ball':
                    this.playBallCollision(event.speed / 15);
                    break;
                case 'rail':
                    this.playRailCollision(event.speed / 12);
                    break;
                case 'pocket':
                    this.playPocket();
                    break;
            }
        }
    }
}
