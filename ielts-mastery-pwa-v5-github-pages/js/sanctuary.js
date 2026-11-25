/* IELTS Mastery Mobile OS v5.0 — sanctuary.js: BAND-7 SANCTUARY.
   A growing KL diorama on the Today tab: time-of-day sky, rain-ambient linkage (raindrops + ripples),
   and a city that lights up with your Streak / XP / Band-Ladder stage. Static SVG when animations are off. */
(function (root) {
  'use strict';
  function skyPhase(hour) { if (hour >= 5 && hour < 10) return 'morning'; if (hour >= 10 && hour < 16) return 'day'; if (hour >= 16 && hour < 19) return 'sunset'; return 'night'; }
  function sceneParams(state, hour) {
    state = state || {};
    var xp = state.xp || 0, streak = state.streak || 0;
    var kills = Object.keys(state.monsters || {}).reduce(function (a, k) { return a + (state.monsters[k].kills || 0); }, 0);
    var phase = skyPhase(hour);
    return {
      phase: phase,
      towerTier: Math.min(4, 1 + Math.floor(xp / 300)),
      litRatio: Math.min(1, 0.15 + xp / 1200),
      fireflies: phase === 'night' ? Math.min(24, streak * 2 + kills) : 0,
      streak: streak, xp: xp, kills: kills,
      stageLabel: xp >= 900 ? 'Stage 4（7.0→7.5）' : xp >= 550 ? 'Stage 3（6.5→7.0）' : xp >= 250 ? 'Stage 2（6.0→6.5）' : 'Stage 1（5.5→6.0）'
    };
  }
  var api = { skyPhase: skyPhase, sceneParams: sceneParams };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IMOSSanctuaryLogic = api;

  /* ---------- Browser controller ---------- */
  var env = null, rafId = null, drops = [], ripples = [], lastRain = false;
  function $(id) { return document.getElementById(id); }
  function skyColors(phase) {
    return { morning: ['#f7b267', '#f4845f'], day: ['#7dd3fc', '#38bdf8'], sunset: ['#fb923c', '#7c3aed'], night: ['#0b1226', '#132a52'] }[phase];
  }
  function drawScene(ctx, p, t, raining) {
    var W = 640, H = 190;
    var cols = skyColors(p.phase);
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (p.phase === 'night') { ctx.fillStyle = '#e8eefc'; ctx.beginPath(); ctx.arc(568, 34, 15, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(232,238,252,0.7)'; for (var s = 0; s < 26; s++) ctx.fillRect((s * 83) % W, (s * 41) % 80, 1.6, 1.6); }
    else { ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(p.phase === 'day' ? 330 : 560, p.phase === 'sunset' ? 120 : 36, 19, 0, Math.PI * 2); ctx.fill(); }
    // twin towers grow with tier
    var base = 168, towerH = 62 + p.towerTier * 17;
    [238, 308].forEach(function (x, ti) {
      ctx.fillStyle = p.phase === 'night' ? '#101f3f' : '#334155';
      ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x + 7, base - towerH + 14); ctx.lineTo(x + 14, base - towerH); ctx.lineTo(x + 21, base - towerH + 14); ctx.lineTo(x + 28, base); ctx.closePath(); ctx.fill();
      ctx.fillRect(x + 12, base - towerH - 10, 4, 11);
      // lit windows by litRatio (deterministic pattern)
      for (var wy = 0; wy < Math.floor(towerH / 11); wy++) for (var wx = 0; wx < 2; wx++) {
        var lit = ((wy * 7 + wx * 13 + ti * 5) % 100) / 100 < p.litRatio;
        ctx.fillStyle = lit ? (p.phase === 'night' ? '#facc15' : '#fde68a') : 'rgba(148,163,184,0.35)';
        ctx.fillRect(x + 6 + wx * 10, base - towerH + 12 + wy * 11, 5, 6);
      }
    });
    ctx.fillStyle = p.phase === 'night' ? '#101f3f' : '#334155'; ctx.fillRect(262, base - towerH + 34, 62, 5);
    // smaller buildings
    [[40, 44], [120, 58], [420, 50], [510, 64], [580, 40]].forEach(function (b, bi) {
      ctx.fillStyle = p.phase === 'night' ? '#0d1830' : '#475569'; ctx.fillRect(b[0], base - b[1], 44, b[1]);
      for (var wy = 0; wy < Math.floor(b[1] / 12); wy++) for (var wx = 0; wx < 3; wx++) {
        var lit = ((wy * 11 + wx * 7 + bi * 3) % 100) / 100 < p.litRatio;
        ctx.fillStyle = lit ? '#facc15' : 'rgba(148,163,184,0.3)'; ctx.fillRect(b[0] + 6 + wx * 12, base - b[1] + 6 + wy * 12, 6, 7);
      }
    });
    ctx.fillStyle = p.phase === 'night' ? '#081120' : '#1e293b'; ctx.fillRect(0, base, W, H - base);
    // fireflies at night
    if (p.fireflies) { ctx.fillStyle = '#bef264'; for (var f = 0; f < p.fireflies; f++) { var fx = (f * 67 + Math.sin(t * 0.9 + f * 1.7) * 16 + 640) % 640, fy = 128 + Math.sin(t * 1.3 + f * 2.3) * 13; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + f); ctx.fillRect(fx, fy, 2.4, 2.4); } ctx.globalAlpha = 1; }
    // rain + ripples (ambient-linked)
    if (raining) {
      ctx.strokeStyle = 'rgba(186,230,253,0.55)'; ctx.lineWidth = 1; ctx.beginPath();
      drops.forEach(function (d) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2, d.y + 9); });
      ctx.stroke();
      ctx.strokeStyle = 'rgba(186,230,253,0.5)';
      ripples.forEach(function (r) { ctx.beginPath(); ctx.ellipse(r.x, 172, r.r, r.r * 0.32, 0, 0, Math.PI * 2); ctx.stroke(); });
    }
  }
  function frame() {
    var c = $('sanctCanvas');
    var card = $('sanctuaryCard');
    if (!c || !card || card.offsetParent === null) { rafId = null; return; }
    var raining = document.body.dataset.ambient === 'rain';
    if (raining && !lastRain) { drops = []; for (var i = 0; i < 60; i++) drops.push({ x: Math.random() * 640, y: Math.random() * 190, v: 260 + Math.random() * 160 }); }
    lastRain = raining;
    var p = api.sceneParams(env.state(), new Date().getHours());
    var ctx = c.getContext('2d');
    drawScene(ctx, p, performance.now() / 1000, raining);
    if (raining) {
      drops.forEach(function (d) { d.y += d.v * 0.016; if (d.y > 172) { if (ripples.length < 14 && Math.random() < 0.3) ripples.push({ x: d.x, r: 2 }); d.y = -8; d.x = Math.random() * 640; } });
      ripples = ripples.filter(function (r) { r.r += 0.55; return r.r < 13; });
    }
    var lab = $('sanctLabel');
    if (lab) lab.textContent = '🌃 BAND-7 SANCTUARY — ' + p.stageLabel + '｜XP ' + p.xp + '｜🔥' + p.streak + '日｜討伐 ' + p.kills + (raining ? '｜🌧 雨音と連動中' : '');
    rafId = requestAnimationFrame(frame);
  }
  function renderStatic() {
    var box = $('sanctSvg'); if (!box) return;
    var p = api.sceneParams(env.state(), new Date().getHours());
    var cols = skyColors(p.phase);
    var ns = 'http://www.w3.org/2000/svg';
    box.textContent = '';
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 640 190'); svg.setAttribute('class', 'chart');
    function rect(x, y, w, h, fill) { var r = document.createElementNS(ns, 'rect'); r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', h); r.setAttribute('fill', fill); svg.appendChild(r); return r; }
    rect(0, 0, 640, 190, cols[0]);
    rect(0, 120, 640, 70, cols[1]);
    var towerH = 62 + p.towerTier * 17;
    [238, 308].forEach(function (x) { rect(x, 168 - towerH, 28, towerH, '#101f3f'); });
    rect(262, 168 - towerH + 34, 62, 5, '#101f3f');
    for (var i = 0; i < 40; i++) { if ((i * 37 % 100) / 100 < p.litRatio) rect(244 + (i % 2) * 10 + Math.floor(i / 20) * 70, 176 - towerH + Math.floor((i % 20) / 2) * 11, 5, 6, '#facc15'); }
    rect(0, 168, 640, 22, '#081120');
    box.appendChild(svg);
    var lab = $('sanctLabel');
    if (lab) lab.textContent = '🌃 BAND-7 SANCTUARY（静止画モード）— ' + p.stageLabel + '｜XP ' + p.xp + '｜🔥' + p.streak + '日';
  }
  function refresh() {
    if (!env) return;
    var noAnim = document.body.classList.contains('no-anim');
    var c = $('sanctCanvas'), svgBox = $('sanctSvg');
    if (noAnim) { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } if (c) c.style.display = 'none'; if (svgBox) svgBox.style.display = ''; renderStatic(); }
    else { if (c) c.style.display = ''; if (svgBox) svgBox.style.display = 'none'; if (!rafId) rafId = requestAnimationFrame(frame); }
  }
  function init(e) {
    env = e;
    if (!$('sanctuaryCard')) return;
    refresh();
    setInterval(refresh, 5000);
  }
  root.IMOSSanctuary = { init: init, refresh: refresh };
})(typeof self !== 'undefined' ? self : this);
