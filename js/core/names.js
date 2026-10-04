// 名前の扱い：国家には正式名称(fullName)と略称(name)がある。外交・戦争・講和・同盟では、必ず正式名称を使う。
// 略称は正式名称と連動する（正式名称を変えると、形態の語を取り除いた略称に更新される）。
// 純粋ロジック層：DOM に依存しない。

/** 国家の形態を表す語（正式名称の末尾から取り除くと略称になる） */
const FORM_WORDS = ["神聖帝国", "神聖国", "帝国", "王国", "公国", "大公国", "連邦", "共和国", "連合", "首長国", "辺境伯領", "伯領", "侯国", "神権国", "自治領", "領"];
const FORM_RE = new RegExp(`(${FORM_WORDS.join("|")})$`);

/** 外交・戦争・講和・同盟で表示する正式名称。無ければ略称 */
export function officialName(e, fallback = "") {
  if (!e) return fallback;
  return (e.fullName && String(e.fullName).trim()) || e.name || fallback;
}

/** 正式名称から略称を導く（形態の語を末尾から外す。外して空になるなら正式名称のまま） */
export function shortNameFrom(fullName) {
  const t = String(fullName ?? "").trim();
  const s = t.replace(FORM_RE, "").trim();
  return s || t;
}
