# rename-dirs.ps1 — finish the RC Dirt Oval rename by renaming the LOCAL folders.
#
# WHY THIS IS A SEPARATE SCRIPT: Windows will not let you rename a directory that a
# running process holds as its working directory. The Claude Code session AND the Vite
# dev server both sit inside the project folder, so the rename can only happen once both
# are closed. Everything else (GitHub repo rename, remote, docs, deploy) is already done.
#
# RUN ORDER:
#   1. Close Claude Code completely.
#   2. Stop the Vite dev server (the `npm run dev` window), if running.
#   3. In a NEW PowerShell window, run:  powershell -ExecutionPolicy Bypass -File <path>\rename-dirs.ps1
#   4. Follow the printed resume command.
#
# SAFETY NET: full backups already exist at C:\Users\aaron\Claude\Backups\
#   - RC-Dirt-Oval-backup-2026-06-17.zip            (the whole project)
#   - claude-session-memory-backup-2026-06-17.zip   (this session's transcript + memory)

$ErrorActionPreference = 'Stop'

$projParent = 'C:\Users\aaron\Claude\Projects'
$oldProj    = Join-Path $projParent 'RCSprint'
$newProj    = Join-Path $projParent 'RC-Dirt-Oval'

$projects   = Join-Path $env:USERPROFILE '.claude\projects'
$oldEnc     = Join-Path $projects 'C--Users-aaron-Claude-Projects-RCSprint'
$newEncName = 'C--Users-aaron-Claude-Projects-RC-Dirt-Oval'   # = the NEW cwd, path-encoded ( : \ / -> - )
$newEnc     = Join-Path $projects $newEncName

$sessionId  = 'd51c30d6-4dbf-45c7-826e-671af8f90a4e'           # THIS Claude session

function Fail($m) { Write-Host "ABORT: $m" -ForegroundColor Red; exit 1 }

# --- Pre-flight: never half-rename ---
if (-not (Test-Path $oldProj)) { Fail "project folder not found: $oldProj (already renamed?)" }
if (Test-Path $newProj)        { Fail "target already exists: $newProj — move/remove it first" }
if ((Test-Path $oldEnc) -and (Test-Path $newEnc)) { Fail "target already exists: $newEnc" }

# --- 1) Rename the project folder (fails cleanly if a process still locks it) ---
try { Rename-Item -LiteralPath $oldProj -NewName 'RC-Dirt-Oval' -ErrorAction Stop }
catch { Fail "could not rename the project folder — is Claude Code or the dev server still running? `n  $_" }
Write-Host "[OK] Renamed project folder  ->  $newProj" -ForegroundColor Green

# --- 2) Rename the Claude transcript/memory folder so --resume finds this session under the new cwd ---
# Claude Code locates a session at  ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl , where the cwd
# is encoded by replacing : \ /  with  - . The new cwd encodes to $newEncName, so the folder MUST match.
if (Test-Path $oldEnc) {
  try {
    Rename-Item -LiteralPath $oldEnc -NewName $newEncName -ErrorAction Stop
    Write-Host "[OK] Renamed Claude session/memory folder  ->  $newEnc" -ForegroundColor Green
  } catch {
    Write-Host "[WARN] Project folder is renamed, but the Claude session folder could not be renamed:" -ForegroundColor Yellow
    Write-Host "       $_" -ForegroundColor Yellow
    Write-Host "       Resume may start a fresh session. Restore claude-session-memory-backup-2026-06-17.zip if needed." -ForegroundColor Yellow
  }
} else {
  Write-Host "[WARN] Claude session folder not found at $oldEnc (already moved?)." -ForegroundColor Yellow
}

# Note: the per-project entry in ~/.claude.json is keyed by the old path; Claude Code will simply create a
# fresh entry for the new path on first launch (you may re-approve permissions once). We intentionally do
# NOT rewrite ~/.claude.json here — corrupting that global file would be worse than re-granting a permission.

Write-Host ""
Write-Host "DONE. Resume this exact session from the new folder:" -ForegroundColor Cyan
Write-Host "  cd `"$newProj`"" -ForegroundColor White
Write-Host "  claude --resume $sessionId" -ForegroundColor White
