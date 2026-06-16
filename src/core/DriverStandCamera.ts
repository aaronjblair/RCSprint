import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";

/**
 * Trackside "driver-stand" camera: a high, pulled-back vantage from the stand
 * that keeps almost the **entire oval** in frame at once (so the infield logo
 * reads in every shot) while still gently drifting toward the car to keep the
 * action centered — the way you'd watch a whole RC heat from up on the stand.
 */
export class DriverStandCamera {
  readonly camera: UniversalCamera;
  private stand: Vector3;
  private target = new Vector3();
  private zFollow = 0;
  private home = new Vector3(34, 40, 0); // computed framing position
  private span = 60; // half the oval's long (z) axis — drives height/zoom
  private centerY = 0.6; // a touch above the surface so the infield fills the lower frame

  constructor(scene: Scene, _canvas: HTMLElement, stand = new Vector3(34, 6, 0)) {
    this.stand = stand.clone();
    this.camera = new UniversalCamera("driverStand", stand.clone(), scene);
    this.camera.fov = 0.8;
    this.camera.minZ = 0.2;
    this.camera.maxZ = 6000;
    this.camera.inputs.clear();
  }

  setStand(stand: Vector3) {
    this.stand = stand.clone();
    this.reframe();
  }

  /** Size the framing to the oval so the whole track fits the shot. */
  frameTrack(def: { cornerRadius: number; straightLength: number; width: number }) {
    this.span = def.straightLength / 2 + def.cornerRadius; // half the long axis
    const outX = def.cornerRadius + def.width / 2; // outer edge on the stand side
    // Sit out past the wall on the stand's side, high enough to look down into the
    // bowl. Both scale with the oval so big tracks still fit the frame.
    this.home.x = Math.max(this.stand.x, outX) + this.span * 0.5 + 10;
    this.home.y = this.span * 0.95 + 26;
    this.reframe();
  }

  private reframe() {
    this.home.x = Math.max(this.home.x, this.stand.x);
    this.camera.position.copyFrom(this.home);
  }

  update(carPos: Vector3, dt: number) {
    // Aim point: track center, eased only slightly toward the car so the whole
    // oval stays framed (full pan would push half the track out of shot).
    const aimZ = carPos.z * 0.22;
    const aimX = carPos.x * 0.12;
    Vector3.LerpToRef(this.target, new Vector3(aimX, this.centerY, aimZ), Math.min(1, dt * 3), this.target);

    // Drift the eye a little along z with the car for a sense of follow, clamped
    // so it never travels far enough to lose the ends of the track.
    const zCap = this.span * 0.22;
    const zWant = Math.max(-zCap, Math.min(zCap, carPos.z * 0.18));
    this.zFollow += (zWant - this.zFollow) * Math.min(1, dt * 2);
    this.camera.position.set(this.home.x, this.home.y, this.zFollow);
    this.camera.setTarget(this.target);

    // Hold a wide FOV so the full oval reads; ease in just slightly when the car
    // is on the far side so it doesn't get lost, but never tight enough to crop.
    const dist = Vector3.Distance(this.camera.position, carPos);
    const targetFov = Math.max(0.62, Math.min(0.92, this.span / (dist * 0.9)));
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 2);
  }
}
