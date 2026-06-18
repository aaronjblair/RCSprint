# start-and-pause — the unified setup screen, pause menu, and auto-throttle

The pre-race flow and the in-race pause menu live in `src/ui/Screens.ts` + `src/main.ts` + `index.html`.
All player choices persist (`localStorage["rcdirtoval.*"]`) and pre-fill on next launch.

## Unified setup screen (`Screens.setup`)
ONE start card sets everything, then START — it replaced the old `classSelect → modeSelect → preRace →
namePrompt` chain (those methods still exist but are unused; don't re-add the chain).
- Fields: **driver name** (`titleCaseName`/`savePlayerName`), **car class** (Sprint/Late Model),
  **game mode** (Career/Arcade), **sound on/off** (`motor.setMuted`), **auto-throttle**.
- `onStart(sel)` (in `main.ts`): saves name + sound + auto-throttle live; if `sel.classId`/`sel.mode`
  changed from the booted values it `saveCarClass`/`saveMode`, sets
  `sessionStorage["rcdirtoval.autostart"]="1"`, and `location.reload()` (the field/career/arcade rebuild
  at boot). On boot, if `autostart` is set, `main.ts` skips the setup screen and calls `launchRace()`
  straight away (clearing the flag). If class+mode are unchanged it just calls `launchRace()`.
- `launchRace()` runs `Screens.arcadeLightTree` (the drag-strip light tree) → green → `race.start`.

## Auto-throttle
- Persisted in `localStorage["rcdirtoval.autothrottle"]`; loaded in `main.ts` into `let autoThrottle`.
- When ON: in the racing loop `main.ts` overrides `drive.throttle = 1; drive.brake = 0` after
  `input.sample()` — full throttle, the ONLY input is steering. Desktop + mobile.
- `input.setAutoThrottle(on)` (`Input.ts`) hides/shows the touch **GAS/BRAKE** buttons (it stores the
  button refs `gasBtn`/`brakeBtn` captured from `mkBtn`). Call it at boot and from `onStart`.

## Pause menu (`Screens.pauseMenu`)
- **P** key / the `#pause` ⏸ HUD button → `togglePause`/`setPaused(b)` in `main.ts`.
- Paused: the racing block is gated (`state === "racing" && !paused`), so sim + `race.update` + marshals
  + `motor` all freeze; the scene keeps drawing. `motor.setPaused(true)` ramps engine sound to silence.
- Honest clock: `pausedAccum` accumulates paused time; `race.update(performance.now() - pausedAccum)` and
  the HUD lap clock subtract it, so lap times aren't inflated by paused time.
- `Screens.pauseMenu({ onResume, onRestart, onMenu })`:
  - **Resume** → `setPaused(false)` (removes the menu in place).
  - **Restart** → set the `autostart` flag + `location.reload()` (fresh race, same settings).
  - **Main Menu** → `location.reload()` → lands on `Screens.setup` (career progress kept; Reset Career
    still lives on the results screen).

## Verify
Build green. Open the menu: set name/class/mode/sound/auto-throttle, START → light tree → race. Toggle
class/mode and confirm it reloads + autostarts. In a race press **P**: physics + clock + sound freeze,
the menu shows; Resume continues, Restart re-grids, Main Menu returns to setup. With auto-throttle on,
the car drives full-throttle and only steering responds (touch GAS/BRAKE hidden). Re-open the app and
confirm every setting pre-filled.
