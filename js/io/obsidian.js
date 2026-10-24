// V5-M9: Obsidian 用 Markdown 書き出し（ZIP）。世界・文明史を、1ファイル=1実体のノートと、時系列の詳細ログ・関係グラフ・地図画像にして出力する。
//   ・出力先は <世界名>/ フォルダの内側だけ（パスの検査あり）。再出力は同じパスのファイルを上書きし、無関係なファイルには触れない。manifest.json に全ファイルの SHA-256 を残す。
//   ・リンクは [[フォルダ/名前__ID|表示名]]（vault のルートまたはその親のどちらから開いても解決する）。ID をファイル名に含めるので、改名しても衝突しない。
//   ・既定の出力は全件（全イベント・全AI判断を個別ノート）。範囲を絞るときは options で明示し、README と manifest に絞った範囲が残る。
//   ・「思想」のように、データを持たないカテゴリはフォルダを作らない（README に書く）。
import { zipFiles } from "./zip.js";
import { encodePng } from "./png.js";
import { graphIndex, getEvent, consequencesOf, evMonth } from "../core/civ/graph.js";
import { expandDecision } from "../core/civ/ai.js";
import { stateAt, statesAt, groupsAt, ownerMapAt, compositionAt } from "../core/civ/history.js";
import { TECHS } from "../core/civ/tech.js";
import { SPECIES } from "../core/civ/species.js";
import { ABILITIES, INSTITUTIONS } from "../core/civ/magic.js";
import { KIND_JA as DISASTER_JA } from "../core/civ/disaster.js";
import { STANCE } from "../core/civ/interpret.js";
import { territoryOf } from "../core/civ/population.js";
import { LAND_WATER } from "../core/civ/world-consts.js";

export const OBSIDIAN_VERSION = 1;
export const FOLDERS = Object.freeze({ state: "国家", person: "人物", war: "戦争", battle: "戦闘", treaty: "条約", event: "出来事", decision: "AI判断", settlement: "都市・集落", group: "集団", region: "地域", culture: "文化", language: "言語", religion: "宗教", tech: "技術", species: "種族", ability: "魔法/能力", org: "魔法/組織", disaster: "災害", interp: "歴史認識", work: "表現物", chronicle: "年代記", graph: "関係グラフ", logState: "詳細ログ/国家月次状態", logAi: "詳細ログ/AI判断", map: "地図" });
const mi2s = (mi) => `${Math.floor(mi / 12)}年${((mi % 12) + 12) % 12 + 1}月`, d2s = (d) => `${d.year}年${d.month}月`, d2mi = (d) => d.year * 12 + d.month - 1;
const safe = (s) => String(s ?? "").replace(/[\\/:*?"<>|#^\[\]\n\r\t]/g, "_").replace(/\.{2,}/g, "_").replace(/^\.+/, "_").replace(/\s+/g, " ").trim().slice(0, 48) || "無題";
const q = (s) => JSON.stringify(String(s));
const yamlVal = (v) => (v == null ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : Array.isArray(v) ? `[${v.map(yamlVal).join(", ")}]` : typeof v === "object" ? JSON.stringify(v) : q(v));
const fm = (o) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${yamlVal(v)}`).join("\n")}\n---\n`;
const table = (head, rows) => rows.length ? `| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.map((x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`).join("\n")}\n` : "（なし）\n";
const r1 = (x) => Math.round(x * 10) / 10, r3 = (x) => Math.round(x * 1000) / 1000;
const colorOf = (id) => { let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); const hue = ((h >>> 0) % 360), s = 0.55 + (((h >>> 9) % 30) / 100), l = 0.5 + (((h >>> 17) % 20) / 100); const f = (n) => { const k = (n + hue / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };

/** 全ノートの置き場所（ID → パス）。リンクの解決に使う */
export function planPaths(world, civ, opts = {}) {
  const P = new Map(), add = (id, folder, name) => P.set(id, `${folder}/${safe(name)}__${id}`);
  for (const s of Object.values(civ.states)) add(s.id, FOLDERS.state, s.name);
  for (const p of Object.values(civ.persons)) add(p.id, FOLDERS.person, p.name);
  for (const w of Object.values(civ.wars)) add(w.id, FOLDERS.war, `${civ.states[w.aggressor]?.name ?? "?"}対${civ.states[w.defender]?.name ?? "?"}の戦争`);
  for (const t of Object.values(civ.treaties)) add(t.id, FOLDERS.treaty, `${civ.states[t.a]?.name ?? "?"}と${civ.states[t.b]?.name ?? "?"}の${TREATY_JA[t.type] ?? t.type}`);
  const lo = opts.fromMonth ?? -Infinity, hi = opts.toMonth ?? Infinity; // 範囲外のイベント・判断はノートを作らない（リンクも張らない。linkOf 参照）
  for (const e of civ.events) { const m = evMonth(e); if (m >= lo && m <= hi) add(e.eventId, e.kind === "battle_fought" ? FOLDERS.battle : FOLDERS.event, e.title); }
  if (opts.decisionNotes !== false) for (const d of civ.decisions) { const m = d2mi(d.date); if (m >= lo && m <= hi) add(d.decisionId, FOLDERS.decision, `${civ.states[d.actorId]?.name ?? d.actorId}の判断`); }
  for (const s of Object.values(civ.settlements)) add(s.id, FOLDERS.settlement, `集落 ${STAGE_JA[s.stage] ?? s.stage}`);
  for (const g of Object.values(civ.groups)) add(g.id, FOLDERS.group, `集団 ${g.subsistence}`);
  for (const c of Object.values(civ.cultures)) add(c.id, FOLDERS.culture, c.name);
  for (const l of Object.values(civ.languages)) add(l.id, FOLDERS.language, l.name);
  for (const r of Object.values(civ.religions)) add(r.id, FOLDERS.religion, r.name);
  for (const t of TECHS) P.set(`tech:${t.key}`, `${FOLDERS.tech}/${safe(t.name)}__${t.key}`);
  for (const s of Object.keys(civ.species)) P.set(s, `${FOLDERS.species}/${safe(SPECIES[s]?.ja ?? s)}__${s}`);
  for (const a of Object.values(ABILITIES)) P.set(`ability:${a.id}`, `${FOLDERS.ability}/${safe(a.ja)}__${a.id}`);
  for (const o of Object.values(civ.magic.orgs)) add(o.id, FOLDERS.org, o.name);
  for (const d of Object.values(civ.disasters)) add(d.id, FOLDERS.disaster, `${DISASTER_JA[d.kind]}（${mi2s(d.startedAt)}）`);
  for (const x of civ.interpretations) add(x.interpId, FOLDERS.interp, `${civ.states[x.ownerId]?.name ?? "?"}の認識 ${STANCE[x.stance] ?? x.stance}`);
  for (const w of civ.works) add(w.workId, FOLDERS.work, `${civ.states[w.authorId]?.name ?? "?"}の年代記`);
  for (const c of regionsOf(world)) P.set(`region:${c.id}`, `${FOLDERS.region}/${safe(c.name)}__region_${c.id}`);
  return P;
}
const TREATY_JA = { nonaggression: "不可侵条約", alliance: "同盟", trade: "通商条約", defense: "防衛協定", vassal: "従属関係", tribute: "朝貢" }, STAGE_JA = { camp: "野営地", village: "村", town: "町", city: "都市", metropolis: "大都市" };
const OUTCOME_JA = { aggressor_victory: "攻撃側の勝利", defender_victory: "防衛側の勝利", negotiated: "講和", stalemate: "膠着" };
const POLITY_JA = { tribal: "部族", chiefdom: "首長制", kingdom: "王国", empire: "帝国", republic: "共和制", theocracy: "神権制", city_state: "都市国家" };
function regionsOf(world) { const c = world.cell, n = c.continent.length, m = new Map(); for (let i = 0; i < n; i++) { if (c.landWater[i] !== LAND_WATER.LAND) continue; const k = c.continent[i]; let r = m.get(k); if (!r) m.set(k, (r = { id: k, cells: 0, area: 0, sumLat: 0, sumLon: 0 })); r.cells++; r.area += c.areaKm2[i]; r.sumLat += c.lat[i]; r.sumLon += c.lon[i]; } return [...m.values()].sort((a, b) => b.area - a.area).map((r, i) => ({ ...r, name: `大陸${i + 1}`, order: i })); }

/** 全ファイルを順に生成する（生成と同時に ZIP へ流せる）。opts: { decisionNotes: true, fromMonth, toMonth（イベント・判断の範囲）, maps: true, cellRaster（地図画像に必要。無ければ地図は出さない） } */
export async function* obsidianFiles(world, civ, worldName, opts = {}) {
  const root = safe(worldName || "世界"), P = planPaths(world, civ, opts), ix = graphIndex(civ), stats = { files: 0, unresolved: 0, outOfScope: 0, missing: [] }, counts = {};
  const from = opts.fromMonth ?? -Infinity, to = opts.toMonth ?? Infinity, inRange = (mi) => mi >= from && mi <= to, scoped = Number.isFinite(from) || Number.isFinite(to) || opts.decisionNotes === false;
  const link = (id, label) => { if (id === "world") return "世界全体"; const p = P.get(id); if (!p && scoped && /^(event|decision)_/.test(String(id))) { stats.outOfScope++; return String(label ?? id).replace(/[\]|\u0001\u0002]/g, " "); } /* 範囲外は、リンクにせず名前だけ */ if (!p) { stats.unresolved++; if (stats.missing.length < 10) stats.missing.push(String(id)); return label ?? String(id); } return `\u0001${p}|${String(label ?? id).replace(/[\]|\u0001\u0002]/g, " ")}\u0002`; }; // 自前のリンクは目印（\u0001 \u0002）で作り、出力時に [[ ]] へ。名前に含まれる [[ ]] は全角にして、偽のリンクを作らせない
  const nameOf = (id) => civ.states[id]?.name ?? civ.persons[id]?.name ?? civ.cultures[id]?.name ?? civ.languages[id]?.name ?? civ.religions[id]?.name ?? civ.magic.orgs[id]?.name ?? id;
  const L = (id) => link(id, nameOf(id)), cellLoc = (c) => (c == null ? "不明" : `セル ${c}（緯度 ${r1((world.cell.lat[c] * 180) / Math.PI)}°・経度 ${r1((world.cell.lon[c] * 180) / Math.PI)}°）`);
  const fin = (c) => c.replace(/\[\[/g, "［［").replace(/\]\]/g, "］］").replace(/\u0001/g, "[[").replace(/\u0002/g, "]]");
  const out = (kind, path, content) => { counts[kind] = (counts[kind] ?? 0) + 1; stats.files++; return { path: `${root}/${path}.md`, data: fin(content), kind }; };
  const outRaw = (kind, path, data) => { counts[kind] = (counts[kind] ?? 0) + 1; stats.files++; return { path: `${root}/${path}`, data, kind }; };

  // ---- 国家 ----
  for (const s of Object.values(civ.states)) {
    const evs = (ix.byEntity.get(s.id) ?? []).map((i) => civ.events[i]).filter((e) => inRange(evMonth(e))), wars = Object.values(civ.wars).filter((w) => w.sides.a.includes(s.id) || w.sides.d.includes(s.id)), trs = Object.values(civ.treaties).filter((t) => t.a === s.id || t.b === s.id);
    const cap = civ.groups[s.capitalGroupId], comp = s.alive ? compositionAt(civ, s.id, civ.monthIndex) : null;
    yield out("state", P.get(s.id), fm({ id: s.id, type: "国家", name: s.name, 成立: mi2s(s.formedAt), 滅亡: s.alive ? null : mi2s(s.dissolvedAt), 存続中: s.alive, 成立経路: s.via, 政体: POLITY_JA[s.polity] ?? s.polity, プレイヤー国家: !!s.player, 前身: s.predecessor ?? null, tags: ["国家"] }) +
      `# ${s.name}\n\n- 成立: ${mi2s(s.formedAt)}（${s.via}）${s.predecessor ? `／前身: ${L(s.predecessor)}` : ""}\n- ${s.alive ? "存続中" : `滅亡: ${mi2s(s.dissolvedAt)}`}\n- 政体: ${POLITY_JA[s.polity] ?? s.polity}／指導者: ${s.leader.name}（${s.leader.heir ? "後継者あり" : "後継者未定"}）\n- 首都（集団）: ${cap ? link(cap.id, "首都の集団") : "なし"}\n- 人口 ${Math.round(s.pop)}・財政 ${r1(s.treasury)}・安定度 ${r3(s.stability)}・兵力 ${Math.round(s.army)}・集落 ${s.settlements}\n- 方針: ${s.strategy?.goal ?? "—"}\n- 政策: 税 ${s.policy.tax}・動員 ${s.policy.mobilization}・同化 ${s.policy.assimilation}・寛容 ${s.policy.tolerance}・自治 ${s.policy.autonomy}\n${s.magic ? `- 魔法制度: ${INSTITUTIONS[s.magic.kind].ja}（国力 ${s.magic.power}）${s.magic.orgId ? `／${L(s.magic.orgId)}` : ""}\n` : ""}${s.resilience ? `- 備蓄・治水: ${s.resilience}\n` : ""}\n## 採用した技術\n${Object.entries(s.techAdopted).map(([k, mi]) => `- ${link(`tech:${k}`, TECHS.find((t) => t.key === k)?.name ?? k)}（${mi2s(mi)}）`).join("\n") || "（なし）"}\n\n## 関係\n${table(["相手", "関係値"], Object.entries(s.relations).map(([k, v]) => [L(k), v]))}\n## 戦争\n${wars.map((w) => `- ${link(w.id, `${nameOf(w.aggressor)}対${nameOf(w.defender)}`)}（${mi2s(w.startedAt)}）`).join("\n") || "（なし）"}\n\n## 条約\n${trs.slice(0, 200).map((t) => `- ${link(t.id, TREATY_JA[t.type] ?? t.type)}（${nameOf(t.a === s.id ? t.b : t.a)}・${mi2s(t.signedAt)}）`).join("\n") || "（なし）"}\n\n## 人口構成（${mi2s(civ.monthIndex)}）\n${comp ? `文化: ${Object.entries(comp.culture).map(([k, v]) => `${link(k, nameOf(k))} ${Math.round(v)}`).join("、")}\n\n種族: ${Object.entries(comp.species).map(([k, v]) => `${link(k, SPECIES[k]?.ja ?? k)} ${Math.round(v)}`).join("、")}\n` : "（滅亡）\n"}\n## 出来事（新しい順に最大200件）\n${evs.slice(-200).reverse().map((e) => `- ${d2s(e.date)} ${link(e.eventId, e.title)}`).join("\n") || "（なし）"}\n\n## 歴史認識\n${civ.interpretations.filter((x) => x.ownerId === s.id).slice(-30).map((x) => `- ${link(x.interpId, STANCE[x.stance] ?? x.stance)}（${mi2s(x.since)}${x.until != null ? `〜${mi2s(x.until)}` : ""}）`).join("\n") || "（なし）"}\n\n詳細ログ: ${(logFiles(civ, s)).map((f) => `\u0001${f.p}|${f.label}\u0002`).join("、")}\n`);
  }
  // ---- 人物・魔法 ----
  for (const p of Object.values(civ.persons)) yield out("person", P.get(p.id), fm({ id: p.id, type: "人物", name: p.name, 種族: p.speciesId, 能力: p.ability, 強度: p.power, 出現: mi2s(p.emergedAt), 没: p.diedAt == null ? null : mi2s(p.diedAt), tags: ["人物", "魔法"] }) + `# ${p.name}\n\n- 種族: ${link(p.speciesId, SPECIES[p.speciesId]?.ja ?? p.speciesId)}\n- 能力: ${link(`ability:${p.ability}`, ABILITIES[p.ability].ja)}（強度 ${p.power}）\n- 集団: ${civ.groups[p.groupId] ? link(p.groupId, "所属集団") : "（消滅）"}\n- 組織: ${p.orgId ? L(p.orgId) : "なし"}\n- ${p.diedAt == null ? "存命" : `没: ${mi2s(p.diedAt)}`}\n\n## 関わった出来事\n${(ix.byEntity.get(p.id) ?? []).map((i) => civ.events[i]).slice(0, 50).map((e) => `- ${link(e.eventId, e.title)}`).join("\n") || "（なし）"}\n`);
  for (const a of Object.values(ABILITIES)) yield out("ability", P.get(`ability:${a.id}`), fm({ id: a.id, type: "魔法の能力", name: a.ja, tags: ["魔法"] }) + `# ${a.ja}\n\n- 代償: ${a.cost}\n- 暴発の危険: ${a.risk}\n- 素質者: ${Object.values(civ.persons).filter((p) => p.ability === a.id).slice(0, 100).map((p) => L(p.id)).join("、") || "（なし）"}\n`);
  for (const o of Object.values(civ.magic.orgs)) yield out("org", P.get(o.id), fm({ id: o.id, type: "魔法組織", name: o.name, 結成: mi2s(o.foundedAt), 解散: o.endedAt == null ? null : mi2s(o.endedAt), tags: ["魔法", "組織"] }) + `# ${o.name}\n\n- 種別: ${o.kind}\n- 国家: ${L(o.stateId)}\n- 成員: ${o.members.map((m) => L(m)).join("、") || "（なし）"}\n`);
  for (const [k, sp] of Object.entries(civ.species)) yield out("species", P.get(k), fm({ id: k, type: "種族", name: sp.name, tags: ["種族"] }) + `# ${sp.name}\n\n${SPECIES[k] ? `- 寿命 ${Math.round(SPECIES[k].lifespan / 12)}年／成長 ×${SPECIES[k].growth}／技術 ×${SPECIES[k].techRate}／軍事 ×${SPECIES[k].martial}／魔法素質 ×${r1(SPECIES[k].magic / 0.002)}\n` : ""}- 集団: ${Object.values(civ.groups).filter((g) => g.speciesId === k).length}\n`);
  // ---- 戦争・条約 ----
  for (const w of Object.values(civ.wars)) yield out("war", P.get(w.id), fm({ id: w.id, type: "戦争", 開戦: mi2s(w.startedAt), 終結: w.endedAt == null ? null : mi2s(w.endedAt), 結果: OUTCOME_JA[w.outcome] ?? w.outcome ?? null, tags: ["戦争"] }) + `# ${nameOf(w.aggressor)}対${nameOf(w.defender)}の戦争\n\n- 攻撃側: ${w.sides.a.map(L).join("、")}\n- 防衛側: ${w.sides.d.map(L).join("、")}\n- 理由: ${w.reason}\n- 開戦: ${mi2s(w.startedAt)}／${w.endedAt == null ? "継続中" : `終結: ${mi2s(w.endedAt)}（${OUTCOME_JA[w.outcome] ?? w.outcome}）`}\n- 戦況点 ${r1(w.score)}・損耗 ${Math.round(w.casualties)}\n- 宣戦: ${w.declaredEvent ? link(w.declaredEvent, "宣戦のイベント") : "—"}\n- 占領された集団: ${w.occupied.map((g) => (civ.groups[g] ? link(g, "集団") : g)).join("、") || "なし"}\n\n## 経過\n${(ix.byEntity.get(w.id) ?? []).map((i) => civ.events[i]).map((e) => `- ${d2s(e.date)} ${link(e.eventId, e.title)}`).join("\n")}\n`);
  for (const t of Object.values(civ.treaties)) yield out("treaty", P.get(t.id), fm({ id: t.id, type: "条約", 種別: TREATY_JA[t.type] ?? t.type, 締結: mi2s(t.signedAt), 終了: t.endedAt == null ? null : mi2s(t.endedAt), tags: ["条約"] }) + `# ${nameOf(t.a)}と${nameOf(t.b)}の${TREATY_JA[t.type] ?? t.type}\n\n- 当事国: ${L(t.a)}、${L(t.b)}\n- 締結: ${mi2s(t.signedAt)}／${t.active ? `期限: ${mi2s(t.expiresAt)}` : `終了: ${mi2s(t.endedAt)}`}\n`);
  // ---- イベント（1件1ノート）・戦闘 ----
  for (const e of civ.events) {
    const m = evMonth(e); if (!inRange(m)) continue; const cons = consequencesOf(civ, e.eventId);
    yield out(e.kind === "battle_fought" ? "battle" : "event", P.get(e.eventId), fm({ id: e.eventId, type: e.kind === "battle_fought" ? "戦闘" : "出来事", kind: e.kind, 日付: d2s(e.date), 発生源: e.provenance ?? "world", 判断: e.decisionId ?? null, tags: ["出来事", e.kind] }) +
      `# ${e.title}\n\n- 日付: ${d2s(e.date)}／種類: ${e.kind}／場所: ${cellLoc(e.location?.cell)}\n- 関与: ${e.participants.map((p) => `${p.role}: ${L(p.entityId)}`).join("、") || "なし"}\n${e.decisionId ? `- 国家AI・命令の判断: ${link(e.decisionId, "判断記録")}\n` : ""}\n## 原因\n${e.causes.map((c) => `- ${c.relation}（${c.basis}${c.userEdited ? "・手動編集" : ""}）: ${link(c.targetId, nameOf(c.targetId) !== c.targetId ? nameOf(c.targetId) : getEvent(civ, c.targetId)?.title ?? c.targetId)}`).join("\n") || "（記録された原因なし）"}\n\n## 結果（このイベントを原因に挙げたもの）\n${cons.slice(0, 100).map((c) => `- ${c.relation}（${c.basis}）: ${link(c.from, c.event?.title)}`).join("\n") || "（なし）"}\n\n## 効果\n${table(["対象", "項目", "変更前", "変更後"], e.effects.map((x) => [L(x.targetId), x.property, x.before, x.after]))}`);
  }
  // ---- AI判断（1件1ノート）----
  if (opts.decisionNotes !== false) for (const d of civ.decisions) {
    if (!inRange(d2mi(d.date))) continue; const x = expandDecision(civ, d);
    yield out("decision", P.get(d.decisionId), fm({ id: d.decisionId, type: "AI判断", 国家: d.actorId, 日付: d2s(d.date), 層: d.layer, 行動: d.chosen.key ?? null, 成否: d.result?.ok ?? null, 発生源: d.provenance, tags: ["判断", d.layer] }) +
      `# ${nameOf(d.actorId)}の判断（${d2s(d.date)}）\n\n- 国家: ${L(d.actorId)}／層: ${d.layer}／種別: ${d.type}／発生源: ${d.provenance}\n- 選択: **${d.chosen.key ?? "何もしない"}**${d.chosen.target ? `（対象 ${L(d.chosen.target)}）` : ""}${d.chosen.opt ? `（${d.chosen.opt}）` : ""}\n- 結果: ${d.result ? (d.result.ok ? "成功" : `失敗（${d.result.error}）`) : "—"}${(d.result?.eventIds ?? []).map((i) => ` ${link(i, "結果のイベント")}`).join("")}\n- 方針: ${d.strategy ?? "—"}\n\n## 観測\n${Object.entries(d.observations).map(([k, v]) => `- ${k}: ${typeof v === "number" ? r3(v) : v}`).join("\n")}\n\n## 候補\n${table(["行動", "対象", "選択肢", "得点", "資格", "理由", "要因"], x.candidates.map((c) => [c.key, c.target ? L(c.target) : "", c.opt ?? "", c.total, c.eligible ? "可" : "不可", c.reason ?? "", Object.entries(c.factors ?? {}).map(([k, v]) => `${k} ${v}`).join("、")]))}`);
  }
  // ---- 都市・集落・集団・地域 ----
  for (const s of Object.values(civ.settlements)) yield out("settlement", P.get(s.id), fm({ id: s.id, type: "集落", 段階: s.stage, 創設: mi2s(s.foundedAt), tags: ["集落"] }) + `# 集落（${STAGE_JA[s.stage] ?? s.stage}）\n\n- 集団: ${civ.groups[s.groupId] ? link(s.groupId, "集団") : "（消滅）"}\n- 場所: ${cellLoc(s.cell)}\n- 創設: ${mi2s(s.foundedAt)}／人口 ${Math.round(s.pop)}\n\n## 出来事\n${(ix.byEntity.get(s.id) ?? []).map((i) => civ.events[i]).slice(0, 50).map((e) => `- ${d2s(e.date)} ${link(e.eventId, e.title)}`).join("\n") || "（なし）"}\n`);
  for (const g of Object.values(civ.groups)) yield out("group", P.get(g.id), fm({ id: g.id, type: "人口集団", 種族: g.speciesId, 生業: g.subsistence, 国家: g.stateId ?? null, tags: ["集団"] }) + `# 集団 ${g.id}\n\n- 場所: ${cellLoc(g.cell)}／生業: ${g.subsistence}／人口 ${Math.round(g.pop)}／国家: ${g.stateId ? L(g.stateId) : "なし"}／種族: ${link(g.speciesId, SPECIES[g.speciesId]?.ja ?? g.speciesId)}\n- 由来: ${g.parent ? link(g.parent, "親の集団") : "最初から"}\n\n## 構成（コホート）\n${table(["文化", "言語", "宗教", "種族", "割合", "緊張"], g.cohorts.map((c) => [L(c.cultureId), L(c.languageId), c.religionId ? L(c.religionId) : "なし", SPECIES[c.speciesId]?.ja ?? c.speciesId, r3(c.share), r3(c.tension)]))}\n## 知っている技術\n${Object.entries(g.tech.known).map(([k, mi]) => `${link(`tech:${k}`, TECHS.find((t) => t.key === k)?.name ?? k)}（${mi2s(mi)}）`).join("、") || "（なし）"}\n`);
  for (const r of regionsOf(world)) { const inReg = Object.values(civ.groups).filter((g) => world.cell.continent[g.cell] === r.id); yield out("region", P.get(`region:${r.id}`), fm({ id: `region_${r.id}`, type: "地域", 陸地セル: r.cells, 面積km2: Math.round(r.area), tags: ["地域"] }) + `# ${r.name}\n\n- 陸地セル ${r.cells}・面積 ${Math.round(r.area).toLocaleString("en-US")} km²\n- 重心: 緯度 ${r1(((r.sumLat / r.cells) * 180) / Math.PI)}°・経度 ${r1(((r.sumLon / r.cells) * 180) / Math.PI)}°\n- 現在の集団 ${inReg.length}・人口 ${Math.round(inReg.reduce((a, g) => a + g.pop, 0))}\n- 国家: ${[...new Set(inReg.map((g) => g.stateId).filter(Boolean))].map(L).join("、") || "なし"}\n`); }
  // ---- 文化・言語・宗教・技術 ----
  for (const c of Object.values(civ.cultures)) yield out("culture", P.get(c.id), fm({ id: c.id, type: "文化", name: c.name, 起源: mi2s(c.bornAt), tags: ["文化"] }) + `# ${c.name}\n\n- 起源: ${mi2s(c.bornAt)}／${cellLoc(c.cell)}\n- 親: ${c.parent ? L(c.parent) : "なし"}\n- 子: ${Object.values(civ.cultures).filter((x) => x.parent === c.id).map((x) => L(x.id)).join("、") || "なし"}\n- 言語: ${Object.values(civ.languages).filter((l) => l.cultureId === c.id).map((l) => L(l.id)).join("、") || "なし"}\n`);
  for (const l of Object.values(civ.languages)) yield out("language", P.get(l.id), fm({ id: l.id, type: "言語", name: l.name, 起源: mi2s(l.bornAt), tags: ["言語"] }) + `# ${l.name}\n\n- 起源: ${mi2s(l.bornAt)}／文化: ${civ.cultures[l.cultureId] ? L(l.cultureId) : "—"}\n- 親: ${l.parent ? L(l.parent) : "なし"}／子: ${Object.values(civ.languages).filter((x) => x.parent === l.id).map((x) => L(x.id)).join("、") || "なし"}\n`);
  for (const r of Object.values(civ.religions)) yield out("religion", P.get(r.id), fm({ id: r.id, type: "宗教", name: r.name, 種類: r.kind, 起源: mi2s(r.bornAt), tags: ["宗教"] }) + `# ${r.name}\n\n- 種類: ${r.kind}／起源: ${mi2s(r.bornAt)}\n- 親: ${r.parent ? L(r.parent) : "なし"}／子: ${Object.values(civ.religions).filter((x) => x.parent === r.id).map((x) => L(x.id)).join("、") || "なし"}\n`);
  for (const t of TECHS) { const w = civ.techWorld[t.key]; const adopters = Object.values(civ.states).filter((s) => s.techAdopted[t.key] != null); yield out("tech", P.get(`tech:${t.key}`), fm({ id: t.key, type: "技術", name: t.name, 分野: t.field, 段階: t.tier, tags: ["技術"] }) + `# ${t.name}\n\n- 分野: ${t.field}／段階 ${t.tier}／前提: ${t.prereq.map((p) => link(`tech:${p}`, TECHS.find((x) => x.key === p)?.name ?? p)).join("、") || "なし"}\n- 世界で最初の発見: ${w?.discoveries?.[0] ? `${mi2s(w.discoveries[0].month)}（${link(w.discoveries[0].eventId, "発見のイベント")}）` : "まだ"}\n- 発見の記録 ${w?.discoveries?.length ?? 0} 件／保有する集団 ${Object.values(civ.groups).filter((g) => g.tech.known[t.key] != null).length}\n- 採用している国家: ${adopters.map((s) => L(s.id)).join("、") || "なし"}\n`); }
  // ---- 災害・歴史認識・表現物 ----
  for (const d of Object.values(civ.disasters)) yield out("disaster", P.get(d.id), fm({ id: d.id, type: "災害", 種類: DISASTER_JA[d.kind], 規模: d.severity, 開始: mi2s(d.startedAt), 終了: mi2s(d.endsAt), tags: ["災害"] }) + `# ${DISASTER_JA[d.kind]}（${mi2s(d.startedAt)}）\n\n- 規模 ${d.severity}・${cellLoc(d.center)}・期間 ${mi2s(d.startedAt)}〜${mi2s(d.endsAt)}・${d.deaths} 人が亡くなった\n- 発生: ${link(d.eventId, "災害のイベント")}\n- 影響を受けた集団: ${d.groupIds.slice(0, 30).map((g) => (civ.groups[g] ? link(g, "集団") : g)).join("、")}\n`);
  for (const x of civ.interpretations) yield out("interp", P.get(x.interpId), fm({ id: x.interpId, type: "歴史認識", 国家: x.ownerId, 立場: STANCE[x.stance] ?? x.stance, 評価: x.valence, 開始: mi2s(x.since), 終了: x.until == null ? null : mi2s(x.until), 置き換え元: x.supersedes ?? null, tags: ["歴史認識"] }) + `# ${nameOf(x.ownerId)}の認識: ${STANCE[x.stance] ?? x.stance}\n\n- 事件: ${link(x.eventId, getEvent(civ, x.eventId)?.title)}（事実のイベントは変わらない。変わるのは国家の受け止め方）\n- 評価 ${x.valence}（−1 否定〜+1 肯定）／相手: ${x.about.map(L).join("、") || "なし"}\n- ${mi2s(x.since)}〜${x.until == null ? "現在" : mi2s(x.until)}${x.supersedes ? `／前の認識: ${link(x.supersedes, "置き換え元")}` : ""}\n`);
  for (const w of civ.works) yield out("work", P.get(w.workId), fm({ id: w.workId, type: "表現物", 種類: w.kind, 著者: w.authorId, 事実との一致: w.fidelity === "faithful", tags: ["表現物"] }) + `# ${nameOf(w.authorId)}の年代記\n\n${w.text}\n\n- 対象の事件: ${link(w.targetEventId, getEvent(civ, w.targetEventId)?.title)}／立場: ${STANCE[w.stance] ?? w.stance}／${w.fidelity === "faithful" ? "事実に忠実" : "事実と異なる記述を含む"}\n\n## 事実との差\n${table(["項目", "記述", "事実"], w.claims.map((c) => [c.property, c.claimed, c.actual]))}`);
  // ---- 年代記（100年ごと）----
  const byCentury = new Map(); for (const e of civ.events) { if (!inRange(evMonth(e)) || ["tech_transferred", "demand_raised", "cohort_formed", "cohort_assimilated", "culture_contact", "settlement_stage", "settlement_founded", "state_action", "group_split", "language_diverged"].includes(e.kind)) continue; const k = Math.floor(e.date.year / 100); (byCentury.get(k) ?? byCentury.set(k, []).get(k)).push(e); }
  for (const [k, es] of [...byCentury].sort((a, b) => a[0] - b[0])) yield out("chronicle", `${FOLDERS.chronicle}/${k * 100}年代`, fm({ type: "年代記", 期間: `${k * 100}年〜${k * 100 + 99}年`, tags: ["年代記"] }) + `# ${k * 100}年代の年代記\n\n（日常的な出来事 — 技術の伝播・不満・文化の接触など — は除いた主要な事件。全件は各ノートと出来事フォルダにある）\n\n${es.map((e) => `- ${d2s(e.date)} ${link(e.eventId, e.title)}`).join("\n")}\n`);
  // ---- 詳細ログ（国家の月次状態・AI判断）----
  for (const s of Object.values(civ.states)) { for (const f of logFiles(civ, s)) { if (f.kind === "state") yield out("logState", f.path, stateLog(civ, s, f, link)); else yield out("logAi", f.path, aiLog(civ, s, f, link, d2mi)); } }
  // ---- 関係グラフ（Mermaid）----
  yield out("graph", `${FOLDERS.graph}/国家の系譜`, graphNote("国家の系譜", "前身の国家から分離・継承した関係", Object.values(civ.states).filter((s) => s.predecessor && civ.states[s.predecessor]).map((s) => [s.predecessor, s.id]), (id) => civ.states[id].name));
  yield out("graph", `${FOLDERS.graph}/文化の系統`, graphNote("文化の系統", "親の文化から分かれた関係", Object.values(civ.cultures).filter((c) => c.parent).map((c) => [c.parent, c.id]), (id) => civ.cultures[id].name));
  yield out("graph", `${FOLDERS.graph}/言語の系統`, graphNote("言語の系統", "親の言語から分かれた関係", Object.values(civ.languages).filter((c) => c.parent).map((c) => [c.parent, c.id]), (id) => civ.languages[id].name));
  yield out("graph", `${FOLDERS.graph}/宗教の系統`, graphNote("宗教の系統", "親の宗教から分かれた関係", Object.values(civ.religions).filter((c) => c.parent).map((c) => [c.parent, c.id]), (id) => civ.religions[id].name));
  yield out("graph", `${FOLDERS.graph}/戦争の関係`, graphNote("戦争の関係", "攻撃側 → 防衛側", Object.values(civ.wars).map((w) => [w.aggressor, w.defender]), (id) => civ.states[id]?.name ?? id));
  // ---- 地図（PNG）----
  if (opts.maps !== false && opts.cellRaster) for (const f of await mapImages(world, civ, opts)) yield outRaw("map", `${FOLDERS.map}/${f.name}`, f.png);
  // ---- README・manifest（最後に件数が確定してから）----
  yield out("readme", "README", readme(root, world, civ, counts, stats, opts));
  yield { path: `${root}/manifest.json`, data: JSON.stringify({ format: "alterhistory-obsidian", version: OBSIDIAN_VERSION, world: worldName, month: civ.monthIndex, date: civ.date, counts, unresolvedLinks: stats.unresolved, outOfScopeLinks: stats.outOfScope, unresolvedSamples: stats.missing, scope: { fromMonth: Number.isFinite(from) ? from : null, toMonth: Number.isFinite(to) ? to : null, decisionNotes: opts.decisionNotes !== false, maps: opts.maps !== false && !!opts.cellRaster } }, null, 1), kind: "manifest" };
}
function logFiles(civ, s) { const a = s.formedAt, b = s.alive ? civ.monthIndex : s.dissolvedAt, out = []; for (let k = Math.floor(a / 1200); k <= Math.floor(b / 1200); k++) { out.push({ kind: "state", k, path: `${FOLDERS.logState}/${safe(s.name)}__${s.id}__${k * 100}年代`, p: `${FOLDERS.logState}/${safe(s.name)}__${s.id}__${k * 100}年代`, label: `月次状態 ${k * 100}年代` }); } for (let k = Math.floor(a / 1200); k <= Math.floor(b / 1200); k++) out.push({ kind: "ai", k, path: `${FOLDERS.logAi}/${safe(s.name)}__${s.id}__${k * 100}年代`, p: `${FOLDERS.logAi}/${safe(s.name)}__${s.id}__${k * 100}年代`, label: `AI判断 ${k * 100}年代` }); return out; }
function stateLog(civ, s, f, link) {
  const lo = Math.max(s.formedAt, f.k * 1200), hi = Math.min(s.alive ? civ.monthIndex : s.dissolvedAt, f.k * 1200 + 1199), H = civ.history, e = H?.states[s.id], times = new Set([lo]); if (e) for (const k in e.f) { const a = e.f[k]; for (let i = 0; i < a.length; i += 2) if (a[i] >= lo && a[i] <= hi) times.add(a[i]); }
  const rows = [...times].sort((a, b) => a - b).map((t) => { const x = stateAt(civ, s.id, t); return x ? [mi2s(t), x.alive ? "存続" : "滅亡", POLITY_JA[x.polity] ?? x.polity, x.leader.name, Math.round(x.pop), x.treasury.toFixed(2), x.stability.toFixed(4), Math.round(x.army), x.settlements, x.groupCount, x.strategy ?? "", x.campaign ?? "", x.warIds.length, x.techAdopted.length] : null; }).filter(Boolean);
  return fm({ type: "国家の月次状態", 国家: s.id, 期間: `${mi2s(lo)}〜${mi2s(hi)}`, tags: ["詳細ログ"] }) + `# ${s.name} 月次状態（${mi2s(lo)}〜${mi2s(hi)}）\n\n状態が変わった月だけを行にする。変化のない月は、直前の行がそのまま続く（欠落ではない）。値は当時の観測値（人口・兵力は人、財政は 0.01、安定度は 0.0001 単位）。\n\n${(() => { const t = "| 月 | 存続 | 政体 | 指導者 | 人口 | 財政 | 安定度 | 兵力 | 集落 | 集団 | 方針 | 作戦 | 戦争数 | 技術数 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"; return t + rows.map((r) => `| ${r.join(" | ")} |`).join("\n") + "\n"; })()}\n${link(s.id, "← " + s.name)}\n`;
}
function aiLog(civ, s, f, link, d2mi) {
  const lo = f.k * 1200, hi = lo + 1199, ds = []; const ix = graphIndex(civ); for (const i of ix.decByActor.get(s.id) ?? []) { const d = civ.decisions[i], m = d2mi(d.date); if (m >= lo && m <= hi) ds.push(d); }
  return fm({ type: "AI判断の一覧", 国家: s.id, 件数: ds.length, tags: ["詳細ログ"] }) + `# ${s.name} AI判断（${f.k * 100}年代）\n\n| 日付 | 層 | 選択 | 成否 | ノート |\n| --- | --- | --- | --- | --- |\n${ds.map((d) => `| ${d2s(d.date)} | ${d.layer} | ${d.chosen.key ?? "何もしない"} | ${d.result ? (d.result.ok ? "成功" : `失敗 ${d.result.error ?? ""}`) : "—"} | ${link(d.decisionId, "詳細")} |`).join("\n")}\n\n${link(s.id, "← " + s.name)}\n`;
}
function graphNote(title, sub, edges, label) {
  const ids = [...new Set(edges.flat())].slice(0, 200), set = new Set(ids), n = new Map(ids.map((id, i) => [id, `n${i}`])), es = edges.filter(([a, b]) => set.has(a) && set.has(b)).slice(0, 400);
  return fm({ type: "関係グラフ", tags: ["グラフ"] }) + `# ${title}\n\n${sub}。Mermaid で描画される（ノード ${ids.length}・辺 ${es.length}${edges.length > es.length ? `。上限のため ${edges.length - es.length} 本を省略` : ""}）。\n\n\`\`\`mermaid\ngraph LR\n${ids.map((id) => `  ${n.get(id)}["${String(label(id)).replace(/"/g, "'")}"]`).join("\n")}\n${es.map(([a, b]) => `  ${n.get(a)} --> ${n.get(b)}`).join("\n")}\n\`\`\`\n`;
}
/** 地図: 地形と、現在・過去の国家領域（月次履歴から復元）。等距円筒図 1024×512 */
async function mapImages(world, civ, opts) {
  const W = 1024, H = 512, c = world.cell, cellAt = opts.cellRaster(world, W, H); // 球面世界の幾何は、呼び出し側（app/ui）が渡す（io から core/world を直接 import しない）
  const BC = [[20, 50, 110], [235, 240, 245], [160, 175, 150], [60, 105, 80], [60, 140, 70], [150, 180, 80], [225, 195, 120], [190, 180, 160], [190, 175, 80], [90, 150, 50], [20, 100, 40], [130, 120, 120], [80, 130, 120], [70, 130, 200]];
  const base = (ci) => { const b = c.biome[ci], e = c.elevation[ci]; let col = (BC[b] ?? BC[0]).slice(); if (b === 0) { const d = 0.55 + 0.45 * (1 + e / 5500); col = col.map((v) => v * d); } else if (b !== 13) { const s = 0.75 + 0.25 * Math.min(1, e / 4000); col = col.map((v) => v * s); } return col; };
  const files = [], render = async (name, ownerMap) => { const px = new Uint8Array(W * H * 4); for (let i = 0; i < W * H; i++) { const ci = cellAt[i]; let col = base(ci); const o = ownerMap?.get(ci); if (o) { const oc = colorOf(o); col = col.map((v, k) => v * 0.45 + oc[k] * 0.55); } px[4 * i] = col[0]; px[4 * i + 1] = col[1]; px[4 * i + 2] = col[2]; px[4 * i + 3] = 255; } files.push({ name, png: await encodePng(px, W, H) }); };
  await render("地形.png", null);
  if (civ.history && Object.keys(civ.history.states).length) { const mi = civ.monthIndex, marks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.floor((mi * f) / 120) * 120))].filter((x) => x <= mi && x >= 0); for (const t of marks) await render(`国家領域_${Math.floor(t / 12)}年.png`, ownerMapAt(civ, territoryOf, world, t)); }
  return files;
}
function readme(root, world, civ, counts, stats, opts) {
  const ja = { state: "国家", person: "人物（魔法の素質者）", war: "戦争", battle: "戦闘", treaty: "条約", event: "出来事", decision: "AI判断", settlement: "都市・集落", group: "人口集団", region: "地域", culture: "文化", language: "言語", religion: "宗教", tech: "技術", species: "種族", ability: "魔法の能力", org: "魔法組織", disaster: "災害", interp: "歴史認識", work: "表現物（年代記）", chronicle: "年代記（100年ごと）", logState: "詳細ログ・国家の月次状態", logAi: "詳細ログ・AI判断の一覧", graph: "関係グラフ", map: "地図" };
  return fm({ type: "README", tags: ["README"] }) + `# ${root} — AlterHistory の書き出し\n\nこのフォルダを Obsidian の vault として開いてください（親フォルダから開いても、リンクは解決します）。\n\n- 書き出した時点: ${mi2s(civ.monthIndex)}（歴史の現在）\n- 世界: ${world.spec.worldSeed}（${world.mesh.cellCount ?? world.cell.biome.length} セル）\n- リンク切れ: ${stats.unresolved} 件（0 が正常）\n\n## 中身\n${table(["フォルダ・種類", "ノート数"], Object.entries(counts).filter(([k]) => ja[k]).map(([k, n]) => [ja[k], n]))}\n## 書き出しの範囲\n- ${opts.decisionNotes === false ? "AI判断の個別ノートは出していません（一覧と詳細ログのみ）" : "全てのAI判断を個別ノートにしています"}\n- ${Number.isFinite(opts.fromMonth ?? -Infinity) || Number.isFinite(opts.toMonth ?? Infinity) ? `イベント・AI判断は ${opts.fromMonth != null ? mi2s(opts.fromMonth) : "最初"}〜${opts.toMonth != null ? mi2s(opts.toMonth) : "現在"} に絞っています` : "全期間のイベントを個別ノートにしています"}\n- 「思想」のカテゴリは、v5.0.0 の文明シミュレーションに該当するデータが無いため作っていません\n- 月次状態は『状態が変わった月』だけを行にしています（変化のない月は直前の行が続きます。欠落ではありません）\n\n## 再出力・上書き\n- 出力は \`${root}/\` の中だけです。再出力すると、同じパスのファイルは上書きされ、vault 内の無関係なファイルには触れません。\n- ノート名は \`名前__ID\` です。名前が変わると別ファイルになるため、不要になった古いノートは manifest.json と見比べて手で消してください。\n- 自分で書き足したノートは、別のフォルダに置くと上書きされません。\n`;
}
/** 書き出す前の見積もり（ファイル数）。UI が『何が出るか』を先に見せるために使う。生成はしない */
export function estimateVault(world, civ, opts = {}) {
  const from = opts.fromMonth ?? -Infinity, to = opts.toMonth ?? Infinity; let ev = 0, dc = 0; for (const e of civ.events) { const m = evMonth(e); if (m >= from && m <= to) ev++; } if (opts.decisionNotes !== false) for (const d of civ.decisions) { const m = d2mi(d.date); if (m >= from && m <= to) dc++; }
  const logs = Object.values(civ.states).reduce((a, s) => a + logFiles(civ, s).length, 0), base = Object.keys(civ.states).length + Object.keys(civ.persons).length + Object.keys(civ.wars).length + Object.keys(civ.treaties).length + Object.keys(civ.settlements).length + Object.keys(civ.groups).length + Object.keys(civ.cultures).length + Object.keys(civ.languages).length + Object.keys(civ.religions).length + TECHS.length + Object.keys(civ.species).length + Object.keys(ABILITIES).length + Object.keys(civ.magic.orgs).length + Object.keys(civ.disasters).length + civ.interpretations.length + civ.works.length + regionsOf(world).length + 10 + Math.ceil(civ.date.year / 100) + 2;
  return { events: ev, decisions: dc, logs, files: base + ev + dc + logs, maps: opts.maps !== false && !!opts.cellRaster ? 1 + 5 : 0 };
}
/** パスの検査（出力先は <root>/ の内側だけ）とリンク切れの検査 */
export function validateVault(files, root) {
  const errs = [], paths = new Set(files.map((f) => f.path)), dec = new TextDecoder(), prefix = root + "/";
  for (const f of files) { if (!f.path.startsWith(prefix) || f.path.includes("..") || f.path.startsWith("/") || f.path.includes("\\")) errs.push(`出力先の外: ${f.path}`); }
  const md = new Set([...paths].filter((p) => p.endsWith(".md")).map((p) => p.slice(prefix.length, -3)));
  for (const f of files) { if (!f.path.endsWith(".md")) continue; const s = typeof f.data === "string" ? f.data : dec.decode(f.data); for (const m of s.matchAll(/\[\[([^\]|#\\]+)(?:#[^\]|\\]*)?(?:\\?\|[^\]]*)?\]\]/g)) if (!md.has(m[1])) { errs.push(`リンク切れ: ${f.path} → ${m[1]}`); if (errs.length > 20) return errs; } }
  return errs;
}
async function sha256(bytes) { const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)); return [...h].map((b) => b.toString(16).padStart(2, "0")).join(""); }
/** ZIP にして返す。manifest.json に全ファイルの SHA-256 を追記する（manifest 自身を除く） */
export async function exportObsidianZip(world, civ, worldName, opts = {}) {
  const root = safe(worldName || "世界"), enc = new TextEncoder(), index = []; let manifest = null;
  async function* gen() { for await (const f of obsidianFiles(world, civ, worldName, opts)) { if (f.kind === "manifest") { manifest = JSON.parse(f.data); continue; } const raw = typeof f.data === "string" ? enc.encode(f.data) : f.data; index.push([f.path.slice(root.length + 1), raw.length, opts.hash === false ? null : await sha256(raw)]); yield f; } manifest.files = index; yield { path: `${root}/manifest.json`, data: JSON.stringify(manifest, null, 1) }; }
  const bytes = await zipFiles(gen(), { compress: opts.compress !== false, onProgress: opts.onProgress });
  return { bytes, root, counts: manifest.counts, files: index.length + 1, unresolvedLinks: manifest.unresolvedLinks };
}
