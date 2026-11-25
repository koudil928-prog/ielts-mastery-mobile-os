/* IELTS Mastery Mobile OS v5.0 — qr.js: dependency-free QR Code encoder (Byte mode, EC levels L/M, versions 1-10).
   Pure JS + SVG rendering via DOM APIs only. Includes Reed-Solomon over GF(256), mask penalty selection,
   and format information BCH. Exposes matrix + data-codeword round-trip helpers for testing. */
(function (root) {
  'use strict';
  /* ---------- GF(256) ---------- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function gfMul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }
  function rsGenerator(deg) {
    var poly = [1];
    for (var i = 0; i < deg; i++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j++) { next[j] ^= poly[j]; next[j + 1] ^= gfMul(poly[j], EXP[i]); }
      poly = next;
    }
    return poly;
  }
  function rsEncode(data, ecLen) {
    var gen = rsGenerator(ecLen), res = new Array(ecLen).fill(0);
    data.forEach(function (b) {
      var factor = b ^ res[0]; res.shift(); res.push(0);
      for (var i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i + 1], factor);
    });
    return res;
  }
  function rsSyndromes(codewords, ecLen) {
    var out = [];
    for (var k = 0; k < ecLen; k++) {
      var s = 0;
      codewords.forEach(function (cw) { s = gfMul(s, EXP[k]) ^ cw; });
      out.push(s);
    }
    return out;
  }
  /* ---------- Capacity tables (versions 1-10, levels L/M): [ecPerBlock, [[blocks, dataPerBlock], ...]] ---------- */
  var TABLE = {
    L: { 1: [7, [[1, 19]]], 2: [10, [[1, 34]]], 3: [15, [[1, 55]]], 4: [20, [[1, 80]]], 5: [26, [[1, 108]]], 6: [18, [[2, 68]]], 7: [20, [[2, 78]]], 8: [24, [[2, 97]]], 9: [30, [[2, 116]]], 10: [18, [[2, 68], [2, 69]]] },
    M: { 1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]], 6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]] }
  };
  var ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
  var REMAINDER = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0 };
  function dataCapacity(version, level) { return TABLE[level][version][1].reduce(function (a, g) { return a + g[0] * g[1]; }, 0); }
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { var cp = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(++i) - 0xdc00); out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); }
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return out;
  }
  function buildDataCodewords(bytes, version, level) {
    var cap = dataCapacity(version, level), bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); }
    push(0x4, 4); // byte mode
    push(bytes.length, version >= 10 ? 16 : 8);
    bytes.forEach(function (b) { push(b, 8); });
    var capBits = cap * 8;
    var term = Math.min(4, capBits - bits.length);
    for (var i = 0; i < term; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    var pads = [0xec, 0x11], pi = 0;
    while (bits.length < capBits) { push(pads[pi % 2], 8); pi++; }
    var out = [];
    for (var j = 0; j < bits.length; j += 8) { var v = 0; for (var k = 0; k < 8; k++) v = (v << 1) | bits[j + k]; out.push(v); }
    return out;
  }
  function interleaveWithEc(data, version, level) {
    var spec = TABLE[level][version], ecLen = spec[0], groups = spec[1];
    var blocks = [], idx = 0;
    groups.forEach(function (g) { for (var n = 0; n < g[0]; n++) { var d = data.slice(idx, idx + g[1]); idx += g[1]; blocks.push({ data: d, ec: rsEncode(d, ecLen) }); } });
    var out = [], maxD = Math.max.apply(null, blocks.map(function (b) { return b.data.length; }));
    for (var i = 0; i < maxD; i++) blocks.forEach(function (b) { if (i < b.data.length) out.push(b.data[i]); });
    for (var j = 0; j < ecLen; j++) blocks.forEach(function (b) { out.push(b.ec[j]); });
    return { codewords: out, blocks: blocks };
  }
  /* ---------- Matrix construction ---------- */
  function formatBits(level, mask) {
    var data = ((level === 'L' ? 1 : 0) << 3) | mask; // L=01, M=00
    var d = data << 10, gen = 0x537;
    for (var i = 14; i >= 10; i--) if ((d >> i) & 1) d ^= gen << (i - 10);
    return ((data << 10) | d) ^ 0x5412;
  }
  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; }, function (r) { return r % 2 === 0; }, function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; }, function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; }, function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; },
    function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }
  ];
  function buildMatrix(version, level, codewords, mask) {
    var size = 17 + 4 * version;
    var m = [], fn = [];
    for (var i = 0; i < size; i++) { m.push(new Array(size).fill(0)); fn.push(new Array(size).fill(false)); }
    function set(x, y, v) { if (x >= 0 && x < size && y >= 0 && y < size) { m[y][x] = v; fn[y][x] = true; } }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d === 3 || d <= 1 ? 1 : 0);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    for (var t = 8; t < size - 8; t++) { set(t, 6, t % 2 === 0 ? 1 : 0); set(6, t, t % 2 === 0 ? 1 : 0); }
    var ap = ALIGN[version];
    ap.forEach(function (ax) { ap.forEach(function (ay) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) return;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) === 2 || (dx === 0 && dy === 0) ? 1 : 0);
    }); });
    set(8, size - 8, 1); // dark module
    // reserve format areas
    for (var f = 0; f < 9; f++) { if (f !== 6) { fn[f][8] = true; fn[8][f] = true; } }
    for (var f2 = 0; f2 < 8; f2++) { fn[size - 1 - f2][8] = true; fn[8][size - 1 - f2] = true; }
    fn[8][size - 8] = true;
    // place data bits (zigzag from bottom-right)
    var bits = [];
    codewords.forEach(function (cw) { for (var b = 7; b >= 0; b--) bits.push((cw >> b) & 1); });
    for (var rb = 0; rb < REMAINDER[version]; rb++) bits.push(0);
    var bi = 0, upward = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var s = 0; s < size; s++) {
        var row = upward ? size - 1 - s : s;
        for (var dc = 0; dc < 2; dc++) {
          var x2 = col - dc;
          if (!fn[row][x2]) { var v = bi < bits.length ? bits[bi] : 0; bi++; if (MASKS[mask](row, x2)) v ^= 1; m[row][x2] = v; fn[row][x2] = true; }
        }
      }
      upward = !upward;
    }
    // format information
    var fb = formatBits(level, mask);
    function bit(i) { return (fb >> i) & 1; }
    for (var a = 0; a < 6; a++) m[a][8] = bit(a);
    m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8);
    for (var b2 = 9; b2 < 15; b2++) m[8][14 - b2] = bit(b2);
    for (var c2 = 0; c2 < 8; c2++) m[8][size - 1 - c2] = bit(c2);
    for (var d2 = 8; d2 < 15; d2++) m[size - 15 + d2][8] = bit(d2);
    return m;
  }
  function penalty(m) {
    var size = m.length, score = 0, r, c, i, run;
    for (r = 0; r < size; r++) { run = 1; for (c = 1; c < size; c++) { if (m[r][c] === m[r][c - 1]) { run++; } else { if (run >= 5) score += run - 2; run = 1; } } if (run >= 5) score += run - 2; }
    for (c = 0; c < size; c++) { run = 1; for (r = 1; r < size; r++) { if (m[r][c] === m[r - 1][c]) { run++; } else { if (run >= 5) score += run - 2; run = 1; } } if (run >= 5) score += run - 2; }
    for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) score += 3;
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function scanLine(line) { var s = 0; for (var k = 0; k + 11 <= line.length; k++) { var w = line.slice(k, k + 11); if (w.join('') === pat1.join('') || w.join('') === pat2.join('')) s += 40; } return s; }
    for (r = 0; r < size; r++) score += scanLine(m[r]);
    for (c = 0; c < size; c++) { var colArr = []; for (i = 0; i < size; i++) colArr.push(m[i][c]); score += scanLine(colArr); }
    var dark = 0; m.forEach(function (row) { row.forEach(function (v) { dark += v; }); });
    var ratio = dark * 100 / (size * size), lo = Math.floor(ratio / 5) * 5, hi = Math.ceil(ratio / 5) * 5;
    score += Math.min(Math.abs(lo - 50), Math.abs(hi - 50)) / 5 * 10;
    return score;
  }
  function encode(text, level) {
    level = level || 'M';
    var bytes = utf8Bytes(text), version = 0;
    for (var v = 1; v <= 10; v++) { if (bytes.length + (v >= 10 ? 3 : 2) <= dataCapacity(v, level)) { version = v; break; } }
    if (!version) throw new Error('QR: text too long for version 10-' + level);
    var data = buildDataCodewords(bytes, version, level);
    var full = interleaveWithEc(data, version, level);
    var best = null, bestMask = 0, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) { var mtx = buildMatrix(version, level, full.codewords, mask); var sc = penalty(mtx); if (sc < bestScore) { bestScore = sc; best = mtx; bestMask = mask; } }
    return { matrix: best, version: version, mask: bestMask, size: best.length, level: level, dataCodewords: data, blocks: full.blocks };
  }
  function toSVG(encodeResult, cell) {
    cell = cell || 6;
    var m = encodeResult.matrix, size = m.length, dim = (size + 8) * cell;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + dim + ' ' + dim); svg.setAttribute('width', dim); svg.setAttribute('height', dim); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR code');
    var bg = document.createElementNS(ns, 'rect'); bg.setAttribute('width', dim); bg.setAttribute('height', dim); bg.setAttribute('fill', '#ffffff'); svg.appendChild(bg);
    for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) if (m[r][c]) { var rect = document.createElementNS(ns, 'rect'); rect.setAttribute('x', (c + 4) * cell); rect.setAttribute('y', (r + 4) * cell); rect.setAttribute('width', cell); rect.setAttribute('height', cell); rect.setAttribute('fill', '#000000'); svg.appendChild(rect); }
    return svg;
  }
  var api = { encode: encode, toSVG: toSVG, utf8Bytes: utf8Bytes, buildDataCodewords: buildDataCodewords, interleaveWithEc: interleaveWithEc, rsSyndromes: rsSyndromes, formatBits: formatBits, dataCapacity: dataCapacity };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IMOSQR = api;
})(typeof self !== 'undefined' ? self : this);
