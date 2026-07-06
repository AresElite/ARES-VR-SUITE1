/**
 * A.R.E.S. audio engine — fully synthesized (zero assets, zero network).
 * WebAudio oscillators tuned to the brand: precise, clinical, satisfying.
 * Spatialized subtly via stereo pan; volumes kept low for training focus.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, durMs: number, opts: { type?: OscillatorType; gain?: number; sweepTo?: number; pan?: number; delayMs?: number } = {}) {
  const c = ensure();
  if (!c || !master) return;
  const t0 = c.currentTime + (opts.delayMs ?? 0) / 1000;
  const osc = c.createOscillator();
  const g = c.createGain();
  const p = c.createStereoPanner();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + durMs / 1000);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.5, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  p.pan.value = opts.pan ?? 0;
  osc.connect(g).connect(p).connect(master);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

export const sfx = {
  /** primed on first user gesture so Quest Browser allows playback */
  unlock: () => void ensure(),
  uiClick: () => tone(1180, 45, { gain: 0.18, type: "triangle" }),
  hit: (streak = 0, pan = 0) => {
    const base = 740 + Math.min(streak, 10) * 40; // rising pitch rewards streaks
    tone(base, 70, { gain: 0.4, sweepTo: base * 1.5, pan });
  },
  error: (pan = 0) => tone(160, 140, { type: "square", gain: 0.22, sweepTo: 110, pan }),
  noGoHold: () => tone(520, 90, { gain: 0.16, type: "triangle" }),
  countdown: () => tone(660, 110, { gain: 0.35 }),
  go: () => tone(880, 260, { gain: 0.4, sweepTo: 1174 }),
  complete: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 320, { gain: 0.3, delayMs: i * 110 }));
  },
  portal: () => tone(220, 420, { gain: 0.25, sweepTo: 880, type: "triangle" }),
  streakMilestone: () => {
    tone(880, 120, { gain: 0.3 });
    tone(1320, 160, { gain: 0.3, delayMs: 90 });
  },
};
