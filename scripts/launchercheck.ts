import { ALL_DRILLS } from "../src/drills/registry";
import { holeCount, sizeSawtooth, HOLES } from "../src/drills/execute/launcher";

const mul = (a: number) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };

console.log("HOLE COUNT — one hole per five-level band, 1..10.");
for (const [lvl, exp] of [[1, 1], [5, 1], [6, 2], [10, 2], [11, 3], [16, 4], [46, 10], [50, 10]] as [number, number][]) {
  ok(holeCount(lvl) === exp, `level ${lvl} -> ${holeCount(lvl)} hole(s) (expected ${exp})`);
}

console.log("\nSIZE SAWTOOTH — large at each band's first level, shrinking to its last.");
for (const band of [0, 1, 9]) {
  const first = sizeSawtooth(band * 5 + 1);
  const last = sizeSawtooth(band * 5 + 5);
  ok(first > last, `band ${band + 1}: level ${band * 5 + 1} (${first.toFixed(3)}) is larger than level ${band * 5 + 5} (${last.toFixed(3)})`);
  ok(Math.abs(first - sizeSawtooth(1)) < 1e-9, `band ${band + 1} resets to the same large size at its start`);
}

for (const id of ["raw-reaction", "choice-rt"]) {
  console.log(`\n${id.toUpperCase()} — shots fire from a random active hole, converging on the athlete.`);
  const d = ALL_DRILLS.find((x) => x.id === id)!;
  for (const lvl of [1, 12, 30, 50]) {
    const trials = d.buildTrials({ ...(d.levels[lvl - 1].parameters as Record<string, number>) }, mul(lvl * 7));
    const shots = trials.filter((t) => t.kind === "go" && !t.id.includes("hole"));
    const markers = trials.filter((t) => t.id.includes("-hole"));
    // every shot fires from downfield toward the athlete (+Z), from a hole
    ok(shots.every((t) => t.position[2] <= -5.5 && (t.velocity?.[2] ?? 0) > 0), `L${lvl}: every ball fires from a hole and flies at the athlete`);
    // distinct hole positions used == holeCount, and match the markers
    const active = new Set(HOLES.slice(0, holeCount(lvl)).map((h) => `${h[0].toFixed(2)},${h[1].toFixed(2)}`));
    const holes = new Set(shots.map((t) => `${t.position[0].toFixed(2)},${t.position[1].toFixed(2)}`));
    ok([...holes].every((h) => active.has(h)), `L${lvl}: every shot comes from one of the ${holeCount(lvl)} active holes (${holes.size} used)`);
    ok(holes.size >= Math.min(holeCount(lvl), 3) || holeCount(lvl) <= 2, `L${lvl}: shots are spread across the active holes`);
    ok(markers.length === holeCount(lvl), `L${lvl}: ${markers.length} hole marker(s) drawn`);
    // size matches the sawtooth for this level
    const sz = sizeSawtooth(lvl);
    ok(shots.every((t) => Math.abs(t.scale - sz) < 1e-6), `L${lvl}: stimulus size follows the band sawtooth (${sz.toFixed(3)})`);
    // centre-only at band 1
    if (holeCount(lvl) === 1) ok([...holes][0] === "0.00,1.45", `L${lvl}: the single hole is dead centre`);
  }
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
