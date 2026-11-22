// All sound is synthesized with WebAudio: no audio files, no network.
// The context is created on the first user gesture only, so the game
// stays silent (and error-free) on a page nobody has touched yet.
export function createAudio() {
  let context = null;
  let muted = false;
  let alarmNodes = null;

  function ensure() {
    if (context) return context;
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    } catch {
      return null;
    }
    return context;
  }

  /** Call from any gesture handler (key, click) to unlock sound. */
  function unlock() {
    const ctx = ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type = 'sine', gain = 0.08, when = 0, slideTo = null) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(dur, gain = 0.05, when = 0, lowpass = 1200) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    src.start(t);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (muted) this.stopAlarm();
      return muted;
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.07);
      tone(1318, 0.12, 'sine', 0.06, 0.07);
    },
    crackTick() {
      tone(2400, 0.03, 'square', 0.02);
    },
    crackDone() {
      tone(523, 0.1, 'triangle', 0.08);
      tone(659, 0.1, 'triangle', 0.08, 0.09);
      tone(784, 0.18, 'triangle', 0.08, 0.18);
    },
    smoke() {
      noise(0.5, 0.06, 0, 900);
    },
    hack() {
      tone(1200, 0.08, 'square', 0.04);
      tone(900, 0.08, 'square', 0.04, 0.08);
      tone(1500, 0.14, 'square', 0.04, 0.16);
    },
    spotted() {
      tone(220, 0.16, 'sawtooth', 0.05, 0, 440);
    },
    startAlarm() {
      if (muted || alarmNodes) return;
      const ctx = ensure();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 620;
      lfo.type = 'sine';
      lfo.frequency.value = 2.2;
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      amp.gain.value = 0.025;
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start();
      lfo.start();
      alarmNodes = { osc, lfo, amp };
    },
    stopAlarm() {
      if (!alarmNodes) return;
      try {
        alarmNodes.osc.stop();
        alarmNodes.lfo.stop();
      } catch {
        // Already stopped.
      }
      alarmNodes = null;
    },
    caught() {
      this.stopAlarm();
      tone(392, 0.2, 'sawtooth', 0.09, 0, 110);
      tone(196, 0.5, 'sawtooth', 0.09, 0.18, 55);
      noise(0.4, 0.05, 0, 500);
    },
    complete() {
      this.stopAlarm();
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.08, i * 0.11));
    },
    click() {
      tone(660, 0.05, 'sine', 0.05);
    },
  };
}
