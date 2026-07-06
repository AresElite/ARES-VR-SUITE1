import type { DrillDefinition, SportId, TrialSpec } from "@/ares/drillTypes";
import { ARES_COLORS, ARES_ACCENTS } from "@/ares/colors";
import { pick } from "@/utils/rng";
import { EYE_Y, strikePosition } from "../shared/zones";

/**
 * SYNCHRONIZE — Sport-Transfer Reality Labs
 *
 * One lab engine, every sport. A SportScenario converts the sport's core
 * perceptual-cognitive demands into the same TrialSpec stream every other
 * drill uses — same engine, same scoring schema, same AQ outputs, same
 * progression logic. Adding a sport is a config, not a new game.
 *
 * The scenario grammar has three channels:
 *  - primary   → the sport's central decision object (pitch, puck, signal light,
 *                threat silhouette, pass lane) with go/no-go discrimination
 *  - peripheral → sport-relevant peripheral events (base runner, backdoor
 *                cutter, pit-lane hazard, second contact)
 *  - inhibition → sport-coded no-go events (ball out of zone, offside decoy,
 *                no-threat civilian, red-light hold)
 */

export interface SportScenario {
  sport: SportId;
  title: string;
  brief: string;
  /** primary decision object approaches through depth */
  primary: {
    label: string;
    goColor: string;
    noGoColor: string;
    speed: number;
    depth: number;
    /** vertical band of valid "strike zone" spawns */
    yBand: [number, number];
    xSpread: number;
    noGoOffsetY: number; // no-go variants spawn outside the valid band
  };
  peripheralLabel: string;
  inhibitionLabel: string;
}

export const SPORT_SCENARIOS: Record<string, SportScenario> = {
  baseball: {
    sport: "baseball",
    title: "Baseball — Pitch Decision Lab",
    brief:
      "Swing (strike) only at pitches through the zone. Lay off pitches out of the zone. Tag base-runner flashes in your periphery without losing the at-bat.",
    primary: {
      label: "Pitch",
      goColor: ARES_ACCENTS.tealBright,
      noGoColor: ARES_COLORS.errorRed,
      speed: 4.2,
      depth: 12,
      yBand: [1.1, 1.6],
      xSpread: 0.35,
      noGoOffsetY: 0.55,
    },
    peripheralLabel: "Runner",
    inhibitionLabel: "Ball out of zone",
  },
  racing: {
    sport: "racing",
    title: "Racing — Pit Signal Lab",
    brief:
      "React to the go-signal sequence with the ruled hand. Hold on red. Track pit-lane hazards appearing in your peripheral field.",
    primary: {
      label: "Signal",
      goColor: ARES_ACCENTS.goSignal,
      noGoColor: ARES_COLORS.errorRed,
      speed: 3.2,
      depth: 8,
      yBand: [1.3, 1.7],
      xSpread: 0.5,
      noGoOffsetY: 0,
    },
    peripheralLabel: "Hazard",
    inhibitionLabel: "Red light hold",
  },
  tactical: {
    sport: "tactical",
    title: "Tactical — Threat Discrimination Lab",
    brief:
      "Engage threat silhouettes. Withhold on no-threat contacts. Maintain peripheral information under tunnel pressure.",
    primary: {
      label: "Contact",
      goColor: ARES_COLORS.warningGold,
      noGoColor: ARES_COLORS.softGray,
      speed: 2.4,
      depth: 9,
      yBand: [1.2, 1.6],
      xSpread: 0.8,
      noGoOffsetY: 0,
    },
    peripheralLabel: "Flank cue",
    inhibitionLabel: "No-threat contact",
  },
  hockey: {
    sport: "hockey",
    title: "Hockey — Puck Pressure Lab",
    brief:
      "Track and play pucks through traffic. Withhold on offside decoys. Scan for peripheral teammate flashes under defender pressure.",
    primary: {
      label: "Puck",
      goColor: ARES_ACCENTS.tealBright,
      noGoColor: ARES_COLORS.errorRed,
      speed: 4.8,
      depth: 11,
      yBand: [0.9, 1.4],
      xSpread: 0.6,
      noGoOffsetY: 0.4,
    },
    peripheralLabel: "Teammate",
    inhibitionLabel: "Offside decoy",
  },
  soccer: {
    sport: "soccer",
    title: "Soccer — Scanning Lab",
    brief:
      "Play the open passing lane. Hold when the lane closes late. Keep scanning — peripheral runs decide the rep.",
    primary: {
      label: "Lane",
      goColor: ARES_ACCENTS.goSignal,
      noGoColor: ARES_COLORS.errorRed,
      speed: 3.0,
      depth: 10,
      yBand: [1.0, 1.5],
      xSpread: 0.9,
      noGoOffsetY: 0.3,
    },
    peripheralLabel: "Runner",
    inhibitionLabel: "Closed lane",
  },
};

interface Params {
  sport: string;
  primaryCount: number;
  noGoRatio: number;
  peripheralCount: number;
  peripheralEccentricityDeg: number;
  peripheralDurationMs: number;
  isiMs: number;
  speedScale: number;
  [k: string]: unknown;
}

export function buildSportTrials(p: Params, rng: () => number): TrialSpec[] {
  const scenario = SPORT_SCENARIOS[p.sport] ?? SPORT_SCENARIOS.baseball;
  const pr = scenario.primary;
  const trials: TrialSpec[] = [];
  const speed = pr.speed * p.speedScale;
  const travelMs = (pr.depth / speed) * 1000;
  let t = 2000;

  // Primary decision stream (pitch / signal / threat / puck / lane)
  for (let i = 0; i < p.primaryCount; i++) {
    const isNoGo = rng() < p.noGoRatio;
    const y = pr.yBand[0] + rng() * (pr.yBand[1] - pr.yBand[0]) + (isNoGo ? pr.noGoOffsetY * (rng() < 0.5 ? 1 : -1) : 0);
    trials.push({
      id: `st-p-${i}`,
      spawnAt: t,
      duration: travelMs + 320,
      kind: isNoGo ? "noGo" : "go",
      zone: "center",
      position: [(rng() - 0.5) * 2 * Math.min(pr.xSpread, 0.5), y, -pr.depth],
      velocity: [0, 0, speed],
      color: isNoGo ? pr.noGoColor : pr.goColor,
      emissive: isNoGo ? pr.noGoColor : pr.goColor,
      shape: "sphere",
      scale: 0.12,
      label: isNoGo ? scenario.inhibitionLabel : scenario.primary.label,
      meta: { channel: "primary", arrivalMs: travelMs },
    });
    t += p.isiMs + rng() * 500;
  }

  // Peripheral awareness stream (runner / hazard / flank cue)
  const totalSpan = t;
  for (let i = 0; i < p.peripheralCount; i++) {
    const zone = pick(rng, ["left", "right", "upLeft", "upRight"] as const);
    trials.push({
      id: `st-x-${i}`,
      spawnAt: 2600 + rng() * (totalSpan - 3200),
      duration: p.peripheralDurationMs,
      kind: "go",
      zone,
      position: strikePosition(zone, p.peripheralEccentricityDeg, 0.15, rng, 0.75),
      color: ARES_COLORS.warningGold,
      emissive: ARES_COLORS.warningGold,
      shape: "diamond",
      scale: 0.09,
      label: scenario.peripheralLabel,
      meta: { channel: "peripheral" },
    });
  }

  return trials.sort((a, b) => a.spawnAt - b.spawnAt);
}

const levels = [
  { level: 1, label: "Level 1 — Read the game", parameters: { sport: "baseball", primaryCount: 12, noGoRatio: 0.25, peripheralCount: 3, peripheralEccentricityDeg: 24, peripheralDurationMs: 1500, isiMs: 2600, speedScale: 0.8 } },
  { level: 2, label: "Level 2 — Game speed", parameters: { sport: "baseball", primaryCount: 14, noGoRatio: 0.3, peripheralCount: 4, peripheralEccentricityDeg: 28, peripheralDurationMs: 1300, isiMs: 2300, speedScale: 1.0 } },
  { level: 3, label: "Level 3 — Pressure", parameters: { sport: "baseball", primaryCount: 16, noGoRatio: 0.35, peripheralCount: 6, peripheralEccentricityDeg: 32, peripheralDurationMs: 1100, isiMs: 2000, speedScale: 1.15 } },
  { level: 4, label: "Level 4 — Elite tempo", parameters: { sport: "baseball", primaryCount: 18, noGoRatio: 0.4, peripheralCount: 8, peripheralEccentricityDeg: 36, peripheralDurationMs: 950, isiMs: 1700, speedScale: 1.3 } },
];

export const SportTransferLabVR: DrillDefinition = {
  id: "sport-transfer-lab",
  name: "Sport-Transfer Reality Lab",
  shortName: "Reality Lab",
  phase: "Synchronize",
  description:
    "A.R.E.S. drills inside sport pressure. The primary decision stream (pitch / signal / threat / puck / lane) runs go/no-go discrimination through depth while sport-relevant peripheral cues load the Acquire system. Same engine, same metrics — real transfer.",
  purpose: "Sport-specific transfer of the full A.R.E.S. Performance Loop.",
  interaction: "touch",
  instructions: [
    "1. This is your sport, compressed. The primary object (pitch / signal / threat) comes to YOU through depth.",
    "2. TEAL/GO color in the zone = STRIKE THROUGH IT with either hand at the moment it arrives.",
    "3. RED/off-zone = LAY OFF. Do not swing. Discipline is scored.",
    "4. GOLD diamonds flash in your peripheral field (runner / hazard / flank) — tap them without losing the primary read.",
    "5. Play at game intent: commit to every strike like a rep on the field.",
  ],
  controlsHint: "STRIKE THE GO SIGNAL - LAY OFF RED - TAP GOLD IN YOUR PERIPHERY",
  environment: "baseball",
  mvp: true,
  levels,
  buildTrials: (params, rng) => buildSportTrials(params as Params, rng),
  durationMs: (params) => {
    const p = params as Params;
    return 2000 + p.primaryCount * (p.isiMs + 250) + 3500;
  },
};

/** Build a sport-specific variant of the Reality Lab (config, not a fork). */
export function sportLabVariant(sport: SportId): DrillDefinition {
  const scenario = SPORT_SCENARIOS[sport];
  if (!scenario) return SportTransferLabVR;
  return {
    ...SportTransferLabVR,
    id: `sport-transfer-${sport}`,
    name: scenario.title,
    shortName: scenario.title.split("—")[0].trim(),
    description: scenario.brief,
    environment: sport,
    levels: SportTransferLabVR.levels.map((l) => ({
      ...l,
      parameters: { ...l.parameters, sport },
    })),
  };
}
