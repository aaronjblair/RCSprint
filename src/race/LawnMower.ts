import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

function mat(scene: Scene, name: string, c: Color3, rough = 0.6, metal = 0): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c; m.roughness = rough; m.metallic = metal;
  return m;
}

/**
 * Easter egg: a guy on a red riding lawn mower, parked on the infield grass by the
 * speedway logo — sized to the trackside marshals/flag girl. Purely scenic (static).
 */
export function buildLawnMower(scene: Scene, shadow: ShadowGenerator | null, pos: Vector3, facing = 0.6): TransformNode {
  const root = new TransformNode("lawnMower", scene);
  root.position.copyFrom(pos);
  root.rotation.y = facing;

  const red = mat(scene, "lmRed", new Color3(0.78, 0.07, 0.07), 0.45);
  const black = mat(scene, "lmBlk", new Color3(0.06, 0.06, 0.07), 0.6);
  const tire = mat(scene, "lmTire", new Color3(0.05, 0.05, 0.06), 0.85);
  const chrome = mat(scene, "lmChrome", new Color3(0.85, 0.85, 0.88), 0.2, 1.0);
  const seatM = mat(scene, "lmSeat", new Color3(0.1, 0.1, 0.12), 0.5);
  const yellow = mat(scene, "lmY", new Color3(0.9, 0.78, 0.1), 0.5);

  const add = (m: Mesh, material: PBRMaterial, parent: TransformNode = root): Mesh => {
    m.material = material; m.parent = parent; m.isPickable = false;
    if (shadow) shadow.addShadowCaster(m); m.receiveShadows = true; return m;
  };

  // --- wheels: small steers up front, big drive tires at the back (narrow track) ---
  const RX = 0.32; // rear half-track
  const wheelPair = (z: number, r: number, w: number, sx: number) => {
    const t = add(MeshBuilder.CreateCylinder("lmw" + z + sx, { diameter: r * 2, height: w, tessellation: 16 }, scene), tire);
    t.rotation.z = Math.PI / 2; t.position.set(sx * RX, r, z);
    const hub = add(MeshBuilder.CreateCylinder("lmh" + z + sx, { diameter: r * 0.85, height: w + 0.02, tessellation: 12 }, scene), yellow);
    hub.rotation.z = Math.PI / 2; hub.position.set(sx * RX, r, z);
  };
  for (const sx of [1, -1]) {
    wheelPair(-0.42, 0.24, 0.16, sx); // rear (big)
    // front (small)
    const fr = 0.14;
    const t = add(MeshBuilder.CreateCylinder("lmf" + sx, { diameter: fr * 2, height: 0.1, tessellation: 14 }, scene), tire);
    t.rotation.z = Math.PI / 2; t.position.set(sx * 0.26, fr, 0.5);
  }

  // --- body: deck + hood + red fenders (narrow) ---
  add(MeshBuilder.CreateBox("lmDeck", { width: 0.5, height: 0.15, depth: 1.35 }, scene), red).position.set(0, 0.33, 0.02);
  // hood / engine cover up front
  add(MeshBuilder.CreateBox("lmHood", { width: 0.44, height: 0.32, depth: 0.5 }, scene), red).position.set(0, 0.48, 0.5);
  add(MeshBuilder.CreateBox("lmGrille", { width: 0.36, height: 0.2, depth: 0.04 }, scene), black).position.set(0, 0.44, 0.76);
  // exhaust stack
  const exh = add(MeshBuilder.CreateCylinder("lmExh", { diameter: 0.05, height: 0.28, tessellation: 10 }, scene), chrome);
  exh.position.set(0.15, 0.72, 0.5);
  // rear fenders over the big tires
  for (const sx of [1, -1]) {
    const fen = add(MeshBuilder.CreateCylinder("lmFen" + sx, { diameter: 0.52, height: 0.14, tessellation: 16, arc: 0.5 }, scene), red);
    fen.rotation.z = Math.PI / 2; fen.rotation.x = Math.PI; fen.position.set(sx * RX, 0.28, -0.42);
  }
  // mowing deck slung under the middle
  add(MeshBuilder.CreateBox("lmMowDeck", { width: 0.6, height: 0.09, depth: 0.5 }, scene), red).position.set(0, 0.13, -0.05);

  // --- seat + steering ---
  add(MeshBuilder.CreateBox("lmSeatB", { width: 0.36, height: 0.07, depth: 0.36 }, scene), seatM).position.set(0, 0.6, -0.34);
  add(MeshBuilder.CreateBox("lmSeatBk", { width: 0.36, height: 0.34, depth: 0.08 }, scene), seatM).position.set(0, 0.78, -0.5);
  const col = add(MeshBuilder.CreateCylinder("lmCol", { diameter: 0.05, height: 0.5, tessellation: 10 }, scene), black);
  col.position.set(0, 0.62, 0.18); col.rotation.x = 0.5;
  const sw = add(MeshBuilder.CreateTorus("lmSW", { diameter: 0.26, thickness: 0.035, tessellation: 16 }, scene), black);
  sw.position.set(0, 0.82, 0.32); sw.rotation.x = 1.0;

  // --- the guy, seated, hands toward the wheel ---
  const skin = mat(scene, "lmSkin", new Color3(0.85, 0.66, 0.54));
  const shirt = mat(scene, "lmShirt", new Color3(0.15, 0.4, 0.75), 0.6); // blue tee
  const jeans = mat(scene, "lmJeans", new Color3(0.2, 0.26, 0.4), 0.7);
  const cap = mat(scene, "lmCap", new Color3(0.8, 0.1, 0.1), 0.6);
  // thighs (forward), shins (down to the deck)
  for (const sx of [1, -1]) {
    const thigh = add(MeshBuilder.CreateCylinder("lmThigh" + sx, { diameter: 0.15, height: 0.4, tessellation: 8 }, scene), jeans);
    thigh.position.set(sx * 0.12, 0.66, -0.1); thigh.rotation.x = Math.PI / 2 - 0.2;
    const shin = add(MeshBuilder.CreateCylinder("lmShin" + sx, { diameter: 0.13, height: 0.4, tessellation: 8 }, scene), jeans);
    shin.position.set(sx * 0.13, 0.46, 0.12); shin.rotation.x = 0.5;
  }
  add(MeshBuilder.CreateCapsule("lmTorso", { radius: 0.17, height: 0.5, tessellation: 10 }, scene), shirt).position.set(0, 0.92, -0.34);
  // arms reaching to the wheel
  for (const sx of [1, -1]) {
    const arm = add(MeshBuilder.CreateCylinder("lmArm" + sx, { diameter: 0.1, height: 0.5, tessellation: 8 }, scene), shirt);
    arm.position.set(sx * 0.15, 0.92, -0.05); arm.rotation.x = Math.PI / 2 - 0.3;
  }
  add(MeshBuilder.CreateSphere("lmHead", { diameter: 0.25, segments: 12 }, scene), skin).position.set(0, 1.28, -0.32);
  add(MeshBuilder.CreateCylinder("lmCapB", { diameterTop: 0.28, diameterBottom: 0.3, height: 0.1, tessellation: 12 }, scene), cap).position.set(0, 1.4, -0.32);
  add(MeshBuilder.CreateBox("lmBrim", { width: 0.26, height: 0.03, depth: 0.16 }, scene), cap).position.set(0, 1.36, -0.2);

  root.getChildMeshes().forEach((m) => m.freezeWorldMatrix());
  return root;
}
