import type { DrillDefinition, TrialSpec, ProgressionLevel, TargetZone } from "@/ares/drillTypes";
import { LAUNCH_Z, holeCount, sizeSawtooth, launchVelocity, travelMsFor, holeMarkers, pickHole } from "./launcher";

/**
 * GO / NO-GO — 50 levels, ported whole from the touchscreen drill.
 *
 * Three colours mean GO. One colour means DO NOTHING. The measurement is not how fast you
 * can respond; it is whether you can STOP once you have already started. Every level tightens
 * the deadline, which is what forces the athlete into a pre-committed motor state — and a
 * pre-committed motor state is the only condition under which inhibition is actually hard.
 *
 * SIX BANDS, exactly as authored:
 *   1-8   FUNDAMENTALS  central -> peripheral, mask appears at L6, 1330ms -> 850ms
 *   9-16  ADVANCED      spatial + jittered foreperiod, 1185ms -> 730ms
 *   17-24 ELITE         brief onset + backward mask, hue jitter, visual noise
 *   25-32 PRO           smaller, faster, 350ms -> 245ms onsets
 *   33-40 MASTER        240ms -> 170ms onsets
 *   41-50 LEGEND        180ms -> 126ms onsets, 900ms -> 540ms deadlines
 *
 * The Go probability FALLS as you climb (0.75 -> 0.62). This is deliberate and it is the
 * cruellest axis in the drill: a rare No-Go is easy to withhold because you are not primed,
 * but as No-Go gets COMMON the athlete stops pre-loading the response and the drill quietly
 * stops measuring inhibition at all. Dropping toward 62% keeps the Go response prepotent
 * enough to be worth stopping, while making the stop frequent enough to score.
 *
 * ── RESPONSE = HAND TOUCH ──────────────────────────────────────────────────────────────
 *
 * The athlete REACHES OUT AND TOUCHES the go target — no laser pointer, no trigger. Targets
 * therefore live on the reachable strike shell, not on a distant plane. A hand strike costs
 * real arm transport a tap on glass does not, so every deadline carries a uniform +320 ms aim
 * allowance: it lifts the whole authored curve to be fair to a reach WITHOUT reshaping the
 * progression, so the relative difficulty between levels is exactly the source's.
 *
 * The No-Go measure survives touch cleanly: PURPLE is answered by doing nothing at all, and a
 * withheld reach is as clean a stop as a withheld tap — you simply never move toward it.
 */

const COLORS_STANDARD = { teal: "#2998AA", blue: "#3498db", red: "#e74c3c", nogo: "#8B5CF6" };
const COLORS_CONTRAST = { teal: "#22D3EE", blue: "#3B82F6", red: "#F97316", nogo: "#FFFFFF" };

// The launcher fires the stimulus from a hole; the athlete has the ball's FLIGHT TIME to
// decide. A tighter authored deadline becomes a FASTER ball, so the decision window shrinks
// exactly as the source intends — speed IS the deadline.
const AIM_DIST = 6.2;            // ~centre hole to the athlete (m)
function speedFor(deadlineMs: number): number { return AIM_DIST / (deadlineMs / 1000); }
const TRIALS = 50;

type Level = {
  id: number; family: string; trials: number; radius: number; deadline: number;
  spatial: boolean; peripheral: boolean; mask: boolean; maskDur: number;
  jitter: boolean; briefOnset?: number; goProb: number; hueJitter: boolean; noise: boolean;
};

/** The exact 50-level table. */
function buildLevels(): Level[] {
  const L: Level[] = [];
  for (let i = 0; i < 8; i++)
    L.push({ id: i + 1, family: "Fundamentals", trials: TRIALS, radius: 80 - i * 3,
      deadline: i === 7 ? 850 : 1330 - i * 70, spatial: false, peripheral: i >= 4,
      mask: i >= 5, maskDur: i >= 5 ? 50 : 0, jitter: false, goProb: 0.75,
      hueJitter: false, noise: false });
  for (let i = 0; i < 8; i++)
    L.push({ id: i + 9, family: "Advanced", trials: TRIALS, radius: 56 - i * 3,
      deadline: 1185 - i * 65, spatial: true, peripheral: true, mask: true, maskDur: 45,
      jitter: true, goProb: 0.70, hueJitter: false, noise: false });
  const eliteRadii = [32, 29, 26, 23, 20, 17, 17, 16];
  for (let i = 0; i < 8; i++)
    L.push({ id: i + 17, family: "ELITE", trials: TRIALS, radius: eliteRadii[i],
      deadline: 1095 - i * 55, spatial: true, peripheral: true, mask: i >= 2,
      maskDur: i >= 2 ? 40 : 0, jitter: true, briefOnset: 500 - i * 20, goProb: 0.68,
      hueJitter: true, noise: true });
  for (let i = 0; i < 8; i++)
    L.push({ id: i + 25, family: "PRO", trials: TRIALS, radius: 19 - i,
      deadline: 1000 - i * 50, spatial: true, peripheral: true, mask: true, maskDur: 35,
      jitter: true, briefOnset: 350 - i * 15, goProb: 0.66, hueJitter: true, noise: true });
  for (let i = 0; i < 8; i++)
    L.push({ id: i + 33, family: "MASTER", trials: TRIALS, radius: 17 - i,
      deadline: 935 - i * 45, spatial: true, peripheral: true, mask: true, maskDur: 30,
      jitter: true, briefOnset: 240 - i * 10, goProb: 0.64, hueJitter: true, noise: true });
  for (let i = 0; i < 10; i++)
    L.push({ id: i + 41, family: "LEGEND", trials: TRIALS, radius: 15 - i,
      deadline: 900 - i * 40, spatial: true, peripheral: true, mask: true, maskDur: 28,
      jitter: true, briefOnset: 180 - i * 6, goProb: 0.62, hueJitter: true, noise: true });
  return L;
}

export const GNG_LEVELS = buildLevels();

/** ±6% multiplicative jitter on each channel — the colour is never exactly the learned one,
 *  so the athlete must classify the hue rather than pattern-match a memorised swatch. */
function jitterHue(hex: string, enabled: boolean, rng: () => number): string {
  if (!enabled) return hex;
  const c = parseInt(hex.slice(1), 16);
  const f = rng() * 0.12 - 0.06;
  const ch = (v: number) => Math.min(255, Math.max(0, Math.round(v * (1 + f))));
  const r = ch((c >> 16) & 255), g = ch((c >> 8) & 255), b = ch(c & 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** Inverse normal CDF (Acklam) — needed for d'. */
export function zPhi(p: number): number {
  if (p <= 0) return -5;
  if (p >= 1) return 5;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.44513413714299, 3.75440866190742];
  const plow = 0.02425;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q + 1);
  }
  if (p > 1 - plow) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q + 1);
  }
  const q = p - 0.5, r = q * q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r + 1);
}

function buildGNGTrials(level: number, rng: () => number, highContrast: boolean): TrialSpec[] {
  const L = GNG_LEVELS[Math.min(Math.max(level, 1), 50) - 1];
  const P = highContrast ? COLORS_CONTRAST : COLORS_STANDARD;
  const goPool = [
    { c: P.teal, n: "teal" },
    { c: P.blue, n: "blue" },
    { c: P.red, n: "red" },
  ];
  const size = sizeSawtooth(level, 0.11, 0.055);
  const speed = speedFor(L.deadline);

  const out: TrialSpec[] = [];
  let t = 1500;
  for (let i = 0; i < L.trials; i++) {
    const isGo = rng() < L.goProb;
    const pick = goPool[Math.floor(rng() * goPool.length)];
    const base = isGo ? pick.c : P.nogo;
    const color = jitterHue(base, L.hueJitter, rng);
    const hole = pickHole(level, rng);
    const travelMs = travelMsFor(hole, speed);

    /**
     * THE BALL FIRES FROM A HOLE. GO (teal / blue / red) -> pull the trigger, either hand.
     * NO-GO (purple) -> pull NOTHING and let it fly past. Withholding IS the answer, and the
     * ball reaching the athlete unfired is scored as the correct rejection.
     */
    out.push({
      id: `gng-${i}`,
      spawnAt: t,
      duration: travelMs + 220,
      kind: isGo ? "go" : "noGo",
      zone: "center",
      position: [hole[0], hole[1], LAUNCH_Z],
      velocity: launchVelocity(hole, speed),
      color, emissive: color,
      shape: "sphere", scale: size,
      meta: { gColor: isGo ? pick.n : "nogo", family: L.family },
    });

    // FOREPERIOD. Jittered above Advanced (a fixed onset is learnable, and a predicted onset is
    // a pre-launched response that destroys the No-Go measure).
    const gap = L.jitter ? 400 + Math.floor(rng() * 801) : 800;
    t += travelMs + 220 + gap;
  }
  // the holes the athlete watches — one more every five levels
  out.push(...holeMarkers(level, t + 1500, "gng"));
  return out;
}

const levels: ProgressionLevel[] = GNG_LEVELS.map((L) => ({
  level: L.id,
  label: `L${L.id} · ${L.family} · ${holeCount(L.id)} hole${holeCount(L.id) > 1 ? "s" : ""} · ${Math.round(speedFor(L.deadline) * 10) / 10} m/s · ${Math.round(L.goProb * 100)}% GO`,
  parameters: { level: L.id },
}));

export const GoNoGo: DrillDefinition = {
  id: "go-no-go",
  name: "Go / No Go",
  shortName: "Go/No Go",
  phase: "Execute",
  interaction: "touch",
  responseMode: "trigger",
  launcher: true,
  authoredLadder: true,
  environment: "arena",
  mvp: true,
  description:
    "Balls fire from the holes and fly at you. TEAL, BLUE and RED mean GO — pull the trigger, either hand. PURPLE means STOP — pull nothing and let it pass. 50 levels: the ball gets faster, and every five levels adds another hole it can come from, so you never know where the next shot appears. No-Go stays frequent enough that the reflex to fire is always primed — which is exactly what makes withholding hard.",
  purpose: "Response inhibition and processing speed under a hard deadline.",
  instructions: [
    "1. Balls FIRE from the holes and fly toward you after random delays.",
    "2. GO: TEAL, BLUE, or RED. PULL THE TRIGGER - either hand - the instant you see it.",
    "3. NO-GO: PURPLE. Pull NOTHING. Let it fly past. Withholding IS the correct answer.",
    "4. A false alarm on purple costs more than a miss. Speed is worthless without the stop.",
    "5. Every five levels adds another hole a ball can shoot from - you never know which.",
  ],
  controlsHint: "TRIGGER ON TEAL / BLUE / RED  ·  HOLD ON PURPLE",
  levels,
  options: [
    {
      id: "contrast",
      label: "Palette",
      defaultValue: "standard",
      values: [
        { id: "standard", label: "Standard (teal / blue / red · purple = STOP)" },
        { id: "highContrast", label: "High Contrast (cyan / blue / orange · white = STOP)" },
      ],
    },
  ],
  buildTrials: (params, rng) =>
    buildGNGTrials((params.level as number) ?? 1, rng, params.contrast === "highContrast"),

  // Generous ceiling: 50 shots x (worst-case flight + 220ms clear + worst-case 1200ms foreperiod).
  durationMs: (params) => {
    const L = GNG_LEVELS[Math.min(Math.max((params.level as number) ?? 1, 1), 50) - 1];
    const gap = L.jitter ? 1200 : 800;
    const flight = (AIM_DIST / speedFor(L.deadline)) * 1000 * 1.4; // side holes fly farther
    return 900 + TRIALS * (flight + 220 + gap) + 2000;
  },

  analyze: (events) => {
    const ev = events.filter((e) => e.trialId.startsWith("gng-"));
    if (!ev.length) return [];

    const hits = ev.filter((e) => e.correct && e.reactionMs !== undefined && e.errorType !== "correctRejection");
    const cr = ev.filter((e) => e.errorType === "correctRejection");
    /**
     * These strings are the engine's, not mine. A false alarm is "noGoFailure" and a miss is
     * "miss" — get either one wrong and the counts fall through to zero, d' quietly reports a
     * perfect score, and nothing anywhere throws. Verified against DrillEngine in
     * scripts/crossfirecheck.ts.
     */
    const fa = ev.filter((e) => e.errorType === "noGoFailure");
    const misses = ev.filter((e) => e.errorType === "miss");
    const goTotal = hits.length + misses.length;
    const nogoTotal = cr.length + fa.length;

    const mean = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0);
    const byColor = (n: string) => mean(hits.filter((e) => (e as { meta?: Record<string, unknown> }).meta?.gColor === n).map((e) => e.reactionMs!));

    /**
     * d' — SENSITIVITY. Accuracy alone cannot tell an athlete who genuinely discriminates
     * purple from one who simply presses everything (100% Go accuracy, 0% No-Go) or presses
     * nothing (the reverse). d' separates real discrimination from a response bias, and it
     * is the only number here that a strategy cannot fake.
     */
    const hRate = (hits.length + 0.5) / (goTotal + 1);
    const faRate = (fa.length + 0.5) / (nogoTotal + 1);
    const dPrime = zPhi(hRate) - zPhi(faRate);

    /**
     * POST-ERROR SLOWING. After a false alarm, a healthy control system gets CAUTIOUS —
     * the next response is slower. An athlete with no post-error slowing is not monitoring
     * their own errors, and that is a different and more serious finding than being slow.
     */
    const ordered = [...ev].sort((a, b) => a.timestamp - b.timestamp);
    const pe: number[] = [];
    for (let i = 1; i < ordered.length; i++) {
      const prevBad = !ordered[i - 1].correct;
      const cur = ordered[i];
      if (prevBad && cur.correct && cur.reactionMs) pe.push(cur.reactionMs);
    }
    const globalRT = mean(hits.map((e) => e.reactionMs!));
    const pes = pe.length ? mean(pe) - globalRT : 0;

    const nogoAcc = nogoTotal ? Math.round((cr.length / nogoTotal) * 100) : 0;
    const notes = [
      `Reaction: ${globalRT}ms overall (red ${byColor("red")}ms · teal ${byColor("teal")}ms · blue ${byColor("blue")}ms).`,
      `Inhibition: ${nogoAcc}% of NO-GO trials correctly withheld (${fa.length} false alarms).`,
      `Sensitivity d' = ${dPrime.toFixed(2)} — how cleanly GO was separated from NO-GO, independent of any press-everything or press-nothing strategy.`,
      `Post-error slowing: ${pes >= 0 ? "+" : ""}${pes}ms.`,
    ];
    if (globalRT > 0 && globalRT < 420 && nogoAcc < 60) {
      notes.push("Fast and impulsive — the response is being launched before the colour is classified. Speed here is not a strength; it is the mechanism of the errors.");
    } else if (nogoAcc >= 95 && globalRT > 700) {
      notes.push("Perfectly inhibited but slow — the athlete is buying every stop by waiting. That trade collapses the moment the deadline tightens.");
    }
    if (pe.length && pes <= 0) {
      notes.push("No post-error slowing — errors are not registering. The athlete is not monitoring their own mistakes, which is a separate finding from being inaccurate.");
    }
    return notes;
  },
};
