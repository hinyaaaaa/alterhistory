// 政体（HoI4 風に、リストから選ぶ）。「政体」と「政体名」は1つに統合した。
//   state.regime = 政体のキー。form（Azgaar の分類）と formName（表示名）は、選んだ政体から同時に書く。
//   支持率バーは表示のみ（国のIDと政体から決まる、見せるだけの値）。
//   政体ごとに選べる固有ドクトリン（doctrines.js の UNIQUE_NODES）を持つ。
// 純粋ロジック層：DOM に依存しない。
import { makeCommand, setProps } from "./commands.js";

/** succession: hereditary=世襲 / elected=任期つき選出 / life=終身の選出 / appointed=任命・党の決定 */
export const REGIMES = Object.freeze([
  { key: "absolute", label: "絶対君主制", form: "Monarchy", ideology: "monarchist", titles: ["王", "女王"], succession: "hereditary", desc: "王が全権を握る。世襲で、長い在位になりやすい。" },
  { key: "constitutional", label: "立憲君主制", form: "Monarchy", ideology: "monarchist", titles: ["王", "女王"], succession: "hereditary", desc: "王は象徴で、議会が政治を動かす。" },
  { key: "empire", label: "帝政", form: "Monarchy", ideology: "monarchist", titles: ["皇帝", "女帝"], succession: "hereditary", desc: "多民族を従える皇帝の国。" },
  { key: "elective", label: "選挙君主制", form: "Monarchy", ideology: "monarchist", titles: ["王", "女王"], succession: "life", desc: "有力者の選挙で王を選ぶ。終身。" },
  { key: "theocracy", label: "神権政治", form: "Theocracy", ideology: "religious", titles: ["大司祭", "聖母"], succession: "life", desc: "宗教の指導者が国を治める。" },
  { key: "aristocratic", label: "貴族共和制", form: "Republic", ideology: "liberal", titles: ["元首", "女元首"], succession: "elected", term: [5, 10], desc: "有力な家門が元首を選ぶ。" },
  { key: "democracy", label: "議会制民主主義", form: "Republic", ideology: "liberal", titles: ["首相", "女性首相"], succession: "elected", term: [4, 8], desc: "選挙で選ばれた議会が政府をつくる。" },
  { key: "presidential", label: "大統領制共和国", form: "Republic", ideology: "liberal", titles: ["大統領", "女性大統領"], succession: "elected", term: [4, 8], desc: "国民が直接、大統領を選ぶ。" },
  { key: "party", label: "党独裁（社会主義）", form: "Republic", ideology: "socialist", titles: ["書記長", "女性書記長"], succession: "appointed", term: [8, 25], desc: "一党が国家を導く。指導者は党が決める。" },
  { key: "nationalist", label: "国家主義独裁", form: "Republic", ideology: "nationalist", titles: ["総統", "女性総統"], succession: "appointed", term: [10, 30], desc: "強い指導者が国民を結集する。" },
  { key: "junta", label: "軍事政権", form: "Republic", ideology: "military", titles: ["将軍", "女将軍"], succession: "appointed", term: [3, 15], desc: "軍が政権を握る。交代は急に起きやすい。" },
  { key: "tribal", label: "部族連合", form: "Union", ideology: "tribal", titles: ["族長", "女族長"], succession: "life", desc: "部族の長老が合議で首長を選ぶ。" },
  { key: "federation", label: "連邦・連合", form: "Union", ideology: "liberal", titles: ["議長", "女性議長"], succession: "elected", term: [4, 8], desc: "複数の邦が合意で結ぶ国。" },
  { key: "anarchy", label: "無政府・混乱", form: "Anarchy", ideology: "tribal", titles: ["指導者", "女性指導者"], succession: "appointed", term: [1, 6], desc: "中央の統治が崩れた状態。" },
]);
export const REGIME_BY_KEY = Object.fromEntries(REGIMES.map((r) => [r.key, r]));
export const IDEOLOGIES = Object.freeze({ monarchist: "君主", liberal: "自由・共和", socialist: "社会主義", nationalist: "国家主義", religious: "宗教", military: "軍部", tribal: "部族" });

/** 旧データ（form / formName）から政体を推定する（読み込み時の移行用） */
export function regimeKeyFromLegacy(form, formName) {
  const n = String(formName ?? "");
  if (form === "Monarchy") return /Empire|帝/.test(n) ? "empire" : "absolute";
  if (form === "Theocracy") return "theocracy";
  if (form === "Republic") return "democracy";
  if (form === "Union" || form === "Federation") return "federation";
  if (form === "Anarchy") return "anarchy";
  return "absolute";
}
export function regimeOf(state) {
  return REGIME_BY_KEY[state?.regime] ?? REGIME_BY_KEY[regimeKeyFromLegacy(state?.form, state?.formName)];
}

/** 支持率バー（表示のみ）。政体の思想が最大になる。同じ国・同じ政体なら同じ値 */
export function supportBars(state) {
  const r = regimeOf(state);
  const keys = Object.keys(IDEOLOGIES);
  let h = ((state?.i ?? 0) * 2654435761) >>> 0;
  const rnd = () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return h / 4294967296; };
  const main = 55 + Math.floor(rnd() * 25);
  const rest = keys.filter((k) => k !== r.ideology);
  const w = rest.map(() => 0.2 + rnd());
  const sum = w.reduce((a, b) => a + b, 0);
  const out = [{ key: r.ideology, label: IDEOLOGIES[r.ideology], value: main }];
  rest.forEach((k, i) => out.push({ key: k, label: IDEOLOGIES[k], value: Math.round(((100 - main) * w[i]) / sum) }));
  return out.filter((x) => x.value >= 1).sort((a, b) => b.value - a.value).slice(0, 4);
}

/** 政体を変える。form / formName（表示名）も同時に書く。変化が無ければ null */
export function planSetRegime(map, stateId, key) {
  const s = map.pack.states[stateId];
  if (!s || s.removed || !(s.i > 0)) throw new Error("存在しない国家です");
  const r = REGIME_BY_KEY[key]; if (!r) throw new Error("未知の政体です");
  if (s.regime === key && s.form === r.form && s.formName === r.label) return null;
  return makeCommand(`政体の変更（${s.name}: ${r.label}）`, ["politics"], [setProps(s, { regime: key, form: r.form, formName: r.label })]);
}
