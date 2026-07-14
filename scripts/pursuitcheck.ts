import { DrillEngine } from "../src/drills/shared/DrillEngine";
import { ALL_DRILLS } from "../src/drills/registry";
import { ppLevel } from "../src/drills/synchronize/PursuitPulseVR";
import type { SliceDirection } from "../src/ares/drillTypes";

const mul = (a: number) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const d = ALL_DRILLS.find((x) => x.id === "pursuit-pulse")!;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };
const st = (e: DrillEngine) => (e as unknown as { state: string }).state;

console.log("STRUCTURE — one pursuit ball, prompts, escalating distractors & anti-saccades.");
for (const lvl of [1, 30, 55, 75, 100]) {
  const L = ppLevel(lvl);
  const trials = d.buildTrials({ level: lvl }, mul(lvl * 7));
  ok(trials.filter((t) => t.id === "pp-ball").length === 1, `L${lvl}: exactly one pursuit ball`);
  ok(trials.filter((t) => t.id.startsWith("pp-dist")).length === L.distractorCount, `L${lvl}: ${L.distractorCount} distractors`);
  const prompts = trials.filter((t) => t.kind === "go");
  ok(prompts.length > 10, `L${lvl}: ${prompts.length} arrow prompts across the minute`);
  const antiShare = prompts.filter((t) => t.meta?.anti).length / prompts.length;
  if (L.antiSaccadeChance === 0) ok(antiShare === 0, `L${lvl}: no anti-saccades below the threshold`);
  else ok(antiShare > 0, `L${lvl}: anti-saccades present (${(antiShare * 100).toFixed(0)}%)`);
  ok(prompts.every((t) => t.wander !== undefined && t.meta?.axes === 8), `L${lvl}: prompts ride an 8-way path`);
}

console.log("\nRIDING — the arrow sits on the ball while it is lit.");
{
  const trials = d.buildTrials({ level: 20 }, mul(3));
  const e = new DrillEngine(d, { level: 20 }, trials, 40);
  e.start(); e.update(3100);
  let worst = 0, samples = 0;
  for (let i = 0; i < 62000/16; i++) {
    e.update(16);
    if (st(e) === "complete") break;
    const ball = e.pool.slots.find((s) => s.active && s.spec?.id === "pp-ball");
    const arrow = e.pool.slots.find((s) => s.active && s.spec?.kind === "go");
    if (ball && arrow) {
      const dd = Math.hypot(ball.pos[0] - arrow.pos[0], ball.pos[1] - arrow.pos[1]);
      worst = Math.max(worst, dd); samples++;
    }
  }
  ok(samples > 20, `observed ${samples} lit-arrow frames`);
  ok(worst < 0.03, `the arrow tracks the ball within ${(worst * 1000).toFixed(0)}mm while lit`);
}
function DURATION_STEPS() { return 62_000 / 16; }

console.log("\nSESSION — 60-second hard stop.");
{
  const trials = d.buildTrials({ level: 40 }, mul(5));
  const e = new DrillEngine(d, { level: 40 }, trials, 40);
  e.start(); e.update(3100);
  let ended = -1;
  for (let i = 0; i < 70_000 / 16; i++) { e.update(16); if (st(e) === "complete") { ended = i * 16; break; } }
  ok(ended > 55_000 && ended < 62_000, `ended at the 60s buzzer (~${(ended / 1000).toFixed(1)}s)`);
}

console.log("\nRESPONSE — a correct flick scores; anti requires the opposite; analyze splits them.");
{
  const trials = d.buildTrials({ level: 85 }, mul(9));
  const e = new DrillEngine(d, { level: 85 }, trials, 40);
  e.start(); e.update(3100);
  const answered = new Set<string>();
  let antiTowardWrong = false, testedAnti = false;
  for (let i = 0; i < 62_000 / 16; i++) {
    e.update(16);
    if (st(e) === "complete") break;
    const g = e.pool.slots.find((s) => s.active && s.spec?.kind === "go" && !answered.has(s.spec.id));
    if (g?.spec) {
      answered.add(g.spec.id);
      if (g.spec.meta?.anti && !testedAnti) {
        testedAnti = true;
        e.registerHit(g.spec.id, "right", g.spec.meta.pointDir as SliceDirection); // toward arrow = reflex error
      } else {
        e.registerHit(g.spec.id, "right", g.spec.requiredDirection as SliceDirection);
      }
    }
  }
  const ev = e.getEvents().filter((x) => x.trialId.startsWith("pp-"));
  const pro = ev.filter((x) => x.trialId.includes("-pro"));
  ok(pro.length > 0 && pro.every((x) => x.correct), `every correct pro flick scored (${pro.filter((x) => x.correct).length}/${pro.length})`);
  antiTowardWrong = ev.some((x) => x.trialId.includes("-anti") && !x.correct);
  ok(testedAnti && antiTowardWrong, "flicking toward the arrow on an anti cue scored wrong");
  const notes = d.analyze!(e.getEvents());
  ok(notes.some((n) => n.includes("Anti-saccade")), "analyze reports the anti-saccade cost");
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
