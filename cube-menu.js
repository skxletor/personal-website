/* ── Cube menu ────────────────────────────────────────────────────────────
   A software-rendered cube drawn into a small pixel buffer and upscaled by
   CSS, so it stays chunky. Each face is a textured quad: the label is baked
   into an alpha mask and mapped through a homography, which puts the text
   in the plane of the face instead of floating over it.

   Drag to spin, let go and it coasts. The cube is never re-oriented for you;
   labels stay readable by rotating within their own face instead.
   ───────────────────────────────────────────────────────────────────────── */

(function () {
    'use strict';

    const canvas = document.getElementById('cube');
    const caption = document.getElementById('cube-caption');
    if (!canvas) return;

    const CAM_Z = 4.6;               // camera distance, in cube half-units
    // Cube half-width as a fraction of the buffer. A corner swings out to
    // ~1.87x this (worst at z=0.65, where it is both wide and near the camera)
    // and the bob adds another ~0.13x, so anything above ~0.24 clips its own
    // canvas edge. The canvas is sized up to compensate — see index.html.
    const FILL = 0.235;
    const PIXEL = 2.9;               // css px per rendered pixel — the chunk size
    const RES_MIN = 40, RES_MAX = 256;

    // Radians of spin per fraction-of-canvas dragged, set so the near face
    // tracks the cursor 1:1 — drag 40px and the surface under it moves 40px.
    // Independent of buffer size, since FOCAL scales with it.
    const DRAG_GAIN = (CAM_Z - 1) / (FILL * CAM_Z);

    const reduceMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ctx = canvas.getContext('2d', { alpha: false });

    /* Touch has no hover, so hover-to-reveal would hide every label. On those
       devices each visible face shows its label unhighlighted, the same way the
       JR face always does.

       Three signals, because no single one is dependable: `hover: none` misses
       hybrids, `pointer: coarse` catches touch that reports a hover capability,
       and the width test matches the CSS breakpoint so a narrowed desktop
       window behaves like the phone layout it is imitating. Re-read on every
       resize rather than latched at load, so rotating a phone or dragging a
       window across the breakpoint takes effect. */
    let alwaysLabel = false;

    function touchLayout() {
        const mm = window.matchMedia;
        if (mm && (mm('(hover: none)').matches || mm('(pointer: coarse)').matches)) return true;
        return (window.innerWidth || 0) <= 640;
    }

    // The buffer tracks the displayed size so the pixels stay the same physical
    // chunk whatever the viewport does. TEX follows it, keeping the label
    // texture near 1:1 with the face — sample it down much further and the
    // glyph strokes drop out.
    let RES = 0, HALF = 0, FOCAL = 0, TEX = 0, img = null, buf = null;
    let masksStale = true;

    function resize() {
        alwaysLabel = touchLayout();
        const w = canvas.getBoundingClientRect().width || 280;
        const next = Math.max(RES_MIN, Math.min(RES_MAX, Math.round(w / PIXEL)));
        if (next === RES) return;
        RES = next;
        HALF = RES / 2;
        FOCAL = FILL * RES * CAM_Z;
        canvas.width = RES;
        canvas.height = RES;
        img = ctx.createImageData(RES, RES);
        buf = new Uint32Array(img.data.buffer);

        const tex = Math.max(40, Math.min(160, Math.round(RES * 0.62)));
        if (tex !== TEX) { TEX = tex; masksStale = true; }
    }
    resize();
    window.addEventListener('resize', resize);

    /* ── Faces ────────────────────────────────────────────────────────────
       n = outward normal, r = in-plane right, u = in-plane up. Corners are
       wound (0,0) (1,0) (1,1) (0,1) in texture space so the label reads
       upright from outside. Most relevant sits at the front, least at back. */

    const FACES = [
        { n: [0, 0, 1],  r: [1, 0, 0],  u: [0, 1, 0],  lines: ['ABOUT', 'ME'],      href: 'home/',     label: 'About Me' },
        { n: [1, 0, 0],  r: [0, 0, -1], u: [0, 1, 0],  lines: ['PROJECTS'],         href: 'projects/', label: 'Projects' },
        { n: [-1, 0, 0], r: [0, 0, 1],  u: [0, 1, 0],  lines: ['TBD'],              href: 'resume/',   label: 'TBD' },
        { n: [0, 1, 0],  r: [1, 0, 0],  u: [0, 0, -1], lines: ['PARTNER', 'LOGIN'], href: 'login/',    label: 'Partner Login' },
        { n: [0, 0, -1], r: [-1, 0, 0], u: [0, 1, 0],  lines: ['CONTACT'],          href: 'contact/',  label: 'Contact' },
        // no href, so it never highlights, never navigates, and stays out of
        // the caption. `always` draws its label unhighlighted on every frame,
        // since a face that can't be hovered would otherwise never show one.
        { n: [0, -1, 0], r: [1, 0, 0],  u: [0, 0, 1],  lines: ['JR'],               href: null,        label: '', scale: 2, always: true }
    ];

    // The cube is a white wireframe on black: faces sit at background colour
    // and only the hovered one lifts to grey and shows its label.
    const FACE_HOT = [48, 48, 48];
    const INK = [255, 255, 255];
    const EDGE = [255, 255, 255];

    /* ── Label textures ───────────────────────────────────────────────────
       Each face bakes its label to an alpha mask, drawn only while hovered. */

    function buildMask(face) {
        const c = document.createElement('canvas');
        c.width = c.height = TEX;
        const g = c.getContext('2d');

        // no frame or ticks — the face edges are the only border. Text runs as
        // wide as the face allows, shrinking to fit.
        const maxW = TEX * 0.88;
        let size = Math.round(TEX * 0.21 * (face.scale || 1));
        if ('letterSpacing' in g) g.letterSpacing = (TEX * 0.01).toFixed(2) + 'px';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (;;) {
            g.font = '700 ' + size + 'px "Space Grotesk", system-ui, sans-serif';
            let widest = 0;
            for (let i = 0; i < face.lines.length; i++) {
                widest = Math.max(widest, g.measureText(face.lines[i]).width);
            }
            // floor is low so a long word on a small phone shrinks to fit
            // rather than running off the edge of its texture
            if (widest <= maxW || size <= 5) break;
            size -= 1;
        }
        g.fillStyle = '#fff';
        const lh = size * 1.18;
        const top = TEX / 2 - (face.lines.length - 1) * lh / 2;
        for (let i = 0; i < face.lines.length; i++) {
            g.fillText(face.lines[i], TEX / 2, top + i * lh);
        }

        const px = g.getImageData(0, 0, TEX, TEX).data;
        const mask = new Uint8Array(TEX * TEX);
        for (let i = 0, j = 3; i < mask.length; i++, j += 4) mask[i] = px[j];
        face.mask = mask;
    }

    // Baked lazily from render(), so a resize that changes TEX just re-bakes on
    // the next frame rather than on every resize event.
    function buildAllMasks() { FACES.forEach(buildMask); masksStale = false; }

    // webfont may land after first paint; bake again once it has
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { masksStale = true; }).catch(function () {});
    }

    /* ── Vector / matrix helpers ──────────────────────────────────────────
       Orientation is a 3x3 row-major matrix. Drag torques are left-multiplied,
       which keeps them in camera space and dodges gimbal lock. */

    function normalize(v) {
        const l = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / l, v[1] / l, v[2] / l];
    }
    function cross(a, b) {
        return [a[1] * b[2] - a[2] * b[1],
                a[2] * b[0] - a[0] * b[2],
                a[0] * b[1] - a[1] * b[0]];
    }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

    function apply(m, v) {
        return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
                m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
                m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
    }

    function mul(a, b) {
        const o = new Float64Array(9);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
            }
        }
        return o;
    }

    function axisAngle(axis, ang) {
        const a = normalize(axis);
        const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
        const x = a[0], y = a[1], z = a[2];
        return new Float64Array([
            t * x * x + c,     t * x * y - s * z, t * x * z + s * y,
            t * x * y + s * z, t * y * y + c,     t * y * z - s * x,
            t * x * z - s * y, t * y * z + s * x, t * z * z + c
        ]);
    }

    // floating point drift accumulates over thousands of frames; re-square it
    function orthonormalize(m) {
        let x = normalize([m[0], m[3], m[6]]);
        let y = [m[1], m[4], m[7]];
        const d = dot(x, y);
        y = normalize([y[0] - x[0] * d, y[1] - x[1] * d, y[2] - x[2] * d]);
        const z = cross(x, y);
        m[0] = x[0]; m[3] = x[1]; m[6] = x[2];
        m[1] = y[0]; m[4] = y[1]; m[7] = y[2];
        m[2] = z[0]; m[5] = z[1]; m[8] = z[2];
    }

    /* ── Opening pose ─────────────────────────────────────────────────────
       Where the cube sits before anyone touches it. Not face-on — that reads
       flat — but yawed left and pitched down, so About Me is front and centre
       with Projects and Partner Login flanking it. */

    const REST_DIR = normalize([-0.55, -0.36, 1]);
    const REST_UP = (function () {
        const up = [0, 1, 0];
        const d = dot(up, REST_DIR);
        return normalize([up[0] - REST_DIR[0] * d, up[1] - REST_DIR[1] * d, up[2] - REST_DIR[2] * d]);
    })();

    // Columns of M are the images of the front face's local right / up / normal,
    // which for the front face are just the identity axes.
    const REST_RIGHT = cross(REST_UP, REST_DIR);
    let M = new Float64Array([
        REST_RIGHT[0], REST_UP[0], REST_DIR[0],
        REST_RIGHT[1], REST_UP[1], REST_DIR[1],
        REST_RIGHT[2], REST_UP[2], REST_DIR[2]
    ]);

    let omegaX = 0, omegaY = 0;
    let dragging = false, dragMoved = 0;
    let lastX = 0, lastY = 0;
    let pointer = null;              // canvas-space pointer, or null
    let hovered = -1;

    /* ── Per-frame face state ─────────────────────────────────────────────
       Visible faces stash their inverse homography so hit-testing reuses the
       exact geometry that was drawn. */

    const visible = [];

    function project(p, ox, oy, oz) {
        const z = p[2] + oz;
        const k = FOCAL / (CAM_Z - z);
        return [HALF + (p[0] + ox) * k, HALF - (p[1] + oy) * k];
    }

    // unit square -> quad, per Heckbert. Returns the adjugate (screen -> uv);
    // the determinant cancels in the u/w, v/w divide so it can be skipped.
    function inverseHomography(q) {
        const x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1];
        const x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
        const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
        let a, b, c, d, e, f, g, h;

        if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
            a = x1 - x0; b = x2 - x1; c = x0;
            d = y1 - y0; e = y2 - y1; f = y0;
            g = 0; h = 0;
        } else {
            const dx1 = x1 - x2, dx2 = x3 - x2;
            const dy1 = y1 - y2, dy2 = y3 - y2;
            const den = dx1 * dy2 - dx2 * dy1;
            if (Math.abs(den) < 1e-9) return null;
            g = (sx * dy2 - dx2 * sy) / den;
            h = (dx1 * sy - sx * dy1) / den;
            a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0;
            d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
        }

        return [
            e - f * h,     c * h - b,     b * f - c * e,
            f * g - d,     a - c * g,     c * d - a * f,
            d * h - e * g, b * g - a * h, a * e - b * d
        ];
    }

    function uvAt(inv, x, y) {
        const w = inv[6] * x + inv[7] * y + inv[8];
        if (w === 0) return null;
        return [(inv[0] * x + inv[1] * y + inv[2]) / w,
                (inv[3] * x + inv[4] * y + inv[5]) / w];
    }

    /* ── Rasterizer ───────────────────────────────────────────────────── */

    function px(i, r, g, b) {
        buf[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
    }

    function line(x0, y0, x1, y1, col) {
        x0 = Math.round(x0); y0 = Math.round(y0);
        x1 = Math.round(x1); y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (let guard = 0; guard < 4096; guard++) {
            if (x0 >= 0 && x0 < RES && y0 >= 0 && y0 < RES) {
                px(y0 * RES + x0, col[0], col[1], col[2]);
            }
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }

    /* Keep the label upright without touching the cube.

       Rotating the corner the texture's (0,0) lands on turns the label by a
       quarter turn inside the face — still flat on the surface, just spun. The
       four choices sit 90° apart, so picking the one whose baseline runs
       closest to screen-horizontal leaves the text at most 45° off level.
       Winding is preserved by the cycle, so the text can never come out
       mirrored or upside down. */
    function orientLabel(quad) {
        let best = -Infinity, bestK = 0;
        for (let k = 0; k < 4; k++) {
            const a = quad[k], b = quad[(k + 1) & 3];
            const c = quad[(k + 2) & 3], d = quad[(k + 3) & 3];
            // average the top and bottom edges: under perspective neither alone
            // is the direction the text actually runs
            const rx = (b[0] - a[0]) + (c[0] - d[0]);
            const ry = (b[1] - a[1]) + (c[1] - d[1]);
            const len = Math.hypot(rx, ry);
            if (len < 1e-9) continue;
            const level = rx / len;      // 1 when the baseline is dead level
            if (level > best) { best = level; bestK = k; }
        }
        return [quad[bestK], quad[(bestK + 1) & 3],
                quad[(bestK + 2) & 3], quad[(bestK + 3) & 3]];
    }

    // Called for the hovered face, and for any face flagged `always`. Faces
    // that are neither are left at the background colour, which is what makes
    // the cube read as a bare wireframe. Unhighlighted faces paint their ink
    // only — no fill — so the label sits straight on the black.
    function drawFace(face, quad, hot) {
        const oriented = orientLabel(quad);
        const inv = inverseHomography(oriented);
        if (!inv) return;

        const sr = hot ? FACE_HOT[0] : 0,
              sg = hot ? FACE_HOT[1] : 0,
              sb = hot ? FACE_HOT[2] : 0;
        const ir = INK[0], ig = INK[1], ib = INK[2];

        let minX = RES, maxX = 0, minY = RES, maxY = 0;
        for (let i = 0; i < 4; i++) {
            if (quad[i][0] < minX) minX = quad[i][0];
            if (quad[i][0] > maxX) maxX = quad[i][0];
            if (quad[i][1] < minY) minY = quad[i][1];
            if (quad[i][1] > maxY) maxY = quad[i][1];
        }
        minX = Math.max(0, Math.floor(minX)); maxX = Math.min(RES - 1, Math.ceil(maxX));
        minY = Math.max(0, Math.floor(minY)); maxY = Math.min(RES - 1, Math.ceil(maxY));

        const mask = face.mask;
        for (let y = minY; y <= maxY; y++) {
            const fy = y + 0.5;
            const row = y * RES;
            for (let x = minX; x <= maxX; x++) {
                const fx = x + 0.5;
                const w = inv[6] * fx + inv[7] * fy + inv[8];
                if (w === 0) continue;
                const u = (inv[0] * fx + inv[1] * fy + inv[2]) / w;
                if (u < 0 || u >= 1) continue;
                const v = (inv[3] * fx + inv[4] * fy + inv[5]) / w;
                if (v < 0 || v >= 1) continue;

                const a = mask[((v * TEX) | 0) * TEX + ((u * TEX) | 0)] / 255;
                if (a === 0) {
                    // sr/sg/sb are 0 when unhighlighted, so this is a no-op
                    // against the already-black buffer — skip the write
                    if (hot) px(row + x, sr, sg, sb);
                } else {
                    px(row + x,
                       (sr + (ir - sr) * a) | 0,
                       (sg + (ig - sg) * a) | 0,
                       (sb + (ib - sb) * a) | 0);
                }
            }
        }
    }

    /* ── Frame ────────────────────────────────────────────────────────── */

    function render(time) {
        if (masksStale) buildAllMasks();

        // gentle drift so the cube never looks parked
        const bobX = reduceMotion ? 0 : 0.045 * Math.sin(time * 0.53);
        const bobY = reduceMotion ? 0 : 0.10 * Math.sin(time * 0.80);
        const bobZ = reduceMotion ? 0 : 0.05 * Math.sin(time * 0.41);

        let R = M;
        if (!reduceMotion) {
            const sway = mul(axisAngle([0, 1, 0], 0.05 * Math.sin(time * 0.50)),
                             axisAngle([1, 0, 0], 0.04 * Math.sin(time * 0.73 + 1.2)));
            R = mul(sway, M);
        }

        buf.fill(0xFF000000);
        visible.length = 0;

        for (let i = 0; i < FACES.length; i++) {
            const face = FACES[i];
            const n = apply(R, face.n);
            const centre = [n[0] + bobX, n[1] + bobY, n[2] + bobZ];
            // backface cull against the vector from face centre to camera
            if (dot(n, [-centre[0], -centre[1], CAM_Z - centre[2]]) <= 0) continue;

            const rr = apply(R, face.r);
            const uu = apply(R, face.u);
            const quad = [
                project([n[0] - rr[0] + uu[0], n[1] - rr[1] + uu[1], n[2] - rr[2] + uu[2]], bobX, bobY, bobZ),
                project([n[0] + rr[0] + uu[0], n[1] + rr[1] + uu[1], n[2] + rr[2] + uu[2]], bobX, bobY, bobZ),
                project([n[0] + rr[0] - uu[0], n[1] + rr[1] - uu[1], n[2] + rr[2] - uu[2]], bobX, bobY, bobZ),
                project([n[0] - rr[0] - uu[0], n[1] - rr[1] - uu[1], n[2] - rr[2] - uu[2]], bobX, bobY, bobZ)
            ];

            // skip slivers, their homography is numerically useless
            let area = 0;
            for (let k = 0; k < 4; k++) {
                const p = quad[k], q = quad[(k + 1) & 3];
                area += p[0] * q[1] - q[0] * p[1];
            }
            if (Math.abs(area) < 8) continue;

            const inv = inverseHomography(quad);
            if (!inv) continue;

            visible.push({ index: i, face: face, quad: quad, inv: inv });
        }

        // hover from the geometry we just built, so it tracks the spin
        hovered = -1;
        if (pointer && !dragging) {
            for (let i = 0; i < visible.length; i++) {
                const uv = uvAt(visible[i].inv, pointer[0], pointer[1]);
                if (uv && uv[0] >= 0 && uv[0] < 1 && uv[1] >= 0 && uv[1] < 1) {
                    if (visible[i].face.href) hovered = visible[i].index;
                    break;   // the cube is convex, so the first hit is the hit
                }
            }
        }

        for (let i = 0; i < visible.length; i++) {
            const v = visible[i];
            const hot = v.index === hovered;
            if (hot || v.face.always || alwaysLabel) drawFace(v.face, v.quad, hot);
        }
        // edges after the fill, so the outline stays a clean single pixel
        for (let i = 0; i < visible.length; i++) {
            const v = visible[i];
            for (let k = 0; k < 4; k++) {
                const p = v.quad[k], q = v.quad[(k + 1) & 3];
                line(p[0], p[1], q[0], q[1], EDGE);
            }
        }

        ctx.putImageData(img, 0, 0);

        canvas.classList.toggle('over-face', hovered >= 0);
        const target = hovered >= 0 ? FACES[hovered].label : null;
        caption.textContent = target ? '→ ' + target : 'drag to rotate · click a face';
        caption.classList.toggle('active', !!target);
    }

    /* ── Physics ──────────────────────────────────────────────────────────
       Free spin only. The cube keeps whatever momentum the drag gave it and
       coasts down over a few seconds — it is never rotated back to a pose.
       Label readability is handled in the face plane instead, see orientLabel. */

    function step(dt) {
        if (!dragging && (omegaX || omegaY)) {
            M = mul(axisAngle([1, 0, 0], omegaX * dt), M);
            M = mul(axisAngle([0, 1, 0], omegaY * dt), M);
            const damp = Math.exp(-0.45 * dt);
            omegaX *= damp;
            omegaY *= damp;
        }
        if (Math.abs(omegaX) < 1e-4) omegaX = 0;
        if (Math.abs(omegaY) < 1e-4) omegaY = 0;
        orthonormalize(M);
    }

    /* ── Input ────────────────────────────────────────────────────────────
       Listeners sit on the window, not the canvas, so the empty space around
       the cube is draggable too. The canvas rect is still what maps a pointer
       to cube coordinates; positions outside it simply hover nothing. */

    function toCanvas(e) {
        const rect = canvas.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right ||
            e.clientY < rect.top || e.clientY > rect.bottom) return null;
        return [(e.clientX - rect.left) / rect.width * RES,
                (e.clientY - rect.top) / rect.height * RES];
    }

    // don't hijack the fallback nav links
    function onControl(e) {
        let el = e.target;
        while (el) {
            if (el.tagName === 'A' || el.tagName === 'BUTTON') return true;
            el = el.parentNode;
        }
        return false;
    }

    window.addEventListener('pointerdown', function (e) {
        if (onControl(e)) return;
        dragging = true;
        dragMoved = 0;
        lastX = e.clientX;
        lastY = e.clientY;
        omegaX = omegaY = 0;
        pointer = toCanvas(e);
        document.body.classList.add('grabbing');
        e.preventDefault();
    });

    window.addEventListener('pointermove', function (e) {
        pointer = toCanvas(e);
        if (!dragging) return;

        const rect = canvas.getBoundingClientRect();
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        dragMoved += Math.abs(dx) + Math.abs(dy);

        // the face follows the cursor: drag down and the near face goes down
        const kx = dy / rect.height * DRAG_GAIN;
        const ky = dx / rect.width * DRAG_GAIN;
        M = mul(axisAngle([1, 0, 0], kx), M);
        M = mul(axisAngle([0, 1, 0], ky), M);

        // throw velocity, smoothed so a jittery last frame doesn't dominate
        omegaX = omegaX * 0.6 + (kx * 60) * 0.4;
        omegaY = omegaY * 0.6 + (ky * 60) * 0.4;
    });

    function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('grabbing');

        // a tap, not a throw. Taps on the dead space around the cube hit no
        // face and fall through to the throw cap below, which is a no-op.
        if (dragMoved < 6) {
            omegaX = omegaY = 0;
            pointer = toCanvas(e);
            if (pointer) {
                for (let i = 0; i < visible.length; i++) {
                    const uv = uvAt(visible[i].inv, pointer[0], pointer[1]);
                    if (uv && uv[0] >= 0 && uv[0] < 1 && uv[1] >= 0 && uv[1] < 1) {
                        if (visible[i].face.href) window.location.href = visible[i].face.href;
                        return;
                    }
                }
            }
        }
        // cap the throw so it can't spin forever
        const sp = Math.hypot(omegaX, omegaY);
        if (sp > 9) { omegaX *= 9 / sp; omegaY *= 9 / sp; }

        // touch has no hover, so don't leave a face stuck lit
        if (e.pointerType !== 'mouse') pointer = null;
    }

    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    /* ── Loop ─────────────────────────────────────────────────────────── */

    let prev = performance.now();
    (function frame(now) {
        // clamp so a backgrounded tab doesn't fling the cube on return
        const dt = Math.min(0.05, (now - prev) / 1000);
        prev = now;
        step(dt);
        render(now / 1000);
        requestAnimationFrame(frame);
    })(prev);
})();
