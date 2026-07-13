import { makeRng } from "@/utils/rng";
import {
  type Cue, type PlanStep, type CentralCommand, type SeqEvent, type SeqSettings,
  type SeqTuning, type SeqPhase, type SessionPhase, type SeqOutcome, type SeqHand,
  type SeqAction, type SeqBand, type BreakdownSource,
  CRITICAL, NO_GO_COMMANDS, TRANSFORM_COMMANDS,
} from "./types";
import { tuningFor } from "./tiers";
import { generateCues, chooseCommand, resolvePlan } from "./generator";
import { classifyPrecision } from "@/ares/precision";

/**
 * THE SEQUENCE ENGINE.
 *
 * One sequence runs through six phases (§5):
 *
 *   ENCODE -> DELAY -> COMMAND -> [PREVIEW] -> EXECUTE -> RESULT
 *
 * and at the top tiers those phases OVERLAP: a new cue can arrive while you are
 * still executing the last plan, and the command itself can change mid-swing.
 * That overlap is not a difficulty knob bolted on top — it is the reason the
 * drill exists. An athlete who can only operate when the phases are clean and
 * sequential has a fragile plan, and this is where that shows.
 *
 * Deterministic fixed-step, like AEGIS: scoring must never drift with framerate.
 */

const STEP_MS = 8;
const BONUS_STAGE_MS = 15_000;
const MAX_BONUS_STAGE = 30;
/** A fully clean sequence forgives one accumulated non-critical strike (§4). */
const BONUS_STRIKES = 3;

export type Hand = "left" | "right";

export interface HandInput {
  pos: [number, number, number];
  vel: [number, number, number];
  gripping: boolean;
}

export interface SeqSnapshot {
  sessionPhase: SessionPhase;
  phase: SeqPhase;
  tMs: number;
  mainRemainingMs: number;

  /** cues currently lit in the periphery */
  liveCues: Cue[];
  /** the central command, if it is currently readable */
  visibleCommand: CentralCommand[] | null;
  /** the resolved plan — ONLY exposed to the renderer during preview */
  preview: PlanStep[] | null;
  /** execution targets the athlete can currently see (incl. pending) */
  targets: PlanStep[];
  /** which slot is live right now, per stream */
  cursor: { L: number; R: number };
  /** a live mid-execution update just landed — the renderer flashes it */
  liveUpdateMs: number;
  /** interference activity during the delay, 0..1 */
  interference: number;

  score: number;
  mainScore: number;
  bonusScore: number;
  streak: number;              // consecutive PERFECT sequences
  longestStreak: number;
  sequences: number;
  perfect: number;
  bonusStage: number;
  bonusStrikes: number;
  inRecovery: boolean;
  recoveryStreak: number;
  complexity: number;
  failCause?: string;
  events: SeqEvent[];
  /** the athlete's current weakest link — drives bonus targeting (§31) */
  weakest?: BreakdownSource;
}

export class SequenceEngine {
  readonly settings: SeqSettings;
  readonly tune: SeqTuning;
  private rng: () => number;

  private t = 0;
  private acc = 0;
  private lastReal = 0;
  private finished = false;
  /**
   * PAUSE. The engine advances on accumulated real time, so a pause cannot
   * simply stop calling tick() — the next tick would see the whole paused gap as
   * elapsed and fast-forward the session through it. Re-anchoring lastReal on
   * every paused frame is what makes the pause actually stop the clock.
   */
  paused = false;
  setPaused(p: boolean): void { this.paused = p; }

  sessionPhase: SessionPhase = "main";
  phase: SeqPhase = "encode";

  // ---- the sequence currently in flight
  private seqId = 0;
  private cues: Cue[] = [];
  private commands: CentralCommand[] = [];
  private plan: PlanStep[] = [];
  private noGo = false;
  private transformed = false;
  private phaseStart = 0;
  private delayMs = 0;
  private goAt = 0;
  private commandShownAt = 0;
  private moveInitAt?: number;
  private lastActionAt: Record<"L" | "R", number> = { L: 0, R: 0 };
  private cursor: Record<"L" | "R", number> = { L: 0, R: 0 };
  private seqErrors = 0;
  private seqCritical = false;
  private liveUpdateAt = -9999;
  /**
   * CONTACT IS EDGE-TRIGGERED ON THE HAND, NOT ON THE STEP.
   *
   * The execution field is six pads (two hands x three bands), so consecutive
   * steps often land on the SAME pad. An earlier version edge-triggered per step,
   * which meant that the instant the hand arrived it resolved every remaining
   * step at that position on consecutive frames — the athlete "played" a 5-item
   * sequence in 40ms and was scored as catastrophically early on four of them.
   *
   * A strike is a physical event: you enter the pad, you leave, you come back.
   * So the trigger is the hand crossing INTO a target volume from outside one.
   */
  private handInside: Record<"left" | "right", boolean> = { left: false, right: false };
  /** hand position at the instant of the contact currently being resolved */
  private contactPos: [number, number, number] | null = null;

  events: SeqEvent[] = [];
  score = 0; mainScore = 0; bonusScore = 0;
  streak = 0; longestStreak = 0;
  sequences = 0; perfect = 0;

  // recovery (§29)
  inRecovery = false;
  recoveryStreak = 0;
  recoveryAttempts = 0;
  private recoveryStartT = 0;
  recoveryTimes: number[] = [];

  // bonus (§4, §31)
  bonusStage = 0;
  bonusStrikes = 0;
  private bonusStartT = 0;
  private bonusStageT = 0;
  failCause?: string;

  // adaptive (§30) — ONE variable at a time
  complexity = 1;
  private lastRaised: keyof SeqTuning | null = null;
  private live: SeqTuning;

  // breakdown attribution (§30)
  breakdowns: Record<BreakdownSource, number> = {
    encoding: 0, memory: 0, decision: 0, transformation: 0, inhibition: 0,
    handSelection: 0, timing: 0, spatial: 0, branch: 0, dualStream: 0, motor: 0,
  };

  private listeners: ((s: SeqSnapshot) => void)[] = [];

  constructor(settings: SeqSettings, seed = 1) {
    this.settings = settings;
    this.tune = tuningFor(settings.tier, settings.mode, settings.custom);
    this.live = { ...this.tune };
    this.rng = makeRng(seed);
  }

  subscribe(fn: (s: SeqSnapshot) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
  }

  start(now: number): void {
    this.lastReal = now;
    this.beginSequence();
  }

  tick(now: number, hands: Record<Hand, HandInput>): void {
    if (this.finished) return;
    if (this.paused) {
      this.lastReal = now;
      const s0 = this.snapshot();
      for (const f of this.listeners) f(s0);
      return;
    }
    this.acc += Math.min(100, now - this.lastReal);
    this.lastReal = now;
    while (this.acc >= STEP_MS) { this.acc -= STEP_MS; this.step(hands); }
    const s = this.snapshot();
    for (const f of this.listeners) f(s);
  }

  // ------------------------------------------------------------ sequence setup
  private beginSequence(): void {
    const T = this.live;
    this.seqId++;
    this.cues = generateCues(T, this.settings.tier, this.rng);
    const hasTwo = T.streams === 2 && this.cues.some((c) => c.stream === "B");
    this.commands = chooseCommand(T, hasTwo, this.rng);
    const r = resolvePlan(this.cues, this.commands, T, this.rng);
    this.plan = r.steps;
    this.noGo = r.noGo;
    this.transformed = r.transformed;

    this.delayMs = T.delayMinMs + this.rng() * Math.max(0, T.delayMaxMs - T.delayMinMs);
    this.phase = "encode";
    this.phaseStart = this.t;
    this.cursor = { L: 0, R: 0 };
    this.seqErrors = 0;
    this.seqCritical = false;
    this.moveInitAt = undefined;
    this.handInside = { left: false, right: false };
  }

  private cueWindowEnd(): number {
    const last = this.cues[this.cues.length - 1];
    return (last?.atMs ?? 0) + this.live.cueDisplayMs;
  }

  // -------------------------------------------------------------------- step
  private step(hands: Record<Hand, HandInput>): void {
    this.t += STEP_MS;
    const T = this.live;
    const el = this.t - this.phaseStart;

    switch (this.phase) {
      case "encode":
        // Any contact during encoding is a premature response — the plan does
        // not even exist yet, and reaching for it is pure disinhibition.
        this.watchPremature(hands, "prematurePending");
        if (el >= this.cueWindowEnd()) { this.phase = "delay"; this.phaseStart = this.t; }
        break;

      case "delay":
        this.watchPremature(hands, "prematurePending");
        if (el >= this.delayMs) {
          this.phase = "command";
          this.phaseStart = this.t;
          this.commandShownAt = this.t;
        }
        break;

      case "command": {
        // Acting on a NO-GO the instant it appears is the purest inhibition
        // failure in the drill, and it is critical.
        this.watchPremature(hands, this.noGo ? "forbidden" : "prematurePending");
        // commandMs is how long the rule remains READABLE. It is NOT how long the
        // athlete waits — at Beginner the rule never leaves the screen at all, and
        // using it as a phase duration once hung the phase for 100 seconds.
        const commandPhaseMs = Math.min(T.commandMs, T.commandPersists ? 800 : T.commandMs);
        if (el >= commandPhaseMs) {
          if (this.noGo) {
            // The correct response to a no-go is to survive it. Withholding for
            // the full window IS the correct answer, and it scores as one.
            this.resolveNoGo();
            return;
          }
          this.phase = T.previewMs > 0 ? "preview" : "execute";
          this.phaseStart = this.t;
          if (this.phase === "execute") {
            this.goAt = this.t;
            this.lastActionAt = { L: this.t, R: this.t };
          }
        }
        break;
      }

      case "preview":
        this.watchPremature(hands, "prematurePending");
        if (el >= T.previewMs) {
          this.phase = "execute";
          this.phaseStart = this.t;
          this.goAt = this.t;
          this.lastActionAt = { L: this.t, R: this.t };
        }
        break;

      case "execute":
        this.execute(hands);
        break;

      case "result":
        if (el >= 350) this.beginSequence();
        break;
    }

    // ---- session phase transitions
    if (this.sessionPhase === "main" && this.t >= this.tune.durationMs) {
      if (this.settings.bonusEnabled && this.settings.mode === "training") this.enterBonus();
      else this.finish("session complete");
    }
    if (this.sessionPhase === "bonus") this.escalate();
  }

  /** Contact outside the execute phase = a response to a plan that is not live yet. */
  private watchPremature(hands: Record<Hand, HandInput>, as: SeqOutcome): void {
    for (const h of ["left", "right"] as Hand[]) {
      const hit = this.contactedTarget(hands[h], h);
      const wasInside = this.handInside[h];
      this.handInside[h] = !!hit;
      if (!hit || wasInside) continue;   // rising edge only
      this.contactPos = [...hands[h].pos] as [number, number, number];
      this.record(hit, as, h, hit.action, hit.band);
    }
  }

  /**
   * EXECUTION. Both streams advance INDEPENDENTLY — the left hand can be three
   * steps into its plan while the right is still waiting for its beat. That is
   * what makes the top tiers genuinely bilateral rather than merely two-handed.
   */
  private execute(hands: Record<Hand, HandInput>): void {
    const T = this.live;
    const since = this.t - this.goAt;

    /**
     * LIVE UPDATE (§6 Pro/GOAT). The command changes WHILE the athlete is
     * executing. Everything already played stands; everything remaining is
     * rewritten in place. This is the mechanic the entire drill is built around,
     * and it is why the plan is a separate data structure from the cues — we can
     * re-resolve the tail without touching the head.
     */
    if (T.liveUpdateRate > 0 && this.liveUpdateAt < this.goAt && since > 240 && this.rng() < T.liveUpdateRate * 0.004) {
      const done = Math.max(this.cursor.L, this.cursor.R);
      const upd: CentralCommand = this.rng() < 0.5 ? "reverse"
        : this.rng() < 0.5 ? "mirror" : "skip";
      this.commands = [...this.commands, upd];
      const head = this.plan.slice(0, done);
      const tailCues = this.cues.filter((c) => this.plan.slice(done).some((s) => s.cueId === c.id));
      const re = resolvePlan(tailCues, [upd], T, this.rng);
      this.plan = [...head, ...re.steps.map((s, i) => ({ ...s, slot: done + i }))];
      this.transformed = true;
      this.liveUpdateAt = this.t;
      this.commandShownAt = this.t; // the decision clock restarts on an update
    }

    for (const h of ["left", "right"] as Hand[]) {
      const stream: "L" | "R" = T.dualStream ? (h === "left" ? "L" : "R") : "L";

      // movement initiation — the PRIMARY reaction metric baseline (§35)
      const speed = Math.hypot(...hands[h].vel);
      if (this.moveInitAt === undefined && speed > 0.35) this.moveInitAt = this.t;

      const hit = this.contactedTarget(hands[h], h);
      const wasInside = this.handInside[h];
      this.handInside[h] = !!hit;
      if (!hit || wasInside) continue;   // RISING EDGE ONLY — enter, leave, re-enter

      /**
       * The cursor is PER STREAM, so it must index the STREAM's steps — not the
       * global plan array. Indexing the flat plan with a per-stream cursor meant
       * the left hand was being judged against the right hand's next step, which
       * is why dual-stream tiers were reporting ~14% accuracy for an athlete who
       * was in fact playing them correctly.
       */
      const streamSteps = this.plan.filter((s) => s.stream === stream);
      const expected = streamSteps[this.cursor[stream]];
      if (!expected) {
        this.record(hit, "extra", h, hit.action, hit.band);
        continue;
      }

      // The hand landed on a pad that belongs to a LATER step — it went for what
      // it could see instead of what was next. That is inhibition, not timing.
      if (hit.slot > expected.slot) {
        this.record(expected, "prematurePending", h, hit.action, hit.band);
        this.cursor[stream]++;
        continue;
      }
      // CROSS-STREAM contamination — this hand played the other stream's step
      if (T.dualStream && stream !== expected.stream) {
        this.record(expected, "crossStream", h, hit.action, hit.band);
        this.cursor[expected.stream]++;
        continue;
      }
      // WRONG HAND is critical. It is not a slip — it is a failure of the rule.
      if (h !== expected.hand) {
        this.record(expected, "wrongHand", h, hit.action, hit.band);
        this.cursor[stream]++;
        continue;
      }
      const actualAction: SeqAction = hands[h].gripping ? "catch" : "strike";
      if (expected.action === "inhibit") {
        this.record(expected, "forbidden", h, actualAction, hit.band);
        this.cursor[stream]++;
        continue;
      }
      const needsGrip = expected.action === "catch" || expected.action === "hold";
      if (needsGrip && !hands[h].gripping) {
        this.record(expected, "wrongAction", h, actualAction, hit.band);
        this.cursor[stream]++;
        continue;
      }
      if (hit.band !== expected.band) {
        this.record(expected, "spatialMiss", h, actualAction, hit.band);
        this.cursor[stream]++;
        continue;
      }
      // TIMING — signed error against the required beat. Self-paced tiers skip it.
      const err = T.tempoMs > 0 ? since - expected.dueMs : 0;
      if (T.tempoMs > 0 && Math.abs(err) > T.timingWindowMs) {
        this.record(expected, "timing", h, actualAction, expected.band, err);
        this.cursor[stream]++;
        continue;
      }
      this.record(expected, "correct", h, actualAction, expected.band, err);
      this.cursor[stream]++;
    }

    /**
     * THE CURSOR MUST ADVANCE ON TIME, NOT ONLY ON CONTACT.
     *
     * An "inhibit" step is resolved by NOT touching it — that is the entire
     * point of it. But the cursor previously only moved when a hand made
     * contact, so the instant an inhibit step came up the stream STALLED: it sat
     * there waiting for a touch that must never come, every subsequent action
     * was judged late against a beat it had already missed, and correctly
     * withholding was scored as a SKIP. One bug, cascading into a 57% timing
     * error rate that looked like the athlete simply could not keep up.
     *
     * So when a step's window closes untouched, it resolves on its own:
     * withholding on an inhibit is CORRECT, and anything else is a skip.
     */
    for (const st of ["L", "R"] as const) {
      const streamSteps = this.plan.filter((s) => s.stream === st);
      const exp = streamSteps[this.cursor[st]];
      if (!exp || exp.done) continue;
      const window = T.tempoMs > 0 ? exp.dueMs + T.timingWindowMs : 4000;
      if (since <= window) continue;
      this.record(exp, exp.action === "inhibit" ? "correct" : "skipped", undefined, undefined, undefined);
      this.cursor[st]++;
    }

    // ---- did the plan finish, or did the clock run out on it?
    const total = this.plan.length;
    const doneCount = this.plan.filter((s) => s.done).length;
    const lastDue = this.plan.reduce((m, s) => Math.max(m, s.dueMs), 0);
    const deadline = T.tempoMs > 0 ? lastDue + T.timingWindowMs + 500 : 6000;

    if (doneCount >= total || since > deadline) {
      // anything never touched is a SKIP — the athlete dropped it from the plan
      for (const s of this.plan) {
        if (!s.done) this.record(s, "skipped", undefined, undefined, undefined);
      }
      this.endSequence();
    }
  }

  /**
   * Which execution target's volume is this hand inside right now. Returns the
   * EARLIEST unresolved step at that position — so re-striking a shared pad
   * always resolves the next thing owed on it, never a step three slots ahead.
   */
  private contactedTarget(hi: HandInput, h: Hand): PlanStep | null {
    const since = this.t - this.goAt;
    let best: PlanStep | null = null;
    for (const s of this.plan) {
      if (s.done) continue;
      if (s.hand !== h) continue;
      if (this.phase === "execute" && since < s.visibleFromMs) continue;
      const p = this.targetPos(s);
      const d = Math.hypot(hi.pos[0] - p[0], hi.pos[1] - p[1], hi.pos[2] - p[2]);
      if (d < 0.13 && (!best || s.slot < best.slot)) best = s;
    }
    return best;
  }

  /** Where an execution target sits. Left/right zones, three vertical bands. */
  targetPos(s: PlanStep): [number, number, number] {
    const x = s.hand === "left" ? -0.42 : 0.42;
    const y = s.band === "high" ? 1.72 : s.band === "low" ? 1.08 : 1.40;
    // MOVING targets approach the athlete over the course of their slot (§15)
    let z = -0.52;
    if (s.moving && this.phase === "execute") {
      const since = this.t - this.goAt;
      const p = Math.max(0, Math.min(1, since / Math.max(1, s.dueMs || 800)));
      z = -2.2 + p * 1.68;
    }
    return [x, y, z];
  }

  // ------------------------------------------------------------------ scoring
  private record(
    step: PlanStep, outcome: SeqOutcome, hand?: SeqHand,
    action?: SeqAction, band?: SeqBand, timingErr?: number,
  ): void {
    step.done = true;
    step.outcome = outcome;
    const correct = outcome === "correct";
    const critical = CRITICAL.includes(outcome);
    if (!correct) this.seqErrors++;
    if (critical) this.seqCritical = true;

    const stream = step.stream;
    const decisionToMove = this.moveInitAt !== undefined
      ? Math.max(0, this.moveInitAt - this.commandShownAt) : undefined;
    const execMs = this.phase === "execute" ? this.t - this.goAt : undefined;
    const iai = this.t - this.lastActionAt[stream];
    this.lastActionAt[stream] = this.t;

    /**
     * HAND LOCALIZATION. Recorded on every pad contact, normalized by the pad's
     * own contact radius. Sequence Command has FIXED pads, which makes it the
     * cleanest localization measure in the suite: the target never moves, so any
     * offset is entirely the athlete's internal model of where their hand is —
     * there is no interception error mixed in to confound it.
     */
    const PAD_R = 0.13;
    let precisionM: number | undefined;
    let precisionZone: import("@/ares/precision").PrecisionZone | undefined;
    let offX: number | undefined, offY: number | undefined, offZ: number | undefined;
    if (this.contactPos && hand) {
      const c = this.targetPos(step);
      offX = this.contactPos[0] - c[0];
      offY = this.contactPos[1] - c[1];
      offZ = this.contactPos[2] - c[2];
      precisionM = Math.hypot(offX, offY, offZ);
      precisionZone = classifyPrecision(precisionM, PAD_R);
    }
    this.contactPos = null;

    const breakdown = this.attribute(outcome);
    if (breakdown) this.breakdowns[breakdown]++;

    const delta = this.scoreFor(outcome, timingErr, step, precisionZone);
    this.score += delta;
    if (this.sessionPhase === "bonus") this.bonusScore += delta; else this.mainScore += delta;

    const cue = this.cues.find((c) => c.id === step.cueId);
    this.events.push({
      t: this.t, sequenceId: `s${this.seqId}`, slot: step.slot, phase: this.phase,
      cueId: step.cueId, cueZone: cue?.zone ?? "upLeft",
      command: this.commands[this.commands.length - 1] ?? "execute",
      transformed: this.transformed,
      expectedHand: step.hand, expectedAction: step.action, expectedBand: step.band,
      actualHand: hand, actualAction: action, actualBand: band,
      outcome, correct, critical, breakdown,
      decisionToMoveMs: decisionToMove,
      encodingMs: this.live.cueDisplayMs,
      execMs, iaiMs: iai > 0 && iai < 8000 ? iai : undefined,
      timingErrorMs: timingErr,
      precisionM, radiusM: 0.13, offX, offY, offZ, precisionZone,
      stream,
      scoreDelta: delta,
      bonusStage: this.sessionPhase === "bonus" ? this.bonusStage : undefined,
    });

    // A critical error ENDS the active sequence immediately (§28).
    if (critical) this.endSequence();
  }

  /**
   * BREAKDOWN ATTRIBUTION (§30). Two athletes can both sit at 70% and be broken
   * in completely different places. This maps every error class to the stage of
   * the A.R.E.S. Loop where it actually originated, so the bonus round can press
   * exactly there and the coach knows what to work on.
   */
  private attribute(o: SeqOutcome): BreakdownSource | undefined {
    switch (o) {
      case "correct": return undefined;
      case "wrongHand": return "handSelection";
      case "forbidden":
      case "distractorHit":
      case "prematurePending": return "inhibition";
      case "badTransform": return "transformation";
      case "wrongBranch": return "branch";
      case "timing":
      case "movingMiss": return "timing";
      case "spatialMiss": return "spatial";
      case "crossStream": return "dualStream";
      case "outOfOrder": return this.transformed ? "transformation" : "memory";
      case "skipped": return this.delayMs > 1200 ? "memory" : "encoding";
      case "extra": return "inhibition";
      case "wrongAction": return "decision";
      default: return "motor";
    }
  }

  /**
   * SCORING (§36). Sequence-level, not action-level — because the unit of skill
   * here is a COMPLETED PLAN, not a lucky hit. A partially-correct sequence earns
   * partial credit; a perfect one earns a completion bonus that a partial one can
   * never reach by volume. And every speed term is gated by a correctness term,
   * so reckless speed cannot outscore order and rule control (§36).
   */
  private scoreFor(
    o: SeqOutcome, timingErr: number | undefined, step: PlanStep,
    zone?: import("@/ares/precision").PrecisionZone,
  ): number {
    switch (o) {
      case "wrongHand": return -140;
      case "forbidden": return -160;
      case "distractorHit": return -130;
      case "badTransform": return -150;
      case "wrongBranch": return -120;
      case "prematurePending": return -70;   // inhibition failure, priced as one
      case "crossStream": return -60;
      case "outOfOrder": return -50;
      case "skipped": return -40;
      case "extra": return -40;
      case "wrongAction": return -45;
      case "spatialMiss": return -35;
      case "movingMiss": return -30;
      case "timing": return -25;
      default: break;
    }
    // ---- correct
    let s = 100;
    if (timingErr !== undefined && this.live.tempoMs > 0) {
      const q = Math.max(0, 1 - Math.abs(timingErr) / this.live.timingWindowMs);
      s += 45 * q; // timing PRECISION, not timing speed
    }
    // SPATIAL LOCALIZATION — stepped, so finding the centre is worth chasing
    if (zone) s += zone === "perfect" ? 45 : zone === "good" ? 18 : 3;
    if (this.transformed) s += 30;        // a transformed plan is worth more
    if (step.inferred) s += 25;           // an inferred element even more
    if (step.moving) s += 15;
    if (this.live.dualStream) s += 12;
    s *= 1 + Math.min(0.5, this.streak * 0.03);
    if (this.inRecovery) s *= 1.2;
    if (this.sessionPhase === "bonus") s *= 1 + this.bonusStage * 0.1;
    return Math.round(s);
  }

  /** A withheld no-go is a correct answer and is scored as one. */
  private resolveNoGo(): void {
    this.sequences++;
    this.perfect++;
    this.streak++;
    if (this.streak > this.longestStreak) this.longestStreak = this.streak;
    this.score += 90;
    if (this.sessionPhase === "bonus") this.bonusScore += 90; else this.mainScore += 90;
    this.events.push({
      t: this.t, sequenceId: `s${this.seqId}`, slot: -1, phase: "command",
      cueId: "-", cueZone: "upLeft", command: this.commands[0], transformed: false,
      expectedHand: "left", expectedAction: "inhibit", expectedBand: "mid",
      outcome: "correct", correct: true, critical: false,
      stream: "L", scoreDelta: 90,
      bonusStage: this.sessionPhase === "bonus" ? this.bonusStage : undefined,
    });
    this.onSequenceEnd(true, false);
    this.phase = "result";
    this.phaseStart = this.t;
  }

  private endSequence(): void {
    this.sequences++;
    const clean = this.seqErrors === 0;
    if (clean) this.perfect++;
    this.onSequenceEnd(clean, this.seqCritical);
    this.phase = "result";
    this.phaseStart = this.t;
  }

  private onSequenceEnd(clean: boolean, critical: boolean): void {
    if (clean) {
      this.streak++;
      if (this.streak > this.longestStreak) this.longestStreak = this.streak;
      if (this.inRecovery) {
        this.recoveryStreak++;
        // §29: a clean mini-streak restores full difficulty — gradually
        if (this.recoveryStreak >= 2) {
          this.inRecovery = false;
          this.recoveryTimes.push(this.t - this.recoveryStartT);
          this.restore();
        }
      } else {
        this.raise();
      }
      // §4: a fully correct sequence removes one accumulated bonus strike
      if (this.sessionPhase === "bonus" && this.bonusStrikes > 0) this.bonusStrikes--;
    } else {
      this.streak = 0;
      this.recoveryStreak = 0;
      if (critical) this.enterRecovery();
      else this.lower();
    }

    // ---- BONUS FAILURE RULES (§4)
    if (this.sessionPhase === "bonus") {
      if (critical) {
        this.finish("critical error");
        return;
      }
      if (!clean) {
        this.bonusStrikes++;
        if (this.bonusStrikes >= BONUS_STRIKES) { this.finish("three strikes"); return; }
      }
    }
  }

  // ----------------------------------------------------------------- recovery
  private enterRecovery(): void {
    if (this.settings.mode === "assessment") return; // assessment NEVER adapts
    this.inRecovery = true;
    this.recoveryStreak = 0;
    this.recoveryAttempts++;
    this.recoveryStartT = this.t;
    // §29: difficulty temporarily reduces, and the athlete gets a short sequence
    this.live = {
      ...this.live,
      seqLenMin: Math.max(2, this.tune.seqLenMin - 1),
      seqLenMax: Math.max(3, this.tune.seqLenMax - 2),
      cueDisplayMs: this.tune.cueDisplayMs * 1.4,
      interference: this.tune.interference * 0.3,
      liveUpdateRate: 0,
      transformRate: this.tune.transformRate * 0.4,
      tempoMs: this.tune.tempoMs > 0 ? this.tune.tempoMs * 1.3 : 0,
    };
  }
  private restore(): void { this.live = { ...this.tune }; this.applyComplexity(); }

  /**
   * ADAPTIVE DIFFICULTY (§30). Raise exactly ONE variable at a time. If the
   * athlete then fails, lower THAT variable — not the whole profile. A system
   * that resets everything on an error teaches the athlete nothing about what
   * broke, and destroys the diagnostic value of the breakdown data.
   */
  private raise(): void {
    if (this.settings.mode === "assessment") return;
    if (this.streak === 0 || this.streak % 3 !== 0) return;
    const knobs: (keyof SeqTuning)[] = [
      "cueDisplayMs", "seqLenMax", "delayMaxMs", "interference",
      "distractorRate", "tempoMs", "transformRate", "liveUpdateRate", "salientConflict",
    ];
    const k = knobs[Math.floor(this.rng() * knobs.length)];
    this.lastRaised = k;
    const L = this.live as unknown as Record<string, number>;
    switch (k) {
      case "cueDisplayMs": L[k] = Math.max(220, L[k] * 0.93); break;  // less time to encode
      case "tempoMs": if (L[k] > 0) L[k] = Math.max(300, L[k] * 0.94); break;
      case "seqLenMax": L[k] = Math.min(this.tune.seqLenMax + 3, L[k] + 1); break;
      case "delayMaxMs": L[k] = Math.min(4200, L[k] + 260); break;
      default: L[k] = Math.min(0.95, L[k] + 0.06); break;
    }
    this.complexity = Math.min(3, this.complexity + 0.06);
  }
  private lower(): void {
    if (this.settings.mode === "assessment") return;
    // back off ONLY the knob we most recently turned up
    const k = this.lastRaised;
    if (!k) return;
    const L = this.live as unknown as Record<string, number>;
    const B = this.tune as unknown as Record<string, number>;
    switch (k) {
      case "cueDisplayMs": L[k] = Math.min(B[k] * 1.3, L[k] * 1.09); break;
      case "tempoMs": if (L[k] > 0) L[k] = Math.min(B[k] * 1.3, L[k] * 1.07); break;
      case "seqLenMax": L[k] = Math.max(this.tune.seqLenMin, L[k] - 1); break;
      case "delayMaxMs": L[k] = Math.max(B[k] * 0.6, L[k] - 200); break;
      default: L[k] = Math.max(0, L[k] - 0.05); break;
    }
    this.complexity = Math.max(0.6, this.complexity - 0.05);
  }
  private applyComplexity(): void { /* live already carries the raised knobs */ }

  // -------------------------------------------------------------------- bonus
  private enterBonus(): void {
    this.sessionPhase = "bonus";
    this.bonusStage = 1;
    this.bonusStartT = this.t;
    this.bonusStageT = this.t;
    this.bonusStrikes = 0;
    this.inRecovery = false;
    this.live = { ...this.tune };
  }

  /** The weakest link, from live data — the bonus round presses HERE (§31). */
  weakestDomain(): BreakdownSource | undefined {
    let worst: BreakdownSource | undefined;
    let n = 0;
    for (const [k, v] of Object.entries(this.breakdowns) as [BreakdownSource, number][]) {
      if (v > n) { n = v; worst = k; }
    }
    return n >= 2 ? worst : undefined;
  }

  /**
   * BONUS ESCALATION (§31). Multiplicative and uncapped, so the round is
   * GUARANTEED to terminate in the athlete's own failure — and the stage it
   * terminates at IS the measurement. After enough data, it stops escalating
   * generically and starts pressing the athlete's weakest domain specifically.
   */
  private escalate(): void {
    if (this.t - this.bonusStageT < BONUS_STAGE_MS) return;
    this.bonusStage++;
    this.bonusStageT = this.t;
    if (this.bonusStage >= MAX_BONUS_STAGE) { this.finish("maximum escalation reached"); return; }

    const L = this.live;
    L.cueDisplayMs = Math.max(180, L.cueDisplayMs * 0.9);
    if (L.tempoMs > 0) L.tempoMs = Math.max(260, L.tempoMs * 0.93);
    L.timingWindowMs = Math.max(120, L.timingWindowMs * 0.94);

    const weak = this.weakestDomain();
    switch (weak) {
      case "inhibition":
        L.distractorRate = Math.min(0.5, L.distractorRate + 0.08);
        L.salientConflict = Math.min(0.7, L.salientConflict + 0.08);
        break;
      case "memory":
        // press interference, NOT merely length — length only measures span
        L.interference = Math.min(1, L.interference + 0.1);
        L.delayMaxMs = Math.min(4500, L.delayMaxMs + 350);
        break;
      case "transformation":
        L.transformRate = Math.min(0.95, L.transformRate + 0.08);
        L.transformDepth = 2;
        break;
      case "handSelection":
        L.crossBodyRate = Math.min(0.8, L.crossBodyRate + 0.1);
        break;
      case "timing":
        L.asyncStreams = true;
        L.timingWindowMs = Math.max(110, L.timingWindowMs * 0.88);
        break;
      case "dualStream":
        L.dualStream = true;
        L.asyncStreams = true;
        break;
      case "spatial":
        L.bands = ["high", "mid", "low"];
        break;
      case "branch":
        L.branchRate = Math.min(0.8, L.branchRate + 0.1);
        break;
      case "encoding":
        L.cueDisplayMs = Math.max(160, L.cueDisplayMs * 0.85);
        break;
      default:
        L.seqLenMax = Math.min(12, L.seqLenMax + 1);
        L.liveUpdateRate = Math.min(0.8, L.liveUpdateRate + 0.08);
        break;
    }
    this.complexity += 0.15;
  }

  // ---------------------------------------------------------------- lifecycle
  private finish(cause: string): void {
    this.failCause = cause;
    this.sessionPhase = "complete";
    this.finished = true;
  }
  stop(): void { this.finish("stopped by trainer"); }
  isFinished(): boolean { return this.finished; }
  bonusDurationMs(): number { return this.bonusStartT ? Math.max(0, this.t - this.bonusStartT) : 0; }

  snapshot(): SeqSnapshot {
    const el = this.t - this.phaseStart;
    const liveCues = this.phase === "encode"
      ? this.cues.filter((c) => el >= c.atMs && el < c.atMs + this.live.cueDisplayMs)
      : [];
    const since = this.t - this.goAt;
    return {
      sessionPhase: this.sessionPhase, phase: this.phase, tMs: this.t,
      mainRemainingMs: Math.max(0, this.tune.durationMs - this.t),
      liveCues,
      visibleCommand:
        this.phase === "command" || (this.live.commandPersists && this.phase === "execute")
          ? this.commands : this.t - this.liveUpdateAt < 900 ? this.commands.slice(-1) : null,
      preview: this.phase === "preview" ? this.plan : null,
      targets: this.phase === "execute"
        ? this.plan.filter((s) => !s.done && since >= s.visibleFromMs) : [],
      cursor: { ...this.cursor },
      liveUpdateMs: Math.max(0, 900 - (this.t - this.liveUpdateAt)),
      interference: this.phase === "delay" ? this.live.interference : 0,
      score: this.score, mainScore: this.mainScore, bonusScore: this.bonusScore,
      streak: this.streak, longestStreak: this.longestStreak,
      sequences: this.sequences, perfect: this.perfect,
      bonusStage: this.bonusStage, bonusStrikes: this.bonusStrikes,
      inRecovery: this.inRecovery, recoveryStreak: this.recoveryStreak,
      complexity: this.complexity,
      failCause: this.failCause,
      events: this.events,
      weakest: this.weakestDomain(),
    };
  }
}
