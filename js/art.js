// Turns picture data into SVG, finds where each part's number label goes, and
// exports finished pictures as PNG files.
import { PALETTE, MAGIC, INK, star } from './pictures.js';

export const SIZE = 400;
export const OUTLINE = 5;

const HEX = {};
PALETTE.forEach((p) => { HEX[p.key] = p.hex; });
const MAGIC_KEYS = new Set(MAGIC.map((m) => m.key));

/** SVG paint value for a palette or magic key. */
export function paint(key) {
  if (HEX[key]) return HEX[key];
  if (MAGIC_KEYS.has(key)) return `url(#mg-${key})`;
  return '#ffffff';
}

// Sparkle (4-point star) path
const twinkle = (x, y, r) =>
  `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;

// Magic paints. userSpaceOnUse so they look the same on big and small parts.
export const DEFS = `
<linearGradient id="mg-rainbow" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="150" y2="150" spreadMethod="repeat">
  <stop offset="0" stop-color="#ff4d5e"/><stop offset=".17" stop-color="#ff9a2e"/>
  <stop offset=".34" stop-color="#ffd93b"/><stop offset=".5" stop-color="#5cd65c"/>
  <stop offset=".67" stop-color="#3d9bff"/><stop offset=".84" stop-color="#9d5cff"/>
  <stop offset="1" stop-color="#ff4d5e"/>
</linearGradient>
<linearGradient id="mg-gold" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#fff3a6"/><stop offset=".5" stop-color="#ffc83a"/><stop offset="1" stop-color="#ffa21f"/>
</linearGradient>
<pattern id="mg-glitter" patternUnits="userSpaceOnUse" width="36" height="36">
  <rect width="36" height="36" fill="url(#mg-gold)"/>
  <path d="${twinkle(9, 9, 6)}" fill="#fff"/><path d="${twinkle(27, 25, 4.5)}" fill="#fff"/>
  <circle cx="26" cy="8" r="1.8" fill="#ff7ac6"/><circle cx="9" cy="27" r="1.8" fill="#8fdcff"/>
  <circle cx="18" cy="17" r="1.3" fill="#fff"/>
</pattern>
<pattern id="mg-dots" patternUnits="userSpaceOnUse" width="24" height="24">
  <rect width="24" height="24" fill="#ff7ac6"/>
  <circle cx="6" cy="6" r="4.5" fill="#fff"/><circle cx="18" cy="18" r="4.5" fill="#fff"/>
</pattern>
<pattern id="mg-candy" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(45)">
  <rect width="20" height="20" fill="#ff4d5e"/><rect width="10" height="20" fill="#fff"/>
</pattern>
<pattern id="mg-stars" patternUnits="userSpaceOnUse" width="40" height="40">
  <rect width="40" height="40" fill="#7d4dff"/>
  <path d="${star(10, 11, 7.5, 3.2)}" fill="#ffd93b"/><path d="${star(30, 31, 7.5, 3.2)}" fill="#ffd93b"/>
  <circle cx="31" cy="10" r="1.7" fill="#fff"/><circle cx="10" cy="31" r="1.7" fill="#fff"/>
</pattern>`;

export function installDefs() {
  document.body.insertAdjacentHTML('afterbegin',
    `<svg class="defs-holder" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${DEFS}</defs></svg>`);
}

/** Path data for a brush stroke stored as a flat [x0, y0, x1, y1, ...] list. */
export function strokePath(p) {
  let d = `M${p[0]} ${p[1]}`;
  if (p.length <= 2) return d + 'l0.01 0';
  for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
  return d;
}

export function strokeMarkup(s) {
  return `<path d="${strokePath(s.p)}" stroke="${paint(s.k)}" stroke-width="${s.w}"/>`;
}

/**
 * SVG content for a picture.
 * opts.prefix  unique id prefix (clip paths need ids that are unique on the page)
 * opts.fill    (index) => palette key or null (white)
 * opts.strokes list of { r, k, w, p } brush strokes
 * opts.editor  true: add a clip path and stroke layer to every part
 * opts.plain   true: every part white (used under Magic Reveal)
 */
export function pictureMarkup(pic, opts = {}) {
  const { prefix = 'p', fill = () => null, strokes = [], editor = false } = opts;
  const byRegion = new Map();
  for (const s of strokes) {
    if (!byRegion.has(s.r)) byRegion.set(s.r, []);
    byRegion.get(s.r).push(s);
  }
  let defs = '';
  let body = '';
  pic.shapes.forEach((s, i) => {
    if (s.c) {
      const key = opts.plain ? null : fill(i);
      const own = byRegion.get(i);
      const clip = editor || own;
      if (clip) defs += `<clipPath id="${prefix}c${i}"><path d="${s.d}"/></clipPath>`;
      body += `<g class="rg" data-r="${i}"><path class="fl" d="${s.d}" fill="${key ? paint(key) : '#ffffff'}"/>`;
      if (clip) {
        body += `<g class="sk" clip-path="url(#${prefix}c${i})" fill="none" stroke-linecap="round" stroke-linejoin="round">`;
        if (own) body += own.map(strokeMarkup).join('');
        body += '</g>';
      }
      if (!s.bg) {
        body += `<path class="ol" d="${s.d}" fill="none" stroke="${INK}" stroke-width="${OUTLINE}" stroke-linejoin="round"/>`;
      }
      body += '</g>';
    } else if (s.ink) {
      const white = s.ink === '#fff';
      body += `<path class="nk" d="${s.d}" fill="${s.ink}"${white ? '' : ` stroke="${INK}" stroke-width="2"`}/>`;
    } else if (s.line) {
      body += `<path class="nk" d="${s.d}" fill="none" stroke="${INK}" stroke-width="${s.line}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  });
  return (defs ? `<defs>${defs}</defs>` : '') + body;
}

export function svgOpen(cls = '') {
  return `<svg class="${cls}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">`;
}

// ---------------------------------------------------------------------------
// Region analysis: which parts can actually be seen, and the roomiest spot in
// each one (used to place Color by Number labels). Each part is drawn in its
// own ID color on a small canvas, then a distance transform finds the point
// farthest from any edge.
// ---------------------------------------------------------------------------
const analysisCache = new Map();
const GRID = 200;

export function analyze(pic) {
  if (analysisCache.has(pic.id)) return analysisCache.get(pic.id);
  const k = GRID / SIZE;
  const cv = document.createElement('canvas');
  cv.width = cv.height = GRID;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, GRID, GRID);
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const idColor = (i) => [(i * 7 + 3) % 256, (i * 53 + 40) % 256, (i * 101 + 90) % 256];
  const lookup = new Map();
  pic.shapes.forEach((s, i) => {
    const path = new Path2D(s.d);
    if (s.c) {
      const [r, g, b] = idColor(i);
      lookup.set((r << 16) | (g << 8) | b, i);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fill(path);
      if (!s.bg) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = OUTLINE;
        ctx.stroke(path);
      }
    } else if (s.ink) {
      ctx.fillStyle = '#000';
      ctx.fill(path);
    } else if (s.line) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = s.line;
      ctx.stroke(path);
    }
  });

  const data = ctx.getImageData(0, 0, GRID, GRID).data;
  const N = GRID * GRID;
  const ids = new Int16Array(N);
  for (let p = 0; p < N; p++) {
    const key = (data[p * 4] << 16) | (data[p * 4 + 1] << 8) | data[p * 4 + 2];
    const id = lookup.get(key);
    ids[p] = id === undefined ? -1 : id;
  }

  // Chamfer distance transform (3-4 weights) from every edge pixel.
  const INF = 1e9;
  const dist = new Float32Array(N);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const p = y * GRID + x;
      const id = ids[p];
      const edge = id < 0 || x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1 ||
        ids[p - 1] !== id || ids[p + 1] !== id || ids[p - GRID] !== id || ids[p + GRID] !== id;
      dist[p] = edge ? 0 : INF;
    }
  }
  for (let y = 1; y < GRID - 1; y++) {
    for (let x = 1; x < GRID - 1; x++) {
      const p = y * GRID + x;
      if (!dist[p]) continue;
      dist[p] = Math.min(dist[p], dist[p - 1] + 3, dist[p - GRID] + 3, dist[p - GRID - 1] + 4, dist[p - GRID + 1] + 4);
    }
  }
  for (let y = GRID - 2; y > 0; y--) {
    for (let x = GRID - 2; x > 0; x--) {
      const p = y * GRID + x;
      if (!dist[p]) continue;
      dist[p] = Math.min(dist[p], dist[p + 1] + 3, dist[p + GRID] + 3, dist[p + GRID + 1] + 4, dist[p + GRID - 1] + 4);
    }
  }

  const best = new Map();
  for (let p = 0; p < N; p++) {
    const id = ids[p];
    if (id < 0) continue;
    let b = best.get(id);
    if (!b) { b = { d: -1, p: 0, area: 0 }; best.set(id, b); }
    b.area++;
    if (dist[p] > b.d) { b.d = dist[p]; b.p = p; }
  }

  const regions = new Map();
  for (const [i, b] of best) {
    const room = b.d / 3 / k; // distance to nearest edge, in sheet units
    if (room < 4.5) continue;
    regions.set(i, {
      x: ((b.p % GRID) + 0.5) / k,
      y: (Math.floor(b.p / GRID) + 0.5) / k,
      room,
      area: b.area / (k * k),
    });
  }
  const result = {
    regions,
    colorable: pic.shapes.map((s, i) => (s.c ? i : -1)).filter((i) => i >= 0),
  };
  analysisCache.set(pic.id, result);
  return result;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export async function svgToCanvas(svgEl, px = 1200) {
  const clone = svgEl.cloneNode(true);
  clone.querySelectorAll('.no-export').forEach((el) => el.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', px);
  clone.setAttribute('height', px);
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  // add the magic paint patterns right after the opening <svg> tag
  const str = new XMLSerializer().serializeToString(clone)
    .replace(/<svg[^>]*>/, (open) => `${open}<defs>${DEFS}</defs>`);
  const img = new Image();
  // onload rather than img.decode(): older Safari rejects decode() for SVG images
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  });
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, px, px);
  ctx.drawImage(img, 0, 0, px, px);
  return cv;
}

export function canvasToBlob(cv) {
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}
