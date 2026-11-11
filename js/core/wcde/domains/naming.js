// v6.2.0: 史実らしい命名。国号（語根＋政体の称号）・君主名（〇〇1世）・王朝（第n王朝）・戦争名・戦場名（地形つき）。
//   乱数は呼び出し側から決定的に作る（ctx.rng を消費しない）。名前の「語根」は言語の音から作り（language.js）、ここでは形を整える。
import { hashSeed, rngOf } from "../../civ/civ-state.js";

const KN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
/** 1〜99 の漢数字 */
export const kanjiNum = (n) => (n < 10 ? KN[n] : n < 20 ? "十" + KN[n % 10] : n < 100 ? KN[Math.floor(n / 10)] + "十" + KN[n % 10] : String(n));

// ---- 国号 ----
// v6.7.0: 史実の国号のように。〇〇王国・〇〇帝国・〇〇共和国・〇〇連邦・〇〇公国・〇〇朝・〇〇汗国・〇〇教国など。「市国」「部族」は使わない。
//   同じ語根・同じ政体からは、いつも同じ称号になる（語根から決まる。改称しても揺れない）。
const FORMS = ["連邦共和国", "神聖王国", "連合王国", "部族連合", "共和国", "教団国", "神聖国", "首長国", "連邦", "連合", "同盟", "連盟", "帝国", "王国", "公国", "侯国", "汗国", "教国", "部族", "市国", "朝", "国"]; // 長いものから（古い保存の称号も剥がせるように残す）
const byBase = (base, arr) => arr[hashSeed(String(base), "form") % arr.length];
/** 時代の区切り（v6.11.0）。年 0 は紀元前 3100 年ごろ（エジプト第一王朝の頃）。初期の国は王国・首長国・同盟で、共和国・連邦・汗国は、それが史実で現れる時代から */
export const NAME_ERA = Object.freeze({ republicFrom: 2300, federationFrom: 4300, khanateFrom: 2900, leagueFrom: 1500 });
/** 政体（と成立の経路）に合う称号。base は国号の語根（称号を選ぶ手がかり）。year は世界の年（省略すると現代の称号。古い時代は下の置き換えが入る） */
export function stateForm(polity, via = null, base = "", year = null) {
  const f = rawForm(polity, via, base);
  if (year == null) return f;
  if (year < NAME_ERA.leagueFrom && /連邦|連合|同盟|連盟|共和国|教団国|汗国/.test(f)) return polity === "republic" || polity === "federation" || via === "defense_league" ? "同盟" : byBase(base, ["王国", "首長国"]); // 紀元前 1600 年より前: 都市の同盟か、王国・首長国
  if (year < NAME_ERA.republicFrom && f === "共和国") return "同盟";
  if (year < NAME_ERA.federationFrom && (f === "連邦" || f === "連邦共和国" || f === "連合王国")) return f === "連合王国" ? "王国" : "同盟";
  if (year < NAME_ERA.khanateFrom && f === "汗国") return "部族連合";
  return f;
}
function rawForm(polity, via, base) {
  switch (polity) {
    case "kingdom": return byBase(base, ["王国", "王国", "王国", "朝"]);
    case "empire": return byBase(base, ["帝国", "帝国", "帝国", "朝"]);
    case "republic": return "共和国";
    case "federation": return "連邦";
    case "theocracy": return via === "religious_polity" ? "教国" : byBase(base, ["神聖王国", "教国"]);
    case "chiefdom": return via === "city_state" ? byBase(base, ["公国", "王国"]) : byBase(base, ["公国", "侯国", "王国"]);
    default: return via === "nomad_confederation" ? "汗国" : via === "agri_union" ? byBase(base, ["王国", "連邦"]) : via === "defense_league" ? "連盟" : byBase(base, ["王国", "公国"]);
  }
}
/** 国号から称号を除いた語根（建国時に st.nameBase に残す。古いデータは称号を剥がして求める） */
export function baseOfState(st) {
  if (st.nameBase) return st.nameBase;
  const n = String(st.name ?? ""); for (const f of FORMS) if (n.length > f.length && n.endsWith(f)) return n.slice(0, -f.length);
  return n;
}
export const composeStateName = (base, polity, via, year = null) => base + stateForm(polity, via, base, year);
/** 政体が変わったときの国号の改称。変わらなければ null */
export function retitle(st, polity, year = null) {
  if (!st.nameBase && !FORMS.some((f) => String(st.name).endsWith(f))) return null; // 創造主が付けた名前など、称号のない名前は改めない
  const base = baseOfState(st), next = composeStateName(base, polity, st.via, year); return next !== st.name ? (year == null ? { base, name: next } : { base, name: next, year }) : null;
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

// ---- 宗教・文化の名 ----
/** 宗教の名から「〇〇教」までを取り出す（分派の名は「〇〇教〇〇派」。分派がさらに分かれても、元の教の名に付ける） */
export function religionRoot(name) { const n = String(name ?? ""), i = n.indexOf("教"); return i >= 0 ? n.slice(0, i + 1) : n; }
export const sectName = (parentName, sect) => `${religionRoot(parentName)}${sect}派`;
