// 球面世界の作業画面（v4.0.0）。生成・表示・初期集団の選択・地形編集を 1 つの画面にまとめる。
// 左のハブの「球面世界」で開く。旧エディタ（Azgaar 系の地図）とは独立していて、閉じれば旧エディタに戻る。
import { el, btn } from "./kit.js";
import { byId } from "./dom.js";
import { alertDialog, confirmDialog } from "./dialogs.js";
import { createSphereView } from "../render/sphere-view.js";
import { WORLD_LAYERS, layerLegend } from "../render/world-colors.js";
import { RES, RES_NAMES } from "../core/world/worldgen.js";
import { ISLAND_MODES, makeWorldSeed, DEFAULT_WORLD_SPEC } from "../core/world/spec.js";
import { BRUSH_MODES } from "../core/world/edit.js";
import { isAhmap2Bytes } from "../app/world-actions.js";

const PRESETS = [[50000, "50,000（軽い）"], [100000, "100,000"], [250000, "250,000（標準）"], [500000, "500,000"], [1000000, "1,000,000（重い）"]];
const MODE_LABELS = { view: "閲覧", groups: "初期集団", edit: "地形編集" };
const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("ja-JP", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—");

export function initWorldWorkspace({ worldActions, openFileDialog, legacyHasMap = () => false }) {
  const stage = byId("world-stage"), app = byId("app");
  stage.className = "world-stage"; stage.hidden = true;
  const canvas = el("canvas", "world-canvas"); canvas.id = "world-canvas"; canvas.tabIndex = 0; canvas.setAttribute("aria-label", "球面世界の地図");
  const top = el("div", "world-top"), panel = el("aside", "world-panel"), legend = el("div", "world-legend"), status = el("div", "world-status"), busy = el("div", "world-busy"), empty = el("div", "world-empty");
  stage.append(canvas, top, panel, legend, status, empty, busy);
  const S = () => worldActions.store.getState();
  const view = createSphereView({ canvas, onRender: () => renderStatus() }); // 描画のたびに、下の状態表示（描画方式・時間）を更新する
  let active = false, pointer = null, spaceDown = false;

  // ---- 上のバー ----
  const bNew = btn("primary", "新しい世界", "世界の設定を決めて生成する", () => openNewDialog());
  const bOpen = btn("", "開く", "保存した世界（.ahmap）を開く", () => openFileDialog());
  const bSave = btn("", "保存", "世界を .ahmap（v2）として保存する (Ctrl+S)", () => worldActions.save());
  const modeBox = el("div", "world-modes"); const modeBtns = {};
  for (const [k, label] of Object.entries(MODE_LABELS)) { const b = btn("", label, "", () => worldActions.setMode(k)); b.dataset.mode = k; modeBtns[k] = b; modeBox.append(b); }
  const layerSel = el("select", "world-layer"); layerSel.setAttribute("aria-label", "表示する情報");
  for (const l of WORLD_LAYERS) { const o = document.createElement("option"); o.value = l.key; o.textContent = l.label; layerSel.append(o); }
  const resSel = el("select", "world-res"); resSel.setAttribute("aria-label", "資源の種類");
  { const o = document.createElement("option"); o.value = "0"; o.textContent = "すべて"; resSel.append(o); for (const [bit, n] of Object.entries(RES_NAMES)) { const o2 = document.createElement("option"); o2.value = bit; o2.textContent = n; resSel.append(o2); } }
  const chkRiver = checkbox("河川", true, (v) => view.setOverlay({ rivers: v })), chkGrid = checkbox("経緯線", false, (v) => view.setOverlay({ graticule: v }));
  const bFit = btn("", "全体", "世界全体を表示 (F)", () => view.fit()), bClose = btn("", "旧エディタへ", "球面世界の画面を閉じて、旧エディタに戻る", () => setActive(false));
  top.append(bNew, bOpen, bSave, el("span", "world-sep"), modeBox, el("span", "world-sep"), layerSel, resSel, chkRiver.label, chkGrid.label, el("span", "world-sep"), bFit, bClose);
  layerSel.addEventListener("change", () => worldActions.setLayer(layerSel.value, { resource: Number(resSel.value) }));
  resSel.addEventListener("change", () => worldActions.setLayer(layerSel.value, { resource: Number(resSel.value) }));
  function checkbox(text, on, fn) { const label = el("label", "world-chk"), i = document.createElement("input"); i.type = "checkbox"; i.checked = on; i.addEventListener("change", () => fn(i.checked)); label.append(i, document.createTextNode(" " + text)); return { label, input: i }; }

  // ---- 新しい世界ダイアログ ----
  async function confirmDiscard() { const s = S(); if (!s.world || !s.dirty) return true; return confirmDialog("保存していない変更があります。破棄して続けますか？", { okLabel: "破棄して続ける", danger: true }); }
  async function openNewDialog() {
    if (!(await confirmDiscard())) return;
    const dlg = document.createElement("dialog"); dlg.className = "confirm-dialog world-new"; dlg.append(el("h2", null, "新しい世界"));
    const form = el("div", "world-form"); dlg.append(form);
    const row = (label, ctl, hint) => { const r = el("label", "world-row"); r.append(el("span", "world-row-l", label), ctl); if (hint) r.append(el("span", "world-row-h", hint)); form.append(r); return ctl; };
    const seed = document.createElement("input"); seed.type = "text"; seed.value = makeWorldSeed(Date.now()); seed.setAttribute("aria-label", "シード");
    const seedBox = el("span", "world-seedbox"); seedBox.append(seed, btn("", "ランダム", "新しいシードにする", () => { seed.value = makeWorldSeed(Date.now()); }));
    row("シード", seedBox, "同じシードと設定なら、同じ地形になります");
    const preset = document.createElement("select"); for (const [v, t] of PRESETS) { const o = document.createElement("option"); o.value = String(v); o.textContent = t; if (v === DEFAULT_WORLD_SPEC.resolution.targetCells) o.selected = true; preset.append(o); }
    row("セル数", preset, "大きいほど細かい世界になります（端末により生成に数秒〜数十秒）");
    const land = document.createElement("input"); land.type = "range"; land.min = "20"; land.max = "80"; land.value = "50"; const landV = el("span", "world-row-v", "50%"); land.addEventListener("input", () => { landV.textContent = `${land.value}%`; });
    const landBox = el("span", "world-seedbox"); landBox.append(land, landV); row("陸地の割合", landBox);
    const cont = document.createElement("input"); cont.type = "number"; cont.min = "1"; cont.max = "12"; cont.value = "6"; row("大陸の数（目安）", cont);
    const isl = document.createElement("select"); for (const [k, t] of [["few", "少ない"], ["normal", "ふつう"], ["many", "多い"]]) { const o = document.createElement("option"); o.value = k; o.textContent = `${t}（約${ISLAND_MODES[k]}）`; if (k === "many") o.selected = true; isl.append(o); } row("島の多さ", isl);
    const groups = document.createElement("input"); groups.type = "number"; groups.min = "1"; groups.max = "64"; groups.value = "12"; row("初期集団の候補数", groups);
    const err = el("p", "hint"); dlg.append(err);
    const actions = el("div", "confirm-dialog-actions"), cancel = btn("", "キャンセル", "", () => { dlg.close(); dlg.remove(); }), ok = btn("primary", "生成する", "", () => {
      const spec = { worldSeed: seed.value.trim(), resolution: { targetCells: Number(preset.value) }, landFraction: Number(land.value) / 100, continentCountTarget: Number(cont.value), islandMode: isl.value, initialGroups: Number(groups.value) };
      dlg.close(); dlg.remove(); worldActions.newWorld(spec);
    });
    actions.append(cancel, ok); dlg.append(actions); dlg.addEventListener("cancel", () => dlg.remove()); document.body.append(dlg); dlg.showModal(); seed.focus();
  }

  // ---- 右のパネル ----
  const sec = (title) => { const s = el("section", "world-sec"); s.append(el("h4", null, title)); return s; };
  const kv = (rows) => { const d = el("dl", "world-kv"); for (const [k, v] of rows) { d.append(el("dt", null, k), el("dd", null, String(v))); } return d; };
  function renderPanel() {
    const s = S(), w = s.world; panel.replaceChildren(); if (!w) { panel.hidden = true; return; } panel.hidden = false;
    if (s.mode === "view") {
      const a = sec("世界"), st = w.stats;
      a.append(kv([["シード", w.spec.worldSeed], ["セル数", fmt(w.mesh.cellCount)], ["陸地率", `${fmt(st.landFraction * 100, 1)}%`], ["大陸／島", `${st.continentCount}／${st.islandCount}`], ["河川セル／湖", `${fmt(st.riverCells)}／${fmt(st.lakeCells)}`], ["生成器", w.spec.generatorVersion]]));
      if (w.entities.start) a.append(el("p", "hint", `開始集団: #${w.entities.start.groupId}（人口 ${w.entities.start.population}）`)); else a.append(el("p", "hint warn", "開始集団がまだ決まっていません。「初期集団」で選んでください"));
      panel.append(a);
      const c = sec("セル"); const d = worldActions.describeCell(s.selectedCell >= 0 ? s.selectedCell : s.hover);
      if (d) c.append(kv([["種別", d.kind], ["緯度／経度", `${fmt(d.lat, 2)}° ／ ${fmt(d.lon, 2)}°`], ["標高", `${fmt(d.elevation)} m`], ["バイオーム", d.biome], ["気温", `${fmt(d.temp, 1)} ℃`], ["降水", `${fmt(d.precip)} mm/年`], ["肥沃度", fmt(d.fertility, 2)], ["土壌", d.soil], ["資源", d.resources.join("・") || "なし"], ["川", d.river ? `あり（${fmt(d.riverFlow)} m³/s）` : "なし"], ["海岸まで", `${d.coastDist} セル`], ["面積", `${fmt(d.areaKm2)} km²`]])); else c.append(el("p", "hint", "地図の上にカーソルを置くか、クリックして選ぶと、詳しい情報が出ます"));
      panel.append(c);
    } else if (s.mode === "groups") {
      const a = sec("初期集団を選ぶ"); a.append(el("p", "hint", "ここから歴史が始まります。候補は、肥沃で、海・川に近く、互いに離れた場所に置かれています。地図の丸印か下の一覧で選びます。"));
      const list = el("div", "world-groups");
      for (const p of w.entities.populations) {
        const d = worldActions.describeCell(p.cell), row = el("button", "world-group" + (p.id === s.startGroupId ? " on" : ""), ""); row.type = "button"; row.dataset.group = String(p.id);
        row.append(el("b", null, `#${p.id}`), el("span", null, `${fmt(d.lat, 1)}°, ${fmt(d.lon, 1)}°`), el("span", null, `人口 ${p.size}`), el("span", null, `肥沃 ${fmt(d.fertility, 2)}`), el("span", null, `${d.biome}・${fmt(d.temp, 0)}℃`), el("span", null, [d.river ? "川" : "", d.coastDist <= 2 ? "海辺" : "", ...d.resources.slice(0, 3)].filter(Boolean).join("・") || "—"));
        row.addEventListener("click", () => { worldActions.selectGroup(p.id); const x = w.cell; view.centerOn(x.lat[p.cell], x.lon[p.cell], Math.max(view.view.scale, 600)); });
        list.append(row);
      }
      a.append(list);
      const acts = el("div", "world-acts"); acts.append(btn("", "別の候補を提案", "同じ世界のまま、候補を置き直す", () => worldActions.proposeGroups()), btn(s.placing ? "primary" : "", s.placing ? "地図をクリック…" : "手動で置く", "地図の好きな場所に集団を置く（居住できる場所だけ）", () => worldActions.setPlacing(!s.placing)));
      const ok = btn("primary", "この集団で始める", "選んだ集団を、歴史の起点として決める", () => { const r = worldActions.confirmStart(); if (!r.ok) alertDialog(r.reason); }); ok.disabled = s.startGroupId == null; acts.append(ok);
      if (s.startGroupId != null) acts.append(btn("", "候補から外す", "選んだ集団を一覧から取り除く", () => worldActions.removeGroup(s.startGroupId)));
      a.append(acts); if (w.entities.start) a.append(el("p", "hint", `決定済み: 集団 #${w.entities.start.groupId}`)); panel.append(a);
    } else {
      const a = sec("地形を編集する"), b = s.brush;
      a.append(el("p", "hint", "クリックまたはドラッグで標高を変えます。影響を受ける範囲（気候・水系・土壌・資源）だけを再計算します。降水の風下への波及は約700kmまでの近似です。"));
      const mode = document.createElement("select"); for (const [k, t] of Object.entries(BRUSH_MODES)) { const o = document.createElement("option"); o.value = k; o.textContent = t; if (k === b.mode) o.selected = true; mode.append(o); } mode.addEventListener("change", () => worldActions.setBrush({ mode: mode.value }));
      const rng = (label, min, max, step, val, key, unit) => { const w1 = el("label", "world-row"), v = el("span", "world-row-v", `${val}${unit}`), i = document.createElement("input"); i.type = "range"; i.min = min; i.max = max; i.step = step; i.value = val; i.addEventListener("input", () => { v.textContent = `${i.value}${unit}`; }); i.addEventListener("change", () => worldActions.setBrush({ [key]: Number(i.value) })); const box = el("span", "world-seedbox"); box.append(i, v); w1.append(el("span", "world-row-l", label), box); return w1; };
      const m1 = el("label", "world-row"); m1.append(el("span", "world-row-l", "種類"), mode);
      a.append(m1, rng("半径", 100, 2000, 50, b.radiusKm, "radiusKm", " km"), rng("強さ", 50, 1500, 50, b.deltaM, "deltaM", " m"));
      if (b.mode === "flatten") a.append(rng("目標の標高", -500, 3000, 50, b.target, "target", " m"));
      a.append(kv([["編集の履歴", `${s.undoCount} 件（Ctrl+Z で戻す・Ctrl+Y でやり直す）`]])); panel.append(a);
    }
  }

  // ---- 凡例・状態・空状態・進捗 ----
  function renderLegend() { const s = S(); legend.replaceChildren(); if (!s.world) { legend.hidden = true; return; } legend.hidden = false; for (const it of layerLegend(s.layer, s.layerOpt)) { const r = el("div", "world-legend-row"), sw = el("i"); sw.style.background = it.color; r.append(sw, el("span", null, it.label)); legend.append(r); } }
  function renderStatus() {
    const s = S(); status.textContent = ""; if (!s.world) return;
    const d = worldActions.describeCell(s.hover); const vs = view.stats;
    status.textContent = `${d ? `${fmt(d.lat, 2)}°, ${fmt(d.lon, 2)}° ｜ ${d.kind} ${fmt(d.elevation)} m ｜ ${d.biome} ｜ ${fmt(d.temp, 1)}℃ ｜ ${fmt(d.precip)} mm` : "—"}　　${s.fileName}${s.dirty ? " *" : ""} ｜ ${fmt(s.world.mesh.cellCount)} セル ｜ 描画 ${vs.mode} ${vs.lastRenderMs} ms`;
  }
  function renderEmpty() {
    const s = S(); empty.replaceChildren(); empty.hidden = !!s.world || !!s.busy; if (s.world) return;
    empty.append(el("h1", null, "球面世界"), el("p", null, "地理（大陸・気候・川・資源）を新しく生成し、初期集団を選んで、歴史を始める準備をします。"), (() => { const d = el("div", "world-acts"); d.append(btn("primary large", "新しい世界を生成", "", () => openNewDialog()), btn("large", "保存した世界を開く", "", () => openFileDialog())); return d; })(), el("p", "hint", "旧形式（.map / 旧 .ahmap）は旧エディタで開きます。球面世界へは変換されません。"));
  }
  function renderBusy() {
    const s = S(); busy.replaceChildren(); busy.hidden = !s.busy; if (!s.busy) return;
    const bar = el("div", "world-bar"), fill = el("i"); fill.style.width = `${Math.round((s.busy.fraction ?? 0) * 100)}%`; bar.append(fill); busy.append(el("div", "world-busy-t", s.busy.label), bar);
    if (/生成/.test(s.busy.label)) busy.append(btn("", "中断", "生成を中断する", () => worldActions.cancelGeneration()));
  }
  function renderChrome() {
    const s = S(); for (const [k, b] of Object.entries(modeBtns)) { b.classList.toggle("on", s.mode === k); b.disabled = !s.world; b.setAttribute("aria-pressed", String(s.mode === k)); }
    bSave.disabled = !s.world || !!s.busy; bFit.disabled = !s.world; layerSel.disabled = !s.world; resSel.hidden = s.layer !== "resource"; layerSel.value = s.layer;
    byId("btn-save").disabled = !s.world || !!s.busy; // ハブの「保存」は、この画面では世界を保存する
    canvas.style.cursor = !s.world ? "default" : s.mode === "edit" ? "crosshair" : s.placing ? "copy" : "grab";
    if (s.error) { banner.textContent = s.error; banner.hidden = false; } else if (s.notice) { banner.textContent = s.notice; banner.hidden = false; } else banner.hidden = true;
    banner.classList.toggle("err", !!s.error);
  }
  const banner = el("div", "world-banner"); banner.hidden = true; banner.addEventListener("click", () => worldActions.store.update((s) => { s.error = null; s.notice = null; })); stage.append(banner);

  function overlayFromState() {
    const s = S(); const groups = s.world && (s.mode === "groups" || s.world.entities.start) ? s.world.entities.populations.filter((p) => s.mode === "groups" || p.id === s.world.entities.start?.groupId).map((p) => ({ id: p.id, cell: p.cell, selected: p.id === s.startGroupId })) : [];
    view.setOverlay({ groups, selectedCell: s.selectedCell, hoverCell: s.mode === "edit" ? -1 : s.hover });
  }
  let lastWorld = null, lastLayerKey = "";
  worldActions.store.subscribe((s) => {
    if (!active) return;
    if (s.world !== lastWorld) { lastWorld = s.world; view.setWorld(s.world, { onProgress: (f) => worldActions.store.update((x) => { if (!x.busy || x.busy.label.startsWith("地図を準備")) x.busy = f >= 1 ? null : { label: `地図を準備中… ${Math.round(f * 100)}%`, fraction: f }; }) }).then(() => { overlayFromState(); renderAll(); }); lastLayerKey = ""; }
    const key = `${s.layer}:${s.layerOpt.resource | 0}`; if (key !== lastLayerKey) { lastLayerKey = key; view.setLayer(s.layer, s.layerOpt); }
    renderAll();
  });
  worldActions.on((e) => { if (e.type === "edit") view.refresh(e.dirty); if (e.type === "groups" || e.type === "select" || e.type === "mode") overlayFromState(); });
  function renderAll() { renderChrome(); renderPanel(); renderLegend(); renderStatus(); renderEmpty(); renderBusy(); }

  // ---- 地図の操作 ----
  const rectPos = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (canvas.width / (r.width || canvas.width)), y: (e.clientY - r.top) * (canvas.height / (r.height || canvas.height)) }; };
  let hoverPending = false, lastHover = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!S().world || e.button > 2) return; canvas.setPointerCapture?.(e.pointerId); const p = rectPos(e), s = S();
    const editing = s.mode === "edit" && e.button === 0 && !spaceDown;
    pointer = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, editing, lastEdit: editing ? p : null };
    if (editing) { const c = view.cellAt(p.x, p.y); if (c >= 0) worldActions.editAt(c); }
  });
  canvas.addEventListener("pointermove", (e) => {
    const s = S(); if (!s.world) return; const p = rectPos(e); lastHover = p;
    if (pointer && pointer.id === e.pointerId) {
      if (pointer.editing) {
        const R = s.world.spec.planet.radiusKm, c = view.cellAt(p.x, p.y);
        if (c >= 0 && pointer.lastEdit) { const lc = view.cellAt(pointer.lastEdit.x, pointer.lastEdit.y); if (lc >= 0) { const X = s.world.mesh.centerXYZ, d = Math.acos(Math.max(-1, Math.min(1, X[3 * c] * X[3 * lc] + X[3 * c + 1] * X[3 * lc + 1] + X[3 * c + 2] * X[3 * lc + 2]))) * R; if (d >= s.brush.radiusKm * 0.6) { worldActions.editAt(c); pointer.lastEdit = p; } } }
      } else { const dx = p.x - pointer.x, dy = p.y - pointer.y; if (Math.hypot(p.x - pointer.sx, p.y - pointer.sy) > 3) pointer.moved = true; view.panBy(dx, dy); pointer.x = p.x; pointer.y = p.y; }
    }
    if (!hoverPending) { hoverPending = true; requestAnimationFrame(() => { hoverPending = false; if (!lastHover) return; const c = view.cellAt(lastHover.x, lastHover.y); worldActions.hover(c); if (S().mode === "edit" && c >= 0) view.setOverlay({ brush: { center: c, radiusKm: S().brush.radiusKm }, hoverCell: -1 }); else { view.setOverlay({ brush: null, hoverCell: c }); } }); }
  });
  canvas.addEventListener("pointerup", (e) => {
    const s = S(); if (!pointer || pointer.id !== e.pointerId) return; const p = rectPos(e), wasClick = !pointer.moved && !pointer.editing; pointer = null;
    if (wasClick && s.world) { const c = view.cellAt(p.x, p.y); if (c < 0) return; if (s.mode === "groups" && s.placing) { const r = worldActions.placeGroup(c); if (!r.ok) alertDialog(r.reason); } else if (s.mode === "groups") { const g = s.world.entities.populations.find((q) => { const sp = view.screenOfCell(q.cell); return Math.hypot(sp.x - p.x, sp.y - p.y) < 16; }); if (g) worldActions.selectGroup(g.id); else worldActions.select(c); } else worldActions.select(c); }
  });
  canvas.addEventListener("pointercancel", () => { pointer = null; });
  canvas.addEventListener("pointerleave", () => { lastHover = null; worldActions.hover(-1); view.setOverlay({ brush: null, hoverCell: -1 }); });
  canvas.addEventListener("wheel", (e) => { if (!S().world) return; e.preventDefault(); const p = rectPos(e); view.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  canvas.addEventListener("dblclick", () => view.fit());
  document.addEventListener("keydown", (e) => {
    if (!active) return; const t = e.target; const typing = t instanceof HTMLElement && (t.closest("input, textarea, select") || t.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && !e.altKey) { const k = e.key.toLowerCase(); if (k === "s") { e.preventDefault(); e.stopImmediatePropagation(); worldActions.save(); } else if (k === "z" && !typing) { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) worldActions.redo(); else worldActions.undo(); } else if (k === "y" && !typing) { e.preventDefault(); e.stopImmediatePropagation(); worldActions.redo(); } return; }
    if (typing) return; if (e.key === " ") { spaceDown = true; e.preventDefault(); e.stopImmediatePropagation(); } else if (e.key.toLowerCase() === "f") { view.fit(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener("keyup", (e) => { if (e.key === " ") spaceDown = false; });
  // 保存ボタン（ハブの「保存」）は、球面世界の画面が開いているあいだ、世界を保存する
  byId("btn-save").addEventListener("click", (e) => { if (!active) return; e.stopImmediatePropagation(); worldActions.save(); }, true);
  new ResizeObserver(() => resize()).observe(stage);
  function resize() { const r = stage.getBoundingClientRect(); const w = Math.max(320, Math.round(r.width || 1000)), h = Math.max(240, Math.round(r.height || 700)); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } view.resize(); }

  async function setActive(on) {
    if (on === active) return; if (!on && !(await confirmDiscard())) return;
    active = on; stage.hidden = !on; app.classList.toggle("world-mode", on); byId("btn-world")?.classList.toggle("on", on);
    if (!on) byId("btn-save").disabled = !legacyHasMap(); // 旧エディタに戻ったら、旧エディタの状態に合わせる
    if (on) { resize(); lastWorld = null; lastLayerKey = ""; worldActions.store.update(() => {}); view.request(); } 
  }
  return {
    setActive, get active() { return active; }, view, isActive: () => active,
    /** ファイル振り分け: .ahmap v2 なら球面世界で開く。それ以外は false */
    async routeFile(file) { const head = new Uint8Array(await file.slice(0, 8).arrayBuffer()); if (!isAhmap2Bytes(head)) return false; await setActive(true); await worldActions.openFile(file); return true; },
    openNewDialog,
  };
}
