// 場所の層：都市の記号と、国名・属州名・都市名のラベル。
//
// Azgaar と同じく「近づくほど情報が増える」方式。
//   ズーム倍率 z = 現在の倍率 ÷ 全体表示の倍率（全体表示のとき 1）
//   ・国名   … 全体表示から出る。近づくと薄れて、都市名に場所を譲る
//   ・首都   … いつでも出る
//   ・都市   … 人口の多い順に、z が大きくなるほど下位の都市まで現れる（ふわっと浮かぶ）
//   ・属州名 … 中くらいの拡大から出る（字間を広げた細めの文字）
//   重なるラベルは、優先度の高いもの（国名 > 首都 > 大きな都市 > 属州 > 小さな都市）だけを残す。
import { FONT_PLACE } from "../fonts.js";
import { entityPosition } from "../../core/query.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ramp = (z, z0, z1) => clamp((z - z0) / (z1 - z0), 0, 1);
const zoomOf = (vp) => (vp.fitK > 0 ? vp.k / vp.fitK : 1);

/** 都市を人口順に並べ、首都以外に「上位から何割目か」(0=最大, 1=最小) を付ける */
function rankBurgs(map) {
  const live = map.pack.burgs.filter((b) => b && b.i && !b.removed);
  const towns = live.filter((b) => !b.capital).sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
  const p = new Map();
  towns.forEach((b, i) => p.set(b, towns.length > 1 ? i / (towns.length - 1) : 0));
  const capitals = live.filter((b) => b.capital).sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
  return { capitals, towns, percentile: (b) => (b.capital ? -1 : p.get(b) ?? 1) };
}

/** この都市の名前が現れ始める倍率。首都は 0（最初から）、最下位の都市は約 6.3 倍 */
const labelZoom = (pc) => (pc < 0 ? 0 : 1.15 + 5.2 * Math.pow(pc, 0.85));
/** 記号は名前より少し早く現れる（「点が見えて、近づくと名前が付く」） */
const iconZoom = (pc) => (pc < 0 ? 0 : labelZoom(pc) * 0.72);

/**
 * 都市の記号。画面上での大きさが一定になるよう、ズームで割る。
 * auto: true のとき、ズームに応じて小さな都市を隠す。
 */
export function drawBurgs(ctx, map, vp, { minPopulation = 0, auto = false } = {}) {
  const vb = vp.visibleBounds(8);
  const z = zoomOf(vp);
  const rank = auto ? rankBurgs(map) : null;
  for (const b of map.pack.burgs) {
    if (!b || !b.i || b.removed) continue;
    if (b.x < vb.x0 || b.x > vb.x1 || b.y < vb.y0 || b.y > vb.y1) continue; // 画面外は描かない
    if (!b.capital && (b.population ?? 0) < minPopulation) continue;
    let alpha = 1, big = false;
    if (auto) {
      const pc = rank.percentile(b);
      alpha = b.capital ? 1 : ramp(z, iconZoom(pc), iconZoom(pc) + 0.4);
      big = pc >= 0 && pc < 0.12;
      if (alpha <= 0) continue;
    }
    const r = (b.capital ? 4 : big ? 2.8 : 2.1) / vp.k;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fillStyle = b.capital ? "#8a2323" : "#f6f1e5";
    ctx.fill();
    ctx.lineWidth = (b.capital ? 1.4 : 1) / vp.k;
    ctx.strokeStyle = "#2b2118";
    ctx.stroke();
    if (b.capital) { // 首都は中に小さな点を入れて、普通の都市と見分けやすくする
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = "#f6f1e5";
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * ラベル。
 * burgs: "auto" = ズーム連動 / true = 全都市（重なりだけ避ける） / "capitals" = 首都のみ / false = 非表示
 */
export function drawLabels(ctx, map, vp, { states = true, burgs = "auto" } = {}) {
  const placed = []; // 画面座標の矩形
  const k = vp.k;
  const z = zoomOf(vp);
  const vb = vp.visibleBounds(0);
  const inView = (x, y) => x >= vb.x0 && x <= vb.x1 && y >= vb.y0 && y <= vb.y1;
  const hasSpacing = "letterSpacing" in ctx;

  /** style: { color, halo, weight, spacing(px), alpha, shadow } */
  const tryPlace = (text, wx, wy0, sizePx, style) => {
    if (!text) return false;
    for (const dyPx of style.shifts ?? [0]) if (placeOnce(text, wx, wy0 + dyPx / k, sizePx, style)) return true;
    return false;
  };
  const placeOnce = (text, wx, wy, sizePx, style) => {
    const sp = style.spacing ?? 0;
    ctx.font = `${style.weight >= 700 ? "bold " : ""}${sizePx / k}px ${FONT_PLACE}`;
    if (hasSpacing) ctx.letterSpacing = `${sp / k}px`;
    const w = ctx.measureText(text).width * k;
    const [sx, sy] = vp.toScreen(wx, wy);
    const pad = 3;
    const rect = [sx - w / 2 - pad, sy - sizePx / 2 - 2, sx + w / 2 + pad, sy + sizePx / 2 + 2];
    for (const r of placed) {
      if (rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1]) { if (hasSpacing) ctx.letterSpacing = "0px"; return false; }
    }
    placed.push(rect);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.globalAlpha = style.alpha ?? 1;
    ctx.lineWidth = style.halo / k;
    ctx.strokeStyle = "rgba(250,246,232,0.93)";
    ctx.strokeText(text, wx, wy);
    ctx.fillStyle = style.color;
    ctx.fillText(text, wx, wy);
    ctx.globalAlpha = 1;
    if (hasSpacing) ctx.letterSpacing = "0px";
    return true;
  };

  const rank = burgs === false ? null : rankBurgs(map);
  const auto = burgs === "auto";
  const capitalsOnly = burgs === "capitals";

  const sizeOf = (b, pc) => {
    const base = pc < 0 ? 14.5 : pc < 0.12 ? 12.5 : pc < 0.4 ? 11.5 : 10.5;
    return base * (auto ? 1 + 0.05 * clamp(z - 2, 0, 6) : 1);
  };
  const placeBurg = (b) => {
    if (!inView(b.x, b.y)) return;
    const pc = rank.percentile(b);
    let alpha = 1;
    if (auto) {
      const z0 = labelZoom(pc);
      alpha = b.capital ? 1 : ramp(z, z0, z0 + 0.5);
      if (alpha <= 0) return;
    }
    const size = sizeOf(b, pc);
    const dy = (b.capital ? 7.5 : 6) / k;
    tryPlace(b.name ?? "", b.x, b.y + dy, size, { color: b.capital ? "#1c120b" : "#241a12", halo: 2.8, weight: b.capital ? 800 : 500, spacing: b.capital ? 0.6 : 0.2, alpha });
  };

  // 場所を確保する順（先のものが優先）: 首都 → 国名 → 大きな都市 → 属州名 → 残りの都市
  // 国名は首都の名前と重なるときだけ、上下にずらして置く（首都名は位置を動かさない）
  if (rank) for (const b of rank.capitals) placeBurg(b);

  if (states) {
    const list = map.pack.states
      .filter((s) => s && s.i && !s.removed && s.pole)
      .sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
    const fade = burgs === "auto" ? 1 - 0.8 * ramp(z, 4.5, 8) : 1;
    for (const s of list) {
      if (!inView(s.pole[0], s.pole[1])) continue;
      const size = clamp(12 + Math.sqrt(s.area ?? 0) * 0.012 * Math.min(k, 3), 14, 24);
      const draw = fade > 0.5 ? tryPlace : (...a) => placedSoft(...a);
      draw(s.name ?? "", s.pole[0], s.pole[1], size, { color: "#2a1d12", halo: 3.6, weight: 800, spacing: size * 0.18, alpha: fade, shifts: [0, -22, 22, -40, 40] });
    }
  }
  function placedSoft(text, wx, wy, sizePx, style) { // 薄い国名は、他のラベルを邪魔しないよう矩形を登録せずに描く
    const before = placed.length;
    const ok = tryPlace(text, wx, wy, sizePx, style);
    if (ok) placed.length = before;
    return ok;
  }


  if (!rank || capitalsOnly) return;
  const topN = Math.max(1, Math.round(rank.towns.length * 0.15));
  for (const b of rank.towns.slice(0, topN)) placeBurg(b);

  if (auto) {
    const a = ramp(z, 1.7, 2.3) * (1 - ramp(z, 7.5, 10));
    if (a > 0) {
      for (const p of map.pack.provinces ?? []) {
        if (!p || !p.i || p.removed || !p.name) continue;
        const pos = entityPosition(map, p);
        if (!pos || !inView(pos[0], pos[1])) continue;
        tryPlace(p.name, pos[0], pos[1] - 11 / k, 11.5, { color: "#4a3826", halo: 2.6, weight: 500, spacing: 3.2, alpha: a * 0.9, shifts: [0, 16, -16] });
      }
    }
  }
  for (const b of rank.towns.slice(topN)) placeBurg(b);
}
