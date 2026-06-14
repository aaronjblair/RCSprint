import type { TrackDef } from "./TrackDef";

/**
 * Models how a dirt oval evolves over a race: starts tacky (high grip
 * everywhere), rubbers into a fast "blue groove" near the inside line, then
 * goes dry-slick off-line as the race wears on. Returns a grip multiplier for
 * a car given its lateral position and overall race progress.
 */
export class SurfaceModel {
  private slick = 0; // 0 fresh .. 1 fully slick/dry
  private grooveLateral: number;

  constructor(private def: TrackDef) {
    // the groove sits a bit below center (toward the inside)
    this.grooveLateral = -def.width * 0.12;
  }

  /** Advance surface state by race progress fraction (0..1). */
  update(raceFraction: number) {
    this.slick = Math.min(1, raceFraction * (0.6 + this.def.gripFalloff * 12));
  }

  get state(): string {
    return this.slick < 0.25 ? "tacky" : this.slick < 0.6 ? "blue groove" : this.slick < 0.85 ? "slick" : "dry slick";
  }

  /** Grip multiplier at a given lateral offset from centerline. */
  gripAt(lateral: number): number {
    const halfW = this.def.width / 2;
    const distFromGroove = Math.abs(lateral - this.grooveLateral) / halfW; // 0 on line .. ~1 at edge
    // on the groove you keep grip; off-line gets slick as the race wears on
    const offLinePenalty = this.slick * Math.min(1, distFromGroove) * 0.35;
    const tacky = (1 - this.slick) * 0.06; // early extra bite
    return Math.max(0.6, 1 + tacky - this.slick * 0.12 - offLinePenalty);
  }
}
