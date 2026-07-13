import { makeRng } from "@/utils/rng";
import {
  type AegisObject, type AegisEvent, type AegisSettings, type AegisTuning,
  type AegisCategory, type AegisPhase, type AegisPace, type AegisOutcome,
  type RequiredHand, type AegisAction, type HandRule,
  CRITICAL_OUTCOMES,
} from "./types";
import { tuningFor, modeAllowed, handRuleAllowed } from "./tiers";
import { makeTrajectory, bezier, arcLength, pairSafe, type Vec3 } from "./trajectory";
import { classifyPrecision } from "@/ares/precision";

/**
 * THE CONTINUOUS ENGINE.
 *
 * The existing DrillEngine plays a fixed, pre-built trial plan. AEGIS cannot:
 * it spawns against live performance, it has failure states, it slows down and
 * recovers, and its bonus round has no end until the athlete makes a mistake.
 * So it gets its own engine, and the sixty drills that already work are left
 * completely alone.
 *
 * Timing is deterministic and frame-rate independent: the engine advances on an
 * accumulated fixed step, never on raw delta, so scoring can never drift with
 * frame rate (§34, "no frame-dependent scoring").
 */

const STEP_MS = 8; // 125 Hz fixed simulation step
/** how long each bonus stage runs before the screw turns again (§20) */
const BONUS_STAGE_MS = 15_000;
/** a hard backstop so the round cannot run forever even in a degenerate case */
const MAX_BONUS_STAGE = 30;

export interface AegisSnapshot {
  phase: AegisPhase;
  pace: AegisPace;
  tMs: number;
  mainRemainingMs: number;
  objects: AegisObject[];
  positions: Record<string, Vec3>;
  score: number;
  mainScore: number;
  bonusScore: number;
  streak: number;
  longestStreak: number;
  hits: number;
  misses: number;
  criticals: number;
  bonusStage: number;
  bonusMisses: number;
  slowdownRemainingMs: number;
  recoveryStreak: number;
  handRuleFlipped: boolean;
  ruleWarningMs: number;
  events: AegisEvent[];
  failCause?: string;
  /** live tracking load — how many objects are actionable right now */
  simultaneous: number;
  peakSimultaneous: number;
  peakSpeed: number;
}

export type HandId = "left" | "right";

export interface HandState {
  pos: Vec3;
  vel: Vec3;
  gripping: boolean;
}

export class AegisEngine {
  readonly settings: AegisSettings;
  readonly tune: AegisTuning;
  private rng: () => number;

  private t = 0;
  private acc = 0;
  private lastReal = 0;

  phase: AegisPhase = "countdown";
  pace: AegisPace = "normal";

  private objects: AegisObject[] = [];
  private nextId = 0;
  private nextSpawnT = 0;

  events: AegisEvent[] = [];
  score = 0;
  mainScore = 0;
  bonusScore = 0;
  streak = 0;
  longestStreak = 0;
  hits = 0;
  misses = 0;
  criticals = 0;

  // slowdown / recovery (§14)
  private slowdownUntil = 0;
  private slowdownCount = 0;
  recoveryStreak = 0;

  // bonus (§20)
  bonusStage = 0;
  bonusMisses = 0;
  private bonusStartT = 0;
  private bonusStageT = 0;
  failCause?: string;

  // adaptive (§19)
  private complexity = 1;
  private speedMul = 1;
  private densityMul = 1;
  private sizeMul = 1;

  // adaptive hand-rule switching (§5) — always warned in the launch build
  handRuleFlipped = false;
  private nextRuleSwitchT = Infinity;
  private ruleWarnUntil = 0;

  // recovery waves (§25) — unlabelled, felt rather than announced
  private waveUntil = 0;
  private nextWaveT = 0;

  peakSimultaneous = 0;
  peakSpeed = 0;
  private handPath: Record<HandId, number> = { left: 0, right: 0 };
  private lastHand: Record<HandId, Vec3 | null> = { left: null, right: null };

  private listeners: ((s: AegisSnapshot) => void)[] = [];
  private finished = false;
  /**
   * PAUSE. The engine advances on accumulated real time, so a pause cannot
   * simply stop calling tick() — the next tick would see the whole paused gap as
   * elapsed and fast-forward the session through it. Re-anchoring lastReal on
   * every paused frame is what makes the pause actually stop the clock.
   */
  paused = false;
  setPaused(p: boolean): void { this.paused = p; }

  constructor(settings: AegisSettings, seed = 1) {
    // Guard the reserved combinations rather than trusting the UI (§4, §5).
    const mode = modeAllowed(settings.tier, settings.mode) ? settings.mode : "block";
    const handRule: HandRule = handRuleAllowed(settings.tier, settings.handRule)
      ? settings.handRule : "asymmetric";
    this.settings = { ...settings, mode, handRule };
    this.tune = tuningFor(settings.tier, settings.custom);
    this.rng = makeRng(seed);
    this.nextSpawnT = 800;
    if (handRule === "adaptive" && this.tune.ruleSwitchRate > 0) {
      this.nextRuleSwitchT = 45_000 + this.rng() * 30_000;
    }
    this.nextWaveT = 40_000 + this.rng() * 20_000;
  }

  subscribe(fn: (s: AegisSnapshot) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
  }
  private emit(): void {
    const s = this.snapshot();
    for (const f of this.listeners) f(s);
  }

  start(now: number): void {
    this.lastReal = now;
    this.phase = "main";
  }

  // ---------------------------------------------------------------- tick
  tick(now: number, hands: Record<HandId, HandState>, headPos: Vec3): void {
    if (this.finished) return;
    if (this.paused) { this.lastReal = now; this.emit(); return; }
    this.acc += Math.min(100, now - this.lastReal);
    this.lastReal = now;
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      this.step(STEP_MS, hands, headPos);
    }
    this.emit();
  }

  private step(dt: number, hands: Record<HandId, HandState>, headPos: Vec3): void {
    this.t += dt;

    // movement economy: accumulate controller path length (§24)
    for (const h of ["left", "right"] as HandId[]) {
      const p = hands[h]?.pos;
      if (p) {
        const prev = this.lastHand[h];
        if (prev) this.handPath[h] += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
        this.lastHand[h] = [...p] as Vec3;
      }
    }

    // ---- pace state
    if (this.pace === "slowdown" && this.t >= this.slowdownUntil) this.enterRecovery();
    if (this.pace === "recovery" && this.recoveryStreak >= this.tune.recoveryStreak) this.restoreNormal();

    // ---- adaptive hand-rule switch, always preceded by a visible warning (§5)
    if (this.t >= this.nextRuleSwitchT) {
      this.ruleWarnUntil = this.t + 1500;
      this.nextRuleSwitchT = Infinity;
      this.pendingFlipAt = this.t + 1500;
    }
    if (this.pendingFlipAt && this.t >= this.pendingFlipAt) {
      this.handRuleFlipped = !this.handRuleFlipped;
      this.pendingFlipAt = undefined;
      const gap = 60_000 / Math.max(0.1, this.tune.ruleSwitchRate);
      this.nextRuleSwitchT = this.t + gap * (0.7 + this.rng() * 0.6);
    }

    // ---- natural recovery waves (§25): a felt lull, never a labelled rest
    if (this.phase === "main" && this.t >= this.nextWaveT) {
      const len = this.settings.tier === "goat" ? 5000 : this.settings.tier === "pro" ? 7000 : 9000;
      this.waveUntil = this.t + len;
      const period = this.settings.tier === "goat" ? 90_000 : this.settings.tier === "pro" ? 75_000 : 55_000;
      this.nextWaveT = this.t + period * (0.8 + this.rng() * 0.4);
    }

    // ---- spawn
    if (this.t >= this.nextSpawnT && this.liveCount() < this.effMaxSimultaneous()) {
      this.spawn();
      this.nextSpawnT = this.t + this.effInterval();
    }

    // ---- resolve contacts and failures
    this.resolveContacts(hands, headPos);
    this.resolveHeld(hands);
    this.expire();

    // ---- phase transitions
    if (this.phase === "main" && this.t >= this.tune.durationMs) {
      if (this.settings.bonusEnabled) this.enterBonus();
      else this.finish("main round complete");
    }
    if (this.phase === "bonus") this.escalate();

    const sim = this.actionableCount();
    if (sim > this.peakSimultaneous) this.peakSimultaneous = sim;
    const sp = this.tune.speed * this.speedMul * this.paceFactor();
    if (sp > this.peakSpeed) this.peakSpeed = sp;
  }

  private pendingFlipAt?: number;

  // ---------------------------------------------------------------- pacing
  private paceFactor(): number {
    if (this.pace === "slowdown") return this.tune.slowdownFactor;
    if (this.pace === "recovery") {
      // ramp smoothly back rather than snapping — a step change is unreadable
      const p = Math.min(1, this.recoveryStreak / Math.max(1, this.tune.recoveryStreak));
      return this.tune.slowdownFactor + (1 - this.tune.slowdownFactor) * p;
    }
    return 1;
  }
  private inWave(): boolean { return this.t < this.waveUntil; }

  private effInterval(): number {
    let iv = this.tune.spawnIntervalMs / (this.densityMul * (this.phase === "bonus" ? 1 + this.bonusStage * 0.06 : 1));
    if (this.pace !== "normal") iv *= 1.5;
    if (this.inWave()) iv *= 1.45;
    return Math.max(180, iv);
  }
  private effMaxSimultaneous(): number {
    let m = this.tune.maxSimultaneous + (this.phase === "bonus" ? Math.floor(this.bonusStage / 2) : 0);
    if (this.pace !== "normal") m = Math.max(1, m - 2);
    if (this.inWave()) m = Math.max(1, m - 1);
    return Math.min(8, m);
  }
  private effComplexity(): number {
    let c = this.complexity;
    if (this.pace !== "normal") c *= 0.55;
    if (this.inWave()) c *= 0.6;
    return c;
  }

  private liveCount(): number { return this.objects.filter((o) => !o.resolved).length; }
  private actionableCount(): number {
    return this.objects.filter((o) => !o.resolved && this.t >= o.actionableT).length;
  }

  // ---------------------------------------------------------------- spawning
  private pickCategory(): AegisCategory {
    const r = this.rng();
    const t = this.tune;
    const bombR = t.bombRate * (this.phase === "bonus" ? 1 + this.bonusStage * 0.05 : 1);
    if (r < bombR) return "bomb";
    if (r < bombR + t.nogoRate) return "nogo";
    if (r < bombR + t.nogoRate + t.bonusRate) return "bonus";
    // standard target: which hand?
    if (this.settings.handRule === "symmetric") return "either";
    if (this.rng() < t.eitherRate) return "either";
    return this.rng() < 0.5 ? "left" : "right";
  }

  private handFor(cat: AegisCategory): RequiredHand {
    if (cat === "either" || cat === "bonus") return "either";
    if (cat === "bomb" || cat === "nogo") return "either";
    const base: RequiredHand = cat === "left" ? "left" : "right";
    if (!this.handRuleFlipped) return base;
    return base === "left" ? "right" : "left"; // the adaptive rule switch
  }

  private actionFor(): AegisAction {
    if (this.settings.mode === "block") return "block";
    if (this.settings.mode === "catch") return "catch";
    return this.rng() < 0.5 ? "block" : "catch"; // mixed
  }

  private spawn(): void {
    const cat = this.pickCategory();
    const action = cat === "bomb" || cat === "nogo" ? "block" : this.actionFor();
    const complexity = this.effComplexity();

    let p0: Vec3, ctrl: Vec3, p1: Vec3;
    let attempts = 0;
    do {
      ({ p0, ctrl, p1 } = makeTrajectory(cat, this.tune, this.rng, complexity));
      attempts++;
      // never let two simultaneous arrivals force the controllers together (§33)
    } while (attempts < 6 && this.objects.some(
      (o) => !o.resolved && Math.abs(o.arriveT - this.t) < 400 && !pairSafe(o.p1, p1),
    ));

    const speed = this.tune.speed * this.speedMul * this.paceFactor() * (cat === "bonus" ? 1.18 : 1);
    const flightMs = (arcLength(p0, ctrl, p1) / speed) * 1000;
    const size = this.tune.targetSize * this.sizeMul * (cat === "bonus" ? 0.82 : 1);

    /**
     * ACTIONABILITY (§16). Primary RT is measured from the moment the object
     * becomes actionable — NOT from spawn. An object that is still 5 m out is
     * visible but not answerable; timing from spawn would just measure how long
     * the designer made the flight. Actionability opens when the object enters
     * the response corridor: the last stretch of its flight.
     */
    const actionableFrac = 0.55;

    this.objects.push({
      id: `o${this.nextId++}`,
      cat, action,
      requiredHand: this.handFor(cat),
      spawnT: this.t,
      actionableT: this.t + flightMs * actionableFrac,
      arriveT: this.t + flightMs,
      failT: this.t + flightMs + this.tune.timingWindowMs,
      p0, ctrl, p1,
      scale: size,
      releaseZone: this.tune.requireRelease && action === "catch"
        ? [this.rng() < 0.5 ? -0.55 : 0.55, 1.05 + this.rng() * 0.2, -0.45] : undefined,
      resolved: false,
    });
  }

  /** World position of an object right now. */
  posOf(o: AegisObject): Vec3 {
    if (o.heldBy) return o.p1; // held objects follow the hand (renderer overrides)
    const flight = o.arriveT - o.spawnT;
    const p = Math.min(1.35, Math.max(0, (this.t - o.spawnT) / Math.max(1, flight)));
    return bezier(o.p0, o.ctrl, o.p1, p);
  }

  // ------------------------------------------------------------ interaction
  /**
   * Called every step by the renderer with live controller state. This is where
   * blocks, catches, bomb contacts, and inhibition failures are decided.
   */
  private resolveContacts(hands: Record<HandId, HandState>, headPos: Vec3): void {
    for (const o of this.objects) {
      if (o.resolved || o.heldBy) continue;
      const p = this.posOf(o);

      // ---- BOMB: head / upper-torso collision is a critical error (§6)
      if (o.cat === "bomb") {
        const headHit = Math.hypot(p[0] - headPos[0], p[1] - headPos[1], p[2] - headPos[2]) < o.scale + 0.16;
        if (headHit) { this.resolve(o, "bombContact", undefined, p); continue; }
      }

      for (const h of ["left", "right"] as HandId[]) {
        const hs = hands[h];
        if (!hs) continue;
        const d = Math.hypot(p[0] - hs.pos[0], p[1] - hs.pos[1], p[2] - hs.pos[2]);

        // ---- HESITATION (§15): Pro/GOAT record entering the bomb danger radius
        if (o.cat === "bomb" && this.tune.hesitationPenalty && d < o.scale + 0.22 && !o.hesitationAt) {
          o.hesitationAt = this.t;
        }

        if (d > o.scale + 0.09) continue; // no contact

        // ---- BOMB / NO-GO: any controller contact is critical
        if (o.cat === "bomb") { this.resolve(o, "bombContact", h, p, hs); break; }
        if (o.cat === "nogo") { this.resolve(o, "nogoContact", h, p, hs); break; }

        // ---- WRONG HAND is critical, and it is checked BEFORE anything else.
        // Touching a left-hand target with the right hand is not a sloppy hit;
        // it is a failure of response selection, which is the thing we measure.
        if (o.requiredHand !== "either" && o.requiredHand !== h) {
          this.resolve(o, "wrongHand", h, p, hs); break;
        }

        // ---- CATCH: contact alone is not a catch. The grip has to close.
        if (o.action === "catch") {
          if (!hs.gripping) {
            // no grip yet — the object is simply passing through the hand zone.
            // If it leaves without a grip it will expire as a miss.
            continue;
          }
          if (this.t < o.actionableT) { this.resolve(o, "earlyGrip", h, p, hs); break; }
          o.heldBy = h;
          o.heldSince = this.t;
          break;
        }

        // ---- BLOCK
        if (this.settings.mode === "catch") { this.resolve(o, "wrongAction", h, p, hs); break; }
        const speed = Math.hypot(hs.vel[0], hs.vel[1], hs.vel[2]);

        // Minimum velocity: at Pro/GOAT, drifting a controller into the path of
        // an object is not a block. You have to DRIVE into it. This is the single
        // most important guard against reckless flailing outscoring control —
        // and its inverse, passive parking, outscoring intent.
        if (this.tune.minBlockSpeed > 0 && speed < this.tune.minBlockSpeed) {
          continue; // not yet a valid block; keep the object live
        }
        // Direction: the controller must be moving INTO the object, not merely
        // occupying the same space as it.
        if (this.tune.requireDirection) {
          const toObj = [p[0] - hs.pos[0], p[1] - hs.pos[1], p[2] - hs.pos[2]];
          const mag = Math.hypot(...toObj) || 1e-6;
          const dot = (hs.vel[0] * toObj[0] + hs.vel[1] * toObj[1] + hs.vel[2] * toObj[2]) / (mag * (speed || 1e-6));
          if (dot < 0.2) continue;
        }
        this.resolve(o, "blocked", h, p, hs);
        break;
      }
    }
  }

  /** Retention and release for objects currently held (§11). */
  private resolveHeld(hands: Record<HandId, HandState>): void {
    for (const o of this.objects) {
      if (o.resolved || !o.heldBy) continue;
      const hs = hands[o.heldBy];
      const held = this.t - (o.heldSince ?? this.t);

      if (!hs?.gripping) {
        // grip opened
        if (held < this.tune.retentionMs) { this.resolve(o, "dropped", o.heldBy, hs?.pos ?? o.p1, hs); continue; }
        if (!this.tune.requireRelease || !o.releaseZone) {
          this.resolve(o, "caught", o.heldBy, hs?.pos ?? o.p1, hs); continue;
        }
        // release-zone catch: the object has to be DELIVERED, not just held
        const d = Math.hypot(
          (hs?.pos[0] ?? 0) - o.releaseZone[0],
          (hs?.pos[1] ?? 0) - o.releaseZone[1],
          (hs?.pos[2] ?? 0) - o.releaseZone[2],
        );
        this.resolve(o, d < 0.22 ? "released" : "missedZone", o.heldBy, hs?.pos ?? o.p1, hs);
        continue;
      }
      // held too long without delivering
      if (this.tune.requireRelease && held > this.tune.retentionMs + 2600) {
        this.resolve(o, "missedZone", o.heldBy, hs.pos, hs);
      }
    }
  }

  /** Failure plane: an unresolved target crossing it is a miss (§13). */
  private expire(): void {
    for (const o of this.objects) {
      if (o.resolved || o.heldBy) continue;
      if (this.t < o.failT) continue;
      // A bomb or no-go that crossed the plane untouched is a SUCCESS.
      if (o.cat === "bomb" || o.cat === "nogo") { this.resolve(o, "avoided", undefined, this.posOf(o)); continue; }
      // A missed bonus target is deliberately NOT a miss — bonuses must stay
      // optional enough that ignoring one doesn't distort core performance (§6).
      if (o.cat === "bonus") { o.resolved = true; continue; }
      this.resolve(o, "miss", undefined, this.posOf(o));
    }
    this.objects = this.objects.filter((o) => !o.resolved || this.t - o.arriveT < 900);
  }

  // ---------------------------------------------------------------- resolution
  private resolve(o: AegisObject, outcome: AegisOutcome, hand?: HandId, at?: Vec3, hs?: HandState): void {
    o.resolved = true;
    o.outcome = outcome;

    const critical = CRITICAL_OUTCOMES.includes(outcome);
    const good = outcome === "blocked" || outcome === "caught" || outcome === "released" || outcome === "avoided";
    const scored = o.cat !== "bomb" && o.cat !== "nogo"; // avoidance is correct but not a "hit"

    const reactionMs = good && scored ? Math.max(0, this.t - o.actionableT) : undefined;
    const speed = hs ? Math.hypot(hs.vel[0], hs.vel[1], hs.vel[2]) : undefined;
    const objPos = at ?? this.posOf(o);
    const precisionM = hs ? Math.hypot(objPos[0] - hs.pos[0], objPos[1] - hs.pos[1], objPos[2] - hs.pos[2]) : undefined;
    // The contact radius is the object's own scale plus the hand's tolerance —
    // the same figure the contact test used, so the zones are honest.
    const radiusM = o.scale + 0.09;
    const offX = hs ? hs.pos[0] - objPos[0] : undefined;
    const offY = hs ? hs.pos[1] - objPos[1] : undefined;
    const offZ = hs ? hs.pos[2] - objPos[2] : undefined;
    const precisionZone = precisionM !== undefined ? classifyPrecision(precisionM, radiusM) : undefined;

    let dirQ: number | undefined;
    if (hs && speed && speed > 0.01) {
      const to = [objPos[0] - hs.pos[0], objPos[1] - hs.pos[1], objPos[2] - hs.pos[2]];
      const mag = Math.hypot(...to) || 1e-6;
      dirQ = (hs.vel[0] * to[0] + hs.vel[1] * to[1] + hs.vel[2] * to[2]) / (mag * speed);
    }

    const delta = this.scoreFor(o, outcome, reactionMs, precisionM, speed, dirQ, radiusM);

    // ---- streak, counters
    if (good) {
      if (scored) this.hits++;
      this.streak++;
      if (this.streak > this.longestStreak) this.longestStreak = this.streak;
      if (this.pace !== "normal") this.recoveryStreak++;
      // A bonus target during recovery buys back time — momentum you can earn (§6)
      if (o.cat === "bonus" && this.pace === "slowdown") {
        this.slowdownUntil = Math.max(this.t, this.slowdownUntil - 1200);
      }
      this.onSuccess();
    } else {
      this.streak = 0;
      this.recoveryStreak = 0;
      if (outcome === "miss" || outcome === "dropped" || outcome === "missedZone"
        || outcome === "lateGrip" || outcome === "earlyGrip") this.misses++;
      if (critical) { this.criticals++; this.triggerSlowdown(outcome); }
      this.onFailure(critical);
    }

    // ---- BONUS ROUND FAILURE RULES (§3). These end the round immediately.
    if (this.phase === "bonus") {
      if (critical) this.finish(
        outcome === "bombContact" ? "bomb contact"
          : outcome === "wrongHand" ? "wrong hand"
            : outcome === "nogoContact" ? "no-go contact" : "wrong action",
      );
      else if (outcome === "miss") {
        this.bonusMisses++;
        if (this.bonusMisses >= 3) this.finish("3 missed targets");
      }
    }

    this.score += delta;
    if (this.phase === "bonus") this.bonusScore += delta; else this.mainScore += delta;

    this.events.push({
      t: this.t, phase: this.phase, pace: this.pace,
      objectId: o.id, cat: o.cat, action: o.action, requiredHand: o.requiredHand,
      responseHand: hand, responseAction: hand ? (o.heldBy ? "catch" : "block") : undefined,
      outcome, correct: good, critical,
      reactionMs,
      spawnToResponseMs: good ? this.t - o.spawnT : undefined,
      moveInitMs: o.moveInitAt !== undefined ? o.moveInitAt - o.actionableT : undefined,
      precisionM, radiusM, offX, offY, offZ, precisionZone,
      contactSpeed: speed, directionQuality: dirQ,
      pathM: hand ? this.handPath[hand] : undefined,
      scoreDelta: delta,
      bonusStage: this.phase === "bonus" ? this.bonusStage : undefined,
    });
  }

  /**
   * TIER-WEIGHTED SCORING (§21). The weights are NOT constant across tiers —
   * that is the whole point. A beginner is paid for accuracy and correct-hand
   * selection. A GOAT is paid for reaction time, control quality, movement
   * economy, and inhibition, because at that level accuracy is table stakes.
   *
   * The invariant that governs every term: RECKLESS SPEED MUST NEVER OUTSCORE
   * CONTROLLED ACCURACY. Every speed-linked bonus is multiplied by a quality
   * term, so a fast sloppy hit is worth strictly less than a fast clean one.
   */
  private scoreFor(
    o: AegisObject, outcome: AegisOutcome,
    rt?: number, precisionM?: number, speed?: number, dirQ?: number, radiusM?: number,
  ): number {
    const T = this.settings.tier;
    const speedW = T === "beginner" ? 0.15 : T === "intermediate" ? 0.3 : T === "advanced" ? 0.55 : T === "pro" ? 0.8 : 1.0;
    const accW = T === "beginner" ? 1.4 : T === "intermediate" ? 1.25 : T === "advanced" ? 1.0 : 0.85;

    switch (outcome) {
      case "bombContact": return -220;
      case "wrongHand":   return -180;
      case "nogoContact": return -160;
      case "wrongAction": return -140;
      case "miss":        return -45;
      case "dropped":
      case "missedZone":  return -35;
      case "earlyGrip":
      case "lateGrip":    return -25;
      case "avoided":     return o.cat === "bomb" ? 35 : 28; // inhibition pays
      default: break;
    }

    // ---- valid response
    let s = 100 * accW;

    // TIMING QUALITY — how close to the ideal moment. Not "how fast you swung".
    if (rt !== undefined) {
      const q = Math.max(0, 1 - rt / (this.tune.timingWindowMs * 2.6));
      s += 70 * q * speedW;
    }
    /**
     * SPATIAL LOCALIZATION — did you meet it at its CENTRE, or merely touch it?
     * The reward is STEPPED, not linear, because the difference between a centre
     * strike and an edge graze is a real difference in proprioceptive control and
     * a linear ramp lets an athlete who never finds the centre still bank most of
     * the points. PERFECT is worth more than twice GOOD.
     */
    if (precisionM !== undefined) {
      const zone = classifyPrecision(precisionM, radiusM ?? o.scale + 0.09);
      s += zone === "perfect" ? 55 : zone === "good" ? 22 : 4;
    }
    // DIRECTIONAL QUALITY — did you drive INTO it (advanced+)
    if (dirQ !== undefined && this.tune.requireDirection) s += 35 * Math.max(0, dirQ);

    // CONTROL, NOT VIOLENCE. Block velocity is rewarded on a curve that PEAKS
    // and then falls away: a controlled 2 m/s interception scores full marks, a
    // 9 m/s flail scores less than a gentle one. This is the anti-flail term.
    if (speed !== undefined && o.action === "block" && this.tune.minBlockSpeed > 0) {
      const ideal = this.tune.minBlockSpeed * 1.8;
      const ratio = speed / ideal;
      const ctrl = ratio <= 1 ? ratio : Math.max(0, 1 - (ratio - 1) * 0.55);
      s += 30 * ctrl;
    }
    // RETENTION / DELIVERY
    if (outcome === "released") s += 45;
    if (o.cat === "bonus") s *= 1.6;

    // STREAK — capped, so a long clean run compounds but never runs away
    s *= 1 + Math.min(0.6, this.streak * 0.02);
    // RECOVERY BONUS — a correct answer immediately after an error is worth more
    if (this.pace !== "normal") s *= 1.25;
    // BONUS-ROUND MULTIPLIER
    if (this.phase === "bonus") s *= 1 + this.bonusStage * 0.12;

    // HESITATION (§15) — Pro/GOAT only. Reaching at a bomb and pulling back is
    // not a full error, but it is not free either.
    if (o.hesitationAt !== undefined && this.tune.hesitationPenalty) s -= 20;

    return Math.round(s);
  }

  // ------------------------------------------------------- slowdown / recovery
  private triggerSlowdown(cause: AegisOutcome): void {
    this.slowdownCount++;
    // Repeated critical errors lengthen the slowdown MILDLY — enough to signal,
    // never enough to become a punishment loop (§14, §19).
    const severity = 1 + Math.min(0.5, (this.slowdownCount - 1) * 0.15);
    this.pace = "slowdown";
    this.slowdownUntil = this.t + this.tune.slowdownMs * severity;
    this.recoveryStreak = 0;
    this.slowdownCauses.push(cause);
    // back the adaptive engine off immediately — never compound an error
    this.complexity = Math.max(0.5, this.complexity - 0.25);
    this.speedMul = Math.max(0.75, this.speedMul - 0.1);
  }
  slowdownCauses: AegisOutcome[] = [];
  private enterRecovery(): void { this.pace = "recovery"; this.recoveryStreak = 0; }
  private restoreNormal(): void { this.pace = "normal"; this.recoveryStreak = 0; }

  // ---------------------------------------------------------------- adaptive
  /**
   * ADAPTIVE DIFFICULTY (§19). Two rules keep this fair:
   *   1. Move ONE OR TWO variables at a time — never all of them at once, or the
   *      athlete cannot tell what changed and the difficulty becomes arbitrary.
   *   2. Rise on a streak; fall immediately on an error. Difficulty must be
   *      quicker to forgive than it is to punish.
   */
  private onSuccess(): void {
    if (this.phase === "bonus") return; // the bonus round owns its own escalation
    if (this.settings.tier === "beginner" || this.settings.tier === "intermediate") return;
    if (this.streak > 0 && this.streak % 6 === 0) {
      this.complexity = Math.min(1.6, this.complexity + 0.08);
      this.speedMul = Math.min(1.45, this.speedMul + 0.03);
    }
    if (this.streak > 0 && this.streak % 10 === 0) {
      this.densityMul = Math.min(1.5, this.densityMul + 0.05);
      this.sizeMul = Math.max(0.75, this.sizeMul - 0.03);
    }
  }
  private onFailure(critical: boolean): void {
    this.speedMul = Math.max(0.8, this.speedMul - (critical ? 0.08 : 0.03));
    this.densityMul = Math.max(0.7, this.densityMul - (critical ? 0.08 : 0.03));
    this.sizeMul = Math.min(1.15, this.sizeMul + 0.02);
  }

  // ------------------------------------------------------------- bonus round
  private enterBonus(): void {
    this.phase = "bonus";
    this.bonusStage = 1;
    this.bonusStartT = this.t;
    this.bonusStageT = this.t;
    this.pace = "normal";
    this.bonusMisses = 0;
  }

  /**
   * BONUS ESCALATION (§20). Each stage raises the pressure, and the stages adapt
   * to the athlete's demonstrated STRENGTHS — the round exists to find the edge,
   * so it presses where the athlete is comfortable rather than where they are
   * already struggling.
   */
  private escalate(): void {
    if (this.t - this.bonusStageT < BONUS_STAGE_MS) return;
    this.bonusStage++;
    this.bonusStageT = this.t;

    // The bonus round must be GUARANTEED to end. If escalation plateaus, a strong
    // athlete rides it forever and their raw score grows without bound — which
    // would let a flawless Beginner out-rank a strong GOAT purely by surviving
    // trivial difficulty for longer. So escalation is MULTIPLICATIVE and uncapped:
    // every stage compounds, and the round therefore always terminates in the
    // athlete's own failure. That failure point IS the measurement.
    if (this.bonusStage >= MAX_BONUS_STAGE) { this.finish("maximum escalation reached"); return; }

    const recent = this.events.slice(-40);
    const rtOf = (h: "left" | "right") => {
      const v = recent.filter((e) => e.responseHand === h && e.reactionMs !== undefined).map((e) => e.reactionMs!);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
    };
    const lRT = rtOf("left"), rRT = rtOf("right");
    const acc = recent.length ? recent.filter((e) => e.correct).length / recent.length : 1;

    // if accuracy is collapsing, hold complexity and raise speed only gently —
    // press, but never shove an athlete who is already falling (§19)
    if (acc < 0.6) { this.speedMul *= 1.04; return; }

    this.speedMul *= 1.13;                                   // compounds — uncapped
    if (this.bonusStage % 2 === 0) this.densityMul *= 1.10;
    if (this.bonusStage % 3 === 0) this.sizeMul = Math.max(0.4, this.sizeMul * 0.93);
    this.complexity = Math.min(2.0, this.complexity + 0.12);

    // hand asymmetry: press the STRONG side, so the ceiling is found honestly
    if (lRT !== undefined && rRT !== undefined && Math.abs(lRT - rRT) > 45) {
      const strongIsLeft = lRT < rRT;
      this.bonusHandBias = strongIsLeft ? "left" : "right";
    }
  }
  bonusHandBias?: "left" | "right";

  // ---------------------------------------------------------------- lifecycle
  private finish(cause: string): void {
    this.failCause = cause;
    this.phase = "complete";
    this.finished = true;
  }
  stop(): void { this.finish("stopped by trainer"); }
  isFinished(): boolean { return this.finished; }

  snapshot(): AegisSnapshot {
    const positions: Record<string, Vec3> = {};
    for (const o of this.objects) if (!o.resolved) positions[o.id] = this.posOf(o);
    return {
      phase: this.phase, pace: this.pace, tMs: this.t,
      mainRemainingMs: Math.max(0, this.tune.durationMs - this.t),
      objects: this.objects.filter((o) => !o.resolved),
      positions,
      score: this.score, mainScore: this.mainScore, bonusScore: this.bonusScore,
      streak: this.streak, longestStreak: this.longestStreak,
      hits: this.hits, misses: this.misses, criticals: this.criticals,
      bonusStage: this.bonusStage, bonusMisses: this.bonusMisses,
      slowdownRemainingMs: Math.max(0, this.slowdownUntil - this.t),
      recoveryStreak: this.recoveryStreak,
      handRuleFlipped: this.handRuleFlipped,
      ruleWarningMs: Math.max(0, this.ruleWarnUntil - this.t),
      events: this.events,
      failCause: this.failCause,
      simultaneous: this.actionableCount(),
      peakSimultaneous: this.peakSimultaneous,
      peakSpeed: this.peakSpeed,
    };
  }

  /** total controller path length — feeds Movement Economy (§24) */
  pathLength(): Record<HandId, number> { return { ...this.handPath }; }
  bonusDurationMs(): number { return this.phase === "bonus" || this.failCause ? Math.max(0, this.t - this.bonusStartT) : 0; }
  slowdownTotal(): number { return this.slowdownCount; }
}
