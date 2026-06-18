# RESUME — RC Dirt Oval

**Project:** RC Dirt Oval (local folder still `RCSprint` until the rename script runs) — a browser 3D **night** dirt-oval RC racing game (Babylon.js 7 + Havok + Vite + TypeScript).
**Branch:** `main` · **Date:** 2026-06-18
**Live (PWA, installable iOS/Android/Win/Mac):** https://aaronjblair.github.io/RC-Dirt-Oval/ ✅ 200
**Repo:** https://github.com/aaronjblair/RC-Dirt-Oval · **Releases:** v0.3.0 `.exe`

## Where we left off
Everything requested is shipped + live (v0.4.0, commit `23ef656`). The session ended with the user
approving **"Ship it"** on the late model.

## What shipped this session
- **Renamed** to RC Dirt Oval (repo + URL; storage keys migrated). RC Pro-Am overhead camera; arcade box
  pickups/letters/boost-strips removed (slicks kept).
- **Deferred backlog**: manual zoom (all views), realistic multi-axis rollovers, race-ends-one-lap-after-winner,
  start/finish ¾ down the stretch, driven-groove darkening, tailgate pickup trucks, doubled stand + banner +
  lit booth window, AI wing-top numbers + always-present red/white **#42**, high-revving combustion engine
  sound, V/M keycaps, "Created by Aaron Blair" splash.
- **Graphics overhaul** (render pipeline + procedural textures) + **geometry restyle** (cars/people/scenery/track).
- **v0.4.0**: **unified setup screen** (name + class + mode + sound + auto-throttle — all persisted &
  remembered, class/mode change reloads + autostarts); **pause menu** (Resume / Restart / Main Menu, honest
  race clock); **auto-throttle** (full throttle + steering-only, hides touch GAS/BRAKE; desktop + mobile);
  **dirt late model rebuilt** to a real 1:10 RC look (low wide full-bodied wedge, **full-width cab**, fenders
  the wheels tuck under, sail panels, high rear deck, wide raked spoiler, splitter; player white stripe +
  Super Jay hood/door logo); **pickup trucks full-scale + placement fixed** (were piling at world origin in
  the infield); **infield grass + sprayed Flora Vista logo restored**; docs synced + `start-and-pause` skill.

## Key decisions (why)
- **Full-width cab** on the late model is the user's explicit art direction (overrides the "real cars are
  narrow-cab" verifier).
- Late model shipped with a **slightly recessed rear-deck/"bed"** look — user said Ship it after the
  close-the-rear attempts didn't fully resolve it.
- Grass **reverted** to the original green-tinted-dirt + sprayed logo (the bright/solid green "looked fake").
- **Fable 5 unavailable** all session → work ran on Opus.

## Next steps (optional polish, if revisited)
1. Fully **close the late-model rear deck** (the recessed-bed well between the sail panels). Body is a
   `CreateRibbon` shell of `station(z, hw, topY)` profiles in `src/car/LateModel.ts`.
2. Rebuild the **v0.4.0 Windows `.exe`** Release (`npm run build:win`) if a fresh installer is wanted.
3. **Local folder rename** (still a user-run handoff): close Claude + dev server, run `scripts/rename-dirs.ps1`
   (renames the project + the Claude transcript/memory folder), then resume in the new path.

## Resume this exact session
`cd C:\Users\aaron\Claude\Projects\RCSprint ; claude --resume d51c30d6-4dbf-45c7-826e-671af8f90a4e`
(Only works on the machine holding the local transcript; this RESUME.md is the cross-machine handoff.)

## Build / deploy
`npm run build` green (strict TS); `deploy.yml` success; live URL 200.
