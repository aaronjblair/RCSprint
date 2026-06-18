import { Scene } from "@babylonjs/core/scene";
import { Vector3, Vector2 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeMesh } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { makeDirtPBR } from "../core/Textures";
import { GROUP_GROUND } from "../physics/RaycastVehicle";
import type { TrackDef } from "./TrackDef";
import logoUrl from "../assets/logo.png";

export interface TrackSample {
  pos: Vector3; // centerline (y=0 base)
  tangent: Vector3; // unit travel direction
  outward: Vector3; // unit horizontal, toward outer wall
  bank: number;
}

export interface TrackProjection {
  s: number; // distance along centerline
  lateral: number; // signed offset from centerline (+ = outward)
  center: Vector3;
  tangent: Vector3;
  outward: Vector3;
  bank: number;
}

const SAMPLES = 480;

/**
 * Procedural banked dirt oval (stadium shape: two straights + two 180° turns,
 * counter-clockwise / left-turn). Builds the driving surface (with collision),
 * infield/outfield, retaining walls, and start/finish, plus centerline helpers
 * for lap timing, AI and the camera.
 */
export class OvalTrack {
  readonly def: TrackDef;
  readonly length: number;
  /** Arc-length of the painted start/finish line — ~70% down the front straight toward turn 1.
   *  project()'s s-origin is unchanged (the geometry origin); timing relativizes against this. */
  readonly startFinishS: number;
  readonly surface: Mesh;
  private samples: TrackSample[] = [];

  // --- racing-groove darkening overlay (visual only) ---
  private grooveTex: DynamicTexture | null = null;
  private grooveWear: Float32Array | null = null;
  private grooveFrame = 0;
  private static readonly GROOVE_BINS = 240;  // along the centerline
  private static readonly GROOVE_LANES = 12;   // across the width
  private static readonly GROOVE_MAX = 0.4;    // max darken (40%)

  constructor(
    private scene: Scene,
    plugin: HavokPlugin,
    shadow: ShadowGenerator | null,
    def: TrackDef
  ) {
    this.def = def;
    const R = def.cornerRadius;
    const L = def.straightLength;
    this.length = 2 * L + 2 * Math.PI * R;
    this.startFinishS = 0.7 * (this.length / 2); // ~70% along the front straight (s grows toward turn 1)

    void plugin;
    this.buildSamples();
    this.surface = this.buildSurface();
    this.buildInfieldOutfield(shadow);
    this.buildInfield();
    this.buildWalls(shadow);
    this.buildBerm();
    this.buildStartFinish();
    this.buildGroove();
    this.buildGrooveOverlay();
    this.buildBanners();
  }

  /** Trackside sponsor banners on the outer fence. */
  private buildBanners() {
    const W = this.def.width;
    const dt = new DynamicTexture("bannerTex", { width: 1024, height: 128 }, this.scene, true);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    const names = ["RCSPRINT", "LOSI", "HOOSIER", "DIRT NATION", "22S", "SPEKTRUM", "TLR", "CLAY CO"];
    const cols = ["#c0392b", "#2471a3", "#f1c40f", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#2c3e50"];
    const bw = 1024 / names.length;
    for (let i = 0; i < names.length; i++) {
      ctx.fillStyle = cols[i]; ctx.fillRect(i * bw, 0, bw, 128);
      ctx.fillStyle = "#fff"; ctx.font = "bold 40px Arial Black, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(names[i], i * bw + bw / 2, 70);
    }
    dt.update();
    dt.wrapU = Texture.WRAP_ADDRESSMODE;
    dt.uScale = Math.round(this.length / 9);
    dt.anisotropicFilteringLevel = 16; // banner wall is viewed at a grazing angle

    const path: Vector3[][] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const sm = this.samples[i % SAMPLES];
      const base = sm.pos.add(sm.outward.scale(W / 2 + 0.5)); base.y = 0.8;
      const top = base.add(new Vector3(0, 0.95, 0));
      path.push([base, top]);
    }
    const banner = MeshBuilder.CreateRibbon("banners", { pathArray: path, closeArray: true, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    const mat = new PBRMaterial("bannerMat", this.scene);
    mat.albedoTexture = dt;
    mat.emissiveTexture = dt; mat.emissiveColor = new Color3(0.25, 0.25, 0.25);
    mat.roughness = 0.7; mat.metallic = 0;
    banner.material = mat;
    banner.isPickable = false;
    banner.freezeWorldMatrix();
  }

  /**
   * The racing surface: contiguous ribbons across the full width, hugging the
   * banking so they sit flush. All one uniform packed-dirt brown (no visible
   * groove/cushion shading). Grip on each line still evolves over a race in
   * SurfaceModel — bottom early, cushion late — it just isn't painted on.
   */
  private buildGroove() {
    const W = this.def.width;
    const band = (name: string, center: number, half: number, col: Color3, rough: number) => {
      const inner: Vector3[] = [];
      const outer: Vector3[] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const sm = this.samples[i % SAMPLES];
        const lift = W * Math.tan(sm.bank); // surface rises linearly across the width on a bank
        const yAt = (lat: number) => lift * (0.5 + lat / W) + 0.02;
        const a = sm.pos.add(sm.outward.scale(center - half)); a.y = yAt(center - half);
        const b = sm.pos.add(sm.outward.scale(center + half)); b.y = yAt(center + half);
        inner.push(a); outer.push(b);
      }
      const ribbon = MeshBuilder.CreateRibbon(name, { pathArray: [inner, outer], closePath: true }, this.scene);
      const mat = new PBRMaterial(name + "Mat", this.scene);
      mat.albedoColor = col;
      mat.roughness = rough;
      mat.metallic = 0;
      mat.zOffset = -4; // sit cleanly on top of the track surface
      ribbon.material = mat;
      ribbon.receiveShadows = true;
      ribbon.isPickable = false;
      ribbon.freezeWorldMatrix();
    };
    // The whole racing oval is UNIFORM packed-dirt brown — no painted multi-shade
    // groove bands. Contiguous bands still tile the full width (so no bare base strip
    // shows), but all share one earthy brown derived from the track's dirt colour
    // (pulled toward brown so even red-clay rounds read as plain dirt). Grip still
    // evolves invisibly per-line in SurfaceModel.
    const dirt = this.def.dirtColor;
    const brown = new Color3(dirt.r * 0.8, dirt.g * 0.95, dirt.b * 0.95);
    const ROUGH = 0.9; // hard-packed dirt
    band("apron", -W * 0.42, W * 0.08, brown, ROUGH);
    band("groove", -W * 0.17, W * 0.17, brown, ROUGH);
    band("slick", W * 0.1, W * 0.1, brown, ROUGH);
    band("cushion", W * 0.31, W * 0.11, brown, ROUGH);
    band("marbles", W * 0.46, W * 0.04, brown, ROUGH);
  }

  /**
   * Transparent darkening overlay that paints in the racing groove as cars run laps.
   * The global SurfaceModel grip is invisible, so this ribbon (matching the surface
   * shape, lifted slightly above it) carries a per-cell ALPHA wear map: black pigment
   * whose alpha rises where tires repeatedly run, clamped to GROOVE_MAX (40% darken).
   */
  private buildGrooveOverlay() {
    const W = this.def.width;
    const BINS = OvalTrack.GROOVE_BINS;
    const LANES = OvalTrack.GROOVE_LANES;

    const inner: Vector3[] = [];
    const outer: Vector3[] = [];
    const uvs: Vector2[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const sm = this.samples[i % SAMPLES];
      const lift = W * Math.tan(sm.bank);
      const yAt = (lat: number) => lift * (0.5 + lat / W) + 0.05; // just above the painted bands (~0.02)
      const a = sm.pos.add(sm.outward.scale(-W / 2)); a.y = yAt(-W / 2);
      const b = sm.pos.add(sm.outward.scale(W / 2)); b.y = yAt(W / 2);
      inner.push(a); outer.push(b);
      const v = i / SAMPLES;
      uvs.push(new Vector2(0, v), new Vector2(1, v)); // U across width (0 inner .. 1 outer), V along length
    }
    const ribbon = MeshBuilder.CreateRibbon("grooveOverlay", { pathArray: [inner, outer], closePath: true, uvs }, this.scene);

    const tex = new DynamicTexture("grooveTex", { width: LANES, height: BINS }, this.scene, false);
    tex.hasAlpha = true;
    const mat = new StandardMaterial("grooveOverlayMat", this.scene);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.opacityTexture = tex; // per-cell alpha only
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.zOffset = -6; // sit cleanly above the surface + painted bands
    ribbon.material = mat;
    ribbon.isPickable = false;
    ribbon.alphaIndex = 5;

    this.grooveTex = tex;
    this.grooveWear = new Float32Array(BINS * LANES);
    this.paintGroove();
  }

  /** Repaint the whole groove texture from the wear map (alpha = wear * GROOVE_MAX). */
  private paintGroove() {
    if (!this.grooveTex || !this.grooveWear) return;
    const BINS = OvalTrack.GROOVE_BINS;
    const LANES = OvalTrack.GROOVE_LANES;
    const ctx = this.grooveTex.getContext() as CanvasRenderingContext2D;
    const img = ctx.createImageData(LANES, BINS);
    const data = img.data;
    for (let b = 0; b < BINS; b++) {
      for (let l = 0; l < LANES; l++) {
        const w = this.grooveWear[b * LANES + l];
        const a = Math.min(1, Math.max(0, w)) * OvalTrack.GROOVE_MAX;
        const o = (b * LANES + l) * 4;
        data[o] = 0; data[o + 1] = 0; data[o + 2] = 0;
        data[o + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    this.grooveTex.update();
  }

  /** Clear all accumulated groove wear and repaint clean. Call on race start. */
  resetGroove() {
    if (this.grooveWear) this.grooveWear.fill(0);
    this.grooveFrame = 0;
    this.paintGroove();
  }

  /**
   * Accumulate groove wear from each car's track position this racing frame, then
   * (throttled) repaint the overlay so the worn racing line darkens over the race.
   */
  updateGroove(cars: { root: { position: Vector3 } }[], dt: number) {
    if (!this.grooveWear || !this.grooveTex) return;
    const BINS = OvalTrack.GROOVE_BINS;
    const LANES = OvalTrack.GROOVE_LANES;
    const W = this.def.width;
    const k = 0.6; // wear rate per second a car sits in a cell
    for (const car of cars) {
      const proj = this.project(car.root.position);
      // length -> bin
      let bin = Math.floor((proj.s / this.length) * BINS) % BINS;
      if (bin < 0) bin += BINS;
      // lateral (-W/2 .. +W/2) -> lane
      const frac = (proj.lateral + W / 2) / W;
      let lane = Math.floor(frac * LANES);
      if (lane < 0) lane = 0; else if (lane >= LANES) lane = LANES - 1;
      const idx = bin * LANES + lane;
      this.grooveWear[idx] = Math.min(1, this.grooveWear[idx] + k * dt);
    }
    // Throttle the GPU upload — every few frames is plenty for a slow-evolving groove.
    if ((this.grooveFrame++ % 6) === 0) this.paintGroove();
  }

  // --- centerline walk ---
  private pointAt(s: number): TrackSample {
    const R = this.def.cornerRadius;
    const L = this.def.straightLength;
    const half = L / 2;
    const turn = Math.PI * R;
    let pos: Vector3, tangent: Vector3, outward: Vector3, inTurn = false;

    if (s < half) {
      pos = new Vector3(R, 0, s);
      tangent = new Vector3(0, 0, 1);
      outward = new Vector3(1, 0, 0);
    } else if (s < half + turn) {
      const t = (s - half) / R; // 0..π
      pos = new Vector3(R * Math.cos(t), 0, half + R * Math.sin(t));
      tangent = new Vector3(-Math.sin(t), 0, Math.cos(t));
      outward = new Vector3(Math.cos(t), 0, Math.sin(t));
      inTurn = true;
    } else if (s < half + turn + L) {
      const d = s - (half + turn);
      pos = new Vector3(-R, 0, half - d);
      tangent = new Vector3(0, 0, -1);
      outward = new Vector3(-1, 0, 0);
    } else if (s < half + turn + L + turn) {
      const t = (s - (half + turn + L)) / R;
      pos = new Vector3(-R * Math.cos(t), 0, -half - R * Math.sin(t));
      tangent = new Vector3(Math.sin(t), 0, -Math.cos(t));
      outward = new Vector3(-Math.cos(t), 0, -Math.sin(t));
      inTurn = true;
    } else {
      const d = s - (half + turn + L + turn);
      pos = new Vector3(R, 0, -half + d);
      tangent = new Vector3(0, 0, 1);
      outward = new Vector3(1, 0, 0);
    }
    return { pos, tangent, outward, bank: inTurn ? this.def.banking : 0 };
  }

  private buildSamples() {
    for (let i = 0; i < SAMPLES; i++) {
      this.samples.push(this.pointAt((i / SAMPLES) * this.length));
    }
    // smooth banking across turn entry/exit for a continuous surface
    const bank = this.samples.map((s) => s.bank);
    for (let pass = 0; pass < 8; pass++) {
      const next = bank.slice();
      for (let i = 0; i < SAMPLES; i++) {
        const a = bank[(i - 1 + SAMPLES) % SAMPLES];
        const b = bank[(i + 1) % SAMPLES];
        next[i] = (a + bank[i] * 2 + b) / 4;
      }
      for (let i = 0; i < SAMPLES; i++) bank[i] = next[i];
    }
    this.samples.forEach((s, i) => (s.bank = bank[i]));
  }

  // --- driving surface mesh + collision ---
  private buildSurface(): Mesh {
    const W = this.def.width;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < SAMPLES; i++) {
      const sm = this.samples[i];
      const lift = W * Math.tan(sm.bank);
      const inner = sm.pos.add(sm.outward.scale(-W / 2));
      const outer = sm.pos.add(sm.outward.scale(W / 2));
      outer.y = lift;
      positions.push(inner.x, inner.y, inner.z);
      positions.push(outer.x, outer.y, outer.z);
      const v = (i / SAMPLES) * (this.length / 6);
      uvs.push(0, v, 1, v);
    }
    for (let i = 0; i < SAMPLES; i++) {
      const n = (i + 1) % SAMPLES;
      const a = i * 2, b = i * 2 + 1, c = n * 2, d = n * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }

    const mesh = new Mesh("trackSurface", this.scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    vd.normals = normals;
    vd.uvs = uvs;
    vd.applyToMesh(mesh);

    // packed red-clay racing surface (warm, saturated dirt — not gray concrete),
    // tied to this track's dirt colour with finer tiling so it reads as dirt
    const d = this.def.dirtColor;
    const clay = new Color3(d.r * 1.3, d.g * 0.85, d.b * 0.62); // warm, saturated red clay
    const mat = makeDirtPBR(this.scene, "trackMat", 4, Math.max(8, Math.round(this.length / 14)), clay);
    mat.roughness = 0.9;
    mesh.material = mat;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();

    const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, this.scene);
    const shape = new PhysicsShapeMesh(mesh, this.scene);
    shape.material = { friction: 0.9, restitution: 0.02 };
    shape.filterMembershipMask = GROUP_GROUND;
    body.shape = shape;
    return mesh;
  }

  private buildInfieldOutfield(shadow: ShadowGenerator | null) {
    void shadow;
    const ground = MeshBuilder.CreateGround("infield", { width: 400, height: 400, subdivisions: 4 }, this.scene);
    ground.position.y = -0.05;
    // reddish clay infield/outfield, tinted from the track's dirt color
    const mat = makeDirtPBR(this.scene, "infieldMat", 36, 36, this.def.dirtColor.scale(1.15));
    ground.material = mat;
    ground.receiveShadows = true;
    ground.isPickable = false;
    ground.freezeWorldMatrix();

    const body = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, this.scene);
    const shape = new PhysicsShapeMesh(ground, this.scene);
    shape.filterMembershipMask = GROUP_GROUND;
    body.shape = shape;
  }

  /**
   * Grassed infield filling the inside of the oval — plain mowed grass, no decal.
   */
  private buildInfield() {
    const W = this.def.width;
    const y = -0.03; // just above the dirt base (-0.05), just below the track inner edge (~0)

    // Triangle-fan the inner-edge loop into a filled grass surface (the infield is convex).
    const positions: number[] = [0, y, 0];
    const uvs: number[] = [0.5, 0.5];
    const tile = 0.06;
    for (let i = 0; i < SAMPLES; i++) {
      const sm = this.samples[i];
      const p = sm.pos.add(sm.outward.scale(-W / 2 + 0.05)); // hold just inside the apron
      positions.push(p.x, y, p.z);
      uvs.push(0.5 + p.x * tile, 0.5 + p.z * tile);
    }
    const indices: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      indices.push(0, 1 + ((i + 1) % SAMPLES), 1 + i); // CW from above -> normal points up
    }
    const grass = new Mesh("infieldGrass", this.scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    vd.normals = normals;
    vd.uvs = uvs;
    vd.applyToMesh(grass);
    const gmat = makeDirtPBR(this.scene, "infieldGrassMat", 26, 26, new Color3(0.34, 0.52, 0.22)); // mowed grass green
    gmat.roughness = 0.95;
    grass.material = gmat;
    grass.receiveShadows = true;
    grass.isPickable = false;
    grass.freezeWorldMatrix();

    // Logo "sprayed" onto the grass: matte, faded, alpha-blended, sitting on the surface.
    const R = this.def.cornerRadius;
    const logoMat = new PBRMaterial("infieldLogoMat", this.scene);
    const tex = new Texture(logoUrl, this.scene, false, false);
    tex.hasAlpha = true;
    tex.anisotropicFilteringLevel = 16;
    logoMat.albedoTexture = tex;
    logoMat.useAlphaFromAlbedoTexture = true;
    logoMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
    logoMat.alpha = 0.95; // bold sprayed paint, clearly readable
    logoMat.roughness = 1.0;
    logoMat.metallic = 0;
    logoMat.backFaceCulling = false;
    logoMat.emissiveTexture = tex; // a touch self-lit so it still reads under the lights at night
    logoMat.emissiveColor = new Color3(0.2, 0.2, 0.2);
    logoMat.zOffset = -8; // render on top of the grass without z-fighting

    // Fill most of the infield: the wordmark's long axis runs along the straights (z),
    // where there's far more room than across the short (x) axis. Size to whichever fits.
    const ASPECT = 2.85; // logo width : height
    const innerLen = this.def.straightLength + 2 * R - W; // infield length along the straights
    const innerWid = 2 * R - W; // infield width across
    const lw = Math.min(innerLen * 0.74, innerWid * 0.78 * ASPECT); // long axis, with a grass margin
    const logo = MeshBuilder.CreatePlane("infieldLogo", { width: lw, height: lw / ASPECT }, this.scene);
    logo.rotation.x = -Math.PI / 2; // lay flat, image facing up (un-mirrored from above)
    logo.rotation.y = -Math.PI / 2; // run the wordmark along the straights, readable from the stand (flipped 180°)
    logo.position.set(0, y + 0.015, 0);
    logo.material = logoMat;
    logo.isPickable = false;
    logo.freezeWorldMatrix();
  }

  private buildWalls(shadow: ShadowGenerator | null) {
    const W = this.def.width;
    const wallMat = new PBRMaterial("wallMat", this.scene);
    wallMat.albedoColor = new Color3(0.82, 0.82, 0.85);
    wallMat.roughness = 0.6;
    wallMat.metallic = 0;
    const fenceMat = new PBRMaterial("fenceMat", this.scene);
    fenceMat.albedoColor = new Color3(0.5, 0.5, 0.55);
    fenceMat.alpha = 0.25;
    fenceMat.roughness = 0.4;

    const makeRibbon = (offset: number, height: number, mat: PBRMaterial, yBase: number) => {
      const path: Vector3[][] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const sm = this.samples[i % SAMPLES];
        const lift = sm.bank > 0 ? W * Math.tan(sm.bank) * (offset > 0 ? 1 : 0) : 0;
        const base = sm.pos.add(sm.outward.scale(offset));
        base.y = yBase + lift;
        const top = base.add(new Vector3(0, height, 0));
        path.push([base, top]);
      }
      const ribbon = MeshBuilder.CreateRibbon("wall", { pathArray: path, closeArray: true, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
      ribbon.material = mat;
      ribbon.receiveShadows = true;
      ribbon.isPickable = false;
      ribbon.freezeWorldMatrix();
      if (shadow) shadow.addShadowCaster(ribbon);
      return ribbon;
    };

    makeRibbon(W / 2 + 0.4, 0.7, wallMat, 0); // outer wall
    makeRibbon(W / 2 + 0.45, 2.6, fenceMat, 0.7); // catch fence above outer wall
    makeRibbon(-W / 2 - 0.4, 0.5, wallMat, 0); // inner wall

    this.buildWallDetail(shadow);
  }

  /**
   * Visual-only relief on the OUTER barrier — a concrete-panel seam read on the wall face,
   * a slim Armco guardrail band riding the top of the wall, and evenly-spaced support posts
   * carrying the catch fence. All clamped OUTSIDE the outer wall (>= W/2 + 0.4) so nothing
   * reaches inboard of the outfield or touches the racing surface. Not collidable.
   */
  private buildWallDetail(shadow: ShadowGenerator | null) {
    const W = this.def.width;
    const wallOff = W / 2 + 0.4;

    // --- panel-seam read: a darker rail strip part-way up the wall, broken into panels by tone ---
    const panelTex = new DynamicTexture("wallPanelTex", { width: 1024, height: 32 }, this.scene, false);
    const pctx = panelTex.getContext() as CanvasRenderingContext2D;
    const panels = 64, pw = 1024 / panels;
    for (let i = 0; i < panels; i++) {
      const shade = 0.62 + (i % 2) * 0.1; // alternate panel tone
      const g = Math.round(shade * 255);
      pctx.fillStyle = `rgb(${g},${g},${Math.round(g * 1.03)})`;
      pctx.fillRect(i * pw, 0, pw, 32);
      pctx.fillStyle = "rgba(20,20,24,0.9)"; // seam line between panels
      pctx.fillRect(i * pw, 0, 2, 32);
    }
    panelTex.update();
    panelTex.wrapU = Texture.WRAP_ADDRESSMODE;
    panelTex.uScale = Math.round(this.length / 4);
    panelTex.anisotropicFilteringLevel = 16;

    const panelMat = new PBRMaterial("wallPanelMat", this.scene);
    panelMat.albedoTexture = panelTex;
    panelMat.roughness = 0.75; panelMat.metallic = 0;
    const panelPath: Vector3[][] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const sm = this.samples[i % SAMPLES];
      const lift = sm.bank > 0 ? W * Math.tan(sm.bank) : 0;
      const base = sm.pos.add(sm.outward.scale(wallOff + 0.01)); base.y = 0.18 + lift;
      const top = base.add(new Vector3(0, 0.34, 0));
      panelPath.push([base, top]);
    }
    const panelBand = MeshBuilder.CreateRibbon("wallPanels", { pathArray: panelPath, closeArray: true, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    panelBand.material = panelMat;
    panelBand.receiveShadows = true;
    panelBand.isPickable = false;
    panelBand.freezeWorldMatrix();

    // --- Armco guardrail band riding the top lip of the outer wall (metallic, catches bloom) ---
    const armcoMat = new PBRMaterial("armcoMat", this.scene);
    armcoMat.albedoColor = new Color3(0.7, 0.72, 0.76);
    armcoMat.roughness = 0.35; armcoMat.metallic = 0.55;
    const armcoPath: Vector3[][] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const sm = this.samples[i % SAMPLES];
      const lift = sm.bank > 0 ? W * Math.tan(sm.bank) : 0;
      const base = sm.pos.add(sm.outward.scale(wallOff + 0.02)); base.y = 0.56 + lift;
      const top = base.add(new Vector3(0, 0.14, 0));
      armcoPath.push([base, top]);
    }
    const armco = MeshBuilder.CreateRibbon("armcoRail", { pathArray: armcoPath, closeArray: true, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    armco.material = armcoMat;
    armco.receiveShadows = true;
    armco.isPickable = false;
    armco.freezeWorldMatrix();
    if (shadow) shadow.addShadowCaster(armco);

    // --- fence support posts every ~9u around the outfield, just outside the wall ---
    const postMat = new PBRMaterial("fencePostMat", this.scene);
    postMat.albedoColor = new Color3(0.32, 0.33, 0.36);
    postMat.roughness = 0.55; postMat.metallic = 0.3;
    const proto = MeshBuilder.CreateBox("fencePostProto", { width: 0.12, height: 3.3, depth: 0.12 }, this.scene);
    proto.material = postMat;
    proto.isPickable = false;
    proto.isVisible = false;
    const spacing = 9;
    const count = Math.max(8, Math.round(this.length / spacing));
    for (let i = 0; i < count; i++) {
      const s = (i / count) * this.length;
      const sm = this.sampleAt(s);
      const lift = sm.bank > 0 ? W * Math.tan(sm.bank) : 0;
      const inst = proto.createInstance("fencePost" + i);
      const p = sm.pos.add(sm.outward.scale(wallOff + 0.06));
      inst.position = new Vector3(p.x, lift + 1.65, p.z);
      inst.rotation.y = Math.atan2(sm.tangent.x, sm.tangent.z);
      inst.isPickable = false;
      inst.freezeWorldMatrix();
      if (shadow) shadow.addShadowCaster(inst);
    }
  }

  /**
   * Purely-visual berm / dirt cushion hint riding the OUTER shoulder of the racing surface
   * through the two turns only — a low, soft ridge of piled clay sitting outboard of the
   * top groove (between the cushion and the wall). It is NOT collidable and NOT on the
   * racing line; the surface raycast + banking geometry are untouched.
   */
  private buildBerm() {
    const W = this.def.width;
    const inner: Vector3[] = [];
    const outer: Vector3[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const sm = this.samples[i % SAMPLES];
      // berm only where the track is banked (the turns); the smoothed bank tapers it in/out
      const h = sm.bank > 0.001 ? 0.22 : 0.0;
      const lift = W * Math.tan(sm.bank);
      const yTop = lift + h;            // crest, just proud of the banked outer edge
      const a = sm.pos.add(sm.outward.scale(W * 0.49)); a.y = lift + 0.01; // toe, at the surface edge
      const b = sm.pos.add(sm.outward.scale(W * 0.5 + 0.32)); b.y = yTop;  // crest, outboard toward the wall
      inner.push(a); outer.push(b);
    }
    const berm = MeshBuilder.CreateRibbon("cornerBerm", { pathArray: [inner, outer], closePath: true, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    const d = this.def.dirtColor;
    const mat = new PBRMaterial("bermMat", this.scene);
    mat.albedoColor = new Color3(d.r * 1.15, d.g * 0.8, d.b * 0.6); // piled clay, a touch warmer/lighter than the surface
    mat.roughness = 0.95; mat.metallic = 0;
    mat.zOffset = -2;
    berm.material = mat;
    berm.receiveShadows = true;
    berm.isPickable = false;
    berm.freezeWorldMatrix();
  }

  private buildStartFinish() {
    const W = this.def.width;
    const sm = this.sampleAt(this.startFinishS);
    const yaw = Math.atan2(sm.tangent.x, sm.tangent.z);

    // Painted start/finish stripe — a crisp checkered band spanning the width,
    // drawn into a dynamic texture so the night lighting + bloom catch the white.
    const dt = new DynamicTexture("sfTex", { width: 512, height: 64 }, this.scene, true);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, 512, 64);
    const cols = 16, rows = 2, cw = 512 / cols, ch = 64 / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#f2f2f2" : "#141414";
        ctx.fillRect(c * cw, r * ch, cw, ch);
      }
    }
    dt.update();

    const line = MeshBuilder.CreateBox("sfLine", { width: W, height: 0.02, depth: 1.4 }, this.scene);
    line.position = sm.pos.clone();
    line.position.y = 0.035;
    line.rotation.y = yaw;
    const mat = new PBRMaterial("sfMat", this.scene);
    mat.albedoTexture = dt;
    mat.emissiveTexture = dt; mat.emissiveColor = new Color3(0.18, 0.18, 0.18); // faint glow so it reads at night
    mat.roughness = 0.45; mat.metallic = 0;
    line.material = mat;
    line.isPickable = false;
    line.freezeWorldMatrix();

    // Thin solid painted lines just up- and down-track of the checkers (the "scoring line"
    // read), plus a slim apron curb dash on the inside edge — purely cosmetic, sits on the surface.
    const stripeMat = new PBRMaterial("sfStripeMat", this.scene);
    stripeMat.albedoColor = new Color3(0.93, 0.93, 0.95);
    stripeMat.emissiveColor = new Color3(0.1, 0.1, 0.1);
    stripeMat.roughness = 0.5; stripeMat.metallic = 0;
    for (const off of [-1.5, 1.5]) {
      const s2 = (this.startFinishS + off + this.length) % this.length;
      const m2 = this.sampleAt(s2);
      const stripe = MeshBuilder.CreateBox("sfStripe", { width: W, height: 0.02, depth: 0.18 }, this.scene);
      stripe.position = m2.pos.clone(); stripe.position.y = 0.032;
      stripe.rotation.y = Math.atan2(m2.tangent.x, m2.tangent.z);
      stripe.material = stripeMat;
      stripe.isPickable = false;
      stripe.freezeWorldMatrix();
    }

    // Red/white inner-apron curbing under the S/F (alternating short blocks) — the painted
    // "curb" read at the line, held on the apron well inside the racing groove.
    const curbMat = new PBRMaterial("sfCurbMat", this.scene);
    curbMat.albedoColor = new Color3(0.8, 0.12, 0.12);
    curbMat.emissiveColor = new Color3(0.08, 0.01, 0.01);
    curbMat.roughness = 0.6; curbMat.metallic = 0;
    for (let i = -2; i <= 2; i++) {
      const s2 = (this.startFinishS + i * 0.55 + this.length) % this.length;
      const m2 = this.sampleAt(s2);
      const c = m2.pos.add(m2.outward.scale(-W * 0.46)); c.y = 0.04;
      const blk = MeshBuilder.CreateBox("sfCurb", { width: W * 0.06, height: 0.04, depth: 0.4 }, this.scene);
      blk.position = c;
      blk.rotation.y = Math.atan2(m2.tangent.x, m2.tangent.z);
      blk.material = (i % 2 === 0) ? curbMat : stripeMat;
      blk.isPickable = false;
      blk.freezeWorldMatrix();
    }
  }

  /** Nearest-centerline projection for laps/AI/camera. */
  project(point: Vector3): TrackProjection {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < SAMPLES; i++) {
      const dx = this.samples[i].pos.x - point.x;
      const dz = this.samples[i].pos.z - point.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    const sm = this.samples[best];
    const lateral = Vector3.Dot(point.subtract(sm.pos), sm.outward);
    return { s: (best / SAMPLES) * this.length, lateral, center: sm.pos, tangent: sm.tangent, outward: sm.outward, bank: sm.bank };
  }

  /** Down-sampled centerline (x,z) for the minimap. */
  outline(step = 6): { x: number; z: number }[] {
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i < SAMPLES; i += step) pts.push({ x: this.samples[i].pos.x, z: this.samples[i].pos.z });
    return pts;
  }

  sampleAt(s: number): TrackSample {
    const i = Math.floor(((s % this.length) / this.length) * SAMPLES + SAMPLES) % SAMPLES;
    return this.samples[i];
  }

  /** Grid start position for car index (staggered double-file behind the start/finish line). */
  gridPose(index: number): { pos: Vector3; yaw: number } {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const s = (this.startFinishS - 6 - row * 4 + this.length) % this.length;
    const sm = this.sampleAt(s);
    const lateralOff = col === 0 ? -this.def.width * 0.22 : this.def.width * 0.22;
    const pos = sm.pos.add(sm.outward.scale(lateralOff));
    pos.y = 0.6;
    const yaw = Math.atan2(sm.tangent.x, sm.tangent.z);
    return { pos, yaw };
  }
}
