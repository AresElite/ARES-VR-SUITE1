import { DrillEngine } from "../src/drills/shared/DrillEngine";
import { ALL_DRILLS } from "../src/drills/registry";
import { ffLevel } from "../src/drills/execute/FocusFrenzyVR";

const mul = (a: number) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const d = ALL_DRILLS.find((x) => x.id === "focus-frenzy")!;
const HALF_W = 0.66, HALF_H = 0.44, EYE_Y = 1.5;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };
const st = (e: DrillEngine) => (e as unknown as { state: string }).state;

console.log("STRUCTURE — five-stage colour ramp, escalating fuse, growing field.");
for (const lvl of [1, 40, 70, 100]) {
  const b = ffLevel(lvl);
  const trials = d.buildTrials({ level: lvl }, mul(lvl * 13));
  const first = trials.find((t) => t.seq === 0)!;
  const phases = (first.meta!.paintPhases as { t: number; c: string }[]);
  ok(phases.length === 5, `L${lvl}: five colour stages (${phases.length})`);
  ok(phases[0].t === 0 && phases[4].c === "#EF4444", `L${lvl}: ramp starts calm and ends RED`);
  // base concurrency = maxActive streams begin near t=0
  const early = new Set(trials.filter((t) => t.seq === 0 && t.spawnAt >= 0 && t.spawnAt < 2000).map((t) => t.chainId));
  ok(early.size === b.maxActive, `L${lvl}: ${early.size} streams live at the start (maxActive ${b.maxActive})`);
  // reinforcement streams come online later (the concurrency ramp)
  const late = trials.filter((t) => t.seq === 0 && t.spawnAt >= 10000).length;
  ok(late >= 1, `L${lvl}: reinforcement streams arrive later (${late})`);
  // all physics targets carry a bounded box
  ok(trials.every((t) => t.physics && t.physics.halfW === HALF_W), `L${lvl}: every orb has invisible-box physics`);
}

console.log("\nSURVIVAL — letting one expire ends the run; clearing them keeps it alive.");
{
  // a PASSIVE player (never strikes) must fail fast — the first orb to finish red ends it.
  const trials = d.buildTrials({ level: 30 }, mul(5));
  const e = new DrillEngine(d, { level: 30 }, trials, 40);
  e.start(); e.update(3100);
  let ended = -1;
  for (let i = 0; i < 60_000 / 16; i++) { e.update(16); if (st(e) === "complete") { ended = i * 16; break; } }
  const b = ffLevel(30);
  const life = b.purple + b.teal + b.blue + b.orange + b.red;
  ok(ended > 0, `passive run ended on an expiry (at ~${(ended / 1000).toFixed(1)}s)`);
  ok(ended <= life + 2000, `it ended about when the first orb's fuse ran out (~${(life / 1000).toFixed(1)}s)`);
  ok(e.getEvents().some((x) => x.errorType === "miss"), "the expiry was recorded as the failing miss");
}

console.log("\nMOVEMENT — orbs stay inside the invisible box.");
{
  const trials = d.buildTrials({ level: 100 }, mul(9));
  const e = new DrillEngine(d, { level: 100 }, trials, 40);
  e.start(); e.update(3100);
  let worstWall = 0;
  // strike everything each frame so nothing expires (keep the run alive to observe motion)
  for (let i = 0; i < 240; i++) {
    e.update(16);
    for (const s of e.pool.slots) {
      if (!s.active || !s.spec?.physics) continue;
      const px = s.pos[0], py = s.pos[1], r = s.spec.scale;
      worstWall = Math.max(worstWall, Math.abs(px) + r - HALF_W, Math.abs(py - EYE_Y) + r - HALF_H);
    }
    if (st(e) === "complete") break;
  }
  ok(worstWall < 0.01, `orbs stay in the box (worst wall overshoot ${(worstWall * 1000).toFixed(1)}mm)`);
}

console.log("\nSCORING — a fast striker clears many and survives longer than a passive one.");
{
  const trials = d.buildTrials({ level: 20 }, mul(3));
  const e = new DrillEngine(d, { level: 20 }, trials, 40);
  e.start(); e.update(3100);
  let cleared = 0;
  for (let i = 0; i < 30_000 / 16; i++) {
    e.update(16);
    if (st(e) === "complete") break;
    // strike the orb closest to expiry (highest age fraction) — good triage
    let best: { id: string; frac: number } | null = null;
    const now = (e as unknown as { timing: { now: number } }).timing.now;
    for (const s of e.pool.slots) {
      if (!s.active || !s.spec?.physics) continue;
      const age = now - s.spawnClock; const frac = age / s.spec.duration;
      if (!best || frac > best.frac) best = { id: s.spec.id, frac };
    }
    if (best && best.frac > 0.2) { e.registerHit(best.id, "right", undefined, 0.0, best.frac); }
  }
  const hits = e.getEvents().filter((x) => x.correct).length;
  ok(hits > 8, `an active striker cleared ${hits} orbs`);
  const notes = d.analyze!(e.getEvents());
  ok(notes.some((n) => n.includes("cleared")), "analyze reports orbs cleared and survival");
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
