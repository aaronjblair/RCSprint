import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Quaternion } from "@babylonjs/core/Maths/math";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Materials/standardMaterial";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

import { initPhysics } from "./physics/PhysicsWorld";
import { InputManager } from "./core/Input";
import { createCar } from "./car/Car";
import { DriverStandCamera } from "./core/DriverStandCamera";
import { setupEnvironment, SUN_DIR } from "./core/Environment";
import { makeDirtTextures } from "./core/Textures";
import { GROUP_GROUND } from "./physics/RaycastVehicle";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const fpsEl = document.getElementById("fps") as HTMLDivElement;
const loadingEl = document.getElementById("loading") as HTMLDivElement;
const hud = document.getElementById("hud") as HTMLDivElement;

const tel = document.createElement("div");
tel.id = "telemetry";
tel.style.cssText =
  "position:absolute;left:14px;bottom:14px;font:12px/1.45 ui-monospace,Consolas,monospace;" +
  "color:#dfe7f0;background:rgba(0,0,0,0.35);padding:7px 11px;border-radius:8px;min-width:200px;";
hud.appendChild(tel);

async function boot() {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new Scene(engine);
  const plugin = await initPhysics(scene);

  // Camera first (the post pipeline attaches to it)
  const cam = new DriverStandCamera(scene, canvas);
  scene.activeCamera = cam.camera;

  setupEnvironment(scene, cam.camera);

  // Sun for crisp shadows; IBL + sky fill the rest
  const sun = new DirectionalLight("sun", SUN_DIR, scene);
  sun.position = SUN_DIR.scale(-80);
  sun.intensity = 3.4;
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.3;
  ambient.groundColor = new Color3(0.4, 0.32, 0.24);

  const shadow = new ShadowGenerator(2048, sun);
  shadow.useBlurExponentialShadowMap = true;
  shadow.blurKernel = 32;
  shadow.darkness = 0.4;
  shadow.bias = 0.0015;

  // Dirt ground (visual) + static collider
  const ground = MeshBuilder.CreateGround("ground", { width: 240, height: 240, subdivisions: 8 }, scene);
  const dirt = new PBRMaterial("dirt", scene);
  const dirtTex = makeDirtTextures(scene, 48);
  dirt.albedoTexture = dirtTex.albedo;
  dirt.bumpTexture = dirtTex.bump;
  dirt.bumpTexture.level = 0.6;
  dirt.roughness = 0.96;
  dirt.metallic = 0.0;
  ground.material = dirt;
  ground.receiveShadows = true;

  const groundBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  const groundShape = new PhysicsShapeBox(new Vector3(0, -0.5, 0), Quaternion.Identity(), new Vector3(240, 1, 240), scene);
  groundShape.material = { friction: 0.9, restitution: 0.05 };
  groundShape.filterMembershipMask = GROUP_GROUND;
  groundBody.shape = groundShape;

  // Player car
  const car = createCar(scene, plugin, shadow, {
    color: new Color3(0.9, 0.08, 0.12),
    number: 22,
    spawn: new Vector3(0, 0.7, 0),
    yaw: 0,
  });

  const input = new InputManager();
  (window as any).__car = car;

  let acc = 0;
  const SCALE_MPH = 2.5;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.033, engine.getDeltaTime() / 1000);
    const drive = input.sample();
    car.vehicle.update(dt, drive);
    cam.update(car.vehicle.position, dt);

    acc += engine.getDeltaTime();
    if (acc > 120) {
      acc = 0;
      const sp = car.vehicle.speed;
      fpsEl.textContent = `${engine.getFps().toFixed(0)} fps`;
      tel.innerHTML =
        `<b style="color:#ffd34d">TELEMETRY</b><br>` +
        `speed&nbsp; ${(sp * SCALE_MPH).toFixed(1)} mph<br>` +
        `throttle ${(drive.throttle * 100).toFixed(0)}%  brake ${(drive.brake * 100).toFixed(0)}%<br>` +
        `steer&nbsp;&nbsp; ${drive.steer.toFixed(2)}<br>` +
        `input&nbsp;&nbsp; ${drive.usingGamepad ? "gamepad" : "keyboard"}<br>` +
        `grnd ${car.vehicle.debug.grounded}/4 load ${car.vehicle.debug.load.toFixed(1)} ` +
        `drv ${car.vehicle.debug.drive.toFixed(1)} lat ${car.vehicle.debug.lat.toFixed(1)}`;
    }
  });

  scene.executeWhenReady(() => {
    loadingEl.style.display = "none";
    console.log("[RCSprint] M1 ready — drive with WASD/arrows, R to reset");
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

boot().catch((e) => {
  console.error("[RCSprint] boot failed", e);
  loadingEl.textContent = "Boot failed — see console";
});
