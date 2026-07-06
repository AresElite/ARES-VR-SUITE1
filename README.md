# A.R.E.S. VR Performance Suite

**Ares Elite Sports Vision — immersive sports vision & neuro-performance training for Meta Quest.**

> Acquire. Route. Execute. Synchronize.

A web-based WebXR application (no native app, no App Lab) that runs in the **Meta Quest Browser** on Quest 2, Quest 3S, and Quest 3, deploys through **Netlify**, and iterates through **GitHub**. It translates the A.R.E.S. Performance Suite (55″ touchscreen) — its drill logic, progression structure, scoring schema, and performance intent — into an immersive 3D arena.

Internal engine name: **A.R.E.S. Immersive Performance Engine**.

---

## Stack

- React 19 + TypeScript (strict)
- Three.js via @react-three/fiber v9
- WebXR via @react-three/xr v6 (controllers + hand tracking, pointer events)
- @react-three/drei (spatial text, controls)
- Zustand (app state; timing-critical drill state lives **outside** React)
- Vite 6 (dev/build), Netlify (hosting + HTTPS, required for WebXR)

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 — desktop fallback mode
npm run typecheck    # tsc --noEmit
npm run build        # tsc && vite build → dist/
npm run preview      # serve the production build
```

### Desktop testing (no headset)

Open the dev URL, click **Desktop testing mode**. Mouse = pointer, drag = look. The full trainer flow (portals → drills → levels → calibration → run → results) works with mouse clicks.

### Quest headset testing

WebXR requires a **secure context (HTTPS)**. Two options:

1. **Netlify deploy preview (recommended):** push a branch, open the deploy preview URL in Meta Quest Browser, tap **ENTER IMMERSIVE VR**.
2. **Local network:** `npm run dev -- --host`, then on a machine with adb: `adb reverse tcp:5173 tcp:5173` and open `http://localhost:5173` in Quest Browser (localhost is a secure context).

## Netlify deployment

`netlify.toml` is committed (build `npm run build`, publish `dist`, SPA redirect, `xr-spatial-tracking` permissions policy).

1. Push this repo to GitHub.
2. Netlify → **Add new site → Import from GitHub** → pick the repo.
3. Build command `npm run build`, publish directory `dist` (auto-detected from netlify.toml).
4. Every PR gets a **deploy preview** URL — open it on each Quest model before promoting to production.

## Architecture

```
src/
  app/            App shell, DOM screen router, zustand store
  ares/           The A.R.E.S. core: phases, colors, scoring, AQ, progression (shared brain)
  vr/             XRRoot (canvas + XR store), Arena, portals, dock, HUD, safety, drill runtime
  drills/
    shared/       DrillEngine (state machine), TargetSpawner (object pool),
                  TimingEngine (frame clock + BPM), InputMapper, DrillSession, DrillResult
    acquire/      Peripheral Field VR ★, Contrast Signal, Visual Search
    route/        Predictive Pathway VR ★, Choice Map, Working Memory Grid
    execute/      Reaction Strike VR ★, Depth Slice VR ★, Inhibition Gate
    synchronize/  Chaos Arena VR ★, Sport-Transfer Reality Lab ★ (+ sport variants)
  data/           ARESDrillSessionResult schema, localStorage store, placeholder EMR API
  ui/             Landing dashboard, WebXR badges, history table
  utils/          Quest detection, XR support, performance modes, seeded RNG, fonts
```

★ = the six MVP drills. Everything else is a scaffolded prototype proving that a drill is **a config, not a fork** — they all run on the one shared `DrillEngine`.

### Key design rules

- **One engine, every drill.** A drill = `DrillDefinition` (levels + `buildTrials()` generator). Migrating a touchscreen drill means adding one definition to `src/drills/registry.ts`.
- **Timing-critical state never lives in React.** `DrillEngine` advances on the XR frame clock (`useFrame`); the HUD reads throttled 5 Hz snapshots.
- **Object pooling.** Target meshes are allocated once per drill; spawn/despawn assigns pool slots. No geometry/material creation mid-drill.
- **One result schema.** Every drill emits `ARESDrillSessionResult` (see `src/data/schemas.ts`) — EMR-ready, saved to localStorage, shipped unchanged by the placeholder API layer (`src/data/api.ts`) once `VITE_EMR_API_URL` exists.
- **AQ + Goldilocks.** `src/ares/aq.ts` scores each phase 0–100; `src/ares/progression.ts` recommends progress / stay / regress / repeat-with-less-noise / add-specific-load, with the Goldilocks Zone (underloaded / in zone / overloaded) built in.

### The three flagship innovations

1. **A.R.E.S. Neural Arena** — the 360° environment maps every drill onto the Performance Loop: the floor ring segment for the active phase pulses under load, spawn events fire Acquire-stream pulses, and portals/HUD/results all speak Acquire-Route-Execute-Synchronize.
2. **AQ Adaptive Neuroload Engine** — full metric scaffold (reaction, choice reaction, accuracy, false starts, no-go failures, wrong-hand, peripheral misses, L/R + upper/lower asymmetry, central-peripheral split, fatigue drift, timing consistency, speed-accuracy index) → phase AQ score → adaptive recommendation after every run.
3. **Sport-Transfer Reality Labs** — `SportTransferLabVR` is sport-agnostic: a `SportScenario` config converts any sport's demands (pitch/puck/signal/threat/lane + sport-relevant peripheral cues + sport-coded no-gos) into the standard trial stream. Baseball ships polished; racing, tactical, hockey, and soccer variants are one-line configs already in the registry.

## Trainer workflow

1. Open the Netlify URL in Meta Quest Browser.
2. **ENTER IMMERSIVE VR** (button appears only when WebXR immersive-vr is supported).
3. Athlete/quick-test + performance mode are on the landing dashboard (or cycle them in-VR on the dock).
4. Point at a phase portal — **Acquire / Route / Execute / Synchronize**.
5. Pick drill → pick level on the Trainer Control Dock.
6. **Run calibration & safety** (play-space check, seated/standing).
7. **Athlete ready — start drill** (3-2-1 countdown).
8. Live HUD shows time, hits, accuracy, streak; **PAUSE** and **TRAINER STOP** always visible.
9. Results panel: AQ score, metric breakdown, Goldilocks recommendation.
10. **Save session** (localStorage now, EMR later) → run again at the recommended level, or return to the arena.

## Performance modes

| Mode | Framebuffer | Foveation | Stars | Geometry | Glow |
|---|---|---|---|---|---|
| Quest 2 Safe | 0.9× | max | 120 | 12-seg | off |
| Quest 3S Balanced | 1.0× | 0.7 | 240 | 16-seg | on |
| Quest 3 Enhanced | 1.2× | 0.4 | 400 | 24-seg | on |

Auto-selected from the user agent; override on the dashboard or dock. Frame-rate stability beats visuals — if they compete, timing accuracy wins. Framebuffer/foveation changes apply on the next VR entry.

## Safety

- Safety + play-space confirmation panel before **every** drill.
- All targets within arm's reach or controlled torso rotation; no locomotion, no camera movement, world-locked targets.
- Seated/standing modes (seated raises the world origin).
- Trainer stop + athlete pause always on the HUD; stopping still produces a scored partial result.

## Data & EMR readiness

Every run produces an `ARESDrillSessionResult` (session, athlete, drill, phase, device, progression, metrics, AQ block, raw per-trial events). Stored under localStorage key `ares.vr.sessions.v1`. `syncSessionToEMR()` no-ops without `VITE_EMR_API_URL` — implementing real sync touches exactly one file.

## QA checklist

Desktop:
- [ ] `npm run dev` loads the landing dashboard without console errors
- [ ] WebXR detection badges render (shows "not supported" states on desktop — correct)
- [ ] ENTER IMMERSIVE VR button is **hidden** when immersive-vr is unsupported
- [ ] Desktop testing mode: portals clickable, look-around works
- [ ] Each MVP drill starts, runs, and ends (Peripheral Field, Predictive Pathway, Reaction Strike, Depth Slice, Chaos Arena, Reality Lab)
- [ ] Results panel appears with metrics + AQ placeholder + recommendation
- [ ] Save session → appears in Local session history; survives refresh
- [ ] Clear local history works
- [ ] App does not crash when WebXR is unavailable

Quest (2 / 3S / 3, via Netlify deploy preview):
- [ ] Quest Browser opens the HTTPS URL; badges show WebXR + immersive VR supported
- [ ] ENTER IMMERSIVE VR starts the session
- [ ] Controller rays select portals, dock buttons, targets; triggers register hits
- [ ] Setting controllers down → hand tracking takes over; pinch selects; nothing breaks
- [ ] Correct default performance mode per headset; frame rate stable through Chaos Arena L5
- [ ] Purple/gold hand-rule targets attribute left/right correctly with controllers
- [ ] PAUSE and TRAINER STOP respond instantly mid-drill
- [ ] Ending the session (Quest home) returns to the dashboard
- [ ] Results save and appear in history after removing the headset
- [ ] No blocking console errors (`chrome://inspect` via USB debugging)

Deployment:
- [ ] Netlify deploy preview builds green (`npm run build`)
- [ ] SPA redirect works (deep link → app shell)
- [ ] `/fonts/Inter-Regular.woff` serves (spatial text is self-hosted, no CDN dependency)

## Known MVP limitations (documented, by design)

- **Directional slices**: with a still pointer, the trigger counts as the ruled direction; swipe direction is only measured when pointer motion is detectable. Full controller-velocity slicing is the next Depth Slice iteration.
- **Hand attribution on desktop** is `unknown` and never penalized.
- **Central fixation breaks** (eye tracking) are a placeholder metric — Quest Pro-class hardware feature.
- Framebuffer scale/foveation apply at session start, not live.

## Roadmap hooks

- Migrate remaining 55″ touchscreen drills → one `DrillDefinition` each.
- Real EMR sync in `src/data/api.ts`.
- AQ norming against athlete population data (`src/ares/aq.ts` weights are centralized).
- Additional Reality Labs: football, basketball, racquet (add a `SportScenario`).
- Controller-velocity slicing + haptics in Depth Slice.
