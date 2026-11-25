/* IELTS Mastery Mobile OS v5.0 — audio-dsp.js: real audio DSP for the Speak tab.
   - Live Pitch Rider: AnalyserNode time-domain buffer -> Core.estimateF0 autocorrelation -> scrolling F0 curve
     with a stress target band for 3+ syllable target words.
   - Real FFT spectrogram: AnalyserNode.getByteFrequencyData -> scrolling color spectrogram.
   Audio is processed locally only; nothing is stored or sent. */
(function (root) {
  'use strict';
  var Core = root.IMOSCore || (typeof require !== 'undefined' ? require('./core.js') : null);
  /* Stress targets for known weak words (syllable index is 0-based) */
  var STRESS = {
    cosmopolitan: { syllables: ['cos', 'mo', 'POL', 'i', 'tan'], stress: 2 },
    multicultural: { syllables: ['mul', 'ti', 'CUL', 'tur', 'al'], stress: 2 },
    multinational: { syllables: ['mul', 'ti', 'NA', 'tion', 'al'], stress: 2 },
    university: { syllables: ['u', 'ni', 'VER', 'si', 'ty'], stress: 2 },
    development: { syllables: ['de', 'VEL', 'op', 'ment'], stress: 1 },
    education: { syllables: ['ed', 'u', 'CA', 'tion'], stress: 2 }
  };
  function stressTarget(word) {
    var w = String(word || '').toLowerCase();
    if (STRESS[w]) return STRESS[w];
    // heuristic fallback: split on vowels, stress the penultimate syllable
    var syl = w.split(/(?<=[aeiou])(?=[^aeiou])/).filter(Boolean);
    if (syl.length < 2) syl = [w];
    return { syllables: syl, stress: Math.max(0, syl.length - 2) };
  }
  function smoothF0(values) {
    return values.map(function (v, i) {
      var win = [values[i - 1], v, values[i + 1]].filter(function (x) { return x > 0; });
      if (!win.length) return 0;
      win.sort(function (a, b) { return a - b; });
      return win[Math.floor(win.length / 2)];
    });
  }
  function clearCanvas(c) { if (!c) return; var x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); }
  var raf = null, analyser = null, pitchC = null, specC = null, f0Hist = [], targetWord = '';
  function draw() {
    if (!analyser) return;
    var sr = analyser.context ? analyser.context.sampleRate : 44100;
    var buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    var f0 = Core && Core.estimateF0 ? Core.estimateF0(buf, sr) : 0;
    f0Hist.push(f0); if (f0Hist.length > 90) f0Hist.shift();
    if (pitchC) {
      var x = pitchC.getContext('2d'), W = pitchC.width, H = pitchC.height;
      x.clearRect(0, 0, W, H);
      var st = stressTarget(targetWord);
      // stress target band: the F0 emphasis zone (upper-mid range) the stressed syllable should reach
      var bandTop = H * 0.12, bandBot = H * 0.45;
      x.fillStyle = 'rgba(245,158,11,0.16)'; x.fillRect(0, bandTop, W, bandBot - bandTop);
      x.strokeStyle = 'rgba(245,158,11,0.65)'; x.setLineDash([5, 4]); x.strokeRect(0.5, bandTop, W - 1, bandBot - bandTop); x.setLineDash([]);
      x.fillStyle = '#f59e0b'; x.font = '11px sans-serif';
      x.fillText(targetWord ? ('強勢ターゲット: ' + st.syllables.join('·') + '（' + (st.stress + 1) + '音節目を高く強く）') : 'ピッチ曲線（実測F0）', 6, 12);
      var sm = smoothF0(f0Hist);
      x.strokeStyle = '#2dd4bf'; x.lineWidth = 2; x.beginPath();
      var started = false;
      sm.forEach(function (v, i) {
        if (!v) { started = false; return; }
        var px = i / 89 * W, py = H - Math.max(0, Math.min(1, (v - 60) / 240)) * (H - 18) - 4;
        if (!started) { x.moveTo(px, py); started = true; } else x.lineTo(px, py);
      });
      x.stroke(); x.lineWidth = 1;
      var last = sm.filter(function (v) { return v > 0; }).pop();
      if (last) { x.fillStyle = '#e8eefc'; x.fillText('F0 ' + Math.round(last) + ' Hz', 6, H - 5); }
    }
    if (specC) {
      var sx = specC.getContext('2d'), SW = specC.width, SH = specC.height;
      var img = sx.getImageData(2, 0, SW - 2, SH); sx.putImageData(img, 0, 0);
      var freq = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freq);
      var bins = 48;
      for (var b = 0; b < bins; b++) {
        var v = freq[Math.floor(b / bins * freq.length * 0.7)] / 255;
        var hue = 190 - v * 170, li = 12 + v * 55;
        sx.fillStyle = 'hsl(' + hue + ',95%,' + li + '%)';
        sx.fillRect(SW - 2, SH - (b + 1) * (SH / bins), 2, SH / bins);
      }
    }
    raf = requestAnimationFrame(draw);
  }
  function attach(an, opts) {
    detach();
    analyser = an; opts = opts || {};
    pitchC = opts.pitchCanvas || null; specC = opts.specCanvas || null; targetWord = opts.targetWord || '';
    f0Hist = [];
    clearCanvas(pitchC); clearCanvas(specC);
    raf = requestAnimationFrame(draw);
  }
  function detach() { if (raf) cancelAnimationFrame(raf); raf = null; analyser = null; }
  function setTargetWord(w) { targetWord = w || ''; }
  var api = { attach: attach, detach: detach, setTargetWord: setTargetWord, clearCanvas: clearCanvas, stressTarget: stressTarget, smoothF0: smoothF0, STRESS: STRESS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IMOSDSP = api;
})(typeof self !== 'undefined' ? self : this);
