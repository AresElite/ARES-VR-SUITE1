import {
  type Cue, type CentralCommand, type PlanStep, type SeqTuning, type SeqHand,
  type SeqAction, type SeqBand, type CueZone,
  TRANSFORM_COMMANDS, NO_GO_COMMANDS,
} from "./types";

/**
 * THE SEQUENCE GENERATOR.
 *
 * Two things happen here, and keeping them separate is the single most important
 * structural decision in the drill:
 *
 *   1. GENERATE the cues — what the athlete SEES in the periphery.
 *   2. RESOLVE the plan — what the athlete must DO, after the central command
 *      has been applied to those cues.
 *
 * They are different objects, and the gap between them IS the drill. A memory
 * game collapses them into one: what you saw is what you do. Here, what you saw
 * is raw material, and the command is an instruction for rewriting it. That gap
 * is where working memory, rule interpretation, and inhibition all live — and
 * because the two are separate data structures, the engine can attribute a
 * failure to encoding (never saw it) versus transformation (saw it, rewrote it
 * wrong), which a merged representation could never do.
 */

const ACTIONS_BY_TIER: Record<string, SeqAction[]> = {
  beginner: ["strike"],
  intermediate: ["strike", "hold"],
  advanced: ["strike", "block", "catch", "hold"],
  pro: ["strike", "block", "catch", "hold", "trace", "inhibit"],
  goat: ["strike", "block", "catch", "hold", "trace", "inhibit"],
};

const pick = <T,>(a: T[], rng: () => number): T => a[Math.floor(rng() * a.length)];

/** Which side of the field a cue zone sits on — used for anti-saccadic conflict. */
export function zoneSide(z: CueZone): "left" | "right" {
  return z.toLowerCase().includes("left") ? "left" : "right";
}

// ---------------------------------------------------------------- CUE STREAM
export function generateCues(tune: SeqTuning, tier: string, rng: () => number): Cue[] {
  const n = tune.seqLenMin + Math.floor(rng() * (tune.seqLenMax - tune.seqLenMin + 1));
  const actions = ACTIONS_BY_TIER[tier] ?? ["strike"];
  const cues: Cue[] = [];
  let t = 0;
  let id = 0;

  const emit = (stream: "A" | "B", distractor: boolean, salient: boolean) => {
    cues.push({
      id: `c${id++}`,
      zone: pick(tune.cueZones, rng),
      hand: rng() < 0.5 ? "left" : "right",
      action: pick(actions, rng),
      band: pick(tune.bands, rng),
      atMs: t,
      distractor,
      salient,
      stream,
    });
  };

  for (let i = 0; i < n; i++) {
    emit("A", false, false);

    // A second, COMPETING sequence (Advanced+). The central command decides which
    // one was ever real — so the athlete must encode BOTH and discard one.
    if (tune.streams === 2 && rng() < 0.55) emit("B", false, false);

    // DISTRACTORS: cues that look exactly like signal and mean nothing (§12).
    if (rng() < tune.distractorRate) emit(rng() < 0.5 ? "A" : "B", true, false);

    /**
     * ANTI-SACCADIC CONFLICT (§25). A deliberately over-salient cue is planted
     * on the OPPOSITE side of the field from the real one. It is designed to
     * capture the gaze. The rule may then require the athlete to act on the cue
     * they were NOT drawn to — which is the entire point: attention capture is
     * automatic, and overriding it is the trained skill.
     */
    if (rng() < tune.salientConflict) {
      const realSide = zoneSide(cues[cues.length - 1].zone);
      const opposite = tune.cueZones.filter((z) => zoneSide(z) !== realSide);
      if (opposite.length) {
        cues.push({
          id: `c${id++}`,
          zone: pick(opposite, rng),
          hand: rng() < 0.5 ? "left" : "right",
          action: pick(actions, rng),
          band: pick(tune.bands, rng),
          atMs: t + 40,
          distractor: false,
          salient: true,
          stream: "A",
        });
      }
    }
    t += tune.cueDisplayMs + tune.cueGapMs;
  }
  return cues;
}

// ------------------------------------------------------------ CENTRAL COMMAND
export function chooseCommand(tune: SeqTuning, hasTwoStreams: boolean, rng: () => number): CentralCommand[] {
  const cmds: CentralCommand[] = [];

  // With two competing sequences the FIRST job is always selection — otherwise
  // the athlete has no basis to discard one, and encoding both was pointless.
  if (hasTwoStreams) cmds.push(rng() < 0.5 ? "selectA" : "selectB");
  else cmds.push("execute");

  // NO-GO. Rare, unpredictable, and the harshest rule in the drill: the correct
  // response to a fully-encoded, fully-understood plan is to do NOTHING.
  if (rng() < 0.06) return [pick(NO_GO_COMMANDS, rng)];

  if (rng() < tune.transformRate) {
    const pool: CentralCommand[] = ["reverse", "repeat"];
    if (tune.transformDepth >= 2) pool.push("mirror", "skip", "oppositeHand", "oppositeCue");
    if (tune.replaceRate > 0 && rng() < tune.replaceRate) pool.push("replace");
    if (tune.chunkRate > 0 && rng() < tune.chunkRate) pool.push("combine");
    cmds.push(pick(pool, rng));

    // STACKED transformations (GOAT): mirror + skip, repeat + reverse. The rules
    // must be composed in order, and composing them wrong is its own error class.
    if (tune.transformDepth >= 2 && rng() < 0.3) {
      const second = pick(pool.filter((c) => c !== cmds[cmds.length - 1]), rng);
      if (second) cmds.push(second);
    }
    if (tune.transformDepth >= 2 && rng() < 0.12) cmds.push("mirrorSpatial");
  }

  if (rng() < tune.branchRate) cmds.push(rng() < 0.5 ? "branchLeft" : "branchRight");
  return cmds;
}

// ----------------------------------------------------------------- RESOLUTION
/**
 * RESOLVE the encoded cues + the central command into the action plan the
 * athlete must actually perform. This function IS the rule set — everything the
 * athlete is being asked to do in their head, done explicitly, once, in code, so
 * that scoring has an unambiguous ground truth to compare against.
 */
export function resolvePlan(
  cues: Cue[],
  commands: CentralCommand[],
  tune: SeqTuning,
  rng: () => number,
): { steps: PlanStep[]; noGo: boolean; transformed: boolean } {
  // A no-go command annihilates the plan. There is nothing to do, and doing
  // anything is a critical error.
  if (commands.some((c) => NO_GO_COMMANDS.includes(c))) {
    return { steps: [], noGo: true, transformed: false };
  }

  // 1. SELECT the live stream, discarding the competitor and all distractors.
  const wantB = commands.includes("selectB");
  const wantStream = wantB ? "B" : "A";
  let live = cues.filter((c) => !c.distractor && c.stream === wantStream);

  // oppositeCue: act on the cue you were NOT drawn to (anti-saccadic).
  if (commands.includes("oppositeCue")) {
    const salientIds = new Set(cues.filter((c) => c.salient).map((c) => c.id));
    const nonSalient = live.filter((c) => !salientIds.has(c.id));
    if (nonSalient.length) live = nonSalient;
  } else {
    // the salient decoy is never part of the plan unless explicitly summoned
    live = live.filter((c) => !c.salient);
  }
  if (!live.length) live = cues.filter((c) => !c.distractor).slice(0, 1);

  // 2. TRANSFORM, strictly in the order the commands were issued. Order matters:
  //    mirror-then-reverse and reverse-then-mirror are different plans, and an
  //    athlete who composes them the wrong way round has made a real error.
  let ordered = [...live];
  let transformed = false;

  for (const cmd of commands) {
    if (!TRANSFORM_COMMANDS.includes(cmd)) continue;
    transformed = true;
    switch (cmd) {
      case "reverse":
        ordered.reverse();
        break;
      case "repeat":
        ordered = [...ordered, ...ordered];
        break;
      case "mirror":
      case "oppositeHand":
        ordered = ordered.map((c) => ({ ...c, hand: (c.hand === "left" ? "right" : "left") as SeqHand }));
        break;
      case "mirrorSpatial":
        // hands AND vertical zones invert. High becomes low. This is the single
        // hardest transformation in the drill and it is GOAT-only for that reason.
        ordered = ordered.map((c) => ({
          ...c,
          hand: (c.hand === "left" ? "right" : "left") as SeqHand,
          band: (c.band === "high" ? "low" : c.band === "low" ? "high" : "mid") as SeqBand,
        }));
        break;
      case "skip": {
        // omit exactly one named position — everything else must survive intact
        if (ordered.length > 1) {
          const drop = Math.floor(rng() * ordered.length);
          ordered = ordered.filter((_, i) => i !== drop);
        }
        break;
      }
      case "replace": {
        // one or more future positions are OVERWRITTEN. The unchanged elements
        // must be preserved exactly — intrusion of the original is its own error.
        const count = tune.transformDepth >= 2 && rng() < 0.4 ? 2 : 1;
        for (let k = 0; k < count && ordered.length; k++) {
          const at = Math.floor(rng() * ordered.length);
          ordered[at] = {
            ...ordered[at],
            hand: (rng() < 0.5 ? "left" : "right") as SeqHand,
            band: pick(tune.bands, rng),
          };
        }
        break;
      }
      case "combine": {
        // splice: take the tail chunk and move it to the front
        if (ordered.length >= 4) {
          const cut = Math.floor(ordered.length / 2);
          ordered = [...ordered.slice(cut), ...ordered.slice(0, cut)];
        }
        break;
      }
      default:
        break;
    }
  }

  // 3. BRANCH — commit to one arm of the fork, discarding the other.
  if (commands.includes("branchLeft")) ordered = ordered.filter((c) => c.hand === "left");
  if (commands.includes("branchRight")) ordered = ordered.filter((c) => c.hand === "right");
  if (!ordered.length) ordered = [...live];

  // 4. Lay the plan onto the clock and the execution field.
  const steps: PlanStep[] = ordered.map((c, i) => {
    const stream: "L" | "R" = tune.dualStream ? (c.hand === "left" ? "L" : "R") : "L";
    /**
     * ASYNCHRONOUS STREAMS (§17, §18). At GOAT the two hands run on DIFFERENT
     * clocks — the left may be on a 420 ms pulse while the right is on 550 ms.
     * They are not merely offset; they genuinely diverge, so the athlete cannot
     * collapse them into one internal rhythm and must maintain two.
     */
    const tempo = tune.asyncStreams && stream === "R" ? tune.tempoMs * 1.3 : tune.tempoMs;
    const idxInStream = ordered.slice(0, i + 1).filter((x) => {
      const s: "L" | "R" = tune.dualStream ? (x.hand === "left" ? "L" : "R") : "L";
      return s === stream;
    }).length - 1;

    const dueMs = tune.tempoMs === 0 ? 0 : (idxInStream + 1) * tempo;
    const moving = rng() < tune.movingRate;

    /**
     * PENDING TARGETS (§16). The target becomes VISIBLE well before its slot.
     * That is not a convenience — it is a trap. The hand wants to go to what it
     * can see. Touching it before its turn is scored as an inhibition failure,
     * not a timing error, because that is what it actually is.
     */
    const pending = rng() < tune.pendingRate;

    return {
      slot: i,
      hand: c.hand,
      action: c.action,
      band: c.band,
      stream,
      cueId: c.id,
      dueMs,
      moving,
      visibleFromMs: pending ? 0 : Math.max(0, dueMs - 400),
      inferred: rng() < tune.inferRate,
    };
  });

  return { steps, noGo: false, transformed };
}
