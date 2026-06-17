---
name: late-car-model
description: Trigger when building, restyling, or tuning the DIRT/IMCA LATE MODEL class in RCSprint (src/car/LateModel.ts, LATE_MODEL_CONFIG) — bodywork, livery, tires, or how it handles.
---

# late-car-model — the dirt/IMCA late model (low enclosed wedge)

The second car class — the **visual and dynamic opposite of the winged sprinter**. Built by `createLateModel` in **`src/car/LateModel.ts`**; physics baseline is **`LATE_MODEL_CONFIG`** (top of that file). Selected on the start screen (`Screens.classSelect`); each class keeps an independent career. Sibling: the **`sprint-car-model`** skill.

## ⚠️ THE rule (this is what kept failing — read first)
A dirt/IMCA late model is a **LOW, ENCLOSED, WEDGE COUPE**. It is **NOT** a pickup truck and **NOT** an open-top roadster/bathtub. Two failure modes to avoid, both confirmed by review:
- **"Pickup"** — the greenhouse is too tall/upright on a tall slab body. Fix: rake everything and lower the body (low nose, low deck).
- **"Open roadster / tub"** — the cabin isn't clearly enclosed, so the dark windshield reads as an open cockpit hole. Fix: build a **solid body-color cabin shell** with **dark-glass** windshield/side/back windows, and make the **roof the HIGH POINT** of the car.

The silhouette is ONE continuous descending wedge: **very low pointed nose (near the ground) → long rising hood → steeply raked windshield → an ENCLOSED body-color roof/cabin set BACK (the high point) → big sail panels sweeping down to a LOW rear deck → a wide spoiler that sits BELOW the roofline.** The body is **wide** and fills out to the tires so the fenders are flares off a wide body, not rings on a narrow one.

## Real-world spec (IMCA Late Model rules — build to these proportions)
- **Wheelbase ~103–105"**, body **~78" wide** (≈0.76× wheelbase) — wide and low.
- **Max deck height 39"**, **max roof rake 14°** front-to-rear (nearly flat) — the roof is low and barely raked, but it is still the highest point.
- **Rear spoiler ≤ 72" wide, ≤ 8" tall**, on triangular side boards.
- Opera-window side panels; roof/side panels run to the body edge; ~2300–2350 lb, ~430 ci V8.
- Sources: IMCA 2023/2024 Late Model rules (imca.com); DIRTcar Late Model rules.

## Bodywork construction (`createLateModel`, under the invisible `chassis` box)
- **Wide low body** (`lmlower` ≈ 0.76× wheelbase) so it meets the tires; floor pan; numbered-roundel door livery (`lateLiveryDraw`) or hero logo.
- **Long low pointed nose** — a low air dam + a forward sphere `noseTip` scaled low/wide so it nearly scrapes the ground; a long sloped hood up to the cowl.
- **ENCLOSED cabin** — a solid body-color shell (`lmcabin`) + a body-color **roof** panel (the HIGH POINT, `roofDraw` number on top), a steeply-raked **dark-glass** windshield = the cabin front, dark-glass **side/back windows**. Recline the driver LOW so only the helmet shows through the glass.
- **Big sail panels** (right taller) sweeping from the roof rear down to the low deck.
- **Rear deck low** + **wide spoiler** on triangular side boards, sitting **below** the roofline.
- **Fender flares** (`buildFender`, scaled wide) hugging all four tires off the wide body. Round hard box edges with the `edgeR` beveler. Mild stagger (RR biggest).

## Handling config (`LATE_MODEL_CONFIG` vs sprint) — `mass` is cosmetic; feel comes from these
| Knob | Late model | Sprint | Effect |
|---|---|---|---|
| `tireGrip` | `2.0` | 1.7 | more mechanical grip — carries speed |
| `downforce` | `0.0` | 0.015 | no wing — grip is mechanical, not aero |
| `corneringStiffness` | `10.5` | 9 | planted, less drift |
| `slipSteer` | `0.42` | 0.6 | far less tail-happy |
| `throttleSteer` | `0.009` | 0.015 | softer dirt power-steer |
| `engineForce` | `15` | 17 | less violent (heavier, less power/weight) |
| `maxSteer`/`steerSpeedFalloff` | `0.5`/`0.06` | 0.55/0.05 | slower, calmer turn-in |
Garage sliders scale around this baseline via `applySetup(cfg, setup, LATE_MODEL_CONFIG)` — tune the baseline.

## Verify (REQUIRED: clean sub-agents — the body is judged on look)
1. `npm run build` green; commit each pass.
2. **Screenshot** front + rear + grid (`screenshot-game`): `/?demo&class=latemodel&photo&day` (and `&photofront` for the nose; `&day` only for shape clarity — the game ships at **night**). The sprint car (`Car.ts`) must stay untouched.
3. **Spawn 2–3 fresh general-purpose sub-agents**, each given the reference photo + a screenshot, asking ONE thing: *does it read as a LOW ENCLOSED late-model coupe — not a pickup, not an open roadster?* Iterate until they pass.
4. Ship via `commit-it` (push → deploy → live 200). Only the **car** is 1:10 — see `world-scale`.
