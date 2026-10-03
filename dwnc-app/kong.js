// 콩 v3 · 손그림 낙서풍. 관절 있는 막대 팔다리, 아기→베테랑 성장, 새까만 점 눈, 떨리는 윤곽선(line boil).
// cond 0 쿨쿨 · 1 시들시들 · 2 촉촉 · 3 쌩쌩 / stage 0 아기 … 5 베테랑 / items: 종목별 레벨 0–4

const INK = '#24262b';
let uidCount = 0;
const moduleId = globalThis.crypto?.randomUUID?.().replaceAll('-', '') || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
const svgId = kind => `dwnc-kong-${moduleId}-${kind}-${++uidCount}`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const f = v => +(+v).toFixed(1);
const mix = (a, b, t) => {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

const STAGES = [
  { key: 'baby', name: '아기', min: 1 },
  { key: 'toddler', name: '꼬마', min: 5 },
  { key: 'kid', name: '어린이', min: 15 },
  { key: 'teen', name: '청소년', min: 30 },
  { key: 'adult', name: '어른', min: 50 },
  { key: 'veteran', name: '베테랑', min: 100 },
];
const stageOf = n => STAGES.reduce((s, st, i) => (n >= st.min ? i : s), 0);
const CONDS = [
  { name: '쿨쿨', color: '#8e9bb0' },
  { name: '시들시들', color: '#e29a4a' },
  { name: '촉촉', color: '#3c9fe0' },
  { name: '쌩쌩', color: '#3fb46a' },
];
const GREEN = '#72c26a', LEAF = '#8fd07c', DRY = '#d6c07a', DULL = '#c9c6b4';
const FADE = [.55, .22, 0, 0];

// ---------- SMIL helpers ----------
let MOTION = true;
let LOOP = 'repeatCount="indefinite"';
const ease = n => ` calcMode="spline" keySplines="${Array(n - 1).fill('.42 0 .58 1').join(';')}"`;
const kts = kt => kt.map(v => v.toFixed(3)).join(';');
function anim(type, values, dur, o = {}) {
  if (!MOTION) return '';
  const n = values.split(';').length;
  const kt = o.keyTimes || kts(Array.from({ length: n }, (_, i) => i / (n - 1)));
  return `<animateTransform attributeName="transform" type="${type}" values="${values}" keyTimes="${kt}" dur="${dur}s" repeatCount="${o.repeat || 'indefinite'}" additive="sum"${o.linear ? '' : ease(n)}${o.begin ? ` begin="${o.begin}"` : ''}${o.fill ? ` fill="${o.fill}"` : ''}/>`;
}
function animAttr(attr, values, dur, o = {}) {
  if (!MOTION) return '';
  const n = values.split(';').length;
  return `<animate attributeName="${attr}" values="${values}" dur="${dur}s" repeatCount="${o.repeat || 'indefinite'}"${o.keyTimes ? ` keyTimes="${o.keyTimes}"` : ''}${o.spline ? ease(n) : ''}${o.begin ? ` begin="${o.begin}"` : ''}${o.discrete ? ' calcMode="discrete"' : ''}/>`;
}
const stroke = (w = 5) => `stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const sparkle = (x, y, s, c, extra = '') =>
  `<path d="M${x} ${f(y - s)}Q${f(x + s * .18)} ${f(y - s * .18)} ${f(x + s)} ${y}Q${f(x + s * .18)} ${f(y + s * .18)} ${x} ${f(y + s)}Q${f(x - s * .18)} ${f(y + s * .18)} ${f(x - s)} ${y}Q${f(x - s * .18)} ${f(y - s * .18)} ${x} ${f(y - s)}Z" fill="${c}">${extra}</path>`;
const heart = (x, y, s, c) =>
  `<path d="M${x} ${f(y + s * .9)}C${f(x - s * 1.4)} ${f(y - s * .1)} ${f(x - s * .7)} ${f(y - s * 1.1)} ${x} ${f(y - s * .35)}C${f(x + s * .7)} ${f(y - s * 1.1)} ${f(x + s * 1.4)} ${f(y - s * .1)} ${x} ${f(y + s * .9)}Z" fill="${c}"/>`;

// ---------- hand-drawn shapes ----------
function wobbleCircle(r, seed) {
  const n = 11, pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 - Math.PI / 2;
    const k = 1 + .02 * Math.sin(i * 2.7 + seed) + .014 * Math.cos(i * 1.9 + seed * 2.3);
    pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

// ---------- rig ----------
const R = 52;
const SCALE = [.62, .72, .8, .88, .96, 1];
const LEG = [13, 15, 18, 22, 25, 26], ARM = [15, 17, 19, 22, 24, 25], FOOT = [5, 6, 7, 7, 8, 8];
const SHOULDER = [49, 8], HIP = [14, 46];
const EYE_Y = [6, 4, 1, -2, -4, -5];
const IDLE = {
  3: { dur: 1.8, kt: [0, .5, 1], arm: [[35, 55], [42, 66], [35, 55]], leg: [[6, -4, 95], [6, -4, 95], [6, -4, 95]], air: [0, 3, 0], sq: [[1, 1], [1.02, .98], [1, 1]], rk: [20, 26, 20], plant: [0, -3, 0] },
  2: { dur: 3.4, kt: [0, .5, 1], arm: [[22, 12], [30, 26], [22, 12]], leg: [[5, -3, 95], [5, -3, 95], [5, -3, 95]], air: [0, 0, 0], sq: [[1, 1], [1.02, .985], [1, 1]], rk: [25, 32, 25], plant: [0, -4, 0] },
  1: { dur: 3.8, kt: [0, .5, 1], arm: [[6, -2], [11, 4], [6, -2]], leg: [[-16, 24, 95], [-20, 28, 95], [-16, 24, 95]], air: [0, 0, 0], sq: [[1.03, .95], [1.05, .93], [1.03, .95]], rk: [160, 150, 160], plant: [0, 3, 0], tilt: -4 },
  0: { dur: 4.4, kt: [0, .5, 1], arm: [[30, 10], [33, 12], [30, 10]], leg: [[82, 92, 150], [82, 92, 150], [82, 92, 150]], air: [0, 0, 0], sq: [[1.05, .94], [1.08, .91], [1.05, .94]], rk: null, plant: [0, 0, 0] },
};
// 터치·기록 때 한 번 재생하는 큰 반응
const JUMP = { dur: 1, kt: [0, .2, .45, .7, 1], arm: [[35, 55], [25, 15], [150, 170], [110, 135], [35, 55]], leg: [[6, -4, 95], [38, -38, 90], [28, 10, 115], [34, -30, 90], [6, -4, 95]], air: [0, 0, 20, 0, 0], sq: [[1, 1], [1.08, .92], [.95, 1.07], [1.1, .9], [1, 1]], rk: [20, 32, 4, 16, 20], plant: [0, 6, -9, 11, 0] };
const REACT = {
  3: JUMP, 2: JUMP,
  1: { dur: .8, kt: [0, .3, .6, 1], arm: [[6, -2], [20, 10], [40, 60], [6, -2]], leg: [[-16, 24, 95], [10, -20, 90], [4, 0, 100], [-16, 24, 95]], air: [0, 0, 7, 0], sq: [[1.03, .95], [1.06, .92], [.98, 1.04], [1.03, .95]], rk: [160, 150, 120, 160], plant: [0, 4, -6, 0], tilt: -4 },
  0: { dur: .7, kt: [0, .25, .55, 1], arm: [[30, 10], [60, 40], [45, 20], [30, 10]], leg: [[82, 92, 150], [82, 92, 150], [82, 92, 150], [82, 92, 150]], air: [0, 6, 0, 0], sq: [[1.05, .94], [.96, 1.08], [1.1, .9], [1.05, .94]], rk: null, plant: [0, -8, 6, 0] },
};
const rad = d => d * Math.PI / 180;
const seg = (p, len, a, side) => [p[0] + side * Math.sin(rad(a)) * len, p[1] + Math.cos(rad(a)) * len];
const armPts = (side, st, a) => { const o = [side * SHOULDER[0], SHOULDER[1]], L = ARM[st] / 2, e = seg(o, L + 1, a[0], side); return [o, e, seg(e, L - 1, a[1], side)]; };
const legPts = (side, st, a) => { const o = [side * HIP[0], HIP[1]], L = LEG[st] / 2, k = seg(o, L, a[0], side), an = seg(k, L, a[1], side); return [o, k, an, seg(an, FOOT[st], a[2], side)]; };
const D = pts => 'M' + pts.map(p => `${f(p[0])} ${f(p[1])}`).join('L');

// animated path: base d + animate d across keyframes
function morph(ds, pose, attrs) {
  const a = MOTION && new Set(ds).size > 1 ? `<animate attributeName="d" values="${ds.join(';')}" keyTimes="${kts(pose.kt)}" dur="${pose.dur}s" ${LOOP}${ease(ds.length)}/>` : '';
  return `<path d="${ds[0]}" ${attrs}>${a}</path>`;
}

// ---------- face ----------
function face(cond, stage, u) {
  const ey = EYE_Y[stage], ex = 14, baby = stage === 0;
  const rx = baby ? 4.8 : 4.2, ry = baby ? 6.4 : 6;
  const my = ey + 17;
  const blush = mix('#f4a0a6', DULL, FADE[cond] * .6);
  let s = `<ellipse cx="-27" cy="${ey + 13}" rx="${baby ? 8.5 : 7.5}" ry="4.6" fill="${blush}"/><ellipse cx="27" cy="${ey + 13}" rx="${baby ? 8.5 : 7.5}" ry="4.6" fill="${blush}"/>`;
  [-1, 1].forEach(side => {
    const x = side * ex;
    let e;
    if (cond === 0) e = `<path d="M-5 0Q0 4.5 5 0" fill="none" ${stroke(3.2)}/>`;
    else if (cond === 1) e = `<path d="M-${rx} 0A${rx} ${ry * .85} 0 0 0 ${rx} 0Z" fill="${INK}"/><path d="M${side * 6} -9L${-side * 3} -12" fill="none" ${stroke(2.8)}/>`;
    else e = `<ellipse rx="${rx}" ry="${ry}" fill="${INK}"/>`;
    const blink = cond >= 2 ? anim('scale', '1 1;1 1;1 .08;1 1', 4.6, { keyTimes: '0;.94;.97;1', linear: true, begin: '-1.3s' }) : '';
    s += `<g transform="translate(${x} ${ey})"><g>${blink}${e}</g></g>`;
    if (stage >= 4 && cond >= 2) s += `<path d="M${x - side * 5} ${ey - 11}L${x + side * 4} ${ey - 12.5}" fill="none" ${stroke(2.6)}/>`;
  });
  if (baby) {
    // 쪽쪽이
    const suck = cond >= 1 ? anim('scale', '1 1;.92 1.08;1 1', cond === 3 ? .5 : 1.1) : '';
    s += `<g transform="translate(0 ${my - 1})"><g>${suck}<circle cy="10" r="6" fill="none" ${stroke(3)}/><ellipse rx="12" ry="7" fill="#a6d3ff" ${stroke(3)}/><circle r="3" fill="#fff" ${stroke(2)}/></g></g>`;
    return s;
  }
  if (cond === 3) s += `<path d="M-11 ${my - 3}Q0 ${my - 3} 11 ${my - 3}Q10 ${my + 14} 0 ${my + 14}Q-10 ${my + 14} -11 ${my - 3}Z" fill="${INK}"/><path d="M-6 ${my + 9}Q0 ${my + 4} 6 ${my + 9}Q3 ${my + 13} 0 ${my + 13}Q-3 ${my + 13} -6 ${my + 9}Z" fill="#ff8e9e"/>`;
  if (cond === 2) s += `<path d="M-10 ${my - 2}Q0 ${my + 9} 10 ${my - 2}" fill="none" ${stroke(3.8)}/>`;
  if (cond === 1) s += `<path d="M-10 ${my + 3}q5 -4 10 0t10 0" fill="none" ${stroke(3.4)}/>`;
  if (cond === 0) {
    s += `<ellipse cx="0" cy="${my + 1}" rx="2.8" ry="2.4" fill="${INK}"/>`;
    s += `<circle cx="10" cy="${my - 5}" r="4" fill="#e6f4ff" ${stroke(2)}>${animAttr('r', '3;8;3', 3.4, { spline: true })}</circle>`;
  }
  return s;
}

// stage accessories drawn on the body (body-local coords)
function accessories(stage, cond, u) {
  const ey = EYE_Y[stage], my = ey + 17;
  if (stage === 1) {
    const t = my + 10;
    return `<path d="M-21 ${t}Q0 ${t + 7} 21 ${t}Q19 ${t + 19} 0 ${t + 22}Q-19 ${t + 19} -21 ${t}Z" fill="#fff" ${stroke(3)}/><circle cx="-6" cy="${t + 10}" r="1.6" fill="#f4a0a6"/><circle cx="5" cy="${t + 13}" r="1.6" fill="#a6d3ff"/><circle cx="1" cy="${t + 6.5}" r="1.4" fill="#ffd25e"/>`;
  }
  if (stage === 2) return `<g transform="translate(29 ${ey + 3}) rotate(-28)"><rect x="-8" y="-3.6" width="16" height="7.2" rx="3.6" fill="#f6d5a8" ${stroke(2.2)}/><rect x="-2.6" y="-2.2" width="5.2" height="4.4" rx="1" fill="#e8b47e"/></g>`;
  if (stage === 3) return `<g clip-path="url(#${u}-body)"><path d="M-60 -32Q0 -44 60 -32L60 -22Q0 -34 -60 -22Z" fill="#4f8ef7"/><path d="M-60 -32Q0 -44 60 -32M-60 -22Q0 -34 60 -22" fill="none" ${stroke(2.6)}/></g>`;
  if (stage === 5) return `<path d="M-6 26L-10 40L-3 37L0 44M6 26L10 40L3 37" fill="#e85d5d" ${stroke(2.2)}/><circle cx="0" cy="${30}" r="8" fill="url(#${u}-gold)" ${stroke(2.6)}/><path d="M0 25.5l1.4 2.9 3.2.4-2.3 2.2.6 3.1L0 32.6l-2.9 1.5.6-3.1-2.3-2.2 3.2-.4Z" fill="#fff"/>`;
  return '';
}

// ---------- plant hair (base 0,0, up = -y) ----------
function plant(cond, stage) {
  const H = [6, 15, 24, 34, 40, 44][stage];
  const bend = [16, 8, 0, 0][cond];
  const tx = bend, ty = f(-H + bend * .35);
  const ang = [58, 26, -12, -30][cond];
  const t = [.75, .35, 0, 0][cond];
  const leafC = mix(LEAF, DRY, t);
  const sw = [[0, 0], [2, 5], [3, 3.8], [4, 2.6]][cond];
  const sway = phase => sw[0] ? anim('rotate', `0;${-sw[0]};0;${f(sw[0] * .6)};0`, sw[1], { begin: phase ? `-${phase}s` : '' }) : '';
  const leaf = (x, y, dir, size, a, phase, round) =>
    `<g transform="translate(${f(x)} ${f(y)}) scale(${f(dir * size)} ${f(size)}) rotate(${a})"><g>${sway(phase)}` +
    `<path d="${round ? 'M0 0C1 -10 17 -12 19 -3C20 5 7 7 0 0Z' : 'M0 0C7 -10 22 -11 31 0C22 9 7 9 0 0Z'}" fill="${leafC}" ${stroke(f(3.4 / size))}/></g></g>`;
  const along = k => [f(bend * k * k), f(-H * k + bend * .35 * k)];
  if (stage === 0) return `<path d="M0 3q-1 -9 6 -11q6 -1 3 5" fill="none" ${stroke(3.4)}/>` + leaf(-1, -5, -1, .5, ang + 10, .2, true);
  let s = `<path d="M0 6Q0 ${f(-H * .6)} ${tx} ${ty}" fill="none" ${stroke(3.8)}/>`;
  if (stage === 1) return s + leaf(tx, ty, 1, .8, ang, 0, true) + leaf(tx, ty, -1, .8, ang, .2, true);
  if (stage >= 3) {
    const [ax, ay] = along(.3), [bx, by] = along(.58), [cx2, cy2] = along(.78);
    s += `<path d="M${cx2} ${cy2}c-11 -1 -17 -9 -12 -16c3 -5 9 -2 6 2" fill="none" ${stroke(2.6)}>${anim('rotate', '0;-8;0', 2.6)}</path>`;
    s += leaf(ax, ay, -1, .58, ang + 16, .5, true) + leaf(bx, by, 1, .68, ang + 8, .3, false);
    if (stage >= 5) {
      const pod = (x, y, dir, ph) => `<g transform="translate(${f(x)} ${f(y)}) scale(${dir} 1)"><g>${sw[0] ? anim('rotate', '0;9;0;-6;0', 2.2, { begin: `-${ph}s` }) : ''}` +
        `<path d="M0 0C6 6 7 19 0 28C-6 23 -6 8 0 0Z" fill="${mix('#9ed986', DRY, t)}" ${stroke(2.6)}/><path d="M0 7v14" stroke="${INK}" stroke-width="1.6" stroke-dasharray="1 5" stroke-linecap="round"/></g></g>`;
      s += pod(bx + 14, by + 4, 1, 0) + pod(ax - 12, ay + 2, -1, .6);
    }
  } else {
    const [ax, ay] = along(.45);
    s += leaf(ax, ay, -1, .58, ang + 16, .4, true);
  }
  s += leaf(tx, ty, 1, stage >= 3 ? .82 : .74, ang, 0, false) + leaf(tx, ty, -1, stage >= 3 ? .82 : .74, ang, .25, false);
  if (stage >= 4) {
    if (cond >= 2) {
      const petal = stage >= 5 ? '#ffe08a' : '#ffc4d4';
      const petals = [0, 72, 144, 216, 288].map(a => { const r = (a - 90) * Math.PI / 180; return `<circle cx="${f(Math.cos(r) * 6.5)}" cy="${f(Math.sin(r) * 6.5)}" r="5" fill="${petal}" ${stroke(2.4)}/>`; }).join('');
      s += `<g transform="translate(${tx} ${f(ty - 9)})"><g>${anim('rotate', '-6;6;-6', cond === 3 ? 2.4 : 3.8)}${petals}<circle r="4" fill="#ffc83d" ${stroke(2.4)}/></g></g>`;
    } else {
      s += `<ellipse cx="${f(tx + bend * .4)}" cy="${f(ty - 6)}" rx="3.8" ry="5.4" fill="${mix('#ffc4d4', DRY, cond === 0 ? .8 : .4)}" ${stroke(2.4)} transform="rotate(${bend * 2.5} ${tx} ${f(ty - 1)})"/>`;
    }
  }
  return s;
}

// ---------- items ----------
const RACKET = [null, { frame: '#c99a62', grip: '#9b6a3e' }, { frame: '#8795a3', grip: '#3c7fea' }, { frame: '#3fae6c', grip: '#ffffff' }, { frame: 'GOLD', grip: '#3a3f45' }];
function racket(u, lv) {
  const p = RACKET[lv], frame = p.frame === 'GOLD' ? `url(#${u}-gold)` : p.frame;
  let s = `<clipPath id="${u}-str"><ellipse cx="0" cy="-60" rx="15" ry="20"/></clipPath>`;
  s += `<path d="M-7 -36L0 -22L7 -36" fill="none" ${stroke(4)}/>`;
  s += `<ellipse cx="0" cy="-60" rx="21" ry="26" fill="#fff" ${stroke(4.5)}/>`;
  s += `<g clip-path="url(#${u}-str)" stroke="#c9d1d8" stroke-width="1.8">` + [-8, 0, 8].map(x => `<path d="M${x} -82V-38"/>`).join('') + [-70, -60, -50].map(y => `<path d="M-16 ${y}H16"/>`).join('') + '</g>';
  s += `<ellipse cx="0" cy="-60" rx="17" ry="22" fill="none" stroke="${frame}" stroke-width="4"/>`;
  s += `<rect x="-4.5" y="-24" width="9" height="32" rx="4" fill="${p.grip}" ${stroke(3.5)}/>`;
  if (lv === 4) s += sparkle(-28, -86, 6, '#ffc83d') + sparkle(27, -40, 4.5, '#ffc83d');
  return s;
}
const BALL = [null, { base: '#eef0f2', patch: '#b9c1c9' }, { base: '#ffffff', patch: INK }, { base: '#ffffff', patch: '#f08a4b' }, { base: 'GOLD', patch: '#b4821f' }];
function ball(u, lv, cx, cy, r) {
  const p = BALL[lv], base = p.base === 'GOLD' ? `url(#${u}-gold)` : p.base, d = Math.PI / 180;
  const pt = (a, k) => [f(cx + Math.cos(a) * r * k), f(cy + Math.sin(a) * r * k)];
  const pent = 'M' + [0, 1, 2, 3, 4].map(k => pt((-90 + 72 * k) * d, .38).join(' ')).join('L') + 'Z';
  let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${base}"/><path d="${pent}" fill="${p.patch}"/>`;
  s += `<clipPath id="${u}-ball"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><g clip-path="url(#${u}-ball)" fill="${p.patch}">` + [0, 1, 2, 3, 4].map(k => { const [x, y] = pt((-54 + 72 * k) * d, 1.02); return `<circle cx="${x}" cy="${y}" r="${f(r * .34)}"/>`; }).join('') + '</g>';
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" ${stroke(3.5)}/>`;
  if (lv === 4) s += sparkle(cx + r + 5, cy - r, 4.5, '#ffc83d');
  return s;
}
const SHOE = [null, { up: '#c3cad1', sole: '#ffffff' }, { up: '#33a69f', sole: '#ffffff' }, { up: '#1fb8a6', sole: '#c8f169' }, { up: 'GOLD', sole: '#ffffff', wing: true }];
function shoeIcon(u, lv) {
  const p = SHOE[lv], up = p.up === 'GOLD' ? `url(#${u}-gold)` : p.up;
  let s = '';
  if (p.wing) s += `<path d="M-5 -3C-14 -11 -18 -3 -14 0C-18 1 -15 6 -7 3Z" fill="#fff" ${stroke(2.2)}/>`;
  s += `<path d="M-6 3C-7 -5 -2 -8 3 -7C6 -6 8 -2 13 -1C17 0 18 3 17 5H-6Z" fill="${up}" ${stroke(2.8)}/><path d="M-5 5H16" stroke="${p.sole}" stroke-width="2.4" stroke-linecap="round"/>`;
  return s;
}

// ---------- scene ----------
function sky(cond) {
  if (cond === 3) {
    const rays = Array.from({ length: 8 }, (_, i) => { const a = i * 45 * Math.PI / 180; return `<path d="M${f(Math.cos(a) * 15)} ${f(Math.sin(a) * 15)}L${f(Math.cos(a) * 21)} ${f(Math.sin(a) * 21)}"/>`; }).join('');
    return `<g transform="translate(16 -2)"><g fill="none" ${stroke(3)}>${anim('rotate', '0;360', 14, { linear: true })}${rays}</g><circle r="10" fill="#ffd25e" ${stroke(3)}/></g>`;
  }
  if (cond === 2) return `<circle cx="16" cy="-2" r="9" fill="#ffd979" ${stroke(3)}/>`;
  if (cond === 1) return `<circle cx="16" cy="-2" r="10" fill="#ffab5c" ${stroke(3)}/>`;
  return `<path d="M186 -10a13 13 0 1 0 8 23a10 10 0 1 1 -8 -23Z" fill="#ffe9a8" ${stroke(3)}/>`;
}
function ground(cond) {
  const soil = ['#e6dac4', '#dcc7a6', '#bfa184', '#b99c7e'][cond];
  let s = `<path d="M26 196C40 189 160 189 174 196C160 203 40 203 26 196Z" fill="${soil}"/>`;
  if (cond >= 2) s += [[38, 195], [160, 194], [150, 200]].map(([x, y]) => `<path d="M${x} ${y}l-3 -7M${x + 4} ${y}l1 -8M${x + 8} ${y}l4 -6" stroke="#5fae55" stroke-width="2.4" stroke-linecap="round"/>`).join('');
  else s += `<path d="M48 196l7 -2l4 2l6 -1M132 197l6 -2l5 2l5 -1" stroke="#b8a283" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s;
}

function render(o = {}) {
  const { cond = 2, stage = 3, items = {}, motion = true, enter = '', label = '콩', scene = true, sky: showSky = scene, react = false } = o;
  LOOP = react ? 'repeatCount="1" fill="freeze"' : 'repeatCount="indefinite"';
  MOTION = motion;
  const u = svgId('character');
  const pose = react ? REACT[cond] : IDLE[cond];
  const S = SCALE[stage];
  const body = mix(GREEN, DULL, FADE[cond]);
  const tennis = items.tennis || 0, futsal = items.futsal || 0, running = items.running || 0;
  const n = pose.kt.length;

  // keyframe geometry
  const K = pose.kt.map((_, i) => {
    const lL = legPts(-1, stage, pose.leg[i]), lR = legPts(1, stage, pose.leg[i]);
    const aL = armPts(-1, stage, pose.arm[i]), aR = armPts(1, stage, pose.arm[i]);
    const cy = 192 - pose.air[i] - (lL[2][1] - lL[0][1]) - HIP[1];
    return { lL, lR, aL, aR, cy };
  });
  const cy0 = K[0].cy;

  let s = `<svg viewBox="-8 -26 216 228" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}">`;
  s += `<defs><linearGradient id="${u}-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b3"/><stop offset=".5" stop-color="#f0c247"/><stop offset="1" stop-color="#c9952a"/></linearGradient>` +
    `<clipPath id="${u}-body"><path d="${wobbleCircle(R, 1)}"/></clipPath>` +
    `<filter id="${u}-rough" filterUnits="userSpaceOnUse" x="-12" y="-30" width="226" height="240"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="2" result="n">${animAttr('seed', '2;5;8', 1.5, { discrete: true })}</feTurbulence><feDisplacementMap in="SourceGraphic" in2="n" scale="2.8" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`;
  s += `<g filter="url(#${u}-rough)">`;
  if (scene) s += (showSky ? sky(cond) : '') + ground(cond);
  const srx = f(44 * S);
  s += `<ellipse cx="100" cy="194" rx="${srx}" ry="4" fill="${INK}" opacity=".1">${MOTION && pose.air.some(a => a > 4) ? `<animate attributeName="rx" values="${pose.air.map(a => f(srx * (1 - a / 50))).join(';')}" keyTimes="${kts(pose.kt)}" dur="${pose.dur}s" ${LOOP}${ease(n)}/>` : ''}</ellipse>`;

  // world group: stage scale around the ground point, optional idle sway, enter pop
  let sway = cond === 2 ? anim('rotate', '0 100 192;-1 100 192;0 100 192;1 100 192;0 100 192', 5.6) : '';
  let enterAnim = '';
  if (enter === 'perk') enterAnim = anim('scale', '.88 1.12;1.06 .94;1 1', .55, { repeat: '1', fill: 'freeze' });
  if (enter === 'tap') enterAnim = anim('translate', '0 0;0 -22;0 0', .5, { repeat: '1', fill: 'freeze' });
  s += `<g transform="translate(100 192) scale(${S}) translate(-100 -192)"><g>${sway}`;
  if (tennis && cond === 0) s += `<g transform="translate(152 189) rotate(84) scale(.48)">${racket(u, tennis)}</g>`;
  s += `<g transform="translate(100 192)"><g>${enterAnim}<g transform="translate(-100 -192)">`;

  // body group (body-local origin = body center)
  const moveVals = K.map(k => `0 ${f(k.cy - cy0)}`).join(';');
  const move = MOTION && K.some(k => k.cy !== cy0) ? `<animateTransform attributeName="transform" type="translate" values="${moveVals}" keyTimes="${kts(pose.kt)}" dur="${pose.dur}s" ${LOOP} additive="sum"${ease(n)}/>` : '';
  s += `<g transform="translate(100 ${f(cy0)})${pose.tilt ? ` rotate(${pose.tilt} 0 ${HIP[1]})` : ''}"><g>${move}`;

  // legs (+ shoe overlay on the foot segment)
  const legAttrs = `fill="none" ${stroke(5)}`;
  ['lL', 'lR'].forEach(k => {
    s += morph(K.map(x => D(x[k])), pose, legAttrs);
    if (running) {
      const ds = K.map(x => D(x[k].slice(2)));
      const c = running === 4 ? `url(#${u}-gold)` : SHOE[running].up;
      s += morph(ds, pose, `fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"`) + morph(ds, pose, `fill="none" stroke="${c}" stroke-width="5.4" stroke-linecap="round"`);
    }
  });

  // plant hair with follow-through
  const plantS = [.9, 1, 1.05, 1.1, 1.12, 1.16][stage];
  const plantFollow = MOTION && pose.plant.some(v => v) ? `<animateTransform attributeName="transform" type="rotate" values="${pose.plant.join(';')}" keyTimes="${kts(pose.kt)}" dur="${pose.dur}s" ${LOOP} additive="sum"${ease(n)}/>` : '';
  const plantEnter = enter === 'grow' ? anim('scale', '.15;1.25;.94;1', 1, { repeat: '1', fill: 'freeze' }) : '';
  s += `<g transform="translate(0 ${-R + 3}) scale(${plantS})"><g>${plantEnter}${plantFollow}${plant(cond, stage)}</g></g>`;

  // squash group around the body bottom
  const sq0 = pose.sq[0];
  const sqVals = pose.sq.map(([x, y]) => `${f(x / sq0[0] * 1000) / 1000} ${f(y / sq0[1] * 1000) / 1000}`).join(';');
  const squash = MOTION ? `<animateTransform attributeName="transform" type="scale" values="${sqVals}" keyTimes="${kts(pose.kt)}" dur="${pose.dur}s" ${LOOP} additive="sum"${ease(n)}/>` : '';
  s += `<g transform="translate(0 ${R}) scale(${sq0[0]} ${sq0[1]})"><g>${squash}<g transform="translate(0 ${-R})">`;
  s += `<path d="${wobbleCircle(R, 1)}" fill="${body}"/>`;
  s += accessories(stage, cond, u);
  s += `<path d="${wobbleCircle(R, 1)}" fill="none" ${stroke(5.5)}/><path d="${wobbleCircle(R - .6, 3.4)}" fill="none" stroke="${INK}" stroke-width="1.3" opacity=".45" transform="translate(1.2 -.9)"/>`;
  s += face(react && cond === 2 ? 3 : cond, stage, u);
  s += '</g></g></g>';

  // arms; the right hand carries the racket
  s += morph(K.map(x => D(x.aL)), pose, `fill="none" ${stroke(5)}`);
  if (tennis && cond > 0) {
    const hand = K.map(x => x.aR[2]);
    const h0 = hand[0];
    const tVals = hand.map(h => `${f(h[0] - h0[0])} ${f(h[1] - h0[1])}`).join(';');
    const rVals = pose.rk.map(r => r - pose.rk[0]).join(';');
    const tA = MOTION ? `<animateTransform attributeName="transform" type="translate" values="${tVals}" keyTimes="${kts(pose.kt)}" dur="${pose.dur}s" ${LOOP} additive="sum"${ease(n)}/>` : '';
    const rA = MOTION ? `<animateTransform attributeName="transform" type="rotate" values="${rVals}" keyTimes="${kts(pose.kt)}" dur="${pose.dur}s" ${LOOP} additive="sum"${ease(n)}/>` : '';
    s += `<g transform="translate(${f(h0[0])} ${f(h0[1])})"><g>${tA}<g transform="rotate(${pose.rk[0]})"><g>${rA}<g transform="scale(.48)">${racket(u, tennis)}</g></g></g></g></g>`;
  }
  s += morph(K.map(x => D(x.aR)), pose, `fill="none" ${stroke(5)}`);

  // mood effects (body-local)
  if (cond === 3) {
    s += sparkle(-62, -46, 6.5, '#ffc83d', animAttr('opacity', '.35;1;.35', 2.8)) + sparkle(68, 18, 5, '#8ec5ff', animAttr('opacity', '1;.35;1', 3.4));
  }
  if (react && cond >= 2 && MOTION) {
    const once = { linear: true, repeat: '1', fill: 'freeze' };
    s += `<g opacity="0">${heart(-30, -50, 6, '#ff8fa3')}${anim('translate', '0 0;-10 -34', 1.1, once)}<animate attributeName="opacity" values="0;1;0" dur="1.1s" fill="freeze"/></g>`;
    s += `<g opacity="0">${heart(34, -46, 5, '#ff8fa3')}${anim('translate', '0 0;10 -30', 1.1, once)}<animate attributeName="opacity" values="0;1;0" dur="1.1s" begin=".15s" fill="freeze"/></g>`;
    s += `<g opacity="0">${heart(0, -70, 4.5, '#ffb3c1')}${anim('translate', '0 0;0 -30', 1.1, once)}<animate attributeName="opacity" values="0;1;0" dur="1.1s" begin=".3s" fill="freeze"/></g>`;
  }
  if (cond === 1) s += `<g><path d="M44 -36C51 -27 51 -20 44 -20C37 -20 37 -27 44 -36Z" fill="#a8d6f8" ${stroke(2.4)}/>${anim('translate', '0 0;0 10', 3.6, { linear: true })}${animAttr('opacity', '1;1;0', 3.6)}</g>`;
  if (cond === 0) {
    s += `<g fill="${INK}" font-family="inherit" font-weight="800">` + [[34, -44, 13, 0], [48, -58, 17, .8], [63, -74, 22, 1.6]].map(([x, y, z, d]) =>
      `<text x="${x}" y="${y}" font-size="${z}" opacity="0">z${anim('translate', '0 6;4 -6', 2.4, { linear: true, begin: `-${d}s` })}${animAttr('opacity', '0;.85;0', 2.4, { begin: `-${d}s` })}</text>`).join('') + '</g>';
    if (stage >= 1) s += `<g opacity="0"><path d="M0 0c4 -5 11 -5 13 -1c-4 4 -10 5 -13 1Z" fill="${DRY}" ${stroke(1.8)}/>${anim('translate', '8 -50;28 0;18 40', 10, { linear: true })}${anim('rotate', '0;160;300', 10, { linear: true })}${animAttr('opacity', '0;1;1;0', 10, { keyTimes: '0;.1;.85;1' })}</g>`;
  }
  s += '</g></g>'; // body group
  s += '</g></g></g>'; // enter
  s += '</g></g>'; // world
  if (futsal) {
    const hop = react && pose === JUMP && MOTION ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 2;0 -12;0 0;0 0" keyTimes="${kts(pose.kt)}" dur="${pose.dur}s" ${LOOP} additive="sum"${ease(n)}/>` : '';
    s += `<g>${hop}${ball(u, futsal, 30, 183, 11)}</g>`;
  }
  s += '</g>'; // filter
  return s + '</svg>';
}

function itemIcon(sport, lv) {
  if (!['tennis', 'futsal', 'running'].includes(sport) || !Number.isInteger(lv) || lv < 1 || lv > 4) return '';
  const u = svgId('item');
  const defs = `<defs><linearGradient id="${u}-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b3"/><stop offset=".5" stop-color="#f0c247"/><stop offset="1" stop-color="#c9952a"/></linearGradient></defs>`;
  if (sport === 'tennis') return `<svg viewBox="-46 -98 92 112" aria-hidden="true">${defs}<g transform="rotate(28 0 -40)">${racket(u, lv)}</g></svg>`;
  if (sport === 'futsal') return `<svg viewBox="-24 -24 48 48" aria-hidden="true">${defs}${ball(u, lv, 0, 0, 18)}</svg>`;
  return `<svg viewBox="-12 -14 34 26" aria-hidden="true">${defs}${shoeIcon(u, lv)}</svg>`;
}

export { render, itemIcon, STAGES, CONDS, stageOf };
