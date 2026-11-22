// All sound is Web Audio synthesis (§9): a plucked-strings-and-marimba loop that gains a
// drum layer and tempo (100 → 124 BPM) with speed, and the effects named in §4 and §8.
// Nothing is loaded. The context is made on the first gesture (browsers block autoplay),
// music and effects have separate switches, and everything is mixed soft.

// F major pentatonic over two octaves: the loop, the fruit plinks and the chimes share it.
const SCALE = [349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99, 880.0, 1046.5, 1174.66, 1396.91];
// Two bars in eighths, as scale steps (-1 rests).
const MELODY = [4, -1, 2, 4, 5, -1, 4, 2, 3, -1, 1, 3, 2, -1, 0, -1];
const BASS = [0, -1, -1, -1, 3, -1, -1, -1, 1, -1, -1, -1, 2, -1, -1, -1];

export class Sound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private musicOn = true;
  private musicPlaying = false;
  private nextNote = 0;
  private musicStep = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private beatsPerMinute = 100;
  private drums = false;
  private plinkStep = 0;
  private lastPlink = 0;

  /** Call from a user gesture. Safe to call again and again. */
  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      return;
    }
    try {
      const context = new AudioContext();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(context.destination);
      this.effects = context.createGain();
      this.effects.gain.value = 0.6;
      this.effects.connect(this.master);
      this.music = context.createGain();
      this.music.gain.value = 0;
      this.music.connect(this.master);
      const length = Math.floor(context.sampleRate);
      this.noise = context.createBuffer(1, length, context.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let index = 0; index < length; index++) samples[index] = Math.random() * 2 - 1;
    } catch {
      this.context = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.context.currentTime, 0.03);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  /** §9: the loop speeds up with the boardwalk, and a drum joins once two-kind rows begin. */
  setPace(speedFraction: number, drums: boolean): void {
    this.beatsPerMinute = 100 + 24 * Math.min(1, Math.max(0, speedFraction));
    this.drums = drums;
  }

  suspend(): void {
    if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
  }

  resume(): void {
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
  }

  startMusic(): void {
    const context = this.context;
    if (!context || !this.music || !this.musicOn || this.musicPlaying) return;
    this.musicPlaying = true;
    this.music.gain.setTargetAtTime(0.32, context.currentTime, 0.6);
    this.nextNote = context.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 60);
  }

  stopMusic(): void {
    this.musicPlaying = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.context && this.music) this.music.gain.setTargetAtTime(0, this.context.currentTime, 0.2);
  }

  private schedule(): void {
    const context = this.context;
    if (!context || !this.music) return;
    const eighth = 60 / this.beatsPerMinute / 2;
    while (this.nextNote < context.currentTime + 0.25) {
      const index = this.musicStep % MELODY.length;
      const melody = MELODY[index]!;
      const bass = BASS[index]!;
      if (melody >= 0) this.marimba(SCALE[melody + 3]!, this.nextNote, 0.16, this.music);
      if (bass >= 0) this.pluck(SCALE[bass]! / 2, this.nextNote, 0.12, this.music);
      if (index % 4 === 2) this.pluck(SCALE[(bass >= 0 ? bass : 2) + 2]!, this.nextNote, 0.05, this.music);
      if (this.drums) {
        if (index % 4 === 0) this.tone(150, 45, 0.16, 'sine', 0.3, this.nextNote, this.music);
        if (index % 2 === 1) this.hiss(0.04, 7000, 'highpass', 0.06, this.nextNote, this.music);
      }
      this.nextNote += eighth;
      this.musicStep++;
    }
  }

  /** A marimba bar: a sine and a quieter fourth harmonic, both short. */
  private marimba(frequency: number, when: number, volume: number, out: AudioNode): void {
    this.tone(frequency, frequency, 0.45, 'sine', volume, when, out);
    this.tone(frequency * 4, frequency * 4, 0.08, 'sine', volume * 0.3, when, out);
  }

  /** A plucked string: a triangle with a quick decay. */
  private pluck(frequency: number, when: number, volume: number, out: AudioNode): void {
    this.tone(frequency, frequency, 0.6, 'triangle', volume, when, out);
  }

  private tone(from: number, to: number, seconds: number, type: OscillatorType, volume: number, when = -1, out?: AudioNode): void {
    const context = this.context;
    if (!context || !this.effects) return;
    const start = when < 0 ? context.currentTime : when;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    gain.connect(out ?? this.effects);
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, start + seconds);
    oscillator.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.05);
  }

  private hiss(seconds: number, frequency: number, type: BiquadFilterType, volume: number, when = -1, out?: AudioNode, sweepTo = frequency): void {
    const context = this.context;
    if (!context || !this.noise || !this.effects) return;
    const start = when < 0 ? context.currentTime : when;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    if (sweepTo !== frequency) filter.frequency.exponentialRampToValueAtTime(sweepTo, start + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    source.connect(filter).connect(gain).connect(out ?? this.effects);
    source.start(start, Math.random() * 0.5);
    source.stop(start + seconds + 0.02);
  }

  private notes(steps: number[], spacing: number, volume: number): void {
    if (!this.context) return;
    steps.forEach((step, index) => this.marimba(SCALE[step]!, this.context!.currentTime + index * spacing, volume, this.effects!));
  }

  whoosh(): void {
    this.hiss(0.16, 500, 'bandpass', 0.22, -1, undefined, 2200);
  }

  boing(): void {
    this.tone(220, 560, 0.2, 'sine', 0.3);
  }

  fwip(): void {
    this.hiss(0.14, 3200, 'bandpass', 0.25, -1, undefined, 700);
  }

  /** Fruit plinks climb the scale while they keep coming (§4). */
  plink(now: number): void {
    this.plinkStep = now - this.lastPlink < 0.7 ? Math.min(this.plinkStep + 1, SCALE.length - 1) : 3;
    this.lastPlink = now;
    this.marimba(SCALE[this.plinkStep]! * 2, this.context?.currentTime ?? 0, 0.16, this.effects!);
  }

  swirl(): void {
    this.hiss(0.4, 300, 'bandpass', 0.2, -1, undefined, 1400);
  }

  hup(): void {
    this.tone(300, 440, 0.09, 'square', 0.07);
  }

  /** §8: a soft wooden thock, then a falling slide whistle and twinkles. */
  bonk(): void {
    const context = this.context;
    if (!context) return;
    this.tone(190, 60, 0.14, 'sine', 0.5);
    this.hiss(0.05, 900, 'lowpass', 0.3);
    this.tone(1300, 280, 0.9, 'sine', 0.12, context.currentTime + 0.18);
    [8, 10, 9, 10].forEach((step, index) => this.tone(SCALE[step]! * 2, SCALE[step]! * 2, 0.3, 'sine', 0.06, context.currentTime + 1.1 + index * 0.09));
  }

  ringPop(): void {
    this.tone(640, 180, 0.22, 'sine', 0.35);
    this.hiss(0.05, 2500, 'highpass', 0.25);
  }

  ringGet(): void {
    this.notes([3, 5], 0.08, 0.16);
  }

  bubbleGet(): void {
    this.tone(400, 950, 0.45, 'sine', 0.18);
  }

  bubblePop(): void {
    this.hiss(0.05, 3000, 'highpass', 0.35);
    this.tone(900, 1200, 0.06, 'sine', 0.15);
  }

  pinwheel(): void {
    this.hiss(0.7, 1800, 'bandpass', 0.16, -1, undefined, 900);
  }

  spring(): void {
    this.tone(150, 760, 0.38, 'triangle', 0.25);
  }

  /** §4: passing the flag — a bell, then an arpeggio. */
  chime(): void {
    const context = this.context;
    if (!context) return;
    for (const partial of [1, 2.76, 5.4]) this.tone(880 * partial, 880 * partial, 1.2 / partial, 'sine', 0.12 / partial);
    this.notes([5, 7, 9, 10], 0.09, 0.14);
  }

  zone(): void {
    this.notes([3, 5, 7, 8], 0.12, 0.14);
  }

  /** The three count-in dots after a pause. */
  tick(last: boolean): void {
    this.tone(last ? 1046.5 : 698.46, last ? 1046.5 : 698.46, 0.12, 'sine', 0.12);
  }
}
