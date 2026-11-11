import * as sfx from './audio.js';
import { PICTURES, PALETTE, MAGIC, CATEGORIES } from './pictures.js';
import {
  SIZE, paint, pictureMarkup, strokeMarkup, strokePath, svgOpen, installDefs, analyze, svgToBlob,
} from './art.js';

// ---------------------------------------------------------------------------
// Save data
// ---------------------------------------------------------------------------
const SAVE_KEY = 'color-splash-party.v1';
const save = loadSave();

function loadSave() {
  const def = { muted: false, cat: 'all', art: {}, num: {}, done: { free: {}, number: {}, magic: {} } };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object') return { ...def, ...s, done: { ...def.done, ...(s.done || {}) } };
  } catch { /* storage blocked: color without saving */ }
  return def;
}
let persistTimer = 0;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 250);
}
function persistNow() {
  clearTimeout(persistTimer);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* full or blocked */ }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const NS = 'http://www.w3.org/2000/svg';
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const HEX = Object.fromEntries(PALETTE.map((p) => [p.key, p.hex]));
const LIGHT = new Set(['white', 'yellow', 'tan', 'sky', 'gray']);

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function vibrate(ms) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* ignore */ }
}
// A CSS color for sparkles / splashes of a palette or magic key
function fxColor(key) {
  if (HEX[key]) return key === 'white' ? '#fff8d0' : HEX[key];
  return `hsl(${randInt(0, 360)}, 100%, 66%)`;
}
function keyIndex(key) {
  const i = PALETTE.findIndex((p) => p.key === key);
  return i >= 0 ? i : PALETTE.length + MAGIC.findIndex((m) => m.key === key);
}

// ---------------------------------------------------------------------------
// Canvases: animated background behind, effects (confetti, splashes) in front
// ---------------------------------------------------------------------------
const bg = $('#bg');
const bgx = bg.getContext('2d');
const fx = $('#fx');
const fxx = fx.getContext('2d');
let W = 0, H = 0, DPR = 1, unit = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  for (const [cv, c] of [[bg, bgx], [fx, fxx]]) {
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  unit = clamp(Math.min(W, H) / 400, 0.8, 1.8);
  fitPaper();
}

const THEMES = {
  title: ['#ff6fb5', '#c27bff', '#6fc8ff'],
  fill: ['#ff6fa8', '#ff9f7a', '#ffd86b'],
  paint: ['#36b7ff', '#6ad5ff', '#b9f3ff'],
  number: ['#2bd4b4', '#64e6a8', '#c9ff8a'],
  magic: ['#4b3cff', '#8a4dff', '#ff6fd8'],
};
let themeCur = THEMES.title.map(hexToRgb);
let themeTarget = themeCur.map((c) => c.slice());
function setTheme(name) { themeTarget = (THEMES[name] || THEMES.title).map(hexToRgb); }

const sparkleImg = (() => {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
  c.fillStyle = '#fff';
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? s * 0.07 : s * 0.48;
    const a = (i * Math.PI) / 4;
    c.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
  }
  c.fill();
  return cv;
})();

// Floating paint blobs in the background
const BLOB_COLORS = ['#ff4d5e', '#ff9a2e', '#ffd93b', '#5cd65c', '#3d9bff', '#9d5cff', '#ff7ac6'];
const blobs = Array.from({ length: 11 }, () => ({
  fx: Math.random(), fy: Math.random(), r: rand(26, 80), speed: rand(0.006, 0.02),
  a: rand(0.12, 0.24), drift: rand(0, Math.PI * 2), color: pickOne(BLOB_COLORS),
}));
const twinkles = Array.from({ length: 24 }, () => ({
  fx: Math.random(), fy: Math.random(), s: rand(6, 16), phase: rand(0, Math.PI * 2), speed: rand(1.2, 3),
}));

function drawBackground(t, dt) {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) themeCur[i][j] = lerp(themeCur[i][j], themeTarget[i][j], 0.04);
  }
  const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const g = bgx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(themeCur[0]));
  g.addColorStop(0.55, rgb(themeCur[1]));
  g.addColorStop(1, rgb(themeCur[2]));
  bgx.fillStyle = g;
  bgx.fillRect(0, 0, W, H);

  for (const b of blobs) {
    b.fy -= b.speed * dt;
    if (b.fy < -0.2) { b.fy = 1.2; b.fx = Math.random(); b.color = pickOne(BLOB_COLORS); }
    const x = b.fx * W + Math.sin(t * 0.3 + b.drift) * 20;
    const y = b.fy * H;
    const r = b.r * unit;
    bgx.globalAlpha = b.a;
    const rg = bgx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.35, b.color);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    bgx.fillStyle = rg;
    bgx.beginPath();
    bgx.arc(x, y, r, 0, Math.PI * 2);
    bgx.fill();
  }
  for (const s of twinkles) {
    const a = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
    bgx.globalAlpha = a * 0.8;
    const size = s.s * (0.6 + a * 0.6);
    bgx.drawImage(sparkleImg, s.fx * W - size / 2, s.fy * H - size / 2, size, size);
  }
  bgx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------
let particles = [];
function addParticle(p) {
  if (particles.length > 400) particles.shift();
  particles.push(p);
}

function splashFx(x, y, color, big = false) {
  const n = big ? 18 : 11;
  addParticle({ type: 'ring', x, y, r: 10 * unit, vr: 160 * unit, life: 0.4, max: 0.4, color });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.25, 0.25);
    const sp = rand(110, 260) * unit;
    addParticle({
      type: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, size: rand(4, 8) * unit,
      life: rand(0.4, 0.7), max: 0.7, color: color === 'rainbow' ? fxColor('rainbow') : color,
    });
  }
  for (let i = 0; i < 3; i++) sparkleFx(x + rand(-20, 20), y + rand(-20, 20));
}

function sparkleFx(x, y, size = rand(14, 28)) {
  addParticle({
    type: 'spark', x, y, vx: rand(-50, 50), vy: rand(-110, -20), size: size * unit,
    rot: rand(0, Math.PI), vrot: rand(-4, 4), life: rand(0.5, 0.9), max: 0.9,
  });
}

function trailFx(x, y, color) {
  addParticle({
    type: 'trail', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-30, 30), vy: rand(-60, 0),
    size: rand(12, 24) * unit, life: rand(0.4, 0.7), max: 0.7, color,
  });
}

function floatText(x, y, text, color = '#fff', size = 34, life = 1) {
  addParticle({ type: 'text', x, y, vy: -70, text, color, size: size * unit, life, max: life });
}

function confetti(count = 90) {
  for (let i = 0; i < count; i++) {
    addParticle({
      type: 'confetti', x: rand(0, W), y: rand(-H * 0.3, -10), vx: rand(-60, 60), vy: rand(60, 200),
      size: rand(8, 14) * unit, rot: rand(0, 6), vrot: rand(-8, 8), color: `hsl(${randInt(0, 360)}, 100%, 62%)`,
      life: rand(2.2, 3.4), max: 3.4,
    });
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt;
    if (p.type === 'ring') { p.r += p.vr * dt; continue; }
    p.x += (p.vx || 0) * dt;
    p.y += (p.vy || 0) * dt;
    if (p.type === 'drop') p.vy += 500 * dt;
    if (p.type === 'confetti') { p.vx += Math.sin(p.rot) * 20 * dt; p.rot += p.vrot * dt; }
    if (p.type === 'spark') p.rot += p.vrot * dt;
  }
  particles = particles.filter((p) => p.life > 0);
}

function drawParticles() {
  fxx.clearRect(0, 0, W, H);
  for (const p of particles) {
    const k = p.life / p.max;
    switch (p.type) {
      case 'ring':
        fxx.globalAlpha = k * 0.9;
        fxx.strokeStyle = p.color;
        fxx.lineWidth = 6 * unit * k + 1;
        fxx.beginPath();
        fxx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        fxx.stroke();
        break;
      case 'drop':
        fxx.globalAlpha = Math.min(1, k * 1.5);
        fxx.fillStyle = p.color;
        fxx.beginPath();
        fxx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, Math.PI * 2);
        fxx.fill();
        fxx.fillStyle = 'rgba(255,255,255,0.8)';
        fxx.beginPath();
        fxx.arc(p.x - p.size * 0.25, p.y - p.size * 0.25, p.size * 0.3 * k, 0, Math.PI * 2);
        fxx.fill();
        break;
      case 'spark': {
        fxx.globalAlpha = Math.min(1, k * 1.6);
        const s = p.size * (0.5 + k * 0.5);
        fxx.save();
        fxx.translate(p.x, p.y);
        fxx.rotate(p.rot);
        fxx.drawImage(sparkleImg, -s / 2, -s / 2, s, s);
        fxx.restore();
        break;
      }
      case 'trail': {
        fxx.globalAlpha = k * 0.9;
        const s = p.size * (0.4 + k * 0.6);
        fxx.fillStyle = p.color;
        fxx.beginPath();
        fxx.arc(p.x, p.y, s * 0.3, 0, Math.PI * 2);
        fxx.fill();
        fxx.drawImage(sparkleImg, p.x - s / 2, p.y - s / 2, s, s);
        break;
      }
      case 'text': {
        const appear = Math.min(1, (p.max - p.life) / 0.12);
        fxx.globalAlpha = Math.min(1, k * 2.5);
        const size = p.size * (0.6 + appear * 0.4);
        fxx.font = `700 ${size}px Fredoka, ui-rounded, system-ui, sans-serif`;
        fxx.textAlign = 'center';
        fxx.textBaseline = 'middle';
        fxx.lineJoin = 'round';
        fxx.lineWidth = Math.max(4, size * 0.16);
        fxx.strokeStyle = 'rgba(110, 40, 190, 0.85)';
        fxx.strokeText(p.text, p.x, p.y);
        fxx.fillStyle = p.color;
        fxx.fillText(p.text, p.x, p.y);
        break;
      }
      case 'confetti':
        fxx.globalAlpha = Math.min(1, k * 3);
        fxx.save();
        fxx.translate(p.x, p.y);
        fxx.rotate(p.rot);
        fxx.scale(1, Math.cos(p.rot * 1.7));
        fxx.fillStyle = p.color;
        fxx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        fxx.restore();
        break;
    }
  }
  fxx.globalAlpha = 1;
}

let last = 0;
let clock = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;
  drawBackground(clock, dt);
  updateParticles(dt);
  drawParticles();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}
function showEditor(on) {
  $('#editor').classList.toggle('active', on);
}

function showBanner(title, sub = '') {
  const el = $('#banner');
  $('#banner-title').textContent = title;
  $('#banner-sub').textContent = sub;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

const MODE_INFO = {
  fill: { name: 'Tap & Fill', icon: '🪣', done: 'free' },
  paint: { name: 'Paint', icon: '🖌️', done: 'free' },
  number: { name: 'Color by Number', icon: '🔢', done: 'number' },
  magic: { name: 'Magic Reveal', icon: '✨', done: 'magic' },
};

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------
let galleryList = PICTURES;

function thumbMarkup(pic, mode, prefix) {
  if (mode === 'number') {
    const info = analyze(pic);
    const done = new Set(save.num[pic.id] || []);
    const started = done.size > 0;
    return pictureMarkup(pic, {
      prefix,
      fill: (i) => (done.has(i) || (started && !info.regions.has(i)) ? pic.shapes[i].c : null),
    });
  }
  if (mode === 'magic') {
    return pictureMarkup(pic, { prefix, fill: (i) => (save.done.magic[pic.id] ? pic.shapes[i].c : null) });
  }
  const art = save.art[pic.id];
  return pictureMarkup(pic, { prefix, fill: (i) => art?.f[i] || null, strokes: art?.s || [] });
}

function openGallery(mode) {
  if (mode) ed.mode = mode;
  const info = MODE_INFO[ed.mode];
  $('#mode-chip').textContent = `${info.icon} ${info.name}`;
  $('#tabs').innerHTML = CATEGORIES.map((c) =>
    `<button class="tab${save.cat === c.key ? ' on' : ''}" data-cat="${c.key}">${c.icon} ${c.name}</button>`).join('');
  buildGrid();
  setTheme(ed.mode);
  showEditor(false);
  showScreen('screen-gallery');
}

function buildGrid() {
  const cat = save.cat;
  galleryList = PICTURES.filter((p) => cat === 'all' || p.cat === cat);
  const doneSet = save.done[MODE_INFO[ed.mode].done];
  $('#pic-grid').innerHTML = galleryList.map((pic, n) => {
    const veil = ed.mode === 'magic' && !doneSet[pic.id] ? '<span class="sparkle-veil">✨</span>' : '';
    return `<button class="pic-card" data-pic="${pic.id}" style="animation-delay:${Math.min(n, 16) * 25}ms">` +
      `${svgOpen()}${thumbMarkup(pic, ed.mode, `t${n}-`)}</svg>${veil}` +
      `<span class="pic-name">${pic.name}</span>` +
      (doneSet[pic.id] ? '<span class="pic-badge">⭐</span>' : '') +
      '</button>';
  }).join('');
  $('.gallery-scroll').scrollTop = 0;
}

$('#tabs').addEventListener('click', (e) => {
  const t = e.target.closest('[data-cat]');
  if (!t) return;
  sfx.unlock();
  sfx.pick(CATEGORIES.findIndex((c) => c.key === t.dataset.cat) * 2);
  save.cat = t.dataset.cat;
  persist();
  $$('.tab').forEach((b) => b.classList.toggle('on', b === t));
  buildGrid();
});

$('#pic-grid').addEventListener('click', (e) => {
  const card = e.target.closest('[data-pic]');
  if (!card) return;
  sfx.unlock();
  sfx.click();
  openPicture(PICTURES.find((p) => p.id === card.dataset.pic));
});

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------
const svg = $('#art');
const SIZES = { s: 10, m: 22, l: 40 };
const REVEAL_W = 58;
const GRID_N = 20;

const ed = {
  mode: 'fill',
  pic: null,
  info: null,
  tool: 'fill',
  key: 'red',
  size: 'm',
  els: new Map(), // region index -> { fl, sk }
  anims: new Map(),
  undo: [],
  art: null,
  celebrated: false,
  // color by number
  groups: [],
  groupOf: new Map(),
  numDone: new Set(),
  labels: new Map(),
  wrong: new Map(),
  // magic
  magic: null,
  // pointer
  pointer: null,
};

function fitPaper() {
  const stage = $('#stage');
  if (!stage) return;
  const s = Math.floor(Math.min(stage.clientWidth, stage.clientHeight) - 6);
  if (s > 0) {
    $('#paper').style.width = `${s}px`;
    $('#paper').style.height = `${s}px`;
  }
}
if ('ResizeObserver' in window) new ResizeObserver(fitPaper).observe($('#stage'));

function openPicture(pic) {
  finishAllAnims();
  ed.pic = pic;
  ed.info = analyze(pic);
  ed.undo = [];
  ed.celebrated = false;
  ed.pointer = null;
  ed.wrong = new Map();
  ed.labels = new Map();
  ed.magic = null;
  $('#pic-name').textContent = pic.name;

  if (ed.mode === 'fill' || ed.mode === 'paint') {
    ed.art = save.art[pic.id] || (save.art[pic.id] = { f: {}, s: [] });
    ed.celebrated = !!save.done.free[pic.id];
    svg.innerHTML = pictureMarkup(pic, {
      prefix: 'ed', editor: true, fill: (i) => ed.art.f[i] || null, strokes: ed.art.s,
    });
  } else if (ed.mode === 'number') {
    setupNumbers(pic);
  } else {
    setupMagic(pic);
  }

  ed.els = new Map();
  svg.querySelectorAll('.rg').forEach((g) => {
    if (ed.mode === 'magic') return;
    ed.els.set(+g.dataset.r, { fl: g.querySelector('.fl'), sk: g.querySelector('.sk') });
  });

  buildDock();
  updateUndo();
  setTheme(ed.mode);
  showScreen(null);
  showEditor(true);
  requestAnimationFrame(fitPaper);
  if (ed.mode === 'magic') showBanner('Magic!', 'Rub the picture to find the colors');
}

// ---------------- Dock (tools + palette) ----------------
function buildDock() {
  const free = ed.mode === 'fill' || ed.mode === 'paint';
  $('#tools').classList.toggle('hidden', !free);
  $('#palette').classList.toggle('hidden', ed.mode === 'magic');
  const hint = $('#dock-hint');
  hint.classList.toggle('hidden', ed.mode !== 'magic');
  $('#undo-btn').classList.toggle('invisible', ed.mode !== 'fill' && ed.mode !== 'paint');

  if (free) {
    if (ed.mode === 'paint' && ed.toolMode !== 'paint') ed.tool = 'brush';
    if (ed.mode === 'fill' && ed.toolMode !== 'fill') ed.tool = 'fill';
    ed.toolMode = ed.mode;
    if (!HEX[ed.key] && !MAGIC.some((m) => m.key === ed.key)) ed.key = 'red';
    $('#palette').innerHTML =
      PALETTE.map((p) => `<button class="swatch" data-key="${p.key}" style="--c:${p.hex}" aria-label="${p.name}"></button>`).join('') +
      MAGIC.map((m) => `<button class="swatch magic m-${m.key}" data-key="${m.key}" aria-label="${m.name}"></button>`).join('');
    setTool(ed.tool, true);
  } else if (ed.mode === 'number') {
    $('#palette').innerHTML = ed.groups.map((g) =>
      `<button class="swatch num${LIGHT.has(g.key) ? ' light' : ''}" data-key="${g.key}" style="--c:${HEX[g.key]}" aria-label="Number ${g.n}"><span>${g.n}</span></button>`).join('');
    ed.groups.forEach(markGroup);
    const first = ed.groups.find((g) => !groupComplete(g)) || ed.groups[0];
    ed.key = first ? first.key : 'red';
  } else {
    hint.innerHTML = 'Rub the picture! ✨<small>Find all the hidden colors</small>';
  }
  setKey(ed.key, true);
}

function setKey(key, quiet = false) {
  ed.key = key;
  $$('#palette .swatch').forEach((s) => s.classList.toggle('on', s.dataset.key === key));
  const sw = $(`#palette .swatch[data-key="${key}"]`);
  $('#sizes').style.setProperty('--cur', HEX[key] || '#ff7ac6');
  $$('.size-btn i').forEach((i) => {
    i.style.background = sw ? getComputedStyle(sw).background : '';
  });
  if (ed.mode === 'number') {
    ed.labels.forEach((el, r) => el.classList.toggle('hot', ed.pic.shapes[r].c === key));
  }
  if (!quiet) sfx.pick(keyIndex(key));
}

function setTool(tool, quiet = false) {
  ed.tool = tool;
  $$('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
  $('#sizes').classList.toggle('invisible', tool !== 'brush');
  $$('.size-btn').forEach((b) => b.classList.toggle('on', b.dataset.size === ed.size));
  if (!quiet) sfx.click();
}

$('#palette').addEventListener('click', (e) => {
  const s = e.target.closest('.swatch');
  if (!s) return;
  sfx.unlock();
  s.classList.remove('hint');
  setKey(s.dataset.key);
});
$('#tools').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tool]');
  const z = e.target.closest('[data-size]');
  sfx.unlock();
  if (t) setTool(t.dataset.tool);
  if (z) {
    ed.size = z.dataset.size;
    setTool('brush');
  }
});

// ---------------- Pointer input ----------------
function toLocal(e) {
  const r = svg.getBoundingClientRect();
  return {
    x: clamp(((e.clientX - r.left) / r.width) * SIZE, 0, SIZE),
    y: clamp(((e.clientY - r.top) / r.height) * SIZE, 0, SIZE),
  };
}
function regionAt(e) {
  const g = e.target.closest && e.target.closest('.rg');
  return g ? +g.dataset.r : -1;
}
const round1 = (v) => Math.round(v * 10) / 10;

svg.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  sfx.unlock();
  if (ed.pointer) return; // one finger at a time
  const pt = toLocal(e);
  if (ed.mode === 'magic') {
    if (ed.magic.done) return;
    startReveal(pt, e);
  } else if (ed.mode === 'number') {
    numberTap(regionAt(e), pt, e);
    return;
  } else if (ed.tool === 'fill') {
    const r = regionAt(e);
    if (r >= 0) freeFill(r, pt, e);
    return;
  } else {
    const r = regionAt(e);
    if (r < 0) return;
    startStroke(r, pt, e);
  }
  try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
});

svg.addEventListener('pointermove', (e) => {
  const p = ed.pointer;
  if (!p || p.id !== e.pointerId) return;
  e.preventDefault();
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (events.length ? events : [e])) {
    const pt = toLocal(ev);
    if (p.kind === 'stroke') extendStroke(pt, ev);
    else extendReveal(pt, ev);
  }
  if (p.kind === 'stroke') p.el.setAttribute('d', strokePath(p.s.p));
  else p.el.setAttribute('d', strokePath(p.pts));
  if (p.kind === 'reveal') checkReveal(toLocal(e), e);
});

function endPointer(e) {
  const p = ed.pointer;
  if (!p || p.id !== e.pointerId) return;
  ed.pointer = null;
  if (p.kind === 'stroke') {
    ed.art.s.push(p.s);
    ed.undo.push({ t: 'stroke', s: p.s, el: p.el });
    updateUndo();
    persist();
    checkFreeDone();
  }
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('lostpointercapture', endPointer);
svg.addEventListener('contextmenu', (e) => e.preventDefault());
svg.addEventListener('animationend', (e) => e.target.classList && e.target.classList.remove('wrong'));

// ---------------- Fill animation ----------------
function animateFill(r, key, x, y, fast = false) {
  const reg = ed.els.get(r);
  if (!reg) return;
  finishAnim(r);
  const color = paint(key);
  if (fast) { reg.fl.setAttribute('fill', color); return; }
  const bb = reg.fl.getBBox();
  const maxR = Math.hypot(Math.max(x - bb.x, bb.x + bb.width - x), Math.max(y - bb.y, bb.y + bb.height - y)) + 4;
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', x);
  c.setAttribute('cy', y);
  c.setAttribute('r', 0);
  c.setAttribute('fill', color);
  c.setAttribute('clip-path', `url(#edc${r})`);
  reg.fl.after(c);
  const anim = { c, color, reg, raf: 0 };
  ed.anims.set(r, anim);
  const t0 = performance.now();
  const dur = clamp(maxR * 2.4, 240, 560);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    c.setAttribute('r', maxR * (1 - Math.pow(1 - k, 3)));
    if (k < 1) anim.raf = requestAnimationFrame(step);
    else finishAnim(r);
  };
  anim.raf = requestAnimationFrame(step);
}
function finishAnim(r) {
  const a = ed.anims.get(r);
  if (!a) return;
  cancelAnimationFrame(a.raf);
  a.reg.fl.setAttribute('fill', a.color);
  a.c.remove();
  ed.anims.delete(r);
}
function finishAllAnims() { [...ed.anims.keys()].forEach(finishAnim); }

// ---------------- Free coloring (Tap & Fill / Paint) ----------------
function freeFill(r, pt, e) {
  const prev = ed.art.f[r] || null;
  if (prev === ed.key) {
    sparkleFx(e.clientX, e.clientY);
    return;
  }
  animateFill(r, ed.key, pt.x, pt.y);
  ed.art.f[r] = ed.key;
  ed.undo.push({ t: 'fill', r, prev });
  updateUndo();
  persist();
  sfx.splash(1 + (keyIndex(ed.key) % 7) * 0.06);
  splashFx(e.clientX, e.clientY, fxColor(ed.key));
  checkFreeDone();
}

function startStroke(r, pt, e) {
  const s = { r, k: ed.key, w: SIZES[ed.size], p: [round1(pt.x), round1(pt.y)] };
  const reg = ed.els.get(r);
  reg.sk.insertAdjacentHTML('beforeend', strokeMarkup(s));
  ed.pointer = { id: e.pointerId, kind: 'stroke', s, el: reg.sk.lastElementChild, lx: pt.x, ly: pt.y, sound: 0 };
  sfx.scribble();
  trailFx(e.clientX, e.clientY, fxColor(ed.key));
}

function extendStroke(pt, ev) {
  const p = ed.pointer;
  if (Math.hypot(pt.x - p.lx, pt.y - p.ly) < 2) return;
  p.s.p.push(round1(pt.x), round1(pt.y));
  p.lx = pt.x;
  p.ly = pt.y;
  const now = performance.now();
  if (now - p.sound > 90) {
    p.sound = now;
    sfx.scribble();
    trailFx(ev.clientX, ev.clientY, fxColor(ed.key));
  }
}

function checkFreeDone() {
  if (ed.celebrated) return;
  const colored = new Set(Object.keys(ed.art.f).map(Number));
  for (const s of ed.art.s) colored.add(s.r);
  for (const r of ed.info.regions.keys()) if (!colored.has(r)) return;
  ed.celebrated = true;
  save.done.free[ed.pic.id] = 1;
  persist();
  setTimeout(() => {
    sfx.win();
    confetti();
    showBanner(pickOne(['Beautiful!', 'So pretty!', 'Wonderful!', 'Masterpiece!']), 'Keep coloring or tap 📷 to save');
  }, 350);
}

function undo() {
  const u = ed.undo.pop();
  if (!u) { sfx.boing(); return; }
  if (u.t === 'fill') {
    finishAnim(u.r);
    if (u.prev) ed.art.f[u.r] = u.prev; else delete ed.art.f[u.r];
    ed.els.get(u.r).fl.setAttribute('fill', paint(u.prev));
  } else {
    u.el.remove();
    const i = ed.art.s.indexOf(u.s);
    if (i >= 0) ed.art.s.splice(i, 1);
  }
  sfx.whoosh();
  updateUndo();
  persist();
}
function updateUndo() {
  $('#undo-btn').classList.toggle('off', ed.undo.length === 0);
}

// ---------------- Color by Number ----------------
function setupNumbers(pic) {
  const info = ed.info;
  ed.numDone = new Set((save.num[pic.id] || []).filter((r) => info.regions.has(r)));
  const keys = [...new Set([...info.regions.keys()].map((r) => pic.shapes[r].c))]
    .sort((a, b) => keyIndex(a) - keyIndex(b));
  ed.groups = keys.map((key, i) => ({ key, n: i + 1, regions: [] }));
  ed.groupOf = new Map();
  for (const r of info.regions.keys()) {
    const g = ed.groups.find((x) => x.key === pic.shapes[r].c);
    g.regions.push(r);
    ed.groupOf.set(r, g);
  }
  // Parts too tiny for a number are colored in for you.
  let html = pictureMarkup(pic, {
    prefix: 'ed', editor: true,
    fill: (i) => (ed.numDone.has(i) || !info.regions.has(i) ? pic.shapes[i].c : null),
  });
  html += '<g class="labels no-export">';
  for (const [r, reg] of info.regions) {
    if (ed.numDone.has(r)) continue;
    const fs = clamp(reg.room * 1.15, 11, 34).toFixed(1);
    html += `<text class="lbl" data-r="${r}" x="${reg.x.toFixed(1)}" y="${reg.y.toFixed(1)}" font-size="${fs}">${ed.groupOf.get(r).n}</text>`;
  }
  html += '</g>';
  svg.innerHTML = html;
  svg.querySelectorAll('.lbl').forEach((el) => ed.labels.set(+el.dataset.r, el));
}

const groupComplete = (g) => g.regions.every((r) => ed.numDone.has(r));

function markGroup(g) {
  const sw = $(`#palette .swatch[data-key="${g.key}"]`);
  if (!sw) return;
  const done = groupComplete(g);
  sw.classList.toggle('done', done);
  sw.querySelector('span').textContent = done ? '✓' : g.n;
}

function numberTap(r, pt, e) {
  if (r < 0 || !ed.info.regions.has(r) || ed.numDone.has(r)) {
    if (r >= 0) sparkleFx(e.clientX, e.clientY);
    return;
  }
  const want = ed.pic.shapes[r].c;
  const label = ed.labels.get(r);
  if (ed.key !== want) {
    sfx.boing();
    vibrate(25);
    if (label) {
      label.classList.remove('wrong');
      void label.getBBox();
      label.classList.add('wrong');
    }
    const n = (ed.wrong.get(r) || 0) + 1;
    ed.wrong.set(r, n);
    if (n >= 2) {
      const sw = $(`#palette .swatch[data-key="${want}"]`);
      if (sw) { sw.classList.remove('hint'); void sw.offsetWidth; sw.classList.add('hint'); }
    }
    return;
  }
  animateFill(r, want, pt.x, pt.y);
  ed.numDone.add(r);
  save.num[ed.pic.id] = [...ed.numDone];
  persist();
  sfx.splash(1 + (keyIndex(want) % 7) * 0.06);
  splashFx(e.clientX, e.clientY, fxColor(want));
  if (label) {
    label.classList.add('gone');
    ed.labels.delete(r);
    setTimeout(() => label.remove(), 400);
  }
  const g = ed.groupOf.get(r);
  if (groupComplete(g)) {
    markGroup(g);
    if (ed.groups.every(groupComplete)) { finishNumbers(); return; }
    setTimeout(() => sfx.chime(), 200);
    floatText(e.clientX, e.clientY - 30, pickOne(['Great!', 'Super!', 'Yay!', 'Awesome!']), '#fff');
    const next = ed.groups.find((x) => !groupComplete(x));
    setTimeout(() => setKey(next.key, true), 450);
  }
}

function finishNumbers() {
  save.done.number[ed.pic.id] = 1;
  persist();
  setTimeout(() => celebrate(), 450);
}

// ---------------- Magic Reveal ----------------
function setupMagic(pic) {
  const colored = pictureMarkup(pic, { prefix: 'mc', fill: (i) => pic.shapes[i].c });
  svg.innerHTML =
    `<defs><mask id="reveal-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${SIZE}" height="${SIZE}">` +
    `<rect width="${SIZE}" height="${SIZE}" fill="#000"/>` +
    `<g class="ms" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="${REVEAL_W}"></g>` +
    '</mask></defs>' +
    `<g>${pictureMarkup(pic, { prefix: 'mb', plain: true })}</g>` +
    `<g mask="url(#reveal-mask)">${colored}</g>`;
  ed.magic = { grid: new Uint8Array(GRID_N * GRID_N), covered: 0, done: false, ms: svg.querySelector('.ms'), sound: 0 };
}

function cover(x, y) {
  const m = ed.magic;
  const cell = SIZE / GRID_N;
  const rad = REVEAL_W / 2 + 6;
  const x0 = Math.max(0, Math.floor((x - rad) / cell));
  const x1 = Math.min(GRID_N - 1, Math.floor((x + rad) / cell));
  const y0 = Math.max(0, Math.floor((y - rad) / cell));
  const y1 = Math.min(GRID_N - 1, Math.floor((y + rad) / cell));
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const i = gy * GRID_N + gx;
      if (m.grid[i]) continue;
      const cx = (gx + 0.5) * cell;
      const cy = (gy + 0.5) * cell;
      if (Math.hypot(cx - x, cy - y) <= rad) { m.grid[i] = 1; m.covered++; }
    }
  }
}

function startReveal(pt, e) {
  const m = ed.magic;
  m.ms.insertAdjacentHTML('beforeend', '<path/>');
  const pts = [round1(pt.x), round1(pt.y)];
  ed.pointer = { id: e.pointerId, kind: 'reveal', el: m.ms.lastElementChild, pts, lx: pt.x, ly: pt.y };
  ed.pointer.el.setAttribute('d', strokePath(pts));
  cover(pt.x, pt.y);
  sfx.shimmer();
  for (let i = 0; i < 3; i++) trailFx(e.clientX, e.clientY, fxColor('rainbow'));
  checkReveal(pt, e);
}

function extendReveal(pt, ev) {
  const p = ed.pointer;
  const d = Math.hypot(pt.x - p.lx, pt.y - p.ly);
  if (d < 3) return;
  const steps = Math.ceil(d / 8);
  for (let i = 1; i <= steps; i++) cover(lerp(p.lx, pt.x, i / steps), lerp(p.ly, pt.y, i / steps));
  p.pts.push(round1(pt.x), round1(pt.y));
  p.lx = pt.x;
  p.ly = pt.y;
  const m = ed.magic;
  const now = performance.now();
  if (now - m.sound > 110) {
    m.sound = now;
    sfx.shimmer();
    trailFx(ev.clientX, ev.clientY, fxColor('rainbow'));
  }
}

function checkReveal(pt, e) {
  const m = ed.magic;
  if (m.done || m.covered < GRID_N * GRID_N * 0.88) return;
  m.done = true;
  ed.pointer = null;
  // Sweep the rest of the colors in with a growing circle.
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', pt.x);
  c.setAttribute('cy', pt.y);
  c.setAttribute('r', 0);
  c.setAttribute('fill', '#fff');
  m.ms.appendChild(c);
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 800);
    c.setAttribute('r', 600 * k * k);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  sfx.sparkle();
  for (let i = 0; i < 14; i++) sparkleFx(e.clientX + rand(-80, 80), e.clientY + rand(-80, 80), rand(20, 40));
  save.done.magic[ed.pic.id] = 1;
  persist();
  setTimeout(() => celebrate(), 900);
}

// ---------------- Finished! ----------------
function celebrate() {
  sfx.win();
  confetti(110);
  const pic = ed.pic;
  $('#done-title').textContent = pickOne(['You did it!', 'Amazing!', 'Beautiful!', 'Wonderful!']);
  $('#done-thumb').innerHTML = `${svgOpen()}${pictureMarkup(pic, { prefix: 'dn', fill: (i) => pic.shapes[i].c })}</svg>`;
  $$('#screen-done .rstar').forEach((s, i) => {
    s.classList.remove('on');
    setTimeout(() => { s.classList.add('on'); sfx.chime([0, 4, 7], 660 * Math.pow(2, (i * 2) / 12)); }, 400 + i * 260);
  });
  showScreen('screen-done');
}

function nextPicture() {
  const list = galleryList.length ? galleryList : PICTURES;
  const i = list.indexOf(ed.pic);
  openPicture(list[(i + 1) % list.length]);
}

function clearPicture() {
  const id = ed.pic.id;
  if (ed.mode === 'fill' || ed.mode === 'paint') {
    save.art[id] = { f: {}, s: [] };
    delete save.done.free[id];
  } else if (ed.mode === 'number') {
    delete save.num[id];
    delete save.done.number[id];
  }
  persist();
  sfx.whoosh();
  openPicture(ed.pic);
}

async function saveImage() {
  finishAllAnims();
  try {
    const blob = await svgToBlob(svg);
    const name = `coloring-${ed.pic.id}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: ed.pic.name });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    sfx.sparkle();
    showBanner('Saved!', 'Your picture is in your downloads');
  } catch {
    sfx.boing();
    showBanner('Oops!', 'Could not save the picture');
  }
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------
function goHome() {
  finishAllAnims();
  persistNow();
  showEditor(false);
  setTheme('title');
  updateTitle();
  showScreen('screen-title');
}

function updateTitle() {
  const finished = new Set([
    ...Object.keys(save.done.free), ...Object.keys(save.done.number), ...Object.keys(save.done.magic),
  ]).size;
  $('#title-best').textContent = finished
    ? `⭐ ${finished} of ${PICTURES.length} pictures finished`
    : `${PICTURES.length} pictures to color!`;
}

function updateSoundButtons() {
  $$('[data-action="sound"]').forEach((b) => { b.textContent = save.muted ? '🔇' : '🔊'; });
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
let installPrompt = null;

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  sfx.unlock();
  const action = el.dataset.action;
  if (action !== 'sound' && action !== 'undo') sfx.click();
  switch (action) {
    case 'mode': openGallery(el.dataset.mode); break;
    case 'home': goHome(); break;
    case 'gallery': finishAllAnims(); persistNow(); openGallery(); break;
    case 'undo': undo(); break;
    case 'clear':
      if (ed.mode === 'magic') { sfx.whoosh(); openPicture(ed.pic); } else showScreen('screen-confirm');
      break;
    case 'clear-yes': showScreen(null); clearPicture(); break;
    case 'close': showScreen(null); break;
    case 'next': showScreen(null); nextPicture(); break;
    case 'save-img': saveImage(); break;
    case 'sound':
      save.muted = !save.muted;
      sfx.setMuted(save.muted);
      persist();
      updateSoundButtons();
      sfx.click();
      break;
    case 'install':
      if (installPrompt) {
        installPrompt.prompt();
        installPrompt.userChoice.finally(() => {
          installPrompt = null;
          $('#install-btn').classList.add('hidden');
        });
      }
      break;
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    persistNow();
    sfx.suspend();
  } else {
    sfx.resume();
    last = performance.now();
  }
});
window.addEventListener('pagehide', persistNow);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#install-btn').classList.remove('hidden');
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  $('#install-btn').classList.add('hidden');
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
installDefs();
window.addEventListener('resize', resize);
resize();
sfx.setMuted(save.muted);
updateSoundButtons();
updateTitle();
requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
  });
}

// tiny hook for automated testing
window.__coloring = { ed, save, openGallery, openPicture, PICTURES };
