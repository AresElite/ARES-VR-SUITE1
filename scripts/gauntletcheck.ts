import { GauntletEngine, type HandState, type HandId, GAUNTLET_TUNING } from "@/gauntlet/engine";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  PASS" : "  FAIL"}  ${m}`); if (!c) fails++; };
const HEAD: [number, number, number] = [0, 1.6, 0];
const away: Record<HandId, HandState> = { left: { pos: [-2, 1, 0], vel: [0, 0, 0], gripping: false } as never, right: { pos: [2, 1, 0], vel: [0, 0, 0] } };

console.log("SYMMETRIC — turrets fire PURPLE balls and BOMBS only (teal reserved for asymmetric).");
{
  const eng = new GauntletEngine({ tier: "beginner", handRule: "symmetric", bonusEnabled: false }, 5);
  eng.start(0);
  const kinds = new Set<string>();
  for (let now = 0; now < 40000; now += 16) { eng.tick(now, { left: away.left, right: away.right }, HEAD); for (const o of eng.snapshot().objects) kinds.add(o.kind); }
  ok(kinds.has("purple") && kinds.has("bomb"), "purple + bombs fire");
  ok(!kinds.has("teal"), "no teal in symmetric");
}

console.log("\nASYMMETRIC — purple demands the RIGHT hand, teal the LEFT.");
{
  const eng = new GauntletEngine({ tier: "beginner", handRule: "asymmetric", bonusEnabled: false }, 9);
  eng.start(0);
  let purpleReq = "", tealReq = "";
  for (let now = 0; now < 60000; now += 16) { eng.tick(now, { left: away.left, right: away.right }, HEAD); for (const o of eng.snapshot().objects) { if (o.kind === "purple") purpleReq = o.requiredHand; if (o.kind === "teal") tealReq = o.requiredHand; } }
  ok(purpleReq === "right", `purple -> right (${purpleReq})`);
  ok(tealReq === "left", `teal -> left (${tealReq})`);
}

// helper: play a session, blocking every ball with the correct hand ON the live object,
// dodging bombs (hands + head kept clear), optionally triggering bombs.
function play(eng: GauntletEngine, opts: { block: boolean; dodge: boolean; trigger: boolean; wrongHand?: boolean }, untilMs: number) {
  let now = 0;
  for (; now < untilMs && !eng.isFinished(); now += 8) {
    const snap = eng.snapshot();
    let lh: [number, number, number] = [-2, 1.0, 0], rh: [number, number, number] = [2, 1.0, 0];
    let lv: [number, number, number] = [0, 0, 0], rv: [number, number, number] = [0, 0, 0];
    // find the most-progressed live ball to block, and a bomb to trigger
    let ball: typeof snap.objects[number] | null = null;
    for (const o of snap.objects) {
      if (o.kind !== "bomb" && opts.block) { if (!ball) ball = o; }
      if (o.kind === "bomb" && opts.trigger) eng.registerTrigger("right");
    }
    if (ball) {
      const usel = opts.wrongHand ? (ball.requiredHand === "left" ? "right" : "left") : ball.requiredHand;
      const hand: HandId = usel === "either" ? "right" : (usel as HandId);
      const p = ball.pos;
      if (hand === "left") { lh = [p[0], p[1], p[2]]; lv = [0, 0, 4]; } else { rh = [p[0], p[1], p[2]]; rv = [0, 0, 4]; }
    }
    eng.tick(now, { left: { pos: lh, vel: lv }, right: { pos: rh, vel: rv } }, HEAD);
  }
  return now;
}

console.log("\nBLOCK + STREAK — a clean player blocks balls, builds a streak, and the pace climbs.");
{
  const eng = new GauntletEngine({ tier: "beginner", handRule: "symmetric", bonusEnabled: false }, 3);
  eng.start(0);
  play(eng, { block: true, dodge: true, trigger: false }, 40000);
  const m = eng.metrics();
  ok(m.totalBlocks > 8, `blocked ${m.totalBlocks} balls`);
  ok(m.longestStreak >= 5, `built a streak (${m.longestStreak})`);
  ok(m.perfectPct + m.goodPct + m.poorPct > 0, `precision zones recorded (P${m.perfectPct}/G${m.goodPct}/Po${m.poorPct})`);
}

console.log("\nWRONG HAND — blocking a coloured ball with the wrong hand is a critical error.");
{
  const eng = new GauntletEngine({ tier: "beginner", handRule: "asymmetric", bonusEnabled: false }, 7);
  eng.start(0);
  play(eng, { block: true, dodge: true, trigger: false, wrongHand: true }, 30000);
  const m = eng.metrics();
  ok(m.wrongHand > 0, `wrong-hand blocks were flagged critical (${m.wrongHand})`);
}

console.log("\nBOMB — a bomb hitting you is critical; a bomb passing you is a dodge; trigger slows it to ~50%.");
{
  // passive-but-dodging: keep hands/head away from the bomb path (head at origin, bombs aim near origin,
  // so passive DOES get hit — instead we TRIGGER to slow, then step the head aside is not modelled, so we
  // just verify slowing happens and produces a 'slowed' event, and that an ignored bomb hits the head).
  const eng = new GauntletEngine({ tier: "beginner", handRule: "symmetric", bonusEnabled: false }, 11);
  eng.start(0);
  let slowedSeen = false;
  for (let now = 0; now < 40000 && !eng.isFinished(); now += 8) {
    const snap = eng.snapshot();
    for (const o of snap.objects) if (o.kind === "bomb") { eng.registerTrigger("right"); }
    if (snap.objects.some((o) => o.kind === "bomb" && o.slowed)) slowedSeen = true;
    eng.tick(now, { left: away.left, right: away.right }, [0, 1.6, 0]);
  }
  const m = eng.metrics();
  ok(slowedSeen && m.bombsSlowed > 0, `triggering an incoming bomb slowed it (${m.bombsSlowed} slowed)`);
  ok(m.bombContacts > 0, `an un-dodged bomb hit the head (critical) (${m.bombContacts})`);
}

console.log("\nPACE RESET — 3 criticals drop the pace to a slower baseline (not a permanent penalty).");
{
  const eng = new GauntletEngine({ tier: "beginner", handRule: "symmetric", bonusEnabled: false }, 4);
  eng.start(0);
  // never respond -> balls miss, bombs hit -> criticals accrue; watch the pace flip to 'slow'
  let sawSlow = false;
  for (let now = 0; now < 60000 && !sawSlow; now += 8) { eng.tick(now, { left: away.left, right: away.right }, [0, 1.6, 0]); if (eng.snapshot().pace === "slow") sawSlow = true; }
  ok(sawSlow, "after enough criticals the pace resets to slow");
}

console.log("\nADAPTIVE SWITCH — advanced/GOAT asymmetric flips the hand mapping mid-run.");
{
  const eng = new GauntletEngine({ tier: "goat", handRule: "asymmetric", bonusEnabled: false }, 2);
  eng.start(0);
  let flipped = false, warned = false;
  for (let now = 0; now < 120000 && !flipped; now += 16) { eng.tick(now, { left: away.left, right: away.right }, HEAD); const s = eng.snapshot(); if (s.switchWarnMs > 0) warned = true; if (s.handFlipped) flipped = true; }
  ok(warned, "a SWITCH warning was shown before the flip");
  ok(flipped, "the hand mapping flipped");
  ok(GAUNTLET_TUNING.beginner.handSwitch === false && GAUNTLET_TUNING.goat.handSwitch === true, "switch is a GOAT/Advanced feature only");
}

console.log("\nBONUS — the main round is 2:30, then a bonus round runs until the first critical.");
{
  const eng = new GauntletEngine({ tier: "beginner", handRule: "symmetric", bonusEnabled: true }, 6);
  eng.start(0);
  let sawBonus = false;
  for (let now = 0; now < 200000 && !eng.isFinished(); now += 16) { eng.tick(now, { left: away.left, right: away.right }, [0, 1.6, 0]); if (eng.snapshot().phase === "bonus") sawBonus = true; }
  const m = eng.metrics();
  ok(sawBonus, "the run entered the bonus phase after the main round");
  ok(eng.isFinished() && !!m.failCause, `bonus ended on a failure (${m.failCause})`);
}

console.log(fails === 0 ? "\nALL CHECKS PASSED\n" : `\n${fails} CHECK(S) FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
