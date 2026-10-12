// v2.2.0 世界情報の詳細化（機能E）。すべて選択式。シミュレーションの数値にはつながず、
// 表示（ホバーカード・詳細）と、年表・国の説明文のテンプレートにだけ使う。
import { makeCommand, setProps } from "./commands.js";

export const STATE_TAGS = Object.freeze([
  { key: "maritime", label: "海洋国家" }, { key: "inland", label: "内陸国" }, { key: "nomad", label: "遊牧" }, { key: "commerce", label: "商業" },
  { key: "military", label: "軍事" }, { key: "scholar", label: "学術" }, { key: "theocracy", label: "宗教国家" },
]);
export const BURG_KINDS = Object.freeze([
  { key: "", label: "（指定なし）" }, { key: "religious", label: "宗教都市" }, { key: "trade", label: "交易都市" }, { key: "academic", label: "学術都市" },
]); // 港・要塞は、都市がすでに持つ項目（港・城塞）を使う
export const PROVINCE_TITLES = Object.freeze([
  { key: "", label: "（州）" }, { key: "march", label: "辺境伯領" }, { key: "governorate", label: "総督領" }, { key: "duchy", label: "公領" },
]);
export const RESOURCES = Object.freeze([
  { key: "iron", label: "鉄" }, { key: "silver", label: "銀" }, { key: "grain", label: "穀物" }, { key: "salt", label: "塩" }, { key: "timber", label: "木材" },
]);
const label = (list, k) => list.find((x) => x.key === k)?.label ?? "";
export const tagLabels = (e) => (e?.tags ?? []).map((k) => label(STATE_TAGS, k)).filter(Boolean);
export const resourceLabels = (e) => (e?.resources ?? []).map((k) => label(RESOURCES, k)).filter(Boolean);
export const burgKindLabel = (b) => label(BURG_KINDS, b?.kind ?? "");
export const provinceTitleLabel = (p) => label(PROVINCE_TITLES, p?.title ?? "");
/** 説明文のテンプレート用の前置き。例:「海洋国家の」（特色が無ければ空） */
export const epithet = (state) => { const t = tagLabels(state)[0]; return t ? `${t}の` : ""; };

const LISTS = { state: "states", burg: "burgs", province: "provinces" };
const ok = (list, ks) => Array.isArray(ks) && ks.every((k) => list.some((x) => x.key === k));

/** kind: state{tags,resources?} / burg{kind,resources} / province{title,resources}。変化が無ければ null */
export function planSetWorldInfo(map, kind, id, patch) {
  const e = map.pack[LISTS[kind]]?.[id];
  if (!e || e.removed || !(e.i > 0)) throw new Error("その対象は存在しません");
  const next = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "tags" && kind === "state") { if (!ok(STATE_TAGS, v)) throw new Error("未知の特色です"); next.tags = [...new Set(v)]; }
    else if (k === "resources" && kind !== "state") { if (!ok(RESOURCES, v)) throw new Error("未知の資源です"); next.resources = [...new Set(v)]; }
    else if (k === "kind" && kind === "burg") { if (!BURG_KINDS.some((x) => x.key === v)) throw new Error("未知の都市の種類です"); next.kind = v; }
    else if (k === "title" && kind === "province") { if (!PROVINCE_TITLES.some((x) => x.key === v)) throw new Error("未知の称号です"); next.title = v; }
    else throw new Error(`「${k}」は変更できません`);
  }
  const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => JSON.stringify(e[k] ?? (Array.isArray(v) ? [] : "")) !== JSON.stringify(v)));
  if (!Object.keys(changed).length) return null;
  return makeCommand(`${e.fullName ?? e.name}の情報を変更`, ["politics"], [setProps(e, changed)]);
}
