// v6.13.0: 地形・都市の「差し込み口」（プラグイン）。別のプログラム（地形生成・都市生成を自然にするもの）を、ここへ登録するだけで差し替えられる。
//   ・このファイルは登録簿だけを持つ（他のモジュールを import しない。循環を作らない）。
//   ・地形（terrain）: generate(spec, options) → world（全体を置き換える）／ refine(world, spec, options) → world|void（標準の生成のあとに手を入れる）。
//       どちらも、出た世界は validateWorld を通す（generate.js）。通らなければ標準の生成へ戻し、理由を world.pluginReport に残す（世界は必ずできる）。
//   ・都市（city）: initialGroups(g, spec, variant) → 初期集団の配列（置き換え）／ siteScore(world, cell, info) → 数値（集落の立地の得点。大きいほど良い）／
//       settlementCell(world, civ, group, cells, defaultCell) → セル番号（集落を置くセルを選ぶ）。どれも省略できる。null を返すと標準に任せる。
//   ・同じ設定・同じシードで、同じ世界になること（決定性）。乱数は spec.worldSeed から導く（Math.random は使わない）。
//   ・保存は設定だけで、地理は設定から再生成する。使ったプラグインは civ.wcde.plugins に id@version で記録し、読み込み時に食い違いを知らせる（generate.js）。
export const PLUGIN_API = 1;
const REG = { terrain: new Map(), city: new Map() }, ACTIVE = { terrain: null, city: null };
const KINDS = Object.freeze({ terrain: ["generate", "refine"], city: ["initialGroups", "siteScore", "settlementCell"] });
const check = (kind, p) => {
  if (!KINDS[kind]) throw new Error(`未知の種類 ${kind}（terrain か city）`);
  if (!p || typeof p.id !== "string" || !/^[a-z0-9][a-z0-9_.-]{1,40}$/.test(p.id)) throw new Error("プラグインの id は 2〜41 文字の英小文字・数字・_ . -");
  if (typeof p.version !== "string" || !p.version) throw new Error("プラグインの version（文字列）が要る");
  if (!KINDS[kind].some((k) => typeof p[k] === "function")) throw new Error(`${kind} のプラグインは ${KINDS[kind].join(" / ")} のどれかを持つ`);
  if (p.api != null && p.api !== PLUGIN_API) throw new Error(`プラグインの api は ${PLUGIN_API}（受け取った値: ${p.api}）`);
};
/** 登録する。activate: true なら、すぐ使う（既定は true） */
export function registerPlugin(kind, p, { activate = true } = {}) { check(kind, p); REG[kind].set(p.id, Object.freeze({ ...p })); if (activate) ACTIVE[kind] = p.id; return p.id; }
export const registerTerrainPlugin = (p, o) => registerPlugin("terrain", p, o);
export const registerCityPlugin = (p, o) => registerPlugin("city", p, o);
/** 使うプラグインを選ぶ（null で標準に戻す） */
export function activatePlugin(kind, id) { if (id != null && !REG[kind]?.has(id)) throw new Error(`${kind} のプラグイン ${id} は登録されていない`); ACTIVE[kind] = id ?? null; }
export const activePlugin = (kind) => (ACTIVE[kind] ? REG[kind].get(ACTIVE[kind]) ?? null : null);
export const listPlugins = () => ({ terrain: [...REG.terrain.values()].map((p) => ({ id: p.id, version: p.version, active: ACTIVE.terrain === p.id })), city: [...REG.city.values()].map((p) => ({ id: p.id, version: p.version, active: ACTIVE.city === p.id })) });
export function clearPlugins() { REG.terrain.clear(); REG.city.clear(); ACTIVE.terrain = ACTIVE.city = null; }
/** 使っているプラグインの記録（保存・読み込みの食い違いの検査用） */
export const pluginStamp = () => ({ terrain: activePlugin("terrain") ? `${ACTIVE.terrain}@${activePlugin("terrain").version}` : null, city: activePlugin("city") ? `${ACTIVE.city}@${activePlugin("city").version}` : null });
/** 保存時の記録と今の設定を比べる。食い違いの説明の配列（空なら一致） */
export function stampProblems(saved) { const now = pluginStamp(), out = []; for (const k of ["terrain", "city"]) { const a = saved?.[k] ?? null, b = now[k]; if (a !== b) out.push(`${k === "terrain" ? "地形" : "都市"}のプラグインが保存時と違う（保存: ${a ?? "標準"}／今: ${b ?? "標準"}）。地理が変わる場合があります`); } return out; }
