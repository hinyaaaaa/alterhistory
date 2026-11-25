// v7 の通常通知。下端の右に最大 3 枚積む（js/ui/v7/frame.js の toast）。重大ニュースは別系統（clock.js のキュー → 確認の札）。
//   エラーは確認するまで残る。お知らせは約 6 秒で消える。通知を履歴として保存せず、右側に通知欄・タブも作らない。
import { toast } from "../v7/frame.js";
export function initNotify() {}
/** kind: "error"（赤・確認まで残る）| "warn"（黄）| "ok"（青のお知らせ）。メッセージは短く具体的に（何の操作がどうなったか） */
export function notify(kind, message) {
  const m = String(message);
  if (kind === "error") toast({ sev: "k", head: "操作できません", title: m.length > 80 ? m.slice(0, 80) + "…" : m, body: m.length > 80 ? m : "" });
  else toast({ sev: kind === "ok" ? "ok" : "n", head: kind === "warn" ? "注意" : "お知らせ", title: m, ms: 5000 });
}
