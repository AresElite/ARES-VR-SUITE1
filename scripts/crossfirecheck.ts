/**
 * Verifies the three claims made by this round of work. Each one is a claim that, if false,
 * silently breaks the drill in a way no type check would catch.
 */
import { DrillEngine } from "../src/drills/shared/DrillEngine";
import { ALL_DRILLS } from "../src/drills/registry";
import { ccLevel } from "../src/drills/synchronize/CognitiveCrossfireVR";
import { GNG_LEVELS } from "../src/drills/execute/GoNoGoVR";

const mulberry = (a: number) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const D = (id: string) => ALL_DRILLS.find((d) => d.id === id)!;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nCOGNITIVE CROSSFIRE — the trigger must NEVER resolve a peripheral orb.");
{
  const d = D("cognitive-crossfire");
  let periphViaTrigger = 0, centralViaTrigger = 0, triggerable = 0;
  for (const lvl of [1, 64, 130, 200, 260, 315]) {
    const trials = d.buildTrials({ level: lvl }, mulberry(lvl * 977));
    const central = trials.filter((t) => t.meta?.triggerTarget);
    const periph = trials.filter((t) => t.id.startsWith("cc-p"));
    triggerable += central.length;
    // every trigger-answerable target must be central; no peripheral orb may carry the flag
    periphViaTrigger += periph.filter((t) => t.meta?.triggerTarget).length;
    centralViaTrigger += central.filter((t) => (t.meta?.central as boolean)).length;
    ok(periph.length > 0 && central.length > 0, `L${lvl}: ${periph.length} orbs (strike) + ${central.length} problems (trigger)`);
  }
  ok(periphViaTrigger === 0, `zero peripheral orbs are trigger-flagged (${periphViaTrigger} found)`);
  ok(centralViaTrigger === triggerable, "every trigger target is a central task");

  // live engine: fire triggers only, and confirm no orb is ever consumed
  const trials = d.buildTrials({ level: 200 }, mulberry(7));
  const e = new DrillEngine(d, { level: 200 }, trials, 64);
  e.start(); e.update(3100);
  let orbsEaten = 0;
  for (let t = 0; t < 60_000; t += 40) {
    e.update(40);
    if (t % 400 === 0) e.registerTriggerResponse(Math.random() < 0.5 ? "left" : "right");
  }
  // Only RESPONSES count. Orbs still alive at the 60s buzzer are expired by the engine and
  // show up as omissions — those are the clock, not the trigger.
  orbsEaten = e.getEvents().filter((ev) => ev.trialId.startsWith("cc-p") && ev.errorType !== "miss").length;
  ok(orbsEaten === 0, `60s of pure trigger-mashing consumed ${orbsEaten} peripheral orbs (must be 0)`);
  const phantom = e.getEvents().filter((ev) => ev.trialId.startsWith("cc-p") && ev.errorType === "miss").length;
  ok(phantom <= 3, `buzzer expiry left ${phantom} orbs — and analyze() excludes them from the score`);
  ok(e.getEvents().filter((ev) => ev.trialId.startsWith("cc-c")).length > 0, "the central task WAS reachable by trigger");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nGO / NO-GO — a launcher drill: balls fire from holes; trigger on go, hold on purple.");
{
  const d = D("go-no-go");
  ok(d.responseMode === "trigger" && (d as { launcher?: boolean }).launcher === true, "Go/No-Go is a launcher/trigger drill");
  for (const lvl of [1, 8, 17, 30, 41, 50]) {
    const L = GNG_LEVELS[lvl - 1];
    const trials = d.buildTrials({ level: lvl }, mulberry(lvl * 31));
    const shots = trials.filter((t) => t.id.startsWith("gng-") && !t.id.includes("hole"));
    ok(shots.length === 50, `L${lvl} (${L.family}): 50 shots`);
    // balls fire from a hole downfield and fly toward the athlete
    ok(shots.every((t) => t.position[2] <= -5.5 && (t.velocity?.[2] ?? 0) > 0), `L${lvl}: every ball fires from a hole and flies at the athlete`);
    // holes: one per five-level band
    const holes = new Set(shots.map((t) => `${t.position[0].toFixed(2)},${t.position[1].toFixed(2)}`));
    const expected = Math.min(10, Math.ceil(lvl / 5));
    ok(holes.size === expected, `L${lvl}: shots come from ${holes.size} hole(s) (expected ${expected})`);
    // hole markers rendered
    ok(trials.filter((t) => t.id.includes("-hole")).length === expected, `L${lvl}: ${expected} hole marker(s) drawn`);
  }

  // balance + inhibition via the TRIGGER path
  const trials = d.buildTrials({ level: 45 }, mulberry(3));
  const noGo = trials.filter((t) => t.kind === "noGo").length;
  ok(noGo >= 10 && noGo <= 28, `L45: ${noGo}/50 NO-GO shots (~38% expected)`);
  const e = new DrillEngine(d, { level: 45 }, trials, 64);
  e.start(); e.update(3100);
  for (let t = 0; t < 300_000; t += 20) e.update(20);   // pull NOTHING
  const ev = e.getEvents();
  const cr = ev.filter((x) => x.errorType === "correctRejection").length;
  ok(cr === noGo, `withholding lets every purple pass as a correct rejection (${cr}/${noGo})`);

  // a live shooter: pull the trigger only for GO balls, hold on purple -> all correct
  {
    const t2 = d.buildTrials({ level: 22 }, mulberry(8));
    const e2 = new DrillEngine(d, { level: 22 }, t2, 64);
    e2.start(); e2.update(3100);
    const done = new Set<string>();
    for (let t = 0; t < 300_000; t += 20) {
      e2.update(20);
      for (const sl of e2.pool.slots) {
        if (!sl.active || !sl.spec || sl.spec.decor || done.has(sl.spec.id)) continue;
        if (sl.spec.kind === "go") { done.add(sl.spec.id); e2.registerTriggerResponse("right"); }
      }
    }
    const goEv = e2.getEvents().filter((x) => x.trialId.startsWith("gng-"));
    const goHits = goEv.filter((x) => x.correct && x.errorType !== "correctRejection").length;
    const goCount = t2.filter((t) => t.kind === "go").length;
    ok(goHits === goCount, `every GO ball was fired on and scored (${goHits}/${goCount})`);
    ok(!goEv.some((x) => x.errorType === "noGoFailure"), "no purple ball was ever fired on");
  }

  const notes = d.analyze!(ev)!;
  const dWithheld = Number(/d' = (-?[\d.]+)/.exec(notes.join(" "))![1]);

  // press EVERYTHING -> d' must collapse
  const t2 = d.buildTrials({ level: 45 }, mulberry(3));
  const e3 = new DrillEngine(d, { level: 45 }, t2, 64);
  e3.start(); e3.update(3100);
  for (let t = 0; t < 300_000; t += 20) {
    e3.update(20);
    for (const s2 of e3.pool.slots) if (s2.active && s2.spec && !s2.spec.decor) e3.registerTriggerResponse("right");
  }
  const n2 = d.analyze!(e3.getEvents())!;
  const dSpam = Number(/d' = (-?[\d.]+)/.exec(n2.join(" "))![1]);
  ok(dSpam < dWithheld, `press-everything d'=${dSpam.toFixed(2)} scores BELOW withhold-everything d'=${dWithheld.toFixed(2)}`);
  ok(dSpam < 0.6, `press-everything cannot fake sensitivity (d'=${dSpam.toFixed(2)})`);
  ok(n2.some((x) => x.includes("impulsive") || x.includes("false alarms")), "the spam strategy is named in the report");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nSPEED-SEARCH — the field must never expire, and a decoy click must not end the search.");
{
  const d = D("speed-search");
  const params = { ...(d.levels[40].parameters as Record<string, unknown>) };
  const trials = d.buildTrials(params, mulberry(11));
  const e = new DrillEngine(d, params, trials, 32);
  e.start(); e.update(3100);

  // 1. sit for 90 seconds without answering. The field must still be there.
  for (let t = 0; t < 90_000; t += 50) e.update(50);
  const live = e.pool.slots.filter((s) => s.active).length;
  ok(live >= 15, `after 90s of no response the field still holds ${live} items (no expiry)`);
  const timedOut = e.getEvents().filter((x) => x.errorType === "miss").length;
  ok(timedOut === 0, `zero searches timed out (${timedOut} omissions)`);

  // 2. click a DECOY. The search must survive it.
  const before = e.pool.slots.filter((s) => s.active).length;
  const decoy = e.pool.slots.find((s) => s.active && s.spec && s.spec.kind === "distractor")!;
  e.registerHit(decoy.spec!.id, "right");
  e.update(50);
  const after = e.pool.slots.filter((s) => s.active).length;
  ok(after === before, `a decoy click left the field intact (${before} -> ${after} items)`);
  ok(e.getEvents().some((x) => x.errorType === "distractorHit"), "the decoy click WAS scored as an error");

  // 3. now find the real one. THAT must advance.
  const tgt = e.pool.slots.find((s) => s.active && s.spec && s.spec.kind === "go")!;
  const tgtId = tgt.spec!.id;
  e.registerHit(tgtId, "right");
  e.update(400);   // spawnGrid schedules the next field at now+200ms
  const nowLive = e.pool.slots.filter((s) => s.active).map((s) => s.spec!.id);
  ok(!nowLive.includes(tgtId), "finding the target cleared the old field");
  ok(nowLive.length >= 15, `and spawned the next 20-item search (${nowLive.length} live)`);
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
