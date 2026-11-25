/* IELTS Mastery Mobile OS v4.0 — app.js: UI wiring. All pack/user text rendered via textContent or Core.esc. */
(function () {
  'use strict';
  var Core = window.IMOSCore, Ad = window.IMOSAdapters, Sync = window.IMOSSync;
  var $ = function (id) { return document.getElementById(id); };
  var packs = {}; // type -> normalized pack
  var state = loadState();
  var settings = JSON.parse(localStorage.getItem('imos.settings') || '{"vibrate":true,"theme":"dark"}');
  function loadState() { try { return JSON.parse(localStorage.getItem('imos.state') || '{}'); } catch (e) { return {}; } }
  function saveState() { state.updatedAt = new Date().toISOString(); localStorage.setItem('imos.state', JSON.stringify(state)); $('xpBadge').textContent = 'XP ' + (state.xp || 0) + ' 🔥' + (state.streak || 0); }
  function vibrate(ms) { if (settings.vibrate && navigator.vibrate) navigator.vibrate(ms || 15); }
  function sfx(name, arg) { try { if (window.IMOSSFX && window.IMOSSFX[name]) window.IMOSSFX[name](arg); } catch (e) {} }
  function b64urlEncode(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64urlDecode(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function shortHash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36).slice(0, 6); }
  /* ---- Today steps (Warm-up / Speak / Grammar-SRS / Log) ---- */
  function markStep(name) {
    var today = Core.localDateStr();
    if (!state.steps || state.steps.date !== today) state.steps = { date: today, warmup: false, speak: false, grammar: false, log: false };
    state.steps[name] = true; saveState(); renderSteps();
  }
  function renderSteps() {
    var bar = $('stepsBar'); if (!bar) return;
    var today = Core.localDateStr();
    var st = (state.steps && state.steps.date === today) ? state.steps : {};
    bar.querySelectorAll('span').forEach(function (sp) { sp.classList.toggle('done', !!st[sp.dataset.step]); });
  }
  function renderHero() {
    var hr = new Date().getHours();
    $('heroGreet').textContent = (hr < 11 ? '☀️ おはようございます' : hr < 18 ? '🎓 こんにちは' : '🌙 こんばんは') + '、dilさん';
    var travel = !!state.travelMode;
    $('travelToggle').checked = travel;
    $('heroText').textContent = travel ? '今日は移動日モード：声を出さずに3分サイレントで連続記録を守りましょう。' : '今日の4ステップ：Warm-up → Speak → Grammar/SRS → Log（約40分）。';
    $('heroBtn').textContent = travel ? '🤫 3分サイレントを開始' : '🎤 40分セッションを開始';
    renderSteps();
  }
  /* ---------- IndexedDB pack store (DB name kept from v3) ---------- */
  var dbP = new Promise(function (res, rej) {
    if (!('indexedDB' in window)) return rej(new Error('no IDB'));
    var rq = indexedDB.open('ielts-mastery-os', 2);
    rq.onupgradeneeded = function () { var db = rq.result; if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs'); if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
    rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { rej(rq.error); };
  }).catch(function () { return null; });
  function idbSet(k, v) { return dbP.then(function (db) { if (!db) { localStorage.setItem('imos.pack.' + k, JSON.stringify(v)); return; } return new Promise(function (res) { var tx = db.transaction('packs', 'readwrite'); tx.objectStore('packs').put(v, k); tx.oncomplete = res; }); }); }
  function idbGet(k) { return dbP.then(function (db) { if (!db) { try { return JSON.parse(localStorage.getItem('imos.pack.' + k) || 'null'); } catch (e) { return null; } } return new Promise(function (res) { var rq = db.transaction('packs').objectStore('packs').get(k); rq.onsuccess = function () { res(rq.result || null); }; rq.onerror = function () { res(null); }; }); }); }
  var PACK_TYPES = ['qbank', 'bench', 'lint_rules', 'curriculum', 'srs_library', 'lexicon', 'drills', 'groupwork', 'alchemy', 'alchemy_task1', 'reading_traps', 'task1_charts', 'debate_arena'];
  function loadAllPacks() { return Promise.all(PACK_TYPES.map(function (t) { return idbGet(t).then(function (p) { if (p) packs[t] = p; }); })).then(refreshAll); }
  function ingest(raw, filename) { var n = Ad.normalizePack(raw, filename); packs[n.type] = n; return idbSet(n.type, n).then(function () { return n; }); }
  /* ---------- Tabs / shortcuts ---------- */
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(function (s) { s.classList.toggle('active', s.id === 'tab-' + name); });
    document.querySelectorAll('nav.bottomnav button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false'); });
    vibrate(10);
  }
  document.querySelectorAll('nav.bottomnav button').forEach(function (b) { b.addEventListener('click', function () { sfx('click'); showTab(b.dataset.tab); }); });
  /* QR setup import: #imos_cfg=<base64url> -> confirm -> save to imos.gas -> strip the hash immediately */
  (function importCfgFromHash() {
    if (location.hash.indexOf('#imos_cfg=') !== 0) return;
    try {
      var rawIn = JSON.parse(b64urlDecode(location.hash.slice('#imos_cfg='.length)));
      var cfgIn = { url: rawIn.url || rawIn.u || '', token: rawIn.token || rawIn.t || '' };
      history.replaceState(null, '', location.pathname + location.search);
      if (cfgIn.url && cfgIn.token && window.confirm('QRコードからGAS設定を取り込みますか？\nURL: ' + cfgIn.url)) {
        Sync.saveCfg(cfgIn.url, cfgIn.token);
        var gu = $('gasUrl'), gt = $('gasToken'); if (gu) gu.value = cfgIn.url; if (gt) gt.value = cfgIn.token;
        var hs = $('hubSyncStatus'); if (hs) hs.textContent = '✅ QRからGAS設定を取り込みました';
      }
    } catch (e) { history.replaceState(null, '', location.pathname + location.search); }
  })();
  var qs = new URLSearchParams(location.search);
  showTab(qs.get('tab') || 'today');
  /* ---------- Theme / vibrate ---------- */
  document.documentElement.dataset.theme = settings.theme || 'dark';
  $('themeBtn').addEventListener('click', function () { settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = settings.theme; localStorage.setItem('imos.settings', JSON.stringify(settings)); });
  $('vibeBtn').addEventListener('click', function () { settings.vibrate = !settings.vibrate; localStorage.setItem('imos.settings', JSON.stringify(settings)); $('vibeBtn').textContent = settings.vibrate ? '📳' : '🔕'; });
  if (window.IMOSSFX) $('sfxBtn').textContent = window.IMOSSFX.isMuted() ? '🔇' : '🔊';
  $('sfxBtn').addEventListener('click', function () { if (window.IMOSSFX) $('sfxBtn').textContent = window.IMOSSFX.toggleMute() ? '🔇' : '🔊'; });
  /* ---------- Wake Lock ---------- */
  var wakeLock = null;
  function keepAwake(on) {
    if (!('wakeLock' in navigator)) return;
    if (on && !wakeLock) navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; w.addEventListener('release', function () { wakeLock = null; }); }).catch(function () {});
    if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
  }
  /* ---------- TTS shadowing player + Media Session ---------- */
  var shadowList = [], shadowIdx = 0, shadowTimer = null;
  function buildShadowList() {
    shadowList = [];
    if (packs.qbank) packs.qbank.items.slice(0, 30).forEach(function (q) { var m = q.model; var t = typeof m === 'string' ? m : (m.text || m.answer || ''); if (t) shadowList.push(t); });
    if (packs.srs_library) packs.srs_library.items.slice(0, 40).forEach(function (c) { if (c.example) shadowList.push(c.example); });
    var sel = $('shadowSource'); sel.textContent = '';
    shadowList.forEach(function (s, i) { var o = document.createElement('option'); o.value = i; o.textContent = s.slice(0, 60); sel.appendChild(o); });
  }
  function speakSentence(i) {
    if (shadowTimer) { clearTimeout(shadowTimer); shadowTimer = null; }
    if (!shadowList.length) return;
    shadowIdx = Math.max(0, Math.min(shadowList.length - 1, i));
    var text = Core.splitSentences(shadowList[shadowIdx]).join(' ') || shadowList[shadowIdx];
    $('shadowNow').textContent = text;
    $('shadowSource').value = String(shadowIdx);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Shadowing ' + (shadowIdx + 1), artist: 'IELTS Mastery OS', album: 'Pocket Shadowing' });
      navigator.mediaSession.setActionHandler('play', function () { speechSynthesis.resume(); });
      navigator.mediaSession.setActionHandler('pause', function () { speechSynthesis.pause(); });
      navigator.mediaSession.setActionHandler('nexttrack', function () { speakSentence(shadowIdx + 1); });
      navigator.mediaSession.setActionHandler('previoustrack', function () { speakSentence(shadowIdx - 1); });
    }
    var reps = parseInt($('shadowRepeat').value || '1', 10);
    function playOnce(n) {
      var uu = new SpeechSynthesisUtterance(text); uu.lang = 'en-GB'; uu.rate = parseFloat($('shadowRate').value || '1');
      uu.onend = function () {
        if (shadowTimer) { clearTimeout(shadowTimer); shadowTimer = null; }
        if (n + 1 < reps) shadowTimer = setTimeout(function () { playOnce(n + 1); }, 600);
        else if (shadowIdx < shadowList.length - 1) shadowTimer = setTimeout(function () { speakSentence(shadowIdx + 1); }, 1200);
      };
      speechSynthesis.speak(uu);
    }
    speechSynthesis.cancel(); playOnce(0); keepAwake(true);
  }
  $('shadowPlay').addEventListener('click', function () { markStep('warmup'); speakSentence(parseInt($('shadowSource').value || '0', 10)); });
  $('shadowNext').addEventListener('click', function () { speakSentence(shadowIdx + 1); });
  $('shadowPrev').addEventListener('click', function () { speakSentence(shadowIdx - 1); });
  $('shadowPause').addEventListener('click', function () { if (speechSynthesis.speaking && !speechSynthesis.paused) speechSynthesis.pause(); else speechSynthesis.resume(); });
  /* ---------- Ambient synth (Web Audio only) ---------- */
  var ambCtx = null, ambNodes = [];
  function ambient(kind) {
    stopAmbient();
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ambCtx = new AC();
    var len = ambCtx.sampleRate * 2, buf = ambCtx.createBuffer(1, len, ambCtx.sampleRate), d = buf.getChannelData(0), last = 0;
    for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; if (kind === 'rain') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; } else d[i] = w * 0.5; }
    var src = ambCtx.createBufferSource(); src.buffer = buf; src.loop = true;
    var f = ambCtx.createBiquadFilter(); f.type = kind === 'rain' ? 'lowpass' : 'bandpass'; f.frequency.value = kind === 'rain' ? 900 : 500;
    var g = ambCtx.createGain(); g.gain.value = parseFloat($('ambVol').value);
    src.connect(f); f.connect(g); g.connect(ambCtx.destination); src.start(); ambNodes = [src, g]; document.body.dataset.ambient = kind;
  }
  function stopAmbient() { ambNodes.forEach(function (n) { try { n.stop && n.stop(); } catch (e) {} }); if (ambCtx) ambCtx.close().catch(function () {}); ambCtx = null; ambNodes = []; document.body.dataset.ambient = ''; }
  $('ambRain').addEventListener('click', function () { ambient('rain'); });
  $('ambNoise').addEventListener('click', function () { ambient('noise'); });
  $('ambOff').addEventListener('click', stopAmbient);
  $('ambVol').addEventListener('input', function () { if (ambNodes[1]) ambNodes[1].gain.value = parseFloat($('ambVol').value); });
  /* ---------- Today ---------- */
  /* Local-date helper: prefer Core.localDateStr() (device-local, not UTC).
     Core v5 does provide it (verified in js/core.js); this fallback is defined only if Core lacks it,
     so refreshMission never falls back to a UTC epoch-day calculation. */
  function localDateStr() {
    if (Core && typeof Core.localDateStr === 'function') return Core.localDateStr();
    var d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function refreshMission() {
    /* Day-of-curriculum derived from the LOCAL calendar date (via Core.localDateStr()),
       not Date.now()/86400000 which is a UTC epoch day and flips at UTC midnight. */
    var dom = parseInt(localDateStr().slice(8, 10), 10) || 1;
    var day = ((dom - 1) % 28) + 8;
    var cur = packs.curriculum && packs.curriculum.items.find(function (c) { return c.day === day; });
    var box = $('missionBox');
    if (cur) box.textContent = 'Day ' + cur.day + '：' + cur.theme + '｜表現: ' + ((cur.mission.expressions || []).join(' / ') || '—') + '｜発音: ' + (cur.mission.pron_target || '—') + '｜文法: ' + cur.grammar_focus;
    else box.textContent = 'Adaptive Mission（4目標）：①結論ファースト ②Top3文法 ③WPM70+ ④誤認識ゼロ — パック同期で日替わりミッション表示';
    if (state.customMission && state.customMission.date === Core.localDateStr()) box.textContent = '📬 Museカスタム: 表現 ' + ((state.customMission.expressions || []).join(' / ') || '—') + '｜発音 ' + (state.customMission.pronTarget || '—') + ' ／ ' + box.textContent;
    var heat = $('weekHeat'); heat.textContent = '';
    for (var i = 0; i < 28; i++) { var cell = document.createElement('i'); cell.style.background = i < (state.streak || 0) ? 'var(--accent)' : 'var(--surface2)'; heat.appendChild(cell); }
    $('cycleBox').textContent = ['○', '○', '○', '○'].map(function (c, i) { return i < ((state.xp || 0) / 100 | 0) % 5 ? '●' : '○'; }).join('');
  }
  $('startSessionBtn').addEventListener('click', function () { $('sessionStatus').textContent = 'セッション開始：Warm-up→Speak→Grammar→Vocab→Log（40分）。Speakタブへどうぞ。'; showTab('speak'); keepAwake(true); });
  $('heroBtn').addEventListener('click', function () { sfx('click'); if (state.travelMode) { showTab('silent'); startSilent3(); } else { $('sessionStatus').textContent = 'セッション開始：Warm-up→Speak→Grammar→Vocab→Log（40分）。Speakタブへどうぞ。'; showTab('speak'); keepAwake(true); } });
  $('travelToggle').addEventListener('change', function () { state.travelMode = $('travelToggle').checked; saveState(); renderHero(); });
  $('silent3Btn').addEventListener('click', function () { showTab('silent'); startSilent3(); });
  var silent3Iv = null;
  function startSilent3() {
    if (silent3Iv) { stopSilent3(); return; }
    var box = $('silentTimerBox'); if (!box) return;
    var end = Date.now() + 180000;
    box.textContent = '🤫 3分サイレント集中中… 残り 180秒';
    silent3Iv = setInterval(function () { var left = Math.max(0, end - Date.now()); box.textContent = '🤫 3分サイレント集中中… 残り ' + Math.ceil(left / 1000) + '秒'; if (!left) { stopSilent3(); box.textContent = '✅ 3分サイレント完了！お疲れさまでした'; } }, 500);
  }
  function stopSilent3() { if (silent3Iv) { clearInterval(silent3Iv); silent3Iv = null; } var box = $('silentTimerBox'); if (box && box.textContent.indexOf('完了') < 0) box.textContent = ''; }
  /* ---------- Speak: timer + silence radar + recorder ---------- */
  var recStart = 0, timerIv = null, mediaRec = null, recChunks = [], recBlobUrl = null, silences = [], audioCtx = null, vadIv = null, firstSoundAt = 0, recording = false, srObj = null, srFinalText = '', silentMs = 0, vadLastTick = 0;
  function nextQuestion() {
    if (!packs.qbank) { $('qText').textContent = '先にHubでパックを同期してください'; return; }
    var part = parseInt($('partSel').value, 10);
    var pool = packs.qbank.items.filter(function (q) { return q.part === part; });
    var q = pool[Math.random() * pool.length | 0];
    $('qText').textContent = q.q; $('qText').dataset.qid = q.id;
  }
  $('nextQBtn').addEventListener('click', nextQuestion);
  $('recBtn').addEventListener('click', function () {
    if (recording) return;
    recording = true; srFinalText = ''; silentMs = 0; vadLastTick = 0;
    recStart = performance.now(); firstSoundAt = 0; silences = []; keepAwake(true); vibrate(30);
    clearInterval(timerIv); timerIv = setInterval(function () { var s = (performance.now() - recStart) / 1000; $('timerBox').textContent = s.toFixed(1) + 's'; if (parseInt($('partSel').value, 10) === 1 && (Math.abs(s - 35) < 0.15 || Math.abs(s - 45) < 0.15)) vibrate(80); }, 100);
    if (navigator.mediaDevices && window.MediaRecorder) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        mediaRec = new MediaRecorder(stream); recChunks = [];
        mediaRec.ondataavailable = function (e) { recChunks.push(e.data); };
        mediaRec.onstop = function () { stream.getTracks().forEach(function (t) { t.stop(); }); if (recBlobUrl) URL.revokeObjectURL(recBlobUrl); recBlobUrl = URL.createObjectURL(new Blob(recChunks, { type: 'audio/webm' })); $('recAudio').src = recBlobUrl; };
        mediaRec.start(250);
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var an = audioCtx.createAnalyser(); an.fftSize = 2048; audioCtx.createMediaStreamSource(stream).connect(an);
        if (window.IMOSDSP) { var tw = 'cosmopolitan'; try { var pl = JSON.parse($('pairSel').dataset.pairs || '[]'); var pv = pl[parseInt($('pairSel').value || '0', 10)]; if (pv && pv.a) tw = pv.a; } catch (e3) {} window.IMOSDSP.attach(an, { pitchCanvas: $('pitchCanvas'), specCanvas: $('specCanvas'), targetWord: tw }); }
        var data = new Uint8Array(an.fftSize), lastLoud = performance.now();
        clearInterval(vadIv);
        vadIv = setInterval(function () { an.getByteTimeDomainData(data); var rms = 0; for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; rms += v * v; } rms = Math.sqrt(rms / data.length); var tickNow = performance.now(); if (firstSoundAt && rms <= 0.02 && vadLastTick) silentMs += (tickNow - vadLastTick); vadLastTick = tickNow; var now = performance.now(); if (rms > 0.02) { if (!firstSoundAt) { firstSoundAt = now; $('latencyBox').textContent = ((now - recStart) / 1000).toFixed(2) + 's'; } lastLoud = now; } else if (now - lastLoud > 700) { silences.push((now - recStart) / 1000); } drawSilence(); }, 120);
      }).catch(function () { $('latencyBox').textContent = 'マイク不可（手入力モード）'; });
    }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      try {
        srObj = new SR(); srObj.lang = 'en-GB'; srObj.continuous = true; srObj.interimResults = true;
        srObj.onresult = function (e) {
          var interim = '';
          for (var i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) srFinalText += e.results[i][0].transcript + ' '; else interim += e.results[i][0].transcript; }
          $('transcript').value = (srFinalText + interim).trim();
        };
        srObj.onend = function () { if (recording && srObj) { try { srObj.start(); } catch (e2) {} } };
        srObj.onerror = function () {};
        srObj.start();
      } catch (e) { srObj = null; }
    }
  });
  $('stopBtn').addEventListener('click', function () {
    if (!recording && !mediaRec) return;
    recording = false;
    if (srObj) { var sObj = srObj; srObj = null; try { sObj.stop(); } catch (e) {} }
    clearInterval(timerIv); clearInterval(vadIv); keepAwake(false);
    if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
    if (window.IMOSDSP) window.IMOSDSP.detach();
    if (audioCtx) audioCtx.close().catch(function () {});
    var secs = (performance.now() - recStart) / 1000, text = $('transcript').value;
    var w = Core.wpm(text, secs), hits = Core.lint(text, lintRules());
    var est = Core.estimateBand(w, hits.length, Core.wordCount(text));
    $('speakScore').textContent = 'WPM ' + w + '｜推定Band ' + est.band + '｜' + est.disclaimer;
    state.xp = (state.xp || 0) + Core.xpFor('speak'); state.history = state.history || [];
    var attemptId = 'att-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    state.history.push({ wpm: w, at: Date.now(), attemptId: attemptId }); state.lintHistory = (state.lintHistory || []).concat([hits.length]).slice(-30);
    var silR = secs > 0 ? Math.round(silentMs / (secs * 1000) * 100) / 100 : 0;
    state.lastSession = { date: Core.localDateStr(), transcript: text.slice(0, 900), wpm: w, silenceRatio: silR, part: parseInt($('partSel').value, 10), lintTop: hits.slice().sort(function (a, b) { return (a.severity === 'E' ? 0 : 1) - (b.severity === 'E' ? 0 : 1); }).slice(0, 3).map(function (h) { return h.rule_id + ': ' + h.message_ja; }) };
    markStep('speak'); markStep('log');
    queueAttemptLog(attemptId, secs, text, w, hits);
    saveState(); drawGrowth();
  });
  /* ---- Log push queue: Attempts_Log / Lint_Hits / Daily_Log rows, auto-sent when online+GAS ready (attemptId idempotent) ---- */
  function queueAttemptLog(attemptId, secs, text, w, hits) {
    state.logQueue = state.logQueue || { attempts: [], lint_hits: [], daily_log: [] };
    var today = Core.localDateStr();
    state.logQueue.attempts.push({ attemptId: attemptId, ts: new Date().toISOString(), mode: 'speaking', part: parseInt($('partSel').value, 10), qId: $('qText').dataset.qid || '', words: Core.wordCount(text), seconds: Math.round(secs * 10) / 10, effWPM: w, pureWPM: '', silenceRatio: secs > 0 ? Math.round(silentMs / (secs * 1000) * 100) / 100 : '', startDelaySec: firstSoundAt ? Math.round((firstSoundAt - recStart) / 100) / 10 : '', sentCount: Core.splitSentences(text).length, fillers: '', lintCount: hits.length, missionDone: '' });
    hits.slice(0, 10).forEach(function (h) { state.logQueue.lint_hits.push({ ts: new Date().toISOString(), ruleId: h.rule_id, category: 'grammar', excerpt: h.match }); });
    if (!state.logQueue.daily_log.some(function (d) { return d.date === today; })) state.logQueue.daily_log.push({ date: today, duration: Math.max(1, Math.round(secs / 60)), wpmMemo: 'WPM ' + w, theme: $('qText').textContent.slice(0, 60), good: '', fixTomorrow: '' });
    state.dailyLogDates = Array.from(new Set([].concat(state.dailyLogDates || [], [today]))).sort();
    state.streak = Core.computeStreak(state.dailyLogDates);
    flushLogQueue();
  }
  function flushLogQueue() {
    var q = state.logQueue; if (!q || (!q.attempts.length && !q.lint_hits.length && !q.daily_log.length)) return;
    if (!navigator.onLine || !Sync.ready()) return;
    var sentA = q.attempts.map(function (a) { return a.attemptId; }), sentL = q.lint_hits.length, sentD = q.daily_log.map(function (d) { return d.date; });
    Sync.pushLogs({ attempts: q.attempts, lint_hits: q.lint_hits, daily_log: q.daily_log }).then(function () {
      state.logQueue.attempts = state.logQueue.attempts.filter(function (a) { return sentA.indexOf(a.attemptId) < 0; });
      state.logQueue.lint_hits = state.logQueue.lint_hits.slice(sentL);
      state.logQueue.daily_log = state.logQueue.daily_log.filter(function (d) { return sentD.indexOf(d.date) < 0; });
      saveState(); $('syncStatus').textContent = 'ログ自動送信済み: ' + new Date().toLocaleTimeString();
    }).catch(function () { /* stays queued; retried on next stop / online / state sync */ });
  }
  window.addEventListener('online', flushLogQueue);
  function drawSilence() {
    var c = $('silenceCanvas'), x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = '#2dd4bf'; x.fillRect(0, 40, c.width, 10);
    x.fillStyle = '#f87171'; var total = Math.max(10, (performance.now() - recStart) / 1000);
    silences.forEach(function (s) { x.fillRect(s / total * c.width, 30, 4, 30); });
  }
  $('silenceCanvas').addEventListener('click', function (ev) {
    if (!recBlobUrl) return; var rect = ev.target.getBoundingClientRect(); var ratio = (ev.clientX - rect.left) / rect.width;
    var a = $('recAudio'); if (a.duration) a.currentTime = Math.max(0, ratio * a.duration - 2); a.play().catch(function () {});
  });
  function lintRules() { return packs.lint_rules ? Core.compileRules(packs.lint_rules.items) : Core.compileRules(null); }
  $('lintBtn').addEventListener('click', function () {
    var text = $('transcript').value, hits = Core.lint(text, lintRules()), out = $('lintOut'); out.textContent = '';
    if (!hits.length) { markStep('grammar'); sfx('correct'); out.textContent = '✅ 指摘なし（Top3ルール範囲）'; return; }
    markStep('grammar');
    var sorted = hits.slice().sort(function (a, b) { return (a.severity === 'E' ? 0 : 1) - (b.severity === 'E' ? 0 : 1) || a.index - b.index; });
    function hitLine(h) { var p = document.createElement('p'); p.textContent = '⚠ [' + h.rule_id + '] 「' + h.match + '」 ' + h.message_ja + ' → Fix-it: 該当箇所を直して即リトライ'; return p; }
    sorted.slice(0, 3).forEach(function (h) { out.appendChild(hitLine(h)); });
    if (sorted.length > 3) { var det = document.createElement('details'); var sm = document.createElement('summary'); sm.textContent = 'その他の指摘 ' + (sorted.length - 3) + ' 件を表示'; det.appendChild(sm); sorted.slice(3).forEach(function (h) { det.appendChild(hitLine(h)); }); out.appendChild(det); }
  });
  var gboardOn = false, gboardStart = 0;
  $('gboardBtn').addEventListener('click', function () {
    gboardOn = !gboardOn; gboardStart = 0;
    $('gboardBtn').classList.toggle('primary', gboardOn);
    $('gboardBox').textContent = gboardOn ? '⌨️ ライブモードON：マイクボタンで話すと、語数・文数・WPMとコンマスプライス疑いを即時表示します' : '';
    if (gboardOn) $('transcript').focus();
  });
  $('transcript').addEventListener('input', function () {
    if (!gboardOn) return;
    if (!gboardStart) gboardStart = Date.now();
    var text = $('transcript').value, words = Core.wordCount(text), sents = Core.splitSentences(text);
    var elapsed = Math.max(1, (Date.now() - gboardStart) / 1000);
    $('gboardBox').textContent = '語数 ' + words + '｜文数 ' + sents.length + '｜経過 ' + Math.round(elapsed) + '秒｜ライブWPM ' + Math.round(words / elapsed * 60);
    var prev = $('gboardPreview'); prev.textContent = '';
    var runOn = sents.filter(function (s) { return Core.wordCount(s) > 22; });
    if (runOn.length) {
      var warn = document.createElement('p'); warn.textContent = '⚠ コンマスプライス／長文の疑い（22語超の文）:'; prev.appendChild(warn);
      runOn.slice(0, 2).forEach(function (s) { var mk = document.createElement('mark'); mk.className = 'evidence'; mk.textContent = s; prev.appendChild(mk); });
    } else if (words > 0) { var okp = document.createElement('p'); okp.textContent = '✅ 文の長さは良好です'; prev.appendChild(okp); }
  });
  $('retryBtn').addEventListener('click', function () { $('transcript').focus(); $('speakScore').textContent = 'Before/After比較: リトライ後に再度チェックしてください（' + Core.DISCLAIMER + '）'; state.xp = (state.xp || 0) + Core.xpFor('retry'); saveState(); });
  /* ---------- Pronunciation dojo ---------- */
  function mouthSVG() {
    var pairs = { 'L/R': '舌先を歯茎に付ける(L)／付けず丸める(R)', 'W': '唇を強く丸めて突き出す', 'ch/s': 'CHは唇を突き出し破擦音／Sは息だけ長く' };
    var box = $('mouthBox'); box.textContent = '';
    var ns = 'http://www.w3.org/2000/svg'; var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 300 160'); svg.setAttribute('class', 'chart');
    var path = document.createElementNS(ns, 'path'); path.setAttribute('d', 'M20,80 Q90,10 180,30 Q280,50 280,90 Q280,140 170,145 Q70,148 20,80'); path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#2dd4bf'); path.setAttribute('stroke-width', '4'); svg.appendChild(path);
    var tongue = document.createElementNS(ns, 'path'); tongue.setAttribute('d', 'M90,130 Q160,80 230,120'); tongue.setAttribute('fill', 'none'); tongue.setAttribute('stroke', '#f59e0b'); tongue.setAttribute('stroke-width', '8'); tongue.setAttribute('id', 'mouthTongue'); svg.appendChild(tongue);
    var lips = document.createElementNS(ns, 'ellipse'); lips.setAttribute('cx', 26); lips.setAttribute('cy', 80); lips.setAttribute('rx', 7); lips.setAttribute('ry', 12); lips.setAttribute('fill', 'none'); lips.setAttribute('stroke', '#f472b6'); lips.setAttribute('stroke-width', '4'); lips.setAttribute('id', 'mouthLips'); lips.setAttribute('opacity', '0.25'); svg.appendChild(lips);
    var anim = document.createElementNS(ns, 'animate'); anim.setAttribute('attributeName', 'd'); anim.setAttribute('values', 'M90,130 Q160,80 230,120;M90,130 Q160,110 230,120;M90,130 Q160,80 230,120'); anim.setAttribute('dur', '1.6s'); anim.setAttribute('repeatCount', 'indefinite'); tongue.appendChild(anim);
    box.appendChild(svg);
    var sel = $('pairSel'); sel.textContent = '';
    var pairList = (packs.lexicon && packs.lexicon.pairs) || [{ a: 'learning', b: 'running', label: 'L/R', hint_ja: pairs['L/R'] }];
    pairList.slice(0, 60).forEach(function (p, i) { var o = document.createElement('option'); o.value = i; o.textContent = p.a + ' vs ' + p.b + '（' + p.label + '）'; sel.appendChild(o); });
    sel.dataset.pairs = JSON.stringify(pairList.slice(0, 60));
    if (pairList[0]) drawMouthArt(pairList[0].label);
  }
  function drawMouthArt(label) {
    var tongue = document.getElementById('mouthTongue'), lips = document.getElementById('mouthLips');
    if (!tongue || !lips) return;
    var ns = 'http://www.w3.org/2000/svg';
    var flat = 'M90,132 Q160,118 232,124', up = 'M90,130 Q150,55 225,95', curl = 'M95,132 Q170,95 215,128', mid = 'M90,130 Q160,100 232,118';
    var d1 = flat, d2 = flat, lipO = '0.25', lipRx = '7', hint = '音素を選ぶと舌・唇の動きが切り替わります';
    if (label && label.indexOf('W') >= 0) { lipO = '1'; lipRx = '4'; d2 = 'M90,132 Q160,124 232,126'; hint = 'W: 唇を強く丸めて突き出す（すぼめる）'; }
    else if (label && label.indexOf('L') >= 0) { d1 = up; d2 = curl; hint = 'L: 舌先を歯茎に付ける／R: 舌を丸めて付けない'; }
    else if (label) { d1 = mid; d2 = flat; hint = 'CH: 唇を突き出して破擦音／S: 歯を閉じて息だけ長く'; }
    tongue.setAttribute('d', d1);
    var old = tongue.querySelector('animate'); if (old) tongue.removeChild(old);
    var anim = document.createElementNS(ns, 'animate'); anim.setAttribute('attributeName', 'd'); anim.setAttribute('values', d1 + ';' + d2 + ';' + d1); anim.setAttribute('dur', '1.6s'); anim.setAttribute('repeatCount', 'indefinite'); tongue.appendChild(anim);
    lips.setAttribute('opacity', lipO); lips.setAttribute('rx', lipRx);
    var note = $('mouthNote'); if (note) note.textContent = '👄 ' + hint + '（疑われる発音ターゲット・簡易推定）';
  }
  $('pairSel').addEventListener('change', function () { var list = JSON.parse($('pairSel').dataset.pairs || '[]'); var pp = list[parseInt($('pairSel').value || '0', 10)]; if (pp) drawMouthArt(pp.label); });
  $('pairSpeak').addEventListener('click', function () { var list = JSON.parse($('pairSel').dataset.pairs || '[]'); var p = list[parseInt($('pairSel').value || '0', 10)]; if (!p) return; var u = new SpeechSynthesisUtterance(p.a + '. ' + p.b + '.'); u.lang = 'en-GB'; speechSynthesis.speak(u); });
  $('benchBtn').addEventListener('click', function () { if (packs.bench) { var b = packs.bench.items[Math.random() * packs.bench.items.length | 0]; $('benchText').textContent = b.text + '（目標' + b.seconds_target + '秒・' + Core.DISCLAIMER + '）'; var u = new SpeechSynthesisUtterance(b.text); u.lang = 'en-GB'; speechSynthesis.speak(u); } });
  /* ---------- Silent: SRS ---------- */
  var srsQueue = [], srsIdx = 0, srsMode = 'due';
  function buildSRS() {
    var cards = (packs.srs_library ? packs.srs_library.items : []).map(function (c) { var saved = (state.srs || {})[c.id]; return Object.assign({}, c, saved || {}); });
    srsQueue = srsMode === 'due' ? cards.filter(function (c) { return Core.isDue(c); }) : cards;
    srsIdx = 0; showSRS();
  }
  function showSRS() { var c = srsQueue[srsIdx]; if (!c) { $('srsCard').textContent = 'カードなし（同期してください）'; return; } $('srsCard').textContent = c.word; $('srsMeta').textContent = c.meaning_ja + '｜例: ' + c.example + '｜' + (srsIdx + 1) + '/' + srsQueue.length + '｜期限: ' + (c.due || '今日'); $('srsCard').dataset.id = c.id; }
  var s3stop = $('silent3StopBtn'); if (s3stop) s3stop.addEventListener('click', stopSilent3);
  $('srsDueBtn').addEventListener('click', function () { srsMode = 'due'; buildSRS(); });
  $('srsAllBtn').addEventListener('click', function () { srsMode = 'all'; buildSRS(); });
  document.querySelectorAll('.gradeBtn').forEach(function (b) { b.addEventListener('click', function () { var c = srsQueue[srsIdx]; if (!c) return; var upd = Core.sm2(Object.assign({}, c), parseInt(b.dataset.grade, 10)); state.srs = state.srs || {}; state.srs[c.id] = { ease: upd.ease, interval: upd.interval, reps: upd.reps, due: upd.due, updatedAt: upd.updatedAt, attempts: ((state.srs[c.id] || {}).attempts || 0) + 1 }; state.xp = (state.xp || 0) + Core.xpFor('srs'); var td = Core.localDateStr(); state.srsDoneByDate = state.srsDoneByDate || {}; state.srsDoneByDate[td] = (state.srsDoneByDate[td] || 0) + 1; markStep('grammar'); sfx('correct'); saveState(); srsIdx++; showSRS(); vibrate(20); }); });
  $('srsSpeakBtn').addEventListener('click', function () { var u = new SpeechSynthesisUtterance($('srsCard').textContent); u.lang = 'en-GB'; speechSynthesis.speak(u); });
  $('srsRepairBtn').addEventListener('click', function () { var c = srsQueue[srsIdx]; if (c) { $('srsMeta').textContent = '⚡ 3秒リペア: ' + c.pron_note; setTimeout(showSRS, 3000); } });
  $('srsExportBtn').addEventListener('click', function () { var tsv = (packs.srs_library ? packs.srs_library.items : []).map(function (c) { return [c.word, c.meaning_ja, c.example].join('\t'); }).join('\n'); download('imos-srs.tsv', tsv, 'text/tab-separated-values'); });
  function download(name, content, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: type || 'application/json' })); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }
  /* ---------- Alchemist ---------- */
  var alcTask = 2, alcIdx = 0;
  function showAlchemy() {
    var pack = alcTask === 2 ? packs.alchemy : packs.alchemy_task1; var box = $('alcBox'); box.textContent = '';
    if (!pack || !pack.items.length) { box.textContent = 'パック未同期'; return; }
    var it = pack.items[alcIdx % pack.items.length];
    var h = document.createElement('p'); h.textContent = 'Topic: ' + it.topic + '（Task ' + it.task + '）'; box.appendChild(h);
    var src = document.createElement('p'); src.textContent = 'Band 5.5原文: ' + it.source_band55; box.appendChild(src);
    var cards = document.createElement('div'); cards.className = 'row';
    it.cards.forEach(function (c) { var b = document.createElement('button'); b.type = 'button'; b.textContent = c.text; b.addEventListener('click', function () { b.classList.toggle('primary'); }); cards.appendChild(b); }); box.appendChild(cards);
    var ans = document.createElement('details'); var sum = document.createElement('summary'); sum.textContent = 'Band 7.0/8.0モデル＆Diffを見る'; ans.appendChild(sum);
    var p70 = document.createElement('p'); p70.textContent = 'B7.0: ' + it.answer_b70; ans.appendChild(p70);
    var p80 = document.createElement('p'); p80.textContent = 'B8.0: ' + it.answer_b80; ans.appendChild(p80);
    it.diff.forEach(function (d) { var dp = document.createElement('p'); dp.textContent = '🔀 ' + d.from + ' → ' + d.to + '（' + d.why_ja + '）'; ans.appendChild(dp); });
    box.appendChild(ans);
  }
  $('alcT2Btn').addEventListener('click', function () { alcTask = 2; alcIdx = 0; showAlchemy(); });
  $('alcT1Btn').addEventListener('click', function () { alcTask = 1; alcIdx = 0; showAlchemy(); });
  $('alcNextBtn').addEventListener('click', function () { alcIdx++; showAlchemy(); state.xp = (state.xp || 0) + Core.xpFor('alchemy'); saveState(); });
  /* ---------- Reading X-Ray ---------- */
  function buildReading() {
    var sel = $('readSel'); sel.textContent = '';
    (packs.reading_traps ? packs.reading_traps.items : []).forEach(function (r, i) { var o = document.createElement('option'); o.value = i; o.textContent = r.title || r.id; sel.appendChild(o); });
    showReading(0);
  }
  function showReading(i) {
    var pack = packs.reading_traps; if (!pack) return; var r = pack.items[i]; if (!r) return;
    var box = $('readBox'); box.textContent = '';
    var p = document.createElement('p'); var span = r.questions[0] && r.questions[0].evidence_span;
    if (span && r.passage.indexOf(span) >= 0) { var parts = r.passage.split(span); p.appendChild(document.createTextNode(parts[0])); var mk = document.createElement('mark'); mk.className = 'evidence'; mk.textContent = span; p.appendChild(mk); p.appendChild(document.createTextNode(parts.slice(1).join(span))); }
    else p.textContent = r.passage;
    box.appendChild(p);
    var svg = $('xraySvg'); svg.textContent = '';
    var ns = 'http://www.w3.org/2000/svg'; var path = document.createElementNS(ns, 'path'); path.setAttribute('d', 'M40,70 C200,0 440,0 600,60'); path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#f59e0b'); path.setAttribute('stroke-width', '3'); svg.appendChild(path);
    var qb = $('readQBox'); qb.textContent = '';
    r.questions.forEach(function (q) {
      var div = document.createElement('div');
      var t = document.createElement('p'); t.textContent = '[' + q.kind.toUpperCase() + '] ' + q.statement; div.appendChild(t);
      if (q.kind === 'tfng' || !q.options.length) { ['TRUE', 'FALSE', 'NOT GIVEN'].forEach(function (opt) { var b = document.createElement('button'); b.type = 'button'; b.textContent = opt; b.addEventListener('click', function () { b.textContent = opt + (opt === q.answer ? ' ✅' : ' ❌ 正解:' + q.answer); state.readingStats = state.readingStats || { ok: 0, total: 0 }; state.readingStats.total++; if (opt === q.answer) { state.readingStats.ok++; state.xp = (state.xp || 0) + Core.xpFor('reading'); saveState(); } showEvidence(r, q); }); div.appendChild(b); }); }
      else q.options.forEach(function (opt) { var b = document.createElement('button'); b.type = 'button'; b.textContent = opt; b.addEventListener('click', function () { b.textContent = opt + (opt === q.answer ? ' ✅' : ' ❌'); state.readingStats = state.readingStats || { ok: 0, total: 0 }; state.readingStats.total++; if (opt === q.answer) state.readingStats.ok++; saveState(); showEvidence(r, q); }); div.appendChild(b); });
      qb.appendChild(div);
    });
  }
  function showEvidence(r, q) {
    var box = $('readBox'); box.textContent = ''; var p = document.createElement('p');
    if (q.evidence_span && r.passage.indexOf(q.evidence_span) >= 0) { var parts = r.passage.split(q.evidence_span); p.appendChild(document.createTextNode(parts[0])); var mk = document.createElement('mark'); mk.className = 'evidence'; mk.textContent = q.evidence_span; p.appendChild(mk); p.appendChild(document.createTextNode(parts.slice(1).join(q.evidence_span))); }
    else p.textContent = r.passage;
    box.appendChild(p); var ex = document.createElement('p'); ex.className = 'muted'; ex.textContent = q.explanation_ja; box.appendChild(ex);
  }
  $('readSel').addEventListener('change', function () { showReading(parseInt($('readSel').value, 10)); });
  /* ---------- Task1 chart renderer (multi-series SVG) ---------- */
  function renderChart(it) {
    var box = $('chartBox'); box.textContent = ''; if (!it) return;
    var ns = 'http://www.w3.org/2000/svg'; var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 640 300'); svg.setAttribute('class', 'chart');
    function el(n, attrs) { var e = document.createElementNS(ns, n); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); svg.appendChild(e); return e; }
    var title = el('text', { x: 10, y: 22, fill: '#e8eefc', 'font-size': 15 }); title.textContent = it.title + '（' + it.chart_type + '）';
    if (it.chart_type === 'process') {
      it.steps.forEach(function (s, i) { var x = 20 + (i % 3) * 210, y = 50 + Math.floor(i / 3) * 110; el('rect', { x: x, y: y, width: 180, height: 70, rx: 10, fill: '#1e2c4d', stroke: '#2dd4bf' }); var t = el('text', { x: x + 10, y: y + 28, fill: '#e8eefc', 'font-size': 13 }); t.textContent = s.order + '. ' + s.label; var d = el('text', { x: x + 10, y: y + 50, fill: '#9db0d6', 'font-size': 10 }); d.textContent = s.description.slice(0, 34); });
    } else if (it.chart_type === 'pie') {
      var total = it.slices.reduce(function (a, s) { return a + s.value; }, 0) || 1, ang = -Math.PI / 2, colors = ['#2dd4bf', '#f59e0b', '#818cf8', '#f472b6', '#34d399', '#facc15'];
      it.slices.forEach(function (s, i) { var a2 = ang + s.value / total * Math.PI * 2; var x1 = 200 + 110 * Math.cos(ang), y1 = 160 + 110 * Math.sin(ang), x2 = 200 + 110 * Math.cos(a2), y2 = 160 + 110 * Math.sin(a2); el('path', { d: 'M200,160 L' + x1 + ',' + y1 + ' A110,110 0 ' + (a2 - ang > Math.PI ? 1 : 0) + ',1 ' + x2 + ',' + y2 + ' Z', fill: colors[i % 6] }); var lt = el('text', { x: 360, y: 80 + i * 26, fill: '#e8eefc', 'font-size': 13 }); lt.textContent = s.label + ': ' + s.value; ang = a2; });
    } else {
      var all = []; it.series.forEach(function (s) { all = all.concat(s.values); });
      var max = Math.max.apply(null, all.concat([1])), min = Math.min(0, Math.min.apply(null, all));
      var colors2 = ['#2dd4bf', '#f59e0b', '#818cf8'];
      it.series.forEach(function (s, si) {
        if (it.chart_type === 'bar') { s.values.forEach(function (v, i) { var bw = 560 / (s.values.length * it.series.length); var h = (v - min) / (max - min) * 200; el('rect', { x: 50 + i * (560 / s.values.length) + si * bw, y: 250 - h, width: bw - 3, height: h, fill: colors2[si % 3] }); }); }
        else { var pts = s.values.map(function (v, i) { return (50 + i * (560 / Math.max(1, s.values.length - 1))) + ',' + (250 - (v - min) / (max - min) * 200); }).join(' '); el('polyline', { points: pts, fill: 'none', stroke: colors2[si % 3], 'stroke-width': 3 }); }
        var lg = el('text', { x: 50 + si * 160, y: 285, fill: colors2[si % 3], 'font-size': 13 }); lg.textContent = s.name;
      });
      it.labels.forEach(function (l, i) { var t = el('text', { x: 44 + i * (560 / Math.max(1, it.labels.length - 1)), y: 268, fill: '#9db0d6', 'font-size': 10 }); t.textContent = l; });
    }
    box.appendChild(svg);
    var kf = document.createElement('p'); kf.className = 'muted'; kf.textContent = '要点: ' + it.key_features_ja.join(' / '); box.appendChild(kf);
    var det = document.createElement('details'); var sm = document.createElement('summary'); sm.textContent = 'モデル回答（B7.0）'; det.appendChild(sm); var mp = document.createElement('p'); mp.textContent = it.model_b70; det.appendChild(mp); box.appendChild(det);
  }
  function buildCharts() { var sel = $('chartSel'); sel.textContent = ''; (packs.task1_charts ? packs.task1_charts.items : []).forEach(function (c, i) { var o = document.createElement('option'); o.value = i; o.textContent = c.chart_type + ': ' + c.title; sel.appendChild(o); }); if (packs.task1_charts) renderChart(packs.task1_charts.items[0]); }
  $('chartSel').addEventListener('change', function () { renderChart(packs.task1_charts.items[parseInt($('chartSel').value, 10)]); });
  $('peelBtn').addEventListener('click', function () {
    var t = $('peelText').value.toLowerCase(), checks = [['Point（結論）', /^(overall|in conclusion|the (graph|chart|process) shows)/m.test(t) || t.length > 20], ['Evidence（数値・根拠）', /\d/.test(t)], ['Explain（解釈）', /(because|this means|as a result|therefore)/.test(t)], ['Link（締め）', /(overall|in summary|to sum up)/.test(t)]];
    state.peelStats = state.peelStats || { ok: 0, total: 0 }; state.peelStats.total++; if (checks.every(function (c) { return c[1]; })) state.peelStats.ok++; saveState();
    var out = $('peelOut'); out.textContent = ''; checks.forEach(function (c) { var p = document.createElement('p'); p.textContent = (c[1] ? '✅ ' : '❌ ') + c[0]; out.appendChild(p); });
  });
  /* ---------- Arena ---------- */
  /* ---------- Bestiary RPG (Phase C game module) ---------- */
  if (window.IMOSBestiaryGame) window.IMOSBestiaryGame.init({ packs: function () { return packs; }, state: function () { return state; }, save: function () { saveState(); }, addXp: function (n) { state.xp = (state.xp || 0) + n; saveState(); }, sfx: function (n, arg) { sfx(n, arg); }, core: Core });
  var bargeTimer = null;
  if (window.IMOSSeminar) window.IMOSSeminar.init({ packs: function () { return packs; }, state: function () { return state; }, save: function () { saveState(); }, addXp: function (n) { state.xp = (state.xp || 0) + n; saveState(); }, sfx: function (n, arg) { sfx(n, arg); }, core: Core });
  if (window.IMOSSanctuary) window.IMOSSanctuary.init({ state: function () { return state; } });
  if (window.IMOSRider) window.IMOSRider.init({ packs: function () { return packs; }, state: function () { return state; }, save: function () { saveState(); }, addXp: function (n) { state.xp = (state.xp || 0) + n; saveState(); }, sfx: function (n, arg) { sfx(n, arg); }, core: Core });
  var rjb = $('riderJumpBtn'); if (rjb) rjb.addEventListener('click', function () { showTab('arena'); });
  $('bargeBtn').addEventListener('click', function () {
    var gw = packs.groupwork; var box = $('bargeBox'); box.textContent = '';
    if (!gw) { box.textContent = 'パック未同期'; return; }
    var s = gw.items[Math.random() * gw.items.length | 0]; box.dataset.gid = s.id;
    s.turns.forEach(function (t) { var p = document.createElement('p'); p.textContent = t.speaker + ': ' + t.text; box.appendChild(p); });
    var note = document.createElement('p'); note.className = 'muted'; note.textContent = s.interrupt_at + '秒で割り込みチャンス！ 目標フレーズ: ' + s.target_phrases.join(' / '); box.appendChild(note);
    clearTimeout(bargeTimer); bargeTimer = setTimeout(function () { note.textContent += ' ⏰ 今！割り込んでください'; vibrate(100); }, s.interrupt_at * 1000);
  });
  $('bargeHitBtn').addEventListener('click', function () { sfx('barge'); var gw = packs.groupwork; if (!gw) return; var s = gw.items.find(function (g) { return g.id === $('bargeBox').dataset.gid; }); if (s) $('bargeBox').appendChild(Object.assign(document.createElement('p'), { textContent: '🗣 モデル割り込み: ' + s.model_reply })); });
  document.addEventListener('keydown', function (e) { var tag = (e.target && e.target.tagName) || ''; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.isComposing) return; if (e.code === 'Space' && $('tab-arena').classList.contains('active')) { e.preventDefault(); $('bargeHitBtn').click(); } });
  $('mockBtn').addEventListener('click', function () { $('bargeBox').textContent = 'Mock Exam開始（12分フル/6分短縮）：Part1→2→3をSpeakタブのタイマーで通し実施してください。終了時にXP+50。'; state.xp = (state.xp || 0) + Core.xpFor('mock'); saveState(); keepAwake(true); });
  function buildDebate() { var sel = $('debSel'); sel.textContent = ''; (packs.debate_arena ? packs.debate_arena.items : []).forEach(function (d, i) { var o = document.createElement('option'); o.value = i; o.textContent = d.topic; sel.appendChild(o); }); showDebate(0, 'for'); }
  function showDebate(i, sideName) {
    var pack = packs.debate_arena; if (!pack) return; var d = pack.items[i]; if (!d) return;
    var box = $('debBox'); box.textContent = '';
    var p = document.createElement('p'); p.textContent = d.prompt; box.appendChild(p);
    var st = document.createElement('p'); st.textContent = (sideName === 'for' ? '賛成: ' : '反対: ') + (sideName === 'for' ? d.for_side.stance_en : d.against_side.stance_en); box.appendChild(st);
    box.dataset.idx = i; box.dataset.side = sideName;
  }
  $('debSel').addEventListener('change', function () { showDebate(parseInt($('debSel').value, 10), 'for'); });
  $('debForBtn').addEventListener('click', function () { debatePlay('for'); });
  $('debAgainstBtn').addEventListener('click', function () { debatePlay('against'); });
  function debatePlay(sideName) {
    var pack = packs.debate_arena; if (!pack) return; var d = pack.items[parseInt($('debBox').dataset.idx || '0', 10)]; showDebate(pack.items.indexOf(d), sideName);
    var counters = sideName === 'for' ? d.against_side.counter_arguments : d.for_side.counter_arguments;
    var c = counters[Math.random() * counters.length | 0];
    $('debLog').textContent = c ? ('相手の反論[' + c.angle + ']: ' + c.attack_en + ' → 譲歩＋再反論モデル: ' + c.model_rebuttal_b75) : '反論データなし';
  }
  $('debConcedeBtn').addEventListener('click', function () { $('debLog').textContent = '🃏 譲歩カード: "That is a fair point, and it matters because… — however, on balance…" と一度認めてから反論すると Band 7+ の柔軟さを示せます。'; });
  $('accentBtn').addEventListener('click', function () { var acc = [['en-GB', 'British'], ['en-US', 'American'], ['en-AU', 'Australian'], ['en-IN', 'Indian'], ['en-CA', 'Canadian']][Math.random() * 5 | 0]; $('accentBox').textContent = '今回のアクセント: ' + acc[1] + '（' + acc[0] + '）で次の文を読み上げます'; var u = new SpeechSynthesisUtterance('The development of practical skills remains important for university students.'); u.lang = acc[0]; speechSynthesis.speak(u); });
  /* ---------- Hub: growth charts ---------- */
  function drawGrowth() {
    var svg = $('growthSvg'); if (!svg) return; svg.textContent = ''; var ns = 'http://www.w3.org/2000/svg';
    var hist = (state.history || []).slice(-14); if (!hist.length) hist = [{ wpm: 48 }, { wpm: 55 }, { wpm: 63 }];
    var pts = hist.map(function (h, i) { return (30 + i * (580 / Math.max(1, hist.length - 1))) + ',' + (200 - Math.min(180, h.wpm * 1.4)); }).join(' ');
    var pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', pts); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', '#2dd4bf'); pl.setAttribute('stroke-width', '3'); svg.appendChild(pl);
    var t = document.createElementNS(ns, 'text'); t.setAttribute('x', 10); t.setAttribute('y', 20); t.setAttribute('fill', '#9db0d6'); t.textContent = '実効WPM推移（' + Core.DISCLAIMER + '）'; svg.appendChild(t);
    var radar = $('radarSvg'); radar.textContent = '';
    var histW = (state.history || []).slice(-5);
    var avgW = histW.length ? histW.reduce(function (a, h) { return a + (h.wpm || 0); }, 0) / histW.length : 0;
    var lintH = (state.lintHistory || []).slice(-5);
    var avgLint = lintH.length ? lintH.reduce(function (a, n) { return a + n; }, 0) / lintH.length : 3;
    var mastered = Object.keys(state.srs || {}).filter(function (id) { return (state.srs[id].reps || 0) >= 2; }).length;
    var rs = state.readingStats || { ok: 0, total: 0 }, ps = state.peelStats || { ok: 0, total: 0 };
    var killsT = Object.keys(state.monsters || {}).reduce(function (a, id) { return a + (state.monsters[id].kills || 0); }, 0);
    var stage = avgW >= 100 && killsT >= 10 ? 4 : avgW >= 85 && killsT >= 5 ? 3 : avgW >= 70 && killsT >= 2 ? 2 : 1;
    if ($('ladderBox')) $('ladderBox').textContent = ({ 1: 'Stage 1（5.5→6.0）', 2: 'Stage 2（6.0→6.5）', 3: 'Stage 3（6.5→7.0）', 4: 'Stage 4（7.0→7.5）' })[stage] + '｜討伐 ' + killsT + '｜平均WPM ' + Math.round(avgW);
    var axes = ['Speak', 'Grammar', 'Vocab', 'Listen', 'Write'], vals = [Math.min(1, avgW / 130), Math.max(0.1, 1 - avgLint / 8), Math.min(1, mastered / 20), rs.total ? rs.ok / rs.total : 0.3, ps.total ? ps.ok / ps.total : 0.3];
    var rp = vals.map(function (v, i) { var a = -Math.PI / 2 + i * Math.PI * 2 / 5; return (150 + 85 * v * Math.cos(a)) + ',' + (110 + 85 * v * Math.sin(a)); }).join(' ');
    var poly = document.createElementNS(ns, 'polygon'); poly.setAttribute('points', rp); poly.setAttribute('fill', 'rgba(45,212,191,0.4)'); poly.setAttribute('stroke', '#2dd4bf'); radar.appendChild(poly);
    axes.forEach(function (a, i) { var ang = -Math.PI / 2 + i * Math.PI * 2 / 5; var tx = document.createElementNS(ns, 'text'); tx.setAttribute('x', 150 + 100 * Math.cos(ang)); tx.setAttribute('y', 110 + 100 * Math.sin(ang)); tx.setAttribute('fill', '#9db0d6'); tx.setAttribute('font-size', '11'); tx.textContent = a; radar.appendChild(tx); });
    var ach = ['🏅 初スピーキング', '🔥 3日連続', '⚔️ 初討伐', '🃏 SRS100回', '🎧 シャドーイング10本', '🧪 Alchemist制覇', '🔬 X-Ray全問', '📊 Task1全型', '😈 Debate勝利', '🎤 WPM100', '📝 Mock完走', '👑 Band 7.0到達'];
    $('achieveBox').textContent = '実績（XP ' + (state.xp || 0) + '）: ' + ach.map(function (a, i) { return (state.xp || 0) >= (i + 1) * 100 ? a + ' ✅' : a + ' 🔒'; }).join(' ／ ');
  }
  /* ---------- Hub: sync ---------- */
  var gasCfg = Sync.cfg(); $('gasUrl').value = gasCfg.url || ''; $('gasToken').value = gasCfg.token || '';
  $('gasSaveBtn').addEventListener('click', function () { Sync.saveCfg($('gasUrl').value.trim(), $('gasToken').value.trim()); $('hubSyncStatus').textContent = '保存しました（localStorage imos.gas のみ）'; });
  var PACK_FILES = { qbank: 'pack-qbank.json', bench: 'pack-bench.json', lint_rules: 'pack-lint_rules.json', curriculum: 'pack-curriculum.json', srs_library: 'pack-srs_library.json', lexicon: 'pack-lexicon.json', drills: 'pack-drills.json', groupwork: 'pack-groupwork.json', alchemy: 'pack-alchemy.json', alchemy_task1: 'pack-alchemy-task1.json', reading_traps: 'pack-reading-traps.json', task1_charts: 'pack-task1-charts.json', debate_arena: 'pack-debate-arena.json' };
  $('packSyncBtn').addEventListener('click', function () {
    if (!Sync.ready()) { $('packProgText').textContent = '先にGAS URL/Tokenを保存してください'; return; }
    var names = Object.keys(PACK_FILES), done = 0;
    var force = $('packForce') && $('packForce').checked;
    idbGet('__packMeta').then(function (meta) {
      meta = meta || {};
      return Sync.packsManifest().catch(function () { return null; }).then(function (man) {
        var remote = {}; ((man && man.packs) || []).forEach(function (pf) { remote[pf.name] = pf.updatedAt; });
        var targets = names.filter(function (tn) { var fn = PACK_FILES[tn]; return force || !packs[tn] || (remote[fn] && remote[fn] !== meta[fn]); });
        if (!targets.length) { $('packProg').value = 13; $('packProgText').textContent = '✅ 全パック最新です（差分なし）'; return null; }
        return targets.reduce(function (chain, tn) { return chain.then(function () { return Sync.fetchPack(PACK_FILES[tn]).then(function (raw) { return ingest(raw, PACK_FILES[tn]); }).then(function () { meta[PACK_FILES[tn]] = remote[PACK_FILES[tn]] || 'local'; done++; $('packProg').value = Math.round(done / targets.length * 13); $('packProgText').textContent = done + '/' + targets.length + ' 差分同期中… ' + PACK_FILES[tn]; }); }); }, Promise.resolve()).then(function () { return idbSet('__packMeta', meta); }).then(function () { $('packProgText').textContent = '✅ ' + targets.length + 'パック差分同期完了'; refreshAll(); });
      });
    }).catch(function (e) { $('packProgText').textContent = '同期エラー: ' + e.message; });
  });
  $('packFile').addEventListener('change', function () { Array.prototype.forEach.call($('packFile').files, function (f) { f.text().then(function (t) { ingest(JSON.parse(t), f.name).then(refreshAll); }); }); });
  $('qrBtn').addEventListener('click', function () {
    var box = $('qrBox'); box.textContent = '';
    if (!Sync.ready()) { box.textContent = '先にGAS URL/Tokenを保存してください'; return; }
    var base = location.origin + location.pathname;
    var cfgNow = Sync.cfg();
    var url = base + '#imos_cfg=' + b64urlEncode(JSON.stringify({ u: cfgNow.url, t: cfgNow.token }));
    try {
      var enc = window.IMOSQR.encode(url, 'L');
      box.appendChild(window.IMOSQR.toSVG(enc, 5));
      var cap = document.createElement('p'); cap.className = 'muted'; cap.textContent = 'Androidのカメラで読み取ると設定が転送されます（V' + enc.version + '）'; box.appendChild(cap);
    } catch (e) { box.textContent = 'QR生成エラー: ' + e.message; }
    sfx('click');
  });
  $('animToggle').checked = !!settings.animOff;
  document.body.classList.toggle('no-anim', !!settings.animOff);
  $('animToggle').addEventListener('change', function () { settings.animOff = $('animToggle').checked; document.body.classList.toggle('no-anim', settings.animOff); localStorage.setItem('imos.settings', JSON.stringify(settings)); });
  function doStateSync() {
    if (!Sync.ready()) { $('hubSyncStatus').textContent = 'GAS未設定'; return Promise.resolve(); }
    return Sync.statePull().then(function (remote) { var merged = Core.mergeState(state, (remote && remote.state) || remote || {}); state = merged; saveState(); return Sync.statePush(state); }).then(function () { $('hubSyncStatus').textContent = '✅ 状態同期完了 ' + new Date().toLocaleTimeString(); $('syncStatus').textContent = '最終同期: ' + new Date().toLocaleString(); }).catch(function (e) { $('hubSyncStatus').textContent = '同期エラー: ' + e.message; });
  }
  $('stateSyncBtn').addEventListener('click', doStateSync);
  $('todaySyncBtn').addEventListener('click', doStateSync);
  function buildDailyPacket() {
    var today = Core.localDateStr(), ls = state.lastSession || {};
    var hist = state.history || [];
    var avgW = hist.length ? Math.round(hist.slice(-7).reduce(function (a, h) { return a + (h.wpm || 0); }, 0) / Math.min(7, hist.length)) : 0;
    var cur = packs.curriculum && packs.curriculum.items.find(function (c) { return c.day === (((Date.now() / 86400000 | 0) % 28) + 8); });
    var lines = ['DAILY_PACKET ' + today, 'XP: ' + (state.xp || 0) + ' / Streak: ' + (state.streak || 0) + '日', '今日の平均WPM(直近7回): ' + avgW, '直近セッション: Part ' + (ls.part || '-') + ' / WPM ' + (ls.wpm || '-') + ' / 沈黙率 ' + (ls.silenceRatio !== undefined ? ls.silenceRatio : '-'), 'Lint Top3: ' + ((ls.lintTop || []).join(' | ') || 'なし'), '疑われる発音ターゲット: ' + (cur ? cur.mission.pron_target : '—'), 'SRS本日消化: ' + ((state.srsDoneByDate || {})[today] || 0) + '枚', 'Transcript:', ls.transcript || $('transcript').value || '(なし)'];
    return lines.join('\n');
  }
  function sendDailyPacket() {
    if (!Sync.ready()) { $('hubSyncStatus').textContent = 'GAS未設定'; $('outboxStatus').textContent = 'GAS未設定'; return; }
    var text = buildDailyPacket();
    var pid = 'pkt-' + Core.localDateStr() + '-' + shortHash(text);
    Sync.enqueueMuse(pid, text).then(function () { $('hubSyncStatus').textContent = '📤 Daily Packet送信完了（' + pid + '）'; $('outboxStatus').textContent = '📤 Daily Packetを送信しました'; sfx('correct'); }).catch(function (e) { $('hubSyncStatus').textContent = 'エラー: ' + e.message; });
  }
  $('enqueueBtn').addEventListener('click', sendDailyPacket);
  $('coachSendBtn').addEventListener('click', sendDailyPacket);
  $('coachPullBtn').addEventListener('click', function () { pullOutbox(); });
  function pullOutbox() {
    if (!Sync.ready()) { $('outboxStatus').textContent = 'GAS未設定'; return; }
    Sync.pullMuseOutbox().then(function (res) {
      var items = (res && (res.items || res.rows)) || [];
      $('outboxStatus').textContent = items.length ? '📥 ' + items.length + '件の返信を反映しました' : '新しい返信はありません';
      var inbox = $('coachInbox'); inbox.textContent = '';
      if (!items.length) { var none = document.createElement('p'); none.className = 'muted'; none.textContent = '返信はまだありません'; inbox.appendChild(none); }
      items.forEach(function (it) {
        var card = document.createElement('div'); card.className = 'coachreply';
        var h = document.createElement('p'); h.textContent = '📬 ' + (it.processedAt || '') + ' のコーチ返信'; card.appendChild(h);
        var s = document.createElement('p'); s.textContent = it.museReplySummary || '(要約なし)'; card.appendChild(s);
        inbox.appendChild(card);
        if (it.museSyncJson) {
          try {
            var parsed = JSON.parse(it.museSyncJson);
            var syncObj = parsed.muse_sync || parsed;
            state.customMission = { date: Core.localDateStr(), expressions: syncObj.expressions || syncObj.missions || [], pronTarget: syncObj.pron_target || syncObj.pronTarget || '', drills: syncObj.drills || [] };
            var ap = document.createElement('p'); ap.className = 'muted'; ap.textContent = '✅ 今日のカスタムミッションに反映しました'; card.appendChild(ap);
          } catch (e) { /* not JSON: summary-only reply */ }
        }
      });
      if (items.length) { state.pendingSrs = (state.pendingSrs || []).concat(items); saveState(); refreshMission(); Sync.ackMuseOutbox(items.map(function (i) { return i.packetId; })).catch(function () {}); }
    }).catch(function (e) { $('outboxStatus').textContent = 'エラー: ' + e.message; });
  }
  $('outboxBtn').addEventListener('click', pullOutbox);
  $('todayOutboxBtn').addEventListener('click', pullOutbox);
  $('exportBtn').addEventListener('click', function () { download('imos-backup.json', JSON.stringify({ state: state, exportedAt: new Date().toISOString() }, null, 2)); });
  $('importFile').addEventListener('change', function () { var f = $('importFile').files[0]; if (!f) return; f.text().then(function (t) { var j = JSON.parse(t); state = Core.mergeState(state, j.state || j); saveState(); refreshAll(); }); });
  $('selfTestBtn').addEventListener('click', function () {
    var out = $('selfTestOut'); out.textContent = '';
    var rows = [['Core読込', !!Core], ['Adapters読込', !!Ad], ['IndexedDB', 'indexedDB' in window], ['ServiceWorker', 'serviceWorker' in navigator], ['WakeLock', 'wakeLock' in navigator], ['MediaSession', 'mediaSession' in navigator], ['音声合成', 'speechSynthesis' in window], ['パック読込数', Object.keys(packs).length + '/13']];
    rows.forEach(function (r) { var p = document.createElement('p'); p.textContent = (r[1] ? '✅ ' : '⚠ ') + r[0] + ': ' + r[1]; out.appendChild(p); });
    PACK_TYPES.forEach(function (t) { var p = document.createElement('p'); p.textContent = (packs[t] ? '✅ ' : '— ') + t + (packs[t] ? '（' + packs[t].items.length + '件）' : ' 未同期'); out.appendChild(p); });
  });
  function refreshAll() { if (window.IMOSSanctuary) window.IMOSSanctuary.refresh(); renderHero(); refreshMission(); buildShadowList(); nextQuestion(); mouthSVG(); buildSRS(); showAlchemy(); buildReading(); buildCharts(); buildDebate(); drawGrowth(); saveState(); }
  /* SW registration + update notice (skip on file://) */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').then(function (reg) { reg.addEventListener('updatefound', function () { var ub = $('updateBox'); ub.textContent = '🔄 新バージョンがあります。'; var b = document.createElement('button'); b.type = 'button'; b.textContent = '今すぐ更新'; b.addEventListener('click', function () { if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING'); setTimeout(function () { location.reload(); }, 300); }); ub.appendChild(b); }); }).catch(function () {});
  }
  if (qs.get('quick') === '35s') { showTab('speak'); }
  if (qs.get('quick') === '3min') { showTab('silent'); startSilent3(); }
  if (qs.get('quick') === 'monster') { showTab('arena'); }
  if (qs.get('quick') === 'srs') { showTab('silent'); srsMode = 'due'; buildSRS(); }
  saveState();
  loadAllPacks();
})();
