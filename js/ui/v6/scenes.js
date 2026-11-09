// v6.6.0: スタート画面の背景（絵）。実写・外部画像は使わず、SVG を seed から作る。seed 0〜999 の 1000 通り（10 の情景 × 10 の配色 × 10 の変化）。
//   同じ seed は同じ絵（決定的）。異なる seed は異なる絵。戦争・農耕・砂漠・海・森・草原・都市・雪山・大河など、歴史の舞台を描く。
export const SCENE_COUNT = 1000;
export const SCENE_KINDS = Object.freeze(["山の夜明け", "棚田と農耕", "砂漠の隊商", "海と帆船", "深い森", "草原の騎馬", "城市の遠景", "戦野の旗", "雪嶺と星", "大河のほとり"]);
const PALETTES = [
  { n: "暁", sky: ["#2b2f4a", "#e0905a"], sun: "#ffd89a", far: "#59486a", mid: "#38384f", near: "#1a1c28" },
  { n: "夕", sky: ["#3a2342", "#f06a4a"], sun: "#ffb27a", far: "#6a3a52", mid: "#3e2638", near: "#1b1220" },
  { n: "昼", sky: ["#4a86b8", "#cfe4ee"], sun: "#fff6d0", far: "#6f8fa8", mid: "#4d6b5e", near: "#27382f" },
  { n: "夜", sky: ["#070b1c", "#27345e"], sun: "#e8eaff", far: "#1d2848", mid: "#131b34", near: "#0a0e1c" },
  { n: "嵐", sky: ["#2a3038", "#6d7480"], sun: "#a9afb8", far: "#4a525d", mid: "#363c46", near: "#1a1e25" },
  { n: "秋", sky: ["#5a3a2a", "#e8b060"], sun: "#ffe0a0", far: "#8a5a38", mid: "#5a3a26", near: "#2a1a12" },
  { n: "古", sky: ["#4a4030", "#d8c690"], sun: "#fff0c0", far: "#8a7a58", mid: "#5e5238", near: "#2a2418" },
  { n: "翠", sky: ["#12384a", "#9ad0b4"], sun: "#f0ffd8", far: "#3a7a6a", mid: "#245a4e", near: "#0f2a26" },
  { n: "紅", sky: ["#3a1a2a", "#e0788a"], sun: "#ffd0d0", far: "#7a3a54", mid: "#4a2038", near: "#1e0e1a" },
  { n: "鋼", sky: ["#1c2634", "#8aa0b8"], sun: "#e8f0ff", far: "#4a6078", mid: "#2e3e52", near: "#141c28" },
];
const rngOf = (seed) => { let a = (seed * 2654435761 + 1013904223) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const f = (x) => Math.round(x * 10) / 10;
/** 山並み・丘の稜線（下を塗りつぶす path） */
function ridge(r, base, amp, steps = 14, smooth = true) {
  const pts = []; for (let i = 0; i <= steps; i++) pts.push([(1600 / steps) * i, base - r() * amp]);
  let d = `M0,900 L${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) { if (smooth) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2; d += ` Q${f(x0 + 40)},${f(y0)} ${f(mx)},${f((y0 + y1) / 2)} T${f(x1)},${f(y1)}`; } else d += ` L${f(pts[i][0])},${f(pts[i][1])}`; }
  return d + " L1600,900 Z";
}
const tri = (x, y, w, h) => `M${f(x - w / 2)},${f(y)} L${f(x)},${f(y - h)} L${f(x + w / 2)},${f(y)} Z`;
const person = (x, y, s, mounted) => (mounted ? `M${f(x - 7 * s)},${f(y)} h${f(14 * s)} l${f(3 * s)},${f(-8 * s)} h${f(-20 * s)} Z M${f(x - 2 * s)},${f(y - 8 * s)} v${f(-9 * s)} h${f(4 * s)} v${f(9 * s)} Z M${f(x + 6 * s)},${f(y - 9 * s)} l${f(6 * s)},${f(-6 * s)} l${f(2 * s)},${f(2 * s)} l${f(-5 * s)},${f(7 * s)} Z` : `M${f(x - 2 * s)},${f(y)} v${f(-12 * s)} h${f(4 * s)} v${f(12 * s)} Z M${f(x)},${f(y - 15 * s)} m${f(-2.5 * s)},0 a${f(2.5 * s)},${f(2.5 * s)} 0 1 0 ${f(5 * s)},0 a${f(2.5 * s)},${f(2.5 * s)} 0 1 0 ${f(-5 * s)},0`);
/** seed（0〜999）→ SVG 文字列 */
export function sceneSvg(seed) {
  const s = ((seed % SCENE_COUNT) + SCENE_COUNT) % SCENE_COUNT, kind = s % 10, pal = PALETTES[Math.floor(s / 10) % 10], v = Math.floor(s / 100), r = rngOf(s + 1);
  const sunX = 200 + r() * 1200, sunY = kind === 8 || pal.n === "夜" ? 150 + r() * 120 : 250 + r() * 150 + v * 8, sunR = 40 + r() * 50 + (kind === 2 ? 40 : 0);
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" data-scene="${s}"><defs><linearGradient id="g${s}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.sky[0]}"/><stop offset="1" stop-color="${pal.sky[1]}"/></linearGradient><radialGradient id="s${s}"><stop offset="0" stop-color="${pal.sun}" stop-opacity=".95"/><stop offset="1" stop-color="${pal.sun}" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="url(#g${s})"/>`;
  if (pal.n === "夜" || kind === 8) for (let i = 0; i < 70 + v * 6; i++) o += `<circle cx="${f(r() * 1600)}" cy="${f(r() * 480)}" r="${f(0.6 + r() * 1.4)}" fill="#fff" opacity="${f(0.3 + r() * 0.7)}"/>`;
  o += `<circle cx="${f(sunX)}" cy="${f(sunY)}" r="${f(sunR * 3.4)}" fill="url(#s${s})"/><circle cx="${f(sunX)}" cy="${f(sunY)}" r="${f(sunR)}" fill="${pal.sun}"/>`;
  for (let i = 0; i < 3 + (v % 4); i++) { const cx = r() * 1600, cy = 90 + r() * 260, w = 120 + r() * 260; o += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(w)}" ry="${f(10 + r() * 16)}" fill="#fff" opacity="${f(0.05 + r() * 0.1)}"/>`; }
  const L = (d, col, op = 1) => `<path d="${d}" fill="${col}" opacity="${op}"/>`;
  switch (kind) {
    case 0: o += L(ridge(r, 560, 240, 9, false), pal.far, 0.9) + L(ridge(r, 640, 200, 11, false), pal.mid) + L(ridge(r, 760, 120, 13), pal.near); break;
    case 1: {
      o += L(ridge(r, 600, 140, 8), pal.far, 0.85);
      for (let i = 0; i < 7; i++) { const y = 600 + i * 46, amp = 18 + r() * 26, ph = r() * 6; let d = `M0,900 L0,${f(y)}`; for (let x = 0; x <= 1600; x += 80) d += ` L${x},${f(y + Math.sin(x / 190 + ph) * amp)}`; d += " L1600,900 Z"; o += L(d, i % 2 ? pal.mid : pal.near, 0.95); o += `<path d="${d.replace(/ L1600,900 Z$/, "").replace(/^M0,900 L/, "M")}" fill="none" stroke="${pal.sun}" stroke-opacity=".18" stroke-width="2"/>`; }
      for (let i = 0; i < 2 + (v % 3); i++) { const x = 150 + r() * 1300, y = 640 + r() * 140; o += `<path d="M${f(x - 22)},${f(y)} h44 v-18 l-22,-16 l-22,16 Z" fill="${pal.near}"/>`; } break;
    }
    case 2: {
      for (let k = 0; k < 4; k++) { const y = 560 + k * 70, a = 30 + r() * 36, ph = r() * 6; let d = `M0,900 L0,${f(y)}`; for (let x = 0; x <= 1600; x += 50) d += ` L${x},${f(y - Math.abs(Math.sin(x / (170 + k * 30) + ph)) * a)}`; d += " L1600,900 Z"; o += L(d, [pal.far, pal.mid, pal.near, pal.near][k], 0.95); }
      const cy = 690 + r() * 40, n = 4 + (v % 5); for (let i = 0; i < n; i++) { const x = 300 + i * 70 + r() * 20; o += `<path d="M${f(x - 18)},${f(cy)} h36 l-4,-20 h-8 l-4,-18 l-4,18 h-12 Z M${f(x - 14)},${f(cy)} v20 M${f(x + 12)},${f(cy)} v20" fill="${pal.near}" stroke="${pal.near}" stroke-width="3"/>`; } break;
    }
    case 3: {
      const hz = 540 + v * 6; o += `<rect y="${hz}" width="1600" height="${900 - hz}" fill="${pal.mid}"/><rect y="${hz}" width="1600" height="${900 - hz}" fill="url(#g${s})" opacity=".35"/>`;
      for (let i = 0; i < 22; i++) { const y = hz + 12 + r() * (880 - hz), x = r() * 1600; o += `<path d="M${f(x)},${f(y)} h${f(40 + r() * 80)}" stroke="${pal.sun}" stroke-opacity="${f(0.1 + r() * 0.2)}" stroke-width="2"/>`; }
      const ships = 2 + (v % 4); for (let i = 0; i < ships; i++) { const x = 200 + r() * 1200, y = hz + 40 + r() * 140, sc = 0.6 + r() * 0.8; o += `<path d="M${f(x - 40 * sc)},${f(y)} h${f(80 * sc)} l${f(-12 * sc)},${f(14 * sc)} h${f(-56 * sc)} Z" fill="${pal.near}"/><path d="M${f(x)},${f(y)} v${f(-70 * sc)} M${f(x)},${f(y - 68 * sc)} l${f(34 * sc)},${f(54 * sc)} h${f(-34 * sc)} Z M${f(x - 4)},${f(y - 60 * sc)} l${f(-28 * sc)},${f(46 * sc)} h${f(28 * sc)} Z" fill="${pal.near}" stroke="${pal.near}" stroke-width="2"/>`; }
      o += L(`M0,900 L0,${f(520 + r() * 60)} Q300,${f(560 + r() * 60)} 420,720 T${f(560 + r() * 80)},900 Z`, pal.near); break;
    }
    case 4: {
      o += L(ridge(r, 600, 150, 10), pal.far, 0.85);
      for (let row = 0; row < 3; row++) { const y = 620 + row * 90, n = 22 + row * 6, col = [pal.far, pal.mid, pal.near][row]; let d = ""; for (let i = 0; i < n; i++) { const x = (1600 / n) * i + r() * 40, h = 90 + r() * 120 + row * 30; d += tri(x, y + r() * 30, 50 + r() * 36 + row * 12, h) + " "; } o += L(d, col); o += `<rect y="${y + 20}" width="1600" height="${900 - y - 20}" fill="${col}"/>`; } break;
    }
    case 5: {
      o += L(ridge(r, 640, 60, 9), pal.far, 0.8) + L(ridge(r, 720, 40, 12), pal.mid) + `<rect y="780" width="1600" height="120" fill="${pal.near}"/>`;
      const n = 5 + (v % 7); for (let i = 0; i < n; i++) { const x = 120 + r() * 1360, y = 730 + r() * 90; o += `<path d="${person(x, y, 1 + r() * 0.7, true)}" fill="${pal.near}"/>`; }
      for (let i = 0; i < 40; i++) { const x = r() * 1600, y = 760 + r() * 130; o += `<path d="M${f(x)},${f(y)} l${f(-3)},${f(-16 - r() * 12)} M${f(x)},${f(y)} l${f(4)},${f(-14 - r() * 10)}" stroke="${pal.mid}" stroke-width="2"/>`; } break;
    }
    case 6: {
      o += L(ridge(r, 650, 70, 8), pal.far, 0.7); let d = `M0,900 L0,760`, x = 0;
      while (x < 1600) { const w = 40 + r() * 80, h = 90 + r() * 230, y = 760 - h; d += ` L${f(x)},${f(y)} L${f(x + w)},${f(y)}`; if (r() < 0.35) d += ` L${f(x + w)},${f(y - 40)} L${f(x + w * 0.5)},${f(y - 70)}`; x += w; d += ` L${f(x)},${f(760 - 60 - r() * 60)}`; }
      d += " L1600,760 L1600,900 Z"; o += L(d, pal.mid) + `<rect y="800" width="1600" height="100" fill="${pal.near}"/>`;
      for (let i = 0; i < 40; i++) o += `<rect x="${f(r() * 1580)}" y="${f(540 + r() * 230)}" width="5" height="8" fill="${pal.sun}" opacity="${f(0.3 + r() * 0.6)}"/>`; break;
    }
    case 7: {
      o += L(ridge(r, 620, 90, 10), pal.far, 0.85) + L(ridge(r, 740, 70, 12), pal.mid) + `<rect y="800" width="1600" height="100" fill="${pal.near}"/>`;
      for (let i = 0; i < 3 + (v % 3); i++) { const x = 100 + r() * 1400, w = 40 + r() * 30; o += `<path d="M${f(x)},760 Q${f(x + 40)},${f(560 - r() * 80)} ${f(x - 20)},420" stroke="${pal.far}" stroke-width="${f(w)}" fill="none" opacity=".35"/>`; }
      const n = 18 + v * 3; for (let i = 0; i < n; i++) { const x = 60 + (1480 / n) * i + r() * 30, y = 790 + r() * 40, sc = 0.8 + r() * 0.5; o += `<path d="${person(x, y, sc, false)}" fill="${pal.near}"/><path d="M${f(x + 6 * sc)},${f(y)} v${f(-46 - r() * 20)}" stroke="${pal.near}" stroke-width="2"/>`; if (i % 5 === 0) o += `<path d="M${f(x + 6 * sc)},${f(y - 60)} h${f(26 * sc)} v${f(-18 * sc)} h${f(-26 * sc)} Z" fill="${["#b03a3a", "#c9a23a", "#3a5ab0"][i % 3]}"/><path d="M${f(x + 6 * sc)},${f(y)} v-70" stroke="${pal.near}" stroke-width="2"/>`; } break;
    }
    case 8: {
      o += `<path d="M0,300 Q400,${f(120 + r() * 100)} 800,260 T1600,${f(180 + r() * 100)} L1600,360 Q1000,300 700,380 T0,380 Z" fill="#6ff0c0" opacity=".13"/>`;
      o += L(ridge(r, 560, 280, 8, false), pal.far) + L(ridge(r, 690, 200, 9, false), pal.mid) + L(ridge(r, 790, 80, 10), "#e8f0ff", 0.9) + L(ridge(r, 850, 50, 12), pal.near); break;
    }
    default: {
      o += L(ridge(r, 600, 130, 9), pal.far, 0.85) + L(ridge(r, 660, 90, 11), pal.mid);
      let d = `M${f(600 + r() * 300)},620`, x = 800, y = 620; for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 360; y += 46; d += ` Q${f(x + 60)},${f(y - 20)} ${f(x)},${f(y)}`; }
      o += `<rect y="660" width="1600" height="240" fill="${pal.near}"/><path d="${d} L${f(x + 300)},900 L${f(x - 300)},900 Z" fill="${pal.sky[1]}" opacity=".55"/>`;
      for (let i = 0; i < 26; i++) { const rx = r() * 1600, ry = 800 + r() * 90; o += `<path d="M${f(rx)},${f(ry)} q${f(-4)},${f(-30)} ${f(-10)},${f(-44)} M${f(rx)},${f(ry)} q${f(5)},${f(-24)} ${f(11)},${f(-38)}" stroke="${pal.mid}" stroke-width="2" fill="none"/>`; } break;
    }
  }
  return o + `<rect width="1600" height="900" fill="#000" opacity=".16"/></svg>`;
}
export const sceneName = (seed) => { const s = ((seed % SCENE_COUNT) + SCENE_COUNT) % SCENE_COUNT; return `${PALETTES[Math.floor(s / 10) % 10].n}の${SCENE_KINDS[s % 10]}`; };

/** ロゴ（仮の SVG）。円環の中で、1 本の時の流れが 2 本に分かれる（もしも、の歴史）。withText で ALTERHISTORY の文字も */
export function logoSvg({ withText = true } = {}) {
  const emblem = `<g fill="none" stroke="#d8b45a" stroke-linecap="round"><circle cx="100" cy="100" r="86" stroke-width="3"/><circle cx="100" cy="100" r="76" stroke-width="1" opacity=".6"/><ellipse cx="100" cy="100" rx="34" ry="76" stroke-width="1" opacity=".5"/><path d="M24 100H176" stroke-width="1" opacity=".5"/><path d="M100 168V118Q100 100 80 80Q64 62 64 36M100 118Q100 100 120 80Q136 62 136 36" stroke-width="5"/></g><circle cx="64" cy="34" r="6" fill="#d8b45a"/><circle cx="136" cy="34" r="6" fill="#6fa8c9"/><circle cx="100" cy="170" r="5" fill="#e8e2d0"/>`;
  return withText ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" role="img" aria-label="ALTERHISTORY"><g transform="translate(10,10)">${emblem}</g><text x="232" y="112" font-family="'Shippori Mincho','Yu Mincho','Hiragino Mincho ProN',serif" font-size="58" letter-spacing="9" fill="#e8e2d0">ALTER</text><text x="232" y="172" font-family="'Shippori Mincho','Yu Mincho','Hiragino Mincho ProN',serif" font-size="58" letter-spacing="9" fill="#d8b45a">HISTORY</text></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="ALTERHISTORY">${emblem}</svg>`;
}
