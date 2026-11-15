'use strict';

/* ---------- Opslag. Fase 2 vervangt dit object door cloud-sync met dezelfde functies. ---------- */
// Mindmaps staan in IndexedDB (ruimte genoeg voor tientallen grote mindmaps); alleen kleine lijstjes staan in localStorage.
const idb = (() => {
  let dbp;
  const open = () => dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('mindmap', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('maps');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const t = db.transaction('maps', mode), q = fn(t.objectStore('maps'));
    t.oncomplete = () => res(q.result); t.onerror = t.onabort = () => rej(t.error);
  }));
  return { get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)) };
})();
let storeFull = false;   // opslag van de browser zit vol of is geblokkeerd
const store = (() => {
  const K = 'mm:', mem = {};
  const get = k => { try { const v = localStorage.getItem(k); if (v !== null) return v; } catch {} return mem[k] ?? null; };
  const set = (k, v) => { mem[k] = v; try { localStorage.setItem(k, v); } catch { storeFull = true; } };
  const del = k => { delete mem[k]; try { localStorage.removeItem(k); } catch {} };
  const idx = () => JSON.parse(get(K + 'index') || '[]');
  return {
    async list() { return idx().sort((a, b) => b.updated - a.updated); },
    async load(id) {   // nieuwste van beide plekken: localStorage bevat alleen een noodkopie (zie keep) of data van vóór IndexedDB
      let a = null, b = null;
      try { a = await idb.get(id) || null; } catch {}
      try { const s = get(K + 'map:' + id); b = s ? JSON.parse(s) : null; } catch {}
      if (b) {   // noodkopie opruimen of alsnog naar IndexedDB verhuizen
        if (a && a.updated >= b.updated) del(K + 'map:' + id);
        else idb.set(id, b).then(() => del(K + 'map:' + id)).catch(() => {});
      }
      return a && b ? (b.updated > a.updated ? b : a) : a || b;
    },
    keep(m) { try { localStorage.setItem(K + 'map:' + m.id, JSON.stringify(m)); } catch {} },   // direct, voor als de app net wordt gesloten
    // quiet = afkomstig van de cloud: niet opnieuw terugsturen
    async save(m, quiet) {
      try { await idb.set(m.id, JSON.parse(JSON.stringify(m))); del(K + 'map:' + m.id); } catch { set(K + 'map:' + m.id, JSON.stringify(m)); }
      const l = idx().filter(x => x.id !== m.id);
      l.unshift({ id: m.id, title: m.title, updated: m.updated });
      set(K + 'index', JSON.stringify(l));
      if (!quiet) cloud.kick();
    },
    async remove(id, quiet) {
      try { await idb.del(id); } catch {}
      del(K + 'map:' + id); set(K + 'index', JSON.stringify(idx().filter(x => x.id !== id)));
      if (!quiet) { const g = this.gone(); g[id] = Date.now(); this.setGone(g); cloud.kick(); }
    },
    gone() { return JSON.parse(get(K + 'gone') || '{}'); },   // lokaal verwijderd, nog door te geven aan de cloud
    setGone(g) { set(K + 'gone', JSON.stringify(g)); },
    getLast() { return get(K + 'last'); },
    setLast(id) { set(K + 'last', id); }
  };
})();

/* ---------- Toestand ---------- */
const $ = id => document.getElementById(id);
const canvas = $('canvas'), world = $('world'), edges = $('edges'), ghost = $('ghost');
const PALETTES = {
  kleurrijk: { root: '#2563eb', c: ['#e5484d', '#f08c1a', '#2f9e6b', '#3b82f6', '#8b5cf6', '#d6409f', '#0ea5a4', '#b7791f'] },
  oceaan: { root: '#0f4c81', c: ['#0e7490', '#2563eb', '#0d9488', '#4f46e5', '#0284c7', '#1d4ed8', '#047857', '#6366f1'] },
  aarde: { root: '#7c2d12', c: ['#b45309', '#4d7c0f', '#9f1239', '#a16207', '#15803d', '#c2410c', '#78716c', '#92400e'] },
  grijs: { root: '#1f2937', c: ['#475569', '#64748b', '#334155', '#6b7280', '#52525b', '#57534e', '#3f3f46', '#71717a'] }
};
let COLORS = PALETTES.kleurrijk.c;
// Thema hoort bij de mindmap (synct mee): stijl van de takken, vorm van de lijnen, kleurenschema.
const theme = () => { const t = map?.theme || {}; return { style: t.style || 'omlijnd', edge: t.edge || 'boog', pal: PALETTES[t.palette] || PALETTES.kleurrijk }; };
const pre = n => (n.icon ? n.icon + ' ' : '') + (n.task ? (n.task.gone ? '⚠ ' : n.task.done ? '☑ ' : '☐ ') : '');
const post = n => (n.note ? ' 🗒' : '') + (n.link ? ' 🔗' : '');
const setLook = v => { v && v !== 'auto' ? document.documentElement.dataset.theme = v : delete document.documentElement.dataset.theme; };
const getLook = () => { try { return localStorage.getItem('mm:look') || 'auto'; } catch { return 'auto'; } };
setLook(getLook());
const HG = 52, VG = 12;
let map = null, sel = null, editing = null, editOrig = '';
let view = { x: 0, y: 0, s: 1 };
let undo = [], redo = [], saveTimer = 0;
const els = new Map(), geo = new Map();
let info = new Map();
let uidN = 0;
const uid = () => Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- Model ---------- */
function index() {
  info = new Map();
  (function walk(n, parent, depth, side, color, visible) {
    info.set(n.id, { node: n, parent, depth, side, color, visible });
    for (const c of n.children)
      walk(c, n, depth + 1, depth ? side : (c.side || 'right'), c.color ?? (depth ? color : 0), visible && (!n.collapsed || !depth));
  })(map.root, null, 0, null, 0, true);
}
function touch() {
  map.updated = Date.now();
  map.title = map.root.text.trim() || 'Naamloos';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}
function flush() { clearTimeout(saveTimer); saveTimer = 0; if (map) { store.keep(map); store.save(map); } }
function snap() { undo.push(JSON.stringify(map.root)); if (undo.length > 100) undo.shift(); redo = []; }
function change(fn) { snap(); fn(); touch(); render(); }
function timeTravel(from, to) {
  if (!from.length) return;
  commitEdit();
  to.push(JSON.stringify(map.root));
  map.root = JSON.parse(from.pop());
  index();
  if (!info.has(sel)) sel = map.root.id;
  touch(); render();
}
const nextColor = () => map.root.children.reduce((m, c) => Math.max(m, (c.color || 0) + 1), 0);
const isInside = (id, ancestorId) => { for (let i = info.get(id); i; i = i.parent && info.get(i.parent.id)) if (i.node.id === ancestorId) return true; return false; };

/* ---------- Tekenen ---------- */
function mkEl(id) {
  const el = document.createElement('div');
  el.dataset.id = id;
  el.innerHTML = '<span class="txt"></span><button class="tog" tabindex="-1"></button>';
  world.appendChild(el); els.set(id, el);
  return el;
}
const countAll = n => n.children.reduce((a, c) => a + 1 + countAll(c), 0);

function render() {
  index();
  const th = theme(); COLORS = th.pal.c; world.dataset.style = th.style; world.style.setProperty('--rootc', th.pal.root);
  for (const [id, i] of info) {
    if (!i.visible) continue;
    const el = els.get(id) || mkEl(id), n = i.node;
    el.className = 'node ' + (i.depth ? i.side : 'root') + ' d' + Math.min(i.depth, 2) + (id === sel ? ' sel' : '')
      + (n.task ? ' task' + (n.task.gone ? ' gone' : n.task.done ? ' done' : '') : '');
    if (n.task?.due && !n.task.done && !n.task.gone) el.dataset.due = fmtDue(n.task.due); else delete el.dataset.due;
    if (i.depth) el.style.setProperty('--c', COLORS[i.color % COLORS.length]);
    const txt = el.firstChild, tog = el.lastChild, a = pre(n), z = post(n);
    if (a) txt.dataset.pre = a; else delete txt.dataset.pre;
    if (z) txt.dataset.post = z; else delete txt.dataset.post;
    if (id !== editing && txt.textContent !== n.text) txt.textContent = n.text;
    tog.hidden = !i.depth || !n.children.length;
    tog.textContent = n.collapsed ? countAll(n) : '−';
    tog.title = n.collapsed ? 'Uitklappen' : 'Inklappen';
  }
  for (const [id, el] of els) if (!info.get(id)?.visible) { el.remove(); els.delete(id); }
  layout(); ui();
}

// Boomindeling: midden op (0,0), takken links en rechts. size(node) geeft {w,h}; ook gebruikt voor de miniaturen in het overzicht.
function arrange(root, size, hg, vg) {
  const out = new Map(), sh = new Map(), kids = n => (n.collapsed && n !== root ? [] : n.children);
  const G = n => { let g = out.get(n.id); if (!g) out.set(n.id, g = { ...size(n) }); return g; };
  const H = n => { if (!sh.has(n.id)) sh.set(n.id, Math.max(G(n).h, stackH(kids(n)))); return sh.get(n.id); };
  const stackH = l => l.reduce((a, c) => a + H(c), 0) + vg * Math.max(0, l.length - 1);
  const stack = (l, x, cy, dir) => { let y = cy - stackH(l) / 2; for (const c of l) { const h = H(c); place(c, x, y + h / 2, dir); y += h + vg; } };
  const place = (n, x, cy, dir) => {
    const g = G(n);
    g.x = dir > 0 ? x : x - g.w; g.y = cy - g.h / 2; g.dir = dir;
    stack(kids(n), dir > 0 ? x + g.w + hg : x - g.w - hg, cy, dir);
  };
  const g = G(root);
  g.x = -g.w / 2; g.y = -g.h / 2; g.dir = 0;
  stack(root.children.filter(c => c.side !== 'left'), g.w / 2 + hg, 0, 1);
  stack(root.children.filter(c => c.side === 'left'), -g.w / 2 - hg, 0, -1);
  return out;
}
function edgePath(x1, y1, x2, y2, kind) {
  const mx = (x1 + x2) / 2;
  return kind === 'recht' ? `M${x1} ${y1}L${x2} ${y2}` : kind === 'haaks' ? `M${x1} ${y1}H${mx}V${y2}H${x2}` : `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
}
const edgeEnds = (p, q) => [p.dir > 0 ? q.x + q.w : q.x, q.y + q.h / 2, p.dir > 0 ? p.x : p.x + p.w, p.y + p.h / 2];

function layout() {
  geo.clear();
  for (const [k, v] of arrange(map.root, n => { const el = els.get(n.id); return { w: el.offsetWidth, h: el.offsetHeight }; }, HG, VG)) geo.set(k, v);
  const kind = theme().edge;
  let d = '';
  for (const [id, el] of els) {
    const p = geo.get(id), i = info.get(id);
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    if (i.parent) d += `<path d="${edgePath(...edgeEnds(p, geo.get(i.parent.id)), kind)}" stroke="${COLORS[i.color % COLORS.length]}"/>`;
  }
  edges.innerHTML = d;
  // De SVG krijgt de echte afmetingen van de mindmap; Safari laat anders sporen achter bij het schuiven.
  let a = 0, b = 0, c = 0, e = 0;
  for (const q of geo.values()) { a = Math.min(a, q.x); b = Math.min(b, q.y); c = Math.max(c, q.x + q.w); e = Math.max(e, q.y + q.h); }
  a -= 8; b -= 8; const w = c - a + 8, h = e - b + 8;
  edges.setAttribute('viewBox', `${a} ${b} ${w} ${h}`);
  Object.assign(edges.style, { left: a + 'px', top: b + 'px', width: w + 'px', height: h + 'px' });
  applyView();
}
function applyView() { world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.s})`; }

function ui() {
  $('title').textContent = map.title;
  document.title = map.title + ' · Mindmap';
  const i = sel && info.get(sel);
  $('tChild').disabled = $('tEdit').disabled = $('tTask').disabled = !i;
  const n = i && i.node;
  $('peek').hidden = !(n && (n.note || n.link));
  $('peekLink').hidden = !(n && n.link); $('peekNote').textContent = n && n.note || '';
  if (n && n.link) { $('peekLink').href = n.link; $('peekLink').textContent = '🔗 ' + n.link.replace(/^https?:\/\//, '').slice(0, 40); }
  $('tSib').disabled = $('tDel').disabled = !i || !i.parent;
  $('tFold').disabled = !i || !i.parent || !i.node.children.length;
  $('bUndo').disabled = !undo.length; $('bRedo').disabled = !redo.length;
}

/* ---------- Beeld ---------- */
function zoomAt(cx, cy, f) {
  const r = canvas.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
  const ns = clamp(view.s * f, 0.15, 3); f = ns / view.s;
  view.x = px - (px - view.x) * f; view.y = py - (py - view.y) * f; view.s = ns;
  applyView();
}
function zoomCenter(f) { const r = canvas.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); }
function fit() {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const g of geo.values()) { a = Math.min(a, g.x); b = Math.min(b, g.y); c = Math.max(c, g.x + g.w); d = Math.max(d, g.y + g.h); }
  const W = canvas.clientWidth, Hh = canvas.clientHeight;
  view.s = clamp(Math.min((W - 80) / (c - a), (Hh - 60) / (d - b)), 0.15, 1);
  view.x = W / 2 - (a + c) / 2 * view.s; view.y = Hh / 2 - (b + d) / 2 * view.s;
  applyView();
}
function ensureVisible(id) {
  const g = geo.get(id); if (!g) return;
  const W = canvas.clientWidth, Hh = canvas.clientHeight, m = 24;
  const l = view.x + g.x * view.s, t = view.y + g.y * view.s, r = l + g.w * view.s, b = t + g.h * view.s;
  if (l < m) view.x += m - l; else if (r > W - m) view.x -= r - (W - m);
  if (t < m) view.y += m - t; else if (b > Hh - m) view.y -= b - (Hh - m);
  applyView();
}
function select(id) { if (sel === id) return; sel = id; render(); if (id) ensureVisible(id); }

/* ---------- Bewerken ---------- */
function startEdit(id, all = true) {
  commitEdit();
  sel = id; render(); ensureVisible(id);
  const t = els.get(id).firstChild;
  editing = id; editOrig = info.get(id).node.text;
  t.contentEditable = 'true';
  try { t.contentEditable = 'plaintext-only'; } catch {}
  t.focus();
  const r = document.createRange(); r.selectNodeContents(t); if (!all) r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function commitEdit(cancel) {
  if (!editing) return;
  const id = editing, t = els.get(id)?.firstChild, n = info.get(id)?.node;
  editing = null;
  if (t && n) {
    const v = cancel ? editOrig : t.innerText.replace(/ /g, ' ').trim();
    t.contentEditable = 'false'; t.blur();
    if (v !== n.text) { snap(); n.text = v; touch(); }
    t.textContent = n.text;
  }
  render();
}
world.addEventListener('focusout', e => { if (editing && e.target.closest?.('.node')?.dataset.id === editing) commitEdit(); });
world.addEventListener('input', () => { if (editing) layout(); });

function addChild(pid = sel || map.root.id) {
  commitEdit();
  const p = info.get(pid).node, c = { id: uid(), text: '', children: [] };
  if (p === map.root) {
    const left = p.children.filter(x => x.side === 'left').length;
    c.side = left < p.children.length - left ? 'left' : 'right'; c.color = nextColor();
  }
  change(() => { p.collapsed = false; p.children.push(c); });
  startEdit(c.id);
}
function addSibling() {
  commitEdit();
  const i = sel && info.get(sel);
  if (!i) return;
  if (!i.parent) return addChild(sel);
  const c = { id: uid(), text: '', children: [] }, arr = i.parent.children;
  if (i.parent === map.root) { c.side = i.node.side || 'right'; c.color = nextColor(); }
  change(() => arr.splice(arr.indexOf(i.node) + 1, 0, c));
  startEdit(c.id);
}
function removeSel() {
  commitEdit();
  const i = sel && info.get(sel);
  if (!i?.parent) return;
  const arr = i.parent.children, k = arr.indexOf(i.node);
  change(() => { arr.splice(k, 1); sel = (arr[k] || arr[k - 1] || i.parent).id; });
}
function toggle(id = sel) {
  commitEdit();
  const i = id && info.get(id);
  if (!i?.parent || !i.node.children.length) return;
  change(() => { i.node.collapsed = !i.node.collapsed; if (sel && sel !== id && isInside(sel, id)) sel = id; });
}
function moveNode(id, targetId, mode, side) {
  const a = info.get(id), t = info.get(targetId);
  change(() => {
    a.parent.children.splice(a.parent.children.indexOf(a.node), 1);
    let home = t.node;
    if (mode === 'into') { home.children.push(a.node); home.collapsed = false; }
    else { home = t.parent; home.children.splice(home.children.indexOf(t.node) + (mode === 'after' ? 1 : 0), 0, a.node); side = t.node.side || 'right'; }
    if (home === map.root) { a.node.side = side; if (a.node.color == null) a.node.color = nextColor(); }
    sel = id;
  });
}

/* ---------- Muis, pen en touch ---------- */
const pts = new Map();
let g = null, lastTap = { id: null, t: 0 };

canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const nodeEl = e.target.closest('.node');
  if (editing) { if (nodeEl?.dataset.id === editing) return; commitEdit(); }
  if (e.target.closest('.tog')) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (pts.size === 2) { endDrag(); world.classList.add('moving'); g = { type: 'pinch', ...pinchState() }; return; }
  if (pts.size > 2) return;
  const id = nodeEl?.dataset.id;
  if (id) { select(id); g = { type: 'node', id, x0: e.clientX, y0: e.clientY, moved: false }; }
  else g = { type: 'pan', x0: e.clientX, y0: e.clientY, vx: view.x, vy: view.y, moved: false };
});

function pinchState() {
  const [a, b] = [...pts.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
}

canvas.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId) || !g) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
  if (g.type === 'pinch' && pts.size >= 2) {
    const p = pinchState();
    view.x += p.cx - g.cx; view.y += p.cy - g.cy;
    zoomAt(p.cx, p.cy, p.d / g.d);
    Object.assign(g, p);
  } else if (g.type === 'pan') {
    if (!g.moved && Math.hypot(dx, dy) < 5) return;
    if (!g.moved) world.classList.add('moving');
    g.moved = true; view.x = g.vx + dx; view.y = g.vy + dy; applyView();
  } else if (g.type === 'node') {
    if (!g.moved) {
      if (Math.hypot(dx, dy) < 8 || g.id === map.root.id) return;
      g.moved = true;
      els.get(g.id).classList.add('dragging');
      ghost.textContent = info.get(g.id).node.text || '…'; ghost.hidden = false;
    }
    ghost.style.left = e.clientX + 14 + 'px'; ghost.style.top = e.clientY + 14 + 'px';
    setDrop(e.clientX, e.clientY);
  }
});

function setDrop(x, y) {
  g.dropEl?.classList.remove('drop-into', 'drop-before', 'drop-after');
  g.drop = g.dropEl = null;
  const el = document.elementFromPoint(x, y)?.closest('.node');
  if (!el || isInside(el.dataset.id, g.id)) return;
  const r = el.getBoundingClientRect(), id = el.dataset.id;
  let mode = 'into', side;
  if (id === map.root.id) side = x < r.left + r.width / 2 ? 'left' : 'right';
  else { const f = (y - r.top) / r.height; if (f < 0.3) mode = 'before'; else if (f > 0.7) mode = 'after'; side = info.get(id).side; }
  g.drop = { id, mode, side }; g.dropEl = el;
  el.classList.add('drop-' + mode);
}
function endDrag() {
  ghost.hidden = true;
  if (g?.type === 'node' && g.moved) { els.get(g.id)?.classList.remove('dragging'); g.dropEl?.classList.remove('drop-into', 'drop-before', 'drop-after'); }
}

function pointerEnd(e, cancelled) {
  if (!pts.delete(e.pointerId)) return;
  if (!pts.size) world.classList.remove('moving');
  const was = g;
  if (!was) return;
  if (was.type === 'pinch') { if (pts.size < 2) g = null; return; }
  endDrag(); g = null;
  if (cancelled) return;
  if (was.type === 'pan') { if (!was.moved) select(null); return; }
  if (was.moved) { if (was.drop) moveNode(was.id, was.drop.id, was.drop.mode, was.drop.side); return; }
  const now = Date.now();
  if (lastTap.id === was.id && now - lastTap.t < 400) { lastTap.id = null; startEdit(was.id, false); }
  else lastTap = { id: was.id, t: now };
}
canvas.addEventListener('pointerup', e => pointerEnd(e, false));
canvas.addEventListener('pointercancel', e => pointerEnd(e, true));
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });
world.addEventListener('click', e => { const t = e.target.closest('.tog'); if (t) toggle(t.parentNode.dataset.id); });

/* ---------- Toetsenbord ---------- */
function nav(key) {
  const i = info.get(sel), n = i.node, root = map.root;
  const horiz = key === 'ArrowLeft' || key === 'ArrowRight';
  if (n === root) {
    if (!horiz) return;
    const c = root.children.find(c => (c.side === 'left') === (key === 'ArrowLeft'));
    return c && select(c.id);
  }
  if (horiz) {
    const outward = (i.side === 'left') === (key === 'ArrowLeft');
    if (!outward) return select(i.parent.id);
    if (!n.children.length) return;
    return n.collapsed ? toggle(sel) : select(n.children[0].id);
  }
  const sibs = i.parent === root ? root.children.filter(c => (c.side === 'left') === (i.side === 'left')) : i.parent.children;
  const s = sibs[sibs.indexOf(n) + (key === 'ArrowUp' ? -1 : 1)];
  if (s) select(s.id);
}

document.addEventListener('keydown', e => {
  if (!map || isHome() || $('drawer').classList.contains('open') || !$('dlg').hidden || !$('fmt').hidden || e.target.matches('input,select,textarea')) { if (e.key === 'Escape') { closeDrawer(); todoist.close(); format.close(); } return; }
  if (editing) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
    else if (e.key === 'Escape') { e.preventDefault(); commitEdit(true); }
    else if (e.key === 'Tab') { e.preventDefault(); const id = editing; commitEdit(); addChild(id); }
    return;
  }
  const mod = e.ctrlKey || e.metaKey, k = e.key;
  if (mod && k.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? timeTravel(redo, undo) : timeTravel(undo, redo); }
  if (mod && k.toLowerCase() === 'y') { e.preventDefault(); return timeTravel(redo, undo); }
  if (mod || e.altKey) return;
  if (!sel) { if (k.startsWith('Arrow') || k === 'Tab') { e.preventDefault(); select(map.root.id); } return; }
  if (k === 'Tab' || k === 'Insert') { e.preventDefault(); addChild(); }
  else if (k === 'Enter') { e.preventDefault(); addSibling(); }
  else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeSel(); }
  else if (k === 'F2') { e.preventDefault(); startEdit(sel, false); }
  else if (k === ' ') { e.preventDefault(); toggle(); }
  else if (k.startsWith('Arrow')) { e.preventDefault(); nav(k); }
  else if (k.length === 1) startEdit(sel, true);
});

/* ---------- Knoppen ---------- */
$('tChild').onclick = () => addChild();
$('tSib').onclick = addSibling;
$('tEdit').onclick = () => sel && startEdit(sel, false);
$('tFold').onclick = () => toggle();
$('tDel').onclick = removeSel;
$('bUndo').onclick = () => timeTravel(undo, redo);
$('bRedo').onclick = () => timeTravel(redo, undo);
$('bIn').onclick = () => zoomCenter(1.25);
$('bOut').onclick = () => zoomCenter(0.8);
$('bFit').onclick = fit;

/* ---------- Mindmaps beheren ---------- */
async function openMap(m) {
  commitEdit(); flush();
  map = m; undo = []; redo = []; sel = m.root.id;
  for (const el of els.values()) el.remove();
  els.clear();
  store.setLast(m.id);
  document.body.classList.remove('home');
  if (location.hash !== '#m=' + m.id) history.pushState(null, '', '#m=' + m.id);
  render(); fit();
  todoist.refresh();
}
const FRESH = 'Nieuwe mindmap';
const pristine = m => !m.root.children.length && m.root.text === FRESH;
function replaceMap(m) {   // nieuwere versie van de open mindmap kwam binnen vanaf een ander apparaat
  map = m; undo = []; redo = [];
  index(); if (!info.has(sel)) sel = null;
  render();
}
function newMap() {
  const text = FRESH;
  const m = { id: uid(), title: text, updated: Date.now(), root: { id: uid(), text, children: [] } };
  store.save(m);
  return openMap(m);
}
/* ---------- Overzicht: alle mindmaps als kaarten ---------- */
const isHome = () => document.body.classList.contains('home');
const when = ts => new Date(ts).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function miniSvg(m) {
  const pal = PALETTES[m.theme?.palette] || PALETTES.kleurrijk;
  const g = arrange(m.root, n => ({ w: clamp(n.text.length * 4 + 12, 20, 90), h: 12 }), 18, 5);
  let a = 0, b = 0, c = 0, d = 0, lines = '', boxes = '';
  for (const q of g.values()) { a = Math.min(a, q.x); b = Math.min(b, q.y); c = Math.max(c, q.x + q.w); d = Math.max(d, q.y + q.h); }
  (function walk(n, parent, color) {
    const p = g.get(n.id); if (!p) return;
    const col = parent ? pal.c[color % pal.c.length] : pal.root;
    if (parent) lines += `<path d="${edgePath(...edgeEnds(p, g.get(parent.id)))}" stroke="${col}"/>`;
    boxes += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="4" fill="${col}"${parent ? ' opacity=".75"' : ''}/>`;
    for (const k of n.children) walk(k, n, k.color ?? (parent ? color : 0));
  })(m.root, null, 0);
  return `<svg viewBox="${a - 4} ${b - 4} ${c - a + 8} ${d - b + 8}"><g fill="none" stroke-width="1.5">${lines}</g>${boxes}</svg>`;
}
async function drawList() {
  const grid = $('pGrid'), q = $('pSearch').value.trim().toLowerCase(), cards = [];
  const add = document.createElement('button');
  add.className = 'card new'; add.textContent = '+ Nieuwe mindmap'; add.onclick = newMap; cards.push(add);
  for (const it of await store.list()) {
    if (q && !it.title.toLowerCase().includes(q)) continue;
    const m = await store.load(it.id); if (!m) continue;
    const card = document.createElement('article'), n = countAll(m.root);
    card.className = 'card'; card.tabIndex = 0;
    card.innerHTML = `<div class="thumb">${miniSvg(m)}</div><h3></h3><p></p><button class="del" title="Verwijderen">✕</button>`;
    card.querySelector('h3').textContent = m.title;
    card.querySelector('p').textContent = `${n} ${n === 1 ? 'tak' : 'takken'} · ${when(m.updated)}`;
    const go = async () => openMap(await store.load(it.id) || m), del = card.querySelector('.del');
    card.onclick = e => { if (!e.target.closest('.del')) go(); };
    card.onkeydown = e => { if (e.key === 'Enter' && e.target === card) go(); };
    del.onclick = async () => {
      if (del.textContent === '✕') { del.textContent = 'Zeker?'; return; }
      await store.remove(it.id);
      if (map?.id === it.id) { clearTimeout(saveTimer); saveTimer = 0; map = null; }
      drawList();
    };
    cards.push(card);
  }
  grid.replaceChildren(...cards);
}
/* ---------- Importeren: MindMeister-export (FreeMind .mm, los of in een zip) of een eigen back-up (.json) ---------- */
const FM_ICONS = { button_ok: '✅', button_cancel: '⛔', stop: '⛔', bookmark: '⭐', help: '❓', idea: '💡', messagebox_warning: '❗', yes: '❗',
  calendar: '📅', attach: '📎', flag: '📌', group: '👥', male1: '👤', female1: '👤', launch: '🚀', info: '💬', pencil: '💬' };
function htmlToText(h) {
  const d = new DOMParser().parseFromString(h, 'text/html');
  d.querySelectorAll('br,p,div,li').forEach(e => e.append('\n'));
  return d.body.textContent.replace(/\n{3,}/g, '\n\n').trim();
}
function parseFreemind(xml) {
  // Notities bevatten HTML die geen geldige XML is: eerst apart zetten, dan de rest als XML lezen.
  const rich = [];
  xml = xml.replace(/<richcontent\b[^>]*TYPE="(\w+)"[^>]*>([\s\S]*?)<\/richcontent>/g, (_, type, body) => `<rc t="${type}" i="${rich.push(body) - 1}"/>`);
  const doc = new DOMParser().parseFromString(xml, 'text/xml'), top = doc.querySelector('map > node');
  if (!top || doc.querySelector('parsererror')) throw new Error('geen FreeMind-bestand');
  let count = 0, branch = 0;
  const conv = (el, depth) => {
    count++;
    const n = { id: uid(), text: el.getAttribute('TEXT') || '', children: [] }, kids = [...el.children];
    const icon = kids.map(k => k.tagName === 'icon' && FM_ICONS[k.getAttribute('BUILTIN')]).find(Boolean), link = el.getAttribute('LINK') || '';
    if (icon) n.icon = icon;
    if (/^https?:\/\//i.test(link) && !/mindmeister\.com\/assets/i.test(link)) n.link = link;
    for (const k of kids) if (k.tagName === 'rc') {
      let t = htmlToText(rich[k.getAttribute('i')]);
      if (/<\w+[^>]*>/.test(t)) t = htmlToText(t);
      if (k.getAttribute('t') === 'NOTE') { if (t) n.note = t; } else if (!n.text) n.text = t;
    }
    if (el.getAttribute('FOLDED') === 'true') n.collapsed = true;
    if (depth === 1) { n.side = el.getAttribute('POSITION') === 'left' ? 'left' : 'right'; n.color = branch++; }
    n.children = kids.filter(k => k.tagName === 'node').map(k => conv(k, depth + 1));
    return n;
  };
  const root = conv(top, 0);
  // Grote mindmap: alles vanaf het derde niveau ingeklapt, anders is hij niet te overzien
  if (count > 150) (function fold(n, d) { for (const c of n.children) { if (d >= 1 && c.children.length) c.collapsed = true; fold(c, d + 1); } })(root, 0);
  return root;
}
async function unzip(buf, want) {
  const v = new DataView(buf), u8 = new Uint8Array(buf), out = [];
  let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('geen zip');
  let p = v.getUint32(e + 16, true);
  for (let i = v.getUint16(e + 10, true); i > 0; i--) {
    const method = v.getUint16(p + 10, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true);
    let size = v.getUint32(p + 20, true), off = v.getUint32(p + 42, true);
    for (let q = p + 46 + nl; q < p + 46 + nl + xl; q += 4 + v.getUint16(q + 2, true)) if (v.getUint16(q, true) === 1) {   // zip64: echte groottes staan in een extra veld
      let r = q + 4; if (v.getUint32(p + 24, true) === 0xFFFFFFFF) r += 8;
      if (size === 0xFFFFFFFF) { size = Number(v.getBigUint64(r, true)); r += 8; }
      if (off === 0xFFFFFFFF) off = Number(v.getBigUint64(r, true));
    }
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    if (want(name)) {
      const at = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), raw = u8.subarray(at, at + size);
      const bytes = method === 0 ? raw : await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
      out.push({ name, text: new TextDecoder().decode(bytes) });
    }
    p += 46 + nl + xl + v.getUint16(p + 32, true);
  }
  return out;
}
async function importFiles(files) {
  let ok = 0; const bad = [];
  $('pMsg').textContent = 'Importeren…';
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer(), zipped = buf.byteLength > 4 && new DataView(buf).getUint32(0, true) === 0x04034b50;
      const docs = zipped ? await unzip(buf, n => /\.mm$/i.test(n)) : [{ text: new TextDecoder().decode(buf) }];
      if (!docs.length) throw new Error('geen mindmap in zip');
      for (const d of docs) {
        let m;
        if (/^\s*\{/.test(d.text)) { m = JSON.parse(d.text); if (!m.root?.id || !Array.isArray(m.root.children)) throw new Error('geen back-up'); }
        else m = { root: parseFreemind(d.text) };
        m.id = uid(); m.title = m.root.text.trim() || 'Naamloos'; m.updated = Date.now();
        await store.save(m); ok++;
      }
    } catch (e) { console.warn('import', f.name, e); bad.push(f.name); }
  }
  $('pMsg').textContent = `${ok} ${ok === 1 ? 'mindmap' : 'mindmaps'} geïmporteerd.` + (bad.length ? ' Niet gelukt: ' + bad.join(', ') + '.' : '')
    + (storeFull ? ' Let op: de opslag van dit apparaat is vol; niet alles is bewaard.' : '');
  drawList();
}
$('pImp').onclick = () => $('pFile').click();
$('pFile').onchange = e => { const l = [...e.target.files]; e.target.value = ''; if (l.length) importFiles(l); };

function showPortal() {
  commitEdit(); flush();
  document.body.classList.add('home'); document.title = 'Mijn mindmaps';
  if (location.hash) history.pushState(null, '', location.pathname + location.search);
  drawList();
}
async function route() {   // adres bepaalt wat je ziet: #m=<id> is een mindmap, anders het overzicht
  const id = new URLSearchParams(location.hash.slice(1)).get('m');
  if (!id) return showPortal();
  if (map?.id === id && !isHome()) return;
  const m = await store.load(id);
  m ? openMap(m) : showPortal();
}
addEventListener('popstate', route);
$('bHome').onclick = showPortal;
$('pAcct').onclick = () => openDrawer();
$('pSearch').oninput = drawList;
$('lLook').value = getLook();
$('lLook').onchange = e => { try { localStorage.setItem('mm:look', e.target.value); } catch {} setLook(e.target.value); };

function openDrawer() { commitEdit(); flush(); $('drawer').classList.add('open'); $('shade').hidden = false; }
function closeDrawer() { $('drawer').classList.remove('open'); $('shade').hidden = true; }
$('bMenu').onclick = openDrawer;
$('shade').onclick = () => { closeDrawer(); todoist.close(); format.close(); };
$('dExport').onclick = () => deliver(new Blob([JSON.stringify(map, null, 1)], { type: 'application/json' }), fileBase() + '.mindmap.json');

/* ---------- Exporteren: afbeelding (PNG), PDF en tekst (Markdown). Altijd licht thema; ingeklapte takken blijven ingeklapt in beeld. ---------- */
const fileBase = () => map.title.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim() || 'mindmap';
async function deliver(blob, name) {   // touch-apparaten: deelmenu (Bestanden, Mail…); anders gewoon downloaden
  const f = new File([blob], name, { type: blob.type });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function textLines(el) {   // de regels zoals de browser ze heeft afgebroken
  const t = el.firstChild.firstChild; if (!t) return [''];
  const s = t.data, r = document.createRange(), out = []; let cur = '', top = null;
  for (let i = 0; i < s.length; i++) {
    r.setStart(t, i); r.setEnd(t, i + 1);
    const b = r.getClientRects()[0];
    if (s[i] === '\n') { out.push(cur); cur = ''; top = null; continue; }
    if (b && b.width && top !== null && b.top > top + 3) { out.push(cur.trimEnd()); cur = ''; }
    if (b && b.width) top = b.top;
    cur += s[i];
  }
  out.push(cur);
  return out;
}
function drawCanvas() {
  commitEdit();
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const g of geo.values()) { a = Math.min(a, g.x); b = Math.min(b, g.y); c = Math.max(c, g.x + g.w); d = Math.max(d, g.y + g.h); }
  const M = 24, W = c - a + 2 * M, H = d - b + 2 * M, k = Math.min(2, Math.sqrt(12e6 / (W * H))), th = theme();
  const cv = document.createElement('canvas'); cv.width = Math.ceil(W * k); cv.height = Math.ceil(H * k);
  const x = cv.getContext('2d'), FONT = 'px system-ui, -apple-system, "Segoe UI", sans-serif';
  x.scale(k, k); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.translate(M - a, M - b);
  x.lineCap = x.lineJoin = 'round'; x.textBaseline = 'middle';
  for (const [id, p] of geo) {
    const i = info.get(id); if (!i.parent) continue;
    x.lineWidth = 2; x.strokeStyle = COLORS[i.color % COLORS.length];
    x.stroke(new Path2D(edgePath(...edgeEnds(p, geo.get(i.parent.id)), th.edge)));
  }
  for (const [id, el] of els) {
    const g = geo.get(id), i = info.get(id), n = i.node, t = n.task, cs = getComputedStyle(el), col = COLORS[i.color % COLORS.length];
    const bw = parseFloat(cs.borderTopWidth), fs = parseFloat(cs.fontSize), lh = fs * 1.35, done = t && t.done && !t.gone;
    let ink = '#1c2330';
    x.beginPath(); x.roundRect(g.x + bw / 2, g.y + bw / 2, g.w - bw, g.h - bw, parseFloat(cs.borderTopLeftRadius));
    x.lineWidth = bw;
    if (!i.depth) { x.fillStyle = x.strokeStyle = th.pal.root; x.fill(); x.stroke(); ink = '#fff'; }
    else if (th.style === 'minimaal' && i.depth > 1) { /* alleen tekst */ }
    else {
      x.fillStyle = '#fff'; x.fill(); x.strokeStyle = col;
      if (th.style === 'gevuld') { x.fillStyle = col; x.globalAlpha = i.depth === 1 ? 1 : 0.18; x.fill(); if (i.depth === 1) ink = '#fff'; }
      x.globalAlpha = i.depth > 1 ? 0.55 : 1; x.stroke();
    }
    x.globalAlpha = done ? 0.6 : 1;
    x.font = cs.fontWeight + ' ' + fs + FONT; x.fillStyle = ink;
    const L = textLines(el), px = g.x + bw + parseFloat(cs.paddingLeft), py = g.y + bw + parseFloat(cs.paddingTop);
    L[0] = pre(n) + L[0]; L[L.length - 1] += post(n);
    L.forEach((s, j) => { const y = py + (j + 0.5) * lh; x.fillText(s, px, y); if (done) x.fillRect(px, y, x.measureText(s).width, 1); });
    x.globalAlpha = 1;
    if (el.dataset.due) { x.font = '400 11' + FONT; x.fillStyle = '#667085'; x.fillText(el.dataset.due, px, py + L.length * lh + 7.5); }
  }
  return cv;
}
function canvasBytes(cv, type) {
  const bin = atob(cv.toDataURL(type, 0.92).split(',')[1]), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function makePdf(cv) {   // één A4-pagina (liggend of staand) met de mindmap als afbeelding
  const jpeg = canvasBytes(cv, 'image/jpeg'), land = cv.width >= cv.height, PW = land ? 842 : 595, PH = land ? 595 : 842, m = 28;
  const f = Math.min((PW - 2 * m) / cv.width, (PH - 2 * m) / cv.height, 0.6), w = cv.width * f, h = cv.height * f;
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const add = p => { const u = typeof p === 'string' ? enc.encode(p) : p; parts.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; add(`${n} 0 obj\n${body}\nendobj\n`); };
  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offs[4] = len;
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  add(jpeg); add('\nendstream\nendobj\n');
  const c = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${((PW - w) / 2).toFixed(2)} ${((PH - h) / 2).toFixed(2)} cm /Im0 Do Q`;
  obj(5, `<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
  const xref = len;
  add('xref\n0 6\n0000000000 65535 f \n' + [1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join(''));
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
function outline() {
  let s = '# ' + map.title + '\n\n';
  const flat = v => v.replace(/\s*\n\s*/g, ' ');
  const label = c => (c.icon ? c.icon + ' ' : '') + (c.link ? '[' + flat(c.text) + '](' + c.link + ')' : flat(c.text));
  (function walk(n, depth) {
    for (const c of n.children) {
      const t = c.task && !c.task.gone ? c.task : null;
      s += '  '.repeat(depth) + '- ' + (t ? (t.done ? '[x] ' : '[ ] ') : '') + label(c)
        + (t?.due && !t.done ? ' (deadline ' + fmtDue(t.due) + ')' : '') + '\n';
      if (c.note) s += '  '.repeat(depth + 1) + '> ' + flat(c.note) + '\n';
      walk(c, depth + 1);
    }
  })(map.root, 0);
  return s;
}
$('xPng').onclick = () => { closeDrawer(); deliver(new Blob([canvasBytes(drawCanvas(), 'image/png')], { type: 'image/png' }), fileBase() + '.png'); };
$('xPdf').onclick = () => { closeDrawer(); deliver(makePdf(drawCanvas()), fileBase() + '.pdf'); };
$('xMd').onclick = () => { closeDrawer(); deliver(new Blob([outline()], { type: 'text/markdown' }), fileBase() + '.md'); };
$('xCopy').onclick = async () => {
  let ok = true; try { await navigator.clipboard.writeText(outline()); } catch { ok = false; }
  $('xCopy').textContent = ok ? 'Gekopieerd' : 'Kopiëren lukt niet'; setTimeout(() => $('xCopy').textContent = 'Kopieer tekst', 2000);
};
$('dImport').onclick = () => $('dFile').click();
$('dFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const m = JSON.parse(await f.text());
    if (!m.root?.id || !Array.isArray(m.root.children)) throw 0;
    m.id = uid(); m.title = m.root.text || 'Naamloos'; m.updated = Date.now();
    await store.save(m); closeDrawer(); openMap(m);
  } catch { $('dImport').textContent = 'Geen geldige back-up'; setTimeout(() => $('dImport').textContent = 'Back-up terugzetten', 2500); }
};

/* ---------- Opmaak per tak (kleur, icoon, notitie, link) en thema per mindmap ---------- */
const format = (() => {
  const ICONS = ['⭐', '❗', '❓', '💡', '✅', '⛔', '🎯', '📅', '📌', '📎', '💬', '👤', '👥', '💶', '📈', '🚀', '❤️'];
  let id = null;
  const node = () => id && info.get(id)?.node;
  const chip = (text, on, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.classList.toggle('on', on); b.onclick = fn; return b; };
  function draw() {
    const n = node(); if (!n) return;
    const i = info.get(id), cur = i.color % COLORS.length;
    if (!i.depth) $('fColors').textContent = 'De kleur van het midden hoort bij het kleurenschema hieronder.';
    else $('fColors').replaceChildren(...COLORS.map((c, k) => {
      const b = chip('', k === cur, () => { change(() => { n.color = k; }); draw(); });
      b.style.background = c; b.title = 'Kleur ' + (k + 1); return b;
    }));
    $('fIcons').replaceChildren(chip('geen', !n.icon, () => { change(() => { delete n.icon; }); draw(); }),
      ...ICONS.map(ic => chip(ic, n.icon === ic, () => { change(() => { n.icon = ic; }); draw(); })));
  }
  function open() {
    commitEdit();
    if (!sel || !info.get(sel)) { sel = map.root.id; render(); }
    id = sel; const n = node(), t = map.theme || {};
    $('fNote').value = n.note || ''; $('fLink').value = n.link || '';
    $('fStyle').value = t.style || 'omlijnd'; $('fEdge').value = t.edge || 'boog'; $('fPal').value = t.palette || 'kleurrijk';
    draw(); $('fmt').hidden = false; $('shade').hidden = false;
  }
  function close() {
    if ($('fmt').hidden) return;
    const n = node(), note = $('fNote').value.trim(); let link = $('fLink').value.trim();
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    if (n && (note !== (n.note || '') || link !== (n.link || '')))
      change(() => { if (note) n.note = note; else delete n.note; if (link) n.link = link; else delete n.link; });
    $('fmt').hidden = true; $('shade').hidden = true; id = null;
  }
  const setTheme = () => { map.theme = { style: $('fStyle').value, edge: $('fEdge').value, palette: $('fPal').value }; touch(); render(); draw(); };
  $('fStyle').onchange = $('fEdge').onchange = $('fPal').onchange = setTheme;
  $('tFmt').onclick = open;
  $('fmt').onsubmit = e => { e.preventDefault(); close(); };
  return { close };
})();

/* ---------- Todoist. De koppeling (node.task) zit in de mindmap en synct mee; het token staat alleen op dit apparaat. ---------- */
const fmtDue = d => new Date(d.length === 10 ? d + 'T00:00' : d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
const todoist = (() => {
  const API = 'https://api.todoist.com/api/v1/', KEY = 'mm:todoist', PKEY = 'mm:todoist-project';
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k) || ''; v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} return ''; };
  let projects = null, nodeId = null, busy = false, checking = false;
  const tok = () => ls(KEY);
  async function call(path, body, token = tok()) {
    const r = await fetch(API + path, {
      method: body ? 'POST' : 'GET', body: body && JSON.stringify(body),
      headers: { Authorization: 'Bearer ' + token, ...(body && { 'Content-Type': 'application/json' }) }
    });
    if (r.status === 404) return null;
    if (!r.ok) throw Object.assign(new Error('Todoist ' + r.status), { status: r.status });
    return r.json();
  }
  const explain = e => e.status === 401 || e.status === 403 ? 'Todoist weigert het token. Controleer of je het volledig hebt geplakt.'
    : e.status === 400 ? 'Todoist begreep de invoer niet. Controleer de deadline.'
    : e.status ? 'Todoist gaf een fout (' + e.status + '). Probeer het later opnieuw.'
    : 'Todoist is niet bereikbaar. Controleer je internetverbinding.';
  async function loadProjects(token) {
    const out = []; let cursor = '';
    do {
      const d = await call('projects?limit=200' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), null, token);
      out.push(...(Array.isArray(d) ? d : d?.results || []));
      cursor = Array.isArray(d) ? '' : d?.next_cursor || '';
    } while (cursor);
    return out.sort((a, b) => (b.inbox_project ? 1 : 0) - (a.inbox_project ? 1 : 0));
  }
  function drawAcct(msg) {
    const on = !!tok();
    $('tdStatus').textContent = msg || (on ? 'Todoist is gekoppeld op dit apparaat.'
      : 'Koppel Todoist om van een tak een taak te maken. Je API-token staat in Todoist onder Instellingen → Integraties → Ontwikkelaar.');
    $('tdForm').hidden = on; $('tdOff').hidden = !on;
  }
  function fillProjects() {
    const s = $('kProj'); s.textContent = '';
    for (const p of projects || []) s.add(new Option(p.inbox_project ? 'Inbox' : p.name, p.id));
    if ([...s.options].some(o => o.value === ls(PKEY))) s.value = ls(PKEY);
  }
  function drawInfo() {
    const t = nodeId && info.get(nodeId)?.node.task; if (!t) return;
    $('kInfo').textContent = t.gone ? 'Deze taak bestaat niet meer in Todoist.' : t.done ? 'Afgerond in Todoist.' : 'Nog open' + (t.due ? ', deadline ' + fmtDue(t.due) : '') + '.';
    $('kOpen').href = 'https://app.todoist.com/app/task/' + t.id;
  }
  async function open() {
    commitEdit();
    const i = sel && info.get(sel); if (!i) return;
    if (!tok()) { openDrawer(); $('tdTok').focus(); return; }
    nodeId = sel; const t = i.node.task;
    $('kNew').hidden = $('kMake').hidden = !!t; $('kHave').hidden = $('kUnlink').hidden = !t; $('kMsg').textContent = '';
    $('dlg').hidden = false; $('shade').hidden = false;
    if (t) { drawInfo(); await refresh(); return drawInfo(); }
    $('kText').value = i.node.text; $('kDue').value = ''; $('kPrio').value = '1'; fillProjects();
    if (!projects) try { $('kMsg').textContent = 'Projecten laden…'; projects = await loadProjects(); fillProjects(); $('kMsg').textContent = ''; } catch (e) { $('kMsg').textContent = explain(e); }
  }
  function close() { if ($('dlg').hidden) return; $('dlg').hidden = true; $('shade').hidden = true; nodeId = null; }
  async function make() {
    const content = $('kText').value.trim(), id = nodeId;
    if (!content || busy || !id) return;
    busy = true; $('kMsg').textContent = 'Taak wordt aangemaakt…';
    try {
      const body = { content, description: 'Uit mindmap: ' + map.title, priority: +$('kPrio').value };
      if ($('kProj').value) { body.project_id = $('kProj').value; ls(PKEY, body.project_id); }
      if ($('kDue').value.trim()) { body.due_string = $('kDue').value.trim(); body.due_lang = 'nl'; }
      const t = await call('tasks', body), n = info.get(id)?.node;
      if (n) change(() => { n.task = { id: t.id, done: false, due: t.due?.date || null }; });
      close();
    } catch (e) { $('kMsg').textContent = explain(e); }
    busy = false;
  }
  // Status ophalen van alle gekoppelde taken in de open mindmap
  async function refresh() {
    if (!tok() || !map || checking) return;
    checking = true;
    const mapId = map.id, todo = [], got = new Map();
    for (const [id, i] of info) if (i.node.task && !i.node.task.gone && todo.length < 40) todo.push([id, i.node.task.id]);
    try { for (const [, tid] of todo) got.set(tid, await call('tasks/' + encodeURIComponent(tid))); } catch {}
    checking = false;
    if (!map || map.id !== mapId) return;
    let changed = false;
    for (const [id, tid] of todo) {
      const t = info.get(id)?.node.task; if (!t || t.id !== tid || !got.has(tid)) continue;
      const r = got.get(tid), next = !r || r.is_deleted ? { gone: true } : { done: !!r.checked, due: r.due?.date || null };
      for (const k in next) if ((t[k] ?? null) !== (next[k] ?? null)) { t[k] = next[k]; changed = true; }
    }
    if (changed) { touch(); render(); }
  }
  $('tTask').onclick = open;
  $('kCancel').onclick = close;
  $('dlg').onsubmit = e => { e.preventDefault(); make(); };
  $('kUnlink').onclick = () => { const n = nodeId && info.get(nodeId)?.node; if (n) change(() => { delete n.task; }); close(); };
  $('tdForm').onsubmit = async e => {
    e.preventDefault(); const t = $('tdTok').value.trim(); drawAcct('Controleren…');
    try { projects = await loadProjects(t); ls(KEY, t); $('tdTok').value = ''; drawAcct(); refresh(); } catch (err) { drawAcct(explain(err)); }
  };
  $('tdOff').onclick = () => { ls(KEY, null); projects = null; drawAcct(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 300000);
  drawAcct();
  return { refresh, close };
})();

/* ---------- Cloud-sync (Supabase). Lokaal blijft leidend voor snelheid en offline; per mindmap wint de laatste wijziging. ---------- */
const cloud = (() => {
  const cfg = window.MM_CONFIG || {};
  const sb = cfg.url && cfg.key && window.supabase ? window.supabase.createClient(cfg.url, cfg.key) : null;
  const LABEL = {
    geen: 'Synchronisatie is nog niet ingesteld.', uit: 'Niet ingelogd: mindmaps staan alleen op dit apparaat.',
    bezig: 'Synchroniseren…', ok: 'Gesynchroniseerd', offline: 'Offline: wijzigingen worden later verstuurd.',
    fout: 'Synchroniseren is mislukt, ik probeer het opnieuw.'
  };
  let user = null, busy = false, again = false, timer = 0;
  function set(s, msg) {
    $('bSync').dataset.s = $('pAcct').dataset.s = s; $('bSync').title = LABEL[s];
    $('aStatus').textContent = msg || (user ? user.email + ' · ' : '') + LABEL[s];
    $('aForm').hidden = !sb || !!user; $('aOut').hidden = !user;
  }
  const ok = r => { if (r.error) throw r.error; return r.data; };
  const table = () => sb.from('maps');

  async function push(id) {
    const m = await store.load(id);
    if (m) ok(await table().upsert({ id, title: m.title, data: m, updated: m.updated, deleted: false }));
  }
  async function pull(id) {
    const m = ok(await table().select('data').eq('id', id).single()).data;
    if (!m?.root) return;
    if (map?.id !== id) return store.save(m, true);
    if (editing || saveTimer) return;            // hier wordt net gewerkt: volgende ronde opnieuw bekijken
    await store.save(m, true); replaceMap(m);
  }
  async function dropLocal(id) {
    await store.remove(id, true);
    if (map?.id !== id) return;
    clearTimeout(saveTimer); saveTimer = 0; map = null;
    showPortal();
  }
  async function sync() {
    if (!sb || !user) return;
    if (busy) { again = true; return; }
    busy = true; set('bezig');
    try {
      const rows = ok(await table().select('id,updated,deleted'));
      const local = new Map((await store.list()).map(m => [m.id, m])), gone = store.gone(), seen = new Set();
      for (const r of rows) {
        seen.add(r.id);
        const l = local.get(r.id), g = gone[r.id];
        if (l && l.updated > r.updated) await push(r.id);
        else if (r.deleted) { if (l) await dropLocal(r.id); }
        else if (g && g >= r.updated) ok(await table().update({ deleted: true, data: null, updated: g }).eq('id', r.id));
        else if (!l || r.updated > l.updated) await pull(r.id);
        delete gone[r.id];
      }
      for (const [id, l] of local) if (!seen.has(id)) { const m = await store.load(id); if (m && !pristine(m)) await push(id); }
      for (const id in gone) if (!seen.has(id)) delete gone[id];
      store.setGone(gone);
      set('ok');
      if (isHome()) drawList();
    } catch (e) { console.warn('sync', e); set(navigator.onLine ? 'fout' : 'offline'); }
    busy = false;
    if (again) { again = false; kick(); }
  }
  function kick() { if (!sb || !user) return; clearTimeout(timer); timer = setTimeout(sync, 1500); }

  if (sb) {
    sb.auth.onAuthStateChange((_e, session) => {
      user = session?.user || null;
      set(user ? 'bezig' : 'uit');
      if (user) setTimeout(sync, 0);
    });
    $('aForm').onsubmit = async e => {
      e.preventDefault(); set('bezig', 'Inloggen…');
      const { error } = await sb.auth.signInWithPassword({ email: $('aMail').value.trim(), password: $('aPass').value });
      if (error) set('uit', 'Inloggen is niet gelukt. Controleer e-mailadres en wachtwoord.'); else $('aPass').value = '';
    };
    $('aOut').onclick = () => sb.auth.signOut();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    addEventListener('online', kick);
    setInterval(() => { if (!document.hidden) sync(); }, 60000);
  }
  set(sb ? 'uit' : 'geen');
  return { kick };
})();
$('bSync').onclick = openDrawer;
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');

addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
addEventListener('resize', () => map && applyView());

route();
