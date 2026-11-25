/* IELTS Mastery Mobile OS v5.0 — vfx-engine.js: tiny canvas FX engine (particles, damage numbers,
   screen shake, hit-stop, slash streaks). DOM-free logic core; the game loop calls update/draw. */
(function (root) {
  'use strict';
  function createEngine(rng) {
    var rand = rng || Math.random;
    var particles = [], numbers = [], streaks = [];
    var shakeMag = 0, hitstopUntil = 0, now = 0;
    function burst(x, y, opts) {
      opts = opts || {};
      var n = opts.count || 18, color = opts.color || '#2dd4bf', speed = opts.speed || 260, life = opts.life || 0.7, size = opts.size || 3, gravity = opts.gravity !== undefined ? opts.gravity : 500;
      for (var i = 0; i < n; i++) {
        var a = rand() * Math.PI * 2, sp = speed * (0.3 + rand() * 0.9);
        particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.25, life: life * (0.6 + rand() * 0.7), maxLife: life, size: size * (0.5 + rand()), color: color, gravity: gravity });
      }
    }
    function damageNumber(x, y, text, color, big) {
      numbers.push({ x: x + (rand() - 0.5) * 30, y: y, text: String(text), color: color || '#fff', life: 0.9, maxLife: 0.9, big: !!big });
    }
    function slash(x, y, angle, color) { streaks.push({ x: x, y: y, angle: angle || -0.6, life: 0.16, maxLife: 0.16, color: color || '#ffffff' }); }
    function shake(mag) { shakeMag = Math.max(shakeMag, mag || 6); }
    function hitstop(ms) { hitstopUntil = Math.max(hitstopUntil, now + (ms || 60)); }
    function update(dtMs) {
      now += dtMs;
      var frozen = now < hitstopUntil;
      var dt = frozen ? 0 : dtMs / 1000;
      particles = particles.filter(function (p) { p.life -= dt; if (p.life <= 0) return false; p.vy += p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; return true; });
      numbers = numbers.filter(function (n) { n.life -= dtMs / 1000; n.y -= 42 * (dtMs / 1000); return n.life > 0; });
      streaks = streaks.filter(function (s) { s.life -= dtMs / 1000; return s.life > 0; });
      shakeMag = Math.max(0, shakeMag - dtMs * 0.03);
      return { frozen: frozen, shakeX: (rand() - 0.5) * 2 * shakeMag, shakeY: (rand() - 0.5) * 2 * shakeMag };
    }
    function draw(ctx) {
      streaks.forEach(function (s) {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle); ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
        ctx.fillStyle = s.color; ctx.fillRect(-70, -3, 140, 6); ctx.restore();
      });
      particles.forEach(function (p) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      });
      ctx.globalAlpha = 1;
      numbers.forEach(function (n) {
        ctx.globalAlpha = Math.max(0, n.life / n.maxLife);
        ctx.fillStyle = n.color; ctx.font = (n.big ? 'bold 30px' : 'bold 19px') + ' sans-serif';
        ctx.textAlign = 'center'; ctx.fillText(n.text, n.x, n.y);
      });
      ctx.globalAlpha = 1;
    }
    return { burst: burst, damageNumber: damageNumber, slash: slash, shake: shake, hitstop: hitstop, update: update, draw: draw, counts: function () { return { particles: particles.length, numbers: numbers.length, streaks: streaks.length }; }, clear: function () { particles = []; numbers = []; streaks = []; shakeMag = 0; } };
  }
  var api = { createEngine: createEngine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IMOSVFX = api;
})(typeof self !== 'undefined' ? self : this);
