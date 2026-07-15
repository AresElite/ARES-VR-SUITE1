import { DrillEngine } from "../src/drills/shared/DrillEngine";
import { ALL_DRILLS } from "../src/drills/registry";

const mul = (a: number) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const d = ALL_DRILLS.find((x) => x.id === "predictive-pathway")!;
const GATE_Z = -0.85;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };
const P = (lvl: number) => d.levels[lvl - 1].parameters as Record<string, number>;

console.log("PHASE — the drill now lives in Synchronize.");
ok(d.phase === "Synchronize", `phase is Synchronize (${d.phase})`);

console.log("\nAPPROACH — every runner flies TOWARD the athlete, from downfield to the gate.");
for (const lvl of [1, 25, 50]) {
  const trials = d.buildTrials(P(lvl), mul(lvl * 5));
  const movers = trials.filter((t) => t.id.includes("-m") && t.meta?.approach);
  ok(movers.length > 0, `L${lvl}: ${movers.length} approaching runners`);
  ok(movers.every((m) => (m.velocity?.[2] ?? 0) > 0), `L${lvl}: every runner has +Z (toward-athlete) velocity`);
  ok(movers.every((m) => m.position[2] <= -4.5), `L${lvl}: runners start downfield (far away)`);
  // the winner runner reaches the gate by the end of the window
  const g0 = movers.filter((m) => m.id.startsWith("pp-g0-m"));
  const win = trials.find((t) => t.id.startsWith("pp-g0-p") && t.id.includes("-win"))!;
  const winIdx = Number(win.id.match(/-p(\d+)-win/)![1]);
  const wm = g0.find((m) => m.id === `pp-g0-m${winIdx}`)!;
  const windowMs = P(lvl).windowMs;
  const zAtEnd = wm.position[2] + wm.velocity![2] * (windowMs / 1000);
  ok(zAtEnd >= GATE_Z - 0.05, `L${lvl}: the winner reaches the gate within the window (z=${zAtEnd.toFixed(2)} vs gate ${GATE_Z})`);
}

console.log("\nRACE — exactly one winning pad, and it is the runner that arrives first.");
for (const lvl of [1, 30, 50]) {
  const trials = d.buildTrials(P(lvl), mul(lvl * 9));
  // per decision 0
  const gos = trials.filter((t) => t.id.startsWith("pp-g0-p") && t.kind === "go");
  ok(gos.length === 1, `L${lvl}: one winning pad (${gos.length})`);
  const winIdx = Number(gos[0].id.match(/-p(\d+)/)![1]);
  const movers = trials.filter((t) => t.id.startsWith("pp-g0-m"));
  const arrival = (m: typeof movers[number]) => (GATE_Z - m.position[2]) / m.velocity![2];
  const times = movers.map((m) => ({ i: Number(m.id.match(/-m(\d+)/)![1]), t: arrival(m) }));
  const first = times.reduce((a, b) => (b.t < a.t ? b : a));
  ok(first.i === winIdx, `L${lvl}: the winning pad matches the first-to-arrive runner`);
}

console.log("\nDECEPTION — on overtake trials, the early leader is NOT the winner.");
{
  // find a decision at a high level that used a near-start decoy
  const trials = d.buildTrials(P(48), mul(3));
  let checked = 0, decHeld = 0;
  for (let g = 0; g < 15; g++) {
    const ms = trials.filter((t) => t.id.startsWith(`pp-g${g}-m`));
    if (ms.length < 3) continue;
    const near = ms.find((m) => m.position[2] > -5.0); // the head-start decoy
    if (!near) continue;
    checked++;
    // mid-window leader = greatest z at window/2
    const windowMs = P(48).windowMs;
    const midZ = (m: typeof ms[number]) => m.position[2] + m.velocity![2] * (windowMs / 2000);
    const leader = ms.reduce((a, b) => (midZ(b) > midZ(a) ? b : a));
    const gos = trials.filter((t) => t.id.startsWith(`pp-g${g}-p`) && t.kind === "go");
    const winIdx = Number(gos[0].id.match(/-p(\d+)/)![1]);
    const leaderIdx = Number(leader.id.match(/-m(\d+)/)![1]);
    if (leaderIdx !== winIdx) decHeld++;
  }
  ok(checked > 0, `found ${checked} overtake decisions to inspect`);
  ok(decHeld === checked, `on all ${checked}, the early leader was overtaken (not the winner)`);
}

console.log("\nLIVE — slap the winner scores; slap a wrong colour is an error.");
{
  const trials = d.buildTrials(P(20), mul(11));
  const e = new DrillEngine(d, P(20), trials, 24);
  e.start(); e.update(3100);
  const done = new Set<string>();
  let correct = 0;
  for (let i = 0; i < 200_000 / 16; i++) {
    e.update(16);
    if ((e as unknown as { state: string }).state === "complete") break;
    // slap the winning pad as soon as it's up (a perfect predictor)
    const win = e.pool.slots.find((s) => s.active && s.spec?.kind === "go" && !done.has(s.spec.id));
    if (win?.spec) { done.add(win.spec.id); e.registerHit(win.spec.id, "right", undefined, 0.0, 0.9); }
  }
  correct = e.getEvents().filter((x) => x.correct).length;
  ok(correct >= 8, `a perfect predictor scored ${correct} races`);

  // a wrong slap is an error
  const t2 = d.buildTrials(P(20), mul(13));
  const e2 = new DrillEngine(d, P(20), t2, 24);
  e2.start(); e2.update(3100);
  for (let i = 0; i < 400; i++) e2.update(16);
  const wrong = e2.pool.slots.find((s) => s.active && s.spec?.kind === "distractor" && s.spec.id.includes("-p"));
  if (wrong?.spec) { e2.registerHit(wrong.spec.id, "right", undefined, 0.0, 0.9); e2.update(20); }
  ok(e2.getEvents().some((x) => x.errorType === "distractorHit"), "slapping the wrong colour scored an error");
  ok(d.analyze!(e.getEvents()).some((n) => n.includes("races called")), "analyze reports the hit rate");
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
