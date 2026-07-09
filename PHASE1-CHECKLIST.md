# Phase 1 WebXR Prototype — Status vs. Developer Brief
**Build:** v0.23.0 · ares-vr-suite.netlify.app · internal only
**Legend:** [x] done · [~] partial · [ ] pending · (P2) Phase 2 scope by design

## §2 Non-negotiable boundaries
- [x] 1. Claims boundary — clinical/diagnostic/EMR language swept from all UI copy, notes, and comments (v0.23.0); assessments framed as performance baselines and training-design inputs only
- [x] 2. Phase 1 never produces a real metric — every results screen carries "PHASE 1 PROTOTYPE — DESIGN VALIDATION ONLY. NON-VALIDATING NUMBERS."; sessions stored in localStorage as prototype state only; no athlete AQ records exist
- [x] 3. All validated measurement deferred to Phase 2 (stated in metric notes and docs)
- [x] 4. No PC dependency — standalone Quest browser via Netlify URL
- [x] 5. Code disposable / design carries — DESIGN-LOCK.md is the transfer artifact

## §4 Phase 1 scope
- [x] Drill mechanics & interaction feel — 52 drills/protocols across 6 suites (strike, trigger, joystick, dichoptic)
- [x] Three-axis difficulty lattice as an experience — Gaze Stabilization x1/x2 engine (v0.23.0): head-velocity gate (25→130 deg/s), predictability (metronomic → random cadence), background (plain → optokinetic drift), 50 levels each
- [x] Session flow — onboarding dashboard → portal select → drill select (thumbstick scroll) → briefing/safety → calibration screens → 3-2-1-GO → drill → results → prescription recompute
- [~] Calibration UX screens — eye-height capture + IPD/world-scale confirmation panel (prototype-labeled); vergence/gaze baseline capture UX not yet mocked
- [~] Rest intervals — results screen acts as the between-drill rest; no explicit timed rest screen yet
- [x] UI/UX layout & spatial placement — panels 1.5–2.5 m, primary action plane at/near 1.3 m focal plane for gaze drills, strike plane 0.85–0.95 m
- [~] Brand look — currently the Ares Brand Guide palette (deep navy #0B0F2A / purple #8B5CF6 / teal #2998AA). Brief specifies Lucky Point #221461 / teal #008B9E (secondary provisional). DECISION NEEDED from Joe before repaint — see note in summary.
- [x] Metric logic as runnable pseudocode, labeled non-validating — DESIGN-LOCK.md §4
- [x] Netlify hosting, localStorage state, no backend

## §5 Phase 2 items (correctly NOT in this build)
- (P2) Latency guardian, ASW, frame-budget defect gate
- (P2) Validated IPD/world-scale + 60-second calibration routine
- (P2) Depth-budget validator (<0.5 D sustained) — prototype only places gaze-drill action plane at ~1.3 m by convention
- (P2) Comfort toggles (vignette/snap-turn) — no locomotion exists in Phase 1 scenes
- (P2) Behavioral metrics engine with validated thresholds; test-retest reliability
- (P2) Telemetry/raw logging (prototype logs raw events per session in localStorage — structure carries, guarantees do not)
- (P2) SSQ-style comfort monitoring + auto-throttle
- (P2) Quest 3 vs 3S hardware guard
- (P2) AQ integration gate

## §8 Distribution
- [x] Phase 1: Netlify URL in Quest browser
- [ ] Phase 2: Meta developer org, keystore, private release channel (not started — see §9 of brief: source Unity/XR developer in parallel)
