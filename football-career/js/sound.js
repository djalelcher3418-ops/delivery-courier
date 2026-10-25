// أصوات مولّدة بالكود: الصافرة، ضربة الكرة، هتاف الجمهور
(function () {
  let ac = null;
  let enabled = true;

  function ctx() {
    if (!enabled) return null;
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { enabled = false; return null; }
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function noise(a, dur) {
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    return src;
  }

  FC.Sound = {
    unlock() { ctx(); },
    setEnabled(v) { enabled = v; },

    whistle(len = 0.4) {
      const a = ctx(); if (!a) return;
      const t = a.currentTime;
      const o = a.createOscillator(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
      o.type = 'triangle'; o.frequency.value = 2900;
      lfo.frequency.value = 38; lg.gain.value = 120;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.setValueAtTime(0.12, t + len);
      g.gain.linearRampToValueAtTime(0, t + len + 0.05);
      o.connect(g); g.connect(a.destination);
      o.start(t); lfo.start(t); o.stop(t + len + 0.1); lfo.stop(t + len + 0.1);
    },

    kick(power = 0.6) {
      const a = ctx(); if (!a) return;
      const t = a.currentTime;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140 + power * 60, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.25 * power, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(g); g.connect(a.destination);
      o.start(t); o.stop(t + 0.15);
    },

    goal(ours) {
      const a = ctx(); if (!a) return;
      const t = a.currentTime;
      const n = noise(a, 2.6), f = a.createBiquadFilter(), g = a.createGain();
      f.type = 'bandpass'; f.frequency.value = ours ? 900 : 500; f.Q.value = 0.7;
      const peak = ours ? 0.35 : 0.12;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.25);
      g.gain.linearRampToValueAtTime(peak * 0.7, t + 1.4);
      g.gain.linearRampToValueAtTime(0, t + 2.6);
      n.connect(f); f.connect(g); g.connect(a.destination);
      n.start(t);
    },
  };
})();
