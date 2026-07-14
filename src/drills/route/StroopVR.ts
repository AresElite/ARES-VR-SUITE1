import type { DrillDefinition, TrialSpec, ProgressionLevel } from "@/ares/drillTypes";

/**
 * STROOP — a full port of the three-protocol interference battery.
 *
 * The point of Stroop is not "reading is hard". It is that an OVERLEARNED, automatic
 * process (reading a word, knowing that 8 > 3) fires whether you want it to or not, and
 * the athlete must suppress it to report a PHYSICAL property instead. Three protocols,
 * three different automatic processes to fight:
 *
 *   COLOUR     the word says RED, the ink is BLUE. Reading is automatic; naming ink is not.
 *   MAGNITUDE  a small "8" beside a large "3". Numerical value is automatic; you must
 *              report which is numerically larger while its SIZE argues the opposite.
 *   SIZE       the word "SMALL" printed huge beside "BIG" printed tiny. Semantics fight
 *              geometry, and you must report the geometry.
 *
 * Sixty levels: the deadline tightens 2500 -> 800 ms, the stimulus shrinks to half size,
 * and the placement goes STATIC -> HORIZONTAL -> RANDOM, so at the top the athlete is
 * saccading to a small, brief, contradictory stimulus somewhere they did not expect.
 *
 * VR MAPPING. LEFT TRIGGER / RIGHT TRIGGER. This matters more here than anywhere else:
 * the original taps the left or right HALF OF THE SCREEN, but at high levels the stimulus
 * itself is randomly placed left or right — so a tap has to travel toward or away from it,
 * and an unintended Simon effect contaminates every reaction time in the top 25 levels. A
 * trigger has no location. The interference measured here is Stroop, and only Stroop.
 */

export type StroopMode = "color" | "magnitude" | "size";

const TRIALS = 50;
const Z = -1.6;              // viewing plane — a trigger drill; nobody reaches
const PX = 0.0021;           // metres per reference pixel

const COLORS_STANDARD = [
  { name: "RED", hex: "#EF4444" },
  { name: "BLUE", hex: "#3B82F6" },
  { name: "GREEN", hex: "#10B981" },
  { name: "YELLOW", hex: "#FACC15" },
  { name: "PURPLE", hex: "#8B5CF6" },
];
/**
 * The accessible palette swaps RED->ORANGE and GREEN->CYAN. This is not a lesser mode:
 * an athlete with a red-green deficiency running the standard palette would be failing on
 * COLOUR DISCRIMINATION while we recorded it as an inhibition failure — a completely wrong
 * diagnosis, from a test that never should have been given to them.
 */
const COLORS_ACCESSIBLE = [
  { name: "ORANGE", hex: "#F97316" },
  { name: "BLUE", hex: "#3B82F6" },
  { name: "CYAN", hex: "#22D3EE" },
  { name: "YELLOW", hex: "#FACC15" },
  { name: "PURPLE", hex: "#8B5CF6" },
];

interface StroopLevel {
  deadline: number;
  fontScale: number;
  spatialMode: "static" | "horizontal" | "random";
}

/** The exact level curve from the reference. */
function levelConfig(level: number): StroopLevel {
  return {
    deadline: Math.max(800, 2500 - level * 25),
    fontScale: Math.max(0.5, 1 - (level - 1) * 0.0085),
    spatialMode: level > 35 ? "random" : level > 15 ? "horizontal" : "static",
  };
}

function placement(mode: StroopLevel["spatialMode"], rng: () => number): [number, number] {
  if (mode === "static") return [0, 1.5];
  // 20-80% of the reference viewport, recentred and converted to metres
  const px = (20 + rng() * 60 - 50) * 0.012;
  if (mode === "horizontal") return [px, 1.5];
  const py = (25 + rng() * 50 - 50) * 0.009;
  return [px, 1.5 + py];
}

export function buildStroopTrials(
  p: { level: number; mode: StroopMode; palette: "standard" | "accessible" },
  rng: () => number,
): TrialSpec[] {
  const cfg = levelConfig(p.level);
  const colors = p.palette === "accessible" ? COLORS_ACCESSIBLE : COLORS_STANDARD;
  const out: TrialSpec[] = [];
  let t = 1400;

  /**
   * COUNTERBALANCED CONGRUENCY.
   *
   * The reference draws congruency with a coin flip per trial. Over 50 trials that can
   * easily land at 26/74 — and the congruency PROPORTION is not a cosmetic detail here:
   * the interference cost is the DIFFERENCE between two RT means, so an unlucky split
   * both thins one mean and shifts the athlete's expectancy (a block that is mostly
   * congruent trains a different strategy than one that is mostly incongruent). The
   * headline metric would move for reasons that have nothing to do with the athlete.
   *
   * So the deck is exactly 25/25, shuffled. Same paradigm, a measurement you can trust.
   */
  const deck = Array.from({ length: TRIALS }, (_, k) => k < TRIALS / 2);
  for (let k = deck.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [deck[k], deck[j]] = [deck[j], deck[k]];
  }

  /**
   * THE RESPONSE SIDE IS COUNTERBALANCED TOO.
   *
   * In magnitude and size mode the correct hand falls out of a random comparison, so
   * over 50 trials the left/right split drifts — and an unbalanced split is a genuine
   * confound in a reaction-time measure, not a cosmetic one: a block that is 66% left
   * lets the athlete pre-load the left hand, and every RT in it is faster for a reason
   * that has nothing to do with interference. In COLOUR mode the side is already fixed
   * by congruency (right = match), so the congruency deck balances it for free; the
   * other two protocols need their own deck.
   */
  const sideDeck: ("left" | "right")[] = Array.from({ length: TRIALS }, (_, k) =>
    k < TRIALS / 2 ? "left" : "right",
  );
  for (let k = sideDeck.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [sideDeck[k], sideDeck[j]] = [sideDeck[j], sideDeck[k]];
  }

  for (let i = 0; i < TRIALS; i++) {
    const gid = `str-${i}`;
    const congruent = deck[i];
    const [cx, cy] = placement(cfg.spatialMode, rng);
    const hold = cfg.deadline;
    let correct: "left" | "right";

    if (p.mode === "color") {
      /**
       * COLOUR. The question is NOT "what colour is the ink" — it is "does the ink MATCH
       * the word". RIGHT trigger = match, LEFT trigger = mismatch. A two-alternative
       * judgment, which is what makes it a clean speeded conflict task rather than a
       * five-way colour-naming task confounded by vocabulary and colour discrimination.
       */
      const ink = colors[Math.floor(rng() * colors.length)];
      let word = ink.name;
      if (!congruent) {
        const others = colors.filter((c) => c.name !== ink.name);
        word = others[Math.floor(rng() * others.length)].name;
      }
      correct = congruent ? "right" : "left";

      out.push({
        id: `${gid}-w`, spawnAt: t, duration: hold,
        kind: "distractor", decor: true, zone: "center",
        position: [cx, cy, Z],
        color: ink.hex, emissive: ink.hex, shape: "diamond", scale: 0.001,
        label: word,
        meta: { labelInside: true, labelSize: 0.11 * cfg.fontScale, labelColor: ink.hex },
      });
    } else if (p.mode === "magnitude") {
      // two digits. Numerical value is automatic; physical size argues the other way.
      // the deck decides which HAND is correct; the digits are then chosen to satisfy it
      const wantLeft = sideDeck[i] === "left";
      let a = 1 + Math.floor(rng() * 9);
      let b = 1 + Math.floor(rng() * 9);
      while (b === a) b = 1 + Math.floor(rng() * 9);
      const hi = Math.max(a, b), lo = Math.min(a, b);
      const v1 = wantLeft ? hi : lo;
      const v2 = wantLeft ? lo : hi;
      const v1Bigger = v1 > v2;
      const BIG = 160, SML = 60;
      const s1 = congruent ? (v1Bigger ? BIG : SML) : (v1Bigger ? SML : BIG);
      const s2 = congruent ? (v1Bigger ? SML : BIG) : (v1Bigger ? BIG : SML);
      correct = v1Bigger ? "left" : "right";   // answer the VALUE, not the size

      [[v1, s1, -1], [v2, s2, 1]].forEach(([v, s, side], k) => {
        out.push({
          id: `${gid}-p${k}`, spawnAt: t, duration: hold,
          kind: "distractor", decor: true, zone: "center",
          position: [cx + (side as number) * 0.16, cy, Z],
          color: "#EAF0FF", emissive: "#EAF0FF", shape: "diamond", scale: 0.001,
          label: String(v),
          meta: { labelInside: true, labelSize: (s as number) * PX * cfg.fontScale, labelColor: "#EAF0FF" },
        });
      });
    } else {
      // SIZE. The word "SMALL" printed huge beside "BIG" printed tiny. Report the geometry.
      /**
       * The deck decides the correct hand; leftIsBigWord is then derived so the
       * PHYSICALLY larger word lands on the required side. Congruency flips the mapping,
       * which is exactly the conflict — so it has to be accounted for here.
       */
      const wantLeftSide = sideDeck[i] === "left";
      const leftIsBigWord = congruent ? wantLeftSide : !wantLeftSide;
      const BIG = 180, SML = 60;
      const szBig = congruent ? BIG : SML;
      const szSml = congruent ? SML : BIG;
      const pair = leftIsBigWord
        ? [{ text: "BIG", sz: szBig }, { text: "SMALL", sz: szSml }]
        : [{ text: "SMALL", sz: szSml }, { text: "BIG", sz: szBig }];
      correct = pair[0].sz > pair[1].sz ? "left" : "right";  // answer the SIZE, not the word

      pair.forEach((q, k) => {
        out.push({
          id: `${gid}-p${k}`, spawnAt: t, duration: hold,
          kind: "distractor", decor: true, zone: "center",
          position: [cx + (k === 0 ? -1 : 1) * 0.19, cy, Z],
          color: "#EAF0FF", emissive: "#EAF0FF", shape: "diamond", scale: 0.001,
          label: q.text,
          meta: { labelInside: true, labelSize: q.sz * PX * cfg.fontScale * 0.62, labelColor: "#EAF0FF" },
        });
      });
    }

    // the response. Trigger, so it carries no spatial position of its own.
    out.push({
      id: `${gid}-go`, spawnAt: t, duration: hold,
      kind: "go", zone: "center",
      position: [0, 1.5, Z],
      requiredHand: correct,
      color: "#EAF0FF", shape: "diamond", scale: 0.001,
      meta: { congruent },
    });

    t += hold + 400;
  }
  return out;
}

const levels: ProgressionLevel[] = Array.from({ length: 60 }, (_, i) => {
  const c = levelConfig(i + 1);
  return {
    level: i + 1,
    label: `L${i + 1} · ${c.deadline}ms · ${Math.round(c.fontScale * 100)}% · ${c.spatialMode.toUpperCase()}`,
    parameters: { level: i + 1 } as Record<string, unknown>,
  };
});

export const Stroop: DrillDefinition = {
  id: "stroop",
  name: "Stroop",
  shortName: "Stroop",
  phase: "Route",
  responseMode: "trigger",
  interaction: "touch",
  environment: "arena",
  mvp: true,
  authoredLadder: true,
  description: "60 levels, 50 trials, three protocols. COLOUR: does the ink MATCH the word? RIGHT trigger = match, LEFT = mismatch. MAGNITUDE: which digit is numerically larger — ignore how big it is drawn. SIZE: which word is physically larger — ignore what it says. The deadline tightens, the stimulus shrinks, and it starts jumping around the field.",
  purpose: "Inhibitory control — suppressing an overlearned automatic response to report a physical property.",
  options: [
    {
      id: "mode",
      label: "Protocol",
      defaultValue: "color",
      values: [
        { id: "color", label: "Colour (ink vs word)" },
        { id: "magnitude", label: "Magnitude (value vs size)" },
        { id: "size", label: "Size (geometry vs meaning)" },
      ],
    },
    {
      id: "palette",
      label: "Palette",
      defaultValue: "standard",
      values: [
        { id: "standard", label: "Standard" },
        { id: "accessible", label: "Accessible (orange/cyan)" },
      ],
    },
  ],
  instructions: [
    "1. COLOUR protocol: does the INK match the WORD? RIGHT trigger = MATCH. LEFT trigger = MISMATCH.",
    "2. MAGNITUDE: two digits. Pull the trigger on the side with the NUMERICALLY LARGER one - ignore how big it is drawn.",
    "3. SIZE: two words. Pull the trigger on the side with the PHYSICALLY LARGER one - ignore what it says.",
    "4. The automatic answer is the WRONG one. That is the whole drill. Suppress it.",
    "5. 50 trials. The deadline tightens, the text shrinks, and it starts moving around the field.",
  ],
  controlsHint: "LEFT / RIGHT TRIGGER - IGNORE THE MEANING, REPORT THE PROPERTY",
  levels,
  buildTrials: (params, rng) =>
    buildStroopTrials(
      {
        level: (params.level as number) ?? 1,
        mode: ((params.mode as string) ?? "color") as StroopMode,
        palette: ((params.palette as string) ?? "standard") as "standard" | "accessible",
      },
      rng,
    ),

  /**
   * INTERFERENCE COST is the headline: incongruent RT minus congruent RT. It is the whole
   * measure. Accuracy alone hides it — an athlete can be 95% correct on both and still be
   * paying 200ms every time the automatic answer is wrong, and that 200ms is the thing
   * their sport actually charges them for.
   */
  analyze: (events) => {
    const acts = events.filter((e) => e.trialId.startsWith("str-") && e.errorType !== "correctRejection");
    if (!acts.length) return [];
    const ok = acts.filter((e) => e.correct && e.reactionMs !== undefined);
    const m = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
    const avg = Math.round(m(ok.map((e) => e.reactionMs!)));
    const acc = Math.round((acts.filter((e) => e.correct).length / acts.length) * 1000) / 10;

    const pe: number[] = [], pc: number[] = [];
    for (let i = 1; i < acts.length; i++) {
      const r = acts[i].reactionMs;
      if (r === undefined) continue;
      (acts[i - 1].correct ? pc : pe).push(r);
    }
    const pes = Math.round(m(pe) - m(pc));

    return [
      `${avg}ms mean RT at ${acc}% accuracy across ${acts.length} trials.`,
      `Post-error slowing ${pes >= 0 ? "+" : ""}${pes}ms.`,
      "Interference cost (incongruent minus congruent RT) is the headline number and is stored per-trial on the session.",
    ];
  },

  durationMs: (params) => {
    const c = levelConfig((params.level as number) ?? 1);
    return 1400 + TRIALS * (c.deadline + 400) + 1500;
  },
};
