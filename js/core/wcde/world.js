// v6 M1/M2: 世界の作成と保存。設定 → 検証 → 地理の生成 → 先史（約50万年・圧縮）→ 建国の入口（founding）。
//   同じ設定・同じ worldSeed・同じ historySeed からは、同じ世界ができる。保存は設定と文明状態だけ（地理は設定から再生成する）。
import { generateWorld } from "../world/worldgen.js";
import { normalizeWorldConfig, WCDE_VERSION } from "./config.js";
import { createWcdeCiv, runPrehistory } from "./prehistory.js";
import { finalizeLanguages } from "./domains/language.js";
import { defineReligions } from "./domains/religion.js";
import { createWcde } from "./contract.js";
import { refreshCandidates } from "./founding.js";
import { registerCommands } from "./commands.js";
import { formatDate } from "./calendar.js";
import { hashSeed } from "../civ/civ-state.js";

/** 新しい世界を作る。errors があれば作らない。historySeed は呼ぶ側が決める（既定は設定から導く＝同じ設定は同じ歴史）。onProgress(段階, 0..1) */
export function createNewWorld(input, { generate = generateWorld, historySeed = null, stepYears, onProgress = null } = {}) {
  registerCommands();
  const { config, errors } = normalizeWorldConfig(input); if (errors.length) return { ok: false, errors };
  onProgress?.("地理", 0); const world = generate(config.spec); onProgress?.("地理", 1);
  const civ = createWcdeCiv(world, config, { historySeed: historySeed ?? hashSeed(config.worldSeed, "history", config.schema) });
  onProgress?.("先史", 0); const stats = runPrehistory(world, civ, { stepYears, onProgress: (s, n) => onProgress?.("先史", s / n) }); onProgress?.("先史", 1);
  finalizeLanguages(civ); defineReligions({ civ });
  const w = createWcde(world, civ); const candidates = refreshCandidates(w);
  return { ok: true, w, errors: [], report: { prehistory: stats, candidates: candidates.length } };
}
/** 地理の生成関数（保存の読み込みが使う。球面世界への入口を、この 1 か所に保つ） */
export const defaultGenerate = generateWorld;
export const formatWorldDate = (w, mi = w.civ.monthIndex) => formatDate(w.civ.wcde.config.calendar, mi);

/** 保存・読み込み（地理は設定から再生成。civ は JSON）。読み込んだ世界は、保存時と同じ入力列から同じ未来になる */
export function serializeWorld(w) { return JSON.stringify({ format: "alterhistory-wcde", wcdeVersion: WCDE_VERSION, civ: w.civ }); }
export function deserializeWorld(text, { generate = generateWorld } = {}) {
  registerCommands(); const d = JSON.parse(text); if (d.format !== "alterhistory-wcde") throw new Error("WCDE の保存形式ではありません");
  const world = generate(d.civ.wcde.config.spec), w = createWcde(world, d.civ); return w;
}
