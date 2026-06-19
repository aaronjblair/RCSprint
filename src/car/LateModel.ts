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
 * Dirt Late Model — the second car class. A SQUAT, SOLID, WIDE WEDGE — one continuous body
 * mass (a chopped & widened stock car), NOT an open-wheeler. The body is WIDER than the wheel
 * track, so all four tires tuck UNDER the bodywork and only the lower outer face of each tire
 * peeks out below the fender arch. Reads instantly as: low full-width hood + ground splitter,
 * continuous SLAB SIDES (closed doors — no see-through gap to the chassis), fender bulges that
 * are part of the body side (NOT separate floating pods), a small cab set center-to-rear, tall
 * solid SAIL PANELS closing the rear, a high rear deck, and a WIDE FLAT RAKED SPOILER spanning
 * nearly the full body width. No top wing (the visual opposite of the winged sprint car). No
 * exposed tube framework, no wheels on struts. Built from the same helpers as `Car.ts`.
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

/** Late-model door livery: car-color base, black lower rocker, big numbered roundel + name.
 *  `redOutline`: draw the door number as RED glyphs with a BLACK outline (the #42 livery). */
function lateLiveryDraw(color: Color3, num: number, name?: string, redOutline = false): Draw {
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
    ctx.font = `bold ${r * 1.5}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (redOutline) {
      ctx.lineWidth = r * 0.16; ctx.strokeStyle = "#0b0b0d"; ctx.lineJoin = "round";
      ctx.strokeText(String(num), cx, cy + 2);
      ctx.fillStyle = "#d21414"; ctx.fillText(String(num), cx, cy + 2);
    } else {
      ctx.fillStyle = "#0b0b0d"; ctx.fillText(String(num), cx, cy + 2);
    }
    const label = name ? name.toUpperCase() : "LATE MODEL";
    ctx.fillStyle = "#fff"; ctx.font = `bold ${h * (name ? 0.15 : 0.12)}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(label, w - 12, h - 10);
  };
}

/** Roof number panel: black roof with the car's big number (most visible surface from above).
 *  `redOutline`: RED glyph + black outline (the #42 livery). */
function roofDraw(color: Color3, num: number, redOutline = false): Draw {
  return (ctx, w, h) => {
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgb(color); ctx.fillRect(0, 0, w, h * 0.12); ctx.fillRect(0, h * 0.88, w, h * 0.12);
    ctx.font = `bold ${h * 0.6}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (redOutline) {
      ctx.lineWidth = h * 0.05; ctx.strokeStyle = "#0b0b0d"; ctx.lineJoin = "round";
      ctx.strokeText(String(num), w / 2, h * 0.52);
      ctx.fillStyle = "#d21414"; ctx.fillText(String(num), w / 2, h * 0.52);
    } else {
      ctx.fillStyle = "#fff"; ctx.fillText(String(num), w / 2, h * 0.52);
    }
  };
}

/** A dark WHEEL-ARCH LIP skinning the rounded opening at the bottom of a fender (just the thin
 *  trim band around the wheel cut). Built centred on the wheel; lives at the fender's outer x. */
function buildArchSkirt(scene: Scene, name: string, wheelR: number, outerX: number, mat: PBRMaterial): Mesh {
  const segs = 9;
  const rArch = wheelR + 0.12;          // arch radius (just outside the tire)
  const a0 = -1.15, a1 = 1.15;          // sweep from front-low up over the top to rear-low
  const inX = outerX - 0.05;            // thin lip
  const path: Vector3[][] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (a1 - a0) * (i / segs);
    const z = Math.sin(a) * rArch;
    const y = Math.cos(a) * rArch - wheelR * 0.2; // crown above axle, drops fore/aft
    path.push([
      new Vector3(outerX, y, z),
      new Vector3(inX, y - 0.02, z),
    ]);
  }
  const m = MeshBuilder.CreateRibbon(name, { pathArray: path, sideOrientation: Mesh.DOUBLESIDE }, scene);
  m.material = mat;
  return m;
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
  const redNum = !!opts.redOutlineNumber; // #42 livery: red glyph + black outline numbers
  const name = logoUrl ? undefined : opts.name;
  const logoMat = logoUrl ? imageDecalMat(scene, "lmlogo", logoUrl) : null;

  const flake = flakeNormal(scene);
  const mPaint = paintMat(scene, "lmpaint", color, flake);
  const mPaintDark = paintMat(scene, "lmpaintD", color.scale(0.5), flake);
  const mBlack = flatMat(scene, "lmblk", new Color3(0.05, 0.05, 0.06), 0.4, 0.1);
  const mCarbon = flatMat(scene, "lmcarbon", new Color3(0.05, 0.05, 0.06), 0.4, 0.35);
  const mChrome = flatMat(scene, "lmchrome", new Color3(0.9, 0.9, 0.93), 0.06, 1.0);
  // Bare/brushed aluminum for the roll-cage tubes glimpsed through the glass — bright, a touch
  // rougher than chrome so night lighting + bloom read it as raw metal, not paint.
  const mAlu = flatMat(scene, "lmalu", new Color3(0.74, 0.75, 0.78), 0.22, 0.92);
  const mRim = flatMat(scene, "lmrim", new Color3(0.55, 0.56, 0.6), 0.3, 0.85); // machined silver beadlock
  const mTire = flatMat(scene, "lmtire", new Color3(0.045, 0.045, 0.05), 0.85, 0.0);
  mTire.backFaceCulling = false;
  const mGlass = flatMat(scene, "lmglass", new Color3(0.16, 0.2, 0.27), 0.1, 0.7); // tinted glass that catches light (reads as a window, not an open hole)
  const mSidewall = decalMat(scene, "lmsidewall", 256, 256, sidewallDraw(), false, true);

  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial, parent: TransformNode) => { m.material = mat; m.parent = parent; parts.push(m); return m; };

  // Invisible collision root
  const root = MeshBuilder.CreateBox("chassis", { width: 1.3, height: 0.4, depth: 2.3 }, scene);
  root.isVisible = false;
  root.position.copyFrom(opts.spawn ?? new Vector3(0, 0.7, 0));
  root.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 1, 0), opts.yaw ?? 0);

  // Floor pan
  add(MeshBuilder.CreateBox("lmpan", { width: 1.55, height: 0.05, depth: 2.15 }, scene), mCarbon, root).position.set(0, -0.20, -0.05);

  // ===================================================================================
  //  DIRT LATE MODEL BODY (v2, ground-up reshape) — a LONG, LOW, WIDE smooth WEDGE matching the
  //  real RC dirt-late-model reference (JConcepts L8): a ground-scraping scooped nose → long hood
  //  → a SMALL, LOW, fully ENCLOSED cab set BACK → big smooth fenders the wheels tuck UNDER →
  //  tall SAIL PANELS sweeping from the roof rear down to a low rear deck → a wide RAKED spoiler
  //  on triangular side-dams at the very tail. The roof is the high point; nothing reads as open.
  // ===================================================================================
  const HW = 0.98;       // VERY WIDE body — the wheels (x≈0.66) tuck fully UNDER the fenders
  const BOT = -0.24;     // low rocker line
  const ROOF_Y = 0.30;   // roof = the car's high point (a low, chopped cab)
  const CAB_Z = -0.16;   // small cab, set back behind centre

  // rounded-shoulder cross-section: a near-vertical side from the rocker up to a smoothly filleted
  // top at `topY`. A FENDER CROWN is simply a station with a higher topY (the side wall bulges up).
  const station = (z: number, hw: number, topY: number): Vector3[] => {
    const tw = hw * 0.92;
    const sh = BOT + (topY - BOT) * 0.6;
    const half = [
      new Vector3(hw * 0.84, BOT, z),
      new Vector3(hw, BOT + 0.05, z),
      new Vector3(hw, sh, z),
      new Vector3(hw * 0.99, sh + (topY - sh) * 0.45, z),
      new Vector3(hw * 0.9, sh + (topY - sh) * 0.85, z),
      new Vector3(tw * 0.6, topY, z),
      new Vector3(0, topY, z),
    ];
    const left = half.slice().reverse().map((p) => new Vector3(-p.x, p.y, p.z));
    return left.concat(half.slice(1));
  };

  // LOWER BODY — a long low wedge: nose on the ground → hood → FRONT FENDER bulge → low door →
  // REAR FENDER bulge → low tail.  z: +nose … −tail.  topY dips at the doors, bulges at the fenders.
  const stationData: [number, number, number][] = [
    [1.46, 0.54, -0.20],   // nose tip — the lowest point, near the ground
    [1.30, 0.74, -0.12],
    [1.10, 0.90, -0.02],   // hood
    [0.95, HW, 0.10],
    [0.80, HW, 0.20],      // FRONT FENDER CROWN (over the front wheel)
    [0.64, HW, 0.13],
    [0.40, HW, 0.12],      // cowl / windshield-base region
    [0.10, HW, 0.115],     // door (low beltline)
    [-0.22, HW, 0.115],    // door
    [-0.50, HW, 0.13],
    [-0.72, HW, 0.20],     // REAR FENDER CROWN (over the rear wheel)
    [-0.88, HW, 0.16],
    [-1.06, 0.92, 0.11],   // rear deck dropping to the tail
    [-1.26, 0.78, 0.03],   // low tail
  ];
  const profiles = stationData.map(([z, hw, topY]) => station(z, hw, topY));
  add(MeshBuilder.CreateRibbon("lmshell", { pathArray: profiles, closeArray: false, closePath: false, sideOrientation: Mesh.DOUBLESIDE }, scene), mPaint, root);

  // cap the open nose & tail ends so the shell is not hollow
  const capEnd = (prof: Vector3[], nm: string, m: PBRMaterial) => {
    const pts = prof.map((p) => new Vector3(p.x, p.y, p.z));
    add(MeshBuilder.CreateRibbon(nm, { pathArray: [pts, pts.map((p) => new Vector3(0, p.y, p.z))], sideOrientation: Mesh.DOUBLESIDE }, scene), m, root);
  };
  capEnd(profiles[0], "lmcapNose", mPaint);
  capEnd(profiles[profiles.length - 1], "lmcapTail", mPaintDark);

  // ---- LOW front splitter lip (thin, ground-skimming) + a grille slot — no bulky bumper ----
  const splitter = add(MeshBuilder.CreateBox("lmsplitter", { width: 1.04, height: 0.022, depth: 0.34 }, scene), mCarbon, root);
  splitter.position.set(0, -0.238, 1.34); splitter.rotation.x = -0.05;
  add(MeshBuilder.CreateBox("lmsplitterEdge", { width: 1.04, height: 0.03, depth: 0.022 }, scene), mBlack, root).position.set(0, -0.233, 1.50);
  add(MeshBuilder.CreateBox("lmgrille", { width: 0.5, height: 0.05, depth: 0.03 }, scene), mBlack, root).position.set(0, -0.13, 1.45);

  // ---- DOOR LIVERY (number + name) / hero logo on each smooth body side ----
  const DOOR_X = HW - 0.01;
  for (const sx of [1, -1]) {
    if (logoMat) {
      const lh = 0.30, lw = lh * logoAspect;
      const lp = add(MeshBuilder.CreatePlane("lmdoor" + sx, { width: lw, height: lh }, scene), logoMat, root);
      lp.rotation.set(0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, (Math.PI / 2) * sx);
      lp.scaling.x = sx;
      lp.position.set(DOOR_X * sx, 0.0, -0.18);
    } else {
      const door = add(MeshBuilder.CreateBox("lmdoor" + sx, { width: 0.02, height: 0.22, depth: 0.92 }, scene),
        decalMat(scene, "lmdoorD" + sx, 512, 256, lateLiveryDraw(color, num, name, redNum), sx < 0), root);
      door.position.set(DOOR_X * sx, 0.0, -0.18);
    }
  }

  // ---- a low hood scoop + (hero) hood/deck centre stripe ----
  add(MeshBuilder.CreateBox("lmscoop", { width: 0.34, height: 0.05, depth: 0.28 }, scene), mCarbon, root).position.set(0, 0.135, 0.32);
  if (logoMat) {
    const mStripe = flatMat(scene, "lmstripe", new Color3(0.95, 0.95, 0.97), 0.3, 0.05);
    const mStripeEdge = flatMat(scene, "lmstripeEdge", new Color3(0.02, 0.02, 0.02), 0.45, 0.05);
    const SW = 0.26, EDGE = 0.025;
    const striped = (n: string, d: number, y: number, z: number, rx: number) => {
      const e = add(MeshBuilder.CreateBox(n + "E", { width: SW + EDGE * 2, height: 0.02, depth: d + EDGE * 2 }, scene), mStripeEdge, root);
      e.position.set(0, y - 0.004, z); e.rotation.x = rx;
      const s = add(MeshBuilder.CreateBox(n, { width: SW, height: 0.02, depth: d }, scene), mStripe, root);
      s.position.set(0, y, z); s.rotation.x = rx;
    };
    striped("lmstripeHood", 0.8, -0.02, 0.85, 0.22); // nose → hood crown
    striped("lmstripeDeck", 0.5, 0.12, -0.86, 0.04); // rear deck
  }

  // ===================================================================================
  //  CAB — a SMALL, LOW, fully ENCLOSED canopy set back, much narrower than the body. Built as a
  //  SOLID body-color shell (so it can never read as an open cockpit) with a raked dark-glass
  //  windshield, side windows and backlight cut into it. The roof is the car's high point.
  // ===================================================================================
  const cabSec = (z: number, hw: number, top: number): Vector3[] => {
    const base = 0.10;
    const half = [
      new Vector3(hw, base, z),
      new Vector3(hw, base + (top - base) * 0.55, z),
      new Vector3(hw * 0.95, top * 0.99, z),
      new Vector3(hw * 0.55, top, z),
      new Vector3(0, top, z),
    ];
    const left = half.slice().reverse().map((p) => new Vector3(-p.x, p.y, p.z));
    return left.concat(half.slice(1));
  };
  const cabData: [number, number, number][] = [
    [0.18, 0.40, 0.16],   // windshield base (front, low)
    [0.02, 0.45, ROOF_Y], // roof front (steep windshield rise)
    [-0.30, 0.45, ROOF_Y],// roof rear (low flat roof)
    [-0.46, 0.41, 0.17],  // backlight base (rear)
  ];
  const cabProfiles = cabData.map(([z, hw, t]) => cabSec(z, hw, t));
  add(MeshBuilder.CreateRibbon("lmcab", { pathArray: cabProfiles, closeArray: false, closePath: false, sideOrientation: Mesh.DOUBLESIDE }, scene), mPaint, root);
  capEnd(cabProfiles[0], "lmcabFront", mPaint);
  capEnd(cabProfiles[cabProfiles.length - 1], "lmcabRear", mPaint);

  // SOLID body-color fill inside the canopy so the cabin can NEVER read as an open hole — the glass
  // panels below sit over solid bodywork, so the greenhouse reads as an enclosed coupe.
  const cabFill = add(MeshBuilder.CreateBox("lmcabfill", { width: 0.6, height: 0.20, depth: 0.56 }, scene), mPaint, root);
  cabFill.position.set(0, 0.19, CAB_Z);
  // glass cut into the canopy: a slim windshield band, side windows, and backlight — framed by the
  // body-color shell so they read as windows, not a missing roof.
  const windshield = add(MeshBuilder.CreateBox("lmws", { width: 0.64, height: 0.16, depth: 0.03 }, scene), mGlass, root);
  windshield.position.set(0, 0.235, 0.12); windshield.rotation.x = -0.66;
  const backlight = add(MeshBuilder.CreateBox("lmbl", { width: 0.62, height: 0.14, depth: 0.03 }, scene), mGlass, root);
  backlight.position.set(0, 0.245, -0.40); backlight.rotation.x = 0.66;
  for (const sx of [1, -1]) {
    const sw = add(MeshBuilder.CreateBox("lmsw" + sx, { width: 0.03, height: 0.10, depth: 0.30 }, scene), mGlass, root);
    sw.position.set(0.45 * sx, 0.235, -0.14);
  }
  // roof number panel (AI cars); hero gets the stripe above
  if (!logoMat) {
    const rp = add(MeshBuilder.CreateBox("lmroofD", { width: 0.55, height: 0.02, depth: 0.34 }, scene),
      decalMat(scene, "lmroofDecal", 256, 256, roofDraw(color, num, redNum)), root);
    rp.position.set(0, ROOF_Y + 0.015, CAB_Z);
  }
  // a hint of the roll cage through the glass — a low aluminium dash bar (never pokes the roof)
  const dashBar = add(MeshBuilder.CreateCylinder("lmdashbar", { diameter: 0.022, height: 0.62, tessellation: 8 }, scene), mAlu, root);
  dashBar.rotation.z = Math.PI / 2; dashBar.position.set(0, 0.17, 0.0);

  // ===================================================================================
  //  SAIL PANELS — the defining feature: tall body-color fins sweeping from the cab-roof rear
  //  back & down to the tail, flanking a recessed dark backlight/deck (x just inboard of HW).
  // ===================================================================================
  for (const sx of [1, -1]) {
    const SX = (HW - 0.05) * sx;
    const fz = -0.24, rz = -1.20;
    const topF = ROOF_Y + 0.01, topR = 0.27, bot = 0.07; // taller, more prominent fins roof→tail
    add(MeshBuilder.CreateRibbon("lmsail" + sx, {
      pathArray: [
        [new Vector3(SX, topF, fz), new Vector3(SX, topR, rz)],
        [new Vector3(SX, bot, fz), new Vector3(SX, bot, rz)],
      ],
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene), mPaint, root);
    add(MeshBuilder.CreateBox("lmsailE" + sx, { width: 0.02, height: 0.16, depth: 0.02 }, scene), mBlack, root).position.set(SX, 0.15, rz);
  }
  // body-color REAR DECK flush between the sails (the wide ribbon shell already forms the deck; this
  // just guarantees a solid body-color surface there — NOT a dark sunken trough).
  const deck = add(MeshBuilder.CreateBox("lmdeck", { width: (HW - 0.12) * 2, height: 0.05, depth: 0.74 }, scene), mPaint, root);
  deck.position.set(0, 0.135, -0.80);

  // ---- TAIL: a low closed rear panel + diffuser valance ----
  add(MeshBuilder.CreateBox("lmtail", { width: 1.5, height: 0.30, depth: 0.05 }, scene), mPaintDark, root).position.set(0, -0.07, -1.27);
  add(MeshBuilder.CreateBox("lmreardiff", { width: 1.4, height: 0.12, depth: 0.1 }, scene), mBlack, root).position.set(0, -0.21, -1.23);

  // ===================================================================================
  //  REAR SPOILER — a wide RAKED blade at the very tail on big BLACK TRIANGULAR side-dams, with a
  //  clear gap below it (the signature late-model wing). Blade top ≈ roof height.
  // ===================================================================================
  for (const sx of [1, -1]) {
    const DX = 0.72 * sx;
    const apex = new Vector3(DX, 0.12, -0.78);   // forward-low apex
    const rb = new Vector3(DX, 0.12, -1.26);     // rear edge (bottom)
    const rt = new Vector3(DX, 0.29, -1.26);     // rear edge (top) — modest height
    add(MeshBuilder.CreateRibbon("lmdam" + sx, { pathArray: [[apex, apex], [rb, rt]], sideOrientation: Mesh.DOUBLESIDE }, scene), mBlack, root);
  }
  const blade = add(MeshBuilder.CreateBox("lmspoiler", { width: 1.5, height: 0.028, depth: 0.34 }, scene), mPaint, root);
  blade.position.set(0, 0.275, -1.21); blade.rotation.x = 0.38; // WIDE, fairly flat raked blade (not an upright fence)
  add(MeshBuilder.CreateBox("lmspoilerLip", { width: 1.5, height: 0.04, depth: 0.024 }, scene), mBlack, root).position.set(0, 0.335, -1.27);

  // (No exposed interior driver: the cabin is a solid enclosed canopy with tinted glass, so an
  // interior would only read as clutter / an "open tub". A late model's dark glass hides the driver.)

  // --- Wheels: fendered, MILD stagger (RR marginally biggest) — far less than a sprinter.
  //     Tucked UNDER the body fenders (x inboard of the body half-width HW). ---
  const layout = [
    { x: 0.64, z: 0.80, steer: true, drive: false, r: 0.25, w: 0.38 },   // front right
    { x: -0.64, z: 0.80, steer: true, drive: false, r: 0.25, w: 0.38 },  // front left
    { x: 0.66, z: -0.80, steer: false, drive: true, r: 0.28, w: 0.46 },  // right rear (biggest)
    { x: -0.64, z: -0.80, steer: false, drive: true, r: 0.27, w: 0.44 }, // left rear
  ];
  const wheels: TransformNode[] = [];
  const wheelDefs: WheelDef[] = [];
  for (let i = 0; i < layout.length; i++) {
    const L = layout[i];
    const hub = buildWheel(scene, "lmwheel" + i, L.r, L.w, mTire, mRim, mSidewall);
    hub.parent = root;
    // late-model wheel detail: a ring of lug bolts on each outer dish face + a bead-lock
    // retainer ring. All well inside the tread radius (no Mickey-Mouse shoulders).
    const lugR = L.r * 0.34, hww = L.w / 2;
    for (const sx of [1, -1]) {
      const bead = MeshBuilder.CreateTorus("lmbead" + i + sx, { diameter: L.r * 0.92, thickness: 0.02, tessellation: 18 }, scene);
      bead.rotation.z = Math.PI / 2; bead.position.x = sx * (hww + 0.006); bead.parent = hub; bead.material = mRim;
      for (let b = 0; b < 6; b++) {
        const a = (b / 6) * Math.PI * 2;
        const lug = MeshBuilder.CreateCylinder("lmlug" + i + sx + b, { diameter: 0.026, height: 0.02, tessellation: 6 }, scene);
        lug.rotation.z = Math.PI / 2;
        lug.position.set(sx * (hww + 0.014), Math.sin(a) * lugR, Math.cos(a) * lugR);
        lug.parent = hub; lug.material = mChrome;
      }
    }
    wheels.push(hub);
    wheelDefs.push({ posLocal: new Vector3(L.x, -0.12, L.z), steer: L.steer, drive: L.drive, visual: hub, radius: L.r });
    // The WIDE body side (at HW, outboard of the tire) IS the fender — the wheel tucks fully under
    // it and only the lower outer face peeks out below the rocker. Just trim the wheel opening with
    // a thin dark wheel-arch lip on the body side so the arch reads.
    const sgn = Math.sign(L.x) || 1;
    const arch = add(buildArchSkirt(scene, "lmarch" + i, L.r + 0.02, HW - 0.01, mBlack), mBlack, root);
    arch.position.set(0, i < 2 ? -0.07 : -0.06, L.z); arch.scaling.x = sgn; // mirror for the left side
  }

  if (shadow) {
    for (const m of parts) shadow.addShadowCaster(m);
    for (const w of wheels) for (const cm of w.getChildMeshes()) shadow.addShadowCaster(cm as Mesh);
  }
  for (const m of parts) m.receiveShadows = true;

  const vehicle = new RaycastVehicle(scene, plugin, root, wheelDefs, cloneConfig(opts.config ?? LATE_MODEL_CONFIG));
  return { root, vehicle, wheels, bodyParts: parts };
}
