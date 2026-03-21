(function () {

const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');

const COLOR_STOPS = [
  { r: 17, g: 17, b: 17 },
  { r: 40, g: 40, b: 40 },
  { r: 13, g: 13, b: 13 },
  { r: 45, g: 45, b: 45 },
  { r: 0,  g: 0,  b: 0  },
];

const dpr = window.devicePixelRatio || 1;
let W, H;
let points = [];
let physicsFrame = 0;
let rafId = null;

// Seeded PRNG (Mulberry32) — ensures identical initial layout on every page load
function makeRand(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const MAX_SPEED = 0.08;
const MAX_EDGE  = 160 * dpr;

function resize() {
  W = canvas.width  = canvas.offsetWidth  * dpr;
  H = canvas.height = canvas.offsetHeight * dpr;
}

function lerpColor(a, b, t) {
  const s = t * t * (3 - 2 * t);
  return {
    r: a.r + (b.r - a.r) * s,
    g: a.g + (b.g - a.g) * s,
    b: a.b + (b.b - a.b) * s,
  };
}

function getPointColor(p) {
  return lerpColor(COLOR_STOPS[p.colorIdx], COLOR_STOPS[p.nextColorIdx], p.colorT);
}

// Advance physics one frame (no rendering). Used for fast-forward on page load.
function stepPhysics() {
  const margin = 200 * dpr;
  for (const p of points) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < -margin)    p.vx =  Math.abs(p.vx);
    if (p.x > W + margin) p.vx = -Math.abs(p.vx);
    if (p.y < -margin)    p.vy =  Math.abs(p.vy);
    if (p.y > H + margin) p.vy = -Math.abs(p.vy);

    p.colorT += p.colorSpeed;
    if (p.colorT >= 1) {
      p.colorT = 0;
      p.colorIdx = p.nextColorIdx;
      p.nextColorIdx = (p.colorIdx + 1 + Math.floor(p.rand() * (COLOR_STOPS.length - 1))) % COLOR_STOPS.length;
    }
  }
}

function init() {
  resize();
  points = [];

  const rand = makeRand(42); // fixed seed — same layout on every page load
  const spacing = 80 * dpr;
  const cols = Math.ceil(W / spacing) + 4;
  const rows = Math.ceil(H / spacing) + 4;
  const offsetX = -2 * spacing;
  const offsetY = -2 * spacing;

  let pointIdx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jitterX = (rand() - 0.5) * spacing * 0.7;
      const jitterY = (rand() - 0.5) * spacing * 0.7;
      const colorIdx = Math.floor(rand() * COLOR_STOPS.length);
      points.push({
        x: offsetX + c * spacing + jitterX,
        y: offsetY + r * spacing + jitterY,
        vx: (rand() - 0.5) * MAX_SPEED * dpr,
        vy: (rand() - 0.5) * MAX_SPEED * dpr,
        colorIdx: colorIdx,
        nextColorIdx: (colorIdx + 1) % COLOR_STOPS.length,
        colorT: rand(),
        colorSpeed: 0.00008 + rand() * 0.00015,
        rand: makeRand(1000 + pointIdx), // per-point seeded PRNG for deterministic color transitions
      });
      pointIdx++;
    }
  }

  // Fast-forward to match the current clock
  const target = clockFrame();
  if (target > 72000) {
    // Epoch too old — reset so fast-forward stays fast
    epoch = Date.now();
    localStorage.setItem('bgEpoch', String(epoch));
    physicsFrame = 0;
  } else {
    for (let f = 0; f < target; f++) stepPhysics();
    physicsFrame = target;
  }
}

// === Delaunay Triangulation (Bowyer-Watson) ===
function triangulate(pts) {
  const margin = 2000 * dpr;
  const st = [
    { x: -margin,        y: -margin,        idx: -1 },
    { x: W + margin * 2, y: -margin,        idx: -2 },
    { x: W / 2,          y: H + margin * 2, idx: -3 },
  ];

  let triangles = [{ verts: [st[0], st[1], st[2]], cc: null }];
  computeCC(triangles[0]);

  for (const p of pts) {
    const bad = triangles.filter(t => inCircumcircle(p, t.cc));
    const edges = [];
    for (const t of bad) {
      for (let i = 0; i < 3; i++) {
        const a = t.verts[i], b = t.verts[(i + 1) % 3];
        let shared = false;
        for (const o of bad) {
          if (o === t) continue;
          for (let j = 0; j < 3; j++) {
            const oa = o.verts[j], ob = o.verts[(j + 1) % 3];
            if ((a === oa && b === ob) || (a === ob && b === oa)) { shared = true; break; }
          }
          if (shared) break;
        }
        if (!shared) edges.push([a, b]);
      }
    }
    triangles = triangles.filter(t => !bad.includes(t));
    for (const [a, b] of edges) {
      const nt = { verts: [a, b, p], cc: null };
      computeCC(nt);
      triangles.push(nt);
    }
  }
  return triangles.filter(t => t.verts.every(v => v.idx >= 0));
}

function computeCC(t) {
  const [a, b, c] = t.verts;
  const D = 2 * (a.x*(b.y-c.y) + b.x*(c.y-a.y) + c.x*(a.y-b.y));
  if (Math.abs(D) < 1e-10) { t.cc = { cx: 0, cy: 0, r2: Infinity }; return; }
  const ux = ((a.x*a.x+a.y*a.y)*(b.y-c.y)+(b.x*b.x+b.y*b.y)*(c.y-a.y)+(c.x*c.x+c.y*c.y)*(a.y-b.y))/D;
  const uy = ((a.x*a.x+a.y*a.y)*(c.x-b.x)+(b.x*b.x+b.y*b.y)*(a.x-c.x)+(c.x*c.x+c.y*c.y)*(b.x-a.x))/D;
  const dx = a.x - ux, dy = a.y - uy;
  t.cc = { cx: ux, cy: uy, r2: dx*dx + dy*dy };
}

function inCircumcircle(p, cc) {
  const dx = p.x - cc.cx, dy = p.y - cc.cy;
  return dx*dx + dy*dy < cc.r2;
}

function edgeDist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx*dx + dy*dy);
}

function animate(ts) {
  // Step physics to match the clock — decoupled from frame rate for cross-page sync
  const target = Math.round((ts + performance.timeOrigin - epoch) * 60 / 1000);
  const steps = Math.max(0, Math.min(target - physicsFrame, 10));
  for (let i = 0; i < steps; i++) {
    stepPhysics();
    physicsFrame++;
  }

  ctx.clearRect(0, 0, W, H);

  const indexed = points.map((p, i) => ({ x: p.x, y: p.y, idx: i }));
  const triangles = triangulate(indexed);

  // Filled triangles
  for (const t of triangles) {
    const [a, b, c] = t.verts;
    const longest = Math.max(edgeDist(a,b), edgeDist(b,c), edgeDist(c,a));
    if (longest > MAX_EDGE) continue;

    const ca1 = getPointColor(points[a.idx]);
    const cb1 = getPointColor(points[b.idx]);
    const cc1 = getPointColor(points[c.idx]);
    const avg = {
      r: (ca1.r + cb1.r + cc1.r) / 3,
      g: (ca1.g + cb1.g + cc1.g) / 3,
      b: (ca1.b + cb1.b + cc1.b) / 3,
    };
    const fillAlpha = (1 - longest / MAX_EDGE) * 0.045;
    ctx.fillStyle = `rgba(${avg.r|0},${avg.g|0},${avg.b|0},${fillAlpha})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fill();
  }

  // Edges
  const drawnEdges = new Set();
  for (const t of triangles) {
    const [a, b, c] = t.verts;
    for (const [e1, e2] of [[a,b],[b,c],[c,a]]) {
      const key = Math.min(e1.idx,e2.idx) + ':' + Math.max(e1.idx,e2.idx);
      if (drawnEdges.has(key)) continue;
      drawnEdges.add(key);
      const d = edgeDist(e1, e2);
      if (d > MAX_EDGE) continue;
      const alpha = (1 - d / MAX_EDGE) * 0.4;
      const ce1 = getPointColor(points[e1.idx]);
      const ce2 = getPointColor(points[e2.idx]);
      const er = ((ce1.r + ce2.r) / 2) | 0;
      const eg = ((ce1.g + ce2.g) / 2) | 0;
      const eb = ((ce1.b + ce2.b) / 2) | 0;
      ctx.strokeStyle = `rgba(10,132,255,${alpha * 1})`; //this line changes the mesh lines color
      ctx.lineWidth = 0.8 * dpr;
      ctx.beginPath();
      ctx.moveTo(e1.x, e1.y);
      ctx.lineTo(e2.x, e2.y);
      ctx.stroke();
    }
  }

  rafId = requestAnimationFrame(animate);
}

// Epoch-based sync: one shared start timestamp, every page derives its frame from it.
let epoch = parseInt(localStorage.getItem('bgEpoch') || '0', 10);
if (!epoch) {
  epoch = Date.now();
  localStorage.setItem('bgEpoch', String(epoch));
}

function clockFrame() {
  return Math.round((Date.now() - epoch) * 60 / 1000);
}

// On the projects page, skip the animation loop to save resources.
// Cross-page sync is epoch-based, so other pages fast-forward on load.
const isProjectsPage = !!document.querySelector('.projects-page');

init();
window.addEventListener('resize', () => { init(); });
if (isProjectsPage) {
  // Draw one static frame so the mesh is visible but not animating
  requestAnimationFrame(function(ts) { animate(ts); cancelAnimationFrame(rafId); rafId = null; });
} else {
  rafId = requestAnimationFrame(animate);
}

// Re-sync on bfcache restore (browser back/forward)
window.addEventListener('pageshow', (e) => {
  if (e.persisted && !isProjectsPage) {
    if (rafId) cancelAnimationFrame(rafId);
    init();
    rafId = requestAnimationFrame(animate);
  }
});

// Re-sync when switching back to this tab — background tabs get rAF throttled
// so physics falls behind; re-init catches up instantly.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !isProjectsPage) {
    if (rafId) cancelAnimationFrame(rafId);
    init();
    rafId = requestAnimationFrame(animate);
  }
});

})();
