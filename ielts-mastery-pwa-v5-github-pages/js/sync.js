/* IELTS Mastery Mobile OS v5.0 — sync.js: GAS v4.1 client.
   GAS URL/token ONLY from localStorage key "imos.gas" ({url,token}). Never hardcoded, never logged, never exported.
   Contract (GAS v4.1): business errors arrive as HTTP 200 + {ok:false, error} — always treated as errors here.
   Raw pack JSON (action=pack) has no "ok" key and passes through untouched. */
(function (root) {
  'use strict';
  function cfg() { try { return JSON.parse(localStorage.getItem('imos.gas') || '{}'); } catch (e) { return {}; } }
  function saveCfg(url, token) { localStorage.setItem('imos.gas', JSON.stringify({ url: url || '', token: token || '' })); }
  function ready() { var c = cfg(); return !!(c.url && c.token); }
  function urlFor(params) { var c = cfg(); var u = new URL(c.url); Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); }); u.searchParams.set('token', c.token); return u.toString(); }
  function checkOk(data) { if (data && data.ok === false) throw new Error(data.error || 'GAS error'); return data; }
  function get(params) { return fetch(urlFor(params)).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(checkOk); }
  function post(body) {
    var c = cfg(); body = Object.assign({}, body, { token: c.token });
    return fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(checkOk);
  }
  var api = {
    cfg: cfg, saveCfg: saveCfg, ready: ready,
    packsManifest: function () { return get({ action: 'packs_manifest' }); },
    fetchPack: function (name) { return get({ action: 'pack', name: name }); },
    statePull: function () { return get({ action: 'state_pull' }); },
    statePush: function (state) { return post({ action: 'state_push', state: state }); },
    /* Muse bus — formal contract: { action:'enqueue_muse', packetId, packetText } */
    enqueueMuse: function (packetId, packetText) { return post({ action: 'enqueue_muse', packetId: packetId, packetText: packetText }); },
    pullMuseOutbox: function () { return get({ action: 'pull_muse_outbox' }); },
    ackMuseOutbox: function (packetIds) { return post({ action: 'ack_muse_outbox', packetIds: packetIds }); },
    due: function () { return get({ action: 'due' }); },
    stats: function () { return get({ action: 'stats' }); },
    /* Log push — formal top-level sections (no "rows" wrapper) */
    pushLogs: function (sections) {
      sections = sections || {};
      return post({ action: 'push', daily_log: sections.daily_log || [], attempts: sections.attempts || [], confusions: sections.confusions || [], lint_hits: sections.lint_hits || [], srs_updates: sections.srs_updates || [], stage_log: sections.stage_log || [] });
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IMOSSync = api;
})(typeof self !== 'undefined' ? self : this);
