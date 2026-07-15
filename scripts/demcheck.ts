import { DrillEngine } from "../src/drills/shared/DrillEngine";
import { ALL_DRILLS } from "../src/drills/registry";
import type { SliceDirection } from "../src/ares/drillTypes";

const mul = (a: number) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const d = ALL_DRILLS.find((x) => x.id === "assess-dem-arrows")!;
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };

for (const sub of ["dem-1", "dem-2"]) {
  console.log(`\n${sub.toUpperCase()} — zig-zag layout, no highlight.`);
  const trials = d.buildTrials({ subtest: sub, dominantHand: "right" }, mul(sub === "dem-2" ? 2 : 1))
    .slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  ok(trials.length === 40, `${sub}: 40 arrows`);
  ok(trials.every((t) => t.meta?.demHighlight === false), `${sub}: NO arrow is highlighted (cursor off)`);

  // reconstruct rows by y, confirm the reading order SNAKES (alternating x direction per row)
  const rows = new Map<number, { seq: number; x: number }[]>();
  for (const t of trials) {
    const yKey = Math.round(t.position[1] * 1000);
    if (!rows.has(yKey)) rows.set(yKey, []);
    rows.get(yKey)!.push({ seq: t.seq ?? 0, x: t.position[0] });
  }
  const rowYs = [...rows.keys()].sort((a, b) => b - a); // top to bottom
  ok(rowYs.length === 8, `${sub}: 8 rows of 5 (${rowYs.length} rows)`);
  let snakes = true;
  rowYs.forEach((yK, r) => {
    const row = rows.get(yK)!.sort((a, b) => a.seq - b.seq); // in reading order
    const xs = row.map((c) => c.x);
    const ascending = xs.every((v, i) => i === 0 || v > xs[i - 1]);
    const descending = xs.every((v, i) => i === 0 || v < xs[i - 1]);
    // even rows read left->right (ascending x), odd rows right->left (descending x)
    if (r % 2 === 0 ? !ascending : !descending) snakes = false;
  });
  ok(snakes, `${sub}: reading order snakes — L→R on even rows, R→L on odd rows`);
  // rows descend the board in reading order
  const firstOfEachRow = rowYs.map((yK) => Math.min(...rows.get(yK)!.map((c) => c.seq)));
  ok(firstOfEachRow.every((v, i) => i === 0 || v > firstOfEachRow[i - 1]), `${sub}: the snake works top to bottom`);
}

console.log("\nDEM III — the dense grid KEEPS its gold cursor.");
{
  const trials = d.buildTrials({ subtest: "dem-3", dominantHand: "right" }, mul(3));
  ok(trials.length === 80, `dem-3: 80 arrows`);
  ok(trials.every((t) => t.meta?.demHighlight !== false), `dem-3: the current arrow still glows (cursor on)`);
}

console.log("\nLIVE — a self-navigating athlete answers the zig-zag in order.");
{
  const trials = d.buildTrials({ subtest: "dem-1", dominantHand: "right" }, mul(1));
  const e = new DrillEngine(d, { subtest: "dem-1", dominantHand: "right" }, trials, 64);
  e.start(); e.update(3100);
  // resolve each arrow in expected order by flicking its true direction (a perfect reader).
  // Only fire once the current arrow is actually LIVE in the pool (they spawn at 600ms).
  for (let guard = 0; guard < 4000 && e.expectedSeq("dem") < 40; guard++) {
    e.update(20);
    const expected = e.expectedSeq("dem");
    const live = e.pool.slots.find((sl) => sl.active && sl.spec?.groupId === "dem" && (sl.spec.seq ?? -1) === expected);
    if (live?.spec) e.registerHit(live.spec.id, "right", live.spec.requiredDirection as SliceDirection);
  }
  const ev = e.getEvents().filter((x) => x.trialId === "dem");
  const correct = ev.filter((x) => x.correct).length;
  ok(correct === 40, `a perfect reader answered all 40 in zig-zag order (${correct}/40)`);
  // an out-of-order flick (skipping ahead) must NOT resolve the wrong arrow
  const e2 = new DrillEngine(d, { subtest: "dem-1", dominantHand: "right" }, d.buildTrials({ subtest: "dem-1", dominantHand: "right" }, mul(1)), 64);
  e2.start(); e2.update(3100);
  const t2 = d.buildTrials({ subtest: "dem-1", dominantHand: "right" }, mul(1));
  const ahead = t2.find((t) => (t.seq ?? -1) === 5)!;
  e2.registerHit(ahead.id, "right", ahead.requiredDirection as SliceDirection); // skip to seq 5
  e2.update(40);
  ok(e2.expectedSeq("dem") === 0, "flicking an arrow out of order does not advance the sequence");
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
