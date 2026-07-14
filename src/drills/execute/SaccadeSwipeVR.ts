import type { DrillDefinition, TrialSpec, ProgressionLevel, SliceDirection } from "@/ares/drillTypes";

/**
 * SACCADE SWIPE — 100 levels, ported whole.
 *
 * An arrow flashes out in the field. You SACCADE to it, read which way it points, and answer
 * with a stick flick:
 *   PRO  (teal ring)  — flick the way the arrow points.
 *   ANTI (red ring)   — flick the OPPOSITE way. You must suppress the reflex to look-and-go.
 *
 * The anti-saccade is the measurement. Looking toward a sudden peripheral onset is a reflex;
 * overriding it to respond the other way is frontal inhibition, and the gap between your pro
 * and anti reaction times is one of the cleanest oculomotor-control numbers there is.
 *
 * The ladder tightens three things at once: the deadline (2500ms -> 400ms), the share of
 * anti trials (0 -> 65%), and the answer set — 2 directions (Fundamentals), then 4
 * (Advanced), then all 8 (Elite). 50 trials a session.
 *
 * VR MAPPING. The reference is a touch-swipe; here it is a thumbstick flick, resolved to the
 * level's own answer set (2/4/8-way) so a wobble on a left/right-only level can never be read
 * as a diagonal. The arrow still appears at a random eccentric position, so the athlete makes
 * a real saccade to acquire it before answering — which is the whole point.
 */

const TRIALS = 50;
const Z = -1.5;
const TEAL = "#2998AA";     // pro
const RED = "#EF4444";      // anti

const DIR2: SliceDirection[] = ["left", "right"];
const DIR4: SliceDirection[] = ["left", "right", "up", "down"];
const DIR8: SliceDirection[] = ["left", "right", "up", "down", "upLeft", "upRight", "downLeft", "downRight"];

const OPPOSITE: Record<SliceDirection, SliceDirection> = {
  up: "down", down: "up", left: "right", right: "left",
  upLeft: "downRight", upRight: "downLeft", downLeft: "upRight", downRight: "upLeft",
};

export interface SacLevel {
  id: number; family: string; antiProb: number; deadline: number; ways: number;
  jitter: [number, number];
}

/** The exact 100-level curve. */
export function sacLevel(level: number): SacLevel {
  const lvl = Math.min(Math.max(level, 1), 100);
  const t = (lvl - 1) / 99;
  const antiProb = lvl <= 5 ? 0 : Math.min(0.65, 0.10 + t * 0.70);
  const deadline = Math.max(400, 2500 - t * 2100);
  const jitterMin = Math.max(150, 800 - t * 650);
  const jitterMax = Math.max(350, 1600 - t * 1100);
  let ways = 2, family = "Fundamentals";
  if (lvl > 66) { ways = 8; family = "Elite"; }
  else if (lvl > 33) { ways = 4; family = "Advanced"; }
  return { id: lvl, family, antiProb, deadline, ways, jitter: [jitterMin, jitterMax] };
}

function buildSacTrials(level: number, rng: () => number): TrialSpec[] {
  const L = sacLevel(level);
  const pool = L.ways === 8 ? DIR8 : L.ways === 4 ? DIR4 : DIR2;
  const out: TrialSpec[] = [];
  let firstDelay = L.jitter[0] + rng() * (L.jitter[1] - L.jitter[0]);

  for (let i = 0; i < TRIALS; i++) {
    const isAnti = rng() < L.antiProb;
    const dir = pool[Math.floor(rng() * pool.length)];
    const answer = isAnti ? OPPOSITE[dir] : dir;
    // a random eccentric position, so acquiring the arrow costs a real saccade
    const x = (rng() * 2 - 1) * 0.55;
    const y = 1.5 + (rng() * 2 - 1) * 0.34;
    const jitter = L.jitter[0] + rng() * (L.jitter[1] - L.jitter[0]);

    out.push({
      id: `sac-${i}-${isAnti ? "anti" : "pro"}`,
      spawnAt: i === 0 ? 1200 + firstDelay : -1,
      chainId: "sac",
      chainGapMs: Math.round(jitter),
      duration: Math.round(L.deadline + 200),
      kind: "go",
      zone: "center",
      position: [x, y, Z],
      requiredDirection: answer,
      color: isAnti ? RED : TEAL,
      emissive: isAnti ? RED : TEAL,
      shape: "arrow",
      scale: 0.075,
      // the arrow POINTS its stimulus direction; the required answer may differ (anti)
      meta: { pointDir: dir, axes: L.ways, anti: isAnti, ring: isAnti ? RED : TEAL },
    });
  }
  return out;
}

const levels: ProgressionLevel[] = Array.from({ length: 100 }, (_, i) => {
  const L = sacLevel(i + 1);
  return {
    level: i + 1,
    label: `L${i + 1} · ${L.family} · ${L.ways}-way · ${Math.round(L.antiProb * 100)}% anti · ${Math.round(L.deadline)}ms`,
    parameters: { level: i + 1 },
  };
});

export const SaccadeSwipe: DrillDefinition = {
  id: "saccade-swipe",
  name: "Saccade Swipe",
  shortName: "Saccade Swipe",
  phase: "Execute",
  interaction: "touch",
  responseMode: "joystick",
  eightWay: true,
  authoredLadder: true,
  environment: "arena",
  mvp: true,
  description:
    "An arrow flashes out in the field. TEAL ring: flick the way it points. RED ring: flick the OPPOSITE way — suppress the reflex to look-and-go. 100 levels: the deadline tightens, anti-saccades climb from none to most of the trials, and the answer set grows from 2 directions to 4 to all 8. 50 trials a session; your pro-vs-anti gap is the oculomotor-control readout.",
  purpose: "Pro- and anti-saccade control — reflexive orienting versus frontal inhibition.",
  instructions: [
    "1. An arrow appears out in your field. SACCADE to it and read which way it points.",
    "2. TEAL ring = PRO: FLICK the stick the way the arrow points.",
    "3. RED ring = ANTI: FLICK the OPPOSITE way. Fight the urge to go toward it.",
    "4. Be fast - the deadline tightens every level. 50 arrows a session.",
    "5. Fundamentals is left/right only; Advanced adds up/down; Elite is all eight directions.",
  ],
  controlsHint: "TEAL = FLICK THE ARROW'S WAY  ·  RED = FLICK THE OPPOSITE WAY",
  levels,
  buildTrials: (params, rng) => buildSacTrials((params.level as number) ?? 1, rng),

  analyze: (events) => {
    const ev = events.filter((e) => e.trialId.startsWith("sac-"));
    if (!ev.length) return [];
    const pro = ev.filter((e) => e.trialId.includes("-pro"));
    const anti = ev.filter((e) => e.trialId.includes("-anti"));
    const mean = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0);
    const acc = (g: typeof ev) => (g.length ? Math.round((g.filter((e) => e.correct).length / g.length) * 100) : 0);
    const rt = (g: typeof ev) => mean(g.filter((e) => e.correct && e.reactionMs !== undefined).map((e) => e.reactionMs!));

    const proRT = rt(pro), antiRT = rt(anti);
    const notes = [
      `Pro-saccade: ${acc(pro)}% correct, ${proRT}ms mean.`,
    ];
    if (anti.length) {
      notes.push(`Anti-saccade: ${acc(anti)}% correct, ${antiRT}ms mean.`);
      if (proRT && antiRT) {
        notes.push(`Anti-saccade cost: +${antiRT - proRT}ms and ${acc(pro) - acc(anti)} accuracy points — the price of overriding the look-toward reflex.`);
      }
    }

    /**
     * POST-ERROR SLOWING. After a wrong flick, a healthy control system slows down. Its
     * absence means the athlete is not registering their own errors — a different, more
     * serious finding than simply being inaccurate.
     */
    const ordered = [...ev].sort((a, b) => a.timestamp - b.timestamp);
    const afterErr: number[] = [], afterOk: number[] = [];
    for (let i = 1; i < ordered.length; i++) {
      const c = ordered[i];
      if (c.correct && c.reactionMs) (ordered[i - 1].correct ? afterOk : afterErr).push(c.reactionMs);
    }
    const pes = afterErr.length && afterOk.length ? mean(afterErr) - mean(afterOk) : 0;
    if (pes) notes.push(`Post-error slowing: ${pes >= 0 ? "+" : ""}${pes}ms.`);
    return notes;
  },

  durationMs: (params) => {
    const L = sacLevel((params.level as number) ?? 1);
    return 1200 + TRIALS * (L.deadline + 200 + L.jitter[1]) + 1500;
  },
};
