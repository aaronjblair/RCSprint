# Super Jay RC — The Ultimate Rebuild Prompt

> Hand this whole file to a capable coding agent. It is a **complete, non-redundant, from-scratch build order** for the game. Build in the numbered order; every rule stated once applies everywhere. **Graphics excellence is a first-class requirement, not a polish pass** — at every step, make it the best-looking browser 3D racing game you can, and verify each visual on screen before moving on.

---

## Mission

Build **Super Jay RC** — a browser-based **3D 1/10-scale dirt-oval RC racing game**. The player stands at a driver's stand and races a radio-controlled car around a banked dirt oval against a full AI field through a 15-round career. It is a **memorial tribute**: the player's car is the orange **Super Jay #32** (his real racing logo), modeled on a **Team Losi 22S Sprint**. The player chooses a **car class**, a **track**, a **game mode**, and **day or night**, then races. It must **ship as a static site**, install as a **PWA** and a **Windows .exe**, run at ~60 FPS on a laptop, and look **photoreal-grade** for a stylized RC scene.

**Stack:** Babylon.js 7 (à-la-carte imports + required side-effect imports) · Havok physics (WASM) · Vite · TypeScript (strict). Web Audio for all sound. `vite-plugin-pwa` for the PWA, Electron + electron-builder for the `.exe`.

**Commands:** `npm run dev` (Vite at 127.0.0.1:5173) · `npm run build` (`tsc --noEmit` strict, then `vite build` → `dist/`) · `npm run preview` · `npm run build:win` (Windows installer).

---

## Ten laws (true everywhere — decided once, obeyed always)

1. **It ships static.** `npm run build` → `dist/` must build clean and run from any static host with **no server dependency**. Assets are procedural or live under `public/`. Handle the GitHub Pages `/RC-Dirt-Oval/` subpath so assets survive it.
2. **Best graphics possible, always.** Every mesh, material, and light targets realism: PBR everywhere, IBL-driven ambient/reflections, ACES tone mapping, physically plausible roughness/metalness. Never ship a flat unlit material or an untextured ground. When a choice trades a little performance for a real visual gain, take it — then reclaim the cost through the quality ladder (law 3), not by lowering the ceiling.
3. **Hold 60 FPS adaptively.** A 5-tier quality ladder auto-scales render detail to hold ~60 FPS and climbs to max when the GPU has headroom. Quality scales; the visual *target* never lowers.
4. **Picture-perfect cars.** Every car (player + AI) reads as a clean, correct vehicle for its class — four corner tires, wing/body/livery intact, nothing missing, floating, or clipping.
5. **World scale: only cars and track are 1:10.** Everyone/everything else is full real-world size. 1 unit ≈ 1 ft; adult ≈ 5.7u, car ≈ 2.5u, stand deck ≈ 5u, booth ≈ 9u. Scale figures at the feet (root y=0).
6. **Day or night is the player's choice.** Any track runs either. Night is the default and signature look; daytime is fully supported. Career re-rolls day/night randomly per round.
7. **Verify on screen.** Confirm every visual/physics change with a headless-Chrome screenshot (full grid when touching car spawning/placement) or by reading live sim state. Never call a change done from description alone.
8. **Flat tracks stay byte-identical.** All jump/airborne/banking code is gated behind `airborne`/shape checks so the oval and figure-8 behave identically with those features present.
9. **Strict build is the only gate.** No test runner, no linter. TypeScript strict (`noUnusedLocals/Parameters/noImplicitReturns`) — an unused symbol fails the build.
10. **The #32 is a memorial.** The player car is a tribute — orange, white centerline stripe, the Super Jay logo, number 32. Handle the livery with care.

---

## Build order

### 1 — Scaffold + the render foundation (graphics start here)
Vite + TS-strict + Babylon 7 à-la-carte with the required side-effect imports (materials, shadow/physics components, **prepass + geometryBuffer for SSAO2**). Boot Havok WASM. Stand up `src/core/Environment.ts` `setupEnvironment` **first** so everything after is lit correctly, returning `EnvHandles { pipeline, ssao }` (SSAO2 may be `null` on weak GPUs — guard it):

- **IBL environment** — set `scene.environmentTexture` (procedural sky reflection probe; no shipped HDR) so PBR materials get real ambient + reflections; lean less on a flat HemisphericLight.
- **ACES tone mapping**, `exposure ≈ 1.0`, `contrast ≈ 1.1`.
- **DefaultRenderingPipeline:** subtle **bloom** (threshold ≈ 0.85, weight ≈ 0.15, kernel ≈ 64), **vignette** (MULTIPLY, weight ≈ 1.5), faint **animated grain** (intensity ≈ 6), light **chromatic aberration**, **sharpen**.
- **SSAO2** with `epsilon = 0.02` (kills flat-ground blotches); MSAA via the prepass so AO doesn't kill AA; FXAA for the race view. (Reserve TAA/DoF for replay/photo only — they ghost on a moving cam.)
- **Cascaded Shadow Maps** for the sun (4 cascades, `lambda ≈ 0.9`, tight `shadowMaxZ`, `stabilizeCascades`, PCF + `normalBias`). Shadow-map size is **fixed** (never runtime-mutable).
- **Atmospheric fog** (`FOGMODE_EXP2`, low density, tinted) for depth.
- SkyMaterial for day; a night path (built later) with crescent moon + starfield + Big Dipper.
- Camera `maxZ` must exceed the skybox/star-dome radius or the sky clips to black.

Prove it: a PBR sphere on a textured ground, correctly lit with reflections and soft shadows, strict build green.

### 2 — Track surface + collision
`src/track/TrackDef.ts` (tracks are data) and `src/track/centerlines.ts`. Implement `makeCenterline(def)` keyed on `TrackDef.shape`, starting with **oval** (two straights + two 180° turns, verbatim so it stays byte-identical). Build `src/track/OvalTrack.ts`: the banked dirt surface, a **grassed infield** with the **Flora Vista logo sprayed flat onto it** (alpha-blended, faint emissive so it reads at night), a collidable 400×400 ground (jump-landing floor), the racing groove, and the start/finish line **relocated ~¾ down the front stretch** (`track.startFinishS`). Havok provides static collision + wheel-ray targets **only**.

**Graphics:** one uniform packed-dirt PBR surface (no painted groove bands). `anisotropicFilteringLevel = 16`, modest tiling, low `bumpTexture.level` (kills grazing-angle moiré — the #1 amateur tell). Add a **DetailMap** for close-up grain and a mismatched normal-map tiling to hide repetition. A transparent **racing-groove overlay** darkens the driven line over a run (`updateGroove`, capped ≤40%; grip evolves invisibly in `SurfaceModel`).

### 3 — The custom kinematic vehicle (`src/physics/RaycastVehicle.ts`)
The vehicle is **custom and kinematic — NOT a Havok rigid body** (the rigid-body path was abandoned: `applyForce` desynced velocity from the mesh). It integrates its own velocity (slip / friction-circle tire model) + yaw, and raycasts the ground for ride height + banking. Tune via `VehicleConfig`/`DEFAULT_CONFIG` and the slip/grip math. `placeWheels` uses **per-wheel `WheelDef.radius`** (needed for tire stagger, or big tires sink/float). Drive one car with the keyboard.

Include (but keep dormant/gated until off-road):
- **Jump/airborne block** (all gated behind `airborne` so flat tracks are byte-identical): track `prevGroundY`/`climbRate` while grounded, convert ramp climb into a real `vUp` launch at the crest (launch cap 16); `airPitch` pitches the chassis to follow the arc; `landSquat` settles landings forgivingly (suspension squat + small speed scrub on big drops, never a tumble); slope-gravity guarded behind `!airborne`.
- **Buff layer:** `applyBuff(kind:"grip"|"accel"|"top", mult, seconds)`, `grantImmunity(seconds)`, `buffState()` — ticked/decayed in `update()`, identical behavior when none active; immunity short-circuits `triggerRollover`.
- **Rollover:** `triggerRollover` tumbles on multiple axes with momentum decay + ground bounce, settles naturally, then leaves the car **stuck** (`isStuck`, no control/velocity) until a marshal (or `R`) recovers it.

### 4 — The Sprint Car body (`src/car/Car.ts`, `DEFAULT_CONFIG`) — flagship, picture-perfect
Modeled on a real winged sprinter / Team Losi 22S: a huge **top wing** with a down-swept front scoop + tall number side boards; **staggered tires** (biggest right-rear) on **orange beadlock** wheels; a detailed tube front end. Player = **Super Jay #32** (orange, white stripe, logo).

**Graphics:** **clearcoat car paint** (metallic ≈ 0, low roughness, clearcoat 1), `metallic=1 / roughness≈0.1` chrome wheels, rough rubber tires with a normal map, `enableSpecularAntiAliasing = true` on painted materials (stops shimmer in motion). Tires: no sidewall/shoulder mesh may exceed the tread radius (a torus bulge reads as Mickey-Mouse ears) — revolve the carcass with `CreateLathe` from a cross-section (rounded shoulders, square-ish tread) and set the tire material `backFaceCulling = false`; Hoosier lettering on a thin sidewall disc with a punched center so the chrome dished wheel + center nut shows through. Add a **soft contact-AO blob** under each car (dark radial plane following its XZ) for grounding.

### 5 — Cameras (`main.ts` view enum + `src/core/*Camera.ts`)
Four views, cycled with **V** (`#view` button); **C** quick-toggles aerial; each race starts on **Track** (`?view=` override):
1. **Track/normal** — `DriverStandCamera` follow cam.
2. **In-Car** — `CockpitCamera`, first-person, **parented to the player car root** so it inherits heading/pitch/roll/bank; adds lean-into-corner (yaw-rate × speed), a faint speed shake, and a **speed-driven FOV**. Per-class cockpit eye. A flip falls back to the external cam.
3. **Aerial** — `UniversalCamera`.
4. **RC Pro-Am** — `src/core/RCProAmCamera.ts`, overhead, keeps the player car screen-centered (arcade default).

**Mandatory for every camera:** `env.pipeline.addCamera(...)` (ACES/bloom parity) **and** attach to the `"ssao"` pipeline (`scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline`). Add light, speed/impact-scaled **camera shake** and low-strength **motion blur** (desktop tier only) for sense of speed. Manual zoom in every view (wheel, +/- keys, on-screen ± on touch).

### 6 — Field, AI, race management (`src/race/Field.ts`, `RaceManager`)
`Field` builds the **entire** grid (player + AI) from **one** `CarClassDef` via `classDef.build`. Car-to-car contact and wall limits are **positional, not physics** (`resolveContacts`, `wallLimit`); Field owns surface grip, tire wear, dust, and rollovers for the whole field. Deterministic AI names/numbers per grid slot (no `Math.random`) so the championship stays coherent. **Finishing order:** rank finished cars by **finish time** (`finishedAt`), then unfinished by `progress` (a finished car's `progress` wraps down at the line).

**AI liveries:** number on the **wing-top deck** (transparent ≈75%, luminance-contrasting, readable from +x); one AI slot is always the **red/white #42** (red glyphs, black outline). Player keeps the #32 logo.

**Graphics:** procedural **dust/dirt particles** (`src/core/Textures.ts` canvas textures) kicked up behind cars — set `BLENDMODE_STANDARD` (Babylon defaults to additive → glowing embers). Fade/scale dust by speed and surface.

### 7 — Night sky + full atmosphere
`Environment.addNightSky()`: a **crescent moon** (billboarded carved disc), a **starfield dome**, and a **Big Dipper** asterism (billboarded bright dots, north-up), all `applyFog=false`. Light towers light the track; bloom makes them read as stadium floods. (Bowl cameras pitch past the sky, so verify moon/stars by freezing the scene, aiming a camera at `moon.position`, and rendering.)

### 8 — Race flow + UI (`src/main.ts`, `src/ui/Screens.ts`)
State machine `attract → prerace → racing → finished` (+ `replay`); fixed-timestep loop (`FIXED = 1/60`, ≤6 catch-up steps). Debug globals: `window.__field/__track/__race/__marshals/__cockpit/__audio/__quality/__arcade`.
- **Boot loading bar** — `#loading` splash is a real app-build progress bar (`setBootProgress(pct,label)`: engine 10% → physics 20/50% → track/field 85% → ready 100%), showing the **SUPER JAY #32** badge (`public/superjay-32.png`), then fades.
- **Attract reel** — first open per tab session: all cars AI-driven under a cutting cinematic camera; any input drops into the menu with a fresh grid.
- **Unified setup screen** (`Screens.setup`) — ONE screen sets driver **name** (default "Super Jay"), **class**, **mode**, **track**, **day/night**, **sound**, **auto-throttle**, then START. All persist to `localStorage` `rcdirtoval.*` and pre-fill next launch; changing class/mode/track saves + reloads with a `sessionStorage["rcdirtoval.autostart"]` flag that drops straight into the race.
- **Race start (both modes)** — a drag-strip **light tree** (staging dots → three ambers → GREEN) fires the green flag at ~2.4s, with a **perfect-launch boost** for gassing within ~350ms of green.
- **In-race controls** — arrows/WASD drive, **R** reset, **V** cycle view, **C** aerial, **P** pause (Resume/Restart/Quit-to-Menu — freezes sim + race clock + sound; `pausedAccum` keeps the lap clock honest), wheel/+/- zoom, **G** garage, **M** mute. **Auto-throttle** = full throttle + steering-only (hides touch pedals). Gamepad/yoke+pedals take over on real input.
- **URL param hygiene** — on any menu-driven reload, scrub the dev-override params so the freshly-saved menu pick wins:
  ```ts
  const u = new URL(location.href);
  ["track","class","mode","day","night"].forEach(k => u.searchParams.delete(k));
  history.replaceState(null, "", u.toString());
  ```
  Keep `?demo`/`?round`/`?view`/`?photo`.

### 9 — Career (`src/career/Career.ts`, `src/track/tracks.ts`)
`generateCareer()` produces **15 rounds** (increasing difficulty), each with a **random 8–12 car field** (`fieldSize = 8 + rand(0..4)` → palettes carry 12 entries) and a **per-round themed backdrop** (mesas/forest/plains/city/dunes/badlands). Career **always advances** (no podium gate); points keyed by driver name. **Career re-rolls day/night randomly per round.** Careers are **class-keyed** (`rcdirtoval.career.<cls>`). **Grids by previous finish:** `career.lastRaceOrder` stores the prior order as **identity indices** (`"player"`=0, `"ai{i}"`=i) so a rename can't misplace anyone; `Field` maps each identity to a grid slot in that order (winner on pole); `cars[]` stays in identity order so `cars[0]` is always the player.

### 10 — Marshals, flag girl, scenery, people (world-scale, rigged, best-looking)
- **People rig** (`buildPerson`) — legs on hip+knee pivots, arms on shoulder pivots; rest pose = plain standing. Every figure has **visible knees, shoes (soles at y≈0), and hands** parented to the rig so they swing with the gait. **Varied looks** (shirt/pants/skin/hair/headwear) so no two read alike. Adult ≈ 5.7u, feet y≈0.
- **6 marshals** (`src/race/Marshals.ts`) — 2 **seated in camp chairs** at the infield ends (x=0), 4 **standing outside** the four corners (offset `W/2+4`, facing in). The nearest available marshal claims a car that is **wrecked (`isStuck`) OR stalled** (speed `< STALL_SPEED` for `> STALL_TIME` while green), **jogs** to it (full animated gait), places it back on the racing line upright + facing race direction via `resetTo(pos,yaw)` from `track.project()`, then returns and re-seats/stands.
- **Flag girl** (`src/race/FlagGirl.ts`) — at the start/finish line; `greenFlag()` triggers a big wave that decays to idle.
- **Scenery** (`src/track/Scenery.ts`) — a real-size **drivers' stand** (doubled length) with a banner behind and a **lit booth window** at night, a **timing booth/shack**, **6 light towers** (4 corners + 2 mid-straight), and **varied full-size spectators** facing the track, arms posed forward, **each holding a small procedural RC transmitter** (box + thumbstick nubs + antenna). **Tailgate pickup trucks** (`src/race/Pickups.ts`) behind the grandstand, tailgates down, 0–2 people on the gate. Easter egg: a guy on a **red riding mower** on the infield grass (`src/race/LawnMower.ts`).
- **Backdrops + world floor** to the horizon. Clamp each backdrop instance with `safeR(r, footprint)` so a wide base never reaches inboard of the outfield and clips the track.

### 11 — Audio (`src/audio/MotorSound.ts`) — fully procedural, no files ship
- **Player voice** — a high-revving combustion sprint-car engine: sawtooth fundamental (tracks speed+throttle) + upper harmonics (rasp/bite) + a sub + an **exhaust-rasp noise band**, through a low-pass that **opens with throttle** (keep the cutoff high enough to stay audible).
- **3-speed gearbox** — the tone audibly **shifts up through 3 gears** (rev climbs within a gear, drops on the shift):
  ```ts
  const GEARS = 3;
  const gear = Math.min(GEARS - 1, Math.floor(spd01 * GEARS));
  const within = spd01 * GEARS - gear;
  let rev = 0.4 + within * 0.6;
  rev = Math.min(1, Math.max(rev, load * 0.5));
  if (gear > this.prevGear) this.shiftBlip = 1;
  this.prevGear = gear;
  this.shiftBlip *= 0.82;
  const shiftDip = 1 - this.shiftBlip * 0.55;
  const f = 140 + rev * 560;
  ```
- **AI field** — cheaper tier: `setVoiceCount(n)` → one saw-osc→gain→**stereo panner** per car (deterministic detune); `updateVoices(...)` pitches/pans/distance-fades to the active camera.
- One master gain cap. **Mute** via **M**/`#mute` (`setMuted`, persisted `rcdirtoval.muted`); **pause** ramps master gain to silence (composes with mute). AudioContext starts **suspended**; start oscillators **only after `ctx.resume()` resolves** (starting while suspended = silence); gesture handlers resume on **every** pointer/key (not `{once}`); every menu has a SOUND ON/OFF toggle calling `enable()`. Silent no-op when `AudioContext` is unavailable (headless). `window.__audio`.

### 12 — The other classes (`src/car/CarClass.ts` registry)
`CAR_CLASSES`/`CAR_CLASS_LIST` map each id → body builder + pristine physics baseline; `loadCarClass`/`saveCarClass` (`rcdirtoval.class`, `?class=` override); switching class reloads.
- **Dirt Late Model** (`LateModel.ts`, `LATE_MODEL_CONFIG`) — a real 1:10 RC dirt-late-model: a low, wide, full-bodied **wedge** (one solid mass, NOT open-wheeler) — big fenders the wheels tuck under, full-width cab, tall sail panels, a high rear deck, a wide flat raked spoiler, a low splitter nose. Heavier, planted. Player gets the stripe + logo.
- **1:10 Off-Road Buggy** (`Buggy.ts`, `BUGGY_CONFIG`) — high clearance, long-travel shocks, knobby **open** wheels, big rear wing, per-class `BUGGY_COCKPIT` eye.

### 13 — The other tracks (`centerlines.ts`, `TrackSelect.ts`)
`TrackChoice = "career" | "figure8" | "offroad"` (`rcdirtoval.track`, `?track=`, default career). Figure-8 and off-road are **EXHIBITION** (no career/arcade writes; a simple result + Watch Replay).
- **Figure-8** — a self-crossing lemniscate with an **at-grade X** (T-bones on the table). Flat. **Windowed projection** `projectNear(point, sHint, window=60)` keeps cars at the coincident X on their own leg (per-car `lastS` hints thread through `RaceManager`/`Field`).
- **Off-road STADIUM** (research-backed supercross feel) — a compact **winding closed loop** with **banked berm corners** (`bankFn`, ~11.5° peak on the end-turns) and a supercross **mix of jumps** (`ramps[]` trapezoids whose heights SUM): **tabletop** (long deck, forgiving), **double** (two peaked humps), **big single** (tall steep takeoff, big air), **step-up → raised plateau → step-down**, and a **whoops/rhythm** run. Enclose it in a real arena: a **continuous raked grandstand bowl** following the centerline pulled in close, a **packed crowd** (crowd texture + a row of rigged front-row spectators), a **tall close wall** (concrete base + ad-board band) that follows the centerline with uniform run-off (**must not clip the racing surface at diagonal bulges** — build wall AND bowl from `track.ringPath(off,y)`, not an ellipse), **no desert backdrop/vegetation** (the bowl is the horizon), and **night floods** ringing the bowl. **Off-road defaults to NIGHT and is buggy-only** (force the whole field to buggies).

`fromParametric(xz, elev, startFinishFrac, bankFn)` densely samples a periodic curve, builds a cumulative arc-length table, and `pointAt(s)` binary-searches it for uniform travel speed; elevation carries jump height, `bankFn` carries banking.

### 14 — Game modes (`src/game/Mode.ts`, `Arcade.ts`)
Picked on the setup screen; persisted (`rcdirtoval.mode`, `?mode=`).
- **Career/Sim** — the championship above; the reference behavior, kept stable.
- **Arcade** (RC Pro-Am style) — a **score** + a **top-3-or-burn-a-continue** gate (~3 continues); defaults to the **RC Pro-Am overhead camera**; lays **oil/wet slick patches** on the oval (any car sliding through loses grip transiently). Earlier box pickups / boost chevrons / collectible letters are **removed** (no-op stubs remain). Arcade HUD shows Score/Continues only in arcade. `finalize()` in `main.ts` branches by mode. `window.__arcade`.

### 15 — Player edge + wreck balance (the ONLY asymmetries)
The player is faster and more forgiving; the field otherwise shares the same physics baseline.
- **Permanent edge** — `applySetup()` runs for the **player car only** (Field build + garage re-apply; AI never call it). Recompute from the pristine baseline each call so it never compounds:
  ```ts
  cfg.engineForce *= 1.05;                     // ~5% faster than any AI car
  const aiTopSpeed = base.engineForce / base.rollResist;   // top-speed FLOOR so wing drag can't negate the 5%
  const minTopSpeed = aiTopSpeed * 1.05;
  if (cfg.engineForce / cfg.rollResist < minTopSpeed) cfg.rollResist = cfg.engineForce / minTopSpeed;
  cfg.steerSpeedFalloff  = base.steerSpeedFalloff * 0.85;  // responsive at speed
  cfg.slipSteer          = base.slipSteer * 0.8;           // less tail-happy
  cfg.tireGrip          *= 1.06;
  cfg.corneringStiffness *= 1.08;
  ```
- **Early-career easing** (`main.ts`) — career rounds 1–7, player car only: `engineForce *= 1 + 0.15*(7-round)/7` (+15% on round 1 tapering to 0 by round 8). AI + baselines untouched.
- **Wreck balance** (`Field.ts`) — AI wreck more easily; the player can still wreck. Per-car rollover thresholds: wall slam player ~12 / AI ~6.5; T-bone (behind a `closing > 5` gate) player ~9.5 / AI ~5.

### 16 — Post-race replay (`src/replay/Replay.ts`)
`RaceRecorder.record()` snapshots every car's pose each physics step while `state==="racing"` into a capped `Float32Array`. A `"replay"` flow drives each car's root from the recorded frames (interpolated, wheels spun from travel) under the cinematic cam, with a scrub/play/speed/camera bar (`Screens.replayControls`). A **Watch Replay** button on every results screen enters it; Done returns. The replay branch suppresses physics/HUD and owns its camera.

### 17 — Input + touch (`src/input/Input.ts`)
Keyboard/gamepad as above. **Touch:** steering bar **bottom-RIGHT** (stretched `min(60vw,560px)`), **GAS/BRAKE bottom-LEFT**, RESET above the pedals, zoom ± on the right edge; hide the dev status box on touch. Must-implement iOS/viewport fixes:
- `touch-action:none` on **each** interactive element (not inherited; the root is `pointer-events:none`).
- Bind `lostpointercapture` so a revoked capture always releases.
- Cancel any **multi-touch** `touchmove`: `document.addEventListener("touchmove", e => { if (e.touches.length>1) e.preventDefault(); }, {passive:false})` (single-finger scroll intact).
- Pin `#touchControls` to `window.visualViewport` (counter-translate + `scale(1/scale)`, size to `vv.width/height` on resize/scroll) so controls never scroll off-screen.

### 18 — Adaptive quality (`src/core/QualityManager.ts`)
A **5-tier ladder** (0 Min … 4 Ultra) controlling hardware scaling (`engine.setHardwareScalingLevel`, each tier's `scaleMul` multiplies the base so the mobile lighter path is preserved), MSAA, SSAO samples, bloom, sharpen, motion blur, aniso, and the env/reflection budget. Start **High 3** desktop / **Low 1** mobile; clamp DPR ≤ 2. Sample `engine.getFps()` every 0.5s with hysteresis (down if <50fps ~1s, up if >58fps ~3s), 2s cooldown; call `update()` **every frame** (not gated by race state). Shadow-map size stays fixed. `window.__quality`. Gate the costliest realism (per-car reflection probe at 128px every-2-frames, parallax-occlusion ruts, LUT grade) to High/desktop or skip. The visual target never lowers — only the tier does.

### 19 — Branding
Display name **"Super Jay RC"** (internal codebase name stays `RCSprint`) in `index.html`, `vite.config.ts`, `electron-builder.yml`, `Guide.ts`, the attract title, and the wing-deck default label. The #32 memorial livery per law 10. Opening splash shows the SUPER JAY #32 badge (`public/superjay-32.png`; original shop photo at `src/assets/superjay-photo.jpg`). A hidden `?photo` mode locks a close rear-3/4 camera on the player car (shares post-FX) to inspect bodywork.

### 20 — Distribution
- **PWA** (`vite-plugin-pwa`) — emit `manifest.webmanifest` + a service worker precaching the bundle **including the Havok `.wasm`**; generate icons with `scripts/gen-icons.mjs` from `public/superjay-32.png`. Installs on iOS/Android/Windows/Mac from the browser. Live at `https://aaronjblair.github.io/RC-Dirt-Oval/`.
- **Windows .exe** (Electron + electron-builder) — `electron/main.cjs` loads `dist/index.html`; `npm run build:win` → redirect electron-builder output to a **temp dir** then copy the installer into `./release/` (a direct build into the project tree trips an EPERM). Ship the `.exe` as a **GitHub Release asset**, never committed (`release/` gitignored).
- No native store builds — install the PWA.

---

## Gotchas that cost real time (obey once, everywhere)

- **Headless sim is slow (~1–5 fps)** — for deterministic tests, step the sim **synchronously at fixed dt** and read internal state (`vehicle.heading`, `vehicle.position`), not `mesh.getDirection()` (stale until a render frame).
- Verify visuals with **headless-Chrome screenshots** (`?demo`, `?round=N`, `?photo`, `?day`/`?night`, `?view=`); a Playwright MCP shot of the WebGL canvas is stale/garbled.
- Probe figure scale via bounding-box height (~5.7u, feet y≈0) — racing cameras distort size.
- `Matrix.InvertToRef` is not static — use `matrix.invertToRef(out)`.
- The racing/driver-stand camera pitches into the bowl, so backdrops/moon/stars sit above frame — verify them in aerial/attract-wide views.
- **Windows/PowerShell:** `npm` is `npm.cmd` (run `npm run dev` as a background process, not `Start-Process`); PS 5.1 has no `&&` (chain with `;` or `if ($?){}`); **Git is not on PATH** — prepend `$env:Path = "C:\Program Files\Git\cmd;" + $env:Path` and use `git --no-pager`.

---

## Definition of done

`npm run build` clean; oval/figure-8 byte-identical with jump code present; player is ~5% faster + forgiving while AI share the baseline and wreck more easily (but the player can still wreck); all three classes and all three tracks render picture-perfect day and night; the off-road stadium reads as an enclosed lit arena with varied jumps and no clipping; the engine audibly shifts 3 gears; replay, marshals, PWA, and `.exe` all work; and every scene looks like the best browser 3D racing game you can produce at ~60 FPS.
