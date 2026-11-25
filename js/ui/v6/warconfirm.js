// v6.5.0: 開戦前の最終確認。数値の予測は出さず、見通しをざっくりした言葉で示す（「戦争研究所」とは名乗らない）。
import { S } from "./store.js";
import { predictWar } from "../../core/wcde/warlab.js";

const outlook = (p) => {
  if (!p) return ["見通しは立たない", "mid"];
  const w = p.pAWin - p.pBWin;
  return w > 0.6
    ? ["圧倒的に優勢", "good"]
    : w > 0.3
      ? ["優勢", "good"]
      : w > 0.1
        ? ["やや優勢", "good"]
        : w > -0.1
          ? ["拮抗", "mid"]
          : w > -0.3
            ? ["やや劣勢", "bad"]
            : w > -0.6
              ? ["劣勢", "bad"]
              : ["圧倒的に劣勢", "bad"];
};
/** 見通しの言葉（数値は出さない）。a: 攻める国の id、b: 相手の id */
export function lightOutlook(a, b) {
  const c = S.w.civ,
    A = c.states[a],
    B = c.states[b],
    p = predictWar(c, a, b, S.w.sim.ctx),
    [word, tone] = outlook(p),
    rows = [["戦力", word, tone]];
  if (p) {
    const ia = p.inputs.a,
      ib = p.inputs.b;
    rows.push([
      "補給",
      ia.supply >= ib.supply * 1.2 ? "こちらが届きやすい" : ia.supply * 1.2 < ib.supply ? "遠征は苦しい" : "同程度",
      ia.supply >= ib.supply * 1.2 ? "good" : ia.supply * 1.2 < ib.supply ? "bad" : "mid",
    ]);
    rows.push([
      "国内の事情",
      ia.fatigue > 0.5 ? "国民は疲れている" : ia.stability < 0.4 ? "国内が不安定" : "落ち着いている",
      ia.fatigue > 0.5 || ia.stability < 0.4 ? "bad" : "good",
    ]);
    rows.push([
      "地形・守り",
      (B.defense ?? 0) >= 0.2 ? "相手は要塞を整えている" : "目立った要害はない",
      (B.defense ?? 0) >= 0.2 ? "bad" : "mid",
    ]);
  }
  const allies = (id) =>
      c.activeTreatyIds.map((i) => c.treaties[i]).filter((t) => t.type === "alliance" && (t.a === id || t.b === id))
        .length,
    ab = allies(b),
    aa = allies(a);
  rows.push([
    "同盟の動き",
    ab > aa
      ? "相手側に味方が付きそう"
      : ab > 0
        ? "相手にも同盟国がある"
        : aa > 0
          ? "こちらに味方が付きそう"
          : "どちらも単独",
    ab > aa ? "bad" : aa > ab ? "good" : "mid",
  ]);
  void A;
  return rows;
}
/** 宣戦: 全面画面（戦争目的・見通し・出す部隊と指揮）を開く。開戦は war.declare → war.mobilize（js/ui/v7/war-screens.js） */
export function confirmWar(stateId, targetId) {
  return import("../v7/war-screens.js").then((m) => m.openDeclare(stateId, targetId));
}
