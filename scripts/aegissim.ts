import { AegisEngine, type HandState, type HandId } from "@/aegis/ContinuousEngine";
import { computeAegisMetrics } from "@/aegis/metrics";
import { validate, makeTrajectory, bezier, SAFE } from "@/aegis/trajectory";
import { TIER_ORDER, TIER_TUNING, modeAllowed, handRuleAllowed } from "@/aegis/tiers";
import type { AegisMode, HandRule, AegisTier, AegisCategory } from "@/aegis/types";
import { makeRng } from "@/utils/rng";

const issues: Record<string, number> = {};
const flag = (k: string) => { issues[k] = (issues[k] ?? 0) + 1; };

// ---------------------------------------------------------------- 1. SAFETY
// Hammer the trajectory generator. Every path an athlete could ever be shown.
let trajN = 0;
const cats: AegisCategory[] = ["left", "right", "either", "bomb", "bonus", "nogo"];
for (const tier of TIER_ORDER) {
  const tune = TIER_TUNING[tier];
  for (let i = 0; i < 40000; i++) {
    const rng = makeRng(i * 31 + tier.length);
    const cat = cats[i % cats.length];
    const cx = 0.4 + (i % 20) / 10; // sweep complexity incl. adaptive overshoot
    const { p0, ctrl, p1 } = makeTrajectory(cat, tune, rng, cx);
    trajN++;
    for (const v of validate(p0, ctrl, p1, cat)) flag(`SAFETY:${v}`);
    // sample the flown path for reach + behind-athlete violations
    for (let s = 0; s <= 10; s++) {
      const q = bezier(p0, ctrl, p1, s / 10);
      if (q[2] > SAFE.maxZ + 0.01) flag("SAFETY:path goes behind athlete");
    }
    if (Math.abs(p1[0]) > SAFE.maxLateral + 1e-6) flag("SAFETY:arrival beyond lateral reach");
    if (p1[1] > SAFE.maxY || p1[1] < SAFE.minY) flag("SAFETY:arrival beyond vertical reach");
  }
}

// -------------------------------------------------------- 2. SYNTHETIC ATHLETE
/**
 * A SYNTHETIC ATHLETE WITH HUMAN LIMITS.
 *
 * The first version of this had instant reactions and unlimited hand speed, so
 * it scored 100% at every tier and NEVER failed the bonus round — which hid the
 * fact that escalation had plateaued. A verification harness that cannot fail is
 * worthless. So this athlete has the three limits a real one has:
 *
 *   LATENCY     it cannot respond before its reaction time has elapsed
 *   HAND SPEED  it cannot move its hands faster than a human arm
 *   COMMITMENT  once it goes for an object it is committed; it cannot
 *               instantaneously re-target, so dense waves genuinely overload it
 *
 * Those three together mean the bonus round terminates on its own, exactly as a
 * real athlete's would — and the stage it terminates at is a real signal.
 */
function runSession(tier: AegisTier, mode: AegisMode, handRule: HandRule, skill: number, seed: number, reckless = false) {
  const eng = new AegisEngine({ tier, mode, handRule, bonusEnabled: true }, seed);
  const rng = makeRng(seed * 7 + 3);
  eng.start(0);
  const hands: Record<HandId, HandState> = {
    left: { pos: [-0.3, 1.3, -0.25], vel: [0, 0, 0], gripping: false },
    right: { pos: [0.3, 1.3, -0.25], vel: [0, 0, 0], gripping: false },
  };
  const head: [number, number, number] = [0, 1.6, 0];

  // human limits, scaled by skill
  const latencyMs = 460 - skill * 230;          // 230ms elite -> 460ms novice
  // A RECKLESS athlete is not simply a fast one. They thrash: they swing far
  // harder than the object needs, they overshoot its centre, and they burn
  // enormous controller path doing it. That is the behaviour the scoring model
  // has to refuse to reward.
  const maxHandSpeed = reckless ? 9.0 : 2.6 + skill * 2.2; // m/s
  const spatialErr = reckless ? 0.14 : (1 - skill) * 0.10;
  const thrash = reckless ? 0.10 : 0;
  const committed: Record<HandId, { id: string; at: number } | null> = { left: null, right: null };

  let now = 0;
  const CAP = 20 * 60 * 1000;
  while (!eng.isFinished() && now < CAP) {
    now += 16;
    const snap = eng.snapshot();
    const live = snap.objects.filter((o) => !o.resolved).sort((a, b) => a.arriveT - b.arriveT);

    for (const h of ["left", "right"] as HandId[]) {
      const rest: [number, number, number] = [h === "left" ? -0.3 : 0.3, 1.3, -0.25];
      hands[h].gripping = false;

      // held object: retain, then deliver to the release zone if required
      const heldObj = snap.objects.find((o) => o.heldBy === h);
      if (heldObj) {
        const held = snap.tMs - (heldObj.heldSince ?? snap.tMs);
        const tune = TIER_TUNING[tier];
        hands[h].gripping = held < tune.retentionMs + 70;
        let dest = hands[h].pos;
        if (tune.requireRelease && heldObj.releaseZone && held > tune.retentionMs * 0.5) dest = heldObj.releaseZone;
        step(h, dest);
        continue;
      }

      // stay committed unless the object is gone
      let c = committed[h];
      if (c && !live.some((o) => o.id === c!.id)) c = committed[h] = null;

      if (!c) {
        const tgt = live.find((o) => {
          if (o.cat === "bomb" || o.cat === "nogo") return false;      // never reach for these
          if (o.requiredHand !== "either" && o.requiredHand !== h) return false;
          if (committed[h === "left" ? "right" : "left"]?.id === o.id) return false;
          if (o.cat === "bonus" && rng() > skill * 0.7) return false;  // bonuses are optional
          return true;
        });
        if (tgt) committed[h] = c = { id: tgt.id, at: snap.tMs };
      }

      if (!c) { step(h, rest); continue; }
      const obj = live.find((o) => o.id === c!.id)!;

      // LATENCY: cannot act before the reaction time has elapsed
      if (snap.tMs < obj.actionableT + latencyMs * (0.85 + rng() * 0.3)) { step(h, rest); continue; }

      const p = snap.positions[obj.id] ?? obj.p1;
      // overshoot: a reckless swing does not stop at the object, it drives past it
      const over = reckless ? 1.5 : 1.0;
      const dest: [number, number, number] = [
        p[0] * over + (rng() - 0.5) * spatialErr + (rng() - 0.5) * thrash,
        p[1] + (rng() - 0.5) * spatialErr + (rng() - 0.5) * thrash,
        p[2] * over + (rng() - 0.5) * spatialErr + (rng() - 0.5) * thrash,
      ];
      if (obj.action === "catch") {
        const d = Math.hypot(dest[0] - hands[h].pos[0], dest[1] - hands[h].pos[1], dest[2] - hands[h].pos[2]);
        if (d < obj.scale + 0.06) hands[h].gripping = true;
      }
      step(h, dest);
    }

    function step(h: HandId, dest: [number, number, number]) {
      const prev = hands[h].pos;
      const dx = dest[0] - prev[0], dy = dest[1] - prev[1], dz = dest[2] - prev[2];
      const dist = Math.hypot(dx, dy, dz);
      // HAND SPEED LIMIT — this is what makes a fast enough object unreachable
      const maxStep = maxHandSpeed * 0.016;
      const f = dist > maxStep ? maxStep / dist : 1;
      const np: [number, number, number] = [prev[0] + dx * f, prev[1] + dy * f, prev[2] + dz * f];
      hands[h].vel = [(np[0] - prev[0]) / 0.016, (np[1] - prev[1]) / 0.016, (np[2] - prev[2]) / 0.016];
      hands[h].pos = np;
    }

    eng.tick(now, hands, head);
  }
  return { eng, m: computeAegisMetrics(eng, { tier, mode, handRule, bonusEnabled: true }) };
}

// ------------------------------------------------------------- 3. THE BATTERY
console.log(`SAFETY: ${trajN.toLocaleString()} trajectories validated across 5 tiers x 6 categories`);
console.log("");
console.log("TIER          MODE   RULE        SKILL  ACC%   RT   BONUS  RATING   DEI  BCI  ICS  RRS  PSI  MES");
let sessions = 0;
for (const tier of TIER_ORDER) {
  for (const mode of ["block", "catch", "mixed"] as AegisMode[]) {
    if (!modeAllowed(tier, mode)) continue;
    for (const rule of ["symmetric", "asymmetric", "adaptive"] as HandRule[]) {
      if (!handRuleAllowed(tier, rule)) continue;
      for (const skill of [0.55, 0.8, 0.97]) {
        const { eng, m } = runSession(tier, mode, rule, skill, 100 + sessions);
        sessions++;
        if (skill === 0.97 || (skill === 0.55 && mode === "block" && rule === "symmetric")) {
          console.log(
            tier.padEnd(13), mode.padEnd(6), rule.padEnd(11),
            skill.toFixed(2), String(m.accuracyPct).padStart(5),
            String(m.avgRT).padStart(4), String(m.bonusStage).padStart(6),
            String(m.compositeRating).padStart(7),
            String(m.decisionEfficiency).padStart(4), String(m.bilateralCoordination).padStart(4),
            String(m.inhibitionControl).padStart(4), String(m.recoveryResilience).padStart(4),
            String(m.pressureStability).padStart(4), String(m.movementEconomy).padStart(4),
          );
        }
        // ---- INVARIANTS
        if (!eng.isFinished()) flag("ENGINE:session never terminated");
        if (m.accuracyPct < 0 || m.accuracyPct > 100) flag("METRIC:accuracy out of range");
        for (const [k, v] of Object.entries(m)) {
          if (typeof v === "number" && !Number.isFinite(v)) flag(`METRIC:NaN/Inf in ${k}`);
        }
        for (const idx of ["decisionEfficiency","bilateralCoordination","inhibitionControl","recoveryResilience","pressureStability","movementEconomy"] as const) {
          if (m[idx] < 0 || m[idx] > 100) flag(`METRIC:${idx} out of 0-100`);
        }
        if (eng.phase !== "complete") flag("ENGINE:did not reach complete");
        // main round must always run the full 5:00 — errors never end it (§3)
        const mainEnd = eng.events.filter((e) => e.phase === "main").pop();
        if (mainEnd && mainEnd.t > 300_000) flag("ENGINE:main round overran 5:00");
        if (m.bonusStage > 0 && !m.failCause) flag("ENGINE:bonus ended without a cause");
      }
    }
  }
}

// ------------------------------------- 4. THE ANTI-EXPLOIT TEST (the big one)
// A reckless flailer at GOAT must NOT outrank a controlled athlete at GOAT.
const clean = runSession("goat", "block", "asymmetric", 0.92, 7001, false);
const flail = runSession("goat", "block", "asymmetric", 0.92, 7002, true);
console.log("");
console.log("ANTI-EXPLOIT (GOAT, equal skill):");
console.log(`  controlled : rating ${clean.m.compositeRating}  acc ${clean.m.accuracyPct}%  path ${(clean.m.pathLeftM + clean.m.pathRightM).toFixed(0)}m  economy ${clean.m.movementEconomy}`);
console.log(`  flailing   : rating ${flail.m.compositeRating}  acc ${flail.m.accuracyPct}%  path ${(flail.m.pathLeftM + flail.m.pathRightM).toFixed(0)}m  economy ${flail.m.movementEconomy}`);
if (flail.m.compositeRating > clean.m.compositeRating) flag("EXPLOIT:flailing outscores control");
if (flail.m.movementEconomy >= clean.m.movementEconomy) flag("EXPLOIT:flailing not penalised by movement economy");

// A perfect BEGINNER must not outrank a strong GOAT (leaderboard fairness §22).
const perfectBeginner = runSession("beginner", "block", "symmetric", 1.0, 7003);
const strongGoat = runSession("goat", "mixed", "adaptive", 0.9, 7004);
console.log("");
console.log("LEADERBOARD FAIRNESS:");
console.log(`  perfect Beginner : ${perfectBeginner.m.compositeRating}  (acc ${perfectBeginner.m.accuracyPct}%)`);
console.log(`  strong GOAT      : ${strongGoat.m.compositeRating}  (acc ${strongGoat.m.accuracyPct}%)`);
if (perfectBeginner.m.compositeRating > strongGoat.m.compositeRating) flag("LEADERBOARD:perfect beginner outranks strong GOAT");

console.log("");
console.log(`${sessions} full sessions simulated (5:00 main + bonus-until-fail each)`);
const keys = Object.keys(issues);
console.log(keys.length ? "ISSUES:\n" + keys.map((k) => `  ${k} x${issues[k]}`).join("\n") : "0 ISSUES — safety, engine, metrics, and leaderboard invariants all hold");
