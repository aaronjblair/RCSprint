import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Quaternion } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { RaycastVehicle, DEFAULT_CONFIG, type WheelDef } from "../physics/RaycastVehicle";

export interface CarOptions {
  color?: Color3;
  number?: number;
  spawn?: Vector3;
  yaw?: number;
}

export interface BuiltCar {
  root: Mesh;
  vehicle: RaycastVehicle;
  wheels: TransformNode[];
  bodyParts: Mesh[];
}

function paintMat(scene: Scene, name: string, color: Color3): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = color;
  m.metallic = 0.0;
  m.roughness = 0.38;
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = 1.0;
  m.clearCoat.roughness = 0.08;
  return m;
}
function flatMat(scene: Scene, name: string, color: Color3, rough: number, metal: number): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = color;
  m.roughness = rough;
  m.metallic = metal;
  return m;
}

function numberPanel(scene: Scene, n: number, color: Color3): PBRMaterial {
  const dt = new DynamicTexture("num" + n, { width: 256, height: 256 }, scene, true);
  const ctx = dt.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = `rgb(${color.r * 255},${color.g * 255},${color.b * 255})`;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(128, 128, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "black";
  ctx.font = "bold 150px Arial Black, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 128, 140);
  dt.update();
  const m = new PBRMaterial("numMat" + n, scene);
  m.albedoTexture = dt;
  m.roughness = 0.4;
  m.metallic = 0;
  return m;
}

function buildWheel(scene: Scene, name: string, radius: number, width: number, tireMat: PBRMaterial, hubMat: PBRMaterial): TransformNode {
  const hub = new TransformNode(name, scene);
  const tire = MeshBuilder.CreateCylinder(name + "_t", { diameter: radius * 2, height: width, tessellation: 24 }, scene);
  tire.rotation.z = Math.PI / 2;
  tire.parent = hub;
  tire.material = tireMat;
  const wheel = MeshBuilder.CreateCylinder(name + "_w", { diameter: radius * 1.15, height: width + 0.02, tessellation: 16 }, scene);
  wheel.rotation.z = Math.PI / 2;
  wheel.parent = hub;
  wheel.material = hubMat;
  // a few spokes for visual interest
  for (let i = 0; i < 5; i++) {
    const sp = MeshBuilder.CreateBox(name + "_s" + i, { width: width + 0.03, height: radius * 0.9, depth: 0.04 }, scene);
    sp.parent = hub;
    sp.rotation.x = (i / 5) * Math.PI;
    sp.material = hubMat;
  }
  return hub;
}

/**
 * Builds a winged 1/10 sprint car (Losi 22S silhouette) and wires it to a
 * raycast vehicle. The collision root box stays invisible; the visible model
 * is parented to it.
 */
export function createCar(
  scene: Scene,
  plugin: HavokPlugin,
  shadow: ShadowGenerator | null,
  opts: CarOptions = {}
): BuiltCar {
  const color = opts.color ?? new Color3(0.85, 0.12, 0.12);
  const num = opts.number ?? 22;

  const mPaint = paintMat(scene, "paint", color);
  const mPaintDark = paintMat(scene, "paintD", color.scale(0.8));
  const mCarbon = flatMat(scene, "carbon", new Color3(0.05, 0.05, 0.06), 0.45, 0.3);
  const mChrome = flatMat(scene, "chrome", new Color3(0.85, 0.86, 0.9), 0.08, 1.0);
  const mTire = flatMat(scene, "tire", new Color3(0.04, 0.04, 0.045), 0.9, 0.0);
  const mHub = flatMat(scene, "hub", color.scale(0.9), 0.25, 0.85);
  const mNum = numberPanel(scene, num, color);
  const mSkin = flatMat(scene, "skin", new Color3(0.6, 0.45, 0.35), 0.7, 0.0);
  const mVisor = flatMat(scene, "visor", new Color3(0.1, 0.12, 0.15), 0.1, 0.9);

  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial, parent: TransformNode) => {
    m.material = mat; m.parent = parent; parts.push(m); return m;
  };

  // Invisible collision root
  const root = MeshBuilder.CreateBox("chassis", { width: 1.0, height: 0.3, depth: 2.0 }, scene);
  root.isVisible = false;
  root.position.copyFrom(opts.spawn ?? new Vector3(0, 0.7, 0));
  root.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 1, 0), opts.yaw ?? 0);

  // Floor pan
  add(MeshBuilder.CreateBox("pan", { width: 0.92, height: 0.06, depth: 1.9 }, scene), mCarbon, root).position.set(0, -0.16, 0);

  // Main tub / hull (tapered via scaling)
  const hull = add(MeshBuilder.CreateBox("hull", { width: 0.8, height: 0.34, depth: 1.5 }, scene), mPaint, root);
  hull.position.set(0, 0.02, -0.05);
  // Tail cone
  const tail = add(MeshBuilder.CreateCylinder("tail", { diameterTop: 0.18, diameterBottom: 0.62, height: 0.7, tessellation: 16 }, scene), mPaintDark, root);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0.05, -0.95);
  // Nose cone
  const nose = add(MeshBuilder.CreateCylinder("nose", { diameterTop: 0.12, diameterBottom: 0.5, height: 0.6, tessellation: 16 }, scene), mPaint, root);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, -0.04, 1.05);

  // Cockpit cavity
  add(MeshBuilder.CreateBox("cockpit", { width: 0.5, height: 0.22, depth: 0.5 }, scene), mCarbon, root).position.set(0, 0.16, -0.18);

  // Driver: torso + helmet + visor
  add(MeshBuilder.CreateBox("torso", { width: 0.34, height: 0.3, depth: 0.34 }, scene), mCarbon, root).position.set(0, 0.26, -0.2);
  const helmet = add(MeshBuilder.CreateSphere("helmet", { diameter: 0.26, segments: 12 }, scene), mPaintDark, root);
  helmet.position.set(0, 0.46, -0.16);
  const visor = add(MeshBuilder.CreateBox("visorM", { width: 0.2, height: 0.07, depth: 0.06 }, scene), mVisor, root);
  visor.position.set(0, 0.46, -0.04);
  add(MeshBuilder.CreateBox("hands", { width: 0.3, height: 0.08, depth: 0.1 }, scene), mSkin, root).position.set(0, 0.28, 0.05);

  // Roll cage tubes
  const cageT = (n: string, x: number, z: number, h: number) => {
    const t = add(MeshBuilder.CreateCylinder(n, { diameter: 0.05, height: h, tessellation: 8 }, scene), mChrome, root);
    t.position.set(x, 0.18 + h / 2 - 0.1, z); return t;
  };
  cageT("cf1", 0.22, 0.1, 0.5); cageT("cf2", -0.22, 0.1, 0.5);
  cageT("cb1", 0.24, -0.45, 0.62); cageT("cb2", -0.24, -0.45, 0.62);
  const cageTop = add(MeshBuilder.CreateBox("cageTop", { width: 0.5, height: 0.04, depth: 0.6 }, scene), mChrome, root);
  cageTop.position.set(0, 0.5, -0.18);

  // Headers (chrome side pipes)
  for (let i = 0; i < 4; i++) {
    const p = add(MeshBuilder.CreateCylinder("hdr" + i, { diameter: 0.06, height: 0.5, tessellation: 8 }, scene), mChrome, root);
    p.rotation.z = Math.PI / 2; p.rotation.y = 0.3;
    p.position.set(0.42, 0.02, 0.3 - i * 0.18);
  }

  // Nerf bars + rear bumper hoop (chrome)
  for (const sx of [1, -1]) {
    const bar = add(MeshBuilder.CreateBox("nerf" + sx, { width: 0.06, height: 0.05, depth: 1.1 }, scene), mChrome, root);
    bar.position.set(0.6 * sx, -0.12, 0);
  }
  const hoop = add(MeshBuilder.CreateTorus("hoop", { diameter: 0.7, thickness: 0.05, tessellation: 16 }, scene), mChrome, root);
  hoop.rotation.x = Math.PI / 2; hoop.position.set(0, 0.0, -1.15);

  // --- Top wing assembly ---
  const wingPivot = new TransformNode("wingPivot", scene); wingPivot.parent = root;
  wingPivot.position.set(0, 0.9, -0.35); wingPivot.rotation.x = -0.16;
  const topFoil = add(MeshBuilder.CreateBox("topFoil", { width: 1.5, height: 0.04, depth: 1.15 }, scene), mPaint, wingPivot as any);
  topFoil.position.set(0, 0, 0);
  const wicker = add(MeshBuilder.CreateBox("wicker", { width: 1.5, height: 0.12, depth: 0.04 }, scene), mPaintDark, wingPivot as any);
  wicker.position.set(0, 0.05, -0.57);
  // side dams (boards) with number panels
  for (const sx of [1, -1]) {
    const board = add(MeshBuilder.CreateBox("board" + sx, { width: 0.03, height: 0.55, depth: 1.1 }, scene), mNum, wingPivot as any);
    board.position.set(0.74 * sx, 0.0, 0);
  }
  // center support post
  const post = add(MeshBuilder.CreateBox("wpost", { width: 0.05, height: 0.5, depth: 0.06 }, scene), mChrome, root);
  post.position.set(0, 0.62, -0.5);

  // --- Front wing ---
  const fwPivot = new TransformNode("fwPivot", scene); fwPivot.parent = root;
  fwPivot.position.set(0, 0.12, 1.25); fwPivot.rotation.x = -0.12;
  add(MeshBuilder.CreateBox("frontFoil", { width: 0.95, height: 0.03, depth: 0.38 }, scene), mPaint, fwPivot as any);
  for (const sx of [1, -1]) {
    const ep = add(MeshBuilder.CreateBox("fep" + sx, { width: 0.03, height: 0.18, depth: 0.4 }, scene), mPaintDark, fwPivot as any);
    ep.position.set(0.48 * sx, 0.06, 0);
  }

  // --- Wheels (staggered: bigger rears) ---
  const layout = [
    { x: 0.62, z: 0.78, steer: true, drive: false, r: 0.27, w: 0.24 },
    { x: -0.62, z: 0.78, steer: true, drive: false, r: 0.27, w: 0.24 },
    { x: 0.66, z: -0.82, steer: false, drive: true, r: 0.31, w: 0.36 },
    { x: -0.68, z: -0.82, steer: false, drive: true, r: 0.33, w: 0.4 }, // big right-rear
  ];
  const wheels: TransformNode[] = [];
  const wheelDefs: WheelDef[] = [];
  for (let i = 0; i < layout.length; i++) {
    const L = layout[i];
    const hub = buildWheel(scene, "wheel" + i, L.r, L.w, mTire, mHub);
    hub.parent = root;
    wheels.push(hub);
    wheelDefs.push({ posLocal: new Vector3(L.x, -0.12, L.z), steer: L.steer, drive: L.drive, visual: hub });
  }

  if (shadow) {
    for (const m of parts) shadow.addShadowCaster(m);
    for (const w of wheels) for (const cm of w.getChildMeshes()) shadow.addShadowCaster(cm);
  }
  for (const m of parts) m.receiveShadows = true;

  const vehicle = new RaycastVehicle(scene, plugin, root, wheelDefs, DEFAULT_CONFIG);
  return { root, vehicle, wheels, bodyParts: parts };
}
