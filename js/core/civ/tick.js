// v5 M0: 正式な月次tick（指示書 §2.1）。全システムは自分で月を進めず、ここに登録した順序で1か月ずつ更新される。
// 順序を変える変更は tests/v500-civ-tick.test.mjs の固定順序を更新し、DECISIONS.md に理由を残すこと。
export const PHASES = Object.freeze([
  { key: "clock", name: "世界時計を次の月へ" },
  { key: "climate", name: "季節・天候・気候の月次状態" },
  { key: "disaster", name: "自然災害・環境ショック" },
  { key: "economy_pop", name: "生業・生産・食料・人口・移住" },
  { key: "culture", name: "文化・言語・宗教・思想" },
  { key: "tech", name: "技術の発明・伝播・喪失・進捗" },
  { key: "economy", name: "生産・需要・産業・交易・国家財政（v6）" },
  { key: "politics", name: "国内政治・支持勢力・指導者・制度（v6）" },
  { key: "military", name: "軍事組織・部隊・ドクトリン・軍事能力（v6）" },
  { key: "ai_plan", name: "国家AIの計画（地図を変えない）" },
  { key: "apply", name: "決定と入力を検証済みアクションとして適用" },
  { key: "conflict", name: "戦争・外交・反乱・国家形成／崩壊" },
  { key: "integrity", name: "整合性検査・Event/Decision/Snapshot確定" },
  { key: "notify", name: "描画・年表・パネルへの変更通知" },
]);
export const PHASE_KEYS = PHASES.map((p) => p.key);

/** 月次tickの実行役。register(phaseKey, fn) で各システムを登録し、runMonth(ctx) が PHASES の順に呼ぶ。 */
export function createTicker() {
  const handlers = new Map(PHASE_KEYS.map((k) => [k, []]));
  return {
    /** @param {string} phase PHASE_KEYS のいずれか @param {(ctx:object)=>void} fn @param {string} [label] */
    register(phase, fn, label = fn.name || "anonymous") {
      if (!handlers.has(phase)) throw new Error(`未知のフェーズ: ${phase}`);
      handlers.get(phase).push({ fn, label });
    },
    runMonth(ctx) {
      ctx.trace = [];
      for (const key of PHASE_KEYS) for (const h of handlers.get(key)) { ctx.phase = key; h.fn(ctx); ctx.trace.push(`${key}:${h.label}`); }
      ctx.phase = null; return ctx;
    },
  };
}
/** 年・月（1〜12）を月通番へ。負の年（紀元前）・遠未来に対応する */
export const monthIndex = (year, month) => year * 12 + (month - 1);
export const fromMonthIndex = (i) => { const year = Math.floor(i / 12); return { year, month: i - year * 12 + 1 }; };
