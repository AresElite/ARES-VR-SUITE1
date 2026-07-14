/**
 * PERIPHERAL FIELD — a LIVE play-through. The structure checks (periphcheck) never drove a
 * flick through the engine, so a central task that looked right on paper could still be
 * unanswerable in play. This one actually answers every trial and asserts it scored.
 */
import { DrillEngine } from "../src/drills/shared/DrillEngine";
import { PeripheralFieldVR } from "../src/drills/acquire/PeripheralFieldVR";
import { levelFor } from "../src/drills/shared/ProgressionEngine";
import type { SliceDirection } from "../src/ares/drillTypes";

const mul = (a: number) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };

// resolve the live go question, mimicking the JoystickListener's earliest-live fallback.
function liveGo(e: DrillEngine): { id: string; dir: SliceDirection; central: boolean } | null {
  let best: { id: string; dir: SliceDirection; central: boolean; spawn: number } | null = null;
  for (const slot of e.pool.slots) {
    if (!slot.active || !slot.spec) continue;
    if (slot.spec.kind === "go" && !slot.spec.decor && !slot.spec.meta?.decor) {
      if (!best || slot.spawnClock < best.spawn) {
        best = { id: slot.spec.id, dir: slot.spec.requiredDirection as SliceDirection, central: !!slot.spec.meta?.central, spawn: slot.spawnClock };
      }
    }
  }
  return best ? { id: best.id, dir: best.dir, central: best.central } : null;
}

for (const lvl of [1, 12, 26, 44, 50]) {
  const params = levelFor(PeripheralFieldVR, lvl).parameters as Record<string, number>;
  const trials = PeripheralFieldVR.buildTrials(params, mul(lvl * 17));
  const e = new DrillEngine(PeripheralFieldVR, params, trials, 40);
  e.start(); e.update(3100);

  let whereAns = 0, whatAns = 0, whereRight = 0, whatRight = 0, wrongMode = 0;
  const dt = 16;
  // a PERFECT player: whenever an ordered target is live and hasn't been answered, flick its
  // required direction. Advance in small steps.
  const answered = new Set<string>();
  for (let step = 0; step < 420_000 / dt; step++) {
    e.update(dt);
    if (e.getState?.() === "complete" || (e as unknown as { state: string }).state === "complete") break;
    const tgt = liveGo(e);
    if (tgt && !answered.has(tgt.id)) {
      answered.add(tgt.id);
      // count what kind of question this is
      if (tgt.central) whatAns++; else whereAns++;
      // a perfect flick: the exact required direction (8-way where, 4-way central — both are
      // just the required direction, which is what a correct athlete would produce)
      e.registerHit(tgt.id, "right", tgt.dir);
    }
  }
  const ev = e.getEvents();
  const whereEv = ev.filter((x) => x.trialId.includes("-where"));
  const whatEv = ev.filter((x) => x.trialId.includes("-what"));
  whereRight = whereEv.filter((x) => x.correct).length;
  whatRight = whatEv.filter((x) => x.correct).length;

  const T = params.trials, span = params.span;
  ok(whereEv.length === T, `L${lvl}: all ${T} WHERE questions were reachable and answered (${whereEv.length})`);
  ok(whatEv.length === T * span, `L${lvl}: all ${T * span} central-recall questions were reachable and answered (${whatEv.length})`);
  ok(whereRight === T, `L${lvl}: a correct WHERE flick scores every time (${whereRight}/${T})`);
  ok(whatRight === T * span, `L${lvl}: a correct ARROW-direction flick scores every time (${whatRight}/${T * span})`);
}

// ── PACING: level 1 must give real time. A trial's "seeing→answering" hand-off must have a
//    visible settle beat, and the whole trial must not be a rapid-fire ambush. ────────────
console.log("\nPACING — level 1 is not an ambush.");
{
  const p1 = levelFor(PeripheralFieldVR, 1).parameters as Record<string, number>;
  ok(p1.readyMs >= 1500, `L1 lead-in is ${p1.readyMs}ms (>=1500 — eyes park before the flash)`);
  ok(p1.settleMs >= 500, `L1 has a ${p1.settleMs}ms settle beat between the mask and the prompt`);
  ok(p1.interTrialMs >= 1200, `L1 leaves ${p1.interTrialMs}ms between trials`);
  ok(p1.responseMs >= 1800, `L1 gives ${p1.responseMs}ms per flick (generous for a <1s flick, not bloated)`);
  // the flash still must be sub-saccadic even at L1 — the science is not negotiable
  ok(p1.flashMs <= 200, `L1 flash is ${p1.flashMs}ms (still shorter than a ~200ms saccade)`);
}

console.log("\nFIELD MAP — analyze() must now report per-direction data (was silently empty).");
{
  const params = levelFor(PeripheralFieldVR, 30).parameters as Record<string, number>;
  const trials = PeripheralFieldVR.buildTrials(params, mul(99));
  const e = new DrillEngine(PeripheralFieldVR, params, trials, 40);
  e.start(); e.update(3100);
  for (let step = 0; step < 420_000 / 16; step++) {
    e.update(16);
    if ((e as unknown as { state: string }).state === "complete") break;
    const tgt = liveGo(e);
    if (tgt) e.registerHit(tgt.id, "right", tgt.dir);
  }
  const notes = PeripheralFieldVR.analyze!(e.getEvents());
  const mapLine = notes.find((n) => n.includes("FIELD MAP"));
  ok(!!mapLine && /\b(up|down|left|right)\b/.test(mapLine), `analyze() reports a populated field map: ${mapLine ? mapLine.slice(0, 60) + "…" : "MISSING"}`);
  ok(notes.some((n) => /central recall \d+%/.test(n)), "analyze() reports central recall too");
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
