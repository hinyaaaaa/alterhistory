// v2.4.0 への読み込み時の移行（旧データを新しい形に直す）。純粋ロジック層。
//   ・想定の戦闘ログ（war.forecast）を捨てる（予測機能の廃止）
//   ・君主（data.monarchs）を指導者（data.leaders）へ統合する（指導者のいない国の初代は、国家タブを開いたとき・月送りのときに置く）
//   ・国の政体（regime）を、旧 form / formName から決める。技術水準（techLevel）は technology doctrine から導く値として残す
import { migrateMonarchs } from "./leaders.js";
import { regimeKeyFromLegacy, REGIME_BY_KEY } from "./regimes.js";

export function migrateToV240(map) {
  const data = map.ext?.data; let changed = 0;
  for (const w of data?.wars ?? []) if (w && "forecast" in w) { delete w.forecast; changed++; }
  if (data) changed += migrateMonarchs(map);
  for (const s of map.pack?.states ?? []) {
    if (!s || s.removed || !(s.i > 0) || s.regime) continue;
    s.regime = regimeKeyFromLegacy(s.form, s.formName);
    if (!REGIME_BY_KEY[s.regime]) s.regime = "absolute";
    changed++;
  }
  return changed;
}
