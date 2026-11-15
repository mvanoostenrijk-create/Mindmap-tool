'use strict';

/* ---------- Opslag. Fase 2 vervangt dit object door cloud-sync met dezelfde functies. ---------- */
const store = (() => {
  const K = 'mm:', mem = {};
  const get = k => { try { const v = localStorage.getItem(k); if (v !== null) return v; } catch {} return mem[k] ?? null; };
  const set = (k, v) => { mem[k] = v; try { localStorage.setItem(k, v); } catch {} };
  const del = k => { delete mem[k]; try { localStorage.removeItem(k); } catch {} };
  const idx = () => JSON.parse(get(K + 'index') || '[]');
  return {
    async list() { return idx().sort((a, b) => b.updated - a.updated); },
    async load(id) { const s = get(K + 'map:' + id); return s ? JSON.parse(s) : null; },
    // quiet = afkomstig van de cloud: niet opnieuw terugsturen
    async save(m, quiet) {
      set(K + 'map:' + m.id, JSON.stringify(m));
      const l = idx().filter(x => x.id !== m.id);
      l.unshift({ id: m.id, title: m.title, updated: m.updated });
      set(K + 'index', JSON.stringify(l));
      if (!quiet) cloud.kick();
    },
    async remove(id, quiet) {
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
function flush() { clearTimeout(saveTimer); saveTimer = 0; if (map) store.save(map); }
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
    el.className = 'node ' + (i.depth ? i.side : 'root') + ' d' + Math.min(i.depth, 2) + (id === sel ? ' sel' : '')
      + (n.task ? ' task' + (n.task.gone ? ' gone' : n.task.done ? ' done' : '') : '');
    if (n.task?.due && !n.task.done && !n.task.gone) el.dataset.due = fmtDue(n.task.due); else delete el.dataset.due;
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
  if (!map || $('drawer').classList.contains('open') || !$('dlg').hidden || e.target.matches('input,select')) { if (e.key === 'Escape') { closeDrawer(); todoist.close(); } return; }
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
$('shade').onclick = () => { closeDrawer(); todoist.close(); };
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
  } catch { $('dImport').textContent = 'Geen geldige back-up'; setTimeout(() => $('dImport').textContent = 'Back-up terugzetten', 2500); }
};

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
    $('bSync').dataset.s = s; $('bSync').title = LABEL[s];
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
    const rest = await store.list(), x = rest[0] && await store.load(rest[0].id);
    x ? await openMap(x) : await newMap();
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
      // nieuw apparaat: lege startmindmap vervangen door de laatst bewerkte uit de cloud
      if (map && pristine(map) && !editing) {
        const o = (await store.list()).find(x => x.id !== map.id), old = map.id;
        if (o) { await openMap(await store.load(o.id)); await store.remove(old, true); }
      }
      set('ok');
      if ($('drawer').classList.contains('open')) drawList();
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

(async () => {
  const last = store.getLast(), list = await store.list();
  const m = (last && await store.load(last)) || (list[0] && await store.load(list[0].id));
  m ? openMap(m) : newMap();
})();
