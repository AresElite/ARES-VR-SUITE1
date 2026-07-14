import type { DrillDefinition, TrialSpec, ProgressionLevel } from "@/ares/drillTypes";

/**
 * RAPID RECOGNITION — the full 150-level lattice, ported whole.
 *
 * A central TEAL token shows you the target. Around it, several tokens flash for a heartbeat
 * and then GO BLANK — and they are all drifting. You have to recognise which blank circle held
 * the token that matched the centre, keep track of where it drifted, and pick it. It is a
 * recognition + spatial-memory + tracking task run at speed.
 *
 * THREE LIVES. A wrong pick costs one; a run ends when they are gone. A streak of three correct
 * picks earns one back. And it ramps as you succeed — more tokens, shorter flashes, smaller
 * circles — so the run keeps pushing until it finds your ceiling.
 *
 * The 150 levels are not a line: they are a LATTICE of five difficulty tiers × ten content
 * types (colours, shapes, digits of 1–4 places, letters, 3- and 5-letter words) × three
 * backgrounds, each level scored by a weighted blend of flash, count, size, speed, content and
 * background, then sorted. So level 1 is the easiest CELL of that space and level 150 the
 * hardest — the exact ordering the reference computes.
 *
 * VR MAPPING. Reference is a touch tap; here it is a controller ray + trigger. Tokens ride the
 * invisible-box physics (drift, wall bounce, mutual collision), the token hides after the flash
 * (hideLabelAfterMs) leaving a blank pickable circle, and a pick is refused until the flash has
 * ended (clickableAfterMs) so the answer must come from memory, exactly as the original.
 */

const Z = -1.5;
const HALF_W = 0.62, HALF_H = 0.42, CY = 1.5;
const PX = 0.0016;                 // metres per reference pixel (bigger, so tokens read at range)
const VEL = 0.00016;               // path speed scale (reference speed is a small px/frame factor)

const COLORS = ["#008080", "#6D5FA8", "#dc2626", "#2563eb"];
const COLOR_NAMES: Record<string, string> = { "#008080": "TEAL", "#6D5FA8": "PURPLE", "#dc2626": "RED", "#2563eb": "BLUE" };
const SHAPES_SPAN = ["circle", "triangle", "square"];
const SHAPES_SPEED = ["square", "pentagon", "hexagon", "septagon", "octagon"];
const CONTENTS = ["colors", "span", "speed", "num1", "num2", "num3", "num4", "letter1", "word3", "word5"];
const BG_CHOICES = ["white", "black", "optical"];

const BASE_SIZE = 96, MAX_SHAPES = 10, MIN_FLASH = 200, SIZE_FLOOR = 24;
const MAX_LIVES = 3, STREAK_FOR_LIFE = 3;

const DIFF = {
  beginner: { flash: 1400, count: 3, size: BASE_SIZE * 1.5, speed: 0.50 },
  intermediate: { flash: 1000, count: 3, size: BASE_SIZE * 1.35, speed: 0.65 },
  advanced: { flash: 850, count: 4, size: BASE_SIZE * 1.25, speed: 0.85 },
  elite: { flash: 650, count: 4, size: BASE_SIZE * 1.15, speed: 1.05 },
  professional: { flash: 480, count: 5, size: BASE_SIZE * 1.05, speed: 1.35 },
} as const;

const WEIGHTS = { FLASH: 0.35, COUNT: 0.25, SIZE: 0.25, SPEED: 0.15 };
const CONTENT_BUMP: Record<string, number> = { colors: 0, span: 0.2, letter1: 0.3, num1: 0.35, word3: 0.45, num2: 0.5, word5: 0.6, num3: 0.65, speed: 0.75, num4: 0.8 };
const BG_BUMP: Record<string, number> = { white: 0, black: 0.1, optical: 0.25 };
const PROG = { SHAPE_UP: 6, FLASH_DOWN: 4, SIZE_DOWN: 9, SIZE_STEP: 0.2 };

export interface RRParams { diffKey: string; content: string; bg: string; flash: number; count: number; size: number; speed: number; }

/** The exact difficulty-sorted 150-level lattice. */
export function buildRRLattice(): { id: number; label: string; params: RRParams }[] {
  const flashVals: number[] = [], sizeVals: number[] = [], countVals: number[] = [], speedVals: number[] = [];
  Object.values(DIFF).forEach((d) => { flashVals.push(d.flash); sizeVals.push(Math.round(d.size)); countVals.push(d.count); speedVals.push(d.speed); });
  const fMin = Math.min(...flashVals), fMax = Math.max(...flashVals);
  const zMin = Math.min(...sizeVals), zMax = Math.max(...sizeVals);
  const cMin = Math.min(...countVals), cMax = Math.max(...countVals);
  const sMin = Math.min(...speedVals), sMax = Math.max(...speedVals);
  const rows: { score: number; label: string; params: RRParams }[] = [];
  (Object.keys(DIFF) as (keyof typeof DIFF)[]).forEach((diffKey) => {
    const d = DIFF[diffKey];
    const flash = d.flash, count = d.count, sizePx = Math.round(d.size), speed = d.speed;
    const nF = (fMax - flash) / (fMax - fMin || 1);
    const nC = (count - cMin) / (cMax - cMin || 1);
    const nZ = (zMax - sizePx) / (zMax - zMin || 1);
    const nS = (speed - sMin) / (sMax - sMin || 1);
    const base = WEIGHTS.FLASH * nF + WEIGHTS.COUNT * nC + WEIGHTS.SIZE * nZ + WEIGHTS.SPEED * nS;
    CONTENTS.forEach((content) => {
      const cb = CONTENT_BUMP[content] || 0;
      BG_CHOICES.forEach((bg) => {
        const bb = BG_BUMP[bg] || 0;
        rows.push({ score: base + cb + bb, label: `${diffKey.toUpperCase()} • ${content.toUpperCase()} • ${bg.toUpperCase()}`, params: { diffKey, content, bg, flash, count, size: sizePx, speed } });
      });
    });
  });
  rows.sort((a, b) => a.score - b.score || (a.label < b.label ? -1 : 1));
  return rows.map((r, i) => ({ id: i + 1, label: `L${i + 1} · ${r.label}`, params: r.params }));
}

export const RR_LATTICE = buildRRLattice();

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const WORDS3 = ["ACE", "RUN", "RED", "TOP", "EYE", "SUN", "MAP", "DOG", "CAT", "BOX", "HIT", "WIN", "ARC", "NET"];
const WORDS5 = ["SPEED", "FOCUS", "REACT", "BLINK", "CHASE", "GUARD", "TRAIN", "TRACK", "SHAPE", "DRILL", "PROBE", "ALIGN"];
const CONFUSABLES: Record<string, string> = { "0": "O", O: "0", "1": "I", I: "1", "2": "Z", Z: "2", "3": "E", E: "3", "5": "S", S: "5", "6": "G", G: "6", "8": "B", B: "8" };

function tokenFor(mode: string, rng: () => number): string {
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
  if (mode === "colors") return pick(COLORS);
  if (mode === "span") return pick(SHAPES_SPAN);
  if (mode === "speed") return pick(SHAPES_SPEED);
  if (mode === "letter1") return pick(LETTERS);
  if (mode === "word3") return pick(WORDS3);
  if (mode === "word5") return pick(WORDS5);
  if (mode === "num1") return String(Math.floor(rng() * 10));
  if (mode === "num2") return String(10 + Math.floor(rng() * 90));
  if (mode === "num3") return String(100 + Math.floor(rng() * 900));
  return String(1000 + Math.floor(rng() * 9000));
}
function perturb(tok: string, rng: () => number): string {
  const arr = tok.toUpperCase().split("");
  const i = Math.floor(rng() * arr.length);
  const c = arr[i];
  if (CONFUSABLES[c]) arr[i] = CONFUSABLES[c];
  else if (/[0-9]/.test(c)) arr[i] = String((parseInt(c, 10) + 1) % 10);
  else if (/[A-Z]/.test(c)) arr[i] = String.fromCharCode(c.charCodeAt(0) === 90 ? 89 : c.charCodeAt(0) + 1);
  return arr.join("");
}

/** display: colours become a filled swatch (name label); everything else is a token label. */
function present(mode: string, tok: string): { color: string; label?: string } {
  if (mode === "colors") return { color: tok, label: COLOR_NAMES[tok] ?? "" };
  return { color: "#111827", label: tok };
}

const ROUNDS = 90;                 // more than any 3-life run reaches; ends on lives = 0
const TEAL = "#2998AA";

function buildRRTrials(levelId: number, rng: () => number): TrialSpec[] {
  const start = RR_LATTICE[Math.min(Math.max(levelId, 1), 150) - 1].params;
  const out: TrialSpec[] = [];
  // pre-baked within-run ramp, at the reference's cadence (advance = a correct answer)
  let count = start.count, flash = start.flash, size = start.size;

  for (let r = 0; r < ROUNDS; r++) {
    const gid = `rr-r${r}`;
    const flashMs = Math.round(flash);
    const scale = Math.max(SIZE_FLOOR, size) * 0.5 * PX;
    const speed = start.speed * VEL;
    const box = { startMs: 0, endMs: 600_000, halfW: HALF_W, halfH: HALF_H };

    // the target token, shown on the central teal item (stays visible)
    const target = tokenFor(start.content, rng);
    const tShow = present(start.content, target);

    // non-overlapping placement
    const placed: [number, number][] = [];
    const place = (): [number, number] => {
      for (let a = 0; a < 120; a++) {
        const x = (rng() * 2 - 1) * (HALF_W - scale - 0.02);
        const y = CY + (rng() * 2 - 1) * (HALF_H - scale - 0.02);
        if (placed.every(([px, py]) => (px - x) ** 2 + (py - y) ** 2 > (2 * scale + 0.03) ** 2)) { placed.push([x, y]); return [x, y]; }
      }
      const x = (rng() * 2 - 1) * (HALF_W - scale - 0.02), y = CY + (rng() * 2 - 1) * (HALF_H - scale - 0.02);
      placed.push([x, y]); return [x, y];
    };
    const vel = () => { const a = rng() * Math.PI * 2; return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed }; };

    // CENTRAL — teal, always shows the target. Decor (not pickable). Part of the group so it
    // clears when the round resolves; moves and collides with the rest.
    {
      const [x, y] = place(); const v = vel();
      out.push({
        id: `${gid}-central`, spawnAt: r === 0 ? 900 : -1, gridSeq: r, duration: 600_000,
        kind: "distractor", decor: true, zone: "center",
        position: [x, y, Z], physics: { vx: v.vx, vy: v.vy, ...box },
        color: tShow.color, emissive: tShow.color, shape: "sphere", scale: scale * 1.05,
        groupId: gid, groupMode: "single",
        label: tShow.label, meta: { decor: true, labelInside: true, labelSize: Math.min(0.06, scale * 0.9), labelColor: "#EAF0FF", central: true, ring: TEAL },
      });
    }

    // the ONE matching peripheral (correct pick) + distractors (different tokens)
    const matchIdx = Math.floor(rng() * count);
    const used = new Set<string>([target.toUpperCase()]);
    for (let k = 0; k < count; k++) {
      const isMatch = k === matchIdx;
      let tok = target;
      if (!isMatch) {
        // a different token; for text/number content, sometimes a confusable near-miss
        let guard = 0;
        do {
          tok = rng() < 0.5 && start.content.match(/num|letter|word/) ? perturb(target, rng) : tokenFor(start.content, rng);
        } while (used.has(tok.toUpperCase()) && guard++ < 12);
        used.add(tok.toUpperCase());
      }
      const pr = present(start.content, tok);
      const [x, y] = place(); const v = vel();
      out.push({
        id: `${gid}-i${k}${isMatch ? "-match" : ""}`, spawnAt: -1, gridSeq: r,
        duration: flashMs + 6000,          // the answer window after the flash
        kind: isMatch ? "go" : "distractor",
        zone: "center",
        position: [x, y, Z], physics: { vx: v.vx, vy: v.vy, ...box },
        color: pr.color, emissive: pr.color, shape: "sphere", scale,
        groupId: gid, groupMode: "single",
        label: pr.label,
        meta: {
          labelInside: true, labelSize: Math.min(0.055, scale * 0.85), labelColor: "#EAF0FF",
          hideLabelAfterMs: flashMs,      // token flashes then goes blank
          clickableAfterMs: flashMs,      // ...and cannot be answered until it does
        },
      });
    }

    // ramp for the NEXT round, at the reference's per-correct cadence
    const n = r + 1;
    if (n % PROG.SHAPE_UP === 0) count = Math.min(MAX_SHAPES, count + 1);
    if (n % PROG.FLASH_DOWN === 0) flash = Math.max(MIN_FLASH, flash - 40);
    if (n % PROG.SIZE_DOWN === 0) size = Math.max(SIZE_FLOOR, Math.floor(size * (1 - PROG.SIZE_STEP)));
  }
  return out;
}

const levels: ProgressionLevel[] = RR_LATTICE.map((l) => ({ level: l.id, label: l.label, parameters: { level: l.id } }));

export const RapidRecognition: DrillDefinition = {
  id: "rapid-recognition",
  name: "Rapid Recognition",
  shortName: "Rapid Recog",
  phase: "Acquire",
  interaction: "ray",
  responseMode: "pointer",
  authoredLadder: true,
  trialPaced: true,
  lives: { max: MAX_LIVES, streakForLife: STREAK_FOR_LIFE },
  environment: "arena",
  mvp: true,
  description:
    "A central TEAL token shows the target. Around it, tokens flash for a heartbeat and go BLANK while drifting — point at the blank circle that matched the centre. THREE lives, one back per 3-streak, and it ramps as you succeed: more tokens, shorter flashes, smaller circles. 150 levels span five tiers × ten content types (colours, shapes, 1–4-digit numbers, letters, words) × three backgrounds, ordered easiest cell to hardest.",
  purpose: "Rapid recognition, spatial working memory, and tracking under a life-limited ramp.",
  instructions: [
    "1. The TEAL circle in the middle shows your TARGET. Keep it in mind.",
    "2. The other circles FLASH a token, then go blank - and everything drifts.",
    "3. POINT at the blank circle whose token matched the teal target, and pull the trigger.",
    "4. You cannot answer until the flash ends - recognise it, then find it from memory.",
    "5. THREE lives. A wrong pick costs one; a 3-streak earns one back. It gets harder as you go.",
  ],
  controlsHint: "MATCH THE TEAL TARGET  ·  RAY + TRIGGER THE BLANK THAT FLASHED IT  ·  3 LIVES",
  levels,
  buildTrials: (params, rng) => buildRRTrials((params.level as number) ?? 1, rng),

  analyze: (events) => {
    const ev = events.filter((e) => e.trialId.startsWith("rr-r"));
    if (!ev.length) return [];
    const correct = ev.filter((e) => e.correct).length;
    const wrong = ev.filter((e) => e.errorType === "distractorHit").length;
    const miss = ev.filter((e) => e.errorType === "miss").length;
    const rts = ev.filter((e) => e.correct && e.reactionMs !== undefined).map((e) => e.reactionMs!);
    const meanRT = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;
    const rounds = correct + wrong + miss;
    const notes = [
      `${correct} correct recognitions in ${rounds} rounds before the lives ran out.`,
      `Mean time-to-pick ${meanRT}ms after each flash.`,
    ];
    if (wrong > correct * 0.4) {
      notes.push("A high wrong-pick rate points at confusable-token errors — the near-misses (0/O, 5/S) are catching the athlete. Slow the first read.");
    } else if (miss > 0 && wrong === 0) {
      notes.push("Lives were lost to letting the window lapse, not to wrong picks — recognition is sound but too slow. Push for a faster commit.");
    }
    return notes;
  },

  durationMs: () => 420_000,
};
