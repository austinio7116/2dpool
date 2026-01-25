// Audio system - generates and plays sound effects using Web Audio API

export class Audio {
    constructor() {
        this.enabled = true;
        this.context = null;
        this.masterGain = null;

        // Initialize on first user interaction
        this.initialized = false;
    }

    // Initialize audio context (must be called after user interaction)
    init() {
        if (this.initialized) return;

        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.context.createGain();
            this.masterGain.connect(this.context.destination);
            this.masterGain.gain.value = 0.5;
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
            this.enabled = false;
        }
    }

    // Enable/disable sound
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    // Resume audio context if suspended
    resume() {
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    }

    // Play ball-to-ball collision sound
    playBallCollision(intensity = 0.5) {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const volume = Math.min(1, intensity * 0.3);
        const duration = 0.08;

        // Create a short "click" sound
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800 + intensity * 200, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.context.currentTime + duration);

        gain.gain.setValueAtTime(volume, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + duration);
    }

    // Play ball-to-rail collision sound
    playRailCollision(intensity = 0.5) {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const volume = Math.min(0.6, intensity * 0.2);
        const duration = 0.1;

        // Create a "thump" sound
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150 + intensity * 50, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, this.context.currentTime + duration);

        gain.gain.setValueAtTime(volume, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + duration);
    }

    // Play pocket sound
    playPocket() {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const duration = 0.3;

        // Create a satisfying "clunk" sound
        const osc1 = this.context.createOscillator();
        const osc2 = this.context.createOscillator();
        const gain = this.context.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(200, this.context.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(60, this.context.currentTime + duration);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(100, this.context.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(40, this.context.currentTime + duration * 0.5);

        gain.gain.setValueAtTime(0.4, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.masterGain);

        osc1.start(this.context.currentTime);
        osc1.stop(this.context.currentTime + duration);
        osc2.start(this.context.currentTime);
        osc2.stop(this.context.currentTime + duration);
    }

    // Play cue strike sound
    playCueStrike(power = 0.5) {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const volume = 0.3 + power * 0.2;
        const duration = 0.15;

        // Create a "crack" sound
        const osc = this.context.createOscillator();
        const noise = this.createNoise(0.05);
        const gain = this.context.createGain();
        const noiseGain = this.context.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(1000 + power * 500, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, this.context.currentTime + duration);

        gain.gain.setValueAtTime(volume, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

        noiseGain.gain.setValueAtTime(volume * 0.3, this.context.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.05);

        osc.connect(gain);
        noise.connect(noiseGain);
        gain.connect(this.masterGain);
        noiseGain.connect(this.masterGain);

        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + duration);
        noise.start(this.context.currentTime);
        noise.stop(this.context.currentTime + 0.05);
    }

    // Play scratch (foul) sound
    playScratch() {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const duration = 0.5;

        // Descending tone for scratch
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.context.currentTime + duration);

        gain.gain.setValueAtTime(0.2, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(this.context.currentTime);
        osc.stop(this.context.currentTime + duration);
    }

    // Play win sound
    playWin() {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        // Play ascending notes
        const notes = [262, 330, 392, 523];  // C4, E4, G4, C5

        notes.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            const startTime = this.context.currentTime + i * 0.15;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(startTime);
            osc.stop(startTime + 0.3);
        });
    }

    // Create noise buffer for impact sounds
    createNoise(duration) {
        const bufferSize = this.context.sampleRate * duration;
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
                    this.playBallCollision(event.speed / 20);
                    break;
                case 'rail':
                    this.playRailCollision(event.speed / 15);
                    break;
                case 'pocket':
                    this.playPocket();
                    break;
            }
        }
    }
}
