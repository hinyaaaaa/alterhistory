// 右上: 新聞風イベント。年表に新しい出来事が足されたら、カードを数秒だけ出して薄れて消える。
//   ・文面は io/chronicle.js の年表（buildTimeline）と共通。ここでは文章を作らない
//   ・重大なもの（宣戦・講和・核使用・国家消滅・内戦）は長めに残し、手動でも閉じられる
//   ・地図の操作を妨げない（pointer-events: none。閉じるボタンだけ有効）
//   ・履歴は、ハブの「年表」から見られる
import { buildTimeline } from "../io/chronicle.js";

// 種別 → 見出しの区分と色（意味色から選ぶ）
const CATS = [
  { test: /^war-declared|^nuclear|^civil/, label: "宣戦布告", color: "var(--danger)", major: true, nuclear: /^nuclear/ },
  { test: /^war-ended|^peace/, label: "講和", color: "var(--brass)", major: true },
  { test: /^battle/, label: "戦闘", color: "var(--danger)" },
  { test: /^independence|^rebellion|^breakaway/, label: "反乱", color: "var(--danger)", major: true },
  { test: /^removed-state|^merge|^collapse/, label: "国家消滅", color: "var(--danger)", major: true },
  { test: /^treaty-expiring/, label: "条約の期限", color: "var(--warn)", major: true },
  { test: /^treaty|^alliance|^vassal/, label: "条約", color: "var(--ally)" },
  { test: /^diplomacy|^covert|^sanction/, label: "外交", color: "var(--info)" },
  { test: /^econom|^currency|^trade|^famine/, label: "経済", color: "var(--warn)" },
  { test: /^natural|^plague|^disaster|^zone/, label: "自然", color: "var(--warn)" },
  { test: /^tech-momentum/, label: "技術の機運", color: "var(--ally)", major: true },
  { test: /^monarch|^succession/, label: "君主交代", color: "var(--info)" },
];
export const categoryOf = (type) => CATS.find((c) => c.test.test(String(type ?? ""))) ?? { label: "記録", color: "var(--info)" };
const keyOf = (e) => `${e.type}|${e.year}-${e.month}|${e.title}`;

export function initNews({ store, simActions = null, shortMs = 6000, majorMs = 14000 }) {
  const box = document.getElementById("news");
  if (!box) throw new Error("#news が見つかりません（index.html を確認してください）");
  let seen = null;       // 既に見た出来事のキー
  let timer = null;
  const MAX = 3;

  const snapshot = (map) => { try { return buildTimeline(map); } catch { return []; } };
  const reseed = (map) => { seen = new Set(map ? snapshot(map).map(keyOf) : []); };

  function show(e) {
    const cat = categoryOf(e.type);
    const card = document.createElement("article");
    card.className = "news-card"; card.style.setProperty("--k", cat.color);
    const meta = document.createElement("div"); meta.className = "meta";
    const kind = document.createElement("span"); kind.textContent = cat.label;
    const time = document.createElement("time"); time.textContent = e.date;
    meta.append(kind, time);
    const h = document.createElement("h5"); h.textContent = e.title;
    card.append(meta, h);
    if (e.detail) { const p = document.createElement("p"); p.textContent = String(e.detail).split("\n")[0]; card.append(p); }
    // 原因リンク（機能A）がある出来事は、見出しの下に「〜を受けて」を添える
    if (e.causeText) { const c = document.createElement("p"); c.className = "cause"; c.textContent = e.causeText; card.append(c); }
    // 技術の機運: 「採用する」を押すと、その国の該当分野が +1 段になる（押さなければ何も変わらない）
    if (e.type === "tech-momentum" && e.data?.field && e.stateIds?.[0] && simActions) {
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "news-adopt"; btn.textContent = "採用する";
      const pending = () => simActions.techMomentum(e.stateIds[0]).some((p) => p.field === e.data.field && p.target === e.data.target);
      btn.hidden = !pending();
      btn.addEventListener("click", () => { if (simActions.adoptTechMomentum(e.stateIds[0], e.data.field)) { btn.textContent = "採用した"; btn.disabled = true; } else btn.hidden = true; });
      card.append(btn);
    }
    // 条約の期限切れが近いとき: 「更新」で期限を延ばす（Undo 可。押さなければ、そのまま失効する）
    if (e.type === "treaty-expiring" && e.data?.treatyId != null && simActions) {
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "news-adopt"; btn.textContent = "更新";
      btn.hidden = !simActions.expiringTreaties().some((t) => t.id === e.data.treatyId);
      btn.addEventListener("click", () => { if (simActions.renewTreaty(e.data.treatyId)) { btn.textContent = "更新した"; btn.disabled = true; } else btn.hidden = true; });
      card.append(btn);
    }
    const close = document.createElement("button"); close.type = "button"; close.className = "news-close"; close.setAttribute("aria-label", "閉じる"); close.textContent = "×";
    close.addEventListener("click", () => dismiss(card));
    card.append(close);
    box.prepend(card);
    while (box.children.length > MAX) box.lastElementChild.remove();
    const ms = cat.major ? majorMs : shortMs;
    setTimeout(() => card.classList.add("fading"), ms);
    setTimeout(() => card.remove(), ms + 900);
  }
  const dismiss = (card) => { card.classList.add("fading"); setTimeout(() => card.remove(), 300); };

  function scan() {
    timer = null;
    const map = store.getState().map;
    if (!map) { seen = null; box.replaceChildren(); return; }
    if (!seen) { reseed(map); return; }
    const now = snapshot(map), fresh = [];
    for (const e of now) { const k = keyOf(e); if (!seen.has(k)) { seen.add(k); fresh.push(e); } }
    for (const e of fresh.slice(-MAX)) show(e);
  }
  store.subscribe((state, change) => {
    if (change?.type === "replace") { seen = null; box.replaceChildren(); if (state.map) reseed(state.map); return; }
    if (change?.type === "undo" || change?.type === "redo") { if (state.map) reseed(state.map); return; } // 取り消しで消えた/戻った出来事は、ニュースにしない
    if (!state.map) return;
    if (!timer) timer = setTimeout(scan, 120); // 連続した変更（ブラシ等）はまとめる
  });
  return { scan: () => { clearTimeout(timer); scan(); } };
}
