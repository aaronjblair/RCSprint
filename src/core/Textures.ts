import { Scene } from "@babylonjs/core/scene";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

/**
 * Procedural, tileable dirt textures drawn on a canvas — no external assets.
 * Returns an albedo (color + speckle) and a fine bump for surface micro-relief.
 */
export function makeDirtTextures(scene: Scene, tile = 40): { albedo: DynamicTexture; bump: DynamicTexture } {
  const S = 512;

  // --- albedo ---
  const albedo = new DynamicTexture("dirtAlbedo", { width: S, height: S }, scene, true);
  const a = albedo.getContext() as CanvasRenderingContext2D;
  // base gradient brown
  a.fillStyle = "#5a3d27";
  a.fillRect(0, 0, S, S);
  // broad tonal patches
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 30 + Math.random() * 90;
    const shade = 0.7 + Math.random() * 0.5;
    const g = a.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${90 * shade | 0},${62 * shade | 0},${40 * shade | 0},0.5)`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    a.fillStyle = g;
    a.fillRect(0, 0, S, S);
  }
  // fine speckle / gravel
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * S, y = Math.random() * S, s = Math.random() * 2.2;
    const v = Math.random();
    const c = v < 0.5 ? [40, 27, 17] : v < 0.85 ? [110, 80, 55] : [150, 120, 90];
    a.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.4 + Math.random() * 0.4})`;
    a.fillRect(x, y, s, s);
  }
  albedo.update();

  // --- bump (fine grayscale) ---
  const bump = new DynamicTexture("dirtBump", { width: S, height: S }, scene, true);
  const b = bump.getContext() as CanvasRenderingContext2D;
  b.fillStyle = "#808080";
  b.fillRect(0, 0, S, S);
  for (let i = 0; i < 20000; i++) {
    const x = Math.random() * S, y = Math.random() * S, s = Math.random() * 2.5;
    const g = 128 + (Math.random() * 2 - 1) * 70;
    b.fillStyle = `rgb(${g | 0},${g | 0},${g | 0})`;
    b.fillRect(x, y, s, s);
  }
  bump.update();

  for (const t of [albedo, bump]) {
    t.wrapU = Texture.WRAP_ADDRESSMODE;
    t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.uScale = tile;
    t.vScale = tile;
  }
  return { albedo, bump };
}
