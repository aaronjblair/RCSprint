# RESUME — RC Dirt Oval

**Project:** RC Dirt Oval (local folder `RCSprint`) — a browser 3D **night** dirt-oval RC racing game (Babylon.js 7 + Havok + Vite + TypeScript).
**Branch:** `main` · **Date:** 2026-06-18
**Live (PWA, installable iOS/Android/Win/Mac):** https://aaronjblair.github.io/RC-Dirt-Oval/
**Repo:** https://github.com/aaronjblair/RC-Dirt-Oval · **Releases:** Windows `.exe` as a GitHub Release asset

## Where we left off
Shipped a large feature batch (below), all verified by a 3-model agent review (Haiku/Sonnet/Opus — all PASS, no oval regressions) and built green. **First thing next:** any tuning the user wants on the new buggy/tracks (e.g. buggy in-car eye, off-road ramp heights, figure-8 size), then the rebuild ritual for fresh executables.

## What shipped this batch
- **Touch controls swapped** — steering bar bottom-RIGHT (stretched wide), GAS/BRAKE bottom-LEFT, zoom ± on the right edge; lower-left status box hidden on touch (`src/core/Input.ts`, `index.html`).
- **Post-race replay** — `src/replay/Replay.ts` `RaceRecorder` records every car's pose each physics step; a `"replay"` flow plays it back under the cinematic cam with a scrub/play/speed/camera bar (`Screens.replayControls`); **Watch Replay** button on every results screen.
- **Mid-race menu** — pause menu relabeled **Resume / Restart / Quit to Menu** (+ sound toggle); the race stays frozen so Resume restores it exactly.
- **Figure-8 track** — self-crossing lemniscate with an at-grade X; `OvalTrack.projectNear()` windowed projection + per-car `lastS` keeps cars on their own leg (probe: 0 leg-snaps).
- **Off-road track with REAL jumps, in DAYLIGHT** — winding loop with ramp crests; `RaycastVehicle` converts ramp climb-rate into a real `vUp` launch (probe: cars airborne to y≈3.85). `OFFROAD_DEF.night=false` is the one night-rule exception; `main.ts` forces `def.night = def.shape!=="offroad" && !?day`.
- **Pluggable centerlines** — `src/track/centerlines.ts` `makeCenterline(def)` by `TrackDef.shape` (oval verbatim / figure8 / offroad). `OvalTrack` delegates + guards oval-only decoration. Oval is byte-identical (verified).
- **Track picker** on the setup screen (`src/track/TrackSelect.ts`, persisted, `?track=`). Figure-8/off-road are exhibition (no career/arcade writes).
- **1:10 RC Buggy** — full 3rd class with its own career (`src/car/Buggy.ts`, `CarClass.ts`, `Career.ts`); knobby open wheels, four angled coilover shocks, big rear wing, cab-forward Lexan shell; per-class cockpit eye (`BUGGY_COCKPIT`).
- **Career grid = previous finish order** — `career.lastRaceOrder` (identity indices) seeds the next grid (winner on pole); identity (colour/number/name) preserved, `cars[0]` stays the player.
- **Sound fix + menu toggles** — `MotorSound.resume()` starts oscillators only after the context resumes; ~1.7× louder; `enable()`; gesture handlers resume on every pointer/key; **SOUND ON/OFF in setup, pause, and results**.
- **Easter egg** — driver name "Greg Cumberworth" → "Greg Bad-Driver" (`Career.titleCaseName`).

## Key decisions (why)
- **Shape-field + pluggable centerline, NOT subclasses** — minimal change, keeps the oval byte-identical and strict-TS clean.
- **projectNear windowed search** — at the figure-8 X the two legs are spatially coincident; brute-force nearest snaps to the wrong leg, so we search a ±60-sample window around the car's last `s`.
- **Jumps reuse the existing airborne/gravity integrator** (no Havok body) — flat tracks → climbRate 0 → identical to before.
- **Off-road daytime is a deliberate, user-requested exception** to the game-wide night rule.
- **Grid seed keyed on identity index** (not name) so a mid-season rename can't misplace a driver.

## Build / deploy
`npm run build` green (strict TS + vite). Pushed to `main` (auto-deploys to GitHub Pages). Windows `.exe` via `npm run build:win` → GitHub Release asset.

## Resume this exact session
The exact `claude --resume <sessionId>` command is in `~/.claude/session-logs/last-session.json`
(`resumeCommand`). It only works on the machine holding the local transcript; this RESUME.md is the
cross-machine handoff.
