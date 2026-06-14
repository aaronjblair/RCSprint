import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";

/**
 * Trackside "driver-stand" camera. Sits at a fixed elevated vantage on the
 * south side of the track and pans/zooms gently to keep the player car framed,
 * the way you watch a real RC car from the drivers' stand.
 */
export class DriverStandCamera {
  readonly camera: UniversalCamera;
  private stand: Vector3;
  private target = new Vector3();

  constructor(scene: Scene, canvas: HTMLElement, stand = new Vector3(0, 4.2, -19)) {
    this.stand = stand.clone();
    this.camera = new UniversalCamera("driverStand", stand.clone(), scene);
    this.camera.fov = 0.72;
    this.camera.minZ = 0.2;
    this.camera.maxZ = 6000;
    this.camera.inputs.clear(); // locked vantage, no manual control
    void canvas;
  }

  update(carPos: Vector3, dt: number) {
    // Smoothly track the car as the look target.
    Vector3.LerpToRef(this.target, carPos, Math.min(1, dt * 4), this.target);

    // Pan the stand slightly toward the car's x so it never leaves frame on
    // long ovals, but keep the fixed elevated south-side vantage.
    const desired = new Vector3(
      this.stand.x + carPos.x * 0.6,
      this.stand.y,
      this.stand.z + carPos.z * 0.45
    );
    Vector3.LerpToRef(this.camera.position, desired, Math.min(1, dt * 3), this.camera.position);
    this.camera.setTarget(this.target);
  }
}
