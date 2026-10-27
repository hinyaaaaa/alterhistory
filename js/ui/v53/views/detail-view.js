// v5.3 UI: 右パネルの詳細。選択対象を「概要・状態・関連・出来事・操作」の順に出す。種類ごとの画面は作らず、adapter が正規化した Detail を描く。
import { h } from "../dom.js";
import { fmtMonth } from "../format.js";
import { categoryOf } from "../categories.js";

export const PAST_REASON = "過去を閲覧中は操作できません（読み取り専用）。現在へ戻してください";

/** @param detail  contract.js の Detail   @param ctx { adapter, ui, past, onResult } */
export function renderDetail(detail, { adapter, ui, past, onResult }) {
  const frag = document.createDocumentFragment();
  if (detail.notice || past) frag.append(h("p", { class: "v53-banner", role: "status", text: detail.notice ?? "過去の状態を表示しています（読み取り専用）" }));
  if (detail.progress?.length) frag.append(h("ol", { class: "v53-progress-steps", "aria-label": "経過" }, detail.progress.map((p) => h("li", { class: p.state, text: `${p.state === "done" ? "✓ " : ""}${p.label}` }))));
  if (detail.summary) frag.append(section("概要", h("p", { class: "v53-summary", text: detail.summary })));
  if (detail.stats?.length) {
    frag.append(section("状態", h("dl", { class: "v53-stats" }, detail.stats.map((s) => h("div", { class: `v53-stat${s.tone ? " tone-" + s.tone : ""}` }, h("dt", { text: s.label }), h("dd", { text: s.value }))))));
  }
  if (detail.related?.length) {
    const groups = new Map();
    for (const r of detail.related) { const k = r.relation ?? "関連"; (groups.get(k) ?? groups.set(k, []).get(k)).push(r); }
    frag.append(section("関連", [...groups].map(([rel, list]) => h("div", { class: "v53-rel" }, h("span", { class: "v53-rel-label", text: rel }),
      h("div", { class: "v53-rel-items" }, list.slice(0, 24).map((r) => h("button", { type: "button", class: "v53-link", dataset: { kind: r.kind, id: r.id }, text: r.label, onclick: () => ui.select({ kind: r.kind, id: r.id }) })),
        list.length > 24 ? h("span", { class: "v53-hint", text: `ほか ${list.length - 24} 件` }) : null)))));
  }
  if (detail.events?.length) {
    frag.append(section("最近の出来事", h("ul", { class: "v53-evlist" }, detail.events.map((e) => h("li", null, h("button", { type: "button", class: "v53-link", onclick: () => ui.select({ kind: "event", id: e.id }) },
      h("time", { text: fmtMonth(e.month) }), h("span", { text: e.title }), h("i", { class: `v53-dot tone-${categoryOf(e.kind).tone}`, "aria-hidden": "true" })))))));
  }
  // 件数の多い関連（戦争・出来事）は、詳細に全件を並べず、一覧へ絞り込んで開く（積もっても詳細が長くならない）
  if (detail.browse?.length) {
    frag.append(section("一覧で見る", h("div", { class: "v53-browse" }, detail.browse.map((b) => h("button", { type: "button", class: "v53-btn", dataset: { browse: b.domain }, text: b.label, onclick: () => {
      ui.setFilter(b.domain, { entity: b.entity, entityLabel: detail.title ?? b.entity, query: "", filter: "", range: "" });
      ui.select(null, { domain: b.domain });
    } })))));
  }
  if (detail.legacy && adapter.world?.openLegacy) {
    frag.append(section("詳細編集", h("div", { class: "v53-browse" }, h("button", { type: "button", class: "v53-btn", dataset: { legacy: detail.kind }, title: "名称・領土・内政など、従来の詳細編集ウィンドウを開きます", text: "従来の画面で詳細編集", onclick: () => adapter.world.openLegacy(detail.kind, detail.id) }))));
  }
  const acts = adapter.actions(detail.kind, detail.id);
  if (acts.length) {
    const msg = h("p", { class: "v53-action-msg", role: "status", "aria-live": "polite" });
    frag.append(section("操作", [
      h("div", { class: "v53-actions" }, acts.map((a) => {
        const off = past || !a.enabled, why = past ? PAST_REASON : a.reason;
        const b = h("button", { type: "button", class: `v53-btn${a.danger ? " danger" : ""}`, dataset: { action: a.id }, title: off ? why : "", text: a.label });
        b.disabled = off;
        b.addEventListener("click", () => { const r = adapter.runAction(detail.kind, detail.id, a.id); msg.textContent = r.ok ? `${a.label}を実行しました` : (r.error ?? "実行できませんでした"); onResult?.(r); });
        return b;
      })),
      acts.some((a) => past || !a.enabled) ? h("p", { class: "v53-hint", text: past ? PAST_REASON : acts.find((a) => !a.enabled)?.reason ?? "" }) : null,
      msg,
    ]));
  }
  return frag;
}
const section = (title, body) => h("section", { class: "v53-sec" }, h("h3", { text: title }), body);
