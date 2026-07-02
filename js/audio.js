// Fully synthesized WebAudio SFX — no audio files needed.
// All one-shots accept (vol, pan) for cheap 3D positioning.

class SfxEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
    this._noiseBuf = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6; comp.knee.value = 12;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    // shared noise buffer (2s white noise)
    const len = this.ctx.sampleRate * 2;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _out(vol = 1, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (Math.abs(pan) > 0.01 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); p.connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  _noise(dest, dur, { f0 = 1000, f1 = null, q = 1, type = 'bandpass', a = 0.002, peak = 1, delay = 0 } = {}) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type; filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    if (f1 !== null) filt.frequency.exponentialRampToValueAtTime(Math.max(f1, 30), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(dest);
    src.start(t); src.stop(t + dur + 0.05);
  }

  _tone(dest, dur, { f0 = 440, f1 = null, type = 'sine', a = 0.003, peak = 1, delay = 0 } = {}) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---- weapon ----
  shot() { // player's own rifle: crack + boom + echo tail
    if (!this.ctx) return;
    const out = this._out(1);
    this._noise(out, 0.09, { f0: 5200, f1: 1400, q: 0.6, peak: 1.0, a: 0.001 });          // supersonic crack
    this._noise(out, 0.32, { f0: 900, f1: 160, q: 0.8, peak: 0.9 });                        // body
    this._tone(out, 0.34, { f0: 110, f1: 38, type: 'sine', peak: 1.1 });                    // boom
    this._tone(out, 0.18, { f0: 220, f1: 70, type: 'triangle', peak: 0.5 });
    // echo slaps off the buildings
    for (const [d, v] of [[0.22, 0.18], [0.4, 0.1], [0.62, 0.05]]) {
      const eg = this._out(v, (Math.random() - 0.5) * 1.4);
      const t = this.ctx.currentTime + d;
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      src.connect(f); f.connect(g); g.connect(eg);
      src.start(t); src.stop(t + 0.35);
    }
  }

  distantShot(vol = 0.5, pan = 0) { // another sniper firing across the map
    if (!this.ctx) return;
    const out = this._out(vol, pan);
    this._noise(out, 0.05, { f0: 2600, f1: 900, q: 0.7, peak: 0.7, a: 0.001 });
    this._noise(out, 0.45, { f0: 420, f1: 110, q: 0.7, peak: 0.85 });
    this._tone(out, 0.4, { f0: 90, f1: 36, type: 'sine', peak: 0.7 });
  }

  bolt() { // cycle the bolt: clack-clack
    if (!this.ctx) return;
    const out = this._out(0.5);
    this._noise(out, 0.045, { f0: 2400, q: 3, peak: 0.8, a: 0.001 });
    this._tone(out, 0.05, { f0: 1300, f1: 900, type: 'square', peak: 0.12 });
    this._noise(out, 0.05, { f0: 1800, q: 3, peak: 0.9, a: 0.001, });
    setTimeout(() => {
      if (!this.ctx) return;
      const o2 = this._out(0.5);
      this._noise(o2, 0.06, { f0: 1500, q: 2.5, peak: 1, a: 0.001 });
      this._tone(o2, 0.06, { f0: 800, f1: 500, type: 'square', peak: 0.12 });
    }, 150);
  }

  reload() {
    if (!this.ctx) return;
    const seq = [
      [0, () => { const o = this._out(0.5); this._noise(o, 0.06, { f0: 900, q: 2, peak: 0.9, a: 0.002 }); }],
      [250, () => { const o = this._out(0.45); this._noise(o, 0.05, { f0: 1600, q: 3, peak: 0.8, a: 0.001 }); }],
      [500, () => { const o = this._out(0.45); this._noise(o, 0.05, { f0: 1400, q: 3, peak: 0.8, a: 0.001 }); }],
      [1500, () => { const o = this._out(0.5); this._noise(o, 0.07, { f0: 1100, q: 2, peak: 1, a: 0.001 }); this._tone(o, 0.07, { f0: 600, f1: 380, type: 'square', peak: 0.1 }); }],
      [2100, () => { const o = this._out(0.55); this._noise(o, 0.06, { f0: 2000, q: 3, peak: 1, a: 0.001 }); }],
    ];
    seq.forEach(([d, fn]) => setTimeout(fn, d));
  }

  dryFire() {
    if (!this.ctx) return;
    const o = this._out(0.4);
    this._noise(o, 0.03, { f0: 2800, q: 4, peak: 0.7, a: 0.001 });
  }

  // ---- feedback ----
  hitmarker() {
    if (!this.ctx) return;
    const o = this._out(0.5);
    this._tone(o, 0.06, { f0: 1700, f1: 1250, type: 'square', peak: 0.18 });
  }
  headshot() {
    if (!this.ctx) return;
    const o = this._out(0.55);
    this._tone(o, 0.07, { f0: 2100, f1: 1500, type: 'square', peak: 0.18 });
    this._tone(o, 0.35, { f0: 2600, type: 'sine', peak: 0.25, delay: 0.04 });
  }
  killConfirm() {
    if (!this.ctx) return;
    const o = this._out(0.6);
    this._tone(o, 0.1, { f0: 620, type: 'triangle', peak: 0.3 });
    this._tone(o, 0.22, { f0: 930, type: 'triangle', peak: 0.3, delay: 0.09 });
  }
  damaged() {
    if (!this.ctx) return;
    const o = this._out(0.7);
    this._noise(o, 0.12, { f0: 500, f1: 200, q: 1, peak: 0.9, a: 0.002 });
    this._tone(o, 0.15, { f0: 180, f1: 90, type: 'sawtooth', peak: 0.25 });
  }
  death() {
    if (!this.ctx) return;
    const o = this._out(0.8);
    this._tone(o, 0.7, { f0: 220, f1: 40, type: 'sawtooth', peak: 0.3 });
    this._noise(o, 0.6, { f0: 800, f1: 100, q: 0.8, peak: 0.7 });
  }
  respawn() {
    if (!this.ctx) return;
    const o = this._out(0.4);
    this._tone(o, 0.12, { f0: 440, type: 'sine', peak: 0.25 });
    this._tone(o, 0.2, { f0: 660, type: 'sine', peak: 0.25, delay: 0.1 });
  }

  whiz(vol = 0.6, pan = 0) { // bullet snapping past your head
    if (!this.ctx) return;
    const o = this._out(vol, pan);
    this._noise(o, 0.16, { f0: 3400, f1: 500, q: 2.5, peak: 1, a: 0.004 });
  }

  impact(vol = 0.4, pan = 0) { // bullet striking stone/dirt
    if (!this.ctx) return;
    const o = this._out(vol, pan);
    this._noise(o, 0.09, { f0: 1600, f1: 300, q: 1.2, peak: 1, a: 0.001 });
    this._tone(o, 0.08, { f0: 160, f1: 70, type: 'sine', peak: 0.5 });
  }

  bodyHit(vol = 0.5, pan = 0) {
    if (!this.ctx) return;
    const o = this._out(vol, pan);
    this._noise(o, 0.08, { f0: 500, f1: 150, q: 1, type: 'lowpass', peak: 1, a: 0.001 });
    this._tone(o, 0.1, { f0: 120, f1: 60, type: 'sine', peak: 0.6 });
  }

  footstep(vol = 0.22, pan = 0) {
    if (!this.ctx) return;
    const o = this._out(vol * (0.8 + Math.random() * 0.4), pan);
    this._noise(o, 0.055, { f0: 300 + Math.random() * 200, q: 1, type: 'lowpass', peak: 0.9, a: 0.003 });
  }

  scopeIn() {
    if (!this.ctx) return;
    const o = this._out(0.3);
    this._noise(o, 0.05, { f0: 3000, q: 4, peak: 0.5, a: 0.002 });
  }
  scopeOut() {
    if (!this.ctx) return;
    const o = this._out(0.25);
    this._noise(o, 0.04, { f0: 2200, q: 4, peak: 0.5, a: 0.002 });
  }
  uiClick() {
    if (!this.ctx) return;
    const o = this._out(0.3);
    this._tone(o, 0.05, { f0: 900, f1: 700, type: 'square', peak: 0.12 });
  }
  breathIn() {
    if (!this.ctx) return;
    const o = this._out(0.22);
    this._noise(o, 0.5, { f0: 600, f1: 1400, q: 0.6, peak: 0.35, a: 0.2 });
  }
  heartbeat() {
    if (!this.ctx) return;
    const o = this._out(0.5);
    this._tone(o, 0.1, { f0: 70, f1: 45, type: 'sine', peak: 0.8 });
    this._tone(o, 0.09, { f0: 62, f1: 42, type: 'sine', peak: 0.6, delay: 0.16 });
  }

  // ================= menu music (fully synthesized ambient loop) =================
  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicGain && this.musicPlaying) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(v * 0.55, this.ctx.currentTime, 0.1);
    }
  }

  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    if (this.musicVolume === undefined) this.musicVolume = 0.5;
    this.musicPlaying = true;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(this.musicVolume * 0.55, ctx.currentTime + 2.5);
    g.connect(this.master);
    this.musicGain = g;
    this._musicNodes = [];

    // low drone: two detuned saws through a dark lowpass
    const droneG = ctx.createGain(); droneG.gain.value = 0.12;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 0.6;
    for (const f of [55, 55.4, 110.3]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = f > 100 ? 0.25 : 0.55;
      o.connect(og); og.connect(lp); o.start();
      this._musicNodes.push(o);
    }
    lp.connect(droneG); droneG.connect(g);

    // scheduler: eighth notes at ~68 bpm
    const beat8 = (60 / 68) / 2;
    this._musicStep = 0;
    this._musicNext = ctx.currentTime + 0.2;
    this._musicTimer = setInterval(() => {
      if (!this.musicPlaying) return;
      while (this._musicNext < ctx.currentTime + 1.4) {
        this._schedStep(this._musicNext);
        this._musicNext += beat8;
        this._musicStep++;
      }
    }, 300);
  }

  _schedStep(t) {
    const g = this.musicGain, s = this._musicStep;
    const delay = Math.max(0, t - this.ctx.currentTime);
    const bar = Math.floor(s / 16);
    const beat8 = s % 16;

    // soft low pulse on each bar
    if (beat8 === 0) this._tone(g, 0.6, { f0: 55, f1: 41, type: 'sine', peak: 0.5, a: 0.01, delay });

    // pad chord every 2 bars: Em -> D -> C -> B (phrygian cadence)
    if (s % 32 === 0) {
      const chords = [
        [164.81, 246.94, 329.63], [146.83, 220.0, 293.66],
        [130.81, 196.0, 261.63], [123.47, 185.0, 246.94]];
      for (const f of chords[(bar >> 1) % 4]) {
        this._tone(g, 3.6, { f0: f, type: 'triangle', peak: 0.045, a: 1.4, delay });
        this._tone(g, 3.6, { f0: f * 1.003, type: 'triangle', peak: 0.03, a: 1.6, delay });
      }
    }

    // sparse melody: E phrygian dominant, breathy sine with vibrato + echo
    if (beat8 % 4 === 2 && Math.random() < 0.5) {
      const scale = [329.63, 349.23, 415.30, 440.0, 493.88, 523.25, 587.33, 659.26];
      const f = scale[Math.floor(Math.random() * scale.length)];
      this._melNote(t, f, 1.1, 0.06);
      this._melNote(t + 0.42, f, 0.9, 0.022); // echo
      if (Math.random() < 0.3) this._melNote(t + 0.84, f * (Math.random() < 0.5 ? 0.749 : 1.0), 0.8, 0.012);
    }

    // faint shaker on offbeats
    if (beat8 % 2 === 1 && Math.random() < 0.35) {
      this._noise(g, 0.05, { f0: 5200, q: 1.5, peak: 0.05, a: 0.004, delay });
    }
  }

  _melNote(t, f, dur, peak) {
    const ctx = this.ctx, g = this.musicGain;
    if (t < ctx.currentTime) t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, t);
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    const vibG = ctx.createGain(); vibG.gain.value = f * 0.008;
    vib.connect(vibG); vibG.connect(o.frequency);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(peak, t + 0.12);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(ng); ng.connect(g);
    o.start(t); vib.start(t);
    o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
  }

  stopMusic() {
    if (!this.musicPlaying) return;
    this.musicPlaying = false;
    clearInterval(this._musicTimer);
    const g = this.musicGain, nodes = this._musicNodes || [];
    if (g) {
      g.gain.cancelScheduledValues(this.ctx.currentTime);
      g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.35);
    }
    setTimeout(() => {
      nodes.forEach(n => { try { n.stop(); } catch (e) { /* already stopped */ } });
      if (g) g.disconnect();
    }, 1600);
    this.musicGain = null;
  }

}

export const SFX = new SfxEngine();
