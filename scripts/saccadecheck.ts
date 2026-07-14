import { DrillEngine } from "../src/drills/shared/DrillEngine";
import { ALL_DRILLS } from "../src/drills/registry";
import { sacLevel } from "../src/drills/execute/SaccadeSwipeVR";
import type { SliceDirection } from "../src/ares/drillTypes";

const mul = (a: number) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const d = ALL_DRILLS.find((x) => x.id === "saccade-swipe")!;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };

// the arrow's own direction, and the required answer (opposite on anti)
function liveGo(e: DrillEngine): { id: string; answer: SliceDirection; pointDir: SliceDirection; anti: boolean; ways: number } | null {
  let best: { id: string; spawn: number; spec: import("../src/ares/drillTypes").TrialSpec } | null = null;
  for (const s of e.pool.slots) {
    if (!s.active || !s.spec || s.spec.kind !== "go") continue;
    if (!best || s.spawnClock < best.spawn) best = { id: s.spec.id, spawn: s.spawnClock, spec: s.spec };
  }
  if (!best) return null;
  return { id: best.id, answer: best.spec.requiredDirection as SliceDirection, pointDir: best.spec.meta!.pointDir as SliceDirection, anti: !!best.spec.meta!.anti, ways: best.spec.meta!.axes as number };
}
const OPP: Record<string, SliceDirection> = { up: "down", down: "up", left: "right", right: "left", upLeft: "downRight", upRight: "downLeft", downLeft: "upRight", downRight: "upLeft" };

for (const lvl of [1, 20, 50, 80, 100]) {
  const L = sacLevel(lvl);
  const trials = d.buildTrials({ level: lvl }, mul(lvl * 41));
  ok(trials.length === 50, `L${lvl} (${L.family}): 50 trials`);
  // answer set matches the level's ways
  const dirs = new Set(trials.map((t) => t.requiredDirection));
  const maxWays = L.ways;
  const cardOnly = [...dirs].every((dd) => ["left", "right"].includes(dd as string));
  if (maxWays === 2) ok(cardOnly, `L${lvl}: 2-way answers are horizontal only`);
  if (maxWays === 8) ok([...dirs].some((dd) => String(dd).length > 5), `L${lvl}: 8-way includes diagonals`);
  // anti share roughly matches antiProb
  const antiFrac = trials.filter((t) => t.meta?.anti).length / 50;
  ok(Math.abs(antiFrac - L.antiProb) < 0.22 || L.antiProb === 0, `L${lvl}: anti share ${(antiFrac * 100).toFixed(0)}% ~ target ${(L.antiProb * 100).toFixed(0)}%`);
  // anti answer is the opposite of the arrow; pro answer equals the arrow
  for (const t of trials) {
    const want = t.meta?.anti ? OPP[t.meta!.pointDir as string] : (t.meta!.pointDir as SliceDirection);
    if (t.requiredDirection !== want) { ok(false, `L${lvl}: a trial's required answer does not match pro/anti rule`); break; }
  }

  // LIVE: a perfect player flicks the required answer every trial; all 50 must score.
  const e = new DrillEngine(d, { level: lvl }, trials, 8);
  e.start(); e.update(3100);
  const answered = new Set<string>();
  for (let i = 0; i < 300_000 / 16; i++) {
    e.update(16);
    if ((e as unknown as { state: string }).state === "complete") break;
    const g = liveGo(e);
    if (g && !answered.has(g.id)) { answered.add(g.id); e.registerHit(g.id, "right", g.answer); }
  }
  const ev = e.getEvents().filter((x) => x.trialId.startsWith("sac-"));
  const correct = ev.filter((x) => x.correct).length;
  ok(correct === 50, `L${lvl}: a correct flick scores every trial (${correct}/50)`);
  // an anti trial answered TOWARD the arrow must be scored wrong
}

// wrong-direction is scored wrong (anti reflex error)
{
  const trials = d.buildTrials({ level: 90 }, mul(7));
  const e = new DrillEngine(d, { level: 90 }, trials, 8);
  e.start(); e.update(3100);
  let firstAntiWrong = false, tested = false;
  for (let i = 0; i < 300_000 / 16; i++) {
    e.update(16);
    if ((e as unknown as { state: string }).state === "complete") break;
    const g = liveGo(e);
    if (g && g.anti && !tested) {
      tested = true;
      e.registerHit(g.id, "right", g.pointDir); // flick TOWARD the arrow — the reflex error
    } else if (g) {
      e.registerHit(g.id, "right", g.answer);
    }
  }
  const ev = e.getEvents().filter((x) => x.trialId.includes("-anti"));
  firstAntiWrong = ev.some((x) => !x.correct);
  ok(tested && firstAntiWrong, "flicking TOWARD the arrow on an anti trial scores wrong");
}

// metrics separate pro from anti
{
  const trials = d.buildTrials({ level: 85 }, mul(11));
  const e = new DrillEngine(d, { level: 85 }, trials, 8);
  e.start(); e.update(3100);
  const answered = new Set<string>();
  for (let i = 0; i < 300_000 / 16; i++) {
    e.update(16);
    if ((e as unknown as { state: string }).state === "complete") break;
    const g = liveGo(e);
    if (g && !answered.has(g.id)) { answered.add(g.id); e.registerHit(g.id, "right", g.answer); }
  }
  const notes = d.analyze!(e.getEvents());
  ok(notes.some((n) => n.includes("Pro-saccade")) && notes.some((n) => n.includes("Anti-saccade")), "analyze reports pro and anti separately");
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
