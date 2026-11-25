/* IELTS Mastery Mobile OS v4.0 — core.js (DOM-free, UMD): SM-2, WPM, linter, state merge, XP */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IMOSCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DISCLAIMER = 'ローカル簡易推定でありIELTS公式スコアではない';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function wordCount(t) { return (String(t || '').trim().match(/\S+/g) || []).length; }
  function wpm(text, seconds) { if (!seconds || seconds <= 0) return 0; return Math.round(wordCount(text) / seconds * 60); }
  function splitSentences(t) { return String(t || '').split(/(?<=[.!?])\s+/).map(function (s) { return s.trim(); }).filter(Boolean); }
  /* Local-date utilities (device-local, NOT UTC) */
  function localDateStr(d) { d = d || new Date(); var m = d.getMonth() + 1, day = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day; }
  function computeStreak(dates, today) {
    var set = {}; (dates || []).forEach(function (x) { set[x] = 1; });
    var d = new Date((today || localDateStr()) + 'T12:00:00');
    if (!set[localDateStr(d)]) { d.setDate(d.getDate() - 1); if (!set[localDateStr(d)]) return 0; }
    var n = 0; while (set[localDateStr(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  /* SM-2 */
  function sm2(card, quality) {
    card = Object.assign({ ease: 2.5, interval: 0, reps: 0, due: null }, card);
    quality = Math.max(0, Math.min(5, quality));
    if (quality < 3) { card.reps = 0; card.interval = 1; }
    else {
      if (card.reps === 0) card.interval = 1; else if (card.reps === 1) card.interval = 6;
      else card.interval = Math.round(card.interval * card.ease);
      card.reps += 1;
    }
    card.ease = Math.max(1.3, card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    var d = new Date(); d.setDate(d.getDate() + card.interval);
    card.due = localDateStr(d);
    card.updatedAt = new Date().toISOString();
    return card;
  }
  function isDue(card, today) { return !card.due || card.due <= (today || localDateStr()); }
  /* Linter: uses lint_rules pack patterns (regex source/flags) with safe compile; fallback builtin rules */
  var BUILTIN = [
    { id: 'SVA-people', pattern: { source: '\\bpeople\\b[^.!?]{0,40}?\\b(is|was)\\b', flags: 'gi' }, message_ja: 'people は複数扱い: is→are / was→were', severity: 'E' },
    { id: 'ART-01', pattern: { source: '\\ba (hour|honest|honor|idea|important|umbrella)\\b', flags: 'gi' }, message_ja: '母音で始まる語の前は a→an', severity: 'W' },
    { id: 'ART-01b', pattern: { source: '\\ban (university|unicorn|user|european)\\b', flags: 'gi' }, message_ja: 'university等は /j/ 音で始まるため an→a が正解', severity: 'W' },
    { id: 'BORN-01', pattern: { source: '\\bI born\\b', flags: 'gi' }, message_ja: '受動態: I was born', severity: 'E' }
  ];
  function compileRules(packRules) {
    var src = (packRules && packRules.length ? packRules : BUILTIN);
    var out = [];
    src.forEach(function (r) {
      if (!r.pattern || !r.pattern.source) return;
      try { out.push({ id: r.id, re: new RegExp(r.pattern.source, (r.pattern.flags || 'gi').replace(/[^gimsuy]/g, '')), message_ja: r.message_ja || '', severity: r.severity || 'W' }); } catch (e) { /* skip bad regex */ }
    });
    return out.length ? out : compileRules(null);
  }
  function lint(text, rules) {
    var hits = [];
    (rules || compileRules(null)).forEach(function (r) {
      var m; r.re.lastIndex = 0;
      while ((m = r.re.exec(text)) !== null) { hits.push({ rule_id: r.id, index: m.index, match: m[0], message_ja: r.message_ja, severity: r.severity }); if (m.index === r.re.lastIndex) r.re.lastIndex++; if (hits.length > 200) break; }
    });
    return hits.sort(function (a, b) { return a.index - b.index; });
  }
  /* State merge: updatedAt wins per key; attempts & monster kills are additive-max (never decrease) */
  function mergeState(local, remote) {
    local = local || {}; remote = remote || {};
    var out = {}, keys = {};
    Object.keys(local).forEach(function (k) { keys[k] = 1; }); Object.keys(remote).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      if (k === 'srs') {
        // SRS cards: newer entry wins + the card's own attempts counter (max). Monster fields (debt/kills) are NEVER mixed in.
        var ms = {}, ks = {};
        Object.keys(local.srs || {}).forEach(function (id) { ks[id] = 1; }); Object.keys(remote.srs || {}).forEach(function (id) { ks[id] = 1; });
        Object.keys(ks).forEach(function (id) {
          var a = (local.srs || {})[id], b = (remote.srs || {})[id];
          if (!a) ms[id] = b; else if (!b) ms[id] = a;
          else { var nw = (b.updatedAt || '') > (a.updatedAt || '') ? b : a; ms[id] = Object.assign({}, nw, { attempts: Math.max(a.attempts || 0, b.attempts || 0) }); delete ms[id].debt; delete ms[id].kills; }
        });
        out.srs = ms;
      } else if (k === 'monsters') {
        var mm = {}, km = {};
        Object.keys(local.monsters || {}).forEach(function (id) { km[id] = 1; }); Object.keys(remote.monsters || {}).forEach(function (id) { km[id] = 1; });
        Object.keys(km).forEach(function (id) {
          var a2 = (local.monsters || {})[id], b2 = (remote.monsters || {})[id];
          if (!a2) mm[id] = b2; else if (!b2) mm[id] = a2;
          else { var nw2 = (b2.updatedAt || '') > (a2.updatedAt || '') ? b2 : a2; mm[id] = Object.assign({}, nw2, { attempts: Math.max(a2.attempts || 0, b2.attempts || 0), kills: Math.max(a2.kills || 0, b2.kills || 0), debt: Math.min(a2.debt != null ? a2.debt : 1e9, b2.debt != null ? b2.debt : 1e9) }); }
        });
        out.monsters = mm;
      } else if (k === 'history') {
        var seen = {}, hist = [];
        [].concat(local.history || [], remote.history || []).forEach(function (h) { if (!h) return; var key = h.attemptId || ('at:' + (h.at || 0) + ':' + (h.wpm || 0)); if (seen[key]) return; seen[key] = 1; hist.push(h); });
        hist.sort(function (x, y) { return (x.at || 0) - (y.at || 0); });
        out.history = hist.slice(-200);
      } else if (k === 'dailyLogDates') {
        var ds = {}; [].concat(local.dailyLogDates || [], remote.dailyLogDates || []).forEach(function (x) { if (x) ds[x] = 1; });
        out.dailyLogDates = Object.keys(ds).sort();
      } else if (k === 'xp' || k === 'totalAttempts' || k === 'totalKills') {
        out[k] = Math.max(local[k] || 0, remote[k] || 0);
      } else if (k === 'streak') {
        out.streak = 0; /* recomputed from dailyLogDates below */
      } else {
        out[k] = ((remote.updatedAt || '') > (local.updatedAt || '') ? remote : local)[k] !== undefined ? ((remote.updatedAt || '') > (local.updatedAt || '') ? remote : local)[k] : (local[k] !== undefined ? local[k] : remote[k]);
      }
    });
    out.streak = computeStreak(out.dailyLogDates || []);
    out.updatedAt = new Date().toISOString();
    return out;
  }
  function xpFor(action) { return { speak: 20, retry: 10, srs: 5, monster: 30, reading: 15, alchemy: 15, mock: 50 }[action] || 5; }
  function estimateBand(wpmVal, lintErrors, words) {
    var score = 5.0;
    if (wpmVal >= 70) score += 0.5; if (wpmVal >= 100) score += 0.5;
    if (words >= 50) score += 0.25; score -= Math.min(1, lintErrors * 0.1);
    return { band: Math.max(4, Math.min(8, Math.round(score * 2) / 2)), disclaimer: DISCLAIMER };
  }
  /* Pitch: simple autocorrelation F0 (from Visual Playground, fixed subharmonic) */
  function estimateF0(buf, sampleRate) {
    var best = -1, bestLag = -1, size = buf.length;
    for (var lag = Math.floor(sampleRate / 400); lag <= Math.floor(sampleRate / 70); lag++) {
      var corr = 0; for (var i = 0; i < size - lag; i++) corr += buf[i] * buf[i + lag];
      if (corr > best) { best = corr; bestLag = lag; }
    }
    return bestLag > 0 ? sampleRate / bestLag : 0;
  }
  return { esc: esc, localDateStr: localDateStr, computeStreak: computeStreak, wordCount: wordCount, wpm: wpm, splitSentences: splitSentences, sm2: sm2, isDue: isDue, compileRules: compileRules, lint: lint, BUILTIN: BUILTIN, mergeState: mergeState, xpFor: xpFor, estimateBand: estimateBand, estimateF0: estimateF0, DISCLAIMER: DISCLAIMER };
});
