// v5.3 UI: 左レールの領域定義（参考モック「ドック方式」: レール56px・1文字アイコン）と、旧UI → 新UI の機能対応表（指示書 5.3「移し忘れたまま古い画面を削除しない」）。
// 対応表は tests/v53-migration.test.mjs が、現行 js/ui/hub.js の全項目を網羅しているか検査する。
export const DOMAINS = Object.freeze([
  { id: "world", glyph: "世", label: "世界", icon: "terrain", view: "world", tip: "世界の概要・レイヤー・新しい世界・ファイルを開く" },
  { id: "state", glyph: "国", label: "国家", icon: "state", list: "state", tip: "国家の一覧と詳細" },
  { id: "diplomacy", glyph: "外", label: "外交", icon: "diplomacy", list: "treaty", tip: "条約・同盟・関係" },
  { id: "war", glyph: "軍", label: "戦争", icon: "war", list: "war", badge: "wars", tip: "個々の戦争（戦争の家族化はしない）" },
  { id: "economy", glyph: "政", label: "内政・経済", icon: "economy", list: "economy", tip: "財政・生産・交易・備蓄" },
  { id: "tech", glyph: "技", label: "技術", icon: "tech", list: "tech", tip: "技術の発見・伝播・実用化・普及" },
  { id: "culture", glyph: "文", label: "文化・宗教", icon: "culture", list: "culture", tip: "文化・言語・宗教" },
  { id: "magic", glyph: "魔", label: "魔法", icon: "magic", list: "magic", tip: "魔法の主体・組織・継承" },
  { id: "history", glyph: "史", label: "歴史研究", icon: "timeline", list: "event", tip: "出来事・AI判断・因果を辿る" },
  { id: "export", glyph: "出", label: "出力", icon: "export", view: "export", tip: "Chronicle・.ahmap・Obsidian・PNG" },
  { id: "settings", glyph: "設", label: "設定", icon: "settings", view: "settings", tip: "表示・操作の設定" },
]);
export const domainById = (id) => DOMAINS.find((d) => d.id === id) ?? null;

// 選択対象の種類 → どの領域の一覧に属するか（右パネルで対象を選んだとき、ハブの点灯を合わせる）
export const KIND_DOMAIN = Object.freeze({ state: "state", war: "war", event: "history", treaty: "diplomacy", economy: "economy", tech: "tech", culture: "culture", religion: "culture", language: "culture", magic: "magic", decision: "history" });

// 旧 hub.js の項目（win / id）→ 新しい入口。disposition: moved=同等の機能が新UIにある / retired=指示書で廃止（内部モデルは維持）
export const LEGACY_MIGRATION = Object.freeze([
  { legacy: "btn-open", to: "world", disposition: "moved", note: "世界の概要の「ファイルを開く」" },
  { legacy: "btn-save", to: "export", disposition: "moved", note: "出力の .ahmap（完全保存）" },
  { legacy: "export", to: "export", disposition: "moved", note: "出力の4項目" },
  { legacy: "btn-edit-mode", to: "world", disposition: "moved", note: "世界の概要の「地図編集」（編集ツール本体は v5.2 の描画基盤に依存するため入口のみ）" },
  { legacy: "hub-layers", to: "world", disposition: "moved", note: "地図左上のレイヤー列（入口はここ1か所）" },
  { legacy: "btn-fit", to: "world", disposition: "moved", note: "世界の概要の「全体表示」" },
  { legacy: "btn-new-world", to: "world", disposition: "moved", note: "開始フロー（世界の生成→初期集団→自動進行→国家成立）" },
  { legacy: "civ", to: null, disposition: "retired", note: "独立した人口集団ウィンドウは廃止（指示書 5.3）。内部の集団モデル・履歴は削除しない" },
  { legacy: "nation", to: "state", disposition: "moved" },
  { legacy: "list-culture", to: "culture", disposition: "moved" },
  { legacy: "list-religion", to: "culture", disposition: "moved" },
  { legacy: "economy", to: "economy", disposition: "moved" },
  { legacy: "diplomacy", to: "diplomacy", disposition: "moved" },
  { legacy: "war", to: "war", disposition: "moved" },
  { legacy: "history", to: "history", disposition: "moved", note: "独立した歴史ビューアは中核にしない。時間軸＋地図＋右パネル＋歴史研究の一覧で代替（Ctrl+K の全体検索は採用しない）" },
  { legacy: "timeline", to: "history", disposition: "moved", note: "年表は歴史研究の出来事一覧と下部の時間軸に統合" },
  { legacy: "settings", to: "settings", disposition: "moved", note: "バランス調整UIは廃止（指示書 5.3）。数値調整はコード・検証用ツールで管理" },
]);
