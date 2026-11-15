'use strict';

/* ---------- Opslag. Fase 2 vervangt dit object door cloud-sync met dezelfde functies. ---------- */
const store = (() => {
  const K = 'mm:', mem = {};
  const get = k => { try { const v = localStorage.getItem(k); if (v !== null) return v; } catch {} return mem[k] ?? null; };
  const set = (k, v) => { mem[k] = v; try { localStorage.setItem(k, v); } catch {} };
  const del = k => { delete mem[k]; try { localStorage.removeItem(k); } catch {} };
  const idx = () => JSON.parse(get(K + 'index') || '[]');
  return {
    async list() { return idx(); },
    async load(id) { const s = get(K + 'map:' + id); return s ? JSON.parse(s) : null; },
    async save(m) {
      set(K + 'map:' + m.id, JSON.stringify(m));
      const l = idx().filter(x => x.id !== m.id);
      l.unshift({ id: m.id, title: m.title, updated: m.updated });
      set(K + 'index', JSON.stringify(l));
    },
    async remove(id) { del(K + 'map:' + id); set(K + 'index', JSON.stringify(idx().filter(x => x.id !== id))); },
    getLast() { return get(K + 'last'); },
    setLast(id) { set(K + 'last', id); }
  };
})();

/* ---------- Toestand ---------- */
const $ = id => document.getElementById(id);
const canvas = $('canvas'), world = $('world'), edges = $('edges'), ghost = $('ghost');
const COLORS = ['#e5484d', '#f08c1a', '#2f9e6b', '#3b82f6', '#8b5cf6', '#d6409f', '#0ea5a4', '#b7791f'];
const HG = 52, VG = 12;
let map = null, sel = null, editing = null, editOrig = '';
let view = { x: 0, y: 0, s: 1 };
let undo = [], redo = [], saveTimer = 0;
const els = new Map(), geo = new Map();
let info = new Map();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- Model ---------- */
function index() {
  info = new Map();
  (function walk(n, parent, depth, side, color, visible) {
    info.set(n.id, { node: n, parent, depth, side, color, visible });
    for (const c of n.children)
      walk(c, n, depth + 1, depth ? side : (c.side || 'right'), depth ? color : (c.color || 0), visible && (!n.collapsed || !depth));
  })(map.root, null, 0, null, 0, true);
}
function touch() {
  map.updated = Date.now();
  map.title = map.root.text.trim() || 'Naamloos';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}
function flush() { clearTimeout(saveTimer); if (map) store.save(map); }
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
  for (const [id, i] of info) {
    if (!i.visible) continue;
    const el = els.get(id) || mkEl(id), n = i.node;
    el.className = 'node ' + (i.depth ? i.side : 'root') + ' d' + Math.min(i.depth, 2) + (id === sel ? ' sel' : '');
    if (i.depth) el.style.setProperty('--c', COLORS[i.color % COLORS.length]);
    const txt = el.firstChild, tog = el.lastChild;
    if (id !== editing && txt.textContent !== n.text) txt.textContent = n.text;
    tog.hidden = !i.depth || !n.children.length;
    tog.textContent = n.collapsed ? countAll(n) : '−';
    tog.title = n.collapsed ? 'Uitklappen' : 'Inklappen';
  }
  for (const [id, el] of els) if (!info.get(id)?.visible) { el.remove(); els.delete(id); }
  layout(); ui();
}

function layout() {
  geo.clear();
  for (const [id, el] of els) geo.set(id, { w: el.offsetWidth, h: el.offsetHeight });
  const kids = n => (n.collapsed ? [] : n.children), sh = new Map();
  const H = n => { if (!sh.has(n.id)) sh.set(n.id, Math.max(geo.get(n.id).h, stackH(kids(n)))); return sh.get(n.id); };
  const stackH = l => l.reduce((a, c) => a + H(c), 0) + VG * Math.max(0, l.length - 1);
  const stack = (l, x, cy, dir) => { let y = cy - stackH(l) / 2; for (const c of l) { const h = H(c); place(c, x, y + h / 2, dir); y += h + VG; } };
  const place = (n, x, cy, dir) => {
    const g = geo.get(n.id);
    g.x = dir > 0 ? x : x - g.w; g.y = cy - g.h / 2; g.dir = dir;
    stack(kids(n), dir > 0 ? x + g.w + HG : x - g.w - HG, cy, dir);
  };
  const r = map.root, g = geo.get(r.id);
  g.x = -g.w / 2; g.y = -g.h / 2; g.dir = 0;
  stack(r.children.filter(c => c.side !== 'left'), g.w / 2 + HG, 0, 1);
  stack(r.children.filter(c => c.side === 'left'), -g.w / 2 - HG, 0, -1);

  let d = '';
  for (const [id, el] of els) {
    const p = geo.get(id), i = info.get(id);
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    if (!i.parent) continue;
    const q = geo.get(i.parent.id);
    const x1 = p.dir > 0 ? q.x + q.w : q.x, y1 = q.y + q.h / 2, x2 = p.dir > 0 ? p.x : p.x + p.w, y2 = p.y + p.h / 2, mx = (x1 + x2) / 2;
    d += `<path d="M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" stroke="${COLORS[i.color % COLORS.length]}"/>`;
  }
  edges.innerHTML = d;
  applyView();
}
function applyView() { world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.s})`; }

function ui() {
  $('title').textContent = map.title;
  document.title = map.title + ' · Mindmap';
  const i = sel && info.get(sel);
  $('tChild').disabled = $('tEdit').disabled = !i;
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
    if (home === map.root) { a.node.side = side; if (a.parent !== map.root) a.node.color = nextColor(); }
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
  if (pts.size === 2) { endDrag(); g = { type: 'pinch', ...pinchState() }; return; }
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
  if (!map || $('drawer').classList.contains('open')) { if (e.key === 'Escape') closeDrawer(); return; }
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
  render(); fit();
}
function newMap() {
  const text = 'Nieuwe mindmap';
  const m = { id: uid(), title: text, updated: Date.now(), root: { id: uid(), text, children: [] } };
  store.save(m);
  return openMap(m);
}
async function drawList() {
  const ul = $('dList'); ul.textContent = '';
  for (const m of await store.list()) {
    const li = document.createElement('li'), o = document.createElement('button'), d = document.createElement('button');
    o.className = 'open' + (m.id === map.id ? ' cur' : ''); o.textContent = m.title;
    o.onclick = async () => { closeDrawer(); if (m.id !== map.id) { const x = await store.load(m.id); if (x) openMap(x); } };
    d.className = 'del'; d.textContent = '✕'; d.title = 'Verwijderen';
    d.onclick = async () => {
      if (d.textContent === '✕') { d.textContent = 'Zeker?'; return; }
      await store.remove(m.id);
      if (m.id === map.id) { clearTimeout(saveTimer); map = null; const rest = await store.list(); const x = rest[0] && await store.load(rest[0].id); x ? await openMap(x) : await newMap(); }
      drawList();
    };
    li.append(o, d); ul.append(li);
  }
}
function openDrawer() { commitEdit(); flush(); drawList(); $('drawer').classList.add('open'); $('shade').hidden = false; }
function closeDrawer() { $('drawer').classList.remove('open'); $('shade').hidden = true; }
$('bMenu').onclick = openDrawer;
$('shade').onclick = closeDrawer;
$('dNew').onclick = () => { closeDrawer(); newMap(); };
$('dExport').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(map, null, 1)], { type: 'application/json' }));
  a.download = map.title.replace(/[^\w\- ]+/g, '').trim() + '.mindmap.json';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
  } catch { $('dImport').textContent = 'Geen geldige back-up'; setTimeout(() => $('dImport').textContent = 'Back-up openen', 2500); }
};

addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
addEventListener('resize', () => map && applyView());

(async () => {
  const last = store.getLast(), list = await store.list();
  const m = (last && await store.load(last)) || (list[0] && await store.load(list[0].id));
  m ? openMap(m) : newMap();
})();
