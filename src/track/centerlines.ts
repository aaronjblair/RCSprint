import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TrackDef, TrackShape } from "./TrackDef";

/**
 * One sample of a track centerline: world position (y carries ELEVATION for the
 * off-road jumps), unit travel tangent, a unit horizontal "outward" normal (the
 * +lateral / outer-wall side), and surface bank.
 */
export interface CenterSample {
  pos: Vector3;
  tangent: Vector3;
  outward: Vector3;
  bank: number;
}

/** A pluggable centerline: total arc length, the painted start/finish s, and a walker. */
export interface Centerline {
  length: number;
  startFinishS: number;
  pointAt(s: number): CenterSample;
}

/** Right-hand horizontal perpendicular of a tangent — matches the oval's old `outward`
 *  (front straight tangent +z → outward +x). Keeps banking/wall sign conventions intact. */
function outwardOf(tx: number, tz: number): Vector3 {
  return new Vector3(tz, 0, -tx);
}

/**
 * The original banked-oval walker, lifted VERBATIM from OvalTrack.pointAt so the
 * oval stays byte-for-byte identical. Stadium shape: two straights + two 180° turns,
 * counter-clockwise. `bank` is def.banking inside the turns, 0 on the straights
 * (OvalTrack still smooths the bank across entry/exit afterwards).
 */
function ovalCenterline(def: TrackDef): Centerline {
  const R = def.cornerRadius;
  const L = def.straightLength;
  const half = L / 2;
  const turn = Math.PI * R;
  const length = 2 * L + 2 * Math.PI * R;
  return {
    length,
    startFinishS: 0.7 * (length / 2),
    pointAt(s: number): CenterSample {
      let pos: Vector3, tangent: Vector3, outward: Vector3, inTurn = false;
      if (s < half) {
        pos = new Vector3(R, 0, s);
        tangent = new Vector3(0, 0, 1);
        outward = new Vector3(1, 0, 0);
      } else if (s < half + turn) {
        const t = (s - half) / R;
        pos = new Vector3(R * Math.cos(t), 0, half + R * Math.sin(t));
        tangent = new Vector3(-Math.sin(t), 0, Math.cos(t));
        outward = new Vector3(Math.cos(t), 0, Math.sin(t));
        inTurn = true;
      } else if (s < half + turn + L) {
        const d = s - (half + turn);
        pos = new Vector3(-R, 0, half - d);
        tangent = new Vector3(0, 0, -1);
        outward = new Vector3(-1, 0, 0);
      } else if (s < half + turn + L + turn) {
        const t = (s - (half + turn + L)) / R;
        pos = new Vector3(-R * Math.cos(t), 0, -half - R * Math.sin(t));
        tangent = new Vector3(Math.sin(t), 0, -Math.cos(t));
        outward = new Vector3(-Math.cos(t), 0, -Math.sin(t));
        inTurn = true;
      } else {
        const d = s - (half + turn + L + turn);
        pos = new Vector3(R, 0, -half + d);
        tangent = new Vector3(0, 0, 1);
        outward = new Vector3(1, 0, 0);
      }
      return { pos, tangent, outward, bank: inTurn ? def.banking : 0 };
    },
  };
}

/**
 * Build an arc-length-parametrised centerline from a smooth periodic curve
 * `xz(u)` (u in [0,1)) and an optional elevation `elev(u)`. Densely samples the
 * curve, builds a cumulative arc-length table, then `pointAt(s)` binary-searches
 * it so travel speed is uniform along the centerline (cars don't speed up/slow
 * down through tight bits). Tangents/elevation slope come from finite differences.
 */
function fromParametric(
  xz: (u: number) => { x: number; z: number },
  elev: (u: number) => number,
  startFinishFrac: number,
): Centerline {
  const N = 4000;
  const px = new Float64Array(N + 1);
  const pz = new Float64Array(N + 1);
  const py = new Float64Array(N + 1);
  const cum = new Float64Array(N + 1); // cumulative arc length (planar) at each node
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = xz(u);
    px[i] = p.x; pz[i] = p.z; py[i] = elev(u);
  }
  for (let i = 1; i <= N; i++) {
    const dx = px[i] - px[i - 1];
    const dz = pz[i] - pz[i - 1];
    cum[i] = cum[i - 1] + Math.hypot(dx, dz);
  }
  const length = cum[N];

  const at = (s: number): CenterSample => {
    let q = ((s % length) + length) % length;
    // binary-search the cumulative table for the segment containing q
    let lo = 0, hi = N;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < q) lo = mid + 1; else hi = mid;
    }
    const i1 = Math.max(1, lo);
    const i0 = i1 - 1;
    const seg = cum[i1] - cum[i0] || 1e-6;
    const f = (q - cum[i0]) / seg;
    const x = px[i0] + (px[i1] - px[i0]) * f;
    const z = pz[i0] + (pz[i1] - pz[i0]) * f;
    const y = py[i0] + (py[i1] - py[i0]) * f;
    // tangent in the xz plane from the local segment
    let tx = px[i1] - px[i0];
    let tz = pz[i1] - pz[i0];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    return {
      pos: new Vector3(x, y, z),
      tangent: new Vector3(tx, 0, tz),
      outward: outwardOf(tx, tz),
      bank: 0,
    };
  };

  return { length, startFinishS: startFinishFrac * length, pointAt: at };
}

/**
 * Figure-8 (Gerono lemniscate): a single continuous closed loop that crosses
 * itself once at the infield "X" — cars on opposite lobes meet at grade, so
 * T-bones are on the table (the requested chaos). Flat (y=0, bank=0) so the
 * crossing is a true at-grade intersection. Sized from the def's footprint.
 */
function figure8Centerline(def: TrackDef): Centerline {
  // Footprint comparable to the oval: A = half-width (x), B = lobe reach (z).
  const A = def.cornerRadius + def.straightLength * 0.5 + 18;
  const B = def.cornerRadius * 1.7 + def.straightLength * 0.5 + 18;
  // u in [0,1) → t in [0,2π). x = A sin t (side to side), z = B sin t cos t (the two lobes).
  const xz = (u: number) => {
    const t = u * Math.PI * 2;
    return { x: A * Math.sin(t), z: B * Math.sin(t) * Math.cos(t) };
  };
  // Start/finish on a lobe, well away from the central X (t≈π/2 → first lobe, z≈0, x=A).
  return fromParametric(xz, () => 0, 0.25);
}

/**
 * Off-road dirt loop: a winding closed loop (no self-crossing) with 3 ramp
 * crests that raise the surface for real jumps. The rising face of each ramp,
 * combined with the vehicle's climb-rate launch, throws the car into a genuine
 * arc; it lands back on the descending surface / flat ground. Runs in DAYLIGHT.
 */
function offroadCenterline(def: TrackDef): Centerline {
  const R0 = def.cornerRadius + def.straightLength * 0.5 + 26; // base loop radius
  // Winding radius: sum of sines makes sweeping curves + tighter kinks around the loop.
  const xz = (u: number) => {
    const t = u * Math.PI * 2;
    const r = R0 + 14 * Math.sin(2 * t) + 9 * Math.sin(3 * t + 0.7) + 5 * Math.sin(5 * t + 1.9);
    return { x: r * Math.cos(t), z: r * 1.15 * Math.sin(t) };
  };
  // Ramp crests: Gaussian bumps in u, placed away from the start/finish (u≈0).
  const ramps = [
    { u: 0.18, h: 3.4, w: 0.022 },
    { u: 0.46, h: 4.2, w: 0.026 },
    { u: 0.74, h: 3.0, w: 0.020 },
  ];
  const elev = (u: number) => {
    let y = 0;
    for (const r of ramps) {
      // wrap-aware distance in u
      let d = Math.abs(u - r.u); if (d > 0.5) d = 1 - d;
      y += r.h * Math.exp(-(d * d) / (r.w * r.w));
    }
    return y;
  };
  return fromParametric(xz, elev, 0.0);
}

/** Build the centerline for a track def's shape. Oval is the verbatim original. */
export function makeCenterline(def: TrackDef): Centerline {
  const shape: TrackShape = def.shape ?? "oval";
  if (shape === "figure8") return figure8Centerline(def);
  if (shape === "offroad") return offroadCenterline(def);
  return ovalCenterline(def);
}
