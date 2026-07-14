import { PeripheralFieldVR } from "@/drills/acquire/PeripheralFieldVR";
import { levelFor } from "@/drills/shared/ProgressionEngine";
import { makeRng } from "@/utils/rng";

const Z = 1.3;
const issues: string[] = [];
const flag = (s: string) => { if (!issues.includes(s)) issues.push(s); };
const ecc = (p: readonly number[]) =>
  (Math.atan2(Math.hypot(p[0], p[1] - 1.45), Z) * 180) / Math.PI;

const SACCADE_MS = 200; // a saccade cannot be planned and landed faster than this

console.log("LVL  ECC     FLASH   SPAN  CLUTTER  RESP    8-WAY USED   FIXATION SAFE?");
for (const lvl of [1, 12, 26, 38, 44, 50]) {
  const params = levelFor(PeripheralFieldVR, lvl).parameters as Record<string, number>;
  const specs = PeripheralFieldVR.buildTrials(params, makeRng(lvl * 3 + 1));

  const groups = new Map<string, typeof specs>();
  for (const s of specs) {
    const g = s.groupId ?? s.id.split("-").slice(0, 2).join("-");
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(s);
  }

  const dirs = new Set<string>();
  for (const [g, items] of groups) {
    const where = items.find((s) => s.id.includes("-where"));
    const whats = items.filter((s) => s.id.includes("-what"));
    const flash = items.find((s) => s.id.endsWith("-p"));
    if (!where || !flash) { flag(`L${lvl} ${g}: missing the where-response or the peripheral flash`); continue; }
    dirs.add(String(where.requiredDirection));

    /**
     * THE ANSWER MUST NOT BE ON SCREEN WHEN THE QUESTION IS ASKED.
     *
     * If the "WHERE?" prompt rendered at the peripheral location, the athlete would be
     * flicking at a thing they can SEE rather than recalling a thing they SAW — and the
     * entire measure would be worthless while still producing plausible numbers.
     */
    if (Math.hypot(where.position[0], where.position[1] - 1.45) > 0.02) {
      flag(`L${lvl}: the WHERE prompt is not at the centre — it leaks the answer`);
    }
    const flashEnd = flash.spawnAt + flash.duration;
    if (where.spawnAt < flashEnd) {
      flag(`L${lvl}: the response opens while the peripheral target is still lit — no recall required`);
    }

    // the peripheral target must be DECOR: it can never be struck or clicked
    if (!flash.decor) flag(`L${lvl}: the peripheral target is strikeable — this is a perception task, not a reach`);
    if (flash.kind === "go") flag(`L${lvl}: the peripheral flash is a go target`);

    // a MASK must overwrite the display, or iconic memory makes the flash duration a lie
    const masks = items.filter((s) => s.id.includes("-m"));
    if (masks.length < 4) flag(`L${lvl}: no mask — the athlete can read the afterimage and the flash time means nothing`);
    for (const m of masks) {
      if (m.spawnAt < flashEnd) flag(`L${lvl}: the mask lands before the flash ends`);
    }

    // THE ANSWER SET MUST MATCH THE FLICK RESOLUTION. The WHERE question has eight real
    // answers; the WHAT question has four. If the recall were resolved into octants, a
    // flick slightly off true up would read as up-left and be scored wrong — the athlete
    // could see the shape they wanted and would have no reliable way to select it.
    if (where.meta?.axes !== 8) flag(`L${lvl}: the WHERE response is not 8-way`);
    for (const w of whats) {
      if (w.meta?.axes !== 4) flag(`L${lvl}: a WHAT response is not 4-way — a diagonal flick would misresolve it`);
    }
    // there must be a READY beat before the flash, or the trial ambushes the athlete
    const fix = items.find((s) => s.id.includes("-fix"));
    if (!fix) flag(`L${lvl}: no fixation lead-in — the flash ambushes the athlete`);
    else if (fix.duration < 550) flag(`L${lvl}: the ready beat is only ${fix.duration}ms`);
    else if (fix.spawnAt + fix.duration > flash.spawnAt + 1) flag(`L${lvl}: the ready beat overlaps the flash`);

    // the central symbol is a DIRECTIONAL ARROW at fixation; it is recalled by flicking the
    // direction it pointed (no shuffled shape options — that was the confusing indirection).
    const cen = items.filter((s) => /-c\d+$/.test(s.id));
    if (!cen.length) flag(`L${lvl}: no central arrow — nothing forces fixation`);
    for (const c of cen) {
      if (c.shape !== "arrow" || !c.meta?.pointDir) flag(`L${lvl}: a central symbol is not a directional arrow`);
    }
    if (whats.length !== (params.span as number)) {
      flag(`L${lvl}: ${whats.length} recall responses for a span of ${params.span}`);
    }
    // WHERE and the WHATs form one completion-paced chain: the WHAT members are queued
    // (spawnAt -1) and released only when the previous answer resolves — so the recall can
    // never open before the peripheral answer, by construction.
    if (where.chainId === undefined) flag(`L${lvl}: WHERE is not the head of a response chain`);
    for (const w of whats) {
      if (w.chainId !== where.chainId) flag(`L${lvl}: a WHAT is not chained to the WHERE — timing could overlap`);
      if (w.spawnAt !== -1) flag(`L${lvl}: a WHAT is fixed-scheduled, not completion-paced`);
      if ((w.seq ?? 0) <= (where.seq ?? 0)) flag(`L${lvl}: a WHAT does not sequence after the WHERE`);
    }
    // each WHAT's required direction must be a cardinal that matches its held arrow, in order
    const heldDirs = cen.sort((a, b) => a.spawnAt - b.spawnAt).map((c) => c.meta!.pointDir);
    whats.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).forEach((w, k) => {
      if (w.requiredDirection !== heldDirs[k]) flag(`L${lvl}: recall ${k} does not require the arrow's own direction`);
    });
  }

  /**
   * THE FIXATION GUARANTEE. The flash must be SHORTER than a saccade. If it is not,
   * the athlete can simply look at the peripheral target, and the drill silently stops
   * measuring peripheral vision and starts measuring eye-movement speed.
   */
  const flashMs = params.flashMs as number;
  const safe = flashMs < SACCADE_MS;
  if (!safe) {
    flag(`L${lvl}: a ${flashMs.toFixed(0)}ms flash lets the athlete SACCADE to the target — at this level the drill is not measuring peripheral vision at all`);
  }

  console.log(
    String(lvl).padEnd(4),
    `${(params.eccDeg as number).toFixed(0)}deg`.padStart(6),
    `${flashMs.toFixed(0)}ms`.padStart(7),
    String(params.span).padStart(5),
    String(params.distractors).padStart(8),
    `${(params.responseMs as number).toFixed(0)}ms`.padStart(7),
    String(dirs.size).padStart(9) + "/8",
    "   " + (safe ? "yes" : `NO — ${flashMs.toFixed(0)}ms allows a saccade`),
  );

  if (dirs.size < 6) flag(`L${lvl}: only ${dirs.size} of 8 directions were ever used`);
  // every peripheral target must actually be in the periphery
  for (const s of specs) {
    if (!s.id.endsWith("-p")) continue;
    if (ecc(s.position) < 9) flag(`L${lvl}: a "peripheral" target is only ${ecc(s.position).toFixed(0)}deg out`);
  }
}

// the ladder must actually push the field outward and the flash down
const e1 = levelFor(PeripheralFieldVR, 1).parameters.eccDeg as number;
const e50 = levelFor(PeripheralFieldVR, 50).parameters.eccDeg as number;
const f1 = levelFor(PeripheralFieldVR, 1).parameters.flashMs as number;
const f50 = levelFor(PeripheralFieldVR, 50).parameters.flashMs as number;
if (e50 < e1 * 3) flag("the field does not expand far enough across the ladder");
if (f50 > 80) flag(`top-level flash is ${f50}ms — not short enough to guarantee fixation`);
if (!PeripheralFieldVR.eightWay) flag("the drill does not enable 8-way flicks — diagonals are inexpressible");
if (PeripheralFieldVR.responseMode !== "joystick") flag("the response is not a joystick flick");

console.log("");
console.log(issues.length ? "ISSUES:\n" + issues.map((i) => "  " + i).join("\n")
  : "0 ISSUES — the answer is never on screen when the question is asked, the flash is always shorter than a saccade, and all 8 directions are live");
if (issues.length) process.exit(1);
