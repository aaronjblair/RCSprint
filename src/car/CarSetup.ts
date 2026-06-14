import type { VehicleConfig } from "../physics/RaycastVehicle";
import { DEFAULT_CONFIG } from "../physics/RaycastVehicle";

/** Player-tunable setup, all normalized 0..1. */
export interface CarSetup {
  gearing: number; // 0 accel / low top  ->  1 top speed
  wing: number; // 0 low downforce/drag -> 1 high
  tire: number; // 0 soft (grip, wears fast) -> 1 hard (less grip, durable)
  camber: number; // 0 stable -> 1 sharp turn-in
  bias: number; // 0 front weight -> 1 rear weight
}

export const DEFAULT_SETUP: CarSetup = { gearing: 0.5, wing: 0.5, tire: 0.35, camber: 0.5, bias: 0.55 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Apply a setup to a vehicle config; returns the tire wear rate it implies. */
export function applySetup(cfg: VehicleConfig, s: CarSetup): number {
  const b = DEFAULT_CONFIG;
  cfg.engineForce = b.engineForce * lerp(1.12, 0.92, s.gearing);
  cfg.rollResist = b.rollResist * lerp(1.25, 0.72, s.gearing) * (1 + s.wing * 0.45);
  cfg.downforce = lerp(0.004, 0.03, s.wing);
  cfg.tireGrip = lerp(1.95, 1.5, s.tire);
  cfg.corneringStiffness = b.corneringStiffness * lerp(0.88, 1.18, s.camber);
  cfg.maxSteer = b.maxSteer * lerp(0.92, 1.08, s.camber);
  // softer tires wear faster
  return lerp(0.00011, 0.00004, s.tire);
}

export function loadSetup(): CarSetup {
  try {
    const raw = localStorage.getItem("rcsprint.setup");
    if (raw) return { ...DEFAULT_SETUP, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETUP };
}

export function saveSetup(s: CarSetup) {
  try { localStorage.setItem("rcsprint.setup", JSON.stringify(s)); } catch { /* ignore */ }
}
