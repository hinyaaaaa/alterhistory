// v5.3 UI: 出来事の種類 → 表示上の分類。通知・時間軸のマーカー・一覧の絞り込みが共通で使う。
// 分類は表示のためだけ。重大かどうかは分類ではなく impact.js の影響度で決める（種類だけで止めない）。
export const CATEGORIES = Object.freeze([
  { id: "state", label: "国家", tone: "accent", test: /^state_|^leader_|^group_joined_state|^conquest|^territory_/ },
  { id: "war", label: "戦争", tone: "danger", test: /^war_|^battle_|^campaign_|^ally_joined/ },
  { id: "diplomacy", label: "外交", tone: "info", test: /^treaty_|^diplomacy_|^demand_/ },
  { id: "disaster", label: "災害", tone: "warn", test: /^disaster_|^famine|^climate_|^instability/ },
  { id: "tech", label: "技術", tone: "ally", test: /^tech_/ },
  { id: "culture", label: "文化・宗教", tone: "info", test: /^culture_|^language_|^religion_|^cohort_/ },
  { id: "magic", label: "魔法", tone: "accent", test: /^magic_/ },
  { id: "society", label: "社会", tone: "muted", test: /^group_|^settlement_|^subsistence_/ },
]);
const FALLBACK = Object.freeze({ id: "record", label: "記録", tone: "muted" });

export const categoryOf = (kind) => CATEGORIES.find((c) => c.test.test(String(kind ?? ""))) ?? FALLBACK;
export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) ?? FALLBACK;

/** 通知の要約用: 出来事の配列を分類ごとに数える（削除や間引きはしない。数えるだけ） */
export function countByCategory(events) {
  const m = new Map();
  for (const e of events) { const c = categoryOf(e.kind); m.set(c.id, (m.get(c.id) ?? 0) + 1); }
  return [...m].map(([id, n]) => ({ id, label: categoryById(id).label, n })).sort((a, b) => b.n - a.n);
}
