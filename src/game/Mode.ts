/**
 * Game mode + arcade run-state persistence.
 *
 * RCSprint can run as the 15-round CAREER or as an ARCADE (RC Pro-Am style)
 * pickup-chasing run. The pick is persisted, with a `?mode=` URL override.
 * Mirrors the style of CarClass's load/save helpers.
 */

export type GameMode = "career" | "arcade";

const MODE_KEY = "rcsprint.mode";
const ARCADE_KEY = "rcsprint.arcade";

export function isGameMode(v: string | null): v is GameMode {
  return v === "career" || v === "arcade";
}

export function loadMode(): GameMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (isGameMode(v)) return v;
  } catch { /* ignore */ }
  return "career";
}

export function saveMode(m: GameMode): void {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
}

/** `?mode=career|arcade` override (returns null when absent/invalid). */
export function modeFromParam(param: string | null): GameMode | null {
  return isGameMode(param) ? param : null;
}

/** Persistent state of an arcade run: which round, remaining continues, total score. */
export interface ArcadeRun {
  round: number;
  continues: number;
  score: number;
}

function defaultRun(): ArcadeRun {
  return { round: 0, continues: 3, score: 0 };
}

export function loadArcadeRun(): ArcadeRun {
  try {
    const raw = localStorage.getItem(ARCADE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ArcadeRun>;
      const d = defaultRun();
      return {
        round: typeof p.round === "number" && isFinite(p.round) ? p.round : d.round,
        continues: typeof p.continues === "number" && isFinite(p.continues) ? p.continues : d.continues,
        score: typeof p.score === "number" && isFinite(p.score) ? p.score : d.score,
      };
    }
  } catch { /* ignore */ }
  return defaultRun();
}

export function saveArcadeRun(r: ArcadeRun): void {
  try { localStorage.setItem(ARCADE_KEY, JSON.stringify(r)); } catch { /* ignore */ }
}

export function resetArcadeRun(): ArcadeRun {
  const d = defaultRun();
  saveArcadeRun(d);
  return d;
}
