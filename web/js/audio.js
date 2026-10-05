// Mochi's voice and the room's sounds, synthesised with WebAudio. Display only: what Mochi
// hears is the world's own sound state, not this module.

export class Sound {
  constructor() { this.ctx = null; this.on = false; this.purrGain = null; }

  enable(on) {
    this.on = on;
    if (on && !this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const purr = this.ctx.createOscillator(), shape = this.ctx.createBiquadFilter();
      purr.type = "sawtooth"; purr.frequency.value = 27;
      shape.type = "lowpass"; shape.frequency.value = 150;
      this.purrGain = this.ctx.createGain(); this.purrGain.gain.value = 0;
      purr.connect(shape).connect(this.purrGain).connect(this.master);
      purr.start();
    }
    if (this.ctx) {
      if (on) this.ctx.resume(); else this.ctx.suspend();
    }
  }

  tone(frequency, start, length, { type = "sine", to = null, gain = 0.2 } = {}) {
    if (!this.on) return;
    const t = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator(), amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + length);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, length / 3));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(amp).connect(this.master);
    osc.start(t); osc.stop(t + length + 0.02);
  }

  noise(start, length, { gain = 0.2, frequency = 1800 } = {}) {
    if (!this.on) return;
    const t = this.ctx.currentTime + start, frames = Math.ceil(this.ctx.sampleRate * length);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), amp = this.ctx.createGain();
    source.buffer = buffer; filter.type = "bandpass"; filter.frequency.value = frequency; amp.gain.value = gain;
    source.connect(filter).connect(amp).connect(this.master);
    source.start(t);
  }

  // four spoken-sounding words: two or three notes each, a different contour per word
  word(index) {
    const shapes = [[392, 523], [587, 440, 587], [349, 349, 466], [659, 494]];
    shapes[index % shapes.length].forEach((f, i) => this.tone(f, i * 0.13, 0.16, { type: "triangle", to: f * 1.06, gain: 0.22 }));
  }
  whistle() { this.tone(1250, 0, 0.22, { to: 1900, gain: 0.16 }); this.tone(1900, 0.2, 0.2, { to: 1500, gain: 0.14 }); }
  clap() { this.noise(0, 0.09, { gain: 0.5, frequency: 1500 }); }
  meow() { this.tone(520, 0, 0.16, { type: "triangle", to: 820, gain: 0.16 }); this.tone(820, 0.15, 0.3, { type: "triangle", to: 560, gain: 0.14 }); }
  squeak() { this.tone(2100, 0, 0.07, { to: 2600, gain: 0.07 }); }
  crunch() { this.noise(0, 0.05, { gain: 0.22, frequency: 2600 }); this.noise(0.09, 0.05, { gain: 0.18, frequency: 2200 }); }
  lap() { this.tone(300, 0, 0.06, { to: 520, gain: 0.08 }); }
  rattle() { for (let i = 0; i < 6; i++) this.noise(i * 0.05, 0.04, { gain: 0.16, frequency: 3200 }); }
  pop() { this.tone(240, 0, 0.09, { to: 520, gain: 0.14 }); }
  good() { this.tone(660, 0, 0.12, { gain: 0.16 }); this.tone(990, 0.1, 0.2, { gain: 0.16 }); }
  no() { this.tone(180, 0, 0.22, { type: "square", to: 120, gain: 0.1 }); }
  yuck() { this.tone(300, 0, 0.25, { type: "sawtooth", to: 150, gain: 0.1 }); }
  purr(level) { if (this.on && this.purrGain) this.purrGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.25); }
}
