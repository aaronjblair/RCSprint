import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { BuiltCar } from "../car/Car";

/**
 * Post-race REPLAY: records every car's pose each physics step during the race, then plays it
 * back (with scrub / pause / speed) afterwards. Physics + input are suppressed during playback —
 * each car's root is driven straight from the recorded frames, wheels spun from frame-to-frame
 * travel. Cheap + deterministic: a flat Float32Array of [pos(3) + quat(4)] per car per frame.
 */
const STRIDE_PER_CAR = 7; // px,py,pz, qx,qy,qz,qw
const FPS = 60;

export class RaceRecorder {
  private frames: Float32Array;
  private stride: number;
  private cap: number;
  count = 0;
  private wheelPhase: number[];

  constructor(private cars: BuiltCar[], maxSeconds = 240) {
    this.stride = cars.length * STRIDE_PER_CAR;
    this.cap = Math.ceil(maxSeconds * FPS);
    this.frames = new Float32Array(this.cap * this.stride);
    this.wheelPhase = cars.map(() => 0);
  }

  /** Capture one physics-step pose for every car. No-op once the buffer is full. */
  record() {
    if (this.count >= this.cap) return;
    const base = this.count * this.stride;
    for (let i = 0; i < this.cars.length; i++) {
      const r = this.cars[i].root;
      const q = r.rotationQuaternion ?? Quaternion.Identity();
      const o = base + i * STRIDE_PER_CAR;
      this.frames[o] = r.position.x; this.frames[o + 1] = r.position.y; this.frames[o + 2] = r.position.z;
      this.frames[o + 3] = q.x; this.frames[o + 4] = q.y; this.frames[o + 5] = q.z; this.frames[o + 6] = q.w;
    }
    this.count++;
  }

  get seconds(): number { return this.count / FPS; }
  get hasData(): boolean { return this.count > 1; }

  /** World position of one car at frame index `fi` (clamped) — used to aim the replay camera. */
  posAt(carIndex: number, fi: number, out: Vector3): Vector3 {
    const f = Math.max(0, Math.min(this.count - 1, Math.floor(fi)));
    const o = f * this.stride + carIndex * STRIDE_PER_CAR;
    out.set(this.frames[o], this.frames[o + 1], this.frames[o + 2]);
    return out;
  }

  /** Heading (yaw) of one car at frame `fi`, from its recorded quaternion. */
  headingAt(carIndex: number, fi: number): number {
    const f = Math.max(0, Math.min(this.count - 1, Math.floor(fi)));
    const o = f * this.stride + carIndex * STRIDE_PER_CAR;
    return Quaternion.FromArray([this.frames[o + 3], this.frames[o + 4], this.frames[o + 5], this.frames[o + 6]]).toEulerAngles().y;
  }

  /**
   * Drive every car's root to the (interpolated) recorded pose at fractional frame `f`, and spin
   * the wheels by how far each car travelled this step. `dt` is the playback step (for wheel spin).
   */
  apply(f: number, dt: number) {
    const fA = Math.max(0, Math.min(this.count - 1, Math.floor(f)));
    const fB = Math.min(this.count - 1, fA + 1);
    const t = f - fA;
    const a = new Vector3(), b = new Vector3();
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const oA = fA * this.stride + i * STRIDE_PER_CAR;
      const oB = fB * this.stride + i * STRIDE_PER_CAR;
      a.set(this.frames[oA], this.frames[oA + 1], this.frames[oA + 2]);
      b.set(this.frames[oB], this.frames[oB + 1], this.frames[oB + 2]);
      const pos = Vector3.Lerp(a, b, t);
      car.root.position.copyFrom(pos);
      const qa = Quaternion.FromArray([this.frames[oA + 3], this.frames[oA + 4], this.frames[oA + 5], this.frames[oA + 6]]);
      const qb = Quaternion.FromArray([this.frames[oB + 3], this.frames[oB + 4], this.frames[oB + 5], this.frames[oB + 6]]);
      car.root.rotationQuaternion = Quaternion.Slerp(qa, qb, t);
      // spin the wheels from travelled distance (approx radius 0.3) — purely visual
      const speed = Vector3.Distance(a, b) * FPS;
      this.wheelPhase[i] += (speed * dt) / 0.3;
      for (const w of car.wheels) {
        w.rotationQuaternion = Quaternion.RotationYawPitchRoll(0, this.wheelPhase[i], 0);
      }
    }
  }
}
