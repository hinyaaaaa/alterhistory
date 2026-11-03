// v5 M0 / v6.1.0 M1: 正式な月次tick（仕様 §5.2）。全システムは自分で月を進めず、ここに登録した順序で1か月ずつ更新される。
// 順序を変える変更は DECISIONS.md に理由を残し、wcde/domains/registry.js の phase と突き合わせる（validateRegistry）。
// 依存の向き: 時計 → 創造主の介入（有効値の確定）→ 自然環境 → 生態系・人口 → 文化・言語・宗教 → 技術 → 経済 → 政治 → 軍事 → AI の計画 → 検証つき実行 → 戦争・外交 → 人物・都市 → 歴史資料 → 整合性・ニュース。
export const PHASES = Object.freeze([
  { key: "clock", name: "世界時計を次の月へ" },
  { key: "interventions", name: "創造主の介入の減衰（当月の有効値を確定）" },
  { key: "climate", name: "季節・天候・気候の月次状態" },
  { key: "disaster", name: "自然災害・環境ショック" },
  { key: "ecosystem", name: "生態系（資源量・環境容量の集約モデル）" },
  { key: "economy_pop", name: "生業・生産・食料・人口・移住" },
  { key: "culture", name: "文化・言語・宗教・思想" },
  { key: "tech", name: "技術の独立発生・伝播・喪失・再発見" },
  { key: "economy", name: "生産・需要・産業・交易・国家財政" },
  { key: "politics", name: "国内政治・支持勢力・指導者・制度" },
  { key: "military", name: "軍事組織・部隊・ドクトリン・軍事能力" },
  { key: "ai_plan", name: "国家AIの計画（地図を変えない・判断過程は保存しない）" },
  { key: "apply", name: "AI とプレイヤーの行動を共通の検証で実行" },
  { key: "conflict", name: "外交・戦争・反乱・国家形成／崩壊" },
  { key: "people", name: "重要人物・家系・指導者継承・都市" },
  { key: "archive", name: "結果の歴史資料化（今月起きた事実だけ）" },
  { key: "integrity", name: "整合性検査・診断・ニュース判定" },
  { key: "notify", name: "描画・年表・パネルへの変更通知" },
]);
export const PHASE_KEYS = PHASES.map((p) => p.key);

/** 月次tickの実行役。register(phaseKey, fn, label, { every, offset }) で各システムを登録し、runMonth(ctx) が PHASES の順に呼ぶ。
 *  every: n か月に1回だけ実行する（領域ごとの更新頻度。monthIndex % every === offset のとき）。既定は毎月。 */
export function createTicker() {
  const handlers = new Map(PHASE_KEYS.map((k) => [k, []]));
  return {
    /** @param {string} phase PHASE_KEYS のいずれか @param {(ctx:object)=>void} fn @param {string} [label] @param {{every?:number, offset?:number}} [opt] */
    register(phase, fn, label = fn.name || "anonymous", { every = 1, offset = 0 } = {}) {
      if (!handlers.has(phase)) throw new Error(`未知のフェーズ: ${phase}`);
      if (!(Number.isInteger(every) && every >= 1)) throw new Error(`every は 1 以上の整数: ${label}`);
      handlers.get(phase).push({ fn, label, every, offset });
    },
    runMonth(ctx) {
      ctx.trace = [];
      // 月は時計の処理（clock フェーズ）で進む。every の判定は、その月が進んだあとの値（各処理が見る monthIndex と同じ値）で行う
      for (const key of PHASE_KEYS) for (const h of handlers.get(key)) { ctx.phase = key; if (h.every > 1) { const mi = ctx.civ?.monthIndex ?? 0; if (((mi % h.every) + h.every) % h.every !== h.offset) continue; } h.fn(ctx); ctx.trace.push(`${key}:${h.label}`); }
      ctx.phase = null; return ctx;
    },
    /** 登録済みの処理の一覧（台帳との突き合わせ・診断用）。月次の実行順そのまま */
    labels() { const out = []; for (const key of PHASE_KEYS) for (const h of handlers.get(key)) out.push({ phase: key, label: h.label, every: h.every }); return out; },
  };
}
/** 年・月（1〜12）を月通番へ。負の年（紀元前）・遠未来に対応する */
export const monthIndex = (year, month) => year * 12 + (month - 1);
export const fromMonthIndex = (i) => { const year = Math.floor(i / 12); return { year, month: i - year * 12 + 1 }; };
