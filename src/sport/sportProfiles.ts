/**
 * SPORT SUITES — curated top-7 drill sets per sport.
 *
 * Each sport loads a different visual-cognitive profile. These suites are
 * NOT new drills: they draw the existing library into a sport-specific
 * playlist with a suggested starting level (levelBias) tuned to that sport's
 * dominant demands. `baselineIds` are the Assess protocols that produce that
 * sport's headline baseline numbers.
 *
 * PHASE 1 PROTOTYPE: curation/experience only — non-validating.
 */

export interface SportDrill {
  drillId: string;
  why: string;      // the sport-relevant skill this drill trains
  levelBias: number; // suggested starting level for this sport
}

export interface SportProfile {
  id: string;
  name: string;
  color: string;
  blurb: string;
  /** Assess protocols that headline this sport's baseline */
  baselineIds: string[];
  /** the seven-drill training suite for this sport */
  drills: SportDrill[];
}

export const SPORT_PROFILES: SportProfile[] = [
  {
    id: "soccer",
    name: "Soccer",
    color: "#3FA96B",
    blurb: "Breadth + scanning: wide-field awareness, pre-reception scan cadence, pattern reading.",
    baselineIds: ["assess-ufov", "assess-dva-motion"],
    drills: [
      { drillId: "peripheral-field", why: "Wide-field awareness — see the whole pitch", levelBias: 8 },
      { drillId: "saccade-swipe", why: "Scan cadence — the pre-reception look-around", levelBias: 10 },
      { drillId: "mot", why: "Track many moving players at once", levelBias: 8 },
      { drillId: "predictive-pathway", why: "Read developing runs and lanes", levelBias: 6 },
      { drillId: "pattern-memory", why: "Recognize formations and shapes", levelBias: 8 },
      { drillId: "cognitive-crossfire", why: "Control the ball while monitoring the field", levelBias: 6 },
      { drillId: "gaze-stab-vorx1", why: "Stable vision while running and turning", levelBias: 6 },
    ],
  },
  {
    id: "volleyball",
    name: "Volleyball",
    color: "#F5B648",
    blurb: "Fast anticipation + hands: block/dig timing, tracking, eye-hand under a short clock.",
    baselineIds: ["assess-cat", "assess-dva-motion"],
    drills: [
      { drillId: "assess-cat", why: "Anticipation timing — meet the ball at contact", levelBias: 1 },
      { drillId: "eye-hand-coordination", why: "Hands to the ball — set, dig, block", levelBias: 10 },
      { drillId: "depth-slice", why: "Read ball depth over the net", levelBias: 8 },
      { drillId: "reaction-grid", why: "Fast multi-location reactions at the net", levelBias: 12 },
      { drillId: "mot", why: "Track ball plus attackers", levelBias: 6 },
      { drillId: "choice-rt", why: "Commit direction under a short clock", levelBias: 10 },
      { drillId: "peripheral-field", why: "Sense the attacker you're not looking at", levelBias: 8 },
    ],
  },
  {
    id: "hockey",
    name: "Hockey",
    color: "#7FD3DE",
    blurb: "Fastest team sport: peripheral awareness, reaction, tracking a fast puck under head motion.",
    baselineIds: ["assess-cat", "assess-contrast-sensitivity"],
    drills: [
      { drillId: "peripheral-field", why: "Puck and bodies at speed across a wide field", levelBias: 12 },
      { drillId: "choice-rt", why: "React to shots, passes, and checks", levelBias: 14 },
      { drillId: "mot", why: "Track the puck plus five skaters", levelBias: 10 },
      { drillId: "reaction-grid", why: "Fast multi-zone reactions", levelBias: 14 },
      { drillId: "assess-cat", why: "Time passes and one-timers", levelBias: 1 },
      { drillId: "depth-slice", why: "Judge puck depth and shooting lanes", levelBias: 10 },
      { drillId: "gaze-stab-vorx2", why: "Stable vision while skating and turning the head", levelBias: 8 },
    ],
  },
  {
    id: "auto-racing",
    name: "Auto Racing",
    color: "#EF5A6F",
    blurb: "Speed-processing + inhibition: peripheral flow, split decisions, gaze stability under vibration.",
    baselineIds: ["assess-ufov", "assess-cat"],
    drills: [
      { drillId: "gaze-stab-vorx1", why: "Hold a stable read of the track under head motion", levelBias: 10 },
      { drillId: "peripheral-field", why: "Peripheral flow — sense closing cars and apexes", levelBias: 12 },
      { drillId: "assess-cat", why: "Braking and turn-in timing", levelBias: 1 },
      { drillId: "stop-signal", why: "Abort a committed move when the gap closes", levelBias: 12 },
      { drillId: "predictive-pathway", why: "Read the racing line and traffic ahead", levelBias: 8 },
      { drillId: "focus-frenzy", why: "Sustained attention across a long stint", levelBias: 10 },
      { drillId: "choice-rt", why: "Split-second line and throttle decisions", levelBias: 14 },
    ],
  },
];

export const sportById = (id: string | null) =>
  id ? SPORT_PROFILES.find((s) => s.id === id) : undefined;
