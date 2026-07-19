# A.R.E.S. VR — Environment System Scope

**Status:** BUILT and shipped in v0.63.0. Requested venues: soccer stadium, hockey rink, football field, baseball diamond, Indianapolis-style speedway from the start/finish bricks.

---

## 1. The constraint that shapes everything

The suite is a measurement instrument, not a game. Anything behind the athlete's task volume changes the *background luminance, contrast, and visual clutter* of the measurement — which changes reaction time, search time, and detection thresholds. If Speed Search runs against a packed grandstand one day and an empty arena the next, the numbers are not comparable.

So the rule is:

> **Environments are surround-only. The action volume in front of the athlete keeps a controlled, flat, consistent backdrop in every environment.**

Concretely: a "stage floor + backdrop" shell stays fixed in the frontal cone (roughly ±55° horizontal, ±35° vertical, out to Z ≈ −8). Stadium content lives *outside* that cone — overhead, behind, far left/right, and below the floor plane. The athlete gets the feeling of standing in the venue; the engine gets the same photometric conditions every run.

### Locked drills (cannot be re-themed)
These own their visual world because background *is* the independent variable, or because they present optotypes/plates at a specified contrast:

- Visibility / Contrast Sensitivity (`visibility` environment)
- Color Vision (Ishihara plates)
- Stereopsis / dichoptic
- Dynamic Visual Acuity + Gaze Stabilization optotypes
- The entire Assess phase (all Tier-1 baselines, DEM I/II/III, Fine + Gross Motor RT, UFOV)

Everything else — Acquire, Execute, Route, Synchronize, Perform, AEGIS, SEQUENCE, KEYSTONE, GAUNTLET — is themeable.

---

## 2. Current state

| Item | Today |
|---|---|
| Type | `EnvironmentId = "arena" \| "visibility" \| SportId` — `SportId` already includes `baseball, hockey, football, soccer, basketball, racing, tactical, racquet` |
| Renderer | `src/vr/ArenaEnvironment.tsx` (267 lines): `SkyDome`, `Starfield`, `EnergyFloor`, `PerformanceLoopFloor`, and a **stub** `SportProps` |
| Actually implemented | `baseball` (plate, mound ring, strike-zone frame), `racing` (light-tree pole), `tactical` (two tunnel walls). No stadium geometry exists anywhere. |
| Drill assignment | 43 drills → `"arena"`, 1 → `"visibility"`, 1 → `"baseball"` |
| Wiring | `XRRoot.tsx:62` — environment comes from the drill definition, `"arena"` otherwise |

**Read: the type system and the plumbing already exist. What's missing is the geometry and the selection UX.**

---

## 3. Visual approach — recommendation: stylized/procedural

| | **Stylized procedural (recommended)** | **Photoreal GLTF assets** |
|---|---|---|
| Build | three.js primitives + shaders, in the existing brand language | Model/buy → optimize → bake → import pipeline |
| Bundle cost | ~0 KB added | 15–60 MB per venue, textures dominate |
| Load time | Instant | Multi-second per venue, needs a streaming/loading state |
| Quest 3 perf | Safe at 72–90 fps | Real risk; needs draw-call budgeting, LOD, baked lightmaps |
| Consistency | Matches Ares dark-first teal/purple identity | Fights the brand; every venue looks like a different product |
| Licensing | None | Asset licences + venue trade dress |
| Iteration | Change a constant, rebuild | Round-trip through a DCC tool |

Stylized also *helps* the measurement constraint: procedural crowd bands and light rigs can be luminance-clamped by construction, which a photographic texture cannot.

**Proposed style:** low-poly silhouette architecture in Deep Navy `#0B0F2A` / Charcoal `#111428`, structural edges in Electric Teal `#2998AA`, ambient volumetrics in Vivid Purple `#8B5CF6`. Crowds are dark stippled bands with sparse dim points — mass and depth, never legible faces, never bright. Think "arena at night, house lights down, field lit" — which is exactly the lighting condition that keeps the backdrop dark and stable.

---

## 4. The five venues

Each is a `SportProps` branch + an optional sky/floor override. Athlete always stands at origin facing −Z.

### Soccer stadium
- **Ground:** pitch-green mow stripes running along ±X, penalty box lines and centre circle arc behind the athlete, corner arc.
- **Mid:** goal frame set well back at Z ≈ −14 (outside the action volume), net as a faint grid.
- **Surround:** continuous bowl, steep single tier all around, dark crowd stipple, four corner floodlight masts.
- **Sky:** night dome, faint light bloom above each mast.

### Hockey rink
- **Ground:** white-blue ice with a subtle specular sheen, blue lines, red centre line, faceoff circles, goal crease behind the athlete.
- **Mid:** dasher boards at ~1.07 m with teal kickplate, and — this is the good bit — **transparent glass above the boards**, which reads as depth without adding background luminance.
- **Surround:** bowl behind the glass, low tier, dark crowd. Overhead scoreboard cube (unlit face toward the athlete).
- **Sky:** enclosed arena roof with a truss lattice, no stars.

### Football field
- **Ground:** turf with 5-yard hash lines and yard numerals running ±X, athlete standing near midfield.
- **Mid:** goalposts far downfield at Z ≈ −20, uprights as thin emissive verticals.
- **Surround:** deep double-tier bowl, upper deck silhouette, a suggested press box on one side.
- **Sky:** night, stadium light banks at four corners as clustered point sprites.

### Baseball diamond
- **Extends what's already there** — plate, mound ring, strike-zone frame stay.
- **Ground:** infield dirt arc, basepath chalk, grass beyond, athlete in the batter's box.
- **Mid:** outfield wall at Z ≈ −30 with a warning-track strip, foul poles.
- **Surround:** open-corner grandstand (baseball bowls aren't continuous), backstop netting behind the athlete as a faint grid.
- **Sky:** dusk gradient, light towers.

### Speedway — start/finish bricks
- **Ground:** asphalt with a **brick strip** running across the athlete's stance (procedural brick pattern, slight height variance, this is the signature moment), start/finish white line.
- **Mid:** pit wall on one side, catch fence as a fine diagonal mesh, a start/finish gantry overhead.
- **Surround:** enormous continuous grandstand on the outside of the track, low horizon, a suggested infield on the other side. Track banking curving away in both directions.
- **Sky:** bright-but-clamped daytime — the only daylight venue, so the frontal backdrop shell matters most here.
- **Reuses** the existing `racing` light-tree pole.

> **IP note, not legal advice:** the Indianapolis Motor Speedway pagoda, the "Yard of Bricks" branding, and the IMS wordmark are protected marks/trade dress. A *generic superspeedway with a brick start/finish stripe* captures the feel without an identifiable-venue claim, and is the safer default. If you want the actual IMS look, that's worth a licensing conversation with counsel before it ships. Same caution applies to any real team logo, wordmark, or distinctive stadium silhouette in the other four.

---

## 5. Assignment model

Three layers, in priority order:

1. **Locked** — drill declares `environmentLocked: true`; the picker is disabled and shows why.
2. **Drill default** — the current `environment` field. Sport drills default to their sport (Soccer suite → `soccer`, Hockey suite → `hockey`, Auto Racing → `racing`).
3. **Athlete preference** — a global picker in the arena settings panel. Applies to every non-locked drill. Persists in the Zustand store.

This means one new field, one new store value, one new UI panel, and a two-line change at `XRRoot.tsx:62`.

**Session-consistency guard:** because environment affects the backdrop, the environment ID gets stamped into every session record. If an athlete's history mixes environments on the same drill, the results view flags it rather than trending them silently as comparable.

---

## 6. Build order

| Phase | Work | Rough size |
|---|---|---|
| 0 | Backdrop shell — the fixed controlled frontal volume every venue renders behind. **Blocks everything else.** | small |
| 1 | Shared kit: `Bowl`, `CrowdBand`, `FloodMast`, `FieldLines`, `TrussRoof`, luminance clamp helper | medium |
| 2 | Soccer + football (same bowl archetype, cheapest pair) | medium |
| 3 | Hockey (glass + enclosed roof are new) | medium |
| 4 | Baseball (extends existing props) | small |
| 5 | Speedway (only daylight venue, most backdrop-sensitive) | medium |
| 6 | Environment picker UI + preference persistence + session stamping | small |
| 7 | Perf pass on-device: 72 fps floor, draw-call and overdraw budget per venue | medium |
| 8 | Photometric verification: harness renders each venue, samples backdrop luminance in the action cone, asserts variance across venues is below threshold | small |

Phase 8 is the one that makes this defensible rather than decorative.

---

## 7. Decisions taken

1. **Backdrop shell** — dark scrim at 88% opacity (`BackdropScrim`, `src/vr/VenueKit.tsx`), spanning the frontal cone at `CORE_R = 9`. Venue depth reads as a suggestion; the half behind the athlete stays fully immersive because it never carries task stimuli.
2. **Crowd** — static stipple. Animated peripheral motion would contaminate the Acquire-phase peripheral-detection drills.
3. **Speedway** — generic superspeedway with a procedural brick start/finish stripe. No pagoda, no wordmark, no identifiable venue. The bricks sit at z = +1.4, just behind the stance line, so they are underfoot and in peripheral view but never behind a target.
4. **Basketball / racquet / tactical** — left stubbed. Not offered in the picker.

## 8. What shipped

| File | Role |
|---|---|
| `src/vr/VenueKit.tsx` | `CORE_R`, `clampLuma()`, `BackdropScrim`, `Bowl`, `CrowdBand`, `FloodMast`, `TrussRoof`, `VenueGround`, `GroundLines`, `GroundArc` |
| `src/vr/Venues.tsx` | `SoccerStadium`, `FootballField`, `HockeyRink`, `BaseballDiamond`, `Speedway` |
| `src/ares/environments.ts` | `SELECTABLE_ENVIRONMENTS`, `environmentLocked()`, `resolveEnvironment()`, `lockReason()` |
| `src/vr/EnvironmentSelect.tsx` | Suite-entry picker with live preview |
| `src/vr/ArenaEnvironment.tsx` | Venue routing, controlled core, `authored` gate on sport props |
| `scripts/envcheck.ts` | Verification harness — `npm run envcheck` |

**Enforced invariants** (all proven by `scripts/envcheck.ts`):

- No locked drill can be overridden — checked across every venue x drill pair (0 leaks over 14 locked drills).
- Every unlocked drill follows the preference — 42 of 42.
- Every origin-centred venue radius clears `CORE_R`; painted arcs are checked by *nearest approach*, not radius, so offset faceoff circles pass honestly.
- The only geometry inside `CORE_R` is the speedway floor decal, and it must sit at z >= 0.
- No material in `Venues.tsx` sets an unclamped colour; 28 colours route through `clampLuma`.

**Not yet done:** phase-7 on-device perf pass (72 fps floor per venue) and phase-8 photometric verification (sampling rendered backdrop luminance in the action cone and asserting cross-venue variance is under threshold). Both need a headset and a render harness; the structural guarantees above are what stands in for them today.
