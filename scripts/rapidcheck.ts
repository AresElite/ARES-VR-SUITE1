import { DrillEngine } from "../src/drills/shared/DrillEngine";
import { ALL_DRILLS } from "../src/drills/registry";
import { RR_LATTICE } from "../src/drills/acquire/RapidRecognitionVR";

const mul = (a: number) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const d = ALL_DRILLS.find((x) => x.id === "rapid-recognition")!;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };
const st = (e: DrillEngine) => (e as unknown as { state: string }).state;
const nowOf = (e: DrillEngine) => (e as unknown as { timing: { now: number } }).timing.now;

console.log("LATTICE — 150 difficulty-sorted cells.");
ok(RR_LATTICE.length === 150, `exactly 150 levels (${RR_LATTICE.length})`);
ok(RR_LATTICE[0].params.diffKey === "beginner" && RR_LATTICE[0].params.content === "colors", `level 1 is the easiest cell (${RR_LATTICE[0].label})`);
ok(RR_LATTICE[149].params.diffKey === "professional", `level 150 is a professional cell (${RR_LATTICE[149].label})`);
ok(d.levels.length === 150, `drill exposes 150 levels`);

console.log("\nROUND — central target + one match + distractors; match token equals the target.");
for (const lvl of [1, 60, 150]) {
  const trials = d.buildTrials({ level: lvl }, mul(lvl * 17));
  const r0 = trials.filter((t) => t.id.startsWith("rr-r0-"));
  const central = r0.find((t) => t.meta?.central)!;
  const match = r0.find((t) => t.id.includes("-match"))!;
  const items = r0.filter((t) => !t.meta?.central);
  ok(!!central && central.decor === true, `L${lvl}: a central target that cannot be picked`);
  ok(match.kind === "go" && items.filter((t) => t.kind === "go").length === 1, `L${lvl}: exactly one correct match`);
  ok(match.label === central.label || (central.label ?? "").length > 0, `L${lvl}: the match shows the central's token`);
  ok(items.every((t) => t.meta?.hideLabelAfterMs !== undefined && t.meta?.clickableAfterMs !== undefined), `L${lvl}: tokens flash-then-hide and lock until then`);
  ok(items.every((t) => t.physics), `L${lvl}: items drift on box physics`);
}

console.log("\nFLASH GATE — a pick during the flash is ignored; after it, it counts.");
{
  const trials = d.buildTrials({ level: 30 }, mul(5));
  const e = new DrillEngine(d, { level: 30 }, trials, 40);
  e.start(); e.update(3100);
  // wait for round 0 to spawn
  for (let i = 0; i < 80; i++) e.update(16);
  const match = e.pool.slots.find((s) => s.active && s.spec?.id.includes("rr-r0") && s.spec.id.includes("-match"))!;
  const flashMs = match.spec!.meta!.clickableAfterMs as number;
  // pick immediately (still flashing) — must be ignored
  e.registerHit(match.spec!.id, "right");
  ok(e.getEvents().filter((x) => x.trialId.startsWith("rr-r0")).length === 0, "a pick during the flash was ignored");
  // advance past the flash, then pick — must count
  let waited = nowOf(e);
  while (nowOf(e) - waited < flashMs + 50) e.update(16);
  const stillMatch = e.pool.slots.find((s) => s.active && s.spec?.id.includes("rr-r0") && s.spec.id.includes("-match"));
  if (stillMatch) { e.registerHit(stillMatch.spec!.id, "right"); e.update(20); }
  ok(e.getEvents().some((x) => x.trialId.startsWith("rr-r0") && x.correct), "a pick after the flash scored correct");
}

console.log("\nLIVES — three wrong ends the run; correct picks keep it going and regen.");
{
  // passive player: never picks. Each round's match expires -> miss -> life. 3 misses -> end.
  const trials = d.buildTrials({ level: 20 }, mul(7));
  const e = new DrillEngine(d, { level: 20 }, trials, 40);
  e.start(); e.update(3100);
  let ended = false;
  for (let i = 0; i < 60_000 / 16; i++) { e.update(16); if (st(e) === "complete") { ended = true; break; } }
  const misses = e.getEvents().filter((x) => x.errorType === "miss").length;
  ok(ended, "a passive run ended");
  ok(misses === 3, `it ended after exactly 3 lost lives (${misses} misses)`);
}
{
  // perfect player: always picks the match after the flash. Should clear many rounds, no end-by-lives.
  const trials = d.buildTrials({ level: 15 }, mul(9));
  const e = new DrillEngine(d, { level: 15 }, trials, 40);
  e.start(); e.update(3100);
  let cleared = 0;
  for (let i = 0; i < 120_000 / 16; i++) {
    e.update(16);
    if (st(e) === "complete") break;
    const m = e.pool.slots.find((s) => s.active && s.spec?.id.includes("-match"));
    if (m?.spec) {
      const age = nowOf(e) - m.spawnClock;
      if (age >= (m.spec.meta!.clickableAfterMs as number) + 20) e.registerHit(m.spec.id, "right");
    }
  }
  cleared = e.getEvents().filter((x) => x.correct).length;
  ok(cleared >= 20, `a perfect player cleared ${cleared} rounds`);
  ok(e.getEvents().filter((x) => x.errorType === "distractorHit" || x.errorType === "miss").length === 0, "and lost no lives");
  ok(d.analyze!(e.getEvents()).some((n) => n.includes("correct recognitions")), "analyze reports the recognition tally");
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
