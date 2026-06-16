---
name: verify-goals
description: Use when the user gives visual/behavioral goals and wants them confirmed met (and looped until they are), or asks to "verify my goals." A build→probe→screenshot→fix loop.
---

# verify-goals — loop until every goal is objectively met

Don't declare a goal done off a description or a single glance. Drive a loop: **build → probe →
screenshot → compare → fix → repeat**, until each goal passes an objective check. Pause and ask
the user before guessing on anything ambiguous.

## 1. Write the goal checklist
List the user's goals as individually checkable items, each with a concrete pass test
(a number, a boolean, a named mesh, an observed behavior). Keep it visible; tick items off only
when their test passes. (Mirror it as a TaskCreate list for a progress bar.)

## 2. Build gate
`npm run build` must be green (strict tsc). The native-stderr chunk-size warning is **not** a
failure — look for `✓ built in` and the absence of `error TS`. Never proceed on a red build.

## 3. Probe deterministically (numbers, not vibes)
Start the dev server, then `mcp__playwright__browser_evaluate` on
`window.__field.cars[0].root.getScene()` (also `window.__track / __race / __marshals`). Read hard
facts, e.g.:
- **Figure scale** — child-mesh world bounding-box height ≈ 5.7u, feet y ≈ 0 (see **world-scale**).
- **Night** — `window.__track.def.night === true`; `scene.getMeshByName('starDome')` / `'moon'` exist.
- **Placement / counts** — booth on the expected side; marshal-body count in 6–8.
- **Behavior** — force a state and confirm the response (e.g. set a car's velocity to ~0, step
  the sim, confirm a marshal repositions it onto the racing line within a few seconds).

## 4. Screenshot
Real-GPU headless Chrome of the dev server (see **screenshot-game**): `?demo` for the
driver-stand POV, `/?round=N` for the attract wide. For the night sky / backdrops use the
**freeze-and-aim** trick (see **night-sky**) — the bowl cameras pitch down past the sky. Read the
PNG and actually look.

## 5. Compare & loop
Walk the checklist against the probe + screenshots. Any item that fails → fix the code, rebuild,
re-probe, re-shoot. Cap the iterations; if something stays red, stop and report exactly what
remains and why, rather than looping forever.

## 6. Pause & ask on assumptions
If a goal is ambiguous (a size target, a placement, whether a behavior applies to the player's
car), use **AskUserQuestion** — don't guess. One good question now beats three wrong iterations.

## 7. Done
When every checklist item passes its objective test, hand off to the **commit-it** skill
(build → doc sync → commit → push → watch the Pages deploy → confirm live 200).
