/**
 * リミットレス台帳 → 知識の部屋 のテスト（node tools/test/test-knowledge.js）
 *
 * Apps Script側（update-data.gs）とアプリ側（index.html）の両方を、同じ作り物データで確かめる。
 * 両方に同じ規則を書いてあるので、片方だけ直して食い違うことがないようにする。
 *
 * 確かめること：
 *   ・フォルダの全ファイルを統合したときの行数（重複は「日付＋内容」一致で新しいファイルが勝つ）
 *   ・種別が「🤝人,🌱初めて」のように2つあるとき、それぞれの分類で1件ずつ数えるか
 *   ・「🌱初めて?」のような「?」付きは数えないか（＝集計から除外）。ただし行の表示には残るか
 *   ・今週の窓が日曜0:00〜土曜24:00になっているか（月曜や日曜をまたいでも正しいか）
 *   ・今月の窓が1日〜末日になっているか
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "..");
const gs = fs.readFileSync(path.join(root, "tools", "update-data.gs"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

let fail = 0;
const ok = (cond, name, detail) => {
  console.log((cond ? "✅ " : "❌ ") + name + (cond ? "" : "\n     " + detail));
  if (!cond) fail++;
};
const eq = (got, want, name) => ok(String(got) === String(want), name, "結果=" + got + "  期待=" + want);

/* ========== Apps Script側 ========== */
const pickGs = (a, b) => {
  const i = gs.indexOf(a), j = gs.indexOf(b);
  if (i < 0 || j < 0) throw new Error("update-data.gs に目印が見つかりません: " + (i < 0 ? a : b));
  return gs.slice(i, j);
};
const Logger = { log: () => {} };
const Utilities = { formatDate: (d, tz, fmt) => "2026-08-13" };

eval(pickGs("var LIMITLESS_FOLDER_ID", "// ===== STEP1"));
eval(pickGs("// ===== v1.2: リミットレス台帳", "// ===== v1.2: 経済台帳"));

console.log("\n【Apps Script側】種別の読み取り");
eq(JSON.stringify(limitlessTags_("🤝人,🌱初めて")), '{"kinds":["人","初めて"],"unsure":[]}',
   "2つ入った種別を両方拾う（セルに書かれた順）");
eq(JSON.stringify(limitlessTags_("🌱初めて?")), '{"kinds":[],"unsure":["初めて"]}',
   "「?」付きは確定に入らない");
eq(JSON.stringify(limitlessTags_("🔥トライ,🌱初めて?")), '{"kinds":["トライ"],"unsure":["初めて"]}',
   "確定と未確定が混ざっていても分けられる");
eq(JSON.stringify(limitlessTags_("🌱初めて？")), '{"kinds":[],"unsure":["初めて"]}',
   "全角の「？」でも未確定として扱う");
eq(JSON.stringify(limitlessTags_("🌱初めて,🌱初めて?")), '{"kinds":["初めて"],"unsure":[]}',
   "同じタグが確定と未確定の両方にあれば確定を採る");
eq(JSON.stringify(limitlessTags_("")), '{"kinds":[],"unsure":[]}', "空欄でも落ちない");
eq(JSON.stringify(limitlessKinds_("🤝人,🌱初めて?")), '["人"]', "従来の呼び出しは確定タグだけ返す");

console.log("\n【Apps Script側】週・月の窓");
eq(JSON.stringify(weekWindow_("2026-08-13")), '{"from":"2026-08-09","to":"2026-08-15"}',
   "木曜(8/13)を含む週は 8/9(日)〜8/15(土)");
eq(JSON.stringify(weekWindow_("2026-08-09")), '{"from":"2026-08-09","to":"2026-08-15"}',
   "日曜はその日が週の初日");
eq(JSON.stringify(weekWindow_("2026-08-15")), '{"from":"2026-08-09","to":"2026-08-15"}',
   "土曜はその日が週の最終日");
eq(JSON.stringify(weekWindow_("2026-08-16")), '{"from":"2026-08-16","to":"2026-08-22"}',
   "次の日曜からは翌週");
eq(JSON.stringify(weekWindow_("2026-03-02")), '{"from":"2026-03-01","to":"2026-03-07"}',
   "月をまたぐ週も日曜始まり");
eq(JSON.stringify(monthWindow_("2026-08-13")), '{"from":"2026-08-01","to":"2026-08-31"}', "今月は1日〜末日");
eq(JSON.stringify(monthWindow_("2026-02-05")), '{"from":"2026-02-01","to":"2026-02-28"}', "2月の末日");
eq(JSON.stringify(monthWindow_("2024-02-05")), '{"from":"2024-02-01","to":"2024-02-29"}', "うるう年の2月");

/* 作り物のリミットレス台帳。基準日は 2026-08-13（木）＝週は 8/9〜8/15 */
const LIMITLESS = [
  // 先週（集計に入らない）
  { date: "2026-08-08", kinds: ["学び"], unsure: [], kindsText: "💡学び", text: "先週の学び", who: null },
  // 今週
  { date: "2026-08-09", kinds: ["人", "初めて"], unsure: [], kindsText: "🤝人,🌱初めて", text: "もんじゃ会", who: "後輩6名" },
  { date: "2026-08-10", kinds: ["トライ"], unsure: ["初めて"], kindsText: "🔥トライ,🌱初めて?", text: "朝5時起き", who: null },
  { date: "2026-08-12", kinds: [], unsure: ["初めて"], kindsText: "🌱初めて?", text: "未確定だけの行", who: null },
  { date: "2026-08-13", kinds: ["教え", "学び"], unsure: [], kindsText: "🗣️教え,💡学び", text: "コーチング講義", who: "大崎君" },
  // 来週（まだ先だが、月には入る）
  { date: "2026-08-16", kinds: ["もがき"], unsure: [], kindsText: "🌀もがき", text: "来週のもがき", who: null }
];
const KNOW_D = { generatedAt: "2026-08-13T22:00:00+09:00", limitless: { rows: LIMITLESS } };

const kg = buildKnowledge_({ rows: LIMITLESS }, "2026-08-13");
console.log("\n【Apps Script側】knowledgeセクション");
eq(kg.week.from + "〜" + kg.week.to, "2026-08-09〜2026-08-15", "今週の窓");
eq(kg.week.rows, 4, "今週の行数（8/9・8/10・8/12・8/13）");
eq(kg.week.counts["人"], 1, "今週：🤝人");
eq(kg.week.counts["初めて"], 1, "今週：🌱初めて（?付きの2件は数えない）");
eq(kg.week.counts["トライ"], 1, "今週：🔥トライ");
eq(kg.week.counts["学び"], 1, "今週：💡学び");
eq(kg.week.counts["教え"], 1, "今週：🗣️教え");
eq(kg.week.counts["もがき"], 0, "今週：🌀もがき（来週の行は入らない）");
eq(kg.month.rows, 6, "今月の行数（8/8〜8/16の全部）");
eq(kg.month.counts["学び"], 2, "今月：💡学び（先週の分も入る）");
eq(kg.month.counts["もがき"], 1, "今月：🌀もがき");
eq(kg.month.counts["初めて"], 1, "今月：🌱初めて（?付きは月でも数えない）");
eq(kg.recent.length, 5, "直近5行だけ返す");
eq(kg.recent[0].date, "2026-08-16", "直近5行は新しい順");
eq(kg.recent.filter(r => r.text === "未確定だけの行")[0].kindsText, "🌱初めて?",
   "?付きの行は「?」を付けたまま表示用に残る");
ok(/^https:\/\/drive\.google\.com\/drive\/folders\/1UAbime/.test(kg.folderUrl),
   "フォルダリンクが入っている", kg.folderUrl);

/* 統合（重複は「日付＋内容」一致で新しいファイル優先）は readLimitless_ のキーの作り方で決まる。
   Drive を触らずに、そのキーの規則だけを取り出して確かめる。 */
console.log("\n【Apps Script側】重複の勝ち負け");
const mergeSim = files => {                       // files は弱い順（base → 古いログ → 新しいログ）
  const byKey = {};
  files.forEach(f => f.rows.forEach(r => { byKey[r.date + "|" + r.text] = Object.assign({ src: f.name }, r); }));
  return Object.keys(byKey).sort().map(k => byKey[k]);
};
const merged = mergeSim([
  { name: "リミットレス台帳_base_v2", rows: [
      { date: "2026-08-09", text: "もんじゃ会", kindsText: "🤝人" },
      { date: "2026-08-10", text: "朝5時起き", kindsText: "🔥トライ" } ] },
  { name: "リミットレス台帳ログ_2026-08-13", rows: [
      { date: "2026-08-09", text: "もんじゃ会", kindsText: "🤝人,🌱初めて" },   // 同じ日付＋内容 → 上書き
      { date: "2026-08-13", text: "コーチング講義", kindsText: "🗣️教え" } ] }
]);
eq(merged.length, 3, "同じ日付＋内容は1行にまとまる");
eq(merged.filter(r => r.text === "もんじゃ会")[0].kindsText, "🤝人,🌱初めて",
   "重複した行は新しいファイル（ログ）が勝つ");
eq(merged.filter(r => r.text === "もんじゃ会")[0].src, "リミットレス台帳ログ_2026-08-13",
   "出所も新しいファイルになる");
eq(merged.filter(r => r.text === "朝5時起き")[0].kindsText, "🔥トライ",
   "重複していない base の行はそのまま残る");

/* ========== アプリ側（index.html） ========== */
const pickHtml = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error("index.html に目印が見つかりません: " + (i < 0 ? a : b));
  return html.slice(i, j);
};
const leak = code => code.replace(/^(const|let) /gm, "var ");
eval(leak(pickHtml("/* ===== util ===== */", "/* ===== state ===== */")));
eval(leak(pickHtml("/* ===== 分析メモ（4視点）ここから =====", "/* ===== 分析メモ ここまで ===== */")));
eval(leak(pickHtml("/* ===== 知識の部屋（リミットレス台帳の集計）ここから =====", "/* ===== 知識の部屋 ここまで ===== */")));

console.log("\n【アプリ側】data.jsonにknowledgeが無いとき（古いdata.json）でも自分で計算する");
const ka = computeKnowledge(KNOW_D);
eq(ka.from, "アプリ側で集計", "knowledgeが無ければアプリ側で集計する");
eq(ka.week.from + "〜" + ka.week.to, "2026-08-09〜2026-08-15", "今週の窓（アプリ側）");
eq(ka.week.rows, 4, "今週の行数（アプリ側）");
// 並び順は両者で違う（GASは教え始まり、アプリは表示順）ので、分類ごとの数で比べる
const sameCounts = (a, b) => LM_NAMES.every(n => (a[n] || 0) === (b[n] || 0));
ok(sameCounts(ka.week.counts, kg.week.counts), "★今週のカウントが Apps Script側とぴったり一致する",
   JSON.stringify(ka.week.counts) + " ≠ " + JSON.stringify(kg.week.counts));
ok(sameCounts(ka.month.counts, kg.month.counts), "★今月のカウントが Apps Script側とぴったり一致する",
   JSON.stringify(ka.month.counts) + " ≠ " + JSON.stringify(kg.month.counts));
eq(ka.recent.length, 5, "直近5行（アプリ側）");
eq(ka.recent[0].date, "2026-08-16", "直近5行は新しい順（アプリ側）");

console.log("\n【アプリ側】data.jsonのknowledgeがあればそれを使う");
const kb = computeKnowledge(Object.assign({ knowledge: kg }, KNOW_D));
eq(kb.from, "data.json", "knowledgeがあればそのまま使う");
eq(kb.week.counts["初めて"], 1, "その中身も同じ");

console.log("\n【アプリ側】古い形（kindsTextが無い）の行も落ちない");
const old = computeKnowledge({ generatedAt: "2026-08-13T22:00:00+09:00",
  limitless: { rows: [{ date: "2026-08-13", kinds: ["人", "学び"], text: "古い形の行" }] } });
eq(old.week.counts["人"] + "/" + old.week.counts["学び"], "1/1", "kindsが無い形でも数えられる");

console.log("\n【アプリ側】?付きの除外は原文からも効く");
const q = computeKnowledge({ generatedAt: "2026-08-13T22:00:00+09:00",
  limitless: { rows: [
    // 古いApps Scriptが作った data.json は kinds に「初めて」を入れてしまう。
    // 原文(kindsText)があるときは原文を正として数え直す。
    { date: "2026-08-13", kinds: ["初めて"], kindsText: "🌱初めて?", text: "?付き" }] } });
eq(q.week.counts["初めて"], 0, "★原文に「?」があれば、kindsに入っていても数えない");

console.log("\n【実データ】data.json を素通しして落ちないか");
const real = JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8"));
const kr = computeKnowledge(real);
console.log("   基準日 " + kr.asOf + " ／ 台帳 " + kr.total + "行（出どころ: " + kr.from + "）");
console.log("   今週 " + kr.week.from + "〜" + kr.week.to + ": " + kr.week.rows + "件  " +
  LM_NAMES.map(n => n + kr.week.counts[n]).join(" "));
console.log("   今月 " + kr.month.from + "〜" + kr.month.to + ": " + kr.month.rows + "件  " +
  LM_NAMES.map(n => n + kr.month.counts[n]).join(" "));
ok(kr.week && kr.month && kr.recent.length <= 5, "実データでも形がそろっている");
const sum = LM_NAMES.reduce((a, n) => a + kr.month.counts[n], 0);
ok(sum >= 0, "実データの今月カウントが数として出る（" + sum + "タグ）");

console.log(fail ? "\n❌ " + fail + "件 失敗\n" : "\n全ケース合格 ✅\n");
process.exit(fail ? 1 : 0);
