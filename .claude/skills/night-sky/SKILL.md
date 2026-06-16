---
name: night-sky
description: Use when adjusting RCSprint's night lighting, the crescent moon, the stars, the lamp towers, or when the night sky looks wrong or empty.
---

# night-sky — lamps, crescent moon & stars at night

## Turning night on
Night is per-track via `TrackDef.night` (career night rounds 8/12/15), but `src/main.ts`
currently **forces the whole game to night** with `def.night = true;` right after the round is
picked. Remove that one line to restore the day/night calendar. `main.ts` also dims the sun
(~0.25) and ambient (~0.14) at night so the lit towers carry the scene.

## What `setupEnvironment(scene, camera, night=true)` does (`src/core/Environment.ts`)
- Dark `SkyMaterial` dome (sun below horizon), cool dark **EXP2 fog**, low IBL (~0.12),
  near-black `clearColor`.
- Calls **`addNightSky(scene)`** for the moon + stars.

## `addNightSky` — the moon and stars
- **Star dome** — a large inward-facing sphere (~1200 diameter) with an emissive
  `DynamicTexture` of ~900 random white dots. It MUST have: `hasAlpha` + `useAlphaFromDiffuseTexture`
  (so gaps show sky), `emissiveColor` **> 1** (so bloom catches the stars), `backFaceCulling = false`
  (seen from inside), and crucially **`mesh.applyFog = false`** (fog would erase it).
- **Crescent moon** — a billboarded plane (`billboardMode = BILLBOARDMODE_ALL`). Draw a filled
  pale disc on a `DynamicTexture`, then `ctx.globalCompositeOperation = 'destination-out'` and
  fill an **offset** circle to carve the crescent. Emissive, `applyFog = false`, positioned **UP
  among the stars** — NOT near the horizon, where the backdrop occludes it.

## Lamps
`src/track/Scenery.ts` `towerAt()` builds light towers whose `PointLight`s are **intensity 420 at
night / 0 by day**. Six towers ring the track (4 corners + 2 mid-straight).

## Verify (the key gotcha)
The driver-stand and attract cameras **pitch DOWN into the bowl**, so the moon and stars sit
**above the frame** in normal/headless shots (same reason backdrops barely show). Don't conclude
"it's not rendering" from a `?demo` shot. Instead **freeze the scene and aim a camera at the sky**
in a Playwright page, then screenshot:

```js
scene.onBeforeRenderObservable.clear();           // stop the loop resetting the camera
const cam = scene.getCameraByName('aerial');
const moon = scene.getMeshByName('moon');
cam.position.set(40, 22, 90);
cam.setTarget(moon.position.clone());
scene.activeCamera = cam;
scene.render();
```

Then `mcp__playwright__browser_take_screenshot`. Camera `maxZ` must exceed the star-dome radius
(the aerial cam's 6000 is fine). For the lamps + overall night look, the attract wide shots
(`/?round=N`) read fine — see the **screenshot-game** skill.
