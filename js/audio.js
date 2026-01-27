// Audio system - generates realistic pool sound effects using Web Audio API

export class Audio {
    constructor() {
        this.enabled = true;
        this.context = null;
        this.masterGain = null;
        this.initialized = false;
        this.tableType = 'pool'; // defaults to pool

        // Precomputed noise buffer for performance
        this.noiseBuffer = null;

        // Loaded sound buffers
        this.ballHitBuffer = null;
        this.ballHitBuffer2 = null;
        this.cueStrikeBuffer = null;
        this.potBuffer = null;
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
            this.loadSound('assets/sounds/ballhit2.mp3', 'ballHitBuffer2');
            this.loadSound('assets/sounds/cueshot.mp3', 'cueStrikeBuffer');
            this.loadSound('assets/sounds/pot.mp3', 'potBuffer');
            this.loadSound('assets/sounds/softpot.mp3', 'snookerPotBuffer');
            this.loadSound('assets/sounds/hardpot.mp3', 'snookerHardPotBuffer');
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
            this.enabled = false;
        }
    }

    setTableType(type) {
        // 'pool' or 'snooker'
        this.tableType = type;
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

    // Ball-to-ball collision - plays loaded sound sample (randomly picks between two sounds)
    playBallCollision(intensity = 0.5) {
        if (!this.enabled || !this.initialized) return;
        if (!this.ballHitBuffer && !this.ballHitBuffer2) return;
        this.resume();

        const clampedIntensity = Math.min(1, Math.max(0.02, intensity));
        // Use sqrt for more natural volume scaling (quieter at low intensities)
        const volume = Math.sqrt(clampedIntensity) * 0.9;

        // Randomly choose between the two ball hit sounds
        const buffers = [this.ballHitBuffer, this.ballHitBuffer2].filter(b => b);
        const buffer = buffers[Math.floor(Math.random() * buffers.length)];

        const source = this.context.createBufferSource();
        source.buffer = buffer;

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
    playPocket(speed = 0) {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        let buffer = null;
        let volume = 0.8;

        if (this.tableType === 'snooker') {
            // Snooker Logic
            
            // Threshold for hard pot (adjust based on your physics scale)
            // If normal ball hit max volume is speed 15, let's say 8 is a hard pot
            const HARD_POT_THRESHOLD = 4.0; 

            if (speed > HARD_POT_THRESHOLD) {
                // Hard Pot
                buffer = this.snookerHardPotBuffer;
                
                // Dynamic Volume:
                // Start at 0.5 and add volume based on how much it exceeds threshold
                // Cap at 1.0
                const excessSpeed = speed - HARD_POT_THRESHOLD;
                volume = Math.min(1.0, 0.5 + (excessSpeed * 0.05));
            } else {
                // Soft Pot
                buffer = this.snookerPotBuffer;
                // Soft pots are naturally quieter
                volume = 0.6; 
            }
        } else {
            // Pool Logic (Standard)
            buffer = this.potBuffer;
            volume = 0.8;
        }

        // Guard clause in case a specific buffer didn't load
        if (!buffer) return;

        const source = this.context.createBufferSource();
        source.buffer = buffer;

        const gainNode = this.context.createGain();
        gainNode.gain.value = volume;

        source.connect(gainNode);
        gainNode.connect(this.masterGain);

        source.start();
    }

    // Cue strike - cue tip hitting ball
    playCueStrike(power = 0.5) {
        if (!this.enabled || !this.initialized) return;
        if (!this.cueStrikeBuffer) return;
        this.resume();

        const clampedPower = Math.min(1, Math.max(0.1, power));
        const volume = 0.4 + clampedPower * 0.6;

        const source = this.context.createBufferSource();
        source.buffer = this.cueStrikeBuffer;

        const gainNode = this.context.createGain();
        gainNode.gain.value = volume;

        source.connect(gainNode);
        gainNode.connect(this.masterGain);

        source.start();
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
                    // Pass the captured speed to the pocket function
                    this.playPocket(event.speed);
                    break;
            }
        }
    }
}
