import { makeRtStair, stairFactor, stairThreshold } from "../src/drills/assess/AssessDrills";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };
const MUL = 0.07;

// drive the staircase by a scripted outcome sequence. Each entry = the outcome of the trial
// that just resolved; we read the factor the NEXT ball would fire at.
function run(outcomes: (boolean | null)[]) {
  const st = makeRtStair();
  let hits = 0, errors = 0;
  const factors: number[] = [];
  // first ball, nothing resolved yet
  factors.push(stairFactor(st, { hits, errors, lastEventCorrect: undefined }));
  for (const o of outcomes) {
    if (o === true) hits++; else errors++;
    factors.push(stairFactor(st, { hits, errors, lastEventCorrect: o === true }));
  }
  return { st, factors };
}

console.log("CLIMB — a speed is confirmed only after 3 clean reps in a row.");
{
  // three hits at the start: ball 1..3 stay at base, ball 4 steps up
  const { st, factors } = run([true, true, true]);
  ok(Math.abs(factors[0] - 1) < 1e-9, "ball 1 fires at the start speed (factor 1.00)");
  ok(Math.abs(factors[1] - 1) < 1e-9 && Math.abs(factors[2] - 1) < 1e-9, "balls 2-3 stay at base while the 3-in-a-row is still building");
  // after the 3rd hit resolves, the NEXT ball (index 3 -> the 4th) already reflects the confirm? trace:
  // outcomes[2] is the 3rd hit -> confirm -> stepIdx 1. factors[3] computed AFTER that = 1.07
  ok(Math.abs(factors[3] - 1.07) < 1e-9, `after 3 clean reps the ball steps up to 1.07x (got ${factors[3].toFixed(3)})`);
  ok(st.bestStep === 0, "the base speed is the first confirmed threshold");
}

console.log("\nMISS — drops ONLY to the last confirmed step, never to the start.");
{
  // confirm base (3 hits) -> now at step1. confirm step1 (3 more hits) -> step2. then MISS.
  const seq = [true, true, true, /*->step1*/ true, true, true, /*->step2*/ false];
  const { st, factors } = run(seq);
  // after confirming step1, balls fire at 1.07; after confirming... let's just check the last one
  const afterMiss = factors[factors.length - 1];
  ok(st.confirmedStep === 1, `confirmed step is 1 after two confirmations (${st.confirmedStep})`);
  ok(Math.abs(afterMiss - (1 + 1 * MUL)) < 1e-9, `after a miss the ball drops to the last confirmed speed 1.07x, NOT 1.00x (got ${afterMiss.toFixed(3)})`);
  ok(afterMiss > 1.0001, "the miss did NOT reset to the original start speed");
  ok(st.bestStep === 1, "the confirmed threshold (bestStep) survives the miss");
}

console.log("\nTHRESHOLD — reported as m/s, mph, and a response window; needs a 3-in-a-row.");
{
  // never gets 3 in a row -> no threshold
  const a = run([true, false, true, false]);
  ok(stairThreshold(a.st, 8, 6).includes("not established"), "no 3-in-a-row -> threshold not established");
  // a clean climb -> threshold established with mph + ms
  const b = run([true, true, true, true, true, true]); // confirm base then step1
  const note = stairThreshold(b.st, 8, 6);
  ok(/mph/.test(note) && /ms response window/.test(note), `threshold note carries mph and a ms window: "${note}"`);
  ok(b.st.bestStep >= 1, "a clean climb confirms at least one step above base");
}

console.log("\nREPEATED MISSES — never fall below a confirmed floor.");
{
  const seq = [true, true, true, /*confirm base, step1*/ false, false, false, false];
  const { factors } = run(seq);
  const tail = factors.slice(-3);
  ok(tail.every((f) => Math.abs(f - 1.0) < 1e-9), "with only base confirmed, misses hold at base (the floor) — not below");
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
