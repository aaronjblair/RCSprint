/**
 * Lightweight synthesized audio (no asset files): a brushless-motor whine whose
 * pitch tracks speed, plus a tire-scrub noise when the car slides. Must be
 * created after a user gesture (the Start button) so the AudioContext can run.
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private oscA!: OscillatorNode;
  private oscB!: OscillatorNode;
  private motorGain!: GainNode;
  private filter!: BiquadFilterNode;
  private scrub!: GainNode;

  start() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(c.destination);

    // motor: two detuned saws through a lowpass
    this.filter = c.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 700;
    this.motorGain = c.createGain();
    this.motorGain.gain.value = 0.0;
    this.filter.connect(this.motorGain);
    this.motorGain.connect(this.master);

    this.oscA = c.createOscillator(); this.oscA.type = "sawtooth"; this.oscA.frequency.value = 120;
    this.oscB = c.createOscillator(); this.oscB.type = "sawtooth"; this.oscB.frequency.value = 121.5;
    this.oscA.connect(this.filter); this.oscB.connect(this.filter);
    this.oscA.start(); this.oscB.start();

    // tire scrub: filtered white noise
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const nf = c.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1600; nf.Q.value = 0.7;
    this.scrub = c.createGain(); this.scrub.gain.value = 0;
    noise.connect(nf); nf.connect(this.scrub); this.scrub.connect(this.master);
    noise.start();
  }

  /** speed in u/s, throttle 0..1, slip lateral magnitude. */
  update(speed: number, throttle: number, slip: number) {
    if (!this.ctx) return;
    const f = 110 + speed * 42;
    this.oscA.frequency.value = f;
    this.oscB.frequency.value = f * 1.01 + 1.5;
    this.filter.frequency.value = 500 + speed * 120;
    this.motorGain.gain.value = 0.03 + throttle * 0.06 + Math.min(0.04, speed * 0.004);
    this.scrub.gain.value = Math.min(0.12, Math.max(0, slip - 0.6) * 0.05);
  }
}
