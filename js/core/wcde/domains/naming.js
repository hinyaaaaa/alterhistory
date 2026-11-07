// v6.2.0: 史実らしい命名。国号（語根＋政体の称号）・君主名（〇〇1世）・王朝（第n王朝）・戦争名・戦場名（地形つき）。
//   乱数は呼び出し側から決定的に作る（ctx.rng を消費しない）。名前の「語根」は言語の音から作り（language.js）、ここでは形を整える。
import { hashSeed, rngOf } from "../../civ/civ-state.js";

const KN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
/** 1〜99 の漢数字 */
export const kanjiNum = (n) => (n < 10 ? KN[n] : n < 20 ? "十" + KN[n % 10] : n < 100 ? KN[Math.floor(n / 10)] + "十" + KN[n % 10] : String(n));

// ---- 国号 ----
const FORMS = ["部族連合", "教団国", "市国", "首長国", "共和国", "神聖国", "王国", "帝国", "連合", "同盟", "部族", "国"]; // 長いものから
/** 政体（と成立の経路）に合う称号 */
export function stateForm(polity, via = null) {
  switch (polity) {
    case "kingdom": return "王国";
    case "empire": return "帝国";
    case "republic": return "共和国";
    case "theocracy": return "神聖国";
    case "chiefdom": return via === "city_state" ? "市国" : "首長国";
    default: return via === "nomad_confederation" ? "部族連合" : via === "agri_union" ? "連合" : via === "defense_league" ? "同盟" : "部族";
  }
}
/** 国号から称号を除いた語根（建国時に st.nameBase に残す。古いデータは称号を剥がして求める） */
export function baseOfState(st) {
  if (st.nameBase) return st.nameBase;
  const n = String(st.name ?? ""); for (const f of FORMS) if (n.length > f.length && n.endsWith(f)) return n.slice(0, -f.length);
  return n;
}
export const composeStateName = (base, polity, via) => base + stateForm(polity, via);
/** 政体が変わったときの国号の改称。変わらなければ null */
export function retitle(st, polity) {
  if (!st.nameBase && !FORMS.some((f) => String(st.name).endsWith(f))) return null; // 創造主が付けた名前など、称号のない名前は改めない
  const base = baseOfState(st), next = composeStateName(base, polity, st.via); return next !== st.name ? { base, name: next } : null;
}

// ---- 君主名（〇〇1世） ----
const REGNAL = new Set(["chiefdom", "kingdom", "empire", "theocracy"]);
const stripOrd = (n) => String(n).replace(/[0-9０-９]+世$/, "");
export const baseOfLeader = stripOrd;
/** 君主の名。世襲の政体では「語根＋世数」。祖先の名を継ぐことがある（同じ国で同じ語根を使うと 2世・3世と数える） */
export function leaderName(st, fresh, rnd) {
  const raw = stripOrd(fresh); if (!REGNAL.has(st.polity)) return raw;
  const reg = (st.regnal ??= {}), keys = Object.keys(reg);
  const base = keys.length && rnd() < 0.4 ? keys[Math.floor(rnd() * keys.length)] : raw;
  reg[base] = (reg[base] ?? 0) + 1; return `${base}${reg[base]}世`;
}
export const leaderRng = (civ, st, ...p) => rngOf(hashSeed(civ.historySeed, "leader", st.id, civ.monthIndex, ...p));

// ---- 王朝 ----
const DYN = { kingdom: "王朝", empire: "王朝", chiefdom: "首長家", theocracy: "教統", republic: "政権" };
/** 国ごとの通し番号の王朝名（第2王朝）。n は 1 から */
/** 部族は氏族（〇〇氏）、それ以外は第n王朝・第n政権。founder は創始者の名 */
export const dynastyName = (polity, n, founder = "") => (polity === "tribal" ? `${stripOrd(founder)}氏` : `第${kanjiNum(n)}${DYN[polity] ?? "政権"}`);

// ---- 戦争名 ----
/** 同じ組の戦争が 100 年以内に続くと「第二次〇〇戦争」 */
export function warNameFor(ctx, w, placeOf) {
  const { civ } = ctx, A = civ.states[w.aggressor], D = civ.states[w.defender]; if (!A || !D) return null;
  const a = baseOfState(A), d = baseOfState(D), r = rngOf(hashSeed(civ.historySeed, "warname", w.id));
  const pats = [`${a}・${d}戦争`, `${d}征討戦争`, `${d}戦争`];
  const p = placeOf?.(); if (p) pats.push(`${p}戦争`);
  const base = pats[Math.floor(r() * pats.length)];
  const n = Object.values(civ.wars).filter((x) => x.id !== w.id && x.name && x.startedAt >= w.startedAt - 1200 && ((x.aggressor === w.aggressor && x.defender === w.defender) || (x.aggressor === w.defender && x.defender === w.aggressor))).length;
  let name = n ? `第${kanjiNum(n + 1)}次${base}` : base, k = n; while (Object.values(civ.wars).some((x) => x.id !== w.id && x.name === name)) name = `第${kanjiNum(++k + 1)}次${base}`;
  return name;
}

// ---- 戦場名 ----
/** 地形から土地の呼び名を添える。同じ土地でも、川・峠・平原・湾など別の呼び方で区別する */
export function siteDescriptors(f) {
  const out = []; if (f.river) out.push("河畔", "渡河"); if (f.mountain) out.push("峠", "山麓"); if (f.coast) out.push("湾", "海岸");
  if (f.forest) out.push("森"); if (f.wet) out.push("沼沢"); if (f.dry) out.push("荒野"); if (f.plain) out.push("平原", "野");
  return out.length ? out : ["野"];
}
