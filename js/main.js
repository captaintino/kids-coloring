import * as sfx from './audio.js';
import { PICTURES, PALETTE, MAGIC, CATEGORIES } from './pictures.js';
import { SCENES, paintScene, createAnimator } from './scenes.js';
import {
  SIZE, paint, pictureMarkup, strokePath, svgOpen, installDefs, analyze, svgToCanvas, canvasToBlob,
} from './art.js';

// ---------------------------------------------------------------------------
// Save data
// ---------------------------------------------------------------------------
const SAVE_KEY = 'color-splash-party.v1';
const save = loadSave();

function loadSave() {
  const def = { muted: false, scene: 'party', cat: 'all', art: {}, num: {}, done: { free: {}, number: {}, magic: {} } };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object') return { ...def, ...s, done: { ...def.done, ...(s.done || {}) } };
  } catch (err) { /* storage blocked: color without saving */ }
  return def;
}
let persistTimer = 0;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 250);
}
function persistNow() {
  clearTimeout(persistTimer);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (err) { /* full or blocked */ }
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
const HEX = {};
PALETTE.forEach((p) => { HEX[p.key] = p.hex; });
const LIGHT = new Set(['white', 'yellow', 'tan', 'sky', 'gray']);
const IS_IOS = /iP(ad|hone|od)/.test(navigator.platform) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_IPAD = /iPad/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Opened from the home screen? (navigator.standalone is the iOS flag)
function isInstalled() {
  try {
    return navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches;
  } catch (err) { return false; }
}

function vibrate(ms) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch (err) { /* ignore */ }
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
let W = 0, H = 0, unit = 1, DPR = 1;
let fxDirty = true;

function sizeCanvas(cv, c, dpr) {
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  // pixel budget so big retina tablets stay smooth
  DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2400000 / (W * H))));
  sizeCanvas(bg, bgx, DPR);
  sizeCanvas(fx, fxx, DPR);
  fxDirty = true;
  unit = clamp(Math.min(W, H) / 400, 0.8, 1.8);
  rebuildBackground(false);
  if (ed.pic) layoutDock();
  fitPaper();
}

// ---------------------------------------------------------------------------
// Background world: the scene picture is painted once into a cached canvas and
// copied to the screen each frame; only small moving bits are drawn live.
// ---------------------------------------------------------------------------
if (!SCENES.some((sc) => sc.id === save.scene)) save.scene = 'party';
const MODE_PALETTE = { title: 0, fill: 1, paint: 2, number: 3, magic: 4 };
let bgCur = document.createElement('canvas');
let bgPrev = document.createElement('canvas');
let bgFade = 1;
let palette = 0;
let animator = createAnimator(save.scene);

function rebuildBackground(fade) {
  if (fade && bgCur.width === bg.width && bgCur.height === bg.height) {
    const t = bgPrev;
    bgPrev = bgCur;
    bgCur = t;
    bgFade = 0;
  } else {
    bgFade = 1;
  }
  bgCur.width = bg.width;
  bgCur.height = bg.height;
  const c = bgCur.getContext('2d');
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  paintScene(c, W, H, save.scene, palette);
}

// Each screen has its own colors in the Paint Party world.
function setTheme(name) {
  const i = MODE_PALETTE[name] || 0;
  if (palette === i) return;
  palette = i;
  if (save.scene === 'party') rebuildBackground(true);
}

function setScene(id) {
  if (save.scene === id) return;
  save.scene = id;
  persist();
  animator = createAnimator(id);
  rebuildBackground(true);
}

function drawBackground(t, dt) {
  bgx.setTransform(1, 0, 0, 1, 0, 0);
  if (bgFade < 1) {
    bgFade = Math.min(1, bgFade + dt * 1.6);
    bgx.drawImage(bgPrev, 0, 0);
    bgx.globalAlpha = bgFade;
  }
  bgx.drawImage(bgCur, 0, 0);
  bgx.globalAlpha = 1;
  bgx.setTransform(DPR, 0, 0, DPR, 0, 0);
  animator.draw(bgx, W, H, t, dt);
  bgx.globalAlpha = 1;
}

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
  // nothing to draw: leave the cleared layer alone instead of clearing it every frame
  if (!particles.length && !fxDirty) return;
  fxDirty = particles.length > 0;
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
let currentScreen = 'screen-title';
let photoReturn = null;
function showScreen(id) {
  if (id === 'screen-photo') photoReturn = currentScreen;
  currentScreen = id;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  if (id !== 'screen-title') armBack();
}

// Android's back button (and the iOS back swipe in Safari) would leave the app.
// Keep one extra history entry while inside the app and turn "back" into a step back.
let backArmed = false;
function armBack() {
  if (backArmed) return;
  try { history.pushState({ coloring: 1 }, ''); backArmed = true; } catch (err) { /* ignore */ }
}
function stepBack() {
  switch (currentScreen) {
    case 'screen-title': return false;
    case 'screen-photo': showScreen(photoReturn); return true;
    case 'screen-confirm': showScreen(null); return true;
    case 'screen-install': showScreen('screen-title'); return true;
    case 'screen-gallery': case 'screen-themes': goHome(); return true;
    default: // the coloring page, or the "You did it!" card
      ed.pointer = null;
      finishAllAnims();
      persistNow();
      openGallery();
      return true;
  }
}
window.addEventListener('popstate', () => {
  backArmed = false;
  if (stepBack()) sfx.click();
  if (currentScreen !== 'screen-title') armBack();
});
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
  return pictureMarkup(pic, { prefix, fill: (i) => (art && art.f[i]) || null, strokes: art ? art.s : [] });
}

function openGallery(mode) {
  const fresh = !!mode;
  if (mode) ed.mode = mode;
  const info = MODE_INFO[ed.mode];
  $('#mode-chip').textContent = `${info.icon} ${info.name}`;
  $('#tabs').innerHTML = CATEGORIES.map((c) =>
    `<button class="tab${save.cat === c.key ? ' on' : ''}" data-cat="${c.key}">${c.icon} ${c.name}</button>`).join('');
  buildGrid(!fresh);
  setTheme(ed.mode);
  showEditor(false);
  showScreen('screen-gallery');
}

function buildGrid(keepPlace) {
  const scroller = $('.gallery-scroll');
  const top = scroller.scrollTop;
  const cat = save.cat;
  galleryList = PICTURES.filter((p) => cat === 'all' || p.cat === cat);
  const doneSet = save.done[MODE_INFO[ed.mode].done];
  $('#pic-grid').innerHTML = galleryList.map((pic, n) => {
    const veil = ed.mode === 'magic' && !doneSet[pic.id] ? '<span class="sparkle-veil">✨</span>' : '';
    return `<button class="pic-card" data-pic="${pic.id}" style="animation-delay:${Math.min(n, 16) * 25}ms">` +
      `<span class="thumb">${svgOpen()}${thumbMarkup(pic, ed.mode, `t${n}-`)}</svg>${veil}</span>` +
      `<span class="pic-name">${pic.name}</span>` +
      (doneSet[pic.id] ? '<span class="pic-badge">⭐</span>' : '') +
      '</button>';
  }).join('');
  if (!keepPlace) { scroller.scrollTop = 0; return; }
  // coming back from a picture: stay where we were, and make sure that picture is in view
  scroller.scrollTop = top;
  const card = ed.pic && $(`.pic-card[data-pic="${ed.pic.id}"]`);
  if (card && scroller.clientHeight) {
    if (card.offsetTop < scroller.scrollTop || card.offsetTop + card.offsetHeight > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTop = Math.max(0, card.offsetTop - 16);
    }
  }
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
const paper = $('#paper');
let svg = $('#art');

// Rebuild the drawing through the HTML parser (older Safari is unreliable with innerHTML on SVG elements).
function setArt(inner) {
  paper.innerHTML = `<svg id="art" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="${NS}">${inner}</svg>`;
  svg = paper.firstElementChild;
}
function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}
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

// Pick swatch size and columns so the palette fits without squeezing the picture.
function layoutDock() {
  const dock = $('#dock');
  const pal = $('#palette');
  const tools = $('#tools');
  const n = pal.classList.contains('hidden') ? 0 : pal.children.length;
  const GAP = 6;
  const setPal = (cols, sw) => {
    pal.style.gridTemplateColumns = `repeat(${cols}, ${sw}px)`;
    pal.style.setProperty('--sw', `${sw}px`);
  };
  const landscape = window.matchMedia('(min-aspect-ratio: 5/4)').matches;
  if (!landscape) {
    dock.style.width = '';
    if (!n) return;
    const cols = Math.min(n, 7);
    setPal(cols, clamp(Math.floor((pal.clientWidth - (cols - 1) * GAP) / cols), 30, 52));
    return;
  }
  // Landscape: the palette sits beside the picture. Use the biggest swatches that fit
  // the height while keeping the dock narrow enough to leave room for the picture.
  const toolsOn = !tools.classList.contains('hidden');
  const toolsW = toolsOn ? tools.firstElementChild.offsetWidth + tools.lastElementChild.offsetWidth + 10 : 0;
  const toolsH = toolsOn ? tools.offsetHeight + 10 : 0;
  const hintH = $('#dock-hint').classList.contains('hidden') ? 0 : 80;
  if (!n) { dock.style.width = hintH ? `${Math.min(300, Math.max(200, W * 0.3))}px` : ''; return; }
  // (extra room so the picked swatch, which grows, isn't clipped by the dock's edge)
  const avail = $('#stage').clientHeight - 30 - toolsH - 14;
  const maxW = Math.max(240, W * 0.42);
  for (let sw = 48; sw >= 30; sw -= 2) {
    const rows = Math.max(1, Math.floor((avail + 8) / (sw + 8)));
    const cols = Math.ceil(n / rows);
    const width = Math.max(toolsW, cols * sw + (cols - 1) * GAP + 14) + 30;
    if (width <= maxW || sw === 30) {
      setPal(cols, sw);
      dock.style.width = `${width}px`;
      return;
    }
  }
}

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
    setArt(pictureMarkup(pic, {
      prefix: 'ed', editor: true, fill: (i) => ed.art.f[i] || null, strokes: ed.art.s,
    }));
  } else if (ed.mode === 'number') {
    setupNumbers(pic);
  } else {
    setupMagic(pic);
  }

  ed.els = new Map();
  svg.querySelectorAll('.rg').forEach((g) => {
    if (ed.mode === 'magic') return;
    ed.els.set(+g.getAttribute('data-r'), { fl: g.querySelector('.fl'), sk: g.querySelector('.sk') });
  });

  buildDock();
  layoutDock();
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
  // brush size dots show the current color (or magic paint)
  $$('.size-btn i').forEach((i) => {
    i.className = HEX[key] ? '' : `m-${key}`;
    i.style.background = HEX[key] || '';
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
function regionAt(target) {
  const g = target && target.closest ? target.closest('.rg') : null;
  return g ? +g.getAttribute('data-r') : -1;
}
const round1 = (v) => Math.round(v * 10) / 10;

// Input is handled per finger: down / move / up. `e` only needs clientX and clientY,
// so Pointer Events, touches and the mouse can all share this code.
function inputDown(id, e, target) {
  if (ed.pointer) return false; // one finger at a time
  if (!$('#editor').classList.contains('active')) return false;
  const pt = toLocal(e);
  if (ed.mode === 'magic') {
    if (ed.magic.done) return false;
    startReveal(id, pt, e);
    return true;
  }
  const r = regionAt(target);
  if (ed.mode === 'number') {
    numberTap(r, pt, e);
    return false;
  }
  if (ed.tool === 'fill') {
    if (r >= 0) freeFill(r, pt, e);
    return false;
  }
  if (r < 0) return false;
  startStroke(id, r, pt, e);
  return true;
}

function inputMove(id, list) {
  const p = ed.pointer;
  if (!p || p.id !== id || !list.length) return;
  for (const ev of list) {
    const pt = toLocal(ev);
    if (p.kind === 'stroke') extendStroke(pt, ev);
    else extendReveal(pt, ev);
  }
  if (p.kind === 'stroke') {
    p.el.setAttribute('d', strokePath(p.s.p));
  } else {
    p.el.setAttribute('d', strokePath(p.pts));
    const lastEv = list[list.length - 1];
    checkReveal(toLocal(lastEv), lastEv);
  }
}

function inputUp(id) {
  const p = ed.pointer;
  if (!p || p.id !== id) return;
  ed.pointer = null;
  if (p.kind === 'stroke') {
    ed.art.s.push(p.s);
    ed.undo.push({ t: 'stroke', s: p.s, el: p.el });
    updateUndo();
    persist();
    checkFreeDone();
  }
}

const noScroll = { passive: false };
if (window.PointerEvent) {
  paper.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sfx.unlock();
    if (inputDown(e.pointerId, e, e.target)) {
      try { paper.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  }, noScroll);
  paper.addEventListener('pointermove', (e) => {
    if (!ed.pointer || ed.pointer.id !== e.pointerId) return;
    e.preventDefault();
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    inputMove(e.pointerId, list.length ? list : [e]);
  }, noScroll);
  const up = (e) => inputUp(e.pointerId);
  paper.addEventListener('pointerup', up);
  paper.addEventListener('pointercancel', up);
  paper.addEventListener('lostpointercapture', up);
} else {
  // Older browsers (e.g. iPads on iOS 12) have touch events but no pointer events.
  paper.addEventListener('touchstart', (e) => {
    e.preventDefault();
    sfx.unlock();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      inputDown(t.identifier, t, t.target);
    }
  }, noScroll);
  paper.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      inputMove(t.identifier, [t]);
    }
  }, noScroll);
  const end = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) inputUp(e.changedTouches[i].identifier);
  };
  paper.addEventListener('touchend', end);
  paper.addEventListener('touchcancel', end);
  paper.addEventListener('mousedown', (e) => {
    e.preventDefault();
    sfx.unlock();
    inputDown('mouse', e, e.target);
  });
  window.addEventListener('mousemove', (e) => inputMove('mouse', [e]));
  window.addEventListener('mouseup', () => inputUp('mouse'));
}
paper.addEventListener('contextmenu', (e) => e.preventDefault());
paper.addEventListener('animationend', (e) => e.target.classList && e.target.classList.remove('wrong'));

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
    // (the frame time can be a hair earlier than t0, so never go below 0)
    const k = clamp((now - t0) / dur, 0, 1);
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

function startStroke(id, r, pt, e) {
  const s = { r, k: ed.key, w: SIZES[ed.size], p: [round1(pt.x), round1(pt.y)] };
  const reg = ed.els.get(r);
  const el = svgEl('path', { d: strokePath(s.p), stroke: paint(s.k), 'stroke-width': s.w }, reg.sk);
  ed.pointer = { id, kind: 'stroke', s, el, lx: pt.x, ly: pt.y, sound: 0 };
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
    const fs = clamp(reg.room * 1.15, 12, 34).toFixed(1);
    html += `<text class="lbl" data-r="${r}" x="${reg.x.toFixed(1)}" y="${reg.y.toFixed(1)}" font-size="${fs}">${ed.groupOf.get(r).n}</text>`;
  }
  html += '</g>';
  setArt(html);
  svg.querySelectorAll('.lbl').forEach((el) => ed.labels.set(+el.getAttribute('data-r'), el));
}

const groupComplete = (g) => g.regions.every((r) => ed.numDone.has(r));

function markGroup(g) {
  const sw = $(`#palette .swatch[data-key="${g.key}"]`);
  if (!sw) return;
  const done = groupComplete(g);
  sw.classList.toggle('done', done);
  sw.querySelector('span').textContent = done ? '✓' : g.n;
}

// Kids' fingers are big and some parts are tiny: if the tap isn't on a part that wants
// the chosen color, look for one close by (within about 14 screen pixels).
function nearbyWanted(r, pt) {
  const wants = (i) => ed.info.regions.has(i) && !ed.numDone.has(i) && ed.pic.shapes[i].c === ed.key;
  if (r >= 0 && wants(r)) return r;
  const tol = (14 * SIZE) / Math.max(1, svg.getBoundingClientRect().width);
  let best = -1;
  let bestD = Infinity;
  ed.info.regions.forEach((reg, i) => {
    if (!wants(i)) return;
    const d = Math.hypot(reg.x - pt.x, reg.y - pt.y) - reg.room;
    if (d < tol && d < bestD) { best = i; bestD = d; }
  });
  return best >= 0 ? best : r;
}

function numberTap(r, pt, e) {
  r = nearbyWanted(r, pt);
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
  setArt(
    `<defs><mask id="reveal-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${SIZE}" height="${SIZE}">` +
    `<rect width="${SIZE}" height="${SIZE}" fill="#000"/>` +
    `<g class="ms" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="${REVEAL_W}"></g>` +
    '</mask></defs>' +
    `<g>${pictureMarkup(pic, { prefix: 'mb', plain: true })}</g>` +
    `<g mask="url(#reveal-mask)">${colored}</g>`);
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

function startReveal(id, pt, e) {
  const m = ed.magic;
  const pts = [round1(pt.x), round1(pt.y)];
  ed.pointer = { id, kind: 'reveal', el: svgEl('path', {}, m.ms), pts, lx: pt.x, ly: pt.y };
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
    const k = clamp((now - t0) / 800, 0, 1);
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
    const cv = await svgToCanvas(svg);
    const name = `coloring-${ed.pic.id}.png`;
    const blob = await canvasToBlob(cv);
    let file = null;
    try { file = new File([blob], name, { type: 'image/png' }); } catch (err) { /* very old browsers */ }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: ed.pic.name });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    if (IS_IOS) {
      // Older iPads can't download files: show the picture so it can be saved with a long press.
      $('#photo-img').src = cv.toDataURL('image/png');
      sfx.sparkle();
      showScreen('screen-photo');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    sfx.sparkle();
    showBanner('Saved!', 'Your picture is in your downloads');
  } catch (err) {
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

function buildThemeGrid() {
  const grid = $('#theme-grid');
  grid.querySelectorAll('canvas').forEach((c) => { c.width = 0; c.height = 0; });
  grid.innerHTML = '';
  for (const sc of SCENES) {
    const btn = document.createElement('button');
    btn.className = 'theme-card' + (sc.id === save.scene ? ' selected' : '');
    btn.setAttribute('aria-label', sc.name);
    btn.setAttribute('aria-pressed', String(sc.id === save.scene));
    btn.appendChild(document.createElement('canvas'));
    btn.insertAdjacentHTML('beforeend', `<span class="check">✓</span><span class="theme-name">${sc.icon} ${sc.name}</span>`);
    btn.addEventListener('click', () => {
      sfx.unlock();
      sfx.chime([0, 4, 7], 784, 0.05);
      setScene(sc.id);
      grid.querySelectorAll('.theme-card').forEach((c) => {
        const on = c === btn;
        c.classList.toggle('selected', on);
        c.setAttribute('aria-pressed', String(on));
      });
    });
    grid.appendChild(btn);
  }
  // paint the little previews once the cards have a size
  requestAnimationFrame(() => {
    grid.querySelectorAll('canvas').forEach((cv, i) => {
      const r = cv.getBoundingClientRect();
      const w = Math.max(60, r.width);
      const h = Math.max(75, r.height);
      const sc = Math.min(2, window.devicePixelRatio || 1);
      // draw the scene as if on a phone-sized screen, then shrink it into the card
      const vw = 360;
      const vh = (360 * h) / w;
      cv.width = Math.round(w * sc);
      cv.height = Math.round(h * sc);
      const c = cv.getContext('2d');
      c.scale((w * sc) / vw, (h * sc) / vh);
      paintScene(c, vw, vh, SCENES[i].id, 0);
      const anim = createAnimator(SCENES[i].id);
      for (let k = 0; k < 3; k++) anim.draw(c, vw, vh, 2 + k, k === 0 ? 0 : 1.2);
    });
  });
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
    case 'themes': buildThemeGrid(); showScreen('screen-themes'); break;
    case 'home': goHome(); break;
    case 'gallery': finishAllAnims(); persistNow(); openGallery(); break;
    case 'undo': undo(); break;
    case 'clear':
      if (ed.mode === 'magic') { sfx.whoosh(); openPicture(ed.pic); } else showScreen('screen-confirm');
      break;
    case 'clear-yes': showScreen(null); clearPicture(); break;
    case 'close':
      if (currentScreen === 'screen-photo') showScreen(photoReturn);
      else if (currentScreen === 'screen-install') showScreen('screen-title');
      else showScreen(null);
      break;
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
        installPrompt.userChoice.then(() => {
          installPrompt = null;
          $('#install-btn').classList.add('hidden');
        }, () => {});
      } else if (IS_IOS) {
        // Safari can't show an install prompt, so show how to do it by hand.
        $('#install-where').textContent = IS_IPAD
          ? 'On iPad, the Share button is at the top, next to the address bar.'
          : 'On iPhone, the Share button is at the bottom of the screen. Tap the bottom edge if you can\'t see it.';
        showScreen('screen-install');
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
// iPhone / iPad: there is no install prompt, so the button explains how. Once the app
// is opened from the home screen it runs standalone and the button goes away.
if (IS_IOS && !isInstalled()) $('#install-btn').classList.remove('hidden');

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
installDefs();
window.addEventListener('resize', resize);
// iOS 12 sometimes reports the old size during the rotation itself
window.addEventListener('orientationchange', () => setTimeout(resize, 300));
// unlock sound on the very first touch anywhere (iOS needs it inside a tap)
['pointerdown', 'touchstart', 'touchend', 'mousedown'].forEach((type) => {
  window.addEventListener(type, () => sfx.unlock(), { capture: true, passive: true });
});
// stop pinch-zoom on older iOS, which ignores user-scalable=no
document.addEventListener('gesturestart', (e) => e.preventDefault());
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
window.__coloring = { ed, save, openGallery, openPicture, showScreen, PICTURES };
