import { KeystoneEngine, type Body, type Tracked } from "@/keystone/KeystoneEngine";
import { computeKeyMetrics } from "@/keystone/metrics";
import { buildPhase, validateEndpoint, makeEndpoint, NEUTRAL, SAFE, type V3 } from "@/keystone/patterns";
import { TIER_ORDER, TIER_LABEL, tuningFor } from "@/keystone/tiers";
import type { KeyTier, KeyMode, KeySettings, StimulusKind } from "@/keystone/types";
import { makeRng } from "@/utils/rng";

const issues: Record<string, number> = {};
const flag = (k: string) => { issues[k] = (issues[k] ?? 0) + 1; };

// ============================================================ 1. SAFETY
// This is the drill that moves the athlete's own body. A bad endpoint here is not
// a missed target — it is a shoulder at end range, or two controllers arriving at
// the same point in space, which is real knuckles.
const KINDS: StimulusKind[] = [
  "align","expand","compress","rotate","counter","pulse","hold","release","redirect",
  "absorb","stabilize","transition","noGo","cancel","reverse","mirror","split","sync","desync","recovery",
];
let endpoints = 0;
for (const tier of TIER_ORDER) {
  const tune = tuningFor(tier, "training");
  for (let i = 0; i < 24000; i++) {
    const rng = makeRng(i * 13 + tier.length);
    const kind = KINDS[i % KINDS.length];
    const ph = buildPhase(kind, tune, rng, 0);
    endpoints++;
    for (const v of validateEndpoint(ph.endpoint)) flag(`SAFETY:${v}`);
    if (ph.endpoint.holdMs > SAFE.maxHoldMs) flag("SAFETY:hold exceeds safe duration");
  }
}
// Adversarial: force the generator to ask for the WORST possible endpoints and
// confirm the clamp catches every one. A rejection loop could starve here; a
// clamp cannot, which is exactly why it is a clamp.
const t0 = tuningFor("goat", "training");
const nasty: [V3, V3][] = [
  [[0, 1.62, 0], [0, 1.62, 0]],            // both hands inside the head
  [[0, 1.6, 0], [0.01, 1.6, 0]],           // hands on top of each other
  [[-3, 4, 2], [3, -1, 2]],                // wildly out of range, behind the body
  [[0.9, 1.2, -0.3], [-0.9, 1.2, -0.3]],   // fully crossed arms
  [[0, 2.6, -0.1], [0, 0.3, -0.1]],        // extreme overhead + floor
];
for (const [l, r] of nasty) {
  const ep = makeEndpoint(l, r, t0);
  const bad = validateEndpoint(ep);
  endpoints++;
  if (bad.length) for (const b of bad) flag(`SAFETY(adversarial):${b}`);
}

// ============================================== 2. ASSESSMENT REPEATABILITY
for (const tier of TIER_ORDER) {
  const tune = tuningFor(tier, "assessment");
  if (tune.rhythmVariance !== 0) flag("ASSESS:rhythm is not fixed");
  if (tune.predictiveMix !== 0.5) flag("ASSESS:predictive/reactive mix is not counterbalanced");
  const a = JSON.stringify(protocol(tier, 777));
  const b = JSON.stringify(protocol(tier, 777));
  const c = JSON.stringify(protocol(tier, 778));
  if (a !== b) flag("ASSESS:same seed produced a DIFFERENT protocol (not repeatable)");
  if (a === c) flag("ASSESS:different seeds produced an identical protocol");
}
function protocol(tier: KeyTier, seed: number) {
  const tune = tuningFor(tier, "assessment");
  const rng = makeRng(seed);
  return Array.from({ length: 10 }, () => {
    const k = KINDS[Math.floor(rng() * KINDS.length)];
    const p = buildPhase(k, tune, rng, 0);
    return [k, p.endpoint.left.map((x) => x.toFixed(3)), p.endpoint.right.map((x) => x.toFixed(3)), p.bilateralOffsetMs | 0];
  });
}

// ================================================== 3. SYNTHETIC ATHLETE
/**
 * Human limits: reaction latency, a hand-speed ceiling, and TREMOR. The tremor
 * matters more here than in any other drill — this is the only one where holding
 * still is the task, so an athlete with perfectly rigid hands would make the
 * stabilization measurement meaningless.
 */
function run(tier: KeyTier, mode: KeyMode, skill: number, seed: number, reckless = false) {
  const settings: KeySettings = { tier, mode, bonusEnabled: mode === "training" };
  const eng = new KeystoneEngine(settings, seed);
  const rng = makeRng(seed * 5 + 7);
  eng.start(0);

  const mk = (p: V3): Tracked => ({ pos: [...p] as V3, vel: [0, 0, 0], yaw: 0, pitch: 0 });
  const body: Body = { head: mk(NEUTRAL.head), left: mk(NEUTRAL.left), right: mk(NEUTRAL.right) };

  const latency = 520 - skill * 250;
  const maxSpeed = reckless ? 7.5 : 1.9 + skill * 1.9;
  const tremor = reckless ? 0.030 : (1 - skill) * 0.020 + 0.003;
  const aimErr = reckless ? 0.10 : (1 - skill) * 0.09;

  let now = 0;
  const CAP = 22 * 60 * 1000;
  let goSeen = 0;
  let lastStage = "";

  while (!eng.isFinished() && now < CAP) {
    now += 16;
    const s = eng.snapshot();
    if (s.stage === "go" && lastStage !== "go") goSeen = s.tMs;
    lastStage = s.stage;
    const ph = eng.currentPhase();

    for (const h of ["left", "right"] as const) {
      const seg = body[h];
      let dest: V3 = h === "left" ? [...NEUTRAL.left] as V3 : [...NEUTRAL.right] as V3;

      if (ph && (s.stage === "go" || s.stage === "hold")) {
        const role = ph.roles[h];
        const inhibit = ph.kind === "noGo" || ph.kind === "cancel";
        // a competent athlete does NOT move a segment told to stabilize/hold/inhibit
        // "hold" TRAVELS then stays. "stabilize" never moves. They are opposites.
        const shouldMove = !inhibit && (role === "move" || role === "lead"
          || role === "delay" || role === "oppose" || role === "hold");
        if (reckless || shouldMove) {
          const since = s.tMs - goSeen;
          const tgt = ph.endpoint[h];
          // A competent athlete PLAYS TO THE BEAT: they leave late enough to
          // arrive ON the due time, rather than sprinting there and standing
          // around. Arriving early is an error here, exactly as it should be.
          const travel = Math.hypot(tgt[0] - seg.pos[0], tgt[1] - seg.pos[1], tgt[2] - seg.pos[2]);
          const needMs = (travel / maxSpeed) * 1000;
          const dueIn = ph.dueMs - since;
          const ready = reckless
            || (since >= latency * (0.85 + rng() * 0.3) && dueIn <= needMs + 90);
          if (ready) {
            dest = [
              tgt[0] + (rng() - 0.5) * aimErr,
              tgt[1] + (rng() - 0.5) * aimErr,
              tgt[2] + (rng() - 0.5) * aimErr,
            ];
          } else {
            dest = [...seg.pos] as V3;   // wait, poised
          }
        } else if (role === "hold" || role === "stabilize") {
          // hold where you are — but a human is never perfectly still
          dest = [...seg.pos] as V3;
        }
      }

      // TREMOR — the reason stabilization is measurable at all
      dest = [
        dest[0] + (rng() - 0.5) * tremor,
        dest[1] + (rng() - 0.5) * tremor,
        dest[2] + (rng() - 0.5) * tremor,
      ];

      const prev = seg.pos;
      const dx = dest[0] - prev[0], dy = dest[1] - prev[1], dz = dest[2] - prev[2];
      const d = Math.hypot(dx, dy, dz);
      const maxStep = maxSpeed * 0.016;
      const f = d > maxStep ? maxStep / d : 1;
      const np: V3 = [prev[0] + dx * f, prev[1] + dy * f, prev[2] + dz * f];
      seg.vel = [(np[0] - prev[0]) / 0.016, (np[1] - prev[1]) / 0.016, (np[2] - prev[2]) / 0.016];
      seg.pos = np;
    }

    // head follows the commanded yaw when the pattern asks for it
    if (ph?.endpoint.headYaw !== undefined && (s.stage === "go" || s.stage === "hold")) {
      const want = ph.endpoint.headYaw;
      body.head.yaw = (body.head.yaw ?? 0) + (want - (body.head.yaw ?? 0)) * (0.1 + skill * 0.1);
    } else {
      body.head.yaw = (body.head.yaw ?? 0) * 0.9;
    }

    eng.tick(now, body);
  }
  return { eng, m: computeKeyMetrics(eng, settings) };
}

// ==================================================================== BATTERY
console.log(`SAFETY: ${endpoints.toLocaleString()} endpoints validated (incl. adversarial worst-cases)`);
console.log("");
console.log("TIER                        MODE       SYNC%  PHASE%  INIT  BONUS  RATING   WBS  VMC  BII  POS  TSI  STB  ADP  INH  ECO  RRS");
let n = 0;
for (const tier of TIER_ORDER) {
  for (const mode of ["training", "assessment"] as KeyMode[]) {
    const { eng, m } = run(tier, mode, 0.93, 400 + n);
    n++;
    console.log(
      TIER_LABEL[tier].padEnd(27), mode.padEnd(10),
      String(m.synchronizationAccuracyPct).padStart(5), String(m.phaseAccuracyPct).padStart(6),
      String(m.initiationMs).padStart(5), String(m.bonusStage).padStart(5),
      String(m.compositeRating).padStart(7),
      String(m.wholeBodySync).padStart(4), String(m.visualMotorCoupling).padStart(4),
      String(m.bilateralIntegration).padStart(4), String(m.posturalOrganization).padStart(4),
      String(m.temporalSync).padStart(4), String(m.stabilizationIndex).padStart(4),
      String(m.motorAdaptability).padStart(4), String(m.inhibitionCancellation).padStart(4),
      String(m.economyIndex).padStart(4), String(m.recoveryResilience).padStart(4),
    );
    // ---- INVARIANTS
    if (!eng.isFinished()) flag("ENGINE:session never terminated");
    if (m.events === 0) flag("ENGINE:no events ran");
    if (mode === "assessment" && m.ranked) flag("LEADERBOARD:assessment was RANKED");
    if (mode === "assessment" && eng.complexity !== 1) flag("ASSESS:assessment ADAPTED (must not)");
    if (mode === "assessment" && eng.recoveryAttempts > 0) flag("ASSESS:assessment entered recovery (must not)");
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === "number" && !Number.isFinite(v)) flag(`METRIC:NaN/Inf in ${k}`);
    }
    for (const i of ["wholeBodySync","visualMotorCoupling","bilateralIntegration","posturalOrganization",
      "temporalSync","stabilizationIndex","motorAdaptability","inhibitionCancellation",
      "economyIndex","recoveryResilience"] as const) {
      if (m[i] < 0 || m[i] > 100) flag(`METRIC:${i} outside 0-100`);
    }
  }
}


for (const tier of ["beginner","intermediate","goat"] as KeyTier[]) {
  const { eng } = run(tier, "training", 0.93, 999);
  const d: Record<string, number> = {};
  for (const x of eng.log) d[x.outcome] = (d[x.outcome] ?? 0) + 1;
  const tot = eng.log.length || 1;
  console.log(`${tier.padEnd(13)} ${Object.entries(d).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+" "+Math.round(v/tot*100)+"%").join("  ")}`);
  const te = eng.log.filter(x=>x.timingErrorMs!==undefined).map(x=>x.timingErrorMs!);
  const med = te.slice().sort((a,b)=>a-b)[te.length>>1] ?? 0;
  console.log(`              timing median ${med|0}ms (window ±${eng.tune.timingWindowMs})  onsets ${eng.log.filter(x=>x.initiationMs!==undefined).length}/${eng.log.length}`);
}
console.log("");

// ---- ANTI-EXPLOIT: thrashing must not beat control
const clean = run("goat", "training", 0.9, 8001, false);
const flail = run("goat", "training", 0.9, 8002, true);
console.log("");
console.log("ANTI-EXPLOIT (GOAT, equal skill):");
console.log(`  controlled : rating ${clean.m.compositeRating}  sync ${clean.m.synchronizationAccuracyPct}%  stability ${clean.m.stabilizationControl}  economy ${clean.m.economyIndex}  pathRatio ${clean.m.meanPathRatio}`);
console.log(`  thrashing  : rating ${flail.m.compositeRating}  sync ${flail.m.synchronizationAccuracyPct}%  stability ${flail.m.stabilizationControl}  economy ${flail.m.economyIndex}  pathRatio ${flail.m.meanPathRatio}`);
if (flail.m.compositeRating > clean.m.compositeRating) flag("EXPLOIT:thrashing outscores controlled coordination");
if (flail.m.synchronizationAccuracyPct >= clean.m.synchronizationAccuracyPct) flag("EXPLOIT:thrashing matches controlled synchronization");
// NOTE: comparing raw economy/stability indices between these two is meaningless —
// the thrasher fails out of nearly every event before travelling anywhere, so its
// path is short and its "economy" looks superb. What matters is that it cannot
// RANK, and it cannot SYNCHRONIZE. Both hold.

// ---- LEADERBOARD FAIRNESS
const pb = run("beginner", "training", 1.0, 8003);
const sg = run("goat", "training", 0.88, 8004);
console.log("");
console.log("LEADERBOARD FAIRNESS:");
console.log(`  perfect Beginner : ${pb.m.compositeRating}`);
console.log(`  strong GOAT      : ${sg.m.compositeRating}`);
if (pb.m.compositeRating > sg.m.compositeRating) flag("LEADERBOARD:perfect Beginner outranks strong GOAT");

console.log("");
const keys = Object.keys(issues);
console.log(keys.length
  ? "ISSUES:\n" + keys.map((k) => `  ${k} x${issues[k]}`).join("\n")
  : "0 ISSUES — safety envelope, assessment repeatability, metric ranges, anti-exploit, and leaderboard fairness all hold");
