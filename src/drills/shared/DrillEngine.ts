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
const DEBUG = (import.meta as { env?: Record<string, string> }).env?.VITE_DEBUG_DRILLS === "true";

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
  private gridQueue = new Map<number, TrialSpec[]>(); // gridSeq -> members (spawn on prev grid completion)
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
      if ((t.gridSeq ?? 0) > 0) {
        const arr = this.gridQueue.get(t.gridSeq!) ?? [];
        arr.push(t);
        this.gridQueue.set(t.gridSeq!, arr);
        continue;
      }
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

  /** Adaptive protocols: drop everything unspawned; completes once the
      currently-active targets resolve (staircase termination). */
  finishEarly(): void {
    this.nextTrialIdx = this.trials.length;
    this.chains.clear();
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
      this.definition.onSpawnAdapt?.(spec, this.getSnapshot(), { finishEarly: () => this.finishEarly() });
      this.resolveSpawnOverlap(spec);
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
      if (slot && t.spec.wander) {
        // bounded free-space oscillation around the anchor position
        const w = t.spec.wander;
        const s = age / 1000;
        slot.pos[0] = t.spec.position[0] + w.ax * Math.sin(w.wx * s + w.px);
        slot.pos[1] = t.spec.position[1] + w.ay * Math.sin(w.wy * s + w.py);
        slot.pos[2] = t.spec.position[2];
      } else if (slot && t.spec.velocity) {
        slot.pos[0] = t.spec.position[0] + (t.spec.velocity[0] * age) / 1000;
        slot.pos[1] = t.spec.position[1] + (t.spec.velocity[1] * age) / 1000;
        slot.pos[2] = t.spec.position[2] + (t.spec.velocity[2] * age) / 1000;
      } else if (slot && t.spec.lane) {
        const { radius, angularSpeed, phase, y } = t.spec.lane;
        // frontal orbit: a ring IN FRONT of the athlete, never around them
        const a = phase + (angularSpeed * age) / 1000;
        slot.pos[0] = Math.sin(a) * radius;
        slot.pos[1] = y + Math.cos(a) * radius * 0.55;
        slot.pos[2] = -0.9;
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

    // Hard-stop formats (fixed 60s drills) end exactly on the clock.
    if (this.definition.hardStop && now >= this.totalDurationMs - 1500) {
      this.chains.clear();
      this.expireAllActive();
      this.endedAtISO = new Date().toISOString();
      this.setState("complete");
      return;
    }

    // Complete as soon as every trial has spawned and resolved (fast athletes
    // finish early); the duration clock is only the outer bound.
    if (this.active.size === 0 && this.nextTrialIdx >= this.trials.length && this.gridQueue.size === 0 && [...this.chains.values()].every((c) => c.length === 0)) {
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

  /** completion-driven grid advance (Schulte): spawn grid `seq` now. */
  private spawnGrid(seq: number): void {
    const members = this.gridQueue.get(seq);
    if (!members || members.length === 0) return;
    this.gridQueue.delete(seq);
    const now = this.timing.now;
    const insert = (spec: TrialSpec) => {
      let i = this.nextTrialIdx;
      while (i < this.trials.length && this.trials[i].spawnAt <= spec.spawnAt) i++;
      this.trials.splice(i, 0, spec);
    };
    let cd = 0;
    // 3-2-1-GO between grids so the athlete can recenter and prep
    if (this.definition.interTrialCountdown) {
      cd = 3000;
      const z = members[0].position[2];
      const steps: [string, number][] = [["3", 0], ["2", 800], ["1", 1600], ["GO", 2400]];
      for (const [label, dt] of steps) {
        insert({
          id: `cd-${seq}-${label}`, spawnAt: now + dt, duration: 760, kind: "distractor",
          zone: "center", position: [0, 1.5, z], color: "#2998AA", emissive: "#7FD3DE",
          shape: "diamond", scale: 0.001, label,
          meta: { decor: true, labelInside: true, labelSize: label === "GO" ? 0.14 : 0.2, labelColor: "#7FD3DE" },
        });
      }
    }
    const at = now + cd + 200;
    for (const m of members) insert({ ...m, spawnAt: at });
  }

  private expireAllActive(): void {
    const now = this.timing.now;
    for (const id of [...this.active.keys()]) this.expire(id, now);
  }

  /**
   * Athlete fairness: a new target must never spawn overlapping a live one
   * (striking one would clip the other). Static, ungrouped, scoreable spawns
   * are nudged to the clearest nearby offset. Grid/pad sets (groupId) and
   * moving stimuli are left exactly where their drill placed them.
   */
  private resolveSpawnOverlap(spec: TrialSpec): void {
    if (spec.decor || spec.meta?.decor || spec.groupId || spec.velocity || spec.lane || spec.wander) return;
    const minDist = (other: TrialSpec) => (spec.scale + other.scale) * 1.6 + 0.02;
    const clear = (px: number, py: number): number => {
      let worst = Number.POSITIVE_INFINITY;
      for (const t of this.active.values()) {
        if (t.resolved || t.spec.decor || t.spec.meta?.decor || t.spec.velocity || t.spec.lane || t.spec.wander) continue;
        const slot = this.pool.get(t.spec.id);
        const ox = slot ? slot.pos[0] : t.spec.position[0];
        const oy = slot ? slot.pos[1] : t.spec.position[1];
        const d = Math.hypot(px - ox, py - oy) - minDist(t.spec);
        worst = Math.min(worst, d);
      }
      return worst;
    };
    if (clear(spec.position[0], spec.position[1]) >= 0) return;
    const offsets: [number, number][] = [
      [0.16, 0], [-0.16, 0], [0, 0.13], [0, -0.13],
      [0.16, 0.13], [-0.16, 0.13], [0.16, -0.13], [-0.16, -0.13],
    ];
    let best: [number, number] = [spec.position[0], spec.position[1]];
    let bestClear = clear(best[0], best[1]);
    for (const [dx, dy] of offsets) {
      const px = Math.max(-0.9, Math.min(0.9, spec.position[0] + dx));
      const py = Math.max(0.95, Math.min(1.9, spec.position[1] + dy));
      const c = clear(px, py);
      if (c > bestClear) {
        bestClear = c;
        best = [px, py];
      }
    }
    // fallback: push directly away from the nearest offender until clear
    if (bestClear < 0) {
      let nx = 0;
      let ny = 0;
      let nd = Number.POSITIVE_INFINITY;
      let nSpec: TrialSpec | null = null;
      for (const t of this.active.values()) {
        if (t.resolved || t.spec.decor || t.spec.meta?.decor || t.spec.velocity || t.spec.lane || t.spec.wander) continue;
        const slot = this.pool.get(t.spec.id);
        const ox = slot ? slot.pos[0] : t.spec.position[0];
        const oy = slot ? slot.pos[1] : t.spec.position[1];
        const d = Math.hypot(spec.position[0] - ox, spec.position[1] - oy);
        if (d < nd) {
          nd = d;
          nx = ox;
          ny = oy;
          nSpec = t.spec;
        }
      }
      if (nSpec) {
        const need = minDist(nSpec) + 0.015;
        let vx = spec.position[0] - nx;
        let vy = spec.position[1] - ny;
        const len = Math.hypot(vx, vy) || 1;
        vx /= len;
        vy /= len;
        for (const dir of [
          [vx, vy],
          [-vy, vx],
          [vy, -vx],
          [-vx, -vy],
        ] as const) {
          const px = Math.max(-0.9, Math.min(0.9, nx + dir[0] * need));
          const py = Math.max(0.95, Math.min(1.9, ny + dir[1] * need));
          if (clear(px, py) >= 0) {
            best = [px, py];
            bestClear = 0;
            break;
          }
        }
      }
    }
    spec.position = [best[0], best[1], spec.position[2]];
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
  registerHit(targetId: string, hand: Hand, direction?: SliceDirection, precisionM?: number): void {
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
          // trial-paced advance: completing a grid spawns the next one
          if (t.spec.gridSeq !== undefined) this.spawnGrid((t.spec.gridSeq ?? 0) + 1);
        }
      }
    }
  }

  /**
   * Trigger response (index trigger click). Routes to the currently live
   * stimulus — the ball in flight — evaluating hand rules; with no live
   * stimulus it counts as a false start.
   */
  registerTriggerResponse(hand: Hand): void {
    if (this.state !== "running") return;
    let earliest: { id: string; spawn: number } | null = null;
    for (const [id, t] of this.active) {
      if (t.resolved || t.spec.decor || t.spec.meta?.decor) continue;
      if (!earliest || t.spawnClock < earliest.spawn) earliest = { id, spawn: t.spawnClock };
    }
    if (earliest) this.registerHit(earliest.id, hand);
    else this.registerBackgroundPress(hand);
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
