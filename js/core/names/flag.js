// v6.15.0: 国旗。小さな仕様（spec）から SVG を描く。純粋ロジック層（DOM に依存しない）。
//   spec = { field: { kind, c: [色キー…] }, charge: { kind, c: 色キー, size: 0.7〜1.3 } | null }
//   ・色は 2〜4 色。紋章学の規則: 金属（金・白）の上には「色」、色の上には「金属」の図形を置く
//   ・文化（言語）ごとに配色の傾向を持つ（bias）。同じ言語の国は似た色づかいになる
//   ・ランダム生成（randomFlag）と、ユーザーが図形・色を選んで直す（normalizeFlag・FLAG_* の一覧）の両方に使う
import { hashSeed, rngOf } from "../civ/civ-state.js";

export const FLAG_COLORS = Object.freeze({ gold: "#e3b93f", white: "#f4f0e6", red: "#be3329", blue: "#244c9a", green: "#2c7a4d", black: "#1c1c1f", purple: "#68408f", orange: "#d8762a", sky: "#4a9bd4" });
const METALS = new Set(["gold", "white"]);
export const isMetal = (k) => METALS.has(k);
export const FLAG_FIELDS = Object.freeze([
  ["plain", "無地", 1], ["h2", "横二分", 2], ["h3", "横三分", 3], ["v2", "縦二分", 2], ["v3", "縦三分", 3], ["pale", "縦の太帯", 3], ["cross", "北欧十字", 3],
  ["saltire", "斜め十字", 2], ["bend", "斜め帯", 2], ["tri", "掲揚側の三角", 2], ["canton", "角の四角", 2], ["quarters", "四分割", 2], ["chevron", "山形", 2],
].map(([kind, ja, n]) => Object.freeze({ kind, ja, n })));
export const FLAG_CHARGES = Object.freeze([
  ["none", "なし"], ["disc", "円"], ["ring", "輪"], ["star4", "四芒星"], ["star5", "五芒星"], ["star8", "八芒星"], ["crescent", "月"], ["moonstar", "月と星"],
  ["diamond", "菱形"], ["triangle", "三角"], ["sun", "太陽"], ["cross", "十字"], ["wave", "波"],
].map(([kind, ja]) => Object.freeze({ kind, ja })));
// 文化ごとの配色の傾向（main: 色の候補／metal: 金属の候補）
const BIAS = Object.freeze([
  { main: ["red", "black", "blue"], metal: ["gold", "white"] }, { main: ["green", "red", "blue"], metal: ["white", "gold"] }, { main: ["blue", "red", "green"], metal: ["white", "gold"] },
  { main: ["black", "red", "purple"], metal: ["gold", "white"] }, { main: ["red", "orange", "green"], metal: ["gold", "white"] }, { main: ["sky", "blue", "green"], metal: ["white", "gold"] },
]);
export const FLAG_BIAS_COUNT = BIAS.length;
const W = 90, H = 60;
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const fieldInfo = (kind) => FLAG_FIELDS.find((f) => f.kind === kind) ?? FLAG_FIELDS[0];

/** 図形の置き場所（x, y, 基準の半径）。北欧十字は十字の交点、斜めの三角・山形・角の四角は掲揚側 */
function anchor(kind) {
  switch (kind) {
    case "cross": return { x: 30, y: 30, r: 11 };
    case "tri": return { x: 16, y: 30, r: 9 };
    case "chevron": return { x: 14, y: 30, r: 8 };
    case "canton": return { x: 18, y: 14, r: 8 };
    default: return { x: 45, y: 30, r: 14 };
  }
}
/** 図形の下にある地の色（金属か色か）。図形の色はこの反対の種類にする */
function groundKey(field) {
  const c = field.c ?? []; switch (field.kind) {
    case "tri": case "canton": case "cross": case "saltire": case "bend": case "pale": case "h3": case "v3": return c[1] ?? c[0]; default: return c[0]; // 図形の下に来る帯・十字の色（chevron・無地・二分・四分割は地の色）
  }
}

/** ランダムな国旗。rnd は 0〜1 の乱数関数。bias は文化の配色の傾向（0〜5） */
export function randomFlag(rnd, bias = 0) {
  const B = BIAS[((bias % BIAS.length) + BIAS.length) % BIAS.length], kind = pick(rnd, FLAG_FIELDS).kind, n = fieldInfo(kind).n, cols = [];
  const m0 = pick(rnd, B.main); cols.push(m0);
  if (n >= 2) cols.push(rnd() < 0.55 ? pick(rnd, B.metal) : pick(rnd, B.main.filter((x) => x !== m0)));
  if (n >= 3) cols.push(rnd() < 0.5 ? cols[0] : pick(rnd, [...B.metal, ...B.main].filter((x) => x !== cols[1])));
  const field = { kind, c: cols.slice(0, n) };
  let charge = null;
  if (rnd() < 0.82 || new Set(cols).size < 2) {
    const ck = pick(rnd, FLAG_CHARGES.filter((x) => x.kind !== "none")).kind, g = groundKey(field), want = isMetal(g) ? B.main : B.metal;
    charge = { kind: ck, c: pick(rnd, want), size: 1 };
    if (ck === "wave") charge.c = isMetal(g) ? pick(rnd, B.main.filter((x) => x !== g)) : pick(rnd, B.metal);
  }
  return { field, charge };
}
/** 国の ID から決まる国旗（保存していない国家の旗。毎回同じになる） */
export const flagFor = (id, bias = 0) => randomFlag(rngOf(hashSeed(String(id), "flag")), bias);
/** 保存されている旗、なければ ID と言語から決まる旗 */
export const flagOfState = (st) => (st?.flag && st.flag.field ? normalizeFlag(st.flag) : flagFor(st?.id ?? "x", hashSeed(String(st?.nameLang ?? st?.id ?? "x"), "bias")));

/** 仕様を整える（未知の図形・色は既定に。色の数は図形に合わせる） */
export function normalizeFlag(spec) {
  const kind = FLAG_FIELDS.some((f) => f.kind === spec?.field?.kind) ? spec.field.kind : "plain", n = fieldInfo(kind).n, ok = (k) => (FLAG_COLORS[k] ? k : "red");
  const c = Array.from({ length: n }, (_, i) => ok(spec?.field?.c?.[i] ?? (i === 0 ? "red" : i === 1 ? "white" : spec?.field?.c?.[0] ?? "red")));
  const ch = spec?.charge && FLAG_CHARGES.some((x) => x.kind === spec.charge.kind && x.kind !== "none") ? { kind: spec.charge.kind, c: ok(spec.charge.c ?? "white"), size: Math.max(0.6, Math.min(1.4, Number(spec.charge.size) || 1)) } : null;
  return { field: { kind, c }, charge: ch };
}
/** 紋章学の規則に合っているか（図形が地と同じ種類の色になっていないか） */
export const flagRuleOk = (spec) => { const f = normalizeFlag(spec); if (!f.charge) return true; return isMetal(f.charge.c) !== isMetal(groundKey(f.field)); };

const pts = (a) => a.map((p) => p.map((v) => Math.round(v * 100) / 100).join(",")).join(" ");
const star = (n, cx, cy, R, ratio) => { const out = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? R * ratio : R; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return out; };

function fieldSvg(field) {
  const C = (i) => FLAG_COLORS[field.c[i] ?? field.c[0]], r = (x, y, w, h, f) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`;
  switch (field.kind) {
    case "h2": return r(0, 0, W, H / 2, C(0)) + r(0, H / 2, W, H / 2, C(1));
    case "h3": return r(0, 0, W, H / 3, C(0)) + r(0, H / 3, W, H / 3, C(1)) + r(0, (2 * H) / 3, W, H / 3, C(2));
    case "v2": return r(0, 0, W / 2, H, C(0)) + r(W / 2, 0, W / 2, H, C(1));
    case "v3": return r(0, 0, W / 3, H, C(0)) + r(W / 3, 0, W / 3, H, C(1)) + r((2 * W) / 3, 0, W / 3, H, C(2));
    case "pale": return r(0, 0, W, H, C(0)) + r(W / 4, 0, W / 2, H, C(1)) + r(W * 0.42, 0, W * 0.16, H, C(2));
    case "cross": return r(0, 0, W, H, C(0)) + r(24, 0, 12, H, C(1)) + r(0, 24, W, 12, C(1)) + r(28, 0, 4, H, C(2)) + r(0, 28, W, 4, C(2));
    case "saltire": return r(0, 0, W, H, C(0)) + `<polygon points="${pts([[0, 0], [11, 0], [W, H - 7.3], [W, H], [W - 11, H], [0, 7.3]])}" fill="${C(1)}"/><polygon points="${pts([[W, 0], [W, 7.3], [11, H], [0, H], [0, H - 7.3], [W - 11, 0]])}" fill="${C(1)}"/>`;
    case "bend": return r(0, 0, W, H, C(0)) + `<polygon points="${pts([[0, 0], [16, 0], [W, H - 10.7], [W, H], [W - 16, H], [0, 10.7]])}" fill="${C(1)}"/>`;
    case "tri": return r(0, 0, W, H, C(0)) + `<polygon points="${pts([[0, 0], [38, 30], [0, H]])}" fill="${C(1)}"/>`;
    case "canton": return r(0, 0, W, H, C(0)) + r(0, 0, 38, 30, C(1));
    case "quarters": return r(0, 0, W / 2, H / 2, C(0)) + r(W / 2, 0, W / 2, H / 2, C(1)) + r(0, H / 2, W / 2, H / 2, C(1)) + r(W / 2, H / 2, W / 2, H / 2, C(0));
    case "chevron": return r(0, 0, W, H, C(0)) + `<polygon points="${pts([[0, 0], [20, 0], [50, 30], [20, H], [0, H], [30, 30]])}" fill="${C(1)}"/>`;
    default: return r(0, 0, W, H, C(0));
  }
}
function chargeSvg(field, ch) {
  if (!ch) return ""; const a = anchor(field.kind), R = a.r * (ch.size ?? 1), x = a.x, y = a.y, f = FLAG_COLORS[ch.c];
  switch (ch.kind) {
    case "disc": return `<circle cx="${x}" cy="${y}" r="${R}" fill="${f}"/>`;
    case "ring": return `<circle cx="${x}" cy="${y}" r="${R * 0.82}" fill="none" stroke="${f}" stroke-width="${Math.max(1.6, R * 0.26)}"/>`;
    case "star4": return `<polygon points="${pts(star(4, x, y, R, 0.38))}" fill="${f}"/>`;
    case "star5": return `<polygon points="${pts(star(5, x, y, R, 0.42))}" fill="${f}"/>`;
    case "star8": return `<polygon points="${pts(star(8, x, y, R, 0.56))}" fill="${f}"/>`;
    case "crescent": return `<path d="M${x},${y - R} A${R},${R} 0 1 0 ${x},${y + R} A${R * 1.12},${R * 1.12} 0 0 1 ${x},${y - R}Z" fill="${f}" transform="translate(${-R * 0.18} 0)"/>`;
    case "moonstar": return `<path d="M${x - R * 0.35},${y - R} A${R},${R} 0 1 0 ${x - R * 0.35},${y + R} A${R * 1.12},${R * 1.12} 0 0 1 ${x - R * 0.35},${y - R}Z" fill="${f}"/><polygon points="${pts(star(5, x + R * 0.55, y, R * 0.42, 0.42))}" fill="${f}"/>`;
    case "diamond": return `<polygon points="${pts([[x, y - R * 1.15], [x + R * 0.85, y], [x, y + R * 1.15], [x - R * 0.85, y]])}" fill="${f}"/>`;
    case "triangle": return `<polygon points="${pts([[x, y - R], [x + R * 0.95, y + R * 0.75], [x - R * 0.95, y + R * 0.75]])}" fill="${f}"/>`;
    case "sun": { let g = ""; for (let i = 0; i < 16; i++) { const t = (i * Math.PI) / 8, r1 = R * 0.62, r2 = i % 2 ? R * 1.05 : R * 1.3, d = 0.11; g += `<polygon points="${pts([[x + r1 * Math.cos(t - d), y + r1 * Math.sin(t - d)], [x + r2 * Math.cos(t), y + r2 * Math.sin(t)], [x + r1 * Math.cos(t + d), y + r1 * Math.sin(t + d)]])}" fill="${f}"/>`; } return g + `<circle cx="${x}" cy="${y}" r="${R * 0.58}" fill="${f}"/>`; }
    case "cross": return `<rect x="${x - R * 0.2}" y="${y - R}" width="${R * 0.4}" height="${R * 2}" fill="${f}"/><rect x="${x - R}" y="${y - R * 0.2}" width="${R * 2}" height="${R * 0.4}" fill="${f}"/>`;
    case "wave": { let g = ""; for (let k = -1; k <= 1; k++) { const yy = y + k * R * 0.62; g += `<path d="M${x - R * 1.4},${yy} q${R * 0.35},${-R * 0.3} ${R * 0.7},0 t${R * 0.7},0 t${R * 0.7},0 t${R * 0.7},0" fill="none" stroke="${f}" stroke-width="${Math.max(1.5, R * 0.22)}" stroke-linecap="round"/>`; } return g; }
    default: return "";
  }
}
/** 国旗の SVG（文字列）。w・h は表示の大きさ（比率は 3:2） */
export function flagSvg(spec, { w = 120, h = null } = {}) {
  const f = normalizeFlag(spec), hh = h ?? Math.round((w * 2) / 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${w}" height="${hh}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="国旗"><defs><clipPath id="fc"><rect width="${W}" height="${H}"/></clipPath></defs><g clip-path="url(#fc)">${fieldSvg(f.field)}${chargeSvg(f.field, f.charge)}</g><rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" fill="none" stroke="rgba(0,0,0,.35)"/></svg>`;
}
/** 使われている色の数（2〜4 色の範囲に収まっているか） */
export const flagColorCount = (spec) => { const f = normalizeFlag(spec); return new Set([...f.field.c, ...(f.charge ? [f.charge.c] : [])]).size; };
