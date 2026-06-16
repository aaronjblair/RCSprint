/**
 * MotorSound — a subtle, procedural ELECTRIC sprint-car motor for the player's car.
 *
 * Real 1/10 brushless RC sprinters don't roar; they SCREAM. The note you hear is the ESC
 * pulse-width-modulating the motor — a high whine whose pitch tracks motor RPM — over a gear-mesh
 * whir, with a faint tire-on-dirt hiss. We emulate that entirely with the Web Audio API (no audio
 * file to ship): a sawtooth motor fundamental + a detuned higher "ESC whine" + a sub for body, run
 * through a low-pass that opens with throttle, plus a touch of band-passed noise that grows with
 * speed. Everything sits under a low master-gain cap so it stays subtle.
 *
 * Browser autoplay policy: the AudioContext starts suspended; call resume() from a user gesture.
 */

type Ctx = AudioContext;

const MUTE_KEY = "rcsprint.muted";

export class MotorSound {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private filter!: BiquadFilterNode;

  private fund!: OscillatorNode;   // motor fundamental (gear/RPM)
  private whine!: OscillatorNode;  // higher ESC/PWM scream
  private sub!: OscillatorNode;    // an octave down for a little body
  private noise!: AudioBufferSourceNode; // tire-on-dirt hiss
  private gFund!: GainNode;
  private gWhine!: GainNode;
  private gSub!: GainNode;
  private gNoise!: GainNode;

  private started = false;
  private _muted = false;

  constructor() {
    this._muted = (() => { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; } })();
    try {
      const AC: typeof AudioContext | undefined =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return; // no Web Audio (very old browser / headless) — stay a silent no-op
      this.ctx = new AC();
      this.build();
    } catch {
      this.ctx = null; // never let audio init break the game
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    // master gain — the single subtlety cap and the mute switch
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 1;
    this.master.connect(ctx.destination);

    // a low-pass that opens up with throttle (muffled at idle, bright on the gas).
    // Keep the floor high enough that the note is actually audible (a too-low cutoff once
    // silenced the whole engine — "re-open the filter").
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 500;
    this.filter.Q.value = 0.9;
    this.filter.connect(this.master);

    const osc = (type: OscillatorType, peak: number, detune = 0): [OscillatorNode, GainNode] => {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g); g.connect(this.filter);
      void peak; // peak applied in update()
      return [o, g];
    };
    [this.fund, this.gFund] = osc("sawtooth", 0.05, +4);
    [this.whine, this.gWhine] = osc("square", 0.022, -7); // the electric scream
    [this.sub, this.gSub] = osc("sawtooth", 0.03, 0);

    // tire / dirt hiss: 2s of looped white noise through the same filter
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass"; band.frequency.value = 2600; band.Q.value = 0.7;
    this.gNoise = ctx.createGain();
    this.gNoise.gain.value = 0;
    this.noise.connect(band); band.connect(this.gNoise); this.gNoise.connect(this.master);
  }

  /** Resume the context (call from a user gesture) and start the oscillators once. */
  resume(): void {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    this.fund.start(t); this.whine.start(t); this.sub.start(t); this.noise.start(t);
  }

  /**
   * Per-frame modulation from the PLAYER car only.
   * @param throttle 0..1 input throttle
   * @param speed    vehicle speed in world units/sec (~0..28)
   */
  update(throttle: number, speed: number): void {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    const spd01 = Math.min(1, Math.max(0, speed / 26));
    const load = Math.min(1, Math.max(0, throttle));
    // motor RPM is mostly speed, nudged up by throttle so it responds before the car moves
    const rpm = Math.min(1, Math.max(spd01, load * 0.7));

    const f = 90 + rpm * 360; // ~90 (idle) .. 450 Hz fundamental
    const k = 0.06;           // smoothing time-constant — kills zipper noise
    this.fund.frequency.setTargetAtTime(f, t, k);
    this.whine.frequency.setTargetAtTime(f * 4.5, t, k); // the high electric scream
    this.sub.frequency.setTargetAtTime(f * 0.5, t, k);
    this.filter.frequency.setTargetAtTime(500 + rpm * 4200, t, k);

    const eng = 0.25 + rpm * 0.75; // idle hum floor so it's never dead silent while racing
    const gk = 0.08;
    this.gFund.gain.setTargetAtTime(0.05 * eng, t, gk);
    this.gWhine.gain.setTargetAtTime(0.022 * Math.max(load, spd01), t, gk); // whine mostly under load
    this.gSub.gain.setTargetAtTime(0.028 * eng, t, gk);
    this.gNoise.gain.setTargetAtTime(0.012 * spd01, t, gk);
  }

  setMuted(m: boolean): void {
    this._muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  toggleMuted(): boolean { this.setMuted(!this._muted); return this._muted; }
  get muted(): boolean { return this._muted; }
}
