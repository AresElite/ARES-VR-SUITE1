import type { DrillDefinition, TrialSpec, ProgressionLevel } from "@/ares/drillTypes";

/**
 * FOCUS FRENZY — 100 levels, ported whole. A colour-ramp SURVIVAL drill.
 *
 * Every stimulus ages through five colour stages — purple (calm, plenty of time) → teal →
 * blue → orange → RED (about to go). You must STRIKE it before it finishes red. Let a single
 * one expire and the run is over. Score is how many you clear before that happens.
 *
 * The colour is a clock. It tells you which target is most urgent, and with several alive at
 * once the skill is triage under a shrinking budget: attend to the reddest, but not so
 * narrowly that a teal quietly ripens to red behind your back. That divided, prioritised
 * vigilance is the whole measurement.
 *
 * It gets relentlessly harder the longer you last: on a timer the stage durations shrink, the
 * field adds targets, and everything speeds up — until you finally miss one. Higher START
 * levels begin smaller, faster, shorter-fused, and more crowded.
 *
 * VR MAPPING. Reference is a touch tap; here it is a hand STRIKE. Targets drift and bounce off
 * the walls of the play space (and off each other), so clearing one is a real moving-target
 * acquisition, not a stationary tap. Concurrency is modelled as parallel streams that each
 * refill the instant you clear them; reinforcement streams come online as you survive, which
 * is the escalation. A target expiring ends the run (endOnExpiry) — the failure condition.
 */

/**
 * STRIKE GEOMETRY. Focus Frenzy is a HAND-STRIKE drill, so every orb must sit within arm's
 * reach — on the strike shell (~0.6 m out), not on the distant pointer plane. The earlier
 * version placed orbs 1.5 m away; the engine's reach clamp only rescued the first orb of each
 * stream at spawn, so the REPLACEMENTS that appear as you clear orbs stayed out of reach. Now
 * the whole box lives on the strike shell, so every orb — original or replacement — is
 * reachable, at the SAME comfortable distance throughout the run.
 */
const Z = -0.60;
const HALF_W = 0.34;
const HALF_H = 0.30;
const PX = 0.0011;          // metres per reference pixel
const VEL = 0.00060;        // metres/sec per reference px/sec (the box is closer and smaller now)

// the ramp: calm -> urgent. Purple lifted from the reference's near-black so it reads in VR.
const STAGE_COLOR = { purple: "#6D5FA8", teal: "#2998AA", blue: "#3B82F6", orange: "#FB923C", red: "#EF4444" };

const frontload = (t: number) => Math.pow(t, 0.65);

export interface FFBaseline {
  size: number; purple: number; teal: number; blue: number; orange: number; red: number;
  speedCap: number; maxActive: number;
}
/** The exact per-level baseline from the reference. */
export function ffLevel(level: number): FFBaseline {
  const lvl = Math.min(Math.max(level, 1), 100);
  const t = (lvl - 1) / 99;
  const g = frontload(t);
  const size = Math.round(60 + (18 - 60) * g);
  const purple = Math.round(3800 + (1200 - 3800) * g);
  const yellowTotal = Math.round(2400 + (800 - 2400) * g);
  const teal = Math.ceil(yellowTotal * 0.5);
  const blue = Math.floor(yellowTotal * 0.5);
  const orange = Math.round(1600 + (600 - 1600) * g);
  const red = Math.round(1200 + (550 - 1200) * g);
  const speedCap = 60 + (260 - 60) * g;
  const maxActive = 3 + Math.floor(4 * g);
  return { size, purple, teal, blue, orange, red, speedCap, maxActive };
}

const FLOORS = { purple: 900, teal: 700, blue: 700, orange: 600, red: 600 };

/** Escalation, exactly as the reference computes it from elapsed time. Here it is pre-baked
 *  per spawn against the stimulus's scheduled time, which is faithful because escalation is a
 *  pure function of the clock. */
function escalate(base: FFBaseline, level: number, atMs: number) {
  const interval = level >= 70 ? 15000 : level >= 40 ? 20000 : 25000;
  const steps = Math.max(0, Math.floor(atMs / interval));
  const f = Math.pow(0.95, steps);
  const dur = (v: number, floor: number) => Math.round(Math.max(floor, Math.min(v, v * f)));
  const speed = Math.max(60, Math.min(base.speedCap * 2, base.speedCap * (1 + 0.12 * steps)));
  return {
    purple: dur(base.purple, FLOORS.purple), teal: dur(base.teal, FLOORS.teal),
    blue: dur(base.blue, FLOORS.blue), orange: dur(base.orange, FLOORS.orange),
    red: dur(base.red, FLOORS.red), speed, addMax: Math.min(steps, 4),
  };
}

function makeStim(id: string, chainId: string, seq: number, spawnAt: number, atMs: number,
                  base: FFBaseline, level: number, rng: () => number): TrialSpec {
  const e = escalate(base, level, atMs);
  const total = e.purple + e.teal + e.blue + e.orange + e.red;
  const jit = () => 1 + (rng() * 2 - 1) * 0.08;
  const r = base.size * PX * jit();
  // outer-biased placement so the field uses the periphery as it fills
  const outer = rng() < 0.45;
  const rad = (outer ? 0.45 + rng() * 0.35 : rng() * 0.4);
  const ang = rng() * Math.PI * 2;
  const x = Math.max(-HALF_W + r, Math.min(HALF_W - r, Math.cos(ang) * rad * HALF_W));
  const y = 1.5 + Math.max(-HALF_H + r, Math.min(HALF_H - r, Math.sin(ang) * rad * HALF_H));
  const mAng = rng() * Math.PI * 2;
  const v = Math.max(60, e.speed) * VEL;

  return {
    id, chainId, seq, spawnAt: seq === 0 ? spawnAt : -1, chainGapMs: 60,
    duration: total,
    kind: "go", zone: "center",
    position: [x, y, Z],
    physics: { vx: Math.cos(mAng) * v, vy: Math.sin(mAng) * v, startMs: 0, endMs: total + 100, halfW: HALF_W, halfH: HALF_H },
    color: STAGE_COLOR.purple, emissive: STAGE_COLOR.purple, shape: "sphere", scale: r,
    meta: {
      paintPhases: [
        { t: 0, c: STAGE_COLOR.purple },
        { t: e.purple, c: STAGE_COLOR.teal },
        { t: e.purple + e.teal, c: STAGE_COLOR.blue },
        { t: e.purple + e.teal + e.blue, c: STAGE_COLOR.orange },
        { t: e.purple + e.teal + e.blue + e.orange, c: STAGE_COLOR.red },
      ],
      ff: true, redAt: e.purple + e.teal + e.blue + e.orange,
    },
  };
}

const RUN_MS = 240_000; // a generous ceiling; the run really ends when a target expires

function buildFFTrials(level: number, rng: () => number): TrialSpec[] {
  const base = ffLevel(level);
  const out: TrialSpec[] = [];
  // maxActive base streams from the start, plus up to 4 reinforcement streams that come online
  // at the escalation-step boundaries — the concurrency ramp.
  const interval = level >= 70 ? 15000 : level >= 40 ? 20000 : 25000;
  const streams = base.maxActive + 4;
  for (let c = 0; c < streams; c++) {
    const reinforcement = c >= base.maxActive;
    const firstAt = reinforcement ? interval * (c - base.maxActive + 1) : 500 + c * 240;
    // a long queue; the run ends on the first expiry long before it drains
    const QUEUE = 160;
    for (let k = 0; k < QUEUE; k++) {
      // estimate this stimulus's wall-clock time for the escalation curve: streams clear at
      // roughly the base purple cadence early on, so index * a nominal cadence approximates it
      const atMs = firstAt + k * Math.max(700, base.purple * 0.5);
      out.push(makeStim(`ff-c${c}-${k}`, `ff-c${c}`, k, firstAt, atMs, base, level, rng));
    }
  }
  return out;
}

const levels: ProgressionLevel[] = Array.from({ length: 100 }, (_, i) => {
  const b = ffLevel(i + 1);
  const family = i < 33 ? "Fundamentals" : i < 66 ? "Advanced" : "Elite";
  return {
    level: i + 1,
    label: `L${i + 1} · ${family} · ${b.maxActive} live · ${b.size}px · fuse ${(b.red / 1000).toFixed(1)}s · ${Math.round(b.speedCap)}px/s`,
    parameters: { level: i + 1 },
  };
});

export const FocusFrenzy: DrillDefinition = {
  id: "focus-frenzy",
  name: "Focus Frenzy",
  shortName: "Focus Frenzy",
  phase: "Execute",
  interaction: "touch",
  responseMode: "strike",
  authoredLadder: true,
  endOnExpiry: true,
  hardStop: false,
  environment: "arena",
  mvp: true,
  description:
    "Every orb ages through a colour clock — purple, teal, blue, orange, RED — and you must STRIKE it before it finishes red. Let one expire and the run ends. Several are alive at once and drifting, so it is triage under a shrinking budget: hit the reddest, but do not let a teal ripen behind your back. It escalates the longer you survive — shorter fuses, more orbs, faster — until you finally miss one.",
  purpose: "Prioritised divided attention and target acquisition under escalating time pressure.",
  instructions: [
    "1. Orbs change colour over time: purple (calm) to teal to blue to orange to RED (about to expire).",
    "2. STRIKE each orb before it finishes RED. The colour tells you how long is left.",
    "3. Several are alive and moving at once. Clear the most urgent first - but watch the rest.",
    "4. Letting a single orb expire ENDS the run. Score is how many you clear.",
    "5. It gets harder the longer you last. Survive.",
  ],
  controlsHint: "STRIKE THE ORBS BEFORE THEY FINISH RED  ·  ONE ESCAPE ENDS THE RUN",
  levels,
  buildTrials: (params, rng) => buildFFTrials((params.level as number) ?? 1, rng),

  analyze: (events) => {
    const ev = events.filter((e) => e.trialId.startsWith("ff-c"));
    if (!ev.length) return [];
    const hits = ev.filter((e) => e.correct);
    const miss = ev.filter((e) => e.errorType === "miss");
    const survivalMs = ev.reduce((m, e) => Math.max(m, e.timestamp), 0);
    const rts = hits.filter((e) => e.reactionMs !== undefined).map((e) => e.reactionMs!);
    const meanRT = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;

    const notes = [
      `${hits.length} orbs cleared in ${(survivalMs / 1000).toFixed(1)}s of survival.`,
      `Mean time-to-strike ${meanRT}ms after each orb appeared.`,
    ];
    if (miss.length) {
      notes.push("The run ended when an orb reached red unhit — the classic failure is tunnelling on one urgent target while another ripens unseen. Widen the scan.");
    }
    return notes;
  },

  durationMs: () => RUN_MS,
};
