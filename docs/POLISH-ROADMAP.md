# RCSprint — Commercial-Polish Roadmap

Synthesized from a 4-agent critical review (visual, physics, UX, performance), 2026-06-16.
Goal: take RCSprint from "polished hobby project" to "feels like a released game" — for fun.
Ranked by leverage. `P0` = breaks the bar / must-fix, `P1` = should, `P2` = polish.

## 🎯 The convergent #1 (all reviewers): LIGHTING
**`main.ts` forces `def.night = true` for all 15 rounds**, so every race is a dim night oval.
This crushes the cars into shadow and wastes the clearcoat/metalflake/ACES work the engine
already does. **Fix:** restore the authored day/night calendar (night only on rounds 8/12/15),
raise night `environmentIntensity` (`Environment.ts:37`, currently 0.12) + fill, add a real
directional key. *This one change recovers most of the existing material quality.* (Visual P0, UX P1.)

## Visual (technical art)
- **P0** Late Model is a box-stack — flat slabs, 90° edges (`LateModel.ts:139–208`). Bevel/lathe the
  body, round the nose/roof. It's the one car that fails the "picture-perfect" rule. → `late-car-model` skill.
- **P0** Scene too dark (see #1).
- **P1** Wire the unused dirt roughness map (`public/textures/dirt/rough.jpg`) into `makeDirtPBR`
  (`Textures.ts:8–27`) — damp-groove vs dusty-cushion specular break-up (cheapest realism win).
- **P1** Drivers read as snowmen (sphere helmet + box visor on a capsule) — `Car.ts:380`, `LateModel.ts:213`.
  Add shoulders/gloves or tuck deeper. Helmet is plain white every car — tie to car color.
- **P1** Livery reads as MS-Paint (one font, flat fills) — `Car.ts:111`, `LateModel.ts:52`. Add number
  outline/shadow, a 2nd accent, faux sponsors.
- **P1** Drivers' stand is a plain box deck — add tin roof, tiered seating, a banner (`Scenery.ts:62`).
- **P2** Backdrops are untextured geometric blobs; infield logo too sticker-bright; banner sponsors
  repeat identically; FlagGirl predates the `PersonRig` (stiff). Stars/Big-Dipper sparse/too uniform.
- **P2** Exhaust headers still built in `Car.ts:404` though a commit said they were removed — reconcile.

## Physics / handling
- **P0** `mass` is cosmetic — the late model's "heavy/planted" identity is faked, not simulated
  (`RaycastVehicle.ts:387` is the only read). Add **longitudinal load transfer → per-axle grip** so
  mass, `comOffsetY`, and the `bias` slider become real (all currently dead). (Biggest sim win.)
- **P1** Yaw oversteer (`slipSteer`/`throttleSteer`) is ungrounded — the tail steps out by formula,
  not from a real grip-budget failure (`RaycastVehicle.ts:278–280`). Gate it on rear-grip exceedance.
- **P1** `suspStiffness`/`suspDamping` are dead — ride height is a flat lerp, no real spring/damper.
- **P1** AI corner speed ignores banking + downforce (`AIDriver.ts:155`) → AI under-drives; a good
  player laps the field. Add bank + `downforce·v²` terms.
- **P1** Contact/walls are mass-blind, no swept wall test, T-bone flips both cars (`Field.ts:191–226`).
- **P2** `corneringStiffness` not grip-scaled; frame-coupled lerps; draft wrongly boosts cornering grip.

## UX / content / game-feel
- **P0** No stakes — P1 and P12 advance identically (`main.ts finalize()`); a dead "need a podium"
  note can never fire (`Screens.results`). Add objectives/rewards or a real advance gate.
- **P0** No pause / settings / quit-to-menu / volume slider / difficulty / rebinding.
- **P0** No in-race event feedback — no collision/lap/overtake/final-lap/finish SFX, no HUD juice
  (lap flash, position toasts, FINAL LAP, NEW BEST, big finish reveal). `MotorSound.ts` is engine-only.
- **P1** First-race onboarding is text-gated (Guide is opt-in) — add a fading control-hint overlay.
- **P1** HUD is two systems/styles (top bar + bottom-left debug-looking `status` div) — unify.
- **P1** Restore track variety (day/night, surface tone, backdrop per round — overridden in `main.ts:85`).
- **P1** Highlight the player's row in results + championship; celebrate the finish.
- **P2** Tire-wear warning cue; "Press R" when stuck; class/car previews; Reset-Career confirm; minimap S/F marker.

## Performance / code quality
- **P0** Uncapped per-frame shadow map over ~1000 static casters (`main.ts:119`) — set `refreshRate`,
  drop static scenery/people from casters. *Likely the biggest GPU win (~20–40% on a phone).*
- **P0** No instancing/merging — ~60 meshes + ~10 materials **per car** ×12 (`Car.ts:282`). Share
  materials once; `MergeMeshes` static car parts; cut draw calls ~10×.
- **P0** Dead/huge assets ship — `src/assets/superjay-photo.jpg` (2.5MB) + `textures/dirt/rough.jpg`
  (678KB) referenced nowhere; dirt JPGs ~5MB. Delete dead, re-encode/resize (WebP).
- **P1** Per-frame `Vector3`/`Quaternion` allocations in `RaycastVehicle.update`/`groundAt`/`placeWheels`
  (~12k allocs/sec for a full field) — hoist to scratch members + `…ToRef`.
- **P1** Code-split the 1.8MB JS chunk (`manualChunks`); lazy-load Havok/SSAO. Double `track.project()`
  per car per step (`Field.ts:147,185`). 12× always-on dust ParticleSystems.
- **P2** Pervasive `as any` (`window.__*`) and needless `as unknown as TransformNode`; magic numbers.

## Suggested skill division (to "work better together")
Existing: screenshot-game, add-trackside-actor, world-scale, night-sky, import-asset, verify-goals,
commit-it, **sprint-car-model**, **late-car-model** (new). Proposed additions:
`vehicle-physics` (RaycastVehicle/configs/load-transfer), `track-build` (OvalTrack/tracks/SurfaceModel),
`ai-racing` (AIDriver), `livery-paint` (decals/materials), `game-ui` (Screens/HUD/SetupPanel/Minimap),
`audio-sfx` (MotorSound + event sounds), `lighting-grade` (Environment day/night), `perf-budget`
(instancing/shadows/allocations/bundle).
