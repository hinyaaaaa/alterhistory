// v6.13.0: 地形の生成の入口（プラグイン対応）。標準の generateWorld を呼び、使うプラグインがあれば適用し、検証し、通らなければ標準へ戻す。
//   世界の作成（wcde/world.js）と保存の読み込みは、この関数を通る。プラグインが無ければ generateWorld と同じ結果（決定性は変わらない）。
import { generateWorld, validateWorld, worldHash } from "./worldgen.js";
import { activePlugin, pluginStamp } from "./plugins.js";
import { pickSite, planSettlements, siteScore } from "./sites.js";

const hide = (world, key, value) => { Object.defineProperty(world, key, { value, enumerable: false, writable: true, configurable: true }); return value; }; // 保存・複製・ハッシュに入らない付属物
const note = (world, msg) => { (world.pluginReport ?? hide(world, "pluginReport", { notes: [], used: pluginStamp() })).notes.push(msg); };
/** 世界に、使うプラグインの記録（pluginReport）と都市プラグイン（cityPlugin。civ 層が foundSettlement で使う）を付ける */
const attach = (world) => { hide(world, "pluginReport", { notes: world.pluginReport?.notes ?? [], used: pluginStamp() }); hide(world, "cityPlugin", activePlugin("city") ?? null); if (!world.siteTools) hide(world, "siteTools", { pickSite, planSettlements, siteScore }); return world; };
export function generateWorldPluggable(specInput, options = {}) {
  const T = activePlugin("terrain"); if (!T) return attach(generateWorld(specInput, options));
  let world = null;
  if (typeof T.generate === "function") {
    try { world = T.generate(specInput, options); const errs = world ? validateWorld(world) : ["世界が返らない"]; if (errs.length) { const first = errs.slice(0, 3).join(" / "); world = null; options.onWarning?.(`地形プラグイン ${T.id}: 検証に失敗（${first}）。標準の生成へ戻します`); var failed = first; } } catch (e) { world = null; failed = String(e?.message ?? e); options.onWarning?.(`地形プラグイン ${T.id}: 例外（${failed}）。標準の生成へ戻します`); }
  }
  if (!world) { world = generateWorld(specInput, options); if (typeof failed === "string") note(world, `generate が失敗したため標準の生成を使った: ${failed}`); }
  if (typeof T.refine === "function") {
    try { const r = T.refine(world, world.spec, options) ?? world, errs = validateWorld(r); if (errs.length) { const why = errs.slice(0, 3).join(" / "); world = generateWorld(specInput, options); note(world, `refine が検証に失敗したため標準の生成へ戻した: ${why}`); options.onWarning?.(`地形プラグイン ${T.id}: refine の結果が検証に失敗。標準の生成へ戻します`); } else { world = r; world.hash = worldHash(world); } } catch (e) { const why = String(e?.message ?? e); world = generateWorld(specInput, options); note(world, `refine が例外のため標準の生成へ戻した: ${why}`); options.onWarning?.(`地形プラグイン ${T.id}: refine が例外。標準の生成へ戻します`); }
  }
  return attach(world);
}
