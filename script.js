'use strict';
/* ===== SmartCalc Pro: engine (pure, testable in Node) ===== */
const MAXH = 50;
const S = { expr: '', line: '', done: false, err: '', repeat: '', mem: 0, history: [], sci: false };
let render = () => {}, toast = () => {};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
};

/* Safe recursive-descent parser. No eval(). Precedence: ( ) / √ > % > ^ > unary − > × ÷ > + − */
function tokenize(src) {
  const s = src.replace(/\s/g, '').replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
  const re = /\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[-+*\/^%()√]/y, out = [];
  for (let p = 0; p < s.length;) {
    re.lastIndex = p;
    const m = re.exec(s);
    if (!m) throw new Error('Invalid expression');
    out.push(m[0]); p = re.lastIndex;
  }
  return out;
}
function evaluate(src) {
  const t = tokenize(src); let i = 0;
  const fail = m => { throw new Error(m); }, peek = () => t[i];
  function expr() {           // a + b%  means a + (a × b/100)
    let l = term();
    while (peek() === '+' || peek() === '-') {
      const o = t[i++], r = term(), rv = r.pct ? l.v * r.v : r.v;
      l = { v: o === '+' ? l.v + rv : l.v - rv };
    }
    return l;
  }
  function term() {
    let l = unary();
    while (peek() === '*' || peek() === '/') {
      const o = t[i++], r = unary();
      if (o === '/' && r.v === 0) fail('Cannot divide by zero');
      l = { v: o === '*' ? l.v * r.v : l.v / r.v };
    }
    return l;
  }
  function unary() {
    if (peek() === '-') { i++; return { v: -unary().v }; }
    if (peek() === '+') { i++; return unary(); }
    return pow();
  }
  function pow() {
    const b = post();
    if (peek() === '^') {
      i++; const v = Math.pow(b.v, unary().v);
      if (!isFinite(v)) fail('Invalid operation');
      return { v };
    }
    return b;
  }
  function post() {
    const a = atom(); a.pct = false;
    while (peek() === '%') { i++; a.v /= 100; a.pct = true; }
    return a;
  }
  function atom() {
    const c = t[i++];
    if (c === undefined) fail('Incomplete expression');
    if (/^[\d.]/.test(c)) return { v: parseFloat(c) };
    if (c === '(') { const e = expr(); if (t[i++] !== ')') fail('Missing closing bracket'); return { v: e.v }; }
    if (c === '√') { const x = atom(); if (x.v < 0) fail('Cannot take root of a negative'); return { v: Math.sqrt(x.v) }; }
    return fail('Invalid expression');
  }
  const r = expr();
  if (i < t.length) fail('Invalid expression');
  if (!isFinite(r.v)) fail('Result too large');
  return r.v;
}
// Drop trailing operators and auto-close brackets so partial input can be previewed.
function prepare(s) {
  s = s.replace(/[+−×÷^]+$/, '');
  const open = (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;
  return s + ')'.repeat(Math.max(0, open));
}
function fmt(n) {
  if (!isFinite(n)) throw new Error('Result too large');
  n = Number(n.toPrecision(12));
  return String(Object.is(n, -0) ? 0 : n).replace(/^-/, '−');
}
const val = s => evaluate(prepare(s));

/* ===== state machine ===== */
const NUM = /[\d.]+%?$/;
function fresh() { if (S.done) { S.expr = ''; S.done = false; S.repeat = ''; } }
function keep() { S.done = false; S.repeat = ''; }
function addHistory(e, r) {
  S.history.unshift({ e, r }); S.history.length = Math.min(S.history.length, MAXH);
  store.set('sc-history', JSON.stringify(S.history));
}
function insertNumber(str) {
  fresh();
  let e = S.expr;
  if (/[\d.]$/.test(e)) e = e.replace(/[\d.]+$/, ''); else if (/[)%]$/.test(e)) e += '×';
  S.expr = e + (str[0] === '−' ? '(' + str + ')' : str);
}
function current() {
  if (!S.expr) return 0;
  try { return val(S.expr); } catch (e) { toast(e.message); return null; }
}
const A = {
  d(v) {
    fresh();
    const m = S.expr.match(/[\d.]*$/)[0];
    if (m.replace('.', '').length >= 15) return toast('Maximum 15 digits');
    if (m === '0') { if (v !== '0') S.expr = S.expr.slice(0, -1) + v; return; }
    if (/[)%]$/.test(S.expr)) S.expr += '×';
    S.expr += v;
  },
  dot() {
    fresh();
    const m = S.expr.match(/[\d.]*$/)[0];
    if (m.includes('.')) return;
    if (/[)%]$/.test(S.expr)) S.expr += '×';
    S.expr += m === '' ? '0.' : '.';
  },
  op(v) {
    keep(); const e = S.expr, last = e.slice(-1);
    if (!e) { S.expr = v === '−' ? '−' : '0' + v; return; }
    if (e === '−') return;
    if ('+−×÷^'.includes(last)) { if (e.slice(-2, -1) !== '(') S.expr = e.slice(0, -1) + v; return; }
    if (last === '(') { if (v === '−') S.expr += v; return; }
    S.expr += v;
  },
  pct() { if (/[\d)%]$/.test(S.expr)) { keep(); S.expr += '%'; } else toast('Enter a number before %'); },
  bs() { keep(); S.expr = S.expr.slice(0, -1); },
  ce() {
    if (S.done) { S.expr = ''; S.done = false; return; }
    const m = S.expr.match(NUM);
    S.expr = m ? S.expr.slice(0, m.index) : S.expr.slice(0, -1);
    if (S.expr.endsWith('(−')) S.expr = S.expr.slice(0, -2);
  },
  ac() { S.expr = ''; S.line = ''; S.done = false; S.repeat = ''; S.err = ''; },
  neg() {
    keep(); const e = S.expr; let m;
    if ((m = e.match(/\(−([\d.]+%?)$/))) S.expr = e.slice(0, m.index) + m[1];
    else if ((m = e.match(/^−([\d.]+%?)$/))) S.expr = m[1];
    else if ((m = e.match(NUM))) S.expr = e.slice(0, m.index) + '(−' + m[0];
    else S.expr += '(−';
  },
  eq() {
    if (S.done && S.repeat) {                       // repeated equals: reapply last operation
      const e = S.expr + S.repeat, r = fmt(evaluate(e));
      S.line = e + ' ='; addHistory(e, r); S.expr = r; return;
    }
    if (!S.expr) return toast('Nothing to calculate');
    if (S.done) return;
    const p = prepare(S.expr), r = fmt(evaluate(p));
    const t = p.match(/([+−×÷^])(\([^()]*\)|[\d.]+%?)$/);
    if (!/^[\d.]+$/.test(p)) { addHistory(p, r); S.line = p + ' ='; } else S.line = p + ' =';
    S.repeat = t && t.index > 0 ? t[0] : ''; S.expr = r; S.done = true;
  },
  sq() { if (/[\d)%]$/.test(S.expr)) { keep(); S.expr += '^2'; } else toast('Enter a number first'); },
  sqrt() {
    const e = S.expr, m = e.match(/[\d.]+$/);
    if (S.done) { keep(); S.expr = '√(' + e + ')'; }
    else if (m) S.expr = e.slice(0, m.index) + '√(' + m[0] + ')';
    else { keep(); S.expr += '√('; }
  },
  inv() {
    const e = S.expr, m = e.match(/(?:\(−|^−)?[\d.]+%?$/);
    if (!m) return toast('Enter a number first');
    keep(); const seg = m[0];
    S.expr = e.slice(0, m.index) + '(1÷' + seg + (seg[0] === '(' ? '))' : ')');
  },
  lp() { keep(); if (/[\d.)%]$/.test(S.expr)) S.expr += '×'; S.expr += '('; },
  rp() {
    const o = (S.expr.match(/\(/g) || []).length - (S.expr.match(/\)/g) || []).length;
    if (o > 0 && /[\d.)%]$/.test(S.expr)) { keep(); S.expr += ')'; } else toast('No bracket to close');
  },
  mc() { S.mem = 0; toast('Memory cleared'); },
  mr() { insertNumber(fmt(S.mem)); },
  mp() { const v = current(); if (v !== null) { S.mem = Number((S.mem + v).toPrecision(12)); toast('Added to memory'); } },
  mm() { const v = current(); if (v !== null) { S.mem = Number((S.mem - v).toPrecision(12)); toast('Subtracted from memory'); } },
  ms() { const v = current(); if (v !== null) { S.mem = v; toast('Stored in memory'); } },
  hexp(i) { const h = S.history[+i]; if (h) { S.expr = h.e; S.done = false; S.repeat = ''; } },
  hres(i) { const h = S.history[+i]; if (h) insertNumber(h.r); },
  hclear() { S.history = []; store.set('sc-history', '[]'); toast('History cleared'); },
  reset() { A.ac(); S.mem = 0; S.sci = false; toast('Calculator reset'); }
};
function run(act, v) {
  try { if (S.err) S.err = ''; A[act](v); }
  catch (e) { S.err = e.message; S.done = false; }
  render();
}
function view() {
  const seg = (S.expr.match(NUM) || [])[0];
  let pv = null;
  if (!S.err && !S.done && S.expr && !/^−?[\d.]+$/.test(S.expr)) { try { pv = fmt(val(S.expr)); } catch { /* incomplete */ } }
  return {
    line: S.err || (S.done ? S.line : S.expr),
    main: S.err ? 'Error' : S.done ? S.expr : (seg || pv || '0'),
    preview: pv ? '= ' + pv : ''
  };
}

if (typeof module !== 'undefined') module.exports = { S, run, view, evaluate, prepare, fmt };

/* ===== UI layer (browser only) ===== */
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  let timer;
  toast = m => { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(timer); timer = setTimeout(() => t.classList.remove('show'), 1600); };
  try { S.history = JSON.parse(store.get('sc-history') || '[]').slice(0, MAXH); } catch { S.history = []; }

  function setTheme(t) {
    document.documentElement.dataset.theme = t; $('themeBtn').textContent = t === 'dark' ? '☀' : '☾';
    store.set('sc-theme', t);
  }
  setTheme(store.get('sc-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

  render = () => {
    const v = view(), main = $('main'), ex = $('expr');
    ex.textContent = v.line; ex.classList.toggle('err', !!S.err); ex.scrollLeft = ex.scrollWidth;
    main.textContent = v.main; main.classList.toggle('err', !!S.err);
    main.className = 'main' + (S.err ? ' err' : '') + (v.main.length > 15 ? ' xs' : v.main.length > 10 ? ' sm' : '');
    $('preview').textContent = v.preview;
    $('statusText').textContent = S.err ? 'Error' : S.done ? 'Result' : S.expr ? 'Typing' : 'Ready';
    document.querySelector('.status').classList.toggle('err', !!S.err);
    $('memBadge').hidden = S.mem === 0;
    $('sci').hidden = !S.sci; $('modeBtn').setAttribute('aria-pressed', S.sci);
    const ul = $('hList'); ul.textContent = '';
    S.history.forEach((h, i) => {
      const li = document.createElement('li');
      [['hexp', 'he', h.e + ' ='], ['hres', 'hr', h.r]].forEach(([a, c, txt]) => {
        const b = document.createElement('button'); b.dataset.a = a; b.dataset.v = i; b.className = c; b.textContent = txt;
        b.setAttribute('aria-label', (a === 'hexp' ? 'Reuse expression ' : 'Use result ') + txt); li.appendChild(b);
      });
      ul.appendChild(li);
    });
  };

  function copy() {
    const v = view(); const txt = (S.done ? S.expr : v.preview ? v.preview.slice(2) : v.main).replace('−', '-');
    if (S.err || !S.expr) return toast('Nothing to copy');
    const ok = () => toast('Copied ' + txt);
    const fallback = () => {
      const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? ok() : toast('Copy failed'); } catch { toast('Copy failed'); }
      ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(ok, fallback); else fallback();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !b.dataset.a) return;
    const a = b.dataset.a, v = b.dataset.v;
    if (a === 'theme') setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    else if (a === 'mode') { S.sci = !S.sci; render(); }
    else if (a === 'hist') { const h = $('history').classList.toggle('open'); b.setAttribute('aria-expanded', h); }
    else if (a === 'copy') copy();
    else run(a, v);
  });

  const K = { '+': ['op', '+'], '-': ['op', '−'], '*': ['op', '×'], x: ['op', '×'], '/': ['op', '÷'], '^': ['op', '^'], '%': ['pct'],
    '.': ['dot'], ',': ['dot'], '(': ['lp'], ')': ['rp'], Enter: ['eq'], '=': ['eq'], Backspace: ['bs'], Escape: ['ac'], Delete: ['ce'] };
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (e.key.toLowerCase() === 'c' && !String(getSelection())) { e.preventDefault(); copy(); }
      return;
    }
    const m = /^\d$/.test(e.key) ? ['d', e.key] : K[e.key];
    if (!m) return;
    e.preventDefault();                       // stops Quick Find on "/", button re-activation on Enter, etc.
    if (e.repeat && m[0] === 'eq') return;
    run(m[0], m[1]);
    const sel = '[data-a="' + m[0] + '"]' + (m[1] ? '[data-v="' + m[1] + '"]' : '');
    const btn = document.querySelector(sel);
    if (btn) { btn.classList.add('press'); setTimeout(() => btn.classList.remove('press'), 120); }
  });
  render();
});
