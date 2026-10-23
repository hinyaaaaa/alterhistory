// 人口集団の窓（V5-M1）。国家が成立するまでの「集団・生業・集落」を見て、プレイヤー集団に命令する。
// 大量の集団（数千〜）でも固定サイズで描くため、一覧は並び替え・絞り込み・ページ送りで出す（全件のDOMを作らない）。
import { el } from "./kit.js";
import { guardRender } from "./safe-render.js";
import { SUBSISTENCE } from "../core/civ/population.js";
import { VIA, POLITY } from "../core/civ/states.js";
import { GOAL_JA } from "../core/civ/ai.js";

const STAGE = { village: "村", town: "町", city: "都市" };
const PROPOSAL = { change_subsistence: (p) => `生業を「${SUBSISTENCE[p.payload.subsistence]}」へ転換できます`, found_settlement: () => "定住して集落を作れます", split: () => "人口が増えました。一部を別の土地へ分派できます", form_state: (p) => `国家を形成できます（${VIA[p.payload.via]?.ja ?? p.payload.via}・${p.payload.groupIds.length}集団）` };
const fmt = (n) => n.toLocaleString("ja-JP");

export function initCivWindow({ store, wins, civActions }) {
  const body = el("div", "civ-body");
  const ui = { sort: "pop", query: "", page: 0, msg: "", sPage: 0, sel: null };
  const say = (m) => { ui.msg = m; render(); };

  function render() {
    body.replaceChildren();
    const map = store.getState().map;
    if (!map?.world) { body.append(el("p", "muted", "世界を作る、または開いてください")); return; }
    if (!civActions.has()) {
      body.append(el("p", "hint", "世界ができたら、初期集団を1つ選び、ここから歴史を始めます。国家はまだありません。集団が増え、定住し、国家へ育っていく流れを月ごとに進めます。"));
      const b = el("button", "primary", "選んだ集団で歴史を始める"); b.type = "button"; b.disabled = !civActions.canStart();
      b.title = b.disabled ? "先に「世界を作る」で初期集団を選んでください" : "月次の人口進行が動き出します";
      b.addEventListener("click", () => { const r = civActions.start(); say(r.ok ? "歴史を始めました。時計を進めてください" : r.error); });
      body.append(b); if (ui.msg) body.append(el("p", "muted", ui.msg)); return;
    }
    const sm = civActions.summary();
    body.append(el("p", "hint", `${sm.date.year}年${sm.date.month}月　集団 ${fmt(sm.groups)}・集落 ${fmt(sm.settlements)}・国家 ${fmt(sm.states)}・進行中の戦争 ${fmt(sm.wars)}・総人口 ${fmt(sm.pop)}・記録 ${fmt(sm.events)}件`));
    if (ui.msg) body.append(el("p", "muted", ui.msg));
    // プレイヤー集団の操作
    const opt = civActions.playerOptions();
    if (opt) {
      const g = opt.group, box = el("div", "civ-player");
      box.append(el("h4", "", `あなたの集団（${fmt(Math.round(g.pop))}人・${SUBSISTENCE[g.subsistence]}${g.settlementId ? "・定住" : ""}${g.order ? "・移動中" : ""}）`));
      for (const p of opt.proposals) {
        const row = el("div", "civ-proposal"); row.append(el("span", "", PROPOSAL[p.kind](p)));
        const ok = el("button", "primary", "実行"); ok.type = "button"; ok.addEventListener("click", () => { const r = civActions.command({ type: "acceptProposal", proposalId: p.proposalId }); say(r.ok ? "実行しました" : r.error); });
        const no = el("button", "", "見送る"); no.type = "button"; no.addEventListener("click", () => { civActions.command({ type: "dismissProposal", proposalId: p.proposalId }); render(); });
        row.append(ok, no); box.append(row);
      }
      if (!g.order && opt.targets.length) { // 移住先
        const sel = document.createElement("select"); for (const t of opt.targets) { const o = document.createElement("option"); o.value = t.cell; o.textContent = `北緯${t.lat}° 東経${t.lon}°（収容力の目安 ${fmt(Math.round(t.score))}・遠さ ${t.cost.toFixed(1)}）`; sel.append(o); }
        const mv = el("button", "", "ここへ移る"); mv.type = "button"; mv.addEventListener("click", () => { const r = civActions.command({ type: "moveGroup", groupId: g.id, to: Number(sel.value) }); say(r.ok ? "移動を始めました" : r.error); });
        const sp = el("button", "", "ここへ分派する"); sp.type = "button"; sp.addEventListener("click", () => { const r = civActions.command({ type: "splitGroup", groupId: g.id, to: Number(sel.value) }); say(r.ok ? "一部が新しい土地へ向かいました" : r.error); });
        box.append(sel, mv, sp);
      }
      body.append(box);
    }
    // 国家（V5-M2〜M5）: プレイヤー国家の行動・国家の一覧・AI の判断記録
    const po = civActions.playerStateOptions();
    if (po) {
      const box = el("div", "civ-player"); box.append(el("h4", "", `あなたの国家「${po.state.name}」（${POLITY[po.state.polity]}・安定度 ${Math.round(po.state.stability * 100)}・財政 ${fmt(Math.round(po.state.treasury))}）`));
      const ok = po.options.filter((o) => o.eligible).slice(0, 14), ng = po.options.filter((o) => !o.eligible);
      for (const o of ok) { const b = el("button", "", o.label); b.type = "button"; b.addEventListener("click", () => { const r = civActions.stateAction(po.state.id, o.action, o.target, o.opt); say(r.ok ? `${o.label}を実行しました` : r.error); }); box.append(b); }
      if (ng.length) box.append(el("p", "muted", `今はできない行動 ${ng.length} 件（例: ${ng[0].label}…${ng[0].reason}）`));
      body.append(box);
    }
    const SL = civActions.listStates({ page: ui.sPage });
    if (SL.total) {
      body.append(el("h4", "", `国家（${fmt(SL.total)}）`)); const sl = el("div", "ent-list");
      for (const r of SL.rows) { const row = el("div", "ent-row", `${r.player ? "★ " : ""}${r.name}　${POLITY[r.polity]}・${VIA[r.via]?.ja ?? r.via}　${fmt(r.pop)}人　安定${r.stability}${r.wars ? `　戦争${r.wars}` : ""}${r.goal ? `　方針:${GOAL_JA[r.goal]}` : ""}`); row.style.cursor = "pointer"; row.addEventListener("click", () => { ui.sel = ui.sel === r.id ? null : r.id; render(); }); sl.append(row); if (ui.sel === r.id) for (const d of civActions.recentDecisions(r.id, 5)) sl.append(el("div", "muted", `　${d.date.year}年${d.date.month}月 [${d.layer}] ${d.chosen.key}${d.chosen.target ? "→" + d.chosen.target : ""} ${d.result ? (d.result.ok ? "成功" : "失敗: " + d.result.error) : ""}（候補 ${d.candidates.length}）`)); }
      body.append(sl);
      if (SL.pages > 1) { const nv = el("div", "civ-nav"), pv = el("button", "", "前の国家"), nx = el("button", "", "次の国家"); pv.type = nx.type = "button"; pv.disabled = SL.page <= 0; nx.disabled = SL.page >= SL.pages - 1; pv.addEventListener("click", () => { ui.sPage--; render(); }); nx.addEventListener("click", () => { ui.sPage++; render(); }); nv.append(pv, el("span", "muted", ` ${SL.page + 1} / ${SL.pages} `), nx); body.append(nv); }
    }
    // 一覧（検索・並び替え・ページ）
    const bar = el("div", "civ-bar");
    const q = document.createElement("input"); q.type = "search"; q.placeholder = "ID・生業で絞り込み"; q.value = ui.query; q.addEventListener("change", () => { ui.query = q.value; ui.page = 0; render(); });
    const so = document.createElement("select"); for (const [v, t] of [["pop", "人口の多い順"], ["id", "IDの順"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; o.selected = ui.sort === v; so.append(o); }
    so.addEventListener("change", () => { ui.sort = so.value; ui.page = 0; render(); });
    bar.append(q, so); body.append(bar);
    const L = civActions.listGroups({ sort: ui.sort, query: ui.query, page: ui.page });
    ui.page = L.page;
    const list = el("div", "ent-list");
    for (const r of L.rows) list.append(el("div", "ent-row", `${r.player ? "★ " : ""}${r.id}　${fmt(r.pop)}人　${SUBSISTENCE[r.subsistence]}${r.settlement ? `　${STAGE[r.settlement]}` : ""}${r.moving ? "　移動中" : ""}　(${r.lat}°, ${r.lon}°)`));
    if (!L.rows.length) list.append(el("p", "muted", "該当する集団はありません"));
    body.append(list);
    const nav = el("div", "civ-nav"); const prev = el("button", "", "前へ"), next = el("button", "", "次へ"); prev.type = next.type = "button";
    prev.disabled = L.page <= 0; next.disabled = L.page >= L.pages - 1;
    prev.addEventListener("click", () => { ui.page--; render(); }); next.addEventListener("click", () => { ui.page++; render(); });
    nav.append(prev, el("span", "muted", ` ${L.page + 1} / ${L.pages}（${fmt(L.total)}件） `), next); body.append(nav);
  }
  wins.register("civ", { title: "人口集団", width: 620, body, onOpen: render });
  const safe = guardRender(body, () => render());
  store.subscribe(() => { if (wins.isOpen("civ")) safe(); });
}
