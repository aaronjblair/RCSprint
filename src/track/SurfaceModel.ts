import type { TrackDef } from "./TrackDef";

/**
 * Models how a dirt oval evolves over a race. It supports TWO racing grooves:
 * a fast BOTTOM (inside) line that rubbers in and is the place to be early, and
 * a TOP CUSHION (a berm of piled, dry dirt near the outer wall) that "comes in"
 * as the track slicks off and is the fast line late in a run. In between and at
 * the very edges the surface is loose/slick. gripAt() returns a grip multiplier
 * for a car at a given lateral offset, so the racing line genuinely migrates
 * from the bottom to the cushion over a race — which is what the AI races on.
 */
export class SurfaceModel {
  private slick = 0; // 0 fresh .. 1 fully slick/dry
  readonly bottomLateral: number; // inside groove
  readonly cushionLateral: number; // top berm

  constructor(private def: TrackDef) {
    this.bottomLateral = -def.width * 0.18;
    this.cushionLateral = def.width * 0.3;
  }

  /** Advance surface state by race progress fraction (0..1). */
  update(raceFraction: number) {
    this.slick = Math.min(1, raceFraction * (0.6 + this.def.gripFalloff * 12));
  }

  /** 0 fresh/tacky .. 1 fully dry-slick. Drives where the fast line lives. */
  get slickness(): number {
    return this.slick;
  }

  get state(): string {
    return this.slick < 0.25 ? "tacky" : this.slick < 0.55 ? "blue groove" : this.slick < 0.82 ? "slick" : "dry slick";
  }

  /** Grip multiplier at a given lateral offset from centerline. */
  gripAt(lateral: number): number {
    const halfW = this.def.width / 2;
    const bell = (c: number, wd: number) => Math.exp(-(((lateral - c) / (halfW * wd)) ** 2));
    // bottom is best early and fades; the cushion is loose early and comes alive late
    const bottomQ = 1.05 - this.slick * 0.16; // 1.05 -> 0.89
    const cushionQ = 0.84 + this.slick * 0.34; // 0.84 -> 1.18
    const bottom = bottomQ * bell(this.bottomLateral, 0.5);
    const cushion = cushionQ * bell(this.cushionLateral, 0.45);
    const offLine = 0.72 - this.slick * 0.08; // loose dirt between/away from the grooves
    const tacky = (1 - this.slick) * 0.04; // early extra bite everywhere
    return Math.max(0.6, Math.min(1.25, Math.max(bottom, cushion, offLine) + tacky));
  }
}
