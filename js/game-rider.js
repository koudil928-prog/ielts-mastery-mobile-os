/* IELTS Mastery Mobile OS v5.0 — game-rider.js: NEON FLUENCY RIDER.
   A voice runner + silent rhythm game over the bench/lexicon packs.
   Pure logic core (flight physics, gate judgement, rhythm chart + timing judgement) + browser controller
   (KL night skyline, parallax, waveform light-trail, combo flames, WPM speedometer). */
(function (root) {
  'use strict';
  /* ================= Pure logic ================= */
  function createVoiceRun(gates) {
    return { dist: 0, speed: 0, altitude: 62, score: 0, combo: 0, maxCombo: 0, gates: (gates || []).map(function (g) { return { at: g.at, word: g.word, judged: false }; }), finished: false, elapsed: 0 };
  }
  function voiceStep(run, dt, speaking, loud) {
    var events = [];
    if (run.finished) return events;
    run.elapsed += dt;
    if (speaking) { run.speed = Math.min(100, run.speed + 46 * dt); run.altitude = Math.min(96, run.altitude + 26 * dt); }
    else { run.speed = Math.max(0, run.speed - 30 * dt); run.altitude = Math.max(2, run.altitude - 21 * dt); }
    run.dist += run.speed * dt * 2.2;
    run.score += run.speed * dt;
    run.gates.forEach(function (g) {
      if (!g.judged && run.dist >= g.at) {
        g.judged = true;
        if (speaking && loud >= 0.5) { g.result = 'PERFECT'; run.score += 150; run.combo++; events.push('gate:PERFECT:' + g.word); }
        else if (speaking) { g.result = 'GREAT'; run.score += 90; run.combo++; events.push('gate:GREAT:' + g.word); }
        else { g.result = 'MISS'; run.combo = 0; run.altitude = Math.max(2, run.altitude - 14); events.push('gate:MISS:' + g.word); }
        run.maxCombo = Math.max(run.maxCombo, run.combo);
      }
    });
    if (run.altitude <= 3 && !speaking) events.push('valley-warning');
    return events;
  }
  function gatesFromText(text, lexiconItems) {
    var words = String(text || '').split(/\s+/).map(function (w) { return w.replace(/[^A-Za-z'-]/g, ''); }).filter(Boolean);
    var stress = {};
    (lexiconItems || []).forEach(function (it) { if (it.syllables && it.syllables.length >= 3) stress[it.word.toLowerCase()] = it; });
    var gates = [];
    words.forEach(function (w, i) {
      var lw = w.toLowerCase();
      if (stress[lw] || (w.length >= 9 && /tion$|sion$|cial$/.test(lw))) gates.push({ at: 260 + i * 150, word: w });
    });
    return gates.slice(0, 6);
  }
  /* Rhythm: notes on 3 physical lanes (0=left, 1=center, 2=right).
     kind 'pair' (minimal pair): physical lane 0 (left) = wordA, physical lane 2 (right) = wordB; spoken decides.
     Button input is 2-button logical for pairs: button index 0 = A, button index 1 = B (tapLane maps 1 -> physical 2 for pair notes only).
     kind 'stress': physical lane = stress idx 0..2 (button index == lane). */
  function buildChart(packs, rng, count) {
    rng = rng || Math.random;
    var notes = [], t = 1.6;
    var pairs = ((packs.lexicon || {}).pairs || []).slice();
    var words = ((packs.lexicon || {}).items || []).filter(function (it) { return it.syllables && it.syllables.length >= 3; });
    for (var i = 0; i < (count || 16); i++) {
      if (i % 2 === 0 && pairs.length) {
        var p = pairs[Math.floor(rng() * pairs.length)];
        var spokenIsA = rng() < 0.5;
        notes.push({ time: t, kind: 'pair', lane: spokenIsA ? 0 : 2, wordA: p.a, wordB: p.b, spoken: spokenIsA ? p.a : p.b, label: p.label });
      } else if (words.length) {
        var w = words[Math.floor(rng() * words.length)];
        notes.push({ time: t, kind: 'stress', lane: Math.min(2, w.stress || 0), word: w.word, syllables: w.syllables });
      } else if (pairs.length) { i--; continue; }
      t += 1.35 + rng() * 0.5;
    }
    return notes;
  }
  function judgeTiming(deltaMs) {
    var d = Math.abs(deltaMs);
    if (d <= 80) return 'PERFECT';
    if (d <= 160) return 'GREAT';
    if (d <= 260) return 'GOOD';
    return 'MISS';
  }
  function scoreFor(j) { return { PERFECT: 120, GREAT: 80, GOOD: 40, MISS: 0 }[j] || 0; }
  var logic = { createVoiceRun: createVoiceRun, voiceStep: voiceStep, gatesFromText: gatesFromText, buildChart: buildChart, judgeTiming: judgeTiming, scoreFor: scoreFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  root.IMOSRiderLogic = logic;
})(typeof self !== 'undefined' ? self : this);

/* ================= Browser controller ================= */
(function (root) {
  'use strict';
  var L = root.IMOSRiderLogic;
  var env = null, mode = null, rafId = null, lastTs = 0, startedAt = 0;
  var vfx = null, audioCtx = null, analyser = null, mediaStream = null, srObj = null;
  var run = null, trail = [], rmsHist = [], transcriptWords = 0, promptText = '';
  var chart = [], chartStart = 0, judged = {}, spokenNotes = {}, rhythmScore = 0, rhythmCombo = 0, rhythmMax = 0, lastJudge = '';
  var buildingsFar = [], buildingsNear = [], stars = [];
  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function log(msg) { var b = $('riderLog'); if (b) b.textContent = msg; }
  function seededBuildings() {
    buildingsFar = []; buildingsNear = []; stars = [];
    var x = 0, i;
    for (i = 0; i < 40; i++) { var w = 26 + (i * 37) % 40; buildingsFar.push({ x: x, w: w, h: 40 + (i * 53) % 70 }); x += w + 6; }
    x = 0;
    for (i = 0; i < 30; i++) { var w2 = 40 + (i * 41) % 55; buildingsNear.push({ x: x, w: w2, h: 26 + (i * 29) % 52 }); x += w2 + 10; }
    for (i = 0; i < 70; i++) stars.push({ x: (i * 97) % 640, y: (i * 57) % 130, r: (i % 3) * 0.6 + 0.5 });
  }
  function drawSkyline(ctx, dist) {
    ctx.fillStyle = '#050914'; ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#e8eefc';
    stars.forEach(function (s) { ctx.globalAlpha = 0.5 + 0.4 * Math.sin(dist * 0.01 + s.x); ctx.fillRect(s.x, s.y, s.r, s.r); });
    ctx.globalAlpha = 1;
    // Petronas-like twin towers (far layer, slow parallax)
    var tx = 430 - (dist * 0.08) % 900;
    ctx.fillStyle = '#0d1830';
    [0, 52].forEach(function (dx) {
      ctx.beginPath(); ctx.moveTo(tx + dx, 250); ctx.lineTo(tx + dx + 8, 120); ctx.lineTo(tx + dx + 16, 96); ctx.lineTo(tx + dx + 24, 120); ctx.lineTo(tx + dx + 32, 250); ctx.closePath(); ctx.fill();
      ctx.fillRect(tx + dx + 14, 78, 4, 20);
    });
    ctx.fillRect(tx + 24, 150, 36, 6);
    ctx.fillStyle = '#101f3f';
    buildingsFar.forEach(function (b) { var bx = ((b.x - dist * 0.25) % 1600 + 1600) % 1600 - 200; ctx.fillRect(bx, 250 - b.h, b.w, b.h); });
    ctx.fillStyle = '#132a52';
    buildingsNear.forEach(function (b) { var bx = ((b.x - dist * 0.55) % 1600 + 1600) % 1600 - 200; ctx.fillRect(bx, 252 - b.h, b.w, b.h); ctx.fillStyle = 'rgba(245,197,66,0.5)'; for (var wy = 0; wy < b.h - 8; wy += 11) ctx.fillRect(bx + 5, 252 - b.h + 4 + wy, 4, 5); ctx.fillStyle = '#132a52'; });
    // neon grid floor
    ctx.strokeStyle = 'rgba(45,212,191,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 252); ctx.lineTo(640, 252); ctx.stroke();
    for (var gx = 0; gx <= 10; gx++) { ctx.beginPath(); ctx.moveTo(gx * 64, 252); ctx.lineTo(gx * 64 - 130, 360); ctx.stroke(); }
    var off = (dist * 1.4) % 26;
    for (var gy = 0; gy < 5; gy++) { var y = 258 + gy * 24 + off * (gy / 5); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke(); }
  }
  function drawGlider(ctx, x, y, t) {
    ctx.save(); ctx.translate(x, y);
    ctx.shadowColor = '#2dd4bf'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#2dd4bf';
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-14, -9); ctx.lineTo(-7, 0); ctx.lineTo(-14, 9); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.arc(6, 0, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function hud(text) { var h = $('riderHud'); if (h) h.textContent = text; }

  /* ---------- Voice mode ---------- */
  function startVoice() {
    stopAll();
    var packs = env.packs();
    var sel = $('riderPromptSel') ? $('riderPromptSel').value : 'bench';
    if (sel === 'qbank' && packs.qbank) { var qs = packs.qbank.items.filter(function (q) { return q.part === 1; }); promptText = qs.length ? qs[Math.floor(Math.random() * qs.length)].q : 'What do you usually do on weekdays?'; }
    else if (packs.bench && packs.bench.items.length) promptText = packs.bench.items[Math.floor(Math.random() * packs.bench.items.length)].text;
    else promptText = 'I live in a cosmopolitan and multicultural city, and university life is deceptively simple at first.';
    $('riderText').textContent = '🗣 お題： ' + promptText + '（声を出している間 加速。3音節ゲート語で強勢を決めると PERFECT）';
    var gates = L.gatesFromText(promptText, (packs.lexicon || {}).items || []);
    run = L.createVoiceRun(gates); trail = []; rmsHist = []; transcriptWords = 0; mode = 'voice'; startedAt = performance.now();
    if (window.IMOSVFX) vfx = window.IMOSVFX.createEngine(Math.random);
    setupMic();
    setupSR();
    log('🎤 Voice Fluency Runner 開始！ 話し続けて加速しよう');
    startLoop();
  }
  function setupMic() {
    if (!(navigator.mediaDevices && window.AudioContext)) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      mediaStream = stream;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
    }).catch(function () { log('⚠ マイク不可： 音量判定なしでタイマーのみ動作します'); });
  }
  function setupSR() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      srObj = new SR(); srObj.lang = 'en-GB'; srObj.continuous = true; srObj.interimResults = true;
      srObj.onresult = function (e) {
        var txt = '';
        for (var i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript + ' ';
        transcriptWords = txt.trim() ? txt.trim().split(/\s+/).length : 0;
      };
      srObj.onend = function () { if (mode === 'voice' && srObj) { try { srObj.start(); } catch (e2) {} } };
      srObj.start();
    } catch (e) { srObj = null; }
  }
  function currentRms() {
    if (!analyser) return { speaking: false, loud: 0 };
    var data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    var sum = 0;
    for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; sum += v * v; }
    var rms = Math.sqrt(sum / data.length);
    return { speaking: rms > 0.028, loud: Math.min(1, rms * 7) };
  }
  function voiceFrame(ts, dt) {
    var c = $('riderCanvas'); if (!c) return;
    var ctx = c.getContext('2d');
    var mic = currentRms();
    var evts = L.voiceStep(run, dt, mic.speaking, mic.loud);
    evts.forEach(function (e) {
      var p = e.split(':');
      if (p[0] === 'gate') {
        var j = p[1], w = p[2];
        if (vfx) { vfx.damageNumber(300, 90, j + ' ' + w, j === 'PERFECT' ? '#f59e0b' : j === 'GREAT' ? '#2dd4bf' : '#f87171', j === 'PERFECT'); if (j !== 'MISS') vfx.burst(120, 300 - run.altitude * 2.4, { color: '#2dd4bf', count: 16 }); }
        env.sfx(j === 'PERFECT' ? 'crit' : j === 'GREAT' ? 'correct' : 'wrong');
        log('ゲート「' + w + '」: ' + j);
      }
      if (e === 'valley-warning') log('⚠ 沈黙の谷に接近！ 声を出して上昇しよう');
    });
    trail.push(run.altitude); if (trail.length > 110) trail.shift();
    rmsHist.push(mic.loud); if (rmsHist.length > 110) rmsHist.shift();
    var stp = vfx ? vfx.update(dt * 1000) : { shakeX: 0, shakeY: 0 };
    drawSkyline(ctx, run.dist);
    ctx.save(); ctx.translate(stp.shakeX, stp.shakeY);
    // gates ahead
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    run.gates.forEach(function (g) {
      var gx = 120 + (g.at - run.dist) * 1.1;
      if (gx < -60 || gx > 700) return;
      ctx.strokeStyle = g.judged ? 'rgba(148,163,184,0.3)' : 'rgba(245,158,11,0.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(gx, 60); ctx.lineTo(gx, 250); ctx.stroke();
      ctx.fillStyle = '#f59e0b'; ctx.fillText(g.word, gx, 50);
      if (g.result) { ctx.fillStyle = g.result === 'MISS' ? '#f87171' : '#2dd4bf'; ctx.fillText(g.result, gx, 268); }
    });
    // light trail from altitude history + oscilloscope waveform
    ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 2.4; ctx.beginPath();
    trail.forEach(function (a, i) { var x = 8 + i * 1.05, y = 300 - a * 2.4; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
    ctx.strokeStyle = 'rgba(244,114,182,0.8)'; ctx.lineWidth = 1.4; ctx.beginPath();
    rmsHist.forEach(function (v, i) { var x = 8 + i * 1.05, y = 300 - trail[i] * 2.4 + (v - 0.3) * 26; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
    var gy = 300 - run.altitude * 2.4;
    if (run.combo >= 3 && vfx && Math.random() < 0.4) vfx.burst(96, gy + 8, { color: '#f59e0b', count: 3, speed: 60, life: 0.4 });
    drawGlider(ctx, 120, gy, ts / 1000);
    if (vfx) vfx.draw(ctx);
    ctx.restore();
    var elapsed = (performance.now() - startedAt) / 1000;
    var wpm = elapsed > 2 ? Math.round(transcriptWords / elapsed * 60) : 0;
    hud('SCORE ' + Math.round(run.score) + '｜コンボ ×' + run.combo + '｜速度 ' + Math.round(run.speed) + '｜高度 ' + Math.round(run.altitude) + '｜ライブWPM ' + wpm);
    var lastGate = run.gates.length ? run.gates[run.gates.length - 1].at : 900;
    if ((run.dist > lastGate + 420 && run.gates.every(function (g) { return g.judged; })) || elapsed > 75) finishVoice();
  }
  function finishVoice() {
    var xp = Math.min(50, Math.floor(run.score / 30));
    var s = env.state(); s.riderBest = s.riderBest || {}; var best = Math.max(s.riderBest.voice || 0, Math.round(run.score)); s.riderBest.voice = best;
    env.addXp(xp); env.save();
    log('🏁 ゴール！ スコア ' + Math.round(run.score) + '（ベスト ' + best + '）/ 最大コンボ ×' + run.maxCombo + ' / XP+' + xp);
    env.sfx('levelup');
    stopAll(true);
  }

  /* ---------- Rhythm mode ---------- */
  function startRhythm() {
    stopAll();
    chart = L.buildChart(env.packs(), Math.random, 16);
    judged = {}; spokenNotes = {}; rhythmScore = 0; rhythmCombo = 0; rhythmMax = 0; lastJudge = '';
    mode = 'rhythm'; chartStart = performance.now() + 600;
    if (window.IMOSVFX) vfx = window.IMOSVFX.createEngine(Math.random);
    $('riderText').textContent = '🤫 Silent Rhythm： TTSで流れる単語を聞き分け、ノーツがラインに重なる瞬間に正しいレーンをタップ（ペア=左端レーンがWord A・右端レーンがWord B／ボタンでは1番目=A・2番目=B、強勢=1・2・3番目の音節）';
    log('🎵 リズム開始！ 音を出せる環境ではTTSがヒントを読み上げます');
    document.querySelectorAll('.laneBtn').forEach(function (b) { b.style.display = ''; });
    startLoop();
  }
  function rhythmFrame(ts) {
    var c = $('riderCanvas'); if (!c) return;
    var ctx = c.getContext('2d');
    var now = (performance.now() - chartStart) / 1000;
    drawSkyline(ctx, now * 130);
    var laneW = 640 / 3, hitY = 306, travel = 1.7;
    ctx.strokeStyle = 'rgba(45,212,191,0.25)';
    for (var li = 1; li < 3; li++) { ctx.beginPath(); ctx.moveTo(li * laneW, 30); ctx.lineTo(li * laneW, 330); ctx.stroke(); }
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, hitY); ctx.lineTo(640, hitY); ctx.stroke(); ctx.lineWidth = 1;
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    chart.forEach(function (n, idx) {
      if (judged[idx]) return;
      var dtN = n.time - now;
      if (dtN < -0.3) { judged[idx] = 'MISS'; rhythmCombo = 0; lastJudge = 'MISS'; return; }
      if (dtN <= travel && !spokenNotes[idx]) { spokenNotes[idx] = true; speakWord(n.kind === 'pair' ? n.spoken : n.word); }
      if (dtN > travel) return;
      var y = hitY - dtN / travel * (hitY - 26);
      var x = n.lane * laneW + laneW / 2;
      ctx.fillStyle = n.kind === 'pair' ? '#2dd4bf' : '#f472b6';
      ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b1220';
      ctx.fillText(n.kind === 'pair' ? (n.lane === 0 ? n.wordA.slice(0, 4) : n.wordB.slice(0, 4)) : n.word.slice(0, 5), x, y + 4);
      ctx.fillStyle = '#e8eefc';
      ctx.fillText(n.kind === 'pair' ? 'A/B' : '強勢', x, y - 24);
    });
    if (lastJudge) { ctx.font = 'bold 26px sans-serif'; ctx.fillStyle = lastJudge === 'PERFECT' ? '#f59e0b' : lastJudge === 'MISS' ? '#f87171' : '#2dd4bf'; ctx.fillText(lastJudge, 320, 70); }
    if (vfx) { vfx.update(16); vfx.draw(ctx); }
    hud('SCORE ' + rhythmScore + '｜コンボ ×' + rhythmCombo + '｜レーン: ペアは左端(0)=A/右端(2)=B（ボタンは1番目=A・2番目=B）、強勢は左から音節番号1/2/3');
    var last = chart.length ? chart[chart.length - 1].time : 0;
    if (now > last + 1.2) finishRhythm();
  }
  function tapLane(lane) {
    if (mode !== 'rhythm') return;
    var now = (performance.now() - chartStart) / 1000;
    var bestIdx = -1, bestDelta = 1e9;
    chart.forEach(function (n, idx) {
      if (judged[idx]) return;
      /* Lane unification: pair notes live on physical lanes 0 (A) / 2 (B).
         A tap matches when (a) it is the exact physical lane (canvas tap / lane-2 button), or
         (b) it is button index 1 for a pair note (2-button logical input: 0=A, 1=B -> physical 2).
         Stress notes only match their exact lane (button index == stress lane). */
      var match = (n.lane === lane) || (n.kind === 'pair' && lane === 1 && n.lane === 2);
      if (!match) return;
      var d = Math.abs((now - n.time) * 1000);
      if (d < bestDelta) { bestDelta = d; bestIdx = idx; }
    });
    if (bestIdx < 0 || bestDelta > 260) { rhythmCombo = 0; lastJudge = 'MISS'; env.sfx('wrong'); return; }
    var j = L.judgeTiming(bestDelta);
    judged[bestIdx] = j;
    if (j === 'MISS') { rhythmCombo = 0; env.sfx('wrong'); }
    else {
      rhythmCombo++; rhythmMax = Math.max(rhythmMax, rhythmCombo);
      rhythmScore += L.scoreFor(j) + Math.min(30, rhythmCombo * 2);
      env.sfx(j === 'PERFECT' ? 'crit' : 'correct');
      if (vfx) vfx.burst(chart[bestIdx].lane * (640 / 3) + 640 / 6, 300, { color: j === 'PERFECT' ? '#f59e0b' : '#2dd4bf', count: 14 });
    }
    lastJudge = j;
  }
  function finishRhythm() {
    var xp = Math.min(50, Math.floor(rhythmScore / 40));
    var s = env.state(); s.riderBest = s.riderBest || {}; var best = Math.max(s.riderBest.rhythm || 0, rhythmScore); s.riderBest.rhythm = best;
    env.addXp(xp); env.save();
    log('🏁 リズム終了！ スコア ' + rhythmScore + '（ベスト ' + best + '）/ 最大コンボ ×' + rhythmMax + ' / XP+' + xp);
    env.sfx('levelup');
    stopAll(true);
  }
  function speakWord(w) { try { var u = new SpeechSynthesisUtterance(w); u.lang = 'en-GB'; u.rate = 0.92; speechSynthesis.speak(u); } catch (e) {} }

  /* ---------- Loop / lifecycle ---------- */
  function loop(ts) {
    if (!mode) { rafId = null; return; }
    var dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000); lastTs = ts;
    if (mode === 'voice' && run) voiceFrame(ts, dt);
    else if (mode === 'rhythm') rhythmFrame(ts);
    if (mode) rafId = requestAnimationFrame(loop);
  }
  function startLoop() { if (!rafId) { lastTs = 0; rafId = requestAnimationFrame(loop); } }
  function stopAll(keepMode) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (!keepMode) mode = null; else mode = null;
    if (srObj) { var s = srObj; srObj = null; try { s.stop(); } catch (e) {} }
    if (mediaStream) { mediaStream.getTracks().forEach(function (tr) { tr.stop(); }); mediaStream = null; }
    if (audioCtx) { audioCtx.close().catch(function () {}); audioCtx = null; analyser = null; }
    document.querySelectorAll('.laneBtn').forEach(function (b) { b.style.display = 'none'; });
  }
  function init(e) {
    env = e; seededBuildings();
    if (!$('riderVoiceBtn')) return;
    $('riderVoiceBtn').addEventListener('click', function () { env.sfx('click'); startVoice(); });
    $('riderRhythmBtn').addEventListener('click', function () { env.sfx('click'); startRhythm(); });
    $('riderStopBtn').addEventListener('click', function () { stopAll(); log('⏹ 停止しました'); });
    [0, 1, 2].forEach(function (lane) { var b = $('riderLane' + lane); if (b) b.addEventListener('click', function () { tapLane(lane); }); });
    $('riderCanvas').addEventListener('pointerdown', function (ev) {
      if (mode !== 'rhythm') return;
      var rect = ev.target.getBoundingClientRect();
      var x = (ev.clientX - rect.left) / rect.width * 640;
      tapLane(Math.min(2, Math.floor(x / (640 / 3))));
    });
  }
  root.IMOSRider = { init: init };
})(typeof self !== 'undefined' ? self : this);
