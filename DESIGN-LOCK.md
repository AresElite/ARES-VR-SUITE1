# A.R.E.S. VR Performance Suite — Design Lock (Phase 1 → Phase 2 transfer)
**Version locked against:** v0.23.0 WebXR prototype
**Purpose:** Everything Phase 2 (Unity/C#) reimplements. Per the developer brief §2.5: code does not transfer; this design does. All numeric values below are DESIGN values validated for feel in-headset — they are NOT measurement thresholds; Phase 2 re-derives all measurement constants on native timing.

## 1. Session flow (lock)
1. Dashboard (2D): athlete select, performance mode, Today's Plan (prescription), drill library
2. VR arena: 6 portals front arc (Assess, Acquire, Route, Execute, Synchronize, Perform), logo loop center, welcome console low-center, Today's Plan pill low-left (opens panel, X closes)
3. Drill select: left panel, 7 rows, thumbstick up/down scrolls (0.4s first repeat, 0.22s repeat, tick per step); right panel session setup (level, options, athlete, seated mode, perf mode)
4. Briefing: numbered how-to (max 5 lines) + controls hint + calibration strip (eye height capture, IPD confirm, 1:1 scale statement) + safety panel + START
5. Countdown 3-2-1-GO (audio ticks)
6. Drill (HUD: name/phase strip, time or stopwatch, hits/errors/acc/streak; PAUSE + TRAINER STOP row below)
7. Results: metrics block, AQ (prototype), recommendation, notes, prototype disclaimer, SAVE / RUN AGAIN / DRILL MENU / ARENA HOME
8. Prescription recomputes from stored sessions after every save

## 2. Spatial placement (lock)
- Strike plane: 0.85–0.95 m, |x| ≤ 0.92 m, y 0.95–1.9 m (reach envelope enforced by sim)
- Gaze-drill action plane: 1.3 m (≈ pancake focal plane; Phase 2 verifies per brief §3)
- Launcher: 6 m downrange, balls arrive at strike plane; hexagon portholes r=0.15 m at ±0.95/±0.62 pattern
- Panels: 1.5–2.5 m; HUD at 1.75 m tilted −0.32 rad; portals at 4.3 m, scale 0.74, angles ±0.18/±0.54/±0.9 rad
- Hand identity: RIGHT = purple #8B5CF6, TEAL = left #2998AA — rays, cursors, strike orbs (neutral #C9D2EE when drill has no hand rules)
- Strike orb r=0.037 m, contact padding 0.042 m (+ per-target hitBoost)

## 3. Difficulty structures (lock)
- Training drills: 50 levels, banded (see per-drill labels); linear interpolation lerp50 within bands
- Perform tracks: 10 tracks × 12 levels; difficulty COMPUTED (nps·1.15 + speed·0.9 + spread·1.1 + switch·0.8 + cross·2.2 + burst·0.35, scaled ×1.35 −2.5, clamp 0.5–10)
- Gaze lattice (three axes, 50 levels): head-velocity gate 25→130 °/s; cadence jitter 0→1400 ms (metronomic → random); background density 0→26 drifting decor objects
- Adaptive assessments: GM ladders +7%/streak (cap 2.4×); staircases step on correct, back on wrong, terminate on 3 consecutive wrong (stereo: 800→15 arcsec ladder; contrast: 40→0.4% Michelson log ladder)
- Goldilocks rule: accuracy ≥85% → level+1; <60% → level−1; else hold (~80% success target)

## 4. Metric logic — pseudocode (NON-VALIDATING; Phase 2 re-derives)
```
RT           = respond_ts - stimulus_onset_ts            (per trial)
accuracy     = correct / scoreable
perHand      = split by required_hand; RT + accuracy each
PES          = mean(RT_after_error) - mean(RT_overall)
consistency  = stdev(RT)
fatigueDrift = (mean(RT_last_third) - mean(RT_first_third)) / mean(RT_first_third)
precision    = mean(|contact_point - target_center|) at strike
beatTiming   = hit_ts - beat_arrival_ts; PERFECT |dt|<=60ms, GOOD <=140ms; report rush/chase bias
DVA analog   = accuracy(identification | head_vel >= gate); scan gates to find breakdown velocity
stereoThresh = finest disparity answered correctly before 3-wrong termination (arcsec)
contrastThr  = lowest Michelson % detected before 3-wrong termination; logCS = log10(100/thr)
DEM          = total_time GO→final answer; errors; adjusted per-item pace; V/H comparison across subtests
AQ (proto)   = weighted blend per phase of accuracy/latency/consistency/fatigue minus discipline penalty
               (weights in aq.ts — Phase 2 revalidates every weight)
```

## 5. Drill inventory (52)
| Suite | Drill | Levels | Response | Purpose |
|---|---|---|---|---|
| Assess | Fine Motor Raw Reaction Time | PROTOCOL | trigger | Simple visuomotor reaction time (dominant-hand trigger). |
| Assess | Fine Motor Choice Reaction Time | PROTOCOL | trigger | Two-choice reaction time with per-hand analytics. |
| Assess | Gross Motor Raw Reaction Time | PROTOCOL | strike | Adaptive whole-arm interception speed ceiling. |
| Assess | Gross Motor Choice Reaction Time | PROTOCOL | strike | Adaptive whole-arm choice interception ceiling. |
| Assess | Color Vision (Ishihara Interactive) | PROTOCOL | strike | Color-discrimination performance baseline with axis pattern. |
| Assess | Stereopsis (Dichoptic Randot) | PROTOCOL | strike | Global stereopsis threshold via adaptive staircase. |
| Assess | Contrast Sensitivity (Grating Staircase) | PROTOCOL | strike | Contrast sensitivity threshold (logCS) via 4-AFC staircase. |
| Assess | DEM (Arrows) | PROTOCOL | joystick | Oculomotor function: saccadic accuracy, automaticity, completion speed. |
| Perform | 01 · Warm-Up Circuit | TRACK (12 LV) | strike | Beat-locked visuomotor flow training (12-level Goldilocks ladder). |
| Perform | 02 · Pulse | TRACK (12 LV) | strike | Beat-locked visuomotor flow training (12-level Goldilocks ladder). |
| Perform | 03 · Flow State | TRACK (12 LV) | strike | Beat-locked visuomotor flow training (12-level Goldilocks ladder). |
| Perform | 04 · Sidewinder | TRACK (12 LV) | strike | Beat-locked visuomotor flow training (12-level Goldilocks ladder). |
| Perform | 05 · Syncopate | TRACK (12 LV) | strike | Beat-locked visuomotor flow training (12-level Goldilocks ladder). |
| Perform | 06 · Crossfire | TRACK (12 LV) | strike | Beat-locked visuomotor flow training (12-level Goldilocks ladder). |
| Perform | 07 · Streamline | TRACK (12 LV) | strike | Beat-locked visuomotor flow training (12-level Goldilocks ladder). |
| Perform | 08 · Overdrive | TRACK (12 LV) | strike | Beat-locked visuomotor flow training (12-level Goldilocks ladder). |
| Perform | 09 · Chaos Theory | TRACK (12 LV) | strike | Beat-locked visuomotor flow training (12-level Goldilocks ladder). |
| Perform | 10 · Ascension | TRACK (12 LV) | strike | Beat-locked visuomotor flow training (12-level Goldilocks ladder). |
| Acquire | Gaze Stabilization x1 | 50 LV | joystick | Gaze stability under head motion (behavioral DVA/GST analog - prototype). |
| Acquire | Gaze Stabilization x2 | 50 LV | joystick | Gaze stability under head motion (behavioral DVA/GST analog - prototype). |
| Execute | Reaction Grid | 50 LV | strike | Rapid foveation, peripheral detection, motor output speed. |
| Acquire | Speed-Search | 50 LV | undefined | Fast saccades, crowd discrimination, target selection. |
| Acquire | Schulte Table | 50 LV | undefined | Peripheral localization, visual span, ordered scanning speed. |
| Acquire | Contrast-Assessment | 50 LV | undefined | Contrast sensitivity with a directional forced choice. |
| Acquire | Rapid Recognition | 50 LV | undefined | Peripheral character recognition under brief exposure. |
| Acquire | Peripheral Field VR | 50 LV | undefined | Peripheral target acquisition under central fixation. |
| Route | Sternberg | 50 LV | undefined | Working-memory scanning (colors). |
| Route | Sternberg-Digits | 50 LV | undefined | Working-memory scanning (digits). |
| Route | Sternberg-Letters | 50 LV | undefined | Working-memory scanning (letters). |
| Route | Flanker Compatibility | 50 LV | undefined | Selective attention and conflict resolution. |
| Route | Stroop | 50 LV | undefined | Interference control — physical property over semantic meaning. |
| Route | Pattern-Memory | 50 LV | undefined | Visuospatial pattern memory and recall. |
| Route | Random-Number | 50 LV | undefined | Ordered visual search with number processing under time pressure. |
| Route | Multiple Object Tracking | 50 LV | undefined | Sustained multifocal attention on moving targets. |
| Route | Predictive Pathway VR | 50 LV | undefined | Route selection, prediction, and processing under uncertainty. |
| Execute | Eye-Hand Coordination | 50 LV | strike | Continuous eye-hand mapping, bimanual coverage, scan-and-strike speed. |
| Execute | Raw-Reaction | 50 LV | trigger | Pure simple reaction time to visual onset. |
| Execute | Choice-RT | 50 LV | trigger | Choice reaction time — stimulus-response mapping under time pressure. |
| Execute | Go/No Go | 50 LV | strike | Response inhibition, impulse control, discipline under speed. |
| Execute | Stop-Signal | 50 LV | undefined | Reactive inhibition — cancelling an initiated response. |
| Execute | Focus-Frenzy | 50 LV | undefined | Sustained attention, target triage, and clearing under pressure. |
| Execute | Saccade-Swipe | 50 LV | undefined | Pro/anti-saccade control — overriding reflexive orienting. |
| Execute | Depth Slice VR | 50 LV | undefined | Depth timing, slicing, bimanual coordination, cross-midline control. |
| Synchronize | Cognitive Crossfire | 50 LV | undefined | Central-peripheral integration under dual-task load. |
| Synchronize | Neural Phase Lock | 50 LV | undefined | Rhythmic timing, internal clock stability under occlusion. |
| Synchronize | Dual Stream: Neural Collider | 50 LV | undefined | Convergent timing prediction with inhibition gating. |
| Synchronize | Pursuit-Pulse | 50 LV | undefined | Smooth pursuit with embedded reactive direction decisions. |
| Synchronize | Occlusion | 50 LV | undefined | Predictive timing through occlusion — mental trajectory extrapolation. |
| Synchronize | Chaos Arena VR | 50 LV | undefined | Full-system integration under multi-sensory, multi-rule load. |
| Synchronize | Sport-Transfer Reality Lab | 50 LV | undefined | Sport-specific transfer of the full A.R.E.S. Performance Loop. |
| Synchronize | Racing — Pit Signal Lab | 50 LV | undefined | Sport-specific transfer of the full A.R.E.S. Performance Loop. |
| Synchronize | Tactical — Threat Discrimination Lab | 50 LV | undefined | Sport-specific transfer of the full A.R.E.S. Performance Loop. |
## 6. Known Phase-1 limitations (do not carry values)
- WebXR timing jitter: all RT values are experience-grade only
- Head velocity from camera quaternion smoothing (α=dt·12) — Phase 2 uses raw IMU
- No latency profiling, no refresh-rate lock, no ASW control
- localStorage persistence; no auth, no athlete identity guarantees
