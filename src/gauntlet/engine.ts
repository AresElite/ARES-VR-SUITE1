/**
 * GAUNTLET — a turret-barrage reaction + tracking drill for the Perform suite.
 *
 * Six turrets ring the field ahead of the athlete and open fire. Every shot is one of:
 *   PURPLE ball — BLOCK it with a hand (raw reaction).
 *   TEAL   ball — asymmetric only: BLOCK it with the LEFT hand (purple = right).
 *   BOMB        — DODGE it with your body. If you read it early and pull the TRIGGER, it
 *                 decelerates to ~50% — the tracking/prediction reward.
 *
 * Every clean block or dodge grows your STREAK, and the streak drives the fire rate and ball
 * speed UP. Three critical errors (a bomb hitting you, or a ball getting past you) reset the
 * pace back to a slower baseline. 2:30 standardized main round, then a bonus round that keeps
 * escalating until the first critical ends it.
 *
 * ASYMMETRIC adds hand selection (purple = right, teal = left). In ADVANCED and GOAT a periodic
 * SWITCH prompt flips the mapping (purple = left, teal = right) — reconfiguration under load.
 *
 * Deterministic 8ms fixed-step simulation, so a run is reproducible from its seed and can be
 * driven headlessly for verification.
 */

import { makeRng } from "@/utils/rng";
import { classifyPrecision, type PrecisionZone } from "@/ares/precision";

export type Vec3 = [number, number, number];
export type HandId = "left" | "right";
export interface HandState { pos: Vec3; vel: Vec3 }

export type GauntletTier = "beginner" | "intermediate" | "advanced" | "goat";
export type GauntletHandRule = "symmetric" | "asymmetric";
export type GauntletPhase = "main" | "bonus" | "complete";
export type ObjKind = "purple" | "teal" | "bomb";

export interface GauntletSettings {
  tier: GauntletTier;
  handRule: GauntletHandRule;
  bonusEnabled: boolean;
}

export type GauntletOutcome =
  | "blocked" | "dodged" | "slowed"
  | "miss" | "bombContact" | "wrongHand";

export const GAUNTLET_CRITICAL: GauntletOutcome[] = ["miss", "bombContact", "wrongHand"];

export interface GauntletObject {
  id: string;
  kind: ObjKind;
  turret: number;
  p0: Vec3;
  p1: Vec3;
  dir: Vec3;
  dist: number;
  spawnT: number;
  speed: number;
  slowT?: number;
  slowTraveled?: number;
  requiredHand: HandId | "either";
  scale: number;
  resolved: boolean;
  outcome?: GauntletOutcome;
  slowed?: boolean;
}

export interface GauntletEvent {
  t: number;
  phase: GauntletPhase;
  kind: ObjKind;
  outcome: GauntletOutcome;
  correct: boolean;
  critical: boolean;
  requiredHand: HandId | "either";
  responseHand?: HandId;
  reactionMs?: number;
  precisionZone?: PrecisionZone;
  streakAfter: number;
}

interface Tuning {
  speed: number;
  size: number;
  fireMs: number;
  bombRate: number;
  maxLive: number;
  handSwitch: boolean;
}

export const GAUNTLET_TUNING: Record<GauntletTier, Tuning> = {
  beginner:     { speed: 3.0, size: 0.12,  fireMs: 1500, bombRate: 0.16, maxLive: 2, handSwitch: false },
  intermediate: { speed: 4.1, size: 0.10,  fireMs: 1150, bombRate: 0.20, maxLive: 3, handSwitch: false },
  advanced:     { speed: 5.3, size: 0.085, fireMs: 900,  bombRate: 0.24, maxLive: 4, handSwitch: true  },
  goat:         { speed: 6.7, size: 0.07,  fireMs: 680,  bombRate: 0.28, maxLive: 5, handSwitch: true  },
};

export const GAUNTLET_TIERS: GauntletTier[] = ["beginner", "intermediate", "advanced", "goat"];
export const GAUNTLET_TIER_LABEL: Record<GauntletTier, string> = {
  beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", goat: "GOAT",
};

const STEP_MS = 8;
const MAIN_MS = 150_000;
const CRITICALS_TO_RESET = 3;
const SLOWDOWN_MS = 5000;
const SLOWDOWN_FACTOR = 0.55;
const BOMB_SLOW_FACTOR = 0.5;
const HEAD_R = 0.22;
const HAND_TOL = 0.11;
const PURPLE = "#8B5CF6", TEAL = "#2998AA", BOMB = "#8A90A6";

export const TURRETS: Vec3[] = (() => {
  const out: Vec3[] = [];
  const n = 6, R = 4.6;
  for (let i = 0; i < n; i++) {
    const a = (-58 + (116 * i) / (n - 1)) * (Math.PI / 180);
    const y = 1.5 + (i % 2 === 0 ? 0.28 : -0.16);
    out.push([Math.sin(a) * R, y, -Math.cos(a) * R]);
  }
  return out;
})();

export function objColor(k: ObjKind): string { return k === "purple" ? PURPLE : k === "teal" ? TEAL : BOMB; }

export interface GauntletSnapshot {
  phase: GauntletPhase;
  timeLeftMs: number;
  streak: number;
  longestStreak: number;
  score: number;
  bonusStage: number;
  pace: "normal" | "slow";
  handFlipped: boolean;
  switchWarnMs: number;
  objects: { id: string; kind: ObjKind; pos: Vec3; scale: number; slowed: boolean; requiredHand: HandId | "either" }[];
  turrets: Vec3[];
}

export interface GauntletMetrics {
  score: number;
  totalBlocks: number;
  bombsDodged: number;
  bombsSlowed: number;
  misses: number;
  bombContacts: number;
  wrongHand: number;
  accuracyPct: number;
  longestStreak: number;
  avgReactionMs: number;
  fastestReactionMs: number;
  perfectPct: number; goodPct: number; poorPct: number;
  bonusStage: number;
  bonusDurationMs: number;
  failCause?: string;
  leftBlocks: number; rightBlocks: number;
  switchesHandled: number;
}

export class GauntletEngine {
  readonly settings: GauntletSettings;
  private tune: Tuning;
  private rng: () => number;
  private t = 0;
  private acc = 0;
  private lastReal = 0;
  private started = false;
  private finished = false;
  phase: GauntletPhase = "main";
  private objects: GauntletObject[] = [];
  private nextId = 0;
  private nextFireT = 800;

  streak = 0;
  longestStreak = 0;
  score = 0;
  private criticals = 0;
  private slowUntil = 0;
  bonusStage = 0;
  private bonusStartT = 0;
  private bonusEndT = 0;
  failCause?: string;

  private handFlipped = false;
  private nextSwitchT = Infinity;
  private switchWarnUntil = 0;
  private pendingFlipAt?: number;
  switchesHandled = 0;

  readonly events: GauntletEvent[] = [];
  private listeners: ((s: GauntletSnapshot) => void)[] = [];

  constructor(settings: GauntletSettings, seed = 1) {
    this.settings = settings;
    this.tune = GAUNTLET_TUNING[settings.tier];
    this.rng = makeRng(seed);
    if (this.tune.handSwitch && settings.handRule === "asymmetric") {
      this.nextSwitchT = 30_000 + this.rng() * 18_000;
    }
  }

  subscribe(fn: (s: GauntletSnapshot) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
  }
  private emit(): void { const s = this.snapshot(); for (const f of this.listeners) f(s); }

  start(now: number): void { this.started = true; this.lastReal = now; }

  tick(now: number, hands: Record<HandId, HandState>, headPos: Vec3): void {
    if (!this.started || this.finished) { this.emit(); return; }
    this.acc += Math.min(100, now - this.lastReal);
    this.lastReal = now;
    while (this.acc >= STEP_MS) { this.acc -= STEP_MS; this.step(hands, headPos); if (this.finished) break; }
    this.emit();
  }

  private paceFactor(): number {
    const streakMul = Math.min(2.3, 1 + this.streak * 0.05);
    const bonusMul = this.phase === "bonus" ? 1 + this.bonusStage * 0.06 : 1;
    const slow = this.t < this.slowUntil ? SLOWDOWN_FACTOR : 1;
    return streakMul * bonusMul * slow;
  }

  private step(hands: Record<HandId, HandState>, headPos: Vec3): void {
    this.t += STEP_MS;

    if (this.phase === "main" && this.t >= MAIN_MS) {
      if (this.settings.bonusEnabled) { this.phase = "bonus"; this.bonusStartT = this.t; this.criticals = 0; }
      else { this.finish("main complete"); return; }
    }
    if (this.phase === "bonus") {
      this.bonusStage = Math.floor((this.t - this.bonusStartT) / 12_000);
    }

    if (this.t >= this.nextSwitchT) {
      this.switchWarnUntil = this.t + 1600;
      this.pendingFlipAt = this.t + 1600;
      this.nextSwitchT = Infinity;
    }
    if (this.pendingFlipAt && this.t >= this.pendingFlipAt) {
      this.handFlipped = !this.handFlipped;
      this.switchesHandled++;
      this.pendingFlipAt = undefined;
      this.nextSwitchT = this.t + (26_000 + this.rng() * 16_000);
    }

    if (this.t >= this.nextFireT && this.objects.filter((o) => !o.resolved).length < this.tune.maxLive) {
      this.fire();
      const gap = this.tune.fireMs / this.paceFactor();
      this.nextFireT = this.t + gap * (0.8 + this.rng() * 0.4);
    }

    this.resolveContacts(hands, headPos);
    this.expire();
  }

  private fire(): void {
    const turret = Math.floor(this.rng() * TURRETS.length);
    const p0 = TURRETS[turret];
    const isBomb = this.rng() < this.tune.bombRate;
    let kind: ObjKind;
    if (isBomb) kind = "bomb";
    else if (this.settings.handRule === "symmetric") kind = "purple";
    else kind = this.rng() < 0.5 ? "purple" : "teal";

    const p1: Vec3 = kind === "bomb"
      ? [(this.rng() - 0.5) * 0.28, 1.5 + (this.rng() - 0.5) * 0.3, -0.2]
      : [(this.rng() - 0.5) * 0.7, 1.45 + (this.rng() - 0.5) * 0.5, -0.45];
    const d: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const dist = Math.hypot(d[0], d[1], d[2]) || 1;
    const dir: Vec3 = [d[0] / dist, d[1] / dist, d[2] / dist];
    const speed = this.tune.speed * this.paceFactor() * (kind === "bomb" ? 0.9 : 1);

    const req: HandId | "either" =
      kind === "bomb" ? "either"
        : this.settings.handRule === "symmetric" ? "either"
          : this.handForBall(kind);

    this.objects.push({
      id: `g${this.nextId++}`, kind, turret, p0, p1, dir, dist,
      spawnT: this.t, speed, requiredHand: req,
      scale: this.tune.size * (kind === "bomb" ? 1.05 : 1),
      resolved: false,
    });
  }

  private handForBall(kind: ObjKind): HandId {
    const base: HandId = kind === "purple" ? "right" : "left";
    return this.handFlipped ? (base === "left" ? "right" : "left") : base;
  }

  private traveled(o: GauntletObject): number {
    if (o.slowed && o.slowT !== undefined) {
      return (o.slowTraveled ?? 0) + o.speed * BOMB_SLOW_FACTOR * (this.t - o.slowT) / 1000;
    }
    return o.speed * (this.t - o.spawnT) / 1000;
  }
  posOf(o: GauntletObject): Vec3 {
    const trav = Math.min(o.dist + 0.4, this.traveled(o));
    return [o.p0[0] + o.dir[0] * trav, o.p0[1] + o.dir[1] * trav, o.p0[2] + o.dir[2] * trav];
  }

  registerTrigger(_hand: HandId): void {
    if (this.finished) return;
    let best: GauntletObject | null = null; let bestTrav = -1;
    for (const o of this.objects) {
      if (o.resolved || o.kind !== "bomb" || o.slowed) continue;
      const trav = this.traveled(o) / o.dist;
      if (trav > 0.1 && trav < 0.95 && trav > bestTrav) { best = o; bestTrav = trav; }
    }
    if (best) {
      best.slowed = true;
      best.slowT = this.t;
      best.slowTraveled = this.traveled(best);
      this.score += 40;
      this.events.push({
        t: this.t, phase: this.phase, kind: "bomb", outcome: "slowed",
        correct: true, critical: false, requiredHand: "either", streakAfter: this.streak,
      });
    }
  }

  private resolveContacts(hands: Record<HandId, HandState>, headPos: Vec3): void {
    for (const o of this.objects) {
      if (o.resolved) continue;
      const p = this.posOf(o);

      if (o.kind === "bomb") {
        if (Math.hypot(p[0] - headPos[0], p[1] - headPos[1], p[2] - headPos[2]) < o.scale + HEAD_R) {
          this.resolve(o, "bombContact"); continue;
        }
        for (const h of ["left", "right"] as HandId[]) {
          const hs = hands[h]; if (!hs) continue;
          if (Math.hypot(p[0] - hs.pos[0], p[1] - hs.pos[1], p[2] - hs.pos[2]) < o.scale + HAND_TOL) { this.resolve(o, "bombContact", h, p, hs); break; }
        }
        continue;
      }

      for (const h of ["left", "right"] as HandId[]) {
        const hs = hands[h]; if (!hs) continue;
        const d = Math.hypot(p[0] - hs.pos[0], p[1] - hs.pos[1], p[2] - hs.pos[2]);
        if (d > o.scale + HAND_TOL) continue;
        if (o.requiredHand !== "either" && o.requiredHand !== h) { this.resolve(o, "wrongHand", h, p, hs); break; }
        this.resolve(o, "blocked", h, p, hs); break;
      }
    }
  }

  private expire(): void {
    for (const o of this.objects) {
      if (o.resolved) continue;
      if (this.traveled(o) < o.dist + 0.35) continue;
      if (o.kind === "bomb") this.resolve(o, "dodged", undefined, this.posOf(o));
      else this.resolve(o, "miss", undefined, this.posOf(o));
    }
    this.objects = this.objects.filter((o) => !o.resolved || this.t - o.spawnT < this.msFlight(o) + 700);
  }
  private msFlight(o: GauntletObject): number { return (o.dist / Math.max(0.1, o.speed)) * 1000; }

  private resolve(o: GauntletObject, outcome: GauntletOutcome, hand?: HandId, at?: Vec3, hs?: HandState): void {
    o.resolved = true; o.outcome = outcome;
    const critical = GAUNTLET_CRITICAL.includes(outcome);
    const correct = outcome === "blocked" || outcome === "dodged";

    let precisionZone: PrecisionZone | undefined;
    if (hs && at && outcome === "blocked") {
      const rel: Vec3 = [at[0] - hs.pos[0], at[1] - hs.pos[1], at[2] - hs.pos[2]];
      const sp = Math.hypot(hs.vel[0], hs.vel[1], hs.vel[2]);
      let perp = Math.hypot(rel[0], rel[1], rel[2]);
      if (sp > 0.3) {
        const vd: Vec3 = [hs.vel[0] / sp, hs.vel[1] / sp, hs.vel[2] / sp];
        const along = rel[0] * vd[0] + rel[1] * vd[1] + rel[2] * vd[2];
        if (along > 0) perp = Math.hypot(rel[0] - along * vd[0], rel[1] - along * vd[1], rel[2] - along * vd[2]);
      }
      precisionZone = classifyPrecision(perp, o.scale);
    }

    const reactionMs = correct ? Math.max(0, this.t - o.spawnT) : undefined;

    let delta = 0;
    if (outcome === "blocked") { delta = 100 + (precisionZone === "perfect" ? 60 : precisionZone === "good" ? 25 : 5) + Math.min(80, this.streak * 3); }
    else if (outcome === "dodged") { delta = 70 + Math.min(60, this.streak * 2); }
    else if (outcome === "wrongHand") delta = -40;
    else if (outcome === "miss") delta = -25;
    else if (outcome === "bombContact") delta = -60;
    this.score = Math.max(0, this.score + delta);

    if (correct) {
      this.streak++;
      if (this.streak > this.longestStreak) this.longestStreak = this.streak;
    } else if (critical) {
      this.streak = 0;
      this.criticals++;
      if (this.phase === "bonus") { this.finish(outcome === "bombContact" ? "bomb hit (bonus)" : "ball missed (bonus)"); }
      else if (this.criticals >= CRITICALS_TO_RESET) {
        this.slowUntil = this.t + SLOWDOWN_MS;
        this.criticals = 0;
      }
    }

    this.events.push({
      t: this.t, phase: this.phase, kind: o.kind, outcome, correct, critical,
      requiredHand: o.requiredHand, responseHand: hand, reactionMs, precisionZone,
      streakAfter: this.streak,
    });
  }

  private finish(cause: string): void {
    this.finished = true;
    this.phase = "complete";
    this.failCause = cause;
    this.bonusEndT = this.t;
  }

  isFinished(): boolean { return this.finished; }

  snapshot(): GauntletSnapshot {
    const timeLeftMs = this.phase === "main" ? Math.max(0, MAIN_MS - this.t) : 0;
    return {
      phase: this.phase, timeLeftMs, streak: this.streak, longestStreak: this.longestStreak,
      score: this.score, bonusStage: this.bonusStage,
      pace: this.t < this.slowUntil ? "slow" : "normal",
      handFlipped: this.handFlipped, switchWarnMs: Math.max(0, this.switchWarnUntil - this.t),
      turrets: TURRETS,
      objects: this.objects.filter((o) => !o.resolved).map((o) => ({
        id: o.id, kind: o.kind, pos: this.posOf(o), scale: o.scale, slowed: !!o.slowed, requiredHand: o.requiredHand,
      })),
    };
  }

  metrics(): GauntletMetrics {
    const ev = this.events;
    const blocks = ev.filter((e) => e.outcome === "blocked");
    const dodged = ev.filter((e) => e.outcome === "dodged");
    const slowed = ev.filter((e) => e.outcome === "slowed");
    const misses = ev.filter((e) => e.outcome === "miss");
    const bombHits = ev.filter((e) => e.outcome === "bombContact");
    const wrong = ev.filter((e) => e.outcome === "wrongHand");
    const scoreable = ev.filter((e) => e.critical || e.outcome === "blocked" || e.outcome === "dodged");
    const correct = scoreable.filter((e) => e.correct).length;
    const rts = blocks.filter((e) => e.reactionMs !== undefined).map((e) => e.reactionMs!);
    const zones = blocks.map((e) => e.precisionZone).filter(Boolean) as PrecisionZone[];
    const zc = (z: PrecisionZone) => zones.filter((x) => x === z).length;
    const pctZone = (z: PrecisionZone) => (zones.length ? Math.round((zc(z) / zones.length) * 1000) / 10 : 0);
    const mean = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0);

    return {
      score: this.score,
      totalBlocks: blocks.length,
      bombsDodged: dodged.length,
      bombsSlowed: slowed.length,
      misses: misses.length,
      bombContacts: bombHits.length,
      wrongHand: wrong.length,
      accuracyPct: scoreable.length ? Math.round((correct / scoreable.length) * 1000) / 10 : 0,
      longestStreak: this.longestStreak,
      avgReactionMs: mean(rts),
      fastestReactionMs: rts.length ? Math.round(Math.min(...rts)) : 0,
      perfectPct: pctZone("perfect"), goodPct: pctZone("good"), poorPct: pctZone("poor"),
      bonusStage: this.bonusStage,
      bonusDurationMs: this.bonusEndT > this.bonusStartT ? this.bonusEndT - this.bonusStartT : 0,
      failCause: this.failCause,
      leftBlocks: blocks.filter((e) => e.responseHand === "left").length,
      rightBlocks: blocks.filter((e) => e.responseHand === "right").length,
      switchesHandled: this.switchesHandled,
    };
  }
}
