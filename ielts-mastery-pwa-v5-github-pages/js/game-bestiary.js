/* IELTS Mastery Mobile OS v5.0 — game-bestiary.js: GRAMMAR BESTIARY: SHADOW OF BAND 7.
   A roguelite battle RPG over the real drill/lexicon/bench packs. Pure logic core (bosses, questions,
   ATB battle state machine, 5-stage runs, relics) + a browser controller (Canvas bosses, VFX, voice chant).
   Scores here are game points, not IELTS scores. */
(function (root) {
  'use strict';
  var BOSSES = [
    { id: 'boss-sva', key: 'sva', name: 'Hydra of Agreement', ja: '合意のヒドラ', kind: 'grammar', rules: ['SVA', 'TPS'], color: '#34d399', relic: 'relic-fang' },
    { id: 'boss-art', key: 'art', name: 'Article Phantom', ja: '冠詞の亡霊', kind: 'grammar', rules: ['ART', 'WFM'], color: '#818cf8', relic: 'relic-compass' },
    { id: 'boss-run', key: 'run', name: 'Comma-Splice Serpent', ja: 'コンマ接合の蛇', kind: 'grammar', rules: ['RUN', 'CON'], color: '#f472b6', relic: 'relic-period' },
    { id: 'boss-lr', key: 'lr', name: 'Twin Mirrors L&R', ja: '双鏡 L&R', kind: 'pairs', labels: ['L/R'], color: '#2dd4bf', relic: 'relic-mirrors' },
    { id: 'boss-w', key: 'w', name: 'Lip-Vortex Wraith', ja: '唇渦の亡霊', kind: 'pairs', labels: ['W/R', 'ch/s'], color: '#f59e0b', relic: 'relic-vortex' },
    { id: 'boss-sil', key: 'sil', name: 'Overlord of Silence', ja: '沈黙の覇王', kind: 'bench', color: '#94a3b8', relic: 'relic-amulet' }
  ];
  var RELICS = [
    { id: 'relic-fang', name: 'ハイドラの牙', desc: 'SVAボスへのクリティカル率+10%', boss: 'boss-sva' },
    { id: 'relic-compass', name: '冠詞の羅針盤', desc: '冠詞ボス戦でヒント常時表示', boss: 'boss-art' },
    { id: 'relic-period', name: '銀のピリオド', desc: '文区切りボスへのダメージ+25%', boss: 'boss-run' },
    { id: 'relic-mirrors', name: 'L/Rの双鏡', desc: '発音ペアボスへのダメージ+25%', boss: 'boss-lr' },
    { id: 'relic-vortex', name: '渦巻く唇の指輪', desc: 'W/ch-sボスへのダメージ+25%', boss: 'boss-w' },
    { id: 'relic-amulet', name: '沈黙破りの護符', desc: '沈黙ボスのATB-20%＆ダメージ+15%', boss: 'boss-sil' },
    { id: 'relic-sand', name: '時の砂', desc: '全ボスのATB-20%（2体討伐で解放）', boss: null }
  ];
  var STAGES = ['normal', 'elite', 'fountain', 'midboss', 'boss'];
  function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
  function shuffled(arr, rng) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------- Question factory ---------- */
  function drillsFor(boss, packs) {
    var items = (packs.drills && packs.drills.items) || [];
    return items.filter(function (d) { return boss.rules.some(function (r) { return (d.rule_id || '').indexOf(r) === 0; }); });
  }
  function makeQuestion(boss, packs, rng) {
    rng = rng || Math.random;
    if (boss.kind === 'grammar') {
      var pool = drillsFor(boss, packs);
      if (!pool.length) pool = (packs.drills && packs.drills.items) || [];
      if (!pool.length) return null;
      var item = pick(pool, rng);
      if (item.kind === 'fill') {
        var others = shuffled(pool.filter(function (d) { return d.kind === 'fill' && d.answer !== item.answer; }), rng).slice(0, 2).map(function (d) { return d.answer; });
        return { type: 'choice', drillId: item.id, prompt: '空所に入る正しい形を選べ： ' + item.prompt, choices: shuffled([item.answer].concat(others), rng), answer: item.answer, fixedText: item.prompt.replace('___', item.answer), hint: item.hint_ja };
      }
      var words = item.answer.split(/\s+/).filter(Boolean);
      var tiles = shuffled(words, rng);
      if (tiles.join(' ') === words.join(' ') && words.length > 2) tiles = tiles.slice(1).concat(tiles[0]);
      return { type: 'tiles', drillId: item.id, prompt: (item.kind === 'repair3s' ? '語順を直して正しい文を作れ（元の文: ' + item.prompt + '）' : '誤りを直した正しい文を、タイルを順にタップして作れ。元の文: ' + item.prompt), tiles: tiles, answerWords: words, fixedText: item.answer, hint: item.hint_ja };
    }
    if (boss.kind === 'pairs') {
      var pairs = ((packs.lexicon && packs.lexicon.pairs) || []).filter(function (pr) { return boss.labels.indexOf(pr.label) >= 0; });
      if (!pairs.length) pairs = (packs.lexicon && packs.lexicon.pairs) || [];
      if (!pairs.length) return null;
      var pair = pick(pairs, rng);
      if (rng() < 0.4) return { type: 'pair-voice', pair: pair, target: pair.a, hint: pair.hint_ja };
      var spoken = rng() < 0.5 ? pair.a : pair.b;
      return { type: 'pair-listen', pair: pair, spoken: spoken, choices: [pair.a, pair.b], hint: pair.hint_ja };
    }
    var bench = (packs.bench && packs.bench.items) || [];
    if (!bench.length) return null;
    var b = pick(bench, rng);
    return { type: 'bench', benchId: b.id, text: b.text, secondsTarget: b.seconds_target || 30, hint: '0.5秒で言い始め、止まらずに最後まで（目標 ' + (b.seconds_target || 30) + '秒）' };
  }

  /* ---------- Damage & battle state machine ---------- */
  function relicDamageMul(relics, boss) {
    var mul = 1;
    (relics || []).forEach(function (id) {
      if (id === 'relic-period' && boss.id === 'boss-run') mul *= 1.25;
      if (id === 'relic-mirrors' && boss.id === 'boss-lr') mul *= 1.25;
      if (id === 'relic-vortex' && boss.id === 'boss-w') mul *= 1.25;
      if (id === 'relic-amulet' && boss.id === 'boss-sil') mul *= 1.15;
    });
    return mul;
  }
  function atbRateMul(relics, boss) {
    var mul = 1;
    (relics || []).forEach(function (id) { if (id === 'relic-sand') mul *= 0.8; if (id === 'relic-amulet' && boss.id === 'boss-sil') mul *= 0.8; });
    return mul;
  }
  function damageCalc(base, combo, fever, mul) {
    return Math.max(1, Math.round(base * (1 + Math.min(combo, 10) * 0.05) * (fever ? 1.5 : 1) * (mul || 1)));
  }
  function createBattle(opts) {
    return { boss: opts.boss, bossHp: opts.bossHp, bossMaxHp: opts.bossHp, playerHp: opts.playerHp || 100, playerMaxHp: opts.playerHp || 100, combo: 0, fever: false, feverLeft: 0, atb: 0, mode: opts.mode || 'realtime', relics: opts.relics || [], correctCount: 0, over: false, result: null, telegraph: false };
  }
  function battleTick(b, dtMs, rng) {
    var events = [];
    if (b.over) return events;
    if (b.feverLeft > 0) { b.feverLeft -= dtMs / 1000; if (b.feverLeft <= 0) { b.fever = false; events.push('feverEnd'); } }
    if (b.mode === 'realtime') {
      b.atb += dtMs / 1000 * 9 * atbRateMul(b.relics, b.boss);
      b.telegraph = b.atb >= 82 && b.atb < 100;
      if (b.atb >= 100) {
        b.atb = 0; b.telegraph = false;
        var dmg = 8 + Math.floor((rng || Math.random)() * 7);
        b.playerHp = Math.max(0, b.playerHp - dmg);
        events.push('bossAttack:' + dmg);
        if (b.playerHp <= 0) { b.over = true; b.result = 'lose'; events.push('lose'); }
      }
    }
    return events;
  }
  function battleAnswer(b, correct, baseDmg, rng) {
    var events = [];
    if (b.over) return events;
    if (!correct) {
      b.combo = 0;
      var cd = b.mode === 'turn' ? 10 : 6;
      b.playerHp = Math.max(0, b.playerHp - cd);
      events.push('playerHurt:' + cd);
      if (b.playerHp <= 0) { b.over = true; b.result = 'lose'; events.push('lose'); }
      return events;
    }
    b.combo++; b.correctCount++;
    if (b.combo >= 3 && !b.fever) { b.fever = true; b.feverLeft = 10; events.push('fever'); }
    var crit = (rng || Math.random)() < (b.relics.indexOf('relic-fang') >= 0 && b.boss.id === 'boss-sva' ? 0.2 : 0.1);
    var dmg = damageCalc(baseDmg || 12, b.combo, b.fever, relicDamageMul(b.relics, b.boss)) * (crit ? 1.8 : 1);
    dmg = Math.round(dmg);
    b.bossHp = Math.max(0, b.bossHp - dmg);
    events.push((crit ? 'crit:' : 'hit:') + dmg);
    if (b.bossHp <= 0) { b.over = true; b.result = 'win'; events.push('win'); return events; }
    if (b.mode === 'turn' && b.correctCount % 3 === 0) {
      var bd = 8; b.playerHp = Math.max(0, b.playerHp - bd); events.push('bossAttack:' + bd);
      if (b.playerHp <= 0) { b.over = true; b.result = 'lose'; events.push('lose'); }
    }
    return events;
  }
  /* ---------- Runs ---------- */
  function createRun(bossId) { return { bossId: bossId, stageIdx: 0, stage: STAGES[0], done: false, cleared: false }; }
  function stageEnemy(run, rng) {
    if (run.stage === 'normal') return { boss: pick(BOSSES.filter(function (x) { return x.kind === 'grammar'; }), rng), hp: 30, label: '通常戦' };
    if (run.stage === 'elite') return { boss: pick(BOSSES.filter(function (x) { return x.kind === 'grammar'; }), rng), hp: 55, label: 'エリート戦' };
    if (run.stage === 'midboss') return { boss: pick(BOSSES, rng), hp: 60, label: '中ボス戦' };
    if (run.stage === 'boss') { var def = BOSSES.filter(function (x) { return x.id === run.bossId; })[0] || BOSSES[0]; return { boss: def, hp: 100, label: '弱点ボス戦' }; }
    return null; // fountain is an event stage
  }
  function advanceRun(run) {
    run.stageIdx++;
    if (run.stageIdx >= STAGES.length) { run.done = true; run.cleared = true; run.stage = 'done'; }
    else run.stage = STAGES[run.stageIdx];
    return run;
  }
  function relicForBoss(bossId, totalKills) {
    var def = BOSSES.filter(function (x) { return x.id === bossId; })[0];
    var out = def ? [def.relic] : [];
    if ((totalKills || 0) >= 2) out.push('relic-sand');
    return out;
  }
  var logic = { BOSSES: BOSSES, RELICS: RELICS, STAGES: STAGES, makeQuestion: makeQuestion, drillsFor: drillsFor, createBattle: createBattle, battleTick: battleTick, battleAnswer: battleAnswer, damageCalc: damageCalc, relicDamageMul: relicDamageMul, atbRateMul: atbRateMul, createRun: createRun, stageEnemy: stageEnemy, advanceRun: advanceRun, relicForBoss: relicForBoss, shuffled: shuffled };
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  root.IMOSBestiaryLogic = logic;
})(typeof self !== 'undefined' ? self : this);

/* ================= Browser controller ================= */
(function (root) {
  'use strict';
  var L = root.IMOSBestiaryLogic;
  var env = null, run = null, battle = null, curQ = null, built = [], carriedHp = 100;
  var rafId = null, lastTs = 0, paused = false, knockX = 0, chantArmed = false, stageStartedAt = 0;
  var vfx = null;
  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function st() { return env.state(); }
  function equipped() { return (st().relicsEquipped || []).slice(0, 3); }
  function log(msg) { var b = $('bstLog'); if (b) b.textContent = msg; }

  /* ---------- Canvas boss art (procedural, per boss) ---------- */
  function drawBoss(ctx, def, t, mood) {
    var cx = 320 + (mood.knockX || 0), cy = 130 + Math.sin(t * 1.4) * 5;
    var col = mood.enrage ? '#f87171' : def.color;
    ctx.save();
    if (mood.enrage) { ctx.shadowColor = '#f87171'; ctx.shadowBlur = 26; }
    if (def.key === 'sva') {
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx, cy + 52, 92, 42, 0, 0, Math.PI * 2); ctx.fill();
      [-56, 0, 56].forEach(function (dx, i) {
        var hx = cx + dx, hy = cy - 34 + Math.sin(t * 2 + i * 1.7) * 7;
        ctx.strokeStyle = col; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(cx + dx * 0.5, cy + 40); ctx.quadraticCurveTo(cx + dx, cy - 6, hx, hy); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hx, hy, 17, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0b1220'; ctx.beginPath(); ctx.arc(hx - 5, hy - 3, 3, 0, Math.PI * 2); ctx.arc(hx + 6, hy - 3, 3, 0, Math.PI * 2); ctx.fill();
      });
    } else if (def.key === 'art') {
      ctx.globalAlpha = 0.82; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(cx, cy - 8, 52, Math.PI, 0); ctx.lineTo(cx + 52, cy + 44);
      for (var wI = 0; wI < 5; wI++) ctx.quadraticCurveTo(cx + 42 - wI * 21, cy + 58 + Math.sin(t * 3 + wI) * 5, cx + 31 - wI * 21, cy + 44);
      ctx.lineTo(cx - 52, cy - 8); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#0b1220'; ctx.beginPath(); ctx.arc(cx - 17, cy - 6, 6, 0, Math.PI * 2); ctx.arc(cx + 17, cy - 6, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.font = 'bold 21px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('a / an / the', cx, cy + 88);
    } else if (def.key === 'run') {
      for (var sI = 0; sI < 9; sI++) {
        var sx = cx - 120 + sI * 30, sy = cy + Math.sin(t * 2.2 + sI * 0.75) * 22;
        ctx.fillStyle = sI % 2 ? col : '#f9a8d4'; ctx.beginPath(); ctx.arc(sx, sy, 17 - sI * 0.7, 0, Math.PI * 2); ctx.fill();
        if (sI === 8) { ctx.fillStyle = '#0b1220'; ctx.beginPath(); ctx.arc(sx + 4, sy - 4, 3, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx + 12, sy + 3); ctx.lineTo(sx + 24, sy + 8 + Math.sin(t * 6) * 3); ctx.stroke(); }
      }
      ctx.fillStyle = col; ctx.font = 'bold 19px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(', , , ;', cx, cy + 74);
    } else if (def.key === 'lr') {
      [-52, 52].forEach(function (dx, i) {
        ctx.fillStyle = 'rgba(148,163,184,0.25)'; ctx.strokeStyle = col; ctx.lineWidth = 4;
        var grd = ctx.createLinearGradient(cx + dx - 30, 0, cx + dx + 30, 0); grd.addColorStop(0, 'rgba(45,212,191,0.12)'); grd.addColorStop(0.5 + 0.4 * Math.sin(t * 1.8 + i * 3), 'rgba(255,255,255,0.4)'); grd.addColorStop(1, 'rgba(45,212,191,0.12)');
        ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(cx + dx, cy, 32, 56, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(i === 0 ? 'L' : 'R', cx + dx, cy + 11);
      });
    } else if (def.key === 'w') {
      for (var aI = 0; aI < 5; aI++) {
        ctx.strokeStyle = col; ctx.globalAlpha = 0.85 - aI * 0.14; ctx.lineWidth = 6 - aI * 0.8;
        ctx.beginPath(); ctx.arc(cx, cy, 14 + aI * 13, t * (1 + aI * 0.24), t * (1 + aI * 0.24) + Math.PI * 1.35); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.fillStyle = '#f472b6'; ctx.beginPath(); ctx.ellipse(cx, cy, 9, 13, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#0f172a'; ctx.strokeStyle = col; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, 62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (var rI = 1; rI <= 3; rI++) { ctx.globalAlpha = Math.max(0, 0.5 - ((t * 0.5 + rI / 3) % 1) * 0.5); ctx.beginPath(); ctx.arc(cx, cy, 62 + ((t * 30 + rI * 33) % 99), 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('…', cx, cy + 9);
    }
    ctx.restore();
    if (mood.telegraph) { ctx.fillStyle = 'rgba(248,113,113,' + (0.1 + 0.08 * Math.sin(t * 14)) + ')'; ctx.fillRect(0, 0, 640, 300); }
    if (battle && battle.fever) { ctx.fillStyle = 'rgba(245,158,11,0.07)'; ctx.fillRect(0, 0, 640, 300); }
  }
  function drawScene(ts) {
    var c = $('bstCanvas'); if (!c || !battle) return;
    var ctx = c.getContext('2d');
    var stp = vfx ? vfx.update(16) : { shakeX: 0, shakeY: 0 };
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save(); ctx.translate(stp.shakeX, stp.shakeY);
    ctx.fillStyle = 'rgba(148,163,184,0.35)'; ctx.fillRect(30, 238, 580, 3);
    drawBoss(ctx, battle.boss, ts / 1000, { enrage: battle.bossHp <= battle.bossMaxHp / 2, telegraph: battle.telegraph, knockX: knockX });
    knockX *= 0.86;
    if (vfx) vfx.draw(ctx);
    ctx.restore();
  }
  function loop(ts) {
    if (!battle) { rafId = null; return; }
    var dt = Math.min(50, ts - (lastTs || ts)); lastTs = ts;
    if (!paused && !battle.over) {
      var evts = L.battleTick(battle, dt, Math.random);
      evts.forEach(function (e) {
        if (e.indexOf('bossAttack') === 0) { var d = e.split(':')[1]; env.sfx('wrong'); if (vfx) { vfx.burst(90, 230, { color: '#f87171', count: 12 }); vfx.damageNumber(90, 200, '-' + d, '#f87171'); vfx.shake(5); } log('💥 ' + battle.boss.name + ' の攻撃！ ' + d + ' ダメージ'); updateHud(); }
        if (e === 'feverEnd') updateHud();
      });
      if (battle.over && battle.result === 'lose') { finishRun(false); return; }
    }
    drawScene(ts);
    rafId = requestAnimationFrame(loop);
  }
  function startLoop() { if (!rafId) { lastTs = 0; rafId = requestAnimationFrame(loop); } }

  /* ---------- HUD & question rendering ---------- */
  function bar(id, ratio, color) { var b = $(id); if (!b) return; b.style.width = Math.max(0, Math.min(100, ratio * 100)) + '%'; b.style.background = color; }
  function updateHud() {
    if (!battle) return;
    $('bstStageLabel').textContent = (run ? run.stage + ' / 5' : '') + ' — ' + battle.boss.ja + '（' + battle.boss.name + '）' + (battle.fever ? ' 🔥FEVER' : '');
    bar('bstBossHp', battle.bossHp / battle.bossMaxHp, battle.bossHp <= battle.bossMaxHp / 2 ? '#f87171' : '#2dd4bf');
    bar('bstPlayerHp', battle.playerHp / battle.playerMaxHp, '#f59e0b');
    $('bstCombo').textContent = 'コンボ ×' + battle.combo + '｜自分HP ' + battle.playerHp + '｜敵HP ' + battle.bossHp + (battle.mode === 'realtime' ? '｜敵ATB ' + Math.round(battle.atb) + '%' : '｜ターン制');
    bar('bstAtb', battle.atb / 100, '#f87171');
  }
  function clearChoices() { var b = $('bstChoices'); b.textContent = ''; return b; }
  function nextQuestion() {
    if (!battle || battle.over) return;
    curQ = L.makeQuestion(battle.boss, env.packs(), Math.random);
    var pr = $('bstPrompt'), box = clearChoices(); built = []; chantArmed = false;
    if (!curQ) { pr.textContent = 'パック未同期です。Hubで同期してください。'; return; }
    stageStartedAt = performance.now();
    if (curQ.type === 'choice') {
      pr.textContent = '🧩 パズル斬撃： ' + curQ.prompt;
      curQ.choices.forEach(function (ch) { var b = el('button', ch); b.type = 'button'; b.addEventListener('click', function () { resolveAnswer(ch === curQ.answer, 12); }); box.appendChild(b); });
      addHint(box, curQ);
    } else if (curQ.type === 'tiles') {
      pr.textContent = '🧩 語順修復： ' + curQ.prompt;
      var builtBox = el('p', '（タイルを順にタップ）', 'muted'); builtBox.id = 'bstBuilt'; box.appendChild(builtBox);
      var row = el('div', null, 'row');
      curQ.tiles.forEach(function (w, i) { var b = el('button', w); b.type = 'button'; b.addEventListener('click', function () { if (b.disabled) return; b.disabled = true; built.push({ w: w, i: i }); builtBox.textContent = built.map(function (x) { return x.w; }).join(' '); }); row.appendChild(b); });
      box.appendChild(row);
      var ctrl = el('div', null, 'row');
      var reset = el('button', '↩ リセット'); reset.type = 'button'; reset.addEventListener('click', function () { nextQuestionSame(); }); ctrl.appendChild(reset);
      var go = el('button', '⚔️ 斬撃！', 'primary'); go.type = 'button'; go.addEventListener('click', function () { resolveAnswer(built.map(function (x) { return x.w; }).join(' ') === curQ.answerWords.join(' '), 13); }); ctrl.appendChild(go);
      box.appendChild(ctrl); addHint(box, curQ);
    } else if (curQ.type === 'pair-listen') {
      pr.textContent = '🎧 聞き分け： 再生される単語はどっち？（' + curQ.pair.label + '）';
      var play = el('button', '🔊 再生', 'primary'); play.type = 'button'; play.addEventListener('click', function () { speak(curQ.spoken); }); box.appendChild(play);
      curQ.choices.forEach(function (ch) { var b = el('button', ch); b.type = 'button'; b.addEventListener('click', function () { resolveAnswer(ch === curQ.spoken, 12); }); box.appendChild(b); });
      addHint(box, curQ);
    } else if (curQ.type === 'pair-voice') {
      pr.textContent = '🎤 音声詠唱： 「' + curQ.target + '」をはっきり言ってみよう（対: ' + (curQ.pair.a === curQ.target ? curQ.pair.b : curQ.pair.a) + '）';
      var vb = el('button', '🎤 声で攻撃', 'primary'); vb.type = 'button'; vb.addEventListener('click', function () { voiceJudge(function (tr) { return tr.toLowerCase().indexOf(curQ.target.toLowerCase()) >= 0; }, function () { resolveAnswer(true, 14); }, function () { resolveAnswer(false, 14); }); }); box.appendChild(vb);
      var alt = el('button', '🎧 聞き分けに切替'); alt.type = 'button'; alt.addEventListener('click', function () { curQ = { type: 'pair-listen', pair: curQ.pair, spoken: curQ.target, choices: [curQ.pair.a, curQ.pair.b], hint: curQ.hint }; battle && nextQuestionRenderOnly(); }); box.appendChild(alt);
      addHint(box, curQ);
    } else if (curQ.type === 'bench') {
      pr.textContent = '👑 沈黙打破： 次の文章を0.5秒で言い始め、止まらず読み切れ（' + curQ.secondsTarget + '秒目標）';
      var txt = el('p', curQ.text, 'flash'); txt.style.fontSize = '16px'; txt.style.textAlign = 'left'; box.appendChild(txt);
      var bb = el('button', '🎤 読み上げ開始', 'primary'); bb.type = 'button'; bb.addEventListener('click', function () { benchJudge(curQ); }); box.appendChild(bb);
      var sb = el('button', '🤫 サイレント（先頭タイル並べ替え）'); sb.type = 'button'; sb.addEventListener('click', function () { var words = curQ.text.split(/\s+/).slice(0, 8); curQ = { type: 'tiles', prompt: '文章の先頭を正しい順に並べ替えよ', tiles: L.shuffled(words, Math.random), answerWords: words, fixedText: curQ.text, hint: curQ.hint }; nextQuestionRenderOnly(); }); box.appendChild(sb);
    }
    updateHud();
  }
  function nextQuestionSame() { // re-render the same tiles question (reset)
    if (curQ && curQ.type === 'tiles') { var keep = curQ; curQ = null; var pr = $('bstPrompt'); var box = clearChoices(); built = []; curQ = keep; renderTilesOnly(box, keep); }
  }
  function renderTilesOnly(box, q) {
    var builtBox = el('p', '（タイルを順にタップ）', 'muted'); box.appendChild(builtBox);
    var row = el('div', null, 'row');
    q.tiles.forEach(function (w, i) { var b = el('button', w); b.type = 'button'; b.addEventListener('click', function () { if (b.disabled) return; b.disabled = true; built.push({ w: w, i: i }); builtBox.textContent = built.map(function (x) { return x.w; }).join(' '); }); row.appendChild(b); });
    box.appendChild(row);
    var go = el('button', '⚔️ 斬撃！', 'primary'); go.type = 'button'; go.addEventListener('click', function () { resolveAnswer(built.map(function (x) { return x.w; }).join(' ') === q.answerWords.join(' '), 13); }); box.appendChild(go);
  }
  function nextQuestionRenderOnly() { var keepQ = curQ; curQ = null; nextQuestionWith(keepQ); }
  function nextQuestionWith(q) {
    curQ = q; var pr = $('bstPrompt'), box = clearChoices(); built = [];
    if (q.type === 'pair-listen') {
      pr.textContent = '🎧 聞き分け： 再生される単語はどっち？（' + q.pair.label + '）';
      var play = el('button', '🔊 再生', 'primary'); play.type = 'button'; play.addEventListener('click', function () { speak(q.spoken); }); box.appendChild(play);
      q.choices.forEach(function (ch) { var b = el('button', ch); b.type = 'button'; b.addEventListener('click', function () { resolveAnswer(ch === q.spoken, 12); }); box.appendChild(b); });
    } else if (q.type === 'tiles') { pr.textContent = '🧩 語順修復： ' + q.prompt; renderTilesOnly(box, q); }
    addHint(box, q);
  }
  function addHint(box, q) {
    if (!q || !q.hint) return;
    var showAlways = battle && battle.boss.id === 'boss-art' && equipped().indexOf('relic-compass') >= 0;
    if (showAlways) { box.appendChild(el('p', '🧭 ヒント: ' + q.hint, 'muted')); return; }
    var det = document.createElement('details'); var sm = document.createElement('summary'); sm.textContent = 'ヒントを見る'; det.appendChild(sm); det.appendChild(el('p', q.hint, 'muted')); box.appendChild(det);
  }
  function speak(text) { try { var u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {} }

  /* ---------- Voice judging ---------- */
  function voiceJudge(testFn, onOk, onNg) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { log('⚠ この端末では音声認識が使えません。聞き分け/タイルで戦えます'); return; }
    try {
      var r = new SR(); r.lang = 'en-GB'; r.interimResults = false;
      log('🎤 聞き取り中…');
      r.onresult = function (e) { var tr = e.results[0][0].transcript; log('認識: 「' + tr + '」'); testFn(tr) ? onOk() : onNg(); };
      r.onerror = function () { log('⚠ 認識できませんでした。もう一度どうぞ'); };
      r.start();
    } catch (e) { log('⚠ 音声認識を開始できませんでした'); }
  }
  function benchJudge(q) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { log('⚠ 音声認識が使えません。サイレント判定をお使いください'); return; }
    var t0 = performance.now(), firstAt = 0, finalText = '';
    try {
      var r = new SR(); r.lang = 'en-GB'; r.continuous = true; r.interimResults = true;
      log('🎤 読み上げ中…（最後まで止まらずに）');
      r.onresult = function (e) {
        if (!firstAt) firstAt = performance.now();
        for (var i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
      };
      r.onend = function () {
        var targetWords = q.text.toLowerCase().replace(/[^a-z' ]/g, '').split(/\s+/).filter(Boolean);
        var said = finalText.toLowerCase().replace(/[^a-z' ]/g, '').split(/\s+/).filter(Boolean);
        var hit = targetWords.filter(function (w) { return said.indexOf(w) >= 0; }).length;
        var coverage = targetWords.length ? hit / targetWords.length : 0;
        var delay = firstAt ? (firstAt - t0) / 1000 : 99;
        var ok = coverage >= 0.7 && delay <= 2.5;
        log('判定: カバー率 ' + Math.round(coverage * 100) + '% / 初動 ' + delay.toFixed(1) + '秒 → ' + (ok ? '突破！' : 'あと少し（0.5秒初動と継続が鍵）'));
        resolveAnswer(ok, 16);
      };
      r.start();
      setTimeout(function () { try { r.stop(); } catch (e) {} }, (q.secondsTarget + 12) * 1000);
    } catch (e) { log('⚠ 音声認識を開始できませんでした'); }
  }
  function keywordRate(target, transcript) {
    var stop = { the: 1, a: 1, an: 1, is: 1, are: 1, was: 1, were: 1, to: 1, of: 1, and: 1, in: 1, on: 1, it: 1, i: 1, my: 1, this: 1, that: 1 };
    var words = target.toLowerCase().replace(/[^a-z' ]/g, '').split(/\s+/).filter(function (w) { return w.length > 2 && !stop[w]; });
    if (!words.length) return 1;
    var tr = ' ' + transcript.toLowerCase().replace(/[^a-z' ]/g, ' ') + ' ';
    var hit = words.filter(function (w) { return tr.indexOf(' ' + w + ' ') >= 0 || tr.indexOf(' ' + w + 's ') >= 0; }).length;
    return hit / words.length;
  }

  /* ---------- Answer resolution ---------- */
  function resolveAnswer(correct, baseDmg) {
    if (!battle || battle.over) return;
    var q = curQ;
    var evts = L.battleAnswer(battle, correct, baseDmg || 12, Math.random);
    evts.forEach(function (e) {
      var parts = e.split(':');
      if (parts[0] === 'hit' || parts[0] === 'crit') {
        var crit = parts[0] === 'crit';
        env.sfx(crit ? 'crit' : 'slash');
        if (battle.combo >= 2) env.sfx('combo', battle.combo);
        if (vfx) { vfx.slash(330, 120); vfx.burst(330, 120, { color: battle.boss.color, count: crit ? 30 : 18 }); vfx.damageNumber(330, 90, parts[1], crit ? '#f59e0b' : '#ffffff', crit); vfx.hitstop(crit ? 110 : 60); vfx.shake(crit ? 8 : 4); }
        knockX = crit ? 16 : 9;
        log((crit ? '💥 クリティカル！ ' : '⚔️ ') + parts[1] + ' ダメージ（コンボ ×' + battle.combo + '）');
      }
      if (e === 'fever') { env.sfx('fever'); log('🔥 FEVERモード！ ダメージ1.5倍（10秒）'); }
      if (parts[0] === 'playerHurt') { env.sfx('wrong'); if (vfx) { vfx.burst(90, 230, { color: '#f87171', count: 10 }); vfx.shake(5); } log('💥 反撃を受けた… ' + parts[1] + ' ダメージ。正解例: ' + (q && q.fixedText ? q.fixedText : '')); }
      if (e === 'win') { onBattleWin(); }
      if (e === 'lose') { finishRun(false); }
    });
    updateHud();
    if (!battle || battle.over) return;
    if (correct && q && q.fixedText && (q.type === 'choice' || q.type === 'tiles')) armChant(q.fixedText);
    else nextQuestion();
  }
  function armChant(fixedText) {
    var box = clearChoices();
    $('bstPrompt').textContent = '🎤 音声詠唱チャンス！ 修正文を声に出すと追撃ダメージ（一致率で変動・80%以上でクリティカル）';
    var vb = el('button', '🎤 詠唱する', 'primary'); vb.type = 'button';
    vb.addEventListener('click', function () {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { nextQuestion(); return; }
      try {
        var r = new SR(); r.lang = 'en-GB'; r.interimResults = false; log('🎤 詠唱中…: ' + fixedText);
        r.onresult = function (e) {
          var rate = keywordRate(fixedText, e.results[0][0].transcript);
          var crit = rate >= 0.8;
          var dmg = Math.round((8 + 18 * rate) * (crit ? 1.5 : 1));
          battle.bossHp = Math.max(0, battle.bossHp - dmg);
          env.sfx(crit ? 'crit' : 'slash');
          if (vfx) { vfx.burst(330, 120, { color: crit ? '#f59e0b' : '#2dd4bf', count: crit ? 34 : 20 }); vfx.damageNumber(330, 80, dmg + (crit ? ' CRIT' : ''), crit ? '#f59e0b' : '#fff', crit); vfx.shake(crit ? 8 : 4); }
          knockX = 12;
          log('🎤 詠唱一致率 ' + Math.round(rate * 100) + '% → 追撃 ' + dmg + ' ダメージ');
          updateHud();
          if (battle.bossHp <= 0) { battle.over = true; battle.result = 'win'; onBattleWin(); } else nextQuestion();
        };
        r.onerror = function () { nextQuestion(); };
        r.start();
      } catch (e2) { nextQuestion(); }
    });
    box.appendChild(vb);
    var skip = el('button', 'スキップして次へ'); skip.type = 'button'; skip.addEventListener('click', function () { nextQuestion(); }); box.appendChild(skip);
    updateHud();
  }

  /* ---------- Run flow ---------- */
  function startRun() {
    var bossId = $('bstBossSel').value;
    run = L.createRun(bossId);
    carriedHp = 100; paused = false;
    if (window.IMOSVFX) vfx = window.IMOSVFX.createEngine(Math.random);
    log('⚔️ ラン開始！ 5ステージ制覇で ' + (L.BOSSES.filter(function (b) { return b.id === bossId; })[0] || {}).name + ' のレリック獲得');
    goStage();
  }
  function goStage() {
    if (!run) return;
    if (run.stage === 'fountain') { fountainStage(); return; }
    var enemy = L.stageEnemy(run, Math.random);
    var mode = $('bstModeChk').checked ? 'turn' : 'realtime';
    battle = L.createBattle({ boss: enemy.boss, bossHp: enemy.hp, playerHp: carriedHp, mode: mode, relics: equipped() });
    var s = st(); s.monsters = s.monsters || {}; var mk = enemy.boss.id; s.monsters[mk] = s.monsters[mk] || { debt: 3, kills: 0, attempts: 0 }; s.monsters[mk].attempts++; s.monsters[mk].updatedAt = new Date().toISOString(); env.save();
    log('— ' + enemy.label + '： ' + enemy.boss.ja + ' 出現（HP ' + enemy.hp + '）');
    nextQuestion(); startLoop(); updateHud();
  }
  function fountainStage() {
    battle = null;
    $('bstStageLabel').textContent = 'fountain — SRS回復の泉';
    var pr = $('bstPrompt'), box = clearChoices();
    var cards = ((env.packs().srs_library || {}).items || []);
    var core = env.core;
    var due = cards.filter(function (c) { var saved = (st().srs || {})[c.id]; return !saved || core.isDue(Object.assign({}, c, saved)); });
    var card = (due.length ? due : cards)[Math.floor(Math.random() * Math.max(1, (due.length ? due : cards).length))];
    if (!card) { pr.textContent = '泉： SRSパック未同期のため HP+15'; carriedHp = Math.min(100, carriedHp + 15); advanceAndGo(); return; }
    pr.textContent = '⛲ 回復の泉： 「' + card.word + '」の意味は？（正解でHP+30）';
    var others = L.shuffled(cards.filter(function (c) { return c.id !== card.id; }), Math.random).slice(0, 2);
    L.shuffled([card].concat(others), Math.random).forEach(function (c) {
      var b = el('button', c.meaning_ja); b.type = 'button';
      b.addEventListener('click', function () {
        if (c.id === card.id) { carriedHp = Math.min(100, carriedHp + 30); env.sfx('correct'); log('⛲ 正解！ HP+30 回復'); }
        else { env.sfx('wrong'); log('⛲ 残念… 正解は「' + card.meaning_ja + '」'); }
        advanceAndGo();
      });
      box.appendChild(b);
    });
  }
  function advanceAndGo() { L.advanceRun(run); if (run.done) { finishRun(true); return; } goStage(); }
  function onBattleWin() {
    var wasBossStage = run && run.stage === 'boss';
    var bossDef = battle.boss;
    carriedHp = battle.playerHp;
    if (vfx) vfx.burst(320, 130, { color: bossDef.color, count: 46, speed: 340 });
    env.sfx('levelup');
    if (wasBossStage) {
      var s = st(); s.monsters = s.monsters || {}; var m = s.monsters[bossDef.id] = s.monsters[bossDef.id] || { debt: 3, kills: 0, attempts: 0 };
      m.kills++; m.debt = 3; m.updatedAt = new Date().toISOString();
      var totalKills = Object.keys(s.monsters).reduce(function (a, k) { return a + (s.monsters[k].kills || 0); }, 0);
      s.relics = s.relics || [];
      var gained = L.relicForBoss(bossDef.id, totalKills).filter(function (r) { return s.relics.indexOf(r) < 0; });
      gained.forEach(function (r) { s.relics.push(r); });
      env.addXp(50);
      log('👑 ' + bossDef.name + ' 討伐！ XP+50' + (gained.length ? '／レリック獲得: ' + gained.map(function (r) { return (L.RELICS.filter(function (x) { return x.id === r; })[0] || {}).name; }).join('・') : ''));
      env.save(); renderRelics();
    } else {
      env.addXp(20);
      log('✅ ' + bossDef.ja + ' を倒した！ XP+20');
    }
    battle = null;
    setTimeout(function () { advanceAndGo(); }, 650);
  }
  function finishRun(cleared) {
    if (battle && battle.result === 'lose') env.addXp(10);
    battle = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    var c = $('bstCanvas'); if (c) { var ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); }
    $('bstStageLabel').textContent = cleared ? '🏆 ラン制覇！' : 'ラン終了';
    log(cleared ? '🏆 5ステージ制覇！ お疲れさまでした。レリックとXPはHubの成長グラフにも反映されます' : '💫 撤退… でもXP+10は残ります。泉とターン制モードで立て直しましょう');
    clearChoices();
  }
  function renderRelics() {
    var box = $('bstRelics'); if (!box) return; box.textContent = '';
    var s = st(); var owned = s.relics || []; var eq = s.relicsEquipped || [];
    if (!owned.length) { box.appendChild(el('p', 'レリック未所持（弱点ボス討伐で獲得）', 'muted')); return; }
    owned.forEach(function (id) {
      var def = L.RELICS.filter(function (r) { return r.id === id; })[0]; if (!def) return;
      var lab = document.createElement('label');
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = eq.indexOf(id) >= 0;
      cb.addEventListener('change', function () {
        var cur = (st().relicsEquipped || []).filter(function (x) { return x !== id; });
        if (cb.checked) { if (cur.length >= 3) { cb.checked = false; log('⚠ レリック装備は最大3つまで'); return; } cur.push(id); }
        st().relicsEquipped = cur; env.save(); renderRelics();
      });
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + def.name + '（' + def.desc + '）'));
      box.appendChild(lab);
    });
  }
  function init(e) {
    env = e;
    if (!$('bstStartBtn')) return;
    var sel = $('bstBossSel');
    L.BOSSES.forEach(function (b) { var o = document.createElement('option'); o.value = b.id; o.textContent = b.ja + '（' + b.name + '）'; sel.appendChild(o); });
    $('bstStartBtn').addEventListener('click', function () { env.sfx('click'); startRun(); });
    $('bstPauseBtn').addEventListener('click', function () { paused = !paused; $('bstPauseBtn').textContent = paused ? '▶ 再開' : '⏸ ポーズ'; });
    renderRelics();
  }
  root.IMOSBestiaryGame = { init: init };
})(typeof self !== 'undefined' ? self : this);
