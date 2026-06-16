---
name: world-scale
description: Trigger any time you add or resize a person/figure/prop/building in RCSprint, or when something looks the wrong size next to the cars.
---

# world-scale — keep people & buildings full-size next to 1:10 cars

## The rule (read this first)
**ONLY the cars and the track are 1:10 scale.** EVERYTHING else is FULL real-world size:
corner/track marshals, the flag girl, drivers'-stand spectators, the lawnmower rider, the
drivers' stand, the timing booth/shack, and **any** future person, prop, or building. A person
should read about **2× a car's height** and tower over the toy cars. If a figure looks
doll-sized next to a sprinter, it's scaled wrong.

## Working metric
**1 game unit ≈ 1 foot.** Size to real-world feet, then use that number 1:1 as units.

| Thing                       | Target size                          |
|-----------------------------|--------------------------------------|
| Standing adult              | **≈ 5.7u** tall                      |
| Drivers'-stand deck height  | **≈ 5u** (5 ft)                      |
| Timing shack / booth        | **≈ 9u** tall                        |
| A 1:10 car                  | ~2.5u long / ~2.5u tall to the wing  |

## How to apply (scale the ROOT, anchored at the feet)
Procedural figures are built **~1.6u "native"**. Don't rebuild — scale the figure's root
`TransformNode`, whose origin must sit at **y = 0 (the feet)** so the feet stay grounded:

```ts
const NATIVE_H = 1.6;
const scale = targetHeight / NATIVE_H;   // ~5.7 / 1.6 ≈ 3.5×
root.scaling.setAll(scale);              // feet at y=0 → stays on the ground
```

- **Standing people** (marshals, spectators): ~3.5× → ≈5.7u.
- **Seated** (lawnmower rider) / **podium** (flag girl) figures: scale the **whole assembly** so
  the *person* lands near target height; the seat/podium rides along.

## Where the knobs live
- `src/race/Marshals.ts` — `PEOPLE_SCALE` const drives the track marshals.
- `src/race/FlagGirl.ts` and `src/race/LawnMower.ts` — `root.scaling.setAll(...)`.
- `src/track/Scenery.ts` — `buildSpectator` takes a scale param; the booth/shack has its own root scale.
- **The drivers'-stand FRAME stays native ~5u — do NOT scale it up.** Only its spectators scale.

## Verify (don't eyeball from the bowl-pitched cameras)
Probe the scene deterministically via `mcp__playwright__browser_evaluate` against
`window.__field.cars[0].root.getScene()`:

```js
const fig = scene.getTransformNodeByName('flagGirl'); // or a marshal / spectator root
let lo = Infinity, hi = -Infinity;
for (const m of fig.getChildMeshes()) {
  m.computeWorldMatrix(true);
  const b = m.getBoundingInfo().boundingBox;
  lo = Math.min(lo, b.minimumWorld.y); hi = Math.max(hi, b.maximumWorld.y);
}
({ heightU: hi - lo, feetY: lo });   // expect heightU ≈ 5.7, feetY ≈ 0
```

Confirm **height ≈ 5.7u** and **feet at y ≈ 0**, then screenshot it beside a car (see the
**screenshot-game** skill) — it should clearly tower over the toy. Build gate:
`npx tsc --noEmit` then `npm run build` must be green.
