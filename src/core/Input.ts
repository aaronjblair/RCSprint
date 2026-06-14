/**
 * Unified driver input from gamepad (primary) and keyboard (fallback).
 * Produces analog throttle/brake/steer in [-1,1] / [0,1].
 */
export interface DriveInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. 1 (right)
  reset: boolean; // request car reset
  usingGamepad: boolean;
}

export class InputManager {
  private keys = new Set<string>();
  private padIndex: number | null = null;
  private prevReset = false;

  constructor() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("gamepadconnected", (e) => {
      this.padIndex = e.gamepad.index;
      console.log(`[RCSprint] gamepad connected: ${e.gamepad.id}`);
    });
    window.addEventListener("gamepaddisconnected", () => (this.padIndex = null));
  }

  private deadzone(v: number, dz = 0.12): number {
    return Math.abs(v) < dz ? 0 : v;
  }

  sample(): DriveInput {
    // --- Gamepad first ---
    if (this.padIndex !== null) {
      const pad = navigator.getGamepads?.()[this.padIndex];
      if (pad) {
        const steer = this.deadzone(pad.axes[0] ?? 0);
        // Triggers: standard mapping buttons 7 (RT throttle) / 6 (LT brake)
        const throttle = pad.buttons[7]?.value ?? 0;
        const brake = pad.buttons[6]?.value ?? 0;
        const reset = (pad.buttons[3]?.pressed ?? false) || (pad.buttons[8]?.pressed ?? false);
        const justReset = reset && !this.prevReset;
        // Only hand control to the pad once the driver actually inputs throttle,
        // brake, or a button — prevents a drifting/idle stick from hijacking keys.
        const anyButton = pad.buttons.some((b) => b.pressed);
        if (throttle > 0.05 || brake > 0.05 || anyButton) {
          this.prevReset = reset;
          return { throttle, brake, steer, reset: justReset, usingGamepad: true };
        }
      }
    }

    // --- Keyboard fallback ---
    const up = this.keys.has("ArrowUp") || this.keys.has("KeyW");
    const down = this.keys.has("ArrowDown") || this.keys.has("KeyS");
    const left = this.keys.has("ArrowLeft") || this.keys.has("KeyA");
    const right = this.keys.has("ArrowRight") || this.keys.has("KeyD");
    const resetKey = this.keys.has("KeyR");
    const justReset = resetKey && !this.prevReset;
    this.prevReset = resetKey;
    return {
      throttle: up ? 1 : 0,
      brake: down ? 1 : 0,
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      reset: justReset,
      usingGamepad: false,
    };
  }
}
