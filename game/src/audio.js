// Every sound is made in code with WebAudio: short oscillator and noise voices for the effects,
// and a small lookahead sequencer looping a dark synth bass line with a slow arpeggio for music.
// Nothing is loaded, so the game sounds the same offline. Sound starts on the first user gesture
// (the start button), as browsers require; M or the HUD button mutes.

const MUSIC = {
  bpm: 96,
  // A minor progression, two bars each: Am, F, C, G (frequencies of the root notes).
  bassRoots: [55.0, 43.65, 65.41, 49.0],
  arpNotes: [220.0, 261.63, 329.63, 392.0, 329.63, 261.63],
};

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let noiseBuffer = null;
  let muted = false;
  let musicTimer = null;
  let nextNoteAt = 0;
  let stepIndex = 0;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(context.destination);
    musicGain = context.createGain();
    musicGain.gain.value = 0.34;
    musicGain.connect(master);
    noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function tone({ freq, end = null, type = 'square', at = 0, dur = 0.12, vol = 0.2, dest = null }) {
    if (!context || muted) return;
    const t0 = context.currentTime + at;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (end !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(dest ?? master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ at = 0, dur = 0.2, vol = 0.25, from = 3000, to = 300 }) {
    if (!context || muted) return;
    const t0 = context.currentTime + at;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    source.connect(filter).connect(gain).connect(master);
    source.start(t0);
    source.stop(t0 + dur + 0.02);
  }

  // The music sequencer: 16th notes at MUSIC.bpm, scheduled a little ahead of the clock.
  function scheduleMusic() {
    if (!context) return;
    const stepDur = 60 / MUSIC.bpm / 2; // eighth notes
    while (nextNoteAt < context.currentTime + 0.18) {
      const at = nextNoteAt - context.currentTime;
      const bar = Math.floor(stepIndex / 8) % MUSIC.bassRoots.length;
      const beat = stepIndex % 8;
      if (beat % 2 === 0) {
        tone({ freq: MUSIC.bassRoots[bar], type: 'triangle', at, dur: stepDur * 1.8, vol: 0.5, dest: musicGain });
      }
      if (beat % 2 === 1) {
        const note = MUSIC.arpNotes[(stepIndex >> 1) % MUSIC.arpNotes.length] * (bar === 3 ? 1.5 : 1);
        tone({ freq: note, type: 'sine', at, dur: stepDur * 1.4, vol: 0.16, dest: musicGain });
      }
      if (stepIndex % 16 === 0) noise({ at, dur: 0.05, vol: 0.05, from: 8000, to: 6000 });
      nextNoteAt += stepDur;
      stepIndex += 1;
    }
  }

  return {
    /** Call from a user gesture: builds the context and starts the music loop. */
    unlock() {
      if (!ensure()) return;
      if (musicTimer === null) {
        nextNoteAt = context.currentTime + 0.06;
        stepIndex = 0;
        musicTimer = window.setInterval(scheduleMusic, 42);
      }
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master && context) master.gain.setTargetAtTime(muted ? 0 : 0.55, context.currentTime, 0.02);
      return muted;
    },
    shoot() {
      tone({ freq: 880, end: 320, type: 'square', dur: 0.07, vol: 0.05 });
    },
    nova() {
      tone({ freq: 180, end: 620, type: 'sawtooth', dur: 0.22, vol: 0.1 });
      noise({ dur: 0.18, vol: 0.08, from: 2400, to: 500 });
    },
    blade() {
      tone({ freq: 1400, end: 900, type: 'triangle', dur: 0.05, vol: 0.045 });
    },
    hit() {
      tone({ freq: 240, end: 140, type: 'square', dur: 0.05, vol: 0.06 });
    },
    explosion(big = false) {
      noise({ dur: big ? 0.5 : 0.22, vol: big ? 0.4 : 0.16, from: big ? 3200 : 2200, to: 120 });
      tone({ freq: big ? 120 : 160, end: 40, type: 'sine', dur: big ? 0.5 : 0.25, vol: big ? 0.5 : 0.2 });
    },
    pickup(streak) {
      const lift = Math.min(streak, 24) * 18;
      tone({ freq: 620 + lift, end: 940 + lift, type: 'sine', dur: 0.08, vol: 0.11 });
    },
    dash() {
      noise({ dur: 0.16, vol: 0.12, from: 900, to: 3800 });
    },
    hurt() {
      tone({ freq: 200, end: 60, type: 'sawtooth', dur: 0.28, vol: 0.3 });
      noise({ dur: 0.2, vol: 0.2, from: 1600, to: 200 });
    },
    levelUp() {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => tone({ freq, type: 'triangle', at: i * 0.07, dur: 0.22, vol: 0.18 }));
    },
    alarm() {
      [0, 0.22, 0.44].forEach((at) => tone({ freq: 146.83, end: 110, type: 'sawtooth', at, dur: 0.18, vol: 0.22 }));
    },
    win() {
      [392.0, 523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => tone({ freq, type: 'triangle', at: i * 0.11, dur: 0.4, vol: 0.2 }));
    },
    lose() {
      [329.63, 261.63, 220.0, 164.81].forEach((freq, i) => tone({ freq, type: 'triangle', at: i * 0.14, dur: 0.4, vol: 0.2 }));
    },
  };
}
