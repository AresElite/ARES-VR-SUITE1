import type { DrillDefinition, TrialSpec, ProgressionLevel } from "@/ares/drillTypes";

/**
 * MULTIPLE OBJECT TRACKING — DUAL TASK. Ported whole, 100 levels.
 *
 * Three phases per round:
 *   MEMORIZE   a few orbs flash GOLD. Hold which ones.
 *   TRACK      every orb turns identical and drifts, bounces off the walls, and collides
 *              elastically with its neighbours. Keep your targets while a central problem
 *              (Go/No-Go, arithmetic, or a Sternberg memory probe) runs at the same time,
 *              answered with the LEFT / RIGHT trigger.
 *   IDENTIFY   motion FREEZES. Point at every orb you were tracking and pull the trigger.
 *
 * The collisions are the point: they make each orb's path genuinely unpredictable, so the
 * only way to know where a target ended up is to have never stopped watching it. The central
 * task competes for the very attention the tracking needs — and that competition, the cost of
 * doing both at once, is what the drill measures. Either task alone is easy; together they are
 * a divided-attention ceiling.
 *
 * TWO DELIBERATE BEHAVIOURS, per the athlete's instruction:
 *   - The IDENTIFY phase has NO time limit. The field stays frozen until the athlete has
 *     committed their picks. A tracking answer window that expires would relieve them of the
 *     search at the exact moment it is hardest; they struggle through it instead.
 *   - There is NO central fixation marker. A spinning object at the fixation point of a field
 *     you are tracking is a distractor competing with the task, not an anchor for it.
 *
 * VR mapping of the reference's tap-halves: the central task is answered with the TRIGGERS
 * (LEFT = true / in-set, RIGHT = false / new; Go/No-Go = either trigger for go, withhold for
 * no-go), and the balls are selected with the POINTER. Two channels, never serialised: reach
 * for a ball with your ray and you still owe the trigger the central answer.
 */

const Z = -1.5;
const HALF_W = 0.62;         // play window half-width (m) at the tracking plane
const HALF_H = 0.42;         // half-height
const PX = 0.00075;          // metres per reference pixel (65px radius -> ~4.9cm)
const MPS = 0.0016;          // metres/sec per reference px/sec (150px/s -> ~0.24 m/s)
const TRIALS_PER_SESSION = 3;

const COLOR_BALL = "#2D234F";
const COLOR_HIGHLIGHT = "#2998AA";
const COLOR_IDENTIFY = "#8B5CF6";
const WHITE = "#EAF0FF";
const GO_GREEN = "#10B981";
const NOGO_RED = "#EF4444";
const MATH_WHITE = "#FFFFFF";
const MEM_YELLOW = "#FACC15";

// ── the reference's 7 anchor rows, linearly interpolated to 100 levels ──────────────────
type Row = { level: number; balls: number; track: number; radius: number; speed: number;
  amp: number; omega: number; highlightMs: number; trackMs: number };
const ROWS: Row[] = [
  { level: 1, balls: 4, track: 1, radius: 65, speed: 150, amp: 0.15, omega: 5.23, highlightMs: 2200, trackMs: 12000 },
  { level: 10, balls: 5, track: 1, radius: 58, speed: 175, amp: 0.145, omega: 5.23, highlightMs: 2140, trackMs: 11818 },
  { level: 20, balls: 7, track: 2, radius: 46, speed: 180, amp: 0.14, omega: 4.97, highlightMs: 2022, trackMs: 11617 },
  { level: 40, balls: 11, track: 4, radius: 26, speed: 185, amp: 0.13, omega: 4.31, highlightMs: 1782, trackMs: 11215 },
  { level: 60, balls: 12, track: 4, radius: 20, speed: 198, amp: 0.12, omega: 4.18, highlightMs: 1542, trackMs: 10815 },
  { level: 80, balls: 12, track: 4, radius: 20, speed: 218, amp: 0.115, omega: 3.97, highlightMs: 1422, trackMs: 10615 },
  { level: 100, balls: 12, track: 5, radius: 20, speed: 260, amp: 0.08, omega: 2.90, highlightMs: 1000, trackMs: 10000 },
];

/** Reproduce the reference's level table: exact rows kept, everything else forward-filled
 *  from the nearest lower anchor — identical to `LEVEL_DATA.find`/reverse-find. */
export function motLevel(level: number): Row {
  const lvl = Math.min(Math.max(level, 1), 100);
  const exact = ROWS.find((r) => r.level === lvl);
  if (exact) return { ...exact, level: lvl };
  const lower = [...ROWS].reverse().find((r) => r.level <= lvl) ?? ROWS[0];
  return { ...lower, level: lvl };
}

// ── central dual task, level-scheduled exactly as the reference ─────────────────────────
type DualMode = "gng" | "math" | "sternberg";
interface DualCfg {
  mode: DualMode; initialDelay: number; stimDuration: number; isi: number;
  noGoProb?: number; opMix?: string[]; minVal?: number; maxVal?: number;
  setSizeMin?: number; setSizeMax?: number; memberProb?: number;
}
export function motDual(level: number): DualCfg {
  if (level <= 20) return { mode: "gng", initialDelay: 800, stimDuration: 1200, isi: 900, noGoProb: 0.25 };
  if (level <= 40) return { mode: "gng", initialDelay: 700, stimDuration: 1000, isi: 800, noGoProb: 0.30 };
  if (level <= 70) return { mode: "math", initialDelay: 700, stimDuration: 1800, isi: 800, opMix: ["add", "sub"], minVal: 1, maxVal: 9 };
  if (level <= 85) return { mode: "math", initialDelay: 600, stimDuration: 1500, isi: 700, opMix: ["add", "sub", "mul"], minVal: 2, maxVal: 12 };
  return { mode: "sternberg", initialDelay: 600, stimDuration: 1500, isi: 800, setSizeMin: 3, setSizeMax: 5, memberProb: 0.5 };
}

/** buildTrials stashes each round's params here so analyze() can weight F1 → DAPI. Single
 *  session at a time, mirroring the RapidRecognition pattern. */
const motRounds = new Map<string, { track: number; balls: number; speed: number; radius: number }>();

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("");

function buildMotTrials(level: number, rng: () => number): TrialSpec[] {
  motRounds.clear();
  const L = motLevel(level);
  const cfg = motDual(level);
  const r = L.radius * PX;
  const speed = L.speed * MPS;
  const trials: TrialSpec[] = [];

  for (let round = 0; round < TRIALS_PER_SESSION; round++) {
    const gid = `mot-r${round}`;
    motRounds.set(gid, { track: L.track, balls: L.balls, speed: L.speed, radius: L.radius });
    const startMs = L.highlightMs;
    const endMs = L.highlightMs + L.trackMs;

    // choose which balls are tracked targets
    const idx = Array.from({ length: L.balls }, (_, i) => i).sort(() => rng() - 0.5);
    const tracked = new Set(idx.slice(0, L.track));

    // non-overlapping start positions inside the play window
    const placed: [number, number][] = [];
    for (let b = 0; b < L.balls; b++) {
      let x = 0, y = 1.5, ok = false;
      for (let att = 0; att < 200 && !ok; att++) {
        x = (rng() * 2 - 1) * (HALF_W - r - 0.02);
        y = 1.5 + (rng() * 2 - 1) * (HALF_H - r - 0.02);
        ok = placed.every(([px, py]) => (px - x) ** 2 + (py - y) ** 2 > (2 * r + 0.02) ** 2);
      }
      placed.push([x, y]);
      const ang = rng() * Math.PI * 2;
      const isTracked = tracked.has(b);
      trials.push({
        id: `${gid}-b${b}`,
        spawnAt: round * 10, // effectively together; rounds are gridSeq-paced
        gridSeq: round,
        duration: 900_000,   // no expiry — the identify phase has no clock
        kind: "distractor",
        // tracked balls become selectable "go" targets when motion freezes
        ...(isTracked ? { switchKindAt: round * 10 + endMs, switchKindTo: "go" as const } : {}),
        zone: "center",
        position: [x, y, Z],
        physics: { vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, startMs, endMs, halfW: HALF_W, halfH: HALF_H },
        color: isTracked ? COLOR_HIGHLIGHT : COLOR_BALL,
        emissive: isTracked ? COLOR_HIGHLIGHT : COLOR_BALL,
        shape: "sphere", scale: r,
        groupId: gid, groupMode: "selectN", selectBudget: L.track,
        meta: {
          paintPhases: isTracked
            ? [{ t: 0, c: COLOR_HIGHLIGHT }, { t: L.highlightMs, c: COLOR_BALL }, { t: endMs, c: COLOR_IDENTIFY }]
            : [{ t: 0, c: COLOR_BALL }, { t: endMs, c: COLOR_IDENTIFY }],
          mot: true, tracked: isTracked,
        },
      });
    }

    // central dual task, filling the track window from startMs+initialDelay to endMs
    const memberPool = [...LETTERS];
    let mem: string[] = [];
    let sinceRefresh = 0;
    let ct = startMs + cfg.initialDelay + round * 10;
    let n = 0;
    while (ct + cfg.stimDuration < endMs + round * 10) {
      const cid = `${gid}-c${n}`;
      if (cfg.mode === "gng") {
        const isNoGo = rng() < (cfg.noGoProb ?? 0.3);
        // the visible symbol (decor) + an invisible answer target flagged for the trigger
        trials.push({
          id: `${cid}-sym`, spawnAt: ct, duration: cfg.stimDuration, kind: "distractor", decor: true,
          zone: "center", position: [0, 1.5, Z - 0.05],
          color: isNoGo ? NOGO_RED : GO_GREEN, emissive: isNoGo ? NOGO_RED : GO_GREEN,
          shape: isNoGo ? "box" : "sphere", scale: 0.055,
          meta: { central: true },
        });
        trials.push({
          id: `${cid}-ans`, spawnAt: ct, duration: cfg.stimDuration,
          kind: isNoGo ? "noGo" : "go", zone: "center", position: [0, 1.5, Z - 0.05],
          color: WHITE, shape: "sphere", scale: 0.001,
          meta: { triggerTarget: true, central: true, ctask: "gng" },
        });
      } else if (cfg.mode === "math") {
        const ops = cfg.opMix ?? ["add"];
        const op = ops[Math.floor(rng() * ops.length)];
        const mn = cfg.minVal ?? 1, mx = cfg.maxVal ?? 9;
        let a: number, b: number, res: number;
        if (op === "add") { a = Math.floor(rng() * (mx - mn) + mn); b = Math.floor(rng() * (mx - mn) + mn); res = a + b; }
        else if (op === "sub") { a = Math.floor(rng() * (mx - mn) + mn); b = Math.floor(rng() * (mx - mn) + mn); res = a - b; }
        else { a = Math.floor(rng() * (Math.min(mx, 12) - mn) + mn); b = Math.floor(rng() * (Math.min(mx, 12) - mn) + mn); res = a * b; }
        const isTrue = rng() < 0.5;
        const show = isTrue ? res : res + (rng() < 0.5 ? 1 : -1) * Math.ceil(rng() * 2);
        const sym = op === "add" ? "+" : op === "sub" ? "-" : "x";
        trials.push({
          id: `${cid}-sym`, spawnAt: ct, duration: cfg.stimDuration, kind: "distractor", decor: true,
          zone: "center", position: [0, 1.5, Z - 0.05], color: MATH_WHITE, emissive: MATH_WHITE,
          shape: "diamond", scale: 0.001, label: `${a} ${sym} ${b} = ${show}`,
          meta: { central: true, labelInside: true, labelSize: 0.06, labelColor: MATH_WHITE },
        });
        // LEFT trigger = TRUE, RIGHT = FALSE
        trials.push({
          id: `${cid}-ans`, spawnAt: ct, duration: cfg.stimDuration, kind: "go",
          zone: "center", position: [0, 1.5, Z - 0.05], requiredHand: isTrue ? "left" : "right",
          color: WHITE, shape: "diamond", scale: 0.001,
          meta: { triggerTarget: true, central: true, ctask: "math" },
        });
      } else {
        if (mem.length === 0 || sinceRefresh >= 4) {
          const size = Math.floor(rng() * ((cfg.setSizeMax ?? 5) - (cfg.setSizeMin ?? 3) + 1)) + (cfg.setSizeMin ?? 3);
          mem = [];
          while (mem.length < size) { const ch = memberPool[Math.floor(rng() * memberPool.length)]; if (!mem.includes(ch)) mem.push(ch); }
          sinceRefresh = 0;
          // flash the memory set to hold
          trials.push({
            id: `${cid}-set`, spawnAt: ct - 40, duration: 900, kind: "distractor", decor: true,
            zone: "center", position: [0, 1.86, Z - 0.05], color: MEM_YELLOW, emissive: MEM_YELLOW,
            shape: "diamond", scale: 0.001, label: `SET ${mem.join(" ")}`,
            meta: { central: true, labelInside: true, labelSize: 0.05, labelColor: MEM_YELLOW },
          });
        }
        sinceRefresh++;
        const isMember = rng() < (cfg.memberProb ?? 0.5);
        let probe: string;
        if (isMember) probe = mem[Math.floor(rng() * mem.length)];
        else { do { probe = memberPool[Math.floor(rng() * memberPool.length)]; } while (mem.includes(probe)); }
        trials.push({
          id: `${cid}-sym`, spawnAt: ct, duration: cfg.stimDuration, kind: "distractor", decor: true,
          zone: "center", position: [0, 1.5, Z - 0.05], color: MEM_YELLOW, emissive: MEM_YELLOW,
          shape: "diamond", scale: 0.001, label: probe,
          meta: { central: true, labelInside: true, labelSize: 0.09, labelColor: MEM_YELLOW },
        });
        // LEFT = in set, RIGHT = new
        trials.push({
          id: `${cid}-ans`, spawnAt: ct, duration: cfg.stimDuration, kind: "go",
          zone: "center", position: [0, 1.5, Z - 0.05], requiredHand: isMember ? "left" : "right",
          color: WHITE, shape: "diamond", scale: 0.001,
          meta: { triggerTarget: true, central: true, ctask: "sternberg" },
        });
      }
      ct += cfg.stimDuration + cfg.isi;
      n++;
    }
  }
  return trials.sort((a, b) => a.spawnAt - b.spawnAt);
}

const levels: ProgressionLevel[] = Array.from({ length: 100 }, (_, i) => {
  const L = motLevel(i + 1);
  const c = motDual(i + 1);
  const task = c.mode === "gng" ? "GO/NO-GO" : c.mode === "math" ? "MATH" : "MEMORY";
  return {
    level: i + 1,
    label: `L${i + 1} · ${L.track} of ${L.balls} · ${task} · ${(L.trackMs / 1000).toFixed(0)}s track`,
    parameters: { level: i + 1 },
  };
});

export const MotDual: DrillDefinition = {
  id: "mot-dual",
  name: "MOT — Dual Task",
  shortName: "MOT Dual",
  phase: "Route",
  interaction: "ray",
  responseMode: "pointer",
  triggerSecondary: true,     // pointer selects balls, trigger answers the central problem
  authoredLadder: true,
  trialPaced: true,
  // NO openSearch here. The identify phase never times out because the balls carry a
  // 900s duration, so they simply never expire; select-N ends the round on the Nth pick.
  // (openSearch's decoy-intercept is a Speed-Search behaviour that would swallow the
  // distractor picks that are supposed to spend a selection here.)
  noFixationMarker: true,     // no rotating square
  environment: "arena",
  mvp: true,
  description:
    "MEMORIZE the gold orbs, TRACK them as the swarm drifts, bounces and collides — while you solve a central problem with your triggers — then IDENTIFY every target you held once motion freezes. 100 levels: more orbs, more targets, faster swarm, and a central task that climbs from Go/No-Go to arithmetic to a memory probe. The identify phase has no clock; take the time to find them.",
  purpose: "Divided attention — sustained multi-object tracking under a concurrent central cognitive load.",
  instructions: [
    "1. MEMORIZE: a few orbs flash GOLD. Hold which ones.",
    "2. TRACK: all orbs turn identical and move. Keep your eyes on your targets.",
    "3. MEANWHILE: answer the centre with your TRIGGERS. LEFT = true / in-set. RIGHT = false / new. Go/No-Go: pull for the green circle, withhold on the red square.",
    "4. IDENTIFY: motion FREEZES. Point at each orb you tracked and pull the trigger. No time limit - find them.",
    "5. Doing both at once is the drill. Abandoning one to save the other is the failure it finds.",
  ],
  controlsHint: "POINTER = PICK YOUR ORBS  ·  TRIGGERS = ANSWER THE CENTRE  ·  L=TRUE/IN  R=FALSE/NEW",
  levels,
  buildTrials: (params, rng) => buildMotTrials((params.level as number) ?? 1, rng),

  analyze: (events) => {
    const rounds = [...motRounds.entries()];
    if (!rounds.length) return [];
    const f1s: number[] = [], ks: number[] = [], dapis: number[] = [];
    for (const [gid, rp] of rounds) {
      // ball selections all record under the group id (engine collapses grouped events);
      // the per-pick correctness is authoritative — a tracked pick is correct, a distractor
      // pick is a distractorHit — so tp/fp come straight off the events, not the ball ids.
      const picks = events.filter((e) => e.trialId === gid);
      const tp = picks.filter((e) => e.correct).length;                       // tracked balls picked
      const fp = picks.filter((e) => e.errorType === "distractorHit").length; // wrong balls picked
      const fn = Math.max(0, rp.track - tp);
      const recall = rp.track > 0 ? tp / rp.track : 0;
      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) * 100 : 0;
      const distractors = Math.max(1, rp.balls - rp.track);
      const k = Math.max(0, rp.track * (recall - fp / distractors));
      const diff = (rp.balls / 4) * (rp.speed / 160) * (65 / rp.radius);
      f1s.push(f1); ks.push(k); dapis.push(f1 * diff);
    }
    const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

    // central dual-task
    const cen = events.filter((e) => /-c\d+-ans/.test(e.trialId) && e.errorType !== "correctRejection");
    const cr = events.filter((e) => /-c\d+-ans/.test(e.trialId) && e.errorType === "correctRejection");
    const cenTotal = cen.length + cr.length;
    const cenCorrect = cen.filter((e) => e.correct).length + cr.length;
    const cenAcc = cenTotal ? Math.round((cenCorrect / cenTotal) * 100) : 0;

    const notes = [
      `Tracking F1 ${Math.round(mean(f1s))}% · capacity K ${mean(ks).toFixed(1)} objects · difficulty-weighted DAPI ${Math.round(mean(dapis))}.`,
      `Central task ${cenAcc}% correct across ${cenTotal} problems while tracking.`,
    ];
    if (mean(f1s) >= 70 && cenAcc < 55) {
      notes.push("Tracking held and the central task collapsed — the athlete dropped the problem to protect the orbs. That is a divided-attention ceiling, not a tracking limit.");
    } else if (mean(f1s) < 45 && cenAcc >= 80) {
      notes.push("The central task held and tracking collapsed — attention went to the problem and the orbs were lost. Same ceiling, opposite trade.");
    }
    return notes;
  },

  durationMs: () => 900_000, // completion-paced: 3 rounds, identify phase has no clock
};
