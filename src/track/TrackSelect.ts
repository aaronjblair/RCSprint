/**
 * Track selection + the two stand-alone track defs (figure-8 + off-road).
 *
 * The start-screen track picker chooses between the 15-round CAREER oval, a
 * self-crossing FIGURE-8, and a jump-laden OFF-ROAD loop. The pick is persisted
 * with a `?track=` URL override — mirrors Mode.ts / CarClass.ts.
 *
 * Figure-8 and off-road are EXHIBITION tracks: a single stand-alone race (no
 * career points, no arcade run-state). Off-road runs in DAYLIGHT — the only
 * intentional exception to the game-wide night rule (see CLAUDE.md / main.ts).
 */
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { TrackDef } from "./TrackDef";

export type TrackChoice = "career" | "figure8" | "offroad";

const TRACK_KEY = "rcdirtoval.track";

export function isTrackChoice(v: string | null): v is TrackChoice {
  return v === "career" || v === "figure8" || v === "offroad";
}

export function loadTrackChoice(): TrackChoice {
  try {
    const v = localStorage.getItem(TRACK_KEY);
    if (isTrackChoice(v)) return v;
  } catch { /* ignore */ }
  return "career";
}

export function saveTrackChoice(t: TrackChoice): void {
  try { localStorage.setItem(TRACK_KEY, t); } catch { /* ignore */ }
}

/** `?track=career|figure8|offroad` override (null when absent/invalid). */
export function trackFromParam(param: string | null): TrackChoice | null {
  return isTrackChoice(param) ? param : null;
}

/** Self-crossing figure-8 — flat, wide, run at night under the lights. At-grade X = chaos. */
export const FIGURE8_DEF: TrackDef = {
  id: "figure8-crossroads",
  name: "Crossroads Figure-8",
  cornerRadius: 30,
  straightLength: 52,
  width: 11,
  banking: 0,
  baseGrip: 1.7,
  gripFalloff: 0.02,
  rutIntensity: 0.18,
  aiSkill: 0.62,
  fieldSize: 8,
  laps: 12,
  dirtColor: new Color3(0.42, 0.28, 0.18),
  difficulty: 6,
  night: true,
  backdrop: "plains",
  shape: "figure8",
};

/** Winding dirt loop with real jumps — runs in DAYLIGHT (the lone night-rule exception). */
export const OFFROAD_DEF: TrackDef = {
  id: "offroad-dustbowl",
  name: "Dustbowl Off-Road",
  cornerRadius: 34,
  straightLength: 48,
  width: 10,
  banking: 0,
  baseGrip: 1.62,
  gripFalloff: 0.015,
  rutIntensity: 0.3,
  aiSkill: 0.58,
  fieldSize: 8,
  laps: 6,
  dirtColor: new Color3(0.5, 0.36, 0.22),
  difficulty: 7,
  night: false, // DAYTIME — explicit, user-requested exception to the game-wide night rule
  backdrop: "badlands",
  shape: "offroad",
};

/** The stand-alone def for a non-career track choice (a fresh clone each call), or null for career. */
export function trackDefFor(choice: TrackChoice): TrackDef | null {
  if (choice === "figure8") return { ...FIGURE8_DEF, dirtColor: FIGURE8_DEF.dirtColor.clone() };
  if (choice === "offroad") return { ...OFFROAD_DEF, dirtColor: OFFROAD_DEF.dirtColor.clone() };
  return null;
}
