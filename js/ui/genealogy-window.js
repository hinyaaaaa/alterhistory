// 系譜図ウィンドウ：宗教（と文化）が「どこから分かれたか」を樹形図で見て、直接編集する。
//   ・ノードを別のノードへドラッグ＆ドロップすると、その親（起源）に付け替わる
//   ・ノードを押すと選択。下のパネルで、親の変更・名前の変更・削除ができる
//   ・「共通の祖」に落とすと、どこからも分かれていない（原始の）系統になる
// 輪（自分の子孫を親にする）はコア側で拒否される。
import { promptDialog } from "./dialogs.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const sv = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
const LIST_KEY = { religion: "religions", culture: "cultures" };
const LABEL = { religion: "宗教", culture: "文化" };
const ROOT_LABEL = { religion: "共通の祖（原始信仰）", culture: "共通の祖" };
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

export function initGenealogy({ store, wins, editActions }) {
  const bodies = {}, selected = {};
  const NODE_W = 150, NODE_H = 28, GAP_X = 50, GAP_Y = 14;

  function layout(map, kind) {
    const list = map.pack[LIST_KEY[kind]];
    const live = list.filter(isLive);
    const parentsOf = (e) => {
      const ps = [...new Set((Array.isArray(e.origins) ? e.origins : []).filter((o) => Number.isInteger(o) && (o === 0 || isLive(list[o]))))];
      return ps.length ? ps : [0];
    };
    const children = new Map([[0, []]]);
    for (const e of live) children.set(e.i, []);
    const extra = []; // 2番目以降の親からの線
    for (const e of live) {
      const ps = parentsOf(e);
      children.get(ps[0]).push(e.i);
      for (const p of ps.slice(1)) if (p !== 0) extra.push([p, e.i]);
    }
    const pos = new Map(); let row = 0;
    const visit = (id, depth, seen) => {
      if (seen.has(id)) return; seen.add(id);
      const kids = children.get(id) ?? [];
      if (!kids.length) { pos.set(id, { depth, y: row++ }); return; }
      const start = row;
      for (const k of kids) visit(k, depth + 1, seen);
      pos.set(id, { depth, y: (start + row - 1) / 2 });
    };
    visit(0, 0, new Set());
    // 追加の親が主な親より深い（右にある）と線が戻るので、子を追加の親より右へ寄せる
    for (let pass = 0; pass < 6; pass++) for (const [p, k] of extra) { const a = pos.get(p), c = pos.get(k); if (a && c && c.depth <= a.depth) c.depth = a.depth + 1; }
    const edges = [];
    for (const [p, kids] of children) for (const k of kids) if (pos.has(p) && pos.has(k)) edges.push([p, k, false]);
    for (const [p, k] of extra) if (pos.has(p) && pos.has(k)) edges.push([p, k, true]);
    return { pos, edges, rows: Math.max(1, row), depth: Math.max(...[...pos.values()].map((v) => v.depth)) };
  }

  function render(kind) {
    const body = bodies[kind]; body.replaceChildren();
    const map = store.getState().map;
    if (!map) { body.append(el("p", "muted", "地図を開いてください")); return; }
    const list = map.pack[LIST_KEY[kind]];
    const { pos, edges, rows, depth } = layout(map, kind);
    body.append(el("p", "hint", `${LABEL[kind]}の系譜図。ノードを別のノードへドラッグすると、その子（分派）になります（親は1つに置き換わります）。親は下の欄で複数選べます（金色の点線が2つ目以降の親）。`));
    const W = (depth + 1) * (NODE_W + GAP_X) + 10, H = rows * (NODE_H + GAP_Y) + 10;
    const svg = sv("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "gen-svg" });
    const X = (d) => 5 + d * (NODE_W + GAP_X), Y = (y) => 5 + y * (NODE_H + GAP_Y);
    for (const [p, k, isExtra] of edges) {
      const a = pos.get(p), b = pos.get(k);
      const x1 = X(a.depth) + NODE_W, y1 = Y(a.y) + NODE_H / 2, x2 = X(b.depth), y2 = Y(b.y) + NODE_H / 2, mx = (x1 + x2) / 2;
      svg.append(sv("path", { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, fill: "none", stroke: isExtra ? "var(--brass, #c9a24a)" : "var(--line, #555)", "stroke-width": 1.5, ...(isExtra ? { "stroke-dasharray": "5 3" } : {}) }));
    }
    const nodeG = new Map();
    for (const [id, p] of pos) {
      const e = id === 0 ? null : list[id];
      const g = sv("g", { "data-id": id, class: `gen-node${selected[kind] === id ? " sel" : ""}${id === 0 ? " root" : ""}`, transform: `translate(${X(p.depth)},${Y(p.y)})`, style: "cursor:grab" });
      g.append(sv("rect", { width: NODE_W, height: NODE_H, rx: 6, fill: "var(--panel-2, #2a2a2a)", stroke: selected[kind] === id ? "var(--brass-bright, #d9b45a)" : "var(--brass-dim, #7a6a3a)", "stroke-width": selected[kind] === id ? 2 : 1 }));
      if (e) g.append(sv("rect", { x: 6, y: 8, width: 12, height: 12, rx: 2, fill: e.color ?? "#888" }));
      const label = id === 0 ? ROOT_LABEL[kind] : (e.fullName ?? e.name);
      g.append(sv("text", { x: e ? 24 : 8, y: 19, fill: "var(--text, #eee)", "font-size": 12 }, label.length > 11 ? `${label.slice(0, 10)}…` : label));
      g.append(sv("title", {}, label));
      nodeG.set(id, g); svg.append(g);
      g.addEventListener("click", () => { selected[kind] = id; render(kind); });
      if (id !== 0) enableDrag(kind, g, svg, id);
    }
    const scroller = el("div", "gen-scroll"); scroller.append(svg);
    body.append(scroller, editPanel(map, kind, list));
  }

  function enableDrag(kind, g, svg, id) {
    g.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      const start = { x: ev.clientX, y: ev.clientY }; let moved = false;
      const ghost = g.cloneNode(true); ghost.setAttribute("opacity", "0.6"); ghost.style.pointerEvents = "none";
      const onMove = (e2) => {
        if (!moved && Math.hypot(e2.clientX - start.x, e2.clientY - start.y) < 5) return;
        if (!moved) { moved = true; svg.append(ghost); }
        const r = svg.getBoundingClientRect();
        ghost.setAttribute("transform", `translate(${e2.clientX - r.left - NODE_W / 2},${e2.clientY - r.top - NODE_H / 2})`);
      };
      const onUp = (e2) => {
        window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
        if (!moved) return;
        ghost.remove();
        const target = document.elementFromPoint(e2.clientX, e2.clientY)?.closest?.("[data-id]");
        if (target) { const pid = Number(target.getAttribute("data-id")); if (pid !== id) { editActions.setOrigin(kind, id, pid); selected[kind] = id; } }
        render(kind);
      };
      window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
    });
  }

  function editPanel(map, kind, list) {
    const box = el("div", "gen-edit"); const id = selected[kind];
    if (!id || !isLive(list[id])) { box.append(el("p", "muted", "ノードを選ぶと、親の変更・名前の変更・削除ができます")); return box; }
    const e = list[id];
    box.append(el("h4", "", `「${e.fullName ?? e.name}」`));
    const banned = new Set([id, ...editActions.descendantsOf(kind, id)]);
    const cur = new Set(editActions.originsOf(kind, id));
    box.append(el("p", "hint", "どこから分かれたか（複数選べます。何も選ばなければ共通の祖）"));
    const grid = el("div", "gen-parents");
    const boxes = [];
    for (const o of list) {
      if (!isLive(o) || banned.has(o.i)) continue;
      const l = el("label", "gen-parent"); const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = o.i; cb.checked = cur.has(o.i);
      cb.addEventListener("change", () => { editActions.setOrigins(kind, id, boxes.filter((x) => x.checked).map((x) => Number(x.value))); render(kind); });
      boxes.push(cb); l.append(cb, document.createTextNode(` ${o.fullName ?? o.name}`)); grid.append(l);
    }
    box.append(grid);
    const rename = el("button", "", "名前を変える"); rename.type = "button";
    rename.addEventListener("click", async () => { const n = await promptDialog(`${LABEL[kind]}の新しい名前`, e.fullName ?? e.name); if (n) { editActions.renameEntity(kind, id, n); render(kind); } });
    const del = el("button", "danger", "削除"); del.type = "button";
    del.addEventListener("click", () => {
      if (!window.confirm(`${LABEL[kind]}「${e.fullName ?? e.name}」を削除します。（元に戻せます）`)) return;
      if (editActions.removeEntity(kind, id)) { selected[kind] = null; render(kind); }
    });
    box.append(rename, del);
    return box;
  }

  for (const kind of Object.keys(LIST_KEY)) {
    bodies[kind] = el("div", "gen-body");
    wins.register(`genealogy-${kind}`, { title: `🌳 ${LABEL[kind]}の系譜図`, width: 760, body: bodies[kind], onOpen: () => render(kind) });
  }
  store.subscribe((_s, ch) => {
    if (!["replace", "commit", "undo", "redo"].includes(ch.type)) return;
    for (const kind of Object.keys(LIST_KEY)) if (wins.isOpen(`genealogy-${kind}`)) render(kind);
  });
}
