// 条約：国どうしの取り決めを、すべて「条約」という一つの部品で持つ。
//   同盟・不可侵・経済協力・従属・領土の画定・共同宣言・講和は、条約の種類である。
//   ・以前の決定「外交は同盟と敵対の二分のみ」は変えない。親しさの数値は作らず、関係は、条約の有無と戦争の有無だけで表す。
//   ・シミュレーションに実際に効く。効果は種類ごとに決まっていて、条項から計算する（AI実装ではない）。
//       同盟   … 当事国が攻められると、拘束力に応じて参戦に招集される（既存の同盟の仕組みに条項をつなぐ）
//       不可侵 … 当事国間の宣戦は違約。実行すると、民意と信用が下がり、条約は破棄される
//       経済協力 … 当事国間の貿易収入に補正
//       従属   … 宗主国・従属国（貢納は既存の仕組み）
//       共同宣言 … 記録と年表のみ（補正は付けない）
//   ・保存場所: ext.data.treaties = [{ id, kind, name, parties:[{state, role}], signedAt, expiresAt|null, status, endedAt, brokenBy,
//                                    terms, originWar, text, ref }]
//   ・保存形式の版: ext.data.saveFormat（旧形式 = 1、条約を導入した形式 = 2）。旧形式は読み込み時に変換する。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setProps } from "./commands.js";
import { ensureExt } from "./ext.js";
import { withEvent } from "./history-log.js";
import { planCreateAlliance, planDissolveAlliance, listAlliances, leaderOf } from "./alliances.js";
import { planSetVassal, planReleaseVassal, vassalInfo, VASSAL_KINDS, VASSAL_BY_KEY } from "./vassals.js";

export const SAVE_FORMAT = 2;

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const nameOf = (s) => s?.fullName ?? s?.name ?? "?";
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const monthKey = (t) => t.year * 12 + (t.month - 1);
const addMonthsTo = (t, n) => { const k = monthKey(t) + n; return { year: Math.floor(k / 12), month: (k % 12) + 1 }; };

/** 条約の種類。terms は、種類ごとの最小限の条項（既定値は自動） */
export const TREATY_KINDS = Object.freeze([
  { key: "alliance", label: "軍事同盟・安全保障条約", short: "同盟", color: "ally", min: 2, desc: "当事国が攻められると、拘束力に応じて他の当事国が参戦する。" },
  { key: "nonaggression", label: "不可侵条約", short: "不可侵", color: "info", min: 2, desc: "当事国どうしの宣戦は違約になる。破ると民意と信用が下がる。" },
  { key: "economic", label: "経済協力・自由貿易", short: "協力", color: "warn", min: 2, desc: "当事国どうしの貿易収入が増える（関税が低いほど大きい）。" },
  { key: "vassal", label: "従属（保護国・属国・傀儡）", short: "従属", color: "info", min: 2, max: 2, desc: "宗主国と従属国。貢納が経済に反映され、宗主国の戦争に従う。" },
  { key: "border", label: "領土・国境の画定", short: "国境", color: "info", min: 2, desc: "国境を取り決めた記録。領土の移転は、地図編集の割譲と同じ仕組みで行う。" },
  { key: "declaration", label: "共同宣言", short: "宣言", color: "brass", min: 2, desc: "定型文を選んで出す。効果は記録と年表のみ。" },
  { key: "peace", label: "講和条約", short: "講和", color: "brass", min: 2, desc: "戦争の終わりに、戦争ウィンドウから結ぶ。" },
]);
export const TREATY_BY_KEY = Object.fromEntries(TREATY_KINDS.map((k) => [k.key, k]));
/** 外交ウィンドウの「条約を結ぶ」から選べる種類（講和は戦争ウィンドウから） */
export const SIGNABLE_KINDS = Object.freeze(TREATY_KINDS.filter((k) => k.key !== "peace").map((k) => k.key));

/** 同盟の拘束力 → 既存の同盟の拘束（loose/standard/strict） */
export const BIND_LEVELS = Object.freeze([
  { key: "strong", label: "強", bond: "strict", desc: "攻める戦争にも守る戦争にも、当事国は必ず参戦する。" },
  { key: "medium", label: "中", bond: "standard", desc: "当事国が攻められたら参戦する（防衛義務）。" },
  { key: "weak", label: "弱", bond: "loose", desc: "戦争に巻き込まれない。" },
]);
export const BIND_BY_KEY = Object.fromEntries(BIND_LEVELS.map((b) => [b.key, b]));
export const TARIFFS = Object.freeze([
  { key: "low", label: "低（自由貿易）", boost: 0.1 },
  { key: "mid", label: "中", boost: 0.06 },
  { key: "high", label: "高", boost: 0.03 },
]);
export const TARIFF_BY_KEY = Object.fromEntries(TARIFFS.map((t) => [t.key, t]));
export const DECLARATIONS = Object.freeze([
  { key: "friendship", label: "友好と相互尊重の共同宣言", text: "両国は、互いの主権を尊重し、友好を深めることを宣言した。" },
  { key: "trade", label: "通商の発展に関する共同宣言", text: "両国は、通商の発展と往来の自由に努めることを宣言した。" },
  { key: "peace", label: "地域の平和に関する共同宣言", text: "両国は、地域の平和を守るために協力することを宣言した。" },
  { key: "culture", label: "文化交流に関する共同宣言", text: "両国は、文化と学術の交流を進めることを宣言した。" },
]);
export const DECLARATION_BY_KEY = Object.fromEntries(DECLARATIONS.map((d) => [d.key, d]));
export const PERIODS = Object.freeze([
  { months: null, label: "無期限" }, { months: 60, label: "5年" }, { months: 120, label: "10年" }, { months: 240, label: "20年" },
]);

// ---- 読み取り ----
export const listTreaties = (map) => map.ext?.data?.treaties ?? [];
const writeTreaties = (m, list) => { const ext = ensureExt(m); if (list.length) ext.data.treaties = list; else delete ext.data.treaties; };
const nextId = (map) => { const l = listTreaties(map); return l.length ? Math.max(...l.map((t) => t.id)) + 1 : 1; };

/** いまの状態: "active"（有効）| "expired"（失効＝期限切れ）| "broken"（破棄） */
export function treatyStatus(t, now) {
  if (t.status === "broken") return "broken";
  if (t.status === "expired") return "expired";
  if (t.expiresAt && now && monthKey(now) >= monthKey(t.expiresAt)) return "expired";
  return "active";
}
export const STATUS_LABEL = Object.freeze({ active: "有効", expired: "失効", broken: "破棄" });
const nowOf = (map) => map.worldTime ?? { year: 1, month: 1 };
export const activeTreaties = (map, now = nowOf(map), kind = null) => listTreaties(map).filter((t) => treatyStatus(t, now) === "active" && (!kind || t.kind === kind));
export const treatiesOf = (map, stateId, now = nowOf(map)) => listTreaties(map).filter((t) => t.parties.some((p) => p.state === stateId));
export const partyIds = (t) => t.parties.map((p) => p.state);

// ---- 文面（テンプレートから自動生成。書き換えは任意） ----
const joinNames = (map, ids) => ids.map((id) => nameOf(map.pack.states[id])).join("・");
export function autoName(map, kind, parties, terms = {}) {
  const ids = parties.map((p) => p.state), names = ids.map((id) => map.pack.states[id]?.name ?? "?");
  const two = names.length === 2 ? `${names[0]}・${names[1]}` : `${names[0]}ほか${names.length - 1}国`;
  const base = {
    alliance: names.length > 2 ? `${names[0]}同盟` : `${two}同盟`,
    nonaggression: `${two}不可侵条約`,
    economic: `${two}経済協力協定`,
    vassal: `${names[1] ?? names[0]}従属条約`,
    border: `${two}国境画定条約`,
    declaration: `${two}共同宣言`,
    peace: `${two}講和条約`,
  }[kind] ?? `${two}条約`;
  return base;
}
export function uniqueName(map, name, exceptId = null) {
  const taken = new Set(listTreaties(map).filter((t) => t.id !== exceptId).map((t) => t.name));
  if (!taken.has(name)) return name;
  for (let i = 2; i < 100; i++) if (!taken.has(`${name}（${i}）`)) return `${name}（${i}）`;
  return name;
}
const fmtDate = (d) => (d ? `${d.year}年${d.month}月` : "");
/** 条項の要約（自動生成）。t.text があれば、書き換えた本文を優先する */
export function treatyText(map, t) {
  if (t.text) return t.text;
  const names = joinNames(map, partyIds(t));
  const term = t.terms ?? {};
  const bits = [];
  if (t.kind === "alliance") {
    const lead = t.parties.find((p) => p.role === "盟主");
    bits.push(`${names}は軍事同盟を結んだ。${lead ? `盟主は${nameOf(map.pack.states[lead.state])}。` : ""}拘束力は「${BIND_BY_KEY[term.bind]?.label ?? "中"}」と定められた。${term.civilCalls ? "" : ""}`);
  } else if (t.kind === "nonaggression") bits.push(`${names}は、互いに宣戦しないことを約した。`);
  else if (t.kind === "economic") bits.push(`${names}は経済協力を結び、関税を「${TARIFF_BY_KEY[term.tariff]?.label ?? "中"}」とした。`);
  else if (t.kind === "vassal") { const o = t.parties.find((p) => p.role === "宗主国"), v = t.parties.find((p) => p.role !== "宗主国"); bits.push(`${nameOf(map.pack.states[v?.state])}は${nameOf(map.pack.states[o?.state])}の${VASSAL_BY_KEY[term.kind]?.label ?? "属国"}となった。`); }
  else if (t.kind === "border") bits.push(`${names}は、国境を取り決めた。${term.note ? term.note : ""}`);
  else if (t.kind === "declaration") bits.push(DECLARATION_BY_KEY[term.declaration]?.text ?? `${names}は共同宣言を出した。`);
  else if (t.kind === "peace") bits.push(`${names}の戦争は、${t.name}をもって終結した。${term.notes ?? ""}`);
  bits.push(t.expiresAt ? `期限は${fmtDate(t.expiresAt)}まで。` : "期限の定めはない。");
  return bits.join("");
}

// ---- 締結（確定するまで何も残さない。年表に1件、Undo は1回） ----
function checkParties(map, kind, parties) {
  const def = TREATY_BY_KEY[kind]; if (!def) throw new Error("未知の条約の種類です");
  if (!Array.isArray(parties)) throw new Error("当事国を選んでください");
  const ids = parties.map((p) => p.state);
  if (new Set(ids).size !== ids.length) throw new Error("同じ国が重複しています");
  if (ids.length < def.min) throw new Error(`${def.label}には${def.min}か国以上が必要です`);
  if (def.max && ids.length > def.max) throw new Error(`${def.label}は${def.max}か国までです`);
  for (const id of ids) if (!isLive(map.pack.states[id])) throw new Error(`国家#${id}は存在しません`);
}

/**
 * 条約を結ぶ。
 * @param {{kind:string, parties:{state:number, role?:string}[], terms?:object, name?:string, date?:{year,month}, months?:number|null, text?:string, originWar?:number|null}} o
 * @returns {{command, id}}
 */
export function planConcludeTreaty(map, o, { logEvent = true } = {}) {
  const { kind } = o; const parties = (o.parties ?? []).map((p) => ({ state: p.state, role: p.role ?? "加盟" }));
  checkParties(map, kind, parties);
  const date = o.date ?? nowOf(map);
  const terms = { ...(o.terms ?? {}) };
  const ids = parties.map((p) => p.state);
  const parts = [];
  let ref = null;
  if (kind === "alliance") {
    terms.bind = BIND_BY_KEY[terms.bind] ? terms.bind : "medium";
    const leader = parties.find((p) => p.role === "盟主")?.state ?? ids[0];
    for (const p of parties) p.role = p.state === leader ? "盟主" : "加盟";
    const name0 = uniqueName(map, o.name?.trim() || autoName(map, kind, parties, terms));
    const r = planCreateAlliance(map, name0, ids, date, BIND_BY_KEY[terms.bind].bond, leader);
    parts.push(...r.command.parts); ref = { allianceId: r.id };
  } else if (kind === "vassal") {
    const overlord = parties.find((p) => p.role === "宗主国")?.state ?? ids[0];
    const vassal = ids.find((id) => id !== overlord);
    for (const p of parties) p.role = p.state === overlord ? "宗主国" : (VASSAL_BY_KEY[terms.kind]?.label ?? "属国");
    terms.kind = VASSAL_BY_KEY[terms.kind] ? terms.kind : "vassal";
    const c = planSetVassal(map, vassal, overlord, terms.kind, date);
    if (c) parts.push(...c.parts);
    ref = { vassalState: vassal };
  } else if (kind === "economic") terms.tariff = TARIFF_BY_KEY[terms.tariff] ? terms.tariff : "mid";
  else if (kind === "declaration") terms.declaration = DECLARATION_BY_KEY[terms.declaration] ? terms.declaration : "friendship";
  const name = uniqueName(map, o.name?.trim() || autoName(map, kind, parties, terms));
  const id = nextId(map);
  const expiresAt = o.months ? addMonthsTo(date, o.months) : null;
  const t = { id, kind, name, parties, signedAt: { ...date }, expiresAt, status: "active", terms, originWar: o.originWar ?? null, text: o.text?.trim() || null, ref };
  const before = listTreaties(map);
  parts.unshift({ apply: (m) => writeTreaties(m, [...before, t]), revert: (m) => writeTreaties(m, before) });
  let cmd = makeCommand(`条約を結ぶ（${name}）`, [], parts);
  // 同盟は、年表に「同盟結成」が既にあるので、重ねて記録しない
  if (logEvent && kind !== "alliance") {
    cmd = withEvent(map, cmd, { type: "treaty-signed", title: `${name}を締結`, detail: `${joinNames(map, ids)} / ${TREATY_BY_KEY[kind].label}`, date, states: ids });
  }
  return { command: cmd, id, treaty: t };
}

// ---- 破棄・改定 ----
/** 破棄する。by はやめる側の国。期限前の破棄は、違約として民意と信用が下がる（by が当事国のとき） */
export function planBreakTreaty(map, id, { by = null, date = null } = {}) {
  const t = listTreaties(map).find((x) => x.id === id); if (!t) throw new Error("その条約は存在しません");
  const now = date ?? nowOf(map);
  if (treatyStatus(t, now) !== "active") throw new Error("すでに有効ではありません");
  if (t.kind === "peace") throw new Error("講和条約は破棄できません（戦争は終わったままです）");
  const parts = [];
  const before = listTreaties(map);
  const after = before.map((x) => (x.id === id ? { ...x, status: "broken", endedAt: { ...now }, brokenBy: by } : x));
  parts.push({ apply: (m) => writeTreaties(m, after), revert: (m) => writeTreaties(m, before) });
  if (t.kind === "alliance" && t.ref?.allianceId) {
    const al = listAlliances(map).find((a) => a.id === t.ref.allianceId);
    if (al && !al.dissolvedAt) parts.push(...planDissolveAlliance(map, al.id, now).parts);
  }
  if (t.kind === "vassal" && t.ref?.vassalState && vassalInfo(map, t.ref.vassalState)) parts.push(...planReleaseVassal(map, t.ref.vassalState).parts);
  if (by != null && partyIds(t).includes(by) && ["alliance", "nonaggression", "economic", "vassal", "border"].includes(t.kind)) parts.push(...breachPenaltyParts(map, by, 5, 10));
  const cmd = makeCommand(`条約を破棄（${t.name}）`, ["politics"], parts);
  return withEvent(map, cmd, { type: "treaty-broken", title: `${t.name}が破棄された`, detail: by != null ? `${nameOf(map.pack.states[by])}が破棄` : null, date: now, states: partyIds(t) });
}

/** 期限・名前・本文・条項を改める（改定）。変化が無ければ null */
export function planAmendTreaty(map, id, patch) {
  const list = listTreaties(map); const t = list.find((x) => x.id === id); if (!t) throw new Error("その条約は存在しません");
  if (treatyStatus(t, nowOf(map)) !== "active") throw new Error("有効な条約だけ改定できます");
  const next = { ...t, terms: { ...(t.terms ?? {}) } };
  if (patch.name !== undefined) { const n = String(patch.name).trim(); if (!n) throw new Error("条約の名前を入力してください"); next.name = uniqueName(map, n, id); }
  if (patch.months !== undefined) next.expiresAt = patch.months ? addMonthsTo(nowOf(map), patch.months) : null;
  if (patch.text !== undefined) next.text = String(patch.text).trim() || null;
  if (patch.terms) Object.assign(next.terms, patch.terms);
  if (JSON.stringify(next) === JSON.stringify(t)) return null;
  const parts = [{ apply: (m) => writeTreaties(m, list.map((x) => (x.id === id ? next : x))), revert: (m) => writeTreaties(m, list) }];
  // 同盟の拘束力を変えたら、同盟にも反映する
  if (t.kind === "alliance" && t.ref?.allianceId && patch.terms?.bind && BIND_BY_KEY[patch.terms.bind]) {
    const al = listAlliances(map).find((a) => a.id === t.ref.allianceId);
    if (al) { const before = listAlliances(map); const afterA = before.map((a) => (a.id === al.id ? { ...a, bond: BIND_BY_KEY[patch.terms.bind].bond } : a)); parts.push({ apply: (m) => { ensureExt(m).data.alliances = afterA; }, revert: (m) => { ensureExt(m).data.alliances = before; } }); }
  }
  return makeCommand(`条約を改定（${next.name}）`, [], parts);
}

// ---- 違約（不可侵条約） ----
function breachPenaltyParts(map, stateId, supportDrop, creditDrop) {
  const s = map.pack.states[stateId]; if (!isLive(s)) return [];
  const sup = typeof s.support === "number" ? s.support : 70, cred = typeof s.credibility === "number" ? s.credibility : 70;
  return [setProps(s, { support: clamp(sup - supportDrop, 0, 100), credibility: clamp(cred - creditDrop, 0, 100) })];
}

/** 宣戦が、有効な不可侵条約に反するか。{ treaty, aggressor, target }[] */
export function findWarViolations(map, attackers, defenders, now = nowOf(map)) {
  const out = [];
  for (const t of activeTreaties(map, now, "nonaggression")) {
    const ids = partyIds(t);
    for (const a of attackers) if (ids.includes(a)) for (const d of defenders) if (ids.includes(d) && d !== a) out.push({ treaty: t, aggressor: a, target: d });
  }
  const seen = new Set(); return out.filter((v) => { const k = `${v.treaty.id}:${v.aggressor}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** 違約の実行：条約を破棄し、攻めた国の民意と信用を下げる。違反が無ければ null */
export function planWarBreach(map, attackers, defenders, date = null) {
  const now = date ?? nowOf(map);
  const v = findWarViolations(map, attackers, defenders, now); if (!v.length) return null;
  const list = listTreaties(map);
  const broken = new Map(v.map((x) => [x.treaty.id, x.aggressor]));
  const after = list.map((t) => (broken.has(t.id) ? { ...t, status: "broken", endedAt: { ...now }, brokenBy: broken.get(t.id) } : t));
  const parts = [{ apply: (m) => writeTreaties(m, after), revert: (m) => writeTreaties(m, list) }];
  const aggressors = [...new Set(v.map((x) => x.aggressor))];
  for (const a of aggressors) parts.push(...breachPenaltyParts(map, a, 8, 15));
  const cmd = makeCommand("不可侵条約の違約", ["politics"], parts);
  return withEvent(map, cmd, { type: "treaty-breach", title: `${nameOf(map.pack.states[aggressors[0]])}が不可侵条約を破って宣戦`, detail: v.map((x) => x.treaty.name).join("、"), date: now, states: [...new Set(v.flatMap((x) => [x.aggressor, x.target]))] });
}

/** 2つのコマンドを1つにまとめる（Undo を1回にする） */
export function joinCommands(base, extra) {
  if (!extra) return base;
  return makeCommand(base.label, [...new Set([...(base.layers ?? []), ...(extra.layers ?? [])])], [...base.parts, ...extra.parts]);
}

// ---- 経済協力の効果 ----
/** その国の貿易収入への補正（1.0 = 補正なし）。有効な経済協力の当事国どうしで効く */
export function tradeBoost(map, stateId, now = nowOf(map)) {
  let b = 0;
  for (const t of activeTreaties(map, now, "economic")) if (partyIds(t).includes(stateId)) b += TARIFF_BY_KEY[t.terms?.tariff]?.boost ?? 0.06;
  return 1 + Math.min(0.3, b);
}

/** 2国の間の貿易への補正（1.0 = 補正なし）。両国が当事国になっている有効な経済協力だけが効く */
export function pairBoost(map, a, b, now = nowOf(map)) {
  let x = 0;
  for (const t of activeTreaties(map, now, "economic")) { const ids = partyIds(t); if (ids.includes(a) && ids.includes(b)) x += TARIFF_BY_KEY[t.terms?.tariff]?.boost ?? 0.06; }
  return 1 + Math.min(0.3, x);
}

// ---- 設定: 内戦で、同盟の参戦招集を行うか（既定は行わない） ----
export const getTreatySettings = (map) => ({ civilCallsAllies: map.ext?.data?.treatySettings?.civilCallsAllies === true });
export function planSetTreatySettings(map, patch) {
  const cur = getTreatySettings(map); const next = { ...cur, ...patch };
  if (next.civilCallsAllies === cur.civilCallsAllies) return null;
  const before = map.ext?.data?.treatySettings;
  return makeCommand(`内戦の参戦招集: ${next.civilCallsAllies ? "行う" : "行わない"}`, [], [{
    apply: (m) => { ensureExt(m).data.treatySettings = { civilCallsAllies: !!next.civilCallsAllies }; },
    revert: (m) => { const ext = ensureExt(m); if (before) ext.data.treatySettings = before; else delete ext.data.treatySettings; },
  }]);
}

// ---- 旧形式（保存形式の版 1）→ 条約（版 2）への変換。読み込み時に呼ぶ。冪等 ----
const BOND_TO_BIND = { strict: "strong", standard: "medium", loose: "weak" };
export function migrateLegacyToTreaties(map) {
  const ext = ensureExt(map); const data = ext.data;
  const fmt = Number.isInteger(data.saveFormat) ? data.saveFormat : 1;
  const list = [...(data.treaties ?? [])];
  let id = list.length ? Math.max(...list.map((t) => t.id)) + 1 : 1;
  let added = 0;
  const hasRef = (pred) => list.some(pred);
  // 同盟
  for (const a of data.alliances ?? []) {
    if (hasRef((t) => t.ref?.allianceId === a.id)) continue;
    const lead = leaderOf(a);
    list.push({ id: id++, kind: "alliance", name: a.name, parties: a.members.map((m) => ({ state: m, role: m === lead ? "盟主" : "加盟" })), signedAt: a.formedAt ?? null, expiresAt: null, status: a.dissolvedAt ? "broken" : "active", endedAt: a.dissolvedAt ?? null, brokenBy: null, terms: { bind: BOND_TO_BIND[a.bond] ?? "medium" }, originWar: null, text: null, ref: { allianceId: a.id } });
    added++;
  }
  // 従属
  for (const s of map.pack?.states ?? []) {
    if (!isLive(s) || !s.vassal || !isLive(map.pack.states[s.vassal.overlord])) continue;
    if (hasRef((t) => t.ref?.vassalState === s.i && t.status === "active")) continue;
    const kind = VASSAL_BY_KEY[s.vassal.kind] ? s.vassal.kind : "vassal";
    list.push({ id: id++, kind: "vassal", name: `${s.name}従属条約`, parties: [{ state: s.vassal.overlord, role: "宗主国" }, { state: s.i, role: VASSAL_BY_KEY[kind].label }], signedAt: s.vassal.since ?? null, expiresAt: null, status: "active", endedAt: null, brokenBy: null, terms: { kind }, originWar: null, text: null, ref: { vassalState: s.i } });
    added++;
  }
  // 過去の講和
  for (const w of data.wars ?? []) {
    const tm = w.terms; if (!w.endedAt || !tm?.treatyName) continue;
    if (hasRef((t) => t.kind === "peace" && t.originWar === w.id)) continue;
    const all = [...new Set([...(w.attackers ?? []), ...(w.defenders ?? [])])].filter((i) => map.pack.states[i]);
    if (all.length < 2) continue;
    list.push({ id: id++, kind: "peace", name: tm.treatyName, parties: all.map((s) => ({ state: s, role: (w.attackers ?? []).includes(s) ? "攻撃側" : "防御側" })), signedAt: tm.signedAt ?? w.endedAt, expiresAt: null, status: "active", endedAt: null, brokenBy: null, terms: { kind: tm.kind ?? "standard", notes: tm.notes ?? "" }, originWar: w.id, text: null, ref: { warId: w.id } });
    added++;
  }
  if (added) data.treaties = list;
  data.saveFormat = SAVE_FORMAT;
  return { from: fmt, added };
}

/** 外交ウィンドウの関係一覧用: 国ごとの条約バッジ（同盟・不可侵・協力・従属・戦争中） */
export function badgesOf(map, stateId, warsActive = [], now = nowOf(map)) {
  const out = new Set();
  for (const t of activeTreaties(map, now)) if (partyIds(t).includes(stateId) && t.kind !== "peace" && t.kind !== "declaration" && t.kind !== "border") out.add(TREATY_BY_KEY[t.kind].short);
  if (warsActive.some((w) => [...w.attackers, ...w.defenders].includes(stateId))) out.add("戦争中");
  return [...out];
}
