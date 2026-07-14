import { makeRng } from "@/utils/rng";
import { classifyPrecision } from "@/ares/precision";
import {
  type MovementPhase, type KeyEvent, type KeySettings, type KeyTuning,
  type StimulusKind, type KeyOutcome, type BreakdownDomain, type SessionPhase,
  type Segment, type BodyRole,
  CRITICAL_OUTCOMES, INHIBIT_STIMULI,
} from "./types";
import { tuningFor } from "./tiers";
import { buildPhase, NEUTRAL, SAFE, idealPath, type V3 } from "./patterns";

/**
 * THE KEYSTONE ENGINE.
 *
 * One EVENT is a multi-phase movement pattern (§17): prepare -> expand -> hold ->
 * redirect -> stabilize. Each phase has its own endpoint, its own role assignment
 * for all four segments, and its own clock. At the top tiers the pattern can be
 * REWRITTEN while the athlete is inside it.
 *
 * Two measurement problems dominate this file, and both are subtle:
 *
 * 1. MOVEMENT ONSET. The primary metric is "cue -> first valid COORDINATED
 *    movement onset" (§31), explicitly not "first controller motion". A hand
 *    twitch is not an initiation. If we counted it we would be rewarding
 *    fidgeting and, worse, an athlete could game the reaction-time metric by
 *    simply never being still. So onset requires sustained velocity IN THE
 *    CORRECT DIRECTION for the segments the rule actually told to move.
 *
 * 2. STABILIZATION. Arriving is easy. STOPPING is the skill. So the hold is
 *    scored on RMS drift after arrival, and the endpoint is not "correct" until
 *    it has been held still for the required duration.
 */

const STEP_MS = 8;
const BONUS_STAGE_MS = 15_000;
const MAX_BONUS_STAGE = 30;
const BONUS_STRIKES = 3;

/** Sustained speed that counts as a real movement onset, m/s. */
const ONSET_SPEED = 0.28;
/** ...and it must be sustained this long, so a twitch never qualifies. */
const ONSET_HOLD_MS = 48;

export interface Tracked {
  pos: V3;
  vel: V3;
  /** headset forward yaw/pitch, radians */
  yaw?: number;
  pitch?: number;
}
export type Body = { head: Tracked; left: Tracked; right: Tracked };

export interface KeySnapshot {
  sessionPhase: SessionPhase;
  tMs: number;
  mainRemainingMs: number;
  /** the event currently being presented/executed */
  phases: MovementPhase[];
  phaseIdx: number;
  /** where the event is in its own lifecycle */
  stage: "cue" | "prepare" | "go" | "hold" | "result";
  goInMs: number;
  /** the visual rhythm phase, 0..1 — drives the pulsing geometry */
  rhythm: number;
  /** a false preparation cue is live: this must NOT be acted on */
  falsePulse: boolean;
  /** a live rule change just landed */
  ruleChangeMs: number;

  score: number; mainScore: number; bonusScore: number;
  streak: number; longestStreak: number;
  events: number; perfect: number;
  bonusStage: number; bonusStrikes: number;
  inRecovery: boolean; recoveryStreak: number;
  complexity: number;
  /** live stabilization readout during a hold — the athlete can SEE their drift */
  liveDriftM: number;
  holdProgress: number;
  failCause?: string;
  weakest?: BreakdownDomain;
  log: KeyEvent[];
}

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const speed = (v: V3) => Math.hypot(v[0], v[1], v[2]);

export class KeystoneEngine {
  readonly settings: KeySettings;
  readonly tune: KeyTuning;
  private rng: () => number;
  private live: KeyTuning;

  private t = 0;
  private acc = 0;
  private lastReal = 0;
  private finished = false;
  paused = false;
  setPaused(p: boolean): void { this.paused = p; }

  sessionPhase: SessionPhase = "main";
  private stage: KeySnapshot["stage"] = "cue";
  private stageStart = 0;

  // ---- the event in flight
  private eventId = 0;
  private phases: MovementPhase[] = [];
  private phaseIdx = 0;
  private cueAt = 0;
  private goAt = 0;
  private falsePulse = false;
  private ruleChangeAt = -9999;
  private predictive = true;

  // ---- per-phase measurement state
  private onsetAt: Record<"left" | "right", number | undefined> = { left: undefined, right: undefined };
  private onsetCandidate: Record<"left" | "right", number | undefined> = { left: undefined, right: undefined };
  private arrivedAt: Record<"left" | "right", number | undefined> = { left: undefined, right: undefined };
  private holdStart?: number;
  private driftSamples: number[] = [];
  private pathM: Record<"left" | "right", number> = { left: 0, right: 0 };
  private headTravel = 0;
  private lastPos: Record<"left" | "right" | "head", V3 | null> = { left: null, right: null, head: null };
  private startPos = { left: NEUTRAL.left, right: NEUTRAL.right };
  private maxOvershoot = 0;
  private corrections = 0;
  private lastApproaching: Record<"left" | "right", boolean> = { left: true, right: true };
  private phaseErrors = 0;
  private eventCritical = false;
  private resolvedThisPhase = false;

  log: KeyEvent[] = [];
  score = 0; mainScore = 0; bonusScore = 0;
  streak = 0; longestStreak = 0;
  events = 0; perfect = 0;

  inRecovery = false;
  recoveryStreak = 0;
  recoveryAttempts = 0;
  private recoveryStartT = 0;
  recoveryTimes: number[] = [];

  bonusStage = 0;
  bonusStrikes = 0;
  private bonusStartT = 0;
  private bonusStageT = 0;
  failCause?: string;

  complexity = 1;
  private lastRaised: keyof KeyTuning | null = null;

  breakdowns: Record<BreakdownDomain, number> = {
    interpretation: 0, selection: 0, initiation: 0, bilateral: 0, headHand: 0,
    torsoArm: 0, direction: 0, endpoint: 0, stabilization: 0, inhibition: 0,
    transition: 0, adaptation: 0, efficiency: 0,
  };

  private listeners: ((s: KeySnapshot) => void)[] = [];

  constructor(settings: KeySettings, seed = 1) {
    this.settings = settings;
    this.tune = tuningFor(settings.tier, settings.mode, settings.custom);
    this.live = { ...this.tune };
    this.rng = makeRng(seed);
  }

  subscribe(fn: (s: KeySnapshot) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
  }
  start(now: number): void { this.lastReal = now; this.beginEvent(); }

  tick(now: number, body: Body): void {
    if (this.finished) return;
    if (this.paused) { this.lastReal = now; this.emit(); return; }
    this.acc += Math.min(100, now - this.lastReal);
    this.lastReal = now;
    while (this.acc >= STEP_MS) { this.acc -= STEP_MS; this.step(body); }
    this.emit();
  }
  private emit(): void {
    const s = this.snapshot();
    for (const f of this.listeners) f(s);
  }

  // ------------------------------------------------------------- event setup
  private beginEvent(): void {
    const T = this.live;
    this.eventId++;
    const n = this.inRecovery
      ? 1
      : T.phasesMin + Math.floor(this.rng() * (T.phasesMax - T.phasesMin + 1));

    const pool: StimulusKind[] = this.inRecovery ? ["recovery"] : this.stimulusPool();
    this.phases = [];
    /**
     * Every phase needs a TRAVEL ALLOWANCE. The first phase used to be given
     * dueMs = 0, which asked the athlete to already be at the endpoint at the
     * instant of GO — physically impossible, so every single first phase was
     * scored as a timing error and temporal precision collapsed to 1/100.
     * The beat has to allow for the fact that arms take time to move.
     */
    const travelMs = 520 / Math.max(0.4, T.stimulusSpeed);
    let due = travelMs;
    for (let i = 0; i < n; i++) {
      const kind = pool[Math.floor(this.rng() * pool.length)];
      const p = buildPhase(kind, T, this.rng, due);
      this.phases.push(p);
      due += travelMs + p.endpoint.holdMs;
    }
    this.phaseIdx = 0;

    /**
     * PREDICTIVE vs REACTIVE (§15). The athlete must NOT be able to tell which is
     * coming. A predictable event lets them prepare and be scored on anticipatory
     * timing; a reactive one changes at the last instant and is scored on
     * adjustment latency. Mixing them unpredictably is what stops the athlete from
     * settling into a single timing strategy — which is the whole point.
     */
    this.predictive = this.rng() < T.predictiveMix;

    /**
     * FALSE PULSE (§16). A preparation cue that looks exactly like a real one and
     * must NOT be acted on. This is what makes inhibition here genuinely hard:
     * the athlete has already loaded the movement.
     */
    this.falsePulse = this.rng() < T.falsePulseRate;

    this.cueAt = this.t;
    this.stage = "cue";
    this.stageStart = this.t;
    this.eventCritical = false;
    this.resetPhaseState();
  }

  private stimulusPool(): StimulusKind[] {
    const T = this.live;
    const pool: StimulusKind[] = ["align", "expand", "compress", "pulse", "hold"];
    if (T.asymmetry > 0.2) pool.push("split", "sync");
    if (T.headInvolve > 0.3) pool.push("rotate");
    if (T.headHandConflict > 0.1) pool.push("counter");
    if (T.forceRate > 0) pool.push("absorb", "redirect");
    if (T.holdMs > 600) pool.push("stabilize", "release");
    if (T.transitionRate > 0.1) pool.push("transition");
    if (T.transformRate > 0.2) pool.push("reverse", "mirror");
    if (T.desyncRate > 0.1) pool.push("desync");
    if (T.inhibitRate > 0) { pool.push("noGo"); if (T.falsePulseRate > 0) pool.push("cancel"); }
    return pool;
  }

  private resetPhaseState(): void {
    this.onsetAt = { left: undefined, right: undefined };
    this.onsetCandidate = { left: undefined, right: undefined };
    this.arrivedAt = { left: undefined, right: undefined };
    this.holdStart = undefined;
    this.driftSamples = [];
    this.pathM = { left: 0, right: 0 };
    this.headTravel = 0;
    this.lastPos = { left: null, right: null, head: null };
    this.maxOvershoot = 0;
    this.corrections = 0;
    this.lastApproaching = { left: true, right: true };
    this.phaseErrors = 0;
    this.resolvedThisPhase = false;
  }

  // -------------------------------------------------------------------- step
  private step(body: Body): void {
    this.t += STEP_MS;
    const T = this.live;
    const el = this.t - this.stageStart;

    this.trackPaths(body);

    // ---- SAFETY: a live check, every frame, regardless of stage. If an athlete
    // drives a controller toward their own head we stop the event immediately.
    if (this.unsafe(body)) {
      this.record("unsafeRange", body);
      this.endEvent();
      return;
    }

    switch (this.stage) {
      case "cue": {
        // The stimulus is up. The athlete reads it. Moving now is a FALSE START —
        // they have not been told to go.
        this.watchLeakage(body, "falseStart");
        const cueMs = 420 / Math.max(0.4, T.stimulusSpeed);
        if (el >= cueMs) { this.stage = "prepare"; this.stageStart = this.t; }
        break;
      }
      case "prepare": {
        this.watchLeakage(body, "falseStart");
        const prep = this.predictive ? T.prepMs : T.prepMs * (0.5 + this.rng() * 0.2);
        if (el >= prep) {
          if (this.falsePulse) {
            /**
             * The false pulse resolves HERE. The athlete was shown a full
             * preparation cue and then simply never given a GO. Withholding is
             * the correct answer, and it is scored as one.
             */
            this.record(this.leaked ? "prohibited" : "correct", body);
            this.endEvent();
            return;
          }
          this.stage = "go";
          this.stageStart = this.t;
          this.goAt = this.t;
          this.startPos = { left: [...body.left.pos] as V3, right: [...body.right.pos] as V3 };
        }
        break;
      }
      case "go": this.executePhase(body); break;
      case "hold": this.executeHold(body); break;
      case "result":
        if (el >= 320) this.beginEvent();
        break;
    }

    if (this.sessionPhase === "main" && this.t >= this.tune.durationMs) {
      if (this.settings.bonusEnabled && this.settings.mode === "training") this.enterBonus();
      else this.finish("session complete");
    }
    if (this.sessionPhase === "bonus") this.escalate();
  }

  private leaked = false;

  /**
   * WHERE IS THIS SEGMENT SUPPOSED TO BE?
   *
   * "hold" and "stabilize" are OPPOSITES, and conflating them broke the drill:
   *
   *   hold       TRAVEL to the endpoint, then stay there. It has somewhere to go.
   *   stabilize  DO NOT MOVE. Its target is exactly where it already is — it is
   *              being asked to resist, not to arrive.
   *   inhibit    the same, but any motion at all is a critical error.
   *
   * The first version auto-arrived BOTH at their anchor and then measured drift
   * against an endpoint the segment had been explicitly told never to visit — so a
   * correctly-executed hold was scored as having abandoned its position. This
   * single function is now the only place that decides where a segment belongs.
   */
  private targetFor(h: "left" | "right", ph: MovementPhase): V3 {
    const role = ph.roles[h as Segment];
    return role === "stabilize" || role === "inhibit" || role === "neutral"
      ? this.startPos[h]
      : ph.endpoint[h];
  }

  /** Any real movement before GO is leakage. Tracked, not always punished. */
  private watchLeakage(body: Body, as: KeyOutcome): void {
    const s = Math.max(speed(body.left.vel), speed(body.right.vel));
    if (s > ONSET_SPEED * 1.6) {
      this.leaked = true;
      const p = this.phases[this.phaseIdx];
      if (p && INHIBIT_STIMULI.includes(p.kind)) {
        // moving during a no-go is critical, immediately
        this.record("prohibited", body);
        this.endEvent();
        return;
      }
      /**
       * Below Pro, a twitch before the go is recorded but forgiven — a novice
       * leaking a little is learning, not failing, and punishing it teaches them
       * to be tentative, which is worse. At Pro and GOAT it is a false start.
       */
      if (this.live.falsePulseRate > 0.1 && !this.resolvedThisPhase) {
        this.record(as, body);
        this.resolvedThisPhase = true;
      }
    }
  }

  /**
   * SAFETY, LIVE. Not a pattern check — an ATHLETE check. The generator can only
   * guarantee that what it ASKED for is safe. It cannot stop someone swinging a
   * controller at their own face, and this drill involves more whole-body motion
   * than anything else in the suite.
   */
  private unsafe(body: Body): boolean {
    if (dist(body.left.pos, body.head.pos) < 0.13) return true;
    if (dist(body.right.pos, body.head.pos) < 0.13) return true;
    if (dist(body.left.pos, body.right.pos) < 0.09) return true;  // knuckles
    return false;
  }

  private trackPaths(body: Body): void {
    for (const h of ["left", "right"] as const) {
      const p = body[h].pos;
      const prev = this.lastPos[h];
      /**
       * Only accumulate path while the athlete is TRAVELLING. Counting the hold
       * meant an athlete's tremor kept adding distance while they stood still, so
       * a long hold on a short reach produced a path ratio of 5x for a perfectly
       * efficient movement. Economy measures the journey, not the standing.
       */
      if (prev && this.stage === "go") this.pathM[h] += dist(p, prev);
      this.lastPos[h] = [...p] as V3;
    }
    const hp = body.head.pos;
    if (this.lastPos.head) this.headTravel += dist(hp, this.lastPos.head);
    this.lastPos.head = [...hp] as V3;
  }

  /**
   * MOVEMENT ONSET. Sustained speed, in the direction of the endpoint, for a
   * segment the rule actually told to move. A twitch does not qualify. A hand
   * drifting the WRONG way does not qualify. This is the denominator of the
   * primary metric, and getting it wrong would make every reaction time in the
   * drill meaningless.
   */
  private detectOnset(body: Body, ph: MovementPhase): void {
    for (const h of ["left", "right"] as const) {
      if (this.onsetAt[h] !== undefined) continue;
      const role = ph.roles[h as Segment];
      if (role === "stabilize" || role === "inhibit" || role === "neutral") continue;

      const p = body[h].pos;
      const tgt = this.targetFor(h, ph);
      const v = body[h].vel;
      const sp = speed(v);
      if (sp < ONSET_SPEED) { this.onsetCandidate[h] = undefined; continue; }

      // is the velocity actually pointed at the endpoint?
      const to: V3 = [tgt[0] - p[0], tgt[1] - p[1], tgt[2] - p[2]];
      const m = Math.hypot(...to) || 1e-6;
      const dot = (v[0] * to[0] + v[1] * to[1] + v[2] * to[2]) / (m * sp);
      if (dot < 0.35) { this.onsetCandidate[h] = undefined; continue; }

      if (this.onsetCandidate[h] === undefined) this.onsetCandidate[h] = this.t;
      else if (this.t - this.onsetCandidate[h]! >= ONSET_HOLD_MS) {
        this.onsetAt[h] = this.onsetCandidate[h];
      }
    }
  }

  private executePhase(body: Body): void {
    const ph = this.phases[this.phaseIdx];
    if (!ph) { this.endEvent(); return; }
    const since = this.t - this.goAt;

    // an INHIBIT phase is satisfied by doing nothing until the window closes
    if (INHIBIT_STIMULI.includes(ph.kind)) {
      if (speed(body.left.vel) > ONSET_SPEED || speed(body.right.vel) > ONSET_SPEED) {
        this.record("prohibited", body);
        this.endEvent();
        return;
      }
      if (since > ph.endpoint.holdMs + 400) {
        this.record("correct", body);
        this.nextPhase(body);
      }
      return;
    }

    this.detectOnset(body, ph);

    /**
     * ENFORCE THE STILL SEGMENTS.
     *
     * This is the thesis of the entire drill and it was not being checked at all.
     * A segment told to STABILIZE or HOLD must NOT move — "one side works while
     * the other stays still" is the foundational skill from Intermediate upward,
     * and without this check an athlete could simply thrash every limb at every
     * stimulus and be rewarded for it. In testing, a deliberately reckless athlete
     * out-scored a controlled one precisely because of this hole.
     *
     * Moving a segment that was told to hold still is a WRONG PATTERN. It is not a
     * sloppy execution of the right pattern — it is a different pattern.
     */
    for (const h of ["left", "right"] as const) {
      const role = ph.roles[h as Segment];
      if (role !== "stabilize" && role !== "inhibit") continue;
      const anchor = this.startPos[h];
      const drifted = dist(body[h].pos, anchor);
      const allowance = ph.endpoint.tolM + ph.endpoint.stabilityTolM;
      if (drifted > allowance * 2.2 && speed(body[h].vel) > ONSET_SPEED) {
        this.record(role === "inhibit" ? "prohibited" : "wrongPattern", body, since);
        this.endEvent();
        return;
      }
    }

    /**
     * LIVE RULE CHANGE (§14, Pro/GOAT). The remaining phases are rewritten while
     * the athlete is mid-pattern. Everything already completed stands. This is the
     * mechanic the top two tiers are built around, and the reason phases are a
     * separate structure from the event: we can replace the tail without touching
     * the head.
     */
    if (this.live.transformRate > 0.5 && this.ruleChangeAt < this.goAt && since > 260
        && this.rng() < this.live.transformRate * 0.003) {
      const rest = this.phases.slice(this.phaseIdx + 1);
      if (rest.length) {
        const swap: StimulusKind = this.rng() < 0.5 ? "reverse" : "mirror";
        this.phases = [
          ...this.phases.slice(0, this.phaseIdx + 1),
          ...rest.map((p) => buildPhase(swap, this.live, this.rng, p.dueMs)),
        ];
        this.ruleChangeAt = this.t;
      }
    }

    // ---- arrival, per hand
    for (const h of ["left", "right"] as const) {
      if (this.arrivedAt[h] !== undefined) continue;
      const role = ph.roles[h as Segment];
      // A segment told to STAY STILL has nowhere to travel to — it arrives by
      // successfully staying put. A segment told to HOLD must still travel first.
      if (role === "stabilize" || role === "inhibit" || role === "neutral") {
        this.arrivedAt[h] = this.t;
        continue;
      }
      const tgt = this.targetFor(h, ph);
      const d = dist(body[h].pos, tgt);

      // OVERSHOOT + CORRECTIONS: is the hand still closing on the target, or has
      // it sailed past and turned around? Each reversal is a correction, and
      // corrections are the signature of poor deceleration.
      const approaching = d < (this.lastApproaching[h] ? Infinity : d);
      const v = body[h].vel;
      const to: V3 = [tgt[0] - body[h].pos[0], tgt[1] - body[h].pos[1], tgt[2] - body[h].pos[2]];
      const m = Math.hypot(...to) || 1e-6;
      const sp = speed(v);
      const closing = sp > 0.05 ? (v[0] * to[0] + v[1] * to[1] + v[2] * to[2]) / (m * sp) > 0 : true;
      if (this.lastApproaching[h] && !closing && d < ph.endpoint.tolM * 2.5) {
        this.corrections++;
        this.maxOvershoot = Math.max(this.maxOvershoot, d);
      }
      this.lastApproaching[h] = closing;

      if (d <= ph.endpoint.tolM) this.arrivedAt[h] = this.t;
    }

    const bothArrived = this.arrivedAt.left !== undefined && this.arrivedAt.right !== undefined;
    if (bothArrived) {
      this.stage = "hold";
      this.stageStart = this.t;
      this.holdStart = this.t;
      this.driftSamples = [];
      return;
    }

    // ---- the window closed and they never got there
    const deadline = ph.dueMs + ph.timingWindowMs + 900 / Math.max(0.4, this.live.stimulusSpeed);
    if (since > deadline) {
      const anyArrived = this.arrivedAt.left !== undefined || this.arrivedAt.right !== undefined;
      this.record(anyArrived ? "asymmetry" : "endpointMiss", body);
      this.nextPhase(body);
    }
  }

  /**
   * THE HOLD. This is the part of the drill nobody else is measuring, and it is
   * the part that separates athletes. Arriving is easy. STOPPING — and staying
   * stopped, while the visual field keeps moving around you — is the skill.
   */
  private executeHold(body: Body): void {
    const ph = this.phases[this.phaseIdx];
    if (!ph) { this.endEvent(); return; }
    const held = this.t - (this.holdStart ?? this.t);

    // a segment told to hold still must STILL be still, all the way through
    for (const h of ["left", "right"] as const) {
      const role = ph.roles[h as Segment];
      if (role !== "stabilize" && role !== "inhibit") continue;
      if (dist(body[h].pos, this.startPos[h]) > (ph.endpoint.tolM + ph.endpoint.stabilityTolM) * 2.2) {
        this.record("wrongPattern", body);
        this.endEvent();
        return;
      }
    }

    const dl = dist(body.left.pos, this.targetFor("left", ph));
    const dr = dist(body.right.pos, this.targetFor("right", ph));
    this.driftSamples.push(Math.max(dl, dr));

    // left the zone before the hold was complete
    if ((dl > ph.endpoint.tolM * 1.5 || dr > ph.endpoint.tolM * 1.5) && held < ph.endpoint.holdMs) {
      this.record(held < ph.endpoint.holdMs * 0.5 ? "earlyRelease" : "stabilityFail", body);
      this.nextPhase(body);
      return;
    }

    if (held >= ph.endpoint.holdMs) {
      const drift = Math.sqrt(this.driftSamples.reduce((a, b) => a + b * b, 0) / Math.max(1, this.driftSamples.length));
      if (drift > ph.endpoint.stabilityTolM + ph.endpoint.tolM) {
        this.record("stabilityFail", body);
      } else {
        this.judgeArrival(body, ph);
      }
      this.nextPhase(body);
    }
  }

  /** Everything the athlete got right or wrong about ARRIVING, judged at once. */
  private judgeArrival(body: Body, ph: MovementPhase): void {
    const since = this.t - this.goAt;

    // BILATERAL. A sync phase wants the hands together; a desync phase wants them
    // deliberately apart by a specified amount. Both are judged against the RULE.
    const la = this.arrivedAt.left ?? this.t;
    const ra = this.arrivedAt.right ?? this.t;
    const gap = ra - la;                        // signed: + = right arrived later
    const want = ph.bilateralOffsetMs;
    const gapErr = Math.abs(gap - want);
    if (gapErr > ph.timingWindowMs) {
      // did they REVERSE the roles? left did the right's job. That is critical.
      if (want !== 0 && Math.sign(gap) === -Math.sign(want) && Math.abs(gap) > ph.timingWindowMs) {
        this.record("bilateralReversal", body, since);
        return;
      }
      this.record("asymmetry", body, since);
      return;
    }

    // HEAD. If the rule assigned the head a yaw, it must actually be there.
    if (ph.endpoint.headYaw !== undefined && body.head.yaw !== undefined) {
      const he = Math.abs(body.head.yaw - ph.endpoint.headYaw);
      if (he > ph.endpoint.headTolRad * 2) {
        this.record("wrongPattern", body, since);
        return;
      }
    }

    // TIMING against the required arrival beat.
    const arriveT = Math.max(la, ra) - this.goAt;
    const err = arriveT - ph.dueMs;
    if (Math.abs(err) > ph.timingWindowMs) {
      this.record(err < 0 ? "timing" : "lateInitiation", body, since, err);
      return;
    }
    this.record("correct", body, since, err);
  }

  private nextPhase(body: Body): void {
    this.phaseIdx++;
    if (this.phaseIdx >= this.phases.length) { this.endEvent(); return; }
    /**
     * TRANSITIONS WITHOUT NEUTRAL (§18). At higher tiers the athlete does NOT
     * return to a rest pose between phases — the next pattern starts from wherever
     * the last one ended. This is what makes the drill continuous rather than a
     * series of poses, and it is where transition control gets measured.
     */
    const reset = this.rng() > this.live.transitionRate;
    this.resetPhaseState();
    this.startPos = reset
      ? { left: NEUTRAL.left, right: NEUTRAL.right }
      : { left: [...body.left.pos] as V3, right: [...body.right.pos] as V3 };
    this.stage = "go";
    this.stageStart = this.t;
    this.goAt = this.t;
  }

  // ------------------------------------------------------------------ scoring
  private record(outcome: KeyOutcome, body: Body, sinceGo?: number, timingErr?: number): void {
    const ph = this.phases[this.phaseIdx];
    if (!ph) return;
    const correct = outcome === "correct";
    const critical = CRITICAL_OUTCOMES.includes(outcome);
    if (!correct) this.phaseErrors++;
    if (critical) this.eventCritical = true;

    const lErr = dist(body.left.pos, this.targetFor("left", ph));
    const rErr = dist(body.right.pos, this.targetFor("right", ph));
    const drift = this.driftSamples.length
      ? Math.sqrt(this.driftSamples.reduce((a, b) => a + b * b, 0) / this.driftSamples.length)
      : undefined;

    const ideal = idealPath(this.startPos, ph.endpoint);
    const actual = this.pathM.left + this.pathM.right;
    const pathRatio = ideal > 0.02 ? actual / ideal : undefined;

    const lOn = this.onsetAt.left;
    const rOn = this.onsetAt.right;
    const firstOnset = lOn !== undefined && rOn !== undefined ? Math.min(lOn, rOn) : (lOn ?? rOn);
    const initiationMs = firstOnset !== undefined ? Math.max(0, firstOnset - this.goAt) : undefined;

    const zone = classifyPrecision(Math.max(lErr, rErr), ph.endpoint.tolM);
    const breakdown = this.attribute(outcome);
    if (breakdown) this.breakdowns[breakdown]++;

    const delta = this.scoreFor(outcome, ph, timingErr, drift, pathRatio, zone);
    this.score += delta;
    if (this.sessionPhase === "bonus") this.bonusScore += delta; else this.mainScore += delta;

    this.log.push({
      t: this.t, eventId: `e${this.eventId}`, phaseIdx: this.phaseIdx, kind: ph.kind,
      outcome, correct, critical, breakdown,
      initiationMs,
      toEndpointMs: sinceGo,
      timingErrorMs: timingErr,
      leftInitMs: lOn !== undefined ? lOn - this.goAt : undefined,
      rightInitMs: rOn !== undefined ? rOn - this.goAt : undefined,
      initiationGapMs: lOn !== undefined && rOn !== undefined ? Math.abs(lOn - rOn) : undefined,
      arrivalGapMs: this.arrivedAt.left !== undefined && this.arrivedAt.right !== undefined
        ? Math.abs(this.arrivedAt.left - this.arrivedAt.right) : undefined,
      requiredGapMs: ph.bilateralOffsetMs,
      leftErrM: lErr, rightErrM: rErr,
      headErrRad: ph.endpoint.headYaw !== undefined && body.head.yaw !== undefined
        ? Math.abs(body.head.yaw - ph.endpoint.headYaw) : undefined,
      torsoErrM: this.torsoProxy(body),
      driftM: drift,
      overshootM: this.maxOvershoot || undefined,
      corrections: this.corrections,
      pathLeftM: this.pathM.left, pathRightM: this.pathM.right,
      pathRatio,
      headTravelM: this.headTravel,
      precisionZone: zone,
      predictive: this.predictive,
      scoreDelta: delta,
      bonusStage: this.sessionPhase === "bonus" ? this.bonusStage : undefined,
    });
  }

  /**
   * TORSO PROXY. We cannot see a torso. What we CAN see is the relationship
   * between the headset and the midpoint of the two controllers — and how far
   * that relationship has drifted from the athlete's calibrated neutral. That is
   * a proxy for trunk displacement and it is named as one. No claim is made about
   * spines, hips, or anything else we have no sensor for.
   */
  private torsoProxy(body: Body): number {
    const mid: V3 = [
      (body.left.pos[0] + body.right.pos[0]) / 2,
      (body.left.pos[1] + body.right.pos[1]) / 2,
      (body.left.pos[2] + body.right.pos[2]) / 2,
    ];
    const neutralMid: V3 = [
      (NEUTRAL.left[0] + NEUTRAL.right[0]) / 2,
      (NEUTRAL.left[1] + NEUTRAL.right[1]) / 2,
      (NEUTRAL.left[2] + NEUTRAL.right[2]) / 2,
    ];
    const headOff: V3 = [
      body.head.pos[0] - NEUTRAL.head[0],
      0,
      body.head.pos[2] - NEUTRAL.head[2],
    ];
    const midOff = Math.hypot(mid[0] - neutralMid[0], mid[2] - neutralMid[2]);
    return Math.hypot(headOff[0], headOff[2]) * 0.7 + midOff * 0.3;
  }

  private attribute(o: KeyOutcome): BreakdownDomain | undefined {
    switch (o) {
      case "correct": return undefined;
      case "wrongPattern": return "selection";
      case "prohibited":
      case "falseStart": return "inhibition";
      case "bilateralReversal":
      case "asymmetry": return "bilateral";
      case "unsafeRange": return "direction";
      case "failedRuleChange": return "adaptation";
      case "timing":
      case "lateInitiation": return "initiation";
      case "endpointMiss":
      case "incompleteRange": return "endpoint";
      case "stabilityFail":
      case "earlyRelease": return "stabilization";
      case "missedTransition": return "transition";
      case "overshoot": return "efficiency";
      default: return "endpoint";
    }
  }

  /**
   * SCORING (§32, §33). Tier-weighted, and built on one invariant: RECKLESS SPEED
   * MUST NEVER OUTPERFORM CONTROLLED COORDINATION. Every reward here is gated by a
   * control term. Arriving fast but unstable scores less than arriving on time and
   * still — and thrashing through a 3x path length is priced accordingly.
   */
  private scoreFor(
    o: KeyOutcome, ph: MovementPhase,
    timingErr?: number, drift?: number, pathRatio?: number,
    zone?: import("@/ares/precision").PrecisionZone,
  ): number {
    const T = this.settings.tier;
    const stabW = T === "beginner" ? 0.7 : T === "intermediate" ? 0.9 : T === "advanced" ? 1.1 : 1.35;
    const effW = T === "beginner" ? 0.3 : T === "intermediate" ? 0.5 : T === "advanced" ? 0.9 : 1.2;

    switch (o) {
      case "prohibited": return -170;
      case "wrongPattern": return -150;
      case "bilateralReversal": return -140;
      case "unsafeRange": return -60;   // a safety stop, not a skill failure
      case "failedRuleChange": return -130;
      case "falseStart": return -55;
      case "stabilityFail": return -45;
      case "earlyRelease": return -40;
      case "endpointMiss": return -45;
      case "asymmetry": return -38;
      case "timing":
      case "lateInitiation": return -30;
      case "missedTransition": return -30;
      case "incompleteRange": return -28;
      case "overshoot": return -22;
      default: break;
    }

    let s = 100;
    // TIMING PRECISION — closeness to the beat, not speed.
    if (timingErr !== undefined) {
      s += 45 * Math.max(0, 1 - Math.abs(timingErr) / ph.timingWindowMs);
    }
    /**
     * STABILIZATION. The single most heavily weighted term at the top tiers,
     * because it is the one thing this drill measures that nothing else does.
     * An athlete who arrives perfectly and then vibrates does not get the points.
     */
    if (drift !== undefined) {
      const q = Math.max(0, 1 - drift / (ph.endpoint.stabilityTolM + ph.endpoint.tolM));
      s += 60 * q * stabW;
    }
    // ENDPOINT LOCALIZATION — the shared suite-wide perfect/good/poor.
    if (zone) s += zone === "perfect" ? 45 : zone === "good" ? 18 : 3;
    /**
     * MOVEMENT ECONOMY. pathRatio is actual travel over the straight-line ideal.
     * 1.0 is a perfect line. This term is what makes flailing expensive: an
     * athlete who thrashes to the same endpoint burns 3x the path and is scored
     * on it, so violence cannot substitute for control.
     */
    if (pathRatio !== undefined) {
      const q = Math.max(0, Math.min(1, 1.35 / Math.max(1, pathRatio)));
      s += 35 * q * effW;
    }
    if (this.corrections > 0) s -= Math.min(30, this.corrections * 8);
    if (ph.force) s += 20;
    if (ph.bilateralOffsetMs !== 0) s += 22;   // intentional desync is harder
    if (!this.predictive) s += 18;             // a reactive event is harder

    s *= 1 + Math.min(0.5, this.streak * 0.03);
    if (this.inRecovery) s *= 1.2;
    if (this.sessionPhase === "bonus") s *= 1 + this.bonusStage * 0.1;
    return Math.round(s);
  }

  // ------------------------------------------------------------------- events
  private endEvent(): void {
    this.events++;
    const clean = this.phaseErrors === 0 && !this.eventCritical;
    if (clean) this.perfect++;
    this.leaked = false;

    if (clean) {
      this.streak++;
      if (this.streak > this.longestStreak) this.longestStreak = this.streak;
      if (this.inRecovery) {
        this.recoveryStreak++;
        if (this.recoveryStreak >= 2) {
          this.inRecovery = false;
          this.recoveryTimes.push(this.t - this.recoveryStartT);
          this.live = { ...this.tune };
        }
      } else this.raise();
      if (this.sessionPhase === "bonus" && this.bonusStrikes > 0) this.bonusStrikes--;
    } else {
      this.streak = 0;
      this.recoveryStreak = 0;
      if (this.eventCritical) this.enterRecovery(); else this.lower();
    }

    if (this.sessionPhase === "bonus") {
      if (this.eventCritical) { this.finish("critical error"); return; }
      if (!clean) {
        this.bonusStrikes++;
        if (this.bonusStrikes >= BONUS_STRIKES) { this.finish("three strikes"); return; }
      }
    }

    this.stage = "result";
    this.stageStart = this.t;
  }

  private enterRecovery(): void {
    if (this.settings.mode === "assessment") return;   // assessment NEVER adapts
    this.inRecovery = true;
    this.recoveryStreak = 0;
    this.recoveryAttempts++;
    this.recoveryStartT = this.t;
    this.live = {
      ...this.live,
      phasesMin: 1, phasesMax: 1,
      stimulusSpeed: this.tune.stimulusSpeed * 0.6,
      prepMs: this.tune.prepMs * 1.4,
      endpointTolM: this.tune.endpointTolM * 1.5,
      stabilityTolM: this.tune.stabilityTolM * 1.6,
      transformRate: 0, inhibitRate: 0, falsePulseRate: 0,
      headHandConflict: 0, transitionRate: 0,
    };
  }

  /** Raise exactly ONE knob at a time (§24) — otherwise breakdown data is noise. */
  private raise(): void {
    if (this.settings.mode === "assessment") return;
    if (this.streak === 0 || this.streak % 3 !== 0) return;
    const knobs: (keyof KeyTuning)[] = [
      "stimulusSpeed", "prepMs", "timingWindowMs", "endpointTolM", "stabilityTolM",
      "asymmetry", "headHandConflict", "rhythmVariance", "transformRate",
      "inhibitRate", "transitionRate", "desyncRate", "holdMs",
    ];
    const k = knobs[Math.floor(this.rng() * knobs.length)];
    this.lastRaised = k;
    const L = this.live as unknown as Record<string, number>;
    switch (k) {
      case "stimulusSpeed": L[k] = Math.min(2.4, L[k] * 1.05); break;
      case "prepMs": L[k] = Math.max(300, L[k] * 0.94); break;
      case "timingWindowMs": L[k] = Math.max(140, L[k] * 0.95); break;
      case "endpointTolM": L[k] = Math.max(0.06, L[k] * 0.95); break;
      case "stabilityTolM": L[k] = Math.max(0.02, L[k] * 0.94); break;
      case "holdMs": L[k] = Math.min(SAFE.maxHoldMs, L[k] + 90); break;
      default: L[k] = Math.min(0.9, L[k] + 0.06); break;
    }
    this.complexity = Math.min(3, this.complexity + 0.05);
  }
  private lower(): void {
    if (this.settings.mode === "assessment") return;
    const k = this.lastRaised;
    if (!k) return;
    const L = this.live as unknown as Record<string, number>;
    const B = this.tune as unknown as Record<string, number>;
    switch (k) {
      case "stimulusSpeed": L[k] = Math.max(B[k] * 0.7, L[k] * 0.96); break;
      case "prepMs": L[k] = Math.min(B[k] * 1.35, L[k] * 1.06); break;
      case "timingWindowMs": L[k] = Math.min(B[k] * 1.35, L[k] * 1.05); break;
      case "endpointTolM": L[k] = Math.min(B[k] * 1.4, L[k] * 1.06); break;
      case "stabilityTolM": L[k] = Math.min(B[k] * 1.5, L[k] * 1.07); break;
      case "holdMs": L[k] = Math.max(B[k] * 0.7, L[k] - 80); break;
      default: L[k] = Math.max(0, L[k] - 0.05); break;
    }
    this.complexity = Math.max(0.6, this.complexity - 0.04);
  }

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

  weakestDomain(): BreakdownDomain | undefined {
    let worst: BreakdownDomain | undefined;
    let n = 0;
    for (const [k, v] of Object.entries(this.breakdowns) as [BreakdownDomain, number][]) {
      if (v > n) { n = v; worst = k; }
    }
    return n >= 2 ? worst : undefined;
  }

  /** Escalation is multiplicative and uncapped, so the round ALWAYS terminates in
   *  the athlete's own failure — and after enough data it presses their weakest
   *  domain specifically rather than escalating generically (§26). */
  private escalate(): void {
    if (this.t - this.bonusStageT < BONUS_STAGE_MS) return;
    this.bonusStage++;
    this.bonusStageT = this.t;
    if (this.bonusStage >= MAX_BONUS_STAGE) { this.finish("maximum escalation reached"); return; }

    const L = this.live;
    L.stimulusSpeed *= 1.09;
    L.prepMs = Math.max(240, L.prepMs * 0.93);
    L.timingWindowMs = Math.max(110, L.timingWindowMs * 0.94);

    switch (this.weakestDomain()) {
      case "bilateral":
        L.desyncRate = Math.min(0.85, L.desyncRate + 0.1);
        L.asymmetry = Math.min(0.95, L.asymmetry + 0.08);
        break;
      case "stabilization":
        // press stabilization by making the WORLD move more, not the hold longer
        L.rhythmVariance = Math.min(1, L.rhythmVariance + 0.12);
        L.stabilityTolM = Math.max(0.018, L.stabilityTolM * 0.9);
        L.holdMs = Math.min(SAFE.maxHoldMs, L.holdMs + 120);
        break;
      case "headHand":
        L.headHandConflict = Math.min(0.9, L.headHandConflict + 0.1);
        L.headInvolve = Math.min(1, L.headInvolve + 0.08);
        break;
      case "inhibition":
        L.falsePulseRate = Math.min(0.55, L.falsePulseRate + 0.08);
        L.inhibitRate = Math.min(0.35, L.inhibitRate + 0.05);
        break;
      case "adaptation":
        L.transformRate = Math.min(0.95, L.transformRate + 0.08);
        break;
      case "transition":
        L.transitionRate = Math.min(0.95, L.transitionRate + 0.1);
        break;
      case "initiation":
        L.predictiveMix = Math.max(0.1, L.predictiveMix - 0.08);  // more reactive
        break;
      case "efficiency":
        L.endpointTolM = Math.max(0.055, L.endpointTolM * 0.92);
        break;
      default:
        L.phasesMax = Math.min(8, L.phasesMax + 1);
        L.simultaneous = Math.min(5, L.simultaneous + 1);
        break;
    }
    this.complexity += 0.15;
  }

  private finish(cause: string): void {
    this.failCause = cause;
    this.sessionPhase = "complete";
    this.finished = true;
  }
  stop(): void { this.finish("stopped by trainer"); }
  isFinished(): boolean { return this.finished; }
  bonusDurationMs(): number { return this.bonusStartT ? Math.max(0, this.t - this.bonusStartT) : 0; }
  currentPhase(): MovementPhase | undefined { return this.phases[this.phaseIdx]; }

  snapshot(): KeySnapshot {
    const ph = this.phases[this.phaseIdx];
    const held = this.holdStart !== undefined ? this.t - this.holdStart : 0;
    const drift = this.driftSamples.length
      ? this.driftSamples[this.driftSamples.length - 1] : 0;
    return {
      sessionPhase: this.sessionPhase, tMs: this.t,
      mainRemainingMs: Math.max(0, this.tune.durationMs - this.t),
      phases: this.phases, phaseIdx: this.phaseIdx,
      stage: this.stage,
      goInMs: this.stage === "prepare"
        ? Math.max(0, this.live.prepMs - (this.t - this.stageStart)) : 0,
      // The visual rhythm. It is the ONLY timing cue in the drill — there is no
      // audio, deliberately, because an audible beat would let the athlete
      // synchronize by ear and we would stop measuring visual-motor coupling.
      rhythm: (Math.sin(this.t / (420 / Math.max(0.4, this.live.stimulusSpeed))) + 1) / 2,
      falsePulse: this.falsePulse && this.stage === "prepare",
      ruleChangeMs: Math.max(0, 800 - (this.t - this.ruleChangeAt)),
      score: this.score, mainScore: this.mainScore, bonusScore: this.bonusScore,
      streak: this.streak, longestStreak: this.longestStreak,
      events: this.events, perfect: this.perfect,
      bonusStage: this.bonusStage, bonusStrikes: this.bonusStrikes,
      inRecovery: this.inRecovery, recoveryStreak: this.recoveryStreak,
      complexity: this.complexity,
      liveDriftM: drift,
      holdProgress: ph && this.stage === "hold" ? Math.min(1, held / Math.max(1, ph.endpoint.holdMs)) : 0,
      failCause: this.failCause,
      weakest: this.weakestDomain(),
      log: this.log,
    };
  }
}
