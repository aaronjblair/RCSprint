---
name: late-car-model
description: Trigger when building, restyling, or tuning the DIRT LATE MODEL class in RCSprint (src/car/LateModel.ts, LATE_MODEL_CONFIG) — bodywork, livery, tires, or how it handles.
---

# late-car-model — the dirt late model (full-fendered wedge)

The second car class — the **visual and dynamic opposite of the winged sprinter**. Built by `createLateModel` in **`src/car/LateModel.ts`**; physics baseline is **`LATE_MODEL_CONFIG`** (top of that file). Selected on the start screen (`Screens.classSelect`); each class keeps an independent career. Sibling: the **`sprint-car-model`** skill.

## Real-world reference (what we're modeling)
A Super Late Model at 1:10:
- **~103" wheelbase, ~78" wide, ~2300–2350 lb, ~430 ci / 800+ HP V8.** Much heavier than a sprinter.
- **Full-bodied wedge**: low pointed nose + air dam, sloped hood, tall greenhouse set back, signature **sail panels**, fender flares over all four wheels, a **big adjustable rear spoiler** (not a wing).
- Four-bar/swing-arm suspension, coil-overs, **lots of travel and mechanical side-bite**. Wide, soft Hoosier dirt tires with **mild** right-rear stagger.
- **Handling character: heavy, planted, smooth, carries corner speed.** Higher polar inertia → it changes direction **slower** and is **more forgiving** than the twitchy sprinter. It drives "on the bars" / on mechanical grip, not on a wing.

## How that maps to the config knobs (`LATE_MODEL_CONFIG` vs sprint)
> `mass` is mostly cosmetic here — the "heavy, planted" feel is built from the grip/steer knobs:

| Knob | Late model | Sprint | Effect |
|---|---|---|---|
| `tireGrip` | `2.0` | 1.7 | **more mechanical grip** — it carries speed without sliding |
| `downforce` | `0.0` | 0.015 | **no wing** — grip doesn't balloon with speed (relies on tires) |
| `corneringStiffness` | `10.5` | 9 | slip is arrested faster → **planted**, less drift |
| `slipSteer` | `0.42` | 0.6 | **much less tail-happy** — a slide rotates it far less |
| `throttleSteer` | `0.009` | 0.015 | softer power-steer — it doesn't snap around on the gas |
| `engineForce` | `15` | 17 | less violent acceleration (heavier, less power/weight) |
| `maxSteer` / `steerSpeedFalloff` | `0.5` / `0.06` | 0.55 / 0.05 | **slower, calmer** direction change |
| `rollResist` | `0.95` | 0.85 | a touch more drag (heavier car) |

To make it **more planted/forgiving**, lower `slipSteer`/`throttleSteer` and raise `corneringStiffness`/`tireGrip`. Keep `downforce` ~0 (its grip is mechanical, not aero). Garage sliders scale around this baseline via `applySetup(cfg, setup, LATE_MODEL_CONFIG)` — tune the baseline, not the sliders.

## Bodywork anatomy (must stay picture-perfect)
Under the invisible `chassis` box: floor pan, wide slab **doors with numbered roundel livery** (`lateLiveryDraw`) or hero logo, **wedge nose + air dam + sloped hood**, greenhouse (windshield, A-pillars, **roof number panel**, rear window, cabin sides), the signature **sail panels** (right taller than left), rear deck + tail, a **tall rear spoiler with triangular side boards + black wickerbill**, **fender flares** (`buildFender`) hooding all four tires, a driver through the windshield, and right-side exhaust headers. Wheels: fendered, **mild** stagger (RR marginally biggest, `r:0.31`), machined-silver beadlock.

**Hard rules (same family as the sprinter):**
- Reads as a clean late model: four fendered corner tires, spoiler on, body/livery intact, nothing clipping/floating.
- Per-wheel `WheelDef.radius` (stagger), tread-radius tire rule, `backFaceCulling=false` on lathe tires.
- Only the **car** is 1:10 — see `world-scale`.

## Verify
1. `npm run build` green.
2. **Screenshot** (`screenshot-game`): force the class with **`/?demo&class=latemodel`** (or `/?photo&class=latemodel` for a close-up) and confirm the wedge body, sails, spoiler, and fenders all read clean — at the full grid too.
3. **Handling**: step the sim and compare to the sprint — it should feel heavier, calmer, and grippier (less yaw per throttle). Read `vehicle.*` internals, not mesh transforms.
4. Ship via `commit-it`.
