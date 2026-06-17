---
name: people-anatomy
description: Add or adjust the extremity anatomy (SHOES, HANDS, visible KNEES) on RCSprint's procedural human figures. Use when a figure looks like it's missing feet/hands, when limbs end flat, or when you're restyling marshals, the flag girl, or the lawnmower rider.
---

# People anatomy — shoes, hands, knees

RCSprint has THREE kinds of procedural human figures. Two share one builder; two are bespoke.

| File | Figures | Build path |
|------|---------|------------|
| `src/race/Marshals.ts` | 6 marshals + stand spectators | `buildPerson(scene, name, look, shadow)` (shared) |
| `src/race/FlagGirl.ts` | flag girl | bespoke meshes in the constructor |
| `src/race/LawnMower.ts` | seated rider | bespoke meshes in `buildLawnMower` |

## World scale — do NOT change overall height
Figures are built at SMALL native dims (feet at root y=0, 1u≈1ft) then the root is scaled
(`PEOPLE_SCALE=3.5` in Marshals, `3.0` flag girl, `3.3` lawnmower). Shoes/knees/hands are
SMALL additions in native units — they must NOT change the ~5.7u final height. Add only at the
existing extremities; don't extend the leg or arm length.

## buildPerson (Marshals.ts) — the rigged builder
The rig is articulated and ANIMATED by `animateGait` (rotates pivots about X). Anything parented
to a `knee` or `shoulder` pivot moves with the gait automatically — so attach to the PIVOTS, not
to the shin/arm meshes.

Per side (`sx = +1, -1`):
- **KNEE bump** — small sphere Ø≈0.15, parent = the `knee` TransformNode at local (0,0,0). Material = `pants` (matches the shin).
- **SHOE** — box ≈ 0.16 w × 0.10 h × 0.30 l, parent = the `knee` pivot at local y≈−0.40 (just below the shin bottom), nudged +z ≈ +0.06 so the toe points in the figure's facing. Material = a dark shoe colour (`look.pants.scale(0.5)`).
- **HAND** — sphere Ø≈0.11, parent = the `shoulder` pivot at local y≈−0.5 (the wrist). Material = `skin`.

Use the file's existing `dress(mesh, material, parentNode)` helper so the new meshes get
material + shadow caster/receiver wired like the limbs. Give unique names (`name+"_shoe"+sx`).
Knees/shoes on the `knee` pivot and hands on the `shoulder` pivot ⇒ they swing with the walk.

## Bespoke figures (FlagGirl / LawnMower) — STATIC is fine
No rig. Match THAT figure's proportions and material/scale conventions (its own native dims,
its own `add()` helper). Attach to whatever node the limb uses:
- **Flag girl** has a relaxed left arm + a `flagPivot`-parented right arm (animated wave). Put her
  right hand on the SAME node the right arm uses (`this.flagPivot`) so the hand sweeps with the
  wave; her left hand on the root. Knees mid-leg, shoes already exist as "boots" — add the knee
  bump; shoes are present. Hands at the wrist end of each arm.
- **Lawnmower rider** is seated with bent thighs/shins/arms (each has its own position+rotation).
  Add a shoe at the foot end of each shin, a hand at the wheel end of each arm, a knee bump at the
  thigh/shin joint — placed in that limb's local frame.

## Verify
`npx tsc --noEmit` (strict) must exit 0. Then screenshot (screenshot-game skill) and confirm feet
read as shoes, hands are present, knees show a joint — and that the marshal jog + flag wave still
animate the new parts.
