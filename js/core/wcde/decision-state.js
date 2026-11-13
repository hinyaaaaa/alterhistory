// v6.12.0: 決断（プレイヤーが決める場面）の状態。葉のモジュール（clock.js・decisions.js・integrity.js が共有する）。
//   civ.wcde.decisions = { seq, live, queue（未決）, done（直近の決断の記録）, cool（同じ申し出を繰り返さないための冷却） }
//   live は「人間が時間を進めている間」だけ true（clockRun が立てる）。live でない進行（試験・一括の進行）では、決断は旧来どおり自動で処理される。
export const initDecisions = () => ({ seq: 0, live: false, queue: [], done: [], cool: {} });
export const decisionsOf = (civ) => (civ.wcde.decisions ??= initDecisions());
export const pendingOf = (civ) => civ.wcde?.decisions?.queue ?? [];
export const hasPending = (civ) => pendingOf(civ).length > 0;
/** 決断を出せる状態か: 人間が時間を進めていて、担当国家がある */
export const isLive = (civ) => !!civ.wcde?.decisions?.live && !!civ.wcde?.control?.stateId;
export const coolUntil = (civ, key) => civ.wcde?.decisions?.cool?.[key] ?? -1;
export function setCool(civ, key, until) { const c = decisionsOf(civ).cool; c[key] = until; const mi = civ.monthIndex; for (const k of Object.keys(c)) if (c[k] < mi - 12) delete c[k]; }
