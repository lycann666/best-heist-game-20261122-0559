// Sound, synthesised with WebAudio: no audio files. Everything is a short oscillator blip,
// so the game stays silent until the player first interacts (browsers require a gesture).

export function createAudio() {
  let context = null;
  let master = null;
  let alarmTimer = 0;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.16;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(frequency, duration, type, volume, when = 0, slideTo = null) {
    if (!ensure()) return;
    const start = context.currentTime + when;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slideTo !== null) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  return {
    unlock() {
      ensure();
    },
    click() {
      tone(660, 0.07, 'triangle', 0.5);
    },
    pickup(value) {
      tone(880, 0.1, 'sine', 0.7);
      tone(1318, 0.16, 'sine', 0.6, 0.07);
      if (value >= 3000) tone(1760, 0.2, 'sine', 0.5, 0.14);
    },
    spotted() {
      tone(220, 0.28, 'sawtooth', 0.5, 0, 110);
      tone(233, 0.28, 'sawtooth', 0.4, 0.02, 116);
    },
    caught() {
      tone(160, 0.5, 'sawtooth', 0.7, 0, 55);
      tone(80, 0.6, 'square', 0.4, 0.05, 40);
    },
    levelClear() {
      [523, 659, 784, 1046].forEach((frequency, index) => tone(frequency, 0.16, 'triangle', 0.6, index * 0.09));
    },
    win() {
      [523, 659, 784, 1046, 1318, 1568].forEach((frequency, index) => tone(frequency, 0.22, 'triangle', 0.6, index * 0.11));
    },
    /** A soft pulse while the alarm is high; call every frame, it throttles itself. */
    alarmPulse(dt, alarm) {
      if (alarm < 55 || !context) return;
      alarmTimer -= dt;
      if (alarmTimer <= 0) {
        alarmTimer = alarm > 85 ? 0.45 : 0.8;
        tone(alarm > 85 ? 980 : 740, 0.12, 'square', 0.22);
      }
    },
  };
}
