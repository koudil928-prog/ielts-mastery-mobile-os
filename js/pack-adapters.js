/* IELTS Mastery Mobile OS v4.0 — pack-adapters.js (DOM-free, UMD)
   Normalizes all 13 production packs. Handles schema drift:
   reading_traps/reading-traps, alchemy vs alchemy_task1 (same type "alchemy",
   distinguished by filename), debate for_side/against_side -> counter_arguments[]. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IMOSAdapters = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function arr(x) { return Array.isArray(x) ? x : (x == null ? [] : [x]); }
  function str(x) { return x == null ? '' : String(x); }
  function itemsOf(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.items)) return raw.items;
    return [];
  }
  function typeOf(raw, filename) {
    var t = raw && raw.type ? String(raw.type) : '';
    var f = str(filename).toLowerCase();
    if (f.indexOf('reading') >= 0) return 'reading_traps';
    if (f.indexOf('task1-charts') >= 0 || f.indexOf('task1_charts') >= 0) return 'task1_charts';
    if (f.indexOf('debate') >= 0) return 'debate_arena';
    if (f.indexOf('alchemy-task1') >= 0 || f.indexOf('alchemy_task1') >= 0) return 'alchemy_task1';
    if (f.indexOf('alchemy') >= 0) return 'alchemy';
    if (f.indexOf('lint') >= 0) return 'lint_rules';
    if (f.indexOf('srs') >= 0) return 'srs_library';
    var norm = t.replace(/-/g, '_');
    var known = { reading_traps: 1, task1_charts: 1, debate_arena: 1, alchemy: 1, qbank: 1, bench: 1, lint_rules: 1, curriculum: 1, srs_library: 1, lexicon: 1, drills: 1, groupwork: 1 };
    if (known[norm]) return norm === 'alchemy' && f.indexOf('task1') >= 0 ? 'alchemy_task1' : norm;
    return norm || 'unknown';
  }

  function adaptReading(raw) {
    return itemsOf(raw).map(function (it, i) {
      var qs = arr(it.questions).map(function (q) {
        return {
          qid: str(q.qid || q.id || ('q' + i)), kind: str(q.kind || 'tfng'),
          statement: str(q.statement || q.question || q.prompt || ''),
          options: arr(q.options), answer: str(q.answer || ''),
          evidence_span: str(q.evidence_span || q.evidence || ''),
          evidence_index: str(it.passage || '').indexOf(str(q.evidence_span || '')),
          explanation_ja: str(q.explanation_ja || ''),
          paraphrase_pair: q.paraphrase_pair || null
        };
      });
      return { id: str(it.id || 'rd-' + i), title: str(it.title || ''), field: str(it.field || ''),
        passage: str(it.passage || ''), questions: qs };
    });
  }

  function adaptTask1Chart(raw) {
    return itemsOf(raw).map(function (it, i) {
      var type = str(it.chart_type || 'bar').toLowerCase();
      var series = arr(it.series).map(function (s) {
        return { name: str(s.name || s.label || ''), values: arr(s.values).map(Number) };
      });
      var steps = arr(it.steps).map(function (s, j) {
        return { order: typeof s.order === 'number' ? s.order : j + 1, label: str(s.label || ''), description: str(s.description || s.text || '') };
      }).sort(function (a, b) { return a.order - b.order; });
      // pie fallback: single series -> slices from labels+values
      var slices = [];
      if (type === 'pie') {
        if (series.length && series[0].values.length) slices = arr(it.labels).map(function (l, j) { return { label: str(l), value: series[0].values[j] || 0 }; });
        else if (Array.isArray(it.values)) slices = arr(it.labels).map(function (l, j) { return { label: str(l), value: Number(it.values[j] || 0) }; });
      }
      return { id: str(it.id || 't1c-' + i), chart_type: type, title: str(it.title || ''), unit: str(it.unit || ''),
        labels: arr(it.labels).map(str), series: series, steps: steps, slices: slices,
        key_features_ja: arr(it.key_features_ja).map(str), source_band55: str(it.source_band55 || ''),
        model_b70: str(it.model_b70 || ''), model_b80: str(it.model_b80 || '') };
    });
  }

  function adaptDebate(raw) {
    function side(s) {
      s = s || {};
      return { stance_en: str(s.stance_en || s.stance || s.position || ''),
        points: arr(s.points || s.arguments).map(str),
        counter_arguments: arr(s.counter_arguments || s.counters).map(function (c) {
          if (typeof c === 'string') return { angle: '', attack_en: c, model_rebuttal_b75: '' };
          return { angle: str(c.angle || ''), attack_en: str(c.attack_en || c.attack || ''), model_rebuttal_b75: str(c.model_rebuttal_b75 || c.rebuttal || '') };
        }) };
    }
    return itemsOf(raw).map(function (it, i) {
      var forSide = side(it.for_side || it.forSide || it.pro);
      var againstSide = side(it.against_side || it.againstSide || it.con);
      // flatten counters for arena play
      var counters = forSide.counter_arguments.map(function (c) { return Object.assign({ side: 'for' }, c); })
        .concat(againstSide.counter_arguments.map(function (c) { return Object.assign({ side: 'against' }, c); }));
      return { id: str(it.id || 'deb-' + i), topic: str(it.topic || ''), prompt: str(it.prompt || ''),
        for_side: forSide, against_side: againstSide, counter_arguments: counters };
    });
  }

  function adaptAlchemy(raw, task) {
    return itemsOf(raw).map(function (it, i) {
      return { id: str(it.id || 'alc-' + i), task: task, topic: str(it.topic || it.title || ''),
        source_band55: str(it.source_band55 || it.source || ''), answer_b70: str(it.answer_b70 || ''),
        answer_b80: str(it.answer_b80 || ''), examiner_note_ja: str(it.examiner_note_ja || ''),
        cards: arr(it.cards).map(function (c) { return typeof c === 'string' ? { kind: 'vocab', text: c } : { kind: str(c.kind || 'vocab'), text: str(c.text || '') }; }),
        slots: it.slots || {}, diff: arr(it.diff).map(function (d) { return { from: str(d.from || ''), to: str(d.to || ''), why_ja: str(d.why_ja || '') }; }) };
    });
  }

  function normalizePack(raw, filename) {
    if (!raw || typeof raw !== 'object') throw new Error('pack is not an object: ' + filename);
    var type = typeOf(raw, filename);
    var items;
    switch (type) {
      case 'reading_traps': items = adaptReading(raw); break;
      case 'task1_charts': items = adaptTask1Chart(raw); break;
      case 'debate_arena': items = adaptDebate(raw); break;
      case 'alchemy': items = adaptAlchemy(raw, 2); break;
      case 'alchemy_task1': items = adaptAlchemy(raw, 1); break;
      case 'qbank': items = itemsOf(raw).map(function (it) { return { id: str(it.id), part: Number(it.part || 1), topic: str(it.topic || ''), q: str(it.q || it.question || ''), followups: arr(it.followups).map(str), keywords: arr(it.keywords).map(str), model: it.model || {} }; }); break;
      case 'bench': items = itemsOf(raw).map(function (it) { return { id: str(it.id), text: str(it.text || ''), focus: arr(it.focus).map(str), seconds_target: Number(it.seconds_target || 30), words: Number(it.words || 0) }; }); break;
      case 'lint_rules': items = itemsOf(raw).map(function (it) { return { id: str(it.id), category: str(it.category || ''), subtype: str(it.subtype || ''), severity: str(it.severity || 'W'), pattern: it.pattern || null, message_ja: str(it.message_ja || ''), fix_hint: str(it.fix_hint || ''), good_examples: arr(it.good_examples).map(str), bad_examples: arr(it.bad_examples).map(str), golden: it.golden || null }; }); break;
      case 'curriculum': items = itemsOf(raw).map(function (it) { return { day: Number(it.day || 0), date: str(it.date || ''), theme: str(it.theme || ''), stage: str(it.stage || ''), mission: it.mission || {}, speaking: it.speaking || {}, grammar_focus: str(it.grammar_focus || ''), vocab_focus: it.vocab_focus || {}, listening_unit: str(it.listening_unit || ''), silent_alt: str(it.silent_alt || '') }; }); break;
      case 'srs_library': items = itemsOf(raw).map(function (it) { return { id: str(it.id), word: str(it.word || it.term || ''), meaning_ja: str(it.meaning_ja || ''), example: str(it.example || ''), pron_note: str(it.pron_note || ''), unlock_stage: Number(it.unlock_stage || 1) }; }); break;
      case 'lexicon': items = itemsOf(raw).map(function (it) { return { word: str(it.word || ''), arpabet: str(it.arpabet || ''), stress: Number(it.stress || 1), syllables: arr(it.syllables).map(str) }; });
        return { type: type, version: raw.version || 1, items: items, pairs: arr(raw.pairs).map(function (p) { return { a: str(p.a), b: str(p.b), label: str(p.label || ''), hint_ja: str(p.hint_ja || '') }; }) };
      case 'drills': items = itemsOf(raw).map(function (it) { return { id: str(it.id), kind: str(it.kind || ''), prompt: str(it.prompt || ''), answer: str(it.answer || ''), hint_ja: str(it.hint_ja || ''), rule_id: str(it.rule_id || '') }; }); break;
      case 'groupwork': items = itemsOf(raw).map(function (it) { return { id: str(it.id), subject: str(it.subject || ''), interrupt_at: Number(it.interrupt_at || 0), turns: arr(it.turns), branches: arr(it.branches), target_phrases: arr(it.target_phrases).map(str), must_kw: arr(it.must_kw).map(str), model_reply: str(it.model_reply || '') }; }); break;
      default: items = itemsOf(raw);
    }
    return { type: type, version: raw.version || 1, items: items };
  }

  return { normalizePack: normalizePack, adaptReading: adaptReading, adaptTask1Chart: adaptTask1Chart, adaptDebate: adaptDebate, adaptAlchemy: adaptAlchemy, itemsOf: itemsOf, typeOf: typeOf };
});
