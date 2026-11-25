// v7 左パネルの入口表。モード（p=担当国／c=創造主）× 入口（S.hub）→ 中身を作る関数。
import { pStatus, pDomestic, pWarP, pDiploP, pWorldP, pChron } from "./panels-p.js";
import { pWorldC, pNationsC, pWarC, pDiploC, pIntervene } from "./panels-c.js";
export const PANEL = {
  p: { status: pStatus, domestic: pDomestic, war: pWarP, diplo: pDiploP, world: pWorldP, chron: pChron },
  c: { world: pWorldC, nations: pNationsC, war: pWarC, diplo: pDiploC, chron: pChron, intervene: pIntervene },
};
