---
name: commit-it
description: Verify, document, and commit all work on RCSprint. Use when the user says "commit it", "commit everything", or wants the project checkpointed to GitHub. Builds clean, reconciles docs + CLAUDE.md with reality, removes stray files, then commits and pushes to origin/main.
---

# commit-it — verify, document, commit RCSprint

A disciplined checkpoint for this repo. Do **every** step in order. Don't skip the build or the doc reconciliation just because the code "looks done" — drift between docs and code is the recurring failure this skill exists to prevent.

## 0. Make git usable (Windows gotcha)
Git is installed but **not on PATH** in this environment. Prepend it once per shell before any git command:
```powershell
$env:Path = "C:\Program Files\Git\cmd;" + $env:Path
```
Use `git --no-pager ...` for log/diff so output doesn't block.

## 1. Verify the build is green (the only gate)
```powershell
npm run build
```
Must end in `✓ built in …` with no TypeScript errors. The native-command stderr noise (chunk-size warning wrapped by PowerShell) is **not** a failure — look for the `✓` line and absence of `error TS…`. If it fails, fix it before committing. Never commit a red build.

## 2. Survey what changed — add / update / remove
```powershell
git status --short
git status --porcelain --untracked-files=all   # catch untracked files
git ls-files | Where-Object { $_ -match '\.(png|jpe?g|zip)$' }   # catch stray tracked binaries
```
Decide for each:
- **Add** — new source/assets that belong in the repo.
- **Update** — modified tracked files.
- **Remove** — anything now excluded by `.gitignore` but still tracked (e.g. root `*.png`/`*.jpeg` verification screenshots committed before the ignore rule). Untrack with `git rm --cached <file>` (the local file stays; it's ignored going forward). Don't commit `node_modules/`, `dist/`, `RCSprint-web.zip`, `.playwright-mcp/`, or `.claude/*.lock`.

## 3. Reconcile ALL documentation with the code (do not skip)
For every code change in this batch, check whether these still describe reality and fix any drift:
- **README.md** — feature list, the **Code map** (esp. the one-line description per `src/**` file), controls, architecture notes.
- **CLAUDE.md** — "What this is", Architecture, and the per-file Scenery/Field/etc. mentions.
- **prompt.txt** — the build-from-scratch spec; keep its GAME SHAPE / RENDERING / CARS sections truthful to current behavior.

Common drift to grep for: renamed/removed scenery (e.g. grandstands → mountains), new mechanics (rollovers, groove bands), changed defaults. If a doc names a file/feature that no longer exists, fix it.

## 4. Bake new lessons into CLAUDE.md so mistakes don't recur
If this batch revealed a trap that cost time, add a one-line entry to the **Gotchas** (or **Windows / PowerShell**) section of CLAUDE.md — concrete and actionable. Examples already learned:
- Git is at `C:\Program Files\Git\cmd\git.exe`, not on PATH — prepend it.
- Wheel/tire geometry: no sidewall/shoulder mesh may exceed the tread radius (the torus-bulge mistake); revolve the carcass with a lathe and set the tire material `backFaceCulling = false`.

## 5. Commit and push
```powershell
git add -A
git status --short            # confirm the staged set is what you intend
git commit -m "<concise, specific summary of this batch>"
git --no-pager log --oneline -3
git push origin main
```
Commit message: imperative, specific, one line of what changed (e.g. `Real Hoosier tires + mountain backdrop + doc sync`). Group the whole batch into one commit unless the user asked otherwise.

## 6. Report
Tell the user: build status, what was added/updated/removed, which docs were synced, the commit hash + message, and that it's pushed to `origin/main`. If the push needs auth or fails, surface the exact error — don't claim success.

## Guardrails
- Never `--no-verify`, never force-push, never skip the build.
- If `git push` would overwrite remote work, stop and report rather than forcing.
- Picture-perfect rule still applies: if this batch touched `Car.ts`, `RaycastVehicle.placeWheels`, or spawning, the change should already be screenshot-verified before this skill runs.
