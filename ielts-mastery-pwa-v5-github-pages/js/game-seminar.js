/* IELTS Mastery Mobile OS v5.0 — game-seminar.js: MONASH SEMINAR TACTICS.
   Tactical conversation duels over pack-groupwork (40 scenarios) and pack-debate-arena (30 topics):
   catch the golden interruption zone on the opponent's speech bar, trigger a dramatic cut-in,
   then win persuasion with a concession + claim card (or your own voice). */
(function (root) {
  'use strict';
  /* ================= Pure logic ================= */
  var ZONE_CENTER = 62, ZONE_PERFECT = 5, ZONE_GOOD = 11;
  function judgeInterrupt(pct) {
    var d = Math.abs(pct - ZONE_CENTER);
    if (d <= ZONE_PERFECT) return 'PERFECT';
    if (d <= ZONE_GOOD) return 'GOOD';
    return 'MISS';
  }
  function interruptGain(j) { return { PERFECT: 18, GOOD: 10, MISS: -4 }[j] || 0; }
  function filterScenarios(items, filter) {
    if (!filter || filter === 'all') return items.slice();
    return items.filter(function (s) { return s.subject === filter; });
  }
  /* interrupt_at may be an array ([turnIndex, ...]), a bare number (turnIndex), or missing.
     The old code did scenario.interrupt_at[0] unconditionally: for a number that is undefined
     (so it silently fell back to 1), and for [0] the || 1 fallback also overwrote a valid 0.
     Normalize safely and preserve 0 so even a 1-turn scenario can be interrupted on turn 0. */
  function normalizeInterruptAt(v) {
    var n = null;
    if (Array.isArray(v)) { if (v.length) n = Number(v[0]); }
    else if (v != null && v !== '') n = Number(v);
    if (n == null || !isFinite(n)) return 1;
    return Math.max(0, Math.floor(n));
  }
  function createDuel(scenario) {
    return { scenario: scenario, persuasion: 40, turnIdx: 0, interruptTurn: normalizeInterruptAt(scenario && scenario.interrupt_at), phase: 'listen', done: false, result: null, interruptsHit: 0 };
  }
  function applyPersuasion(duel, delta) {
    duel.persuasion = Math.max(0, Math.min(100, duel.persuasion + delta));
    if (duel.persuasion >= 85) { duel.done = true; duel.result = 'win'; }
    else if (duel.persuasion <= 0) { duel.done = true; duel.result = 'lose'; }
    return duel;
  }
  function finishDuel(duel) {
    if (duel.done) return duel;
    duel.done = true;
    duel.result = duel.persuasion >= 60 ? 'win' : duel.persuasion >= 45 ? 'partial' : 'lose';
    return duel;
  }
  function buildResponseCards(scenario, rng) {
    rng = rng || Math.random;
    var cards = [
      { kind: 'best', text: scenario.model_reply },
      { kind: 'rude', text: 'No, that is wrong. You should listen to me instead, because my idea is simply better.' },
      { kind: 'vague', text: 'Well, maybe perhaps it is kind of good or bad, I am not really sure about it, so yeah.' }
    ];
    for (var i = cards.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = cards[i]; cards[i] = cards[j]; cards[j] = t; }
    return cards;
  }
  function cardGain(kind) { return { best: 14, rude: -8, vague: -3 }[kind] || 0; }
  function branchReply(scenario, playerText) {
    var t = String(playerText || '').toLowerCase();
    var br = (scenario.branches || []).filter(function (b) { return t.indexOf(String(b.if_kw).toLowerCase()) >= 0; })[0];
    return br ? br.reply : null;
  }
  function createDebateDuel(topic, side) {
    var opp = side === 'for' ? topic.against_side : topic.for_side;
    return { topic: topic, side: side, persuasion: 40, attackIdx: 0, attacks: (opp.counter_arguments || []).slice(), done: false, result: null };
  }
  function debateCards(duel) {
    var atk = duel.attacks[duel.attackIdx];
    if (!atk) return null;
    return { attack: atk, cards: [
      { kind: 'best', text: atk.model_rebuttal_b75 },
      { kind: 'concede', text: 'That is a fair point, and it matters. Let me think about how it changes the balance of the argument.' },
      { kind: 'weak', text: atk.attack_en }
    ] };
  }
  function debateCardGain(kind) { return { best: 16, concede: 5, weak: -6 }[kind] || 0; }
  var logic = { normalizeInterruptAt: normalizeInterruptAt, judgeInterrupt: judgeInterrupt, interruptGain: interruptGain, filterScenarios: filterScenarios, createDuel: createDuel, applyPersuasion: applyPersuasion, finishDuel: finishDuel, buildResponseCards: buildResponseCards, cardGain: cardGain, branchReply: branchReply, createDebateDuel: createDebateDuel, debateCards: debateCards, debateCardGain: debateCardGain, ZONE_CENTER: ZONE_CENTER };
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  root.IMOSSeminarLogic = logic;
})(typeof self !== 'undefined' ? self : this);

/* ================= Browser controller ================= */
(function (root) {
  'use strict';
  var L = root.IMOSSeminarLogic;
  var env = null, duel = null, debate = null, barAnim = null, barStart = 0, currentTurnDur = 4000, listening = false, playerSpeaking = 0;
  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function log(msg) { var b = $('semLog'); if (b) b.textContent = msg; }
  function bubble(speaker, text) { var b = $('semBubble'); b.textContent = ''; var s = el('strong', speaker + '： '); b.appendChild(s); b.appendChild(document.createTextNode(text)); }

  /* ---------- Room & characters ---------- */
  function mood() { var p = duel ? duel.persuasion : debate ? debate.persuasion : 40; return p >= 60 ? 'winning' : p <= 25 ? 'losing' : 'even'; }
  function drawRoom() {
    var c = $('semCanvas'); if (!c) return;
    var ctx = c.getContext('2d'), t = performance.now() / 1000;
    ctx.clearRect(0, 0, 640, 300);
    ctx.fillStyle = '#0d1830'; ctx.fillRect(0, 0, 640, 300);
    ctx.fillStyle = '#12264d'; ctx.fillRect(30, 26, 580, 120);
    ctx.fillStyle = '#2dd4bf'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('MONASH SEMINAR ROOM — ' + (duel ? duel.scenario.subject : debate ? 'DEBATE ARENA' : 'TACTICS'), 320, 52);
    ctx.fillStyle = '#8fb7ff'; ctx.font = '12px sans-serif';
    ctx.fillText('説得力メーター: ' + (duel ? duel.persuasion : debate ? debate.persuasion : 40) + ' / 100', 320, 74);
    ctx.fillStyle = '#1d3260'; ctx.fillRect(70, 216, 500, 26);
    var chars = [
      { x: 130, name: '早口のチームメイト', color: '#f59e0b', mood: 'talk' },
      { x: 320, name: '教授', color: '#818cf8', mood: 'calm' },
      { x: 510, name: '論破ライバル', color: '#f472b6', mood: mood() }
    ];
    chars.forEach(function (ch, i) {
      var bob = ch.mood === 'talk' && listening ? Math.sin(t * 9 + i) * 2.5 : 0;
      ctx.fillStyle = ch.color; ctx.beginPath(); ctx.arc(ch.x, 168 + bob, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b1220';
      ctx.beginPath(); ctx.arc(ch.x - 10, 162 + bob, 3.4, 0, Math.PI * 2); ctx.arc(ch.x + 10, 162 + bob, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0b1220'; ctx.lineWidth = 3; ctx.beginPath();
      if (ch.mood === 'winning') ctx.arc(ch.x, 186 + bob, 10, Math.PI * 1.15, Math.PI * 1.85); // worried mouth (frown visually inverted arc)
      else if (ch.mood === 'losing') ctx.arc(ch.x, 178 + bob, 10, 0.15 * Math.PI, 0.85 * Math.PI); // smug smile
      else if (ch.mood === 'talk' && listening) { ctx.arc(ch.x, 176 + bob, 6 + Math.sin(t * 12) * 2.4, 0, Math.PI * 2); }
      else ctx.moveTo(ch.x - 8, 180 + bob), ctx.lineTo(ch.x + 8, 180 + bob);
      ctx.stroke();
      if (i === 1) { ctx.strokeStyle = '#e8eefc'; ctx.lineWidth = 2; ctx.strokeRect(ch.x - 22, 152 + bob, 18, 12); ctx.strokeRect(ch.x + 4, 152 + bob, 18, 12); }
      ctx.fillStyle = '#e8eefc'; ctx.font = '11px sans-serif'; ctx.fillText(ch.name, ch.x, 224 + 34);
      if (ch.mood === 'talk' && listening) { // lip-sync waveform
        ctx.fillStyle = '#f59e0b';
        for (var wI = 0; wI < 5; wI++) ctx.fillRect(ch.x - 22 + wI * 10, 128 - Math.abs(Math.sin(t * 11 + wI * 1.4)) * 12, 5, 5 + Math.abs(Math.sin(t * 11 + wI)) * 10);
      }
    });
    // player avatar (you) bottom center
    var py = 268 + (playerSpeaking ? Math.sin(t * 10) * 2 : 0);
    ctx.fillStyle = '#2dd4bf'; ctx.beginPath(); ctx.arc(320, py, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b1220'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('YOU', 320, py + 4);
    if ((duel && !duel.done) || (debate && !debate.done)) requestAnimationFrame(drawRoom);
  }

  /* ---------- Groupwork duel flow ---------- */
  function speakTurn(text, rate, onend) {
    listening = true;
    try {
      var u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = rate || 1.02;
      u.onend = function () { listening = false; if (onend) onend(); };
      speechSynthesis.cancel(); speechSynthesis.speak(u);
      return Math.max(2600, text.split(/\s+/).length / ((rate || 1.02) * 2.6) * 1000);
    } catch (e) { listening = false; if (onend) onend(); return 3000; }
  }
  function startDuel() {
    var packs = env.packs();
    var items = L.filterScenarios((packs.groupwork || {}).items || [], $('semFilterSel').value);
    if (!items.length) { log('⚠ シナリオ未同期です（Hubでパック同期）'); return; }
    duel = L.createDuel(items[Math.floor(Math.random() * items.length)]); debate = null;
    log('💬 セミナー開始： ' + duel.scenario.subject + ' — 割り込みゾーン（金色）で ✋ を決めよう');
    drawRoom();
    playTurn();
  }
  function playTurn() {
    if (!duel || duel.done) return;
    var turns = duel.scenario.turns;
    if (duel.turnIdx >= turns.length) { L.finishDuel(duel); endDuel(); return; }
    var turn = turns[duel.turnIdx];
    bubble(turn.speaker, turn.text);
    var isInterruptTurn = duel.turnIdx === duel.interruptTurn;
    var dur = speakTurn(turn.text, turn.speaker === 'Mei' ? 1.12 : 1.02, function () {
      if (!duel || duel.done) return;
      if (isInterruptTurn && duel.phase === 'listen') { duel.phase = 'missed'; log('…割り込みチャンスを逃した（次のターンへ）'); duel.turnIdx++; setTimeout(playTurn, 500); }
      else if (!isInterruptTurn) { duel.turnIdx++; setTimeout(playTurn, 400); }
    });
    if (isInterruptTurn) { duel.phase = 'window'; startBar(dur); log('⚡ 今の発話が割り込みチャンス！ 金色ゾーンで ✋ 割り込む'); }
  }
  function startBar(durMs) {
    currentTurnDur = durMs; barStart = performance.now();
    var bar = $('semBar');
    cancelAnimationFrame(barAnim);
    (function step() {
      var pct = Math.min(100, (performance.now() - barStart) / currentTurnDur * 100);
      bar.style.width = pct + '%';
      bar.dataset.pct = pct;
      if (pct < 100 && duel && duel.phase === 'window') barAnim = requestAnimationFrame(step);
    })();
  }
  function tryInterrupt() {
    if (!duel || duel.phase !== 'window') return;
    var pct = parseFloat(($('semBar').dataset.pct || '0'));
    var j = L.judgeInterrupt(pct);
    cancelAnimationFrame(barAnim);
    try { speechSynthesis.cancel(); } catch (e) {}
    listening = false;
    if (j === 'MISS') {
      L.applyPersuasion(duel, L.interruptGain('MISS')); env.sfx('wrong');
      log('💨 タイミングが合わず割り込めなかった（説得力 ' + duel.persuasion + '）');
      duel.phase = 'listen'; duel.turnIdx++;
      if (duel.done) { endDuel(); return; }
      setTimeout(playTurn, 600); return;
    }
    duel.interruptsHit++;
    L.applyPersuasion(duel, L.interruptGain(j)); env.sfx('barge');
    cutin(duel.scenario.target_phrases[0] ? duel.scenario.target_phrases[0].toUpperCase() + '!' : 'EXCUSE ME!');
    log((j === 'PERFECT' ? '🎯 PERFECT割り込み！' : '✋ 割り込み成功！') + '（説得力 ' + duel.persuasion + '）— 譲歩カード＋自分の主張を選ぼう');
    duel.phase = 'respond';
    showResponseCards();
  }
  function cutin(text) {
    var c = $('semCutin'); c.textContent = text; c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    setTimeout(function () { c.classList.remove('show'); }, 1000);
  }
  function showResponseCards() {
    var box = $('semChoices'); box.textContent = '';
    L.buildResponseCards(duel.scenario, Math.random).forEach(function (card) {
      var b = el('button', card.text); b.type = 'button';
      b.addEventListener('click', function () { chooseCard(card); });
      box.appendChild(b);
    });
    var vb = el('button', '🎤 声で言う（目標フレーズ/キーワード判定）', 'primary'); vb.type = 'button';
    vb.addEventListener('click', function () { voiceRespond(); });
    box.appendChild(vb);
  }
  function chooseCard(card) {
    var gain = L.cardGain(card.kind);
    L.applyPersuasion(duel, gain);
    env.sfx(gain > 0 ? 'correct' : 'wrong');
    var reply = L.branchReply(duel.scenario, card.text);
    log('あなたの発言 → 説得力 ' + duel.persuasion + (card.kind === 'best' ? '（譲歩＋主張が刺さった！）' : card.kind === 'rude' ? '（言い方が強すぎた…）' : '（曖昧で弱かった…）'));
    $('semChoices').textContent = '';
    if (duel.done) { endDuel(); return; }
    if (reply) { bubble('相手', reply); speakTurn(reply, 1.05, function () { duel.phase = 'listen'; duel.turnIdx++; playTurn(); }); }
    else { duel.phase = 'listen'; duel.turnIdx++; setTimeout(playTurn, 500); }
  }
  function voiceRespond() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { log('⚠ 音声認識が使えません。カードで回答してください'); return; }
    playerSpeaking = 1;
    try {
      var r = new SR(); r.lang = 'en-GB'; r.interimResults = false;
      log('🎤 どうぞ（例: ' + duel.scenario.target_phrases[0] + ' …）');
      r.onresult = function (e) {
        playerSpeaking = 0;
        var tr = e.results[0][0].transcript.toLowerCase();
        var phraseHit = duel.scenario.target_phrases.some(function (p) { return tr.indexOf(p.toLowerCase().replace(/[.,]/g, '')) >= 0 || tr.indexOf(p.toLowerCase().split(' ')[0]) >= 0; });
        var kwHit = duel.scenario.must_kw.filter(function (k) { return tr.indexOf(k.toLowerCase()) >= 0; }).length;
        var good = phraseHit || kwHit >= 1;
        L.applyPersuasion(duel, good ? 14 : -3);
        env.sfx(good ? 'correct' : 'wrong');
        log('認識: 「' + e.results[0][0].transcript + '」→ ' + (good ? 'フレーズ/キーワード命中！' : '目標フレーズかキーワード（' + duel.scenario.must_kw.join(' / ') + '）を入れよう') + '（説得力 ' + duel.persuasion + '）');
        $('semChoices').textContent = '';
        if (duel.done) { endDuel(); return; }
        duel.phase = 'listen'; duel.turnIdx++; setTimeout(playTurn, 600);
      };
      r.onerror = function () { playerSpeaking = 0; log('⚠ 認識できませんでした'); };
      r.start();
    } catch (e) { playerSpeaking = 0; }
  }
  function endDuel() {
    var xp = duel.result === 'win' ? 40 : duel.result === 'partial' ? 20 : 5;
    env.addXp(xp);
    log((duel.result === 'win' ? '🏆 合意形成！' : duel.result === 'partial' ? '🤝 部分合意（あと一歩）' : '💫 議論は平行線…') + ' 説得力 ' + duel.persuasion + ' / XP+' + xp + '｜モデル: ' + duel.scenario.model_reply);
    bubble('結果', duel.result === 'win' ? '全員があなたの提案に納得しました。' : 'モデル返答を参考に、もう一度挑戦しましょう。');
    duel.phase = 'done';
  }

  /* ---------- Debate duel flow ---------- */
  function startDebate() {
    var packs = env.packs();
    var topics = (packs.debate_arena || {}).items || [];
    if (!topics.length) { log('⚠ Debateパック未同期です'); return; }
    var topic = topics[parseInt($('semTopicSel').value || '0', 10)] || topics[0];
    debate = L.createDebateDuel(topic, $('semSideSel').value); duel = null;
    log('😈 Debate開始： ' + topic.topic + '（あなたは ' + (debate.side === 'for' ? '賛成' : '反対') + '側）');
    drawRoom();
    nextAttack();
  }
  function nextAttack() {
    if (!debate || debate.done) return;
    var round = L.debateCards(debate);
    if (!round) {
      debate.done = true; debate.result = debate.persuasion >= 55 ? 'win' : debate.persuasion >= 40 ? 'partial' : 'lose';
      var xp = debate.result === 'win' ? 40 : debate.result === 'partial' ? 20 : 5;
      env.addXp(xp);
      log((debate.result === 'win' ? '🏆 論破！' : debate.result === 'partial' ? '🤝 互角の議論' : '💫 押し切られた…') + ' 説得力 ' + debate.persuasion + ' / XP+' + xp);
      return;
    }
    bubble('相手の反論', round.attack.attack_en);
    speakTurn(round.attack.attack_en, 1.08, null);
    var box = $('semChoices'); box.textContent = '';
    L.shuffled ? null : 0;
    var cards = round.cards.slice();
    for (var i = cards.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = cards[i]; cards[i] = cards[j]; cards[j] = t; }
    cards.forEach(function (card) {
      var b = el('button', card.kind === 'weak' ? '（相手の主張を繰り返す）' + card.text : card.text); b.type = 'button';
      b.addEventListener('click', function () {
        var gain = L.debateCardGain(card.kind);
        debate.persuasion = Math.max(0, Math.min(100, debate.persuasion + gain));
        env.sfx(gain > 0 ? 'correct' : 'wrong');
        if (card.kind === 'best') cutin('FAIR POINT, HOWEVER…!');
        log('反論 → 説得力 ' + debate.persuasion + (card.kind === 'best' ? '（譲歩＋再反論が決まった！）' : card.kind === 'concede' ? '（譲歩で空気は和らいだ）' : '（相手の土俵に乗ってしまった）'));
        debate.attackIdx++;
        if (debate.persuasion >= 85) { debate.done = true; debate.result = 'win'; env.addXp(40); log('🏆 説得力85到達！ 論破勝利 XP+40'); $('semChoices').textContent = ''; return; }
        if (debate.persuasion <= 0) { debate.done = true; debate.result = 'lose'; log('💫 説得力0… 敗北'); $('semChoices').textContent = ''; return; }
        setTimeout(nextAttack, 600);
      });
      box.appendChild(b);
    });
  }

  function init(e) {
    env = e;
    if (!$('semStartBtn')) return;
    var packs = env.packs();
    var rebuildTopics = function () {
      var sel = $('semTopicSel'); sel.textContent = '';
      ((env.packs().debate_arena || {}).items || []).forEach(function (tp, i) { var o = document.createElement('option'); o.value = i; o.textContent = tp.topic; sel.appendChild(o); });
    };
    rebuildTopics();
    setInterval(function () { if (!$('semTopicSel').options.length) rebuildTopics(); }, 4000);
    $('semStartBtn').addEventListener('click', function () { env.sfx('click'); startDuel(); });
    $('semDebateBtn').addEventListener('click', function () { env.sfx('click'); rebuildTopics(); startDebate(); });
    $('semHitBtn').addEventListener('click', function () { tryInterrupt(); });
    document.addEventListener('keydown', function (ev) {
      if (ev.code !== 'Space') return;
      var tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.isComposing) return;
      var arena = $('tab-arena'); if (!arena || !arena.classList.contains('active')) return;
      if (duel && duel.phase === 'window') { ev.preventDefault(); ev.stopImmediatePropagation(); tryInterrupt(); }
    });
  }
  root.IMOSSeminar = { init: init };
})(typeof self !== 'undefined' ? self : this);
