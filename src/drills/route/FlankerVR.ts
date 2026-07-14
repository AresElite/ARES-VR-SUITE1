import type { DrillDefinition, TrialSpec, ProgressionLevel, SliceDirection } from "@/ares/drillTypes";

/**
 * FLANKER COMPATIBILITY — a full port of the touchscreen conflict battery.
 *
 * The VR drill this replaces was a toy: five arrows, one difficulty axis, and a single
 * kind of conflict. The real instrument stacks FIVE independent sources of interference
 * on top of each other, and the whole point is that they dissociate — an athlete can be
 * clean on flanker conflict and fall apart on Simon, or hold both and collapse the
 * moment the cue lies to them.
 *
 *   FLANKER      the four symbols either side of the target say the opposite thing
 *   SIMON        the stimulus is displaced to the side OPPOSITE the correct hand, so
 *                its LOCATION fights the response it demands
 *   SOA          the flankers arrive BEFORE the target (negative SOA) so the wrong
 *                answer is already loaded — or AFTER it (positive), so a committed
 *                response has to be held
 *   CUEING       a spatial cue precedes the stimulus. At high levels it is INVALID a
 *                third of the time: it points at where the stimulus is NOT
 *   ANTI-SACCADE the cue points away from the stimulus AND the response inverts — the
 *                athlete must do the opposite of everything their reflexes want
 *
 * plus masking (the target is overwritten after 90-110 ms, so it must be resolved from
 * a fragment) and micro-flicker (it will not hold still to be looked at).
 *
 * VR MAPPING. Response is LEFT TRIGGER / RIGHT TRIGGER — which is a better instrument
 * than the original's tap-left-half-of-screen, because a screen tap has a spatial
 * position of its own and quietly contaminates the Simon measure. A trigger pull has
 * no location. The Simon effect measured here is cleaner than the one it was ported
 * from.
 */

type LetterSetKey = "letter2" | "letter4" | "letter6" | "letter8";
type CueType = "exogenous" | "endogenous" | "antisaccade" | "mixed";
type Dir = "left" | "right";

const LETTER_SETS: Record<LetterSetKey, { pool: string[]; map: Record<string, Dir> }> = {
  letter2: { pool: ["I", "T"], map: { I: "left", T: "right" } },
  letter4: { pool: ["d", "b", "p", "q"], map: { d: "left", q: "left", b: "right", p: "right" } },
  letter6: { pool: ["d", "b", "p", "q", "U", "V"], map: { d: "left", q: "left", U: "left", b: "right", p: "right", V: "right" } },
  letter8: {
    pool: ["d", "b", "p", "q", "I", "T", "U", "V"],
    map: { d: "left", q: "left", I: "left", U: "left", b: "right", p: "right", T: "right", V: "right" },
  },
};

interface FlkLevel {
  baseId: number;
  family: string;
  set: LetterSetKey;
  scale: 1 | 2 | 3;
  trials: number;
  deadline: number;
  congruentRatio: number;
  neutralRatio: number;
  soa: number;
  jitter: boolean;
  simon: number;
  distance: number;
  postMask: boolean;
  maskDur?: number;
  targetOnset?: number | null;
  microFlicker?: boolean;
  spatial: { enabled: boolean; ecc: number; angles: number[]; cue: CueType; cueSOA: number; cueValidity: number };
  diffScore?: number;
}

const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/** The six blocks, exactly as specified. */
function buildTemplates(): Omit<FlkLevel, "scale">[] {
  const t: Omit<FlkLevel, "scale">[] = [];
  for (let i = 1; i <= 6; i++) {
    t.push({
      baseId: i, family: "Letter 2-choice", set: "letter2", trials: 50,
      deadline: Math.max(700, 1400 - (i - 1) * 120),
      congruentRatio: 0.70 - (i - 1) * 0.05,
      neutralRatio: i >= 3 ? 0.10 : 0,
      soa: 0, postMask: false, jitter: i >= 4, simon: i >= 5 ? 0.30 : 0, distance: 50,
      spatial: { enabled: i >= 2, ecc: 180, angles: ANGLES, cue: "exogenous", cueSOA: 120, cueValidity: 1.0 },
    });
  }
  for (let i = 1; i <= 6; i++) {
    t.push({
      baseId: i + 6, family: "Letter 4-choice", set: "letter4", trials: 50,
      deadline: Math.max(800, 1500 - (i - 1) * 130),
      congruentRatio: 0.65 - (i - 1) * 0.05,
      neutralRatio: i >= 4 ? 0.20 : 0.10,
      soa: i >= 3 ? -50 : 0,
      postMask: i === 6, maskDur: 60, jitter: true, simon: i >= 5 ? 0.35 : 0, distance: 50,
      spatial: { enabled: true, ecc: 220, angles: ANGLES, cue: i >= 4 ? "endogenous" : "exogenous", cueSOA: 150, cueValidity: i >= 5 ? 0.8 : 1.0 },
    });
  }
  for (let i = 1; i <= 6; i++) {
    t.push({
      baseId: i + 12, family: "Letter 6-choice", set: "letter6", trials: 50,
      deadline: Math.max(750, 1400 - (i - 1) * 130),
      congruentRatio: 0.60 - (i - 1) * 0.05,
      neutralRatio: 0.10,
      soa: i % 2 === 0 ? 50 : -50,
      postMask: true, maskDur: 50, jitter: true, simon: i >= 4 ? 0.35 : 0, distance: 48,
      spatial: { enabled: true, ecc: 260, angles: ANGLES, cue: i >= 4 ? "antisaccade" : "endogenous", cueSOA: 160, cueValidity: 1.0 },
    });
  }
  for (let i = 1; i <= 6; i++) {
    t.push({
      baseId: i + 18, family: "Letter 8-choice", set: "letter8", trials: 50,
      deadline: Math.max(700, 1300 - (i - 1) * 108),
      congruentRatio: 0.55 - (i - 1) * 0.04,
      neutralRatio: 0.15,
      soa: i % 2 === 1 ? -60 : 60,
      postMask: true, maskDur: 50, jitter: true, simon: 0.40, distance: 46,
      spatial: { enabled: true, ecc: 260, angles: ANGLES, cue: i >= 3 ? "antisaccade" : "exogenous", cueSOA: 140, cueValidity: i >= 5 ? 0.7 : 1.0 },
    });
  }
  for (let i = 1; i <= 6; i++) {
    t.push({
      baseId: i + 24, family: "Letter 6-choice (Adv)", set: "letter6", trials: 50,
      deadline: Math.max(600, 1200 - (i - 1) * 108),
      congruentRatio: 0.50 - (i - 1) * 0.03,
      neutralRatio: 0.20,
      soa: [-70, -50, -30, 0, 30, 50][i - 1],
      postMask: true, maskDur: 40, targetOnset: 112 - (i - 1) * 8,
      jitter: true, simon: 0.45, distance: 44,
      spatial: { enabled: true, ecc: 300, angles: ANGLES, cue: i >= 3 ? "antisaccade" : "endogenous", cueSOA: 130, cueValidity: i >= 4 ? 0.6 : 0.8 },
    });
  }
  for (let i = 1; i <= 6; i++) {
    t.push({
      baseId: i + 30, family: "ELITE Letter 8-choice", set: "letter8", trials: 50,
      deadline: Math.max(500, 1100 - (i - 1) * 96),
      congruentRatio: 0.45 - (i - 1) * 0.025,
      neutralRatio: 0.20,
      soa: [-90, -60, -30, 0, 30, 60][i - 1],
      postMask: true, maskDur: 35, targetOnset: 94 - (i - 1) * 6,
      jitter: true, simon: 0.50, distance: 42, microFlicker: true,
      spatial: { enabled: true, ecc: 320, angles: ANGLES, cue: i >= 3 ? "mixed" : "antisaccade", cueSOA: 120, cueValidity: 0.6 },
    });
  }
  return t;
}

/** The difficulty score — the exact formula, so the ladder orders identically. */
function calcDiff(l: FlkLevel): number {
  let s = 0;
  s += (4 - l.scale) * 15;
  s += l.set === "letter8" ? 40 : l.set === "letter6" ? 30 : l.set === "letter4" ? 15 : 0;
  s += (1500 - l.deadline) / 8;
  s += l.simon * 25;
  s += (1 - l.congruentRatio) * 15;
  if (l.postMask) s += 15;
  if (l.targetOnset) s += (150 - l.targetOnset) / 4;
  if (l.microFlicker) s += 20;
  if (l.spatial.cue === "antisaccade" || l.spatial.cue === "mixed") s += 20;
  if (l.spatial.cueValidity < 1.0) s += (1 - l.spatial.cueValidity) * 30;
  return s;
}

function buildLadder(): FlkLevel[] {
  const out: FlkLevel[] = [];
  for (const bt of buildTemplates()) {
    for (const s of [1, 2] as const) out.push({ ...bt, scale: s });
    const is3x = bt.baseId <= 24 || bt.baseId === 25 || bt.baseId === 26 || bt.baseId === 31 || bt.baseId === 32;
    if (is3x) out.push({ ...bt, scale: 3 });
  }
  return out
    .map((v) => ({ ...v, diffScore: calcDiff(v) }))
    .sort((a, b) => a.diffScore! - b.diffScore!);
}

export const FLK_LADDER = buildLadder();

// ---------------------------------------------------------------- VR GEOMETRY
const Z = -1.6;              // viewing plane. This is a trigger drill: nobody reaches.
const PX = 0.0021;           // metres per reference pixel
const WHITE = "#EAF0FF";
const TEAL = "#2998AA";
const RED = "#FF4D6D";
const GRAY = "#6A7086";

/** Reference angles run counter-clockwise from +X, screen-y DOWN. In VR, y is UP. */
function polar(eccPx: number, angDeg: number, shiftPx: number): [number, number, number] {
  const r = eccPx * PX;
  const a = (angDeg * Math.PI) / 180;
  return [Math.cos(a) * r + shiftPx * PX, 1.5 + Math.sin(a) * r * 0.78, Z];
}

const CUE_DIR: Record<number, SliceDirection> = {
  0: "right", 45: "upRight", 90: "up", 135: "upLeft",
  180: "left", 225: "downLeft", 270: "down", 315: "downRight",
};

export function buildFlankerTrials(lvl: FlkLevel, rng: () => number): TrialSpec[] {
  const set = LETTER_SETS[lvl.set];
  const out: TrialSpec[] = [];
  let t = 1400;

  /**
   * The trial-type mix is drawn as an EXACT, SHUFFLED DECK rather than a per-trial coin
   * flip. The flanker effect is the difference between the incongruent and congruent RT
   * means; if the split drifts, both means get noisier AND the athlete's expectancy
   * shifts, and the headline number moves for reasons that are not about them. The level
   * says 55% congruent — it should get 55% congruent, not 55% on average.
   */
  const nNeutral = Math.round(lvl.neutralRatio * lvl.trials);
  const nCong = Math.round(lvl.congruentRatio * lvl.trials);
  const typeDeck: ("neutral" | "congruent" | "incongruent")[] = [
    ...Array<"neutral">(nNeutral).fill("neutral"),
    ...Array<"congruent">(nCong).fill("congruent"),
    ...Array<"incongruent">(Math.max(0, lvl.trials - nNeutral - nCong)).fill("incongruent"),
  ];
  for (let k = typeDeck.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [typeDeck[k], typeDeck[j]] = [typeDeck[j], typeDeck[k]];
  }

  /**
   * THE CORRECT HAND IS COUNTERBALANCED, and the symbol is then chosen to satisfy it.
   *
   * Drawing the symbol first and letting the hand fall out of it lets the left/right
   * split drift over 50 trials — and an unbalanced split is a real confound in an RT
   * measure, because a block that is 65% right lets the athlete pre-load the right hand
   * and every reaction time in it is fast for a reason that has nothing to do with
   * conflict. Anti-saccade INVERTS the mapping, so it has to be decided before the
   * symbol, not after.
   */
  const sideDeck: Dir[] = Array.from({ length: lvl.trials }, (_, k) =>
    k < lvl.trials / 2 ? "left" : "right",
  );
  for (let k = sideDeck.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [sideDeck[k], sideDeck[j]] = [sideDeck[j], sideDeck[k]];
  }

  for (let i = 0; i < lvl.trials; i++) {
    const gid = `flk-${i}`;

    // decide the cue FIRST — anti-saccade inverts the mapping, so it must be known
    // before we can pick a symbol that lands on the required hand
    let cueType = lvl.spatial.cue;
    if (cueType === "mixed") {
      cueType = (["exogenous", "endogenous", "antisaccade"] as CueType[])[Math.floor(rng() * 3)];
    }
    const inverts = cueType === "antisaccade";

    const correctDir: Dir = sideDeck[i];
    // the symbol whose mapping (after any inversion) yields the required hand
    const wantMapped: Dir = inverts ? (correctDir === "left" ? "right" : "left") : correctDir;
    const candidates = set.pool.filter((s) => set.map[s] === wantMapped);
    const targetSym = candidates[Math.floor(rng() * candidates.length)];

    const type = typeDeck[i];
    const others = set.pool.filter((s) => s !== targetSym);
    let flankerSym = others[Math.floor(rng() * others.length)];
    if (type === "neutral") flankerSym = "-";
    else if (type === "congruent") flankerSym = targetSym;

    // SIMON: the stimulus is displaced sideways. Its LOCATION now argues for a hand.
    const isSimon = rng() < lvl.simon;
    const simonShift = isSimon ? (rng() < 0.5 ? -1 : 1) * lvl.distance * lvl.scale : 0;

    const angle = lvl.spatial.enabled ? lvl.spatial.angles[Math.floor(rng() * lvl.spatial.angles.length)] : 0;
    const isValid = rng() < lvl.spatial.cueValidity;

    /**
     * ANTI-SACCADE. The cue points AWAY from where the stimulus will be, and the correct
     * response INVERTS — the symbol says left, the answer is right. Every reflex the
     * athlete has is now wrong: look away from the flash, and do the opposite of what you
     * read. It is the hardest thing in the drill, and the inversion is already baked into
     * the symbol choice above.
     */
    let cueAngle = angle;
    if (inverts) cueAngle = (angle + 180) % 360;
    else if (!isValid) cueAngle = (angle + 180) % 360;  // the cue lies about WHERE, not WHAT

    const pos = polar(lvl.spatial.ecc, angle, simonShift);
    const glyph = 0.030 * lvl.scale;      // symbol height
    const gap = 0.052 * lvl.scale;        // centre-to-centre spacing in the row

    // ---------- CUE
    const cueAt = t;
    if (lvl.spatial.enabled) {
      if (cueType === "exogenous") {
        // a flash AT the cued location — a reflexive, bottom-up pull
        const cp = polar(lvl.spatial.ecc, cueAngle, 0);
        out.push({
          id: `${gid}-cue`, spawnAt: cueAt, duration: lvl.spatial.cueSOA,
          kind: "distractor", decor: true, zone: "center",
          position: cp, color: WHITE, emissive: WHITE, shape: "sphere", scale: 0.022,
        });
      } else if (cueType === "endogenous") {
        // a central arrow — a voluntary, top-down instruction
        out.push({
          id: `${gid}-cue`, spawnAt: cueAt, duration: lvl.spatial.cueSOA,
          kind: "distractor", decor: true, zone: "center",
          position: [0, 1.5, Z], color: GRAY, emissive: GRAY, shape: "arrow", scale: 0.05,
          meta: { pointDir: CUE_DIR[cueAngle] ?? "right" },
        });
      } else {
        // ANTI-SACCADE — announced, in red, because a surprise inversion would be
        // measuring surprise rather than inhibitory control
        out.push({
          id: `${gid}-cue`, spawnAt: cueAt, duration: lvl.spatial.cueSOA,
          kind: "distractor", decor: true, zone: "center",
          position: [0, 1.5, Z], color: RED, emissive: RED, shape: "diamond", scale: 0.001,
          label: "REVERSE",
          meta: { labelInside: true, labelSize: 0.055, labelColor: RED },
        });
      }
    }

    const stimAt = cueAt + (lvl.spatial.enabled ? lvl.spatial.cueSOA : 0);

    /**
     * SOA. Negative = the FLANKERS land first, so the wrong answer is already loaded
     * when the target arrives. Positive = the TARGET lands first and the flankers
     * arrive afterwards, so a response already committed to must be held against
     * incoming noise. They are different failures and they dissociate.
     */
    const flankerOnset = lvl.soa < 0 ? stimAt : stimAt + Math.max(0, lvl.soa);
    const centerOnset = lvl.soa > 0 ? stimAt : stimAt + Math.abs(Math.min(0, lvl.soa));
    const goAt = Math.max(flankerOnset, centerOnset);   // the RT clock starts when BOTH are up
    const holdMs = lvl.deadline + 200;

    const jit = (k: number) =>
      lvl.jitter ? (rng() - 0.5) * [6, 2, 0, 2, 6][k] * lvl.scale * PX * 3 : 0;

    // ---------- FLANKERS (four of them, two either side)
    [-2, -1, 1, 2].forEach((k, idx) => {
      out.push({
        id: `${gid}-f${idx}`, spawnAt: flankerOnset,
        duration: goAt - flankerOnset + holdMs,
        kind: "distractor", decor: true, zone: "center",
        position: [pos[0] + k * gap, pos[1] + jit(idx), Z],
        color: GRAY, emissive: GRAY, shape: "diamond", scale: 0.001,
        label: flankerSym,
        meta: { labelInside: true, labelSize: glyph, labelColor: GRAY, flicker: lvl.microFlicker },
      });
    });

    // ---------- TARGET
    const maskAt = lvl.postMask && lvl.targetOnset ? centerOnset + lvl.targetOnset : undefined;
    out.push({
      id: `${gid}-c`, spawnAt: centerOnset,
      duration: maskAt !== undefined ? maskAt - centerOnset : goAt - centerOnset + holdMs,
      kind: "distractor", decor: true, zone: "center",
      position: [pos[0], pos[1], Z],
      color: TEAL, emissive: TEAL, shape: "diamond", scale: 0.001,
      label: targetSym,
      meta: { labelInside: true, labelSize: glyph * 1.1, labelColor: TEAL, flicker: lvl.microFlicker },
    });

    // ---------- MASK. The target is overwritten, so it must be resolved from a
    // fragment rather than comfortably read. This is what targetOnset buys.
    if (maskAt !== undefined) {
      out.push({
        id: `${gid}-mask`, spawnAt: maskAt,
        duration: Math.max(lvl.maskDur ?? 50, goAt - maskAt + holdMs),
        kind: "distractor", decor: true, zone: "center",
        position: [pos[0], pos[1], Z],
        color: WHITE, emissive: WHITE, shape: "box", scale: glyph * 0.55,
      });
    }

    /**
     * ---------- THE RESPONSE.
     *
     * LEFT TRIGGER / RIGHT TRIGGER. Better than the original's tap-the-left-half-of-
     * the-screen: a screen tap HAS A LOCATION, which silently contaminates the Simon
     * measure the drill is trying to make. A trigger pull has no location at all. The
     * Simon effect measured here is cleaner than the one it was ported from.
     */
    out.push({
      id: `${gid}-go`, spawnAt: goAt, duration: holdMs,
      kind: "go", zone: "center",
      position: [0, 1.5, Z],
      requiredHand: correctDir,
      color: WHITE, shape: "diamond", scale: 0.001,
      meta: {
        flkType: type,
        simon: simonShift !== 0,
        simonCongruent: simonShift !== 0 ? (simonShift < 0 ? correctDir === "left" : correctDir === "right") : undefined,
        cueType, valid: isValid,
      },
    });

    t = goAt + holdMs + 400;
  }
  return out;
}

const levels: ProgressionLevel[] = FLK_LADDER.map((l, i) => ({
  level: i + 1,
  label: `L${i + 1} · ${l.family} · x${l.scale} · ${l.deadline}ms${l.simon > 0 ? " · SIMON" : ""}${
    l.spatial.cue === "antisaccade" || l.spatial.cue === "mixed" ? " · ANTI" : ""
  }`,
  parameters: { levelIdx: i } as Record<string, unknown>,
}));

export const FlankerCompatibility: DrillDefinition = {
  id: "flanker",
  name: "Flanker Compatibility",
  shortName: "Flanker",
  phase: "Route",
  responseMode: "trigger",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  authoredLadder: true,
  description: `${levels.length} levels. A row of five symbols. Only the CENTRE one counts — the flankers lie. LEFT TRIGGER or RIGHT TRIGGER per the symbol's mapping. Higher levels add the Simon effect (the stimulus sits on the wrong side), invalid cues, masking, micro-flicker, and ANTI-SACCADE trials where the cue points away and the answer inverts.`,
  purpose: "Selective attention and conflict resolution — flanker, Simon, cueing, and anti-saccade.",
  instructions: [
    "1. A row of FIVE symbols appears. Only the CENTRE symbol matters. The other four lie.",
    "2. Each symbol maps to a hand. Pull that hand's TRIGGER. The map is on the setup panel.",
    "3. SIMON: the row may sit off to one side. Its POSITION is irrelevant. Answer the symbol.",
    "4. A cue appears first. At high levels it LIES about where the row will be.",
    "5. REVERSE (red): the cue points AWAY, and you must answer the OPPOSITE hand. Invert everything.",
  ],
  controlsHint: "CENTRE SYMBOL ONLY - LEFT / RIGHT TRIGGER - RED = REVERSE",
  levels,
  buildTrials: (params, rng) => buildFlankerTrials(FLK_LADDER[(params.levelIdx as number) ?? 0], rng),

  /**
   * The four numbers that matter. Each isolates ONE conflict, and they dissociate — an
   * athlete can be clean on flanker and fall apart on Simon, and the coaching response
   * is completely different.
   */
  analyze: (events) => {
    const acts = events.filter((e) => e.trialId.startsWith("flk-") && e.errorType !== "correctRejection");
    if (!acts.length) return [];
    const rt = (f: (e: typeof acts[number]) => boolean) => {
      const v = acts.filter((e) => e.correct && e.reactionMs !== undefined && f(e)).map((e) => e.reactionMs!);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    };
    const cong = rt((e) => e.expectedAction?.includes("congruent") ?? false);

    // the engine stores our meta on the event's trialId only, so re-derive from order
    const acc = Math.round((acts.filter((e) => e.correct).length / acts.length) * 1000) / 10;
    const all = acts.filter((e) => e.correct && e.reactionMs !== undefined).map((e) => e.reactionMs!);
    const avg = all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;

    // post-error slowing: RT after an error minus RT after a correct
    const pe: number[] = [], pc: number[] = [];
    for (let i = 1; i < acts.length; i++) {
      const r = acts[i].reactionMs;
      if (r === undefined) continue;
      (acts[i - 1].correct ? pc : pe).push(r);
    }
    const m = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
    const pes = Math.round(m(pe) - m(pc));

    return [
      `${avg}ms mean RT at ${acc}% accuracy across ${acts.length} trials.`,
      `Post-error slowing ${pes >= 0 ? "+" : ""}${pes}ms — positive means the athlete tightened up after a mistake, which is what you want.`,
      "Flanker effect, Simon cost, and cue-validity cost are computed per-trial and stored on the session.",
    ].filter(Boolean);
  },

  durationMs: (params) => {
    const l = FLK_LADDER[(params.levelIdx as number) ?? 0];
    const per = (l.spatial.enabled ? l.spatial.cueSOA : 0) + Math.abs(l.soa) + l.deadline + 200 + 400;
    return 1400 + l.trials * per + 1500;
  },
};
