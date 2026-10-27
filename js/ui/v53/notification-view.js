// v5.3 UI: 通知の表示。右上に通常通知（要約つき）、重大イベントは新聞風の全画面演出。
import { h } from "./dom.js";
import { fmtMonth } from "./format.js";
import { categoryOf } from "./categories.js";

export function createNotificationView({ ui, notifier, adapter }) {
  const toasts = h("div", { class: "v53-toasts", "aria-live": "polite", "aria-label": "通知" });
  const major = h("div", { class: "v53-major", role: "dialog", "aria-modal": "true", "aria-label": "重大イベント", hidden: true });
  let lastMajorId = null;

  function renderToasts() {
    toasts.replaceChildren();
    for (const t of ui.get().toasts.slice(0, 3)) {
      if (t.type === "summary") {
        const card = h("article", { class: "v53-toast summary", dataset: { type: "summary" } },
          h("div", { class: "v53-toast-meta" }, h("span", { text: "要約" }), h("time", { text: `${fmtMonth(t.fromMonth)}〜${fmtMonth(t.toMonth)}` })),
          h("h4", { text: `この間に ${t.total} 件の出来事` }),
          h("p", { text: t.categories.slice(0, 4).map((c) => `${c.label} ${c.n}`).join("・") }),
          h("button", { type: "button", class: "v53-link", text: "歴史研究で全件を見る", onclick: () => { ui.set({ domain: "history", selection: null, trail: [], panelOpen: true }); notifier.dismissToast(t.key); } }),
          h("button", { type: "button", class: "v53-toast-close", "aria-label": "閉じる", text: "×", onclick: () => notifier.dismissToast(t.key) }));
        toasts.append(card);
      } else {
        const c = categoryOf(t.kind);
        toasts.append(h("article", { class: `v53-toast tone-${c.tone}`, dataset: { type: "event", id: t.eventId } },
          h("div", { class: "v53-toast-meta" }, h("span", { text: c.label }), h("time", { text: fmtMonth(t.month) })),
          h("h4", null, h("button", { type: "button", class: "v53-toast-title", text: t.title, onclick: () => { ui.select({ kind: "event", id: t.eventId }); notifier.dismissToast(t.key); } })),
          t.causeText ? h("p", { class: "v53-cause", text: t.causeText }) : null,
          h("button", { type: "button", class: "v53-toast-close", "aria-label": "閉じる", text: "×", onclick: () => notifier.dismissToast(t.key) })));
      }
    }
  }

  function renderMajor() {
    const q = ui.get().majorQueue, ev = q[0];
    major.hidden = !ev; document.body?.classList?.toggle("v53-major-open", !!ev);
    if (!ev) { major.replaceChildren(); lastMajorId = null; return; }
    if (ev.id === lastMajorId) { const cnt = major.querySelector("[data-role=remaining]"); if (cnt) cnt.textContent = q.length > 1 ? `ほか ${q.length - 1} 件の重大イベントが確認を待っています` : ""; return; }
    lastMajorId = ev.id;
    const cat = categoryOf(ev.kind), last = q.length === 1, r = ev.impactResult;
    const confirm = h("button", { type: "button", class: "v53-btn primary large", dataset: { act: "confirm" }, text: last ? "確認した" : "確認して次へ", onclick: () => notifier.confirmMajor({ resume: false }) });
    const confirmResume = last && ui.get().resumeAfterMajor ? h("button", { type: "button", class: "v53-btn large", dataset: { act: "confirm-resume" }, text: "確認して時間を再開", onclick: () => notifier.confirmMajor({ resume: true }) }) : null;
    const open = h("button", { type: "button", class: "v53-btn", text: "詳細を開く", onclick: () => { ui.select({ kind: "event", id: ev.id }); notifier.confirmMajor({ resume: false }); } });
    major.replaceChildren(h("article", { class: `v53-paper tone-${cat.tone}` },
      h("header", { class: "v53-paper-head" }, h("span", { class: "v53-paper-name", text: "歴史新報" }), h("span", { class: "v53-paper-kind", text: `${cat.label}　号外` }), h("time", { text: fmtMonth(ev.month) })),
      h("h2", { class: "v53-paper-title", text: ev.title }),
      ev.detail ? h("p", { class: "v53-paper-body", text: ev.detail }) : null,
      ev.causeText ? h("p", { class: "v53-paper-cause", text: ev.causeText }) : null,
      r ? h("details", { class: "v53-paper-why" }, h("summary", { text: `なぜ重大か（影響度 ${r.score.toFixed(2)}）` }), h("ul", null, r.reasons.map((x) => h("li", { text: `${x.label}: +${x.value}` })))) : null,
      h("p", { class: "v53-paper-remaining", dataset: { role: "remaining" }, text: q.length > 1 ? `ほか ${q.length - 1} 件の重大イベントが確認を待っています` : "" }),
      h("footer", { class: "v53-paper-actions" }, open, confirmResume, confirm)));
    confirm.focus?.();
  }

  const unsub = ui.subscribe((s, p) => { if (s.toasts !== p.toasts) renderToasts(); if (s.majorQueue !== p.majorQueue || s.resumeAfterMajor !== p.resumeAfterMajor) renderMajor(); });
  renderToasts(); renderMajor();
  return { toasts, major, dispose() { unsub(); document.body?.classList?.remove("v53-major-open"); } };
}
