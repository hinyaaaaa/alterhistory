// v6.1.0 M1: 領域の台帳（WorldState の所有権表）。仕様 §2.2・§5.2・§16-M1。
//   各領域が「何を所有し（owns）・何を読み（reads）・所有はしないが書き換え（updates）・何の結果を残し（emits）・何を保つか（invariants）」を宣言する。
//   同じ事実を複数の領域が所有してはならない（owns の経路は領域をまたいで重ならない）。重なりは validateRegistry() が検出する。
//   経路の書き方: "states.*.econ" の * は任意の ID。同じ経路、または「."で区切った前方一致」なら重なりとみなす。
//   cadence: その領域の更新頻度（monthly / quarterly / yearly …）。every は月数（ticker.register の every と一致させる）。
//   phase: tick（civ/tick.js の PHASES）での位置。順序は PHASES が唯一の定義で、ここは宣言と突き合わせるために写している。
//   派生データ（derived）: 正本ではなく、再構築できる索引・キャッシュ。保存しない、または保存しても読み込み時に作り直す。
export const DOMAINS = Object.freeze([
  { id: "clock", ja: "時間・暦", owner: "civ/civ-state・wcde/calendar", phase: "clock", cadence: "monthly", every: 1, steps: ["advanceClock"], owns: ["date", "monthIndex"], reads: [], updates: [], emits: [], invariants: ["時間を進めるのは中央時計だけ", "月ごとの乱数は historySeed と月から決まる（状態を持たない）"] },
  { id: "interventions", ja: "創造主の介入（一時補正）", owner: "wcde/intervention", phase: "interventions", cadence: "monthly", every: 1, steps: ["stepInterventions"], owns: ["wcde.interventions", "wcde.adjust", "wcde.edits"], reads: ["economy", "politics", "military"], updates: ["techOverrides", "groups.*.tech", "states.*.techAdopted"], emits: [], invariants: ["補正は通常計算値とは別のレイヤー（有効値 = 通常値 + 残存補正）", "介入の台帳は歴史の事実と混ぜない"] },
  { id: "geography", ja: "地理・環境", owner: "core/world（生成）・civ/disaster", phase: "climate", cadence: "monthly", every: 1, steps: ["stepClimate", "stepDisaster"], owns: ["world.cell", "climate", "disasters"], reads: [], updates: [], emits: ["disaster_struck", "climate_shift"], invariants: ["地形は生成後に手で書き換えない（災害・気候の自然過程だけが人口・生態系へ影響する）"] },
  { id: "ecosystem", ja: "生態系", owner: "wcde/domains/ecosystem", phase: "ecosystem", cadence: "yearly", every: 12, steps: ["stepEcosystem"], owns: ["eco"], reads: ["geography", "population"], updates: [], emits: ["ecosystem_shift"], invariants: ["資源量は 0〜1 の有限な数", "個体は追わず、地域の環境容量・資源量で集約する"] },
  { id: "population", ja: "人口・移住・集落", owner: "civ/population", phase: "economy_pop", cadence: "monthly", every: 1, steps: ["stepPopulation"], owns: ["groups.*.pop", "groups.*.cell", "groups.*.subsistence", "groups.*.pressure", "groups.*.settlementId", "settlements.*.id", "settlements.*.groupId", "settlements.*.cell", "settlements.*.foundedAt", "settlements.*.pop", "settlements.*.stage"], reads: ["geography", "ecosystem", "tech"], updates: [], emits: ["settlement_founded", "group_split", "famine"], invariants: ["集団は陸にいる", "集団と集落は相互参照", "人口は負にならない"] },
  { id: "culture", ja: "文化・コホート", owner: "civ/culture・civ/cohorts", phase: "culture", cadence: "monthly", every: 1, steps: ["stepCulture", "stepCohorts"], owns: ["cultures", "groups.*.cohorts"], reads: ["population"], updates: [], emits: ["culture_split"], invariants: ["コホートの割合の合計は 1"] },
  { id: "language", ja: "言語・命名", owner: "wcde/domains/language", phase: "culture", cadence: "monthly", every: 1, steps: ["stepLanguage"], owns: ["languages"], reads: ["culture"], updates: [], emits: ["language_diverged"], invariants: ["名前の音節は、その言語の音節表に収まる", "子言語は親の音素を受け継ぐ"] },
  { id: "religion", ja: "宗教", owner: "wcde/domains/religion", phase: "culture", cadence: "monthly", every: 1, steps: ["stepReligion"], owns: ["religions"], reads: ["culture", "language"], updates: [], emits: ["religion_founded", "religion_schism"], invariants: ["創始者は分かっているときだけ（未知は null）"] },
  { id: "tech", ja: "技術", owner: "civ/tech", phase: "tech", cadence: "monthly", every: 1, steps: ["stepTech"], owns: ["techWorld", "groups.*.tech", "groups.*.knowledge", "states.*.techAdopted", "techOverrides"], reads: ["population", "geography", "economy", "politics"], updates: [], emits: ["tech_discovered", "tech_transferred", "tech_lost", "tech_rediscovered", "tech_institutionalized"], invariants: ["前提技術のない技術を保有しない（喪失は文脈に応じた劣化を伴う）", "研究点・研究キュー・研究所は存在しない", "利用条件（行動・ユニット・制度）は技術ツリーの unlocks から導く"] },
  { id: "economy", ja: "経済・産業・交易", owner: "wcde/domains/economy", phase: "economy", cadence: "quarterly", every: 3, steps: ["stepEconomy"], owns: ["states.*.econ"], reads: ["population", "tech", "war_diplomacy", "geography"], updates: ["states.*.treasury"], emits: ["trade_route_opened", "trade_cut"], invariants: ["産業力・交易は有限の数", "戦争・制裁中は交易が成立しない", "交易は隣接する国家の間で成立し、開放度は両国の交易技術（fx.trade）で決まる"] },
  { id: "politics", ja: "国内政治", owner: "wcde/domains/politics", phase: "politics", cadence: "quarterly", every: 3, steps: ["stepPolitics"], owns: ["states.*.politics"], reads: ["economy", "war_diplomacy", "religion", "tech"], updates: ["states.*.stability"], emits: ["regime_change"], invariants: ["支持・正統性は 0〜1", "政変は結果として記録される（原因の推測は残さない）"] },
  { id: "military", ja: "軍事組織", owner: "wcde/domains/military", phase: "military", cadence: "quarterly", every: 3, steps: ["stepMilitary"], owns: ["states.*.military", "states.*.milBonus", "states.*.milDef"], reads: ["economy", "tech", "politics"], updates: [], emits: ["doctrine_adopted"], invariants: ["ドクトリンの前提（技術・政体）を満たす", "攻撃の増分は上限 +25%、防御は +40%"] },
  { id: "ai", ja: "国家AI（計画と実行）", owner: "civ/ai・civ/actions・wcde/domains/actions", phase: "ai_plan", cadence: "quarterly", every: 1, steps: ["stepAIPlan", "stepAIApply"], owns: ["states.*.strategy", "states.*.campaign", "states.*.personality"], reads: ["states", "economy", "politics", "military", "tech", "war_diplomacy"], updates: [], emits: [], invariants: ["判断の理由・候補・観測・採点は保存しない（結果だけが歴史資料になる）", "プレイヤー国家は AI が動かさない", "AI とプレイヤーは同じ行動レジストリ・同じ検証を通る"] },
  { id: "war_diplomacy", ja: "戦争・外交", owner: "civ/diplomacy", phase: "conflict", cadence: "monthly", every: 1, steps: ["stepWars"], owns: ["wars", "treaties", "activeWarIds", "activeTreatyIds", "proposals", "states.*.relations", "states.*.sanctions", "states.*.warIds"], reads: ["military", "economy", "tech"], updates: [], emits: ["war_declared", "war_ended", "treaty_signed", "treaty_ended", "diplomacy_failed"], invariants: ["戦争参照は進行中のものだけ", "同じ命令検証を AI とプレイヤーが通る"] },
  { id: "states", ja: "国家", owner: "civ/states", phase: "conflict", cadence: "quarterly", every: 3, steps: ["stepStates"], owns: ["states.*.name", "states.*.polity", "states.*.alive", "states.*.pop", "states.*.leader", "states.*.capitalGroupId", "states.*.army", "states.*.policy", "states.*.stability", "states.*.treasury", "states.*.player", "groups.*.stateId"], reads: ["population", "politics", "tech"], updates: [], emits: ["state_formed", "state_dissolved", "leader_succession", "conquest"], invariants: ["担当国家は高々1つ", "首都は存在する集団に基づく"] },
  { id: "people", ja: "人物・家系", owner: "wcde/domains/people", phase: "people", cadence: "monthly", every: 1, steps: ["stepPeople"], owns: ["figures", "houses"], reads: ["states"], updates: [], emits: ["heir_named", "succession_by_heir", "dynasty_changed"], invariants: ["親は子より先に生まれ、子は親に載る", "出自は捏造しない（未知は null）"] },
  { id: "cities", ja: "都市", owner: "wcde/domains/people", phase: "people", cadence: "monthly", every: 1, steps: ["stepCities"], owns: ["settlements.*.name"], reads: ["population", "language", "economy"], updates: [], emits: [], invariants: ["付いた名前は変わらない"] },
  { id: "archive", ja: "歴史資料（結果の記録）", owner: "civ/archive", phase: "archive", cadence: "monthly", every: 1, steps: ["stageArchive"], owns: ["events", "archive", "interpretations", "works"], reads: ["states"], updates: [], emits: [], invariants: ["保存するのは起きた結果だけ（AI の判断理由・候補・観測は保存しない）", "因果リンクは直接かつ明確なものだけ", "記録の残存は recordId と historySeed から決定的に決まる", "固定間隔の完全スナップショットを持たない"] },
  { id: "integrity", ja: "整合性・診断・ニュース", owner: "wcde/integrity・wcde/clock", phase: "integrity", cadence: "monthly", every: 1, steps: ["checkIntegrity", "checkWcdeIntegrity", "syncControl"], owns: ["wcde.control", "wcde.diagnostics", "wcde.news", "wcde.time"], reads: [], updates: [], emits: [], invariants: ["構造の破損は拒否し、因果的に奇妙な状態は許容する", "ニュースは UI への投影で、歴史の正本ではない"] },
]);
export const DOMAIN = Object.freeze(Object.fromEntries(DOMAINS.map((d) => [d.id, d])));

/** 命令の入口の4経路（仕様 M1）。contract.js の dispatch / runAction / 介入 / safeAdvance に対応する。テストと文書の突き合わせ用 */
export const ENTRY_PATHS = Object.freeze([
  { id: "command_api", ja: "外部命令（Command API）", entry: "contract.dispatch", authorities: ["player_order", "creator_intervention", "administrative"], note: "UI・プレイヤー・創造主の入口。検証→取り消し点→適用→失敗時は全体を戻す。commandId で二重適用を防ぐ" },
  { id: "ai_action", ja: "AI 行動（AI action API）", entry: "civ/actions.runAction", authorities: ["ai_action"], note: "tick の ai_plan で計画し apply で共通の行動レジストリを通して実行する。判断の過程は保存しない" },
  { id: "creator_intervention", ja: "創造主の介入", entry: "wcde/intervention", authorities: ["creator_intervention"], note: "通常計算値とは別の補正レイヤー。AI・プレイヤーは呼べない" },
  { id: "monthly_tick", ja: "月次 tick のトランザクション", entry: "contract.safeAdvance", authorities: ["simulation_transition"], note: "各ドメインは tick の中で、自分が所有する正本だけを更新する。失敗した月は取り消し点まで戻して再現し、半端な状態を残さない" },
]);

const split = (p) => p.split(".");
/** 2つの所有経路が重なるか（同じ経路、または一方が他方の前方一致。* は任意の1要素） */
export function pathsOverlap(a, b) {
  const x = split(a), y = split(b), n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i] && x[i] !== "*" && y[i] !== "*") return false;
  return true;
}
/** 台帳の検査。違反を文字列の配列で返す: ID の重複・所有の重なり・存在しない領域への参照・PHASES に無い位置・steps の重複 */
export function validateRegistry(phaseKeys = null, domains = DOMAINS) {
  const errs = [], ids = new Set(), stepOwner = new Map();
  for (const d of domains) { if (ids.has(d.id)) errs.push(`領域 ID が重複: ${d.id}`); ids.add(d.id); }
  for (const d of domains) {
    for (const r of d.reads) if (!ids.has(r)) errs.push(`${d.id}.reads が存在しない領域を指している: ${r}`);
    for (const u of d.updates) if (!domains.some((o) => o.id !== d.id && o.owns.some((x) => pathsOverlap(x, u)))) errs.push(`${d.id}.updates が、他の領域の所有経路を指していない: ${u}`);
    if (phaseKeys && !phaseKeys.includes(d.phase)) errs.push(`${d.id} の phase ${d.phase} が PHASES に無い`);
    for (const s of d.steps) { if (stepOwner.has(s)) errs.push(`処理 ${s} が複数の領域に宣言されている（${stepOwner.get(s)} と ${d.id}）`); stepOwner.set(s, d.id); }
    if (!(d.every >= 1)) errs.push(`${d.id} の every が不正`);
  }
  for (let i = 0; i < domains.length; i++) for (let j = i + 1; j < domains.length; j++) for (const a of domains[i].owns) for (const b of domains[j].owns) if (pathsOverlap(a, b)) errs.push(`所有の重なり: ${domains[i].id}「${a}」と ${domains[j].id}「${b}」`);
  // updates は他の領域が所有する経路だけを指す（自分の所有を updates に書かない）
  for (const d of domains) for (const u of d.updates) if (u.includes(".") && d.owns.some((o) => pathsOverlap(o, u))) errs.push(`${d.id} が自分の所有経路を updates に書いている: ${u}`);
  return errs;
}
/** 経路の所有者（領域 ID）。無ければ null */
export function ownerOf(path, domains = DOMAINS) { for (const d of domains) for (const o of d.owns) if (pathsOverlap(o, path)) return d.id; return null; }
