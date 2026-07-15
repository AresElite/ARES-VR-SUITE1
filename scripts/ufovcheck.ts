import { DrillEngine } from "../src/drills/shared/DrillEngine";
import { ALL_DRILLS } from "../src/drills/registry";
import type { SliceDirection } from "../src/ares/drillTypes";

const mul = (a: number) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const d = ALL_DRILLS.find((x) => x.id === "assess-ufov")!;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };

console.log("RESPONSE MODE — a joystick flick, not a fragile pointer.");
ok(d.responseMode === "joystick" && (d as { eightWay?: boolean }).eightWay === true, "UFOV answers with an 8-way joystick flick");

const params = { trialsPerEye: 15, dominantHand: "right" };
const trials = d.buildTrials(params, mul(7));
const flicks = trials.filter((t) => t.id.includes("-flick"));
const oldRings = trials.filter((t) => /-r\d+$/.test(t.id) && t.kind === "go");
console.log("\nSTRUCTURE — one flick target per trial; no pointer rings.");
ok(flicks.length === 30, `30 flick targets (15 per eye x 2) — got ${flicks.length}`);
ok(oldRings.length === 0, "no pointer response rings remain");
ok(flicks.every((t) => t.meta?.axes === 8 && t.requiredDirection !== undefined), "each flick target carries an 8-way required direction");

console.log("\nLIVE — flicking toward the flash sector scores; the wrong way does not.");
{
  const e = new DrillEngine(d, params, trials, 64);
  e.start(); e.update(2650); // clear countdown + first banner
  let resolved = 0, correct = 0;
  const seen = new Set<string>();
  for (let i = 0; i < 200_000 / 20; i++) {
    e.update(20);
    if ((e as unknown as { state: string }).state === "complete") break;
    const g = e.pool.slots.find((s) => s.active && s.spec?.kind === "go" && s.spec.id.includes("-flick") && !seen.has(s.spec.id));
    if (g?.spec) {
      seen.add(g.spec.id);
      e.registerHit(g.spec.id, "right", g.spec.requiredDirection as SliceDirection);
    }
  }
  const ev = e.getEvents().filter((x) => /^ufov-(right|left)-/.test(x.trialId));
  resolved = ev.length; correct = ev.filter((x) => x.correct).length;
  ok(resolved === 30, `all 30 trials resolved by a flick (${resolved})`);
  ok(correct === 30, `a flick toward the flash is scored correct every time (${correct}/30)`);

  // a wrong-direction flick scores wrong (and still advances)
  const e2 = new DrillEngine(d, params, d.buildTrials(params, mul(7)), 64);
  e2.start(); e2.update(2650);
  let tested = false, wrong = false;
  for (let i = 0; i < 20_000 / 20 && !tested; i++) {
    e2.update(20);
    const g = e2.pool.slots.find((s) => s.active && s.spec?.kind === "go" && s.spec.id.includes("-flick"));
    if (g?.spec) {
      tested = true;
      const opp: Record<string, SliceDirection> = { up: "down", down: "up", left: "right", right: "left", upLeft: "downRight", upRight: "downLeft", downLeft: "upRight", downRight: "upLeft" };
      e2.registerHit(g.spec.id, "right", opp[g.spec.requiredDirection as string]);
      e2.update(40);
      wrong = e2.getEvents().some((x) => /^ufov-/.test(x.trialId) && !x.correct);
    }
  }
  ok(tested && wrong, "a flick the wrong way is scored as a miss");

  const notes = d.analyze!(e.getEvents());
  ok(notes.some((n) => n.includes("localization")), "analyze reports per-eye localization");
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
