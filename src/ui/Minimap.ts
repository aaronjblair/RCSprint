import type { OvalTrack } from "../track/OvalTrack";

/** Corner minimap: draws the oval and live car dots. */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private outline: { x: number; z: number }[];
  private bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  private size = 150;
  private pad = 12;

  constructor(parent: HTMLElement, track: OvalTrack) {
    this.outline = track.outline(4);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of this.outline) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    this.bounds = { minX, maxX, minZ, maxZ };

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.size; this.canvas.height = this.size;
    this.canvas.style.cssText =
      "position:absolute;top:64px;right:14px;background:rgba(0,0,0,0.35);border-radius:10px;";
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
  }

  private toPx(x: number, z: number): [number, number] {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const w = maxX - minX || 1, h = maxZ - minZ || 1;
    const s = (this.size - this.pad * 2) / Math.max(w, h);
    const ox = (this.size - w * s) / 2, oz = (this.size - h * s) / 2;
    // flip z so +z is up
    return [ox + (x - minX) * s, this.size - (oz + (z - minZ) * s)];
  }

  update(cars: { x: number; z: number; color: string; isPlayer: boolean }[]) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);
    // track band
    ctx.strokeStyle = "rgba(220,220,230,0.55)";
    ctx.lineWidth = 7;
    ctx.lineJoin = "round";
    ctx.beginPath();
    this.outline.forEach((p, i) => {
      const [px, py] = this.toPx(p.x, p.z);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
    // dark groove
    ctx.strokeStyle = "rgba(40,30,25,0.6)"; ctx.lineWidth = 3; ctx.stroke();

    for (const c of cars) {
      const [px, py] = this.toPx(c.x, c.z);
      ctx.beginPath();
      ctx.arc(px, py, c.isPlayer ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.fill();
      if (c.isPlayer) { ctx.lineWidth = 1.5; ctx.strokeStyle = "#fff"; ctx.stroke(); }
    }
  }
}
