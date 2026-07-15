import { AegisEngine, type HandState, type HandId } from "@/aegis/ContinuousEngine";
import { TIER_TUNING } from "@/aegis/tiers";
import { computeAegisMetrics } from "@/aegis/metrics";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };
const V3 = (x = 0, y = 1.4, z = 0): [number, number, number] => [x, y, z];
const HEAD: [number, number, number] = [0, 1.6, 0];

console.log("TUNING — Beginner targets are 25% smaller, all tiers shrunk.");
ok(Math.abs(TIER_TUNING.beginner.targetSize - 0.105) < 1e-6, `beginner target 0.105m (was 0.14) — 25% smaller`);
ok(TIER_TUNING.intermediate.togetherRate > 0 && TIER_TUNING.intermediate.railRate > 0, "intermediate enables together + rail");
ok(TIER_TUNING.beginner.togetherRate === 0 && TIER_TUNING.beginner.railRate === 0, "beginner has neither (as specified)");

console.log("\nPRECISION — a swing driven straight through the centre reads PERFECT, not POOR.");
{
  const eng = new AegisEngine({ tier: "beginner", mode: "block", handRule: "symmetric", bonusEnabled: false }, 7);
  eng.start(0);
  const mk = (pos: [number, number, number], vel: [number, number, number]): Record<HandId, HandState> => ({
    left: { pos: [-1.2, 1.2, 0], vel: [0, 0, 0], gripping: false },
    right: { pos, vel, gripping: false },
  });
  let now = 0; let done = false;
  for (let i = 0; i < 1200 && !done; i++) {
    now += 8;
    const s2 = eng.snapshot();
    const o = s2.objects.find((x) => x.cat === "either" && !x.resolved);
    if (o && now >= o.actionableT) {
      const c = s2.positions[o.id];
      // hand 5cm below the LIVE centre, moving straight up -> the velocity ray passes through
      // the centre -> perpendicular (closest-approach) distance is ~0 -> PERFECT.
      eng.tick(now, mk([c[0], c[1] - 0.05, c[2]], [0, 4, 0]), HEAD);
    } else {
      eng.tick(now, mk([-1.2, 1.2, 0], [0, 0, 0]), HEAD);
    }
    if ((eng as unknown as { events: { cat: string; outcome: string }[] }).events.some((e) => e.cat === "either" && e.outcome === "blocked")) done = true;
  }
  const ev = (eng as unknown as { events: { cat: string; precisionZone?: string; outcome: string }[] }).events;
  const hit = ev.find((e) => e.cat === "either" && e.outcome === "blocked");
  ok(!!hit, `the centre-driven object was blocked (${hit?.outcome ?? "none"})`);
  ok(hit?.precisionZone === "perfect", `a dead-centre swing scores PERFECT (got ${hit?.precisionZone})`);
}

console.log("\nOFF-CENTRE — a swing that grazes the edge reads POOR.");
{
  const eng = new AegisEngine({ tier: "beginner", mode: "block", handRule: "symmetric", bonusEnabled: false }, 11);
  eng.start(0);
  const mk = (pos: [number, number, number], vel: [number, number, number]): Record<HandId, HandState> => ({
    left: { pos: [-1.2, 1.2, 0], vel: [0, 0, 0], gripping: false },
    right: { pos, vel, gripping: false },
  });
  let now = 0; let done = false;
  for (let i = 0; i < 1200 && !done; i++) {
    now += 8;
    const s2 = eng.snapshot();
    const o = s2.objects.find((x) => x.cat === "either" && !x.resolved);
    if (o && now >= o.actionableT) {
      const c = s2.positions[o.id];
      const off = o.scale * 0.9; // graze near the edge — vertical ray offset horizontally
      eng.tick(now, mk([c[0] + off, c[1] - 0.05, c[2]], [0, 4, 0]), HEAD);
    } else {
      eng.tick(now, mk([-1.2, 1.2, 0], [0, 0, 0]), HEAD);
    }
    if ((eng as unknown as { events: { cat: string; outcome: string }[] }).events.some((e) => e.cat === "either" && e.outcome === "blocked")) done = true;
  }
  const ev = (eng as unknown as { events: { cat: string; precisionZone?: string; outcome: string }[] }).events;
  const hit = ev.find((e) => e.cat === "either" && e.outcome === "blocked");
  ok(!!hit && hit.precisionZone !== "perfect", `an edge graze is NOT perfect (got ${hit?.precisionZone})`);
}

console.log("\nNO-GO — a stimulus-coloured sphere with contrast stripes; apparent early, subtle later.");
for (const tier of ["beginner", "intermediate", "goat"] as const) {
  const eng = new AegisEngine({ tier, mode: "block", handRule: "asymmetric", bonusEnabled: false }, 3);
  eng.start(0);
  const idle: Record<HandId, HandState> = { left: { pos: [-1, 1, 0], vel: [0, 0, 0], gripping: false }, right: { pos: [1, 1, 0], vel: [0, 0, 0], gripping: false } };
  let now = 0; let nogo: { color?: string; stripes?: number } | null = null;
  for (let i = 0; i < 5000 && !nogo; i++) { now += 16; eng.tick(now, idle, HEAD); const o = eng.snapshot().objects.find((x) => x.cat === "nogo"); if (o) nogo = { color: o.color, stripes: o.stripes }; }
  if (tier !== "beginner" || nogo) {
    ok(!!nogo, `${tier}: a no-go spawned`);
    if (nogo) {
      ok(nogo.color === "#8B5CF6" || nogo.color === "#2998AA", `${tier}: no-go wears a stimulus colour (${nogo.color})`);
      ok((nogo.stripes ?? 0) > 0, `${tier}: no-go has contrast stripes (apparent ${nogo.stripes})`);
    }
  }
}

console.log("\nTOGETHER + RAIL — spawn under the right conditions with their mechanics.");
{
  const eng = new AegisEngine({ tier: "intermediate", mode: "block", handRule: "asymmetric", bonusEnabled: false }, 5);
  eng.start(0);
  const idle: Record<HandId, HandState> = { left: { pos: [-1, 1, 0], vel: [0, 0, 0], gripping: false }, right: { pos: [1, 1, 0], vel: [0, 0, 0], gripping: false } };
  let now = 0; let sawTogether = false, sawRail = false;
  for (let i = 0; i < 4000 && !(sawTogether && sawRail); i++) {
    now += 16; eng.tick(now, idle, HEAD);
    for (const o of eng.snapshot().objects) {
      if (o.cat === "together") { sawTogether = true; ok(o.needsBothHands === true, "together needs both hands"); }
      if (o.cat === "rail") { sawRail = true; ok(o.onRailMs !== undefined && (o.color === "#2998AA" || o.color === "#8B5CF6"), "rail tracks on-rail time and carries a hand colour"); }
    }
    if (sawTogether && sawRail) break;
  }
  ok(sawTogether, "a TOGETHER (dark-blue both-hands) target spawned in asymmetric intermediate");
  ok(sawRail, "a RIDE-THE-RAIL segment spawned");
}

console.log("\nSCORE — the athlete-facing performance score is built from hits, centring, and streak.");
{
  const eng = new AegisEngine({ tier: "beginner", mode: "block", handRule: "symmetric", bonusEnabled: false }, 9);
  eng.start(0);
  const idle: Record<HandId, HandState> = { left: { pos: [-1, 1, 0], vel: [0, 0, 0], gripping: false }, right: { pos: [1, 1, 0], vel: [0, 0, 0], gripping: false } };
  for (let now = 0; now < 20000; now += 16) eng.tick(now, idle, HEAD);
  const m = computeAegisMetrics(eng, eng.settings);
  ok(typeof m.performanceScore === "number" && m.performanceScore >= 0, `performanceScore present (${m.performanceScore})`);
  ok(typeof m.totalHits === "number", `totalHits present (${m.totalHits})`);
  ok(m.longestStreak >= 0, `longestStreak present (${m.longestStreak})`);
}

console.log("\nBALANCE — asymmetric produces a fair teal/purple (left/right) mix, not ~90% purple.");
{
  const eng = new AegisEngine({ tier: "beginner", mode: "block", handRule: "asymmetric", bonusEnabled: false }, 123);
  eng.start(0);
  const idle: Record<HandId, HandState> = { left: { pos: [-2, 1, 0], vel: [0, 0, 0], gripping: false }, right: { pos: [2, 1, 0], vel: [0, 0, 0], gripping: false } };
  let left = 0, right = 0;
  const seen = new Set<string>();
  for (let now = 0; now < 120000; now += 16) {
    eng.tick(now, idle, HEAD);
    for (const o of eng.snapshot().objects) {
      if (seen.has(o.id)) continue; seen.add(o.id);
      if (o.cat === "left") left++; else if (o.cat === "right") right++;
    }
  }
  const total = left + right;
  const ratio = total ? Math.min(left, right) / total : 0;
  ok(total > 20, `enough hand-specific targets to judge (${total})`);
  ok(ratio >= 0.35, `left/right are balanced — minority share ${(ratio * 100).toFixed(0)}% (left ${left}, right ${right})`);
}

console.log("\nRAIL — two phases: acquire the start ball, then the rail extends and is ridden.");
{
  const eng = new AegisEngine({ tier: "intermediate", mode: "block", handRule: "asymmetric", bonusEnabled: false }, 42);
  eng.start(0);
  const mk = (lp: [number, number, number], lv: [number, number, number], rp: [number, number, number], rv: [number, number, number]): Record<HandId, HandState> => ({
    left: { pos: lp, vel: lv, gripping: false }, right: { pos: rp, vel: rv, gripping: false },
  });
  let now = 0; let rode = false; let suppressedOK = true;
  const idle = mk([-2, 1, 0], [0, 0, 0], [2, 1, 0], [0, 0, 0]);
  for (let i = 0; i < 8000 && !rode; i++) {
    now += 8;
    const snap = eng.snapshot();
    const rail = snap.objects.find((o) => o.cat === "rail" && !o.resolved);
    if (rail) {
      const hand = rail.requiredHand === "left" ? "left" : "right";
      const p = snap.positions[rail.id];
      // put the correct hand ON the rail marker every step (acquire, then ride)
      const hs: [number, number, number] = [p[0], p[1], p[2]];
      const hands = hand === "left" ? mk(hs, [0, 0, 3], [2, 1, 0], [0, 0, 0]) : mk([-2, 1, 0], [0, 0, 0], hs, [0, 0, 3]);
      eng.tick(now, hands, HEAD);
      // while a rail rides, its hand's dedicated targets must be suppressed
      if (rail.riding) {
        const conflict = eng.snapshot().objects.some((o) => o.cat === hand && !o.resolved);
        if (conflict) suppressedOK = false;
      }
    } else {
      eng.tick(now, idle, HEAD);
    }
    if ((eng as unknown as { events: { cat: string; outcome: string }[] }).events.some((e) => e.cat === "rail")) rode = true;
  }
  const ev = (eng as unknown as { events: { cat: string; outcome: string }[] }).events;
  const railEv = ev.find((e) => e.cat === "rail");
  ok(!!railEv, `a rail resolved (${railEv?.outcome ?? "none"})`);
  ok(railEv?.outcome === "blocked", `riding the rail accurately scores a success (${railEv?.outcome})`);
  ok(suppressedOK, "the ridden hand's dedicated targets were suppressed during the ride");
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
