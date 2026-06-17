import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Quaternion } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import "@babylonjs/core/Meshes/Builders/tubeBuilder";
import "@babylonjs/core/Meshes/Builders/ribbonBuilder";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { RaycastVehicle, type WheelDef, type VehicleConfig } from "../physics/RaycastVehicle";
import { cloneConfig } from "./CarSetup";
import {
  type CarOptions, type BuiltCar, type Draw,
  rgb, flakeNormal, paintMat, flatMat, decalMat, imageDecalMat, buildWheel, sidewallDraw,
} from "./Car";

/**
 * Dirt Late Model — the second car class. A FULL-FENDERED WEDGE: a low pointed nose + front
 * air dam, a sloped hood rising to a tall greenhouse (windshield → roof set well back → rear
 * window), the signature SAIL PANELS bridging the roof to the rear deck, fender flares over all
 * four wheels, and a BIG rear spoiler with side boards. No top wing (the visual opposite of the
 * winged sprint car). Built from the same primitive/material helpers as `Car.ts`.
 *
 * Real Super Late Model reference: ~103" wheelbase, ~78" wide, ~2300 lb, 850+ HP V8, Hoosier
 * dirt tires with mild right-rear stagger. See the `late-car-model` skill.
 */

/** Physics baseline for the Late Model: heavier, grippier slick tin, NO wing downforce, a touch
 *  less power and more drag than the sprinter — so it carries momentum and feels planted. */
export const LATE_MODEL_CONFIG: VehicleConfig = {
  mass: 2.2,
  bodySize: new Vector3(1.5, 0.55, 2.4),
  comOffsetY: -0.16,
  suspRest: 0.18,
  wheelRadius: 0.3,
  suspStiffness: 64,
  suspDamping: 7.0,
  tireGrip: 2.0,
  corneringStiffness: 10.5,
  rollResist: 0.95,
  engineForce: 15,
  brakeForce: 20,
  maxSteer: 0.5,
  steerSpeedFalloff: 0.06,
  downforce: 0.0, // no wing
  slipSteer: 0.42,     // planted, momentum car — much less tail-happy than the sprinter
  throttleSteer: 0.009,
};

/** Late-model door livery: car-color base, black lower rocker, big numbered roundel + name. */
function lateLiveryDraw(color: Color3, num: number, name?: string): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = rgb(color); ctx.fillRect(0, 0, w, h);
    // black lower rocker stripe
    ctx.fillStyle = "#0b0b0d";
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.lineTo(w, h * 0.66); ctx.lineTo(0, h * 0.74); ctx.closePath(); ctx.fill();
    // diagonal accent slash
    ctx.fillStyle = "#f4f4f6";
    ctx.beginPath(); ctx.moveTo(w * 0.04, h * 0.10); ctx.lineTo(w * 0.24, h * 0.10); ctx.lineTo(w * 0.12, h * 0.6); ctx.lineTo(0, h * 0.6); ctx.closePath(); ctx.fill();
    // numbered roundel (door number)
    const cx = w * 0.5, cy = h * 0.40, r = h * 0.32;
    ctx.fillStyle = "#0b0b0d"; ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0b0b0d"; ctx.font = `bold ${r * 1.5}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(num), cx, cy + 2);
    const label = name ? name.toUpperCase() : "LATE MODEL";
    ctx.fillStyle = "#fff"; ctx.font = `bold ${h * (name ? 0.15 : 0.12)}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(label, w - 12, h - 10);
  };
}

/** Roof number panel: black roof with the car's big number (most visible surface from above). */
function roofDraw(color: Color3, num: number): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(color); ctx.fillRect(0, 0, w, h * 0.12); ctx.fillRect(0, h * 0.88, w, h * 0.12);
    ctx.fillStyle = "#fff"; ctx.font = `bold ${h * 0.6}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(num), w / 2, h * 0.52);
  };
}

/** A rounded fender flare: a half-ring tube arc that hoods over a wheel's top (front ~180°),
 *  so all four tires read as fendered. Lives in the Z-Y plane at the wheel's x, no geometry
 *  below the ground line. */
function buildFender(scene: Scene, name: string, wheelR: number, mat: PBRMaterial): Mesh {
  const R = wheelR + 0.09;
  const path: Vector3[] = [];
  // sweep from just behind the contact patch, over the top, to just ahead of it
  for (let i = 0; i <= 20; i++) {
    const a = (-0.14 + (i / 20) * 1.30) * Math.PI;
    path.push(new Vector3(0, Math.sin(a) * R, Math.cos(a) * R));
  }
  // a rounded flare LIP — scaled wide laterally by the caller so it reads as a fender that
  // hugs the tire, not a fat ring
  const t = MeshBuilder.CreateTube(name, { path, radius: 0.085, tessellation: 10, cap: Mesh.CAP_ALL }, scene);
  t.material = mat;
  return t;
}

export function createLateModel(
  scene: Scene,
  plugin: HavokPlugin,
  shadow: ShadowGenerator | null,
  opts: CarOptions = {}
): BuiltCar {
  const color = opts.color ?? new Color3(0.1, 0.45, 0.95);
  const num = opts.number ?? 0;
  const logoUrl = opts.logoUrl;
  const logoAspect = opts.logoAspect ?? 0.72;
  const name = logoUrl ? undefined : opts.name;
  const logoMat = logoUrl ? imageDecalMat(scene, "lmlogo", logoUrl) : null;

  const flake = flakeNormal(scene);
  const mPaint = paintMat(scene, "lmpaint", color, flake);
  const mPaintDark = paintMat(scene, "lmpaintD", color.scale(0.5), flake);
  const mBlack = flatMat(scene, "lmblk", new Color3(0.05, 0.05, 0.06), 0.4, 0.1);
  const mCarbon = flatMat(scene, "lmcarbon", new Color3(0.05, 0.05, 0.06), 0.4, 0.35);
  const mChrome = flatMat(scene, "lmchrome", new Color3(0.9, 0.9, 0.93), 0.06, 1.0);
  const mRim = flatMat(scene, "lmrim", new Color3(0.55, 0.56, 0.6), 0.3, 0.85); // machined silver beadlock
  const mTire = flatMat(scene, "lmtire", new Color3(0.045, 0.045, 0.05), 0.85, 0.0);
  mTire.backFaceCulling = false;
  const mGlass = flatMat(scene, "lmglass", new Color3(0.05, 0.07, 0.1), 0.12, 0.6);
  const mVisor = flatMat(scene, "lmvisor", new Color3(0.08, 0.1, 0.14), 0.08, 0.9);
  const mSidewall = decalMat(scene, "lmsidewall", 256, 256, sidewallDraw(), false, true);

  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial, parent: TransformNode) => { m.material = mat; m.parent = parent; parts.push(m); return m; };

  // Invisible collision root
  const root = MeshBuilder.CreateBox("chassis", { width: 1.3, height: 0.4, depth: 2.3 }, scene);
  root.isVisible = false;
  root.position.copyFrom(opts.spawn ?? new Vector3(0, 0.7, 0));
  root.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 1, 0), opts.yaw ?? 0);

  // Floor pan
  add(MeshBuilder.CreateBox("lmpan", { width: 1.3, height: 0.05, depth: 2.05 }, scene), mCarbon, root).position.set(0, -0.18, -0.05);

  // UPPER BODY — ONE CONTINUOUS SKINNED SHELL (CreateRibbon).
  const BOT = -0.15; // body bottom

  const halfProfile = (hw: number, sideY: number, crownY: number, tuck: number): Vector3[] => {
    const topHw = Math.max(0.001, hw - tuck);
    return [
      new Vector3(hw, BOT, 0),
      new Vector3(hw, BOT + (sideY - BOT) * 0.55, 0),
      new Vector3(hw * 0.97, sideY, 0),
      new Vector3((hw + topHw) * 0.5, sideY + (crownY - sideY) * 0.6, 0),
      new Vector3(topHw, crownY * 0.985, 0),
      new Vector3(topHw * 0.5, crownY, 0),
      new Vector3(0, crownY, 0),
    ];
  };
  const station = (z: number, hw: number, sideY: number, crownY: number, tuck: number): Vector3[] => {
    const half = halfProfile(hw, sideY, crownY, tuck);
    const left = half.slice().reverse().map((p) => new Vector3(-p.x, p.y, z));
    const right = half.slice(1).map((p) => new Vector3(p.x, p.y, z));
    return left.concat(right);
  };

  const profiles: Vector3[][] = [
    station(-1.10, 0.50, -0.02, 0.06, 0.10),
    station(-0.95, 0.60, 0.02, 0.16, 0.14),
    station(-0.78, 0.61, 0.10, 0.30, 0.18),
    station(-0.55, 0.61, 0.14, 0.45, 0.22),
    station(-0.34, 0.60, 0.15, 0.55, 0.24),
    station(-0.12, 0.61, 0.15, 0.56, 0.24),
    station(0.10, 0.61, 0.15, 0.54, 0.23),
    station(0.30, 0.61, 0.14, 0.40, 0.16),
    station(0.55, 0.60, 0.12, 0.24, 0.10),
    station(0.85, 0.55, 0.06, 0.13, 0.07),
    station(1.12, 0.42, -0.06, 0.00, 0.06),
    station(1.34, 0.20, -0.10, -0.08, 0.04),
  ];

  const shell = add(
    MeshBuilder.CreateRibbon("lmshell", { pathArray: profiles, closeArray: false, closePath: false, sideOrientation: Mesh.DOUBLESIDE }, scene),
    mPaint, root
  );
  shell.position.set(0, 0, 0);

  const capEnd = (prof: Vector3[], nm: string, m: PBRMaterial) => {
    const pts = prof.map((p) => new Vector3(p.x, p.y, p.z));
    const cap = add(MeshBuilder.CreateRibbon(nm, { pathArray: [pts, pts.map((p) => new Vector3(0, p.y, p.z))], sideOrientation: Mesh.DOUBLESIDE }, scene), m, root);
    return cap;
  };
  capEnd(profiles[0], "lmcapTail", mPaintDark);
  capEnd(profiles[profiles.length - 1], "lmcapNose", mPaint);

  for (const sx of [1, -1]) {
    if (logoMat) {
      const lh = 0.26, lw = lh / logoAspect;
      const lp = add(MeshBuilder.CreatePlane("lmdoor" + sx, { width: lw, height: lh }, scene), logoMat, root);
      lp.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2; lp.scaling.x = sx;
      lp.position.set(0.62 * sx, 0.0, -0.08);
    } else {
      const door = add(MeshBuilder.CreateBox("lmdoor" + sx, { width: 0.02, height: 0.27, depth: 1.0 }, scene),
        decalMat(scene, "lmdoorD" + sx, 512, 256, lateLiveryDraw(color, num, name), sx < 0), root);
      door.position.set(0.62 * sx, 0.0, -0.1);
    }
  }
  if (!logoMat) {
    const rp = add(MeshBuilder.CreateBox("lmroofPanel", { width: 0.5, height: 0.02, depth: 0.42 }, scene),
      decalMat(scene, "lmroofD", 256, 256, roofDraw(color, num)), root);
    rp.position.set(0, 0.565, -0.18); rp.rotation.x = -0.02;
  }

  add(MeshBuilder.CreateBox("lmvalance", { width: 1.18, height: 0.20, depth: 0.16 }, scene), mBlack, root).position.set(0, -0.10, 1.14);

  const windshield = add(MeshBuilder.CreateBox("lmws", { width: 0.66, height: 0.20, depth: 0.04 }, scene), mGlass, root);
  windshield.position.set(0, 0.46, 0.18); windshield.rotation.x = -0.62;
  for (const sx of [1, -1]) {
    const win = add(MeshBuilder.CreateBox("lmsw" + sx, { width: 0.04, height: 0.14, depth: 0.42 }, scene), mGlass, root);
    win.position.set(0.585 * sx, 0.40, -0.12); win.rotation.x = 0.05;
  }
  const rearWin = add(MeshBuilder.CreateBox("lmrw", { width: 0.6, height: 0.16, depth: 0.04 }, scene), mGlass, root);
  rearWin.position.set(0, 0.42, -0.5); rearWin.rotation.x = 0.62;
  // solid body-color roof cap over the cockpit (closes the greenhouse — no roll-bar look)
  const roofCap = add(MeshBuilder.CreateBox("lmRoofCap", { width: 0.56, height: 0.1, depth: 0.6 }, scene), mPaint, root);
  roofCap.position.set(0, 0.52, -0.14); roofCap.rotation.x = -0.03;

  add(MeshBuilder.CreateBox("lmtail", { width: 1.04, height: 0.22, depth: 0.06 }, scene), mPaintDark, root).position.set(0, 0.02, -1.16);

  const blade = add(MeshBuilder.CreateBox("lmspoiler", { width: 1.04, height: 0.045, depth: 0.34 }, scene), mPaint, root);
  blade.position.set(0, 0.30, -1.02); blade.rotation.x = 0.40;
  add(MeshBuilder.CreateBox("lmspoilerLip", { width: 1.04, height: 0.09, depth: 0.035 }, scene), mBlack, root)
    .position.set(0, 0.36, -1.12);
  for (const sx of [1, -1]) {
    const sb = add(MeshBuilder.CreateBox("lmsb" + sx, { width: 0.05, height: 0.26, depth: 0.40 }, scene), mPaint, root);
    sb.position.set(0.5 * sx, 0.22, -1.02);
  }

  // --- Driver: reclined LOW under the chopped roof (only the helmet shows through the windshield) ---
  add(MeshBuilder.CreateSphere("lmseat", { diameter: 0.46, segments: 12 }, scene), mCarbon, root).position.set(0, 0.10, -0.16);
  add(MeshBuilder.CreateCapsule("lmtorso", { radius: 0.15, height: 0.36, tessellation: 12 }, scene), mCarbon, root).position.set(0, 0.19, -0.09);
  const helmet = add(MeshBuilder.CreateSphere("lmhelmet", { diameter: 0.24, segments: 14 }, scene), flatMat(scene, "lmhel", new Color3(0.92, 0.92, 0.95), 0.2, 0.1), root);
  helmet.position.set(0, 0.37, -0.04);
  add(MeshBuilder.CreateBox("lmvisorM", { width: 0.17, height: 0.07, depth: 0.07 }, scene), mVisor, root).position.set(0, 0.37, 0.06);

  // --- Exhaust headers down the right side ---
  for (let i = 0; i < 3; i++) {
    const pipe = add(MeshBuilder.CreateCylinder("lmhdr" + i, { diameter: 0.05, height: 0.5, tessellation: 10 }, scene), mChrome, root);
    pipe.rotation.z = Math.PI / 2; pipe.position.set(0.5, -0.06, 0.5 - i * 0.28);
  }

  // --- Wheels: fendered, MILD stagger (RR marginally biggest) — far less than a sprinter ---
  const layout = [
    { x: 0.66, z: 0.78, steer: true, drive: false, r: 0.27, w: 0.40 },   // front right
    { x: -0.66, z: 0.78, steer: true, drive: false, r: 0.27, w: 0.40 },  // front left
    { x: 0.68, z: -0.82, steer: false, drive: true, r: 0.31, w: 0.50 },  // right rear (biggest)
    { x: -0.66, z: -0.82, steer: false, drive: true, r: 0.30, w: 0.48 }, // left rear
  ];
  const wheels: TransformNode[] = [];
  const wheelDefs: WheelDef[] = [];
  for (let i = 0; i < layout.length; i++) {
    const L = layout[i];
    const hub = buildWheel(scene, "lmwheel" + i, L.r, L.w, mTire, mRim, mSidewall);
    hub.parent = root;
    wheels.push(hub);
    wheelDefs.push({ posLocal: new Vector3(L.x, -0.12, L.z), steer: L.steer, drive: L.drive, visual: hub, radius: L.r });
    // fender flare hooded over this tire — widened laterally so it reads as a fender, not a ring
    const fen = add(buildFender(scene, "lmfen" + i, L.r, mPaint), mPaint, root);
    fen.position.set(L.x, -0.12, L.z); fen.scaling.x = 1.9;
  }

  if (shadow) {
    for (const m of parts) shadow.addShadowCaster(m);
    for (const w of wheels) for (const cm of w.getChildMeshes()) shadow.addShadowCaster(cm as Mesh);
  }
  for (const m of parts) m.receiveShadows = true;

  const vehicle = new RaycastVehicle(scene, plugin, root, wheelDefs, cloneConfig(opts.config ?? LATE_MODEL_CONFIG));
  return { root, vehicle, wheels, bodyParts: parts };
}
