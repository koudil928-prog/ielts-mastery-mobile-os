/* IELTS Mastery Mobile OS v5.0 — sfx.js: procedural sound effects engine (Web Audio API only, no audio files).
   slash / critical / combo rise / correct chime / barge-in cut / level-up fanfare / UI click. Mute persisted. */
(function (root) {
  'use strict';
  var ctx = null, master = null;
  var muted = false;
  try { muted = root.localStorage && root.localStorage.getItem('imos.sfxMuted') === '1'; } catch (e) {}
  function ac() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
    return ctx;
  }
  function tone(freq, delay, dur, type, vol, slideTo) {
    var c = ac(); if (!c || muted) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(delay, dur, fromFreq, toFreq, vol) {
    var c = ac(); if (!c || muted) return;
    var t0 = c.currentTime + (delay || 0);
    var len = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(fromFreq, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, toFreq), t0 + dur);
    var g = c.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(master); src.start(t0);
  }
  var api = {
    click: function () { tone(660, 0, 0.06, 'triangle', 0.12); },
    correct: function () { tone(1318, 0, 0.12, 'sine', 0.22); tone(1760, 0.09, 0.2, 'sine', 0.22); },
    wrong: function () { tone(196, 0, 0.18, 'sawtooth', 0.08); },
    slash: function () { noise(0, 0.16, 3800, 300, 0.35); },
    crit: function () { noise(0, 0.2, 5200, 200, 0.4); tone(1568, 0, 0.1, 'square', 0.14); tone(2093, 0.07, 0.16, 'square', 0.14); },
    combo: function (n) { var base = 523 * Math.pow(1.059, Math.min(12, n)); tone(base, 0, 0.1, 'triangle', 0.2); tone(base * 1.5, 0.06, 0.14, 'triangle', 0.2); },
    barge: function () { tone(880, 0, 0.07, 'square', 0.16); tone(587, 0.07, 0.07, 'square', 0.16); tone(1175, 0.14, 0.16, 'square', 0.2); },
    levelup: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.09, 0.22, 'triangle', 0.22); }); },
    fever: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, i * 0.06, 0.16, 'sawtooth', 0.1); }); },
    isMuted: function () { return muted; },
    toggleMute: function () {
      muted = !muted;
      try { root.localStorage.setItem('imos.sfxMuted', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    _tone: tone, _noise: noise
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IMOSSFX = api;
})(typeof self !== 'undefined' ? self : this);
