/**
 * MOT — Dual Task. Proves the physics and the two athlete-requested behaviours.
 */
import { DrillEngine } from "../src/drills/shared/DrillEngine";
import { ALL_DRILLS } from "../src/drills/registry";
import { motLevel } from "../src/drills/route/MotDualVR";

const mul = (a: number) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const d = ALL_DRILLS.find((x) => x.id === "mot-dual")!;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };

const HALF_W = 0.62, HALF_H = 0.42, EYE_Y = 1.5;

// ── PHYSICS: no wall escape, no pass-through, motion freezes ────────────────────────────
console.log("\nPHYSICS — invisible box, hard collisions, freeze on identify.");
for (const lvl of [1, 20, 60, 100]) {
  const L = motLevel(lvl);
  const trials = d.buildTrials({ level: lvl }, mul(lvl * 131));
  const e = new DrillEngine(d, { level: lvl }, trials, 40);
  e.start(); e.update(3100);

  const r = trials.find((t) => t.physics)!.scale;
  let worstWall = 0;             // deepest wall penetration
  let worstOverlap = 0;          // deepest ball-ball overlap (pass-through test)
  let frozenMoved = 0;           // motion after endMs (must be ~0)
  const endMs = L.highlightMs + L.trackMs;

  let simT = 0;
  const prevFrozen = new Map<string, [number, number]>();
  for (let f = 0; f < 900; f++) {   // ~14s at 16ms — covers highlight+track of the fastest level? no; step big
    e.update(16); simT += 16;
    const balls = e.pool.slots.filter((s) => s.active && s.spec?.physics);
    // wall check (balls are centered at x0, y EYE_Y)
    for (const b of balls) {
      const px = b.pos[0], py = b.pos[1];
      worstWall = Math.max(worstWall, (Math.abs(px) + r) - HALF_W, (Math.abs(py - EYE_Y) + r) - HALF_H);
    }
    // pairwise overlap
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], c = balls[j];
      const dd = Math.hypot(a.pos[0] - c.pos[0], a.pos[1] - c.pos[1]);
      worstOverlap = Math.max(worstOverlap, (a.spec!.scale + c.spec!.scale) - dd);
    }
    // freeze check
    if (simT > endMs + 100) {
      for (const b of balls) {
        const p = prevFrozen.get(b.spec!.id);
        if (p) frozenMoved = Math.max(frozenMoved, Math.hypot(b.pos[0] - p[0], b.pos[1] - p[1]));
        prevFrozen.set(b.spec!.id, [b.pos[0], b.pos[1]]);
      }
    }
  }
  ok(worstWall < 0.002, `L${lvl}: balls stay in the box (deepest wall penetration ${(worstWall * 1000).toFixed(2)}mm)`);
  ok(worstOverlap < 0.006, `L${lvl}: no pass-through (deepest ball overlap ${(worstOverlap * 1000).toFixed(2)}mm of ${(r * 1000).toFixed(0)}mm radius)`);
  ok(frozenMoved < 0.001, `L${lvl}: motion freezes for the identify phase (post-freeze drift ${(frozenMoved * 1000).toFixed(3)}mm)`);
}

// ── did collisions actually happen? (a drift-only sim would pass the above trivially) ────
console.log("\nCOLLISIONS actually occur — the difficulty is real, not decorative.");
{
  const trials = d.buildTrials({ level: 100 }, mul(9));
  const e = new DrillEngine(d, { level: 100 }, trials, 40);
  e.start(); e.update(3100);
  const lastPos = new Map<string, [number, number]>();
  const lastHead = new Map<string, number>();
  let reversals = 0;
  for (let f = 0; f < 500; f++) {
    e.update(16);
    const balls = e.pool.slots.filter((s) => s.active && s.spec?.physics);
    for (const b of balls) {
      const key = b.spec!.id;
      const p = lastPos.get(key);
      if (p) {
        const dx = b.pos[0] - p[0], dy = b.pos[1] - p[1];
        if (Math.hypot(dx, dy) > 1e-5) {
          const h = Math.atan2(dy, dx);           // actual heading of travel
          const ph = lastHead.get(key);
          if (ph !== undefined) { const dth = Math.abs(((h - ph + Math.PI) % (2 * Math.PI)) - Math.PI); if (dth > 0.6) reversals++; }
          lastHead.set(key, h);
        }
      }
      lastPos.set(key, [b.pos[0], b.pos[1]]);
    }
  }
  ok(reversals > 20, `heading of travel changes abruptly ${reversals} times over the swarm — walls and collisions are deflecting balls`);
}

console.log("\nCONSTANT SPEED — collisions change direction but NOT pace (no cumulative slowdown).");
{
  const lvl = 60;
  const seedTrials = d.buildTrials({ level: lvl }, mul(21));
  const seed = seedTrials.find((t) => t.physics)!.physics!;
  const target = Math.hypot(seed.vx, seed.vy);
  const startMs = seed.startMs, endMs = seed.endMs;

  // sample per-ball frame speeds ONLY during the motion window; bin by early vs late motion.
  const e = new DrillEngine(d, { level: lvl }, seedTrials, 40);
  e.start(); e.update(3100);
  const prev = new Map<string, [number, number]>();
  const early: number[] = [], late: number[] = [];
  const nowOf = () => (e as unknown as { timing: { now: number } }).timing.now;
  for (let f = 0; f < 700; f++) {
    e.update(16);
    const t = nowOf();
    for (const sl of e.pool.slots) {
      if (!sl.active || !sl.spec?.physics) continue;
      const age = t - sl.spawnClock;
      const p = prev.get(sl.spec.id);
      if (p && age > startMs + 200 && age < endMs) {
        const sp = Math.hypot(sl.pos[0] - p[0], sl.pos[1] - p[1]) / 0.016;
        if (sp > 1e-4) (age < startMs + 3000 ? early : late).push(sp);
      }
      prev.set(sl.spec.id, [sl.pos[0], sl.pos[1]]);
    }
  }
  const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
  const me = median(early), ml = median(late);
  ok(early.length > 50 && late.length > 50, `sampled ${early.length} early and ${late.length} late motion speeds`);
  // MEDIAN frame speed is robust to the minority of frames that contained a bounce; it must
  // sit right on the level's target pace, both early AND late — proving no decay.
  ok(Math.abs(me - target) / target < 0.15, `early median pace ${me.toFixed(3)} m/s ~ target ${target.toFixed(3)}`);
  ok(Math.abs(ml - target) / target < 0.15, `late median pace ${ml.toFixed(3)} m/s ~ target (no slowdown over the run)`);
  ok(ml > me * 0.9, `late pace (${ml.toFixed(3)}) is not slower than early (${me.toFixed(3)}) — the collision decay bug is gone`);
}

// ── IDENTIFY: no expiry, select-N, decoy does not end the round ──────────────────────────
console.log("\nIDENTIFY — no clock, struggle through it, wrong pick costs but does not bail out.");
{
  const lvl = 40; const L = motLevel(lvl);
  const trials = d.buildTrials({ level: lvl }, mul(3));
  const e = new DrillEngine(d, { level: lvl }, trials, 40);
  e.start(); e.update(3100);
  // run to just past freeze
  const endMs = L.highlightMs + L.trackMs;
  let t = 0; while (t < endMs + 500) { e.update(16); t += 16; }

  // sit in the identify phase for 60s doing nothing — nothing may expire
  for (let i = 0; i < 3750; i++) e.update(16);
  const omissions = e.getEvents().filter((x) => x.errorType === "miss" && /mot-r\d+-b/.test(x.trialId)).length;
  const liveBalls = e.pool.slots.filter((s) => s.active && s.spec?.physics).length;
  ok(omissions === 0, `60s in the identify phase produced 0 timeouts (${omissions})`);
  ok(liveBalls >= L.balls, `all ${L.balls} balls still selectable after 60s of no input (${liveBalls} live)`);

  // pick ONE distractor — spends a selection but must NOT clear the field or end the round
  const distractor = e.pool.slots.find((s) => s.active && s.spec?.physics && !s.spec.switchKindTo && s.spec!.id.startsWith("mot-r0"))!;
  e.registerHit(distractor.spec!.id, "right"); e.update(20);
  const afterDecoy = e.pool.slots.filter((s) => s.active && s.spec?.physics && s.spec!.id.startsWith("mot-r0")).length;
  ok(afterDecoy >= L.balls - 1, `a wrong pick did not clear the field (${afterDecoy} balls remain)`);
  ok(e.getEvents().some((x) => x.errorType === "distractorHit"), "the wrong pick was scored as an error and spent a selection");

  // pick (track-1) TRACKED balls -> total picks reaches the budget -> round advances
  const targets = e.pool.slots.filter((s) => s.active && s.spec?.physics && s.spec.switchKindTo === "go" && s.spec!.id.startsWith("mot-r0")).slice(0, L.track - 1);
  for (const tb of targets) { e.registerHit(tb.spec!.id, "right"); e.update(20); }
  e.update(80);
  const round0Left = e.pool.slots.filter((s) => s.active && s.spec?.physics && s.spec!.id.startsWith("mot-r0")).length;
  ok(round0Left === 0, `committing ${L.track} total picks ended round 0 (${round0Left} of its balls remain)`);
}

// ── TRIGGER answers the central task only, never a ball ──────────────────────────────────
console.log("\nTRIGGER routing — central problem only, never a tracked orb.");
{
  const trials = d.buildTrials({ level: 10 }, mul(5));
  const e = new DrillEngine(d, { level: 10 }, trials, 40);
  e.start(); e.update(3100);
  for (let f = 0; f < 700; f++) { e.update(16); if (f % 6 === 0) e.registerTriggerResponse(Math.random() < 0.5 ? "left" : "right"); }
  const ballViaTrigger = e.getEvents().filter((x) => /mot-r\d+-b/.test(x.trialId) && x.actualAction?.startsWith("hit")).length;
  const central = e.getEvents().filter((x) => /-c\d+/.test(x.trialId)).length;
  ok(ballViaTrigger === 0, `triggers never selected a ball (${ballViaTrigger})`);
  ok(central > 0, `the central task was answered by trigger (${central} responses)`);
}

// ── no rotating fixation square on this drill ────────────────────────────────────────────
console.log("\nNO fixation marker.");
ok(d.noFixationMarker === true, "noFixationMarker is set — the rotating square is suppressed");

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
