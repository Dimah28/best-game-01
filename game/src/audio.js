// Generative sound effects with the Web Audio API: no audio files, everything is
// synthesised from oscillators and noise at play time. The context is created lazily
// on the first user gesture, so headless screenshot runs stay silent.

export function createAudio() {
  let context = null;
  let muted = false;
  let master = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') void context.resume();
      return context;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
    } catch {
      context = null;
    }
    return context;
  }

  function tone(freq, dur, type, volume, slideTo, delay) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, volume, filterFreq, delay) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() { return muted; },
    shoot(kind) {
      if (kind === 'anemone') tone(180, 0.18, 'sine', 0.25, 60);
      else if (kind === 'kelp') tone(620, 0.12, 'sine', 0.12, 880);
      else tone(880, 0.06, 'square', 0.06, 520);
    },
    kill() { tone(520, 0.09, 'triangle', 0.16, 780); tone(780, 0.12, 'triangle', 0.12, 1040, 0.05); },
    coin() { tone(1040, 0.07, 'sine', 0.1, 1320); },
    leak() { tone(220, 0.3, 'sawtooth', 0.2, 110); noise(0.2, 0.12, 800); },
    place() { tone(300, 0.1, 'triangle', 0.18, 520); tone(520, 0.12, 'triangle', 0.12, 780, 0.06); },
    upgrade() { tone(440, 0.1, 'triangle', 0.16, 660); tone(660, 0.1, 'triangle', 0.14, 880, 0.07); tone(880, 0.16, 'triangle', 0.14, 1174, 0.14); },
    sell() { tone(660, 0.1, 'triangle', 0.14, 440); },
    waveStart() { tone(196, 0.25, 'triangle', 0.2, 392); tone(294, 0.3, 'triangle', 0.16, 440, 0.12); },
    waveClear() { [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.16, f, i * 0.09)); },
    victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.28, 'triangle', 0.18, f, i * 0.12)); },
    gameOver() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.12, f * 0.9, i * 0.16)); },
    error() { tone(160, 0.12, 'square', 0.1, 120); },
  };
}
