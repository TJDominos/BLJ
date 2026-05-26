export class SoundManager {
    private static instance: SoundManager;
    public isMuted: boolean = false;
    private audioCtx: AudioContext | null = null;

    private constructor() {}

    public static getInstance(): SoundManager {
        if (!SoundManager.instance) {
            SoundManager.instance = new SoundManager();
        }
        return SoundManager.instance;
    }

    private getContext(): AudioContext | null {
        if (typeof window === 'undefined') return null;
        if (!this.audioCtx) {
            try {
                this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            } catch (e) {
                console.error("Web Audio API not supported", e);
            }
        }
        return this.audioCtx;
    }

    public toggleMute() {
        this.isMuted = !this.isMuted;
    }

    public setMuted(muted: boolean) {
        this.isMuted = muted;
    }

    private playTone(freq: number, type: OscillatorType | string, duration: number, vol: number, pan: number = 0, isNoise: boolean = false) {
        if (this.isMuted) return;
        const ctx = this.getContext();
        if (!ctx) return;

        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const outNode = ctx.destination;
        let panner: PannerNode | StereoPannerNode | undefined;
        
        // Use StereoPanner if available, else fallback to 3D Panner
        if (ctx.createStereoPanner) {
            panner = ctx.createStereoPanner();
            panner.pan.setValueAtTime(pan, ctx.currentTime);
        } else {
            panner = ctx.createPanner();
            panner.panningModel = 'equalpower';
            panner.setPosition(pan, 0, 1 - Math.abs(pan));
        }
        
        panner.connect(outNode);

        const gain = ctx.createGain();
        gain.connect(panner);

        if (isNoise) {
            const bufferSize = ctx.sampleRate * duration;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            // Filter for felt/cloth sound
            const filter = ctx.createBiquadFilter();
            filter.type = (type as BiquadFilterType) || 'bandpass';
            filter.frequency.setValueAtTime(freq, ctx.currentTime);
            filter.Q.value = 1;

            noise.connect(filter);
            filter.connect(gain);

            gain.gain.setValueAtTime(vol, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

            noise.start();
            return;
        }

        const osc = ctx.createOscillator();
        osc.type = type as OscillatorType;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        osc.connect(gain);

        osc.start();
        osc.stop(ctx.currentTime + duration);
    }

    public playWin(pan: number = 0) {
        if (this.isMuted) return;
        const ctx = this.getContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();

        // Cash register / coin jackpot cascading bell sound
        for(let i=0; i<8; i++) {
            setTimeout(() => {
                this.playTone(800 + Math.random() * 400, 'square', 0.2, 0.1, pan);
            }, i * 100);
        }
        setTimeout(() => {
            this.playTone(1200, 'sine', 0.8, 0.2, pan);
            this.playTone(1500, 'triangle', 0.8, 0.1, pan);
        }, 800);
    }

    public playChip(pan: number = 0) {
        // High click sound for chip, stereo
        this.playTone(2000, 'square', 0.05, 0.05, pan);
        setTimeout(() => this.playTone(2200, 'square', 0.05, 0.05, pan), 30);
    }

    public playCardDeal(pan: number = 0) {
        // Fast filtered noise for card sliding on felt cloth, sharp "si-si" scratch
        this.playTone(6000, 'bandpass', 0.08, 0.15, pan, true);
        setTimeout(() => this.playTone(8000, 'bandpass', 0.05, 0.05, pan, true), 30);
    }

    public playClick(pan: number = 0) {
        // UI click
        this.playTone(1000, 'sine', 0.05, 0.1, pan);
    }

    public playShuffle(pan: number = 0) {
        if (this.isMuted) return;
        const ctx = this.getContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();

        for(let i=0; i<15; i++) {
            setTimeout(() => this.playTone(3000 + Math.random()*2000, 'bandpass', 0.08, 0.04, (Math.random()*2 - 1) * 0.5, true), i*35);
        }
    }

    public playLose(pan: number = 0) {
        if (this.isMuted) return;
        const ctx = this.getContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();

        // Quick, short, low pitch thud
        this.playTone(100, 'sawtooth', 0.1, 0.1, pan);
        setTimeout(() => {
            this.playTone(60, 'sawtooth', 0.15, 0.1, pan);
        }, 80);
    }

    public playTick(pan: number = 0) {
        if (this.isMuted) return;
        this.playTone(800, 'sine', 0.05, 0.2, pan);
    }

    public playBell(pan: number = 0) {
        if (this.isMuted) return;
        const ctx = this.getContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();

        const outNode = ctx.destination;
        let panner: PannerNode | StereoPannerNode | undefined;
        
        // Use StereoPanner if available, else fallback to 3D Panner
        if (ctx.createStereoPanner) {
            panner = ctx.createStereoPanner();
            panner.pan.setValueAtTime(pan, ctx.currentTime);
        } else {
            panner = ctx.createPanner();
            panner.panningModel = 'equalpower';
            panner.setPosition(pan, 0, 1 - Math.abs(pan));
        }
        
        panner.connect(outNode);

        // Small bell ding ding ding
        const baseFreq = 1661.22; // G#6, higher pitch for a small bell
        const now = ctx.currentTime;

        const partials = [
            { ratio: 1, gain: 0.5, decay: 0.8 },
            { ratio: 2.15, gain: 0.3, decay: 0.4 },
            { ratio: 3.44, gain: 0.1, decay: 0.2 }
        ];

        // Play 2 rapid dings
        for (let i = 0; i < 2; i++) {
            const timeOffset = now + (i * 0.15); // 150ms between dings
            
            partials.forEach(partial => {
                const osc = ctx.createOscillator();
                const gainNode = ctx.createGain();
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(baseFreq * partial.ratio, timeOffset);
                
                // Fast attack, short exponential decay
                gainNode.gain.setValueAtTime(0, timeOffset);
                gainNode.gain.linearRampToValueAtTime(partial.gain, timeOffset + 0.005);
                gainNode.gain.exponentialRampToValueAtTime(0.001, timeOffset + partial.decay);
                
                osc.connect(gainNode);
                gainNode.connect(panner!);
                
                osc.start(timeOffset);
                osc.stop(timeOffset + partial.decay);
            });
        }
    }
}

export const soundManager = SoundManager.getInstance();
