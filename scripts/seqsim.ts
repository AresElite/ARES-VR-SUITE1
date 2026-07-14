import { SequenceEngine, type HandInput, type Hand } from "@/sequence/SequenceEngine";
import { computeSeqMetrics } from "@/sequence/metrics";
import { generateCues, chooseCommand, resolvePlan, zoneSide } from "@/sequence/generator";
import { TIER_ORDER, TIER_LABEL, tuningFor, TIER_TUNING } from "@/sequence/tiers";
import type { SeqTier, SeqMode, SeqSettings, CueZone } from "@/sequence/types";
import { NO_GO_COMMANDS } from "@/sequence/types";
import { makeRng } from "@/utils/rng";

const issues: Record<string, number> = {};
const flag = (k: string) => { issues[k] = (issues[k] ?? 0) + 1; };

// ---------------------------------------------------- 1. GENERATOR / RULE LOGIC
let plans = 0;
for (const tier of TIER_ORDER) {
  const tune = tuningFor(tier, "training");
  for (let i = 0; i < 30000; i++) {
    const rng = makeRng(i * 17 + tier.length);
    const cues = generateCues(tune, tier, rng);
    const hasTwo = tune.streams === 2 && cues.some((c) => c.stream === "B");
    const cmds = chooseCommand(tune, hasTwo, rng);
    const { steps, noGo, transformed } = resolvePlan(cues, cmds, tune, rng);
    plans++;

    // A no-go must annihilate the plan — there must be nothing to do.
    if (noGo && steps.length) flag("LOGIC:no-go produced executable steps");
    if (!noGo && !steps.length) flag("LOGIC:non-no-go produced an EMPTY plan (unplayable)");
    // Distractors must NEVER enter the plan.
    const distIds = new Set(cues.filter((c) => c.distractor).map((c) => c.id));
    if (steps.some((s) => distIds.has(s.cueId))) flag("LOGIC:distractor entered the action plan");
    // The salient anti-saccadic decoy must not be in the plan unless summoned.
    if (!cmds.includes("oppositeCue")) {
      const salIds = new Set(cues.filter((c) => c.salient).map((c) => c.id));
      if (steps.some((s) => salIds.has(s.cueId))) flag("LOGIC:salient decoy entered the plan uninvited");
    }
    // Slots must be contiguous and ordered.
    steps.forEach((s, k) => { if (s.slot !== k) flag("LOGIC:plan slots not contiguous"); });
    // Transformation must actually CHANGE something (else the rule is a no-op).
    if (cmds.includes("reverse") && steps.length > 1) {
      const live = cues.filter((c) => !c.distractor && !c.salient && c.stream === (cmds.includes("selectB") ? "B" : "A"));
      if (live.length > 1 && steps.length === live.length && steps[0].cueId === live[0].cueId
          && !cmds.some((c) => c !== "reverse" && c !== "execute" && c !== "selectA" && c !== "selectB")) {
        flag("LOGIC:reverse was a no-op");
      }
    }
    // Cue zones must never sit behind the athlete or outside the safe field.
    for (const c of cues) {
      if (!tune.cueZones.includes(c.zone)) flag("SAFETY:cue outside the tier's permitted field");
    }
    // Bands must be within the tier's permitted execution zones.
    for (const s of steps) {
      if (!tune.bands.includes(s.band)) flag("SAFETY:execution band outside calibrated range");
      if (s.dueMs < 0) flag("LOGIC:negative due time");
    }
  }
}

// ------------------------------------------------- 2. ASSESSMENT REPEATABILITY
// A baseline is worthless if the protocol moved between the pre and the post.
// Same seed + assessment mode MUST produce a byte-identical protocol.
for (const tier of TIER_ORDER) {
  const tune = tuningFor(tier, "assessment");
  if (tune.delayMinMs !== tune.delayMaxMs) flag("ASSESS:retention delay is not fixed");
  const a = JSON.stringify(protocol(tier, 4242));
  const b = JSON.stringify(protocol(tier, 4242));
  if (a !== b) flag("ASSESS:same seed produced a DIFFERENT protocol (not repeatable)");
  const c = JSON.stringify(protocol(tier, 4243));
  if (a === c) flag("ASSESS:different seeds produced an identical protocol (not randomized)");
}
function protocol(tier: SeqTier, seed: number) {
  const tune = tuningFor(tier, "assessment");
  const rng = makeRng(seed);
  const out = [];
  for (let i = 0; i < 12; i++) {
    const cues = generateCues(tune, tier, rng);
    const cmds = chooseCommand(tune, tune.streams === 2, rng);
    out.push({ cues: cues.map((c) => [c.zone, c.hand, c.action, c.band, c.distractor]), cmds });
  }
  return out;
}

// ------------------------------------------------------- 3. SYNTHETIC ATHLETE
function run(tier: SeqTier, mode: SeqMode, skill: number, seed: number, reckless = false) {
  const settings: SeqSettings = { tier, mode, bonusEnabled: mode === "training" };
  const eng = new SequenceEngine(settings, seed);
  const rng = makeRng(seed * 3 + 11);
  eng.start(0);
  const hands: Record<Hand, HandInput> = {
    left: { pos: [-0.9, 1.3, -0.2], vel: [0, 0, 0], gripping: false },
    right: { pos: [0.9, 1.3, -0.2], vel: [0, 0, 0], gripping: false },
  };
  const latency = 520 - skill * 250;
  const maxSpeed = reckless ? 8.5 : 2.4 + skill * 2.4;
  let now = 0;
  const CAP = 22 * 60 * 1000;
  const prevPos = (h: Hand) => hands[h].pos;
  let goT = 0;
  let lastPhase = "";

  while (!eng.isFinished() && now < CAP) {
    now += 16;
    const s = eng.snapshot();

    // GO edge — tracked ONCE per frame, for the whole athlete. Doing this inside
    // the per-hand loop meant it only ran during execute, so the flag never
    // cleared between sequences and every sequence was rushed from a stale GO.
    if (s.phase === "execute" && lastPhase !== "execute") goT = s.tMs;
    lastPhase = s.phase;
    const sinceGo = s.tMs - goT;

    for (const h of ["left", "right"] as Hand[]) {
      const rest: [number, number, number] = [h === "left" ? -0.9 : 0.9, 1.3, -0.2];
      let dest = rest;
      hands[h].gripping = false;

      if (s.phase === "execute") {
        const stream: "L" | "R" = eng.tune.dualStream ? (h === "left" ? "L" : "R") : "L";
        // the next thing OWED on this stream = the lowest unresolved slot in it
        const want = s.targets
          .filter((t) => t.stream === stream && t.hand === h)
          .sort((a, b) => a.slot - b.slot)[0];
        // a RECKLESS athlete grabs whatever it can see, including pending targets
        const grab = reckless ? s.targets.find((t) => t.hand === h) : want;
        // an INHIBIT step is answered by withholding — a competent athlete does
        // not reach for it at all. Only the reckless one does.
        const inhibit = grab?.action === "inhibit" && !reckless;
        if (grab && !inhibit && rng() < skill + (reckless ? 0.3 : 0)) {
          // A competent athlete PLAYS TO THE BEAT: they move early enough to
          // arrive on the due time, and they wait when they are ahead of it.
          // A reckless one grabs whatever it can see the moment it can see it.
          const since = sinceGo;
          const dueIn = grab.dueMs - since;
          const p = eng.targetPos(grab);
          const err = (1 - skill) * 0.11;
          const travel = Math.hypot(p[0] - prevPos(h)[0], p[1] - prevPos(h)[1], p[2] - prevPos(h)[2]);
          const needMs = (travel / maxSpeed) * 1000;
          const go = reckless || eng.tune.tempoMs === 0 || dueIn <= needMs + latency * 0.25;
          if (go) {
            dest = [p[0] + (rng() - 0.5) * err, p[1] + (rng() - 0.5) * err, p[2] + (rng() - 0.5) * err];
            if (grab.action === "catch" || grab.action === "hold") hands[h].gripping = true;
          }
        }
      }
      const prev = hands[h].pos;
      const dx = dest[0] - prev[0], dy = dest[1] - prev[1], dz = dest[2] - prev[2];
      const dist = Math.hypot(dx, dy, dz);
      const maxStep = maxSpeed * 0.016;
      const f = dist > maxStep ? maxStep / dist : 1;
      const np: [number, number, number] = [prev[0] + dx * f, prev[1] + dy * f, prev[2] + dz * f];
      hands[h].vel = [(np[0] - prev[0]) / 0.016, (np[1] - prev[1]) / 0.016, (np[2] - prev[2]) / 0.016];
      hands[h].pos = np;
    }
    eng.tick(now, hands);
  }
  return { eng, m: computeSeqMetrics(eng, settings) };
}

// ---------------------------------------------------------------- 4. BATTERY
console.log(`GENERATOR: ${plans.toLocaleString()} plans resolved across 5 tiers`);
console.log("");
console.log("TIER                   MODE      SKILL  SEQ%  ACT%  D2A   SPAN  BONUS  RATING   SII  PCT  WMC  BSI  ICS  CFS  TPI  RRS");
let n = 0;
for (const tier of TIER_ORDER) {
  for (const mode of ["training", "assessment"] as SeqMode[]) {
    for (const skill of [0.6, 0.95]) {
      const { eng, m } = run(tier, mode, skill, 500 + n);
      n++;
      if (skill === 0.95) {
        console.log(
          TIER_LABEL[tier].padEnd(22), mode.padEnd(9), skill.toFixed(2),
          String(m.sequenceAccuracyPct).padStart(5), String(m.actionAccuracyPct).padStart(5),
          String(m.avgDecisionToActionMs).padStart(4), String(m.workingMemorySpan).padStart(5),
          String(m.bonusStage).padStart(6), String(m.compositeRating).padStart(7),
          String(m.sequenceIntegration).padStart(4), String(m.peripheralToCentral).padStart(4),
          String(m.workingMemoryCapacity).padStart(4), String(m.bilateralSequencing).padStart(4),
          String(m.inhibitionControl).padStart(4), String(m.cognitiveFlexibility).padStart(4),
          String(m.temporalPrecision).padStart(4), String(m.recoveryResilience).padStart(4),
        );
      }
      // ---- INVARIANTS
      if (!eng.isFinished()) flag("ENGINE:session never terminated");
      if (mode === "assessment" && m.ranked) flag("LEADERBOARD:assessment run was RANKED");
      if (mode === "assessment" && m.compositeRating !== 0) flag("LEADERBOARD:assessment produced a rating");
      if (mode === "assessment" && eng.complexity !== 1) flag("ASSESS:assessment mode ADAPTED (must not)");
      if (mode === "assessment" && eng.recoveryAttempts > 0) flag("ASSESS:assessment entered a recovery phase (must not)");
      if (m.sequences === 0) flag("ENGINE:no sequences ran");
      for (const [k, v] of Object.entries(m)) {
        if (typeof v === "number" && !Number.isFinite(v)) flag(`METRIC:NaN/Inf in ${k}`);
      }
      for (const idx of ["sequenceIntegration","peripheralToCentral","workingMemoryCapacity","bilateralSequencing","inhibitionControl","cognitiveFlexibility","temporalPrecision","recoveryResilience"] as const) {
        if (m[idx] < 0 || m[idx] > 100) flag(`METRIC:${idx} outside 0-100`);
      }
    }
  }
}

// ------------------------------------------------------- 5. ANTI-EXPLOIT
const clean = run("goat", "training", 0.9, 9001, false);
const flail = run("goat", "training", 0.9, 9002, true);
console.log("");
console.log("ANTI-EXPLOIT (GOAT, equal skill):");
console.log(`  controlled : rating ${clean.m.compositeRating}  seq ${clean.m.sequenceAccuracyPct}%  inhibition ${clean.m.inhibitionControl}`);
console.log(`  grabby     : rating ${flail.m.compositeRating}  seq ${flail.m.sequenceAccuracyPct}%  inhibition ${flail.m.inhibitionControl}`);
if (flail.m.compositeRating > clean.m.compositeRating) flag("EXPLOIT:grabbing pending targets outscores control");

const pb = run("beginner", "training", 1.0, 9003);
const sg = run("goat", "training", 0.88, 9004);
console.log("");
console.log("LEADERBOARD FAIRNESS:");
console.log(`  perfect Beginner : ${pb.m.compositeRating}`);
console.log(`  strong GOAT      : ${sg.m.compositeRating}`);
if (pb.m.compositeRating > sg.m.compositeRating) flag("LEADERBOARD:perfect Beginner outranks strong GOAT");


for (const tier of ["advanced","pro","goat"] as SeqTier[]) {
  const { m, eng } = run(tier, "training", 0.95, 12345);
  const dist: Record<string, number> = {};
  for (const e of eng.events) dist[e.outcome] = (dist[e.outcome] ?? 0) + 1;
  const tot = eng.events.length;
  const top = Object.entries(dist).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${Math.round(v/tot*100)}%`).join("  ");
  console.log(`${tier.padEnd(9)} ${top}`);
  const te = eng.events.filter(e=>e.timingErrorMs!==undefined).map(e=>e.timingErrorMs!);
  const early = te.filter(x=>x < -eng.tune.timingWindowMs).length;
  const late  = te.filter(x=>x >  eng.tune.timingWindowMs).length;
  const med = te.slice().sort((a,b)=>a-b)[Math.floor(te.length/2)] ?? 0;
  console.log(`          timing: median ${med|0}ms  |  too EARLY ${early}  too LATE ${late}  (window ±${eng.tune.timingWindowMs}ms, tempo ${eng.tune.tempoMs}ms)`);
  console.log(`          breakdowns: ${Object.entries(eng.breakdowns).filter(([,v])=>v>0).map(([k,v])=>k+":"+v).join("  ")}`);
}
console.log("");
console.log(`${n} full sessions simulated`);
const keys = Object.keys(issues);
console.log(keys.length
  ? "ISSUES:\n" + keys.map((k) => `  ${k} x${issues[k]}`).join("\n")
  : "0 ISSUES — rule logic, safety, assessment repeatability, and leaderboard invariants all hold");
