---
name: adaptive-quality
description: Adaptive graphics quality — auto-scale RCSprint's render detail to hold ~60 FPS, climbing to max detail when the GPU has headroom. Use when touching the quality ladder, the FPS controller, or the Environment post-FX knobs it drives.
---

# Adaptive graphics quality

RCSprint auto-scales render detail every frame to hold ~60 FPS and climbs back up
when the GPU has headroom. One controller (`QualityManager`) owns a small tier
ladder and flips the runtime-mutable post-FX knobs + hardware scaling.

## Files (own only these)
- `src/core/QualityManager.ts` — the controller + tier ladder (NEW).
- `src/core/Environment.ts` — exposes the handles the controller mutates.
- `src/main.ts` — constructs the controller and ticks it each frame.

## Tier ladder (index 0..4)
Each tier = `{ scaleMul, msaa, ssaoSamples, bloom, sharpen }`. `scaleMul`
multiplies the *base* hardware-scaling level (so the mobile lighter base is
preserved — tiers stack on top of it).

| # | name  | scaleMul | msaa | ssaoSamples | bloom | sharpen |
|---|-------|----------|------|-------------|-------|---------|
| 0 | Min   | 1.5      | 1    | 4           | off   | off     |
| 1 | Low   | 1.25     | 1    | 6           | on    | off     |
| 2 | Med   | 1.0      | 2    | 8           | on    | off     |
| 3 | High  | 1.0      | 4    | 12          | on    | on      |
| 4 | Ultra | 1.0      | 8    | 16          | on    | on      |

`scaleMul > 1` means render at LOWER internal resolution (cheaper). MSAA/SSAO/bloom
match Environment's static `highQuality` initial values at the top tiers.

## Controller
- `new QualityManager(engine, pipeline, ssao, startTier)` — captures the base
  hardware-scaling level and `apply(startTier)`. Desktop starts at **High (3)**,
  phones (`coarsePointer`) at **Low (1)**.
- `apply(tier)` clamps 0..4 and sets `engine.setHardwareScalingLevel(base*scaleMul)`,
  `pipeline.samples`, `ssao.samples` (if present), `pipeline.bloomEnabled`,
  `pipeline.sharpenEnabled`.
- `update(dtMs, fpsOverride?)` — called EVERY frame from
  `scene.onBeforeRenderObservable` (not gated by race state). Samples FPS every
  0.5s; needs **1.0s sustained < 50 FPS** to step DOWN one tier, **3.0s sustained
  > 58 FPS** to step UP; a **2s cooldown** prevents oscillation.
- `setTier(n)` / `get tier` / `max` — test + override hooks.

## Hooks the controller mutates (Environment runtime-mutable knobs)
`pipeline.samples`, `pipeline.bloomEnabled`, `pipeline.sharpenEnabled`,
`ssao.samples`, and `engine.setHardwareScalingLevel(n)`. NOT runtime-mutable:
the shadow-map size — never touch it.

## Wiring
- `Environment.setupEnvironment` returns `{ pipeline, ssao }` (ssao may be `null`
  if the SSAO2 try/catch failed on a weak GPU).
- `main.ts` after `setupEnvironment`:
  `const quality = new QualityManager(engine, env.pipeline, env.ssao, coarsePointer ? 1 : 3);`
  then in the per-frame callback: `quality.update(engine.getDeltaTime());`

## Verify
- `npx tsc --noEmit` must exit 0 (strict: no unused locals/params).
- In-browser test handle: `window.__quality` = `{ tier, max, setTier(n), update(ms,fps?) }`.
  Drive it deterministically by feeding a fake FPS:
  `for (let i=0;i<10;i++) __quality.update(500, 30)` should ratchet the tier down;
  feeding `update(500, 60)` long enough ratchets it back up (respecting cooldown).
