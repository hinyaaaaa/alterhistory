// 政治・文化の「深さ」の編集：国・文化・宗教の種類と政体、文化・宗教の起源（系統）、都市の詳細（種類・人口・設備）。
// どの項目も Azgaar 本家と同じ名前・値で保存する（type / form / formName / origins / group / citadel など）ので、.map に書き出しても互換。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setProps } from "./commands.js";

const round6 = (v) => Math.round(v * 1e6) / 1e6;
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

/** 文化・国家・都市の「種類」（Azgaar 本家の分類）。地形に合った拡大の仕方・名前の型を表す */
export const CULTURE_TYPES = Object.freeze([
  { id: "Generic", label: "標準" }, { id: "River", label: "河川" }, { id: "Lake", label: "湖畔" },
  { id: "Naval", label: "海洋" }, { id: "Nomadic", label: "遊牧" }, { id: "Hunting", label: "狩猟" }, { id: "Highland", label: "高地" },
]);
export const RELIGION_TYPES = Object.freeze([
  { id: "Folk", label: "民間信仰" }, { id: "Organized", label: "組織宗教" }, { id: "Cult", label: "カルト" }, { id: "Heresy", label: "異端" },
]);
export const STATE_FORMS = Object.freeze([
  { id: "Monarchy", label: "君主制" }, { id: "Republic", label: "共和制" }, { id: "Theocracy", label: "神権制" },
  { id: "Union", label: "連合" }, { id: "Anarchy", label: "無政府" },
]);
export const BURG_GROUPS = Object.freeze([
  { id: "capital", label: "首都" }, { id: "city", label: "都市" }, { id: "town", label: "町" }, { id: "village", label: "村" },
  { id: "hamlet", label: "集落" }, { id: "fort", label: "砦" }, { id: "monastery", label: "修道院" },
  { id: "caravanserai", label: "隊商宿" }, { id: "trading_post", label: "交易所" },
]);
/** 都市の設備（0/1） */
export const BURG_FEATURES = Object.freeze([
  { id: "citadel", label: "城塞", icon: "🏰" }, { id: "walls", label: "城壁", icon: "🧱" }, { id: "plaza", label: "広場", icon: "⛲" },
  { id: "temple", label: "神殿", icon: "⛪" }, { id: "shanty", label: "スラム", icon: "🏚" },
]);

const ENTITY_LIST = { state: "states", culture: "cultures", religion: "religions" };
const KIND_LABEL = { state: "国家", culture: "文化", religion: "宗教" };
const ids = (list) => list.map((x) => x.id);

// ---------- 国・文化・宗教の属性 ----------
/** patch: state→{type,form,formName} / culture→{type} / religion→{type,deity,form}。変化が無ければ null */
export function planSetEntityProfile(map, kind, id, patch) {
  const list = map.pack[ENTITY_LIST[kind]];
  if (!list) throw new Error("この種類は編集できません");
  const e = list[id];
  if (!isLive(e)) throw new Error("その対象は存在しません");
  const next = {};
  const text = (k, v, max = 60) => { const t = String(v ?? "").trim(); if (!t) throw new Error("空にはできません"); if (t.length > max) throw new Error(`${max}文字までです`); next[k] = t; };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "type") {
      const ok = kind === "religion" ? ids(RELIGION_TYPES) : ids(CULTURE_TYPES);
      if (!ok.includes(v)) throw new Error(`未知の種類です: ${v}`);
      next.type = v;
    } else if (k === "form" && kind === "state") {
      if (!ids(STATE_FORMS).includes(v)) throw new Error(`未知の政体です: ${v}`);
      next.form = v;
    } else if (k === "formName" && kind === "state") text("formName", v);
    else if ((k === "deity" || k === "form") && kind === "religion") text(k, v);
    else throw new Error(`${KIND_LABEL[kind]}では「${k}」を変更できません`);
  }
  const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => e[k] !== v));
  if (!Object.keys(changed).length) return null;
  return makeCommand(`${KIND_LABEL[kind]}の設定を変更（${e.name}）`, ["politics"], [setProps(e, changed)]);
}

// ---------- 起源（系統） ----------
const parentOf = (e) => (Array.isArray(e?.origins) && Number.isInteger(e.origins[0]) ? e.origins[0] : 0);

/** 系統の親子。{ parent: Map(id→親id), children: Map(id→[子id]) }。0 は共通の祖（野生・原始信仰） */
export function originTree(map, kind) {
  const list = map.pack[ENTITY_LIST[kind]] ?? [];
  const parent = new Map(), children = new Map();
  for (const e of list) {
    if (!isLive(e)) continue;
    const p = parentOf(e);
    parent.set(e.i, p);
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(e.i);
  }
  return { parent, children };
}

/** 子孫すべて（自分は含まない） */
export function descendantsOf(map, kind, id) {
  const { children } = originTree(map, kind);
  const out = [], stack = [...(children.get(id) ?? [])];
  while (stack.length) { const c = stack.pop(); out.push(c); stack.push(...(children.get(c) ?? [])); }
  return out;
}

/** 起源を1つ指定する（0=共通の祖）。自分自身・自分の子孫を親にはできない（輪になるため） */
export function planSetOrigin(map, kind, id, parentId) {
  if (kind !== "culture" && kind !== "religion") throw new Error("起源を持つのは文化と宗教だけです");
  const list = map.pack[ENTITY_LIST[kind]];
  const e = list[id];
  if (!isLive(e)) throw new Error("その対象は存在しません");
  if (parentId !== 0 && !isLive(list[parentId])) throw new Error("起源に指定した対象が存在しません");
  if (parentId === id) throw new Error("自分自身を起源にはできません");
  if (descendantsOf(map, kind, id).includes(parentId)) throw new Error("自分の子孫を起源にはできません（系統が輪になります）");
  if (parentOf(e) === parentId && Array.isArray(e.origins) && e.origins.length === 1) return null;
  return makeCommand(`${KIND_LABEL[kind]}の起源を変更（${e.name}）`, ["politics"], [setProps(e, { origins: [parentId] })]);
}

// ---------- 都市 ----------
/** patch: { group, type, population, citadel, walls, plaza, temple, shanty }。変化が無ければ null */
export function planSetBurgProfile(map, burgId, patch) {
  const b = map.pack.burgs[burgId];
  if (!b || b.removed || !b.i) throw new Error("存在しない都市です");
  const next = {}, parts = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === "group") {
      if (!ids(BURG_GROUPS).includes(v)) throw new Error(`未知の都市の区分です: ${v}`);
      if (b.capital && v !== "capital") throw new Error("首都の区分は変えられません（先に別の首都を指定してください）");
      if (!b.capital && v === "capital") throw new Error("「首都」にするには、国の首都として指定してください");
      next.group = v;
    } else if (k === "type") {
      if (!ids(CULTURE_TYPES).includes(v)) throw new Error(`未知の種類です: ${v}`);
      next.type = v;
    } else if (BURG_FEATURES.some((f) => f.id === k)) next[k] = v ? 1 : 0;
    else if (k === "population") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error("人口は 0 以上の数で指定してください");
      next.population = round6(n);
    } else throw new Error(`都市では「${k}」を変更できません`);
  }
  const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => (b[k] ?? (BURG_FEATURES.some((f) => f.id === k) ? 0 : undefined)) !== v));
  if (!Object.keys(changed).length) return null;
  parts.push(setProps(b, changed));
  if ("population" in changed) {
    const delta = changed.population - (b.population ?? 0);
    // 国・属州・宗教の都市人口は、都市人口の合計と一致している決まり（paint.js と同じ）
    const bump = (e) => { if (e && typeof e.urban === "number") parts.push(setProps(e, { urban: Math.max(0, round6(e.urban + delta)) })); };
    bump(map.pack.states[b.state]);
    bump(map.pack.provinces[map.pack.cells.province[b.cell]]);
    bump(map.pack.religions[map.pack.cells.religion[b.cell]]);
  }
  return makeCommand(`都市の設定を変更（${b.name}）`, ["places"], parts);
}
