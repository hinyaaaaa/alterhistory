// v6.1.2: 同盟関係の図。実際の勢力図（第一次世界大戦の同盟・協商、NATO と ワルシャワ条約機構 など）のように、
//   ・同盟でつながった国を 1 つの「陣営（圏）」にまとめ、陣営ごとに区切って描く（円周に並べて線を引くだけの図はやめた）
//   ・陣営の盟主（同盟が最も多い国。同数なら人口が多い国）を先頭に置き、盟主から同盟をたどった段（盟主と直接 → その先）で、上から下へ並べる
//   ・国名は省略せず、国名を入れた札（プレート）で描く。札は幅に合わせて折り返す
//   ・陣営どうしが戦争しているときは、その陣営の見出しに「交戦中」と相手の陣営名を出す。戦争中の国の札は、赤い破線の枠
// 読み取り専用（世界の状態を変えない）。
import { h, sv, colorOf, n0 } from "./common.js";

const W = 392, PH = 24, GAPX = 8, ROWGAP = 30, TOP = 18, MAX_MEMBERS = 24, MAX_BLOCS = 12;
/** 文字幅の見積り（本文 12px。全角は約 12.5、半角は約 7） */
export const textWidth = (s) => [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) < 256 ? 7 : 12.5), 0);

/** 生きている国どうしの有効な同盟を、つながり（連結成分）ごとの陣営にまとめる。大きい陣営（加盟国が多い・人口が多い）から */
export function allianceBlocs(civ) {
  const adj = new Map(), edges = [];
  const link = (a, b) => { (adj.get(a) ?? adj.set(a, new Set()).get(a)).add(b); };
  for (const i of civ.activeTreatyIds) { const t = civ.treaties[i]; if (!t || t.type !== "alliance" || !civ.states[t.a]?.alive || !civ.states[t.b]?.alive) continue; edges.push([t.a, t.b]); link(t.a, t.b); link(t.b, t.a); }
  const seen = new Set(), blocs = [];
  for (const id of [...adj.keys()].sort()) {
    if (seen.has(id)) continue; const members = [], q = [id]; seen.add(id);
    while (q.length) { const x = q.shift(); members.push(x); for (const y of [...adj.get(x)].sort()) if (!seen.has(y)) { seen.add(y); q.push(y); } }
    const deg = (x) => adj.get(x).size, pop = (x) => civ.states[x].pop;
    members.sort((a, b) => deg(b) - deg(a) || pop(b) - pop(a) || (a < b ? -1 : 1));
    blocs.push({ members, leader: members[0], pop: members.reduce((a, x) => a + pop(x), 0), edges: edges.filter(([a, b]) => members.includes(a)), deg });
  }
  blocs.sort((a, b) => b.members.length - a.members.length || b.pop - a.pop);
  const of = new Map(); blocs.forEach((b, k) => b.members.forEach((m) => of.set(m, k)));
  // 陣営どうしの交戦: 進行中の戦争の両側に、別々の陣営の国がいれば、その 2 陣営は交戦中
  const hostile = blocs.map(() => new Map());
  for (const wid of civ.activeWarIds) {
    const w = civ.wars[wid]; if (!w) continue; const ka = new Set(w.sides.a.map((x) => of.get(x)).filter((k) => k != null)), kd = new Set(w.sides.d.map((x) => of.get(x)).filter((k) => k != null));
    for (const a of ka) for (const d of kd) if (a !== d) { hostile[a].set(d, (hostile[a].get(d) ?? 0) + 1); hostile[d].set(a, (hostile[d].get(a) ?? 0) + 1); }
  }
  blocs.forEach((b, k) => { b.hostile = [...hostile[k].entries()].map(([o, n]) => ({ bloc: o, wars: n })); });
  return blocs;
}
export const blocName = (civ, bloc) => `${civ.states[bloc.leader].name}圏`;

/** 1 つの陣営の札の配置。盟主からの同盟の段ごとに行を作り、幅を超えたら折り返す */
export function layoutBloc(civ, bloc) {
  const shown = bloc.members.slice(0, MAX_MEMBERS), set = new Set(shown), adj = new Map(shown.map((m) => [m, new Set()]));
  for (const [a, b] of bloc.edges) if (set.has(a) && set.has(b)) { adj.get(a).add(b); adj.get(b).add(a); }
  const depth = new Map([[bloc.leader, 0]]), q = [bloc.leader];
  while (q.length) { const x = q.shift(); for (const y of adj.get(x)) if (!depth.has(y)) { depth.set(y, depth.get(x) + 1); q.push(y); } }
  for (const m of shown) if (!depth.has(m)) depth.set(m, 1 + Math.max(...depth.values())); // 表示を切り詰めて離れた国は、最下段に
  const layers = []; for (const m of shown) (layers[depth.get(m)] ??= []).push(m);
  const wOf = (id) => Math.min(W - 8, 24 + textWidth(civ.states[id].name) + (id === bloc.leader ? 14 : 0)), pos = new Map(); let row = 0;
  for (const layer of layers.filter(Boolean)) {
    layer.sort((a, b) => bloc.deg(b) - bloc.deg(a) || civ.states[b].pop - civ.states[a].pop || (a < b ? -1 : 1));
    const rows = []; let cur = [], cw = 0;
    for (const id of layer) { const w = wOf(id); if (cur.length && cw + GAPX + w > W - 8) { rows.push(cur); cur = []; cw = 0; } cw += (cur.length ? GAPX : 0) + w; cur.push(id); }
    if (cur.length) rows.push(cur);
    for (const r of rows) { const tot = r.reduce((a, id, i) => a + wOf(id) + (i ? GAPX : 0), 0); let x = (W - tot) / 2; for (const id of r) { const w = wOf(id); pos.set(id, { x, y: TOP + row * (PH + ROWGAP), w, row }); x += w + GAPX; } row++; }
  }
  return { pos, rows: row, height: TOP + row * (PH + ROWGAP) - ROWGAP + 8, hidden: bloc.members.length - shown.length, shown: set };
}

/** 札の SVG。クリックで国家の詳細へ */
function drawBloc(civ, bloc, L, onPick) {
  const g = sv("svg", { viewBox: `0 0 ${W} ${L.height}`, width: "100%", class: "gr bloc", role: "img", "aria-label": `${blocName(civ, bloc)}の同盟関係` });
  for (const [a, b] of bloc.edges) {
    const pa = L.pos.get(a), pb = L.pos.get(b); if (!pa || !pb) continue; const ax = pa.x + pa.w / 2, bx = pb.x + pb.w / 2; let d;
    if (pa.row === pb.row) d = `M${ax} ${pa.y} C${ax} ${pa.y - 20} ${bx} ${pb.y - 20} ${bx} ${pb.y}`; // 同じ段どうしは、札の上を渡る弧
    else { const [u, l] = pa.row < pb.row ? [pa, pb] : [pb, pa], ux = u.x + u.w / 2, lx = l.x + l.w / 2, y1 = u.y + PH, y2 = l.y; d = `M${ux} ${y1} C${ux} ${y1 + ROWGAP * 0.65} ${lx} ${y2 - ROWGAP * 0.65} ${lx} ${y2}`; }
    g.append(sv("path", { d, fill: "none", stroke: "#6fa8c9", "stroke-width": 1.7, "stroke-opacity": 0.85 }));
  }
  for (const id of L.shown) {
    const p = L.pos.get(id), s = civ.states[id], lead = id === bloc.leader, war = (s.warIds?.length ?? 0) > 0;
    g.append(sv("g", { class: "fn", onclick: () => onPick(id) },
      sv("title", {}, `${s.name}${lead ? "（盟主）" : ""}・同盟 ${bloc.deg(id)} か国・人口 ${n0(s.pop)}${war ? "・交戦中" : ""}`),
      sv("rect", { x: p.x, y: p.y, width: p.w, height: PH, rx: 3, fill: "#161a1f", stroke: war ? "#d0605a" : colorOf(id), "stroke-width": lead ? 2.4 : 1.5, "stroke-dasharray": war ? "4 2" : null }),
      sv("circle", { cx: p.x + 11, cy: p.y + PH / 2, r: 4.5, fill: colorOf(id) }),
      sv("text", { x: p.x + 21, y: p.y + PH / 2 + 4.2, "font-size": 12, fill: "#d9d6cc" }, lead ? sv("tspan", { fill: "#d8b45a" }, "★ ") : null, s.name)));
  }
  return g;
}

/** 同盟関係の図（陣営ごとのカード）。civ: 世界の civ／onPick: 札を押したとき */
export function allianceDiagram(civ, onPick) {
  const blocs = allianceBlocs(civ), box = h("div", { class: "blocs" });
  if (!blocs.length) { box.append(h("p", { class: "n" }, "同盟はありません")); return box; }
  const members = blocs.reduce((a, b) => a + b.members.length, 0), clashes = blocs.reduce((a, b) => a + b.hostile.length, 0) / 2;
  box.append(h("p", { class: "n" }, `同盟でつながった国を 1 つの陣営（圏）としてまとめています。陣営 ${blocs.length} つ・加盟 ${members} か国${clashes ? `・陣営どうしの対立 ${clashes} 組` : ""}。上の段ほど盟主（★）に近く、青い線が同盟、赤い破線の札は交戦中の国です。`));
  for (const bloc of blocs.slice(0, MAX_BLOCS)) {
    const L = layoutBloc(civ, bloc), foes = bloc.hostile.map((x) => `${blocName(civ, blocs[x.bloc])}（${x.wars} 件）`);
    box.append(h("div", { class: "card bloc-card" },
      h("div", { class: "bh" }, h("b", {}, blocName(civ, bloc)), h("small", {}, ` ${bloc.members.length}か国・人口 ${n0(bloc.pop)}`)),
      foes.length ? h("div", { class: "bw" }, `交戦中: ${foes.join("・")}`) : null,
      drawBloc(civ, bloc, L, onPick),
      L.hidden > 0 ? h("small", { style: "color:var(--dim)" }, `ほか ${L.hidden} か国（同盟の少ない国は省略）`) : null));
  }
  if (blocs.length > MAX_BLOCS) box.append(h("p", { class: "n" }, `ほか ${blocs.length - MAX_BLOCS} つの陣営（小さい順に省略）`));
  return box;
}
