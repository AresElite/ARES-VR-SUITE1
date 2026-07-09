/**
 * RhythmMusic — the beat-locked backing track engine.
 * Pure WebAudio, no assets, no licensing: kick / snare / hats / bass / pads
 * scheduled with a lookahead clock so the groove is sample-accurate and the
 * note choreography (spawned off the same start timestamp) lands ON the beat.
 */

type Style = "pulse" | "drive" | "wave" | "storm";

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    bus = ctx.createGain();
    bus.gain.value = 0.5;
    bus.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// chord roots per style (minor-flavored, athletic)
const PROGRESSIONS: Record<Style, number[]> = {
  pulse: [45, 48, 43, 41], // A2 C3 G2 F2
  wave: [43, 46, 41, 38],
  drive: [40, 43, 45, 38],
  storm: [38, 41, 44, 45],
};
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Engine {
  private timer: number | null = null;
  private nextBeat = 0;
  private startAt = 0;
  private bpm = 120;
  private style: Style = "pulse";
  private endBeat = 0;
  private paused = false;

  /** start the groove; returns the AudioContext timestamp of beat 0 */
  start(bpm: number, style: Style, lengthBeats: number, countInBeats: number): number {
    const c = ensure();
    this.stop();
    this.bpm = bpm;
    this.style = style;
    this.endBeat = lengthBeats + countInBeats + 4;
    this.nextBeat = 0;
    this.paused = false;
    if (!c) return 0;
    this.startAt = c.currentTime + 0.12;
    this.timer = window.setInterval(() => this.pump(), 60);
    this.pump();
    return this.startAt;
  }

  pause(): void {
    this.paused = true;
    if (ctx?.state === "running") void ctx.suspend();
  }

  resume(): void {
    this.paused = false;
    if (ctx?.state === "suspended") void ctx.resume();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (ctx?.state === "suspended") void ctx.resume(); // release for sfx
  }

  private pump(): void {
    const c = ctx;
    if (!c || this.paused) return;
    const spb = 60 / this.bpm;
    // schedule everything due in the next 0.25s
    while (this.startAt + this.nextBeat * spb < c.currentTime + 0.25) {
      if (this.nextBeat > this.endBeat) {
        this.stop();
        return;
      }
      this.scheduleBeat(this.nextBeat, this.startAt + this.nextBeat * spb, spb);
      this.nextBeat += 0.5; // eighth-note grid
    }
  }

  private scheduleBeat(beat: number, t: number, spb: number): void {
    const c = ctx!;
    const onBeat = beat % 1 === 0;
    const bar = Math.floor(beat / 4);
    const inBar = beat % 4;
    const s = this.style;
    // hats on every eighth (lighter on offbeats)
    this.hat(t, onBeat ? 0.06 : 0.035, s === "storm" ? 9000 : 7500);
    if (onBeat) {
      // kick pattern
      const four = s === "drive" || s === "storm";
      if (inBar === 0 || inBar === 2 || (four && (inBar === 1 || inBar === 3))) this.kick(t);
      // snare on 2 & 4
      if (inBar === 1 || inBar === 3) this.snare(t, s === "pulse" ? 0.10 : 0.14);
      // bass root on beat, following the progression
      const root = PROGRESSIONS[s][bar % 4];
      this.bassNote(t, midiHz(root), spb * (s === "wave" ? 0.9 : 0.48));
      // pad chord at each bar start
      if (inBar === 0) this.pad(t, root, spb * 4);
    } else if (s === "storm" || s === "drive") {
      // driving offbeat bass octave
      const root = PROGRESSIONS[s][bar % 4] + 12;
      this.bassNote(t, midiHz(root), spb * 0.32, 0.08);
    }
  }

  private kick(t: number): void {
    const c = ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(bus!);
    o.start(t);
    o.stop(t + 0.2);
  }

  private snare(t: number, gain: number): void {
    const c = ctx!;
    const len = 0.12;
    const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1900;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(bus!);
    src.start(t);
  }

  private hat(t: number, gain: number, freq: number): void {
    const c = ctx!;
    const len = 0.04;
    const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(bus!);
    src.start(t);
  }

  private bassNote(t: number, hz: number, dur: number, gain = 0.16): void {
    const c = ctx!;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = hz;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(bus!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private pad(t: number, rootMidi: number, dur: number): void {
    const c = ctx!;
    for (const iv of [12, 15, 19]) { // minor triad, up an octave
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = midiHz(rootMidi + iv);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035, t + dur * 0.25);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(bus!);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

export const rhythmMusic = new Engine();
