import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { OvalTrack } from "./OvalTrack";

function mat(scene: Scene, name: string, c: Color3, rough = 0.7, metal = 0.0): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = c; m.roughness = rough; m.metallic = metal;
  return m;
}

export interface SceneryHandles {
  standPosition: Vector3;
}

/** Drivers' stand, grandstands, light towers and a start/finish gantry. */
export function buildScenery(scene: Scene, track: OvalTrack, shadow: ShadowGenerator | null, night = false): SceneryHandles {
  const R = track.def.cornerRadius;
  const L = track.def.straightLength;
  const W = track.def.width;
  const outerX = R + W / 2;

  const steel = mat(scene, "steel", new Color3(0.5, 0.52, 0.56), 0.4, 0.8);
  const lampMat = mat(scene, "lamp", new Color3(1, 0.97, 0.85), 0.3, 0.2);
  lampMat.emissiveColor = night ? new Color3(2.2, 2.1, 1.7) : new Color3(1, 0.95, 0.8);

  const cast = (m: Mesh) => {
    if (shadow) shadow.addShadowCaster(m);
    m.receiveShadows = true;
    m.isPickable = false;
    m.freezeWorldMatrix(); // static scenery — skip per-frame matrix work
  };

  // --- Drivers' stand on the front straight (outside +x), centered at z=0 ---
  const standX = outerX + 6;
  const standY = 5;
  const deck = MeshBuilder.CreateBox("standDeck", { width: 5, height: 0.3, depth: 12 }, scene);
  deck.position.set(standX, standY, 0); deck.material = steel; cast(deck);
  for (const dz of [-5.5, 5.5]) for (const dx of [-2, 2]) {
    const leg = MeshBuilder.CreateBox("standLeg", { width: 0.3, height: standY, depth: 0.3 }, scene);
    leg.position.set(standX + dx, standY / 2, dz); leg.material = steel; cast(leg);
  }
  const rail = MeshBuilder.CreateBox("standRail", { width: 0.1, height: 1, depth: 12 }, scene);
  rail.position.set(standX - 2.4, standY + 0.65, 0); rail.material = steel; cast(rail);
  const roof = MeshBuilder.CreateBox("standRoof", { width: 5.5, height: 0.15, depth: 13 }, scene);
  roof.position.set(standX, standY + 3, 0); roof.material = mat(scene, "roof", new Color3(0.25, 0.25, 0.28), 0.5); cast(roof);

  // --- Treeline around the outfield for a near backdrop ---
  const trunkMat = mat(scene, "trunk", new Color3(0.28, 0.2, 0.12), 0.9);
  const leafMat = mat(scene, "leaf", new Color3(0.18, 0.32, 0.16), 0.9);
  const trunkMaster = MeshBuilder.CreateCylinder("trunkM", { diameter: 0.5, height: 2, tessellation: 6 }, scene);
  trunkMaster.material = trunkMat; trunkMaster.isVisible = false;
  const leafMaster = MeshBuilder.CreateCylinder("leafM", { diameterTop: 0, diameterBottom: 3.2, height: 5, tessellation: 7 }, scene);
  leafMaster.material = leafMat; leafMaster.isVisible = false;
  const rad = Math.max(L, R) + 55;
  for (let a = 0; a < Math.PI * 2; a += 0.16) {
    const r = rad + (Math.random() - 0.5) * 18;
    const x = Math.cos(a) * r * 0.9, z = Math.sin(a) * r * 1.2;
    const tr = trunkMaster.createInstance("tr"); tr.position.set(x, 1, z);
    const lf = leafMaster.createInstance("lf"); lf.position.set(x, 4, z);
    const s = 0.7 + Math.random() * 0.8; lf.scaling.setAll(s);
  }

  // --- Mountain range ringing the horizon (instanced 5-sided peaks + snow caps) ---
  // Darker/cooler at night so the ridgeline still reads against the sky.
  const rockMaster = MeshBuilder.CreateCylinder("mtnM", { diameterTop: 0, diameterBottom: 1, height: 1, tessellation: 5 }, scene);
  rockMaster.material = mat(scene, "rock", night ? new Color3(0.10, 0.11, 0.16) : new Color3(0.31, 0.30, 0.35), 1.0);
  rockMaster.isVisible = false;
  const snowMaster = MeshBuilder.CreateCylinder("snowM", { diameterTop: 0, diameterBottom: 1, height: 1, tessellation: 5 }, scene);
  snowMaster.material = mat(scene, "snow", night ? new Color3(0.55, 0.58, 0.70) : new Color3(0.93, 0.94, 0.98), 0.85);
  snowMaster.isVisible = false;
  const mRad = Math.max(L, R) + 110;
  // Two staggered rings so the range reads with depth, not a single picket line.
  for (const ring of [0, 1]) {
    for (let a = ring * 0.07; a < Math.PI * 2; a += 0.12) {
      const r = mRad + ring * 70 + (Math.random() - 0.5) * 40;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 1.25;
      const h = (ring ? 80 : 55) + Math.random() * 75;
      const base = h * (0.95 + Math.random() * 0.6);
      const peak = rockMaster.createInstance("mtn");
      peak.position.set(x, h / 2 - 5, z);
      peak.scaling.set(base, h, base);
      peak.rotation.y = Math.random() * Math.PI;
      peak.freezeWorldMatrix();
      if (h > 95) {
        const ch = h * 0.3;
        const cap = snowMaster.createInstance("cap");
        cap.position.set(x, h - 5 - ch / 2, z);
        cap.scaling.set(base * 0.36, ch, base * 0.36);
        cap.rotation.y = peak.rotation.y;
        cap.freezeWorldMatrix();
      }
    }
  }

  // --- Light towers at the 4 corners ---
  const towerAt = (x: number, z: number) => {
    const pole = MeshBuilder.CreateCylinder("pole", { diameter: 0.5, height: 16, tessellation: 8 }, scene);
    pole.position.set(x, 8, z); pole.material = steel; cast(pole);
    const bank = MeshBuilder.CreateBox("lampBank", { width: 4, height: 1.2, depth: 0.4 }, scene);
    bank.position.set(x, 16, z);
    bank.lookAt(new Vector3(0, 16, 0));
    bank.material = lampMat;
    for (let i = -1; i <= 1; i++) {
      const pl = new PointLight("towerL" + x + z + i, new Vector3(x + i * 1.2, 15.5, z), scene);
      pl.intensity = night ? 420 : 0.0; // lit only at night (PBR falloff over ~90m)
      pl.range = 110;
      pl.diffuse = new Color3(1, 0.96, 0.85);
      pl.specular = new Color3(1, 0.97, 0.88);
    }
  };
  const tx = outerX + 10, tz = L / 2 + 6;
  towerAt(tx, tz); towerAt(-tx, tz); towerAt(tx, -tz); towerAt(-tx, -tz);

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
