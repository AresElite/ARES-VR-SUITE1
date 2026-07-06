import type {
  DrillDefinition,
  Hand,
  RawEvent,
  SliceDirection,
  TrialSpec,
} from "@/ares/drillTypes";
import { handSatisfiesRule } from "./InputMapper";
import { TimingEngine } from "./TimingEngine";
import { TargetPool } from "./TargetSpawner";

export type DrillState = "idle" | "countdown" | "running" | "paused" | "complete" | "aborted";

export interface DrillSnapshot {
  state: DrillState;
  elapsedMs: number;
  remainingMs: number;
  hits: number;
  errors: number;
  streak: number;
  accuracyPct: number;
  lastReactionMs?: number;
  lastEventCorrect?: boolean;
  activeTargets: number;
  msToNextBeat: number | null;
}

export type EngineEvent =
  | { type: "spawn"; spec: TrialSpec }
  | { type: "despawn"; targetId: string }
  | { type: "resolved"; event: RawEvent }
  | { type: "stateChange"; state: DrillState }
  | { type: "beat"; index: number }
  | { type: "switched"; targetId: string };

interface ActiveTarget {
  spec: TrialSpec;
  spawnClock: number;
  kind: TrialSpec["kind"];
  resolved: boolean;
}

const COUNTDOWN_MS = 3000;
const DEBUG = import.meta.env.VITE_DEBUG_DRILLS === "true";

/**
 * DrillEngine — the shared, framework-free drill state machine.
 *
 * Timing-critical state lives here in plain mutable fields, driven by the XR
 * frame clock via `update(deltaMs)`. React reads throttled snapshots for the
 * HUD; it never owns per-frame drill state. Every drill in the suite —
 * including Sport-Transfer Reality Labs — runs on this one engine.
 */
export class DrillEngine {
  readonly definition: DrillDefinition;
  readonly parameters: Record<string, unknown>;
  readonly pool: TargetPool;
  readonly timing: TimingEngine;

  private state: DrillState = "idle";
  private countdownLeft = COUNTDOWN_MS;
  private trials: TrialSpec[];
  private nextTrialIdx = 0;
  /** chainId -> pending members in order; head spawns on predecessor resolution */
  private chains = new Map<string, TrialSpec[]>();
  private orderedProgress = new Map<string, number>(); // groupId -> next seq expected
  private active = new Map<string, ActiveTarget>();
  private events: RawEvent[] = [];
  private listeners = new Set<(e: EngineEvent) => void>();
  private hits = 0;
  private errors = 0;
  private streak = 0;
  private lastReactionMs: number | undefined;
  private lastEventCorrect: boolean | undefined;
  private readonly totalDurationMs: number;
  startedAtISO = "";
  endedAtISO = "";

  constructor(
    definition: DrillDefinition,
    parameters: Record<string, unknown>,
    trials: TrialSpec[],
    poolSize: number,
  ) {
    this.definition = definition;
    this.parameters = parameters;
    // Chained trials: first member schedules normally, the rest are queued.
    const scheduled: TrialSpec[] = [];
    const byChain = new Map<string, TrialSpec[]>();
    for (const t of trials) {
      if (t.chainId) {
        const arr = byChain.get(t.chainId) ?? [];
        arr.push(t);
        byChain.set(t.chainId, arr);
      } else {
        scheduled.push(t);
      }
    }
    for (const [cid, arr] of byChain) {
      arr.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      scheduled.push(arr[0]);
      this.chains.set(cid, arr.slice(1));
    }
    this.trials = scheduled.sort((a, b) => a.spawnAt - b.spawnAt);
    this.pool = new TargetPool(poolSize);
    this.timing = new TimingEngine((parameters.bpm as number) || undefined);
    this.totalDurationMs = definition.durationMs(parameters);
  }

  subscribe(fn: (e: EngineEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: EngineEvent): void {
    if (DEBUG && e.type !== "beat") console.log("[DrillEngine]", e);
    this.listeners.forEach((fn) => fn(e));
  }

  private setState(s: DrillState): void {
    this.state = s;
    this.emit({ type: "stateChange", state: s });
  }

  start(): void {
    if (this.state !== "idle") return;
    this.startedAtISO = new Date().toISOString();
    this.countdownLeft = COUNTDOWN_MS;
    this.setState("countdown");
  }

  pause(): void {
    if (this.state !== "running") return;
    this.timing.pause();
    this.setState("paused");
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.timing.resume();
    this.setState("running");
  }

  /** Trainer stop — ends immediately and still produces a result. */
  stop(): void {
    if (this.state === "complete" || this.state === "aborted") return;
    this.endedAtISO = new Date().toISOString();
    this.expireAllActive();
    this.setState("aborted");
  }

  /** Advance the drill by one frame. Call from useFrame with delta*1000. */
  update(deltaMs: number): void {
    if (this.state === "countdown") {
      this.countdownLeft -= deltaMs;
      if (this.countdownLeft <= 0) {
        this.timing.start();
        this.setState("running");
      }
      return;
    }
    if (this.state !== "running") return;

    const beat = this.timing.tick(deltaMs);
    if (beat !== null) this.emit({ type: "beat", index: beat });
    const now = this.timing.now;

    // Spawn due trials
    while (this.nextTrialIdx < this.trials.length && this.trials[this.nextTrialIdx].spawnAt <= now) {
      const spec = this.trials[this.nextTrialIdx++];
      const slot = this.pool.acquire(spec, now);
      if (slot) {
        this.active.set(spec.id, { spec, spawnClock: now, kind: spec.kind, resolved: false });
        this.emit({ type: "spawn", spec });
      }
    }

    // Advance movement + late cue changes + expiry
    for (const [id, t] of this.active) {
      if (t.resolved) continue;
      const age = now - t.spawnClock;
      const slot = this.pool.get(id);
      if (slot && t.spec.velocity) {
        slot.pos[0] = t.spec.position[0] + (t.spec.velocity[0] * age) / 1000;
        slot.pos[1] = t.spec.position[1] + (t.spec.velocity[1] * age) / 1000;
        slot.pos[2] = t.spec.position[2] + (t.spec.velocity[2] * age) / 1000;
      } else if (slot && t.spec.lane) {
        const { radius, angularSpeed, phase, y } = t.spec.lane;
        const a = phase + (angularSpeed * age) / 1000;
        slot.pos[0] = Math.sin(a) * radius;
        slot.pos[1] = y;
        slot.pos[2] = -Math.cos(a) * radius;
      }
      if (t.spec.switchKindAt !== undefined && t.spec.switchKindTo && now >= t.spec.switchKindAt && t.kind !== t.spec.switchKindTo) {
        t.kind = t.spec.switchKindTo;
        if (t.spec.switchColor) {
          t.spec.color = t.spec.switchColor;
          t.spec.emissive = t.spec.switchColor;
        }
        this.emit({ type: "switched", targetId: id });
      }
      if (age >= t.spec.duration) this.expire(id, now);
    }

    // Complete as soon as every trial has spawned and resolved (fast athletes
    // finish early); the duration clock is only the outer bound.
    if (this.active.size === 0 && this.nextTrialIdx >= this.trials.length && [...this.chains.values()].every((c) => c.length === 0)) {
      this.endedAtISO = new Date().toISOString();
      this.setState("complete");
    }
  }

  private expire(targetId: string, now: number): void {
    const t = this.active.get(targetId);
    if (!t || t.resolved) return;
    t.resolved = true;

    if (t.kind === "go") {
      this.recordEvent({
        trialId: t.spec.groupId ?? t.spec.id,
        timestamp: now,
        targetId,
        targetPosition: this.posOf(targetId),
        expectedAction: t.spec.requiredDirection ?? "hit",
        actualAction: "none",
        correct: false,
        errorType: "miss",
        zone: t.spec.zone,
      });
    } else if (t.kind === "noGo") {
      // Withholding on a no-go is a success
      this.recordEvent({
        trialId: t.spec.groupId ?? t.spec.id,
        timestamp: now,
        targetId,
        expectedAction: "withhold",
        actualAction: "withheld",
        correct: true,
        errorType: "correctRejection",
        zone: t.spec.zone,
      });
    }
    // distractors expire silently
    this.despawn(targetId);
  }

  private despawn(targetId: string): void {
    const t = this.active.get(targetId);
    this.active.delete(targetId);
    this.pool.release(targetId);
    this.emit({ type: "despawn", targetId });
    // chained spawning: releasing a chain member queues the next one
    const cid = t?.spec.chainId;
    if (cid && this.state === "running") {
      const pending = this.chains.get(cid);
      if (pending && pending.length > 0) {
        const next = pending.shift()!;
        const gap = next.chainGapMs ?? 0;
        const spec = { ...next, spawnAt: this.timing.now + gap };
        // insert into schedule keeping order
        let i = this.nextTrialIdx;
        while (i < this.trials.length && this.trials[i].spawnAt <= spec.spawnAt) i++;
        this.trials.splice(i, 0, spec);
      }
    }
  }

  private expireAllActive(): void {
    const now = this.timing.now;
    for (const id of [...this.active.keys()]) this.expire(id, now);
  }

  private minSeqInGroup(groupId: string): number {
    let min = Number.POSITIVE_INFINITY;
    for (const s of this.active.values()) {
      if (s.spec.groupId === groupId && !s.resolved && s.kind === "go") {
        min = Math.min(min, s.spec.seq ?? 0);
      }
    }
    return min === Number.POSITIVE_INFINITY ? 0 : min;
  }

  private posOf(targetId: string): { x: number; y: number; z: number } | undefined {
    const slot = this.pool.get(targetId);
    return slot ? { x: slot.pos[0], y: slot.pos[1], z: slot.pos[2] } : undefined;
  }

  /**
   * Register a hit on a target (ray trigger, touch, or desktop click).
   * Evaluates go/no-go, hand rules, direction rules, and group resolution.
   */
  registerHit(targetId: string, hand: Hand, direction?: SliceDirection): void {
    if (this.state !== "running") return;
    const t = this.active.get(targetId);
    if (!t || t.resolved) return;
    const now = this.timing.now;
    const reactionMs = now - t.spawnClock;
    const pos = this.posOf(targetId);

    let correct = true;
    let errorType: string | undefined;

    // Ordered groups: only the lowest unresolved seq is a valid strike.
    if (t.spec.groupMode === "ordered" && t.spec.groupId && t.kind === "go") {
      const expected = this.orderedProgress.get(t.spec.groupId) ?? this.minSeqInGroup(t.spec.groupId);
      if ((t.spec.seq ?? 0) !== expected) {
        // wrong order: record error, keep the target alive for retry
        this.recordEvent({
          trialId: t.spec.groupId,
          timestamp: now,
          targetId,
          targetPosition: pos,
          expectedAction: `seq:${expected}`,
          actualAction: `seq:${t.spec.seq ?? 0}`,
          correct: false,
          reactionMs,
          hand,
          errorType: "orderError",
          zone: t.spec.zone,
        });
        return;
      }
      this.orderedProgress.set(t.spec.groupId, expected + 1);
    }

    if (t.kind === "noGo") {
      correct = false;
      errorType = "noGoFailure";
    } else if (t.kind === "distractor") {
      correct = false;
      errorType = "distractorHit";
    } else {
      if (!handSatisfiesRule(hand, t.spec.requiredHand)) {
        correct = false;
        errorType = "wrongHand";
      } else if (t.spec.requiredDirection && direction && direction !== t.spec.requiredDirection) {
        correct = false;
        errorType = "wrongDirection";
      }
    }

    this.recordEvent({
      trialId: t.spec.groupId ?? t.spec.id,
      timestamp: now,
      targetId,
      targetPosition: pos,
      expectedAction:
        t.kind === "noGo"
          ? "withhold"
          : (t.spec.requiredDirection ?? (t.spec.requiredHand ? `hit:${t.spec.requiredHand}` : "hit")),
      actualAction: direction ?? `hit:${hand}`,
      correct,
      reactionMs,
      hand,
      errorType,
      zone: t.spec.zone,
    });

    const mode = t.spec.groupMode ?? "single";
    if (mode === "ordered" && t.spec.groupId && !correct && errorType === undefined) {
      // handled below
    }
    t.resolved = true;
    this.despawn(targetId);

    if (t.spec.groupId) {
      if (mode === "single") {
        // first hit resolves the whole group
        for (const [id, sibling] of [...this.active]) {
          if (sibling.spec.groupId === t.spec.groupId && !sibling.resolved) {
            sibling.resolved = true;
            this.despawn(id);
          }
        }
      } else if (mode === "all") {
        // group completes when no go members remain
        const goLeft = [...this.active.values()].some(
          (s) => s.spec.groupId === t.spec.groupId && !s.resolved && s.kind === "go",
        );
        if (!goLeft) {
          for (const [id, sibling] of [...this.active]) {
            if (sibling.spec.groupId === t.spec.groupId && !sibling.resolved) {
              sibling.resolved = true;
              this.despawn(id);
            }
          }
        }
      } else if (mode === "ordered") {
        const done = [...this.active.values()].every(
          (s) => s.spec.groupId !== t.spec.groupId || s.resolved || s.kind !== "go",
        );
        if (done) {
          for (const [id, sibling] of [...this.active]) {
            if (sibling.spec.groupId === t.spec.groupId && !sibling.resolved) {
              sibling.resolved = true;
              this.despawn(id);
            }
          }
        }
      }
    }
  }

  /** A press with no live go target = false start. */
  registerBackgroundPress(hand: Hand): void {
    if (this.state !== "running") return;
    const anyGoLive = [...this.active.values()].some((t) => !t.resolved && t.kind === "go");
    if (anyGoLive) return; // near-miss on geometry; don't punish as false start
    this.recordEvent({
      trialId: `bg-${Math.round(this.timing.now)}`,
      timestamp: this.timing.now,
      expectedAction: "wait",
      actualAction: `press:${hand}`,
      correct: false,
      hand,
      errorType: "falseStart",
    });
  }

  private recordEvent(e: RawEvent): void {
    this.events.push(e);
    if (e.errorType === "correctRejection") {
      // discipline success — HUD counts it as a hit but it's excluded from RT stats
      this.hits += 1;
      this.streak += 1;
    } else if (e.correct) {
      this.hits += 1;
      this.streak += 1;
      this.lastReactionMs = e.reactionMs;
    } else {
      this.errors += 1;
      this.streak = 0;
    }
    this.lastEventCorrect = e.correct;
    this.emit({ type: "resolved", event: e });
  }

  getEvents(): RawEvent[] {
    return this.events;
  }

  getState(): DrillState {
    return this.state;
  }

  get countdownRemaining(): number {
    return Math.max(0, this.countdownLeft);
  }

  getSnapshot(): DrillSnapshot {
    const resolvedScoreable = this.hits + this.errors;
    return {
      state: this.state,
      elapsedMs: this.timing.now,
      remainingMs: Math.max(0, this.totalDurationMs - this.timing.now),
      hits: this.hits,
      errors: this.errors,
      streak: this.streak,
      accuracyPct: resolvedScoreable ? Math.round((this.hits / resolvedScoreable) * 100) : 100,
      lastReactionMs: this.lastReactionMs,
      lastEventCorrect: this.lastEventCorrect,
      activeTargets: this.active.size,
      msToNextBeat: this.timing.msToNextBeat(),
    };
  }
}
