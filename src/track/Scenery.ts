import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { OvalTrack } from "./OvalTrack";
import type { BackdropTheme } from "./TrackDef";
import { buildPerson, personRigs, spectatorLooks, type Look } from "../race/Marshals";

function mat(scene: Scene, name: string, c: Color3, rough = 0.7, metal = 0.0): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c; m.roughness = rough; m.metallic = metal;
  return m;
}

export interface SceneryHandles {
  standPosition: Vector3;
}

/**
 * A small, recognizable RC-car transmitter (dark plastic box body + two thumbstick nubs on top + a
 * thin angled antenna), parented to a spectator so it sits between the posed hands in front of the
 * chest. Native units (~feet) — the parent root is scaled ×PEOPLE_SCALE, so this is a handheld prop.
 * Shadow wiring matches `buildPerson` (cast + receiveShadows). Unique names per spectator.
 */
function buildTransmitter(
  scene: Scene, name: string, parent: TransformNode, shadow: ShadowGenerator | null,
): void {
  const plastic = mat(scene, name + "plastic", new Color3(0.08, 0.08, 0.09), 0.7);
  const stickM = mat(scene, name + "stick", new Color3(0.05, 0.05, 0.06), 0.8);
  const add = (m: Mesh, material: PBRMaterial) => {
    m.material = material; m.parent = parent; m.isPickable = false;
    if (shadow) shadow.addShadowCaster(m); m.receiveShadows = true; return m;
  };
  // dark plastic box body, held in front of the chest (+z = forward, toward the track post-yaw)
  add(MeshBuilder.CreateBox(name + "body", { width: 0.16, height: 0.11, depth: 0.06 }, scene), plastic)
    .position.set(0, 0.95, 0.22);
  // two thumbstick nubs on top
  for (const sx of [1, -1]) {
    add(MeshBuilder.CreateCylinder(name + "stk" + sx, { diameter: 0.025, height: 0.04, tessellation: 6 }, scene), stickM)
      .position.set(sx * 0.045, 1.02, 0.22);
  }
  // thin antenna angled up and back
  const ant = add(MeshBuilder.CreateCylinder(name + "ant", { diameter: 0.012, height: 0.22, tessellation: 6 }, scene), stickM);
  ant.position.set(0.06, 1.06, 0.18); ant.rotation.x = 0.35;
}

/**
 * A full-size, varied standing spectator (legs, torso, arms, head, hair — some with ball caps or
 * long hair) with its feet at (x,y,z). Reuses the marshals' `buildPerson` machinery, which scales to
 * real-human size — only the cars/track are 1:10. Faces the track (+z local → −x world), holds an RC
 * transmitter in raised hands. Static (frozen after building).
 */
function buildSpectator(
  scene: Scene, i: number, x: number, y: number, z: number, yaw: number, look: Look,
  shadow: ShadowGenerator | null,
): void {
  const body = buildPerson(scene, "spectator" + i, look, shadow);
  body.position.set(x, y, z);
  body.rotation.y = yaw; // +z-local now points toward the track (oval center at x≈0)
  // raise both arms forward so the hands come up to hold the transmitter at chest height
  const rig = personRigs.get(body);
  if (rig) { rig.shoulders[0].rotation.x = -1.15; rig.shoulders[1].rotation.x = -1.15; }
  buildTransmitter(scene, "spectator" + i + "tx", body, shadow);
  body.getChildMeshes().forEach((m) => m.freezeWorldMatrix());
}

/** Drivers' stand, grandstands, light towers and a start/finish gantry. */
export function buildScenery(scene: Scene, track: OvalTrack, shadow: ShadowGenerator | null, night = false): SceneryHandles {
  const R = track.def.cornerRadius;
  const L = track.def.straightLength;
  const W = track.def.width;
  const outerX = R + W / 2;

  const steel = mat(scene, "steel", new Color3(0.5, 0.52, 0.56), 0.4, 0.8);   // galvanized structure
  const truss = mat(scene, "truss", new Color3(0.42, 0.44, 0.48), 0.35, 0.85); // brighter chromed bracing
  const plank = mat(scene, "plank", new Color3(0.58, 0.60, 0.63), 0.55, 0.25); // painted bleacher planks
  const roofMat = mat(scene, "standRoof", new Color3(0.18, 0.2, 0.24), 0.6, 0.3); // dark painted awning

  const cast = (m: Mesh) => {
    if (shadow) shadow.addShadowCaster(m);
    m.receiveShadows = true;
    m.isPickable = false;
    m.freezeWorldMatrix(); // static scenery — skip per-frame matrix work
  };

  // --- Raised drivers' stand on the front straight (outside +x), centered at z=0.
  //     The FRAME is REAL-WORLD size and stays native (deck ≈5u / 5 ft) — per the
  //     world-scale rule only the cars/track are 1:10. The PEOPLE on it and the booth
  //     beside it are scaled up to full human / building size separately. ---
  const standX = outerX + 6;
  const standY = 5; // ~5 ft deck (1 unit ≈ 1 ft)
  const standLen = 26; // doubled from 13 so the stand reads as a long grandstand
  const deck = MeshBuilder.CreateBox("standDeck", { width: 3.2, height: 0.25, depth: standLen }, scene);
  deck.position.set(standX, standY, 0); deck.material = steel; cast(deck);
  // Tiered bleacher seating: three rising planks stepping UP and BACK (outboard +x) from the deck,
  // so the stand reads as raked grandstand seating rather than a flat walkway.
  for (let tier = 0; tier < 3; tier++) {
    const ty = standY + 0.13 + tier * 0.45;      // each row sits ~0.45u higher
    const tx = standX + 0.5 + tier * 0.55;        // and steps back toward the banner
    const seat = MeshBuilder.CreateBox("standSeat" + tier, { width: 0.45, height: 0.1, depth: standLen - 0.6 }, scene);
    seat.position.set(tx, ty, 0); seat.material = plank; cast(seat);
    const riser = MeshBuilder.CreateBox("standRiser" + tier, { width: 0.06, height: 0.42, depth: standLen - 0.6 }, scene);
    riser.position.set(tx - 0.24, ty - 0.21, 0); riser.material = steel; cast(riser);
  }
  // Truss legs with X cross-bracing between adjacent bents, so the substructure reads as steel scaffold.
  const bents = [-13, -6.5, 0, 6.5, 13];
  for (const dz of bents) for (const dx of [-1.3, 1.3]) {
    const leg = MeshBuilder.CreateBox("standLeg", { width: 0.22, height: standY, depth: 0.22 }, scene);
    leg.position.set(standX + dx, standY / 2, dz); leg.material = steel; cast(leg);
  }
  // diagonal cross-bracing on the outboard face between each bent (X pattern), + horizontal stringers
  for (let b = 0; b < bents.length - 1; b++) {
    const z0 = bents[b], z1 = bents[b + 1], span = z1 - z0;
    const diag = Math.hypot(span, standY);
    const ang = Math.atan2(standY, span);
    for (const s of [1, -1]) {
      const br = MeshBuilder.CreateBox("standBrace" + b + s, { width: 0.07, height: 0.07, depth: diag }, scene);
      br.position.set(standX + 1.3, standY / 2, (z0 + z1) / 2);
      br.rotation.x = s * ang; br.material = truss; cast(br);
    }
    const string = MeshBuilder.CreateBox("standStringer" + b, { width: 0.1, height: 0.1, depth: span }, scene);
    string.position.set(standX + 1.3, 0.6, (z0 + z1) / 2); string.material = steel; cast(string);
  }
  // rails front (track side) and back, kick boards, plus a rounded handrail TOP CAP on each rail.
  for (const dx of [-1.5, 1.5]) {
    const rail = MeshBuilder.CreateBox("standRail" + dx, { width: 0.08, height: 0.08, depth: standLen }, scene);
    rail.position.set(standX + dx, standY + 1.0, 0); rail.material = steel; cast(rail);
    const cap = MeshBuilder.CreateCylinder("standRailCap" + dx, { diameter: 0.12, height: standLen, tessellation: 8 }, scene);
    cap.rotation.x = Math.PI / 2; cap.position.set(standX + dx, standY + 1.06, 0); cap.material = truss; cast(cap);
    const kick = MeshBuilder.CreateBox("standKick" + dx, { width: 0.06, height: 0.4, depth: standLen }, scene);
    kick.position.set(standX + dx, standY + 0.35, 0); kick.material = steel; cast(kick);
    // upright stanchions tying the rail to the deck every few feet
    for (const sz of [-11, -5.5, 0, 5.5, 11]) {
      const post = MeshBuilder.CreateBox("standStanch" + dx + sz, { width: 0.06, height: 1.0, depth: 0.06 }, scene);
      post.position.set(standX + dx, standY + 0.5, sz); post.material = steel; cast(post);
    }
  }
  // --- Roof / awning hint over the rear (outboard) portion of the deck, on canted posts ---
  {
    const roofX = standX + 1.0, roofY = standY + 2.9;
    const awning = MeshBuilder.CreateBox("standAwning", { width: 2.2, height: 0.12, depth: standLen }, scene);
    awning.position.set(roofX, roofY, 0); awning.rotation.z = 0.1; awning.material = roofMat; cast(awning);
    const fascia = MeshBuilder.CreateBox("standFascia", { width: 0.1, height: 0.35, depth: standLen }, scene);
    fascia.position.set(roofX - 1.05, roofY - 0.15, 0); fascia.material = roofMat; cast(fascia);
    for (const pz of [-12, -6, 0, 6, 12]) {
      const col = MeshBuilder.CreateBox("standRoofPost" + pz, { width: 0.12, height: roofY - standY - 1.0, depth: 0.12 }, scene);
      col.position.set(standX + 1.6, (standY + 1.0 + roofY) / 2, pz); col.material = steel; cast(col);
    }
  }
  // 16 FULL-SIZE, varied spectators standing on the deck along the track-side rail (some with ball
  // caps, some with long hair, varied shirts) — full-human scale (≈5.7u) over the 1:10 toy cars.
  const fans = spectatorLooks();
  // Stand sits at +x, the oval center is at x≈0, so spectators must FACE −x (toward the track).
  // buildPerson's forward is +z-local; world forward = (sin yaw, 0, cos yaw), and (sin,cos)=(-1,0)
  // ⇒ yaw = −π/2. (Was unset/0 = facing +z along the deck, i.e. lined up facing each other.)
  const faceTrack = -Math.PI / 2;
  const fanCount = 16;
  for (let i = 0; i < fanCount; i++) {
    const z = -11.5 + i * (23 / (fanCount - 1)); // evenly spread across the longer walkway
    buildSpectator(scene, i, standX - 1.3, standY + 0.13, z, faceTrack, fans[i % fans.length], shadow);
  }

  // --- Draped sponsor BANNER behind the stand (outboard +x side), reading at NIGHT ---
  {
    const dt = new DynamicTexture("standBannerTex", { width: 1024, height: 256 }, scene, true);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#11161f"; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = "#c0392b"; ctx.fillRect(0, 0, 1024, 14); ctx.fillRect(0, 242, 1024, 14);
    ctx.fillStyle = "#f1c40f"; ctx.font = "bold 110px Arial Black, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("RC DIRT OVAL", 512, 108);
    ctx.fillStyle = "#ecf0f1"; ctx.font = "bold 44px Arial, sans-serif";
    ctx.fillText("FLORA VISTA SPEEDWAY", 512, 196);
    // grommet hints punched along the top hem so it reads as a hung vinyl banner
    ctx.fillStyle = "#7f8c8d";
    for (let gx = 36; gx < 1024; gx += 96) { ctx.beginPath(); ctx.arc(gx, 12, 7, 0, Math.PI * 2); ctx.fill(); }
    dt.update();
    dt.anisotropicFilteringLevel = 16;
    const bx = standX + 1.5;
    // slight catenary SAG between grommets — the top edge dips between hang points, the bottom
    // hem sags a touch more, so the banner reads as draped cloth rather than a rigid panel.
    const path: Vector3[][] = [];
    for (let z = -13; z <= 13; z += 2) {
      const f = z / 13; // -1..1 across the span
      const sag = (1 - f * f) * 0.28; // max dip mid-span
      const top = new Vector3(bx + sag * 0.5, standY + 1.0 - sag, z);
      const bot = new Vector3(bx + sag * 0.5, standY - 0.6 - sag * 1.4, z);
      path.push([top, bot]);
    }
    const banner = MeshBuilder.CreateRibbon("standBanner", { pathArray: path, sideOrientation: Mesh.DOUBLESIDE }, scene);
    const bmat = new PBRMaterial("standBannerMat", scene);
    bmat.albedoTexture = dt;
    bmat.emissiveTexture = dt; bmat.emissiveColor = night ? new Color3(0.7, 0.7, 0.7) : new Color3(0.3, 0.3, 0.3);
    bmat.roughness = 0.8; bmat.metallic = 0;
    banner.material = bmat;
    cast(banner);
  }

  // --- Small roofed TIMING BOOTH/shack beside the stand on the +z end, with a DARK-GRAY
  //     gable roof. Built native under its own root then scaled to a real building (~9u). ---
  {
    const boothRoot = new TransformNode("boothRoot", scene);
    boothRoot.position.set(standX, 0, standLen / 2 + 6.5); // just past the +z end of the deck
    const bScale = 3.4; // ~2.6u native → ~8.8u tall building
    const bCast = (m: Mesh) => {
      if (shadow) shadow.addShadowCaster(m);
      m.receiveShadows = true; m.isPickable = false; m.parent = boothRoot;
    };
    const wallM = mat(scene, "boothWall", new Color3(0.76, 0.72, 0.62), 0.85); // tan stucco
    const roofM = mat(scene, "boothRoof", new Color3(0.17, 0.18, 0.2), 0.6);    // dark-gray gable roof
    const trimM = mat(scene, "boothTrim", new Color3(0.25, 0.18, 0.12), 0.6);
    const winM = mat(scene, "boothWin", new Color3(0.3, 0.5, 0.62), 0.2, 0.3);
    const BW = 2.6, BD = 2.2, BH = 2.6;
    const walls = MeshBuilder.CreateBox("boothWalls", { width: BW, height: BH, depth: BD }, scene);
    walls.position.set(0, BH / 2, 0); walls.material = wallM; bCast(walls);
    // pitched gable roof — two tilted slabs meeting at a ridge that runs along z
    for (const sx of [1, -1]) {
      const slab = MeshBuilder.CreateBox("boothRoof" + sx, { width: BW * 0.64, height: 0.12, depth: BD + 0.5 }, scene);
      slab.position.set(sx * BW * 0.26, BH + 0.42, 0);
      slab.rotation.z = -sx * 0.62; slab.material = roofM; bCast(slab); // inner edges rise to the ridge (gable ^, not a valley)
    }
    const ridge = MeshBuilder.CreateBox("boothRidge", { width: 0.16, height: 0.16, depth: BD + 0.5 }, scene);
    ridge.position.set(0, BH + 0.85, 0); ridge.material = roofM; bCast(ridge);
    // roof EDGE / fascia trim band running the eave on each long side
    for (const sx of [1, -1]) {
      const eave = MeshBuilder.CreateBox("boothEave" + sx, { width: 0.1, height: 0.14, depth: BD + 0.6 }, scene);
      eave.position.set(sx * (BW / 2 + 0.12), BH + 0.16, 0); eave.material = trimM; bCast(eave);
    }
    // corner pilasters / panel trim so the stucco walls read as a built shack
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const post = MeshBuilder.CreateBox("boothCorner" + sx + sz, { width: 0.1, height: BH, depth: 0.1 }, scene);
      post.position.set(sx * BW / 2, BH / 2, sz * BD / 2); post.material = trimM; bCast(post);
    }
    // door on the track-facing (-x) wall, recessed in a frame
    const door = MeshBuilder.CreateBox("boothDoor", { width: 0.06, height: 1.7, depth: 0.8 }, scene);
    door.position.set(-BW / 2 - 0.01, 0.85, -0.3); door.material = trimM; bCast(door);
    // frame: vertical jambs + head lintel around the door opening
    const jamb = (dz: number) => {
      const j = MeshBuilder.CreateBox("boothJamb" + dz, { width: 0.07, height: 1.8, depth: 0.08 }, scene);
      j.position.set(-BW / 2 - 0.02, 0.9, -0.3 + dz); j.material = trimM; bCast(j);
    };
    jamb(0.46); jamb(-0.46);
    const lintel = MeshBuilder.CreateBox("boothLintel", { width: 0.07, height: 0.1, depth: 1.0 }, scene);
    lintel.position.set(-BW / 2 - 0.02, 1.78, -0.3); lintel.material = trimM; bCast(lintel);
    // side window with a frame
    const win = MeshBuilder.CreateBox("boothWin", { width: 0.06, height: 0.7, depth: 1.0 }, scene);
    win.position.set(-BW / 2 - 0.01, 1.6, 0.55); win.material = winM; bCast(win);
    const winFrame = MeshBuilder.CreateBox("boothWinFrame", { width: 0.05, height: 0.82, depth: 1.12 }, scene);
    winFrame.position.set(-BW / 2 - 0.005, 1.6, 0.55); winFrame.material = trimM; bCast(winFrame);
    // LIT window on the BACK (+x / outboard) wall — warm emissive, unlit, reads as "lit from inside" at night
    const litM = mat(scene, "boothLitWin", new Color3(1.0, 0.85, 0.5), 0.4);
    litM.disableLighting = true; litM.emissiveColor = new Color3(1.0, 0.85, 0.5);
    const litWin = MeshBuilder.CreateBox("boothLitWin", { width: 0.06, height: 0.85, depth: 1.3 }, scene);
    litWin.position.set(BW / 2 + 0.01, 1.5, 0); litWin.material = litM; bCast(litWin);
    // frame + mullion around the lit window so it reads as a glazed opening, not a glowing slab
    const litFrame = MeshBuilder.CreateBox("boothLitFrame", { width: 0.05, height: 0.98, depth: 1.42 }, scene);
    litFrame.position.set(BW / 2 + 0.005, 1.5, 0); litFrame.material = trimM; bCast(litFrame);
    const mull = MeshBuilder.CreateBox("boothLitMull", { width: 0.06, height: 0.9, depth: 0.05 }, scene);
    mull.position.set(BW / 2 + 0.02, 1.5, 0); mull.material = trimM; bCast(mull);
    boothRoot.scaling.setAll(bScale);
    boothRoot.getChildMeshes().forEach((m) => m.freezeWorldMatrix());
  }

  // --- Surrounding landscape floor (under the 400m infield) so distant scenery
  //     sits on real ground out to the horizon instead of floating over void ---
  const floorC = floorColor(track.def.backdrop);
  const floor = MeshBuilder.CreateGround("worldFloor", { width: 1700, height: 1700 }, scene);
  floor.position.y = -0.6;
  floor.material = mat(scene, "worldFloorM", night ? floorC.scale(0.4) : floorC, 1.0);
  floor.isPickable = false; floor.freezeWorldMatrix();

  // --- Distant backdrop + near vegetation, themed per round (see buildBackdrop) ---
  buildBackdrop(scene, track, night);
  buildVegetation(scene, track.def.backdrop, Math.max(L, R) + 55, night);

  // --- Light towers at the 4 corners + 2 mid-straight: a 4-leg lattice mast carrying a
  //     cross-arm of individual lamp fixtures (each a small dished can that catches the bloom). ---
  const lampGlass = mat(scene, "lampGlass", new Color3(1, 0.98, 0.9), 0.25, 0.1);
  lampGlass.emissiveColor = night ? new Color3(3.0, 2.8, 2.2) : new Color3(1, 0.95, 0.8);
  const lampCan = mat(scene, "lampCan", new Color3(0.18, 0.19, 0.21), 0.5, 0.6); // dark fixture housing
  const towerAt = (x: number, z: number) => {
    const MAST = 16, inward = x > 0 ? -1 : 1; // legs splay; fixtures aim toward the oval center
    // four splayed lattice legs converging toward the top
    for (const lx of [-0.7, 0.7]) for (const lz of [-0.7, 0.7]) {
      const leg = MeshBuilder.CreateCylinder("mastLeg", { diameter: 0.16, height: MAST, tessellation: 6 }, scene);
      leg.position.set(x + lx * 0.5, MAST / 2, z + lz * 0.5);
      leg.rotation.x = -lz * 0.025; leg.rotation.z = lx * 0.025; // gentle taper inward
      leg.material = truss; cast(leg);
    }
    // horizontal lattice rungs banding the mast at intervals
    for (let h = 2.5; h < MAST; h += 3.2) {
      for (const ax of [[0.06, 1.4, 0.06], [0.06, 0.06, 1.4]] as const) {
        const rung = MeshBuilder.CreateBox("mastRung", { width: ax[0], height: ax[1], depth: ax[2] }, scene);
        rung.position.set(x, h, z); rung.rotation.z = ax[1] > ax[2] ? Math.PI / 2 : 0; rung.material = steel; cast(rung);
      }
    }
    // cross-arm carrying the lamp cluster, tipped over the track
    const arm = MeshBuilder.CreateBox("lampArm", { width: 4.2, height: 0.18, depth: 0.18 }, scene);
    arm.position.set(x + inward * 1.2, MAST + 0.4, z); arm.material = steel; cast(arm);
    // backing plate (subtle, behind the fixtures)
    const plate = MeshBuilder.CreateBox("lampPlate", { width: 4, height: 1.1, depth: 0.15 }, scene);
    plate.position.set(x + inward * 1.2, MAST + 1.1, z); plate.lookAt(new Vector3(0, MAST + 1.1, 0)); plate.material = lampCan; cast(plate);
    // a cluster of 6 individual dished lamp cans (2 rows × 3), each a housing + glowing lens
    for (let row = 0; row < 2; row++) for (let col = -1; col <= 1; col++) {
      const fx = x + inward * 1.2 + col * 1.3, fy = MAST + 0.7 + row * 0.8, fz = z + inward * 0.18;
      const can = MeshBuilder.CreateCylinder("lampCan", { diameterTop: 0.55, diameterBottom: 0.3, height: 0.3, tessellation: 10 }, scene);
      can.position.set(fx, fy, fz); can.rotation.z = Math.PI / 2; can.lookAt(new Vector3(0, fy, fz)); can.material = lampCan; cast(can);
      const lens = MeshBuilder.CreateCylinder("lampLens", { diameter: 0.5, height: 0.08, tessellation: 10 }, scene);
      lens.position.set(fx + inward * 0.18, fy, fz); lens.rotation.z = Math.PI / 2; lens.material = lampGlass; cast(lens);
    }
    // three real point lights along the cluster (unchanged lighting footprint)
    for (let i = -1; i <= 1; i++) {
      const pl = new PointLight("towerL" + x + z + i, new Vector3(x + i * 1.2, MAST - 0.5, z), scene);
      pl.intensity = night ? 420 : 0.0; // lit only at night (PBR falloff over ~90m)
      pl.range = 110;
      pl.diffuse = new Color3(1, 0.96, 0.85);
      pl.specular = new Color3(1, 0.97, 0.88);
    }
  };
  const tx = outerX + 10, tz = L / 2 + 6;
  towerAt(tx, tz); towerAt(-tx, tz); towerAt(tx, -tz); towerAt(-tx, -tz);
  towerAt(tx, 0); towerAt(-tx, 0); // mid-straight lamps so light rings the whole track

  // --- Start/finish gantry over the front straight ---
  const gx = R;
  for (const dx of [-W / 2 - 1, W / 2 + 1]) {
    const post = MeshBuilder.CreateBox("sfPost", { width: 0.3, height: 5, depth: 0.3 }, scene);
    post.position.set(gx + dx, 2.5, 0); post.material = steel; cast(post);
  }
  const beam = MeshBuilder.CreateBox("sfBeam", { width: W + 2, height: 0.6, depth: 0.4 }, scene);
  beam.position.set(gx, 5, 0); beam.material = mat(scene, "sfBeam", new Color3(0.1, 0.1, 0.12), 0.5); cast(beam);

  return { standPosition: new Vector3(standX - 2.4, standY + 1.8, 0) };
}

/** Surrounding-terrain tint per backdrop theme (green field, sand, desert, etc.). */
function floorColor(theme: BackdropTheme): Color3 {
  switch (theme) {
    case "forest": return new Color3(0.16, 0.27, 0.15);
    case "dunes": return new Color3(0.62, 0.52, 0.36);
    case "mesas": return new Color3(0.62, 0.46, 0.30);
    case "badlands": return new Color3(0.48, 0.36, 0.26);
    case "plains": return new Color3(0.42, 0.40, 0.22);
    case "city": return new Color3(0.20, 0.21, 0.23);
    default: return new Color3(0.30, 0.30, 0.27); // neutral fallback
  }
}

/** Distant horizon silhouette, one of seven themes. Instanced + frozen (static). */
function buildBackdrop(scene: Scene, track: OvalTrack, night: boolean): void {
  const R = track.def.cornerRadius, L = track.def.straightLength;
  const far = Math.max(L, R) + 92;
  const zS = 1.25; // match the oval's z-stretch so the ring reads as a circle
  // A backdrop instance must never reach inboard of the outfield. Its widest point is
  // closest to the track along the x axis (no z-stretch), so push any whose footprint
  // would overlap the track back out by half its own width. Guarantees no clipping.
  const clear = Math.max(L, R) + 60; // just beyond the vegetation ring (+55)
  const safeR = (rWanted: number, footprint: number) => Math.max(rWanted, clear + footprint / 2);
  const dim = (c: Color3, f = 0.4) => (night ? c.scale(f) : c);
  const cone = (name: string, top: number, tess: number, c: Color3) => {
    const m = MeshBuilder.CreateCylinder(name, { diameterTop: top, diameterBottom: 1, height: 1, tessellation: tess }, scene);
    m.material = mat(scene, name + "M", c, 1.0); m.isVisible = false; return m;
  };
  const box = (name: string, c: Color3, rough = 1.0, metal = 0.0) => {
    const m = MeshBuilder.CreateBox(name, { size: 1 }, scene);
    m.material = mat(scene, name + "M", c, rough, metal); m.isVisible = false; return m;
  };
  const dome = (name: string, c: Color3) => {
    const m = MeshBuilder.CreateSphere(name, { diameter: 1, segments: 8 }, scene);
    m.material = mat(scene, name + "M", c, 1.0); m.isVisible = false; return m;
  };

  switch (track.def.backdrop) {
    case "mesas": {
      const m = cone("mesa", 0.8, 7, dim(new Color3(0.58, 0.25, 0.13), 0.4)); // deep red flat-topped butte
      for (const ring of [0, 1]) for (let a = ring * 0.08; a < Math.PI * 2; a += 0.16) {
        const h = (ring ? 82 : 58) + Math.random() * 48, base = h * (0.8 + Math.random() * 0.5);
        const r = safeR(far + ring * 55 + (Math.random() - 0.5) * 40, base);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * zS;
        const p = m.createInstance("mesa"); p.position.set(x, h / 2 - 4, z); p.scaling.set(base, h, base); p.rotation.y = Math.random() * Math.PI; p.freezeWorldMatrix();
      }
      break;
    }
    case "forest": {
      const hill = dome("fhill", dim(new Color3(0.16, 0.28, 0.16), 0.4));
      for (const ring of [0, 1]) for (let a = ring * 0.06; a < Math.PI * 2; a += 0.13) {
        const w = 90 + Math.random() * 100, h = 45 + Math.random() * 45;
        const r = safeR(far + ring * 60 + (Math.random() - 0.5) * 40, w);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * zS;
        const p = hill.createInstance("fhill"); p.position.set(x, -h * 0.15, z); p.scaling.set(w, h * 2, w * 0.8); p.freezeWorldMatrix();
      }
      break;
    }
    case "plains": {
      const hedge = box("hedge", dim(new Color3(0.20, 0.30, 0.18), 0.45)); // far windbreak so the horizon isn't bare
      for (let a = 0; a < Math.PI * 2; a += 0.10) {
        const h = 10 + Math.random() * 8, w = 40 + Math.random() * 30;
        const r = safeR(far + (Math.random() - 0.5) * 30, w); const x = Math.cos(a) * r, z = Math.sin(a) * r * zS;
        const p = hedge.createInstance("hedge"); p.position.set(x, h / 2, z); p.scaling.set(w, h, 12); p.rotation.y = a; p.freezeWorldMatrix();
      }
      const silo = MeshBuilder.CreateCylinder("silo", { diameter: 1, height: 1, tessellation: 12 }, scene);
      silo.material = mat(scene, "siloM", dim(new Color3(0.80, 0.80, 0.76), 0.5), 0.5, 0.05); silo.isVisible = false;
      const cap = dome("siloCap", dim(new Color3(0.7, 0.72, 0.74), 0.5));
      const barn = box("barn", dim(new Color3(0.55, 0.13, 0.10), 0.45));
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * Math.PI * 2 + 0.2, r = safeR(far - 20 + Math.random() * 40, 60);
        const cx = Math.cos(a) * r, cz = Math.sin(a) * r * zS;
        const cnt = 2 + (Math.random() * 2 | 0);
        for (let s = 0; s < cnt; s++) {
          const h = 26 + Math.random() * 16, d = 7 + Math.random() * 3;
          const sx = cx + (Math.random() - 0.5) * 30, sz = cz + (Math.random() - 0.5) * 20;
          const p = silo.createInstance("silo"); p.position.set(sx, h / 2, sz); p.scaling.set(d, h, d); p.freezeWorldMatrix();
          const c = cap.createInstance("siloCap"); c.position.set(sx, h, sz); c.scaling.set(d, d * 0.5, d); c.freezeWorldMatrix();
        }
        const bh = 14; const b = barn.createInstance("barn"); b.position.set(cx + 12, bh / 2, cz + 10); b.scaling.set(26, bh, 16); b.rotation.y = Math.random(); b.freezeWorldMatrix();
      }
      break;
    }
    case "city": {
      const dark = box("bldgDark", night ? new Color3(0.07, 0.08, 0.12) : new Color3(0.26, 0.29, 0.37), 0.6, 0.1);
      let lit = dark;
      if (night) { lit = box("bldgLit", new Color3(0.16, 0.15, 0.12), 0.6, 0.1); (lit.material as PBRMaterial).emissiveColor = new Color3(0.7, 0.6, 0.35); }
      for (const ring of [0, 1, 2]) for (let a = ring * 0.05; a < Math.PI * 2; a += 0.07) {
        const h = 70 + Math.random() * 150, w = 20 + Math.random() * 18;
        const r = safeR(far + ring * 40 + (Math.random() - 0.5) * 30, w);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * zS;
        const src = (night && Math.random() < 0.45) ? lit : dark;
        const p = src.createInstance("bldg"); p.position.set(x, h / 2, z); p.scaling.set(w, h, w); p.rotation.y = a; p.freezeWorldMatrix();
      }
      break;
    }
    case "dunes": {
      const sand = dome("dune", dim(new Color3(0.66, 0.56, 0.38), 0.45));
      for (const ring of [0, 1]) for (let a = ring * 0.05; a < Math.PI * 2; a += 0.10) {
        const w = 90 + Math.random() * 90, h = 18 + Math.random() * 20;
        const r = safeR(far + ring * 50 + (Math.random() - 0.5) * 40, w);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * zS;
        const p = sand.createInstance("dune"); p.position.set(x, -h * 0.2, z); p.scaling.set(w, h * 2, w * 0.7); p.rotation.y = Math.random() * Math.PI; p.freezeWorldMatrix();
      }
      break;
    }
    case "badlands": {
      const lower = cone("blLow", 0.5, 6, dim(new Color3(0.50, 0.38, 0.27), 0.4));
      const upper = cone("blUp", 0.4, 6, dim(new Color3(0.64, 0.52, 0.37), 0.45)); // lighter top band
      for (const ring of [0, 1]) for (let a = ring * 0.07; a < Math.PI * 2; a += 0.11) {
        const h = 55 + Math.random() * 50, base = h * (0.9 + Math.random() * 0.5);
        const r = safeR(far + ring * 50 + (Math.random() - 0.5) * 40, base);
        const x = Math.cos(a) * r, z = Math.sin(a) * r * zS;
        const p = lower.createInstance("bl"); p.position.set(x, h / 2 - 4, z); p.scaling.set(base, h, base); p.rotation.y = Math.random() * Math.PI; p.freezeWorldMatrix();
        const uh = h * 0.45; const u = upper.createInstance("blu"); u.position.set(x, h - 4 + uh / 2 - h * 0.2, z); u.scaling.set(base * 0.66, uh, base * 0.66); u.rotation.y = p.rotation.y; u.freezeWorldMatrix();
      }
      break;
    }
  }
}

/** Near-field vegetation ringing the outfield — pines for green themes, sparse scrub for desert. */
function buildVegetation(scene: Scene, theme: BackdropTheme, rad: number, night: boolean): void {
  const desert = theme === "mesas" || theme === "dunes" || theme === "badlands";
  if (desert) {
    const scrub = MeshBuilder.CreateSphere("scrub", { diameter: 1, segments: 6 }, scene);
    scrub.material = mat(scene, "scrubM", night ? new Color3(0.12, 0.13, 0.10) : new Color3(0.30, 0.32, 0.18), 1.0);
    scrub.isVisible = false;
    for (let a = 0; a < Math.PI * 2; a += 0.22) {
      const r = rad + (Math.random() - 0.5) * 30;
      const x = Math.cos(a) * r * 0.9, z = Math.sin(a) * r * 1.2;
      const s = 2 + Math.random() * 3;
      const p = scrub.createInstance("scrub"); p.position.set(x, s * 0.3, z); p.scaling.set(s * 2, s, s * 2); p.freezeWorldMatrix();
    }
    return;
  }
  const trunkM = MeshBuilder.CreateCylinder("trunkM", { diameter: 0.5, height: 2, tessellation: 6 }, scene);
  trunkM.material = mat(scene, "trunk", night ? new Color3(0.12, 0.09, 0.06) : new Color3(0.28, 0.2, 0.12), 0.9);
  trunkM.isVisible = false;
  const leafM = MeshBuilder.CreateCylinder("leafM", { diameterTop: 0, diameterBottom: 3.2, height: 5, tessellation: 7 }, scene);
  leafM.material = mat(scene, "leaf", night ? new Color3(0.07, 0.13, 0.07) : new Color3(0.18, 0.32, 0.16), 0.9);
  leafM.isVisible = false;
  const step = theme === "forest" ? 0.10 : 0.16; // forest is denser
  for (let a = 0; a < Math.PI * 2; a += step) {
    const r = rad + (Math.random() - 0.5) * 18;
    const x = Math.cos(a) * r * 0.9, z = Math.sin(a) * r * 1.2;
    const tr = trunkM.createInstance("tr"); tr.position.set(x, 1, z); tr.freezeWorldMatrix();
    const lf = leafM.createInstance("lf"); lf.position.set(x, 4, z); lf.scaling.setAll(0.7 + Math.random() * 0.8); lf.freezeWorldMatrix();
  }
}
