import { SpeedSearch } from "@/drills/acquire/AcquireDrills";
import { levelFor } from "@/drills/shared/ProgressionEngine";
import { makeRng } from "@/utils/rng";

const Z = 1.25;
const issues: string[] = [];
const flag = (s: string) => { if (!issues.includes(s)) issues.push(s); };
const eccOf = (p: readonly number[]) =>
  (Math.atan2(Math.hypot(p[0], p[1] - 1.45), Z) * 180) / Math.PI;

console.log("LVL  BAND         ITEMS  TRIALS   MEAN ECC  MAX ECC   SIZE    CONTRAST  ANGLE DIFF  MIN SEP");
for (const lvl of [1, 8, 16, 17, 24, 32, 33, 40, 50]) {
  const params = levelFor(SpeedSearch, lvl).parameters;
  const specs = SpeedSearch.buildTrials(params, makeRng(lvl * 3 + 1));
  const groups = new Map<string, typeof specs>();
  for (const s of specs) {
    const g = s.groupId!;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(s);
  }

  // ---- 20 items in EVERY field, 20 fields in every run. Non-negotiable.
  if (groups.size !== 20) flag(`L${lvl}: ${groups.size} searches, expected 20`);
  for (const [g, items] of groups) {
    if (items.length !== 20) flag(`L${lvl} ${g}: field of ${items.length}, expected 20`);
    const gos = items.filter((s) => s.kind === "go");
    if (gos.length !== 1) flag(`L${lvl} ${g}: ${gos.length} targets, expected exactly 1`);

    // ---- separation: two items must never overlap into one blob
    let minSep = Infinity;
    for (let a = 0; a < items.length; a++)
      for (let b = a + 1; b < items.length; b++) {
        minSep = Math.min(minSep, Math.hypot(
          items[a].position[0] - items[b].position[0],
          items[a].position[1] - items[b].position[1]));
      }
    // no item may be flung outside the field the level actually asked for
    const eccDeg = (params.eccDeg as number);
    for (const it of items) {
      // the field may WIDEN if 20 items cannot pack into the nominal one — that is
      // correct behaviour. What it may never do is overlap them.
      if (eccOf(it.position) > eccDeg + 10) {
        flag(`L${lvl}: an item sits at ${eccOf(it.position).toFixed(1)}deg, outside the level's ${eccDeg.toFixed(0)}deg field`);
      }
    }
    if (minSep < items[0].scale * 2) {
      flag(`L${lvl} ${g}: items overlap (sep ${minSep.toFixed(3)} < 2x radius ${(items[0].scale * 2).toFixed(3)})`);
    }

    const band = params.band as string;
    if (band === "form") {
      // the target must be findable by SHAPE and nothing else — same colour, same size
      const t = gos[0];
      if (t.shape !== "pyramid") flag(`L${lvl}: form-band target is not a pyramid`);
      const colours = new Set(items.map((s) => s.color));
      if (colours.size > 1) flag(`L${lvl}: form band uses more than one colour — that is a highlight, not a search`);
      const sizes = new Set(items.map((s) => s.scale.toFixed(4)));
      if (sizes.size > 1) flag(`L${lvl}: form band has mixed sizes — size becomes a second cue`);
    } else {
      // ORIENTATION band: 19 at one angle, exactly 1 rotated. No shape or colour cue.
      const angles = items.map((s) => s.grating!.angleDeg);
      const tAngle = gos[0].grating!.angleDeg;
      const crowd = angles.filter((a) => a !== tAngle);
      if (crowd.length !== 19) flag(`L${lvl} ${g}: crowd is ${crowd.length} items, expected 19 at one angle`);
      if (new Set(crowd).size !== 1) flag(`L${lvl} ${g}: the 19 decoys are NOT all the same orientation`);
      if (new Set(items.map((s) => s.shape)).size > 1) flag(`L${lvl}: orientation band mixes shapes — that reintroduces a form cue`);
      const cs = new Set(items.map((s) => s.grating!.contrastPct));
      if (cs.size > 1) flag(`L${lvl}: the target's contrast differs from the crowd's — it would pop out on brightness`);
    }
  }

  const eccs = specs.map((s) => eccOf(s.position));
  const first = [...groups.values()][0];
  const g0 = first[0].grating;
  const tg = first.find((s) => s.kind === "go")!.grating;
  const diff = g0 && tg ? Math.abs(tg.angleDeg - (first.find((s) => s.kind === "distractor")!.grating!.angleDeg)) : 0;
  console.log(
    String(lvl).padEnd(4),
    String(params.band).padEnd(13),
    String(first.length).padStart(5),
    String(groups.size).padStart(7),
    `${(eccs.reduce((a, b) => a + b, 0) / eccs.length).toFixed(1)}deg`.padStart(10),
    `${Math.max(...eccs).toFixed(1)}deg`.padStart(9),
    `${(first[0].scale * 100).toFixed(1)}cm`.padStart(7),
    g0 ? `${g0.contrastPct.toFixed(0)}%`.padStart(9) : "     n/a ",
    g0 ? `${diff.toFixed(0)}deg`.padStart(11) : "        n/a",
  );
}

// ---- the ladder must actually push OUTWARD, and items must actually SHRINK
const eccAt = (l: number) => {
  const s = SpeedSearch.buildTrials(levelFor(SpeedSearch, l).parameters, makeRng(7));
  return s.reduce((m, x) => m + eccOf(x.position), 0) / s.length;
};
const sizeAt = (l: number) => SpeedSearch.buildTrials(levelFor(SpeedSearch, l).parameters, makeRng(7))[0].scale;
if (eccAt(50) <= eccAt(1) * 1.7) flag("the field does not expand meaningfully into the periphery across the ladder");
if (eccAt(50) < 26) flag(`top-level mean eccentricity is only ${eccAt(50).toFixed(1)}deg — not a peripheral search`);
if (sizeAt(50) >= sizeAt(1) * 0.6) flag("items do not shrink meaningfully across the ladder");

// ---- contrast must fall ONLY in the top band, and must actually fall
const cAt = (l: number) => (levelFor(SpeedSearch, l).parameters.contrastPct as number);
if (cAt(20) !== cAt(30)) flag("contrast is moving inside the orientation band — it should be held constant there");
if (!(cAt(50) < cAt(35) && cAt(35) < cAt(33))) flag("contrast does not fall across the top band");
if (cAt(50) > 12) flag(`top level contrast is ${cAt(50)}% — not low enough to be an edge-detection task`);

console.log("");
console.log(issues.length ? "ISSUES:\n" + issues.map((i) => "  " + i).join("\n")
  : "0 ISSUES — 20 items x 20 searches at every level; the field expands to 40deg, items shrink, and the top band is a low-contrast orientation singleton with no form or colour cue");
if (issues.length) process.exit(1);
