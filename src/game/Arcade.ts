/**
 * Arcade (RC Pro-Am style) on-track layer for RCSprint.
 *
 * Scatters interactive items around the night banked-dirt oval:
 *  - PICKUPS (player-only): grip / accel / top-speed boosts + roll-cage immunity.
 *  - BOOST STRIPS (any car): brief speed/accel kick on the straights.
 *  - LETTERS spelling "RCSPRINT" (player-only): collect all 8 for a big combined boost.
 *  - SLICKS (any car): wet/oily patches that briefly kill grip → the car slides.
 *
 * The vehicle buff API (applyBuff / grantImmunity / buffState) is added to
 * RaycastVehicle in parallel — this file only CALLS it.
 */
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { OvalTrack } from "../track/OvalTrack";
import type { Field } from "../race/Field";

type PickupKind = "grip" | "accel" | "top" | "rollcage";

interface Pickup {
  node: TransformNode;
  kind: PickupKind;
  center: Vector3; // world XZ centre (on the surface), used for proximity
  baseY: number; // hover height the bob oscillates around
  phase: number;
  collected: boolean;
}

interface Letter {
  node: TransformNode;
  center: Vector3;
  baseY: number;
  index: number; // 0..7, position in "RCSPRINT"
  collected: boolean;
}

interface BoostStrip {
  center: Vector3; // world XZ centre on the bottom groove
  radius: number; // proximity radius (XZ)
}

interface Slick {
  center: Vector3;
  radius: number;
}

const WORD = "RCSPRINT";

const PICKUP_COLOR: Record<PickupKind, Color3> = {
  grip: new Color3(0.15, 0.95, 0.35), // green
  accel: new Color3(0.15, 0.85, 0.95), // cyan
  top: new Color3(1.0, 0.45, 0.1), // red/orange
  rollcage: new Color3(0.98, 0.9, 0.12), // yellow
};

const PICKUP_COLLECT_R = 1.4;
const LETTER_COLLECT_R = 1.4;
const BOOST_R = 3.0;
const SLICK_R = 2.2;

export class ArcadeManager {
  private pickups: Pickup[] = [];
  private letters: Letter[] = [];
  private strips: BoostStrip[] = [];
  private slicks: Slick[] = [];

  private letterDone: boolean[] = new Array(WORD.length).fill(false);
  private score = 0;
  private upgraded = false;
  private lastField: Field | null = null; // cached each update() so HUD getters can be arg-free

  constructor(
    private scene: Scene,
    private track: OvalTrack,
    private shadow: ShadowGenerator | null,
  ) {
    this.build();
  }

  /** Place an item flat on the BANKED surface at arc-length `s`, signed lateral (+ outward). */
  private surfacePose(s: number, lateral: number, yOff: number): { pos: Vector3; yaw: number } {
    const sm = this.track.sampleAt(s);
    const W = this.track.def.width;
    const lift = W * Math.tan(sm.bank);
    const pos = sm.pos.add(sm.outward.scale(lateral));
    pos.y = lift * (0.5 + lateral / W) + yOff;
    const yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
    return { pos, yaw };
  }

  private emissiveMat(name: string, col: Color3, alpha = 1): StandardMaterial {
    const m = new StandardMaterial(name, this.scene);
    m.diffuseColor = col.scale(0.25);
    m.emissiveColor = col;
    m.specularColor = new Color3(0.1, 0.1, 0.1);
    m.alpha = alpha;
    return m;
  }

  private build(): void {
    const len = this.track.length;
    const W = this.track.def.width;

    // --- PICKUPS (player-only): floating icons that bob + spin around the oval ---
    const pickKinds: PickupKind[] = ["grip", "accel", "top", "rollcage"];
    const PICKUP_N = 7;
    for (let i = 0; i < PICKUP_N; i++) {
      const kind = pickKinds[i % pickKinds.length];
      const s = (i / PICKUP_N) * len;
      const lateral = (((i % 3) - 1) / 2) * (W * 0.25); // -W*0.25 .. +W*0.25
      const yOff = 0.6;
      const { pos } = this.surfacePose(s, lateral, yOff);

      const node = new TransformNode("pickup" + i, this.scene);
      node.position.copyFrom(pos);
      const col = PICKUP_COLOR[kind];
      // rollcage reads as a torus (cage hoop); others as a rounded gem box.
      const icon = kind === "rollcage"
        ? MeshBuilder.CreateTorus("pickupMesh" + i, { diameter: 0.7, thickness: 0.16, tessellation: 16 }, this.scene)
        : MeshBuilder.CreateBox("pickupMesh" + i, { size: 0.6 }, this.scene);
      icon.parent = node;
      icon.material = this.emissiveMat("pickupMat" + i, col);
      icon.isPickable = false;
      icon.receiveShadows = true;
      if (this.shadow) this.shadow.addShadowCaster(icon);

      // COLLECTIBLE: leave unfrozen so we can toggle visibility / animate.
      this.pickups.push({ node, kind, center: pos.clone(), baseY: pos.y, phase: i * 0.9, collected: false });
    }

    // --- BOOST STRIPS (any car): chevrons on the straights' bottom groove ---
    // Straights are centred at s=0 (front) and s=half+turn (back). Use the two
    // straight midpoints plus one more for ~3 strips.
    const R = this.track.def.cornerRadius;
    const Lstr = this.track.def.straightLength;
    const turn = Math.PI * R;
    const half = Lstr / 2;
    const stripS = [0, half + turn + half /* back straight mid */, half * 1.4 /* near front-straight exit */];
    for (let i = 0; i < stripS.length; i++) {
      const s = ((stripS[i] % len) + len) % len;
      const lateral = -W * 0.15; // bottom groove
      const yOff = 0.05;
      const { pos, yaw } = this.surfacePose(s, lateral, yOff);

      const node = new TransformNode("strip" + i, this.scene);
      node.position.copyFrom(pos);
      node.rotation.y = yaw;
      const stripMat = this.emissiveMat("stripMat" + i, new Color3(0.15, 0.85, 0.95), 0.85);
      // three stacked chevrons pointing in travel direction (+z local)
      for (let c = 0; c < 3; c++) {
        const chev = MeshBuilder.CreateBox("chev" + i + "_" + c, { width: W * 0.18, height: 0.04, depth: 0.9 }, this.scene);
        chev.parent = node;
        chev.position.set(0, 0, c * 1.1);
        chev.rotation.y = (c % 2 === 0) ? 0.35 : -0.35; // alternate to suggest an arrow
        chev.material = stripMat;
        chev.isPickable = false;
        chev.receiveShadows = true;
        chev.freezeWorldMatrix();
      }
      node.freezeWorldMatrix();
      this.strips.push({ center: pos.clone(), radius: BOOST_R });
    }

    // --- LETTERS spelling "RCSPRINT" (player-only) ---
    for (let i = 0; i < WORD.length; i++) {
      const s = (i / WORD.length) * len + len * 0.04; // offset so they don't sit on pickups
      const lateral = (i % 2 === 0 ? 1 : -1) * (W * 0.18);
      const yOff = 0.7;
      const { pos, yaw } = this.surfacePose(s, lateral, yOff);

      const node = new TransformNode("letter" + i, this.scene);
      node.position.copyFrom(pos);
      node.rotation.y = yaw;
      const block = MeshBuilder.CreateBox("letterMesh" + i, { width: 0.55, height: 0.7, depth: 0.12 }, this.scene);
      block.parent = node;
      block.material = this.emissiveMat("letterMat" + i, new Color3(0.95, 0.85, 0.2));
      block.isPickable = false;
      block.receiveShadows = true;
      if (this.shadow) this.shadow.addShadowCaster(block);

      this.letters.push({ node, center: pos.clone(), baseY: pos.y, index: i, collected: false });
    }

    // --- SLICKS (any car): dark glossy wet/oil patches flat on the line ---
    const slickS = [half * 0.7, half + turn * 0.5, half + turn + Lstr * 0.8];
    for (let i = 0; i < slickS.length; i++) {
      const s = ((slickS[i] % len) + len) % len;
      const lateral = -W * 0.08;
      const yOff = 0.04;
      const { pos } = this.surfacePose(s, lateral, yOff);

      const disc = MeshBuilder.CreateDisc("slick" + i, { radius: SLICK_R * 0.85, tessellation: 24 }, this.scene);
      disc.parent = null;
      disc.position.copyFrom(pos);
      disc.rotation.x = Math.PI / 2; // lay flat
      const sm = new StandardMaterial("slickMat" + i, this.scene);
      sm.diffuseColor = new Color3(0.02, 0.02, 0.04);
      sm.specularColor = new Color3(0.5, 0.55, 0.7); // wet sheen
      sm.specularPower = 64;
      sm.emissiveColor = new Color3(0.02, 0.03, 0.05);
      sm.alpha = 0.85;
      disc.material = sm;
      disc.isPickable = false;
      disc.receiveShadows = true;
      disc.freezeWorldMatrix();

      this.slicks.push({ center: pos.clone(), radius: SLICK_R });
    }
  }

  // --- per-frame ---
  update(dt: number, field: Field): void {
    this.lastField = field;
    const p = field.player.vehicle.position;

    // Animate + player-only proximity: PICKUPS
    for (const pk of this.pickups) {
      if (pk.collected) continue;
      pk.phase += dt;
      pk.node.rotation.y += dt * 1.6;
      pk.node.position.y = pk.baseY + Math.sin(pk.phase * 2.2) * 0.12;

      const dx = pk.center.x - p.x;
      const dz = pk.center.z - p.z;
      if (dx * dx + dz * dz <= PICKUP_COLLECT_R * PICKUP_COLLECT_R) {
        this.collectPickup(pk, field);
      }
    }

    // Animate + player-only proximity: LETTERS
    for (const lt of this.letters) {
      if (lt.collected) continue;
      lt.node.rotation.y += dt * 1.2;
      lt.node.position.y = lt.baseY + Math.sin((performance.now() * 0.002) + lt.index) * 0.1;

      const dx = lt.center.x - p.x;
      const dz = lt.center.z - p.z;
      if (dx * dx + dz * dz <= LETTER_COLLECT_R * LETTER_COLLECT_R) {
        this.collectLetter(lt, field);
      }
    }

    // All-car proximity: BOOST STRIPS + SLICKS (direct XZ distance — no track.project).
    const cars = field.cars;
    for (let i = 0; i < cars.length; i++) {
      const v = cars[i].vehicle;
      const vp = v.position;
      for (const st of this.strips) {
        const dx = st.center.x - vp.x;
        const dz = st.center.z - vp.z;
        if (dx * dx + dz * dz <= st.radius * st.radius) {
          v.applyBuff("top", 1.25, 1.0);
          v.applyBuff("accel", 1.2, 0.7);
        }
      }
      for (const sl of this.slicks) {
        const dx = sl.center.x - vp.x;
        const dz = sl.center.z - vp.z;
        if (dx * dx + dz * dz <= sl.radius * sl.radius) {
          v.applyBuff("grip", 0.55, 0.3); // refreshes while on it → slides
        }
      }
    }
  }

  private collectPickup(pk: Pickup, field: Field): void {
    pk.collected = true;
    pk.node.setEnabled(false);
    const v = field.player.vehicle;
    switch (pk.kind) {
      case "grip": v.applyBuff("grip", 1.5, 6); break;
      case "accel": v.applyBuff("accel", 1.45, 5); break;
      case "top": v.applyBuff("top", 1.3, 6); break;
      case "rollcage": v.grantImmunity(6); break;
    }
    this.score += 100;
  }

  private collectLetter(lt: Letter, field: Field): void {
    lt.collected = true;
    lt.node.setEnabled(false);
    this.letterDone[lt.index] = true;
    this.score += 250;

    if (!this.upgraded && this.letterDone.every((d) => d)) {
      this.upgraded = true;
      const v = field.player.vehicle;
      v.applyBuff("grip", 1.4, 12);
      v.applyBuff("accel", 1.3, 12);
      v.applyBuff("top", 1.25, 12);
      this.score += 1000;
    }
  }

  // --- HUD getters ---
  getScore(): number {
    return this.score;
  }

  getLetters(): string {
    let out = "";
    for (let i = 0; i < WORD.length; i++) {
      out += this.letterDone[i] ? WORD[i] : "_";
    }
    return out;
  }

  isUpgraded(): boolean {
    return this.upgraded;
  }

  playerBuffs(): { grip: number; accel: number; top: number; immunity: number } {
    if (this.lastField) return this.lastField.player.vehicle.buffState();
    return { grip: 1, accel: 1, top: 1, immunity: 0 };
  }

  // --- new race ---
  reset(): void {
    for (const pk of this.pickups) {
      pk.collected = false;
      pk.node.setEnabled(true);
    }
    for (const lt of this.letters) {
      lt.collected = false;
      lt.node.setEnabled(true);
    }
    this.letterDone.fill(false);
    this.score = 0;
    this.upgraded = false;
  }
}
